/**
 * Nomi, cose e città libera, contro il computer: una lettera a caso, cinque
 * categorie, e il computer che scrive anche lui. Come al tavolo, chi finisce
 * per primo dice «stop!» e si smette di scrivere tutti: il computer lo dice
 * quando ha finito, prima o dopo secondo il livello, e conta solo quel che
 * aveva scritto fino a quel momento.
 *
 * Il computer scrive le parole che scriverebbe una persona: quelle note del
 * lessico (`note`), le piu' comuni per prime. Tutto sta nel telefono, e i
 * punti si contano come al tavolo (`puntiSfida`).
 */

import {
  LETTERE_NOMI,
  categorieIdonee,
  lessicoDa,
  normalizza,
  pescaCategorie,
  puntiSfida,
  riconosci,
  type CategoriaNomi,
  type FileLessicoNomi,
  type LessicoNomi,
  type LetteraNomi,
} from '@shared/nomi-cose'
import { CONTI_LESSICO_NOMI, VERSIONI_LESSICO_NOMI, urlLessicoNomi } from '@shared/nomi-cose-lessico'

export type LivelloNomi = 'facile' | 'normale' | 'difficile'
export const LIVELLI_NOMI: readonly LivelloNomi[] = ['facile', 'normale', 'difficile']
export const NOMI_LIVELLI_NOMI: Record<LivelloNomi, string> = {
  facile: 'Facile',
  normale: 'Normale',
  difficile: 'Difficile',
}

/**
 * Come gioca il computer: in quante categorie scrive, fra quante parole note
 * sceglie — le prime sono le piu' comuni, e le piu' comuni le scrivono tutti —
 * e quando dice stop, da quando si comincia.
 */
export const COMPUTER_NOMI: Record<LivelloNomi, { scrive: number; fra: number; stop: [number, number] }> = {
  facile: { scrive: 0.6, fra: 8, stop: [140_000, 170_000] },
  normale: { scrive: 0.8, fra: 20, stop: [100_000, 130_000] },
  difficile: { scrive: 0.95, fra: 40, stop: [65_000, 85_000] },
}

export interface PartitaLibera {
  lettera: LetteraNomi
  categorie: CategoriaNomi[]
  livello: LivelloNomi
  /** Le risposte del computer, decise all'inizio; null dove non scrive. */
  computer: (string | null)[]
  /** Quando ha scritto ognuna, da quando si comincia: per vederlo scrivere. */
  tempi: number[]
  /** Quando dice stop. */
  stopMs: number
}

/** La lettera e le categorie di una partita nuova, a caso. */
export function letteraACaso(rng: () => number = Math.random): { lettera: LetteraNomi; categorie: CategoriaNomi[] } {
  const lettera = LETTERE_NOMI[Math.floor(rng() * LETTERE_NOMI.length)]
  return { lettera, categorie: pescaCategorie(categorieIdonee(lettera, CONTI_LESSICO_NOMI), rng) }
}

const lessici = new Map<LetteraNomi, Promise<FileLessicoNomi>>()

/** Il file di una lettera, scaricato una volta: l'indirizzo ha l'impronta, e il browser lo tiene. */
export function caricaLessico(lettera: LetteraNomi): Promise<FileLessicoNomi> {
  let lettura = lessici.get(lettera)
  if (!lettura) {
    lettura = fetch(urlLessicoNomi(lettera))
      .then((r) => {
        if (!r.ok) throw new Error(`Lessico non scaricato (${r.status})`)
        return r.json() as Promise<FileLessicoNomi>
      })
      .then((file) => {
        // A un indirizzo che non c'e' le Pages rispondono con la pagina dell'app: quella non e' un lessico.
        if (file?.lettera !== lettera || file.versione !== VERSIONI_LESSICO_NOMI[lettera]) {
          throw new Error('Lessico non scaricato: il file non è quello atteso')
        }
        return file
      })
    lessici.set(lettera, lettura)
    lettura.catch(() => lessici.delete(lettera))
  }
  return lettura
}

/** La partita del computer: le sue risposte, quando le scrive, e quando dice stop. */
export function nuovaPartita(
  file: FileLessicoNomi,
  lettera: LetteraNomi,
  categorie: CategoriaNomi[],
  livello: LivelloNomi,
  rng: () => number = Math.random,
): PartitaLibera {
  const come = COMPUTER_NOMI[livello]
  const computer = categorie.map((c) => {
    const note = file.note?.[c] ?? []
    if (note.length === 0 || rng() > come.scrive) return null
    return note[Math.floor(rng() * Math.min(come.fra, note.length))]
  })
  const stopMs = Math.round(come.stop[0] + rng() * (come.stop[1] - come.stop[0]))
  // Scrive fra un quarto del suo tempo e lo stop, l'ultima proprio allo stop.
  const scritte = computer.filter((r) => r !== null).length
  const istanti = Array.from({ length: scritte }, () => stopMs * (0.25 + 0.75 * rng())).sort((a, b) => a - b)
  if (istanti.length > 0) istanti[istanti.length - 1] = stopMs
  let k = 0
  const tempi = computer.map((r) => (r === null ? Number.POSITIVE_INFINITY : istanti[k++]))
  return { lettera, categorie, livello, computer, tempi, stopMs }
}

/** Quante risposte ha scritto il computer dopo `ms` dall'inizio. */
export function scritteDalComputer(p: PartitaLibera, ms: number): number {
  return p.tempi.filter((t) => t <= ms).length
}

export interface RisultatoLibero {
  /** Le risposte, mie e del computer, come le conta il lessico: null se non valgono o mancano. */
  mie: (string | null)[]
  sue: (string | null)[]
  /** Quel che il computer aveva scritto allo stop. */
  computer: (string | null)[]
  punti: [number[], number[]]
  totali: [number, number]
  esito: 'vinta' | 'persa' | 'patta'
}

/** Com'e' finita, allo stop dopo `ms`: conta solo quel che il computer aveva scritto fino a li'. */
export function risultato(
  p: PartitaLibera,
  lessico: LessicoNomi,
  risposte: Partial<Record<CategoriaNomi, string>>,
  ms: number,
): RisultatoLibero {
  const computer = p.computer.map((r, i) => (r !== null && p.tempi[i] <= ms ? r : null))
  const mie = p.categorie.map((c) => {
    const testo = risposte[c]?.trim()
    return testo ? riconosci(lessico, c, p.lettera, testo) : null
  })
  const sue = p.categorie.map((c, i) => (computer[i] ? riconosci(lessico, c, p.lettera, computer[i]!) : null))
  const [miei, suoi] = puntiSfida([mie, sue])
  const totali: [number, number] = [miei.reduce((a, b) => a + b, 0), suoi.reduce((a, b) => a + b, 0)]
  const esito = totali[0] > totali[1] ? 'vinta' : totali[0] < totali[1] ? 'persa' : 'patta'
  return { mie, sue, computer, punti: [miei, suoi], totali, esito }
}

/** Il lessico per le categorie della partita. */
export function lessicoDellaPartita(file: FileLessicoNomi, categorie: readonly CategoriaNomi[]): LessicoNomi {
  return lessicoDa(file, categorie)
}

/** Qualche risposta che nessuno dei due ha scritto, fra le piu' note: dopo la partita. */
export function altrePossibili(
  file: FileLessicoNomi,
  categoria: CategoriaNomi,
  usate: readonly (string | null)[],
  quante = 3,
): string[] {
  return (file.note?.[categoria] ?? []).filter((w) => !usate.includes(normalizza(w))).slice(0, quante)
}

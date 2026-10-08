/**
 * La Ghigliottina: cinque coppie di parole, e in ogni coppia una sola porta
 * alla parola che le lega tutte.
 *
 * Si gioca come il finale dell'Eredità, il gioco di Rai 1 da cui viene il
 * nome: si parte da un montepremi, e a ogni coppia si sceglie una parola. Una
 * scelta sbagliata dimezza il montepremi — e la parola giusta si vede lo
 * stesso, quindi alla fine le cinque parole ci sono sempre. Poi c'e' un
 * minuto per scrivere la parola che le lega: se e' giusta si vince quel che
 * resta del montepremi, se no niente.
 *
 * La parola vincente e le cinque parole sono scritte a mano
 * (scripts/data/ghigliottina.tsv); l'esca di ogni coppia viene da un'altra
 * ghigliottina, tutte e cinque dalla stessa (scripts/build-ghigliottina.mjs).
 */

import { mulberry32, solutionPermutation } from './daily'

export const NOME_GHIGLIOTTINA = 'Ghigliottina'

/** Le coppie di una partita, come alla televisione. */
export const COPPIE_GHIGLIOTTINA = 5

/**
 * Il montepremi di partenza: cento, come ogni classificata (vedi
 * shared/punti.ts). Si dimezza per difetto — 50, 25, 12, 6, 3 — e chi sbaglia
 * tutte le scelte puo' ancora vincerne tre.
 */
export const MONTEPREMI_GHIGLIOTTINA = 100

/** Il minuto per scrivere la parola vincente, come in studio. */
export const TEMPO_FINALE_MS = 60_000

/** Quanto arriva in ritardo una risposta per la rete e vale lo stesso, come nel quiz. */
export const MARGINE_GHIGLIOTTINA_MS = 3_000

/** Il montepremi dopo `sbagliate` scelte sbagliate: la meta' per ognuna. */
export function montepremi(sbagliate: number): number {
  return Math.floor(MONTEPREMI_GHIGLIOTTINA / 2 ** Math.max(0, sbagliate))
}

/** I punti di una partita: il montepremi rimasto, se si e' indovinata la parola; se no niente. */
export function puntiGhigliottina(sbagliate: number, indovinata: boolean): number {
  return indovinata ? montepremi(sbagliate) : 0
}

export const MASSIMO_GHIGLIOTTINA = MONTEPREMI_GHIGLIOTTINA

const ACCENTI: Record<string, string> = {
  à: 'a',
  á: 'a',
  è: 'e',
  é: 'e',
  ì: 'i',
  í: 'i',
  ò: 'o',
  ó: 'o',
  ù: 'u',
  ú: 'u',
}

/** Una parola come la confronta il gioco: minuscola, senza accenti, solo lettere ("tè" e' "te"). */
export function normalizzaGhigliottina(parola: string): string {
  return parola
    .toLowerCase()
    .replace(/[àáèéìíòóùú]/g, (c) => ACCENTI[c])
    .replace(/[^a-z]/g, '')
}

/** La parola scritta e' la parola vincente: maiuscole, accenti e spazi non contano. */
export function rispostaGiusta(soluzione: string, tentativo: string): boolean {
  const t = normalizzaGhigliottina(tentativo)
  return t.length > 0 && t === normalizzaGhigliottina(soluzione)
}

/** Una coppia come la vede chi gioca: le due parole, nell'ordine in cui compaiono. */
export interface CoppiaGhigliottina {
  parole: [string, string]
  /** Quale delle due porta alla parola vincente. */
  giusta: 0 | 1
  /** L'espressione che la lega alla parola vincente: "colpo di fulmine". */
  spiegazione: string
}

export interface GhigliottinaDelGiorno {
  soluzione: string
  coppie: CoppiaGhigliottina[]
}

/** Una ghigliottina dell'elenco: la soluzione e, per ogni parola giusta, l'esca e l'espressione. */
export interface GhigliottinaDellElenco {
  s: string
  c: Array<[giusta: string, esca: string, spiegazione: string]>
}

/**
 * Le coppie di una ghigliottina, in un ordine e con le parole disposte dal
 * generatore: lo stesso generatore, le stesse coppie.
 */
export function disponiGhigliottina(voce: GhigliottinaDellElenco, caso: () => number): GhigliottinaDelGiorno {
  const ordine = voce.c.map((_, i) => i)
  for (let i = ordine.length - 1; i > 0; i -= 1) {
    const j = Math.floor(caso() * (i + 1))
    ;[ordine[i], ordine[j]] = [ordine[j], ordine[i]]
  }
  return {
    soluzione: voce.s,
    coppie: ordine.map((i) => {
      const [giusta, esca, spiegazione] = voce.c[i]
      const prima = caso() < 0.5 ? 0 : 1
      return {
        parole: prima === 0 ? [giusta, esca] : [esca, giusta],
        giusta: prima,
        spiegazione,
      }
    }),
  }
}

/** Il seme della sequenza delle ghigliottine: cambiarlo cambierebbe quelle dei giorni ancora da scrivere. */
const SEME_SEQUENZA = 0x6a11

/**
 * La ghigliottina di un giorno: quella che una permutazione fissa dell'elenco
 * mette al giorno `numero`, come la parola del Wordle, quindi una soluzione
 * non torna finché l'elenco non e' finito. L'ordine delle coppie e il posto
 * della parola giusta vengono dal numero del giorno, gli stessi per tutti.
 */
export function ghigliottinaDelGiorno(
  numero: number,
  elenco: readonly GhigliottinaDellElenco[],
): GhigliottinaDelGiorno {
  if (elenco.length === 0) throw new Error("L'elenco delle ghigliottine e' vuoto")
  const ordine = solutionPermutation(elenco.length, SEME_SEQUENZA)
  const k = ((numero % elenco.length) + elenco.length) % elenco.length
  return disponiGhigliottina(elenco[ordine[k]], mulberry32(numero * 6007 + 0x9111))
}

/** Una giornata letta dal database: tiene solo quel che ha la forma giusta. */
export function giornataValida(valore: unknown): valore is GhigliottinaDelGiorno {
  if (!valore || typeof valore !== 'object') return false
  const g = valore as GhigliottinaDelGiorno
  return (
    typeof g.soluzione === 'string' &&
    Array.isArray(g.coppie) &&
    g.coppie.length === COPPIE_GHIGLIOTTINA &&
    g.coppie.every(
      (c) =>
        Array.isArray(c.parole) &&
        c.parole.length === 2 &&
        c.parole.every((p) => typeof p === 'string') &&
        (c.giusta === 0 || c.giusta === 1) &&
        typeof c.spiegazione === 'string',
    )
  )
}

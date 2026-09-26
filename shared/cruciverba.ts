/**
 * Regole del cruciverba, condivise fra client e server.
 *
 * Lo schema del giorno non si genera qui: riempire una griglia e' una ricerca
 * con ritorni all'indietro che non sta nei 10 ms di CPU di una richiesta, e la
 * fa scripts/cruciverba/generatore.mjs in CI. Qui stanno le regole che servono
 * a **giocarlo**: quali sono le parole di uno schema e come si numerano, quando
 * una griglia e' completa, quanto vale.
 *
 * La numerazione e' quella del cruciverba italiano: un numero a ogni casella
 * dove comincia una parola, in orizzontale o in verticale, da sinistra a destra
 * e dall'alto in basso. Una parola e' ogni sequenza di almeno due caselle
 * bianche. La regola e' la stessa del generatore, e un test verifica che le
 * chiavi delle definizioni salvate ritrovino le loro caselle.
 */

import { ALFABETO } from './wordle'

/** La casella nera, nello schema e nella soluzione. */
export const NERA = '#'
/** La casella bianca nello schema che va al client: le lettere restano sul server. */
export const BIANCA = '.'
/** Una casella non ancora scritta nella griglia del giocatore. */
export const VUOTA = ' '

/**
 * Il punteggio: cento punti a chi lo completa senza aiuti.
 *
 * Una lettera svelata costa tre punti, un errore segnalato da un controllo uno
 * solo. Il rapporto e' voluto: il controllo dice **dove** si e' sbagliato, lo
 * svelamento dice anche **cosa** va scritto, e chiedere la risposta deve costare
 * piu' che chiedere conferma. Controllare una griglia giusta non costa niente,
 * e ricontrollare lo stesso errore non lo si paga due volte.
 *
 * Il tempo non entra nei punti: sta in classifica come spareggio. Un
 * cruciverba si fa a pezzi, in pausa caffe', e un bonus di velocità
 * premierebbe chi ha mezz'ora di fila invece di chi lo risolve meglio.
 */
export const PUNTI_COMPLETO = 100
export const COSTO_SVELATA = 3
export const COSTO_ERRORE = 1

export type Direzione = 'o' | 'v'

export interface Sequenza {
  /** Direzione piu' indice della prima casella: `o12`, `v3`. */
  chiave: string
  numero: number
  direzione: Direzione
  /** Gli indici delle caselle, nell'ordine di lettura. */
  caselle: number[]
}

function nera(schema: string, k: number): boolean {
  return schema[k] === NERA
}

/**
 * Le parole di uno schema, numerate.
 *
 * `schema` e' una stringa di `righe * colonne` caratteri in cui conta solo
 * dov'e' il `#`: va bene la soluzione, lo schema con i punti che arriva al
 * client, la griglia del giocatore. Le orizzontali vengono prima delle
 * verticali, ciascuna in ordine di numero.
 */
export function sequenzeDelloSchema(schema: string, righe: number, colonne: number): Sequenza[] {
  const orizzontali: Sequenza[] = []
  const verticali: Sequenza[] = []
  let numero = 0

  for (let r = 0; r < righe; r += 1) {
    for (let c = 0; c < colonne; c += 1) {
      const k = r * colonne + c
      if (nera(schema, k)) continue

      const iniziaOrizzontale =
        (c === 0 || nera(schema, k - 1)) && c + 1 < colonne && !nera(schema, k + 1)
      const iniziaVerticale =
        (r === 0 || nera(schema, k - colonne)) && r + 1 < righe && !nera(schema, k + colonne)
      if (!iniziaOrizzontale && !iniziaVerticale) continue

      numero += 1
      if (iniziaOrizzontale) {
        const caselle: number[] = []
        for (let cc = c; cc < colonne && !nera(schema, r * colonne + cc); cc += 1) {
          caselle.push(r * colonne + cc)
        }
        orizzontali.push({ chiave: `o${k}`, numero, direzione: 'o', caselle })
      }
      if (iniziaVerticale) {
        const caselle: number[] = []
        for (let rr = r; rr < righe && !nera(schema, rr * colonne + c); rr += 1) {
          caselle.push(rr * colonne + c)
        }
        verticali.push({ chiave: `v${k}`, numero, direzione: 'v', caselle })
      }
    }
  }

  return [...orizzontali, ...verticali]
}

/** Il numero da stampare in ogni casella dove comincia una parola. */
export function numeriDelleCaselle(sequenze: readonly Sequenza[]): Map<number, number> {
  const numeri = new Map<number, number>()
  for (const s of sequenze) numeri.set(s.caselle[0], s.numero)
  return numeri
}

/** Lo schema senza le lettere: `#` per le nere, `.` per le bianche. */
export function schemaVuoto(soluzione: string): string {
  return soluzione.replace(/[^#]/g, BIANCA)
}

/** La griglia di chi comincia: nere al loro posto, bianche vuote. */
export function grigliaIniziale(soluzione: string): string {
  return soluzione.replace(/[^#]/g, VUOTA)
}

/**
 * La griglia arrivata dal client ha la forma dello schema?
 *
 * Stessa lunghezza, nere esattamente dove sono nella soluzione, e nelle bianche
 * solo lettere della tastiera o spazi. Una griglia che sposta una nera o scrive
 * una J non si salva: sarebbe un modo di fabbricarsi una partita diversa.
 */
export function grigliaValida(lettere: string, soluzione: string): boolean {
  if (lettere.length !== soluzione.length) return false
  for (let k = 0; k < soluzione.length; k += 1) {
    const l = lettere[k]
    if (soluzione[k] === NERA) {
      if (l !== NERA) return false
    } else if (l !== VUOTA && !ALFABETO.includes(l)) {
      return false
    }
  }
  return true
}

/** Le caselle bianche scritte con una lettera diversa da quella giusta. */
export function caselleSbagliate(lettere: string, soluzione: string): number[] {
  const sbagliate: number[] = []
  for (let k = 0; k < soluzione.length; k += 1) {
    if (soluzione[k] === NERA) continue
    if (lettere[k] !== VUOTA && lettere[k] !== soluzione[k]) sbagliate.push(k)
  }
  return sbagliate
}

/** Tutte le bianche sono scritte, giuste o sbagliate che siano. */
export function grigliaPiena(lettere: string): boolean {
  return !lettere.includes(VUOTA)
}

/** Quante bianche sono scritte. */
export function caselleScritte(lettere: string): number {
  let n = 0
  for (const l of lettere) if (l !== VUOTA && l !== NERA) n += 1
  return n
}

export function caselleBianche(schema: string): number {
  let n = 0
  for (const l of schema) if (l !== NERA) n += 1
  return n
}

/** Quanto vale la giornata, con questi aiuti. Mai sotto zero. */
export function punteggio(svelate: number, errori: number): number {
  return Math.max(0, PUNTI_COMPLETO - svelate * COSTO_SVELATA - errori * COSTO_ERRORE)
}

/**
 * Lo spazio di una definizione: la parola che la ospita, nella griglia del
 * giocatore. Serve al client per sapere se una parola e' finita.
 */
export function parolaNellaGriglia(lettere: string, sequenza: Sequenza): string {
  return sequenza.caselle.map((k) => lettere[k]).join('')
}

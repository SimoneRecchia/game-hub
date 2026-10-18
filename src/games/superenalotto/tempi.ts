import { PALLINE_MS } from '@shared/superenalotto'

/**
 * I tempi della diretta, in millisecondi dal suo inizio: quelli dell'urna in 3D
 * e quelli delle scritte sopra, che devono andare insieme. Le uscite delle
 * palline (`PALLINE_MS`) e la durata (`DURATA_DIRETTA_MS`) sono del server, che
 * paga i premi a diretta finita; qui c'e' tutto quel che succede attorno a
 * ogni uscita, e la regia della camera, che e' una scaletta fissa: chi arriva a
 * meta' trova l'inquadratura di quel momento, e la replica e' la stessa.
 */

/** Prima di ogni pallina: il rullo di tamburo, le luci che calano, la camera che sale alla bocca dell'urna. */
export const ATTESA_MS = 2400
/** Il viaggio di una pallina dalla sua uscita: risucchiata fino alla bocca, giu' per il tubo, sulla rotaia. */
export const RISUCCHIO_MS = 650
export const TUBO_MS = 2050
export const ROTAIA_MS = 800
/** Quando la pallina e' al suo posto: da qui si sa, e si annuncia. */
export const ARRIVO_MS = RISUCCHIO_MS + TUBO_MS + ROTAIA_MS
/** La pallina da vicino, al suo posto, con l'annuncio. */
export const VETRINA_MS = 3000
/** Il titolo d'apertura; finito quello, l'aria comincia a soffiare. */
export const APERTURA_MS = 4500

const ULTIMA = PALLINE_MS[PALLINE_MS.length - 1]
/** L'aria soffia dalla fine del titolo a quando l'ultima pallina arriva al suo posto. */
export const SOFFIO = { da: APERTURA_MS, a: ULTIMA + ARRIVO_MS }
/** Il riepilogo: finita la vetrina dell'ultima. */
export const RIEPILOGO_MS = ULTIMA + ARRIVO_MS + VETRINA_MS

/** Gli ultimi secondi del conto alla rovescia, quelli che si contano a voce. */
export const ULTIMI_SECONDI = 3

/** La pallina `i` e' gia' al suo posto? */
export const arrivata = (t: number, i: number) => t >= PALLINE_MS[i] + ARRIVO_MS

/** La pallina che si sta estraendo, dall'attesa all'arrivo, o -1. */
export const inEstrazione = (t: number) => PALLINE_MS.findIndex((t0) => t >= t0 - ATTESA_MS && t < t0 + ARRIVO_MS)

/** La pallina in vetrina, appena arrivata, o -1. */
export const inVetrina = (t: number) =>
  PALLINE_MS.findIndex((t0) => t >= t0 + ARRIVO_MS && t < t0 + ARRIVO_MS + VETRINA_MS)

/**
 * Le inquadrature della regia. Ognuna e' una posizione della camera che si
 * muove da sola (l'urna da lontano che gira piano, la bocca, la pallina nel
 * tubo, la pallina al suo posto...), e la scaletta dice da quando vale e in
 * quanto ci si arriva dalla precedente: in mezzo la camera passa dall'una
 * all'altra, tutte e due vive. Le misure le fa l'urna, che sa quanto e' largo
 * lo schermo.
 */
export type Ripresa = 'studio' | 'largo' | 'dettaglio' | 'bocca' | 'inseguimento' | 'vetrina' | 'finale'

export interface Stacco {
  da: number
  passaggio: number
  ripresa: Ripresa
  /** La pallina di cui si parla, per le riprese che la seguono. */
  pallina: number
}

/**
 * La scaletta: lo studio dall'alto prima dell'inizio, la gru che scende con il
 * titolo, l'urna da vicino mentre si mescola, e per ogni pallina la bocca, il
 * tubo e la vetrina; fra una pallina e l'altra si torna indietro, da lontano o
 * all'urna, a turno. Alla fine la rotaia con le quattro.
 */
export const REGIA: readonly Stacco[] = (() => {
  const s: Stacco[] = [
    { da: -Infinity, passaggio: 1, ripresa: 'studio', pallina: 0 },
    { da: 0, passaggio: APERTURA_MS, ripresa: 'largo', pallina: 0 },
    { da: APERTURA_MS + 2000, passaggio: 2600, ripresa: 'dettaglio', pallina: 0 },
  ]
  PALLINE_MS.forEach((t0, i) => {
    s.push({ da: t0 - ATTESA_MS, passaggio: 1500, ripresa: 'bocca', pallina: i })
    s.push({ da: t0 + RISUCCHIO_MS - 250, passaggio: 650, ripresa: 'inseguimento', pallina: i })
    s.push({ da: t0 + RISUCCHIO_MS + TUBO_MS - 350, passaggio: 1100, ripresa: 'vetrina', pallina: i })
    const dopo = t0 + ARRIVO_MS + VETRINA_MS
    if (i === PALLINE_MS.length - 1) s.push({ da: dopo, passaggio: 2200, ripresa: 'finale', pallina: i })
    else s.push({ da: dopo, passaggio: 1800, ripresa: i % 2 === 0 ? 'largo' : 'dettaglio', pallina: i })
  })
  return s
})()

/** Lo stacco in corso al tempo `t`, con il suo indice nella scaletta. */
export function staccoDi(t: number): number {
  let i = 0
  while (i + 1 < REGIA.length && REGIA[i + 1].da <= t) i += 1
  return i
}


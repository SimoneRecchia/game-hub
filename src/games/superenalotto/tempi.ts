import { PALLINE_MS } from '@shared/superenalotto'

/**
 * I tempi della diretta, in millisecondi dal suo inizio: quelli dello studio e
 * quelli delle scritte, che devono andare insieme. Le uscite delle palline
 * (`PALLINE_MS`) e la durata (`DURATA_DIRETTA_MS`) sono del server, che paga i
 * premi a diretta finita; qui c'e' tutto quel che succede attorno a ogni
 * uscita. Tutto e' una funzione del tempo: chi arriva a meta' trova la
 * diretta di quel momento, e la replica e' la stessa.
 */

/** Prima di ogni pallina: il rullo di tamburo, la bocca dell'urna che si accende. */
export const ATTESA_MS = 2400
/**
 * Il viaggio di una pallina dalla sua uscita: risucchiata fino alla bocca, giu'
 * per il tubo, sulla rotaia. Sono i tempi del suono `estratto` (suoni.ts): il
 * colpo alla bocca a 0,65 secondi, i colpi nel tubo fino a 2,65, il rotolare
 * da 2,7: se cambiano gli uni va rifatto l'altro.
 */
export const RISUCCHIO_MS = 650
export const TUBO_MS = 2050
export const ROTAIA_MS = 800
/** Quando la pallina e' al suo posto: da qui si sa, e si annuncia. */
export const ARRIVO_MS = RISUCCHIO_MS + TUBO_MS + ROTAIA_MS
/** Il sottopancia della pallina appena arrivata: resta almeno questo, e fino all'attesa della prossima. */
export const VETRINA_MS = 3000
/** Il titolo d'apertura; finito quello, l'aria comincia a soffiare. */
export const APERTURA_MS = 4500

const ULTIMA = PALLINE_MS[PALLINE_MS.length - 1]
/** L'aria soffia dalla fine del titolo a quando l'ultima pallina arriva al suo posto. */
export const SOFFIO = { da: APERTURA_MS, a: ULTIMA + ARRIVO_MS }
/** Il riepilogo: finita la vetrina dell'ultima. */
export const RIEPILOGO_MS = ULTIMA + ARRIVO_MS + VETRINA_MS
/** Nella replica i premi si sanno gia': dopo il riepilogo, quanto si resta in studio prima di tornare ai risultati. */
export const CONGEDO_MS = 2600

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
 * Che cosa dice lo studio al tempo `t`, nel posto del sottopancia: il conto
 * alla rovescia, il titolo, l'attesa di una pallina (il tamburo), l'annuncio
 * dell'ultima arrivata — che resta finche' non comincia l'attesa della
 * prossima —, o il riepilogo. Lo sentono anche lo screen reader e i suoni.
 */
export type Momento =
  | { tipo: 'conto' }
  | { tipo: 'apertura' }
  | { tipo: 'mescola' }
  | { tipo: 'attesa'; pallina: number }
  | { tipo: 'annuncio'; pallina: number }
  | { tipo: 'riepilogo' }

export function momentoDi(t: number): Momento {
  if (t < 0) return { tipo: 'conto' }
  if (t >= RIEPILOGO_MS) return { tipo: 'riepilogo' }
  const estrazione = inEstrazione(t)
  if (estrazione >= 0) return { tipo: 'attesa', pallina: estrazione }
  let ultima = -1
  PALLINE_MS.forEach((_, i) => {
    if (arrivata(t, i)) ultima = i
  })
  if (ultima >= 0) return { tipo: 'annuncio', pallina: ultima }
  return t < APERTURA_MS ? { tipo: 'apertura' } : { tipo: 'mescola' }
}

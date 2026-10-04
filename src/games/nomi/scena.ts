/**
 * I tempi delle scene di Nomi, cose e città: il timbro dello stop e la
 * correzione del foglio. Stanno qui e non nei componenti perché l'adesivo
 * della fine aspetta che la correzione sia finita, e il CSS la disegna con gli
 * stessi numeri (le variabili `--attesa`, `--passo`, `--totale` e `--fine`
 * sul foglio): i test li tengono d'accordo.
 */

import { LETTERE_NOMI, PUNTI_SFIDA } from '@shared/nomi-cose'

/** Quanto resta il timbro dello stop, o del tempo finito, prima che il foglio si corregga. */
export const TIMBRO_MS = 1_400

/** Fra il segno di una riga e quello della riga dopo. */
export const PASSO_CORREZIONE_MS = 300

/**
 * Quanto dura il lavoro su una riga, dal suo segno: la spunta o la croce
 * subito, poi i punti e l'evidenziatore. Le durate stanno in NomiCose.css.
 */
export const RIGA_MS = 480

/** Il totale, dopo l'ultima riga, e quanto ci mette a scriversi: la doppia riga, poi la somma. */
const TOTALE_DOPO_MS = 60
export const TOTALE_MS = 520

/** Un respiro fra il totale e l'adesivo della fine. */
const RESPIRO_MS = 150

export interface TempiCorrezione {
  /** Quando si segna ogni riga, da quando il foglio compare. */
  righe: number[]
  /** Quando comincia il totale. */
  totale: number
  /** Quando la correzione e' finita: e' il momento dell'adesivo della fine. */
  fine: number
}

/**
 * La correzione di un foglio di `quante` righe, che comincia dopo `attesa`
 * (il timbro dello stop, se c'e'). Senza animazioni tutto e' segnato subito, e
 * l'adesivo arriva appena il timbro se n'e' andato.
 */
export function tempiCorrezione(quante: number, attesa = 0, ridotto = false): TempiCorrezione {
  if (ridotto) return { righe: Array.from({ length: quante }, () => attesa), totale: attesa, fine: attesa }
  const righe = Array.from({ length: quante }, (_, i) => attesa + i * PASSO_CORREZIONE_MS)
  const ultima = quante > 0 ? righe[quante - 1] + RIGA_MS : attesa
  const totale = ultima + TOTALE_DOPO_MS
  return { righe, totale, fine: totale + TOTALE_MS + RESPIRO_MS }
}

/** Le variabili del CSS che disegnano la correzione, in millisecondi. */
export function variabiliCorrezione(t: TempiCorrezione, attesa = 0): Record<string, string> {
  return {
    '--attesa': `${attesa}ms`,
    '--passo': `${PASSO_CORREZIONE_MS}ms`,
    '--totale': `${t.totale}ms`,
    '--fine': `${t.fine}ms`,
  }
}

/** Una risposta che al tavolo ha scritto solo chi la legge: vale il massimo, e si evidenzia. */
export function sola(punti: number): boolean {
  return punti === PUNTI_SFIDA.sola
}

/** Il posto di una lettera sul rullo, che ha le lettere del gioco in ordine d'alfabeto. */
export function fermataDi(lettera: string): number {
  return Math.max(0, LETTERE_NOMI.indexOf(lettera.toLowerCase() as (typeof LETTERE_NOMI)[number]))
}

/**
 * Dove comincia la frenata del rullo: `frenata` lettere prima della fermata,
 * e non prima di dove si trova adesso, perché il rullo va sempre avanti
 * nell'alfabeto, come quando lo si dice a mente. Il salto non si vede: a
 * quella velocita' le lettere sono sfocate.
 */
export function inizioFrenata(adesso: number, fermata: number, frenata: number): number {
  const n = LETTERE_NOMI.length
  let da = Math.floor(adesso / n) * n + fermata - frenata
  while (da < adesso) da += n
  return da
}

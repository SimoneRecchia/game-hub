/**
 * Il caso di una partita di Lupus: un generatore con il seme, che si puo'
 * fermare e riprendere. La partita salva il punto in cui e' arrivato
 * (`statoCaso`) e la notte dopo riparte da li': cosi' la stessa partita, con
 * le stesse azioni, da' sempre gli stessi ruoli e gli stessi spareggi, nei test
 * e fra il telefono e il server.
 *
 * Il generatore e' quello di tutto il progetto, `mulberry32` di daily.ts, che
 * non dice a che punto e' ma avanza di un passo fisso a ogni numero: il punto lo
 * si ricava contando i numeri estratti. Un test verifica che riprendere da
 * `stato()` dia la stessa sequenza di chi ha continuato.
 */

import { mulberry32 } from './daily'

/** Di quanto mulberry32 fa avanzare il suo stato a ogni numero. */
const PASSO = 0x6d2b79f5

export interface Caso {
  /** Un numero fra 0 compreso e 1 escluso. */
  prossimo(): number
  /** Il seme da cui la sequenza riprende da qui: e' quel che la partita salva. */
  stato(): number
}

export function casoDa(seme: number): Caso {
  const inizio = seme >>> 0
  const numero = mulberry32(inizio)
  let estratti = 0
  return {
    prossimo() {
      estratti += 1
      return numero()
    },
    stato() {
      return (inizio + Math.imul(estratti, PASSO)) >>> 0
    },
  }
}

/** Una copia mescolata (Fisher-Yates): l'originale resta com'era. */
export function mescola<T>(voci: readonly T[], caso: Caso): T[] {
  const mazzo = voci.slice()
  for (let i = mazzo.length - 1; i > 0; i -= 1) {
    const j = Math.floor(caso.prossimo() * (i + 1))
    ;[mazzo[i], mazzo[j]] = [mazzo[j], mazzo[i]]
  }
  return mazzo
}

export function pescaUno<T>(voci: readonly T[], caso: Caso): T {
  return voci[Math.floor(caso.prossimo() * voci.length)]
}

/**
 * Un seme nuovo, per chi apre una partita: il motore non pesca mai da solo,
 * perché altrimenti la partita non si potrebbe rifare. Dove c'e', il caso del
 * sistema; altrimenti quello di Math.random, che per un seme basta.
 */
export function semeACaso(): number {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    return crypto.getRandomValues(new Uint32Array(1))[0]
  }
  return Math.floor(Math.random() * 0x1_0000_0000) >>> 0
}

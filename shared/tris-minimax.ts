/**
 * Il minimax del tris, posizione per posizione: serve a scrivere e a
 * controllare la tabella dei valori (shared/tris-valori.ts), che il gioco
 * legge senza ricalcolare niente.
 *
 * Una posizione e' il suo indice in base tre, una cifra per casella: 0 vuota,
 * 1 chi ha cominciato, 2 l'altro.
 */

import { CASELLE, FILE } from './tris'

export const POSIZIONI_TRIS = 3 ** CASELLE

/** Le caselle di una posizione dal suo indice. */
export function caselleDaIndice(i: number): number[] {
  const caselle: number[] = []
  let resto = i
  for (let k = 0; k < CASELLE; k += 1) {
    caselle.push(resto % 3)
    resto = Math.floor(resto / 3)
  }
  return caselle
}

function filaDi(caselle: number[], segno: number): boolean {
  return FILE.some((f) => f.every((k) => caselle[k] === segno))
}

/**
 * Il valore della posizione per chi ha il tratto, con il gioco perfetto da
 * tutti e due (-1, 0, 1), o null se la posizione non puo' esistere: segni
 * che non si alternano, o tutti e due con una fila.
 */
export function minimaxTris(i: number, memoria = new Map<number, -1 | 0 | 1 | null>()): -1 | 0 | 1 | null {
  const noto = memoria.get(i)
  if (noto !== undefined) return noto
  const caselle = caselleDaIndice(i)
  const zeri = caselle.filter((c) => c === 1).length
  const uni = caselle.filter((c) => c === 2).length
  let v: -1 | 0 | 1 | null
  if (zeri !== uni && zeri !== uni + 1) v = null
  else {
    const tratto = zeri === uni ? 1 : 2
    const altro = tratto === 1 ? 2 : 1
    if (filaDi(caselle, 1) && filaDi(caselle, 2)) v = null
    else if (filaDi(caselle, tratto)) v = null
    else if (filaDi(caselle, altro)) v = -1
    else if (caselle.every((c) => c !== 0)) v = 0
    else {
      let migliore = -1
      for (let k = 0; k < CASELLE; k += 1) {
        if (caselle[k] !== 0) continue
        const dopo = minimaxTris(i + tratto * 3 ** k, memoria)
        if (dopo !== null && -dopo > migliore) migliore = -dopo
      }
      v = migliore as -1 | 0 | 1
    }
  }
  memoria.set(i, v)
  return v
}

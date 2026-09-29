/**
 * La parte comune dei Web Worker del computer: ognuno sa solo leggere la
 * posizione del suo gioco e scrivere la mossa, il resto e' qui.
 */

import { mulberry32 } from '@shared/daily'
import type { LivelloTavoliere } from '@shared/tavolo'
import type { DomandaAlComputer } from './computer'

export type Pensa = (
  posizione: string,
  livello: LivelloTavoliere,
  rng: () => number,
  storia: readonly string[],
) => string | null

export function ascolta(pensa: Pensa): void {
  self.onmessage = (evento: MessageEvent<DomandaAlComputer & { id: number }>) => {
    const { id, posizione, livello, storia, seme } = evento.data
    try {
      self.postMessage({ id, ok: true, mossa: pensa(posizione, livello, mulberry32(seme >>> 0), storia) })
    } catch {
      self.postMessage({ id, ok: false })
    }
  }
}

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
  ultima: string | null,
) => string | null

/** Nel go, a gioco fermo: le pietre morte, secondo il computer. */
export type Stima = (posizione: string, rng: () => number) => number[]

export function ascolta(pensa: Pensa, stima?: Stima): void {
  self.onmessage = (evento: MessageEvent<DomandaAlComputer & { id: number; tipo?: 'mossa' | 'morte' }>) => {
    const { id, tipo, posizione, livello, storia, seme, ultima } = evento.data
    try {
      const rng = mulberry32(seme >>> 0)
      if (tipo === 'morte') self.postMessage({ id, ok: true, morte: stima ? stima(posizione, rng) : [] })
      else self.postMessage({ id, ok: true, mossa: pensa(posizione, livello, rng, storia ?? [], ultima ?? null) })
    } catch {
      self.postMessage({ id, ok: false })
    }
  }
}

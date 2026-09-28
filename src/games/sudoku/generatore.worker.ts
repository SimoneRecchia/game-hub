/**
 * Il generatore degli schemi liberi, in un Web Worker.
 *
 * Uno schema esperto chiede in media una ventina di griglie provate e scartate
 * — qualche decimo di secondo, a volte di piu' — e sul filo principale
 * fermerebbe la pagina proprio mentre dice che lo sta preparando. E' lo stesso
 * generatore della classificata (shared/sudoku.ts), con un seme a caso.
 */

import { mulberry32 } from '@shared/daily'
import { generaSchema, type LivelloSudoku } from '@shared/sudoku'

self.onmessage = (evento: MessageEvent<{ livello: LivelloSudoku; seme: number }>) => {
  const { livello, seme } = evento.data
  // Se un seme non ne da' uno del livello giusto si riprova con il seguente: succede di rado.
  for (let s = seme; s < seme + 20; s += 1) {
    const schema = generaSchema(livello, mulberry32(s >>> 0))
    if (schema) {
      self.postMessage({ ok: true, schema })
      return
    }
  }
  self.postMessage({ ok: false })
}

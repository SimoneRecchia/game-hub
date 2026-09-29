/** Il computer del Forza 4, in un Web Worker (vedi tavolo/computer.ts). */

import { ascolta } from '@/games/tavolo/lavoratore'
import { leggi } from '@shared/forza4'
import { mossaDelComputer } from '@shared/forza4-computer'

ascolta((posizione, livello, rng) => {
  const p = leggi(posizione)
  const colonna = p ? mossaDelComputer(p, livello, rng) : null
  return colonna === null ? null : String(colonna)
})

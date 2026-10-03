/** Il computer del tris, in un Web Worker (vedi tavolo/computer.ts): una tabella e poco altro, ma come gli altri. */

import { ascolta } from '@/games/tavolo/lavoratore'
import { leggi } from '@shared/tris'
import { mossaDelComputer } from '@shared/tris-computer'

ascolta((posizione, livello, rng) => {
  const p = leggi(posizione)
  return p ? String(mossaDelComputer(p, livello, rng)) : null
})

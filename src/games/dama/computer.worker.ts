/** Il computer della dama, in un Web Worker (vedi tavolo/computer.ts). */

import { ascolta } from '@/games/tavolo/lavoratore'
import { leggi, notazione } from '@shared/dama'
import { mossaDelComputer } from '@shared/dama-computer'

ascolta((posizione, livello, rng, storia) => {
  const p = leggi(posizione)
  const mossa = p ? mossaDelComputer(p, livello, rng, storia) : null
  return mossa ? notazione(mossa) : null
})

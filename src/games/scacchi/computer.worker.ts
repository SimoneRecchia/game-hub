/** Il computer degli scacchi, in un Web Worker (vedi tavolo/computer.ts). */

import { ascolta } from '@/games/tavolo/lavoratore'
import { daFen, uci } from '@shared/scacchi'
import { mossaDelComputer } from '@shared/scacchi-computer'

ascolta((posizione, livello, rng, storia) => {
  const p = daFen(posizione)
  const mossa = p ? mossaDelComputer(p, livello, rng, storia) : null
  return mossa ? uci(mossa) : null
})

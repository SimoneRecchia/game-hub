/** Il computer del go, in un Web Worker (vedi tavolo/computer.ts): le mosse, e le pietre morte a gioco fermo. */

import { ascolta } from '@/games/tavolo/lavoratore'
import { leggi, testoMossa } from '@shared/go'
import { mossaDelComputer, stimaMorte } from '@shared/go-computer'

ascolta(
  (posizione, livello, rng, storia) => {
    const p = leggi(posizione)
    return p ? testoMossa(mossaDelComputer(p, livello, rng, storia), p.lato) : null
  },
  (posizione, rng) => {
    const p = leggi(posizione)
    return p ? stimaMorte(p, rng) : []
  },
)

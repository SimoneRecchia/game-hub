/** Il computer del go, in un Web Worker (vedi tavolo/computer.ts): le mosse, e le pietre morte a gioco fermo. */

import { ascolta } from '@/games/tavolo/lavoratore'
import { leggi, puntoDa, testoMossa } from '@shared/go'
import { mossaDelComputer, stimaMorte } from '@shared/go-computer'

ascolta(
  (posizione, livello, rng, storia, ultima) => {
    const p = leggi(posizione)
    if (!p) return null
    // L'ultima pietra dell'altro: il computer guarda prima li' intorno. Un passo non ne ha.
    const opzioni = { ultima: ultima ? puntoDa(ultima, p.lato) : null }
    return testoMossa(mossaDelComputer(p, livello, rng, storia, opzioni), p.lato)
  },
  (posizione, rng) => {
    const p = leggi(posizione)
    return p ? stimaMorte(p, rng) : []
  },
)

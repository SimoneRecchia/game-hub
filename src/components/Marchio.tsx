import type { CSSProperties } from 'react'
import { Copertina } from './Copertina'
import './Marchio.css'

/**
 * Il marchio dell'app: le copertine dei primi quattro giochi, una accanto
 * all'altra come le icone di una cartella sulla schermata Home. Il quiz, che e'
 * arrivato dopo, non c'e': una cartella ne mostra quattro, e l'icona dell'app
 * e' disegnata cosi'.
 *
 * E' il disegno dell'icona dell'app (public/icon.svg), fatto con i pezzi veri:
 * cambia colore con il tema e con i giochi, invece di restare un'immagine.
 */
export function Marchio({ lato = 88, animato = true }: { lato?: number; animato?: boolean }) {
  return (
    <span
      className={`marchio${animato ? ' marchio--animato' : ''}`}
      style={{ '--marchio': `${lato}px` } as CSSProperties}
      aria-hidden="true"
    >
      <Copertina gioco="wordle" formato="icona" />
      <Copertina gioco="scarabeo" formato="icona" />
      <Copertina gioco="cruciverba" formato="icona" />
      <Copertina gioco="battaglia" formato="icona" />
    </span>
  )
}

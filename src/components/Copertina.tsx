import type { CSSProperties } from 'react'
import { IconaGioco, type SoggettoIcona } from './IconaGioco'
import './Copertina.css'

type Formato = 'icona' | 'carta' | 'eroe'

interface Props {
  gioco: SoggettoIcona
  formato?: Formato
  className?: string
}

/**
 * La copertina di un gioco: un vetrino, il riquadro di vetro bombato con il
 * filo d'inchiostro, tinto del colore del gioco, con dentro il suo adesivo
 * (`IconaGioco`). E' l'icona del gioco dappertutto — la barra laterale, le
 * carte, i profili — e in grande, storta e che galleggia, in cima alla sala
 * di un gioco (`eroe`).
 */
export function Copertina({ gioco, formato = 'carta', className = '' }: Props) {
  return (
    <div
      className={`copertina copertina--${formato} ${className}`}
      style={{ '--tinta': `var(--${gioco}-tinta, var(--lilla))` } as CSSProperties}
      aria-hidden="true"
    >
      <IconaGioco gioco={gioco} lato={formato === 'eroe' ? 84 : 36} fluido className="copertina__disegno" />
    </div>
  )
}

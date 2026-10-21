import type { CSSProperties } from 'react'
import { coloreDellaPallina } from './palline'
import './Pallina.css'

/**
 * Una pallina dell'urna disegnata piatta, come nel mockup: il colore del suo
 * quarto d'urna con il filo d'inchiostro, la luce e l'ombra secche, e il
 * numero nel tondo bianco. `lato` la fa grande quanto serve; `mia` le mette
 * l'anello d'oro dei numeri di chi guarda.
 */
export function Pallina({ n, lato, mia = false }: { n: number; lato?: number; mia?: boolean }) {
  const stile = { '--pallina': coloreDellaPallina(n), ...(lato ? { '--lato': `${lato}px` } : {}) } as CSSProperties
  return (
    <span className={`se-palla${mia ? ' is-mia' : ''}`} style={stile}>
      <span className="se-palla__numero u-tabnum">{n}</span>
    </span>
  )
}

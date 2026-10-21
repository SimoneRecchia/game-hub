import type { CSSProperties, ReactNode } from 'react'
import './Biglietto.css'

/**
 * Un biglietto: carta con i bordi dentellati ai lati, come quelli strappati da
 * un blocchetto, il filo d'inchiostro e l'ombra secca. E' la giornata in cima
 * alle Giornaliere, una partita in corso nelle Libere, il saldo della Fortuna.
 *
 * I denti sono una maschera, e la maschera taglierebbe anche un'ombra o un
 * contorno fatti con i filtri: per questo l'ombra e' un secondo biglietto,
 * d'inchiostro e spostato, e il contorno dei denti un disegno di archi lungo i
 * due lati. Cinque `drop-shadow`, come nel prototipo, si rifarebbero a ogni
 * fotogramma delle faccine che saltano dentro.
 */
export function Biglietto({
  colore,
  className = '',
  stile,
  children,
}: {
  /** Il fondo del biglietto: un colore o una sfumatura. */
  colore?: string
  className?: string
  stile?: CSSProperties
  children: ReactNode
}) {
  return (
    <div className={`biglietto ${className}`} style={{ ...(colore ? { '--biglietto-fondo': colore } : {}), ...stile } as CSSProperties}>
      <span className="biglietto__ombra" aria-hidden="true" />
      <div className="biglietto__carta">
        <span className="biglietto__denti" aria-hidden="true" />
        {children}
      </div>
    </div>
  )
}

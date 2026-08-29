import type { HTMLAttributes, ReactNode } from 'react'
import './Card.css'

interface Props extends HTMLAttributes<HTMLDivElement> {
  /** Titolo della sezione, reso come label maiuscoletta sopra la card (stile iOS). */
  sectionTitle?: string
  footnote?: ReactNode
  padded?: boolean
  children: ReactNode
}

export function Card({
  sectionTitle,
  footnote,
  padded = true,
  className = '',
  children,
  ...rest
}: Props) {
  return (
    <section className="card-group">
      {sectionTitle && <h2 className="card-group__title">{sectionTitle}</h2>}
      <div className={`card${padded ? ' card--padded' : ''} ${className}`} {...rest}>
        {children}
      </div>
      {footnote && <p className="card-group__footnote">{footnote}</p>}
    </section>
  )
}

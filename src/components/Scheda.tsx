import type { CSSProperties, ReactNode } from 'react'
import './Scheda.css'

/**
 * Una scheda di gioco: il riquadro che contiene quel che si guarda — un mare,
 * una griglia, un tabellone — con la sua testata. E' lo stile nato con la
 * battaglia navale, dove i due mari dovevano dire di chi erano.
 *
 * La testata ha tre posti: a sinistra chi o che cosa (un avatar, un'icona nel
 * colore del gioco), il titolo, e a destra lo stato del momento, di solito una
 * `Pillola`. Quando la scheda e' quella dove si deve agire si accende
 * (`accesa`); quando qualcosa la minaccia prende l'arancione (`allerta`).
 */
export function Scheda({
  titolo,
  icona,
  destra,
  accesa = false,
  allerta = false,
  className = '',
  stile,
  children,
}: {
  titolo: ReactNode
  icona?: ReactNode
  destra?: ReactNode
  accesa?: boolean
  allerta?: boolean
  className?: string
  stile?: CSSProperties
  children: ReactNode
}) {
  const classi = ['scheda', accesa ? 'is-accesa' : '', allerta ? 'is-allerta' : '', className].filter(Boolean).join(' ')
  return (
    <section className={classi} style={stile} aria-label={typeof titolo === 'string' ? titolo : undefined}>
      <header className="scheda__testa">
        {icona}
        <h2 className="scheda__titolo">{titolo}</h2>
        {destra}
      </header>
      {children}
    </section>
  )
}

/** L'icona tonda nella testata di una scheda, nel colore del gioco. */
export function IconaScheda({ children, colore }: { children: ReactNode; colore?: string }) {
  return (
    <span
      className="scheda__icona"
      aria-hidden="true"
      style={colore ? ({ '--scheda-icona': colore } as CSSProperties) : undefined}
    >
      {children}
    </span>
  )
}

export type TonoPillola = 'turno' | 'mira' | 'neutra' | 'buona' | 'cattiva'

/**
 * Lo stato del momento, in una capsula: "Tocca a te", "Tentativo 3 di 6".
 *
 * `turno` e' l'indaco di quando tocca a te, e respira; `mira` e' l'arancione di
 * chi sta per colpire; `neutra` e' tutto il resto.
 */
export function Pillola({
  tono = 'neutra',
  icona,
  children,
  vivo = false,
}: {
  tono?: TonoPillola
  icona?: ReactNode
  children: ReactNode
  /** Letta dai lettori di schermo quando cambia. */
  vivo?: boolean
}) {
  return (
    <span className={`pillola is-${tono}`} aria-live={vivo ? 'polite' : undefined}>
      {icona && (
        <span className="pillola__icona" aria-hidden="true">
          {icona}
        </span>
      )}
      <span className="pillola__testo">{children}</span>
    </span>
  )
}

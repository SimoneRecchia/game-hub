import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { IconaGioco } from '@/components/IconaGioco'
import './Fine.css'

/** Una riga del conto: "I tuoi punti", "Il traguardo". */
export interface RigaFineScarabeo {
  nome: string
  valore: ReactNode
}

/**
 * Il risultato di una partita di Scarabeo, come nell'album: una carta chiara
 * sopra il tabellone velato, con l'adesivo del gioco che galleggia, il titolo,
 * il conto in righe, il timbro con i punti e i bottoni. In fondo "Guarda il
 * tabellone" la chiude: sotto c'e' la partita da riguardare, e il tabellino la
 * riapre.
 *
 * La carta e' chiara in tutti e due i temi, con l'inchiostro sopra: e' un
 * adesivo, come le tessere.
 */
export function FineScarabeo({
  aperta,
  onChiudi,
  titolo,
  testo,
  righe,
  timbro,
  children,
}: {
  aperta: boolean
  onChiudi: () => void
  titolo: string
  testo?: ReactNode
  righe: readonly RigaFineScarabeo[]
  /** Nel tondo giallo: i punti in classifica ("+52"); senza, il tondo non c'e'. */
  timbro?: ReactNode
  /** I bottoni. */
  children: ReactNode
}) {
  const carta = useRef<HTMLElement>(null)
  // Chi apre la carta passa `onChiudi` nuova a ogni giro: l'effetto non deve ripartire per questo.
  const chiudi = useRef(onChiudi)
  chiudi.current = onChiudi

  // Il fuoco entra nella carta, ed Esc la chiude; chiusa, il fuoco torna dov'era.
  useEffect(() => {
    if (!aperta) return
    const prima = document.activeElement as HTMLElement | null
    carta.current?.focus({ preventScroll: true })
    const tasto = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        chiudi.current()
      }
    }
    window.addEventListener('keydown', tasto)
    return () => {
      window.removeEventListener('keydown', tasto)
      prima?.focus?.({ preventScroll: true })
    }
  }, [aperta])

  if (!aperta || typeof document === 'undefined') return null
  return createPortal(
    <div className="scr-risultato">
      <button
        type="button"
        className="scr-risultato__velo"
        onClick={onChiudi}
        aria-label="Guarda il tabellone"
        tabIndex={-1}
      />
      <section
        ref={carta}
        className="scr-risultato__carta"
        role="dialog"
        aria-modal="true"
        aria-label={titolo}
        tabIndex={-1}
      >
        <span className="scr-risultato__icona">
          <IconaGioco gioco="scarabeo" lato={72} giro={-6} />
        </span>
        <h2 className="scr-risultato__titolo">{titolo}</h2>
        {testo && <p className="scr-risultato__testo">{testo}</p>}
        <div className="scr-risultato__righe">
          {righe.map((r) => (
            <div key={r.nome} className="scr-risultato__riga">
              <span>{r.nome}</span>
              <b className="u-tabnum">{r.valore}</b>
            </div>
          ))}
        </div>
        {timbro !== undefined && <span className="scr-risultato__timbro u-tabnum">{timbro}</span>}
        <div className="scr-risultato__azioni">{children}</div>
        <button type="button" className="scr-risultato__guarda" onClick={onChiudi}>
          Guarda il tabellone
        </button>
      </section>
    </div>,
    document.body,
  )
}

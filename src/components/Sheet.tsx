import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import './Sheet.css'

interface Props {
  open: boolean
  onClose: () => void
  title?: string
  /** Se false, il tap sullo sfondo non chiude (per i risultati "obbligatori"). */
  dismissible?: boolean
  children: ReactNode
}

/** Oltre questo spostamento verso il basso, lasciare il foglio lo chiude. */
const SOGLIA_CHIUSURA = 110

/**
 * Un foglio che sale dal basso, come in iOS.
 *
 * Si chiude con il tocco sullo sfondo, con Esc, oppure **trascinandolo giu'**
 * dalla maniglia: il gesto che su un telefono uno fa senza pensarci. Il
 * trascinamento parte solo dalla maniglia e dal titolo, non dal contenuto,
 * altrimenti ogni scorrimento di un foglio lungo rischierebbe di chiuderlo.
 *
 * Sta in un portale sul body: dentro una schermata con `overflow: hidden` — le
 * schermate di gioco — o durante una View Transition, resterebbe tagliato.
 */
export function Sheet({ open, onClose, title, dismissible = true, children }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [spostamento, setSpostamento] = useState(0)
  const [chiudendo, setChiudendo] = useState(false)
  const inizio = useRef<number | null>(null)

  useEffect(() => {
    if (!open) return
    setSpostamento(0)
    setChiudendo(false)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible) onClose()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.focus({ preventScroll: true })
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, dismissible, onClose])

  if (!open) return null

  const chiudi = () => {
    if (!dismissible) return
    setChiudendo(true)
    window.setTimeout(onClose, 220)
  }

  const giu = (e: PointerEvent<HTMLDivElement>) => {
    if (!dismissible) return
    inizio.current = e.clientY
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const muovi = (e: PointerEvent<HTMLDivElement>) => {
    if (inizio.current === null) return
    setSpostamento(Math.max(0, e.clientY - inizio.current))
  }
  const su = () => {
    if (inizio.current === null) return
    inizio.current = null
    if (spostamento > SOGLIA_CHIUSURA) chiudi()
    else setSpostamento(0)
  }

  return createPortal(
    <div className={`sheet${chiudendo ? ' is-chiudendo' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
      <button
        type="button"
        className="sheet__scrim"
        aria-label="Chiudi"
        tabIndex={dismissible ? 0 : -1}
        onClick={chiudi}
        style={{ opacity: 1 - Math.min(spostamento / 400, 0.6) }}
      />
      <div
        className={`sheet__panel${inizio.current !== null ? ' is-trascinato' : ''}`}
        ref={panelRef}
        tabIndex={-1}
        style={spostamento > 0 ? { transform: `translateY(${spostamento}px)` } : undefined}
      >
        <div className="sheet__maniglia" onPointerDown={giu} onPointerMove={muovi} onPointerUp={su} onPointerCancel={su}>
          {dismissible && <span className="sheet__grabber" aria-hidden="true" />}
          {title && <h2 className="sheet__title">{title}</h2>}
        </div>
        <div className="sheet__content">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

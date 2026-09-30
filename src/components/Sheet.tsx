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
 *
 * Con la tastiera si comporta come il dialog modale di WAI-ARIA: aperto, il
 * fuoco entra nel foglio e Tab ci gira dentro; chiuso, torna su quel che lo
 * aveva aperto, invece di ripartire dall'inizio della pagina.
 */
export function Sheet({ open, onClose, title, dismissible = true, children }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [spostamento, setSpostamento] = useState(0)
  const [chiudendo, setChiudendo] = useState(false)
  const inizio = useRef<number | null>(null)
  const radice = useRef<HTMLDivElement>(null)
  // Chi apre il foglio passa spesso una funzione nuova a ogni giro: l'effetto non deve ripartire per questo, o
  // riporterebbe il fuoco sul pannello mentre si scrive dentro il foglio.
  const suChiudi = useRef(onClose)
  useEffect(() => {
    suChiudi.current = onClose
  })

  useEffect(() => {
    if (!open) return
    setSpostamento(0)
    setChiudendo(false)
    const prima = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const onKey = (e: KeyboardEvent) => {
      // Con due fogli aperti, uno sopra l'altro, i tasti sono di quello sopra: l'ultimo messo nel body.
      const fogli = document.querySelectorAll('.sheet')
      if (!radice.current || fogli[fogli.length - 1] !== radice.current) return
      if (e.key === 'Escape' && dismissible) suChiudi.current()
      if (e.key === 'Tab') tieniDentro(e, radice.current)
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.focus({ preventScroll: true })
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      if (prima?.isConnected) prima.focus({ preventScroll: true })
    }
  }, [open, dismissible])

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
    <div
      ref={radice}
      className={`sheet${chiudendo ? ' is-chiudendo' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
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

const TABBABILI = [
  'a[href]',
  'button:not(:disabled)',
  'input:not(:disabled)',
  'select',
  'textarea',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

/** Tab e Maiuscolo+Tab restano nel foglio: dall'ultimo elemento si torna al primo, e dal primo all'ultimo. */
function tieniDentro(e: KeyboardEvent, foglio: HTMLElement): void {
  const voci = Array.from(foglio.querySelectorAll<HTMLElement>(TABBABILI)).filter((el) => el.tabIndex >= 0)
  if (voci.length === 0) return
  const primo = voci[0]
  const ultimo = voci[voci.length - 1]
  const qui = document.activeElement
  if (e.shiftKey && (qui === primo || !foglio.contains(qui))) {
    e.preventDefault()
    ultimo.focus()
  } else if (!e.shiftKey && (qui === ultimo || !foglio.contains(qui))) {
    e.preventDefault()
    primo.focus()
  }
}

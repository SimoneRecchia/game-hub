import { useEffect, useRef, type ReactNode } from 'react'
import './Sheet.css'

interface Props {
  open: boolean
  onClose: () => void
  title?: string
  /** Se false, il tap sullo sfondo non chiude (per i risultati "obbligatori"). */
  dismissible?: boolean
  children: ReactNode
}

export function Sheet({ open, onClose, title, dismissible = true, children }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible) onClose()
    }
    document.addEventListener('keydown', onKey)
    // Blocca lo scroll del body mentre lo sheet è aperto.
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, dismissible, onClose])

  if (!open) return null

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
      <button
        type="button"
        className="sheet__scrim"
        aria-label="Chiudi"
        tabIndex={dismissible ? 0 : -1}
        onClick={() => dismissible && onClose()}
      />
      <div className="sheet__panel" ref={panelRef} tabIndex={-1}>
        {dismissible && <span className="sheet__grabber" aria-hidden="true" />}
        {title && <h2 className="sheet__title">{title}</h2>}
        <div className="sheet__content">{children}</div>
      </div>
    </div>
  )
}

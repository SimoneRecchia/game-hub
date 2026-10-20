import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { IconaGioco, type SoggettoIcona } from '@/components/IconaGioco'
import './CartaFine.css'

/** Una riga del conto: "Il tempo", "Gli aiuti", "Record". */
export interface RigaFine {
  nome: string
  valore: ReactNode
}

/**
 * La carta della fine dei giochi da soli — il cruciverba, il sudoku, le
 * Sequenze —, come nell'album: l'adesivo del gioco che galleggia, il titolo,
 * il timbro con quel che si e' fatto, il conto in righe e i bottoni.
 *
 * Arriva sopra il gioco, dopo l'adesivo della fine, solo per una partita vista
 * finire: chi riapre una partita finita trova il riepilogo nella pagina. Un
 * tocco fuori, o Esc, la chiude, e sotto c'e' lo schema da guardare.
 *
 * La carta e' chiara in tutti e due i temi, con l'inchiostro sopra: e' un
 * adesivo, come le caselle colorate.
 */
export function CartaFine({
  aperta,
  onChiudi,
  gioco,
  colore,
  fondo,
  titolo,
  testo,
  timbro,
  righe,
  children,
}: {
  aperta: boolean
  /** Senza, la carta non si chiude: e' la fine, e i bottoni dicono dove andare. */
  onChiudi?: () => void
  gioco: SoggettoIcona
  /** Il colore pieno del gioco: il timbro. */
  colore: string
  /** Il fondo della carta, chiaro. */
  fondo: string
  titolo: string
  testo?: ReactNode
  timbro: ReactNode
  righe: readonly RigaFine[]
  /** I bottoni, in fondo. */
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
      if (e.key === 'Escape' && chiudi.current) {
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
    <div className="fine-carta" style={{ '--fine-colore': colore, '--fine-fondo': fondo } as CSSProperties}>
      <button
        type="button"
        className="fine-carta__velo"
        onClick={onChiudi}
        tabIndex={-1}
        aria-label="Chiudi"
        disabled={!onChiudi}
      />
      <section ref={carta} className="fine-carta__carta" role="dialog" aria-modal="true" aria-label={titolo} tabIndex={-1}>
        <span className="fine-carta__icona">
          <IconaGioco gioco={gioco} lato={68} giro={-6} />
        </span>
        <h2 className="fine-carta__titolo">{titolo}</h2>
        {testo && <p className="fine-carta__testo">{testo}</p>}
        <span className="fine-carta__timbro u-tabnum">{timbro}</span>
        {righe.length > 0 && (
          <div className="fine-carta__righe">
            {righe.map((r) => (
              <p key={r.nome} className="fine-carta__riga">
                <span>{r.nome}</span>
                <span className="u-tabnum">{r.valore}</span>
              </p>
            ))}
          </div>
        )}
        <div className="fine-carta__bottoni">{children}</div>
      </section>
    </div>,
    document.body,
  )
}

/** Un bottone della carta: tasto disegnato, chiaro (`carta`) o nel colore del gioco (`pieno`). */
export function BottoneFine({
  tono = 'carta',
  largo = false,
  onClick,
  disabled,
  children,
}: {
  tono?: 'carta' | 'pieno' | 'giallo'
  largo?: boolean
  onClick: () => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className={`fine-carta__bottone is-${tono}${largo ? ' is-largo' : ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { suona } from '@/lib/suoni'
import './Intermezzo.css'

/** Quanto dura il passaggio, e quando la scena sotto cambia: l'insegna la copre tutta. */
export const INTERMEZZO_MS = 1_700
const MEZZO_MS = 600

export interface DatiIntermezzo {
  /** Cambia a ogni passaggio: fa ripartire le animazioni. */
  chiave: number
  titolo: string
  sotto?: string
  /** Il colore del minigioco: i raggi e il fondo dell'insegna. */
  colore: string
  icona?: ReactNode
}

/**
 * Il passaggio da una scena all'altra, come in televisione fra la ruota e il
 * gioco bonus: un lampo, i raggi del colore del minigioco che girano, e
 * l'insegna con le lampadine e il nome che salta fuori. A meta' la scena sotto
 * cambia, coperta dall'insegna; poi l'insegna vola via verso chi guarda.
 */
export function Intermezzo({
  dati,
  onMezzo,
  onFine,
}: {
  dati: DatiIntermezzo | null
  onMezzo: () => void
  onFine: () => void
}) {
  const attuali = useRef({ onMezzo, onFine })
  useEffect(() => {
    attuali.current = { onMezzo, onFine }
  })
  const chiave = dati?.chiave
  useEffect(() => {
    if (chiave === undefined) return
    const ridotto = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    suona('intermezzo')
    const mezzo = window.setTimeout(() => attuali.current.onMezzo(), ridotto ? 0 : MEZZO_MS)
    const fine = window.setTimeout(() => attuali.current.onFine(), ridotto ? 900 : INTERMEZZO_MS)
    return () => {
      window.clearTimeout(mezzo)
      window.clearTimeout(fine)
    }
  }, [chiave])
  if (!dati) return null
  return (
    <div
      key={dati.chiave}
      className="ct-intermezzo"
      style={{ '--colore': dati.colore, '--durata': `${INTERMEZZO_MS}ms` } as CSSProperties}
      role="status"
    >
      <span className="ct-intermezzo__velo" aria-hidden="true" />
      <span className="ct-intermezzo__raggi" aria-hidden="true" />
      <span className="ct-intermezzo__lampo" aria-hidden="true" />
      <div className="ct-intermezzo__insegna">
        {dati.icona && (
          <span className="ct-intermezzo__icona" aria-hidden="true">
            {dati.icona}
          </span>
        )}
        <span className="ct-intermezzo__titolo">{dati.titolo}</span>
        {dati.sotto && <span className="ct-intermezzo__sotto">{dati.sotto}</span>}
      </div>
    </div>
  )
}

/** Quanto dura la pioggia, dalla prima moneta all'ultima che esce dallo schermo. */
export const PIOGGIA_MS = 2_600

/**
 * Le monete d'oro di una vincita, che piovono dall'alto girando su se stesse.
 * Stanno nel body, sopra tutto, come i coriandoli; con il movimento ridotto non
 * ci sono.
 */
export function PioggiaDiMonete({ quante = 42 }: { quante?: number }) {
  const [monete] = useState(() =>
    Array.from({ length: quante }, () => ({
      x: `${Math.random() * 100}vw`,
      deriva: `${(Math.random() - 0.5) * 24}vw`,
      lato: `${16 + Math.random() * 16}px`,
      ritardo: `${Math.random() * 700}ms`,
      durata: `${1_300 + Math.random() * 600}ms`,
      giro: `${380 + Math.random() * 420}ms`,
    })),
  )
  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="ct-pioggia" aria-hidden="true">
      {monete.map((m, i) => (
        <span
          key={i}
          className="ct-pioggia__moneta"
          style={
            {
              '--x': m.x,
              '--deriva': m.deriva,
              '--lato': m.lato,
              '--ritardo': m.ritardo,
              '--durata': m.durata,
              '--giro': m.giro,
            } as CSSProperties
          }
        >
          <span className="ct-pioggia__faccia" />
        </span>
      ))}
    </div>,
    document.body,
  )
}

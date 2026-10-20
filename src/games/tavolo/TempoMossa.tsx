import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { suona } from '@/lib/suoni'
import './TempoMossa.css'

/**
 * Quanto resta fino a `scadenza` (un istante dell'orologio del telefono),
 * aggiornato dieci volte al secondo; null senza scadenza. `onScaduto` arriva
 * una volta sola per scadenza, quando il tempo e' finito.
 */
export function useRestante(scadenza: number | null, onScaduto?: () => void): number | null {
  const [adesso, setAdesso] = useState(() => Date.now())
  const avvisata = useRef<number | null>(null)
  const avvisa = useRef(onScaduto)
  avvisa.current = onScaduto

  useEffect(() => {
    if (scadenza === null) return
    const giro = () => {
      const ora = Date.now()
      setAdesso(ora)
      if (ora >= scadenza && avvisata.current !== scadenza) {
        avvisata.current = scadenza
        avvisa.current?.()
      }
    }
    giro()
    const id = window.setInterval(giro, 100)
    return () => window.clearInterval(id)
  }, [scadenza])

  return scadenza === null ? null : Math.max(0, scadenza - adesso)
}

/** La circonferenza dell'anello, nel suo disegno di 44: il tratto pieno, e quanto ne resta. */
const GIRO = 2 * Math.PI * 18

/**
 * Il tempo della mossa: una barra che si svuota e i secondi che restano, o
 * (`forma="anello"`, nelle righe dei tavolieri) un anello attorno ai secondi.
 * Negli ultimi tre si fa rosso, e se il tempo e' mio ogni secondo batte.
 */
export function TempoMossa({
  scadenza,
  totaleMs,
  mio,
  onScaduto,
  forma = 'barra',
}: {
  scadenza: number
  totaleMs: number
  mio: boolean
  onScaduto?: () => void
  forma?: 'barra' | 'anello'
}) {
  const restante = useRestante(scadenza, onScaduto) ?? 0
  const secondi = Math.ceil(restante / 1_000)
  const poco = secondi <= 3

  const ultimo = useRef(secondi)
  useEffect(() => {
    if (secondi === ultimo.current) return
    ultimo.current = secondi
    if (mio && secondi > 0 && secondi <= 3) suona('tic')
  }, [mio, secondi])

  const quota = Math.min(1, restante / totaleMs)
  if (forma === 'anello') {
    return (
      <span
        className={`tempo-anello${poco ? ' is-poco' : ''}`}
        role="timer"
        aria-label={`${secondi} ${secondi === 1 ? 'secondo' : 'secondi'}`}
      >
        <svg viewBox="0 0 44 44" aria-hidden="true">
          <circle className="tempo-anello__fondo" cx="22" cy="22" r="18" />
          <circle
            className="tempo-anello__tempo"
            cx="22"
            cy="22"
            r="18"
            strokeDasharray={GIRO}
            strokeDashoffset={GIRO * (1 - quota)}
          />
        </svg>
        <span className="tempo-anello__secondi u-tabnum" aria-hidden="true">
          {secondi}
        </span>
      </span>
    )
  }

  return (
    <span
      className={`tempo-mossa${poco ? ' is-poco' : ''}`}
      role="timer"
      aria-label={`${secondi} ${secondi === 1 ? 'secondo' : 'secondi'}`}
      style={{ '--quota': quota } as CSSProperties}
    >
      <span className="tempo-mossa__pista" aria-hidden="true">
        <span className="tempo-mossa__barra" />
      </span>
      <span className="tempo-mossa__secondi u-tabnum" aria-hidden="true">
        {secondi}
      </span>
    </span>
  )
}

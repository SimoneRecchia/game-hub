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

/**
 * Il tempo della mossa: una barra che si svuota e i secondi che restano. Negli
 * ultimi tre si fa rossa, e se il tempo e' mio ogni secondo batte.
 */
export function TempoMossa({
  scadenza,
  totaleMs,
  mio,
  onScaduto,
}: {
  scadenza: number
  totaleMs: number
  mio: boolean
  onScaduto?: () => void
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

  return (
    <span
      className={`tempo-mossa${poco ? ' is-poco' : ''}`}
      role="timer"
      aria-label={`${secondi} ${secondi === 1 ? 'secondo' : 'secondi'}`}
      style={{ '--quota': Math.min(1, restante / totaleMs) } as CSSProperties}
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

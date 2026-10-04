import { useEffect, useRef, type CSSProperties } from 'react'
import { formatCronometro } from '@/lib/format'
import { suona } from '@/lib/suoni'

/** Da quando la matita si fa rossa. */
const POCO_S = 20
/** Da quando i secondi battono, e il foglio pulsa. */
export const URGENTE_S = 10
/** Gli ultimi secondi si sentono. */
const BATTITI_S = 5

/**
 * Il tempo della partita: una matita che si consuma. La punta resta a destra,
 * dove scrive, e il corpo si accorcia dalla parte della gomma. Con poco tempo
 * la matita si fa rossa e trema; negli ultimi dieci secondi i secondi battono,
 * uno alla volta, e gli ultimi cinque si sentono.
 */
export function Matita({ restante, totaleMs }: { restante: number; totaleMs: number }) {
  const secondi = Math.ceil(restante / 1_000)
  const poco = secondi <= POCO_S
  const urgente = secondi <= URGENTE_S

  const ultimo = useRef(secondi)
  useEffect(() => {
    if (secondi === ultimo.current) return
    ultimo.current = secondi
    if (secondi > 0 && secondi <= BATTITI_S) suona('tic', { volume: secondi <= 3 ? 1.2 : 0.9 })
    if (secondi === 0) suona('scaduto')
  }, [secondi])

  return (
    <div
      className={`matita${poco ? ' is-poco' : ''}${urgente ? ' is-urgente' : ''}`}
      role="timer"
      aria-label={`Restano ${formatCronometro(restante)}`}
      style={{ '--quota': Math.min(1, restante / totaleMs) } as CSSProperties}
    >
      <span className="matita__pista" aria-hidden="true">
        <span className="matita__corpo">
          <span className="matita__gomma" />
          <span className="matita__ghiera" />
          <span className="matita__legno" />
          <span className="matita__punta" />
        </span>
      </span>
      {/* Negli ultimi secondi ogni secondo e' un elemento nuovo: il battito riparte. */}
      <span key={urgente ? secondi : 'tempo'} className="matita__tempo u-tabnum" aria-hidden="true">
        {formatCronometro(restante + 999)}
      </span>
    </div>
  )
}

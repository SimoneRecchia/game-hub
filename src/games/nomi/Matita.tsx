import { useEffect, useRef, type CSSProperties } from 'react'
import { useRestante } from '@/games/tavolo/TempoMossa'
import { formatCronometro } from '@/lib/format'
import { suona } from '@/lib/suoni'

/** Da quando il tempo si fa rosso. */
const POCO_S = 20
/** Gli ultimi secondi battono. */
const BATTITI_S = 5

/**
 * Il tempo della partita: una matita che si consuma. La punta resta a destra,
 * dove scrive, e il corpo si accorcia dalla parte della gomma; con poco tempo
 * la matita si fa rossa, e gli ultimi secondi battono.
 */
export function Matita({
  scadenza,
  totaleMs,
  onScaduto,
}: {
  scadenza: number
  totaleMs: number
  onScaduto?: () => void
}) {
  const restante = useRestante(scadenza, onScaduto) ?? 0
  const secondi = Math.ceil(restante / 1_000)
  const poco = secondi <= POCO_S

  const ultimo = useRef(secondi)
  useEffect(() => {
    if (secondi === ultimo.current) return
    ultimo.current = secondi
    if (secondi > 0 && secondi <= BATTITI_S) suona('tic')
    if (secondi === 0) suona('scaduto')
  }, [secondi])

  return (
    <div
      className={`matita${poco ? ' is-poco' : ''}`}
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
      <span className="matita__tempo u-tabnum" aria-hidden="true">
        {formatCronometro(restante + 999)}
      </span>
    </div>
  )
}

import type { PlayerStats } from '@shared/types'
import { formatNumber, formatPercent } from '@/lib/format'
import './StatsPanel.css'

interface Props {
  stats: PlayerStats
  /** Tentativi dell'ultima partita: la barra corrispondente viene evidenziata. */
  highlight?: number | null
}

export function StatsPanel({ stats, highlight = null }: Props) {
  const peak = Math.max(1, ...stats.distribution)

  return (
    <div className="stats">
      <div className="stats__figures">
        <Figure value={formatNumber(stats.played)} label="Giocate" />
        <Figure value={formatPercent(stats.winRate)} label="Vinte" />
        <Figure value={formatNumber(stats.currentStreak)} label="Di fila" />
        <Figure value={formatNumber(stats.bestStreak)} label="Record" />
      </div>

      <div className="stats__block">
        <h3 className="stats__title">Distribuzione dei tentativi</h3>
        {stats.wins === 0 ? (
          <p className="stats__empty">Nessuna partita vinta, per ora.</p>
        ) : (
          <ul className="stats__bars">
            {stats.distribution.map((count, index) => (
              <li className="stats__bar-row" key={index}>
                <span className="stats__bar-label">{index + 1}</span>
                <span className="stats__bar-track">
                  <span
                    className={`stats__bar${highlight === index + 1 ? ' is-current' : ''}`}
                    /* Minimo 8% così anche un valore basso resta leggibile. */
                    style={{ width: `${Math.max(8, (count / peak) * 100)}%` }}
                  >
                    {count}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="stats__block stats__block--row">
        <span className="stats__meta">
          Punti totali <strong>{formatNumber(stats.totalScore)}</strong>
        </span>
        {stats.avgAttempts !== null && (
          <span className="stats__meta">
            Media tentativi <strong>{stats.avgAttempts.toFixed(2)}</strong>
          </span>
        )}
      </div>

      {/* La divisione del totale, quando c'e' qualcosa da dividere: e' lo stesso
          numero della classifica, e senza la riga sembrerebbe un'altra cosa. */}
      {stats.assistScore > 0 && (
        <div className="stats__block stats__block--row">
          <span className="stats__meta">
            Da solo <strong>{formatNumber(stats.playScore)}</strong>
          </span>
          <span className="stats__meta">
            In compagnia <strong>{formatNumber(stats.assistScore)}</strong>
          </span>
        </div>
      )}
    </div>
  )
}

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <div className="stats__figure">
      <span className="stats__figure-value u-tabnum">{value}</span>
      <span className="stats__figure-label">{label}</span>
    </div>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { AppShell } from '@/components/AppShell'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { SegmentedControl } from '@/components/SegmentedControl'
import { ThemeButton } from '@/components/ThemeButton'
import { IconFlame } from '@/components/Icons'
import { ApiFetchError, api } from '@/lib/api'
import { usePlayer } from '@/lib/auth'
import { formatNumber, formatPercent } from '@/lib/format'
import type { LeaderboardResponse, LeaderboardRow, LeaderboardScope } from '@shared/types'
import './Classifica.css'

/** Il periodo "month" esiste nell'API ma qui tre voci bastano e stanno larghe. */
const SCOPES: { value: LeaderboardScope; label: string }[] = [
  { value: 'today', label: 'Oggi' },
  { value: 'week', label: 'Settimana' },
  { value: 'all', label: 'Sempre' },
]

export default function Classifica() {
  const me = usePlayer()
  const [scope, setScope] = useState<LeaderboardScope>('today')
  const [data, setData] = useState<LeaderboardResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(
    async (which: LeaderboardScope) => {
      setLoading(true)
      setError(null)
      try {
        setData(await api<LeaderboardResponse>(`/leaderboard?scope=${which}`))
      } catch (err) {
        setError(
          err instanceof ApiFetchError ? err.message : 'Non riesco a caricare la classifica.',
        )
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  useEffect(() => {
    void load(scope)
  }, [load, scope])

  const rows = data?.rows ?? []
  const podium = rows.slice(0, 3)
  const rest = rows.slice(3)
  // Se il giocatore e' fuori dalle prime posizioni gli si mostra comunque la sua riga.
  const meOutside = data?.me && data.me.rank > 3 ? data.me : null

  return (
    <AppShell title="Classifica" trailing={<ThemeButton />}>
      <header>
        <h2 className="large-title">Classifica</h2>
        <p className="page-lede">
          Il punteggio dipende soprattutto dai tentativi usati. Velocità e giorni di fila valgono
          qualche punto in più.
        </p>
      </header>

      <SegmentedControl
        ariaLabel="Periodo della classifica"
        options={SCOPES}
        value={scope}
        onChange={setScope}
      />

      {error ? (
        <div className="lb__fallback">
          <p>{error}</p>
          <Button variant="tinted" onClick={() => void load(scope)}>
            Riprova
          </Button>
        </div>
      ) : loading && !data ? (
        <ul className="lb__skeleton" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <li key={i} />
          ))}
        </ul>
      ) : rows.length === 0 ? (
        <div className="lb__fallback">
          <p>
            {scope === 'today'
              ? 'Nessuno ha ancora giocato oggi. Puoi essere il primo.'
              : 'Ancora nessuna partita in questo periodo.'}
          </p>
        </div>
      ) : (
        <>
          {podium.length >= 2 && <Podium rows={podium} meId={me.id} scope={scope} />}

          <ol className="lb__list">
            {(podium.length >= 2 ? rest : rows).map((row) => (
              <Row key={row.playerId} row={row} scope={scope} isMe={row.playerId === me.id} />
            ))}
          </ol>

          {meOutside && !rest.some((r) => r.playerId === me.id) && (
            <>
              <p className="lb__divider">La tua posizione</p>
              <ol className="lb__list">
                <Row row={meOutside} scope={scope} isMe />
              </ol>
            </>
          )}
        </>
      )}
    </AppShell>
  )
}

/**
 * Podio: il primo al centro e più alto, come sul podio vero.
 * Con meno di due giocatori non ha senso e si mostra solo l'elenco.
 */
function Podium({
  rows,
  meId,
  scope,
}: {
  rows: LeaderboardRow[]
  meId: string
  scope: LeaderboardScope
}) {
  const [first, second, third] = rows
  const order = [second, first, third].filter(Boolean)

  return (
    <div className="podium">
      {order.map((row) => (
        <div
          key={row.playerId}
          className={`podium__slot podium__slot--${row.rank}${row.playerId === meId ? ' is-me' : ''}`}
        >
          <Avatar
            nickname={row.nickname}
            color={row.avatarColor}
            size={row.rank === 1 ? 64 : 52}
            medal={row.rank as 1 | 2 | 3}
          />
          <span className="podium__name">
            {row.displayName}
            {row.playerId === meId && <span className="lb__you">tu</span>}
          </span>
          <span className="podium__score u-tabnum">{formatNumber(row.score)}</span>
          {/* Le stesse informazioni delle righe sotto: senza, i primi tre
              risulterebbero piu' poveri di chi li segue. */}
          <span className="podium__detail">{describeShort(row, scope)}</span>
          <span className="podium__foot">
            <span className="podium__rank">{row.rank}º</span>
            {row.currentStreak >= 2 && (
              <span className="podium__streak" title={`${row.currentStreak} giorni di fila`}>
                <IconFlame size={12} />
                {row.currentStreak}
              </span>
            )}
          </span>
        </div>
      ))}
    </div>
  )
}

function Row({
  row,
  scope,
  isMe,
}: {
  row: LeaderboardRow
  scope: LeaderboardScope
  isMe: boolean
}) {
  return (
    <li className={`lb__row${isMe ? ' is-me' : ''}`}>
      <span className="lb__rank u-tabnum">{row.rank}</span>
      <Avatar nickname={row.nickname} color={row.avatarColor} size={36} />
      <span className="lb__body">
        <span className="lb__name">
          {row.displayName}
          {isMe && <span className="lb__you">tu</span>}
        </span>
        <span className="lb__meta">{describe(row, scope)}</span>
      </span>
      {row.currentStreak >= 2 && (
        <span className="lb__streak" title={`${row.currentStreak} giorni di fila`}>
          <IconFlame size={14} />
          {row.currentStreak}
        </span>
      )}
      <span className="lb__score u-tabnum">{formatNumber(row.score)}</span>
    </li>
  )
}

/** Versione compatta del dettaglio: nel podio c'e' un terzo della larghezza. */
function describeShort(row: LeaderboardRow, scope: LeaderboardScope): string {
  if (scope === 'today') {
    if (row.todayStatus === 'won') {
      return `${row.todayAttempts} ${row.todayAttempts === 1 ? 'tentativo' : 'tentativi'}`
    }
    if (row.todayStatus === 'lost') return 'non indovinata'
    if (row.todayStatus === 'playing') return 'in corso'
    return '—'
  }
  return `${formatNumber(row.played)} ${row.played === 1 ? 'partita' : 'partite'}`
}

/** Riga di dettaglio sotto il nome: cambia con il periodo scelto. */
function describe(row: LeaderboardRow, scope: LeaderboardScope): string {
  if (scope === 'today') {
    // Chi ha guardato la partita di un altro conosceva la parola: spiegare lo
    // zero e' meglio che lasciarlo sembrare un errore di calcolo.
    const visto = row.todaySpectated ? ' · ha guardato, niente punti' : ''
    if (row.todayStatus === 'won') return `Indovinata al ${row.todayAttempts}º tentativo${visto}`
    if (row.todayStatus === 'lost') return `Non indovinata${visto}`
    if (row.todayStatus === 'playing') {
      const base =
        row.todayAttempts === 0 ? 'Ha appena iniziato' : `In corso · ${row.todayAttempts} tentativi`
      return base + visto
    }
    return 'Non ha ancora giocato'
  }

  const parts = [`${formatNumber(row.played)} ${row.played === 1 ? 'partita' : 'partite'}`]
  if (row.played > 0) parts.push(`${formatPercent(row.wins / row.played)} vinte`)
  if (row.avgAttempts !== null) parts.push(`media ${row.avgAttempts.toFixed(1)}`)
  return parts.join(' · ')
}

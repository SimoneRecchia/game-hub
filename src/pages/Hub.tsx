import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { Avatar } from '@/components/Avatar'
import { IconChevronRight, IconFlame, IconTrophy } from '@/components/Icons'
import { ThemeButton } from '@/components/ThemeButton'
import { wordleBadge } from '@/games/wordle/hubStatus'
import { GAMES } from '@/games/catalog'
import { api } from '@/lib/api'
import { usePlayer } from '@/lib/auth'
import { formatGameDate, formatNumber } from '@/lib/format'
import { gameDate } from '@shared/daily'
import type { LeaderboardResponse, WordleSummary } from '@shared/types'
import './Hub.css'

export default function Hub() {
  const player = usePlayer()
  const today = gameDate()
  const [summary, setSummary] = useState<WordleSummary | null>(null)
  const [standing, setStanding] = useState<LeaderboardResponse | null>(null)

  useEffect(() => {
    let cancelled = false
    // Due richieste indipendenti: se una fallisce l'altra si vede comunque,
    // e la card del gioco resta cliccabile in ogni caso.
    void api<WordleSummary>('/wordle/summary')
      .then((s) => !cancelled && setSummary(s))
      .catch(() => {})
    void api<LeaderboardResponse>('/leaderboard?scope=today')
      .then((s) => !cancelled && setStanding(s))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const available = GAMES.filter((g) => g.available)
  const upcoming = GAMES.filter((g) => !g.available)
  const badge = summary ? wordleBadge(summary) : null
  const me = standing?.me ?? null

  return (
    <AppShell
      title="Game Hub"
      trailing={<ThemeButton />}
      leading={
        <Link to="/profilo" className="hub__me" aria-label="Il tuo profilo">
          <Avatar nickname={player.nickname} color={player.avatarColor} size={30} />
        </Link>
      }
    >
      <header className="hub__header">
        <p className="hub__date">{formatGameDate(today)}</p>
        <h2 className="large-title">Ciao {player.displayName}</h2>
        <p className="page-lede">
          Una sfida nuova ogni giorno, la stessa per tutti. Il punteggio finisce in classifica.
        </p>
      </header>

      {me && me.played > 0 && (
        <Link to="/classifica" className="hub__standing">
          <span className="hub__standing-rank">
            <IconTrophy size={18} />
            {me.rank}º
          </span>
          <span className="hub__standing-body">
            <span className="hub__standing-title">
              {me.rank === 1 ? 'Sei in testa oggi' : `${me.rank}º posto oggi`}
            </span>
            <span className="hub__standing-sub">
              {formatNumber(me.score)} punti · {standing?.rows.length} in gara
            </span>
          </span>
          {me.currentStreak >= 2 && (
            <span className="hub__standing-streak">
              <IconFlame size={14} />
              {me.currentStreak}
            </span>
          )}
          <IconChevronRight size={18} className="gamecard__chevron" />
        </Link>
      )}

      <ul className="hub__grid">
        {available.map((game) => (
          <li key={game.id}>
            <Link to={game.path ?? '/'} className="gamecard">
              <span
                className="gamecard__icon"
                style={{
                  background: `linear-gradient(150deg, ${game.gradient[0]}, ${game.gradient[1]})`,
                }}
                aria-hidden="true"
              >
                {game.glyph}
              </span>
              <span className="gamecard__body">
                <span className="gamecard__name">{game.name}</span>
                <span className="gamecard__tagline">{game.tagline}</span>
                {badge && game.id === 'wordle' && (
                  <span className={`gamecard__status gamecard__status--${badge.tone}`}>
                    {badge.text}
                  </span>
                )}
              </span>
              <IconChevronRight size={20} className="gamecard__chevron" />
            </Link>
          </li>
        ))}
      </ul>

      {upcoming.length > 0 && (
        <section className="hub__soon">
          <h3 className="card-group__title">Prossimamente</h3>
          <ul className="hub__grid">
            {upcoming.map((game) => (
              <li key={game.id}>
                <div className="gamecard gamecard--soon" aria-disabled="true">
                  <span
                    className="gamecard__icon"
                    style={{
                      background: `linear-gradient(150deg, ${game.gradient[0]}, ${game.gradient[1]})`,
                    }}
                    aria-hidden="true"
                  >
                    {game.glyph}
                  </span>
                  <span className="gamecard__body">
                    <span className="gamecard__name">{game.name}</span>
                    <span className="gamecard__tagline">{game.tagline}</span>
                  </span>
                  <span className="gamecard__badge">In arrivo</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </AppShell>
  )
}

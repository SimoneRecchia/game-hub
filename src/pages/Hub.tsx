import { useEffect, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { Avatar } from '@/components/Avatar'
import { IconChevronRight, IconFlame, IconTrophy } from '@/components/Icons'
import { ThemeButton } from '@/components/ThemeButton'
import { wordleBadge, wordleHref } from '@/games/wordle/hubStatus'
import { scarabeoBadge } from '@/games/scarabeo/hubStatus'
import { cruciverbaBadge } from '@/games/cruciverba/hubStatus'
import { GAMES } from '@/games/catalog'
import { api } from '@/lib/api'
import { usePlayer } from '@/lib/auth'
import { formatGameDate, formatNumber } from '@/lib/format'
import { gameDate } from '@shared/daily'
import type {
  CruciverbaSummary,
  LeaderboardResponse,
  ScarabeoSummary,
  WordleSummary,
} from '@shared/types'
import './Hub.css'

export default function Hub() {
  const player = usePlayer()
  const today = gameDate()
  const [summary, setSummary] = useState<WordleSummary | null>(null)
  const [scarabeo, setScarabeo] = useState<ScarabeoSummary | null>(null)
  const [cruciverba, setCruciverba] = useState<CruciverbaSummary | null>(null)
  const [standing, setStanding] = useState<LeaderboardResponse | null>(null)

  useEffect(() => {
    let cancelled = false
    // Due richieste indipendenti: se una fallisce l'altra si vede comunque,
    // e la card del gioco resta cliccabile in ogni caso.
    void api<WordleSummary>('/wordle/summary')
      .then((s) => !cancelled && setSummary(s))
      .catch(() => {})
    void api<ScarabeoSummary>('/scarabeo/summary')
      .then((s) => !cancelled && setScarabeo(s))
      .catch(() => {})
    void api<CruciverbaSummary>('/cruciverba/summary')
      .then((s) => !cancelled && setCruciverba(s))
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
  const badgeScarabeo = scarabeo ? scarabeoBadge(scarabeo) : null
  const badgeCruciverba = cruciverba ? cruciverbaBadge(cruciverba) : null
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
          Tre giochi al giorno, gli stessi per tutti: cinque parole, un tabellone di Scarabeo e
          un cruciverba.
        </p>
      </header>

      {/* `assists` conta le giornate giocate in compagnia: chi ha solo quelle ha
          `played` a zero ma un punteggio vero, e la card gli spetta. */}
      {me && (me.played > 0 || me.assists > 0) && (
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
            {/*
              Il gioco giocabile e' una card grande col suo gradiente, non una
              riga d'elenco: e' la prima cosa che si vede aprendo l'app, e da lì
              si capisce se questo e' un gioco o un pannello di impostazioni. I
              giochi non ancora disponibili restano righe quiete, così il
              contrasto dice da sé dove si tocca.
            */}
            <Link
              to={
                game.id === 'wordle' ? wordleHref(summary, game.path ?? '/') : (game.path ?? '/')
              }
              className="gamecard gamecard--hero"
              style={
                {
                  '--carta-1': game.gradient[0],
                  '--carta-2': game.gradient[1],
                } as CSSProperties
              }
            >
              <span className="gamecard__glifo" aria-hidden="true">
                {game.glyph}
              </span>
              <span className="gamecard__body">
                <span className="gamecard__name">{game.name}</span>
                <span className="gamecard__tagline">{game.tagline}</span>
              </span>
              {badgeScarabeo && game.id === 'scarabeo' && (
                <span className="gamecard__piede">
                  <span className={`gamecard__status gamecard__status--${badgeScarabeo.tone}`}>
                    {badgeScarabeo.text}
                  </span>
                  {/* Le dieci mosse come pallini: a che punto e' la giornata,
                      senza leggere un numero. */}
                  {scarabeo && (
                    <span
                      className="gamecard__pallini"
                      aria-label={`${scarabeo.mosseUsate} mosse su ${scarabeo.mosseTotali}`}
                    >
                      {Array.from({ length: scarabeo.mosseTotali }, (_, i) => (
                        <span
                          key={i}
                          className={`gamecard__pallino${i < scarabeo.mosseUsate ? ' is-fatta' : ''}`}
                        />
                      ))}
                    </span>
                  )}
                </span>
              )}
              {badgeCruciverba && cruciverba && game.id === 'cruciverba' && (
                <span className="gamecard__piede">
                  <span className={`gamecard__status gamecard__status--${badgeCruciverba.tone}`}>
                    {badgeCruciverba.text}
                  </span>
                  {/* Quanta griglia e' scritta: una barra, perché le caselle
                      sono ottanta e i pallini non si contano. */}
                  {cruciverba.bianche > 0 && (
                    <span
                      className="gamecard__barra"
                      aria-label={`${cruciverba.scritte} caselle su ${cruciverba.bianche}`}
                    >
                      <span
                        className="gamecard__barra-piena"
                        style={{
                          width: `${Math.round((cruciverba.scritte / cruciverba.bianche) * 100)}%`,
                        }}
                      />
                    </span>
                  )}
                </span>
              )}
              {badge && game.id === 'wordle' && (
                <span className="gamecard__piede">
                  <span className={`gamecard__status gamecard__status--${badge.tone}`}>
                    {badge.text}
                  </span>
                  {/* Le cinque parole come pallini: quante sono e quante fatte,
                      senza dover leggere un numero. */}
                  {summary && (
                    <span
                      className="gamecard__pallini"
                      aria-label={`${summary.done} parole su ${summary.words}`}
                    >
                      {Array.from({ length: summary.words }, (_, i) => (
                        <span
                          key={i}
                          className={`gamecard__pallino${i < summary.done ? ' is-fatta' : ''}`}
                        />
                      ))}
                    </span>
                  )}
                </span>
              )}
              {/* Niente chevron: era un'affordance da riga d'elenco, e su una card
                  che occupa mezzo schermo con il suo colore non dice niente che
                  non sia già evidente. */}
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

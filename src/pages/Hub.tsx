import { Link } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { Avatar } from '@/components/Avatar'
import { IconChevronRight } from '@/components/Icons'
import { ThemeButton } from '@/components/ThemeButton'
import { GAMES } from '@/games/catalog'
import { formatGameDate } from '@/lib/format'
import { usePlayer } from '@/lib/auth'
import { gameDate } from '@shared/daily'
import './Hub.css'

export default function Hub() {
  const player = usePlayer()
  const today = gameDate()
  const available = GAMES.filter((g) => g.available)
  const upcoming = GAMES.filter((g) => !g.available)

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

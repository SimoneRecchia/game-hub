import { NavLink, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { IconGames, IconPerson, IconTrophy } from './Icons'
import './AppShell.css'

interface Tab {
  to: string
  label: string
  Icon: typeof IconGames
}

const TABS: Tab[] = [
  { to: '/', label: 'Giochi', Icon: IconGames },
  { to: '/classifica', label: 'Classifica', Icon: IconTrophy },
  { to: '/profilo', label: 'Profilo', Icon: IconPerson },
]

interface Props {
  /** Titolo mostrato nella barra traslucida in alto. */
  title: string
  /** Azione a destra nella nav bar (es. info, condividi). */
  trailing?: ReactNode
  /** Azione a sinistra (es. indietro). Se assente mostra il wordmark. */
  leading?: ReactNode
  /** Nasconde la tab bar: usato dal gioco a tutto schermo. */
  hideTabBar?: boolean
  /**
   * Contenuto piu' largo su desktop: il cruciverba mette le definizioni
   * accanto alla griglia, e in 720 punti le due cose non stanno.
   */
  wide?: boolean
  children: ReactNode
}

export function AppShell({ title, trailing, leading, hideTabBar = false, wide = false, children }: Props) {
  const { pathname } = useLocation()

  return (
    <div className={`shell${hideTabBar ? ' shell--no-tabs' : ''}${wide ? ' shell--wide' : ''}`}>
      <header className="navbar">
        <div className="navbar__inner">
          <div className="navbar__side navbar__side--leading">{leading}</div>
          <h1 className="navbar__title">{title}</h1>
          <div className="navbar__side navbar__side--trailing">{trailing}</div>
        </div>

        {/* Su desktop i tab vivono nella barra in alto: niente tab bar mobile. */}
        {!hideTabBar && (
          <nav className="navtabs" aria-label="Sezioni">
            {TABS.map(({ to, label, Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) => `navtabs__item${isActive ? ' is-active' : ''}`}
              >
                <Icon size={18} />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>
        )}
      </header>

      <main className="shell__main">{children}</main>

      {!hideTabBar && (
        <nav className="tabbar" aria-label="Sezioni">
          {TABS.map(({ to, label, Icon }) => {
            const isActive = to === '/' ? pathname === '/' : pathname.startsWith(to)
            return (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={`tabbar__item${isActive ? ' is-active' : ''}`}
              >
                <Icon size={25} />
                <span className="tabbar__label">{label}</span>
              </NavLink>
            )
          })}
        </nav>
      )}
    </div>
  )
}

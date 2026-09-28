import { useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { Collegamento } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { GIOCHI, GIOCHI_DA_TAVOLO } from '@/games/catalog'
import { usePlayer } from '@/lib/auth'
import { Avatar } from './Avatar'
import { Copertina } from './Copertina'
import {
  IconGames,
  IconGamesFill,
  IconPerson,
  IconPersonFill,
  IconTrophy,
  IconTrophyFill,
} from './Icons'
import './Shell.css'

interface Scheda {
  a: string
  nome: string
  Icona: typeof IconGames
  IconaPiena: typeof IconGames
  /** Le rotte che appartengono a questa sezione, oltre alla sua. */
  sotto: (percorso: string) => boolean
}

const PERCORSI_GIOCHI = [...GIOCHI.map((g) => ROTTE.gioco(g.id)), ...GIOCHI_DA_TAVOLO.map((g) => `/${g.slug}`)]

const SCHEDE: Scheda[] = [
  {
    a: ROTTE.home,
    nome: 'Giochi',
    Icona: IconGames,
    IconaPiena: IconGamesFill,
    sotto: (p) => p === '/' || PERCORSI_GIOCHI.some((g) => p === g || p.startsWith(`${g}/`)),
  },
  {
    a: ROTTE.classifica(),
    nome: 'Classifica',
    Icona: IconTrophy,
    IconaPiena: IconTrophyFill,
    sotto: (p) => p.startsWith('/classifica'),
  },
  {
    a: ROTTE.profilo,
    nome: 'Profilo',
    Icona: IconPerson,
    IconaPiena: IconPersonFill,
    sotto: (p) => p.startsWith('/profilo'),
  },
]

/**
 * Il guscio dell'app: le sezioni e il contenuto.
 *
 * Sul telefono le sezioni sono una tab bar che **galleggia** sopra il
 * contenuto, una capsula di vetro staccata dal bordo, e la lente sotto la
 * sezione aperta scivola da una all'altra. Su un computer diventano una barra
 * laterale, come nelle app del Mac, con i giochi a portata di clic.
 *
 * Nelle schermate di gioco le sezioni spariscono del tutto: si gioca a schermo
 * intero, e si esce col tasto indietro della schermata. Lo decide il CSS con
 * `:has(.pagina--intera)`, quindi una schermata non deve avvisare nessuno.
 */
export function Shell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const attiva = Math.max(
    0,
    SCHEDE.findIndex((s) => s.sotto(pathname)),
  )

  return (
    <div className="shell">
      <BarraLaterale pathname={pathname} attiva={attiva} />
      <div className="shell__contenuto">{children}</div>
      <nav className="tabbar" aria-label="Sezioni">
        <span className="tabbar__lente" style={{ transform: `translateX(${attiva * 100}%)` }} aria-hidden="true" />
        {SCHEDE.map((s, i) => {
          const Icona = i === attiva ? s.IconaPiena : s.Icona
          return (
            <Collegamento
              key={s.a}
              to={s.a}
              direzione="scheda"
              className={`tabbar__voce${i === attiva ? ' is-attiva' : ''}`}
              aria-current={i === attiva ? 'page' : undefined}
            >
              <Icona size={24} />
              <span className="tabbar__nome">{s.nome}</span>
            </Collegamento>
          )
        })}
      </nav>
    </div>
  )
}

function BarraLaterale({ pathname, attiva }: { pathname: string; attiva: number }) {
  const player = usePlayer()
  return (
    <aside className="laterale" aria-label="Sezioni">
      <Collegamento to={ROTTE.home} direzione="scheda" className="laterale__marchio">
        <img src="/icon.svg" alt="" width={30} height={30} />
        <span>Giochi</span>
      </Collegamento>

      <nav className="laterale__voci">
        {SCHEDE.map((s, i) => {
          const Icona = i === attiva ? s.IconaPiena : s.Icona
          return (
            <Collegamento
              key={s.a}
              to={s.a}
              direzione="scheda"
              className={`laterale__voce${i === attiva ? ' is-attiva' : ''}`}
              aria-current={i === attiva ? 'page' : undefined}
            >
              <Icona size={20} />
              <span>{s.nome}</span>
            </Collegamento>
          )
        })}
      </nav>

      <p className="laterale__titolo">I giochi</p>
      <nav className="laterale__voci">
        {GIOCHI.map((g) => {
          const a = ROTTE.gioco(g.id)
          const dentro = pathname === a || pathname.startsWith(`${a}/`)
          return (
            <Collegamento
              key={g.id}
              to={a}
              direzione="scheda"
              className={`laterale__voce laterale__voce--gioco${dentro ? ' is-attiva' : ''}`}
            >
              <Copertina gioco={g.id} formato="icona" />
              <span>{g.nome}</span>
            </Collegamento>
          )
        })}
      </nav>

      <p className="laterale__titolo">Da tavolo</p>
      <nav className="laterale__voci">
        {GIOCHI_DA_TAVOLO.map((g) => {
          const a = `/${g.slug}`
          const dentro = pathname === a || pathname.startsWith(`${a}/`)
          return (
            <Collegamento
              key={g.id}
              to={a}
              direzione="scheda"
              className={`laterale__voce laterale__voce--gioco${dentro ? ' is-attiva' : ''}`}
            >
              <Copertina gioco={g.id} formato="icona" />
              <span>{g.nome}</span>
            </Collegamento>
          )
        })}
      </nav>

      <Collegamento to={ROTTE.profilo} direzione="scheda" className="laterale__io">
        <Avatar nickname={player.nickname} color={player.avatarColor} size={32} />
        <span className="laterale__io-nome">{player.displayName}</span>
      </Collegamento>
    </aside>
  )
}

import { useRef, type CSSProperties, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { Collegamento } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { GIOCHI, GIOCHI_DA_TAVOLO } from '@/games/catalog'
import { usePlayer } from '@/lib/auth'
import { NOME_CRAZY_TIME } from '@shared/ruota'
import { NOME_SLOT } from '@shared/slot'
import { NOME_BLACKJACK } from '@shared/blackjack'
import { Avatar } from './Avatar'
import { Copertina } from './Copertina'
import {
  IconFortuna,
  IconFortunaFill,
  IconGiornaliere,
  IconGiornaliereFill,
  IconLibere,
  IconLibereFill,
} from './Icons'
import './Shell.css'

interface Scheda {
  a: string
  nome: string
  Icona: typeof IconFortuna
  IconaPiena: typeof IconFortuna
  /** Il colore della scheda: l'icona accesa e la lente sotto. */
  colore: string
  /** Le rotte che appartengono a questa sezione, oltre alla sua. */
  sotto: (percorso: string) => boolean
}

/** Il percorso e' questo, o una schermata sotto questo. */
const sotto = (percorso: string, radice: string) => percorso === radice || percorso.startsWith(`${radice}/`)

/** I giochi della Fortuna: si puntano i punti fatti oggi nelle classificate. */
const GIOCHI_FORTUNA = [
  { id: 'ruota', nome: NOME_CRAZY_TIME, a: ROTTE.ruota },
  { id: 'slot', nome: NOME_SLOT, a: ROTTE.slot },
  { id: 'blackjack', nome: NOME_BLACKJACK, a: ROTTE.blackjack },
] as const
const PERCORSI_FORTUNA = [ROTTE.fortuna, ...GIOCHI_FORTUNA.map((g) => g.a)]

/**
 * Le classificate di oggi e quel che ci gira intorno: le partite, quelle in
 * compagnia, la classifica (tranne quella della Fortuna). Viene prima delle
 * Libere, perché `/quiz/classificata` sta anche sotto `/quiz`.
 */
const delGiorno = (p: string) =>
  p === '/' ||
  GIOCHI.some((g) => sotto(p, ROTTE.classificata(g.id))) ||
  p.startsWith('/wordle/insieme/') ||
  (sotto(p, ROTTE.classifica()) && !sotto(p, ROTTE.classifica('fortuna')))

/**
 * Le tre schede: le Libere, con le partite che non contano, le Giornaliere al
 * centro, con le classificate di oggi, che sono la parte principale e la
 * pagina d'apertura, e la Fortuna. La classifica si apre dalle Giornaliere e
 * dalla Fortuna, il profilo dall'avatar in alto a destra: non sono schede, e
 * mentre li si guarda nessuna e' accesa.
 */
const SCHEDE: Scheda[] = [
  {
    a: ROTTE.libere,
    nome: 'Libere',
    Icona: IconLibere,
    IconaPiena: IconLibereFill,
    colore: 'var(--libere)',
    sotto: (p) =>
      !delGiorno(p) &&
      (sotto(p, ROTTE.libere) ||
        GIOCHI.some((g) => sotto(p, ROTTE.gioco(g.id))) ||
        GIOCHI_DA_TAVOLO.some((g) => sotto(p, `/${g.slug}`))),
  },
  {
    a: ROTTE.home,
    nome: 'Giornaliere',
    Icona: IconGiornaliere,
    IconaPiena: IconGiornaliereFill,
    colore: 'var(--giornaliere)',
    sotto: delGiorno,
  },
  {
    a: ROTTE.fortuna,
    nome: 'Fortuna',
    Icona: IconFortuna,
    IconaPiena: IconFortunaFill,
    colore: 'var(--fortuna)',
    sotto: (p) => PERCORSI_FORTUNA.some((g) => sotto(p, g)) || sotto(p, ROTTE.classifica('fortuna')),
  },
]

/** Dove sta la lente prima di aver visto una scheda: al centro, sulle Giornaliere. */
const DEL_GIORNO = SCHEDE.findIndex((s) => s.a === ROTTE.home)

/**
 * Il guscio dell'app: le sezioni e il contenuto.
 *
 * Sul telefono le sezioni sono una tab bar che **galleggia** sopra il
 * contenuto, una capsula di vetro staccata dal bordo, e la lente sotto la
 * sezione aperta scivola da una all'altra, nel colore della sezione. Su un
 * computer diventano una barra laterale, come nelle app del Mac, con i giochi
 * di ogni sezione a portata di clic.
 *
 * Nelle schermate di gioco le sezioni spariscono del tutto: si gioca a schermo
 * intero, e si esce col tasto indietro della schermata. Lo decide il CSS con
 * `:has(.pagina--intera)`, quindi una schermata non deve avvisare nessuno.
 */
export function Shell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  // Il profilo, un amico: nessuna scheda accesa, e la lente resta dov'era, spenta.
  const trovata = SCHEDE.findIndex((s) => s.sotto(pathname))
  const ultima = useRef(DEL_GIORNO)
  if (trovata >= 0) ultima.current = trovata
  const attiva = trovata
  const lente = { transform: `translateX(${ultima.current * 100}%)`, '--lente': SCHEDE[ultima.current].colore }

  return (
    <div className="shell">
      <BarraLaterale pathname={pathname} attiva={attiva} />
      <div className="shell__contenuto">{children}</div>
      <nav className="tabbar" aria-label="Sezioni">
        <span
          className={`tabbar__lente${attiva < 0 ? ' is-spenta' : ''}`}
          style={lente as CSSProperties}
          aria-hidden="true"
        />
        {SCHEDE.map((s, i) => {
          const Icona = i === attiva ? s.IconaPiena : s.Icona
          return (
            <Collegamento
              key={s.a}
              to={s.a}
              direzione="scheda"
              className={`tabbar__voce${i === attiva ? ' is-attiva' : ''}`}
              style={{ '--colore': s.colore } as CSSProperties}
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
        {/* L'impronta nell'indirizzo la scrive npm run icone. */}
        <img src="/icon.svg?v=cdd019ff" alt="" width={30} height={30} />
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
              style={{ '--colore': s.colore } as CSSProperties}
              aria-current={i === attiva ? 'page' : undefined}
            >
              <Icona size={20} />
              <span>{s.nome}</span>
            </Collegamento>
          )
        })}
      </nav>

      <p className="laterale__titolo">Libere</p>
      <nav className="laterale__voci">
        {GIOCHI_DA_TAVOLO.map((g) => {
          const a = `/${g.slug}`
          const dentro = sotto(pathname, a)
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

      <p className="laterale__titolo">Giornaliere</p>
      <nav className="laterale__voci">
        {GIOCHI.map((g) => {
          // Il gioco porta alla partita di oggi, e resta acceso in tutte le sue schermate.
          const dentro = sotto(pathname, ROTTE.classificata(g.id))
          return (
            <Collegamento
              key={g.id}
              to={ROTTE.classificata(g.id)}
              direzione="scheda"
              className={`laterale__voce laterale__voce--gioco${dentro ? ' is-attiva' : ''}`}
            >
              <Copertina gioco={g.id} formato="icona" />
              <span>{g.nome}</span>
            </Collegamento>
          )
        })}
      </nav>

      <p className="laterale__titolo">Fortuna</p>
      <nav className="laterale__voci">
        {GIOCHI_FORTUNA.map((g) => {
          const dentro = pathname === g.a || pathname.startsWith(`${g.a}/`)
          return (
            <Collegamento
              key={g.id}
              to={g.a}
              direzione="scheda"
              className={`laterale__voce laterale__voce--gioco${dentro ? ' is-attiva' : ''}`}
            >
              <Copertina gioco={g.id} formato="icona" />
              <span>{g.nome}</span>
            </Collegamento>
          )
        })}
      </nav>

      <Collegamento
        to={ROTTE.profilo}
        stato={{ da: SCHEDE[attiva]?.nome }}
        className={`laterale__io${sotto(pathname, ROTTE.profilo) ? ' is-attiva' : ''}`}
      >
        <Avatar nickname={player.nickname} color={player.avatarColor} size={32} />
        <span className="laterale__io-nome">{player.displayName}</span>
      </Collegamento>
    </aside>
  )
}

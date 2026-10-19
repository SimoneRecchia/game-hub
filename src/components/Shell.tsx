import { useId, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { MENU_LATERALE, PERCORSI_FORTUNA, delGiorno, sotto, type Famiglia } from '@/app/menu'
import { Collegamento } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { GIOCHI, GIOCHI_DA_TAVOLO } from '@/games/catalog'
import { usePlayer } from '@/lib/auth'
import { Avatar } from './Avatar'
import { Copertina } from './Copertina'
import {
  IconChevronRight,
  IconFortuna,
  IconFortunaFill,
  IconGiornaliere,
  IconGiornaliereFill,
  IconLibere,
  IconLibereFill,
  IconTrophy,
} from './Icons'
import './Shell.css'

interface Scheda {
  /** Il nome dei suoi token: la bolla della scheda accesa e il colore dell'icona sopra (`--bolla-<id>`). */
  id: 'libere' | 'giornaliere' | 'fortuna'
  a: string
  nome: string
  Icona: typeof IconFortuna
  IconaPiena: typeof IconFortuna
  /** Il colore della scheda: l'icona accesa e la lente sotto. */
  colore: string
  /** Le rotte che appartengono a questa sezione, oltre alla sua. */
  sotto: (percorso: string) => boolean
}


/**
 * Le tre schede: le Libere, con le partite che non contano, le Giornaliere al
 * centro, con le classificate di oggi, che sono la parte principale e la
 * pagina d'apertura, e la Fortuna. La classifica si apre dalle Giornaliere e
 * dalla Fortuna, il profilo dall'avatar in alto a destra: non sono schede, e
 * mentre li si guarda nessuna e' accesa.
 */
const SCHEDE: Scheda[] = [
  {
    id: 'libere',
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
    id: 'giornaliere',
    a: ROTTE.home,
    nome: 'Giornaliere',
    Icona: IconGiornaliere,
    IconaPiena: IconGiornaliereFill,
    colore: 'var(--giornaliere)',
    sotto: delGiorno,
  },
  {
    id: 'fortuna',
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
 * Il tocco sulla scheda gia' aperta la riporta in cima, come in iOS, invece di
 * aprirla un'altra volta. Da una schermata sotto la scheda porta alla scheda.
 */
function inCimaSeAperta(pathname: string, a: string) {
  return (evento: MouseEvent<HTMLAnchorElement>) => {
    const semplice = evento.button === 0 && !evento.metaKey && !evento.ctrlKey && !evento.shiftKey && !evento.altKey
    if (pathname !== a || !semplice) return
    evento.preventDefault()
    const ridotto = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: 0, behavior: ridotto ? 'auto' : 'smooth' })
  }
}

/** Le famiglie chiuse, per scheda e nome: restano chiuse anche riaprendo l'app. */
const CHIAVE_CHIUSE = 'laterale-chiuse'

function leggiChiuse(): Set<string> {
  try {
    const salvate: unknown = JSON.parse(localStorage.getItem(CHIAVE_CHIUSE) ?? '[]')
    return new Set(Array.isArray(salvate) ? salvate.filter((x): x is string => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

function useFamiglieChiuse(): [Set<string>, (chiave: string) => void] {
  const [chiuse, setChiuse] = useState(leggiChiuse)
  const cambia = (chiave: string) => {
    setChiuse((prima) => {
      const dopo = new Set(prima)
      if (!dopo.delete(chiave)) dopo.add(chiave)
      try {
        localStorage.setItem(CHIAVE_CHIUSE, JSON.stringify([...dopo]))
      } catch {
        // Senza il localStorage le famiglie si richiudono a ogni avvio: niente di grave.
      }
      return dopo
    })
  }
  return [chiuse, cambia]
}

/**
 * Il guscio dell'app: le sezioni e il contenuto.
 *
 * Sul telefono le sezioni sono una tab bar che **galleggia** sopra il
 * contenuto, una capsula di vetro staccata dal bordo, e la lente sotto la
 * sezione aperta scivola da una all'altra, nel colore della sezione. Su un
 * computer la stessa capsula fa da dock, in basso al centro del contenuto, e a
 * sinistra c'e' il menu della sezione aperta: i suoi giochi nelle famiglie
 * delle Libere, che si chiudono con la chevron, e toccandone uno si apre al
 * centro la sua configurazione. Prima il menu aveva insieme le sezioni e i
 * giochi di tutte e tre, con le libere dei giochi classificati che mancavano,
 * e non si capiva che cosa fosse che cosa.
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
  const accesa = SCHEDE[ultima.current]
  const lente = {
    transform: `translateX(${ultima.current * 100}%)`,
    '--lente': accesa.colore,
    '--bolla': `var(--bolla-${accesa.id})`,
  }

  return (
    <div className="shell">
      <BarraLaterale pathname={pathname} scheda={SCHEDE[ultima.current]} />
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
              onClick={inCimaSeAperta(pathname, s.a)}
              className={`tabbar__voce${i === attiva ? ' is-attiva' : ''}`}
              style={{ '--colore': s.colore, '--bolla-ink': `var(--bolla-${s.id}-ink)` } as CSSProperties}
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

/**
 * Il menu laterale del computer: la sezione aperta (o l'ultima, sul profilo),
 * con le sue famiglie e i loro giochi, e in fondo chi sono.
 */
function BarraLaterale({ pathname, scheda }: { pathname: string; scheda: Scheda }) {
  const player = usePlayer()
  const [chiuse, cambia] = useFamiglieChiuse()
  const menu = MENU_LATERALE[scheda.a]
  // La classifica della Fortuna sta anche sotto /classifica: nelle Giornaliere non accende quella generale.
  const classificaAccesa =
    menu.classifica !== undefined &&
    sotto(pathname, menu.classifica) &&
    (scheda.a === ROTTE.fortuna || !sotto(pathname, ROTTE.classifica('fortuna')))
  return (
    <aside
      className="laterale"
      aria-label={`Giochi: ${scheda.nome}`}
      style={{ '--colore': scheda.colore } as CSSProperties}
    >
      <Collegamento to={ROTTE.home} direzione="scheda" className="laterale__marchio">
        {/* L'impronta nell'indirizzo la scrive npm run icone. */}
        <img src="/icon.svg?v=cfcca6ba" alt="" width={30} height={30} />
        <span>Giochi</span>
      </Collegamento>

      <p className="laterale__sezione">{scheda.nome}</p>

      {menu.classifica && (
        <Collegamento
          to={menu.classifica}
          stato={{ da: scheda.nome }}
          className={`laterale__voce${classificaAccesa ? ' is-attiva' : ''}`}
          aria-current={classificaAccesa ? 'page' : undefined}
        >
          <IconTrophy size={20} />
          <span>Classifica</span>
        </Collegamento>
      )}

      {menu.famiglie.map((f) => {
        const chiave = `${scheda.a}:${f.nome}`
        // La famiglia del gioco aperto resta aperta: altrimenti non si vedrebbe dove si e'.
        const dentro = f.voci.some((v) => v.acceso(pathname))
        return (
          <GruppoLaterale
            key={chiave}
            famiglia={f}
            aperta={dentro || !chiuse.has(chiave)}
            onCambia={() => cambia(chiave)}
            pathname={pathname}
          />
        )
      })}

      <Collegamento
        to={ROTTE.profilo}
        stato={{ da: scheda.nome }}
        className={`laterale__io${sotto(pathname, ROTTE.profilo) ? ' is-attiva' : ''}`}
      >
        <Avatar nickname={player.nickname} color={player.avatarColor} size={32} />
        <span className="laterale__io-nome">{player.displayName}</span>
      </Collegamento>
    </aside>
  )
}

/** Una famiglia del menu: il nome con la chevron, che apre e chiude, e i giochi. */
function GruppoLaterale({
  famiglia,
  aperta,
  onCambia,
  pathname,
}: {
  famiglia: Famiglia
  aperta: boolean
  onCambia: () => void
  pathname: string
}) {
  const id = useId()
  return (
    <section className={`laterale__gruppo${aperta ? ' is-aperto' : ''}`}>
      <button type="button" className="laterale__famiglia" aria-expanded={aperta} aria-controls={id} onClick={onCambia}>
        <span>{famiglia.nome}</span>
        <IconChevronRight size={14} className="laterale__chevron" />
      </button>
      <div className="laterale__cassetto" id={id} inert={!aperta}>
        <ul className="laterale__voci">
          {famiglia.voci.map((v) => {
            const acceso = v.acceso(pathname)
            return (
              <li key={v.id}>
                <Collegamento
                  to={v.a}
                  direzione="scheda"
                  className={`laterale__voce laterale__voce--gioco${acceso ? ' is-attiva' : ''}`}
                  aria-current={acceso ? 'page' : undefined}
                >
                  <Copertina gioco={v.gioco} formato="icona" />
                  <span>{v.nome}</span>
                </Collegamento>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}

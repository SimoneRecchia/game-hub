/**
 * La navigazione dell'app, con i movimenti di un'app vera.
 *
 * Tre movimenti, come in iOS:
 *
 *  - **avanti**: la schermata nuova entra da destra e copre la vecchia, che
 *    scivola un po' a sinistra e si scurisce — il push di un navigation
 *    controller;
 *  - **indietro**: il contrario, e la schermata che se ne va resta sopra;
 *  - **scheda**: fra le sezioni della tab bar il cambio e' immediato, come
 *    nella tab bar di iOS. C'era una dissolvenza, che a meta' mostrava il fondo
 *    vuoto: sembrava che la pagina si ricaricasse.
 *
 * Avanti e indietro li fa l'API delle View Transitions
 * (`document.startViewTransition`), che fotografa la pagina prima e dopo il
 * cambio e anima fra le due: Safari dalla 18, Chrome e Edge da un pezzo. Dove
 * non c'e', la schermata nuova entra con un'animazione sua (`pagina--entra` in
 * Pagina.css). Quale, lo decide la schermata quando si monta (`useEntrata`):
 * prima lo decideva l'assenza dell'attributo della transizione sulla radice,
 * e quando la transizione finiva e l'attributo se ne andava l'animazione
 * ripartiva — ogni pagina, appena arrivata, spariva e ricompariva.
 *
 * Lo scorrimento lo tiene l'app: una schermata nuova comincia dall'alto, una
 * ritrovata tornando indietro e' dove la si era lasciata (`scorrimentoDopo`).
 *
 * Una cosa non ovvia. React Router aggiorna lo stato dentro una transizione di
 * React, quindi il DOM nuovo non e' pronto quando `navigate` ritorna, e
 * `flushSync` non lo forza. La View Transition aspetta allora una promessa che
 * si risolve quando la rotta nuova e' davvero montata — lo dice
 * `TransizioniProvider`, che sta dentro il router e guarda la chiave della
 * location — con un tetto di tempo, perché una rotta lenta non congeli lo
 * schermo sull'istantanea di prima.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { Link, useLocation, useNavigate, useNavigationType, type To } from 'react-router-dom'
import { entrataDi, scorrimentoDopo, type Direzione, type Entrata, type Navigazione } from './movimenti'

export type { Direzione } from './movimenti'

interface Opzioni {
  direzione?: Direzione
  replace?: boolean
  state?: unknown
}

interface Transizioni {
  vai: (a: To, opzioni?: Opzioni) => void
  /** Torna alla schermata di prima, o a `ripiego` se si e' entrati da qui. */
  indietro: (ripiego: string) => void
}

const Contesto = createContext<Transizioni | null>(null)

/** Oltre questo, la schermata nuova si mostra anche se la rotta non ha finito. */
const ATTESA_MASSIMA_MS = 700

type DocumentoConTransizioni = Document & {
  startViewTransition?: (aggiorna: () => Promise<void> | void) => { finished: Promise<void> }
}

function movimentoRidotto(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** L'ultima navigazione partita dall'app: la legge la schermata che si monta, per sapere come entrare. */
let ultima: Navigazione | null = null

/** Finché non se n'e' montata una, la schermata che si monta e' la prima dall'avvio. */
let primaSchermata = true

/** Quante schermate dell'app ci sono prima di questa: `idx` lo scrive React Router nella history. */
function profondita(): number {
  const stato = window.history.state as { idx?: number } | null
  return typeof stato?.idx === 'number' ? stato.idx : 0
}

export function TransizioniProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const tipo = useNavigationType()
  const inAttesa = useRef<(() => void) | null>(null)
  /** Dove stava ogni schermata della history, per chiave: tornandoci, si torna li'. */
  const posizioni = useRef(new Map<string, number>())
  const corrente = useRef({ chiave: location.key, percorso: location.pathname })

  useEffect(() => {
    // Lo scorrimento lo rimette l'app: il browser, tornando indietro, lo farebbe prima che la schermata ci sia.
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual'
    const segna = () => posizioni.current.set(corrente.current.chiave, window.scrollY)
    window.addEventListener('scroll', segna, { passive: true })
    return () => window.removeEventListener('scroll', segna)
  }, [])

  // La rotta nuova e' montata: lo scorrimento al suo posto, e la transizione puo' fotografarla.
  useLayoutEffect(() => {
    const prima = corrente.current
    if (prima.chiave !== location.key) {
      corrente.current = { chiave: location.key, percorso: location.pathname }
      const y = scorrimentoDopo(tipo, prima.percorso, location.pathname, posizioni.current.get(location.key))
      if (y !== null) window.scrollTo(0, y)
    }
    inAttesa.current?.()
    inAttesa.current = null
  }, [location.key, location.pathname, tipo])

  const conTransizione = useCallback((direzione: Direzione, cambia: () => void) => {
    const doc = document as DocumentoConTransizioni
    const scorre = direzione === 'avanti' || direzione === 'indietro'
    const avvia = scorre && !movimentoRidotto() ? doc.startViewTransition?.bind(doc) : undefined
    ultima = { direzione, transizione: avvia !== undefined, quando: performance.now() }
    if (!avvia) {
      cambia()
      return
    }
    const radice = document.documentElement
    radice.dataset.transizione = direzione
    const vista = avvia(
      () =>
        new Promise<void>((risolvi) => {
          const timer = window.setTimeout(risolvi, ATTESA_MASSIMA_MS)
          inAttesa.current = () => {
            window.clearTimeout(timer)
            risolvi()
          }
          cambia()
        }),
    )
    vista.finished.finally(() => {
      if (radice.dataset.transizione === direzione) delete radice.dataset.transizione
    })
  }, [])

  const vai = useCallback(
    (a: To, { direzione = 'avanti', replace, state }: Opzioni = {}) => {
      conTransizione(direzione, () => navigate(a, { replace, state }))
    },
    [conTransizione, navigate],
  )

  const indietro = useCallback(
    (ripiego: string) => {
      if (profondita() > 0) conTransizione('indietro', () => navigate(-1))
      else conTransizione('indietro', () => navigate(ripiego, { replace: true }))
    },
    [conTransizione, navigate],
  )

  const valore = useMemo(() => ({ vai, indietro }), [vai, indietro])
  return <Contesto.Provider value={valore}>{children}</Contesto.Provider>
}

export function useNavigazione(): Transizioni {
  const ctx = useContext(Contesto)
  if (!ctx) throw new Error('useNavigazione richiede TransizioniProvider')
  return ctx
}

/**
 * Come entra la schermata che si monta adesso (vedi `entrataDi`): si decide una
 * volta, al primo disegno, e non cambia piu' finché la schermata resta.
 */
export function useEntrata(): Entrata {
  const tipo = useNavigationType()
  const [entrata] = useState(() =>
    entrataDi({ prima: primaSchermata, tipo, ultima, adesso: performance.now(), ridotto: movimentoRidotto() }),
  )
  useEffect(() => {
    primaSchermata = false
  }, [])
  return entrata
}

interface PropsCollegamento extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  to: To
  direzione?: Direzione
  replace?: boolean
  /** Lo stato della history che la schermata nuova legge: da dove si arriva, per la freccia indietro. */
  stato?: unknown
  children?: ReactNode
}

/**
 * Un link dell'app che naviga con la sua transizione.
 *
 * Resta un `<a>` vero — si apre in una scheda nuova con il tasto centrale, e
 * un lettore di schermo lo annuncia come link — e solo il clic semplice passa
 * dalla transizione.
 */
export function Collegamento({
  to,
  direzione = 'avanti',
  replace,
  stato,
  onClick,
  children,
  ...resto
}: PropsCollegamento) {
  const { vai } = useNavigazione()
  const gestisci = (evento: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(evento)
    if (evento.defaultPrevented) return
    if (evento.button !== 0 || evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey) return
    evento.preventDefault()
    vai(to, { direzione, replace, state: stato })
  }
  return (
    <Link to={to} replace={replace} state={stato} onClick={gestisci} {...resto}>
      {children}
    </Link>
  )
}

/**
 * La navigazione dell'app, con le transizioni di un'app vera.
 *
 * Tre movimenti, come in iOS:
 *
 *  - **avanti**: la schermata nuova entra da destra e copre la vecchia, che
 *    scivola un po' a sinistra e si scurisce — il push di un navigation
 *    controller;
 *  - **indietro**: il contrario, e la schermata che se ne va resta sopra;
 *  - **scheda**: fra le sezioni della tab bar non c'e' un "prima" e un "dopo",
 *    quindi solo una dissolvenza breve.
 *
 * Le fa l'API delle View Transitions (`document.startViewTransition`), che
 * fotografa la pagina prima e dopo il cambio e anima fra le due: Safari dalla
 * 18, Chrome e Edge da un pezzo. Dove non c'e', la schermata nuova entra con
 * un'animazione sua (vedi `.pagina` in Pagina.css) e nient'altro.
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
  useLayoutEffect,
  useMemo,
  useRef,
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { Link, useLocation, useNavigate, type To } from 'react-router-dom'

export type Direzione = 'avanti' | 'indietro' | 'scheda' | 'nessuna'

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

/** Quante schermate dell'app ci sono prima di questa: `idx` lo scrive React Router nella history. */
function profondita(): number {
  const stato = window.history.state as { idx?: number } | null
  return typeof stato?.idx === 'number' ? stato.idx : 0
}

export function TransizioniProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const inAttesa = useRef<(() => void) | null>(null)

  // La rotta nuova e' montata: la transizione puo' fotografarla.
  useLayoutEffect(() => {
    inAttesa.current?.()
    inAttesa.current = null
  }, [location.key])

  const conTransizione = useCallback((direzione: Direzione, cambia: () => void) => {
    const doc = document as DocumentoConTransizioni
    if (!doc.startViewTransition || direzione === 'nessuna' || movimentoRidotto()) {
      cambia()
      return
    }
    const radice = document.documentElement
    radice.dataset.transizione = direzione
    const transizione = doc.startViewTransition(
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
    transizione.finished.finally(() => {
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

interface PropsCollegamento extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  to: To
  direzione?: Direzione
  replace?: boolean
  children?: ReactNode
}

/**
 * Un link dell'app che naviga con la sua transizione.
 *
 * Resta un `<a>` vero — si apre in una scheda nuova con il tasto centrale, e
 * un lettore di schermo lo annuncia come link — e solo il clic semplice passa
 * dalla transizione.
 */
export function Collegamento({ to, direzione = 'avanti', replace, onClick, children, ...resto }: PropsCollegamento) {
  const { vai } = useNavigazione()
  const gestisci = (evento: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(evento)
    if (evento.defaultPrevented) return
    if (evento.button !== 0 || evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey) return
    evento.preventDefault()
    vai(to, { direzione, replace })
  }
  return (
    <Link to={to} replace={replace} onClick={gestisci} {...resto}>
      {children}
    </Link>
  )
}

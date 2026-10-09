import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useLocation } from 'react-router-dom'
import { COOP_POLL_INBOX_MS } from '@shared/config'
import type { Attivita, PresenzaRisposta } from '@shared/types'
import { api } from '@/lib/api'

/** Dove si trova il giocatore, dall'indirizzo: e' quel che vedono gli altri nella sala. */
export function attivitaDa(pathname: string): Attivita {
  if (pathname === '/' || pathname.startsWith('/libere')) return 'hub'
  if (pathname.startsWith('/wordle')) return 'wordle'
  if (pathname.startsWith('/scarabeo')) return 'scarabeo'
  if (pathname.startsWith('/cruciverba')) return 'cruciverba'
  if (pathname.startsWith('/sudoku')) return 'sudoku'
  if (pathname.startsWith('/battaglia')) return 'battaglia'
  if (pathname.startsWith('/quiz')) return 'quiz'
  if (pathname.startsWith('/tris')) return 'tris'
  if (pathname.startsWith('/nomi-cose-citta')) return 'nomi'
  if (pathname.startsWith('/anagrammi')) return 'anagrammi'
  if (pathname.startsWith('/sequenze')) return 'sequenze'
  if (pathname.startsWith('/ghigliottina')) return 'ghigliottina'
  if (pathname.startsWith('/paroliere')) return 'paroliere'
  if (pathname.startsWith('/catena')) return 'catena'
  if (pathname.startsWith('/indovina-chi')) return 'indovina'
  if (pathname.startsWith('/scacchi')) return 'scacchi'
  if (pathname.startsWith('/dama')) return 'dama'
  if (pathname.startsWith('/forza-4')) return 'forza4'
  if (pathname === '/go' || pathname.startsWith('/go/')) return 'go'
  if (pathname.startsWith('/crazy-time') || pathname.startsWith('/ruota')) return 'ruota'
  if (pathname.startsWith('/slot')) return 'slot'
  if (pathname.startsWith('/blackjack')) return 'blackjack'
  if (pathname.startsWith('/roulette')) return 'roulette'
  if (pathname.startsWith('/superenalotto')) return 'superenalotto'
  if (pathname.startsWith('/lupus')) return 'lupus'
  if (pathname.startsWith('/scarabocchi')) return 'scarabocchi'
  if (pathname.startsWith('/fortuna')) return 'fortuna'
  if (pathname.startsWith('/classifica')) return 'classifica'
  if (pathname.startsWith('/profilo') || pathname.startsWith('/amici')) return 'profilo'
  return 'altro'
}

/** Dove si trova un amico, come lo si legge sotto il suo nome nella sala. */
export const DOVE: Record<Attivita, string> = {
  hub: 'fra i giochi',
  wordle: 'gioca a Wordle',
  scarabeo: 'gioca a Scarabeo',
  cruciverba: 'fa il cruciverba',
  sudoku: 'fa il sudoku',
  battaglia: 'alla battaglia navale',
  quiz: 'gioca al quiz',
  tris: 'gioca a tris',
  nomi: 'gioca a Nomi, cose e città',
  anagrammi: 'gioca agli Anagrammi',
  sequenze: 'gioca a Sequenze',
  ghigliottina: 'gioca alla Ghigliottina',
  paroliere: 'gioca al Paroliere',
  catena: 'gioca alla Catena',
  indovina: 'gioca a Indovina chi',
  scacchi: 'gioca a scacchi',
  dama: 'gioca a dama',
  forza4: 'gioca a Forza 4',
  go: 'gioca a go',
  ruota: 'gioca a Crazy Time',
  fortuna: 'tenta la fortuna',
  slot: 'gioca alla slot',
  blackjack: 'gioca a blackjack',
  roulette: 'gioca alla roulette',
  superenalotto: 'gioca al SuperEnalotto',
  lupus: 'gioca a Lupus',
  scarabocchi: 'disegna a Scarabocchi',
  classifica: 'guarda la classifica',
  profilo: 'nel profilo',
  altro: 'online',
}

interface Presenza {
  dati: PresenzaRisposta | null
  /** Rifà subito il giro: dopo aver risposto a un invito, per non aspettare otto secondi. */
  aggiorna: () => void
}

const PresenzaContext = createContext<Presenza>({ dati: null, aggiorna: () => {} })

/**
 * Il giro di controllo, uno per tutta l'app.
 *
 * Ogni otto secondi, a pagina visibile, dice al server che il giocatore c'e' e
 * dove si trova, e riporta gli inviti — del Wordle in compagnia e della
 * battaglia navale — e la partita aperta. E' il sostituto delle notifiche push:
 * senza un service worker e le chiavi VAPID, otto secondi per un invito sono un
 * compromesso ragionevole.
 *
 * A pagina nascosta si ferma: un telefono in tasca non e' "online" per chi
 * vuole sfidarlo, e le richieste delle Pages Functions gratuite sono contate.
 * Si rifà subito quando la pagina torna visibile e quando si cambia schermata,
 * perché l'attivita' mostrata agli altri sia quella vera.
 */
export function PresenzaProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const attivita = attivitaDa(pathname)
  const [dati, setDati] = useState<PresenzaRisposta | null>(null)
  const attivitaRef = useRef(attivita)
  const inCorso = useRef(false)
  /** L'ultima risposta, in testo: quasi sempre e' uguale alla nuova, e allora l'app non si ridisegna. */
  const ultima = useRef('')

  const giro = useCallback(async () => {
    if (inCorso.current || document.visibilityState !== 'visible') return
    inCorso.current = true
    try {
      const nuova = await api<PresenzaRisposta>('/presenza', {
        method: 'POST',
        body: { attivita: attivitaRef.current },
      })
      // Ogni otto secondi un oggetto nuovo ridisegnava gli avvisi e le schermate che leggono la presenza.
      const testo = JSON.stringify(nuova)
      if (testo !== ultima.current) {
        ultima.current = testo
        setDati(nuova)
      }
    } catch {
      /* il giro resta silenzioso: si riprova al prossimo */
    } finally {
      inCorso.current = false
    }
  }, [])

  useEffect(() => {
    attivitaRef.current = attivita
    void giro()
  }, [attivita, giro])

  useEffect(() => {
    const id = window.setInterval(() => void giro(), COOP_POLL_INBOX_MS)
    const onVisibilita = () => {
      if (document.visibilityState === 'visible') void giro()
    }
    document.addEventListener('visibilitychange', onVisibilita)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisibilita)
    }
  }, [giro])

  const valore = useMemo(() => ({ dati, aggiorna: () => void giro() }), [dati, giro])
  return <PresenzaContext.Provider value={valore}>{children}</PresenzaContext.Provider>
}

export function usePresenza(): Presenza {
  return useContext(PresenzaContext)
}

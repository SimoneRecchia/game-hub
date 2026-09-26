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
  if (pathname === '/') return 'hub'
  if (pathname.startsWith('/wordle') || pathname.startsWith('/insieme')) return 'wordle'
  if (pathname.startsWith('/scarabeo')) return 'scarabeo'
  if (pathname.startsWith('/cruciverba')) return 'cruciverba'
  if (pathname.startsWith('/battaglia')) return 'battaglia'
  if (pathname.startsWith('/classifica')) return 'classifica'
  if (pathname.startsWith('/profilo')) return 'profilo'
  return 'altro'
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

  const giro = useCallback(async () => {
    if (inCorso.current || document.visibilityState !== 'visible') return
    inCorso.current = true
    try {
      setDati(
        await api<PresenzaRisposta>('/presenza', {
          method: 'POST',
          body: { attivita: attivitaRef.current },
        }),
      )
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

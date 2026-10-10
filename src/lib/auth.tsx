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
import type { AuthConfig, CodiceMandato, Player } from '@shared/types'
import { ApiFetchError, api } from './api'
import { spegniNotifiche } from './notifiche'

const CACHE_KEY = 'gh.player'

interface AuthState {
  player: Player | null
  /** true finché non sappiamo se la sessione salvata e' ancora valida. */
  checking: boolean
  /** null finché la configurazione non e' arrivata dal server. */
  config: AuthConfig | null
  register: (nickname: string, email: string) => Promise<void>
  /** Chiede il codice per entrare, con il nickname o con l'email. */
  requestCode: (identifier: string) => Promise<CodiceMandato>
  /** Entra con il codice arrivato per posta. */
  login: (identifier: string, code: string) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
  /** Conferma l'email col codice ricevuto. */
  verify: (code: string) => Promise<void>
  /** Rimanda il codice. Restituisce i secondi di attesa dichiarati. */
  resendCode: () => Promise<number>
  /** Applica un giocatore aggiornato. */
  apply: (player: Player) => void
}

const AuthContext = createContext<AuthState | null>(null)

/**
 * Il giocatore viene tenuto anche in localStorage.
 *
 * Non e' una credenziale — quella e' il cookie HttpOnly, che JavaScript non
 * vede — ma permette di disegnare subito la UI corretta al caricamento,
 * invece di mostrare la schermata di accesso per un istante a chi e' già
 * dentro. La validita' vera viene confermata da /api/auth/me subito dopo.
 */
function readCache(): Player | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Player
    return typeof parsed?.id === 'string' && typeof parsed?.nickname === 'string' ? parsed : null
  } catch {
    return null
  }
}

function writeCache(player: Player | null) {
  try {
    if (player) localStorage.setItem(CACHE_KEY, JSON.stringify(player))
    else localStorage.removeItem(CACHE_KEY)
  } catch {
    /* Safari in navigazione privata nega lo storage: non e' un problema */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [player, setPlayer] = useState<Player | null>(readCache)
  const [checking, setChecking] = useState(true)
  const [config, setConfig] = useState<AuthConfig | null>(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const apply = useCallback((next: Player | null) => {
    writeCache(next)
    if (mounted.current) setPlayer(next)
  }, [])

  const refresh = useCallback(async () => {
    try {
      const { player: fresh } = await api<{ player: Player }>('/auth/me')
      apply(fresh)
    } catch (error) {
      // Solo un 401 significa "non sei più dentro". Un errore di rete non deve
      // buttare fuori chi era già autenticato: la cache resta valida.
      if (error instanceof ApiFetchError && error.isUnauthenticated) apply(null)
    } finally {
      if (mounted.current) setChecking(false)
    }
  }, [apply])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // La configurazione serve prima di disegnare la registrazione: decide se
  // mostrare il passaggio del codice.
  useEffect(() => {
    void api<AuthConfig>('/auth/config')
      .then((fresh) => {
        if (mounted.current) setConfig(fresh)
      })
      .catch(() => {
        // Senza risposta si assume la configurazione minima: non si promette
        // un codice di conferma che potrebbe non arrivare.
        if (mounted.current) setConfig({ emailVerificationRequired: false })
      })
  }, [])

  const register = useCallback(
    async (nickname: string, email: string) => {
      const { player: created } = await api<{ player: Player }>('/auth/register', {
        method: 'POST',
        body: { nickname: nickname.trim(), email: email.trim() },
      })
      apply(created)
    },
    [apply],
  )

  const requestCode = useCallback(
    (identifier: string) =>
      api<CodiceMandato>('/auth/login/code', { method: 'POST', body: { identifier: identifier.trim() } }),
    [],
  )

  const verify = useCallback(
    async (code: string) => {
      const { player: fresh } = await api<{ player: Player }>('/auth/verify', {
        method: 'POST',
        body: { code: code.trim() },
      })
      apply(fresh)
    },
    [apply],
  )

  const resendCode = useCallback(async () => {
    const { cooldownSeconds } = await api<{ cooldownSeconds: number }>('/auth/verify/resend', {
      method: 'POST',
    })
    return cooldownSeconds
  }, [])

  const login = useCallback(
    async (identifier: string, code: string) => {
      const { player: signed } = await api<{ player: Player }>('/auth/login', {
        method: 'POST',
        body: { identifier: identifier.trim(), code: code.trim() },
      })
      apply(signed)
    },
    [apply],
  )

  const logout = useCallback(async () => {
    try {
      // Prima di uscire, finché la sessione c'e': le notifiche di questo telefono non vanno piu' a chi esce.
      await spegniNotifiche().catch(() => {})
      await api('/auth/logout', { method: 'POST' })
    } finally {
      apply(null)
    }
  }, [apply])

  const value = useMemo<AuthState>(
    () => ({
      player,
      checking,
      config,
      register,
      requestCode,
      login,
      logout,
      refresh,
      verify,
      resendCode,
      apply,
    }),
    [player, checking, config, register, requestCode, login, logout, refresh, verify, resendCode, apply],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth richiede AuthProvider')
  return ctx
}

/** Come useAuth ma garantisce un giocatore: da usare dentro le rotte protette. */
export function usePlayer(): Player {
  const { player } = useAuth()
  if (!player) throw new Error('usePlayer usato fuori da una rotta protetta')
  return player
}

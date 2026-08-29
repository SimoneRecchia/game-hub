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
import type { Player } from '@shared/types'
import { deriveVerifier } from '@shared/password'
import { ApiFetchError, api } from './api'

const CACHE_KEY = 'gh.player'

interface AuthState {
  player: Player | null
  /** true finché non sappiamo se la sessione salvata e' ancora valida. */
  checking: boolean
  register: (nickname: string, password: string) => Promise<void>
  login: (nickname: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
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

  const register = useCallback(
    async (nickname: string, password: string) => {
      const verifier = await deriveVerifier(nickname, password)
      const { player: created } = await api<{ player: Player }>('/auth/register', {
        method: 'POST',
        body: { nickname: nickname.trim(), verifier },
      })
      apply(created)
    },
    [apply],
  )

  const login = useCallback(
    async (nickname: string, password: string) => {
      const verifier = await deriveVerifier(nickname, password)
      const { player: signed } = await api<{ player: Player }>('/auth/login', {
        method: 'POST',
        body: { nickname: nickname.trim(), verifier },
      })
      apply(signed)
    },
    [apply],
  )

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' })
    } finally {
      apply(null)
    }
  }, [apply])

  const value = useMemo<AuthState>(
    () => ({ player, checking, register, login, logout, refresh }),
    [player, checking, register, login, logout, refresh],
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

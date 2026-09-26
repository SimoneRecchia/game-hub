import type { ApiError } from '@shared/types'

/** Errore con lo stato HTTP e il codice stabile restituito dall'API. */
export class ApiFetchError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiFetchError'
    this.status = status
    this.code = code
  }

  /** La sessione non c'e' o e' scaduta. */
  get isUnauthenticated(): boolean {
    return this.status === 401
  }
}

const NETWORK_MESSAGE = 'Connessione assente. Controlla la rete e riprova.'

interface Options {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  signal?: AbortSignal
  /**
   * La richiesta sopravvive alla pagina: serve al salvataggio che parte quando
   * il telefono va in tasca, altrimenti il browser la interrompe a metà.
   */
  keepalive?: boolean
}

/**
 * Chiama l'API dell'hub.
 *
 * `credentials: 'same-origin'` e' quello che fa viaggiare il cookie di
 * sessione: senza, ogni richiesta risulterebbe anonima.
 */
export async function api<T>(path: string, options: Options = {}): Promise<T> {
  const { method = 'GET', body, signal, keepalive } = options

  let response: Response
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
      keepalive,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiFetchError(0, 'NETWORK', NETWORK_MESSAGE)
  }

  if (response.status === 204) return undefined as T

  const text = await response.text()
  let payload: unknown = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      // Una risposta non-JSON su /api significa che davanti c'e' qualcosa che
      // non e' la nostra Function (tipicamente la pagina 404 di Pages).
      throw new ApiFetchError(
        response.status,
        'BAD_RESPONSE',
        "L'API non ha risposto correttamente. Il backend potrebbe non essere attivo.",
      )
    }
  }

  if (!response.ok) {
    const error = payload as ApiError | null
    throw new ApiFetchError(
      response.status,
      error?.code ?? 'UNKNOWN',
      error?.error ?? 'Qualcosa è andato storto. Riprova.',
    )
  }

  return payload as T
}

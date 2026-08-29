import { HTTPException } from 'hono/http-exception'
import type { ApiError } from '../../shared/types'

/**
 * Errore applicativo con un codice stabile.
 *
 * Il codice serve alla UI per decidere cosa mostrare (es. NICKNAME_TAKEN
 * evidenzia il campo nickname) senza dover interpretare il testo del messaggio.
 */
export function fail(
  status: 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500 | 502 | 503,
  code: string,
  message: string,
): never {
  const body: ApiError = { error: message, code }
  throw new HTTPException(status, {
    res: new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    }),
  })
}

/** ID casuale leggibile per giocatori e partite. */
export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`
}

export function nowIso(): string {
  return new Date().toISOString()
}

/** Token di sessione: generazione nel Worker, hashing prima di salvarlo. */

import { toBase64 } from './password'

const TOKEN_BYTES = 32

/** Token opaco da 256 bit, sicuro per URL e cookie. */
export function generateSessionToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_BYTES))
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Nel database va l'impronta del token, non il token.
 *
 * Così chi leggesse la tabella delle sessioni non ottiene cookie utilizzabili.
 * SHA-256 senza stretching va bene: il token ha 256 bit di entropia, non c'e'
 * nulla da indovinare.
 */
export async function hashSessionToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return toBase64(new Uint8Array(digest))
}

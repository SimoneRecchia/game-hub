/**
 * Codici di verifica a sei cifre.
 *
 * Nel database va l'impronta, non il codice: chi leggesse la tabella non deve
 * poter prendere possesso di un account in attesa di verifica. L'impronta lega
 * il codice al giocatore e allo scopo, così un codice di verifica non vale
 * come codice di reimpostazione.
 */

import {
  CODE_LENGTH,
  CODE_MAX_ATTEMPTS,
  CODE_RESEND_COOLDOWN_SECONDS,
  CODE_TTL_MINUTES,
} from '../../shared/config'
import { toBase64 } from '../../shared/password'
import { newId, nowIso } from './http'

export type CodePurpose = 'verify_email' | 'reset_password'

/**
 * Codice numerico da `CODE_LENGTH` cifre, con distribuzione uniforme.
 *
 * `% 10` su un byte sarebbe leggermente sbilanciato (256 non e' multiplo di
 * 10): i byte oltre 249 vengono scartati e ripescati.
 */
export function generateCode(): string {
  let code = ''
  while (code.length < CODE_LENGTH) {
    const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH * 2))
    for (const byte of bytes) {
      if (byte >= 250) continue
      code += String(byte % 10)
      if (code.length === CODE_LENGTH) break
    }
  }
  return code
}

async function hashCode(purpose: CodePurpose, playerId: string, code: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`game-hub/code/v1/${purpose}/${playerId}/${code}`),
  )
  return toBase64(new Uint8Array(digest))
}

interface CodeRow {
  id: string
  code_hash: string
  created_at: string
  expires_at: string
  attempts: number
}

/** Il codice valido più recente per un giocatore e uno scopo. */
async function latestCode(
  db: D1Database,
  playerId: string,
  purpose: CodePurpose,
): Promise<CodeRow | null> {
  return db
    .prepare(
      `SELECT id, code_hash, created_at, expires_at, attempts
         FROM verification_codes
        WHERE player_id = ? AND purpose = ? AND consumed_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1`,
    )
    .bind(playerId, purpose)
    .first<CodeRow>()
}

/** Secondi da attendere prima di poter chiedere un altro codice. 0 se si può. */
export async function resendWaitSeconds(
  db: D1Database,
  playerId: string,
  purpose: CodePurpose,
): Promise<number> {
  const row = await latestCode(db, playerId, purpose)
  if (!row) return 0
  const elapsed = (Date.now() - new Date(row.created_at).getTime()) / 1000
  return Math.max(0, Math.ceil(CODE_RESEND_COOLDOWN_SECONDS - elapsed))
}

/**
 * Crea un codice e restituisce quello in chiaro, da mandare per posta.
 *
 * I codici precedenti dello stesso scopo vengono consumati: averne due validi
 * in giro allungherebbe inutilmente la finestra di attacco.
 */
export async function issueCode(
  db: D1Database,
  playerId: string,
  purpose: CodePurpose,
): Promise<string> {
  const code = generateCode()
  const now = new Date()
  const expires = new Date(now.getTime() + CODE_TTL_MINUTES * 60_000)

  await db.batch([
    db
      .prepare(
        `UPDATE verification_codes SET consumed_at = ?
          WHERE player_id = ? AND purpose = ? AND consumed_at IS NULL`,
      )
      .bind(now.toISOString(), playerId, purpose),
    db
      .prepare(
        `INSERT INTO verification_codes
           (id, player_id, purpose, code_hash, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        newId('code'),
        playerId,
        purpose,
        await hashCode(purpose, playerId, code),
        now.toISOString(),
        expires.toISOString(),
      ),
  ])

  return code
}

export type CodeCheck =
  | { ok: true }
  | { ok: false; reason: 'missing' | 'expired' | 'burned' | 'wrong'; attemptsLeft: number }

/**
 * Verifica un codice e, se giusto, lo consuma.
 *
 * Ogni tentativo sbagliato incrementa il contatore: dopo `CODE_MAX_ATTEMPTS` il
 * codice non vale più, perché sei cifre si indovinano per tentativi.
 */
export async function consumeCode(
  db: D1Database,
  playerId: string,
  purpose: CodePurpose,
  code: string,
): Promise<CodeCheck> {
  const row = await latestCode(db, playerId, purpose)
  if (!row) return { ok: false, reason: 'missing', attemptsLeft: 0 }

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    return { ok: false, reason: 'expired', attemptsLeft: 0 }
  }
  if (row.attempts >= CODE_MAX_ATTEMPTS) {
    return { ok: false, reason: 'burned', attemptsLeft: 0 }
  }

  const expected = await hashCode(purpose, playerId, code.trim())
  if (expected !== row.code_hash) {
    await db
      .prepare('UPDATE verification_codes SET attempts = attempts + 1 WHERE id = ?')
      .bind(row.id)
      .run()
    return {
      ok: false,
      reason: 'wrong',
      attemptsLeft: Math.max(0, CODE_MAX_ATTEMPTS - (row.attempts + 1)),
    }
  }

  await db
    .prepare('UPDATE verification_codes SET consumed_at = ? WHERE id = ?')
    .bind(nowIso(), row.id)
    .run()
  return { ok: true }
}

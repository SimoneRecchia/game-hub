import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import type { Context, MiddlewareHandler } from 'hono'
import { generateSessionToken, hashSessionToken } from '../../shared/session'
import { SESSION_TTL_DAYS } from '../../shared/config'
import { toPlayer, type AppEnv, type PlayerRow } from '../types'
import { fail, nowIso } from './http'

export const COOKIE_NAME = 'gh_session'

const TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000

/**
 * `Secure` solo su https: altrimenti il cookie non verrebbe salvato durante
 * lo sviluppo su http://localhost.
 */
function isSecure(c: Context<AppEnv>): boolean {
  return new URL(c.req.url).protocol === 'https:'
}

export async function issueSession(c: Context<AppEnv>, playerId: string): Promise<void> {
  const token = generateSessionToken()
  const tokenHash = await hashSessionToken(token)
  const now = new Date()
  const expires = new Date(now.getTime() + TTL_MS)

  await c.env.DB.prepare(
    `INSERT INTO sessions (token_hash, player_id, created_at, expires_at, last_used_at, user_agent)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      tokenHash,
      playerId,
      now.toISOString(),
      expires.toISOString(),
      now.toISOString(),
      c.req.header('user-agent')?.slice(0, 200) ?? null,
    )
    .run()

  setCookie(c, COOKIE_NAME, token, {
    httpOnly: true,
    secure: isSecure(c),
    sameSite: 'Lax',
    path: '/',
    maxAge: Math.floor(TTL_MS / 1000),
  })
}

export async function revokeSession(c: Context<AppEnv>): Promise<void> {
  const token = getCookie(c, COOKIE_NAME)
  if (token) {
    const tokenHash = await hashSessionToken(token)
    await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run()
  }
  deleteCookie(c, COOKIE_NAME, { path: '/', secure: isSecure(c) })
}

/** Revoca tutte le sessioni del giocatore: usato dopo un cambio password. */
export async function revokeAllSessions(
  c: Context<AppEnv>,
  playerId: string,
  keepCurrent: boolean,
): Promise<void> {
  const token = keepCurrent ? getCookie(c, COOKIE_NAME) : undefined
  if (token) {
    const keep = await hashSessionToken(token)
    await c.env.DB.prepare('DELETE FROM sessions WHERE player_id = ? AND token_hash != ?')
      .bind(playerId, keep)
      .run()
  } else {
    await c.env.DB.prepare('DELETE FROM sessions WHERE player_id = ?').bind(playerId).run()
  }
}

interface Resolved {
  player: PlayerRow
  tokenHash: string
  expiresAt: string
}

async function resolveSession(c: Context<AppEnv>): Promise<Resolved | null> {
  const token = getCookie(c, COOKIE_NAME)
  if (!token) return null

  const tokenHash = await hashSessionToken(token)
  const row = await c.env.DB.prepare(
    `SELECT p.*, s.expires_at AS session_expires_at
       FROM sessions s
       JOIN players p ON p.id = s.player_id
      WHERE s.token_hash = ?`,
  )
    .bind(tokenHash)
    .first<PlayerRow & { session_expires_at: string }>()

  if (!row) return null

  if (new Date(row.session_expires_at).getTime() <= Date.now()) {
    await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run()
    return null
  }

  return { player: row, tokenHash, expiresAt: row.session_expires_at }
}

/**
 * Prolunga la scadenza quando manca meno di un mese, così chi gioca
 * regolarmente non viene mai disconnesso. Una sola scrittura al mese per
 * giocatore, invece di una a ogni richiesta.
 */
const RENEW_WHEN_REMAINING_MS = 30 * 24 * 60 * 60 * 1000

async function touchSession(c: Context<AppEnv>, resolved: Resolved): Promise<void> {
  const now = new Date()
  const remaining = new Date(resolved.expiresAt).getTime() - now.getTime()
  if (remaining > TTL_MS - RENEW_WHEN_REMAINING_MS) return

  const expires = new Date(now.getTime() + TTL_MS)
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE sessions SET last_used_at = ?, expires_at = ? WHERE token_hash = ?').bind(
      now.toISOString(),
      expires.toISOString(),
      resolved.tokenHash,
    ),
    c.env.DB.prepare('UPDATE players SET last_seen_at = ? WHERE id = ?').bind(
      now.toISOString(),
      resolved.player.id,
    ),
  ])

  setCookie(c, COOKIE_NAME, getCookie(c, COOKIE_NAME) ?? '', {
    httpOnly: true,
    secure: isSecure(c),
    sameSite: 'Lax',
    path: '/',
    maxAge: Math.floor(TTL_MS / 1000),
  })
}

/** Richiede una sessione valida; risponde 401 se manca. */
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const resolved = await resolveSession(c)
  if (!resolved) fail(401, 'NOT_AUTHENTICATED', 'Serve accedere per continuare.')
  c.set('player', toPlayer(resolved.player))
  await touchSession(c, resolved)
  await next()
}

/** Restituisce il giocatore se la sessione c'e', altrimenti null. */
export async function optionalPlayer(c: Context<AppEnv>) {
  const resolved = await resolveSession(c)
  if (!resolved) return null
  await touchSession(c, resolved)
  return toPlayer(resolved.player)
}

/** Come sopra ma senza rinnovo: per gli endpoint di sola lettura. */
export async function peekPlayer(c: Context<AppEnv>) {
  const resolved = await resolveSession(c)
  return resolved ? toPlayer(resolved.player) : null
}

/** Aggiorna last_seen_at senza toccare la sessione. */
export async function markSeen(c: Context<AppEnv>, playerId: string): Promise<void> {
  await c.env.DB.prepare('UPDATE players SET last_seen_at = ? WHERE id = ?')
    .bind(nowIso(), playerId)
    .run()
}

/**
 * L'accesso al pannello di amministrazione, e il suo registro.
 *
 * Chi e' amministratore: il proprietario e' chi ha un'email confermata fra
 * quelle di `ADMIN_EMAILS` (wrangler.toml); gli altri sono i giocatori a cui il
 * proprietario ha dato il ruolo dal pannello (`players.ruolo`). Il proprietario
 * non sta nel database perché non lo si possa togliere per sbaglio, ne' da un
 * pannello in mano a qualcun altro.
 *
 * La sessione dura un anno, e un telefono perso non deve aprire il pannello:
 * oltre a essere amministratore serve un codice mandato all'email, che sblocca
 * il pannello su quella sessione per `SBLOCCO_ADMIN_ORE` ore
 * (`sessions.admin_fino`). Il codice ha la sua tabella: quella dei codici per
 * entrare ha un `CHECK` sugli scopi, e cambiarlo vuol dire rifarla.
 */

import type { Context, MiddlewareHandler } from 'hono'
import { SBLOCCO_ADMIN_ORE, type RuoloAdmin } from '../../shared/admin'
import { toBase64 } from '../../shared/base64'
import { CODE_LOGIN_PER_DAY, CODE_MAX_ATTEMPTS, CODE_RESEND_COOLDOWN_SECONDS, CODE_TTL_MINUTES } from '../../shared/config'
import { gameDate } from '../../shared/daily'
import { toPlayer, type AppEnv, type Bindings, type PlayerRow } from '../types'
import { generateCode } from './codes'
import { fail, newId, nowIso } from './http'
import { resolveSession, touchSession } from './session'

/** Le email dei proprietari, minuscole. */
export function emailProprietari(env: Bindings): string[] {
  return (env.ADMIN_EMAILS ?? '')
    .split(/[\s,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes('@'))
}

/** Il ruolo nel pannello di un giocatore; null se non ne ha. L'email deve essere confermata. */
export function ruoloDi(
  env: Bindings,
  row: Pick<PlayerRow, 'email_lower' | 'email_verified_at' | 'ruolo'>,
): RuoloAdmin | null {
  if (row.email_lower && row.email_verified_at && emailProprietari(env).includes(row.email_lower)) {
    return 'proprietario'
  }
  return row.ruolo === 'admin' ? 'admin' : null
}

/** Il pannello e' sbloccato su questa sessione. */
export function sbloccato(adminFino: string | null, adesso = Date.now()): boolean {
  return adminFino !== null && Date.parse(adminFino) > adesso
}

/**
 * Chi apre il pannello: una sessione valida e un ruolo. Non chiede lo sblocco:
 * serve alle rotte che lo danno (il codice) e a quella che dice a che punto si e'.
 */
export const requireAmministratore: MiddlewareHandler<AppEnv> = async (c, next) => {
  const sessione = await resolveSession(c)
  if (!sessione) fail(401, 'NOT_AUTHENTICATED', 'Accedi per continuare.')
  const ruolo = ruoloDi(c.env, sessione.player)
  if (!ruolo) fail(403, 'NON_ADMIN', 'Questa pagina è per gli amministratori.')
  c.set('player', toPlayer(sessione.player))
  c.set('admin', { ruolo, tokenHash: sessione.tokenHash })
  await touchSession(c, sessione)
  await next()
}

/** Tutte le altre rotte del pannello: amministratore, e pannello sbloccato con il codice. */
export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const sessione = await resolveSession(c)
  if (!sessione) fail(401, 'NOT_AUTHENTICATED', 'Accedi per continuare.')
  const ruolo = ruoloDi(c.env, sessione.player)
  if (!ruolo) fail(403, 'NON_ADMIN', 'Questa pagina è per gli amministratori.')
  if (!sbloccato(sessione.adminFino)) fail(403, 'ADMIN_BLOCCATO', 'Sblocca il pannello con il codice.')
  c.set('player', toPlayer(sessione.player))
  c.set('admin', { ruolo, tokenHash: sessione.tokenHash })
  await next()
}

/* ─────────────────────────────  Il codice  ───────────────────────────── */

async function impronta(playerId: string, codice: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`game-hub/admin/v1/${playerId}/${codice}`),
  )
  return toBase64(new Uint8Array(digest))
}

interface CodiceRow {
  code_hash: string
  created_at: string
  expires_at: string
  attempts: number
  giorno: string
  inviati: number
}

/**
 * Un codice nuovo, al posto di quello di prima: o un errore se e' troppo
 * presto (uno al minuto) o se oggi ne sono partiti troppi. Cinque tentativi a
 * codice e dieci codici al giorno fanno cinquanta tentativi su un milione.
 */
export async function nuovoCodice(db: D1Database, playerId: string, adesso = Date.now()): Promise<string> {
  const riga = await db.prepare('SELECT * FROM admin_codici WHERE player_id = ?').bind(playerId).first<CodiceRow>()
  const oggi = gameDate(new Date(adesso))
  if (riga) {
    const passati = (adesso - Date.parse(riga.created_at)) / 1000
    if (passati < CODE_RESEND_COOLDOWN_SECONDS) {
      const attesa = Math.ceil(CODE_RESEND_COOLDOWN_SECONDS - passati)
      fail(429, 'RESEND_TOO_SOON', `Riprova fra ${attesa} ${attesa === 1 ? 'secondo' : 'secondi'}.`)
    }
    if (riga.giorno === oggi && riga.inviati >= CODE_LOGIN_PER_DAY) {
      fail(429, 'TROPPI_CODICI', 'Oggi hai chiesto troppi codici. Riprova domani.')
    }
  }
  const codice = generateCode()
  const inviati = riga && riga.giorno === oggi ? riga.inviati + 1 : 1
  await db
    .prepare(
      `INSERT INTO admin_codici (player_id, code_hash, created_at, expires_at, attempts, giorno, inviati)
       VALUES (?, ?, ?, ?, 0, ?, ?)
       ON CONFLICT (player_id) DO UPDATE
          SET code_hash = excluded.code_hash, created_at = excluded.created_at, expires_at = excluded.expires_at,
              attempts = 0, giorno = excluded.giorno, inviati = excluded.inviati`,
    )
    .bind(
      playerId,
      await impronta(playerId, codice),
      new Date(adesso).toISOString(),
      new Date(adesso + CODE_TTL_MINUTES * 60_000).toISOString(),
      oggi,
      inviati,
    )
    .run()
  return codice
}

/**
 * Il codice e' giusto: lo consuma, e sblocca il pannello sulla sessione. Un
 * codice sbagliato conta un tentativo; scaduto o finito non vale.
 */
export async function sbloccaConCodice(
  db: D1Database,
  playerId: string,
  tokenHash: string,
  codice: string,
  adesso = Date.now(),
): Promise<string> {
  const riga = await db.prepare('SELECT * FROM admin_codici WHERE player_id = ?').bind(playerId).first<CodiceRow>()
  const INVALIDO = 'Codice non valido o scaduto. Controlla le cifre, o chiedine uno nuovo.'
  if (!riga || riga.code_hash === '' || Date.parse(riga.expires_at) <= adesso || riga.attempts >= CODE_MAX_ATTEMPTS) {
    fail(400, 'CODE_INVALID', INVALIDO)
  }
  if ((await impronta(playerId, codice)) !== riga.code_hash) {
    await db.prepare('UPDATE admin_codici SET attempts = attempts + 1 WHERE player_id = ?').bind(playerId).run()
    fail(400, 'CODE_INVALID', INVALIDO)
  }
  const fino = new Date(adesso + SBLOCCO_ADMIN_ORE * 3_600_000).toISOString()
  // Il codice si consuma svuotandone l'impronta: la riga resta, con il conto dei codici del giorno.
  await db.batch([
    db.prepare("UPDATE admin_codici SET code_hash = '' WHERE player_id = ?").bind(playerId),
    db.prepare('UPDATE sessions SET admin_fino = ? WHERE token_hash = ?').bind(fino, tokenHash),
  ])
  return fino
}

/* ─────────────────────────────  Il registro  ───────────────────────────── */

/**
 * Una voce del registro: chi, che cosa, su che cosa. Da scrivere nello stesso
 * batch della modifica quando c'e' un batch, cosi' non c'e' modifica senza voce.
 */
export function voceRegistro(
  db: D1Database,
  adminId: string,
  azione: string,
  oggetto: string | null,
  dettagli: unknown = null,
): D1PreparedStatement {
  return db
    .prepare('INSERT INTO admin_registro (id, at, admin_id, azione, oggetto, dettagli) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(newId('reg'), nowIso(), adminId, azione, oggetto, dettagli === null ? null : JSON.stringify(dettagli))
}

export async function registra(
  c: Context<AppEnv>,
  azione: string,
  oggetto: string | null,
  dettagli: unknown = null,
): Promise<void> {
  await voceRegistro(c.env.DB, c.get('player').id, azione, oggetto, dettagli).run()
}

/* ─────────────────────────────  Gli errori  ───────────────────────────── */

/** Quanto restano gli errori del server: un mese, poi li porta via l'errore dopo. */
const CONSERVA_ERRORI_MS = 30 * 86_400_000

/**
 * Un errore non gestito, nel database: senza, restava solo nei log di
 * Cloudflare, che il piano gratuito non conserva. Non deve mai far fallire la
 * risposta: se anche la scrittura fallisce, si lascia stare.
 */
export async function salvaErrore(c: Context<AppEnv>, errore: unknown): Promise<void> {
  const db = c.env?.DB
  if (!db) return
  const e = errore instanceof Error ? errore : new Error(String(errore))
  const adesso = Date.now()
  const url = new URL(c.req.url)
  const lavoro = db
    .batch([
      db
        .prepare(
          `INSERT INTO errori_server (id, at, metodo, percorso, messaggio, stack, player_id)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          newId('err'),
          new Date(adesso).toISOString(),
          c.req.method,
          url.pathname.slice(0, 200),
          e.message.slice(0, 500),
          e.stack ? e.stack.slice(0, 4000) : null,
          c.get('player')?.id ?? null,
        ),
      db.prepare('DELETE FROM errori_server WHERE at < ?').bind(new Date(adesso - CONSERVA_ERRORI_MS).toISOString()),
    ])
    .catch(() => undefined)
  try {
    c.executionCtx.waitUntil(lavoro)
  } catch {
    await lavoro
  }
}

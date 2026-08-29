import { Hono } from 'hono'
import {
  AVATAR_COLORS,
  NICKNAME_MAX,
  NICKNAME_MIN,
  NICKNAME_PATTERN,
} from '../../shared/config'
import {
  SERVER_ITERATIONS,
  constantTimeEqual,
  hashVerifier,
  randomSalt,
  toBase64,
} from '../../shared/password'
import type { Player } from '../../shared/types'
import { toPlayer, type AppEnv, type PlayerRow } from '../types'
import { fail, newId, nowIso } from '../lib/http'
import {
  issueSession,
  markSeen,
  optionalPlayer,
  requireAuth,
  revokeAllSessions,
  revokeSession,
} from '../lib/session'

/** Lunghezza attesa di un verifier base64 da 32 byte. */
const VERIFIER_LENGTH = 44

/**
 * Salt di comodo usato quando il nickname non esiste, per pareggiare i tempi
 * di risposta fra "nickname sconosciuto" e "password sbagliata".
 */
const DUMMY_SALT = 'AAAAAAAAAAAAAAAAAAAAAA=='

interface Credentials {
  nickname: string
  verifier: string
}

function readCredentials(body: unknown): Credentials {
  if (typeof body !== 'object' || body === null) {
    fail(400, 'BAD_REQUEST', 'Richiesta non valida.')
  }
  const { nickname, verifier } = body as Record<string, unknown>

  if (typeof nickname !== 'string' || typeof verifier !== 'string') {
    fail(400, 'BAD_REQUEST', 'Richiesta non valida.')
  }

  const trimmed = nickname.trim()
  if (trimmed.length < NICKNAME_MIN || trimmed.length > NICKNAME_MAX) {
    fail(400, 'NICKNAME_LENGTH', `Il nickname deve avere fra ${NICKNAME_MIN} e ${NICKNAME_MAX} caratteri.`)
  }
  if (!NICKNAME_PATTERN.test(trimmed)) {
    fail(400, 'NICKNAME_CHARS', 'Il nickname può contenere solo lettere, numeri, punto, trattino e underscore.')
  }
  // Il verifier arriva già derivato dal browser: se non ha la forma attesa,
  // la chiamata non viene dal client dell'app.
  if (verifier.length !== VERIFIER_LENGTH || !/^[A-Za-z0-9+/]+=*$/.test(verifier)) {
    fail(400, 'BAD_VERIFIER', 'Credenziali in un formato non riconosciuto.')
  }

  return { nickname: trimmed, verifier }
}

/** Colore stabile dal nickname: l'avatar di un giocatore non cambia mai. */
function avatarColorFor(nickname: string): string {
  let hash = 0
  for (let i = 0; i < nickname.length; i += 1) hash = (hash * 31 + nickname.charCodeAt(i)) | 0
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

export const authRoutes = new Hono<AppEnv>()

  /** Chi sono. Usato all'avvio per capire se la sessione e' ancora buona. */
  .get('/me', async (c) => {
    const player = await optionalPlayer(c)
    if (!player) fail(401, 'NOT_AUTHENTICATED', 'Nessuna sessione attiva.')
    return c.json<{ player: Player }>({ player })
  })

  .post('/register', async (c) => {
    const { nickname, verifier } = readCredentials(await c.req.json().catch(() => null))
    const nicknameLower = nickname.toLowerCase()

    const existing = await c.env.DB.prepare('SELECT id FROM players WHERE nickname_lower = ?')
      .bind(nicknameLower)
      .first<{ id: string }>()
    if (existing) {
      fail(409, 'NICKNAME_TAKEN', 'Questo nickname è già preso. Provane un altro.')
    }

    const salt = toBase64(randomSalt())
    const hash = await hashVerifier(verifier, salt, SERVER_ITERATIONS)
    const now = nowIso()
    const id = newId('plr')

    try {
      await c.env.DB.prepare(
        `INSERT INTO players
           (id, nickname, nickname_lower, display_name, password_hash, password_salt,
            password_iterations, avatar_color, created_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          id,
          nickname,
          nicknameLower,
          nickname,
          hash,
          salt,
          SERVER_ITERATIONS,
          avatarColorFor(nicknameLower),
          now,
          now,
        )
        .run()
    } catch (error) {
      // Due registrazioni contemporanee sullo stesso nickname: vince la prima,
      // l'altra incontra il vincolo di unicita'.
      if (String(error).includes('UNIQUE')) {
        fail(409, 'NICKNAME_TAKEN', 'Questo nickname è già preso. Provane un altro.')
      }
      throw error
    }

    await issueSession(c, id)

    const row = await c.env.DB.prepare('SELECT * FROM players WHERE id = ?')
      .bind(id)
      .first<PlayerRow>()
    if (!row) fail(500, 'PLAYER_MISSING', 'Registrazione non completata, riprova.')

    return c.json<{ player: Player }>({ player: toPlayer(row) }, 201)
  })

  .post('/login', async (c) => {
    const { nickname, verifier } = readCredentials(await c.req.json().catch(() => null))

    const row = await c.env.DB.prepare('SELECT * FROM players WHERE nickname_lower = ?')
      .bind(nickname.toLowerCase())
      .first<PlayerRow>()

    // Se il nickname non esiste la derivazione viene eseguita comunque, su un
    // salt finto: senza questo il tempo di risposta rivelerebbe quali nickname
    // sono registrati. Il messaggio d'errore e' lo stesso nei due casi.
    const hash = await hashVerifier(
      verifier,
      row?.password_salt ?? DUMMY_SALT,
      row?.password_iterations ?? SERVER_ITERATIONS,
    )
    if (!row || !constantTimeEqual(hash, row.password_hash)) {
      fail(401, 'BAD_CREDENTIALS', 'Nickname o password non corretti.')
    }

    await issueSession(c, row.id)
    await markSeen(c, row.id)

    return c.json<{ player: Player }>({ player: toPlayer(row) })
  })

  .post('/logout', async (c) => {
    await revokeSession(c)
    return c.json({ ok: true })
  })

  /** Cambio password: richiede il verifier attuale e quello nuovo. */
  .post('/password', requireAuth, async (c) => {
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
    const current = body?.currentVerifier
    const next = body?.newVerifier
    if (typeof current !== 'string' || typeof next !== 'string') {
      fail(400, 'BAD_REQUEST', 'Richiesta non valida.')
    }
    if (next.length !== VERIFIER_LENGTH) {
      fail(400, 'BAD_VERIFIER', 'Credenziali in un formato non riconosciuto.')
    }

    const player = c.get('player')
    const row = await c.env.DB.prepare('SELECT * FROM players WHERE id = ?')
      .bind(player.id)
      .first<PlayerRow>()
    if (!row) fail(404, 'PLAYER_MISSING', 'Giocatore non trovato.')

    const currentHash = await hashVerifier(current, row.password_salt, row.password_iterations)
    if (!constantTimeEqual(currentHash, row.password_hash)) {
      fail(401, 'BAD_CREDENTIALS', 'La password attuale non è corretta.')
    }

    const salt = toBase64(randomSalt())
    const hash = await hashVerifier(next, salt, SERVER_ITERATIONS)
    await c.env.DB.prepare(
      'UPDATE players SET password_hash = ?, password_salt = ?, password_iterations = ? WHERE id = ?',
    )
      .bind(hash, salt, SERVER_ITERATIONS, player.id)
      .run()

    // Gli altri dispositivi vanno disconnessi: e' il senso di cambiare password.
    await revokeAllSessions(c, player.id, true)

    return c.json({ ok: true })
  })

  /** Esce da tutti i dispositivi, incluso quello corrente. */
  .post('/logout-all', requireAuth, async (c) => {
    const player = c.get('player')
    await revokeAllSessions(c, player.id, false)
    await revokeSession(c)
    return c.json({ ok: true })
  })

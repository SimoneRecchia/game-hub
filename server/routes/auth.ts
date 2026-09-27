import { Hono } from 'hono'
import {
  AVATAR_COLORS,
  CODE_LENGTH,
  CODE_RESEND_COOLDOWN_SECONDS,
  CODE_TTL_MINUTES,
  EMAIL_MAX,
  EMAIL_PATTERN,
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
import type { AuthConfig, Player } from '../../shared/types'
import { toPlayer, type AppEnv, type Bindings, type PlayerRow } from '../types'
import { fail, newId, nowIso } from '../lib/http'
import {
  issueSession,
  markSeen,
  optionalPlayer,
  requireAuth,
  revokeAllSessions,
  revokeSession,
} from '../lib/session'
import { consumeCode, issueCode, resendWaitSeconds, type CodePurpose } from '../lib/codes'
import {
  emailVerificationEnabled,
  nicknameMessage,
  resetPasswordMessage,
  sendEmail,
  verifyEmailMessage,
} from '../lib/email'

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

function readEmail(value: unknown): string {
  if (typeof value !== 'string') fail(400, 'EMAIL_REQUIRED', 'Scrivi l’email.')
  const email = value.trim()
  if (email.length === 0) fail(400, 'EMAIL_REQUIRED', 'Scrivi l’email.')
  if (email.length > EMAIL_MAX) fail(400, 'EMAIL_INVALID', "Questa email è troppo lunga.")
  if (!EMAIL_PATTERN.test(email)) fail(400, 'EMAIL_INVALID', "Questa email non sembra valida.")
  return email
}

/**
 * Manda un codice, se si può.
 *
 * Restituisce false quando l'invio non e' configurato: le rotte lo trasformano
 * in un messaggio che dice cosa manca, invece di un 500 opaco.
 */
async function inviaCodice(
  env: Bindings,
  player: { id: string; nickname: string; email: string },
  purpose: CodePurpose,
): Promise<boolean> {
  const code = await issueCode(env.DB, player.id, purpose)
  const corpo =
    purpose === 'verify_email'
      ? verifyEmailMessage(player.nickname, code, CODE_TTL_MINUTES)
      : resetPasswordMessage(player.nickname, code, CODE_TTL_MINUTES)

  const esito = await sendEmail(env, { to: player.email, ...corpo })
  if (!esito.ok) {
    // Il dettaglio resta nei log di Cloudflare: al client non serve, e potrebbe
    // contenere la risposta del servizio di posta.
    console.error(`Invio email fallito (${esito.reason}): ${esito.detail}`)
    return false
  }
  return true
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
    if (!player) fail(401, 'NOT_AUTHENTICATED', 'Accedi per continuare.')
    return c.json<{ player: Player }>({ player })
  })

  .post('/register', async (c) => {
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
    const { nickname, verifier } = readCredentials(body)
    const email = readEmail(body?.email)
    const nicknameLower = nickname.toLowerCase()
    const emailLower = email.toLowerCase()

    const existing = await c.env.DB.prepare('SELECT id FROM players WHERE nickname_lower = ?')
      .bind(nicknameLower)
      .first<{ id: string }>()
    if (existing) {
      fail(409, 'NICKNAME_TAKEN', 'Questo nickname è già preso. Provane un altro.')
    }

    const emailUsata = await c.env.DB.prepare(
      'SELECT id FROM players WHERE email_lower = ?',
    )
      .bind(emailLower)
      .first<{ id: string }>()
    if (emailUsata) {
      fail(409, 'EMAIL_TAKEN', 'Questa email è già registrata.')
    }

    const salt = toBase64(randomSalt())
    const hash = await hashVerifier(verifier, salt, SERVER_ITERATIONS)
    const now = nowIso()
    const id = newId('plr')

    try {
      await c.env.DB.prepare(
        `INSERT INTO players
           (id, nickname, nickname_lower, display_name, password_hash, password_salt,
            password_iterations, avatar_color, created_at, last_seen_at,
            email, email_lower, email_verified_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          email,
          emailLower,
          // Quando la verifica non e' attiva l'account nasce già confermato:
          // l'email resta raccolta per il recupero password, ma non si puo'
          // pretendere un codice senza il modo di spedirlo.
          emailVerificationEnabled(c.env) ? null : now,
        )
        .run()
    } catch (error) {
      // Due registrazioni contemporanee sullo stesso nickname: vince la prima,
      // l'altra incontra il vincolo di unicita'.
      const testo = String(error)
      if (testo.includes('UNIQUE') && testo.includes('email')) {
        fail(409, 'EMAIL_TAKEN', 'Questa email è già registrata.')
      }
      if (testo.includes('UNIQUE')) {
        fail(409, 'NICKNAME_TAKEN', 'Questo nickname è già preso. Provane un altro.')
      }
      throw error
    }

    /*
     * La sessione viene rilasciata subito, anche quando l'email va ancora
     * verificata: così il giocatore resta sul suo account, puo' farsi
     * rimandare il codice e non perde il nickname appena scelto. Le rotte di
     * gioco restano chiuse finche' non conferma (vedi requireVerified).
     */
    await issueSession(c, id)

    if (emailVerificationEnabled(c.env)) {
      const inviata = await inviaCodice(c.env, { id, nickname, email }, 'verify_email')
      if (!inviata) {
        fail(502, 'EMAIL_SEND_FAILED', 'Non riesco a mandare il codice. Riprova fra un minuto.')
      }
    }

    const row = await c.env.DB.prepare('SELECT * FROM players WHERE id = ?')
      .bind(id)
      .first<PlayerRow>()
    if (!row) fail(500, 'PLAYER_MISSING', 'Non riesco a completare la registrazione. Riprova.')

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


  /* ────────────────────  Verifica dell'email  ──────────────────── */

  /**
   * Cosa deve sapere il client prima di disegnare la schermata di accesso.
   *
   * Aperta senza sessione: serve a decidere se mostrare il passaggio del
   * codice, e va saputo prima di registrarsi.
   */
  .get('/config', (c) =>
    c.json<AuthConfig>({ emailVerificationRequired: emailVerificationEnabled(c.env) }),
  )

  /** Conferma l'email col codice ricevuto. */
  .post('/verify', requireAuth, async (c) => {
    const body = (await c.req.json().catch(() => null)) as { code?: unknown } | null
    const code = typeof body?.code === 'string' ? body.code.trim() : ''
    if (!new RegExp(`^\\d{${CODE_LENGTH}}$`).test(code)) {
      fail(400, 'BAD_CODE_FORMAT', `Il codice è di ${CODE_LENGTH} cifre.`)
    }

    const player = c.get('player')
    if (player.emailVerified) return c.json<{ player: Player }>({ player })

    const esito = await consumeCode(c.env.DB, player.id, 'verify_email', code)
    if (!esito.ok) {
      if (esito.reason === 'missing') {
        fail(409, 'CODE_MISSING', 'Nessun codice in attesa. Chiedine uno nuovo.')
      }
      if (esito.reason === 'expired') {
        fail(409, 'CODE_EXPIRED', 'Il codice è scaduto. Chiedine uno nuovo.')
      }
      if (esito.reason === 'burned') {
        fail(429, 'CODE_BURNED', 'Troppi tentativi. Chiedi un codice nuovo.')
      }
      fail(
        400,
        'CODE_WRONG',
        esito.attemptsLeft > 0
          ? `Codice non corretto. Hai ancora ${esito.attemptsLeft} ${esito.attemptsLeft === 1 ? 'tentativo' : 'tentativi'}.`
          : 'Codice non corretto. Chiedi un codice nuovo.',
      )
    }

    await c.env.DB.prepare('UPDATE players SET email_verified_at = ? WHERE id = ?')
      .bind(nowIso(), player.id)
      .run()

    const row = await c.env.DB.prepare('SELECT * FROM players WHERE id = ?')
      .bind(player.id)
      .first<PlayerRow>()
    if (!row) fail(500, 'PLAYER_MISSING', 'Giocatore non trovato.')
    return c.json<{ player: Player }>({ player: toPlayer(row) })
  })

  /** Rimanda il codice di verifica, con un'attesa minima fra due invii. */
  .post('/verify/resend', requireAuth, async (c) => {
    const player = c.get('player')
    if (player.emailVerified) fail(409, 'ALREADY_VERIFIED', 'Email già confermata.')
    if (!player.email) fail(409, 'NO_EMAIL', 'Questo account non ha un’email.')
    if (!emailVerificationEnabled(c.env)) {
      fail(503, 'EMAIL_DISABLED', 'L’invio delle email non è attivo.')
    }

    const attesa = await resendWaitSeconds(c.env.DB, player.id, 'verify_email')
    if (attesa > 0) {
      // "secondo" e "secondi": la schermata del codice legge il numero con /(\d+)\s*second/.
      fail(429, 'RESEND_TOO_SOON', `Riprova fra ${attesa} ${attesa === 1 ? 'secondo' : 'secondi'}.`)
    }

    const inviata = await inviaCodice(
      c.env,
      { id: player.id, nickname: player.nickname, email: player.email },
      'verify_email',
    )
    if (!inviata) {
      fail(502, 'EMAIL_SEND_FAILED', 'Non riesco a mandare il codice. Riprova fra un minuto.')
    }
    return c.json({ ok: true, cooldownSeconds: CODE_RESEND_COOLDOWN_SECONDS })
  })

  /* ────────────────────  Password dimenticata  ──────────────────── */

  /**
   * Chiede un codice per reimpostare la password.
   *
   * Risponde sempre 200, anche se nickname o email non esistono: dire "questo
   * account non c'e'" trasformerebbe questa rotta in un modo per scoprire chi
   * e' iscritto.
   */
  .post('/reset/request', async (c) => {
    const body = (await c.req.json().catch(() => null)) as { identifier?: unknown } | null
    const identifier = typeof body?.identifier === 'string' ? body.identifier.trim() : ''
    if (identifier.length === 0) {
      fail(400, 'BAD_REQUEST', 'Scrivi il tuo nickname o la tua email.')
    }

    const generico = { ok: true as const, cooldownSeconds: CODE_RESEND_COOLDOWN_SECONDS }
    if (!emailVerificationEnabled(c.env)) {
      fail(503, 'EMAIL_DISABLED', 'Il recupero della password non è disponibile.')
    }

    const lower = identifier.toLowerCase()
    const row = await c.env.DB.prepare(
      'SELECT * FROM players WHERE nickname_lower = ? OR email_lower = ?',
    )
      .bind(lower, lower)
      .first<PlayerRow>()

    if (!row || !row.email) return c.json(generico)

    // Anche l'attesa fra due invii non deve rivelare nulla: si esce comunque
    // con la stessa risposta.
    if ((await resendWaitSeconds(c.env.DB, row.id, 'reset_password')) > 0) {
      return c.json(generico)
    }

    await inviaCodice(
      c.env,
      { id: row.id, nickname: row.nickname, email: row.email },
      'reset_password',
    )
    return c.json(generico)
  })

  /**
   * Manda il nickname a chi lo ha dimenticato, all'email con cui si e' iscritto.
   *
   * Come la richiesta del codice, risponde sempre allo stesso modo: che l'email
   * sia registrata o no, la schermata dice "se c'e', ti abbiamo scritto". Il
   * nickname lo legge solo chi apre quella casella di posta, cioe' il suo
   * proprietario. Uno al minuto per persona, con un `UPDATE` condizionato: due
   * richieste ravvicinate non mandano due email.
   */
  .post('/nickname/request', async (c) => {
    const body = (await c.req.json().catch(() => null)) as { email?: unknown } | null
    const email = readEmail(body?.email)
    if (!emailVerificationEnabled(c.env)) {
      fail(503, 'EMAIL_DISABLED', 'Il recupero del nickname non è disponibile.')
    }

    const generico = { ok: true as const, cooldownSeconds: CODE_RESEND_COOLDOWN_SECONDS }
    const row = await c.env.DB.prepare(
      'SELECT id, nickname, email FROM players WHERE email_lower = ?',
    )
      .bind(email.toLowerCase())
      .first<{ id: string; nickname: string; email: string }>()
    if (!row) return c.json(generico)

    const adesso = new Date()
    const soglia = new Date(adesso.getTime() - CODE_RESEND_COOLDOWN_SECONDS * 1000).toISOString()
    const presa = await c.env.DB.prepare(
      `UPDATE players SET nickname_email_at = ?
        WHERE id = ? AND (nickname_email_at IS NULL OR nickname_email_at < ?)`,
    )
      .bind(adesso.toISOString(), row.id, soglia)
      .run()
    if (presa.meta.changes !== 1) return c.json(generico)

    const esito = await sendEmail(c.env, { to: row.email, ...nicknameMessage(row.nickname) })
    if (!esito.ok) console.error(`Invio del nickname fallito (${esito.reason}): ${esito.detail}`)
    return c.json(generico)
  })

  /**
   * Imposta la nuova password usando il codice ricevuto.
   *
   * Qui serve il **nickname**, non l'email, anche se il codice si puo' chiedere
   * con entrambi. Il motivo sta in shared/password.ts: il salt del verifier si
   * deriva dal nickname, quindi un verifier calcolato sull'email non
   * corrisponderebbe a quello che il login produrra' dopo — la nuova password
   * risulterebbe subito sbagliata.
   */
  .post('/reset/confirm', async (c) => {
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
    const nickname = typeof body?.nickname === 'string' ? body.nickname.trim() : ''
    const code = typeof body?.code === 'string' ? body.code.trim() : ''
    const verifier = typeof body?.verifier === 'string' ? body.verifier : ''

    if (nickname.length === 0) fail(400, 'BAD_REQUEST', 'Scrivi il nickname.')
    if (nickname.includes('@')) {
      fail(400, 'NICKNAME_REQUIRED', 'Scrivi il nickname, non l’email.')
    }
    if (!new RegExp(`^\\d{${CODE_LENGTH}}$`).test(code)) {
      fail(400, 'BAD_CODE_FORMAT', `Il codice è di ${CODE_LENGTH} cifre.`)
    }
    if (verifier.length !== VERIFIER_LENGTH || !/^[A-Za-z0-9+/]+=*$/.test(verifier)) {
      fail(400, 'BAD_VERIFIER', 'Credenziali in un formato non riconosciuto.')
    }

    const row = await c.env.DB.prepare('SELECT * FROM players WHERE nickname_lower = ?')
      .bind(nickname.toLowerCase())
      .first<PlayerRow>()

    /*
     * Messaggio generico, uguale per "nickname inesistente" e "codice
     * sbagliato": a questo punto chi scrive dovrebbe già conoscere un codice,
     * e distinguere i due casi direbbe soltanto chi e' iscritto.
     *
     * Le chiamate a `fail` sono dirette e non passano da una funzione di
     * comodo: TypeScript restringe il tipo solo sulle chiamate dirette a una
     * funzione dichiarata `never`.
     */
    const MESSAGGIO_INVALIDO = 'Codice non valido o scaduto. Chiedine uno nuovo.'
    if (!row) fail(400, 'RESET_INVALID', MESSAGGIO_INVALIDO)

    const esito = await consumeCode(c.env.DB, row.id, 'reset_password', code)
    if (!esito.ok) {
      if (esito.reason === 'burned') {
        fail(429, 'CODE_BURNED', 'Troppi tentativi. Chiedi un codice nuovo.')
      }
      fail(400, 'RESET_INVALID', MESSAGGIO_INVALIDO)
    }

    const salt = toBase64(randomSalt())
    const hash = await hashVerifier(verifier, salt, SERVER_ITERATIONS)
    await c.env.DB.prepare(
      `UPDATE players
          SET password_hash = ?, password_salt = ?, password_iterations = ?,
              email_verified_at = COALESCE(email_verified_at, ?)
        WHERE id = ?`,
    )
      .bind(hash, salt, SERVER_ITERATIONS, nowIso(), row.id)
      .run()

    /*
     * Chi cambia password da questa via va disconnesso da tutti i dispositivi:
     * se qualcun altro era entrato, deve smettere di esserlo. La nuova sessione
     * viene rilasciata subito dopo, così chi ha appena reimpostato entra senza
     * dover rifare l'accesso.
     */
    await revokeAllSessions(c, row.id, false)
    await issueSession(c, row.id)

    const fresh = await c.env.DB.prepare('SELECT * FROM players WHERE id = ?')
      .bind(row.id)
      .first<PlayerRow>()
    if (!fresh) fail(500, 'PLAYER_MISSING', 'Giocatore non trovato.')
    return c.json<{ player: Player }>({ player: toPlayer(fresh) })
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

import { Hono, type Context } from 'hono'
import {
  AVATAR_COLORS,
  CODE_LOGIN_PER_DAY,
  CODE_RESEND_COOLDOWN_SECONDS,
  CODE_TTL_MINUTES,
  EMAIL_MAX,
  NICKNAME_OGNI_GIORNI,
} from '../../shared/config'
import type { AuthConfig, CodiceMandato, Player } from '../../shared/types'
import { nicknameCambiabileDal, toPlayer, type AppEnv, type Bindings, type PlayerRow } from '../types'
import { fail, newId, nowIso } from '../lib/http'
import {
  issueSession,
  markSeen,
  optionalPlayer,
  requireAuth,
  revokeAllSessions,
  revokeSession,
} from '../lib/session'
import { codesLastDay, consumeCode, issueCode, resendWaitSeconds, type CodePurpose } from '../lib/codes'
import {
  daQuestoComputer,
  emailVerificationEnabled,
  loginMessage,
  nicknameMessage,
  sendEmail,
  verifyEmailMessage,
} from '../lib/email'
import { readCode, readEmail, readNickname } from '../lib/campi'

/*
 * L'accesso e' senza password: chi si registra sceglie il nickname e da'
 * l'email, e si entra con un codice di sei cifre mandato a quell'email. Le
 * sessioni durano un anno, quindi il codice serve di rado: a un telefono nuovo,
 * o dopo essere usciti.
 */

/** Il nickname o l'email con cui si entra: un nickname non ha la chiocciola, un'email si'. */
function readIdentifier(value: unknown): string {
  const identifier = typeof value === 'string' ? value.trim() : ''
  if (identifier.length === 0) fail(400, 'IDENTIFIER_REQUIRED', 'Scrivi il nickname o l’email.')
  if (identifier.length > EMAIL_MAX) fail(400, 'IDENTIFIER_INVALID', 'Questo nickname o email è troppo lungo.')
  return identifier
}


type Destinatario = { id: string; nickname: string; email: string }

/**
 * Manda per posta un codice gia' creato. Restituisce false quando l'invio non
 * riesce: le rotte decidono se dirlo, e il dettaglio resta nei log.
 */
async function mandaCodice(env: Bindings, player: Destinatario, purpose: CodePurpose, code: string): Promise<boolean> {
  const corpo =
    purpose === 'verify_email'
      ? verifyEmailMessage(player.nickname, code, CODE_TTL_MINUTES)
      : loginMessage(player.nickname, code, CODE_TTL_MINUTES)

  const esito = await sendEmail(env, { to: player.email, ...corpo })
  if (!esito.ok) {
    // Al client non serve, e potrebbe contenere la risposta del servizio di posta.
    console.error(`Invio email fallito (${esito.reason}): ${esito.detail}`)
    return false
  }
  return true
}

/** Crea un codice e lo manda, aspettando l'invio: per chi deve sapere se e' partito. */
async function inviaCodice(env: Bindings, player: Destinatario, purpose: CodePurpose): Promise<boolean> {
  return mandaCodice(env, player, purpose, await issueCode(env.DB, player.id, purpose))
}

/**
 * Quel che puo' finire dopo la risposta. L'invio dell'email ci mette qualche
 * decimo di secondo: aspettandolo, la risposta per un account che esiste
 * arriverebbe dopo quella per uno che non c'e', e i tempi direbbero chi e'
 * iscritto. Senza un contesto, come nei test, si aspetta.
 */
async function dopoLaRisposta(c: Context<AppEnv>, lavoro: Promise<unknown>): Promise<void> {
  try {
    c.executionCtx.waitUntil(lavoro)
  } catch {
    await lavoro
  }
}

/** Il giocatore di un nickname o di un'email. */
function trovaGiocatore(db: D1Database, identifier: string): Promise<PlayerRow | null> {
  const lower = identifier.toLowerCase()
  return db
    .prepare('SELECT * FROM players WHERE nickname_lower = ? OR email_lower = ?')
    .bind(lower, lower)
    .first<PlayerRow>()
}

/** "il 16 ottobre": quando si potra' cambiare di nuovo il nickname. */
function giornoDi(iso: string): string {
  return new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', timeZone: 'Europe/Rome' })
}

/**
 * Il nickname nuovo, se si puo' prendere: cambiato, libero, e passata una
 * settimana dall'ultimo cambio. Le stesse domande prima di mandare il codice e
 * quando torna, perché nel frattempo qualcuno puo' averlo preso.
 */
async function nicknameNuovo(db: D1Database, io: string, valore: unknown): Promise<{ row: PlayerRow; nuovo: string }> {
  const nuovo = readNickname(valore)
  const row = await db.prepare('SELECT * FROM players WHERE id = ?').bind(io).first<PlayerRow>()
  if (!row) fail(401, 'NOT_AUTHENTICATED', 'Accedi per continuare.')
  if (nuovo === row.nickname) fail(400, 'NICKNAME_UGUALE', 'È già il tuo nickname.')
  const dal = nicknameCambiabileDal(row)
  if (dal) fail(429, 'NICKNAME_TROPPO_PRESTO', `Il nickname si cambia una volta a settimana: di nuovo dal ${giornoDi(dal)}.`)
  // Lo stesso nome con le maiuscole cambiate e' ancora il proprio.
  const preso = await db
    .prepare('SELECT id FROM players WHERE nickname_lower = ? AND id <> ?')
    .bind(nuovo.toLowerCase(), io)
    .first<{ id: string }>()
  if (preso) fail(409, 'NICKNAME_TAKEN', 'Questo nickname è già preso. Provane un altro.')
  return { row, nuovo }
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

  /**
   * La registrazione: il nickname e l'email, nient'altro. La sessione parte
   * subito, e quando la posta e' attiva l'email si conferma con un codice
   * prima di giocare (vedi requireVerified): chi si registra resta sul suo
   * account e non perde il nickname appena scelto.
   */
  .post('/register', async (c) => {
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
    const nickname = readNickname(body?.nickname)
    const email = readEmail(body?.email)
    const nicknameLower = nickname.toLowerCase()
    const emailLower = email.toLowerCase()

    const existing = await c.env.DB.prepare('SELECT id FROM players WHERE nickname_lower = ?')
      .bind(nicknameLower)
      .first<{ id: string }>()
    if (existing) {
      fail(409, 'NICKNAME_TAKEN', 'Questo nickname è già preso. Provane un altro.')
    }

    const emailUsata = await c.env.DB.prepare('SELECT id FROM players WHERE email_lower = ?')
      .bind(emailLower)
      .first<{ id: string }>()
    if (emailUsata) {
      fail(409, 'EMAIL_TAKEN', 'Questa email è già registrata: entra da «Accedi».')
    }

    const now = nowIso()
    const id = newId('plr')
    try {
      // Le colonne della password ci sono ancora, e sono NOT NULL: restano vuote (vedi la migrazione 0032).
      await c.env.DB.prepare(
        `INSERT INTO players
           (id, nickname, nickname_lower, display_name, password_hash, password_salt,
            password_iterations, avatar_color, created_at, last_seen_at,
            email, email_lower, email_verified_at)
         VALUES (?, ?, ?, ?, '', '', 0, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          id,
          nickname,
          nicknameLower,
          nickname,
          avatarColorFor(nicknameLower),
          now,
          now,
          email,
          emailLower,
          // Senza la posta l'account nasce confermato: non si puo' pretendere un codice senza il modo di spedirlo.
          emailVerificationEnabled(c.env) ? null : now,
        )
        .run()
    } catch (error) {
      // Due registrazioni contemporanee sullo stesso nickname: vince la prima,
      // l'altra incontra il vincolo di unicita'.
      const testo = String(error)
      if (testo.includes('UNIQUE') && testo.includes('email')) {
        fail(409, 'EMAIL_TAKEN', 'Questa email è già registrata: entra da «Accedi».')
      }
      if (testo.includes('UNIQUE')) {
        fail(409, 'NICKNAME_TAKEN', 'Questo nickname è già preso. Provane un altro.')
      }
      throw error
    }

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

  /**
   * Il codice per entrare, all'email dell'account, chiesto con il nickname o
   * con l'email.
   *
   * Risponde sempre allo stesso modo, che l'account esista o no, e anche
   * quando un codice non parte per l'attesa fra due invii o per il tetto del
   * giorno: dire "non c'e'" trasformerebbe la rotta in un modo per scoprire chi
   * e' iscritto. Il codice lo legge solo chi apre quella casella di posta.
   */
  .post('/login/code', async (c) => {
    const body = (await c.req.json().catch(() => null)) as { identifier?: unknown } | null
    const identifier = readIdentifier(body?.identifier)

    const posta = emailVerificationEnabled(c.env)
    const inLocale = !posta && daQuestoComputer(c.req.url)
    if (!posta && !inLocale) {
      fail(503, 'EMAIL_DISABLED', 'Adesso non si può entrare: manca l’invio delle email.')
    }

    const generico: CodiceMandato = { ok: true, cooldownSeconds: CODE_RESEND_COOLDOWN_SECONDS }
    const row = await trovaGiocatore(c.env.DB, identifier)
    // Un account sospeso non riceve codici, e la risposta e' la stessa: non dice chi e' sospeso.
    if (!row || !row.email || row.sospeso_at) return c.json(generico)
    if ((await resendWaitSeconds(c.env.DB, row.id, 'login')) > 0) return c.json(generico)
    if ((await codesLastDay(c.env.DB, row.id, 'login')) >= CODE_LOGIN_PER_DAY) return c.json(generico)

    const code = await issueCode(c.env.DB, row.id, 'login')
    if (inLocale) {
      console.log(`Il codice per entrare come ${row.nickname} è ${code}`)
      return c.json<CodiceMandato>({ ...generico, codiceDiProva: code })
    }
    await dopoLaRisposta(c, mandaCodice(c.env, { id: row.id, nickname: row.nickname, email: row.email }, 'login', code))
    return c.json(generico)
  })

  /**
   * Si entra con il codice. Lo stesso messaggio per un account che non c'e' e
   * per un codice sbagliato, scaduto o bruciato: distinguerli direbbe chi e'
   * iscritto. Entrare con il codice conferma anche l'email, perché la si ha in
   * mano.
   */
  .post('/login', async (c) => {
    const body = (await c.req.json().catch(() => null)) as { identifier?: unknown; code?: unknown } | null
    const identifier = readIdentifier(body?.identifier)
    const code = readCode(body?.code)

    const INVALIDO = 'Codice non valido o scaduto. Controlla le cifre, o chiedine uno nuovo.'
    const row = await trovaGiocatore(c.env.DB, identifier)
    if (!row) fail(400, 'CODE_INVALID', INVALIDO)
    const esito = await consumeCode(c.env.DB, row.id, 'login', code)
    if (!esito.ok) fail(400, 'CODE_INVALID', INVALIDO)
    if (row.sospeso_at) fail(403, 'SOSPESO', 'Questo account è sospeso.')

    await c.env.DB.prepare('UPDATE players SET email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?')
      .bind(nowIso(), row.id)
      .run()
    await issueSession(c, row.id)
    await markSeen(c, row.id)

    const fresh = await c.env.DB.prepare('SELECT * FROM players WHERE id = ?')
      .bind(row.id)
      .first<PlayerRow>()
    if (!fresh) fail(500, 'PLAYER_MISSING', 'Giocatore non trovato.')
    return c.json<{ player: Player }>({ player: toPlayer(fresh) })
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
    const code = readCode(body?.code)

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

  /* ────────────────────  Il cambio del nickname  ──────────────────── */

  /**
   * Il codice per cambiare il nickname, all'email dell'account: chi ha il
   * telefono di un altro in mano non gli cambia il nome. Qui non serve
   * rispondere sempre allo stesso modo: chi chiede e' gia' dentro, e sa di
   * avere un account.
   */
  .post('/nickname/code', requireAuth, async (c) => {
    const body = (await c.req.json().catch(() => null)) as { nickname?: unknown } | null
    const io = c.get('player').id
    const { row, nuovo } = await nicknameNuovo(c.env.DB, io, body?.nickname)
    if (!row.email) fail(409, 'NO_EMAIL', 'Questo account non ha un’email a cui mandare il codice.')

    const posta = emailVerificationEnabled(c.env)
    const inLocale = !posta && daQuestoComputer(c.req.url)
    if (!posta && !inLocale) fail(503, 'EMAIL_DISABLED', 'L’invio delle email non è attivo.')

    const attesa = await resendWaitSeconds(c.env.DB, io, 'nickname')
    if (attesa > 0) fail(429, 'RESEND_TOO_SOON', `Riprova fra ${attesa} ${attesa === 1 ? 'secondo' : 'secondi'}.`)
    if ((await codesLastDay(c.env.DB, io, 'nickname')) >= CODE_LOGIN_PER_DAY) {
      fail(429, 'TROPPI_CODICI', 'Oggi hai chiesto troppi codici. Riprova domani.')
    }

    const code = await issueCode(c.env.DB, io, 'nickname')
    const risposta: CodiceMandato = { ok: true, cooldownSeconds: CODE_RESEND_COOLDOWN_SECONDS }
    if (inLocale) {
      console.log(`Il codice per cambiare il nickname di ${row.nickname} è ${code}`)
      return c.json<CodiceMandato>({ ...risposta, codiceDiProva: code })
    }
    const esito = await sendEmail(c.env, { to: row.email, ...nicknameMessage(row.nickname, nuovo, code, CODE_TTL_MINUTES) })
    if (!esito.ok) {
      console.error(`Invio email fallito (${esito.reason}): ${esito.detail}`)
      fail(502, 'EMAIL_SEND_FAILED', 'Non riesco a mandare il codice. Riprova fra un minuto.')
    }
    return c.json(risposta)
  })

  /**
   * Il nickname nuovo, con il codice. L'UPDATE guarda di nuovo la settimana,
   * cosi' due richieste insieme non lo cambiano due volte; l'unicita' la tiene
   * l'indice di `nickname_lower`, anche contro chi si registra nello stesso
   * istante con lo stesso nome. Il colore dell'avatar resta quello di prima.
   */
  .post('/nickname', requireAuth, async (c) => {
    const body = (await c.req.json().catch(() => null)) as { nickname?: unknown; code?: unknown } | null
    const io = c.get('player').id
    const { nuovo } = await nicknameNuovo(c.env.DB, io, body?.nickname)
    const code = readCode(body?.code)

    const esito = await consumeCode(c.env.DB, io, 'nickname', code)
    if (!esito.ok) {
      if (esito.reason === 'missing') fail(409, 'CODE_MISSING', 'Nessun codice in attesa. Chiedine uno nuovo.')
      if (esito.reason === 'expired') fail(409, 'CODE_EXPIRED', 'Il codice è scaduto. Chiedine uno nuovo.')
      if (esito.reason === 'burned') fail(429, 'CODE_BURNED', 'Troppi tentativi. Chiedi un codice nuovo.')
      fail(
        400,
        'CODE_WRONG',
        esito.attemptsLeft > 0
          ? `Codice non corretto. Hai ancora ${esito.attemptsLeft} ${esito.attemptsLeft === 1 ? 'tentativo' : 'tentativi'}.`
          : 'Codice non corretto. Chiedi un codice nuovo.',
      )
    }

    const adesso = new Date()
    const settimanaFa = new Date(adesso.getTime() - NICKNAME_OGNI_GIORNI * 86_400_000).toISOString()
    let cambiate = 0
    try {
      const r = await c.env.DB.prepare(
        `UPDATE players SET nickname = ?, nickname_lower = ?, display_name = ?, nickname_changed_at = ?
          WHERE id = ? AND (nickname_changed_at IS NULL OR nickname_changed_at <= ?)`,
      )
        .bind(nuovo, nuovo.toLowerCase(), nuovo, adesso.toISOString(), io, settimanaFa)
        .run()
      cambiate = r.meta.changes ?? 0
    } catch (error) {
      if (String(error).includes('UNIQUE')) fail(409, 'NICKNAME_TAKEN', 'Questo nickname è già preso. Provane un altro.')
      throw error
    }
    if (cambiate !== 1) fail(429, 'NICKNAME_TROPPO_PRESTO', 'Il nickname si cambia una volta a settimana.')

    const row = await c.env.DB.prepare('SELECT * FROM players WHERE id = ?').bind(io).first<PlayerRow>()
    if (!row) fail(500, 'PLAYER_MISSING', 'Giocatore non trovato.')
    return c.json<{ player: Player }>({ player: toPlayer(row) })
  })

  /** Esce da tutti i dispositivi, incluso quello corrente. */
  .post('/logout-all', requireAuth, async (c) => {
    const player = c.get('player')
    await revokeAllSessions(c, player.id, false)
    await revokeSession(c)
    return c.json({ ok: true })
  })

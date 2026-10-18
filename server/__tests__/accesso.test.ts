import { afterEach, describe, expect, it, vi } from 'vitest'
import { CODE_LOGIN_PER_DAY, CODE_MAX_ATTEMPTS } from '../../shared/config'
import { generateSessionToken, hashSessionToken } from '../../shared/session'
import type { CodiceMandato, Player } from '../../shared/types'
import { createApp } from '../app'
import type { Bindings } from '../types'
import { ASSETS_FINTI, ProvaD1, applica, banco, migrazioni, type Giocatore } from './banco'

/** Il cookie di sessione rilasciato da una risposta, pronto da rimandare. */
function sessione(intestazioni?: Headers): Giocatore {
  const cookie = (intestazioni?.get('set-cookie') ?? '').split(';')[0]
  return { id: '', nickname: '', cookie }
}

/** Un codice diverso da quello giusto. */
const sbagliato = (giusto: string) => giusto.replace(/.$/, (c) => String((Number(c) + 1) % 10))

const GIADA = { nickname: 'Giada', email: 'giada@example.com' }

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('l’accesso senza password', () => {
  it('ci si registra con il nickname e l’email, e si resta dentro', async () => {
    const { chiama } = banco()
    const r = await chiama<{ player: Player }>('POST', '/auth/register', null, GIADA)
    expect(r.status).toBe(201)
    expect(r.dati.player.nickname).toBe('Giada')
    expect(r.dati.player.email).toBe('giada@example.com')
    // Senza la posta l'account nasce confermato: non si puo' chiedere un codice che non parte.
    expect(r.dati.player.emailVerified).toBe(true)
    expect((await chiama('GET', '/auth/me', sessione(r.intestazioni))).status).toBe(200)
  })

  it('un nickname o un’email già presi non si registrano due volte', async () => {
    const { chiama } = banco()
    await chiama('POST', '/auth/register', null, GIADA)
    const altra = { ...GIADA, email: 'altra@example.com' }
    const nickname = await chiama<{ code: string }>('POST', '/auth/register', null, altra)
    expect(nickname.status).toBe(409)
    expect(nickname.dati.code).toBe('NICKNAME_TAKEN')
    const stessa = { nickname: 'Altra', email: GIADA.email }
    const email = await chiama<{ code: string }>('POST', '/auth/register', null, stessa)
    expect(email.status).toBe(409)
    expect(email.dati.code).toBe('EMAIL_TAKEN')
  })

  it('in locale, senza la posta, il codice torna nella risposta e si entra con quello, una volta', async () => {
    const { chiama } = banco()
    await chiama('POST', '/auth/register', null, GIADA)
    const mandato = await chiama<CodiceMandato>('POST', '/auth/login/code', null, { identifier: 'giada' })
    expect(mandato.status).toBe(200)
    const codice = mandato.dati.codiceDiProva!
    expect(codice).toMatch(/^\d{6}$/)

    const dentro = await chiama<{ player: Player }>('POST', '/auth/login', null, { identifier: 'GIADA', code: codice })
    expect(dentro.status).toBe(200)
    expect(dentro.dati.player.nickname).toBe('Giada')
    expect((await chiama('GET', '/auth/me', sessione(dentro.intestazioni))).status).toBe(200)

    // Lo stesso codice non vale due volte.
    const ancora = await chiama('POST', '/auth/login', null, { identifier: 'giada', code: codice })
    expect(ancora.status).toBe(400)
  })

  it('si entra anche con l’email, scritta come si vuole', async () => {
    const { chiama } = banco()
    await chiama('POST', '/auth/register', null, GIADA)
    const mandato = await chiama<CodiceMandato>('POST', '/auth/login/code', null, { identifier: 'Giada@Example.com' })
    const dentro = await chiama<{ player: Player }>('POST', '/auth/login', null, {
      identifier: 'giada@example.com',
      code: mandato.dati.codiceDiProva,
    })
    expect(dentro.status).toBe(200)
    expect(dentro.dati.player.nickname).toBe('Giada')
  })

  it('fuori da questo computer, senza la posta, non si entra e nessun codice esce', async () => {
    const { app, env, chiama } = banco()
    await chiama('POST', '/auth/register', null, GIADA)
    const r = await app.request(
      'https://giochi.example.com/api/auth/login/code',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ identifier: 'giada' }),
      },
      env,
    )
    expect(r.status).toBe(503)
    expect(await r.text()).not.toMatch(/\d{6}/)
  })

  it('le rotte delle password non ci sono più', async () => {
    const { chiama, giocatore } = banco()
    const g = await giocatore()
    for (const percorso of ['/auth/reset/request', '/auth/reset/confirm', '/auth/nickname/request', '/auth/password']) {
      expect((await chiama('POST', percorso, g, {})).status, percorso).toBe(404)
    }
  })
})

describe('l’accesso con la posta', () => {
  const POSTA: Partial<Bindings> = { EMAIL_VERIFICATION: 'on', RESEND_API_KEY: 'chiave-finta' }

  /** Le email che partono, al posto di Resend. */
  function postino() {
    const mandate: { to: string[]; subject: string; text: string }[] = []
    vi.stubGlobal('fetch', async (_url: unknown, init?: RequestInit) => {
      mandate.push(JSON.parse(String(init?.body)) as { to: string[]; subject: string; text: string })
      return new Response(JSON.stringify({ id: `m${mandate.length}` }), { status: 200 })
    })
    return mandate
  }
  const codiceDi = (email: { subject: string }) => /(\d{6})/.exec(email.subject)![1]

  it('chi si registra conferma l’email, e la conferma è anche il codice che serve per giocare', async () => {
    const mandate = postino()
    const { chiama } = banco(POSTA)
    const r = await chiama<{ player: Player }>('POST', '/auth/register', null, GIADA)
    expect(r.status).toBe(201)
    expect(r.dati.player.emailVerified).toBe(false)
    expect(mandate).toHaveLength(1)
    const confermata = await chiama<{ player: Player }>('POST', '/auth/verify', sessione(r.intestazioni), {
      code: codiceDi(mandate[0]),
    })
    expect(confermata.dati.player.emailVerified).toBe(true)
  })

  it('la registrazione in attesa tiene il nickname solo quanto vale il codice', async () => {
    const mandate = postino()
    const { chiama, db } = banco(POSTA)
    const r = await chiama<{ player: Player }>('POST', '/auth/register', null, GIADA)
    expect(r.dati.player.inAttesa).toBe(true)
    // Un altro, con un'altra email, trova il nickname prenotato.
    const altro = await chiama<{ code: string }>('POST', '/auth/register', null, {
      nickname: 'giada',
      email: 'x@example.com',
    })
    expect(altro.status).toBe(409)
    expect(altro.dati.code).toBe('NICKNAME_IN_ATTESA')
    // Passato il tempo del codice senza conferma, il nickname torna libero, e l'account in attesa se ne va.
    db.sqlite.prepare('UPDATE players SET in_attesa_fino = ?').run(new Date(Date.now() - 1000).toISOString())
    const preso = await chiama<{ player: Player }>('POST', '/auth/register', null, {
      nickname: 'Giada',
      email: 'x@example.com',
    })
    expect(preso.status).toBe(201)
    expect((await chiama('GET', '/auth/me', sessione(r.intestazioni))).status).toBe(401)
    expect(mandate).toHaveLength(2)
  })

  it('chi ha sbagliato il nickname torna indietro, e nickname ed email si liberano subito', async () => {
    const mandate = postino()
    const { chiama } = banco(POSTA)
    const sbagliata = await chiama<{ player: Player }>('POST', '/auth/register', null, { ...GIADA, nickname: 'Giaad' })
    const io = sessione(sbagliata.intestazioni)
    expect((await chiama('POST', '/auth/register/annulla', io)).status).toBe(200)
    expect((await chiama('GET', '/auth/me', io)).status).toBe(401)
    const giusta = await chiama<{ player: Player }>('POST', '/auth/register', null, GIADA)
    expect(giusta.status).toBe(201)
    // Anche senza tornare indietro: rifarla con la stessa email sostituisce quella in attesa.
    const ancora = await chiama<{ player: Player }>('POST', '/auth/register', null, { ...GIADA, nickname: 'Giadina' })
    expect(ancora.status).toBe(201)
    const confermata = await chiama<{ player: Player }>('POST', '/auth/verify', sessione(ancora.intestazioni), {
      code: codiceDi(mandate[mandate.length - 1]),
    })
    expect(confermata.dati.player).toMatchObject({ nickname: 'Giadina', emailVerified: true, inAttesa: false })
    // Confermata, non si annulla piu', e non scade.
    expect((await chiama('POST', '/auth/register/annulla', sessione(ancora.intestazioni))).status).toBe(409)
    const dopo = await chiama<{ code: string }>('POST', '/auth/register', null, {
      nickname: 'giadina',
      email: 'y@example.com',
    })
    expect(dopo.dati.code).toBe('NICKNAME_TAKEN')
  })

  it('il codice per entrare arriva all’email dell’account, con il nickname, e la risposta non lo dice', async () => {
    const mandate = postino()
    const { chiama } = banco(POSTA)
    await chiama('POST', '/auth/register', null, GIADA)
    mandate.length = 0

    const r = await chiama<CodiceMandato>('POST', '/auth/login/code', null, { identifier: 'giada@example.com' })
    expect(r.status).toBe(200)
    expect(r.dati.codiceDiProva).toBeUndefined()
    expect(mandate).toHaveLength(1)
    expect(mandate[0].to).toEqual(['giada@example.com'])
    expect(mandate[0].text).toContain('Il tuo nickname è: Giada')

    const dentro = await chiama<{ player: Player }>('POST', '/auth/login', null, {
      identifier: 'giada',
      code: codiceDi(mandate[0]),
    })
    expect(dentro.status).toBe(200)
    // Entrare con il codice vuol dire avere in mano l'email: e' anche una conferma.
    expect(dentro.dati.player.emailVerified).toBe(true)
  })

  it('un account che non c’è ha la stessa risposta, e non parte niente', async () => {
    const mandate = postino()
    const { chiama } = banco(POSTA)
    await chiama('POST', '/auth/register', null, GIADA)
    mandate.length = 0

    const c = await chiama('POST', '/auth/login/code', null, { identifier: 'giada' })
    const nessuno = await chiama('POST', '/auth/login/code', null, { identifier: 'nessuno' })
    expect(nessuno.status).toBe(c.status)
    expect(nessuno.dati).toEqual(c.dati)
    expect(mandate).toHaveLength(1)

    // Anche un codice sbagliato dice la stessa cosa per tutti e due.
    const a = await chiama('POST', '/auth/login', null, { identifier: 'giada', code: sbagliato(codiceDi(mandate[0])) })
    const b = await chiama('POST', '/auth/login', null, { identifier: 'nessuno', code: '123456' })
    expect(b.status).toBe(a.status)
    expect(b.dati).toEqual(a.dati)
  })

  it(`dopo ${CODE_MAX_ATTEMPTS} tentativi sbagliati il codice non vale più, nemmeno quello giusto`, async () => {
    const mandate = postino()
    const { chiama } = banco(POSTA)
    await chiama('POST', '/auth/register', null, GIADA)
    mandate.length = 0
    await chiama('POST', '/auth/login/code', null, { identifier: 'giada' })
    const giusto = codiceDi(mandate[0])
    for (let i = 0; i < CODE_MAX_ATTEMPTS; i += 1) {
      const r = await chiama('POST', '/auth/login', null, { identifier: 'giada', code: sbagliato(giusto) })
      expect(r.status).toBe(400)
    }
    expect((await chiama('POST', '/auth/login', null, { identifier: 'giada', code: giusto })).status).toBe(400)
  })

  it(`fra due invii passa un minuto, e in un giorno ne partono al più ${CODE_LOGIN_PER_DAY}`, async () => {
    const mandate = postino()
    const { chiama, db } = banco(POSTA)
    await chiama('POST', '/auth/register', null, GIADA)
    mandate.length = 0

    await chiama('POST', '/auth/login/code', null, { identifier: 'giada' })
    await chiama('POST', '/auth/login/code', null, { identifier: 'giada' })
    expect(mandate).toHaveLength(1)

    // Ogni volta il minuto passa: i codici restano nelle ventiquattr'ore.
    const indietro = () =>
      db.sqlite
        .prepare('UPDATE verification_codes SET created_at = ?')
        .run(new Date(Date.now() - 2 * 60_000).toISOString())
    for (let i = 0; i < CODE_LOGIN_PER_DAY + 3; i += 1) {
      indietro()
      const r = await chiama('POST', '/auth/login/code', null, { identifier: 'giada' })
      expect(r.status).toBe(200)
    }
    expect(mandate).toHaveLength(CODE_LOGIN_PER_DAY)
  })
})

describe('la migrazione senza password', () => {
  it('svuota le password e lascia le sessioni: chi era dentro resta dentro', async () => {
    const db = new ProvaD1('0032')
    const adesso = new Date().toISOString()
    db.sqlite
      .prepare(
        `INSERT INTO players (id, nickname, nickname_lower, display_name, password_hash, password_salt,
           password_iterations, avatar_color, created_at, last_seen_at, email, email_lower, email_verified_at)
         VALUES ('pl_s', 'Simone', 'simone', 'Simone', 'hash', 'sale', 12000, '#000', ?, ?, 's@example.com',
           's@example.com', ?)`,
      )
      .run(adesso, adesso, adesso)
    const token = generateSessionToken()
    db.sqlite
      .prepare(
        `INSERT INTO sessions (token_hash, player_id, created_at, expires_at, last_used_at)
         VALUES (?, 'pl_s', ?, ?, ?)`,
      )
      .run(await hashSessionToken(token), adesso, new Date(Date.now() + 86_400_000).toISOString(), adesso)

    applica(db, '0032_senza_password.sql')

    const riga = db.sqlite.prepare('SELECT password_hash, password_salt, password_iterations FROM players').get()
    expect(riga).toEqual({ password_hash: '', password_salt: '', password_iterations: 0 })
    // Le migrazioni dopo, come in produzione, dove il codice nuovo arriva con tutte le sue.
    for (const file of migrazioni()) if (file > '0032_senza_password.sql') applica(db, file)
    const env = { DB: db as unknown as D1Database, ASSETS: ASSETS_FINTI, EMAIL_VERIFICATION: 'off' } as Bindings
    const me = await createApp().request(
      'http://localhost/api/auth/me',
      { headers: { cookie: `gh_session=${token}` } },
      env,
    )
    expect(me.status).toBe(200)
    expect(((await me.json()) as { player: Player }).player.nickname).toBe('Simone')
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { NICKNAME_OGNI_GIORNI } from '../../shared/config'
import type { CodiceMandato, Player } from '../../shared/types'
import type { Bindings } from '../types'
import { banco, type Giocatore } from './banco'

afterEach(() => {
  vi.unstubAllGlobals()
})

/** Il giocatore con un'email, come chi si registra adesso: quelli del banco non ce l'hanno. */
function conEmail(b: ReturnType<typeof banco>, g: Giocatore, email = `${g.nickname}@example.com`) {
  b.db.sqlite.prepare('UPDATE players SET email = ?, email_lower = ? WHERE id = ?').run(email, email, g.id)
}

describe('il cambio del nickname', () => {
  it('si cambia con il codice, e restano la sessione, l’id e il colore', async () => {
    const b = banco()
    const g = await b.giocatore('Simone')
    conEmail(b, g)
    const mandato = await b.chiama<CodiceMandato>('POST', '/auth/nickname/code', g, { nickname: 'Simo' })
    expect(mandato.status).toBe(200)
    const cambiato = await b.chiama<{ player: Player }>('POST', '/auth/nickname', g, {
      nickname: 'Simo',
      code: mandato.dati.codiceDiProva,
    })
    expect(cambiato.status).toBe(200)
    expect(cambiato.dati.player.nickname).toBe('Simo')
    expect(cambiato.dati.player.id).toBe(g.id)
    expect(cambiato.dati.player.nicknameCambiabileDal).not.toBeNull()

    const me = await b.chiama<{ player: Player }>('GET', '/auth/me', g)
    expect(me.dati.player.nickname).toBe('Simo')
    expect(me.dati.player.avatarColor).toBe('#007aff')
    // Con il nickname nuovo si entra, con quello di prima no.
    const vecchio = await b.chiama<CodiceMandato>('POST', '/auth/login/code', null, { identifier: 'simone' })
    expect(vecchio.dati.codiceDiProva).toBeUndefined()
    const nuovo = await b.chiama<CodiceMandato>('POST', '/auth/login/code', null, { identifier: 'simo' })
    expect(nuovo.dati.codiceDiProva).toMatch(/^\d{6}$/)
  })

  it(`una volta ogni ${NICKNAME_OGNI_GIORNI} giorni`, async () => {
    const b = banco()
    const g = await b.giocatore('Giada')
    conEmail(b, g)
    const cambia = async (nickname: string) => {
      const m = await b.chiama<CodiceMandato & { code?: string }>('POST', '/auth/nickname/code', g, { nickname })
      if (m.status !== 200) return m
      return b.chiama<{ player: Player; code?: string }>('POST', '/auth/nickname', g, {
        nickname,
        code: m.dati.codiceDiProva,
      })
    }
    expect((await cambia('Giadina')).status).toBe(200)
    const presto = await cambia('Gigi')
    expect(presto.status).toBe(429)
    expect(presto.dati.code).toBe('NICKNAME_TROPPO_PRESTO')

    // Passata la settimana si puo' di nuovo.
    const fa = new Date(Date.now() - NICKNAME_OGNI_GIORNI * 86_400_000 - 1000).toISOString()
    b.db.sqlite.prepare('UPDATE players SET nickname_changed_at = ? WHERE id = ?').run(fa, g.id)
    b.db.sqlite.prepare('UPDATE verification_codes SET created_at = ?').run(fa)
    expect((await cambia('Gigi')).status).toBe(200)
  })

  it('un nickname preso, uguale o scritto male non passa, e il codice non parte', async () => {
    const b = banco()
    const g = await b.giocatore('Anna')
    await b.giocatore('Bruno')
    conEmail(b, g)
    const prova = (nickname: string) => b.chiama('POST', '/auth/nickname/code', g, { nickname })
    expect((await prova('bruno')).dati.code).toBe('NICKNAME_TAKEN')
    expect((await prova('Anna')).dati.code).toBe('NICKNAME_UGUALE')
    expect((await prova('a b')).dati.code).toBe('NICKNAME_CHARS')
    expect((await prova('ab')).dati.code).toBe('NICKNAME_LENGTH')
    // Le maiuscole del proprio si cambiano: il nome e' lo stesso.
    expect((await prova('ANNA')).status).toBe(200)
    const codici = b.db.sqlite.prepare("SELECT COUNT(*) AS n FROM verification_codes WHERE purpose = 'nickname'").get() as {
      n: number
    }
    expect(codici.n).toBe(1)
  })

  it('il codice per cambiare il nickname non apre l’account, e quello per entrare non cambia il nickname', async () => {
    const b = banco()
    const g = await b.giocatore('Carla')
    conEmail(b, g)
    const cambio = await b.chiama<CodiceMandato>('POST', '/auth/nickname/code', g, { nickname: 'Carlotta' })
    const entra = await b.chiama('POST', '/auth/login', null, { identifier: 'carla', code: cambio.dati.codiceDiProva })
    expect(entra.status).toBe(400)

    const login = await b.chiama<CodiceMandato>('POST', '/auth/login/code', null, { identifier: 'carla' })
    const r = await b.chiama('POST', '/auth/nickname', g, { nickname: 'Carlotta', code: login.dati.codiceDiProva })
    // Il codice per entrare e' un altro: per il cambio vale solo il suo, che e' ancora li'.
    if (login.dati.codiceDiProva !== cambio.dati.codiceDiProva) expect(r.status).toBe(400)
    const giusto = await b.chiama('POST', '/auth/nickname', g, { nickname: 'Carlotta', code: cambio.dati.codiceDiProva })
    expect(giusto.status).toBe(200)
  })

  it('senza sessione non si chiede niente', async () => {
    const b = banco()
    expect((await b.chiama('POST', '/auth/nickname/code', null, { nickname: 'Pippo' })).status).toBe(401)
    expect((await b.chiama('POST', '/auth/nickname', null, { nickname: 'Pippo', code: '123456' })).status).toBe(401)
  })

  it('con la posta il codice arriva all’email, con il nickname nuovo, e la risposta non lo dice', async () => {
    const mandate: { to: string[]; subject: string; text: string }[] = []
    vi.stubGlobal('fetch', async (_url: unknown, init?: RequestInit) => {
      mandate.push(JSON.parse(String(init?.body)) as { to: string[]; subject: string; text: string })
      return new Response(JSON.stringify({ id: 'm1' }), { status: 200 })
    })
    const posta: Partial<Bindings> = { EMAIL_VERIFICATION: 'on', RESEND_API_KEY: 'chiave-finta' }
    const b = banco(posta)
    const g = await b.giocatore('Dario')
    conEmail(b, g, 'dario@example.com')
    const r = await b.chiama<CodiceMandato>('POST', '/auth/nickname/code', g, { nickname: 'Darione' })
    expect(r.status).toBe(200)
    expect(r.dati.codiceDiProva).toBeUndefined()
    expect(mandate).toHaveLength(1)
    expect(mandate[0].to).toEqual(['dario@example.com'])
    expect(mandate[0].text).toContain('«Darione»')
    const codice = /(\d{6})/.exec(mandate[0].subject)![1]

    // Il secondo invio aspetta il minuto.
    expect((await b.chiama('POST', '/auth/nickname/code', g, { nickname: 'Darione' })).status).toBe(429)
    const fatto = await b.chiama<{ player: Player }>('POST', '/auth/nickname', g, { nickname: 'Darione', code: codice })
    expect(fatto.dati.player.nickname).toBe('Darione')
  })
})

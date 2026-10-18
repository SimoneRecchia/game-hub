import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  POSTA_AL_GIORNO,
  POSTA_PER_INDIRIZZO_GIORNO,
  POSTA_PER_INDIRIZZO_ORA,
  POSTA_PER_RETE_GIORNO,
  POSTA_PER_RETE_ORA,
} from '../../shared/config'
import type { CodiceMandato, Player } from '../../shared/types'
import { prenotaInvio } from '../lib/postino'
import type { Bindings } from '../types'
import { banco, type Giocatore } from './banco'

const ORA = 3_600_000
const POSTA: Partial<Bindings> = { EMAIL_VERIFICATION: 'on', RESEND_API_KEY: 'chiave-finta' }

/** Le email che partono, al posto di Resend. */
function postino() {
  const mandate: { to: string[]; subject: string }[] = []
  vi.stubGlobal('fetch', async (_url: unknown, init?: RequestInit) => {
    mandate.push(JSON.parse(String(init?.body)) as { to: string[]; subject: string })
    return new Response(JSON.stringify({ id: `m${mandate.length}` }), { status: 200 })
  })
  return mandate
}

function sessione(intestazioni?: Headers): Giocatore {
  return { id: '', nickname: '', cookie: (intestazioni?.get('set-cookie') ?? '').split(';')[0] }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('i tetti delle email', () => {
  it('a uno stesso indirizzo ne arrivano al più cinque in un’ora, e dodici in un giorno', async () => {
    const { db } = banco()
    const d1 = db as unknown as D1Database
    const t = Date.parse('2026-10-19T08:00:00Z')
    let partite = 0
    // Da reti sempre diverse: il tetto e' dell'indirizzo, non di chi chiede.
    for (let i = 0; i < POSTA_PER_INDIRIZZO_ORA + 3; i++) {
      if (await prenotaInvio(d1, `rete-${i}`, 'Vittima@Example.com', t + i * 1000)) partite++
    }
    expect(partite).toBe(POSTA_PER_INDIRIZZO_ORA)
    // L'ora dopo si riapre, fino al tetto del giorno.
    for (let ora = 1; ora < 24; ora++) {
      for (let i = 0; i < POSTA_PER_INDIRIZZO_ORA; i++) {
        if (await prenotaInvio(d1, `rete-${ora}-${i}`, 'vittima@example.com', t + ora * ORA + i * 1000)) partite++
      }
    }
    expect(partite).toBe(POSTA_PER_INDIRIZZO_GIORNO)
  })

  it('da una stessa rete ne partono al più dieci in un’ora, e trenta in un giorno', async () => {
    const { db } = banco()
    const d1 = db as unknown as D1Database
    const t = Date.parse('2026-10-19T08:00:00Z')
    let partite = 0
    for (let i = 0; i < POSTA_PER_RETE_ORA + 5; i++) {
      if (await prenotaInvio(d1, '203.0.113.7', `persona${i}@example.com`, t + i * 1000)) partite++
    }
    expect(partite).toBe(POSTA_PER_RETE_ORA)
    // Un'altra rete, nello stesso momento, non ne risente.
    expect(await prenotaInvio(d1, '198.51.100.1', 'altra@example.com', t + 60_000)).toBe(true)
    for (let ora = 1; ora < 24; ora++) {
      for (let i = 0; i < POSTA_PER_RETE_ORA; i++) {
        if (await prenotaInvio(d1, '203.0.113.7', `p${ora}-${i}@example.com`, t + ora * ORA + i * 1000)) partite++
      }
    }
    expect(partite).toBe(POSTA_PER_RETE_GIORNO)
  })

  it('in un giorno ne partono al più novanta in tutto, e due giorni dopo le righe se ne vanno', async () => {
    const { db } = banco()
    const d1 = db as unknown as D1Database
    const t = Date.parse('2026-10-19T08:00:00Z')
    let partite = 0
    for (let i = 0; i < POSTA_AL_GIORNO + 10; i++) {
      if (await prenotaInvio(d1, `rete-${i}`, `persona${i}@example.com`, t + i * 60_000)) partite++
    }
    expect(partite).toBe(POSTA_AL_GIORNO)
    expect(await prenotaInvio(d1, 'nuova', 'nuova@example.com', t + 25 * ORA)).toBe(true)
    expect(await prenotaInvio(d1, 'nuova', 'nuova@example.com', t + 80 * ORA)).toBe(true)
    // Restano solo le righe degli ultimi due giorni: le altre le ha portate via l'ultimo invio.
    expect(db.sqlite.prepare('SELECT COUNT(*) AS n FROM invii_posta').get()).toEqual({ n: 1 })
  })

  it('rifare la registrazione con la stessa email non manda codici all’infinito', async () => {
    const mandate = postino()
    const { chiama, db } = banco(POSTA)
    const risposte: number[] = []
    for (let i = 0; i < POSTA_PER_INDIRIZZO_ORA + 2; i++) {
      const r = await chiama<{ code: string }>('POST', '/auth/register', null, {
        nickname: `Giada${i}`,
        email: 'giada@example.com',
      })
      risposte.push(r.status)
      if (r.status === 429) expect(r.dati.code).toBe('TROPPE_EMAIL')
    }
    expect(risposte).toEqual([...Array(POSTA_PER_INDIRIZZO_ORA).fill(201), 429, 429])
    expect(mandate).toHaveLength(POSTA_PER_INDIRIZZO_ORA)
    // La registrazione rifiutata non lascia un account: resta l'ultima che ha avuto il codice.
    expect(db.sqlite.prepare('SELECT nickname FROM players').all()).toEqual([
      { nickname: `Giada${POSTA_PER_INDIRIZZO_ORA - 1}` },
    ])
  })

  it('il codice per entrare, a tetto pieno, non parte e la risposta è quella di sempre', async () => {
    const mandate = postino()
    const { chiama, db } = banco(POSTA)
    const r = await chiama<{ player: Player }>('POST', '/auth/register', null, { nickname: 'Giada', email: 'g@example.com' })
    expect(r.status).toBe(201)
    // Le email dell'ora per quell'indirizzo, gia' partite.
    const adesso = new Date().toISOString()
    for (let i = 1; i < POSTA_PER_INDIRIZZO_ORA; i++) {
      db.sqlite.prepare('INSERT INTO invii_posta (at, rete, destinatario) SELECT ?, rete, destinatario FROM invii_posta LIMIT 1').run(adesso)
    }
    mandate.length = 0
    const codice = await chiama<CodiceMandato>('POST', '/auth/login/code', null, { identifier: 'giada' })
    expect(codice.status).toBe(200)
    expect(codice.dati.ok).toBe(true)
    expect(mandate).toHaveLength(0)
    // Anche il codice di verifica rimandato si ferma, e qui lo si dice.
    db.sqlite.prepare("UPDATE verification_codes SET created_at = '2000-01-01T00:00:00.000Z'").run()
    const ancora = await chiama<{ code: string }>('POST', '/auth/verify/resend', sessione(r.intestazioni))
    expect(ancora.status).toBe(429)
    expect(ancora.dati.code).toBe('TROPPE_EMAIL')
    expect(mandate).toHaveLength(0)
  })
})

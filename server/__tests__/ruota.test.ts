import { afterEach, describe, expect, it, vi } from 'vitest'
import { MATERIE_RUOTA, SPICCHI, type DomandaRuota, type Spicchio } from '../../shared/ruota'
import type { DomandaCompleta } from '../../shared/quiz-domande'
import type { GeneraleLeaderboard, OggiRisposta, RuotaStato } from '../../shared/types'
import { today } from '../lib/wordleStore'
import { banco, type Giocatore } from './banco'

type Banco = ReturnType<typeof banco>

/** Gli spicchi che servono alle prove, per posto: il primo di ogni specie. */
const indice = (prova: (s: Spicchio) => boolean) => SPICCHI.findIndex(prova)
const X2 = indice((s) => s.tipo === 'doppio')
const NIENTE = indice((s) => s.tipo === 'niente')
const MONETA = indice((s) => s.tipo === 'moneta')
const GEOGRAFIA = indice((s) => s.tipo === 'domanda' && s.materia === 'geografia')
/** La posta di una sfida: quanto da' se va bene, e toglie se va male. */
const posta = (i: number) => {
  const s = SPICCHI[i]
  return s.tipo === 'moneta' || s.tipo === 'domanda' ? s.posta : 0
}

/**
 * Il caso, deciso dalla prova: ogni chiamata a `crypto.getRandomValues` prende
 * il prossimo numero della coda. Un numero piccolo e' proprio l'indice che
 * esce, perché il server prende il resto della divisione.
 */
function caso(...numeri: number[]) {
  const coda = [...numeri]
  const prossimo = (a: ArrayBufferView) => {
    ;(a as Uint32Array)[0] = coda.shift() ?? 0
    return a
  }
  vi.spyOn(crypto, 'getRandomValues').mockImplementation(prossimo as typeof crypto.getRandomValues)
}

afterEach(() => {
  vi.restoreAllMocks()
})

/** I punti di oggi: un quiz e un cruciverba finiti. */
function puntiDiOggi(b: Banco, io: Giocatore, quiz: number, cruciverba: number) {
  const n = today().puzzleNumber
  const adesso = new Date().toISOString()
  b.db.sqlite
    .prepare(
      `INSERT INTO quiz_partite (id, player_id, puzzle_number, date, status, giuste, score, started_at, updated_at)
       VALUES (?, ?, ?, 'x', 'done', 7, ?, ?, ?)`,
    )
    .run(`q_${io.id}`, io.id, n, quiz, adesso, adesso)
  b.db.sqlite
    .prepare(
      `INSERT INTO cruciverba_games (id, player_id, puzzle_number, date, status, lettere, score, started_at, updated_at)
       VALUES (?, ?, ?, 'x', 'done', 'x', ?, ?, ?)`,
    )
    .run(`c_${io.id}`, io.id, n, cruciverba, adesso, adesso)
}

const DOMANDA: DomandaCompleta = {
  tipo: 'capitale-di',
  testo: 'Qual è la capitale del Portogallo?',
  opzioni: [
    { id: 'lis', testo: 'Lisbona' },
    { id: 'opo', testo: 'Porto' },
    { id: 'mad', testo: 'Madrid' },
    { id: 'bra', testo: 'Braga' },
  ],
  giusta: 'lis',
  risposta: 'Lisbona',
  soggetto: 'PT',
} as unknown as DomandaCompleta

/**
 * Le domande di oggi, la stessa per ogni materia: con tutte le materie ci sono
 * tutti gli spicchi, e il numero che esce e' proprio l'indice dello spicchio.
 */
function domandeDiOggi(b: Banco) {
  const voce: DomandaRuota = { categoria: 'capitali', domanda: DOMANDA }
  for (const materia of MATERIE_RUOTA) {
    b.db.sqlite
      .prepare('INSERT INTO ruota_domande (puzzle_number, materia, domande, created_at) VALUES (?, ?, ?, ?)')
      .run(today().puzzleNumber, materia, JSON.stringify([voce]), new Date().toISOString())
  }
}

async function stato(b: Banco, io: Giocatore): Promise<RuotaStato> {
  const r = await b.chiama<RuotaStato>('GET', '/ruota', io)
  expect(r.status, JSON.stringify(r.dati)).toBe(200)
  return r.dati
}

async function generaleDiOggi(b: Banco, io: Giocatore) {
  return (await b.chiama<GeneraleLeaderboard>('GET', '/leaderboard/generale?scope=today', io)).dati.me
}

describe('la ruota del giorno', () => {
  it('senza i punti delle classificate non si gira', async () => {
    const b = banco()
    const io = await b.giocatore('anna')
    expect(await stato(b, io)).toMatchObject({ puntiDiOggi: 0, giro: null })
    const r = await b.chiama('POST', '/ruota/gira', io, { puntata: 50 })
    expect(r.status).toBe(409)
    expect(r.dati.code).toBe('POCHI_PUNTI')
  })

  it('si punta da cinquanta a tutti i punti di oggi, una volta sola', async () => {
    const b = banco()
    const io = await b.giocatore('anna')
    puntiDiOggi(b, io, 90, 90)
    domandeDiOggi(b)
    expect((await stato(b, io)).puntiDiOggi).toBe(180)
    for (const puntata of [181, 49, 100.5, '100', null]) {
      const r = await b.chiama('POST', '/ruota/gira', io, { puntata })
      expect(r.status, String(puntata)).toBe(400)
      expect(r.dati.code).toBe('PUNTATA')
    }
    caso(X2)
    const girata = await b.chiama<RuotaStato>('POST', '/ruota/gira', io, { puntata: 100 })
    expect(girata.status).toBe(200)
    expect(girata.dati.giro).toMatchObject({ puntata: 100, spicchio: X2, stato: 'fatto', delta: 100, sfida: null })
    const ancora = await b.chiama('POST', '/ruota/gira', io, { puntata: 100 })
    expect(ancora.status).toBe(409)
    expect(ancora.dati.code).toBe('GIA_GIRATA')
  })

  it("quel che da' o toglie va nella classifica generale e nei punti di oggi", async () => {
    const b = banco()
    const io = await b.giocatore('anna')
    puntiDiOggi(b, io, 90, 90)
    domandeDiOggi(b)
    caso(X2)
    const giro = (await b.chiama<RuotaStato>('POST', '/ruota/gira', io, { puntata: 150 })).dati.giro!
    expect(giro.delta).toBe(150)
    const me = await generaleDiOggi(b, io)
    expect(me).toMatchObject({ punti: 330, ruota: 150, partite: 2 })
    expect(me?.perGioco).toMatchObject({ quiz: 90, cruciverba: 90 })
    // I punti che si potevano puntare restano quelli delle classificate.
    expect((await stato(b, io)).puntiDiOggi).toBe(180)
    const oggi = (await b.chiama<OggiRisposta>('GET', '/oggi', io)).dati
    expect(oggi.generale.punti).toBe(330)
    expect(oggi.ruota).toEqual({ puntiDiOggi: 180, stato: 'fatto', spicchio: X2, delta: 150 })
  })

  it("lo spicchio che non fa niente lascia tutto com'è", async () => {
    const b = banco()
    const io = await b.giocatore('anna')
    puntiDiOggi(b, io, 90, 90)
    domandeDiOggi(b)
    caso(NIENTE)
    const giro = (await b.chiama<RuotaStato>('POST', '/ruota/gira', io, { puntata: 180 })).dati.giro!
    expect(giro).toMatchObject({ spicchio: NIENTE, stato: 'fatto', delta: 0, sfida: null })
    expect((await generaleDiOggi(b, io))?.punti).toBe(180)
  })

  it('una domanda di una materia senza domande non esce', async () => {
    const b = banco()
    const io = await b.giocatore('anna')
    puntiDiOggi(b, io, 90, 90)
    // Senza le domande di oggi gli spicchi delle domande non ci sono: il numero cade sullo spicchio dopo.
    caso(GEOGRAFIA)
    const giro = (await b.chiama<RuotaStato>('POST', '/ruota/gira', io, { puntata: 100 })).dati.giro!
    expect(SPICCHI[giro.spicchio].tipo).not.toBe('domanda')
  })

  it('testa o croce: conta persa finché non si lancia, e si lancia una volta', async () => {
    const b = banco()
    const anna = await b.giocatore('anna')
    const bruno = await b.giocatore('bruno')
    puntiDiOggi(b, anna, 90, 90)
    puntiDiOggi(b, bruno, 90, 90)
    domandeDiOggi(b)

    const p = posta(MONETA)
    caso(MONETA, 0)
    const giro = (await b.chiama<RuotaStato>('POST', '/ruota/gira', anna, { puntata: 100 })).dati.giro!
    expect(giro).toMatchObject({
      stato: 'sfida',
      delta: -p,
      sfida: { tipo: 'moneta', posta: p, scelto: null, uscito: null },
    })
    expect((await generaleDiOggi(b, anna))?.punti).toBe(180 - p)
    const vinta = (await b.chiama<RuotaStato>('POST', '/ruota/moneta', anna, { lato: 'testa' })).dati.giro!
    expect(vinta).toMatchObject({ stato: 'fatto', delta: p, sfida: { scelto: 'testa', uscito: 'testa' } })
    expect((await b.chiama('POST', '/ruota/moneta', anna, { lato: 'croce' })).status).toBe(409)

    caso(MONETA, 1)
    await b.chiama('POST', '/ruota/gira', bruno, { puntata: 100 })
    const persa = (await b.chiama<RuotaStato>('POST', '/ruota/moneta', bruno, { lato: 'testa' })).dati.giro!
    expect(persa).toMatchObject({ delta: -p, sfida: { scelto: 'testa', uscito: 'croce' } })
    expect((await b.chiama('POST', '/ruota/moneta', bruno, { lato: 'di taglio' })).status).toBe(400)
  })

  it('la domanda: si apre quando la si chiede, senza la risposta, e vale solo in tempo', async () => {
    const b = banco()
    const anna = await b.giocatore('anna')
    const bruno = await b.giocatore('bruno')
    puntiDiOggi(b, anna, 90, 90)
    puntiDiOggi(b, bruno, 90, 90)
    domandeDiOggi(b)

    const p = posta(GEOGRAFIA)
    caso(GEOGRAFIA, 0)
    const giro = (await b.chiama<RuotaStato>('POST', '/ruota/gira', anna, { puntata: 100 })).dati.giro!
    expect(giro).toMatchObject({
      stato: 'sfida',
      delta: -p,
      sfida: { tipo: 'domanda', posta: p, materia: 'geografia', domanda: null },
    })
    // Rispondere prima di aprirla non si puo'.
    expect((await b.chiama('POST', '/ruota/risposta', anna, { scelta: 'lis' })).status).toBe(409)

    caso(0)
    const aperta = (await b.chiama<RuotaStato>('POST', '/ruota/domanda', anna)).dati.giro!
    expect(aperta.stato).toBe('domanda')
    const sfida = aperta.sfida as Extract<NonNullable<typeof aperta.sfida>, { tipo: 'domanda' }>
    expect(sfida.categoria).toBe('capitali')
    expect(sfida.limiteMs).toBe(15_000)
    expect(sfida.restanteMs).toBeLessThanOrEqual(15_000)
    const vista = sfida.domanda as unknown as Record<string, unknown>
    for (const segreto of ['giusta', 'risposta', 'soggetto', 'spiegazione']) expect(vista[segreto]).toBeUndefined()

    const risposta = (await b.chiama<RuotaStato>('POST', '/ruota/risposta', anna, { scelta: 'lis' })).dati.giro!
    expect(risposta).toMatchObject({ stato: 'fatto', delta: p })
    expect(risposta.sfida).toMatchObject({
      risposta: { scelta: 'lis', giusta: true, corretta: 'lis', risposta: 'Lisbona' },
    })
    expect((await b.chiama('POST', '/ruota/risposta', anna, { scelta: 'lis' })).status).toBe(409)

    // Bruno apre la domanda e torna dopo il tempo: la risposta arriva tardi, e la sfida e' persa.
    caso(GEOGRAFIA, 0)
    await b.chiama('POST', '/ruota/gira', bruno, { puntata: 100 })
    await b.chiama('POST', '/ruota/domanda', bruno)
    b.db.sqlite
      .prepare('UPDATE ruota_giri SET aperta_at = ? WHERE player_id = ?')
      .run(new Date(Date.now() - 60_000).toISOString(), bruno.id)
    const tardi = (await b.chiama<RuotaStato>('POST', '/ruota/risposta', bruno, { scelta: 'lis' })).dati.giro!
    expect(tardi).toMatchObject({ stato: 'fatto', delta: -p })
    expect(tardi.sfida).toMatchObject({ risposta: { scelta: null, giusta: false } })
  })

  it('una domanda lasciata aperta la chiude la prima lettura, persa', async () => {
    const b = banco()
    const io = await b.giocatore('anna')
    puntiDiOggi(b, io, 90, 90)
    domandeDiOggi(b)
    caso(GEOGRAFIA, 0)
    await b.chiama('POST', '/ruota/gira', io, { puntata: 100 })
    await b.chiama('POST', '/ruota/domanda', io)
    b.db.sqlite
      .prepare('UPDATE ruota_giri SET aperta_at = ? WHERE player_id = ?')
      .run(new Date(Date.now() - 60_000).toISOString(), io.id)
    const giro = (await stato(b, io)).giro!
    expect(giro).toMatchObject({ stato: 'fatto', delta: -posta(GEOGRAFIA) })
    expect(giro.sfida).toMatchObject({ risposta: { scelta: null, giusta: false, corretta: 'lis' } })
  })
})

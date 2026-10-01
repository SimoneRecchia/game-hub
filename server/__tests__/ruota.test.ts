import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DOMANDE_PER_MATERIA,
  MATERIE_RUOTA,
  PUNTATA_MINIMA,
  SPICCHI,
  improntaDomanda,
  type DomandaRuota,
  type Spicchio,
} from '../../shared/ruota'
import type { DomandaCompleta } from '../../shared/quiz-domande'
import type { GeneraleLeaderboard, OggiRisposta, RuotaStato } from '../../shared/types'
import { today } from '../lib/wordleStore'
import { ProvaD1, applica, banco, type Giocatore } from './banco'

type Banco = ReturnType<typeof banco>

/** Gli spicchi che servono alle prove, per posto: il primo di ogni specie. */
const indice = (prova: (s: Spicchio) => boolean) => SPICCHI.findIndex(prova)
const X2 = indice((s) => s.tipo === 'doppio')
const NIENTE = indice((s) => s.tipo === 'niente')
const PERDI = indice((s) => s.tipo === 'perdi')
const MONETA = indice((s) => s.tipo === 'moneta')
const GEOGRAFIA = indice((s) => s.tipo === 'domanda' && s.materia === 'geografia')

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

/** Una domanda di capitali, con la sua risposta: `quale` cambia il paese, così ogni domanda e' diversa. */
function domanda(quale = 0): DomandaCompleta {
  return {
    tipo: 'capitale-di',
    testo: `Qual è la capitale del paese numero ${quale}?`,
    opzioni: [
      { id: 'lis', testo: 'Lisbona' },
      { id: 'opo', testo: 'Porto' },
      { id: 'mad', testo: 'Madrid' },
      { id: 'bra', testo: 'Braga' },
    ],
    giusta: 'lis',
    risposta: 'Lisbona',
    soggetto: `P${quale}`,
  } as unknown as DomandaCompleta
}

/**
 * Le domande di oggi, `quante` per ogni materia: con tutte le materie ci sono
 * tutti gli spicchi, e il numero che esce e' proprio l'indice dello spicchio.
 */
function domandeDiOggi(b: Banco, quante = 1) {
  const voci: DomandaRuota[] = Array.from({ length: quante }, (_, i) => ({
    categoria: 'capitali',
    domanda: domanda(i),
  }))
  for (const materia of MATERIE_RUOTA) {
    b.db.sqlite
      .prepare(
        'INSERT INTO ruota_domande (puzzle_number, materia, domande, created_at, formato) VALUES (?, ?, ?, ?, 2)',
      )
      .run(today().puzzleNumber, materia, JSON.stringify(voci), new Date().toISOString())
  }
}

/** Il tempo fra due giri passa: il server ne vuole qualche secondo, e la prova non aspetta davvero. */
function passaIlTempo(b: Banco, io: Giocatore) {
  b.db.sqlite
    .prepare('UPDATE ruota_giocate SET created_at = ? WHERE player_id = ?')
    .run(new Date(Date.now() - 60_000).toISOString(), io.id)
}

async function stato(b: Banco, io: Giocatore): Promise<RuotaStato> {
  const r = await b.chiama<RuotaStato>('GET', '/ruota', io)
  expect(r.status, JSON.stringify(r.dati)).toBe(200)
  return r.dati
}

async function gira(b: Banco, io: Giocatore, puntata: number, ...numeri: number[]) {
  passaIlTempo(b, io)
  caso(...numeri)
  const r = await b.chiama<RuotaStato>('POST', '/ruota/gira', io, { puntata })
  expect(r.status, JSON.stringify(r.dati)).toBe(200)
  return r.dati
}

async function generaleDiOggi(b: Banco, io: Giocatore) {
  return (await b.chiama<GeneraleLeaderboard>('GET', '/leaderboard/generale?scope=today', io)).dati.me
}

describe('Crazy Time', () => {
  it('senza i punti delle classificate non si gira', async () => {
    const b = banco()
    const io = await b.giocatore('anna')
    expect(await stato(b, io)).toMatchObject({ classificate: 0, saldo: 0, netto: 0, giri: 0, giro: null })
    const r = await b.chiama('POST', '/ruota/gira', io, { puntata: PUNTATA_MINIMA })
    expect(r.status).toBe(409)
    expect(r.dati.code).toBe('POCHI_PUNTI')
  })

  it('si gira quante volte si vuole, e il saldo e la generale seguono ogni giro', async () => {
    const b = banco()
    const io = await b.giocatore('anna')
    puntiDiOggi(b, io, 90, 90)
    domandeDiOggi(b)
    expect(await stato(b, io)).toMatchObject({ classificate: 180, saldo: 180 })

    expect((await gira(b, io, 100, X2)).giro).toMatchObject({ n: 1, spicchio: X2, stato: 'fatto', delta: 100 })
    expect(await stato(b, io)).toMatchObject({ classificate: 180, netto: 100, giri: 1, saldo: 280 })
    // Il saldo nuovo si puo' puntare tutto.
    expect((await gira(b, io, 280, PERDI)).giro).toMatchObject({ n: 2, spicchio: PERDI, delta: -280 })
    expect(await stato(b, io)).toMatchObject({ netto: -180, giri: 2, saldo: 0 })
    const finito = await b.chiama('POST', '/ruota/gira', io, { puntata: PUNTATA_MINIMA })
    expect(finito.dati.code).toBe('POCHI_PUNTI')

    const me = await generaleDiOggi(b, io)
    expect(me).toMatchObject({ punti: 0, ruota: -180, partite: 2 })
    expect(me?.perGioco).toMatchObject({ quiz: 90, cruciverba: 90 })
    const oggi = (await b.chiama<OggiRisposta>('GET', '/oggi', io)).dati
    expect(oggi.generale.punti).toBe(0)
    expect(oggi.ruota).toEqual({ saldo: 0, netto: -180, giri: 2, stato: 'gioca', spicchio: PERDI })
  })

  it('si punta da dieci a tutto il saldo, in punti interi', async () => {
    const b = banco()
    const io = await b.giocatore('anna')
    puntiDiOggi(b, io, 90, 90)
    domandeDiOggi(b)
    for (const puntata of [181, PUNTATA_MINIMA - 1, 100.5, '100', null]) {
      const r = await b.chiama('POST', '/ruota/gira', io, { puntata })
      expect(r.status, String(puntata)).toBe(400)
      expect(r.dati.code).toBe('PUNTATA')
    }
    expect((await gira(b, io, 137, NIENTE)).giro).toMatchObject({ puntata: 137, delta: 0 })
  })

  it('fra un giro e l’altro passano almeno tre secondi', async () => {
    const b = banco()
    const io = await b.giocatore('anna')
    puntiDiOggi(b, io, 90, 90)
    domandeDiOggi(b)
    await gira(b, io, 50, NIENTE)
    caso(NIENTE)
    const subito = await b.chiama('POST', '/ruota/gira', io, { puntata: 50 })
    expect(subito.status).toBe(429)
    expect(subito.dati.code).toBe('TROPPO_PRESTO')
  })

  it('il saldo non si supera nemmeno con un giro scritto nel frattempo', async () => {
    const b = banco()
    const io = await b.giocatore('anna')
    puntiDiOggi(b, io, 50, 50)
    domandeDiOggi(b)
    await gira(b, io, 100, PERDI)
    // Un giro con lo stesso numero arrivato dopo, come da una seconda richiesta che aveva letto il saldo di prima.
    b.db.sqlite.prepare('DELETE FROM ruota_giocate WHERE player_id = ?').run(io.id)
    b.db.sqlite
      .prepare(
        `INSERT INTO ruota_giocate
           (player_id, puzzle_number, n, puntata, spicchio, stato, delta, created_at, updated_at)
         VALUES (?, ?, 1, 100, ?, 'fatto', -100, ?, ?)`,
      )
      .run(io.id, today().puzzleNumber, PERDI, new Date(0).toISOString(), new Date(0).toISOString())
    const r = await b.chiama('POST', '/ruota/gira', io, { puntata: 100 })
    expect(r.status).toBe(409)
    expect(await stato(b, io)).toMatchObject({ saldo: 0, giri: 1 })
  })

  it('testa o croce: vale la puntata, conta persa finché non si lancia, e il giro dopo la chiude', async () => {
    const b = banco()
    const io = await b.giocatore('anna')
    puntiDiOggi(b, io, 90, 90)
    domandeDiOggi(b)

    const giro = (await gira(b, io, 100, MONETA)).giro!
    expect(giro).toMatchObject({ stato: 'sfida', delta: -100, sfida: { tipo: 'moneta', posta: 100, scelto: null } })
    expect((await generaleDiOggi(b, io))?.punti).toBe(80)
    caso(0)
    const vinta = (await b.chiama<RuotaStato>('POST', '/ruota/moneta', io, { lato: 'testa' })).dati
    expect(vinta.giro).toMatchObject({ stato: 'fatto', delta: 100, sfida: { scelto: 'testa', uscito: 'testa' } })
    expect(vinta.saldo).toBe(280)
    expect((await b.chiama('POST', '/ruota/moneta', io, { lato: 'croce' })).status).toBe(409)
    expect((await b.chiama('POST', '/ruota/moneta', io, { lato: 'di taglio' })).status).toBe(400)

    // Una moneta lasciata a meta': il giro dopo la chiude persa, e parte.
    await gira(b, io, 80, MONETA)
    const dopo = await gira(b, io, 50, NIENTE)
    expect(dopo).toMatchObject({ giri: 3, netto: 100 - 80, giro: { n: 3, delta: 0 } })
  })

  it('la domanda vale un quarto della puntata, e la stessa domanda non torna nello stesso giorno', async () => {
    const b = banco()
    const io = await b.giocatore('anna')
    puntiDiOggi(b, io, 90, 90)
    domandeDiOggi(b, 2)

    const giro = (await gira(b, io, 100, GEOGRAFIA)).giro!
    expect(giro).toMatchObject({ stato: 'sfida', delta: -25, sfida: { tipo: 'domanda', posta: 25, domanda: null } })
    expect((await b.chiama('POST', '/ruota/risposta', io, { scelta: 'lis' })).status).toBe(409)

    caso(0)
    const aperta = (await b.chiama<RuotaStato>('POST', '/ruota/domanda', io)).dati.giro!
    const sfida = aperta.sfida as Extract<NonNullable<typeof aperta.sfida>, { tipo: 'domanda' }>
    expect(sfida.limiteMs).toBe(15_000)
    const vista = sfida.domanda as unknown as Record<string, unknown>
    for (const segreto of ['giusta', 'risposta', 'soggetto', 'spiegazione']) expect(vista[segreto]).toBeUndefined()
    const prima = sfida.domanda!.testo

    const risposta = (await b.chiama<RuotaStato>('POST', '/ruota/risposta', io, { scelta: 'lis' })).dati
    expect(risposta.giro).toMatchObject({ stato: 'fatto', delta: 25, sfida: { risposta: { giusta: true } } })
    expect(risposta.saldo).toBe(205)

    // Il giro dopo cade ancora sulla geografia: la domanda e' l'altra, anche se il caso sceglierebbe la prima.
    await gira(b, io, 100, GEOGRAFIA)
    caso(0)
    const seconda = (await b.chiama<RuotaStato>('POST', '/ruota/domanda', io)).dati.giro!
    expect((seconda.sfida as typeof sfida).domanda!.testo).not.toBe(prima)
    await b.chiama('POST', '/ruota/risposta', io, { scelta: 'opo' })
    expect(await stato(b, io)).toMatchObject({ netto: 25 - 25, giri: 2 })

    // Finite le domande della geografia, il suo spicchio non esce piu': il numero cade sullo spicchio dopo.
    const terzo = await gira(b, io, 100, GEOGRAFIA)
    expect(SPICCHI[terzo.giro!.spicchio]).not.toEqual({ tipo: 'domanda', materia: 'geografia' })
  })

  it('una risposta in ritardo e una domanda lasciata aperta contano perse', async () => {
    const b = banco()
    const io = await b.giocatore('anna')
    puntiDiOggi(b, io, 90, 90)
    domandeDiOggi(b, 3)
    await gira(b, io, 100, GEOGRAFIA)
    caso(0)
    await b.chiama('POST', '/ruota/domanda', io)
    b.db.sqlite
      .prepare('UPDATE ruota_giocate SET aperta_at = ? WHERE player_id = ?')
      .run(new Date(Date.now() - 60_000).toISOString(), io.id)
    const tardi = (await b.chiama<RuotaStato>('POST', '/ruota/risposta', io, { scelta: 'lis' })).dati.giro!
    expect(tardi).toMatchObject({ stato: 'fatto', delta: -25, sfida: { risposta: { scelta: null, giusta: false } } })

    await gira(b, io, 100, GEOGRAFIA)
    caso(0)
    await b.chiama('POST', '/ruota/domanda', io)
    b.db.sqlite
      .prepare('UPDATE ruota_giocate SET aperta_at = ? WHERE player_id = ? AND n = 2')
      .run(new Date(Date.now() - 60_000).toISOString(), io.id)
    const chiusa = (await stato(b, io)).giro!
    expect(chiusa).toMatchObject({ n: 2, stato: 'fatto', delta: -25, sfida: { risposta: { scelta: null } } })
    expect((await stato(b, io)).netto).toBe(-50)
  })

  it('i giri della ruota di prima passano con i loro punti, chiusi e senza spicchio', async () => {
    const d1 = new ProvaD1('0024_crazy_time.sql')
    const n = today().puzzleNumber
    const t = new Date().toISOString()
    // Il giocatore non serve: qui conta solo che il giro passi.
    d1.sqlite.exec('PRAGMA foreign_keys = OFF')
    d1.sqlite
      .prepare(
        `INSERT INTO ruota_giri
           (player_id, puzzle_number, puntata, spicchio, stato, delta, sfida, created_at, updated_at)
         VALUES ('p1', ?, 120, 3, 'sfida', -20, '{"tipo":"moneta"}', ?, ?)`,
      )
      .run(n, t, t)
    applica(d1, '0024_crazy_time.sql')
    expect(d1.sqlite.prepare('SELECT n, spicchio, stato, delta FROM ruota_giocate').all()).toEqual([
      { n: 1, spicchio: null, stato: 'fatto', delta: -20 },
    ])
    expect(d1.sqlite.prepare('SELECT netto, giri FROM ruota_giornate').all()).toEqual([{ netto: -20, giri: 1 }])
  })

  it('prepara trenta domande per materia, e le riconosce dall’impronta', () => {
    expect(DOMANDE_PER_MATERIA).toBe(30)
    expect(improntaDomanda(domanda(1))).not.toBe(improntaDomanda(domanda(2)))
  })
})

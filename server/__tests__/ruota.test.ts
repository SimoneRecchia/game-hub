import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DISPOSIZIONE_RUOTA,
  DOMANDE_PER_CATEGORIA,
  MOLTIPLICATORI,
  MOLTIPLICATORI_MONETA,
  PUNTATA_MINIMA,
  categorieDelGiorno,
  improntaDomanda,
  spicchiDelGiorno,
  type DomandaRuota,
  type Spicchio,
} from '../../shared/ruota'
import type { DomandaCompleta } from '../../shared/quiz-domande'
import type { GeneraleLeaderboard, OggiRisposta, RuotaStato } from '../../shared/types'
import { today } from '../lib/wordleStore'
import { ProvaD1, applica, banco, type Giocatore } from './banco'

type Banco = ReturnType<typeof banco>

/** Gli spicchi di oggi, e quelli che servono alle prove, per posto: il primo di ogni specie. */
const SPICCHI = spicchiDelGiorno(today().puzzleNumber)
const indice = (prova: (s: Spicchio) => boolean) => SPICCHI.findIndex(prova)
const BANCO = indice((s) => s.tipo === 'banco')
const MONETA = indice((s) => s.tipo === 'moneta')
const TRIPLO = indice((s) => s.tipo === 'fisso')
const DOMANDA = indice((s) => s.tipo === 'domanda')
/** La categoria del primo spicchio di domande, oggi. */
const CATEGORIA = categorieDelGiorno(today().puzzleNumber)[0]

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
 * Le domande di oggi, `quante` per ogni categoria del giorno: con tutte le
 * categorie ci sono tutti gli spicchi, e il numero che esce e' proprio l'indice
 * dello spicchio.
 */
function domandeDiOggi(b: Banco, quante = 1) {
  for (const categoria of categorieDelGiorno(today().puzzleNumber)) {
    const voci: DomandaRuota[] = Array.from({ length: quante }, (_, i) => ({ categoria, domanda: domanda(i) }))
    b.db.sqlite
      .prepare(
        'INSERT INTO ruota_domande (puzzle_number, materia, domande, created_at, formato) VALUES (?, ?, ?, ?, 3)',
      )
      .run(today().puzzleNumber, categoria, JSON.stringify(voci), new Date().toISOString())
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

  it('si gira quante volte si vuole, la puntata si paga subito, e il saldo e la generale seguono', async () => {
    const b = banco()
    const io = await b.giocatore('anna')
    puntiDiOggi(b, io, 90, 90)
    domandeDiOggi(b)
    expect(await stato(b, io)).toMatchObject({ classificate: 180, saldo: 180 })

    expect((await gira(b, io, 100, BANCO)).giro).toMatchObject({ n: 1, spicchio: BANCO, stato: 'fatto', delta: -100 })
    expect(await stato(b, io)).toMatchObject({ classificate: 180, netto: -100, giri: 1, saldo: 80 })
    // Il saldo che resta si puo' puntare tutto.
    expect((await gira(b, io, 80, BANCO)).giro).toMatchObject({ n: 2, delta: -80 })
    expect(await stato(b, io)).toMatchObject({ netto: -180, giri: 2, saldo: 0 })
    const finito = await b.chiama('POST', '/ruota/gira', io, { puntata: PUNTATA_MINIMA })
    expect(finito.dati.code).toBe('POCHI_PUNTI')

    const me = await generaleDiOggi(b, io)
    expect(me).toMatchObject({ punti: 0, ruota: -180, partite: 2 })
    expect(me?.perGioco).toMatchObject({ quiz: 90, cruciverba: 90 })
    const oggi = (await b.chiama<OggiRisposta>('GET', '/oggi', io)).dati
    expect(oggi.generale.punti).toBe(0)
    expect(oggi.ruota).toEqual({ saldo: 0, netto: -180, giri: 2, stato: 'gioca', spicchio: BANCO })
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
    expect((await gira(b, io, 137, BANCO)).giro).toMatchObject({ puntata: 137, delta: -137 })
  })

  it('fra un giro e l’altro passano almeno tre secondi', async () => {
    const b = banco()
    const io = await b.giocatore('anna')
    puntiDiOggi(b, io, 90, 90)
    domandeDiOggi(b)
    await gira(b, io, 50, BANCO)
    caso(BANCO)
    const subito = await b.chiama('POST', '/ruota/gira', io, { puntata: 50 })
    expect(subito.status).toBe(429)
    expect(subito.dati.code).toBe('TROPPO_PRESTO')
  })

  it('il saldo non si supera nemmeno con un giro scritto nel frattempo', async () => {
    const b = banco()
    const io = await b.giocatore('anna')
    puntiDiOggi(b, io, 50, 50)
    domandeDiOggi(b)
    await gira(b, io, 100, BANCO)
    // Un giro con lo stesso numero arrivato dopo, come da una seconda richiesta che aveva letto il saldo di prima.
    b.db.sqlite.prepare('DELETE FROM ruota_giocate WHERE player_id = ?').run(io.id)
    b.db.sqlite
      .prepare(
        `INSERT INTO ruota_giocate
           (player_id, puzzle_number, n, puntata, spicchio, stato, delta, disposizione, created_at, updated_at)
         VALUES (?, ?, 1, 100, ?, 'fatto', -100, ?, ?, ?)`,
      )
      .run(io.id, today().puzzleNumber, BANCO, DISPOSIZIONE_RUOTA, new Date(0).toISOString(), new Date(0).toISOString())
    const r = await b.chiama('POST', '/ruota/gira', io, { puntata: 100 })
    expect(r.status).toBe(409)
    expect(await stato(b, io)).toMatchObject({ saldo: 0, giri: 1 })
  })

  it('la moneta: il moltiplicatore lo porta dal giro, blu vince la puntata per lui, rosso e’ del banco', async () => {
    const b = banco()
    const io = await b.giocatore('anna')
    puntiDiOggi(b, io, 90, 90)
    domandeDiOggi(b)

    // Il secondo numero e' il moltiplicatore del blu: il terzo dei quattro, ×2.
    const giro = (await gira(b, io, 100, MONETA, 2)).giro!
    expect(MOLTIPLICATORI_MONETA[2]).toBe(2)
    expect(giro).toMatchObject({
      stato: 'sfida',
      delta: -100,
      sfida: { tipo: 'moneta', moltiplicatore: 2, vincita: 200, uscito: null },
    })
    expect((await generaleDiOggi(b, io))?.punti).toBe(80)
    caso(0)
    const blu = (await b.chiama<RuotaStato>('POST', '/ruota/moneta', io)).dati
    expect(blu.giro).toMatchObject({ stato: 'fatto', delta: 100, sfida: { uscito: 'blu' } })
    expect(blu.saldo).toBe(280)
    expect((await b.chiama('POST', '/ruota/moneta', io)).status).toBe(409)

    await gira(b, io, 80, MONETA, 0)
    caso(1)
    const rosso = (await b.chiama<RuotaStato>('POST', '/ruota/moneta', io)).dati
    expect(rosso.giro).toMatchObject({ delta: -80, sfida: { moltiplicatore: 1.25, uscito: 'rosso' } })
    expect(rosso.saldo).toBe(200)

    // Una moneta lasciata a meta': il giro dopo la chiude persa, e parte.
    await gira(b, io, 50, MONETA, 3)
    const dopo = await gira(b, io, 50, BANCO)
    expect(dopo).toMatchObject({ giri: 4, netto: 100 - 80 - 50 - 50, giro: { n: 4, delta: -50 } })
  })

  it('il triplo restituisce subito la puntata per tre', async () => {
    const b = banco()
    const io = await b.giocatore('anna')
    puntiDiOggi(b, io, 90, 90)
    domandeDiOggi(b)
    expect(TRIPLO).toBe(0)
    const dopo = await gira(b, io, 100, TRIPLO)
    expect(dopo.giro).toMatchObject({ spicchio: TRIPLO, stato: 'fatto', delta: 200, sfida: null })
    expect(dopo).toMatchObject({ netto: 200, saldo: 380 })
    expect((await generaleDiOggi(b, io))?.ruota).toBe(200)
  })

  it('la domanda: prima i moltiplicatori, poi la domanda, e giusta restituisce la puntata moltiplicata', async () => {
    const b = banco()
    const io = await b.giocatore('anna')
    puntiDiOggi(b, io, 90, 90)
    domandeDiOggi(b, 2)

    const giro = (await gira(b, io, 100, DOMANDA)).giro!
    expect(giro).toMatchObject({
      stato: 'sfida',
      delta: -100,
      sfida: { tipo: 'domanda', categoria: CATEGORIA, moltiplicatore: null, vincita: null, domanda: null },
    })
    const senza = await b.chiama('POST', '/ruota/domanda', io)
    expect(senza.status).toBe(409)
    expect(senza.dati.code).toBe('MOLTIPLICATORE')
    expect((await b.chiama('POST', '/ruota/risposta', io, { scelta: 'lis' })).status).toBe(409)

    caso(4)
    expect(MOLTIPLICATORI[4]).toBe(2)
    const girata = (await b.chiama<RuotaStato>('POST', '/ruota/moltiplicatore', io)).dati.giro!
    expect(girata.sfida).toMatchObject({ moltiplicatore: 2, spicchioMoltiplicatore: 4, vincita: 200 })
    // Si gira una volta sola: richiederla ridà lo stesso moltiplicatore.
    caso(0)
    expect((await b.chiama<RuotaStato>('POST', '/ruota/moltiplicatore', io)).dati.giro!.sfida).toMatchObject({
      moltiplicatore: 2,
    })

    caso(0)
    const aperta = (await b.chiama<RuotaStato>('POST', '/ruota/domanda', io)).dati.giro!
    const sfida = aperta.sfida as Extract<NonNullable<typeof aperta.sfida>, { tipo: 'domanda' }>
    expect(sfida.limiteMs).toBe(15_000)
    const vista = sfida.domanda as unknown as Record<string, unknown>
    for (const segreto of ['giusta', 'risposta', 'soggetto', 'spiegazione']) expect(vista[segreto]).toBeUndefined()
    const prima = sfida.domanda!.testo
    expect((await b.chiama('POST', '/ruota/moltiplicatore', io)).status).toBe(409)

    const risposta = (await b.chiama<RuotaStato>('POST', '/ruota/risposta', io, { scelta: 'lis' })).dati
    expect(risposta.giro).toMatchObject({ stato: 'fatto', delta: 100, sfida: { risposta: { giusta: true } } })
    expect(risposta.saldo).toBe(280)

    // Il giro dopo cade ancora sulla stessa categoria: la domanda e' l'altra, anche se il caso sceglierebbe la prima.
    await gira(b, io, 100, DOMANDA)
    caso(0)
    expect((await b.chiama<RuotaStato>('POST', '/ruota/moltiplicatore', io)).dati.giro!.sfida).toMatchObject({
      moltiplicatore: 3,
      vincita: 300,
    })
    caso(0)
    const seconda = (await b.chiama<RuotaStato>('POST', '/ruota/domanda', io)).dati.giro!
    expect((seconda.sfida as typeof sfida).domanda!.testo).not.toBe(prima)
    const sbagliata = (await b.chiama<RuotaStato>('POST', '/ruota/risposta', io, { scelta: 'opo' })).dati
    expect(sbagliata.giro).toMatchObject({ delta: -100, sfida: { risposta: { giusta: false } } })
    expect(await stato(b, io)).toMatchObject({ netto: 100 - 100, giri: 2 })

    // Finite le domande della categoria, il suo spicchio non esce piu': il numero cade sullo spicchio dopo.
    const terzo = await gira(b, io, 100, DOMANDA)
    expect(SPICCHI[terzo.giro!.spicchio]).not.toEqual({ tipo: 'domanda', categoria: CATEGORIA })
  })

  it('sbagliata, la domanda toglie tutta la puntata, anche con il moltiplicatore piu’ piccolo', async () => {
    const b = banco()
    const io = await b.giocatore('anna')
    puntiDiOggi(b, io, 90, 90)
    domandeDiOggi(b)
    await gira(b, io, 100, DOMANDA)
    caso(1)
    expect(MOLTIPLICATORI[1]).toBe(1.25)
    expect((await b.chiama<RuotaStato>('POST', '/ruota/moltiplicatore', io)).dati.giro!.sfida).toMatchObject({
      moltiplicatore: 1.25,
      vincita: 125,
    })
    caso(0)
    await b.chiama('POST', '/ruota/domanda', io)
    const sbagliata = (await b.chiama<RuotaStato>('POST', '/ruota/risposta', io, { scelta: 'opo' })).dati
    expect(sbagliata).toMatchObject({ netto: -100, saldo: 80, giro: { stato: 'fatto', delta: -100 } })
  })

  it('una risposta in ritardo e una domanda lasciata aperta li prende il banco', async () => {
    const b = banco()
    const io = await b.giocatore('anna')
    puntiDiOggi(b, io, 90, 90)
    domandeDiOggi(b, 3)
    await gira(b, io, 100, DOMANDA)
    caso(0)
    await b.chiama('POST', '/ruota/moltiplicatore', io)
    caso(0)
    await b.chiama('POST', '/ruota/domanda', io)
    b.db.sqlite
      .prepare('UPDATE ruota_giocate SET aperta_at = ? WHERE player_id = ?')
      .run(new Date(Date.now() - 60_000).toISOString(), io.id)
    const tardi = (await b.chiama<RuotaStato>('POST', '/ruota/risposta', io, { scelta: 'lis' })).dati.giro!
    expect(tardi).toMatchObject({ stato: 'fatto', delta: -100, sfida: { risposta: { scelta: null, giusta: false } } })

    await gira(b, io, 50, DOMANDA)
    caso(0)
    await b.chiama('POST', '/ruota/moltiplicatore', io)
    caso(0)
    await b.chiama('POST', '/ruota/domanda', io)
    b.db.sqlite
      .prepare('UPDATE ruota_giocate SET aperta_at = ? WHERE player_id = ? AND n = 2')
      .run(new Date(Date.now() - 60_000).toISOString(), io.id)
    const chiusa = (await stato(b, io)).giro!
    expect(chiusa).toMatchObject({ n: 2, stato: 'fatto', delta: -50, sfida: { risposta: { scelta: null } } })
    expect((await stato(b, io)).netto).toBe(-150)
  })

  it('un giro della ruota di prima conta i suoi punti, ma non si mostra', async () => {
    const b = banco()
    const io = await b.giocatore('anna')
    puntiDiOggi(b, io, 90, 90)
    domandeDiOggi(b)
    const t = new Date(Date.now() - 60_000).toISOString()
    b.db.sqlite
      .prepare(
        `INSERT INTO ruota_giocate
           (player_id, puzzle_number, n, puntata, spicchio, stato, delta, disposizione, created_at, updated_at)
         VALUES (?, ?, 1, 40, 3, 'fatto', 40, ?, ?, ?)`,
      )
      .run(io.id, today().puzzleNumber, DISPOSIZIONE_RUOTA - 1, t, t)
    b.db.sqlite
      .prepare('INSERT INTO ruota_giornate (player_id, puzzle_number, netto, giri) VALUES (?, ?, 40, 1)')
      .run(io.id, today().puzzleNumber)
    expect(await stato(b, io)).toMatchObject({ netto: 40, giri: 1, saldo: 220, giro: null })
    const oggi = await b.chiama<OggiRisposta>('GET', '/oggi', io)
    expect(oggi.dati.ruota).toMatchObject({ stato: 'gioca', spicchio: null })
    expect((await b.chiama('POST', '/ruota/moneta', io)).status).toBe(409)
    expect((await gira(b, io, 20, BANCO)).giro).toMatchObject({ n: 2, delta: -20 })
  })

  it('la migrazione della ruota da casinò chiude le sfide rimaste a meta’, con i loro punti', () => {
    const d1 = new ProvaD1('0025_crazy_time_casino.sql')
    const n = today().puzzleNumber
    const t = new Date().toISOString()
    d1.sqlite.exec('PRAGMA foreign_keys = OFF')
    const giro = d1.sqlite.prepare(
      `INSERT INTO ruota_giocate (player_id, puzzle_number, n, puntata, spicchio, stato, delta, sfida, created_at,
         updated_at) VALUES ('p1', ?, ?, 100, ?, ?, ?, ?, ?, ?)`,
    )
    giro.run(n, 1, 0, 'fatto', 100, null, t, t)
    giro.run(n, 2, 2, 'sfida', -25, '{"tipo":"domanda","materia":"geografia"}', t, t)
    applica(d1, '0025_crazy_time_casino.sql')
    expect(d1.sqlite.prepare('SELECT n, stato, delta, disposizione FROM ruota_giocate ORDER BY n').all()).toEqual([
      { n: 1, stato: 'fatto', delta: 100, disposizione: 1 },
      { n: 2, stato: 'fatto', delta: -25, disposizione: 1 },
    ])
  })

  it('i giri della ruota di una volta al giorno passano con i loro punti, chiusi e senza spicchio', async () => {
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

  it('prepara trenta domande per categoria, e le riconosce dall’impronta', () => {
    expect(DOMANDE_PER_CATEGORIA).toBe(30)
    expect(improntaDomanda(domanda(1))).not.toBe(improntaDomanda(domanda(2)))
  })
})

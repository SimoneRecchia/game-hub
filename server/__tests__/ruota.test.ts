import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CategoriaQuiz } from '../../shared/quiz'
import {
  CATEGORIE_RUOTA,
  DISPOSIZIONE_RUOTA,
  DOMANDE_PER_CATEGORIA,
  FORMATO_DOMANDE_RUOTA,
  MOLTIPLICATORI_MONETA,
  MOLTIPLICATORI_MONETA_FORTUNATA,
  MOLTIPLICATORI_QUIZ,
  MOLTIPLICATORI_QUIZ_FORTUNATI,
  POSTO_FORTUNA,
  PUNTATA_MINIMA,
  SPICCHI_FORTUNATI,
  SPICCHI_RUOTA,
  improntaDomanda,
  type DomandaRuota,
  type Spicchio,
} from '../../shared/ruota'
import type { DomandaCompleta } from '../../shared/quiz-domande'
import type {
  FortunaRisposta,
  GeneraleLeaderboard,
  GiroRuota,
  OggiRisposta,
  RuotaStato,
  SfidaRuotaVista,
} from '../../shared/types'
import { today } from '../lib/wordleStore'
import { ProvaD1, applica, banco, type Giocatore } from './banco'

type Banco = ReturnType<typeof banco>
type Quiz = Extract<SfidaRuotaVista, { tipo: 'domanda' }>

/** Gli spicchi che servono alle prove, per posto: il primo di ogni specie. */
const indice = (spicchi: readonly Spicchio[], prova: (s: Spicchio) => boolean) => spicchi.findIndex(prova)
const BANCO = indice(SPICCHI_RUOTA, (s) => s.tipo === 'banco')
const MONETA = indice(SPICCHI_RUOTA, (s) => s.tipo === 'moneta')
const TRIPLO = indice(SPICCHI_RUOTA, (s) => s.tipo === 'fisso')
const QUIZ = indice(SPICCHI_RUOTA, (s) => s.tipo === 'quiz')
const DIECI = indice(SPICCHI_FORTUNATI, (s) => s.tipo === 'fisso' && s.moltiplicatore === 10)
const BANCO_FORTUNATO = indice(SPICCHI_FORTUNATI, (s) => s.tipo === 'banco')
const MONETA_FORTUNATA = indice(SPICCHI_FORTUNATI, (s) => s.tipo === 'moneta')
const QUIZ_FORTUNATO = indice(SPICCHI_FORTUNATI, (s) => s.tipo === 'quiz')

/**
 * Il caso, deciso dalla prova: ogni chiamata a `crypto.getRandomValues` prende
 * il prossimo numero della coda, e poi zero. Un numero piccolo e' proprio
 * l'indice che esce, perché il server prende il resto della divisione.
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

/** Le domande di oggi, `quante` per ognuna delle categorie, come le scrive la notte. */
function domandeDiOggi(b: Banco, quante = 1, categorie: readonly CategoriaQuiz[] = CATEGORIE_RUOTA) {
  for (const categoria of categorie) {
    const voci: DomandaRuota[] = Array.from({ length: quante }, (_, i) => ({ categoria, domanda: domanda(i) }))
    b.db.sqlite
      .prepare(
        'INSERT INTO ruota_domande (puzzle_number, materia, domande, created_at, formato) VALUES (?, ?, ?, ?, ?)',
      )
      .run(today().puzzleNumber, categoria, JSON.stringify(voci), new Date().toISOString(), FORMATO_DOMANDE_RUOTA)
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

/** Una richiesta che scrive, con il suo caso: deve andare. */
async function scrivi(b: Banco, io: Giocatore, rotta: string, numeri: number[] = [], corpo?: unknown) {
  caso(...numeri)
  const r = await b.chiama<RuotaStato>('POST', rotta, io, corpo)
  expect(r.status, JSON.stringify(r.dati)).toBe(200)
  return r.dati
}

const quiz = (g: GiroRuota | null) => g?.sfida as Quiz

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

    expect((await gira(b, io, 100, BANCO)).giro).toMatchObject({
      n: 1,
      spicchio: BANCO,
      fortunata: null,
      stato: 'fatto',
      delta: -100,
      sfida: null,
    })
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
    const fortuna = (await b.chiama<FortunaRisposta>('GET', '/fortuna', io)).dati
    expect(fortuna.ruota).toEqual({ saldo: 0, netto: -180, giri: 2, stato: 'gioca', spicchio: BANCO, fortunata: null })
    expect(fortuna).toMatchObject({ classificate: 180, saldo: 0, netti: { ruota: -180 }, giocate: { ruota: 2 } })
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
      fortunata: null,
      sfida: { tipo: 'moneta', fortunata: false, moltiplicatore: 2, vincita: 200, uscito: null },
    })
    expect((await generaleDiOggi(b, io))?.punti).toBe(80)
    const blu = await scrivi(b, io, '/ruota/moneta', [0])
    expect(blu.giro).toMatchObject({ stato: 'fatto', delta: 100, sfida: { uscito: 'blu' } })
    expect(blu.saldo).toBe(280)
    expect((await b.chiama('POST', '/ruota/moneta', io)).status).toBe(409)

    await gira(b, io, 80, MONETA, 0)
    const rosso = await scrivi(b, io, '/ruota/moneta', [1])
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

  it('il quiz: la ruota del quiz con dodici categorie, poi la domanda, e giusta paga il moltiplicatore', async () => {
    const b = banco()
    const io = await b.giocatore('anna')
    puntiDiOggi(b, io, 90, 90)
    domandeDiOggi(b, 2)

    const giro = (await gira(b, io, 100, QUIZ)).giro!
    expect(giro).toMatchObject({
      spicchio: QUIZ,
      stato: 'sfida',
      delta: -100,
      sfida: { tipo: 'domanda', fortunata: false, spicchioQuiz: null, categoria: null, moltiplicatore: null },
    })
    const categorie = quiz(giro).categorie
    expect(categorie).toHaveLength(12)
    expect(new Set(categorie).size).toBe(12)
    expect(categorie.every((c) => CATEGORIE_RUOTA.includes(c))).toBe(true)

    const senza = await b.chiama('POST', '/ruota/domanda', io)
    expect(senza.status).toBe(409)
    expect(senza.dati.code).toBe('RUOTA_QUIZ')
    expect((await b.chiama('POST', '/ruota/risposta', io, { scelta: 'lis' })).status).toBe(409)
    expect((await b.chiama('POST', '/ruota/fortuna', io)).dati.code).toBe('NESSUNA_FORTUNA')

    // La ruota del quiz si ferma sullo spicchio del ×2: la sua categoria, e il suo moltiplicatore.
    const doppio = MOLTIPLICATORI_QUIZ.indexOf(2)
    const girata = (await scrivi(b, io, '/ruota/quiz', [doppio])).giro!
    expect(quiz(girata)).toMatchObject({
      spicchioQuiz: doppio,
      categoria: categorie[doppio],
      moltiplicatore: 2,
      vincita: 200,
      categorie,
    })
    // Si gira una volta sola: richiederla ridà lo stesso spicchio.
    expect(quiz((await scrivi(b, io, '/ruota/quiz', [0])).giro)).toMatchObject({ spicchioQuiz: doppio })

    const aperta = (await scrivi(b, io, '/ruota/domanda', [0])).giro!
    expect(quiz(aperta).limiteMs).toBe(15_000)
    const vista = quiz(aperta).domanda as unknown as Record<string, unknown>
    for (const segreto of ['giusta', 'risposta', 'soggetto', 'spiegazione']) expect(vista[segreto]).toBeUndefined()
    const prima = quiz(aperta).domanda!.testo
    expect((await b.chiama('POST', '/ruota/quiz', io)).status).toBe(409)

    const risposta = await scrivi(b, io, '/ruota/risposta', [], { scelta: 'lis' })
    expect(risposta.giro).toMatchObject({ stato: 'fatto', delta: 100, sfida: { risposta: { giusta: true } } })
    expect(risposta.saldo).toBe(280)

    // La categoria di prima torna sulla ruota del quiz, finché ha domande: la domanda e' l'altra.
    const secondo = (await gira(b, io, 100, QUIZ)).giro!
    const stessa = quiz(secondo).categorie.indexOf(categorie[doppio])
    expect(stessa).toBeGreaterThanOrEqual(0)
    await scrivi(b, io, '/ruota/quiz', [stessa])
    const seconda = (await scrivi(b, io, '/ruota/domanda', [0])).giro!
    expect(quiz(seconda).domanda!.testo).not.toBe(prima)
    const sbagliata = await scrivi(b, io, '/ruota/risposta', [], { scelta: 'opo' })
    expect(sbagliata.giro).toMatchObject({ delta: -100, sfida: { risposta: { giusta: false } } })
    expect(await stato(b, io)).toMatchObject({ netto: 100 - 100, giri: 2 })

    // Finite le sue domande, la categoria non va piu' sulla ruota del quiz.
    const terzo = (await gira(b, io, 10, QUIZ)).giro!
    expect(quiz(terzo).categorie).not.toContain(categorie[doppio])
    expect(new Set(quiz(terzo).categorie).size).toBe(12)
  })

  it('con poche categorie la ruota del quiz le ripete, e senza nessuna il quiz non esce', async () => {
    const b = banco()
    const io = await b.giocatore('anna')
    puntiDiOggi(b, io, 90, 90)
    domandeDiOggi(b, 1, ['arte', 'fiumi', 'nobel'])
    const giro = (await gira(b, io, 10, QUIZ)).giro!
    expect(new Set(quiz(giro).categorie)).toEqual(new Set(['arte', 'fiumi', 'nobel']))
    expect(quiz(giro).categorie).toHaveLength(12)

    // Nessuna domanda: il numero del quiz cade sullo spicchio dopo, che non e' un quiz.
    const vuoto = banco()
    const tu = await vuoto.giocatore('bea')
    puntiDiOggi(vuoto, tu, 90, 90)
    const senza = (await gira(vuoto, tu, 10, QUIZ)).giro!
    expect(SPICCHI_RUOTA[senza.spicchio].tipo).not.toBe('quiz')
  })

  it('sbagliata, la domanda toglie tutta la puntata, anche con il moltiplicatore piu’ piccolo', async () => {
    const b = banco()
    const io = await b.giocatore('anna')
    puntiDiOggi(b, io, 90, 90)
    domandeDiOggi(b)
    await gira(b, io, 100, QUIZ)
    const piccolo = MOLTIPLICATORI_QUIZ.indexOf(1.25)
    expect(quiz((await scrivi(b, io, '/ruota/quiz', [piccolo])).giro)).toMatchObject({
      moltiplicatore: 1.25,
      vincita: 125,
    })
    await scrivi(b, io, '/ruota/domanda', [0])
    const sbagliata = await scrivi(b, io, '/ruota/risposta', [], { scelta: 'opo' })
    expect(sbagliata).toMatchObject({ netto: -100, saldo: 80, giro: { stato: 'fatto', delta: -100 } })
  })

  it('una risposta in ritardo e una domanda lasciata aperta li prende il banco', async () => {
    const b = banco()
    const io = await b.giocatore('anna')
    puntiDiOggi(b, io, 90, 90)
    domandeDiOggi(b, 3)
    await gira(b, io, 100, QUIZ)
    await scrivi(b, io, '/ruota/quiz', [0])
    await scrivi(b, io, '/ruota/domanda', [0])
    b.db.sqlite
      .prepare('UPDATE ruota_giocate SET aperta_at = ? WHERE player_id = ?')
      .run(new Date(Date.now() - 60_000).toISOString(), io.id)
    const tardi = (await scrivi(b, io, '/ruota/risposta', [], { scelta: 'lis' })).giro!
    expect(tardi).toMatchObject({ stato: 'fatto', delta: -100, sfida: { risposta: { scelta: null, giusta: false } } })

    await gira(b, io, 50, QUIZ)
    await scrivi(b, io, '/ruota/quiz', [0])
    await scrivi(b, io, '/ruota/domanda', [0])
    b.db.sqlite
      .prepare('UPDATE ruota_giocate SET aperta_at = ? WHERE player_id = ? AND n = 2')
      .run(new Date(Date.now() - 60_000).toISOString(), io.id)
    const chiusa = (await stato(b, io)).giro!
    expect(chiusa).toMatchObject({ n: 2, stato: 'fatto', delta: -50, sfida: { risposta: { scelta: null } } })
    expect((await stato(b, io)).netto).toBe(-150)
  })

  it('la fortuna: la ruota fortunata si gira con la stessa puntata, una volta, e il ×10 paga subito', async () => {
    const b = banco()
    const io = await b.giocatore('anna')
    puntiDiOggi(b, io, 90, 90)
    domandeDiOggi(b)

    const giro = (await gira(b, io, 100, POSTO_FORTUNA)).giro!
    expect(giro).toMatchObject({ spicchio: POSTO_FORTUNA, fortunata: null, stato: 'sfida', delta: -100 })
    expect(giro.sfida).toEqual({ tipo: 'fortuna' })
    const fortuna = (await b.chiama<FortunaRisposta>('GET', '/fortuna', io)).dati
    expect(fortuna.ruota).toMatchObject({ stato: 'sfida', spicchio: POSTO_FORTUNA, fortunata: null })
    expect((await b.chiama('POST', '/ruota/quiz', io)).dati.code).toBe('NESSUN_QUIZ')
    expect((await b.chiama('POST', '/ruota/moneta', io)).dati.code).toBe('NESSUNA_MONETA')

    const dieci = await scrivi(b, io, '/ruota/fortuna', [DIECI])
    expect(dieci.giro).toMatchObject({ spicchio: POSTO_FORTUNA, fortunata: DIECI, stato: 'fatto', delta: 900 })
    expect(dieci.giro!.sfida).toBeNull()
    expect(dieci).toMatchObject({ netto: 900, giri: 1, saldo: 1080 })
    // Si gira una volta sola: richiederla ridà lo stesso spicchio, e non paga di nuovo.
    const ancora = await scrivi(b, io, '/ruota/fortuna', [BANCO_FORTUNATO])
    expect(ancora).toMatchObject({ netto: 900, giro: { fortunata: DIECI, delta: 900 } })
    expect((await generaleDiOggi(b, io))?.ruota).toBe(900)
    expect((await b.chiama<FortunaRisposta>('GET', '/fortuna', io)).dati.ruota).toMatchObject({
      stato: 'gioca',
      spicchio: POSTO_FORTUNA,
      fortunata: DIECI,
    })

    // Il banco della ruota fortunata si tiene la puntata.
    await gira(b, io, 100, POSTO_FORTUNA)
    const persa = await scrivi(b, io, '/ruota/fortuna', [BANCO_FORTUNATO])
    expect(persa.giro).toMatchObject({ fortunata: BANCO_FORTUNATO, stato: 'fatto', delta: -100 })
    expect(persa.netto).toBe(800)
  })

  it('la fortuna lasciata senza girarla e’ persa: il giro dopo la chiude', async () => {
    const b = banco()
    const io = await b.giocatore('anna')
    puntiDiOggi(b, io, 90, 90)
    domandeDiOggi(b)
    await gira(b, io, 60, POSTO_FORTUNA)
    const dopo = await gira(b, io, 20, BANCO)
    expect(dopo).toMatchObject({ netto: -80, giri: 2, giro: { n: 2 } })
    const r = await b.chiama('POST', '/ruota/fortuna', io)
    expect(r.dati.code).toBe('NESSUNA_SFIDA')
  })

  it('la moneta della fortuna porta i moltiplicatori della fortuna', async () => {
    const b = banco()
    const io = await b.giocatore('anna')
    puntiDiOggi(b, io, 90, 90)
    domandeDiOggi(b)
    await gira(b, io, 100, POSTO_FORTUNA)
    // Il secondo numero e' il moltiplicatore del blu: l'ultimo dei quattro, ×5.
    const moneta = (await scrivi(b, io, '/ruota/fortuna', [MONETA_FORTUNATA, 3])).giro!
    expect(MOLTIPLICATORI_MONETA_FORTUNATA[3]).toBe(5)
    expect(moneta).toMatchObject({
      fortunata: MONETA_FORTUNATA,
      stato: 'sfida',
      delta: -100,
      sfida: { tipo: 'moneta', fortunata: true, moltiplicatore: 5, vincita: 500, uscito: null },
    })
    const blu = await scrivi(b, io, '/ruota/moneta', [0])
    expect(blu).toMatchObject({ netto: 400, giro: { stato: 'fatto', delta: 400, fortunata: MONETA_FORTUNATA } })
  })

  it('il quiz della fortuna: la stessa ruota del quiz, con i moltiplicatori saliti fino al ×10', async () => {
    const b = banco()
    const io = await b.giocatore('anna')
    puntiDiOggi(b, io, 90, 90)
    domandeDiOggi(b)
    await gira(b, io, 100, POSTO_FORTUNA)
    const giro = (await scrivi(b, io, '/ruota/fortuna', [QUIZ_FORTUNATO])).giro!
    expect(giro).toMatchObject({ fortunata: QUIZ_FORTUNATO, stato: 'sfida', delta: -100 })
    expect(quiz(giro)).toMatchObject({ tipo: 'domanda', fortunata: true, spicchioQuiz: null })
    expect(quiz(giro).categorie).toHaveLength(12)

    expect(MOLTIPLICATORI_QUIZ_FORTUNATI[0]).toBe(10)
    const girata = (await scrivi(b, io, '/ruota/quiz', [0])).giro!
    expect(quiz(girata)).toMatchObject({ spicchioQuiz: 0, moltiplicatore: 10, vincita: 1000 })
    await scrivi(b, io, '/ruota/domanda', [0])
    const giusta = await scrivi(b, io, '/ruota/risposta', [], { scelta: 'lis' })
    expect(giusta).toMatchObject({ netto: 900, saldo: 1080, giro: { stato: 'fatto', delta: 900 } })
  })

  it('senza domande da dare, nemmeno la ruota fortunata si ferma sul quiz', async () => {
    const b = banco()
    const io = await b.giocatore('anna')
    puntiDiOggi(b, io, 90, 90)
    // Niente quiz: la fortuna e' il sesto degli spicchi che restano.
    const possibili = SPICCHI_RUOTA.flatMap((s, i) => (s.tipo === 'quiz' ? [] : [i]))
    const giro = (await gira(b, io, 100, possibili.indexOf(POSTO_FORTUNA))).giro!
    expect(giro.spicchio).toBe(POSTO_FORTUNA)
    const fortunata = (await scrivi(b, io, '/ruota/fortuna', [QUIZ_FORTUNATO])).giro!
    expect(SPICCHI_FORTUNATI[fortunata.fortunata!].tipo).not.toBe('quiz')
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
           (player_id, puzzle_number, n, puntata, spicchio, stato, delta, sfida, disposizione, created_at, updated_at)
         VALUES (?, ?, 1, 40, 3, 'sfida', -40, ?, ?, ?, ?)`,
      )
      .run(io.id, today().puzzleNumber, '{"tipo":"domanda","categoria":"arte"}', DISPOSIZIONE_RUOTA - 1, t, t)
    b.db.sqlite
      .prepare('INSERT INTO ruota_giornate (player_id, puzzle_number, netto, giri) VALUES (?, ?, -40, 1)')
      .run(io.id, today().puzzleNumber)
    expect(await stato(b, io)).toMatchObject({ netto: -40, giri: 1, saldo: 140, giro: null })
    const fortuna = await b.chiama<FortunaRisposta>('GET', '/fortuna', io)
    expect(fortuna.dati.ruota).toMatchObject({ stato: 'gioca', spicchio: null, fortunata: null })
    // La sua sfida non si gioca piu': la chiude il giro dopo, con la puntata gia' persa.
    for (const rotta of ['/ruota/quiz', '/ruota/domanda', '/ruota/moneta', '/ruota/fortuna']) {
      expect((await b.chiama('POST', rotta, io)).dati.code, rotta).toBe('NESSUN_GIRO')
    }
    expect((await gira(b, io, 20, BANCO)).giro).toMatchObject({ n: 2, delta: -20 })
    expect(await stato(b, io)).toMatchObject({ netto: -60, giri: 2 })
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

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CategoriaQuiz } from '../../shared/quiz'
import type { DomandaCompleta } from '../../shared/quiz-domande'
import { SPICCHI_RUOTA, categorieDelGiorno, improntaDomanda, type DomandaRuota } from '../../shared/ruota'
import {
  DISPOSIZIONE_SLOT,
  VINCITA_DOMANDA,
  apreDomanda,
  lineaDi,
  premioDellaLinea,
} from '../../shared/slot'
import type { FortunaRisposta, GeneraleLeaderboard, RuotaStato, SlotStato } from '../../shared/types'
import { today } from '../lib/wordleStore'
import { banco, type Giocatore } from './banco'

type Banco = ReturnType<typeof banco>

/** Le fermate delle prove: i tre sette, una ciliegia sola, niente, e tre punti di domanda in vista. */
const SETTE = [35, 28, 37]
const CILIEGIA = [13, 1, 4]
const NIENTE = [2, 2, 6]
const DOMANDA = [1, 5, 2]
const CATEGORIE = categorieDelGiorno(today().puzzleNumber)

/**
 * Il caso, deciso dalla prova: ogni chiamata a `crypto.getRandomValues` prende
 * il prossimo numero della coda, e il server prende il resto della divisione.
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

/** Le domande di oggi, `quante` per ognuna delle categorie, come le scrive la notte per Crazy Time. */
function domandeDiOggi(b: Banco, quante = 1, categorie: readonly CategoriaQuiz[] = CATEGORIE) {
  for (const categoria of categorie) {
    const voci: DomandaRuota[] = Array.from({ length: quante }, (_, i) => ({ categoria, domanda: domanda(i) }))
    b.db.sqlite
      .prepare(
        'INSERT INTO ruota_domande (puzzle_number, materia, domande, created_at, formato) VALUES (?, ?, ?, ?, 3)',
      )
      .run(today().puzzleNumber, categoria, JSON.stringify(voci), new Date().toISOString())
  }
}

/** Il tempo fra due giri passa: il server ne vuole un paio di secondi, e la prova non aspetta davvero. */
function passaIlTempo(b: Banco, io: Giocatore) {
  const prima = new Date(Date.now() - 60_000).toISOString()
  b.db.sqlite.prepare('UPDATE slot_giri SET created_at = ? WHERE player_id = ?').run(prima, io.id)
  b.db.sqlite.prepare('UPDATE ruota_giocate SET created_at = ? WHERE player_id = ?').run(prima, io.id)
}

async function stato(b: Banco, io: Giocatore): Promise<SlotStato> {
  const r = await b.chiama<SlotStato>('GET', '/slot', io)
  expect(r.status, JSON.stringify(r.dati)).toBe(200)
  return r.dati
}

async function gira(b: Banco, io: Giocatore, puntata: number, ...numeri: number[]) {
  passaIlTempo(b, io)
  caso(...numeri)
  const r = await b.chiama<SlotStato>('POST', '/slot/gira', io, { puntata })
  expect(r.status, JSON.stringify(r.dati)).toBe(200)
  return r.dati
}

async function generaleDiOggi(b: Banco, io: Giocatore) {
  return (await b.chiama<GeneraleLeaderboard>('GET', '/leaderboard/generale?scope=today', io)).dati.me
}

describe('la slot', () => {
  it('le fermate delle prove sono quel che dicono', () => {
    expect(lineaDi(SETTE)).toEqual(['7', '7', '7'])
    expect(lineaDi(CILIEGIA).filter((c) => c === 'C')).toHaveLength(1)
    expect(premioDellaLinea(lineaDi(NIENTE))).toBe(0)
    expect(premioDellaLinea(lineaDi(DOMANDA))).toBe(0)
    for (const f of [SETTE, CILIEGIA, NIENTE]) expect(apreDomanda(f)).toBe(false)
    expect(apreDomanda(DOMANDA)).toBe(true)
  })

  it('senza i punti delle classificate non si gioca', async () => {
    const b = banco()
    const io = await b.giocatore('anna')
    expect(await stato(b, io)).toMatchObject({ classificate: 0, saldo: 0, netto: 0, giri: 0, giro: null })
    const r = await b.chiama('POST', '/slot/gira', io, { puntata: 1 })
    expect(r.status).toBe(409)
    expect(r.dati.code).toBe('POCHI_PUNTI')
  })

  it('la puntata si paga al giro, la linea paga subito, e il saldo e la generale seguono', async () => {
    const b = banco()
    const io = await b.giocatore('anna')
    puntiDiOggi(b, io, 50, 50)
    domandeDiOggi(b)
    const niente = await gira(b, io, 5, ...NIENTE)
    expect(niente.giro).toMatchObject({ n: 1, fermate: NIENTE, premio: 0, tripla: null, stato: 'fatto', delta: -5 })
    expect(niente).toMatchObject({ saldo: 95, netto: -5, giri: 1, categorie: CATEGORIE })

    // Una ciliegia sola ridà la puntata: una vincita che non cambia il saldo.
    const ciliegia = await gira(b, io, 5, ...CILIEGIA)
    expect(ciliegia.giro).toMatchObject({ n: 2, premio: 1, delta: 0 })
    expect(ciliegia.saldo).toBe(95)
    const sette = await gira(b, io, 10, ...SETTE)
    expect(sette.giro).toMatchObject({ n: 3, premio: 300, delta: 2990 })
    expect(sette).toMatchObject({ saldo: 100 - 5 + 2990, netto: 2985, giri: 3 })

    const me = await generaleDiOggi(b, io)
    expect(me).toMatchObject({ punti: 100 + 2985, slot: 2985, ruota: 0, blackjack: 0 })
    const riga = b.db.sqlite
      .prepare('SELECT netto, giocate FROM fortuna_giornate WHERE player_id = ? AND gioco = ?')
      .get(io.id, 'slot')
    expect(riga).toEqual({ netto: 2985, giocate: 3 })
  })

  it('si punta da uno a tutto il saldo, e mai di piu’', async () => {
    const b = banco()
    const io = await b.giocatore('anna')
    puntiDiOggi(b, io, 3, 3)
    domandeDiOggi(b)
    for (const puntata of [0, 7, 2.5, '2', null]) {
      const r = await b.chiama('POST', '/slot/gira', io, { puntata })
      expect(r.status, String(puntata)).toBe(400)
      expect(r.dati.code).toBe('PUNTATA')
    }
    expect((await gira(b, io, 6, ...NIENTE)).giro).toMatchObject({ puntata: 6, delta: -6 })
    expect((await stato(b, io)).saldo).toBe(0)
  })

  it('fra un giro e l’altro passano un paio di secondi', async () => {
    const b = banco()
    const io = await b.giocatore('anna')
    puntiDiOggi(b, io, 50, 50)
    domandeDiOggi(b)
    await gira(b, io, 1, ...NIENTE)
    caso(...NIENTE)
    const subito = await b.chiama('POST', '/slot/gira', io, { puntata: 1 })
    expect(subito.status).toBe(429)
    expect(subito.dati.code).toBe('TROPPO_PRESTO')
  })

  it('il saldo e’ quello di Crazy Time: quel che si perde a un gioco non si punta all’altro', async () => {
    const b = banco()
    const io = await b.giocatore('anna')
    puntiDiOggi(b, io, 10, 10)
    domandeDiOggi(b)
    const banchi = SPICCHI_RUOTA.findIndex((s) => s.tipo === 'banco')
    caso(banchi)
    const ruota = await b.chiama<RuotaStato>('POST', '/ruota/gira', io, { puntata: 15 })
    expect(ruota.dati).toMatchObject({ saldo: 5, netto: -15 })
    expect(await stato(b, io)).toMatchObject({ saldo: 5, netto: 0 })
    const troppo = await b.chiama('POST', '/slot/gira', io, { puntata: 6 })
    expect(troppo.dati.code).toBe('PUNTATA')
    await gira(b, io, 5, ...NIENTE)
    const dopo = (await b.chiama<RuotaStato>('GET', '/ruota', io)).dati
    expect(dopo).toMatchObject({ saldo: 0, netto: -15 })
    const fortuna = (await b.chiama<FortunaRisposta>('GET', '/fortuna', io)).dati
    expect(fortuna).toMatchObject({
      classificate: 20,
      saldo: 0,
      netti: { ruota: -15, slot: -5, blackjack: 0 },
      giocate: { ruota: 1, slot: 1, blackjack: 0 },
      slot: { stato: 'gioca' },
    })
    expect((await generaleDiOggi(b, io))?.punti).toBe(0)
  })

  it('il saldo non si supera nemmeno con una puntata scritta nel frattempo, a un altro gioco', async () => {
    const b = banco()
    const io = await b.giocatore('anna')
    puntiDiOggi(b, io, 5, 5)
    domandeDiOggi(b)
    // Una puntata persa a Crazy Time fra la lettura del saldo e la scrittura del giro.
    const batch = b.db.batch.bind(b.db)
    vi.spyOn(b.db, 'batch').mockImplementation(async (istruzioni) => {
      if (istruzioni.some((i) => i.sql.includes('INTO slot_giri'))) {
        b.db.sqlite
          .prepare('INSERT INTO ruota_giornate (player_id, puzzle_number, netto, giri) VALUES (?, ?, -10, 1)')
          .run(io.id, today().puzzleNumber)
      }
      return batch(istruzioni)
    })
    caso(...NIENTE)
    const r = await b.chiama('POST', '/slot/gira', io, { puntata: 1 })
    expect(r.status).toBe(409)
    expect(r.dati.code).toBe('CONFLITTO')
    expect(await stato(b, io)).toMatchObject({ saldo: 0, giri: 0 })
  })

  it('tre punti di domanda, dovunque in vista: una domanda, e giusta paga quindici volte', async () => {
    const b = banco()
    const io = await b.giocatore('anna')
    puntiDiOggi(b, io, 50, 50)
    domandeDiOggi(b, 2)
    const giro = (await gira(b, io, 4, ...DOMANDA)).giro!
    expect(giro).toMatchObject({
      tripla: { categoria: CATEGORIE[0] },
      stato: 'sfida',
      delta: -4,
      vincitaDomanda: 4 * VINCITA_DOMANDA,
      domanda: null,
    })
    caso(1)
    const aperta = (await b.chiama<SlotStato>('POST', '/slot/domanda', io)).dati.giro!
    expect(aperta).toMatchObject({ stato: 'domanda', domanda: { testo: domanda(1).testo }, risposta: null })
    // La risposta non viaggia con la domanda.
    const vista = aperta.domanda as unknown as Record<string, unknown>
    for (const segreto of ['giusta', 'risposta', 'soggetto']) expect(vista[segreto]).toBeUndefined()
    // Chiederla di nuovo non la cambia.
    expect((await b.chiama<SlotStato>('POST', '/slot/domanda', io)).dati.giro?.domanda?.testo).toBe(domanda(1).testo)

    const giusta = await b.chiama<SlotStato>('POST', '/slot/risposta', io, { scelta: 'lis' })
    expect(giusta.status, JSON.stringify(giusta.dati)).toBe(200)
    expect(giusta.dati.giro).toMatchObject({
      stato: 'fatto',
      delta: 4 * VINCITA_DOMANDA - 4,
      risposta: { giusta: true, corretta: 'lis' },
    })
    expect(giusta.dati.saldo).toBe(100 + 4 * VINCITA_DOMANDA - 4)
    expect((await b.chiama('POST', '/slot/risposta', io, { scelta: 'lis' })).status).toBe(409)

    // Un'altra volta la stessa categoria: l'altra domanda, e sbagliata non paga.
    await gira(b, io, 4, ...DOMANDA)
    caso(0)
    const altra = (await b.chiama<SlotStato>('POST', '/slot/domanda', io)).dati.giro!
    expect(altra.domanda?.testo).toBe(domanda(0).testo)
    const sbagliata = (await b.chiama<SlotStato>('POST', '/slot/risposta', io, { scelta: 'opo' })).dati
    expect(sbagliata.giro).toMatchObject({ delta: -4, risposta: { giusta: false, scelta: 'opo' } })
  })

  it('una domanda in ritardo non vale, e una lasciata aperta la chiude il giro dopo', async () => {
    const b = banco()
    const io = await b.giocatore('anna')
    puntiDiOggi(b, io, 50, 50)
    domandeDiOggi(b, 3)
    await gira(b, io, 2, ...DOMANDA)
    caso(0)
    await b.chiama('POST', '/slot/domanda', io)
    b.db.sqlite
      .prepare('UPDATE slot_giri SET aperta_at = ? WHERE player_id = ?')
      .run(new Date(Date.now() - 120_000).toISOString(), io.id)
    const tardi = (await stato(b, io)).giro!
    expect(tardi).toMatchObject({ stato: 'fatto', delta: -2, risposta: { scelta: null, giusta: false } })

    await gira(b, io, 2, ...DOMANDA)
    const dopo = await gira(b, io, 2, ...NIENTE)
    expect(dopo.giro).toMatchObject({ n: 3, stato: 'fatto' })
    const seconda = b.db.sqlite.prepare('SELECT stato FROM slot_giri WHERE player_id = ? AND n = 2').get(io.id)
    expect(seconda).toEqual({ stato: 'fatto' })
    expect(dopo).toMatchObject({ netto: -6, giri: 3 })
  })

  it('la categoria si pesca fra quelle del giorno che hanno ancora domande', async () => {
    const b = banco()
    const io = await b.giocatore('anna')
    puntiDiOggi(b, io, 50, 50)
    domandeDiOggi(b, 1, [CATEGORIE[2], CATEGORIE[4]])
    // Dopo le fermate, il caso sceglie fra le due categorie con le domande: la seconda.
    const r = await gira(b, io, 1, ...DOMANDA, 1)
    expect(r.giro).toMatchObject({ fermate: DOMANDA, tripla: { categoria: CATEGORIE[4] }, stato: 'sfida' })
  })

  it('senza domande da dare, i punti di domanda non escono: le fermate si ripescano', async () => {
    const b = banco()
    const io = await b.giocatore('anna')
    puntiDiOggi(b, io, 50, 50)
    // Nessuna domanda: le fermate della prova non possono uscire, ed escono quelle dopo nella coda.
    const r = await gira(b, io, 1, ...DOMANDA, ...CILIEGIA)
    expect(r.giro).toMatchObject({ fermate: CILIEGIA, tripla: null, premio: 1 })
  })

  it('chi ha visto una domanda alla ruota non la rivede alla slot', async () => {
    const b = banco()
    const io = await b.giocatore('anna')
    puntiDiOggi(b, io, 50, 50)
    domandeDiOggi(b, 2)
    const vista = `${CATEGORIE[0]}:${improntaDomanda(domanda(0))}`
    b.db.sqlite
      .prepare(
        `INSERT INTO ruota_giocate
           (player_id, puzzle_number, n, puntata, spicchio, stato, delta, domanda, disposizione, created_at, updated_at)
         VALUES (?, ?, 1, 10, 1, 'fatto', -10, ?, 3, ?, ?)`,
      )
      .run(io.id, today().puzzleNumber, vista, new Date(0).toISOString(), new Date(0).toISOString())
    await gira(b, io, 1, ...DOMANDA)
    caso(0)
    const aperta = (await b.chiama<SlotStato>('POST', '/slot/domanda', io)).dati.giro!
    expect(aperta.domanda?.testo).toBe(domanda(1).testo)
  })

  it('un giro di rulli di prima conta nel saldo, ma non si mostra', async () => {
    const b = banco()
    const io = await b.giocatore('anna')
    puntiDiOggi(b, io, 50, 50)
    await gira(b, io, 3, ...NIENTE)
    b.db.sqlite.prepare('UPDATE slot_giri SET disposizione = ? WHERE player_id = ?').run(DISPOSIZIONE_SLOT - 1, io.id)
    expect(await stato(b, io)).toMatchObject({ giro: null, saldo: 97, giri: 1 })
  })
})

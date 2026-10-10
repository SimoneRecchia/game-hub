import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PRESENZA_ONLINE_MS } from '../../shared/config'
import type { AmiciRisposta, ProfiloAmico, PuntiGiocatore } from '../../shared/types'
import { today } from '../lib/wordleStore'
import { banco, type Giocatore } from './banco'

type Chiama = ReturnType<typeof banco>['chiama']

let adesso = Date.parse('2026-10-02T18:00:00Z')
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(adesso)
})
afterEach(() => vi.useRealTimers())
const avanza = (ms: number) => {
  adesso += ms
  vi.setSystemTime(adesso)
}

const online = (chiama: Chiama, chi: Giocatore, attivita = 'hub') => chiama('POST', '/presenza', chi, { attivita })

describe('gli amici, dalle API', () => {
  it('online sono gli altri visti di recente, in ordine di nome, con quel che fanno', async () => {
    const { chiama, giocatore } = banco()
    const anna = await giocatore('anna')
    const bruno = await giocatore('bruno')
    const carla = await giocatore('carla')
    await giocatore('dario')

    await online(chiama, carla, 'wordle')
    await online(chiama, bruno, 'scacchi')
    await online(chiama, anna)
    const r = await chiama<AmiciRisposta>('GET', '/amici', anna)
    expect(r.status).toBe(200)
    // Chi guarda non c'e', e nemmeno Dario, che non si e' mai visto.
    expect(r.dati.online.map((a) => [a.displayName, a.attivita])).toEqual([
      ['bruno', 'scacchi'],
      ['carla', 'wordle'],
    ])

    // Passato il tempo della presenza, chi non si e' piu' fatto vivo non e' online.
    avanza(PRESENZA_ONLINE_MS - 5_000)
    await online(chiama, carla, 'quiz')
    avanza(10_000)
    expect((await chiama<AmiciRisposta>('GET', '/amici', anna)).dati.online.map((a) => a.displayName)).toEqual([
      'carla',
    ])
  })

  it('il profilo di un amico si apre dal nickname, e dice se e dove e’ online', async () => {
    const { chiama, giocatore } = banco()
    const anna = await giocatore('anna')
    const bruno = await giocatore('Bruno')

    const fuori = await chiama<ProfiloAmico>('GET', '/amici/bruno', anna)
    expect(fuori.status).toBe(200)
    expect(fuori.dati).toMatchObject({ playerId: bruno.id, nickname: 'Bruno', online: false, attivita: null })
    expect(fuori.dati.createdAt).toEqual(expect.any(String))

    await online(chiama, bruno, 'dama')
    expect((await chiama<ProfiloAmico>('GET', '/amici/BRUNO', anna)).dati).toMatchObject({
      online: true,
      attivita: 'dama',
    })

    const nessuno = await chiama<{ code: string }>('GET', '/amici/zorro', anna)
    expect(nessuno.status).toBe(404)
    expect(nessuno.dati.code).toBe('GIOCATORE_NON_TROVATO')
  })

  it('tutti gli altri, per cercarli: chi e’ online per primo, poi in ordine di nome', async () => {
    const { chiama, giocatore } = banco()
    const anna = await giocatore('anna')
    await giocatore('bruno')
    const carla = await giocatore('carla')
    await giocatore('dario')
    await online(chiama, carla, 'sudoku')

    const r = await chiama<AmiciRisposta>('GET', '/amici?tutti=1', anna)
    expect(r.dati.tutti?.map((p) => [p.displayName, p.online, p.attivita])).toEqual([
      ['carla', true, 'sudoku'],
      ['bruno', false, null],
      ['dario', false, null],
    ])
    expect(r.dati.online.map((p) => p.displayName)).toEqual(['carla'])
    // Senza la richiesta l'elenco intero non c'e': il profilo e le Libere rileggono solo chi e' online.
    expect((await chiama<AmiciRisposta>('GET', '/amici', anna)).dati.tutti).toBeUndefined()
  })

  it('i punti di un giocatore: il mese e da sempre come nella generale, e il gioco che preferisce', async () => {
    const { chiama, giocatore, db } = banco()
    const anna = await giocatore('anna')
    const bruno = await giocatore('bruno')
    const n = today().puzzleNumber
    const ora = new Date().toISOString()
    const sql = (q: string, ...p: unknown[]) => db.sqlite.prepare(q).run(...p)
    // Bruno: un Wordle il primo giorno di gioco, poi solo sudoku, ieri e oggi. Anna: un quiz oggi. Il 2 ottobre il
    // primo giorno e' piu' di trenta giorni fa, e ieri era il primo del mese.
    expect(n).toBeGreaterThan(30)
    sql(
      `INSERT INTO wordle_games (id, player_id, puzzle_number, slot, date, answer, status, attempts, guesses, started_at, score)
       VALUES ('w1', ?, ?, 1, 'x', 'carta', 'won', 1, '[]', ?, 100)`,
      bruno.id,
      1,
      ora,
    )
    for (const [i, giorno] of [n, n - 1].entries()) {
      sql(
        `INSERT INTO sudoku_games (id, player_id, puzzle_number, date, status, cifre, score, started_at, updated_at)
         VALUES (?, ?, ?, 'x', 'done', '', 30, ?, ?)`,
        `s${i}`,
        bruno.id,
        giorno,
        ora,
        ora,
      )
    }
    sql(
      `INSERT INTO quiz_partite (id, player_id, puzzle_number, date, status, giuste, score, started_at, updated_at)
       VALUES ('q1', ?, ?, 'x', 'done', 10, 100, ?, ?)`,
      anna.id,
      n,
      ora,
      ora,
    )

    const r = await chiama<PuntiGiocatore>('GET', '/amici/BRUNO/punti', anna)
    expect(r.status).toBe(200)
    // Il Wordle vale di piu' da sempre, ma negli ultimi trenta giorni ha giocato al sudoku.
    expect(r.dati.preferito).toBe('sudoku')
    expect(r.dati.sempre).toMatchObject({ punti: 160, partite: 3, giocatori: 2, rank: 1 })
    expect(r.dati.sempre.perGioco).toMatchObject({ wordle: 100, sudoku: 60 })
    // Nel mese Anna, che guarda, sta davanti con il quiz.
    expect(r.dati.mese).toMatchObject({ punti: 60, rank: 2, giocatori: 2 })
    expect(r.dati.mese.perGioco.wordle).toBe(0)

    // Chi non ha giocato ha i conti a zero, e nessun posto.
    const carla = await giocatore('carla')
    const vuoto = await chiama<PuntiGiocatore>('GET', '/amici/carla/punti', carla)
    expect(vuoto.dati).toMatchObject({ preferito: null, mese: { rank: null, punti: 0 }, sempre: { rank: null } })
    expect((await chiama('GET', '/amici/zorro/punti', anna)).status).toBe(404)
  })

  it('senza sessione non si vede nessuno', async () => {
    const { chiama } = banco()
    expect((await chiama('GET', '/amici', null)).status).toBe(401)
  })
})

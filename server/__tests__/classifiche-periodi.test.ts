import { describe, expect, it } from 'vitest'
import { periodoDi } from '../../shared/periodi'
import type {
  GeneraleLeaderboard,
  LeaderboardResponse,
  LeaderboardScope,
  PanoramicaClassifiche,
  QuizLeaderboard,
} from '../../shared/types'
import { today } from '../lib/wordleStore'
import { banco, type Giocatore } from './banco'

function preparaBanco() {
  const b = banco()
  const adesso = new Date().toISOString()
  let id = 0
  const quiz = (chi: Giocatore, puzzle: number, score: number, status = 'done') =>
    b.db.sqlite
      .prepare(
        `INSERT INTO quiz_partite (id, player_id, puzzle_number, date, status, giuste, score, started_at, updated_at)
         VALUES (?, ?, ?, 'x', ?, 5, ?, ?, ?)`,
      )
      .run(`q${++id}`, chi.id, puzzle, status, score, adesso, adesso)
  const wordle = (chi: Giocatore, puzzle: number, status: string, attempts: number, score: number | null) =>
    b.db.sqlite
      .prepare(
        `INSERT INTO wordle_games (id, player_id, puzzle_number, slot, date, answer, status, attempts, guesses,
           started_at, score)
         VALUES (?, ?, ?, 1, 'x', 'carta', ?, ?, '[]', ?, ?)`,
      )
      .run(`w${++id}`, chi.id, puzzle, status, attempts, adesso, score)
  return { ...b, quiz, wordle }
}

describe('le classifiche per periodo di calendario', () => {
  it('contano le partite del periodo chiesto, anche di quelli passati', async () => {
    const { chiama, giocatore, quiz } = preparaBanco()
    const anna = await giocatore('anna')
    const n = today().puzzleNumber
    // Una partita al giorno negli ultimi quaranta giorni, ognuna con un punteggio diverso.
    const giorni = Array.from({ length: 40 }, (_, i) => n - i)
    for (const g of giorni) quiz(anna, g, 20 + (n - g))

    const casi: [LeaderboardScope, number][] = [
      ['today', 0],
      ['today', 1],
      ['today', 5],
      ['week', 0],
      ['week', 1],
      ['week', 2],
      ['month', 0],
      ['month', 1],
      ['all', 0],
    ]
    for (const [scope, indietro] of casi) {
      const atteso = periodoDi(scope, n, indietro)
      const { status, dati } = await chiama<QuizLeaderboard>(
        'GET',
        `/leaderboard/quiz?scope=${scope}&indietro=${indietro}`,
        anna,
      )
      expect(status).toBe(200)
      expect(dati.periodo).toEqual(atteso)
      const dentro = giorni.filter((g) => g >= atteso.da && g <= atteso.a)
      expect(dati.me?.punti ?? 0, `${scope} ${indietro}`).toBe(dentro.reduce((s, g) => s + 20 + (n - g), 0))
      expect(dati.me?.giornate ?? 0).toBe(dentro.length)
    }
  })

  it('rifiuta un periodo scritto male, e ferma al primo giorno quello troppo lontano', async () => {
    const { chiama, giocatore } = preparaBanco()
    const io = await giocatore('bruno')
    for (const q of ['scope=anno', 'indietro=-1', 'indietro=due', 'indietro=1.5']) {
      expect((await chiama('GET', `/leaderboard/generale?${q}`, io)).status).toBe(400)
    }
    const lontano = await chiama<GeneraleLeaderboard>('GET', '/leaderboard/generale?scope=week&indietro=9999', io)
    expect(lontano.status).toBe(200)
    expect(lontano.dati.periodo.indietro).toBe(lontano.dati.periodo.massimo)
    expect(lontano.dati.periodo.da).toBeLessThanOrEqual(1)
  })

  it('un giorno passato del Wordle racconta i tentativi di quel giorno, e non è in corso', async () => {
    const { chiama, giocatore, wordle } = preparaBanco()
    const carla = await giocatore('carla')
    const n = today().puzzleNumber
    wordle(carla, n - 1, 'won', 3, 80)
    wordle(carla, n, 'playing', 2, null)

    const ieri = (await chiama<LeaderboardResponse>('GET', '/leaderboard?scope=today&indietro=1', carla)).dati
    expect(ieri.me).toMatchObject({ score: 80, todayStatus: 'won', todayAttempts: 3 })
    const oggi = (await chiama<LeaderboardResponse>('GET', '/leaderboard?scope=today', carla)).dati
    expect(oggi.me).toMatchObject({ score: 0, todayStatus: 'playing', todayAttempts: 2 })
    // La serie e' quella di adesso: ieri vinta, oggi ancora aperta.
    expect(oggi.me?.currentStreak).toBe(1)
  })
})

describe('la panoramica delle classifiche', () => {
  it('dà i primi tre di ogni classifica, quanti sono, e dove sei tu', async () => {
    const { chiama, giocatore, quiz, wordle } = preparaBanco()
    const n = today().puzzleNumber
    const tutti = []
    for (const [i, nome] of ['anna', 'bruno', 'carla', 'dario', 'elena'].entries()) {
      const g = await giocatore(nome)
      tutti.push(g)
      quiz(g, n, 100 - i * 10)
    }
    const [anna, , , , elena] = tutti
    wordle(elena, n, 'playing', 1, null)

    const { status, dati } = await chiama<PanoramicaClassifiche>('GET', '/leaderboard/panoramica?scope=today', elena)
    expect(status).toBe(200)
    expect(Object.keys(dati.classifiche).sort()).toEqual([
      'battaglia',
      'cruciverba',
      'fortuna',
      'generale',
      'quiz',
      'scarabeo',
      'sudoku',
      'wordle',
    ])

    const q = dati.classifiche.quiz
    expect(q.giocatori).toBe(5)
    expect(q.primi.map((r) => [r.nickname, r.punti])).toEqual([
      ['anna', 100],
      ['bruno', 90],
      ['carla', 80],
    ])
    expect(q.me).toMatchObject({ rank: 5, nickname: 'elena', punti: 60, inCorso: false })

    // Elena ha il Wordle di oggi aperto: in corso nel Wordle e nella generale.
    expect(dati.classifiche.wordle.me).toMatchObject({ rank: 1, punti: 0, inCorso: true })
    expect(dati.classifiche.generale.me).toMatchObject({ rank: 5, punti: 60, inCorso: true })
    expect(dati.classifiche.generale.primi[0]).toMatchObject({ playerId: anna.id, punti: 100, inCorso: false })
    expect(dati.classifiche.scarabeo).toEqual({ giocatori: 0, primi: [], me: null })

    // Ieri non c'era niente, e niente e' in corso.
    const ieri = (await chiama<PanoramicaClassifiche>('GET', '/leaderboard/panoramica?scope=today&indietro=1', elena))
      .dati
    expect(ieri.periodo).toMatchObject({ indietro: 1, da: n - 1, a: n - 1 })
    expect(ieri.classifiche.quiz.giocatori).toBe(0)
  })
})

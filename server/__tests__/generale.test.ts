import { describe, expect, it } from 'vitest'
import type { GeneraleLeaderboard, OggiRisposta } from '../../shared/types'
import { ordinaGenerale, puntiClassificateDi, type TotaliGenerale } from '../lib/generale'
import { today } from '../lib/wordleStore'
import { banco } from './banco'

function totali(nickname: string, perGioco: Partial<TotaliGenerale['perGioco']>, assist = 0, partite = 1): TotaliGenerale {
  return {
    playerId: nickname,
    nickname,
    displayName: nickname,
    avatarColor: '#000',
    perGioco: { wordle: 0, scarabeo: 0, cruciverba: 0, sudoku: 0, battaglia: 0, quiz: 0, ...perGioco },
    ruota: 0,
    assist,
    partite,
  }
}

describe('l’ordine della classifica generale', () => {
  it('somma tutti i giochi', () => {
    const [riga] = ordinaGenerale([totali('a', { wordle: 80, scarabeo: 70, cruciverba: 95, battaglia: 84, quiz: 76 })])
    expect(riga.punti).toBe(405)
  })

  it('a pari punti passa avanti chi ha meno punti assist, poi chi ha giocato meno partite', () => {
    const righe = ordinaGenerale([
      totali('aiutata', { wordle: 100 }, 40, 2),
      totali('sola', { wordle: 60, cruciverba: 40 }, 0, 3),
      totali('efficiente', { wordle: 60, cruciverba: 40 }, 0, 2),
    ])
    expect(righe.map((r) => r.nickname)).toEqual(['efficiente', 'sola', 'aiutata'])
  })
})

describe('la classifica generale e la schermata di oggi, dalle API', () => {
  it('mette insieme le classificate di tutti i giochi', async () => {
    const { chiama, giocatore, db } = banco()
    const anna = await giocatore('anna')
    const bruno = await giocatore('bruno')
    const n = today().puzzleNumber
    const adesso = new Date().toISOString()
    const sql = (q: string, ...p: unknown[]) => db.sqlite.prepare(q).run(...p)

    // Anna: Wordle 45 + 20, Scarabeo 70, cruciverba 97 (finito), battaglia 84, quiz 76.
    sql(`INSERT INTO wordle_games (id, player_id, puzzle_number, slot, date, answer, status, attempts, guesses, started_at, score)
         VALUES ('w1', ?, ?, 1, 'x', 'carta', 'won', 2, '[]', ?, 45)`, anna.id, n, adesso)
    sql(`INSERT INTO wordle_games (id, player_id, puzzle_number, slot, date, answer, status, attempts, guesses, started_at, score)
         VALUES ('w2', ?, ?, 2, 'x', 'carta', 'won', 1, '[]', ?, 20)`, anna.id, n, adesso)
    sql(`INSERT INTO scarabeo_games (id, player_id, puzzle_number, date, status, mosse, turns, score, punti, started_at)
         VALUES ('s1', ?, ?, 'x', 'done', '[]', 10, 180, 70, ?)`, anna.id, n, adesso)
    sql(`INSERT INTO cruciverba_games (id, player_id, puzzle_number, date, status, lettere, score, started_at, updated_at)
         VALUES ('c1', ?, ?, 'x', 'done', 'x', 97, ?, ?)`, anna.id, n, adesso, adesso)
    sql(`INSERT INTO battaglia_partite (id, modalita, giocatore_a, giocatore_b, puzzle_number, stato, colpi, punti, vincitore, created_at, updated_at)
         VALUES ('b1', 'classificata', ?, NULL, ?, 'finita', '[]', 84, 'a', ?, ?)`, anna.id, n, adesso, adesso)
    sql(`INSERT INTO quiz_partite (id, player_id, puzzle_number, date, status, giuste, score, started_at, updated_at)
         VALUES ('q1', ?, ?, 'x', 'done', 7, 76, ?, ?)`, anna.id, n, adesso, adesso)
    // Bruno: solo un cruciverba ancora aperto, che vale zero.
    sql(`INSERT INTO cruciverba_games (id, player_id, puzzle_number, date, status, lettere, score, started_at, updated_at)
         VALUES ('c2', ?, ?, 'x', 'playing', 'x', 0, ?, ?)`, bruno.id, n, adesso, adesso)

    const g = (await chiama<GeneraleLeaderboard>('GET', '/leaderboard/generale?scope=today', anna)).dati
    expect(g.rows.map((r) => [r.nickname, r.punti])).toEqual([
      ['anna', 45 + 20 + 70 + 97 + 84 + 76],
      ['bruno', 0],
    ])
    expect(g.me?.perGioco).toEqual({ wordle: 65, scarabeo: 70, cruciverba: 97, sudoku: 0, battaglia: 84, quiz: 76 })
    expect(g.me?.partite).toBe(5)
    // Crazy Time legge i punti di oggi di un giocatore solo: devono essere quelli della generale.
    expect(await puntiClassificateDi(db as unknown as D1Database, anna.id, n)).toBe(g.me!.punti - g.me!.ruota)
    expect(await puntiClassificateDi(db as unknown as D1Database, bruno.id, n)).toBe(0)

    const oggi = (await chiama<OggiRisposta>('GET', '/oggi', bruno)).dati
    expect(oggi.generale).toEqual({ posizione: 2, punti: 0, giocatori: 2 })
    expect(oggi.cruciverba.status).toBe('assente')
    expect(oggi.wordle.status).toBe('new')
    expect(oggi.battaglia.classificata.stato).toBe('nuova')
    expect(oggi.quiz.status).toBe('assente')
  })

  it('regge più giocatori dei cento parametri che D1 accetta in un’istruzione', async () => {
    const { chiama, giocatore, db } = banco()
    const n = today().puzzleNumber
    const adesso = new Date().toISOString()
    const tutti = []
    for (let i = 0; i < 120; i += 1) {
      const g = await giocatore(`g${i}`)
      tutti.push(g)
      db.sqlite
        .prepare(
          `INSERT INTO quiz_partite (id, player_id, puzzle_number, date, status, giuste, score, started_at, updated_at)
           VALUES (?, ?, ?, 'x', 'done', 5, 60, ?, ?)`,
        )
        .run(`q${i}`, g.id, n, adesso, adesso)
    }
    const r = await chiama<GeneraleLeaderboard>('GET', '/leaderboard/generale?scope=today', tutti[0])
    expect(r.status).toBe(200)
    expect(r.dati.rows).toHaveLength(120)
  })

  it('la schermata di oggi non apre nessuna partita', async () => {
    const { chiama, giocatore, db } = banco()
    const io = await giocatore('carla')
    const conta = () =>
      ['wordle_games', 'scarabeo_games', 'cruciverba_games', 'battaglia_partite', 'scarabeo_computer', 'quiz_partite'].map(
        (t) => db.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get()?.n,
      )
    const prima = conta()
    const r = await chiama<OggiRisposta>('GET', '/oggi', io)
    expect(r.status).toBe(200)
    expect(r.dati.puzzleNumber).toBe(today().puzzleNumber)
    expect(conta()).toEqual(prima)
  })
})

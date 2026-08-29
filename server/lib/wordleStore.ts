/** Accesso ai dati delle partite di Wordle. */

import { MAX_ATTEMPTS, WORD_LENGTH } from '../../shared/config'
import { gameDate, puzzleNumberFor, solutionIndexFor } from '../../shared/daily'
import { assistTotal } from '../../shared/scoring'
import { SOLUTION_WORDS } from '../../shared/words/solutions'
import type { PlayerStats, WordleStatus } from '../../shared/types'
import { newId, nowIso } from './http'

export interface GameRow {
  id: string
  player_id: string
  puzzle_number: number
  date: string
  answer: string
  status: WordleStatus
  attempts: number
  guesses: string
  started_at: string
  first_guess_at: string | null
  finished_at: string | null
  duration_ms: number | null
  score: number | null
  streak_at_end: number | null
  /** 1 se il giocatore ha visto la partita di un altro prima di giocare. */
  spectated: number
}

export interface Today {
  date: string
  puzzleNumber: number
}

export function today(now: Date = new Date()): Today {
  const date = gameDate(now)
  return { date, puzzleNumber: puzzleNumberFor(date) }
}

/**
 * La parola di una giornata, fissata alla prima richiesta.
 *
 * `INSERT OR IGNORE` seguito da `SELECT` regge anche due richieste in
 * contemporanea: la seconda non sovrascrive, e la lettura successiva vede
 * comunque la parola scelta dalla prima.
 */
export async function dailyAnswer(db: D1Database, { date, puzzleNumber }: Today): Promise<string> {
  const computed = SOLUTION_WORDS[solutionIndexFor(puzzleNumber, SOLUTION_WORDS.length)]

  await db
    .prepare(
      `INSERT OR IGNORE INTO daily_puzzles (puzzle_number, date, answer, created_at)
       VALUES (?, ?, ?, ?)`,
    )
    .bind(puzzleNumber, date, computed, nowIso())
    .run()

  const row = await db
    .prepare('SELECT answer FROM daily_puzzles WHERE puzzle_number = ?')
    .bind(puzzleNumber)
    .first<{ answer: string }>()

  return row?.answer ?? computed
}

/** La partita di oggi del giocatore, creata al primo accesso. */
export async function openGame(
  db: D1Database,
  playerId: string,
  when: Today,
  answer: string,
): Promise<GameRow> {
  await db
    .prepare(
      `INSERT OR IGNORE INTO wordle_games
         (id, player_id, puzzle_number, date, answer, status, attempts, guesses, started_at)
       VALUES (?, ?, ?, ?, ?, 'playing', 0, '[]', ?)`,
    )
    .bind(newId('gam'), playerId, when.puzzleNumber, when.date, answer, nowIso())
    .run()

  const row = await db
    .prepare('SELECT * FROM wordle_games WHERE player_id = ? AND puzzle_number = ?')
    .bind(playerId, when.puzzleNumber)
    .first<GameRow>()

  if (!row) throw new Error('Partita non trovata subito dopo la creazione')
  return row
}

export function parseGuesses(row: GameRow): string[] {
  try {
    const parsed = JSON.parse(row.guesses) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (w): w is string => typeof w === 'string' && w.length === WORD_LENGTH,
    )
  } catch {
    return []
  }
}

/**
 * Giorni consecutivi vinti immediatamente prima di un certo puzzle.
 *
 * Il limite di 400 righe copre più di un anno di gioco: una streak più lunga
 * di così verrebbe comunque tagliata dal tetto del bonus.
 */
export async function streakBefore(
  db: D1Database,
  playerId: string,
  puzzleNumber: number,
): Promise<number> {
  const { results } = await db
    .prepare(
      `SELECT puzzle_number FROM wordle_games
        WHERE player_id = ? AND status = 'won' AND puzzle_number < ?
        ORDER BY puzzle_number DESC
        LIMIT 400`,
    )
    .bind(playerId, puzzleNumber)
    .all<{ puzzle_number: number }>()

  let expected = puzzleNumber - 1
  let streak = 0
  for (const row of results) {
    if (row.puzzle_number !== expected) break
    streak += 1
    expected -= 1
  }
  return streak
}

interface StatsRow {
  puzzle_number: number
  status: WordleStatus
  attempts: number
  score: number | null
  date: string
}

/**
 * Streak viva. Due condizioni la spezzano:
 *
 *  - l'ultima vittoria e' piu' vecchia di ieri → giorno saltato. Il confronto
 *    e' con ieri e non con oggi, altrimenti la streak si azzererebbe a
 *    mezzanotte, prima che il giocatore abbia potuto giocare.
 *  - la partita di oggi e' stata giocata e persa → la catena e' rotta adesso.
 */
function liveStreak(rows: StatsRow[], todayNumber: number): number {
  const lostToday = rows.some((r) => r.puzzle_number === todayNumber && r.status === 'lost')
  if (lostToday) return 0

  const wins = rows.filter((r) => r.status === 'won').map((r) => r.puzzle_number)
  if (wins.length === 0) return 0

  const last = Math.max(...wins)
  if (last < todayNumber - 1) return 0

  const won = new Set(wins)
  let streak = 0
  for (let n = last; won.has(n); n -= 1) streak += 1
  return streak
}

function bestStreak(rows: StatsRow[]): number {
  const wins = rows
    .filter((r) => r.status === 'won')
    .map((r) => r.puzzle_number)
    .sort((a, b) => a - b)

  let best = 0
  let run = 0
  let previous: number | null = null
  for (const n of wins) {
    run = previous !== null && n === previous + 1 ? run + 1 : 1
    best = Math.max(best, run)
    previous = n
  }
  return best
}

export async function playerStats(
  db: D1Database,
  playerId: string,
  todayNumber: number,
): Promise<PlayerStats> {
  /*
   * Gli assist si contano giornata per giornata perché il tetto e' giornaliero,
   * la stessa regola della classifica: sommare tutto e tagliare alla fine
   * darebbe un numero diverso da quello che il giocatore vede in classifica.
   */
  const [games, assists] = await Promise.all([
    db
      .prepare(
        `SELECT puzzle_number, status, attempts, score, date
           FROM wordle_games
          WHERE player_id = ?
          ORDER BY puzzle_number DESC
          LIMIT 1000`,
      )
      .bind(playerId)
      .all<StatsRow>(),
    db
      .prepare(
        `SELECT r.puzzle_number AS puzzle_number,
                SUM(s.assist_points) AS points,
                COUNT(*)             AS assists
           FROM coop_suggestions s
           JOIN coop_rooms r ON r.id = s.room_id
          WHERE s.guest_id = ? AND s.used_at IS NOT NULL
          GROUP BY r.puzzle_number`,
      )
      .bind(playerId)
      .all<{ puzzle_number: number; points: number; assists: number }>(),
  ])

  const results = games.results
  const finished = results.filter((r) => r.status !== 'playing')
  const wins = finished.filter((r) => r.status === 'won')

  const distribution = new Array(MAX_ATTEMPTS).fill(0) as number[]
  for (const win of wins) {
    const index = Math.min(Math.max(win.attempts, 1), MAX_ATTEMPTS) - 1
    distribution[index] += 1
  }

  const playScore = finished.reduce((sum, r) => sum + (r.score ?? 0), 0)
  const assistScore = assistTotal(assists.results.map((r) => r.points))
  const assistCount = assists.results.reduce((sum, r) => sum + r.assists, 0)
  const totalAttempts = wins.reduce((sum, r) => sum + r.attempts, 0)

  return {
    played: finished.length,
    wins: wins.length,
    losses: finished.length - wins.length,
    winRate: finished.length === 0 ? 0 : wins.length / finished.length,
    currentStreak: liveStreak(results, todayNumber),
    bestStreak: bestStreak(results),
    totalScore: playScore + assistScore,
    playScore,
    assistScore,
    assists: assistCount,
    avgAttempts: wins.length === 0 ? null : totalAttempts / wins.length,
    distribution,
    lastPlayedDate: finished[0]?.date ?? null,
  }
}

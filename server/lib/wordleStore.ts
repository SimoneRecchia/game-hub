/** Accesso ai dati delle partite di Wordle. */

import { MAX_ATTEMPTS, WORD_LENGTH, WORDS_PER_DAY } from '../../shared/config'
import { dailySolutionIndexes, gameDate, puzzleNumberFor } from '../../shared/daily'
import { SOLUTION_WORDS } from '../../shared/words/solutions'
import type { PlayerStats, WordleStatus } from '../../shared/types'
import { newId, nowIso } from './http'

export interface GameRow {
  id: string
  player_id: string
  puzzle_number: number
  /** 1 = la parola del giorno, 2..5 = quelle in piu'. */
  slot: number
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
  /**
   * 1 se questa giornata il giocatore l'ha giocata nella stanza di un altro.
   *
   * Non e' "ha guardato": e' "la sua parola di oggi e' quella partita". La
   * propria board resta chiusa — e' la stessa parola, l'ha già fatta — e il suo
   * punteggio e' `assist_score`.
   */
  spectated: number
  /** Il punteggio dell'host, copiato quando la sua partita si chiude. */
  assist_score: number | null
  /** La stanza in cui ha giocato la giornata, se non ha giocato la propria. */
  assist_room_id: string | null
  /** Com'e' finita quella partita: serve alla streak. */
  assist_status: 'won' | 'lost' | null
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
/**
 * Le parole di una giornata, tutte e cinque, nell'ordine delle posizioni.
 *
 * Fissate alla prima richiesta e poi rilette dalla tabella: sono le stesse per
 * tutti, e restano quelle anche se un domani si rigenerasse l'elenco delle
 * soluzioni. L'`INSERT OR IGNORE` di cinque righe in un `batch` fa sì che due
 * richieste contemporanee non possano fissarne un sottoinsieme diverso.
 */
export async function dailyAnswers(db: D1Database, { date, puzzleNumber }: Today): Promise<string[]> {
  const calcolate = dailySolutionIndexes(puzzleNumber, SOLUTION_WORDS.length, WORDS_PER_DAY).map(
    (i) => SOLUTION_WORDS[i],
  )

  const inserimento = db.prepare(
    `INSERT OR IGNORE INTO daily_puzzles (puzzle_number, slot, date, answer, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  )
  await db.batch(
    calcolate.map((answer, i) =>
      inserimento.bind(puzzleNumber, i + 1, date, answer, nowIso()),
    ),
  )

  const { results } = await db
    .prepare('SELECT slot, answer FROM daily_puzzles WHERE puzzle_number = ? ORDER BY slot')
    .bind(puzzleNumber)
    .all<{ slot: number; answer: string }>()

  // Se per qualche ragione una riga mancasse, si ricade sul calcolo: meglio la
  // parola giusta che un errore a metà giornata.
  return calcolate.map((fallback, i) => results.find((r) => r.slot === i + 1)?.answer ?? fallback)
}

/** La parola di una singola posizione. */
export async function dailyAnswer(
  db: D1Database,
  when: Today,
  slot = 1,
): Promise<string> {
  const tutte = await dailyAnswers(db, when)
  return tutte[Math.min(Math.max(slot, 1), WORDS_PER_DAY) - 1]
}

/** La partita di oggi del giocatore, creata al primo accesso. */
export async function openGame(
  db: D1Database,
  playerId: string,
  when: Today,
  answer: string,
  slot = 1,
): Promise<GameRow> {
  await db
    .prepare(
      `INSERT OR IGNORE INTO wordle_games
         (id, player_id, puzzle_number, slot, date, answer, status, attempts, guesses, started_at)
       VALUES (?, ?, ?, ?, ?, ?, 'playing', 0, '[]', ?)`,
    )
    .bind(newId('gam'), playerId, when.puzzleNumber, slot, when.date, answer, nowIso())
    .run()

  const row = await db
    .prepare(
      'SELECT * FROM wordle_games WHERE player_id = ? AND puzzle_number = ? AND slot = ?',
    )
    .bind(playerId, when.puzzleNumber, slot)
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
      /*
       * Solo `slot = 1`: la streak e' la serie della **parola del giorno**. Le
       * parole in piu' sono un extra, e non devono poter tenere in vita una
       * serie che sulla principale si e' interrotta.
       */
      `SELECT puzzle_number FROM wordle_games
        WHERE player_id = ? AND slot = 1 AND puzzle_number < ?
          AND ((spectated != 1 AND status = 'won')
            OR (spectated  = 1 AND assist_status = 'won'))
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
  slot: number
  status: WordleStatus
  attempts: number
  score: number | null
  date: string
  spectated: number
  assist_score: number | null
  assist_status: 'won' | 'lost' | null
}

/**
 * Streak viva. Due condizioni la spezzano:
 *
 *  - l'ultima vittoria e' piu' vecchia di ieri → giorno saltato. Il confronto
 *    e' con ieri e non con oggi, altrimenti la streak si azzererebbe a
 *    mezzanotte, prima che il giocatore abbia potuto giocare.
 *  - la partita di oggi e' stata giocata e persa → la catena e' rotta adesso.
 */
/**
 * Com'e' andata una giornata, da qualunque parte l'abbia giocata.
 *
 * Una giornata giocata nella stanza di un altro vale l'esito di quella partita:
 * se non contasse, accettare un invito spezzerebbe la streak, e sarebbe una
 * differenza fra giocare da soli e giocare in compagnia.
 */
function esito(row: StatsRow): WordleStatus {
  return row.spectated === 1 ? (row.assist_status ?? 'playing') : row.status
}

function liveStreak(rows: StatsRow[], todayNumber: number): number {
  // La serie e' quella della parola del giorno: vedi `streakBefore`.
  const principali = rows.filter((r) => r.slot === 1)
  const lostToday = principali.some(
    (r) => r.puzzle_number === todayNumber && esito(r) === 'lost',
  )
  if (lostToday) return 0

  const wins = principali.filter((r) => esito(r) === 'won').map((r) => r.puzzle_number)
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
    .filter((r) => r.slot === 1 && esito(r) === 'won')
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
   * Una query sola: da quando l'assist e' il punteggio dell'host, sta sulla
   * riga della giornata del giocatore come il punteggio della sua partita.
   */
  const { results } = await db
    .prepare(
      `SELECT puzzle_number, slot, status, attempts, score, date,
              spectated, assist_score, assist_status
         FROM wordle_games
        WHERE player_id = ?
        ORDER BY puzzle_number DESC, slot ASC
        LIMIT 2000`,
    )
    .bind(playerId)
    .all<StatsRow>()

  /*
   * Le statistiche di gioco guardano **la parola del giorno giocata per conto
   * proprio**, e devono restare d'accordo con la classifica (vedi la nota in
   * `server/lib/leaderboard.ts`):
   *
   *  - le giornate giocate nella stanza di un altro hanno i tentativi dell'host,
   *    e contarli come propri falserebbe media e distribuzione;
   *  - le parole in piu' non sono giornate: contandole, "giocate 5" dopo un
   *    giorno solo vorrebbe dire una cosa che nessuno intende leggendo quella
   *    parola.
   *
   * Le parole in piu' contano nel punteggio, che e' il numero che conta.
   */
  const proprie = results.filter((r) => r.spectated !== 1 && r.slot === 1)
  const finished = proprie.filter((r) => r.status !== 'playing')
  const wins = finished.filter((r) => r.status === 'won')

  const distribution = new Array(MAX_ATTEMPTS).fill(0) as number[]
  for (const win of wins) {
    const index = Math.min(Math.max(win.attempts, 1), MAX_ATTEMPTS) - 1
    distribution[index] += 1
  }

  const playScore = finished.reduce((sum, r) => sum + (r.score ?? 0), 0)
  const insieme = results.filter((r) => r.spectated === 1)
  const assistScore = insieme.reduce((sum, r) => sum + (r.assist_score ?? 0), 0)
  const assistCount = insieme.length
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

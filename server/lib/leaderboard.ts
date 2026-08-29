/**
 * Calcolo delle classifiche.
 *
 * L'aggregazione la fa SQLite; le streak si calcolano in memoria, perché
 * "giorni consecutivi" in SQL richiederebbe funzioni finestra su una tabella
 * piccola — leggere i numeri dei puzzle vinti e scorrerli costa meno ed e'
 * molto piu' leggibile.
 */

import type { LeaderboardResponse, LeaderboardRow, LeaderboardScope, WordleStatus } from '../../shared/types'

/** Finestra di puzzle coperta da ogni vista, in giorni. null = tutto. */
const WINDOW_DAYS: Record<LeaderboardScope, number | null> = {
  today: 1,
  week: 7,
  month: 30,
  all: null,
}

/** Quanto indietro si guarda per le streak: oltre un anno non serve. */
const STREAK_LOOKBACK = 400

interface AggregateRow {
  player_id: string
  nickname: string
  display_name: string
  avatar_color: string
  score: number
  played: number
  wins: number
  avg_attempts: number | null
}

interface WinRow {
  player_id: string
  puzzle_number: number
}

interface TodayRow {
  player_id: string
  attempts: number
  status: WordleStatus
}

interface Streaks {
  current: number
  best: number
}

/**
 * Streak per giocatore, dai soli puzzle vinti.
 *
 * Due condizioni la spezzano, e vanno distinte:
 *
 *  - l'ultima vittoria e' piu' vecchia di ieri → giorno saltato, catena rotta.
 *    Il confronto e' con ieri e non con oggi, altrimenti la streak di tutti si
 *    azzererebbe a mezzanotte, prima che chiunque abbia potuto giocare.
 *  - il giocatore ha giocato oggi e ha perso → la catena e' rotta adesso, anche
 *    se ieri aveva vinto. Senza questo caso chi perde continuerebbe a mostrare
 *    la streak di ieri per tutta la giornata.
 */
export function streaksByPlayer(
  wins: WinRow[],
  todayNumber: number,
  lostToday: ReadonlySet<string>,
): Map<string, Streaks> {
  const byPlayer = new Map<string, number[]>()
  for (const row of wins) {
    const list = byPlayer.get(row.player_id)
    if (list) list.push(row.puzzle_number)
    else byPlayer.set(row.player_id, [row.puzzle_number])
  }

  const result = new Map<string, Streaks>()
  for (const [playerId, numbers] of byPlayer) {
    numbers.sort((a, b) => a - b)

    let best = 0
    let run = 0
    let previous: number | null = null
    for (const n of numbers) {
      run = previous !== null && n === previous + 1 ? run + 1 : 1
      if (run > best) best = run
      previous = n
    }

    const last = numbers[numbers.length - 1]
    let current = 0
    if (last >= todayNumber - 1 && !lostToday.has(playerId)) {
      const won = new Set(numbers)
      for (let n = last; won.has(n); n -= 1) current += 1
    }

    result.set(playerId, { current, best })
  }
  return result
}

export async function leaderboard(
  db: D1Database,
  scope: LeaderboardScope,
  todayNumber: number,
  viewerId: string,
): Promise<LeaderboardResponse> {
  const window = WINDOW_DAYS[scope]
  const from = window === null ? Number.MIN_SAFE_INTEGER : todayNumber - window + 1

  /*
   * Le partite ancora in corso entrano nel conteggio con punteggio zero
   * (`score` e' NULL finché non finiscono): così nella vista di oggi si vede
   * anche chi sta giocando, invece di farlo comparire solo a partita chiusa.
   * `played` conta però solo le partite concluse.
   *
   * SQLite mette i NULL per primi in ordine crescente: `avg_attempts IS NULL`
   * come chiave precedente li sposta in fondo, dove appartengono.
   */
  const aggregate = await db
    .prepare(
      `SELECT p.id                                                     AS player_id,
              p.nickname                                               AS nickname,
              p.display_name                                           AS display_name,
              p.avatar_color                                           AS avatar_color,
              COALESCE(SUM(g.score), 0)                                AS score,
              SUM(CASE WHEN g.status != 'playing' THEN 1 ELSE 0 END)    AS played,
              SUM(CASE WHEN g.status  = 'won'     THEN 1 ELSE 0 END)    AS wins,
              AVG(CASE WHEN g.status  = 'won' THEN g.attempts END)      AS avg_attempts
         FROM players p
         JOIN wordle_games g ON g.player_id = p.id AND g.puzzle_number >= ?
        GROUP BY p.id
        ORDER BY score DESC,
                 wins DESC,
                 avg_attempts IS NULL,
                 avg_attempts ASC,
                 p.nickname COLLATE NOCASE ASC`,
    )
    .bind(from)
    .all<AggregateRow>()

  const [winsResult, todayResult] = await Promise.all([
    db
      .prepare(
        `SELECT player_id, puzzle_number FROM wordle_games
          WHERE status = 'won' AND puzzle_number >= ?`,
      )
      .bind(todayNumber - STREAK_LOOKBACK)
      .all<WinRow>(),
    db
      .prepare('SELECT player_id, attempts, status FROM wordle_games WHERE puzzle_number = ?')
      .bind(todayNumber)
      .all<TodayRow>(),
  ])

  const todayByPlayer = new Map(todayResult.results.map((r) => [r.player_id, r]))
  const lostToday = new Set(
    todayResult.results.filter((r) => r.status === 'lost').map((r) => r.player_id),
  )
  const streaks = streaksByPlayer(winsResult.results, todayNumber, lostToday)

  const rows: LeaderboardRow[] = aggregate.results.map((row, index) => {
    const streak = streaks.get(row.player_id) ?? { current: 0, best: 0 }
    const todayGame = todayByPlayer.get(row.player_id)
    return {
      rank: index + 1,
      playerId: row.player_id,
      nickname: row.nickname,
      displayName: row.display_name,
      avatarColor: row.avatar_color,
      score: row.score,
      played: row.played,
      wins: row.wins,
      avgAttempts: row.avg_attempts,
      currentStreak: streak.current,
      bestStreak: streak.best,
      todayAttempts: todayGame?.attempts ?? null,
      todayStatus: todayGame?.status ?? null,
    }
  })

  return {
    scope,
    updatedAt: new Date().toISOString(),
    rows,
    me: rows.find((r) => r.playerId === viewerId) ?? null,
  }
}

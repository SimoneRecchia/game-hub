/**
 * Calcolo delle classifiche.
 *
 * Il punteggio di un giocatore e' la somma di due cose diverse: i punti delle
 * sue partite e i punti assist guadagnati suggerendo agli altri. In classifica
 * si vede il totale; la divisione si vede toccando la riga, e serve a spiegare
 * gli spareggi, perché **a parità di totale passa avanti chi ha più assist**.
 *
 * L'aggregazione la fa SQLite, l'ordinamento no: le righe sono poche (un
 * gruppo di colleghi) e la catena degli spareggi in SQL sarebbe illeggibile,
 * mentre come funzione pura si testa. Le streak, per lo stesso motivo, si
 * calcolano in memoria: "giorni consecutivi" in SQL richiederebbe funzioni
 * finestra su una tabella piccola.
 */

import { dailyAssist } from '../../shared/scoring'
import type {
  LeaderboardResponse,
  LeaderboardRow,
  LeaderboardScope,
  WordleStatus,
} from '../../shared/types'

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

/** Assist di un giocatore in una singola giornata: il tetto e' per giorno. */
interface AssistRow {
  player_id: string
  nickname: string
  display_name: string
  avatar_color: string
  puzzle_number: number
  points: number
  assists: number
}

interface WinRow {
  player_id: string
  puzzle_number: number
}

interface TodayRow {
  player_id: string
  attempts: number
  status: WordleStatus
  spectated: number
}

interface Streaks {
  current: number
  best: number
}

/** Quel che serve per mettere in fila un giocatore. */
export interface PlayerTotals {
  playerId: string
  nickname: string
  displayName: string
  avatarColor: string
  /** Punti delle proprie partite. */
  playScore: number
  /** Punti guadagnati suggerendo, col tetto giornaliero già applicato. */
  assistScore: number
  assists: number
  played: number
  wins: number
  avgAttempts: number | null
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

/**
 * Mette i giocatori in fila e assegna le posizioni.
 *
 * L'ordine, dal criterio piu' forte al piu' debole:
 *
 *  1. **totale** (partite + assist);
 *  2. **assist**, che e' lo spareggio richiesto: fra due totali uguali passa
 *     avanti chi ha aiutato di piu';
 *  3. vittorie, poi media tentativi piu' bassa;
 *  4. nickname, perché due righe identiche non devono cambiare posto a ogni
 *     ricarica.
 *
 * Chi ha solo assistito, senza giocare, e' in classifica come tutti: e' il
 * senso di dare punti a chi aiuta.
 */
export function rankPlayers(players: PlayerTotals[]): LeaderboardRow[] {
  const byTotal = [...players].sort((a, b) => {
    const total = a.playScore + a.assistScore - (b.playScore + b.assistScore)
    if (total !== 0) return -total
    if (a.assistScore !== b.assistScore) return b.assistScore - a.assistScore
    if (a.wins !== b.wins) return b.wins - a.wins
    // I null in fondo: "nessuna vittoria" non e' una media buona.
    if (a.avgAttempts !== b.avgAttempts) {
      if (a.avgAttempts === null) return 1
      if (b.avgAttempts === null) return -1
      return a.avgAttempts - b.avgAttempts
    }
    return a.nickname.localeCompare(b.nickname, 'it', { sensitivity: 'base' })
  })

  return byTotal.map((p, index) => ({
    rank: index + 1,
    playerId: p.playerId,
    nickname: p.nickname,
    displayName: p.displayName,
    avatarColor: p.avatarColor,
    score: p.playScore + p.assistScore,
    playScore: p.playScore,
    assistScore: p.assistScore,
    assists: p.assists,
    played: p.played,
    wins: p.wins,
    avgAttempts: p.avgAttempts,
    // Riempiti da `leaderboard`, che ha i dati della giornata.
    currentStreak: 0,
    bestStreak: 0,
    todayAttempts: null,
    todayStatus: null,
    todaySpectated: null,
  }))
}

/**
 * Assist per giocatore, sommando le giornate col tetto applicato a ognuna.
 *
 * Il tetto si applica qui e non alla scrittura perché e' un tetto: se un domani
 * si cambia il numero, deve cambiare per tutte le giornate insieme. I punti di
 * ogni singolo suggerimento invece restano congelati come li ha scritti la
 * partita, cosi' come la streak.
 */
export function assistsByPlayer(
  rows: AssistRow[],
): Map<string, { points: number; assists: number }> {
  const result = new Map<string, { points: number; assists: number }>()
  for (const row of rows) {
    const found = result.get(row.player_id) ?? { points: 0, assists: 0 }
    found.points += dailyAssist(row.points)
    found.assists += row.assists
    result.set(row.player_id, found)
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
   */
  const [aggregate, assists, winsResult, todayResult] = await Promise.all([
    db
      .prepare(
        `SELECT p.id                                                     AS player_id,
                p.nickname                                               AS nickname,
                p.display_name                                           AS display_name,
                p.avatar_color                                           AS avatar_color,
                COALESCE(SUM(g.score), 0)                                AS score,
                SUM(CASE WHEN g.status != 'playing' THEN 1 ELSE 0 END)   AS played,
                SUM(CASE WHEN g.status  = 'won'     THEN 1 ELSE 0 END)   AS wins,
                AVG(CASE WHEN g.status  = 'won' THEN g.attempts END)     AS avg_attempts
           FROM players p
           JOIN wordle_games g ON g.player_id = p.id AND g.puzzle_number >= ?
          GROUP BY p.id`,
      )
      .bind(from)
      .all<AggregateRow>(),
    /*
     * Gli assist si raggruppano anche per giornata, non solo per giocatore: il
     * tetto e' giornaliero, quindi il totale della settimana non si puo'
     * ottenere sommando prima e tagliando dopo.
     */
    db
      .prepare(
        `SELECT s.guest_id      AS player_id,
                p.nickname      AS nickname,
                p.display_name  AS display_name,
                p.avatar_color  AS avatar_color,
                r.puzzle_number AS puzzle_number,
                SUM(s.assist_points) AS points,
                COUNT(*)             AS assists
           FROM coop_suggestions s
           JOIN coop_rooms r ON r.id = s.room_id
           JOIN players p    ON p.id = s.guest_id
          WHERE s.used_at IS NOT NULL AND r.puzzle_number >= ?
          GROUP BY s.guest_id, r.puzzle_number`,
      )
      .bind(from)
      .all<AssistRow>(),
    db
      .prepare(
        `SELECT player_id, puzzle_number FROM wordle_games
          WHERE status = 'won' AND puzzle_number >= ?`,
      )
      .bind(todayNumber - STREAK_LOOKBACK)
      .all<WinRow>(),
    db
      .prepare(
        'SELECT player_id, attempts, status, spectated FROM wordle_games WHERE puzzle_number = ?',
      )
      .bind(todayNumber)
      .all<TodayRow>(),
  ])

  const assistTotals = assistsByPlayer(assists.results)

  const totals = new Map<string, PlayerTotals>()
  for (const row of aggregate.results) {
    const assist = assistTotals.get(row.player_id)
    totals.set(row.player_id, {
      playerId: row.player_id,
      nickname: row.nickname,
      displayName: row.display_name || row.nickname,
      avatarColor: row.avatar_color,
      playScore: row.score,
      assistScore: assist?.points ?? 0,
      assists: assist?.assists ?? 0,
      played: row.played,
      wins: row.wins,
      avgAttempts: row.avg_attempts,
    })
  }

  /*
   * Chi ha suggerito senza avere una partita nella finestra non e' nell'aggregato
   * qui sopra, che parte dalle partite. Va aggiunto: i suoi assist sono punti a
   * tutti gli effetti, e sparire dalla classifica dopo aver aiutato sarebbe il
   * contrario di quel che gli assist vogliono ottenere.
   */
  for (const row of assists.results) {
    if (totals.has(row.player_id)) continue
    const assist = assistTotals.get(row.player_id)
    totals.set(row.player_id, {
      playerId: row.player_id,
      nickname: row.nickname,
      displayName: row.display_name || row.nickname,
      avatarColor: row.avatar_color,
      playScore: 0,
      assistScore: assist?.points ?? 0,
      assists: assist?.assists ?? 0,
      played: 0,
      wins: 0,
      avgAttempts: null,
    })
  }

  const todayByPlayer = new Map(todayResult.results.map((r) => [r.player_id, r]))
  const lostToday = new Set(
    todayResult.results.filter((r) => r.status === 'lost').map((r) => r.player_id),
  )
  const streaks = streaksByPlayer(winsResult.results, todayNumber, lostToday)

  const rows = rankPlayers([...totals.values()]).map((row) => {
    const streak = streaks.get(row.playerId) ?? { current: 0, best: 0 }
    const todayGame = todayByPlayer.get(row.playerId)
    return {
      ...row,
      currentStreak: streak.current,
      bestStreak: streak.best,
      todayAttempts: todayGame?.attempts ?? null,
      todayStatus: todayGame?.status ?? null,
      todaySpectated: todayGame ? todayGame.spectated === 1 : null,
    }
  })

  return {
    scope,
    updatedAt: new Date().toISOString(),
    rows,
    me: rows.find((r) => r.playerId === viewerId) ?? null,
  }
}

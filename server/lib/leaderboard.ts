/**
 * Calcolo delle classifiche.
 *
 * Il punteggio di un giocatore e' la somma di due cose diverse: i punti delle
 * giornate che ha giocato per conto suo e quelli delle giornate che ha giocato
 * nella stanza di qualcun altro — che valgono esattamente lo stesso, il
 * punteggio dell'host. In classifica si vede il totale; la divisione si vede
 * toccando la riga, e serve a spiegare gli spareggi, perché **a parità di
 * totale passa avanti chi ha meno punti assist**: a pari merito, conta di piu'
 * quel che si e' fatto con le proprie partite.
 *
 * L'aggregazione la fa SQLite, l'ordinamento no: le righe sono poche (un
 * gruppo di colleghi) e la catena degli spareggi in SQL sarebbe illeggibile,
 * mentre come funzione pura si testa. Le streak, per lo stesso motivo, si
 * calcolano in memoria: "giorni consecutivi" in SQL richiederebbe funzioni
 * finestra su una tabella piccola.
 */

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
  play_score: number
  assist_score: number
  assists: number
  played: number
  wins: number
  avg_attempts: number | null
}

interface WinRow {
  player_id: string
  puzzle_number: number
}

/** Righe di oggi, per il dettaglio della vista "oggi". */

interface TodayRow {
  player_id: string
  attempts: number
  status: WordleStatus
  spectated: number
  assist_status: WordleStatus | null
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
  /** Punti delle giornate giocate per conto proprio. */
  playScore: number
  /** Punti delle giornate giocate nella stanza di qualcun altro. */
  assistScore: number
  /** Quante di quelle giornate. */
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
 *  2. **assist**, che e' lo spareggio: fra due totali uguali passa avanti chi
 *     ne ha di meno, cioe' chi ha fatto piu' punti con le proprie partite;
 *  3. vittorie, poi media tentativi piu' bassa;
 *  4. nickname, perché due righe identiche non devono cambiare posto a ogni
 *     ricarica.
 *
 * Chi ha solo giocato in compagnia, senza mai una partita propria, e' in
 * classifica come tutti: le due cose valgono lo stesso.
 */
export function rankPlayers(players: PlayerTotals[]): LeaderboardRow[] {
  const byTotal = [...players].sort((a, b) => {
    const total = a.playScore + a.assistScore - (b.playScore + b.assistScore)
    if (total !== 0) return -total
    if (a.assistScore !== b.assistScore) return a.assistScore - b.assistScore
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

export async function leaderboard(
  db: D1Database,
  scope: LeaderboardScope,
  todayNumber: number,
  viewerId: string,
): Promise<LeaderboardResponse> {
  const window = WINDOW_DAYS[scope]
  const from = window === null ? Number.MIN_SAFE_INTEGER : todayNumber - window + 1

  /*
   * Una query sola su `wordle_games`: la riga della giornata di un giocatore
   * porta il punteggio della sua partita oppure, se quel giorno ha giocato nella
   * stanza di un altro, quello dell'host. Le due cose sono colonne diverse della
   * stessa riga, quindi non serve unire due aggregati.
   *
   * Le partite ancora in corso entrano con punteggio zero (`score` e' NULL finché
   * non finiscono): così nella vista di oggi si vede anche chi sta giocando.
   *
   * `played`, `wins` e la media contano **solo la parola del giorno giocata per
   * conto proprio**, e per due ragioni diverse:
   *
   *  - i tentativi di una giornata in compagnia sono quelli dell'host: contarli
   *    come propri falserebbe la media di tutti;
   *  - contando tutte e cinque le parole, chi le gioca tutte accumula cinque
   *    vittorie al giorno, e nello spareggio quel numero batteva chi aveva
   *    indovinato la principale al primo colpo. Con la sola principale il
   *    conteggio misura le **giornate**, che e' quel che uno intende leggendo
   *    "giocate", e lo spareggio passa alla media tentativi — dove vince chi ha
   *    giocato meglio, non chi ha giocato di piu'.
   */
  const [aggregate, winsResult, todayResult] = await Promise.all([
    db
      .prepare(
        `SELECT p.id           AS player_id,
                p.nickname     AS nickname,
                p.display_name AS display_name,
                p.avatar_color AS avatar_color,
                COALESCE(SUM(CASE WHEN g.spectated = 1 THEN 0 ELSE g.score END), 0)
                  AS play_score,
                COALESCE(SUM(CASE WHEN g.spectated = 1 THEN g.assist_score END), 0)
                  AS assist_score,
                SUM(CASE WHEN g.spectated = 1 AND g.assist_score IS NOT NULL
                         THEN 1 ELSE 0 END)                              AS assists,
                SUM(CASE WHEN g.slot = 1 AND g.spectated != 1 AND g.status != 'playing'
                         THEN 1 ELSE 0 END)                              AS played,
                SUM(CASE WHEN g.slot = 1 AND g.spectated != 1 AND g.status = 'won'
                         THEN 1 ELSE 0 END)                              AS wins,
                AVG(CASE WHEN g.slot = 1 AND g.spectated != 1 AND g.status = 'won'
                         THEN g.attempts END)                            AS avg_attempts
           FROM players p
           JOIN wordle_games g ON g.player_id = p.id AND g.puzzle_number >= ?
          GROUP BY p.id`,
      )
      .bind(from)
      .all<AggregateRow>(),
    /*
     * Per la streak vale anche una giornata giocata in compagnia e finita bene:
     * se non contasse, accettare un invito spezzerebbe la serie e sarebbe una
     * differenza fra giocare da soli e giocare in gruppo.
     */
    db
      .prepare(
        `SELECT player_id, puzzle_number FROM wordle_games
          WHERE puzzle_number >= ? AND slot = 1
            AND ((spectated != 1 AND status = 'won')
              OR (spectated  = 1 AND assist_status = 'won'))`,
      )
      .bind(todayNumber - STREAK_LOOKBACK)
      .all<WinRow>(),
    db
      .prepare(
        `SELECT player_id, attempts, status, spectated, assist_status
           FROM wordle_games WHERE puzzle_number = ? AND slot = 1`,
      )
      .bind(todayNumber)
      .all<TodayRow>(),
  ])

  const todayByPlayer = new Map(todayResult.results.map((r) => [r.player_id, r]))
  const lostToday = new Set(
    todayResult.results
      .filter((r) => (r.spectated === 1 ? r.assist_status === 'lost' : r.status === 'lost'))
      .map((r) => r.player_id),
  )
  const streaks = streaksByPlayer(winsResult.results, todayNumber, lostToday)

  const totals: PlayerTotals[] = aggregate.results.map((row) => ({
    playerId: row.player_id,
    nickname: row.nickname,
    displayName: row.display_name || row.nickname,
    avatarColor: row.avatar_color,
    playScore: row.play_score,
    assistScore: row.assist_score,
    assists: row.assists,
    played: row.played,
    wins: row.wins,
    avgAttempts: row.avg_attempts,
  }))

  const rows = rankPlayers(totals).map((row) => {
    const streak = streaks.get(row.playerId) ?? { current: 0, best: 0 }
    const todayGame = todayByPlayer.get(row.playerId)
    const insieme = todayGame?.spectated === 1
    return {
      ...row,
      currentStreak: streak.current,
      bestStreak: streak.best,
      // In compagnia i tentativi sono dell'host: mostrarli come propri sarebbe falso.
      todayAttempts: insieme ? null : (todayGame?.attempts ?? null),
      todayStatus: insieme ? (todayGame?.assist_status ?? 'playing') : (todayGame?.status ?? null),
      todaySpectated: todayGame ? insieme : null,
    }
  })

  return {
    scope,
    updatedAt: new Date().toISOString(),
    rows,
    me: rows.find((r) => r.playerId === viewerId) ?? null,
  }
}

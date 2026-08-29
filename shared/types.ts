/** Tipi condivisi tra client React e Pages Functions. */

export type GameId = 'wordle'

export interface Player {
  id: string
  nickname: string
  displayName: string
  avatarColor: string
  createdAt: string
}

/** Colore di una casella dopo la valutazione del server. */
export type TileState = 'correct' | 'present' | 'absent'

/** Un tentativo valutato: la parola giocata e il pattern restituito. */
export interface EvaluatedGuess {
  word: string
  pattern: TileState[]
}

export type WordleStatus = 'playing' | 'won' | 'lost'

export interface WordleState {
  /** Numero progressivo del puzzle: 1 = giorno di lancio. */
  puzzleNumber: number
  /** Data del puzzle in formato YYYY-MM-DD nel fuso Europe/Rome. */
  date: string
  wordLength: number
  maxAttempts: number
  guesses: EvaluatedGuess[]
  status: WordleStatus
  /** Rivelata solo a partita conclusa. */
  answer: string | null
  score: number | null
  /** Millisecondi al prossimo puzzle, per il countdown. */
  msToNextPuzzle: number
}

export interface GuessResult {
  accepted: true
  state: WordleState
}

export type LeaderboardScope = 'today' | 'week' | 'month' | 'all'

export interface LeaderboardRow {
  rank: number
  playerId: string
  nickname: string
  displayName: string
  avatarColor: string
  score: number
  played: number
  wins: number
  /** Media tentativi sulle sole partite vinte, null se nessuna. */
  avgAttempts: number | null
  currentStreak: number
  bestStreak: number
  /** Solo per scope=today: tentativi usati oggi. */
  todayAttempts: number | null
  todayStatus: WordleStatus | null
}

export interface LeaderboardResponse {
  scope: LeaderboardScope
  updatedAt: string
  rows: LeaderboardRow[]
  me: LeaderboardRow | null
}

export interface PlayerStats {
  played: number
  wins: number
  losses: number
  winRate: number
  currentStreak: number
  bestStreak: number
  totalScore: number
  avgAttempts: number | null
  /** Indice 0 = vinta al 1° tentativo … indice 5 = al 6°. */
  distribution: number[]
  lastPlayedDate: string | null
}

export interface ApiError {
  error: string
  /** Codice stabile per la UI (es. NICKNAME_TAKEN). */
  code: string
}

/**
 * Riepilogo leggero della giornata, per la card nell'hub.
 * `new` = il giocatore non ha ancora aperto la partita di oggi.
 */
export interface WordleSummary {
  puzzleNumber: number
  date: string
  status: WordleStatus | 'new'
  attempts: number
  score: number | null
  msToNextPuzzle: number
}

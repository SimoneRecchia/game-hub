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
  /**
   * true se il giocatore ha guardato la partita di qualcun altro prima di
   * giocare la propria: conosceva la parola, quindi la giornata non fa punti.
   */
  spectated: boolean
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
  /**
   * Solo per scope=today: ha guardato la partita di qualcun altro prima di
   * giocare la propria, quindi la giornata non fa punti.
   */
  todaySpectated: boolean | null
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

/* ─────────────────────────  Partite in compagnia  ───────────────────────── */

export type InviteStatus = 'pending' | 'accepted' | 'declined'

/** Un giocatore invitato, come lo vede l'host. */
export interface CoopGuest {
  inviteId: string
  playerId: string
  nickname: string
  displayName: string
  avatarColor: string
  status: InviteStatus
  /** Quanti suggerimenti ha mandato. */
  suggestions: number
}

/** Un suggerimento arrivato all'host. */
export interface CoopSuggestion {
  id: string
  word: string
  guestId: string
  guestName: string
  avatarColor: string
  createdAt: string
  /** Valorizzato se l'host ha poi giocato quella parola. */
  usedAt: string | null
}

/** Vista dell'host: chi ho invitato e cosa mi stanno suggerendo. */
export interface CoopRoom {
  roomId: string
  puzzleNumber: number
  maxGuests: number
  guests: CoopGuest[]
  /** Dal più recente. */
  suggestions: CoopSuggestion[]
}

/** Un invito ricevuto, come lo vede il guest. */
export interface CoopInvite {
  inviteId: string
  roomId: string
  puzzleNumber: number
  hostName: string
  hostAvatarColor: string
  createdAt: string
  /**
   * true se accettare svelerebbe la parola di oggi al guest, perché non ha
   * ancora finito la propria partita. In quel caso la sua giornata non farà
   * punti, e la UI lo dice prima di far accettare.
   */
  wouldSpoil: boolean
}

/** Vista del guest: la board dell'host, in sola lettura. */
export interface CoopView {
  roomId: string
  puzzleNumber: number
  hostName: string
  hostAvatarColor: string
  wordLength: number
  maxAttempts: number
  /** Gli stessi tentativi che vede l'host, con gli stessi colori. */
  guesses: EvaluatedGuess[]
  status: WordleStatus
  /** Rivelata solo a partita conclusa, come per l'host. */
  answer: string | null
  /** I suggerimenti di tutti gli invitati, dal più recente. */
  suggestions: CoopSuggestion[]
  /** L'invito e' ancora valido? Diventa false se l'host chiude la stanza. */
  active: boolean
}

/** Un giocatore invitabile. */
export interface InvitablePlayer {
  playerId: string
  nickname: string
  displayName: string
  avatarColor: string
  /** Ha già concluso la partita di oggi: invitarlo non gli svela nulla. */
  playedToday: boolean
  /** Già invitato in questa stanza. */
  invited: boolean
}

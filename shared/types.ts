/** Tipi condivisi tra client React e Pages Functions. */

export type GameId = 'wordle'

export interface Player {
  id: string
  nickname: string
  displayName: string
  avatarColor: string
  createdAt: string
  /** null per gli account creati prima dell'introduzione dell'email. */
  email: string | null
  emailVerified: boolean
}

/** Cosa il client deve sapere sulla configurazione, prima di disegnare la UI. */
export interface AuthConfig {
  /**
   * true se il codice via email e' richiesto per giocare. Quando e' false
   * l'email viene comunque raccolta, perché serve al recupero password, ma non
   * viene verificata.
   */
  emailVerificationRequired: boolean
}

/** Colore di una casella dopo la valutazione del server. */
export type TileState = 'correct' | 'present' | 'absent'

/** Un tentativo valutato: la parola giocata e il pattern restituito. */
export interface EvaluatedGuess {
  word: string
  pattern: TileState[]
}

export type WordleStatus = 'playing' | 'won' | 'lost'

/**
 * Una delle cinque parole della giornata, come la vede il selettore.
 *
 * `new` vuol dire che il giocatore non l'ha ancora aperta: la partita nasce
 * alla prima visita, non all'apertura dell'hub.
 */
export interface DaySlot {
  /** 1 = la parola del giorno, 2..5 = quelle in piu'. */
  slot: number
  status: WordleStatus | 'new'
  attempts: number
  /** Punti fatti. null se non e' chiusa. */
  score: number | null
  /**
   * true finché la parola precedente non e' chiusa.
   *
   * Le parole si aprono una per volta: non si passa alla seconda senza aver
   * finito la prima. Il controllo vero sta sul server — questo campo serve al
   * selettore per non proporre un percorso che verrebbe rifiutato.
   */
  locked: boolean
  /** true se questa parola e' stata giocata nella stanza di qualcun altro. */
  shared: boolean
}

export interface WordleState {
  /** Numero progressivo del puzzle: 1 = giorno di lancio. */
  puzzleNumber: number
  /** Data del puzzle in formato YYYY-MM-DD nel fuso Europe/Rome. */
  date: string
  /** Quale delle cinque parole si sta giocando. */
  slot: number
  /** Lo stato di tutte e cinque: il selettore e la griglia non possono divergere. */
  day: DaySlot[]
  wordLength: number
  maxAttempts: number
  guesses: EvaluatedGuess[]
  status: WordleStatus
  /** Rivelata solo a partita conclusa. */
  answer: string | null
  score: number | null
  /**
   * true se questa giornata il giocatore l'ha giocata nella stanza di un altro:
   * la propria board e' chiusa — e' la stessa parola — e il punteggio e' quello
   * dell'host.
   */
  spectated: boolean
  /** La stanza in cui sta giocando la giornata, se non e' la propria. */
  roomId: string | null
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
  /** Totale in classifica: punti partita + assist. */
  score: number
  /** La parte fatta giocando le proprie partite. */
  playScore: number
  /** La parte fatta nelle partite di chi lo ha invitato: e' il primo spareggio. */
  assistScore: number
  /** In quante giornate ha giocato nella stanza di un altro. */
  assists: number
  played: number
  wins: number
  /** Media tentativi sulle sole partite vinte, null se nessuna. */
  avgAttempts: number | null
  currentStreak: number
  bestStreak: number
  /** Solo per scope=today: tentativi usati oggi. */
  todayAttempts: number | null
  todayStatus: WordleStatus | null
  /** Solo per scope=today: oggi ha giocato la parola nella stanza di un altro. */
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
  /** Punti partita + assist: lo stesso totale che compare in classifica. */
  totalScore: number
  /** La parte fatta giocando le proprie partite. */
  playScore: number
  /** La parte fatta nelle partite di chi lo ha invitato. */
  assistScore: number
  /** In quante giornate ha giocato nella stanza di un altro. */
  assists: number
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
  /** Lo stato della **parola del giorno**: e' quella che la card racconta. */
  status: WordleStatus | 'new'
  attempts: number
  /** Punti di tutta la giornata, tutte e cinque le parole. */
  score: number | null
  msToNextPuzzle: number
  /** Oggi la parola la sta giocando nella stanza di un altro: qui la card ci rimanda. */
  roomId: string | null
  /** Quante delle cinque parole ha chiuso. */
  done: number
  /** Quante sono in tutto. */
  words: number
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
   * true se il guest non ha ancora finito la propria partita: accettando,
   * la parola di oggi la gioca qui e prende il punteggio dell'host. false se
   * aveva già giocato: puo' dare una mano, ma la sua giornata e' già spesa.
   */
  wouldSpoil: boolean
  /**
   * Tentativi che il guest ha già speso sulla propria griglia. Accettando li
   * lascia lì, ed e' l'unica cosa che accettare gli costa: va detta prima.
   */
  myAttempts: number
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
  /**
   * true se la giornata di chi guarda e' questa partita: prenderà lo stesso
   * punteggio dell'host. false se aveva già giocato la propria e quindi e' qui
   * solo per dare una mano.
   */
  counts: boolean
  /** Il punteggio, quando la partita si chiude. null finché si gioca. */
  myScore: number | null
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

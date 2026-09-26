/** Tipi condivisi tra client React e Pages Functions. */

import type { MossaGiocata } from './scarabeo'

export type GameId = 'wordle' | 'scarabeo' | 'cruciverba'

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

/**
 * La giornata vista dal percorso, senza aprire nessuna partita.
 *
 * Esiste separata da `WordleState` perché la schermata del percorso non deve
 * far partire niente: `openGame` scrive `started_at`, che e' l'istante da cui si
 * misura il bonus velocita'. Se la mappa chiedesse lo stato della prima parola
 * per disegnare i nodi, guardarla e poi andare a fare colazione costerebbe il
 * bonus — e nessuno collegherebbe la cosa al fatto di aver aperto una mappa.
 */
export interface DayView {
  puzzleNumber: number
  date: string
  /** Le cinque parole: stato, tentativi, punti, e quali sono ancora chiuse. */
  day: DaySlot[]
  /** La stanza in cui si sta giocando la giornata, se non e' la propria. */
  roomId: string | null
  /** Millisecondi al prossimo puzzle, per il countdown. */
  msToNextPuzzle: number
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

/* ─────────────────────────────────  Scarabeo  ──────────────────────────── */

/** Una casella occupata del tabellone. Le vuote non viaggiano. */
export interface CellaPiena {
  r: number
  c: number
  lettera: string
  jolly: boolean
}

export type ScarabeoStatus = 'playing' | 'done'

export interface ScarabeoState {
  puzzleNumber: number
  date: string
  /**
   * Solo le caselle occupate.
   *
   * Il tabellone ha 225 caselle e a metà partita ne sono piene una cinquantina:
   * mandare l'array intero vorrebbe dire tre kB di `null` a ogni mossa.
   */
  celle: CellaPiena[]
  /** Le tessere in mano. Il jolly e' "*". */
  leggio: string[]
  /** Quante tessere restano nel sacchetto. */
  restanti: number
  /** La cronologia, con i punti di ogni mossa. */
  mosse: MossaGiocata[]
  mosseUsate: number
  mosseTotali: number
  punti: number
  status: ScarabeoStatus
  msToNextPuzzle: number
}

/** Riepilogo per la card dell'hub. */
export interface ScarabeoSummary {
  puzzleNumber: number
  date: string
  status: 'new' | ScarabeoStatus
  punti: number
  mosseUsate: number
  mosseTotali: number
  msToNextPuzzle: number
}

export interface ScarabeoRow {
  rank: number
  playerId: string
  nickname: string
  displayName: string
  avatarColor: string
  /** Punti nel periodo. */
  punti: number
  /** Quante giornate ha giocato nel periodo. */
  giornate: number
  /** La giornata migliore del periodo. */
  migliore: number
  /** I punti di oggi, se ha giocato oggi. */
  oggi: number | null
  /** true se la giornata di oggi e' ancora aperta. */
  inCorso: boolean
}

export interface ScarabeoLeaderboard {
  scope: LeaderboardScope
  updatedAt: string
  rows: ScarabeoRow[]
  me: ScarabeoRow | null
}

/* ────────────────────────────────  Cruciverba  ─────────────────────────── */

export type CruciverbaStatus = 'playing' | 'done'

export interface DefinizioneCruciverba {
  /** `o12` o `v3`: direzione e prima casella. */
  chiave: string
  numero: number
  direzione: 'o' | 'v'
  caselle: number[]
  /** Il testo del Wikizionario, accorciato ma non riscritto. */
  testo: string
  /** "sigla", "plurale", "femminile", "femminile plurale", oppure vuota. */
  nota: string
  /**
   * La voce del Wikizionario da cui viene la definizione. Arriva solo a
   * partita chiusa: prima direbbe la risposta ("Milano" per MILANO).
   */
  voce: string | null
}

export interface CruciverbaState {
  puzzleNumber: number
  date: string
  righe: number
  colonne: number
  /** `#` per le nere, `.` per le bianche: le lettere giuste restano sul server. */
  schema: string
  definizioni: DefinizioneCruciverba[]
  /** La griglia del giocatore: `#`, lettere, e spazi per le caselle vuote. */
  lettere: string
  /** Le caselle svelate: le lettere lì sono giuste per forza e non si cambiano. */
  svelate: number[]
  /** Le caselle segnalate come sbagliate da un controllo, finché non cambiano. */
  segnalate: number[]
  /** Errori segnalati finora: ognuno e' costato un punto. */
  errori: number
  /** Tempo di gioco, a pagina visibile. */
  tempoMs: number
  /** Il lucchetto della concorrenza ottimistica: va rimandato a ogni scrittura. */
  versione: number
  status: CruciverbaStatus
  /** A partita chiusa i punti fatti, prima quelli che varrebbe finirla adesso. */
  punti: number
  /** La soluzione, solo a partita chiusa. */
  soluzione: string | null
  msToNextPuzzle: number
}

/** La risposta a una scrittura: poco, perché si salva a ogni parola. */
export interface CruciverbaEsito {
  versione: number
  status: CruciverbaStatus
  punti: number
  tempoMs: number
  /** Griglia piena ma con almeno un errore: si dice, ma non dove. */
  pienaConErrori: boolean
  /** Le caselle sbagliate, dopo un controllo. */
  errate?: number[]
  /** Le lettere svelate, dopo una richiesta di aiuto. */
  rivelate?: Record<number, string>
  /** Tutte le caselle svelate finora, dopo una richiesta di aiuto. */
  svelate?: number[]
  /** Lo stato intero, quando la partita si chiude: porta soluzione e fonti. */
  stato?: CruciverbaState
}

export interface CruciverbaSummary {
  puzzleNumber: number
  date: string
  /** `assente` se lo schema di oggi non e' stato generato. */
  status: 'new' | 'assente' | CruciverbaStatus
  scritte: number
  bianche: number
  punti: number
  tempoMs: number
  msToNextPuzzle: number
}

export interface CruciverbaRow {
  rank: number
  playerId: string
  nickname: string
  displayName: string
  avatarColor: string
  /** Punti nel periodo: solo i cruciverba completati. */
  punti: number
  /** Cruciverba completati nel periodo. */
  giornate: number
  /** Tempo totale dei completati: e' lo spareggio. */
  tempoMs: number
  /** true se oggi ha un cruciverba aperto e non ancora finito. */
  inCorso: boolean
}

export interface CruciverbaLeaderboard {
  scope: LeaderboardScope
  updatedAt: string
  rows: CruciverbaRow[]
  me: CruciverbaRow | null
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

/** Tipi condivisi tra client React e Pages Functions. */

import type { MossaGiocata } from './scarabeo'
import type { Esito, IdNave, Nave } from './battaglia'
import type { LivelloBattaglia } from './battaglia-computer'
import type { CategoriaQuiz, ModoQuiz } from './quiz'
import type { AreaQuiz, DomandaQuiz, LuogoQuiz, SpiegazioneQuiz } from './quiz-domande'
import type { DatiQuiz } from './quiz-dati'
import type { ImpostazioniSfida } from './quiz-sfida'
import type { Lato, Personaggi, Risposta } from './indovina'
import type { GiocoTavoliere, MotivoTavoliere, Parte } from './tavolo'
import type { LivelloSudoku } from './sudoku'
import type { LatoMoneta } from './ruota'
import type { Carta, ManoBJ } from './blackjack'
import type { FaseBJ } from './blackjack-tavolo'

export type GameId = 'wordle' | 'scarabeo' | 'cruciverba' | 'sudoku' | 'battaglia' | 'quiz' | 'tris'

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

/**
 * Una partita libera del Wordle: una parola a caso, senza giornata e senza
 * punti. La soluzione resta sul server finché si gioca, come nella classificata.
 */
export interface WordleLiberaState {
  id: string
  wordLength: number
  maxAttempts: number
  guesses: EvaluatedGuess[]
  status: WordleStatus
  answer: string | null
}

export interface StatisticheWordleLibero {
  giocate: number
  vinte: number
  /** Vittorie di fila, dalla piu' recente. */
  serie: number
  /** Indice 0 = vinta al primo tentativo. */
  distribuzione: number[]
}

export interface WordleLiberaRisposta {
  partita: WordleLiberaState | null
  statistiche: StatisticheWordleLibero
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
  /** Il punteggio del tabellone. */
  punti: number
  /** I punti in classifica: il punteggio in rapporto a quello del computer, fino al tetto dello Scarabeo. */
  puntiClassifica: number
  /**
   * Il computer, con le stesse tessere: il punteggio sempre — e' il traguardo —
   * le sue mosse solo a giornata chiusa.
   */
  computer: { punti: number; mosse: MossaGiocata[] | null }
  status: ScarabeoStatus
  msToNextPuzzle: number
}

/** Riepilogo per la card dell'hub. */
export interface ScarabeoSummary {
  puzzleNumber: number
  date: string
  status: 'new' | ScarabeoStatus
  punti: number
  puntiClassifica: number
  /** Il punteggio del computer sulle tessere di oggi. */
  computer: number
  mosseUsate: number
  mosseTotali: number
  msToNextPuzzle: number
}

/** Le partite libere di Scarabeo contro il computer, per livello. */
export interface StatisticheScarabeoLibero {
  giocate: number
  vinte: number
  perse: number
  pari: number
  /** Il punteggio piu' alto fatto in una partita libera. */
  migliore: number
  perLivello: Record<'facile' | 'normale' | 'difficile', { giocate: number; vinte: number }>
}

export interface ScarabeoRow {
  rank: number
  playerId: string
  nickname: string
  displayName: string
  avatarColor: string
  /** Punti in classifica nel periodo. */
  punti: number
  /** Il punteggio del tabellone nel periodo: e' lo spareggio. */
  punteggio: number
  /** Quante giornate ha giocato nel periodo. */
  giornate: number
  /** La giornata migliore del periodo, in punti del tabellone. */
  migliore: number
  /** I punti in classifica di oggi, se ha giocato oggi. */
  oggi: number | null
  /** true se la giornata di oggi e' ancora aperta. */
  inCorso: boolean
}

export interface ScarabeoLeaderboard {
  scope: LeaderboardScope
  periodo: PeriodoClassifica
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
  /** La partita: le scritture di una libera la indicano nell'indirizzo. */
  partitaId: string
  /** La classificata del giorno, o uno schema libero. */
  modalita: 'classificata' | 'libera'
  /** Il numero del puzzle, o quello dello schema libero. */
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

export interface CruciverbaLiberaRisposta {
  /** Il cruciverba libero aperto piu' recente, se c'e'. */
  partita: CruciverbaState | null
  giocate: number
  completate: number
  /** Completati senza svelare niente e senza errori. */
  senzaAiuti: number
  /** Quanti schemi liberi restano da aprire. */
  disponibili: number
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
  periodo: PeriodoClassifica
  updatedAt: string
  rows: CruciverbaRow[]
  me: CruciverbaRow | null
}

/* ────────────────────────────────  Sudoku  ───────────────────────────── */

export type SudokuStatus = 'playing' | 'done'

export interface SudokuState {
  partitaId: string
  puzzleNumber: number
  date: string
  livello: LivelloSudoku
  /** Le cifre date, con i punti per le vuote. */
  dati: string
  /** La griglia del giocatore: le date, le sue cifre e i punti per le vuote. */
  cifre: string
  /** Le note a matita, 243 caratteri (vedi shared/sudoku.ts). */
  note: string
  /** Le caselle svelate: la cifra lì e' giusta per forza e non si cambia. */
  svelate: number[]
  /** Le caselle segnalate come sbagliate da un controllo, finché non cambiano. */
  segnalate: number[]
  /** Errori segnalati finora: ognuno e' costato un punto. */
  errori: number
  /** Tempo di gioco, a pagina visibile. */
  tempoMs: number
  /** Il lucchetto della concorrenza ottimistica: va rimandato a ogni scrittura. */
  versione: number
  status: SudokuStatus
  /** A partita chiusa i punti fatti, prima quelli che varrebbe finirla adesso. */
  punti: number
  /** La soluzione, solo a partita chiusa. */
  soluzione: string | null
  msToNextPuzzle: number
}

/** La risposta a una scrittura: poco, perché si salva spesso. */
export interface SudokuEsito {
  versione: number
  status: SudokuStatus
  punti: number
  tempoMs: number
  /** Griglia piena ma con almeno un errore: si dice, ma non dove. */
  pienaConErrori: boolean
  /** Le caselle sbagliate, dopo un controllo. */
  errate?: number[]
  /** Le cifre svelate, dopo una richiesta di aiuto. */
  rivelate?: Record<number, string>
  /** Tutte le caselle svelate finora, dopo una richiesta di aiuto. */
  svelate?: number[]
  /** Lo stato intero, quando la partita si chiude: porta la soluzione. */
  stato?: SudokuState
}

export interface SudokuSummary {
  puzzleNumber: number
  date: string
  /** `assente` se lo schema di oggi non e' stato generato. */
  status: 'new' | 'assente' | SudokuStatus
  livello: LivelloSudoku | null
  /** Le caselle da scrivere, e quante sono scritte. */
  vuote: number
  scritte: number
  punti: number
  tempoMs: number
  msToNextPuzzle: number
}

export interface SudokuRow {
  rank: number
  playerId: string
  nickname: string
  displayName: string
  avatarColor: string
  /** Punti nel periodo: solo i sudoku completati. */
  punti: number
  /** Sudoku completati nel periodo. */
  giornate: number
  /** Tempo totale dei completati: e' lo spareggio. */
  tempoMs: number
  /** true se oggi ha un sudoku aperto e non ancora finito. */
  inCorso: boolean
}

export interface SudokuLeaderboard {
  scope: LeaderboardScope
  periodo: PeriodoClassifica
  updatedAt: string
  rows: SudokuRow[]
  me: SudokuRow | null
}

/* ────────────────────────────────  Tris  ───────────────────────────── */

export type TrisStatus = 'playing' | 'done'

/** Com'e' finita una partita della serie, per chi gioca. */
export type EsitoPartitaTris = 'vinta' | 'patta' | 'persa'

/** Una partita della serie del giorno, come la vede chi gioca. */
export interface PartitaTris {
  /** Le mosse dall'inizio, del giocatore e del computer, a turno: le caselle da 0 a 8. */
  mosse: number[]
  /** Il segno del giocatore: 0 comincia, ed e' la X. */
  segno: 0 | 1
  /** Com'e' finita; null finché si gioca. */
  esito: EsitoPartitaTris | null
  /** Persa perché e' scaduto il tempo della mossa. */
  tempo: boolean
}

export interface TrisStato {
  puzzleNumber: number
  date: string
  status: TrisStatus
  /** Le partite finite e quella in corso, in ordine. */
  partite: PartitaTris[]
  /** Quante partite ha la serie. */
  totale: number
  /** Il tempo che resta per la mossa, se una partita e' in corso; null fra una partita e l'altra. */
  restanteMs: number | null
  tempoMossaMs: number
  /** I punti fatti finora: a serie finita, quelli della classifica. */
  punti: number
  /** Il lucchetto della concorrenza ottimistica: va rimandato a ogni mossa. */
  versione: number
  msToNextPuzzle: number
}

export interface TrisSummary {
  puzzleNumber: number
  date: string
  status: 'new' | TrisStatus
  /** Le partite finite, com'e' andata ognuna. */
  esiti: EsitoPartitaTris[]
  totale: number
  punti: number
  msToNextPuzzle: number
}

export interface TrisRow {
  rank: number
  playerId: string
  nickname: string
  displayName: string
  avatarColor: string
  /** Punti nel periodo: solo le serie finite. */
  punti: number
  /** Serie finite nel periodo. */
  giornate: number
  vinte: number
  patte: number
  /** true se oggi ha una serie cominciata e non finita. */
  inCorso: boolean
}

export interface TrisLeaderboard {
  scope: LeaderboardScope
  periodo: PeriodoClassifica
  updatedAt: string
  rows: TrisRow[]
  me: TrisRow | null
}

/* ─────────────────────────────  Battaglia navale  ──────────────────────── */

/** Dove si trova un giocatore nell'app: lo dice il giro di controllo degli inviti. */
export type Attivita =
  | 'hub'
  | 'wordle'
  | 'scarabeo'
  | 'cruciverba'
  | 'sudoku'
  | 'battaglia'
  | 'quiz'
  | 'indovina'
  | 'scacchi'
  | 'dama'
  | 'forza4'
  | 'go'
  | 'tris'
  | 'ruota'
  | 'fortuna'
  | 'slot'
  | 'blackjack'
  | 'classifica'
  | 'profilo'
  | 'altro'

export interface GiocatoreBreve {
  playerId: string
  nickname: string
  displayName: string
  avatarColor: string
}

/** Un amico online, per il profilo e le Libere: chi e', e dove si trova. */
export interface AmicoOnline extends GiocatoreBreve {
  attivita: Attivita
}

export interface AmiciRisposta {
  online: AmicoOnline[]
}

/** Il profilo di un altro giocatore, come lo vede chi lo apre: per invitarlo a giocare. */
export interface ProfiloAmico extends GiocatoreBreve {
  /** Quando e' entrato nel gruppo. */
  createdAt: string
  online: boolean
  /** Dove si trova, se e' online. */
  attivita: Attivita | null
}

export interface GiocatoreOnline extends GiocatoreBreve {
  attivita: Attivita
  /** In una partita di battaglia navale: non si puo' sfidare. */
  occupato: boolean
  /** Gli e' gia' arrivata una sfida tua, che aspetta risposta. */
  invitato: boolean
}

/** Una sfida arrivata, da accettare o rifiutare. */
export interface InvitoBattaglia {
  id: string
  da: GiocatoreBreve
  createdAt: string
  scadeTraMs: number
  /** Una rivincita, alla fine di una partita fra amici: il conto della serie continua. */
  rivincita?: boolean
}

/** La rivincita chiesta alla fine di una partita fra amici, da uno dei due. */
export interface RivincitaBattaglia {
  id: string
  da: 'io' | 'avversario'
  stato: 'attesa' | 'accettato' | 'rifiutato' | 'annullato' | 'scaduto'
  partitaId: string | null
}

/** Una sfida mandata, con come e' andata. */
export interface InvitoInviato {
  id: string
  a: GiocatoreBreve
  stato: 'attesa' | 'accettato' | 'rifiutato' | 'annullato' | 'scaduto'
  partitaId: string | null
  scadeTraMs: number
}

export type StatoBattaglia = 'disposizione' | 'battaglia' | 'finita'

/**
 * Contro chi, e per cosa: fra amici, contro il computer per giocare, o la
 * classificata del giorno, contro il computer con la flotta uguale per tutti.
 */
export type ModalitaBattaglia = 'amici' | 'computer' | 'classificata'

/** La partita aperta di un giocatore, in breve: per l'hub e per il giro di controllo. */
export interface PartitaBreve {
  id: string
  modalita: ModalitaBattaglia
  stato: StatoBattaglia
  avversario: GiocatoreBreve
  tuoTurno: boolean
}

/** La classificata di oggi, come la vedono l'hub e la sala. */
export interface ClassificataBattaglia {
  puzzleNumber: number
  /** `nuova` finché non la si apre. */
  stato: 'nuova' | StatoBattaglia
  partitaId: string | null
  /** A partita finita: i punti in classifica, e com'e' andata. */
  punti: number | null
  vinta: boolean | null
  /** I colpi sparati finora. */
  colpi: number
  msToNextPuzzle: number
}

/** Un invito con un link, come lo vede chi l'ha creato. */
export interface LinkBattaglia {
  codice: string
  createdAt: string
  scadeTraMs: number
}

/** Un invito con un link, come lo vede chi lo apre: anche senza account. */
export interface InvitoConLink {
  codice: string
  da: GiocatoreBreve
  stato: 'attesa' | 'usato' | 'scaduto' | 'annullato'
  /** A cosa: la battaglia navale, se non si dice altro, una sfida a quiz, Indovina chi o un gioco da tavoliere. */
  gioco?: 'battaglia' | 'quiz' | 'indovina' | GiocoTavoliere
  /** Per il quiz, la partita che si gioca. */
  sfida?: RiassuntoSfida
  /** Per Indovina chi, con quali personaggi. */
  set?: string
  /** Per il go, il lato del goban. */
  variante?: string | null
}

/**
 * La risposta al giro di controllo che ogni schermata fa ogni pochi secondi:
 * gli inviti del Wordle in compagnia, le sfide a battaglia navale, la partita
 * aperta. Un giro solo per tutto, perché il piano gratuito conta le richieste.
 */
export interface PresenzaRisposta {
  coop: CoopInvite[]
  battaglia: InvitoBattaglia[]
  partita: PartitaBreve | null
  /** Le sfide a quiz arrivate, rivincite comprese. */
  quiz: InvitoQuiz[]
  /** Il duello a quiz aperto: chi ha sfidato e poi e' andato altrove deve sapere che l'altro ha accettato. */
  duello: DuelloBreve | null
  /** Gli inviti a Indovina chi arrivati, rivincite comprese. */
  indovina: InvitoIndovina[]
  /** La partita di Indovina chi aperta. */
  partitaIndovina: PartitaIndovinaBreve | null
  /** Gli inviti a scacchi, dama, Forza 4 e go arrivati, rivincite comprese. */
  tavolo: InvitoTavolo[]
  /** La partita a scacchi, dama, Forza 4 o go aperta. */
  partitaTavolo: PartitaTavoloBreve | null
}

/* ─────────────────────────────  Indovina chi  ──────────────────────── */

export type StatoIndovina = 'invito' | 'in_corso' | 'finita' | 'rifiutata' | 'annullata'

/** Un invito arrivato: da chi, con quali personaggi. */
export interface InvitoIndovina {
  id: string
  da: GiocatoreBreve
  set: string
  quanti: number
  scadeTraMs: number
  rivincita: boolean
}

/** L'ultimo invito mandato, com'e' andato: a un amico o con un link. */
export interface InvitoIndovinaMandato {
  id: string
  a: GiocatoreBreve | null
  codice: string | null
  stato: 'attesa' | 'accettato' | 'rifiutato' | 'annullato' | 'scaduto'
  set: string
  scadeTraMs: number
  partitaId: string | null
}

/** La partita aperta, in breve: per la sala, l'hub e il giro di controllo. */
export interface PartitaIndovinaBreve {
  id: string
  avversario: GiocatoreBreve
  /** Tocca a me fare una domanda, o rispondere alla sua. */
  tocca: 'domanda' | 'risposta' | null
}

export interface SalaIndovina {
  /** Chi e' online: `occupato` vuol dire in un'altra partita di Indovina chi. */
  giocatori: GiocatoreOnline[]
  invito: InvitoIndovinaMandato | null
  partita: PartitaIndovinaBreve | null
}

export type MossaVista =
  | { t: 'd'; mia: boolean; testo: string; at: string }
  | { t: 'r'; mia: boolean; r: Risposta; at: string }
  | { t: 'i'; mia: boolean; k: number; ok: boolean; at: string }

/** Un messaggio per aprire il canale fra i due telefoni: l'offerta di chi chiede le foto, e la risposta. */
export interface SegnaleIndovina {
  da: Lato
  sdp: string
  n: number
}

/**
 * Una partita di Indovina chi, come la vede uno dei due: il suo personaggio
 * segreto si', quello dell'altro solo a partita finita.
 */
export interface VistaIndovina {
  id: string
  stato: StatoIndovina
  io: Lato
  avversario: (GiocatoreBreve & { online: boolean }) | null
  personaggi: Personaggi
  mioSegreto: number | null
  suoSegreto: number | null
  abbassate: number[]
  /** Quante facce ha ancora in piedi l'altro: si vede quanto gli manca. */
  sueInPiedi: number
  tuoTurno: boolean
  /** La domanda che aspetta risposta, mia o sua. */
  domanda: { mia: boolean; testo: string } | null
  mosse: MossaVista[]
  vincitore: 'io' | 'avversario' | null
  motivo: 'indovinato' | 'sbagliato' | 'resa' | 'assenza' | null
  serie: { io: number; avversario: number; partite: number }
  rivincita: {
    id: string
    da: 'io' | 'avversario'
    stato: 'attesa' | 'accettato' | 'rifiutato' | 'annullato' | 'scaduto'
    partitaId: string | null
  } | null
  segnale: { offerta: SegnaleIndovina | null; risposta: SegnaleIndovina | null }
  /** Da quanto l'altro ha la mossa senza farla; oltre un tanto si puo' chiudere la partita. */
  attesaMs: number
  puoiReclamare: boolean
  versione: number
}

/* ────────────────────  Scacchi, dama, Forza 4, go e tris, fra amici  ──────────────────── */

export type StatoTavolo = 'invito' | 'in_corso' | 'finita' | 'rifiutata' | 'annullata'

/** Un invito arrivato: da chi, a che gioco. */
export interface InvitoTavolo {
  id: string
  gioco: GiocoTavoliere
  /** Per il go, il lato del goban: "13". */
  variante: string | null
  da: GiocatoreBreve
  scadeTraMs: number
  rivincita: boolean
}

/** L'ultimo invito mandato dalla sala di un gioco, com'e' andato: a un amico o con un link. */
export interface InvitoTavoloMandato {
  id: string
  gioco: GiocoTavoliere
  variante: string | null
  a: GiocatoreBreve | null
  codice: string | null
  stato: 'attesa' | 'accettato' | 'rifiutato' | 'annullato' | 'scaduto'
  scadeTraMs: number
  partitaId: string | null
}

/** Una partita aperta, in breve: per la sala, l'hub e il giro di controllo. */
export interface PartitaTavoloBreve {
  id: string
  gioco: GiocoTavoliere
  variante: string | null
  avversario: GiocatoreBreve
  tuoTurno: boolean
}

export interface SalaTavolo {
  /** Chi e' online: `occupato` vuol dire in un'altra partita da tavoliere. */
  giocatori: GiocatoreOnline[]
  invito: InvitoTavoloMandato | null
  /** Le partite in corso di questo gioco, anche ferme: si riprendono da qui. */
  partite: PartitaTavoloBreve[]
  /** Contro gli amici, a questo gioco. */
  record: { vinte: number; perse: number; patte: number }
}

/** Una partita come la vede uno dei due. */
export interface VistaTavolo {
  id: string
  gioco: GiocoTavoliere
  stato: StatoTavolo
  io: Lato
  /** Con che parte gioco: 0 muove per primo (il Bianco). Null finché non si e' accettato. */
  parte: Parte | null
  avversario: (GiocatoreBreve & { online: boolean }) | null
  posizione: string
  mosse: string[]
  tuoTurno: boolean
  vincitore: 'io' | 'avversario' | null
  motivo: MotivoTavoliere | null
  /** La patta proposta e ancora in sospeso, da me o dall'altro. */
  patta: 'io' | 'avversario' | null
  /** Posso proporre la patta adesso: il gioco la prevede, e non l'ho gia' proposta a questa mossa. */
  puoiProporre: boolean
  /**
   * Nel go, a gioco fermo dopo due passi: le pietre segnate morte (null finché
   * nessuno le ha segnate) e chi ha accettato il conteggio cosi' com'e'.
   */
  conteggio: { morte: number[] | null; accettato: 'io' | 'avversario' | null } | null
  /** Nel go, a partita finita ai punti: i punti di ciascuno, komi compreso. */
  punti: { io: number; avversario: number } | null
  /** Nel go, a partita finita ai punti: le pietre contate morte, che il goban continua a mostrare. */
  morte: number[] | null
  serie: { io: number; avversario: number; partite: number }
  rivincita: {
    id: string
    da: 'io' | 'avversario'
    stato: 'attesa' | 'accettato' | 'rifiutato' | 'annullato' | 'scaduto'
    partitaId: string | null
  } | null
  /** Da quanto l'altro ha la mossa senza farla; oltre un tanto si puo' chiudere la partita. */
  attesaMs: number
  puoiReclamare: boolean
  /**
   * Nei giochi con il tempo per mossa (il tris), a partita in corso: quanto
   * dura una mossa, e quanto ne resta a chi ha il tratto quando parte la
   * risposta. Allo scadere chi ha il tratto perde.
   */
  tempo: { mossaMs: number; restanteMs: number } | null
  versione: number
}

/* ─────────────────────────────  La sfida a quiz  ──────────────────────── */

/** La partita di una sfida a quiz, in breve: quel che si legge in un invito. */
export interface RiassuntoSfida {
  categoria: CategoriaQuiz
  modo: ModoQuiz
  area: AreaQuiz
  quante: number
  secondi: number
  /** Le altre materie: l'ambito, se non sono tutte, e il giorno di "Accadde oggi". */
  ambito?: string
  giorno?: string
}

/** Una sfida a quiz arrivata, da accettare o rifiutare. */
export interface InvitoQuiz {
  id: string
  da: GiocatoreBreve
  sfida: RiassuntoSfida
  /** Una rivincita, alla fine di un duello: si accetta anche dalla pagina del duello. */
  rivincita: boolean
  scadeTraMs: number
}

/** Una sfida a quiz mandata, come la vede chi aspetta la risposta. */
export interface SfidaQuizInviata {
  id: string
  /** A chi; null per un invito con il link che nessuno ha ancora usato. */
  a: GiocatoreBreve | null
  codice: string | null
  stato: 'attesa' | 'accettata' | 'rifiutata' | 'annullata' | 'scaduta'
  duelloId: string | null
  scadeTraMs: number
}

/** Chi si puo' sfidare a quiz: chi e' online, e la sfida mandata che aspetta ancora. */
export interface SalaQuiz {
  giocatori: GiocatoreOnline[]
  sfida: SfidaQuizInviata | null
}

export interface DuelloBreve {
  id: string
  avversario: GiocatoreBreve
  stato: 'attesa' | 'in_corso'
}

/** Una domanda del duello gia' chiusa: com'e' andata per tutti e due, e la risposta giusta. */
export interface GiroQuizVisto {
  indice: number
  domanda: DomandaQuiz
  corretta: string
  risposta: string
  accettate?: string[]
  luogo?: LuogoQuiz
  /** La scheda che insegna, per le materie senza cartina. */
  spiegazione?: SpiegazioneQuiz
  punto: 'io' | 'avversario' | null
  /** Le risposte date; null e' il tempo finito. */
  mia: { scelta: string; giusta: boolean } | null
  sua: { scelta: string; giusta: boolean } | null
  /** Quando si e' chiusa, sull'orologio del server: la risposta resta in vista per la pausa. */
  chiusaAt: number
}

/** La domanda aperta del duello, senza la risposta. Gli istanti sono sull'orologio del server. */
export interface DomandaDuello {
  indice: number
  domanda: DomandaQuiz
  apertaAt: number
  limiteMs: number
  scadeIo: number
  /** Da quando il mio tempo va al rallentatore, perché l'altro ha sbagliato. */
  lentoIo: number | null
  scadeAvversario: number
  lentoAvversario: number | null
  /** La mia risposta sbagliata: sono fuori da questa domanda. */
  mia: string | null
  /** L'avversario ha sbagliato: se avesse risposto giusto la domanda sarebbe gia' chiusa. */
  avversarioFuori: boolean
}

export interface RivincitaVista {
  id: string
  da: 'io' | 'avversario'
  stato: 'attesa' | 'accettata' | 'rifiutata' | 'annullata' | 'scaduta'
  duelloId: string | null
}

export interface VistaDuello {
  id: string
  stato: 'attesa' | 'in_corso' | 'finito' | 'abbandonato'
  impostazioni: ImpostazioniSfida
  totale: number
  avversario: GiocatoreBreve & { online: boolean }
  pronti: { io: boolean; avversario: boolean }
  /** L'ora del server, per tenere l'orologio del telefono sul suo. */
  adesso: number
  inizioAt: number | null
  /** Nella pausa fra due domande, quando si apre la prossima. */
  prossimaAt: number | null
  punti: { io: number; avversario: number }
  /** Le partite di prima della serie, senza questa. */
  serie: { io: number; avversario: number; partite: number }
  /** Le domande chiuse, da quella chiesta in poi. */
  giri: GiroQuizVisto[]
  domanda: DomandaDuello | null
  /** Chi se n'e' andato prima della fine. */
  uscito: 'io' | 'avversario' | null
  rivincita: RivincitaVista | null
}

export interface LobbyBattaglia {
  giocatori: GiocatoreOnline[]
  inviti: InvitoInviato[]
  /** La partita aperta con un amico. */
  partita: PartitaBreve | null
  /** La partita libera aperta contro il computer. */
  computer: PartitaBreve | null
  /** L'invito con un link ancora valido, se ce n'e' uno. */
  link: LinkBattaglia | null
  classificata: ClassificataBattaglia
  /** Contro gli amici. */
  vinte: number
  perse: number
  /** Contro il computer, nelle partite libere. */
  controComputer: Record<LivelloBattaglia, { vinte: number; perse: number }>
}

/** Un colpo visto da chi guarda: dove, com'e' andato, e la nave solo se affondata. */
export interface ColpoVisto {
  casella: number
  esito: Esito
  /** Il nome si annuncia solo all'affondamento, come al tavolo. */
  nave: IdNave | null
}

export interface VistaBattaglia {
  id: string
  modalita: ModalitaBattaglia
  /** Il livello del computer; null fra amici. */
  livello: LivelloBattaglia | null
  /** La giornata, per la classificata. */
  puzzleNumber: number | null
  /** I punti della classificata, a partita finita. */
  punti: number | null
  stato: StatoBattaglia
  avversario: GiocatoreBreve & { online: boolean }
  /** La mia flotta, se l'ho gia' messa in mare. */
  miaFlotta: Nave[] | null
  avversarioPronto: boolean
  tuoTurno: boolean
  /** I miei colpi sul mare dell'avversario. */
  colpiMiei: ColpoVisto[]
  /** I colpi dell'avversario sul mio mare. */
  colpiSubiti: ColpoVisto[]
  /** Le navi nemiche affondate, con la loro posizione: ormai si vedono. */
  affondateNemiche: Nave[]
  /** La flotta nemica intera: solo a partita finita. */
  flottaNemica: Nave[] | null
  /** L'ultimo colpo sparato, da chiunque: e' la notizia da dare. */
  ultimo: (ColpoVisto & { mio: boolean }) | null
  vincitore: 'io' | 'avversario' | null
  motivo: 'flotta' | 'resa' | 'assenza' | null
  /** Da quando l'avversario non muove: oltre il limite si puo' chiedere la vittoria. */
  attesaMs: number
  puoiReclamare: boolean
  versione: number
  /** Fra amici: le vittorie di ciascuno nelle partite di prima della serie. */
  serie: { io: number; avversario: number; partite: number } | null
  /** Fra amici, a partita finita: la rivincita chiesta, se c'e'. */
  rivincita: RivincitaBattaglia | null
}

export interface BattagliaSummary {
  /** Quanti altri giocatori sono online adesso. */
  online: number
  /** La partita aperta con un amico. */
  partita: PartitaBreve | null
  classificata: ClassificataBattaglia
  vinte: number
  perse: number
}

/** La classifica della battaglia: le classificate, contro il computer. */
export interface BattagliaRow {
  rank: number
  playerId: string
  nickname: string
  displayName: string
  avatarColor: string
  punti: number
  giornate: number
  vinte: number
  /** Colpi sparati nelle vittorie: meno, a parita', e' meglio. */
  colpi: number
  /** I punti di oggi, se la classificata di oggi e' finita. */
  oggi: number | null
  inCorso: boolean
}

export interface BattagliaLeaderboard {
  scope: LeaderboardScope
  periodo: PeriodoClassifica
  updatedAt: string
  rows: BattagliaRow[]
  me: BattagliaRow | null
}

/* ──────────────────────────────  Il quiz  ────────────────────────────── */

/** Una risposta data, come la rivede chi ha giocato. */
export interface RispostaQuiz {
  /** L'opzione scelta, o il posto toccato sulla cartina; null se il tempo e' finito. */
  scelta: string | null
  giusta: boolean
  /** L'id della risposta giusta: un'opzione, o il posto sulla cartina. */
  corretta: string
  /** La risposta giusta a parole: "Lisbona", "il Mar Tirreno". */
  risposta: string
  /** Quanto ci si e' messo. */
  ms: number
  /** Dove guardare sulla cartina che insegna: c'e' dalle giornate del formato 2. */
  luogo?: LuogoQuiz
  /** Sulla cartina, i posti che valevano come giusti: il Tirreno, per il Mediterraneo. */
  accettate?: string[]
  /** La scheda che insegna, per le materie senza cartina: di chi e' il quadro, quando, dove. */
  spiegazione?: SpiegazioneQuiz
}

/**
 * La domanda aperta. Il tempo lo conta il server, da quando il telefono l'ha
 * chiesta: al telefono arriva quanto ne resta, e dopo una ricarica riparte da
 * lì, non da capo.
 */
export interface DomandaAperta {
  indice: number
  domanda: DomandaQuiz
  limiteMs: number
  restanteMs: number
}

export interface QuizState {
  puzzleNumber: number
  date: string
  categoria: CategoriaQuiz
  /** A scelta o sulla cartina muta: lo dicono le domande del giorno. */
  modo: ModoQuiz
  /** Quante domande ha la partita. */
  totale: number
  /** `nuova` finché non si comincia: guardare la pagina non apre la partita. */
  status: 'nuova' | 'playing' | 'done'
  /** Le domande a cui si e' gia' risposto, con com'e' andata. */
  fatte: Array<{ domanda: DomandaQuiz; risposta: RispostaQuiz }>
  aperta: DomandaAperta | null
  giuste: number
  /** I punti in classifica: a partita finita quelli veri, prima quelli che si farebbero fermandosi qui. */
  punti: number
  tempoMs: number
  msToNextPuzzle: number
}

/** Quel che torna da una risposta: com'e' andata, e lo stato con la domanda dopo. */
export interface QuizEsito {
  risposta: RispostaQuiz
  stato: QuizState
}

export interface QuizSummary {
  puzzleNumber: number
  date: string
  /** `assente` se lo script della notte non ha preparato la giornata. */
  status: 'assente' | 'nuova' | 'playing' | 'done'
  categoria: CategoriaQuiz | null
  modo: ModoQuiz | null
  fatte: number
  giuste: number
  totale: number
  punti: number
  msToNextPuzzle: number
}

export interface QuizRow {
  rank: number
  playerId: string
  nickname: string
  displayName: string
  avatarColor: string
  punti: number
  /** Partite finite nel periodo. */
  giornate: number
  /** Risposte giuste nel periodo. */
  giuste: number
  /** Il tempo delle partite finite: e' lo spareggio. */
  tempoMs: number
  inCorso: boolean
}

export interface QuizLeaderboard {
  scope: LeaderboardScope
  periodo: PeriodoClassifica
  updatedAt: string
  rows: QuizRow[]
  me: QuizRow | null
}

/**
 * Il riassunto per le partite libere. `dati` e' null se il browser ha gia'
 * quella versione: la chiede con la sua, e riscarica solo quando cambia.
 */
export interface QuizDatiRisposta {
  versione: string
  dati: DatiQuiz | null
}

export type LeaderboardScope = 'today' | 'week' | 'month' | 'all'

/**
 * Il periodo di una classifica, di calendario: un giorno, la settimana da
 * lunedì a domenica, il mese, o sempre (vedi shared/periodi.ts).
 */
export interface PeriodoClassifica {
  scope: LeaderboardScope
  /** Quanti periodi prima di quello in corso: 0 e' oggi, questa settimana, questo mese. */
  indietro: number
  /** Fin dove si puo' tornare indietro: il periodo del primo giorno di gioco. */
  massimo: number
  /** Il primo e l'ultimo giorno del periodo, come numeri di puzzle, compresi. */
  da: number
  a: number
}

/* ──────────────────────────  La classifica generale  ───────────────────────── */

/** I giochi che hanno una classificata, e quindi una classifica. */
export type GiocoClassificato = 'wordle' | 'scarabeo' | 'cruciverba' | 'sudoku' | 'battaglia' | 'quiz' | 'tris'

/** I giochi da tavolo: niente classificata, solo partite fra amici (e, dove ha senso, contro il computer). */
export type GiocoDaTavolo = 'indovina' | GiocoTavoliere

/** Una classifica: quella di un gioco, o la generale che le somma. */
export type ChiaveClassifica = GiocoClassificato | 'generale' | 'fortuna'

/** Una riga dell'anteprima di una classifica: chi, e quanti punti. */
export interface RigaAnteprima {
  rank: number
  playerId: string
  nickname: string
  displayName: string
  avatarColor: string
  punti: number
  /** Ha una classificata di oggi ancora aperta. */
  inCorso: boolean
}

export interface AnteprimaClassifica {
  /** Quanti sono in classifica nel periodo. */
  giocatori: number
  /** I primi tre. */
  primi: RigaAnteprima[]
  me: RigaAnteprima | null
}

/** Tutte le classifiche di un periodo in una richiesta: i primi tre di ognuna, e dove sei tu. */
export interface PanoramicaClassifiche {
  scope: LeaderboardScope
  periodo: PeriodoClassifica
  updatedAt: string
  classifiche: Record<ChiaveClassifica, AnteprimaClassifica>
}

/**
 * Una riga della classifica generale: la somma delle classificate di tutti i
 * giochi. Si puo' sommare perché ogni classificata ha un tetto deciso (vedi
 * shared/punti.ts).
 */
export interface GeneraleRow {
  rank: number
  playerId: string
  nickname: string
  displayName: string
  avatarColor: string
  punti: number
  perGioco: Record<GiocoClassificato, number>
  /** Quel che ha dato o tolto Crazy Time nel periodo: e' gia' dentro `punti`. */
  ruota: number
  /** Quel che hanno dato o tolto la slot e il blackjack: anche questo e' gia' dentro `punti`. */
  slot: number
  blackjack: number
  /** La parte del Wordle fatta nella stanza di qualcun altro: e' lo spareggio. */
  assist: number
  /** Classificate chiuse nel periodo: una giornata di Wordle conta una. */
  partite: number
}

export interface GeneraleLeaderboard {
  scope: LeaderboardScope
  periodo: PeriodoClassifica
  updatedAt: string
  rows: GeneraleRow[]
  me: GeneraleRow | null
}

/** Una riga della classifica della Fortuna: chi ha vinto di piu' ai giochi d'azzardo, nel periodo. */
export interface FortunaRow {
  rank: number
  playerId: string
  nickname: string
  displayName: string
  avatarColor: string
  /** Quel che Crazy Time, la slot e il blackjack hanno dato o tolto, insieme: puo' essere sotto zero. */
  punti: number
  netti: Record<GiocoFortuna, number>
  /** I giri della ruota e della slot, e le mani del blackjack. */
  giocate: number
}

export interface FortunaLeaderboard {
  scope: LeaderboardScope
  periodo: PeriodoClassifica
  updatedAt: string
  rows: FortunaRow[]
  me: FortunaRow | null
}

/** Tutto quel che serve alla schermata iniziale, in una richiesta. */
export interface OggiRisposta {
  date: string
  puzzleNumber: number
  msToNextPuzzle: number
  wordle: WordleSummary
  scarabeo: ScarabeoSummary
  cruciverba: CruciverbaSummary
  sudoku: SudokuSummary
  battaglia: BattagliaSummary
  quiz: QuizSummary
  tris: TrisSummary
  /** Come si sta oggi nella classifica generale, con quel che hanno dato o tolto i giochi della Fortuna. */
  generale: {
    posizione: number | null
    punti: number
    giocatori: number
    /** I primi tre di oggi, fra chi ha fatto punti. */
    podio: Array<GiocatoreBreve & { punti: number }>
  }
}

/* ───────────────────────────────  Crazy Time  ──────────────────────────────── */

/**
 * Il minigioco di un giro, come lo vede chi gioca. La vincita e' quel che
 * restituisce la puntata se va bene — la puntata per il moltiplicatore — e
 * c'e' da quando il moltiplicatore e' deciso: subito per la moneta, alla ruota
 * dei moltiplicatori per la domanda.
 */
export type SfidaRuotaVista =
  | {
      tipo: 'moneta'
      /** Il moltiplicatore del blu, deciso quando la ruota si ferma sulla moneta. */
      moltiplicatore: number
      vincita: number
      /** Il lato uscito, a moneta lanciata. */
      uscito: LatoMoneta | null
    }
  | {
      tipo: 'domanda'
      /** La categoria dello spicchio, una di quelle del giorno (shared/ruota.ts, categorieDelGiorno). */
      categoria: CategoriaQuiz
      /** Dalla ruota dei moltiplicatori: null finché non la si gira. */
      moltiplicatore: number | null
      /** Lo spicchio dove si e' fermata la ruota dei moltiplicatori (shared/ruota.ts, MOLTIPLICATORI). */
      spicchioMoltiplicatore: number | null
      vincita: number | null
      /** Da quando si apre: senza la risposta finché non si risponde. */
      domanda: DomandaQuiz | null
      limiteMs: number | null
      /** Quanto resta, mentre la domanda e' aperta. */
      restanteMs: number | null
      /** A risposta data, con la giusta e la scheda che insegna. */
      risposta: RispostaQuiz | null
    }

export interface GiroRuota {
  /** Il numero del giro nella giornata, da 1. */
  n: number
  puntata: number
  /** Lo spicchio dove si e' fermata la ruota, dall'alto in senso orario (shared/ruota.ts, spicchiDelGiorno). */
  spicchio: number
  /** `sfida` finché la moneta o la domanda non si giocano, `domanda` mentre la domanda e' aperta. */
  stato: 'sfida' | 'domanda' | 'fatto'
  /**
   * Quel che il giro ha dato o tolto: la puntata si paga subito, quindi durante
   * un minigioco e' la puntata persa; il triplo la restituisce per tre subito.
   */
  delta: number
  sfida: SfidaRuotaVista | null
}

export interface RuotaStato {
  puzzleNumber: number
  date: string
  /** I punti delle classificate di oggi. */
  classificate: number
  /** Quel che Crazy Time ha dato o tolto oggi, e in quanti giri. */
  netto: number
  giri: number
  /** Quanto si puo' puntare: le classificate di oggi piu' il netto, mai sotto zero. */
  saldo: number
  /** L'ultimo giro di oggi, se c'e'. */
  giro: GiroRuota | null
  msToNextPuzzle: number
}

/** Crazy Time nella scheda della Fortuna. */
export interface RuotaSummary {
  saldo: number
  netto: number
  giri: number
  /** `sfida` se l'ultimo giro aspetta la moneta o la risposta. */
  stato: 'gioca' | 'sfida'
  /** Lo spicchio dell'ultimo giro, se c'e'. */
  spicchio: number | null
}

/* ────────────────────────────────  La Fortuna  ──────────────────────────────── */

/** I giochi d'azzardo della scheda Fortuna: puntano tutti lo stesso saldo, i punti fatti oggi. */
export type GiocoFortuna = 'ruota' | 'slot' | 'blackjack'

/** La scheda della Fortuna in una richiesta: il saldo di oggi, e com'e' andata a ogni gioco. */
export interface FortunaRisposta {
  puzzleNumber: number
  date: string
  msToNextPuzzle: number
  /** I punti delle classificate di oggi. */
  classificate: number
  /** Quel che si puo' puntare: le classificate piu' quel che i giochi hanno dato o tolto, mai sotto zero. */
  saldo: number
  netti: Record<GiocoFortuna, number>
  giocate: Record<GiocoFortuna, number>
  ruota: RuotaSummary
  /** `sfida` se l'ultimo giro della slot aspetta la risposta alla domanda. */
  slot: { stato: 'gioca' | 'sfida' }
  /** Il tavolo a cui si e' seduti, e quelli degli amici online. */
  blackjack: { mioTavolo: string | null; tavoli: TavoloInSala[] }
}

/** Un giro della slot, come lo vede chi gioca: la domanda senza la risposta finché non si risponde. */
export interface GiroSlot {
  n: number
  puntata: number
  /** Le fermate dei tre rulli: l'indice del simbolo sulla linea (shared/slot.ts, RULLI). */
  fermate: number[]
  /** Quante volte la puntata paga la linea: zero se niente. */
  premio: number
  /** I tre punti di domanda, se ci sono: la categoria della domanda, scelta fra quelle del giorno. */
  tripla: { categoria: CategoriaQuiz } | null
  stato: 'sfida' | 'domanda' | 'fatto'
  /** Quel che il giro da' o toglie: la vincita meno la puntata, e la domanda se e' vinta. */
  delta: number
  /** Quel che paga la domanda, se e' giusta. */
  vincitaDomanda: number | null
  domanda: DomandaQuiz | null
  limiteMs: number | null
  restanteMs: number | null
  risposta: RispostaQuiz | null
}

/** La slot di oggi: il saldo, il conto della slot, le categorie dei rulli e l'ultimo giro. */
export interface SlotStato {
  puzzleNumber: number
  date: string
  classificate: number
  saldo: number
  /** Quel che la slot ha dato o tolto oggi, e in quanti giri. */
  netto: number
  giri: number
  /** Le categorie del giorno, da cui viene la domanda (shared/ruota.ts, categorieDelGiorno). */
  categorie: CategoriaQuiz[]
  giro: GiroSlot | null
  msToNextPuzzle: number
}

/** Un tavolo del blackjack visto dalla sala: chi ci gioca, e quanti posti restano. */
export interface TavoloInSala {
  id: string
  giocatori: GiocatoreBreve[]
  liberi: number
}

/** La sala del blackjack: il saldo, il conto di oggi, il tavolo a cui si e' seduti e quelli degli amici. */
export interface SalaBlackjack {
  puzzleNumber: number
  date: string
  msToNextPuzzle: number
  classificate: number
  saldo: number
  /** Quel che il blackjack ha dato o tolto oggi, e in quanti giri. */
  netto: number
  giri: number
  mioTavolo: string | null
  tavoli: TavoloInSala[]
}

/** Un posto del tavolo come lo vedono tutti: le carte non hanno niente da nascondere. */
export interface PostoVistaBJ {
  giocatore: GiocatoreBreve
  /** La puntata del giro, raddoppi e divisioni compresi: zero per chi guarda. */
  puntata: number
  mani: ManoBJ[]
  /** A giro finito: quel che il giro gli ha dato o tolto. */
  delta: number | null
  /** Si e' alzato a giro in corso. */
  via: boolean
  /** Ha la pagina aperta, o ha fatto qualcosa da poco. */
  presente: boolean
}

/** Il tavolo per chi lo guarda, con il suo saldo. */
export interface VistaTavoloBJ {
  id: string
  versione: number
  giro: number
  fase: FaseBJ
  /** Quanto manca alla scadenza della fase o del turno, dall'ora del server; null se non c'e'. */
  scadenzaMs: number | null
  /** La scadenza del turno conta: c'e' qualcuno che aspetta. */
  aTempo: boolean
  banco: Carta[]
  turno: { posto: number; mano: number } | null
  posti: (PostoVistaBJ | null)[]
  /** Il posto di chi guarda, o null se non e' seduto. */
  mio: number | null
  classificate: number
  saldo: number
  netto: number
  giri: number
  msToNextPuzzle: number
}

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
  /**
   * I tentativi del giorno: di oggi, o del giorno della classifica se il periodo e' un giorno
   * passato.
   */
  todayAttempts: number | null
  todayStatus: WordleStatus | null
  /** Quel giorno ha giocato la parola nella stanza di un altro. */
  todaySpectated: boolean | null
}

export interface LeaderboardResponse {
  scope: LeaderboardScope
  periodo: PeriodoClassifica
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
  status: WordleStatus | 'new'
  attempts: number
  /** I punti della giornata, se e' chiusa. */
  score: number | null
  msToNextPuzzle: number
  /** Oggi la parola la sta giocando nella stanza di un altro: qui la card ci rimanda. */
  roomId: string | null
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

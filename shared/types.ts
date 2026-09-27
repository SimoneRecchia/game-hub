/** Tipi condivisi tra client React e Pages Functions. */

import type { MossaGiocata } from './scarabeo'
import type { Esito, IdNave, Nave } from './battaglia'
import type { LivelloBattaglia } from './battaglia-computer'
import type { CategoriaQuiz, ModoQuiz } from './quiz'
import type { AreaQuiz, DomandaQuiz, LuogoQuiz } from './quiz-domande'
import type { DatiQuiz } from './quiz-dati'
import type { ImpostazioniSfida } from './quiz-sfida'

export type GameId = 'wordle' | 'scarabeo' | 'cruciverba' | 'battaglia' | 'quiz'

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
  /** I punti in classifica: il punteggio in rapporto a quello del computer, fino a cento. */
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
  updatedAt: string
  rows: CruciverbaRow[]
  me: CruciverbaRow | null
}

/* ─────────────────────────────  Battaglia navale  ──────────────────────── */

/** Dove si trova un giocatore nell'app: lo dice il giro di controllo degli inviti. */
export type Attivita =
  | 'hub'
  | 'wordle'
  | 'scarabeo'
  | 'cruciverba'
  | 'battaglia'
  | 'quiz'
  | 'classifica'
  | 'profilo'
  | 'altro'

export interface GiocatoreBreve {
  playerId: string
  nickname: string
  displayName: string
  avatarColor: string
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
  /** A cosa: la battaglia navale, se non si dice altro, o una sfida a quiz. */
  gioco?: 'battaglia' | 'quiz'
  /** Per il quiz, la partita che si gioca. */
  sfida?: RiassuntoSfida
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
}

/* ─────────────────────────────  La sfida a quiz  ──────────────────────── */

/** La partita di una sfida a quiz, in breve: quel che si legge in un invito. */
export interface RiassuntoSfida {
  categoria: CategoriaQuiz
  modo: ModoQuiz
  area: AreaQuiz
  quante: number
  secondi: number
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

/* ──────────────────────────  La classifica generale  ───────────────────────── */

/** I giochi che hanno una classificata, e quindi una classifica. */
export type GiocoClassificato = 'wordle' | 'scarabeo' | 'cruciverba' | 'battaglia' | 'quiz'

/**
 * Una riga della classifica generale: la somma delle classificate di tutti i
 * giochi. Si puo' sommare perché ogni classificata vale al massimo cento punti
 * (vedi shared/punti.ts).
 */
export interface GeneraleRow {
  rank: number
  playerId: string
  nickname: string
  displayName: string
  avatarColor: string
  punti: number
  perGioco: Record<GiocoClassificato, number>
  /** La parte del Wordle fatta nella stanza di qualcun altro: e' lo spareggio. */
  assist: number
  /** Classificate chiuse nel periodo: una giornata di Wordle conta una. */
  partite: number
}

export interface GeneraleLeaderboard {
  scope: LeaderboardScope
  updatedAt: string
  rows: GeneraleRow[]
  me: GeneraleRow | null
}

/** Tutto quel che serve alla schermata iniziale, in una richiesta. */
export interface OggiRisposta {
  date: string
  puzzleNumber: number
  msToNextPuzzle: number
  wordle: WordleSummary
  scarabeo: ScarabeoSummary
  cruciverba: CruciverbaSummary
  battaglia: BattagliaSummary
  quiz: QuizSummary
  /** Come si sta oggi nella classifica generale. */
  generale: { posizione: number | null; punti: number; giocatori: number }
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

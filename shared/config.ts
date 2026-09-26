/** Costanti di gioco condivise tra client e server. */

export const WORD_LENGTH = 5
export const MAX_ATTEMPTS = 6

/**
 * Quante parole per giornata.
 *
 * La prima e' *la* parola del giorno; le altre quattro valgono a scalare e
 * insieme non arrivano a quanto vale la prima (vedi `WORD_WEIGHTS` in
 * `scoring.ts`). Servono a chi vuole recuperare qualche punto, non a ribaltare
 * la classifica.
 */
export const WORDS_PER_DAY = 5

/**
 * Fuso di riferimento per il cambio di parola: la mezzanotte italiana.
 * Tutti i giocatori vedono lo stesso puzzle nello stesso momento,
 * indipendentemente dal fuso del dispositivo.
 */
export const GAME_TIMEZONE = 'Europe/Rome'

/** Primo giorno di gioco (puzzle numero 1), in data locale italiana. */
export const EPOCH_DATE = '2026-08-29'

/** Durata della sessione: un anno, cosi' il browser "ricorda" il giocatore. */
export const SESSION_TTL_DAYS = 365

export const NICKNAME_MIN = 3
export const NICKNAME_MAX = 16
export const PASSWORD_MIN = 6
export const PASSWORD_MAX = 128

/** Nickname: lettere, numeri, underscore, punto e trattino. */
export const NICKNAME_PATTERN = /^[a-zA-Z0-9._-]{3,16}$/

/** Palette per l'avatar generato dal nickname. */
export const AVATAR_COLORS = [
  '#007aff',
  '#34c759',
  '#ff9500',
  '#ff2d55',
  '#af52de',
  '#5856d6',
  '#30b0c7',
  '#ff3b30',
  '#00c7be',
  '#ffcc00',
] as const

/** Quante persone l'host può invitare a guardare la sua partita. */
export const MAX_COOP_GUESTS = 5

/**
 * Ogni quanto il client ricontrolla lo stato condiviso.
 *
 * Non c'e' realtime: le Durable Objects non sono garantite sul piano gratuito
 * e i 10 ms di CPU per richiesta rendono le connessioni lunghe una cattiva
 * idea. Per "qualcuno ti suggerisce una parola" due secondi non si notano.
 */
export const COOP_POLL_VIEW_MS = 2_000
export const COOP_POLL_ROOM_MS = 3_000
/** Gli inviti non sono urgenti al secondo: si guardano più di rado. */
export const COOP_POLL_INBOX_MS = 8_000

/* ─────────────────────────  Presenza e battaglia navale  ───────────────────────── */

/**
 * Online vuol dire aver fatto il giro di controllo da poco. Il giro parte ogni
 * otto secondi a pagina visibile e scrive al massimo ogni venti: quarantacinque
 * secondi lasciano passare due scritture mancate prima di dare qualcuno per
 * andato.
 */
export const PRESENZA_ONLINE_MS = 45_000
export const PRESENZA_SCRITTURA_MS = 20_000

/** Quanto aspetta una sfida: chi sfida sta guardando lo schermo, non torna fra un'ora. */
export const SFIDA_SCADENZA_MS = 120_000

/**
 * Dopo quanto si puo' chiedere la vittoria a tavolino: tre minuti senza un
 * colpo quando tocca all'avversario, cinque se non ha ancora disposto la flotta.
 * Senza, chi sta perdendo potrebbe chiudere l'app e tenere l'altro in sospeso.
 */
export const BATTAGLIA_ATTESA_TURNO_MS = 180_000
export const BATTAGLIA_ATTESA_FLOTTA_MS = 300_000

/**
 * Una partita senza mosse da mezz'ora non tiene piu' occupato nessuno: se i due
 * hanno chiuso l'app a meta', devono poter sfidare ed essere sfidati di nuovo.
 * La partita resta li' e si puo' riprendere dal suo indirizzo; smette solo di
 * contare come "in corso".
 */
export const BATTAGLIA_ABBANDONATA_MS = 30 * 60_000

/** Il ritmo del polling in partita: stretto quando si aspetta l'altro, largo quando tocca a te. */
export const BATTAGLIA_POLL_ATTESA_MS = 1_500
export const BATTAGLIA_POLL_TURNO_MS = 5_000
/** In sala d'attesa: quanto spesso si guarda chi e' online e com'e' andata la sfida. */
export const BATTAGLIA_POLL_LOBBY_MS = 3_000

/**
 * Quanto vale un invito con un link: un giorno. Il link si manda in una chat e
 * chi lo riceve magari deve ancora registrarsi, quindi non puo' durare due
 * minuti come una sfida; ma un invito dimenticato non deve aprire una partita
 * la settimana dopo.
 */
export const LINK_SCADENZA_MS = 24 * 60 * 60_000

/* ─────────────────────────  Email e verifica  ───────────────────────── */

export const EMAIL_MAX = 254
/**
 * Controllo di forma, non di esistenza.
 *
 * Volutamente permissivo: le regole vere delle email sono barocche, e l'unica
 * verifica che conta e' che il codice arrivi. Serve solo a intercettare i
 * refusi evidenti prima di sprecare un invio.
 */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/

/** Sei cifre: abbastanza da non indovinarsi, poche da ridigitarsi a memoria. */
export const CODE_LENGTH = 6
/** Quanto vale un codice. Oltre, se ne chiede un altro. */
export const CODE_TTL_MINUTES = 15
/** Tentativi sbagliati prima che il codice si bruci. */
export const CODE_MAX_ATTEMPTS = 5
/** Attesa minima fra due invii, per non trasformare il tasto in un megafono. */
export const CODE_RESEND_COOLDOWN_SECONDS = 60

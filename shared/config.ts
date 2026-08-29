/** Costanti di gioco condivise tra client e server. */

export const WORD_LENGTH = 5
export const MAX_ATTEMPTS = 6

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

/**
 * Le libere in sospeso: una partita libera lasciata a meta' resta da
 * riprendere finché non la si tocca per `SOSPESA_MS`, poi se ne va. Una per
 * gioco: quella di un gioco si riprende dalla sua pagina o dalle Libere, e
 * cominciarne un'altra dello stesso gioco chiede di lasciarla.
 */

/** Tre giorni senza aprirla, e la partita in sospeso se ne va. */
export const SOSPESA_MS = 72 * 60 * 60 * 1000

/** I giochi le cui libere restano in sospeso. Le partite con gli amici hanno la loro lista, "In corso". */
export const GIOCHI_SOSPESI = [
  'wordle',
  'cruciverba',
  'sudoku',
  'anagrammi',
  'scarabeo',
  'paroliere',
  'ghigliottina',
  'catena',
  'nomi',
  'quiz',
  'sequenze',
  'battaglia',
  'scacchi',
  'dama',
  'forza4',
  'go',
  'tris',
] as const

export type GiocoSospeso = (typeof GIOCHI_SOSPESI)[number]

/**
 * Che cosa succede a una partita in sospeso, come lo racconta il telefono al
 * server: comincia, la si riprende dopo averla lasciata, finisce giocandola,
 * la si lascia apposta, o scade.
 */
export const EVENTI_SOSPESA = ['inizio', 'ripresa', 'finita', 'annullata', 'scaduta'] as const
export type EventoSospesa = (typeof EVENTI_SOSPESA)[number]

export const eGiocoSospeso = (x: unknown): x is GiocoSospeso =>
  typeof x === 'string' && (GIOCHI_SOSPESI as readonly string[]).includes(x)

export const eEventoSospesa = (x: unknown): x is EventoSospesa =>
  typeof x === 'string' && (EVENTI_SOSPESA as readonly string[]).includes(x)

/** L'identificativo di una partita in sospeso: lo sceglie il telefono, quindi se ne guarda la forma. */
export const eIdSospesa = (x: unknown): x is string => typeof x === 'string' && /^[a-z0-9-]{8,40}$/.test(x)

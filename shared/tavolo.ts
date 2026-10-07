/**
 * I giochi a turni su un tavoliere — scacchi, dama, Forza 4, go e tris — visti da chi
 * non sa quale si sta giocando: il server che tiene le partite fra amici, la
 * sala, il telefono che gioca contro il computer.
 *
 * I due giocatori sono 0 e 1: 0 e' chi muove per primo, il Bianco negli
 * scacchi e nella dama, chi comincia nel Forza 4, il Nero nel go. Le regole
 * vere stanno nei moduli di ogni gioco; qui c'e' solo quel che serve per
 * parlarne insieme.
 */

export type GiocoTavoliere = 'scacchi' | 'dama' | 'forza4' | 'go' | 'tris'

export const GIOCHI_TAVOLIERE: readonly GiocoTavoliere[] = ['scacchi', 'dama', 'forza4', 'go', 'tris']

/**
 * I giochi delle partite a due sul tavolo del server: i tavolieri, e lo
 * Scarabeo fra amici, che ha le stesse partite — l'invito, i turni, la
 * rivincita — con le tessere di ognuno nascoste all'altro (shared/scarabeo-amici.ts).
 */
export type GiocoAlTavolo = GiocoTavoliere | 'scarabeo'

export const GIOCHI_AL_TAVOLO: readonly GiocoAlTavolo[] = [...GIOCHI_TAVOLIERE, 'scarabeo']

/** Chi muove: 0 chi comincia, 1 l'altro. */
export type Parte = 0 | 1

export type LivelloTavoliere = 'facile' | 'normale' | 'difficile'

export const LIVELLI_TAVOLIERE: readonly LivelloTavoliere[] = ['facile', 'normale', 'difficile']

/** Perché e' finita una partita: le regole di ogni gioco, e le fini che valgono per tutti. */
export type MotivoTavoliere =
  // Scacchi.
  | 'matto'
  | 'stallo'
  | 'ripetizione'
  | 'cinquanta'
  | 'materiale'
  // Dama (con la ripetizione).
  | 'bloccato'
  | 'quaranta'
  // Forza 4.
  | 'forza4'
  | 'pieno'
  // Go: si conta, e vince chi ha piu' punti.
  | 'punti'
  // Tris (con il pieno del Forza 4).
  | 'tris'
  // Scarabeo: l'ultima tessera posata a sacchetto vuoto, o sei turni senza parole.
  | 'ultima'
  | 'ferma'
  // Chi ha il tempo per mossa: lo ha lasciato passare.
  | 'tempo'
  // Tutti.
  | 'resa'
  | 'patta'
  | 'assenza'

export interface EsitoTavoliere {
  /** Chi ha vinto; null per la patta. */
  vincitore: Parte | null
  motivo: MotivoTavoliere
}

export function altraParte(p: Parte): Parte {
  return p === 0 ? 1 : 0
}

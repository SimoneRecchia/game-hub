/**
 * I giochi a turni su un tavoliere — scacchi, dama e Forza 4 — visti da chi non
 * sa quale si sta giocando: il server che tiene le partite fra amici, la sala,
 * il telefono che gioca contro il computer.
 *
 * I due giocatori sono 0 e 1: 0 e' chi muove per primo, il Bianco negli
 * scacchi e nella dama, chi comincia nel Forza 4. Le regole vere stanno nei
 * moduli di ogni gioco; qui c'e' solo quel che serve per parlarne insieme.
 */

export type GiocoTavoliere = 'scacchi' | 'dama' | 'forza4'

export const GIOCHI_TAVOLIERE: readonly GiocoTavoliere[] = ['scacchi', 'dama', 'forza4']

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

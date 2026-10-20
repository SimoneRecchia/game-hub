import type { GiocoDelTavoliere } from '@/games/tavolo/tipi'
import { GrigliaTris, SegnoTris } from './Griglia'

/**
 * Il tris come lo vedono le schermate dei tavolieri: la sala, la partita con
 * un amico, quella contro il computer, e la classificata, che usa la stessa
 * tavola senza portarsi dietro gli altri giochi (tavolo/giochi.ts li ha tutti).
 */
export const TRIS: GiocoDelTavoliere = {
  gioco: 'tris',
  nome: 'Tris',
  parti: [
    { nome: 'Croce', il: 'la croce' },
    { nome: 'Cerchio', il: 'il cerchio' },
  ],
  Tavoliere: GrigliaTris,
  // Nove caselle al piu': la griglia e' gia' la storia.
  storia: null,
  avviso: () => null,
  Segno: SegnoTris,
  sotto: null,
}

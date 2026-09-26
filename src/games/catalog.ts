import type { GameId } from '@shared/types'

export interface GameEntry {
  id: GameId | string
  name: string
  tagline: string
  /** Rotta interna; assente per i giochi non ancora disponibili. */
  path?: string
  /** Gradiente dell'icona nella card. */
  gradient: [string, string]
  /** Glifo mostrato dentro l'icona. */
  glyph: string
  available: boolean
}

/**
 * Catalogo dei giochi dell'hub. Aggiungere un gioco = aggiungere una voce
 * qui e una rotta in App.tsx.
 */
export const GAMES: GameEntry[] = [
  {
    id: 'wordle',
    name: 'Wordle',
    tagline: 'Parole italiane da cinque lettere, sei tentativi. Cinque al giorno.',
    path: '/wordle',
    gradient: ['#34c759', '#0a9d4a'],
    glyph: 'W',
    available: true,
  },
  {
    id: 'scarabeo',
    name: 'Scarabeo',
    tagline: 'Dieci mosse sul tabellone. Le stesse tessere per tutti, ogni giorno.',
    path: '/scarabeo',
    gradient: ['#f0a12c', '#c2700d'],
    glyph: 'S',
    available: true,
  },
  {
    id: 'cruciverba',
    name: 'Cruciverba',
    tagline: 'Uno schema nuovo ogni notte, con le definizioni vere del Wikizionario.',
    path: '/cruciverba',
    gradient: ['#3a7bd5', '#1f4aa8'],
    glyph: 'C',
    available: true,
  },
  {
    id: 'battaglia',
    name: 'Battaglia navale',
    tagline: 'Sfida un collega online: cinque navi a testa, un colpo per volta.',
    path: '/battaglia',
    gradient: ['#1e88a8', '#0b4f6c'],
    glyph: 'B',
    available: true,
  },
  {
    id: 'quiz',
    name: 'Quiz Lampo',
    tagline: 'Dieci domande a tempo, una sfida nuova ogni giorno.',
    gradient: ['#5856d6', '#3634a3'],
    glyph: '?',
    available: false,
  },
  {
    id: 'numeri',
    name: 'Numeri',
    tagline: 'Raggiungi il bersaglio combinando sei numeri.',
    gradient: ['#ff9500', '#d97a00'],
    glyph: '7',
    available: false,
  },
]

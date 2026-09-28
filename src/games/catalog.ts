import type { GiocoClassificato, GiocoDaTavolo } from '@shared/types'

export interface Gioco {
  id: GiocoClassificato
  nome: string
  /** Una riga, sotto il nome. */
  motto: string
  /** Cosa e' la classificata di questo gioco, in una frase. */
  classificata: string
  /** Cosa e' la libera. */
  libera: string
  /** Il nome della partita libera, come si legge su un bottone. */
  liberaBreve: string
}

/**
 * I giochi dell'app, nell'ordine in cui si mostrano.
 *
 * Il colore di ogni gioco non sta qui: sta nei token (`--wordle-1`, ...), e la
 * copertina lo prende da lì. Aggiungere un gioco = una voce qui, una copertina
 * in Copertina.tsx, le sue rotte in App.tsx.
 */
export const GIOCHI: readonly Gioco[] = [
  {
    id: 'wordle',
    nome: 'Wordle',
    motto: 'Cinque lettere, sei tentativi',
    classificata: 'Una parola al giorno, la stessa per tutti.',
    libera: 'Una parola a caso, quante ne vuoi.',
    liberaBreve: 'Parola libera',
  },
  {
    id: 'scarabeo',
    nome: 'Scarabeo',
    motto: 'Le tessere di oggi contro il computer',
    classificata: 'Dieci mosse, le stesse tessere per tutti.',
    libera: 'A turni, con tre livelli di difficoltà.',
    liberaBreve: 'Contro il computer',
  },
  {
    id: 'cruciverba',
    nome: 'Cruciverba',
    motto: 'Orizzontali e verticali',
    classificata: 'Uno schema al giorno, lo stesso per tutti.',
    libera: 'Uno schema nuovo, quando vuoi.',
    liberaBreve: 'Schema libero',
  },
  {
    id: 'sudoku',
    nome: 'Sudoku',
    motto: 'Nove righe, nove colonne, nove riquadri',
    classificata: 'Uno schema al giorno, lo stesso per tutti.',
    libera: 'Uno schema nuovo, della difficoltà che vuoi.',
    liberaBreve: 'Schema libero',
  },
  {
    id: 'battaglia',
    nome: 'Battaglia navale',
    motto: 'Cinque navi, un colpo per volta',
    classificata: 'Contro il computer, la stessa flotta per tutti.',
    libera: 'Contro il computer o contro un amico.',
    liberaBreve: 'Contro chi vuoi',
  },
  {
    id: 'quiz',
    nome: 'Quiz',
    motto: 'Capitali, bandiere, mari e cartina muta',
    classificata: 'Dieci domande al giorno, le stesse per tutti.',
    libera: 'Scegli categoria, zona e numero di domande.',
    liberaBreve: 'Quiz libero',
  },
]

export function giocoDi(id: GiocoClassificato): Gioco {
  return GIOCHI.find((g) => g.id === id)!
}

export interface GiocoTavolo {
  id: GiocoDaTavolo
  nome: string
  motto: string
  /** Contro chi: fra amici e basta, o anche contro il computer. */
  conChi: string
  /** Dove sta: il pezzo di indirizzo. */
  slug: string
}

/**
 * I giochi da tavolo: niente partita del giorno e niente classifica, solo
 * partite quando si vuole, con gli amici — e contro il computer dove ha senso.
 * Indovina chi non ce l'ha: si gioca parlandosi.
 */
export const GIOCHI_DA_TAVOLO: readonly GiocoTavolo[] = [
  {
    id: 'indovina',
    nome: 'Indovina chi',
    motto: 'Sì o no, finché resta una faccia',
    conChi: 'Con un amico',
    slug: 'indovina-chi',
  },
]

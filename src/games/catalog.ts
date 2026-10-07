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
    id: 'quiz',
    nome: 'Quiz',
    motto: 'Geografia, storia, arte, libri, cinema e scienza',
    classificata: 'Dieci domande al giorno, le stesse per tutti.',
    libera: 'Scegli materia, categoria e numero di domande.',
    liberaBreve: 'Quiz libero',
  },
  {
    id: 'nomi',
    nome: 'Nomi, cose e città',
    motto: 'Una lettera, cinque categorie',
    classificata: 'Una lettera al giorno, la stessa per tutti.',
    libera: 'Una lettera a caso, contro il computer o contro un amico.',
    liberaBreve: 'Contro chi vuoi',
  },
  {
    id: 'tris',
    nome: 'Tris',
    motto: 'Tre in fila, dieci secondi a mossa',
    classificata: 'Cinque partite contro il computer del giorno, lo stesso per tutti.',
    libera: 'Contro il computer o contro un amico.',
    liberaBreve: 'Contro chi vuoi',
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
 * Indovina chi e Lupus non ce l'hanno: si giocano parlandosi. Il tris non sta
 * qui: ha la sua classificata, e le partite da tavolo sono la sua libera. La
 * battaglia navale si': la sua classificata misurava piu' la fortuna che il gioco.
 */
export const GIOCHI_DA_TAVOLO: readonly GiocoTavolo[] = [
  {
    id: 'battaglia',
    nome: 'Battaglia navale',
    motto: 'Cinque navi, un colpo per volta',
    conChi: 'Amici o computer',
    slug: 'battaglia-navale',
  },
  {
    id: 'scacchi',
    nome: 'Scacchi',
    motto: 'Scacco matto al re dell’altro',
    conChi: 'Amici o computer',
    slug: 'scacchi',
  },
  {
    id: 'dama',
    nome: 'Dama',
    motto: 'All’italiana: si mangia per forza',
    conChi: 'Amici o computer',
    slug: 'dama',
  },
  {
    id: 'forza4',
    nome: 'Forza 4',
    motto: 'Quattro in fila, prima dell’altro',
    conChi: 'Amici o computer',
    slug: 'forza-4',
  },
  {
    id: 'go',
    nome: 'Go',
    motto: 'Circonda più territorio dell’altro',
    conChi: 'Amici o computer',
    slug: 'go',
  },
  {
    id: 'indovina',
    nome: 'Indovina chi',
    motto: 'Sì o no, finché resta una faccia',
    conChi: 'Con un amico',
    slug: 'indovina-chi',
  },
  {
    id: 'lupus',
    nome: 'Lupus',
    motto: 'Di notte i lupi, di giorno il villaggio',
    conChi: 'Con gli amici',
    slug: 'lupus',
  },
]

/** Il tris fra i tavolieri: la sua sala e' la libera della classificata, e non sta fra i giochi da tavolo. */
const TRIS_DA_TAVOLO: GiocoTavolo = {
  id: 'tris',
  nome: 'Tris',
  motto: 'Tre in fila, dieci secondi a mossa',
  conChi: 'Amici o computer',
  slug: 'tris/libera',
}

export function giocoTavoloDi(id: GiocoDaTavolo): GiocoTavolo {
  return [...GIOCHI_DA_TAVOLO, TRIS_DA_TAVOLO].find((g) => g.id === id)!
}

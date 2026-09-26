import type { GiocoClassificato } from '@shared/types'

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
    classificata: 'Una parola al giorno, la stessa per tutti. Puoi farti aiutare da un collega.',
    libera: 'Una parola a caso, quante ne vuoi.',
    liberaBreve: 'Parola libera',
  },
  {
    id: 'scarabeo',
    nome: 'Scarabeo',
    motto: 'Le tessere di oggi contro il computer',
    classificata: 'Dieci mosse con le tessere del giorno. Il computer ha giocato le stesse: battilo.',
    libera: 'Una partita a turni contro il computer, con un sacchetto nuovo.',
    liberaBreve: 'Contro il computer',
  },
  {
    id: 'cruciverba',
    nome: 'Cruciverba',
    motto: 'Definizioni vere, dal Wikizionario',
    classificata: 'Uno schema nuovo ogni notte, lo stesso per tutti.',
    libera: 'Uno schema tutto per te, dalla scorta.',
    liberaBreve: 'Schema libero',
  },
  {
    id: 'battaglia',
    nome: 'Battaglia navale',
    motto: 'Cinque navi, un colpo per volta',
    classificata: 'Contro il computer, con la sua flotta del giorno uguale per tutti.',
    libera: 'Contro il computer a tre livelli, o contro un amico.',
    liberaBreve: 'Contro chi vuoi',
  },
]

export function giocoDi(id: GiocoClassificato): Gioco {
  return GIOCHI.find((g) => g.id === id)!
}

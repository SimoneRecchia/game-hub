import type { ComponentType } from 'react'
import type { GiocoTavoliere, Parte } from '@shared/tavolo'

/**
 * Quel che ogni tavoliere — la scacchiera, la damiera, la griglia del Forza 4
 * — riceve dalla partita, che sia con un amico o contro il computer: la
 * posizione in testo, da che parte sto, se posso muovere, e dove mandare la
 * mossa, nella stessa notazione che controlla il server.
 */
export interface PropsTavoliere {
  posizione: string
  /** La mia parte: sta in basso, e i suoi pezzi sono quelli che si toccano. */
  mia: Parte
  /** Tocca a me, e la partita e' in corso. */
  attivo: boolean
  /** L'ultima mossa giocata, per segnarla e farla vedere arrivare. */
  ultima: string | null
  /** Quante mosse sono state giocate: fa ripartire l'animazione dell'ultima. */
  n: number
  /** A partita finita: il tavoliere puo' segnare perché (il quattro in fila, il re in matto). */
  finita: boolean
  onMossa: (mossa: string) => void
}

/** Una parte come si scrive: "Bianco", e con l'articolo, "il Bianco". */
export interface NomeParte {
  nome: string
  il: string
}

/** Un gioco da tavoliere, per le schermate che non sanno quale si sta giocando. */
export interface GiocoDelTavoliere {
  gioco: GiocoTavoliere
  nome: string
  /** Chi muove per primo, e l'altro. */
  parti: readonly [NomeParte, NomeParte]
  Tavoliere: ComponentType<PropsTavoliere>
  /** Le mosse come si leggono, dalla prima: "Cf3", "22x13", "colonna 4". Null se l'elenco non serve. */
  storia: ((mosse: readonly string[]) => string[]) | null
  /** Una riga su chi ha il tratto, quando c'e' qualcosa da sapere: "Scacco", "Devi prendere". */
  avviso: (posizione: string, mio: boolean) => string | null
}

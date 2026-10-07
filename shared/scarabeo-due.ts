/**
 * La partita a due dello Scarabeo: io e l'altro, il computer o un amico, a
 * turno, sullo stesso tabellone e dallo stesso sacchetto.
 *
 * Come al tavolo: si pescano otto tessere a testa, comincia il primo, e a ogni
 * turno si posa una parola, si cambiano delle tessere o si passa. La mossa `i`
 * e' del giocatore `i % 2`, e il resto — il tabellone, i leggii, i punti, di chi
 * e' il turno — si ricava dalle mosse (`leggiiDa`, `rigioca`), come in ogni
 * partita di questo gioco.
 *
 * La partita intera finisce come dice il regolamento: quando il sacchetto e'
 * vuoto e uno dei due posa la sua ultima tessera. Chi chiude prende anche il
 * valore delle tessere rimaste all'altro, e l'altro lo perde. Se nessuno puo'
 * piu' fare niente si finisce dopo sei turni di fila senza una parola, come nei
 * tornei: tre passi o cambi a testa, e ognuno perde il valore delle sue.
 *
 * La classificata invece ha dieci mosse a testa (`mosseATesta`), come una
 * giornata: due giocatori che si fermano a punti diversi non sarebbero
 * confrontabili, e un'ora di gioco non e' una pausa caffe'. Finisce li', senza
 * il conto delle tessere rimaste.
 */

import {
  JOLLY,
  MOSSE_PER_GIORNATA,
  TESSERE_TOTALI,
  VALORI,
  leggiiDa,
  rigioca,
  type Casella,
  type Mossa,
  type MossaGiocata,
} from './scarabeo'

/** Turni di fila senza una parola che chiudono una partita intera: tre a testa. */
export const TURNI_SENZA_PAROLE = 6

/**
 * Le mosse di una partita intera, al piu': ogni parola posa almeno una delle
 * centoventi tessere, e fra due parole ci stanno meno di sei turni senza.
 */
export const MOSSE_MASSIME_LIBERA = TESSERE_TOTALI * TURNI_SENZA_PAROLE

export type Lato2 = 0 | 1

export interface RegoleADue {
  /** Mosse a testa, se la partita ha un limite; null e' la partita intera, fino in fondo al sacchetto. */
  mosseATesta: number | null
}

/** La partita intera, fino in fondo al sacchetto, come al tavolo: la libera, contro il computer o un amico. */
export const PARTITA_INTERA: RegoleADue = { mosseATesta: null }

/** La classificata: dieci mosse a testa, come una giornata. */
export const PARTITA_DEL_GIORNO: RegoleADue = { mosseATesta: MOSSE_PER_GIORNATA }

/** Come e' finita una partita: le mosse a testa, l'ultima tessera posata, o sei turni senza parole. */
export type FineADue = 'mosse' | 'chiusa' | 'ferma'

export interface StatoADue {
  tabellone: (Casella | null)[]
  leggii: [string[], string[]]
  restanti: number
  /** Ogni mossa con chi l'ha fatta. */
  giocate: (MossaGiocata & { di: Lato2 })[]
  /** I punti di ognuno: a partita finita, con il conto delle tessere rimaste. */
  punti: [number, number]
  /** Il conto delle tessere rimaste, a partita finita: chi chiude prende, chi resta con le tessere perde. */
  aggiustamento: [number, number]
  /** Quante mosse ha fatto ognuno. */
  mosse: [number, number]
  /** Di chi e' il turno; null a partita finita. */
  turno: Lato2 | null
  finita: boolean
  fine: FineADue | null
  /** Chi ha vinto; null se non e' finita o se e' pari. */
  vincitore: Lato2 | null
}

/** Quanto valgono le tessere di un leggio: il jolly niente. */
export function valoreLeggio(leggio: readonly string[]): number {
  return leggio.reduce((somma, t) => somma + (t === JOLLY ? 0 : (VALORI[t] ?? 0)), 0)
}

export function statoADue(sacchetto: readonly string[], mosse: readonly Mossa[], regole: RegoleADue): StatoADue {
  const { leggii, restanti } = leggiiDa(sacchetto, mosse, 2)
  const { tabellone, giocate } = rigioca(mosse)

  const punti: [number, number] = [0, 0]
  const conAutore = giocate.map((g, i) => {
    const di = (i % 2) as Lato2
    punti[di] += g.punti
    return { ...g, di }
  })
  const fatte: [number, number] = [Math.ceil(mosse.length / 2), Math.floor(mosse.length / 2)]
  const tocca = (mosse.length % 2) as Lato2

  let fine: FineADue | null = null
  const aggiustamento: [number, number] = [0, 0]
  if (regole.mosseATesta !== null) {
    // Dieci mosse a testa, o prima se chi deve muovere non ha piu' tessere: non avrebbe niente da giocare.
    if (fatte[1] >= regole.mosseATesta || (leggii[tocca].length === 0 && restanti === 0)) fine = 'mosse'
  } else {
    const ultima = mosse.length - 1
    const chiusa = ultima >= 0 && mosse[ultima].tipo === 'posa' && restanti === 0 && leggii[ultima % 2].length === 0
    let senzaParole = 0
    for (let i = mosse.length - 1; i >= 0 && mosse[i].tipo !== 'posa'; i -= 1) senzaParole += 1
    if (chiusa) {
      fine = 'chiusa'
      const chi = (ultima % 2) as Lato2
      const altro = (1 - chi) as Lato2
      const resto = valoreLeggio(leggii[altro])
      aggiustamento[chi] = resto
      aggiustamento[altro] = -resto
    } else if (senzaParole >= TURNI_SENZA_PAROLE) {
      fine = 'ferma'
      aggiustamento[0] = -valoreLeggio(leggii[0])
      aggiustamento[1] = -valoreLeggio(leggii[1])
    }
  }

  const finita = fine !== null
  if (finita) {
    punti[0] += aggiustamento[0]
    punti[1] += aggiustamento[1]
  }

  return {
    tabellone,
    leggii: [leggii[0], leggii[1]],
    restanti,
    giocate: conAutore,
    punti,
    aggiustamento,
    mosse: fatte,
    turno: finita ? null : tocca,
    finita,
    fine,
    vincitore: !finita || punti[0] === punti[1] ? null : punti[0] > punti[1] ? 0 : 1,
  }
}

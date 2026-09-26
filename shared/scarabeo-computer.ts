/**
 * Il computer dello Scarabeo: le sue mosse, e le partite che lo vedono giocare.
 *
 * Due usi, con le stesse regole:
 *
 *  - la **partita libera**, a turni contro di lui, con un sacchetto a caso;
 *  - il **riferimento della classificata**: il computer normale gioca da solo
 *    le dieci mosse del giorno, sulle stesse tessere di tutti, e il suo
 *    punteggio e' la misura dei punti in classifica. Lo calcola uno script la
 *    notte (scripts/genera-par-scarabeo.ts), perché il Worker non ha la CPU per
 *    farlo e il browser non e' un posto di cui fidarsi per un numero che
 *    decide la classifica.
 *
 * Tutto e' deterministico dal seme: la stessa partita, rigiocata, fa le stesse
 * mosse. E' quel che permette di salvare solo le mosse, come nella classificata.
 */

import type { Dawg } from './dawg'
import { mulberry32 } from './daily'
import {
  LATO,
  MOSSE_PER_GIORNATA,
  leggiiDa,
  rigioca,
  tabelloneDa,
  type Mossa,
  type MossaGiocata,
} from './scarabeo'
import { mosseLegali, sceltaDelComputer, type Livello } from './scarabeo-motore'

export type { Livello } from './scarabeo-motore'

/** Mosse a testa in una partita libera: le stesse dieci della giornata, per non cambiare misura. */
export const MOSSE_A_TESTA = MOSSE_PER_GIORNATA

export const LIVELLI: readonly Livello[] = ['facile', 'normale', 'difficile']

/** Il generatore del computer per la mossa numero `indice`: dipende solo dal seme e dal turno. */
function casoDelTurno(seme: number, indice: number): () => number {
  return mulberry32((seme ^ Math.imul(indice + 1, 0x9e37_79b1)) >>> 0)
}

/**
 * La mossa del computer con questo leggio.
 *
 * Senza pose possibili cambia tutte le tessere, se il sacchetto ne ha; se no
 * passa. Non cambia mai per strategia: un computer che butta via un leggio
 * mediocre per cercarne uno migliore gioca meglio, ma sembra che si arrenda.
 */
export function mossaDelComputer(
  dawg: Dawg,
  mosse: readonly Mossa[],
  leggio: readonly string[],
  restanti: number,
  livello: Livello,
  caso: () => number,
): Mossa {
  const tab = tabelloneDa(mosse)
  const primaMossa = !mosse.some((m) => m.tipo === 'posa')
  const scelta = sceltaDelComputer(mosseLegali(dawg, tab, leggio, primaMossa), livello, caso)
  if (scelta) return { tipo: 'posa', posa: scelta.posa }
  if (restanti > 0 && leggio.length > 0) return { tipo: 'cambio', tessere: [...leggio] }
  return { tipo: 'passo' }
}

/**
 * Il computer che gioca da solo la giornata: le dieci mosse della classificata,
 * sul sacchetto dato.
 */
export function giornataDelComputer(
  dawg: Dawg,
  sacchetto: readonly string[],
  livello: Livello,
  seme: number,
): { mosse: Mossa[]; punti: number } {
  const mosse: Mossa[] = []
  for (let i = 0; i < MOSSE_PER_GIORNATA; i += 1) {
    const { leggii, restanti } = leggiiDa(sacchetto, mosse, 1)
    mosse.push(mossaDelComputer(dawg, mosse, leggii[0], restanti, livello, casoDelTurno(seme, i)))
  }
  return { mosse, punti: rigioca(mosse).punti }
}

/* ────────────────────────  La partita libera  ─────────────────────── */

/**
 * Una partita libera contro il computer.
 *
 * Si salvano il seme del sacchetto, il livello e le mosse di tutti e due,
 * alternate: le pari sono di chi gioca, le dispari del computer. Il resto —
 * tabellone, leggii, punti, di chi e' il turno — si ricava da qui.
 */
export interface PartitaLibera {
  seme: number
  livello: Livello
  mosse: Mossa[]
}

export interface StatoLibera {
  tabellone: ReturnType<typeof tabelloneDa>
  mioLeggio: string[]
  leggioComputer: string[]
  restanti: number
  /** Ogni mossa con il suo autore. */
  giocate: (MossaGiocata & { mia: boolean })[]
  mieiPunti: number
  puntiComputer: number
  mieMosse: number
  mosseComputer: number
  /** Di chi e' il turno; null a partita finita. */
  turno: 'io' | 'computer' | null
  finita: boolean
  esito: 'vinta' | 'persa' | 'pari' | null
}

export function statoLibera(partita: PartitaLibera, sacchetto: readonly string[]): StatoLibera {
  const { leggii, restanti } = leggiiDa(sacchetto, partita.mosse, 2)
  const { tabellone, giocate } = rigioca(partita.mosse)

  let mieiPunti = 0
  let puntiComputer = 0
  const conAutore = giocate.map((g, i) => {
    const mia = i % 2 === 0
    if (mia) mieiPunti += g.punti
    else puntiComputer += g.punti
    return { ...g, mia }
  })

  const mieMosse = Math.ceil(partita.mosse.length / 2)
  const mosseComputer = Math.floor(partita.mosse.length / 2)
  const tocca: 'io' | 'computer' = partita.mosse.length % 2 === 0 ? 'io' : 'computer'
  const leggioDiTurno = leggii[tocca === 'io' ? 0 : 1]

  /*
   * Finisce dopo dieci mosse a testa, oppure prima se chi deve muovere non ha
   * piu' tessere e il sacchetto e' vuoto: non avrebbe niente da giocare.
   */
  const finita =
    mosseComputer >= MOSSE_A_TESTA || (leggioDiTurno.length === 0 && restanti === 0)

  return {
    tabellone,
    mioLeggio: leggii[0],
    leggioComputer: leggii[1],
    restanti,
    giocate: conAutore,
    mieiPunti,
    puntiComputer,
    mieMosse,
    mosseComputer,
    turno: finita ? null : tocca,
    finita,
    esito: !finita
      ? null
      : mieiPunti > puntiComputer
        ? 'vinta'
        : mieiPunti < puntiComputer
          ? 'persa'
          : 'pari',
  }
}

/** La prossima mossa del computer in una partita libera, se tocca a lui. */
export function turnoDelComputer(
  dawg: Dawg,
  partita: PartitaLibera,
  sacchetto: readonly string[],
): Mossa | null {
  const stato = statoLibera(partita, sacchetto)
  if (stato.turno !== 'computer') return null
  return mossaDelComputer(
    dawg,
    partita.mosse,
    stato.leggioComputer,
    stato.restanti,
    partita.livello,
    casoDelTurno(partita.seme, partita.mosse.length),
  )
}

/** Le caselle occupate da una mossa: per evidenziare l'ultima del computer. */
export function caselleDi(mossa: Mossa): number[] {
  return mossa.tipo === 'posa' ? mossa.posa.map((p) => p.r * LATO + p.c) : []
}

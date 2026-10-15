/**
 * Il computer dello Scarabeo: le sue mosse, e le partite che lo vedono giocare.
 *
 * Tre usi, con le stesse regole:
 *
 *  - la **partita libera**, a turni contro di lui, con un sacchetto a caso,
 *    fino in fondo come al tavolo;
 *  - la **classificata**, a turni contro il computer del giorno: cinque mosse a
 *    testa con i leggii gemelli del giorno (shared/scarabeo-gemelli.ts), e il
 *    computer normale con un caso fisso dal
 *    numero del giorno (`semeDellAvversario`), quindi a mosse uguali risponde
 *    uguale. Gira nel telefono, perché cercare una mossa costa decine di
 *    millisecondi e il Worker ne ha dieci; il server controlla che le sue
 *    mosse siano legali;
 *  - il **traguardo della classificata**: la stessa partita, con il computer
 *    normale al posto di chi gioca (`giornataATurni`), e il suo punteggio e' la
 *    misura dei punti in classifica. Lo calcola uno script la notte
 *    (scripts/genera-computer-scarabeo.ts), perché il browser non e' un posto
 *    di cui fidarsi per un numero che decide la classifica.
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
  sacchettoDelGiorno,
  tabelloneDa,
  type Mossa,
  type MossaGiocata,
} from './scarabeo'
import { PARTITA_INTERA, regoleDellaGiornata, statoADue, type FineADue, type RegoleADue } from './scarabeo-due'
import { mosseLegali, sceltaDelComputer, type Livello } from './scarabeo-motore'

export type { Livello } from './scarabeo-motore'

export { PARTITA_DEL_GIORNO, PARTITA_INTERA, regoleDellaGiornata } from './scarabeo-due'

/** Il livello del computer della classificata: quello del traguardo. */
export const LIVELLO_DEL_GIORNO: Livello = 'normale'

/**
 * Come e' giocato il traguardo di una giornata: 1 da solo, le dieci mosse
 * senza avversario, come le prime giornate; 2 a turni contro il computer del
 * giorno, dieci mosse a testa dal sacchetto; 3 a turni con i leggii gemelli,
 * cinque mosse a testa e il computer che gioca solo le parole note. La
 * giornata si gioca come il suo traguardo (`contro_computer`, che e' il
 * formato meno uno).
 */
export const FORMATO_TRAGUARDO = 3

export const LIVELLI: readonly Livello[] = ['facile', 'normale', 'difficile']

/** Il generatore del computer per la mossa numero `indice`: dipende solo dal seme e dal turno. */
function casoDelTurno(seme: number, indice: number): () => number {
  return mulberry32((seme ^ Math.imul(indice + 1, 0x9e37_79b1)) >>> 0)
}

/** Il caso del computer del giorno, l'avversario della classificata: dal numero del giorno, diverso dal sacchetto. */
export function semeDellAvversario(puzzleNumber: number): number {
  return (0x6c0d_1e57 ^ Math.imul(puzzleNumber, 0x85eb_ca6b)) >>> 0
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
 * Una partita a turni contro il computer.
 *
 * Si salvano il seme del sacchetto, il livello e le mosse di tutti e due,
 * alternate: le pari sono di chi gioca, le dispari del computer. Il resto —
 * tabellone, leggii, punti, di chi e' il turno — si ricava da qui
 * (`statoADue` in scarabeo-due.ts). E' la libera, fino in fondo al sacchetto,
 * e con le regole della giornata anche la classificata.
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
  /** I punti, a partita finita con il conto delle tessere rimaste. */
  mieiPunti: number
  puntiComputer: number
  /** Il conto delle tessere rimaste, a partita finita. */
  aggiustamento: { mio: number; computer: number }
  mieMosse: number
  mosseComputer: number
  /** Di chi e' il turno; null a partita finita. */
  turno: 'io' | 'computer' | null
  finita: boolean
  fine: FineADue | null
  esito: 'vinta' | 'persa' | 'pari' | null
}

export function statoLibera(
  partita: PartitaLibera,
  sacchetto: readonly string[],
  regole: RegoleADue = PARTITA_INTERA,
): StatoLibera {
  const s = statoADue(sacchetto, partita.mosse, regole)
  return {
    tabellone: s.tabellone,
    mioLeggio: s.leggii[0],
    leggioComputer: s.leggii[1],
    restanti: s.restanti,
    giocate: s.giocate.map(({ di, ...g }) => ({ ...g, mia: di === 0 })),
    mieiPunti: s.punti[0],
    puntiComputer: s.punti[1],
    aggiustamento: { mio: s.aggiustamento[0], computer: s.aggiustamento[1] },
    mieMosse: s.mosse[0],
    mosseComputer: s.mosse[1],
    turno: s.turno === null ? null : s.turno === 0 ? 'io' : 'computer',
    finita: s.finita,
    fine: s.fine,
    esito: !s.finita ? null : s.vincitore === null ? 'pari' : s.vincitore === 0 ? 'vinta' : 'persa',
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

/**
 * La risposta del computer del giorno, nella classificata: dopo le mosse
 * `mosse`, che finiscono con una mia. Il server non la rifa' — costerebbe
 * troppo — ma lo stesso computer, sulle stesse mosse, risponde sempre uguale.
 * `formato` e' quello della giornata (`FORMATO_TRAGUARDO`).
 */
export function rispostaDelGiorno(
  dawg: Dawg,
  puzzleNumber: number,
  mosse: readonly Mossa[],
  formato: number = FORMATO_TRAGUARDO,
): Mossa | null {
  const partita: PartitaLibera = { seme: 0, livello: LIVELLO_DEL_GIORNO, mosse: [...mosse] }
  const stato = statoLibera(partita, sacchettoDelGiorno(puzzleNumber), regoleDellaGiornata(formato, puzzleNumber))
  if (stato.turno !== 'computer') return null
  return mossaDelComputer(
    dawg,
    mosse,
    stato.leggioComputer,
    stato.restanti,
    LIVELLO_DEL_GIORNO,
    casoDelTurno(semeDellAvversario(puzzleNumber), mosse.length),
  )
}

/**
 * La partita del traguardo: il computer normale al posto di chi gioca, con il
 * suo caso (`seme`), contro il computer del giorno. E' la stessa partita che
 * trova chi gioca — le stesse tessere, lo stesso avversario — e i suoi punti
 * (`punti`) sono la misura della classificata.
 */
export function giornataATurni(
  dawg: Dawg,
  puzzleNumber: number,
  seme: number,
  formato: number = FORMATO_TRAGUARDO,
): { mosse: Mossa[]; punti: number; avversario: number } {
  const sacchetto = sacchettoDelGiorno(puzzleNumber)
  const regole = regoleDellaGiornata(formato, puzzleNumber)
  const mosse: Mossa[] = []
  for (;;) {
    const s = statoADue(sacchetto, mosse, regole)
    if (s.turno === null) return { mosse, punti: s.punti[0], avversario: s.punti[1] }
    mosse.push(
      s.turno === 0
        ? mossaDelComputer(dawg, mosse, s.leggii[0], s.restanti, LIVELLO_DEL_GIORNO, casoDelTurno(seme, mosse.length))
        : rispostaDelGiorno(dawg, puzzleNumber, mosse, formato)!,
    )
  }
}

/** Le caselle occupate da una mossa: per evidenziare l'ultima del computer. */
export function caselleDi(mossa: Mossa): number[] {
  return mossa.tipo === 'posa' ? mossa.posa.map((p) => p.r * LATO + p.c) : []
}

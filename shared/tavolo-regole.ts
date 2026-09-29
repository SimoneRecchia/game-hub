/**
 * Le regole dei tre giochi da tavoliere dietro una faccia sola, per chi le
 * applica senza sapere a cosa si gioca: il server, che controlla ogni mossa
 * delle partite fra amici, e il telefono, che gioca contro il computer.
 *
 * Tutto passa in testo: la posizione come la salva ogni gioco (il FEN negli
 * scacchi), la mossa nella sua notazione piu' semplice da controllare — "e2e4"
 * negli scacchi, "22x13x6" nella dama, la colonna nel Forza 4. La notazione da
 * leggere ("Cf3", "22x13") la scrive l'interfaccia.
 *
 * Qui non entra il computer: i moduli che cercano le mosse sono grandi, e il
 * server non li deve portare con se'.
 */

import * as dama from './dama'
import * as forza4 from './forza4'
import * as scacchi from './scacchi'
import type { EsitoTavoliere, GiocoTavoliere, Parte } from './tavolo'

export interface RegoleTavoliere {
  /** La posizione di partenza, in testo. */
  iniziale: string
  /** Chi ha il tratto, o null se il testo non e' una posizione valida. */
  tratto(posizione: string): Parte | null
  /**
   * La posizione dopo la mossa, o null se la mossa non e' legale. `irreversibile`
   * dice se da qui le posizioni di prima non possono piu' tornare (una presa, la
   * mossa di un pedone o di una pedina): allora la storia delle ripetizioni
   * ricomincia. `mossa` e' la mossa scritta come la scrive il gioco, che e' quella
   * da salvare: la dama accetta anche "22x6" per "22x13x6".
   */
  gioca(posizione: string, mossa: string): { posizione: string; irreversibile: boolean; mossa: string } | null
  /** La chiave della posizione per le ripetizioni: due posizioni uguali per le regole hanno la stessa. */
  chiave(posizione: string): string
  /** A partita finita chi ha vinto e perché; null se si gioca ancora. */
  esito(posizione: string, chiaviPrecedenti: readonly string[]): EsitoTavoliere | null
  /** Si puo' proporre la patta: negli scacchi e nella dama si', nel Forza 4 non ha senso. */
  patta: boolean
}

const REGOLE_FORZA4: RegoleTavoliere = {
  iniziale: forza4.scrivi(forza4.posizioneIniziale()),
  tratto: (posizione) => forza4.leggi(posizione)?.tratto ?? null,
  gioca(posizione, mossa) {
    const p = forza4.leggi(posizione)
    if (!p || !/^[0-6]$/.test(mossa)) return null
    const dopo = forza4.gioca(p, Number(mossa))
    // Nel Forza 4 una posizione non torna mai: ogni disco resta dov'e'.
    return dopo ? { posizione: forza4.scrivi(dopo), irreversibile: true, mossa } : null
  },
  chiave: (posizione) => posizione,
  esito(posizione) {
    const p = forza4.leggi(posizione)
    const fine = p ? forza4.esito(p) : null
    return fine ? { vincitore: fine.vincitore, motivo: fine.fine } : null
  },
  patta: false,
}

/**
 * Gli scacchi: la posizione e' il FEN, la mossa l'UCI ("e2e4", "e7e8q"). Una
 * presa o una mossa di pedone azzerano il contatore delle cinquanta mosse, e da
 * li' nessuna posizione di prima puo' tornare: le chiavi ricominciano.
 */
const REGOLE_SCACCHI: RegoleTavoliere = {
  iniziale: scacchi.FEN_INIZIALE,
  tratto(posizione) {
    const p = scacchi.daFen(posizione)
    return p ? (p.tratto === 'w' ? 0 : 1) : null
  },
  gioca(posizione, mossa) {
    const p = scacchi.daFen(posizione)
    const m = p && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(mossa) ? scacchi.mossaDaUci(p, mossa) : null
    if (!p || !m) return null
    const dopo = scacchi.gioca(p, m)
    return { posizione: scacchi.inFen(dopo), irreversibile: dopo.semimosse === 0, mossa: scacchi.uci(m) }
  },
  chiave(posizione) {
    const p = scacchi.daFen(posizione)
    return p ? scacchi.chiaveRipetizione(p) : posizione
  },
  esito(posizione, chiaviPrecedenti) {
    const p = scacchi.daFen(posizione)
    const fine = p ? scacchi.esito(p, chiaviPrecedenti) : null
    if (!fine) return null
    return { vincitore: fine.vincitore === null ? null : fine.vincitore === 'w' ? 0 : 1, motivo: fine.fine }
  },
  patta: true,
}

/**
 * La dama italiana: la posizione e' il testo delle 32 caselle, la mossa la
 * notazione con tutte le caselle toccate ("22-18", "22x13x6"). Una presa o una
 * mossa di pedina azzerano il conteggio delle quaranta mosse, e come negli
 * scacchi le posizioni di prima non tornano piu'.
 */
const REGOLE_DAMA: RegoleTavoliere = {
  iniziale: dama.scrivi(dama.posizioneIniziale()),
  tratto(posizione) {
    const p = dama.leggi(posizione)
    return p ? (p.tratto === 'bianco' ? 0 : 1) : null
  },
  gioca(posizione, mossa) {
    const p = dama.leggi(posizione)
    const m = p && /^\d{1,2}(?:[-x]\d{1,2})+$/.test(mossa) ? dama.mossaDaNotazione(p, mossa) : null
    if (!p || !m) return null
    const dopo = dama.gioca(p, m)
    return { posizione: dama.scrivi(dopo), irreversibile: dopo.senzaProgresso === 0, mossa: dama.notazione(m) }
  },
  chiave(posizione) {
    const p = dama.leggi(posizione)
    return p ? dama.chiaveRipetizione(p) : posizione
  },
  esito(posizione, chiaviPrecedenti) {
    const p = dama.leggi(posizione)
    const fine = p ? dama.esito(p, chiaviPrecedenti) : null
    if (!fine) return null
    return { vincitore: fine.vincitore === null ? null : fine.vincitore === 'bianco' ? 0 : 1, motivo: fine.fine }
  },
  patta: true,
}

const REGOLE: Record<GiocoTavoliere, RegoleTavoliere> = {
  scacchi: REGOLE_SCACCHI,
  dama: REGOLE_DAMA,
  forza4: REGOLE_FORZA4,
}

export function regoleDi(gioco: GiocoTavoliere): RegoleTavoliere {
  return REGOLE[gioco]
}

/**
 * Una mossa giocata sulla posizione: la mossa come la scrive il gioco, la
 * posizione nuova, le chiavi delle posizioni passate da tenere per le
 * ripetizioni, e l'esito se la partita e' finita. Null se la mossa non e'
 * legale o se non tocca a chi la fa.
 */
export function giocaMossa(
  regole: RegoleTavoliere,
  posizione: string,
  chiavi: readonly string[],
  mossa: string,
  chi: Parte,
): { mossa: string; posizione: string; chiavi: string[]; esito: EsitoTavoliere | null } | null {
  if (regole.tratto(posizione) !== chi) return null
  if (regole.esito(posizione, chiavi)) return null
  const dopo = regole.gioca(posizione, mossa)
  if (!dopo) return null
  const precedenti = dopo.irreversibile ? [] : [...chiavi, regole.chiave(posizione)]
  return {
    mossa: dopo.mossa,
    posizione: dopo.posizione,
    chiavi: precedenti,
    esito: regole.esito(dopo.posizione, precedenti),
  }
}

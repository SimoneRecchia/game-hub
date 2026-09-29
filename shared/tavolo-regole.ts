/**
 * Le regole dei tre giochi da tavoliere dietro una faccia sola, per chi le
 * applica senza sapere a cosa si gioca: il server, che controlla ogni mossa
 * delle partite fra amici, e il telefono, che gioca contro il computer.
 *
 * Tutto passa in testo: la posizione come la salva ogni gioco (il FEN negli
 * scacchi), la mossa nella sua notazione piu' semplice da controllare — "e2e4"
 * negli scacchi, "22x13x6" nella dama, la colonna nel Forza 4, "D4" o "passo"
 * nel go. La notazione da leggere ("Cf3", "22x13") la scrive l'interfaccia.
 *
 * Qui non entra il computer: i moduli che cercano le mosse sono grandi, e il
 * server non li deve portare con se'.
 */

import * as dama from './dama'
import * as forza4 from './forza4'
import * as go from './go'
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
  /** Si puo' proporre la patta: negli scacchi e nella dama si', nel Forza 4 e nel go non ha senso. */
  patta: boolean
  /**
   * Le varianti del gioco, quando ne ha: i lati del goban. La prima e' quella
   * di `iniziale`; `inizialeDi` da' la partenza delle altre, e `varianteDi` dice
   * di quale variante e' una posizione (per la rivincita, per gli inviti).
   */
  varianti?: readonly string[]
  inizialeDi?(variante: string): string | null
  varianteDi?(posizione: string): string | null
  /** Il gioco si e' fermato per contare, e le mosse non valgono piu': nel go, dopo due passi. */
  conteggio?(posizione: string): boolean
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

/**
 * Il go: la posizione e' il testo del goban (con il lato, il ko e i passi), la
 * mossa il punto ("D4") o "passo". Due passi di seguito non chiudono la
 * partita: la fermano, e si contano i punti con le pietre morte che i due
 * giocatori segnano (`conteggio`); la ripetizione lunga e' patta. Nel go ogni
 * posizione puo' tornare dopo una cattura, quindi le chiavi si tengono tutte:
 * sono impronte corte, e una partita a 19 ne ha qualche centinaio.
 */
const REGOLE_GO: RegoleTavoliere = {
  iniziale: go.scrivi(go.posizioneIniziale(9)),
  tratto(posizione) {
    const p = go.leggi(posizione)
    return p ? (p.tratto === 'nero' ? 0 : 1) : null
  },
  gioca(posizione, mossa) {
    const p = go.leggi(posizione)
    const m = p && /^(?:[A-HJ-T](?:[1-9]|1\d)|passo)$/.test(mossa) ? go.mossaDaTesto(p, mossa) : null
    if (!p || !m) return null
    return { posizione: go.scrivi(go.gioca(p, m)), irreversibile: false, mossa: go.testoMossa(m, p.lato) }
  },
  chiave(posizione) {
    const p = go.leggi(posizione)
    return p ? go.chiaveRipetizione(p) : posizione
  },
  esito(posizione, chiaviPrecedenti) {
    const p = go.leggi(posizione)
    // Due passi fermano il gioco ma non lo chiudono: il risultato lo dice il conteggio.
    return p && go.esito(p, chiaviPrecedenti) === 'ripetizione' ? { vincitore: null, motivo: 'ripetizione' } : null
  },
  patta: false,
  varianti: go.LATI.map(String),
  inizialeDi(variante) {
    const lato = Number(variante)
    return go.LATI.includes(lato) ? go.scrivi(go.posizioneIniziale(lato)) : null
  },
  varianteDi(posizione) {
    const p = go.leggi(posizione)
    return p ? String(p.lato) : null
  },
  conteggio(posizione) {
    const p = go.leggi(posizione)
    return p !== null && p.passi >= 2
  },
}

const REGOLE: Record<GiocoTavoliere, RegoleTavoliere> = {
  scacchi: REGOLE_SCACCHI,
  dama: REGOLE_DAMA,
  forza4: REGOLE_FORZA4,
  go: REGOLE_GO,
}

/** La posizione di partenza di una partita nuova: quella di una variante, se c'e' e il gioco la conosce. */
export function inizialeDi(regole: RegoleTavoliere, variante: string | null | undefined): string {
  return (variante && regole.inizialeDi?.(variante)) || regole.iniziale
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

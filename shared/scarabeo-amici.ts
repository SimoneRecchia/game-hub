/**
 * Lo Scarabeo fra amici, sul tavolo del server dei giochi a due
 * (shared/tavolo-regole.ts): la partita intera, a turno, da un sacchetto
 * mescolato a caso per ogni partita.
 *
 * Al contrario dei tavolieri la posizione non e' tutta in vista: ognuno vede il
 * suo leggio e non quello dell'altro, e nessuno il seme del sacchetto, che
 * direbbe le tessere che verranno. La posizione intera — il seme e le mosse —
 * resta sul server, e a ognuno dei due arriva la sua vista (`vistaScarabeo`),
 * con i cambi dell'altro senza le tessere, come al tavolo.
 *
 * Le mosse viaggiano in testo, come quelle dei tavolieri: "passo", "cambio:ae*"
 * con le tessere cambiate (`*` il jolly), e la posa casella per casella, "7.5.c
 * 7.6.a 7.7.S", con la lettera maiuscola per un jolly che la fa.
 */

import {
  JOLLY,
  TESSERE_LEGGIO,
  leggiiDa,
  sacchettoDaSeme,
  tabelloneDa,
  validaPosa,
  type Mossa,
  type Posa,
} from './scarabeo'
import { PARTITA_INTERA, statoADue, type FineADue } from './scarabeo-due'
import type { EsitoTavoliere, Parte } from './tavolo'

/** La posizione salvata sul server: il seme del sacchetto e le mosse dei due, a turno. */
export interface PosizioneScarabeo {
  seme: number
  mosse: Mossa[]
}

/** La notazione piu' lunga di una mossa: otto tessere "14.14.a" con gli spazi in mezzo. */
export const MOSSA_SCARABEO_MASSIMA = TESSERE_LEGGIO * 8

export function scriviPosizione(p: PosizioneScarabeo): string {
  return JSON.stringify({ s: p.seme, m: p.mosse.map(mossaInTesto) })
}

export function leggiPosizione(testo: string): PosizioneScarabeo | null {
  try {
    const valore = JSON.parse(testo) as { s?: unknown; m?: unknown }
    const seme = Number(valore.s)
    if (!Number.isInteger(seme) || seme < 0 || seme > 0xffff_ffff || !Array.isArray(valore.m)) return null
    const mosse = valore.m.map((m) => (typeof m === 'string' ? mossaDaTesto(m) : null))
    return mosse.every((m): m is Mossa => m !== null) ? { seme, mosse } : null
  } catch {
    return null
  }
}

export function mossaInTesto(m: Mossa): string {
  if (m.tipo === 'passo') return 'passo'
  if (m.tipo === 'cambio') return `cambio:${m.tessere.join('')}`
  return m.posa.map((p) => `${p.r}.${p.c}.${p.jolly ? p.lettera.toUpperCase() : p.lettera}`).join(' ')
}

const POSA = /^\d{1,2}\.\d{1,2}\.[a-zA-Z](?: \d{1,2}\.\d{1,2}\.[a-zA-Z]){0,7}$/
const CAMBIO = /^cambio:[a-z*]{1,8}$/

export function mossaDaTesto(testo: string): Mossa | null {
  if (testo === 'passo') return { tipo: 'passo' }
  if (CAMBIO.test(testo)) return { tipo: 'cambio', tessere: [...testo.slice('cambio:'.length)] }
  if (!POSA.test(testo)) return null
  const posa: Posa[] = testo.split(' ').map((t) => {
    const [r, c, l] = t.split('.')
    return { r: Number(r), c: Number(c), lettera: l.toLowerCase(), jolly: l !== l.toLowerCase() }
  })
  return { tipo: 'posa', posa }
}

/** Le tessere di una mossa sono tutte sul leggio? Un jolly conta come jolly, non come la lettera che fa. */
function sulLeggio(leggio: readonly string[], tessere: readonly string[]): boolean {
  const mano = [...leggio]
  return tessere.every((t) => {
    const i = mano.indexOf(t)
    if (i >= 0) mano.splice(i, 1)
    return i >= 0
  })
}

/**
 * La mossa giocata da chi ha il tratto, se e' legale: le tessere sul suo leggio,
 * la posa in piedi sul tabellone, il cambio con il sacchetto che ne ha. Le
 * parole le controlla chi chiama, con il dizionario (`paroleDi`).
 */
export function giocaScarabeo(p: PosizioneScarabeo, mossa: Mossa): PosizioneScarabeo | null {
  const sacchetto = sacchettoDaSeme(p.seme)
  if (statoADue(sacchetto, p.mosse, PARTITA_INTERA).finita) return null
  const { leggii, restanti } = leggiiDa(sacchetto, p.mosse, 2, PARTITA_INTERA.qConU)
  const leggio = leggii[p.mosse.length % 2]
  if (mossa.tipo === 'cambio') {
    if (restanti === 0 || mossa.tessere.length === 0 || !sulLeggio(leggio, mossa.tessere)) return null
  } else if (mossa.tipo === 'posa') {
    if (!sulLeggio(leggio, mossa.posa.map((t) => (t.jolly ? JOLLY : t.lettera)))) return null
    if (!validaPosa(tabelloneDa(p.mosse), mossa.posa, !p.mosse.some((m) => m.tipo === 'posa')).ok) return null
  }
  return { seme: p.seme, mosse: [...p.mosse, mossa] }
}

/** Le parole che forma una posa, da cercare nel dizionario prima di accettarla. */
export function paroleDi(p: PosizioneScarabeo, mossa: Mossa): string[] {
  if (mossa.tipo !== 'posa') return []
  const esito = validaPosa(tabelloneDa(p.mosse), mossa.posa, !p.mosse.some((m) => m.tipo === 'posa'))
  return esito.ok ? esito.parole.map((x) => x.parola) : []
}

/** A partita finita chi ha vinto e perché: l'ultima tessera posata, o sei turni senza parole. */
export function esitoScarabeo(p: PosizioneScarabeo): EsitoTavoliere | null {
  const s = statoADue(sacchettoDaSeme(p.seme), p.mosse, PARTITA_INTERA)
  if (!s.finita) return null
  return { vincitore: s.vincitore, motivo: s.fine === 'chiusa' ? 'ultima' : 'ferma' }
}

/** Quel che vede uno dei due: le mosse, il suo leggio, i punti. Chi guarda un invito non vede leggii. */
export interface VistaScarabeo {
  /** Le mosse dei due, a turno, la prima di chi comincia: i cambi dell'altro senza le tessere. */
  mosse: Mossa[]
  leggio: string[]
  /** Quante tessere ha l'altro sul leggio. */
  tessereAltro: number
  restanti: number
  /** I punti, i miei e quelli dell'altro: a partita finita, con il conto delle tessere rimaste. */
  punti: { io: number; altro: number }
  /** Il conto delle tessere rimaste, a partita finita. */
  aggiustamento: { io: number; altro: number }
  fine: FineADue | null
  /** A partita finita, le tessere che restavano all'altro. */
  leggioAltro: string[] | null
}

export function vistaScarabeo(p: PosizioneScarabeo, parte: Parte | null): VistaScarabeo {
  const s = statoADue(sacchettoDaSeme(p.seme), p.mosse, PARTITA_INTERA)
  const io = parte ?? 0
  const altro = (1 - io) as Parte
  return {
    mosse: p.mosse.map((m, i) => (m.tipo === 'cambio' && i % 2 !== io ? { tipo: 'cambio', tessere: [] } : m)),
    leggio: parte === null ? [] : s.leggii[io],
    tessereAltro: s.leggii[altro].length,
    restanti: s.restanti,
    punti: { io: s.punti[io], altro: s.punti[altro] },
    aggiustamento: { io: s.aggiustamento[io], altro: s.aggiustamento[altro] },
    fine: s.fine,
    leggioAltro: s.finita && parte !== null ? s.leggii[altro] : null,
  }
}

/** Un seme a caso per il sacchetto di una partita nuova, dal generatore del sistema. */
export function semeACaso(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]
}

/**
 * La Ghigliottina libera lasciata a meta': che cosa si salva nel telefono, e
 * come la si rimette in piedi.
 *
 * Si salva il meno possibile: quale ghigliottina del file (la soluzione), il
 * seme che ne ha disposto le coppie, le scelte fatte, i tempi scelti e quanto
 * mancava al tempo di adesso. Il resto viene dal file, come nella partita
 * giocata. Il tempo si salva come quel che resta, non come l'ora della
 * scadenza: lasciata, la partita e' ferma, e riprende da dov'era.
 */

import { ROTTE } from '@/app/rotte'
import {
  COPPIE_GHIGLIOTTINA,
  disponiGhigliottina,
  type GhigliottinaDellElenco,
  type SceltaGhigliottina,
} from '@shared/ghigliottina'
import { mulberry32 } from '@shared/daily'
import type { PartitaGhigliottinaLibera } from './useGhigliottinaLibera'

export const CHIAVE_PARTITA = 'giochi.ghigliottina.libera.partita'

/** Dove si riprende: la pagina della libera, che con `riprendi` la riapre senza passare dalle opzioni. */
export const RIPRENDI = `${ROTTE.libera('ghigliottina')}?riprendi`

/** Riaperta, la coppia di adesso aspetta un attimo prima che il suo tempo riparta: il tempo di rivederla. */
export const PREAMBOLO_RIPRESA_MS = 1_000

export interface GhigliottinaSalvata {
  v: 1
  /** La soluzione: dice quale ghigliottina del file. */
  s: string
  /** Il seme che ha disposto le coppie, e da che parte sta la giusta. */
  seme: number
  tempoSceltaMs: number
  tempoFinaleMs: number
  scelte: SceltaGhigliottina[]
  /** E' partito il tempo della parola vincente. */
  finale: boolean
  /** Quanto mancava al tempo di adesso, della coppia o della parola vincente; null se non era partito. */
  resta: number | null
}

/** La partita come la si salva, o null se non c'e' niente da salvare: non e' cominciata, e' finita, o e' una sfida. */
export function daSalvare(p: PartitaGhigliottinaLibera, ora: number): GhigliottinaSalvata | null {
  if (!p.voce || !p.iniziata || p.finita) return null
  const finale = p.scadenza !== null
  const resta = finale
    ? Math.min(p.tempoFinaleMs, p.scadenza! - ora)
    : p.orologioCoppia && p.scelte.length < COPPIE_GHIGLIOTTINA
      ? // Prima che parta — la coppia sta arrivando — il tempo e' ancora tutto.
        Math.min(p.tempoSceltaMs, p.orologioCoppia.scadenza - Math.max(ora, p.orologioCoppia.inizio))
      : null
  return {
    v: 1,
    s: p.voce.s,
    seme: p.voce.seme,
    tempoSceltaMs: p.tempoSceltaMs,
    tempoFinaleMs: p.tempoFinaleMs,
    scelte: p.scelte,
    finale,
    resta: resta === null ? null : Math.max(0, Math.round(resta)),
  }
}

const durata = (x: unknown) => typeof x === 'number' && Number.isFinite(x) && x > 0

/** Un salvataggio letto dal telefono: tiene solo quel che ha la forma giusta. */
export function leggiSalvata(testo: string | null): GhigliottinaSalvata | null {
  if (!testo) return null
  try {
    const s = JSON.parse(testo) as GhigliottinaSalvata
    if (
      !s ||
      s.v !== 1 ||
      typeof s.s !== 'string' ||
      !Number.isInteger(s.seme) ||
      !durata(s.tempoSceltaMs) ||
      !durata(s.tempoFinaleMs) ||
      !Array.isArray(s.scelte) ||
      s.scelte.length > COPPIE_GHIGLIOTTINA ||
      !s.scelte.every((x) => x === 0 || x === 1 || x === null) ||
      typeof s.finale !== 'boolean' ||
      (s.finale && s.scelte.length < COPPIE_GHIGLIOTTINA) ||
      !(s.resta === null || (typeof s.resta === 'number' && Number.isFinite(s.resta) && s.resta >= 0))
    ) {
      return null
    }
    return s
  } catch {
    return null
  }
}

/** La partita rimessa in piedi dal salvataggio e dalla sua ghigliottina, con il tempo che riparte da `ora`. */
export function partitaDa(s: GhigliottinaSalvata, voce: GhigliottinaDellElenco, ora: number): PartitaGhigliottinaLibera {
  const coppia = !s.finale && s.scelte.length < COPPIE_GHIGLIOTTINA
  const resta = (tempo: number) => Math.min(tempo, s.resta ?? tempo)
  const inizio = ora + PREAMBOLO_RIPRESA_MS
  return {
    giorno: disponiGhigliottina(voce, mulberry32(s.seme)),
    voce: { s: s.s, seme: s.seme },
    tempoSceltaMs: s.tempoSceltaMs,
    tempoFinaleMs: s.tempoFinaleMs,
    conta: true,
    iniziata: true,
    scelte: s.scelte,
    orologioCoppia: coppia ? { inizio, scadenza: inizio + resta(s.tempoSceltaMs) } : null,
    scadenza: s.finale ? ora + resta(s.tempoFinaleMs) : null,
    risposta: null,
    indovinata: null,
    finita: false,
  }
}

const ORDINALI = ['Prima', 'Seconda', 'Terza', 'Quarta', 'Quinta']

/** La riga sul biglietto delle Libere: a che punto e'. */
export function dettaglioDi(p: PartitaGhigliottinaLibera): string {
  return p.scelte.length < COPPIE_GHIGLIOTTINA ? `${ORDINALI[p.scelte.length]} coppia` : 'La parola vincente'
}

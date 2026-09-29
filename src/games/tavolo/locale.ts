/**
 * Le partite contro il computer, che stanno tutte nel telefono: la partita in
 * corso di ogni gioco, e il conto delle vinte e delle perse per livello. Al
 * server non va niente — come le libere del sudoku e del quiz.
 *
 * Una partita si salva come posizione e mosse, e le chiavi delle ripetizioni
 * come le tiene il server: riaprendo la pagina si riprende da dove si era.
 */

import { inizialeDi, regoleDi } from '@shared/tavolo-regole'
import {
  LIVELLI_TAVOLIERE,
  type EsitoTavoliere,
  type GiocoTavoliere,
  type LivelloTavoliere,
  type Parte,
} from '@shared/tavolo'

export interface PartitaLocale {
  gioco: GiocoTavoliere
  livello: LivelloTavoliere
  /** La mia parte: 0 muove per primo. */
  mia: Parte
  posizione: string
  mosse: string[]
  /** Le chiavi delle posizioni dall'ultima mossa irreversibile: bastano per le ripetizioni. */
  chiavi: string[]
  esito: EsitoTavoliere | null
  /** Nel go, a partita finita ai punti: quelli del Nero e del Bianco, komi compreso. */
  punti?: { nero: number; bianco: number } | null
  /** Nel go, a partita finita ai punti: le pietre contate morte. */
  morte?: number[] | null
  /** A partita finita, se e' gia' nel conto: una partita si conta una volta sola. */
  contata: boolean
}

export interface Conto {
  vinte: number
  perse: number
  patte: number
}

export type ContiLocali = Record<LivelloTavoliere, Conto>

/** Con che parte si comincia una partita nuova: la prima, la seconda, o a caso. */
export type SceltaParte = 'prima' | 'seconda' | 'caso'

const chiavePartita = (gioco: GiocoTavoliere) => `giochi.${gioco}.computer`
const chiaveConti = (gioco: GiocoTavoliere) => `giochi.${gioco}.computer.conti`
const chiaveScelta = (gioco: GiocoTavoliere) => `giochi.${gioco}.computer.parte`
const chiaveLivello = (gioco: GiocoTavoliere) => `giochi.${gioco}.computer.livello`
const chiaveVariante = (gioco: GiocoTavoliere) => `giochi.${gioco}.variante`

function leggiJson(chiave: string): unknown {
  try {
    const testo = localStorage.getItem(chiave)
    return testo ? (JSON.parse(testo) as unknown) : null
  } catch {
    return null
  }
}

function scriviJson(chiave: string, valore: unknown) {
  try {
    localStorage.setItem(chiave, JSON.stringify(valore))
  } catch {
    /* senza localStorage la partita vale per questa visita */
  }
}

const eLivello = (x: unknown): x is LivelloTavoliere => LIVELLI_TAVOLIERE.includes(x as LivelloTavoliere)

/** La partita salvata, se c'e' e se e' ancora una posizione valida per le regole di adesso. */
export function leggiPartita(gioco: GiocoTavoliere): PartitaLocale | null {
  const p = leggiJson(chiavePartita(gioco)) as Partial<PartitaLocale> | null
  if (!p || p.gioco !== gioco || typeof p.posizione !== 'string' || !eLivello(p.livello)) return null
  if ((p.mia !== 0 && p.mia !== 1) || !Array.isArray(p.mosse) || !Array.isArray(p.chiavi)) return null
  if (regoleDi(gioco).tratto(p.posizione) === null) return null
  return {
    gioco,
    livello: p.livello,
    mia: p.mia,
    posizione: p.posizione,
    mosse: p.mosse.filter((m): m is string => typeof m === 'string'),
    chiavi: p.chiavi.filter((m): m is string => typeof m === 'string'),
    esito: p.esito ?? null,
    punti: p.punti ?? null,
    morte: Array.isArray(p.morte) ? p.morte.filter((k): k is number => Number.isInteger(k)) : null,
    contata: p.contata === true,
  }
}

export function salvaPartita(p: PartitaLocale) {
  scriviJson(chiavePartita(p.gioco), p)
}

export function nuovaPartita(
  gioco: GiocoTavoliere,
  livello: LivelloTavoliere,
  scelta: SceltaParte,
  variante: string | null = leggiVariante(gioco),
): PartitaLocale {
  const mia: Parte = scelta === 'prima' ? 0 : scelta === 'seconda' ? 1 : Math.random() < 0.5 ? 0 : 1
  const p: PartitaLocale = {
    gioco,
    livello,
    mia,
    posizione: inizialeDi(regoleDi(gioco), variante),
    mosse: [],
    chiavi: [],
    esito: null,
    punti: null,
    morte: null,
    contata: false,
  }
  salvaPartita(p)
  scriviJson(chiaveLivello(gioco), livello)
  return p
}

/** Lasciare una partita a meta' e' perderla: si conta come una resa. */
export function abbandona(p: PartitaLocale): PartitaLocale {
  if (p.esito) return p
  return conta({ ...p, esito: { vincitore: p.mia === 0 ? 1 : 0, motivo: 'resa' } })
}

/** Una partita cominciata davvero: ho gia' mosso almeno una volta. */
export function cominciata(p: PartitaLocale): boolean {
  return p.esito === null && p.mosse.length > (p.mia === 0 ? 0 : 1)
}

const CONTO_VUOTO: Conto = { vinte: 0, perse: 0, patte: 0 }

export function leggiConti(gioco: GiocoTavoliere): ContiLocali {
  const salvati = (leggiJson(chiaveConti(gioco)) ?? {}) as Partial<Record<LivelloTavoliere, Partial<Conto>>>
  const conti = {} as ContiLocali
  for (const livello of LIVELLI_TAVOLIERE) {
    const c = salvati[livello] ?? {}
    conti[livello] = {
      vinte: Number(c.vinte) || 0,
      perse: Number(c.perse) || 0,
      patte: Number(c.patte) || 0,
    }
  }
  return conti
}

/** La partita finita entra nel conto del suo livello, una volta sola. */
export function conta(p: PartitaLocale): PartitaLocale {
  if (!p.esito || p.contata) return p
  const conti = leggiConti(p.gioco)
  const c = { ...CONTO_VUOTO, ...conti[p.livello] }
  if (p.esito.vincitore === null) c.patte += 1
  else if (p.esito.vincitore === p.mia) c.vinte += 1
  else c.perse += 1
  conti[p.livello] = c
  scriviJson(chiaveConti(p.gioco), conti)
  const contata = { ...p, contata: true }
  salvaPartita(contata)
  return contata
}

export function leggiScelta(gioco: GiocoTavoliere): SceltaParte {
  const s = leggiJson(chiaveScelta(gioco))
  return s === 'prima' || s === 'seconda' || s === 'caso' ? s : 'prima'
}

export function salvaScelta(gioco: GiocoTavoliere, s: SceltaParte) {
  scriviJson(chiaveScelta(gioco), s)
}

/** La variante scelta, per i giochi che ne hanno: il lato del goban. La prima, se non se n'e' scelta una. */
export function leggiVariante(gioco: GiocoTavoliere): string | null {
  const varianti = regoleDi(gioco).varianti
  if (!varianti) return null
  const v = leggiJson(chiaveVariante(gioco))
  return typeof v === 'string' && varianti.includes(v) ? v : varianti[0]
}

export function salvaVariante(gioco: GiocoTavoliere, variante: string) {
  scriviJson(chiaveVariante(gioco), variante)
}

/** L'ultimo livello giocato: una pagina aperta senza partita ricomincia da li'. */
export function ultimoLivello(gioco: GiocoTavoliere): LivelloTavoliere {
  const l = leggiJson(chiaveLivello(gioco))
  return eLivello(l) ? l : 'normale'
}

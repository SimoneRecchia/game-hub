/**
 * La Catena libera lasciata a meta': che cosa si salva nel telefono, e come la
 * si rimette in piedi.
 *
 * La verita' di una partita sono le mosse (`svolgiCatena`), quindi si salvano
 * quelle, con quale catena del file, i tempi scelti e quanto mancava al tempo
 * di adesso. Il tempo si salva come quel che resta, non come l'ora della
 * scadenza: lasciata, la partita e' ferma, e riprende da dov'era.
 */

import { ROTTE } from '@/app/rotte'
import { NASCOSTE_CATENA, PASSO_FINALE, svolgiCatena, type CatenaDelGiorno, type MossaCatena } from '@shared/catena'
import type { PartitaCatenaLibera } from './useCatenaLibera'

export const CHIAVE_PARTITA = 'giochi.catena.libera.partita'

/** Dove si riprende: la pagina della libera, che con `riprendi` la riapre senza passare dalle opzioni. */
export const RIPRENDI = `${ROTTE.libera('catena')}?riprendi`

/** Riaperta, la parola di adesso aspetta un attimo prima che il suo minuto riparta: il tempo di rivederla. */
export const PREAMBOLO_RIPRESA_MS = 1_000

/** Come il telefono riconosce una catena: la prima parola e la finale. La usano anche i conti, per non ripeterla. */
export const nomeDi = (parole: readonly string[]) => `${parole[0]}|${parole[NASCOSTE_CATENA[PASSO_FINALE]]}`

export interface CatenaSalvata {
  v: 1
  /** Quale catena del file (`nomeDi`). */
  nome: string
  tempoParolaMs: number
  tempoFinaleMs: number
  mosse: MossaCatena[]
  /** Quanto mancava al tempo di adesso, della parola o della finale; null se non era partito. */
  resta: number | null
}

/** La partita come la si salva, o null se non c'e' niente da salvare: non e' cominciata, e' finita, o e' una sfida. */
export function daSalvare(p: PartitaCatenaLibera, ora: number): CatenaSalvata | null {
  if (!p.nome || !p.iniziata || p.finita) return null
  const resta = p.finale
    ? Math.min(p.tempoFinaleMs, p.finale.scadenza - ora)
    : p.parola
      ? // Prima che parta — la parola sta arrivando — il minuto e' ancora tutto.
        Math.min(p.tempoParolaMs, p.parola.scadenza - Math.max(ora, p.parola.inizio))
      : null
  return {
    v: 1,
    nome: p.nome,
    tempoParolaMs: p.tempoParolaMs,
    tempoFinaleMs: p.tempoFinaleMs,
    mosse: p.mosse,
    resta: resta === null ? null : Math.max(0, Math.round(resta)),
  }
}

const durata = (x: unknown) => typeof x === 'number' && Number.isFinite(x) && x > 0

const mossaValida = (m: unknown): m is MossaCatena => {
  const x = m as MossaCatena | null
  return !!x && (x.k === 'j' || x.k === 'c' || x.k === 't' || (x.k === 'p' && typeof x.w === 'string'))
}

/** Un salvataggio letto dal telefono: tiene solo quel che ha la forma giusta. */
export function leggiSalvata(testo: string | null): CatenaSalvata | null {
  if (!testo) return null
  try {
    const s = JSON.parse(testo) as CatenaSalvata
    if (
      !s ||
      s.v !== 1 ||
      typeof s.nome !== 'string' ||
      !durata(s.tempoParolaMs) ||
      !durata(s.tempoFinaleMs) ||
      !Array.isArray(s.mosse) ||
      !s.mosse.every(mossaValida) ||
      !(s.resta === null || (typeof s.resta === 'number' && Number.isFinite(s.resta) && s.resta >= 0))
    ) {
      return null
    }
    return s
  } catch {
    return null
  }
}

/**
 * La partita rimessa in piedi dal salvataggio e dalla sua catena, con il tempo
 * che riparte da `ora`. Alla finale si torna dentro il suo minuto, senza
 * l'annuncio che l'ha portata.
 */
export function partitaDa(s: CatenaSalvata, catena: CatenaDelGiorno, ora: number): PartitaCatenaLibera {
  const allaFinale = svolgiCatena(catena, s.mosse).passo >= PASSO_FINALE
  const restaParola = Math.min(s.tempoParolaMs, s.resta ?? s.tempoParolaMs)
  const restaFinale = Math.min(s.tempoFinaleMs, s.resta ?? s.tempoFinaleMs)
  const inizio = ora + PREAMBOLO_RIPRESA_MS
  return {
    catena,
    nome: s.nome,
    tempoParolaMs: s.tempoParolaMs,
    tempoFinaleMs: s.tempoFinaleMs,
    conta: true,
    iniziata: true,
    mosse: s.mosse,
    parola: allaFinale ? null : { inizio, scadenza: inizio + restaParola },
    finale: allaFinale ? { inizio: ora - (s.tempoFinaleMs - restaFinale), scadenza: ora + restaFinale } : null,
    risposta: null,
    indovinata: null,
    finita: false,
  }
}

const ORDINALI = ['Prima', 'Seconda', 'Terza', 'Quarta']

/** La riga sul biglietto delle Libere: a che punto e'. */
export function dettaglioDi(p: PartitaCatenaLibera): string {
  const passo = svolgiCatena(p.catena, p.mosse).passo
  return passo >= PASSO_FINALE ? 'La parola finale' : `${ORDINALI[passo]} parola`
}

/**
 * La libera degli Anagrammi lasciata a meta': resta nel `localStorage` e si
 * riprende da dove era, anche il giorno dopo (vedi games/sospese/registro.ts).
 *
 * Il tempo della parola aperta si salva come quanto ne e' gia' passato, non
 * come l'ora in cui la si e' aperta: lontano dalla partita l'orologio si
 * ferma, e riprendendola riparte da li'. E' una libera, non c'e' una
 * classifica da difendere.
 */

import { LIVELLI_ANAGRAMMI, type LivelloAnagrammi } from '@shared/sfide-libere'
import type { EsitoAnagramma } from '@shared/types'

export const CHIAVE_PARTITA_ANAGRAMMI = 'giochi.anagrammi.libera.partita'

const ESITI: readonly EsitoAnagramma[] = ['trovata', 'passata', 'persa']

/** Una parola come la tiene la partita: `aperta` e' l'ora del telefono in cui la si e' aperta. */
export interface ParolaLibera {
  parola: string
  lettere: string
  risposte: string[]
  definizione: string
  aperta: number | null
  esito: EsitoAnagramma | null
  ms: number | null
  aiuto: boolean
  risposta: string | null
}

/** Come sta nel `localStorage`: per ogni parola, al posto dell'ora, il tempo gia' passato. */
interface Salvata {
  livello: LivelloAnagrammi
  tempoMs: number
  parole: Array<Omit<ParolaLibera, 'aperta'> & { passati: number | null }>
}

export interface PartitaAnagrammiSalvata {
  livello: LivelloAnagrammi
  tempoMs: number
  parole: ParolaLibera[]
}

/**
 * La partita in testo. `adesso` e' l'ora da cui si contano i passati: quella
 * della pausa, se la partita e' ferma.
 */
export function inTestoAnagrammi(p: PartitaAnagrammiSalvata, adesso: number): string {
  const s: Salvata = {
    livello: p.livello,
    tempoMs: p.tempoMs,
    parole: p.parole.map(({ aperta, ...resto }) => ({
      ...resto,
      passati: aperta === null ? null : Math.min(p.tempoMs, Math.max(0, adesso - aperta)),
    })),
  }
  return JSON.stringify(s)
}

const testo = (x: unknown): x is string => typeof x === 'string'
const numeroONull = (x: unknown) => x === null || (typeof x === 'number' && Number.isFinite(x))

/** La partita dal testo, con l'orologio che riparte adesso; null se il testo non e' una partita. */
export function daTestoAnagrammi(grezzo: string | null, adesso: number): PartitaAnagrammiSalvata | null {
  if (!grezzo) return null
  try {
    const s = JSON.parse(grezzo) as Salvata
    if (!s || !LIVELLI_ANAGRAMMI.includes(s.livello) || !Number.isFinite(s.tempoMs) || s.tempoMs <= 0) return null
    if (!Array.isArray(s.parole) || s.parole.length === 0) return null
    const valide = s.parole.every(
      (p) =>
        p &&
        testo(p.parola) &&
        testo(p.lettere) &&
        testo(p.definizione) &&
        Array.isArray(p.risposte) &&
        p.risposte.every(testo) &&
        numeroONull(p.passati) &&
        numeroONull(p.ms) &&
        (p.esito === null || ESITI.includes(p.esito)) &&
        (p.risposta === null || testo(p.risposta)),
    )
    if (!valide) return null
    return {
      livello: s.livello,
      tempoMs: s.tempoMs,
      parole: s.parole.map(({ passati, ...resto }) => ({
        ...resto,
        aiuto: Boolean(resto.aiuto),
        aperta: passati === null ? null : adesso - passati,
      })),
    }
  } catch {
    return null
  }
}

export function leggiPartitaAnagrammi(): PartitaAnagrammiSalvata | null {
  try {
    return daTestoAnagrammi(localStorage.getItem(CHIAVE_PARTITA_ANAGRAMMI), Date.now())
  } catch {
    return null
  }
}

export function salvaPartitaAnagrammi(p: PartitaAnagrammiSalvata | null, adesso = Date.now()): void {
  try {
    if (p) localStorage.setItem(CHIAVE_PARTITA_ANAGRAMMI, inTestoAnagrammi(p, adesso))
    else localStorage.removeItem(CHIAVE_PARTITA_ANAGRAMMI)
  } catch {
    /* Safari privato nega lo storage: la partita resta in memoria finché la pagina e' aperta */
  }
}

const ORDINALI = ['Prima', 'Seconda', 'Terza', 'Quarta', 'Quinta', 'Sesta', 'Settima', 'Ottava', 'Nona', 'Decima']

/** La riga del biglietto: a che parola si e'. */
export function dettaglioAnagrammi(p: PartitaAnagrammiSalvata): string {
  const k = p.parole.findIndex((x) => x.esito === null)
  const n = k < 0 ? p.parole.length : k
  return `${ORDINALI[n] ?? `${n + 1}ª`} parola di ${p.parole.length}`
}

/**
 * Il Paroliere libero lasciato a meta': resta nel `localStorage` e si riprende
 * da dove era, anche il giorno dopo (vedi games/sospese/registro.ts).
 *
 * Si salvano i dadi, le parole trovate e il tempo che resta, non l'ora in cui
 * finisce: lontano dalla partita la clessidra si ferma. Le parole della griglia
 * no — sono centinaia, e il lavoratore del dizionario le ritrova dai dadi
 * quando la si riprende (`paroleDelParoliere`), con il dizionario di allora.
 */

import type { LatoParoliere } from '@shared/paroliere'

export const CHIAVE_PARTITA_PAROLIERE = 'giochi.paroliere.libera.partita'

export interface PartitaParoliereSalvata {
  lato: LatoParoliere
  /** Il tempo intero della partita: dice se vale il traguardo. */
  tempoMs: number
  griglia: string[]
  trovate: string[]
  rimastiMs: number
}

export function inTestoParoliere(p: PartitaParoliereSalvata): string {
  return JSON.stringify(p)
}

const testi = (x: unknown): x is string[] => Array.isArray(x) && x.every((t) => typeof t === 'string')

/** La partita dal testo; null se il testo non e' una partita. */
export function daTestoParoliere(grezzo: string | null): PartitaParoliereSalvata | null {
  if (!grezzo) return null
  try {
    const p = JSON.parse(grezzo) as PartitaParoliereSalvata
    const valida =
      p &&
      (p.lato === 4 || p.lato === 5) &&
      Number.isFinite(p.tempoMs) &&
      p.tempoMs > 0 &&
      testi(p.griglia) &&
      p.griglia.length === p.lato * p.lato &&
      testi(p.trovate) &&
      Number.isFinite(p.rimastiMs)
    if (!valida) return null
    return { ...p, rimastiMs: Math.min(p.tempoMs, Math.max(0, p.rimastiMs)) }
  } catch {
    return null
  }
}

export function leggiPartitaParoliere(): PartitaParoliereSalvata | null {
  try {
    return daTestoParoliere(localStorage.getItem(CHIAVE_PARTITA_PAROLIERE))
  } catch {
    return null
  }
}

export function salvaPartitaParoliere(p: PartitaParoliereSalvata | null): void {
  try {
    if (p) localStorage.setItem(CHIAVE_PARTITA_PAROLIERE, inTestoParoliere(p))
    else localStorage.removeItem(CHIAVE_PARTITA_PAROLIERE)
  } catch {
    /* Safari privato nega lo storage: la partita resta in memoria finché la pagina e' aperta */
  }
}

const NOMI_LATI: Record<LatoParoliere, string> = { 4: 'Quattro per quattro', 5: 'Cinque per cinque' }

/** La riga del biglietto: la griglia, il tempo che resta e le parole trovate. */
export function dettaglioParoliere(p: PartitaParoliereSalvata): string {
  const s = Math.ceil(p.rimastiMs / 1000)
  const tempo = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  const parole = p.trovate.length === 1 ? 'una parola' : `${p.trovate.length} parole`
  return `${NOMI_LATI[p.lato]} · ${tempo} · ${parole}`
}

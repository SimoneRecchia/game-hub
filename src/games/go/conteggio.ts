/**
 * Il conteggio del go, visto dal telefono: la stima delle pietre morte, i
 * gruppi che si toccano per correggerla, e i punti che ne escono. I punti li
 * fa `punteggio` di shared/go.ts, lo stesso del server.
 */

import * as go from '@shared/go'

/**
 * Il seme della stima, dalla posizione: due telefoni che guardano la stessa
 * partita fanno la stessa stima, e la prima proposta e' uguale per tutti e due.
 */
export function semeDi(posizione: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < posizione.length; i += 1) {
    h ^= posizione.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Toccare una pietra cambia tutto il suo gruppo: morto se era vivo, vivo se era morto. */
export function cambiaGruppo(posizione: string, morte: readonly number[], punto: number): number[] {
  const p = go.leggi(posizione)
  if (!p || p.punti[punto] === null) return [...morte]
  const gruppo = go.gruppo(p, punto)
  const insieme = new Set(morte)
  const morto = insieme.has(punto)
  for (const k of gruppo) {
    if (morto) insieme.delete(k)
    else insieme.add(k)
  }
  return [...insieme].sort((a, b) => a - b)
}

/** I punti con queste pietre morte, e di chi e' ogni intersezione; null se la posizione non si legge. */
export function contaPunti(posizione: string, morte: readonly number[]): go.Conteggio | null {
  const p = go.leggi(posizione)
  return p ? go.punteggio(p, morte) : null
}

/** Un punteggio come si legge: 7,5 e non 7.5. */
export function punti(n: number): string {
  return n.toLocaleString('it-IT', { maximumFractionDigits: 1 })
}

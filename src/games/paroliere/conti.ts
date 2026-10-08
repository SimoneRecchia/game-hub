/**
 * Le libere del Paroliere: stanno nel telefono, e qui si contano. Un file a
 * parte perché le legge anche la classifica, che altrimenti si porterebbe
 * dietro la griglia e il dizionario.
 */

export interface ContiParoliere {
  partite: number
  /** Le parole trovate, in tutte le partite. */
  parole: number
  /** Il punteggio migliore di una griglia, per lato: quattro per quattro e cinque per cinque. */
  migliore: { 4: number; 5: number }
}

const CHIAVE = 'giochi.paroliere.libera.conti'
const vuoti = (): ContiParoliere => ({ partite: 0, parole: 0, migliore: { 4: 0, 5: 0 } })

export function leggiContiParoliere(): ContiParoliere {
  try {
    const salvati = JSON.parse(localStorage.getItem(CHIAVE) ?? 'null') as Partial<ContiParoliere> | null
    if (!salvati || typeof salvati !== 'object') return vuoti()
    return {
      partite: Number(salvati.partite) || 0,
      parole: Number(salvati.parole) || 0,
      migliore: { 4: Number(salvati.migliore?.[4]) || 0, 5: Number(salvati.migliore?.[5]) || 0 },
    }
  } catch {
    return vuoti()
  }
}

export function registraLiberaParoliere(lato: 4 | 5, parole: number, punteggio: number): ContiParoliere {
  const conti = leggiContiParoliere()
  const dopo: ContiParoliere = {
    partite: conti.partite + 1,
    parole: conti.parole + parole,
    migliore: { ...conti.migliore, [lato]: Math.max(conti.migliore[lato], punteggio) },
  }
  try {
    localStorage.setItem(CHIAVE, JSON.stringify(dopo))
  } catch {
    /* senza localStorage la partita non si conta */
  }
  return dopo
}

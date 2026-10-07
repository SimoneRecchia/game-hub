/**
 * Le libere degli Anagrammi: stanno nel telefono, e qui si contano. Un file a
 * parte perché le legge anche la classifica, che altrimenti si porterebbe
 * dietro la partita.
 */

export interface ContiAnagrammi {
  partite: number
  /** Le parole trovate, su tutte le partite. */
  trovate: number
  /** I punti della partita migliore. */
  migliore: number
}

const CHIAVE = 'giochi.anagrammi.libera.conti'
const VUOTI: ContiAnagrammi = { partite: 0, trovate: 0, migliore: 0 }

export function leggiContiAnagrammi(): ContiAnagrammi {
  try {
    const salvati = JSON.parse(localStorage.getItem(CHIAVE) ?? 'null') as Partial<ContiAnagrammi> | null
    if (!salvati || typeof salvati !== 'object') return { ...VUOTI }
    return {
      partite: Number(salvati.partite) || 0,
      trovate: Number(salvati.trovate) || 0,
      migliore: Number(salvati.migliore) || 0,
    }
  } catch {
    return { ...VUOTI }
  }
}

export function registraLiberaAnagrammi(trovate: number, punti: number): ContiAnagrammi {
  const conti = leggiContiAnagrammi()
  const dopo: ContiAnagrammi = {
    partite: conti.partite + 1,
    trovate: conti.trovate + trovate,
    migliore: Math.max(conti.migliore, punti),
  }
  try {
    localStorage.setItem(CHIAVE, JSON.stringify(dopo))
  } catch {
    /* senza localStorage la partita non si conta */
  }
  return dopo
}

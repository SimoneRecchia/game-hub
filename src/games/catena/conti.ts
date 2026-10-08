/**
 * Le libere della Catena: stanno nel telefono, e qui si contano. Un file
 * a parte perché le legge anche la classifica, che altrimenti si porterebbe
 * dietro la partita.
 */

export interface ContiCatena {
  partite: number
  /** Le parole finali indovinate. */
  indovinate: number
  /** Il montepremi piu' alto vinto. */
  migliore: number
  /** Le catene giocate di recente, con la prima parola e la finale, perché la prossima non le ripeta. */
  giocate: string[]
}

const CHIAVE = 'giochi.catena.libera.conti'
const RICORDATE = 120
const vuoti = (): ContiCatena => ({ partite: 0, indovinate: 0, migliore: 0, giocate: [] })

export function leggiContiCatena(): ContiCatena {
  try {
    const salvati = JSON.parse(localStorage.getItem(CHIAVE) ?? 'null') as Partial<ContiCatena> | null
    if (!salvati || typeof salvati !== 'object') return vuoti()
    return {
      partite: Number(salvati.partite) || 0,
      indovinate: Number(salvati.indovinate) || 0,
      migliore: Number(salvati.migliore) || 0,
      giocate: Array.isArray(salvati.giocate) ? salvati.giocate.filter((s) => typeof s === 'string') : [],
    }
  } catch {
    return vuoti()
  }
}

export function registraLiberaCatena(catena: string, indovinata: boolean, punti: number): ContiCatena {
  const conti = leggiContiCatena()
  const dopo: ContiCatena = {
    partite: conti.partite + 1,
    indovinate: conti.indovinate + (indovinata ? 1 : 0),
    migliore: Math.max(conti.migliore, punti),
    giocate: [...conti.giocate.filter((s) => s !== catena), catena].slice(-RICORDATE),
  }
  try {
    localStorage.setItem(CHIAVE, JSON.stringify(dopo))
  } catch {
    /* senza localStorage la partita non si conta */
  }
  return dopo
}

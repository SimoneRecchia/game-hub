/**
 * Le libere della Ghigliottina: stanno nel telefono, e qui si contano. Un file
 * a parte perché le legge anche la classifica, che altrimenti si porterebbe
 * dietro la partita.
 */

export interface ContiGhigliottina {
  partite: number
  /** Le parole vincenti indovinate. */
  indovinate: number
  /** Il montepremi piu' alto vinto. */
  migliore: number
  /** Le soluzioni giocate di recente, perché la prossima non le ripeta. */
  giocate: string[]
}

const CHIAVE = 'giochi.ghigliottina.libera.conti'
const RICORDATE = 120
const vuoti = (): ContiGhigliottina => ({ partite: 0, indovinate: 0, migliore: 0, giocate: [] })

export function leggiContiGhigliottina(): ContiGhigliottina {
  try {
    const salvati = JSON.parse(localStorage.getItem(CHIAVE) ?? 'null') as Partial<ContiGhigliottina> | null
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

export function registraLiberaGhigliottina(soluzione: string, indovinata: boolean, punti: number): ContiGhigliottina {
  const conti = leggiContiGhigliottina()
  const dopo: ContiGhigliottina = {
    partite: conti.partite + 1,
    indovinate: conti.indovinate + (indovinata ? 1 : 0),
    migliore: Math.max(conti.migliore, punti),
    giocate: [...conti.giocate.filter((s) => s !== soluzione), soluzione].slice(-RICORDATE),
  }
  try {
    localStorage.setItem(CHIAVE, JSON.stringify(dopo))
  } catch {
    /* senza localStorage la partita non si conta */
  }
  return dopo
}

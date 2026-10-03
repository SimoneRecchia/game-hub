/**
 * Le partite libere di Nomi, cose e città contro il computer: stanno nel
 * telefono, e qui si contano. Un file a parte perché le legge anche la
 * classifica, che altrimenti si porterebbe dietro il lessico.
 */

export interface ContiNomi {
  partite: number
  vinte: number
  perse: number
  patte: number
  /** Le risposte valide scritte, su tutte le partite. */
  valide: number
}

const CHIAVE = 'giochi.nomi.libera.conti'
const VUOTI: ContiNomi = { partite: 0, vinte: 0, perse: 0, patte: 0, valide: 0 }

export function leggiContiNomi(): ContiNomi {
  try {
    const salvati = JSON.parse(localStorage.getItem(CHIAVE) ?? 'null') as Partial<ContiNomi> | null
    if (!salvati || typeof salvati !== 'object') return { ...VUOTI }
    return {
      partite: Number(salvati.partite) || 0,
      vinte: Number(salvati.vinte) || 0,
      perse: Number(salvati.perse) || 0,
      patte: Number(salvati.patte) || 0,
      valide: Number(salvati.valide) || 0,
    }
  } catch {
    return { ...VUOTI }
  }
}

export function registraPartitaNomi(esito: 'vinta' | 'persa' | 'patta', valide: number): ContiNomi {
  const conti = leggiContiNomi()
  const dopo: ContiNomi = {
    partite: conti.partite + 1,
    vinte: conti.vinte + (esito === 'vinta' ? 1 : 0),
    perse: conti.perse + (esito === 'persa' ? 1 : 0),
    patte: conti.patte + (esito === 'patta' ? 1 : 0),
    valide: conti.valide + valide,
  }
  try {
    localStorage.setItem(CHIAVE, JSON.stringify(dopo))
  } catch {
    /* senza localStorage la partita non si conta */
  }
  return dopo
}

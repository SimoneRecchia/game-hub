/**
 * Le libere delle Sequenze: stanno nel telefono, e qui si contano, un record
 * per livello. Un file a parte perché le legge anche la classifica, che
 * altrimenti si porterebbe dietro la partita.
 */

import type { LivelloSequenze } from '@shared/sequenze'

export interface ContiSequenze {
  partite: number
  /** La sequenza piu' lunga ripetuta giusta, per livello. */
  record: Record<LivelloSequenze, number>
}

const CHIAVE = 'giochi.sequenze.libera.conti'
const vuoti = (): ContiSequenze => ({ partite: 0, record: { facile: 0, normale: 0, difficile: 0 } })

export function leggiContiSequenze(): ContiSequenze {
  try {
    const salvati = JSON.parse(localStorage.getItem(CHIAVE) ?? 'null') as Partial<ContiSequenze> | null
    if (!salvati || typeof salvati !== 'object') return vuoti()
    const record = (salvati.record ?? {}) as Partial<Record<LivelloSequenze, unknown>>
    return {
      partite: Number(salvati.partite) || 0,
      record: {
        facile: Number(record.facile) || 0,
        normale: Number(record.normale) || 0,
        difficile: Number(record.difficile) || 0,
      },
    }
  } catch {
    return vuoti()
  }
}

/** Conta una libera finita: `arrivata` e' la sequenza piu' lunga ripetuta giusta. Dice anche se e' un record. */
export function registraLiberaSequenze(
  livello: LivelloSequenze,
  arrivata: number,
): { conti: ContiSequenze; record: boolean } {
  const conti = leggiContiSequenze()
  const record = arrivata > conti.record[livello]
  const dopo: ContiSequenze = {
    partite: conti.partite + 1,
    record: { ...conti.record, [livello]: Math.max(conti.record[livello], arrivata) },
  }
  try {
    localStorage.setItem(CHIAVE, JSON.stringify(dopo))
  } catch {
    /* senza localStorage la partita non si conta */
  }
  return { conti: dopo, record }
}

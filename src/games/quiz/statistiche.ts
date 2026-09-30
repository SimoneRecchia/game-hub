/**
 * I conti delle partite libere del quiz: restano nel telefono, perché non
 * contano per niente. A parte dalla partita: li leggono anche la pagina del
 * gioco e il profilo, che non devono scaricare i generatori delle domande.
 */

import type { CategoriaQuiz } from '@shared/quiz'

export interface StatisticheLibere {
  partite: number
  domande: number
  giuste: number
  /** La miglior percentuale per categoria. */
  migliori: Partial<Record<CategoriaQuiz, number>>
}

const CHIAVE_STATISTICHE = 'quiz-libere-v1'

export function leggiStatistiche(): StatisticheLibere {
  try {
    const s = JSON.parse(localStorage.getItem(CHIAVE_STATISTICHE) ?? 'null') as StatisticheLibere | null
    if (s && typeof s.partite === 'number') return s
  } catch {
    // niente
  }
  return { partite: 0, domande: 0, giuste: 0, migliori: {} }
}

export function registraStatistiche(categoria: CategoriaQuiz, domande: number, giuste: number): StatisticheLibere {
  const s = leggiStatistiche()
  const quota = domande > 0 ? Math.round((100 * giuste) / domande) : 0
  const nuove: StatisticheLibere = {
    partite: s.partite + 1,
    domande: s.domande + domande,
    giuste: s.giuste + giuste,
    migliori: { ...s.migliori, [categoria]: Math.max(s.migliori[categoria] ?? 0, quota) },
  }
  try {
    localStorage.setItem(CHIAVE_STATISTICHE, JSON.stringify(nuove))
  } catch {
    // Le statistiche delle libere sono un contorno.
  }
  return nuove
}

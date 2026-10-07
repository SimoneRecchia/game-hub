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

/**
 * Una partita finita: le domande e le giuste di ogni sua categoria — una sola,
 * o quelle di una partita di piu' sezioni. Il record di una categoria conta
 * solo le sue domande.
 */
export function registraStatistiche(
  perCategoria: ReadonlyArray<readonly [CategoriaQuiz, number, number]>,
): StatisticheLibere {
  const s = leggiStatistiche()
  const migliori = { ...s.migliori }
  for (const [categoria, domande, giuste] of perCategoria) {
    const quota = domande > 0 ? Math.round((100 * giuste) / domande) : 0
    migliori[categoria] = Math.max(migliori[categoria] ?? 0, quota)
  }
  const nuove: StatisticheLibere = {
    partite: s.partite + 1,
    domande: s.domande + perCategoria.reduce((n, [, d]) => n + d, 0),
    giuste: s.giuste + perCategoria.reduce((n, [, , g]) => n + g, 0),
    migliori,
  }
  try {
    localStorage.setItem(CHIAVE_STATISTICHE, JSON.stringify(nuove))
  } catch {
    // Le statistiche delle libere sono un contorno.
  }
  return nuove
}

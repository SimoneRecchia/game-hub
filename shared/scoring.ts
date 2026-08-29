/**
 * Punteggio di una partita.
 *
 * L'invariante che tiene in piedi tutto: **il numero di tentativi determina
 * sempre l'ordine, i bonus fanno solo da spareggio**. Chi chiude al terzo
 * tentativo sta davanti a chi chiude al quarto, sempre, qualunque siano i
 * bonus in gioco. Per garantirlo il totale massimo dei bonus (19) e' tenuto
 * sotto il gradino fra due tentativi (20). C'e' un test che lo verifica su
 * tutte le combinazioni, perché e' il tipo di vincolo che si rompe da solo la
 * prima volta che si ritocca un numero.
 *
 * Senza questo, un quinto tentativo veloce batterebbe un terzo tentativo
 * lento: matematicamente coerente, ma nessuno lo accetterebbe come giusto.
 */

import { MAX_ATTEMPTS } from './config'
import type { WordleStatus } from './types'

/** Punti base per tentativo usato: indice 0 = indovinata al primo colpo. */
export const ATTEMPT_POINTS = [120, 100, 80, 60, 40, 20] as const

/** Distanza fra due tentativi consecutivi: il tetto dei bonus deve starci sotto. */
export const ATTEMPT_STEP = 20

/** Punti a chi ha giocato senza indovinare: la costanza va comunque premiata. */
export const CONSOLATION_POINTS = 5

export const MAX_SPEED_BONUS = 10
/** Sotto questo tempo il bonus velocità e' pieno. */
export const SPEED_FULL_MS = 45_000
/** Da qui in poi il bonus velocità e' zero. */
export const SPEED_ZERO_MS = 12 * 60_000

/** Un punto per ogni giorno consecutivo, fino a nove. */
export const STREAK_POINTS_EACH = 1
export const STREAK_CAP = 9
export const MAX_STREAK_BONUS = STREAK_POINTS_EACH * STREAK_CAP

/** Tetto complessivo degli spareggi. Deve restare sotto ATTEMPT_STEP. */
export const MAX_TIEBREAK = MAX_SPEED_BONUS + MAX_STREAK_BONUS

/** Massimo teorico: primo tentativo, sotto i 45 secondi, con nove giorni di fila. */
export const MAX_SCORE = ATTEMPT_POINTS[0] + MAX_TIEBREAK

export interface ScoreInput {
  status: WordleStatus
  /** Tentativi usati (1..MAX_ATTEMPTS). */
  attempts: number
  /** Dal primo tentativo alla fine. null se non misurabile. */
  durationMs: number | null
  /** Giorni consecutivi vinti, incluso questo. */
  streak: number
}

export interface ScoreBreakdown {
  attempts: number
  speed: number
  streak: number
  total: number
}

/** Bonus velocità: pieno fino a 45s, poi in discesa lineare fino a 12 minuti. */
export function speedBonus(durationMs: number | null): number {
  // null e 0 significano "non misurato", non "istantaneo".
  if (durationMs === null || durationMs <= 0) return 0
  if (durationMs <= SPEED_FULL_MS) return MAX_SPEED_BONUS
  if (durationMs >= SPEED_ZERO_MS) return 0
  const span = SPEED_ZERO_MS - SPEED_FULL_MS
  return Math.round((MAX_SPEED_BONUS * (SPEED_ZERO_MS - durationMs)) / span)
}

export function streakBonus(streak: number): number {
  return Math.min(Math.max(streak, 0), STREAK_CAP) * STREAK_POINTS_EACH
}

export function scoreBreakdown(input: ScoreInput): ScoreBreakdown {
  if (input.status !== 'won') {
    const consolation = input.status === 'lost' ? CONSOLATION_POINTS : 0
    return { attempts: consolation, speed: 0, streak: 0, total: consolation }
  }

  const index = Math.min(Math.max(input.attempts, 1), MAX_ATTEMPTS) - 1
  const attempts = ATTEMPT_POINTS[index]
  const speed = speedBonus(input.durationMs)
  const streak = streakBonus(input.streak)
  return { attempts, speed, streak, total: attempts + speed + streak }
}

export function scoreFor(input: ScoreInput): number {
  return scoreBreakdown(input).total
}

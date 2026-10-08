/**
 * Punteggio della parola del giorno.
 *
 * Una parola sola al giorno, la stessa per tutti, e vale al massimo cento
 * punti, come ogni classificata (vedi shared/punti.ts), che la classifica
 * generale somma.
 *
 * Due principi, e sono in tensione fra loro:
 *
 *  1. **I tentativi determinano l'ordine.** Chi chiude al terzo sta davanti a
 *     chi chiude al quarto, sempre, qualunque siano i bonus. Per garantirlo il
 *     totale massimo dei bonus resta sotto il gradino fra due tentativi.
 *  2. **Una giornata brutta deve essere recuperabile.** Il numero di tentativi
 *     e' l'unica cosa che il Wordle vero misura, ma chi indovina al sesto ha
 *     comunque giocato: se una vittoria stiracchiata valesse un sesto di una
 *     perfetta, dopo due giornate sfortunate la classifica sarebbe decisa.
 *
 * Il modo di tenerli insieme e' una **base di partecipazione** piu' un gradino
 * per ogni tentativo risparmiato: il punteggio resta una funzione lineare dei
 * tentativi (principio 1) ma il rapporto fra il massimo e il minimo e' 2:1
 * invece di 6:1 (principio 2). In pratica una giornata al sesto tentativo costa
 * mezza giornata, non cinque.
 *
 *     tentativi     1    2    3    4    5    6    non indovinata
 *     punti       100   90   80   70   60   50    20
 */

import { MAX_ATTEMPTS } from './config'
import type { WordleStatus } from './types'

/** Punti per aver giocato e indovinato, indipendentemente dai tentativi. */
export const PARTICIPATION_POINTS = 40

/** Quanto vale ogni tentativo risparmiato. E' anche il gradino della scala. */
export const ATTEMPT_STEP = 10

/**
 * Punti base per tentativo usato: indice 0 = indovinata al primo colpo.
 *
 * Derivati, non scritti a mano: `base + gradino × tentativi risparmiati`. Così
 * ritoccare uno dei due numeri non lascia una scala incoerente.
 */
export const ATTEMPT_POINTS = Array.from(
  { length: MAX_ATTEMPTS },
  (_, i) => PARTICIPATION_POINTS + ATTEMPT_STEP * (MAX_ATTEMPTS - i),
) as readonly number[]

/**
 * Punti a chi ha giocato senza indovinare.
 *
 * Sotto la vittoria peggiore, perché indovinare al sesto resta meglio che non
 * indovinare; sopra lo zero, perché aver giocato conta e chi non gioca affatto
 * non deve stare alla pari di chi ci ha provato.
 */
export const LOSS_POINTS = 20

/**
 * Bonus velocità. Piccolo di proposito: il tempo non e' una cosa che il gioco
 * vero misuri, e trasformare il Wordle in una gara di rapidità lo rovinerebbe.
 * Un punto a chi chiude la parola in meno di sei minuti e mezzo.
 */
export const MAX_SPEED_BONUS = 1
/** Sotto questo tempo il bonus velocità e' pieno. */
export const SPEED_FULL_MS = 45_000
/** Da qui in poi il bonus velocità e' zero. */
export const SPEED_ZERO_MS = 12 * 60_000

/**
 * Un punto per ogni giorno consecutivo. La costanza e' la cosa che il Wordle
 * vero celebra più di tutte, quindi si prende la fetta più grossa dei bonus.
 */
export const STREAK_POINTS_EACH = 1
export const STREAK_CAP = 3
export const MAX_STREAK_BONUS = STREAK_POINTS_EACH * STREAK_CAP

/** Tetto complessivo degli spareggi. Deve restare sotto ATTEMPT_STEP. */
export const MAX_TIEBREAK = MAX_SPEED_BONUS + MAX_STREAK_BONUS

/** Massimo teorico: primo tentativo, subito, con tre giorni di fila. */
export const MAX_SCORE = ATTEMPT_POINTS[0] + MAX_TIEBREAK

/**
 * La giornata perfetta senza gli spareggi: e' il tetto che conta per la
 * classifica generale, lo stesso di ogni classificata.
 */
export const MAX_DAY_SCORE = ATTEMPT_POINTS[0]

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

/**
 * Bonus velocità: pieno fino a 45s, poi in discesa lineare fino a 12 minuti.
 *
 * `null` vuol dire "non misurato" e vale zero. Lo **zero** invece e' un tempo
 * vero: la durata si misura dal primo tentativo, quindi indovinare al primo
 * colpo da' esattamente zero millisecondi. Trattarlo come "non misurato"
 * togliva il bonus velocità proprio al risultato migliore possibile.
 */
export function speedBonus(durationMs: number | null): number {
  if (durationMs === null || durationMs < 0) return 0
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
    const consolation = input.status === 'lost' ? LOSS_POINTS : 0
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

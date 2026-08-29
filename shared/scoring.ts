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
 *
 * L'invariante vale sul punteggio di **una partita**. In classifica al punteggio
 * partita si somma quello degli assist (vedi in fondo al file), che e' un asse
 * separato di proposito: aiutare gli altri deve poter far scalare la classifica,
 * altrimenti non sarebbe un premio. Il tetto giornaliero degli assist tiene quel
 * contributo sotto un tentativo e mezzo.
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

/* ────────────────────────────────  Assist  ──────────────────────────────── */

/**
 * I punti di chi aiuta.
 *
 * La parola del giorno e' la stessa per tutti, quindi guardare la partita di un
 * altro prima di aver giocato la propria la svela: quella giornata non fa punti
 * partita. Ma il tempo speso a suggerire vale qualcosa, e sono punti di un tipo
 * diverso — **assist** — tenuti separati dai punti partita per due motivi:
 *
 *  - il totale in classifica e' la somma dei due, quindi chi aiuta sale;
 *  - a parità di totale vince chi ha più assist, che e' l'unico modo di
 *    premiare la collaborazione senza svalutare una partita giocata bene.
 *
 * Un suggerimento conta solo se l'host lo gioca davvero: proporre venti parole
 * a caso non e' un aiuto, e senza questa condizione lo sarebbe diventato.
 */

/** L'host ha giocato la parola suggerita. */
export const ASSIST_PLAYED = 4

/** In più, se quella parola era la soluzione: e' il suggerimento che ha chiuso la partita. */
export const ASSIST_SOLVED = 8

/** Il massimo per un singolo suggerimento: giocato e vincente. */
export const MAX_ASSIST_PER_SUGGESTION = ASSIST_PLAYED + ASSIST_SOLVED

/**
 * Tetto giornaliero degli assist, sommando tutte le partite in cui si e' aiutato.
 *
 * Serve a tenere gli assist un contributo, non una scorciatoia: 30 punti valgono
 * un tentativo e mezzo (`ATTEMPT_STEP` = 20), quindi aiutare fa scalare la
 * classifica ma non batte da solo chi ha giocato bene. Il tetto si applica in
 * lettura, un giorno per volta: se un domani si cambia questo numero, cambia
 * per tutte le giornate insieme, che e' il comportamento giusto per un tetto.
 */
export const MAX_ASSIST_PER_DAY = 30

/** Punti per un suggerimento che l'host ha giocato. `answer` decide il bonus. */
export function assistPoints(word: string, answer: string): number {
  return ASSIST_PLAYED + (word === answer ? ASSIST_SOLVED : 0)
}

/** Assist di una giornata, col tetto applicato. */
export function dailyAssist(points: number): number {
  return Math.min(Math.max(points, 0), MAX_ASSIST_PER_DAY)
}

/** Assist di più giornate: il tetto e' per giorno, non sul totale. */
export function assistTotal(perDay: Iterable<number>): number {
  let total = 0
  for (const points of perDay) total += dailyAssist(points)
  return total
}

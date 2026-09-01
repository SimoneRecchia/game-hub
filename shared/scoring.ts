/**
 * Punteggio di una giornata.
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
 */

import { MAX_ATTEMPTS, WORDS_PER_DAY } from './config'
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
 */
export const MAX_SPEED_BONUS = 4
/** Sotto questo tempo il bonus velocità e' pieno. */
export const SPEED_FULL_MS = 45_000
/** Da qui in poi il bonus velocità e' zero. */
export const SPEED_ZERO_MS = 12 * 60_000

/**
 * Un punto per ogni giorno consecutivo. La costanza e' la cosa che il Wordle
 * vero celebra più di tutte, quindi si prende la fetta più grossa dei bonus.
 */
export const STREAK_POINTS_EACH = 1
export const STREAK_CAP = 5
export const MAX_STREAK_BONUS = STREAK_POINTS_EACH * STREAK_CAP

/** Tetto complessivo degli spareggi. Deve restare sotto ATTEMPT_STEP. */
export const MAX_TIEBREAK = MAX_SPEED_BONUS + MAX_STREAK_BONUS

/** Massimo teorico: primo tentativo, sotto i 45 secondi, con cinque giorni di fila. */
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

/* ────────────────────  Le cinque parole della giornata  ──────────────────── */

/**
 * Quanto vale ciascuna parola, per numero di tentativi.
 *
 * Ogni parola ha **base e gradino propri** invece di essere la principale
 * moltiplicata per un peso. Il peso sembrava piu' elegante, ma costringeva ad
 * arrotondare: `floor` era l'unico modo di garantire che la somma delle quattro
 * non superasse la principale, e più in basso nella scala la coda si
 * schiacciava — con una base piu' bassa la quinta parola sarebbe finita a uno o
 * due punti, e nessuno l'avrebbe giocata.
 *
 * Con base e gradino la somma torna **per costruzione, a ogni numero di
 * tentativi**, senza arrotondamenti:
 *
 *     somma delle basi delle quattro   = 20 + 14 + 8 + 8 = 50 = base della prima
 *     somma dei gradini delle quattro  =  4 +  2 + 2 + 2 = 10 = gradino della prima
 *
 * Da cui la tabella:
 *
 *     tentativi        1    2    3    4    5    6
 *     del giorno     100   90   80   70   60   50
 *     2ª              40   36   32   28   24   20
 *     3ª              24   22   20   18   16   14
 *     4ª              18   16   14   12   10    8
 *     5ª              18   16   14   12   10    8
 *     somma 2ª-5ª    100   90   80   70   60   50
 *
 * Le ultime due valgono uguale invece di continuare a scendere: la quinta deve
 * valere la pena di essere giocata, e una progressione che finisce a tre punti
 * la rende un dispetto. C'e' un test su ognuna di queste proprietà.
 */

/** Punti di una parola indovinata all'ultimo tentativo, per posizione. */
export const WORD_BASE = [50, 20, 14, 8, 8] as const
/** Quanto vale un tentativo risparmiato, per posizione. */
export const WORD_STEP = [10, 4, 2, 2, 2] as const
/** Punti di una parola giocata e non indovinata, per posizione. */
export const WORD_LOSS = [20, 8, 6, 3, 3] as const

/** Indice della posizione, tenuto dentro i limiti. */
function slotIndex(slot: number): number {
  return Math.min(Math.max(slot, 1), WORDS_PER_DAY) - 1
}

/** Punti di una parola indovinata in `attempts` tentativi, alla posizione `slot`. */
export function wordScore(slot: number, attempts: number): number {
  const i = slotIndex(slot)
  const usati = Math.min(Math.max(attempts, 1), MAX_ATTEMPTS)
  return WORD_BASE[i] + WORD_STEP[i] * (MAX_ATTEMPTS - usati)
}

/** Il massimo che una parola puo' valere, bonus esclusi: serve a spiegare la scala. */
export function maxScoreFor(slot: number): number {
  return wordScore(slot, 1)
}

/** Il minimo di una parola indovinata: il fondo della scala, per la spiegazione. */
export function minScoreFor(slot: number): number {
  return wordScore(slot, MAX_ATTEMPTS)
}

/**
 * Il punteggio di una parola, con i bonus.
 *
 * I bonus stanno solo sulla **parola del giorno**, e non e' una taratura:
 * velocità e costanza sono proprietà della giornata, non di ogni parola. Dandoli
 * a tutte e cinque, chi le giocava tutte incassava fino a cinque volte il bonus
 * velocità, e tanto bastava a superare chi aveva indovinato la principale al
 * primo colpo — cioe' esattamente il ribaltamento che la scala serve a impedire.
 * Trovato provando l'API, non ragionando sui numeri.
 */
export function scoreForWord(input: ScoreInput, slot: number): number {
  if (input.status === 'playing') return 0
  if (input.status === 'lost') return WORD_LOSS[slotIndex(slot)]

  const punti = wordScore(slot, input.attempts)
  if (slot !== 1) return punti
  return punti + speedBonus(input.durationMs) + streakBonus(input.streak)
}

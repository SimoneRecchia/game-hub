import { describe, expect, it } from 'vitest'
import {
  ASSIST_PLAYED,
  ASSIST_SOLVED,
  ATTEMPT_POINTS,
  ATTEMPT_STEP,
  CONSOLATION_POINTS,
  MAX_SCORE,
  MAX_SPEED_BONUS,
  MAX_STREAK_BONUS,
  MAX_ASSIST_PER_DAY,
  MAX_ASSIST_PER_SUGGESTION,
  MAX_TIEBREAK,
  SPEED_FULL_MS,
  SPEED_ZERO_MS,
  assistPoints,
  assistTotal,
  dailyAssist,
  scoreBreakdown,
  scoreFor,
  speedBonus,
  streakBonus,
} from '../scoring'
import { MAX_ATTEMPTS } from '../config'

describe('bonus velocita', () => {
  it('e pieno sotto i 45 secondi', () => {
    expect(speedBonus(1_000)).toBe(MAX_SPEED_BONUS)
    expect(speedBonus(SPEED_FULL_MS)).toBe(MAX_SPEED_BONUS)
  })

  it('si azzera dopo dodici minuti', () => {
    expect(speedBonus(SPEED_ZERO_MS)).toBe(0)
    expect(speedBonus(SPEED_ZERO_MS + 60_000)).toBe(0)
  })

  it('scende senza salti nel mezzo', () => {
    const mid = speedBonus((SPEED_FULL_MS + SPEED_ZERO_MS) / 2)
    expect(mid).toBe(Math.round(MAX_SPEED_BONUS / 2))
    // Monotono: piu' tempo non puo' dare piu' punti. Si parte da 1 ms perché
    // 0 vuol dire "non misurato", non "istantaneo".
    let previous = MAX_SPEED_BONUS + 1
    for (let ms = 1; ms <= SPEED_ZERO_MS; ms += 15_000) {
      const value = speedBonus(ms)
      expect(value).toBeLessThanOrEqual(previous)
      previous = value
    }
  })

  it('vale zero se il tempo non e misurabile', () => {
    expect(speedBonus(null)).toBe(0)
    expect(speedBonus(0)).toBe(0)
    expect(speedBonus(-5)).toBe(0)
  })
})

describe('bonus costanza', () => {
  it('cresce di un punto al giorno', () => {
    expect(streakBonus(0)).toBe(0)
    expect(streakBonus(1)).toBe(1)
    expect(streakBonus(5)).toBe(5)
  })

  it('si ferma a nove giorni', () => {
    expect(streakBonus(9)).toBe(MAX_STREAK_BONUS)
    expect(streakBonus(400)).toBe(MAX_STREAK_BONUS)
  })

  it('regge una streak negativa', () => {
    expect(streakBonus(-3)).toBe(0)
  })
})

describe('punteggio della partita', () => {
  it('premia i tentativi risparmiati', () => {
    const base = { status: 'won' as const, durationMs: null, streak: 0 }
    const scores = [1, 2, 3, 4, 5, 6].map((attempts) => scoreFor({ ...base, attempts }))
    expect(scores).toEqual([...ATTEMPT_POINTS])
    // Strettamente decrescente: un tentativo in piu' costa sempre qualcosa.
    for (let i = 1; i < scores.length; i += 1) {
      expect(scores[i]).toBeLessThan(scores[i - 1])
    }
  })

  it('i bonus non ribaltano mai il numero di tentativi', () => {
    // L'invariante dell'impianto, verificata su tutte le combinazioni:
    // meno tentativi vince sempre, anche contro chi ha tutti i bonus.
    for (let migliore = 1; migliore < MAX_ATTEMPTS; migliore += 1) {
      const senzaBonus = scoreFor({
        status: 'won',
        attempts: migliore,
        durationMs: null,
        streak: 0,
      })
      for (let peggiore = migliore + 1; peggiore <= MAX_ATTEMPTS; peggiore += 1) {
        const conTuttiIBonus = scoreFor({
          status: 'won',
          attempts: peggiore,
          durationMs: 1_000,
          streak: 999,
        })
        expect(senzaBonus).toBeGreaterThan(conTuttiIBonus)
      }
    }
  })

  it('il tetto dei bonus sta sotto il gradino fra due tentativi', () => {
    // E' la condizione che rende vera l'invariante qui sopra: se qualcuno alza
    // un bonus senza toccare i punti base, cade prima questo test.
    expect(MAX_TIEBREAK).toBeLessThan(ATTEMPT_STEP)
    for (let i = 1; i < ATTEMPT_POINTS.length; i += 1) {
      expect(ATTEMPT_POINTS[i - 1] - ATTEMPT_POINTS[i]).toBe(ATTEMPT_STEP)
    }
  })

  it('somma le tre componenti', () => {
    const breakdown = scoreBreakdown({
      status: 'won',
      attempts: 2,
      durationMs: 30_000,
      streak: 4,
    })
    expect(breakdown).toEqual({ attempts: 100, speed: 10, streak: 4, total: 114 })
  })

  it('da i punti di consolazione a chi ha perso', () => {
    const lost = scoreBreakdown({ status: 'lost', attempts: 6, durationMs: 20_000, streak: 9 })
    expect(lost.total).toBe(CONSOLATION_POINTS)
    // Nessun bonus a chi non ha indovinato.
    expect(lost.speed).toBe(0)
    expect(lost.streak).toBe(0)
  })

  it('non assegna nulla a una partita in corso', () => {
    expect(scoreFor({ status: 'playing', attempts: 2, durationMs: 5_000, streak: 3 })).toBe(0)
  })

  it('il massimo teorico corrisponde alla costante esposta', () => {
    expect(scoreFor({ status: 'won', attempts: 1, durationMs: 1_000, streak: 20 })).toBe(MAX_SCORE)
    expect(MAX_SCORE).toBe(139)
  })

  it('regge tentativi fuori scala senza esplodere', () => {
    expect(scoreFor({ status: 'won', attempts: 0, durationMs: null, streak: 0 })).toBe(
      ATTEMPT_POINTS[0],
    )
    expect(scoreFor({ status: 'won', attempts: 99, durationMs: null, streak: 0 })).toBe(
      ATTEMPT_POINTS[5],
    )
  })
})

describe('punti assist', () => {
  it('paga il suggerimento che l host ha giocato', () => {
    expect(assistPoints('carta', 'porta')).toBe(ASSIST_PLAYED)
  })

  it('paga di piu il suggerimento che ha chiuso la partita', () => {
    expect(assistPoints('porta', 'porta')).toBe(ASSIST_PLAYED + ASSIST_SOLVED)
    expect(assistPoints('porta', 'porta')).toBe(MAX_ASSIST_PER_SUGGESTION)
  })

  it('il tetto giornaliero taglia il totale del giorno', () => {
    expect(dailyAssist(12)).toBe(12)
    expect(dailyAssist(MAX_ASSIST_PER_DAY)).toBe(MAX_ASSIST_PER_DAY)
    expect(dailyAssist(500)).toBe(MAX_ASSIST_PER_DAY)
  })

  it('non produce punti negativi', () => {
    expect(dailyAssist(-4)).toBe(0)
  })

  it('applica il tetto un giorno per volta', () => {
    // Il punto di avere il tetto giornaliero: due giornate piene valgono il
    // doppio di una. Se il tetto fosse sul totale, questo darebbe 30.
    expect(assistTotal([100, 100])).toBe(MAX_ASSIST_PER_DAY * 2)
    expect(assistTotal([10, 5, 1])).toBe(16)
    expect(assistTotal([])).toBe(0)
  })

  it('un singolo suggerimento non puo sfondare il tetto del giorno', () => {
    expect(MAX_ASSIST_PER_SUGGESTION).toBeLessThanOrEqual(MAX_ASSIST_PER_DAY)
  })

  it('una giornata di assist vale meno di due tentativi risparmiati', () => {
    // Gli assist devono poter far scalare la classifica, non sostituire il
    // gioco: e' la condizione che tiene onesto quel compromesso.
    expect(MAX_ASSIST_PER_DAY).toBeLessThan(2 * ATTEMPT_STEP)
  })
})

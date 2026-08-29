import { describe, expect, it } from 'vitest'
import {
  addDays,
  dateForPuzzleNumber,
  daysBetween,
  gameDate,
  msToNextPuzzle,
  puzzleNumberFor,
  solutionIndexFor,
  solutionPermutation,
} from '../daily'
import { EPOCH_DATE } from '../config'
import { SOLUTION_WORDS } from '../words/solutions'

describe('aritmetica sul calendario', () => {
  it('somma e sottrae giorni attraverso i confini di mese e anno', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29') // bisestile
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01')
  })

  it('conta i giorni fra due date', () => {
    expect(daysBetween('2026-08-29', '2026-08-29')).toBe(0)
    expect(daysBetween('2026-08-29', '2026-09-05')).toBe(7)
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1)
  })

  it('conta i giorni anche a cavallo del cambio di ora legale', () => {
    // In Italia l'ora legale finisce l'ultima domenica di ottobre: quel giorno
    // dura 25 ore, ma sul calendario civile resta un giorno solo.
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2)
    expect(daysBetween('2027-03-27', '2027-03-29')).toBe(2)
  })
})

describe('numerazione dei puzzle', () => {
  it('il giorno di lancio e il puzzle numero 1', () => {
    expect(puzzleNumberFor(EPOCH_DATE)).toBe(1)
  })

  it('avanza di uno al giorno', () => {
    expect(puzzleNumberFor(addDays(EPOCH_DATE, 1))).toBe(2)
    expect(puzzleNumberFor(addDays(EPOCH_DATE, 364))).toBe(365)
  })

  it('data e numero sono l una l inversa dell altra', () => {
    for (const n of [1, 2, 57, 365, 1000]) {
      expect(puzzleNumberFor(dateForPuzzleNumber(n))).toBe(n)
    }
  })
})

describe('parola del giorno', () => {
  it('restituisce una data valida per oggi', () => {
    expect(gameDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('usa il fuso italiano, non quello del processo', () => {
    // 22:30 UTC del 29 agosto = 00:30 del 30 agosto in Italia (UTC+2).
    expect(gameDate(new Date('2026-08-29T22:30:00Z'))).toBe('2026-08-30')
    // 21:30 UTC dello stesso giorno e' ancora il 29 in Italia (23:30).
    expect(gameDate(new Date('2026-08-29T21:30:00Z'))).toBe('2026-08-29')
    // A gennaio l'Italia e' UTC+1: 23:30 UTC = 00:30 del giorno dopo.
    expect(gameDate(new Date('2027-01-15T23:30:00Z'))).toBe('2027-01-16')
    expect(gameDate(new Date('2027-01-15T22:30:00Z'))).toBe('2027-01-15')
  })

  it('il countdown finisce esattamente a mezzanotte italiana', () => {
    const at = new Date('2026-08-29T21:00:00Z') // 23:00 in Italia
    expect(msToNextPuzzle(at)).toBe(60 * 60 * 1000)

    const winter = new Date('2027-01-15T22:00:00Z') // 23:00 in Italia (UTC+1)
    expect(msToNextPuzzle(winter)).toBe(60 * 60 * 1000)
  })

  it('il countdown resta nell arco di una giornata', () => {
    const ms = msToNextPuzzle(new Date())
    expect(ms).toBeGreaterThan(0)
    expect(ms).toBeLessThanOrEqual(25 * 60 * 60 * 1000)
  })
})

describe('estrazione della soluzione', () => {
  const size = SOLUTION_WORDS.length

  it('la permutazione e una vera permutazione degli indici', () => {
    const order = solutionPermutation(size)
    expect(order).toHaveLength(size)
    expect(new Set(order).size).toBe(size)
    expect(Math.min(...order)).toBe(0)
    expect(Math.max(...order)).toBe(size - 1)
  })

  it('e deterministica: stesso elenco, stessa parola', () => {
    expect(solutionIndexFor(1, size)).toBe(solutionIndexFor(1, size))
    expect(solutionIndexFor(500, size)).toBe(solutionIndexFor(500, size))
  })

  it('non ripete una parola finche l elenco non e esaurito', () => {
    const seen = new Set<number>()
    for (let n = 1; n <= size; n += 1) seen.add(solutionIndexFor(n, size))
    expect(seen.size).toBe(size)
  })

  it('non segue l ordine dell elenco: i primi giorni non sono le prime parole', () => {
    const first = [1, 2, 3, 4, 5].map((n) => solutionIndexFor(n, size))
    expect(first).not.toEqual([0, 1, 2, 3, 4])
  })

  it('riparte dall inizio dopo aver esaurito l elenco', () => {
    expect(solutionIndexFor(size + 1, size)).toBe(solutionIndexFor(1, size))
  })
})

import { describe, expect, it } from 'vitest'
import { MAGNETE, conMagnete, puntoDi } from '../Cursore'

describe('il cursore a punti', () => {
  it('sceglie il punto piu’ vicino, anche oltre i bordi della pista', () => {
    // Sette punti, come le domande della libera: uno ogni sesto di pista.
    expect(puntoDi(0, 7)).toBe(0)
    expect(puntoDi(1, 7)).toBe(6)
    expect(puntoDi(0.49 / 6, 7)).toBe(0)
    expect(puntoDi(0.51 / 6, 7)).toBe(1)
    expect(puntoDi(-0.2, 7)).toBe(0)
    expect(puntoDi(1.3, 7)).toBe(6)
    expect(puntoDi(0.5, 1)).toBe(0)
  })

  it('tiene la maniglia sul punto quando il dito gli e’ vicino, e la lascia seguire il dito fra due punti', () => {
    const passo = 1 / 6
    const vicino = 2 * passo + (MAGNETE * passo) / 2
    expect(conMagnete(vicino, 7)).toBeCloseTo(2 * passo)
    const inMezzo = 2.5 * passo
    expect(conMagnete(inMezzo, 7)).toBeCloseTo(inMezzo)
    expect(conMagnete(0.7, 1)).toBe(0)
  })
})

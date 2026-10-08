import { describe, expect, it } from 'vitest'
import { PUNTATE, tipoDi } from '@shared/roulette'
import { postoDi, puntataDa } from '../panno'

/** Il punto dell'area dei numeri al centro di una casella, in frazioni: lo zero e' la riga 0. */
const centro = (n: number) => ({ fx: (((n - 1) % 3) + 0.5) / 3, fy: (Math.ceil(n / 3) + 0.5) / 13 })

describe('il panno della roulette', () => {
  it('il centro di un numero e’ il pieno, il bordo fra due il cavallo, l’incrocio il carré', () => {
    for (let n = 1; n <= 36; n += 1) {
      const { fx, fy } = centro(n)
      expect(puntataDa(fx, fy), String(n)).toBe(String(n))
    }
    expect(puntataDa(0.5, 0.5 / 13)).toBe('0')
    // Il 17 e' nella colonna di mezzo, alla sesta riga: sotto c'e' il 20, a destra il 18.
    const { fx, fy } = centro(17)
    expect(puntataDa(fx, fy + 0.48 / 13)).toBe('17-20')
    expect(puntataDa(fx + 0.48 / 3, fy)).toBe('17-18')
    expect(puntataDa(fx + 0.48 / 3, fy + 0.48 / 13)).toBe('17-18-20-21')
    expect(puntataDa(0.01, fy)).toBe('16-17-18')
    expect(puntataDa(0.01, fy + 0.48 / 13)).toBe('16-17-18-19-20-21')
    expect(puntataDa(0.5, 1 / 13 - 0.01)).toBe('0-2')
    expect(puntataDa(0.01, 1 / 13 - 0.01)).toBe('0-1-2-3')
    expect(puntataDa(1.2, 0.5)).toBeNull()
  })

  it('ogni puntata interna si raggiunge toccando il panno, e ogni fiche sta sul panno', () => {
    const trovate = new Set<string>()
    for (let i = 0; i <= 300; i += 1) {
      for (let j = 0; j <= 1300; j += 1) {
        const k = puntataDa(i / 300, j / 1300)
        if (k) trovate.add(k)
      }
    }
    const interne = [...PUNTATE.keys()].filter((k) => !['colonna', 'dozzina', 'semplice'].includes(tipoDi(k)))
    expect(interne.filter((k) => !trovate.has(k))).toEqual([])
    for (const k of PUNTATE.keys()) {
      const p = postoDi(k)
      expect(p.x, k).toBeGreaterThanOrEqual(0)
      expect(p.x, k).toBeLessThanOrEqual(100)
      expect(p.y, k).toBeGreaterThanOrEqual(0)
      expect(p.y, k).toBeLessThanOrEqual(100)
    }
  })
})

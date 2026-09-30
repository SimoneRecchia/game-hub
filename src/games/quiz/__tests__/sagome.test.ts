import { describe, expect, it } from 'vitest'
import { CONTINENTI } from '@shared/quiz'
import { SAGOME } from '../sagome'

/** Un tracciato come lo scrive scripts/genera-sagome.ts: anelli di punti, `M x,y L x,y ... Z`. */
const TRACCIATO = /^(M-?\d+(\.5)?,-?\d+(\.5)?(L-?\d+(\.5)?,-?\d+(\.5)?)+Z)*$/

describe('le sagome delle zone del quiz', () => {
  it('ci sono il mondo e tutti i continenti, ognuno con le sue terre', () => {
    expect(Object.keys(SAGOME).sort()).toEqual(['mondo', ...CONTINENTI].sort())
    for (const [zona, s] of Object.entries(SAGOME)) {
      expect(s.larga, zona).toBeGreaterThan(0)
      expect(s.alta, zona).toBeGreaterThan(0)
      expect(s.zona.length, zona).toBeGreaterThan(100)
    }
  })

  it('i tracciati sono SVG validi e stanno nel riquadro, con il margine del taglio', () => {
    for (const [zona, s] of Object.entries(SAGOME)) {
      for (const d of [s.zona, s.resto]) {
        expect(TRACCIATO.test(d), zona).toBe(true)
        for (const [, x, y] of d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)) {
          expect(Number(x), zona).toBeGreaterThanOrEqual(-1)
          expect(Number(x), zona).toBeLessThanOrEqual(s.larga + 1)
          expect(Number(y), zona).toBeGreaterThanOrEqual(-1)
          expect(Number(y), zona).toBeLessThanOrEqual(s.alta + 1)
        }
      }
    }
  })
})

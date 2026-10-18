import { describe, expect, it } from 'vitest'
import { DURATA_DIRETTA_MS, PALLINE_MS } from '@shared/superenalotto'
import { inLettere } from '../palline'
import {
  APERTURA_MS,
  ARRIVO_MS,
  ATTESA_MS,
  REGIA,
  RIEPILOGO_MS,
  SOFFIO,
  VETRINA_MS,
  arrivata,
  inEstrazione,
  inVetrina,
  staccoDi,
} from '../tempi'

describe('i tempi della diretta', () => {
  it('ogni pallina ha la sua attesa, il suo viaggio e la sua vetrina, prima che cominci la prossima', () => {
    expect(APERTURA_MS).toBeLessThanOrEqual(PALLINE_MS[0] - ATTESA_MS)
    PALLINE_MS.forEach((t0, i) => {
      if (i === 0) return
      expect(PALLINE_MS[i - 1] + ARRIVO_MS + VETRINA_MS).toBeLessThan(t0 - ATTESA_MS)
    })
    // Il riepilogo arriva prima che la diretta finisca: dopo, il server paga i premi.
    expect(RIEPILOGO_MS).toBeLessThan(DURATA_DIRETTA_MS)
    expect(SOFFIO.a).toBeLessThanOrEqual(RIEPILOGO_MS)
  })

  it('le scritte e l’urna dicono la stessa cosa allo stesso momento', () => {
    const [t0] = PALLINE_MS
    expect(inEstrazione(t0 - ATTESA_MS - 1)).toBe(-1)
    expect(inEstrazione(t0 - ATTESA_MS)).toBe(0)
    expect(inEstrazione(t0 + ARRIVO_MS - 1)).toBe(0)
    expect(arrivata(t0 + ARRIVO_MS - 1, 0)).toBe(false)
    expect(arrivata(t0 + ARRIVO_MS, 0)).toBe(true)
    expect(inEstrazione(t0 + ARRIVO_MS)).toBe(-1)
    expect(inVetrina(t0 + ARRIVO_MS)).toBe(0)
    expect(inVetrina(t0 + ARRIVO_MS + VETRINA_MS)).toBe(-1)
  })

  it('la regia e’ una scaletta in ordine, e un passaggio finisce prima dello stacco dopo', () => {
    for (let i = 1; i < REGIA.length; i += 1) {
      const gap = REGIA[i].da - REGIA[i - 1].da
      expect(gap).toBeGreaterThan(0)
      // Altrimenti la camera partirebbe da una ripresa a meta' strada, e si vedrebbe un salto.
      expect(REGIA[i - 1].passaggio).toBeLessThanOrEqual(gap)
    }
    // Ogni pallina ha la sua bocca, il suo tubo e la sua vetrina; alla fine la rotaia.
    for (const ripresa of ['bocca', 'inseguimento', 'vetrina'] as const) {
      expect(REGIA.filter((s) => s.ripresa === ripresa).map((s) => s.pallina)).toEqual(PALLINE_MS.map((_, i) => i))
    }
    expect(REGIA[REGIA.length - 1].ripresa).toBe('finale')
    expect(REGIA[staccoDi(-60_000)].ripresa).toBe('studio')
    expect(REGIA[staccoDi(PALLINE_MS[1] + ARRIVO_MS + 500)]).toMatchObject({ ripresa: 'vetrina', pallina: 1 })
    expect(REGIA[staccoDi(DURATA_DIRETTA_MS + 60_000)].ripresa).toBe('finale')
  })
})

describe('i numeri in lettere', () => {
  it('come li dice chi conduce', () => {
    expect(inLettere(1)).toBe('uno')
    expect(inLettere(11)).toBe('undici')
    expect(inLettere(17)).toBe('diciassette')
    expect(inLettere(21)).toBe('ventuno')
    expect(inLettere(23)).toBe('ventitré')
    expect(inLettere(28)).toBe('ventotto')
    expect(inLettere(40)).toBe('quaranta')
    expect(inLettere(47)).toBe('quarantasette')
    expect(inLettere(63)).toBe('sessantatré')
    expect(inLettere(81)).toBe('ottantuno')
    expect(inLettere(88)).toBe('ottantotto')
    expect(inLettere(90)).toBe('novanta')
  })

  it('tutti i novanta, ognuno diverso', () => {
    const tutti = Array.from({ length: 90 }, (_, i) => inLettere(i + 1))
    expect(new Set(tutti).size).toBe(90)
    for (const x of tutti) expect(x).toMatch(/^[a-zé]+$/)
  })
})

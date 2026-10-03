import { describe, expect, it } from 'vitest'
import { CILIEGIE, PREMI, contaSlot, type CombinazioneSlot } from '@shared/slot'
import { MOMENTI, eFesta, momentoDi } from '../momenti'

/** Quante volte la puntata paga ogni combinazione della linea. */
const PREMIO: Record<CombinazioneSlot, number> = {
  C1: CILIEGIE[1],
  C2: CILIEGIE[2],
  C3: CILIEGIE[3],
  L: PREMI.L,
  O: PREMI.O,
  P: PREMI.P,
  U: PREMI.U,
  B: PREMI.B,
  R: PREMI.R,
  '7': PREMI['7'],
}

describe('il momento di una vincita della slot', () => {
  const { combinazioni } = contaSlot()
  const gradino = (c: CombinazioneSlot) => MOMENTI.indexOf(momentoDi(PREMIO[c])!)

  it('cresce con la rarita’: una combinazione piu’ rara non ha mai un momento piu’ piccolo', () => {
    const dallaPiuFrequente = (Object.keys(combinazioni) as CombinazioneSlot[]).sort(
      (a, b) => combinazioni[b] - combinazioni[a],
    )
    for (let i = 1; i < dallaPiuFrequente.length; i += 1) {
      expect(gradino(dallaPiuFrequente[i]), dallaPiuFrequente[i]).toBeGreaterThanOrEqual(
        gradino(dallaPiuFrequente[i - 1]),
      )
    }
  })

  it('la ciliegia sola ha la targhetta, i sette il jackpot, e il jackpot e’ solo loro', () => {
    expect(momentoDi(PREMIO.C1)).toBe('targhetta')
    expect(momentoDi(PREMIO['7'])).toBe('jackpot')
    const jackpot = (Object.keys(PREMIO) as CombinazioneSlot[]).filter((c) => momentoDi(PREMIO[c]) === 'jackpot')
    expect(jackpot).toEqual(['7'])
  })

  it('ogni gradino ha la sua vincita, e la festa comincia dal ×20', () => {
    const usati = new Set((Object.keys(PREMIO) as CombinazioneSlot[]).map((c) => momentoDi(PREMIO[c])))
    expect([...usati].sort()).toEqual([...MOMENTI].sort())
    expect(eFesta(momentoDi(CILIEGIE[3])!)).toBe(true)
    expect(eFesta(momentoDi(PREMI.P)!)).toBe(false)
    expect(momentoDi(0)).toBeNull()
  })
})

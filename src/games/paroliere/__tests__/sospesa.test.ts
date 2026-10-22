import { describe, expect, it } from 'vitest'
import { daTestoParoliere, dettaglioParoliere, inTestoParoliere, type PartitaParoliereSalvata } from '../sospesa'

const PARTITA: PartitaParoliereSalvata = {
  lato: 4,
  tempoMs: 180_000,
  griglia: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'l', 'm', 'n', 'o', 'p', 'qu', 'r'],
  trovate: ['casa', 'mare'],
  rimastiMs: 80_000,
}

describe('il Paroliere libero in sospeso', () => {
  it('ritrova i dadi, le parole e il tempo che restava', () => {
    expect(daTestoParoliere(inTestoParoliere(PARTITA))).toEqual(PARTITA)
  })

  it('il salvataggio resta piccolo', () => {
    expect(inTestoParoliere(PARTITA).length).toBeLessThan(400)
  })

  it('un salvataggio rovinato non e una partita', () => {
    expect(daTestoParoliere(null)).toBeNull()
    expect(daTestoParoliere('[]')).toBeNull()
    expect(daTestoParoliere(JSON.stringify({ ...PARTITA, griglia: ['a'] }))).toBeNull()
    expect(daTestoParoliere(JSON.stringify({ ...PARTITA, lato: 6 }))).toBeNull()
  })

  it('il tempo che resta sta fra zero e il tempo della partita', () => {
    expect(daTestoParoliere(JSON.stringify({ ...PARTITA, rimastiMs: -5 }))?.rimastiMs).toBe(0)
    expect(daTestoParoliere(JSON.stringify({ ...PARTITA, rimastiMs: 1e9 }))?.rimastiMs).toBe(180_000)
  })

  it('il biglietto dice la griglia, il tempo e le parole', () => {
    expect(dettaglioParoliere(PARTITA)).toBe('Quattro per quattro · 1:20 · 2 parole')
  })
})

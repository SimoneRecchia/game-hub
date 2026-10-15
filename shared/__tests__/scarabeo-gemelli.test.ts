import { describe, expect, it } from 'vitest'
import { JOLLY, VALORI, leggiiDa, sacchettoDaSeme, type Mossa } from '../scarabeo'
import { MOSSE_GEMELLE, gruppoDi, leggiiGemelli, leggiiGemelliDa, leggioBuono } from '../scarabeo-gemelli'

const valore = (leggio: readonly string[]) => leggio.reduce((s, t) => s + (t === JOLLY ? 0 : VALORI[t]), 0)
const vocali = (leggio: readonly string[]) => leggio.filter((t) => 'aeiou'.includes(t)).length

describe('i leggii gemelli della classificata', () => {
  const mani = Array.from({ length: 300 }, (_, g) =>
    Array.from({ length: MOSSE_GEMELLE }, (_, turno) => leggiiGemelli(g + 1, turno)),
  ).flat()

  it('hanno le stesse vocali, le stesse consonanti, lo stesso jolly e gli stessi punti', () => {
    for (const [mio, suo] of mani) {
      expect(mio).toHaveLength(8)
      expect(suo).toHaveLength(8)
      expect(valore(suo)).toBe(valore(mio))
      expect(vocali(suo)).toBe(vocali(mio))
      expect(suo.map(gruppoDi)).toEqual(mio.map(gruppoDi))
    }
  })

  it('non sono le stesse lettere', () => {
    const uguali = mani.filter(([mio, suo]) => [...mio].sort().join() === [...suo].sort().join())
    expect(uguali.length).toBeLessThan(mani.length / 100)
  })

  it('si giocano: da tre a cinque vocali, e mai la Q senza la U', () => {
    for (const [mio, suo] of mani) {
      for (const leggio of [mio, suo]) {
        expect(leggioBuono(leggio), leggio.join('')).toBe(true)
        expect(vocali(leggio)).toBeGreaterThanOrEqual(3)
        expect(vocali(leggio)).toBeLessThanOrEqual(5)
        if (leggio.includes('q')) expect(leggio).toContain('u')
      }
    }
    expect(leggioBuono(['q', 'a', 'e', 'i', 'r', 's', 't', 'l'])).toBe(false)
    expect(leggioBuono(['q', 'u', 'a', 'e', 'r', 's', 't', 'l'])).toBe(true)
    expect(leggioBuono(['a', 'e', 'r', 's', 't', 'l', 'n', 'c'])).toBe(false)
  })

  it('dipendono solo dal giorno e dal turno, non da come si e’ giocato', () => {
    const posa: Mossa = { tipo: 'posa', posa: [{ r: 7, c: 7, lettera: 'a', jolly: false }] }
    const passo: Mossa = { tipo: 'passo' }
    expect(leggiiGemelliDa(40, [posa, passo, passo])).toEqual(leggiiGemelliDa(40, [passo, posa, posa]))
    const { leggii, restanti } = leggiiGemelliDa(40, [passo, passo, passo])
    // Chi ha fatto due mosse ha la mano del terzo turno, l'altro quella del secondo.
    expect(leggii).toEqual([leggiiGemelli(40, 2)[0], leggiiGemelli(40, 1)[1]])
    expect(restanti).toBe(0)
  })

  it('sono le stesse da un giorno all’altro: cambiarle cambierebbe le giornate passate', () => {
    // Se cade, e' cambiato il generatore delle mani: le giornate gia' giocate avrebbero tessere diverse.
    expect(leggiiGemelli(48, 0).map((l) => l.join(''))).toEqual(['ohimtboc', 'egecspim'])
    expect(leggiiGemelli(48, 4).map((l) => l.join(''))).toEqual(['cahacmre', 'nogincti'])
  })
})

describe('nella partita intera la Q arriva con la U', () => {
  /** Una partita in cui chi tocca cambia tutto il leggio: ogni pesca e' un leggio intero. */
  function cambiTutti(seme: number, qConU: boolean, giri: number) {
    const sacchetto = sacchettoDaSeme(seme)
    const mosse: Mossa[] = []
    const viste: string[][] = []
    for (let i = 0; i < giri; i += 1) {
      const { leggii } = leggiiDa(sacchetto, mosse, 2, qConU)
      viste.push(...leggii)
      mosse.push({ tipo: 'cambio', tessere: [...leggii[i % 2]] })
    }
    return viste
  }

  it('ogni leggio con la Q ha la U', () => {
    let conQ = 0
    for (let seme = 1; seme <= 150; seme += 1) {
      for (const leggio of cambiTutti(seme, true, 12)) {
        if (!leggio.includes('q')) continue
        conQ += 1
        expect(leggio, `seme ${seme}: ${leggio.join('')}`).toContain('u')
      }
    }
    expect(conQ).toBeGreaterThan(100)
  })

  it('senza la regola i sacchetti sono quelli di prima: le partite gia’ giocate non cambiano', () => {
    const soleQ = (qConU: boolean) =>
      Array.from({ length: 150 }, (_, i) => cambiTutti(i + 1, qConU, 12))
        .flat()
        .filter((l) => l.includes('q') && !l.includes('u')).length
    expect(soleQ(false)).toBeGreaterThan(0)
    expect(soleQ(true)).toBe(0)
    // Le prime mani di un sacchetto senza Q sono le stesse con e senza la regola.
    const senzaQ = Array.from({ length: 50 }, (_, i) => i + 1).find(
      (s) => !sacchettoDaSeme(s).slice(0, 16).includes('q'),
    )!
    expect(leggiiDa(sacchettoDaSeme(senzaQ), [], 2, true)).toEqual(leggiiDa(sacchettoDaSeme(senzaQ), [], 2))
  })
})

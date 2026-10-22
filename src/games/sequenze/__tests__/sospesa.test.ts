import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CHIAVE_PARTITA_SEQUENZE, leggiSequenzeSospesa, salvaSequenzeSospesa } from '../useSequenzeLibere'

describe('la partita delle Sequenze lasciata a meta’', () => {
  const dati = new Map<string, string>()
  beforeEach(() => {
    dati.clear()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => dati.get(k) ?? null,
      setItem: (k: string, v: string) => dati.set(k, v),
      removeItem: (k: string) => dati.delete(k),
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('si salva e si rilegge, e se ne va', () => {
    salvaSequenzeSospesa({ livello: 'difficile', seme: 123_456, giuste: 4 })
    expect(leggiSequenzeSospesa()).toEqual({ livello: 'difficile', seme: 123_456, giuste: 4 })
    salvaSequenzeSospesa(null)
    expect(leggiSequenzeSospesa()).toBeNull()
  })

  it('un salvataggio che non si legge non c’e’', () => {
    const rotti = [
      '{',
      '{"livello":"impossibile","seme":1,"giuste":0}',
      '{"livello":"facile","seme":1.5,"giuste":0}',
      '{"livello":"facile","seme":1,"giuste":-1}',
    ]
    for (const rotto of rotti) {
      dati.set(CHIAVE_PARTITA_SEQUENZE, rotto)
      expect(leggiSequenzeSospesa()).toBeNull()
    }
  })
})

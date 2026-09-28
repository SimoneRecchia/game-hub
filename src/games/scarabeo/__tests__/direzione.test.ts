import { describe, expect, it } from 'vitest'
import { CENTRO, LATO, tabelloneVuoto, type Casella, type Posa } from '@shared/scarabeo'
import { direzioneDellaPosa, direzioneNaturale } from '../direzione'

/** Un tabellone con CASA in orizzontale sulla riga centrale, dalla colonna 5. */
function conCasa(): (Casella | null)[] {
  const tab = tabelloneVuoto()
  ;[...'casa'].forEach((lettera, i) => (tab[CENTRO * LATO + 5 + i] = { lettera, jolly: false }))
  return tab
}

const ORIZZONTALE = true
const VERTICALE = false

describe('la direzione della prima tessera', () => {
  it('sotto o sopra una lettera si scrive in verticale, prima o dopo la parola in orizzontale', () => {
    const tab = conCasa()
    expect(direzioneNaturale(tab, CENTRO + 1, 5, false, ORIZZONTALE)).toBe(VERTICALE)
    expect(direzioneNaturale(tab, CENTRO - 1, 6, false, ORIZZONTALE)).toBe(VERTICALE)
    // Tre caselle sopra: scendendo si arriva alla parola.
    expect(direzioneNaturale(tab, CENTRO - 3, 7, false, ORIZZONTALE)).toBe(VERTICALE)
    expect(direzioneNaturale(tab, CENTRO, 9, false, VERTICALE)).toBe(ORIZZONTALE)
    expect(direzioneNaturale(tab, CENTRO, 3, false, VERTICALE)).toBe(ORIZZONTALE)
  })

  it('lontano da tutto, o fra due direzioni che valgono uguale, resta quella di prima', () => {
    const tab = conCasa()
    expect(direzioneNaturale(tab, 0, 0, false, VERTICALE)).toBe(VERTICALE)
    expect(direzioneNaturale(tab, 0, 0, false, ORIZZONTALE)).toBe(ORIZZONTALE)
  })

  it('alla prima mossa conta la stella', () => {
    const vuoto = tabelloneVuoto()
    expect(direzioneNaturale(vuoto, CENTRO - 2, CENTRO, true, ORIZZONTALE)).toBe(VERTICALE)
    expect(direzioneNaturale(vuoto, CENTRO, CENTRO - 4, true, VERTICALE)).toBe(ORIZZONTALE)
    expect(direzioneNaturale(vuoto, CENTRO, CENTRO, true, VERTICALE)).toBe(VERTICALE)
  })
})

describe('la direzione con delle tessere gia’ posate', () => {
  const t = (r: number, c: number): Posa => ({ r, c, lettera: 'a', jolly: false })

  it('la dice la riga o la colonna della casella toccata', () => {
    expect(direzioneDellaPosa([t(3, 3)], 3, 6)).toBe(ORIZZONTALE)
    expect(direzioneDellaPosa([t(3, 3)], 5, 3)).toBe(VERTICALE)
    expect(direzioneDellaPosa([t(3, 3), t(4, 3)], 6, 3)).toBe(VERTICALE)
  })

  it('non la dice una tessera sola, o una casella fuori dalla linea', () => {
    expect(direzioneDellaPosa([])).toBeNull()
    expect(direzioneDellaPosa([t(3, 3)])).toBeNull()
    expect(direzioneDellaPosa([t(3, 3)], 5, 5)).toBeNull()
    expect(direzioneDellaPosa([t(3, 3), t(3, 4)], 5, 5)).toBeNull()
    expect(direzioneDellaPosa([t(3, 3), t(3, 4)])).toBe(ORIZZONTALE)
  })
})

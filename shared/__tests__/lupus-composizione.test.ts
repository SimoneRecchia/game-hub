import { describe, expect, it } from 'vitest'
import {
  GIOCATORI_MASSIMI,
  GIOCATORI_MINIMI,
  carteTotali,
  composizioneAutomatica,
  controllaComposizione,
  lupiPer,
} from '../lupus-composizione'

describe('la composizione automatica', () => {
  it('in otto: cinque villici, due lupi e il Veggente, come dice il regolamento', () => {
    expect(composizioneAutomatica(8)).toEqual({ lupo: 2, veggente: 1, villico: 5 })
  })

  it('aggiunge i personaggi speciali alle soglie del regolamento', () => {
    expect(composizioneAutomatica(9).medium).toBe(1)
    expect(composizioneAutomatica(10).indemoniato).toBe(1)
    expect(composizioneAutomatica(11).guardia).toBe(1)
    expect(composizioneAutomatica(12).gufo).toBe(1)
    expect(composizioneAutomatica(13).massone).toBe(2)
    expect(composizioneAutomatica(15).criceto).toBe(1)
    expect(composizioneAutomatica(16).mitomane).toBe(1)
    expect(composizioneAutomatica(12).massone).toBeUndefined()
  })

  it('aggiunge il terzo lupo da sedici giocatori', () => {
    expect(lupiPer(15)).toBe(2)
    expect(lupiPer(16)).toBe(3)
    expect(lupiPer(40)).toBe(4)
  })

  it('con pochi giocatori usa un lupo solo', () => {
    expect(composizioneAutomatica(5)).toEqual({ lupo: 1, veggente: 1, villico: 3 })
  })

  it('ha sempre tante carte quanti giocatori, e almeno un villico', () => {
    for (let n = GIOCATORI_MINIMI; n <= GIOCATORI_MASSIMI; n += 1) {
      const c = composizioneAutomatica(n)
      expect(carteTotali(c)).toBe(n)
      expect(c.villico).toBeGreaterThan(0)
      expect(controllaComposizione(c, n).filter((x) => x.livello === 'errore')).toEqual([])
    }
  })
})

describe('il controllo della composizione', () => {
  it('segnala le carte che mancano', () => {
    const problemi = controllaComposizione({ lupo: 2, villico: 3 }, 8)
    expect(problemi.some((x) => x.messaggio.includes('Mancano 3'))).toBe(true)
  })

  it('rifiuta i Massoni spaiati', () => {
    const problemi = controllaComposizione({ lupo: 2, massone: 1, villico: 5 }, 8)
    expect(problemi.some((x) => x.messaggio.includes('coppia'))).toBe(true)
  })

  it('rifiuta una partita senza lupi, o gia’ finita', () => {
    expect(controllaComposizione({ villico: 8 }, 8).some((x) => x.livello === 'errore')).toBe(true)
    expect(controllaComposizione({ lupo: 4, villico: 4 }, 8).some((x) => x.livello === 'errore')).toBe(true)
  })
})

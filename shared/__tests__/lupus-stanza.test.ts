import { describe, expect, it } from 'vitest'
import { IMPOSTAZIONI_LUPUS } from '../lupus'
import {
  AzioneNonValida,
  IMPOSTAZIONI_STANZA_LUPUS,
  azioneDelGiocatore,
  codiceDaTesto,
  codiceLupusValido,
  composizioneValida,
  impostazioniStanzaValide,
  regoleValide,
} from '../lupus-stanza'

describe('quel che arriva da un telefono', () => {
  it('l’azione e’ sempre di chi la manda, anche se dice un altro', () => {
    expect(azioneDelGiocatore({ tipo: 'voto', giocatore: 'altro', bersaglio: 'p3' }, 'io', false)).toEqual({
      tipo: 'voto',
      giocatore: 'io',
      bersaglio: 'p3',
    })
    expect(azioneDelGiocatore({ tipo: 'ruolo_visto', giocatore: 'altro' }, 'io', false)).toEqual({
      tipo: 'ruolo_visto',
      giocatore: 'io',
    })
    expect(
      azioneDelGiocatore({ tipo: 'notte', scelta: { tipo: 'indica', bersaglio: 'p2' } }, 'io', false),
    ).toEqual({ tipo: 'notte', giocatore: 'io', scelta: { tipo: 'indica', bersaglio: 'p2' } })
    expect(azioneDelGiocatore({ tipo: 'benvenuto', rivela: 'si' }, 'io', false)).toEqual({
      tipo: 'benvenuto',
      giocatore: 'io',
    })
  })

  it('"avanti" solo da chi puo’ mandare avanti, e niente di sconosciuto', () => {
    expect(() => azioneDelGiocatore({ tipo: 'avanti' }, 'io', false)).toThrow(AzioneNonValida)
    expect(azioneDelGiocatore({ tipo: 'avanti' }, 'io', true)).toEqual({ tipo: 'avanti' })
    expect(() => azioneDelGiocatore({ tipo: 'fine' }, 'io', true)).toThrow(AzioneNonValida)
    expect(() => azioneDelGiocatore(null, 'io', true)).toThrow(AzioneNonValida)
    expect(() => azioneDelGiocatore({ tipo: 'notte', scelta: { tipo: 'indica' } }, 'io', true)).toThrow(
      AzioneNonValida,
    )
    expect(() => azioneDelGiocatore({ tipo: 'voto', bersaglio: 3 }, 'io', true)).toThrow(AzioneNonValida)
  })

  it('le regole tengono quel che c’era dove il valore non va, e i tempi stanno nei limiti', () => {
    expect(regoleValide({})).toEqual(IMPOSTAZIONI_LUPUS)
    const r = regoleValide({
      fantasmiVotano: false,
      gufoLetale: 'forse',
      secondiDiscussione: 99_999,
      secondiArringhe: -4,
    })
    expect(r.fantasmiVotano).toBe(false)
    expect(r.gufoLetale).toBe(IMPOSTAZIONI_LUPUS.gufoLetale)
    expect(r.secondiDiscussione).toBe(30 * 60)
    expect(r.secondiArringhe).toBe(0)
  })

  it('un mazzo scelto a mano ha solo personaggi veri, in numeri interi', () => {
    expect(composizioneValida({ lupo: 2, villico: 3.5, drago: 1, veggente: 1, gufo: -1 })).toEqual({
      lupo: 2,
      veggente: 1,
    })
    expect(composizioneValida({})).toBeNull()
    expect(composizioneValida([1, 2])).toBeNull()
    expect(composizioneValida(null)).toBeNull()
  })

  it('le impostazioni cambiano solo dove arriva qualcosa', () => {
    const prima = { ...IMPOSTAZIONI_STANZA_LUPUS, composizione: { lupo: 1, villico: 3 } }
    expect(impostazioniStanzaValide({ regole: { fantasmiVotano: false } }, prima)).toEqual({
      regole: { ...IMPOSTAZIONI_LUPUS, fantasmiVotano: false },
      composizione: { lupo: 1, villico: 3 },
    })
    // null torna al mazzo del regolamento.
    expect(impostazioniStanzaValide({ composizione: null }, prima).composizione).toBeNull()
  })

  it('i codici sono quattro lettere senza I e O, e si scrivono come si vuole', () => {
    expect(codiceLupusValido('ABCD')).toBe(true)
    expect(codiceLupusValido('ABIO')).toBe(false)
    expect(codiceLupusValido('abcd')).toBe(false)
    expect(codiceDaTesto(' ab cd ')).toBe('ABCD')
  })
})

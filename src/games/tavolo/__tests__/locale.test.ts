import { beforeEach, describe, expect, it } from 'vitest'
import { regoleDi } from '@shared/tavolo-regole'
import {
  abbandona,
  cominciata,
  conta,
  leggiConti,
  leggiPartita,
  leggiScelta,
  leggiVariante,
  nuovaPartita,
  salvaPartita,
  salvaScelta,
  salvaVariante,
  ultimoLivello,
} from '../locale'

/** Il localStorage del browser, in memoria: nei test gira Node, che non ce l'ha. */
function memoria(): Storage {
  const dati = new Map<string, string>()
  return {
    get length() {
      return dati.size
    },
    clear: () => dati.clear(),
    getItem: (k) => dati.get(k) ?? null,
    key: (i) => [...dati.keys()][i] ?? null,
    removeItem: (k) => void dati.delete(k),
    setItem: (k, v) => void dati.set(k, String(v)),
  }
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { value: memoria(), configurable: true })
})

describe('le partite contro il computer, nel telefono', () => {
  it('una partita nuova si salva e si riprende', () => {
    const p = nuovaPartita('forza4', 'difficile', 'seconda')
    expect(p).toMatchObject({ gioco: 'forza4', livello: 'difficile', mia: 1, mosse: [], esito: null })
    expect(p.posizione).toBe(regoleDi('forza4').iniziale)
    expect(leggiPartita('forza4')).toEqual(p)
    // Ogni gioco ha la sua.
    expect(leggiPartita('scacchi')).toBeNull()
    expect(ultimoLivello('forza4')).toBe('difficile')
    expect(ultimoLivello('dama')).toBe('normale')
  })

  it('una partita salvata che non e’ piu’ una posizione valida non si riapre', () => {
    const p = nuovaPartita('forza4', 'normale', 'prima')
    salvaPartita({ ...p, posizione: 'niente' })
    expect(leggiPartita('forza4')).toBeNull()
  })

  it('a partita finita il risultato entra nel conto del livello, una volta sola', () => {
    const p = nuovaPartita('forza4', 'facile', 'prima')
    const vinta = conta({ ...p, esito: { vincitore: 0, motivo: 'forza4' } })
    expect(vinta.contata).toBe(true)
    expect(conta(vinta)).toBe(vinta)
    expect(leggiConti('forza4').facile).toEqual({ vinte: 1, perse: 0, patte: 0 })

    const patta = conta({ ...nuovaPartita('forza4', 'facile', 'prima'), esito: { vincitore: null, motivo: 'pieno' } })
    expect(patta.contata).toBe(true)
    expect(leggiConti('forza4').facile).toEqual({ vinte: 1, perse: 0, patte: 1 })
    expect(leggiConti('forza4').normale).toEqual({ vinte: 0, perse: 0, patte: 0 })
  })

  it('lasciare una partita a meta’ e’ perderla', () => {
    const p = nuovaPartita('forza4', 'normale', 'seconda')
    // Col secondo colore la prima mossa e' del computer: prima della mia la partita non e' cominciata.
    expect(cominciata({ ...p, mosse: ['3'] })).toBe(false)
    expect(cominciata({ ...p, mosse: ['3', '4'] })).toBe(true)
    const lasciata = abbandona({ ...p, mosse: ['3', '4'] })
    expect(lasciata.esito).toEqual({ vincitore: 0, motivo: 'resa' })
    expect(leggiConti('forza4').normale.perse).toBe(1)
  })

  it('nel go il goban scelto vale per le partite nuove', () => {
    expect(leggiVariante('go')).toBe('9')
    expect(leggiVariante('scacchi')).toBeNull()
    salvaVariante('go', '13')
    expect(nuovaPartita('go', 'facile', 'prima').posizione.startsWith('13:')).toBe(true)
    // Una variante che non c'e' torna alla prima.
    salvaVariante('go', '11')
    expect(leggiVariante('go')).toBe('9')
    expect(nuovaPartita('go', 'facile', 'prima', '19').posizione.startsWith('19:')).toBe(true)
  })

  it('la scelta del colore resta', () => {
    expect(leggiScelta('dama')).toBe('prima')
    salvaScelta('dama', 'caso')
    expect(leggiScelta('dama')).toBe('caso')
    const p = nuovaPartita('dama', 'normale', 'caso')
    expect([0, 1]).toContain(p.mia)
  })
})

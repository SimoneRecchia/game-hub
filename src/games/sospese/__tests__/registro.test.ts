import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SOSPESA_MS } from '@shared/sospese'

const chiamate: Array<{ percorso: string; body?: unknown }> = []
vi.mock('@/lib/api', () => ({
  api: (percorso: string, opzioni: { body?: unknown } = {}) => {
    chiamate.push({ percorso, body: opzioni.body })
    return Promise.resolve(undefined)
  },
}))

const { chiudiSospesa, lasciaSospesa, leggiSospese, riprendiSospesa, segnaSospesa, sospesaDi } = await import(
  '../registro'
)

/** Il localStorage e la finestra del browser, in memoria: nei test gira Node, che non ce li ha. */
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

const eventi = () => chiamate.filter((c) => c.percorso === '/libere/sospese').map((c) => (c.body as { evento: string }).evento)

beforeEach(() => {
  vi.stubGlobal('localStorage', memoria())
  vi.stubGlobal('window', new EventTarget())
  chiamate.length = 0
  vi.useRealTimers()
})

describe('il registro delle libere in sospeso', () => {
  it('una partita comincia una volta, si riprende e finisce', () => {
    segnaSospesa('sudoku', { a: '/sudoku/libera', dettaglio: 'Facile', chiavi: ['giochi.sudoku.libera'] })
    segnaSospesa('sudoku', { a: '/sudoku/libera', dettaglio: 'Facile · 3:00' })
    expect(sospesaDi('sudoku')).toMatchObject({ dettaglio: 'Facile · 3:00', chiavi: ['giochi.sudoku.libera'] })
    riprendiSospesa('sudoku')
    chiudiSospesa('sudoku')
    expect(sospesaDi('sudoku')).toBeNull()
    expect(eventi()).toEqual(['inizio', 'ripresa', 'finita'])
  })

  it('lasciata dalle Libere, se ne va anche il salvataggio, e sul server la partita si chiude', () => {
    localStorage.setItem('giochi.sudoku.libera', '{}')
    segnaSospesa('sudoku', { a: '/sudoku/libera', chiavi: ['giochi.sudoku.libera'] })
    segnaSospesa('wordle', { a: '/wordle/libera', chiudi: '/wordle/libera/w1/lascia' })
    lasciaSospesa('sudoku')
    lasciaSospesa('wordle')
    expect(localStorage.getItem('giochi.sudoku.libera')).toBeNull()
    expect(leggiSospese()).toEqual([])
    expect(chiamate.map((c) => c.percorso)).toContain('/wordle/libera/w1/lascia')
    expect(eventi()).toEqual(['inizio', 'inizio', 'annullata', 'annullata'])
  })

  it('dopo tre giorni senza aprirla scade, con il suo salvataggio', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-20T10:00:00Z'))
    localStorage.setItem('giochi.scarabeo.libera', '{}')
    segnaSospesa('scarabeo', { a: '/scarabeo/libera', chiavi: ['giochi.scarabeo.libera'] })
    segnaSospesa('sudoku', { a: '/sudoku/libera' })
    vi.setSystemTime(new Date(Date.parse('2026-10-20T10:00:00Z') + SOSPESA_MS - 1000))
    riprendiSospesa('sudoku')
    vi.setSystemTime(new Date(Date.parse('2026-10-20T10:00:00Z') + SOSPESA_MS + 1000))
    expect(leggiSospese().map((s) => s.gioco)).toEqual(['sudoku'])
    expect(localStorage.getItem('giochi.scarabeo.libera')).toBeNull()
    expect(eventi()).toEqual(['inizio', 'inizio', 'ripresa', 'scaduta'])
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'

const risposta = vi.hoisted(() => ({ valore: null as unknown }))
vi.mock('@/lib/api', () => ({
  api: vi.fn(async () => {
    if (risposta.valore instanceof Error) throw risposta.valore
    return risposta.valore
  }),
}))
vi.mock('@shared/daily', async (originale) => ({
  ...(await originale<typeof import('@shared/daily')>()),
  gameDate: () => '2026-03-15',
}))

import { giornoACaso, giornoDellaPartita } from '../fonti'

afterEach(() => {
  risposta.valore = null
})

describe('il giorno di "Accadde oggi" fuori dalla classificata', () => {
  it('un giorno a caso non e’ mai oggi, e ha l’anno di oggi', () => {
    for (let i = 0; i < 2000; i += 1) {
      const g = giornoACaso('2026-03-15')
      expect(g).toMatch(/^2026-\d{2}-\d{2}$/)
      expect(g.slice(5)).not.toBe('03-15')
    }
  })

  it('arriva a tutti i giorni dell’anno, anche al 29 febbraio', () => {
    const visti = new Set<string>()
    for (let i = 0; i < 20000; i += 1) visti.add(giornoACaso('2026-03-15').slice(5))
    expect(visti.size).toBe(365)
    expect(visti.has('02-29')).toBe(true)
  })

  it('oggi, se la classificata di oggi e’ di un’altra categoria', async () => {
    risposta.valore = { categoria: 'capitali', status: 'nuova' }
    expect(await giornoDellaPartita(undefined, false)).toBe('2026-03-15')
    expect(await giornoDellaPartita(undefined, true)).toBe('2026-03-15')
  })

  it('un altro giorno, se oggi la classificata e’ proprio "Accadde oggi" e non e’ chiusa', async () => {
    risposta.valore = { categoria: 'oggi', status: 'playing' }
    expect((await giornoDellaPartita(undefined, false)).slice(5)).not.toBe('03-15')
  })

  it('a classificata chiusa la libera gioca oggi, la sfida no', async () => {
    risposta.valore = { categoria: 'oggi', status: 'done' }
    expect(await giornoDellaPartita(undefined, false)).toBe('2026-03-15')
    expect((await giornoDellaPartita(undefined, true)).slice(5)).not.toBe('03-15')
  })

  it('senza rete gioca oggi, e "a caso" e’ sempre a caso', async () => {
    risposta.valore = new Error('rete')
    expect(await giornoDellaPartita(undefined, false)).toBe('2026-03-15')
    risposta.valore = { categoria: 'capitali', status: 'nuova' }
    expect((await giornoDellaPartita('caso', false)).slice(5)).not.toBe('03-15')
  })
})

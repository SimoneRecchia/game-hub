import { describe, expect, it } from 'vitest'
import { streaksByPlayer } from '../lib/leaderboard'

/** Aiuto: costruisce le righe delle vittorie da una mappa nickname → puzzle. */
function wins(map: Record<string, number[]>) {
  return Object.entries(map).flatMap(([player_id, numbers]) =>
    numbers.map((puzzle_number) => ({ player_id, puzzle_number })),
  )
}

const TODAY = 100

describe('streak dei giocatori', () => {
  it('conta i giorni consecutivi fino a oggi', () => {
    const s = streaksByPlayer(wins({ a: [97, 98, 99, 100] }), TODAY, new Set())
    expect(s.get('a')).toEqual({ current: 4, best: 4 })
  })

  it('resta viva se non si e ancora giocato oggi', () => {
    // L'ultima vittoria e' di ieri: la giornata e' ancora aperta, la catena no
    // si azzera a mezzanotte.
    const s = streaksByPlayer(wins({ a: [98, 99] }), TODAY, new Set())
    expect(s.get('a')?.current).toBe(2)
  })

  it('si spezza se si e saltato un giorno', () => {
    const s = streaksByPlayer(wins({ a: [96, 97, 98] }), TODAY, new Set())
    expect(s.get('a')).toEqual({ current: 0, best: 3 })
  })

  it('si spezza se oggi si e giocato e perso', () => {
    // Senza questo caso chi perde continuerebbe a mostrare la streak di ieri
    // per tutta la giornata.
    const s = streaksByPlayer(wins({ a: [97, 98, 99] }), TODAY, new Set(['a']))
    expect(s.get('a')).toEqual({ current: 0, best: 3 })
  })

  it('non conta i giorni non consecutivi nella streak corrente', () => {
    const s = streaksByPlayer(wins({ a: [90, 91, 92, 99, 100] }), TODAY, new Set())
    expect(s.get('a')).toEqual({ current: 2, best: 3 })
  })

  it('il record resta anche quando la streak corrente e zero', () => {
    const s = streaksByPlayer(wins({ a: [10, 11, 12, 13, 14] }), TODAY, new Set())
    expect(s.get('a')).toEqual({ current: 0, best: 5 })
  })

  it('tiene i giocatori separati', () => {
    const s = streaksByPlayer(
      wins({ a: [99, 100], b: [100], c: [50] }),
      TODAY,
      new Set(),
    )
    expect(s.get('a')?.current).toBe(2)
    expect(s.get('b')?.current).toBe(1)
    expect(s.get('c')?.current).toBe(0)
  })

  it('non inventa voci per chi non ha vinto nulla', () => {
    expect(streaksByPlayer([], TODAY, new Set()).size).toBe(0)
  })

  it('regge numeri di puzzle non ordinati', () => {
    const s = streaksByPlayer(wins({ a: [100, 98, 99, 97] }), TODAY, new Set())
    expect(s.get('a')).toEqual({ current: 4, best: 4 })
  })
})

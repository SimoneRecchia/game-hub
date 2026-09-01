import { describe, expect, it } from 'vitest'
import { rankPlayers, streaksByPlayer, type PlayerTotals } from '../lib/leaderboard'

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

/** Aiuto: un giocatore con i soli valori che contano per l'ordinamento. */
function player(nickname: string, over: Partial<PlayerTotals> = {}): PlayerTotals {
  return {
    playerId: nickname,
    nickname,
    displayName: nickname,
    avatarColor: '#007aff',
    playScore: 0,
    assistScore: 0,
    assists: 0,
    played: 0,
    wins: 0,
    avgAttempts: null,
    ...over,
  }
}

describe('ordine della classifica', () => {
  it('somma le giornate proprie e quelle in compagnia', () => {
    const [row] = rankPlayers([player('a', { playScore: 80, assistScore: 90, assists: 1 })])
    expect(row.score).toBe(170)
    expect(row.playScore).toBe(80)
    expect(row.assistScore).toBe(90)
  })

  it('mette davanti il totale piu alto, non i soli punti partita', () => {
    const rows = rankPlayers([
      player('gioca', { playScore: 100 }),
      player('aiuta', { playScore: 50, assistScore: 90, assists: 1 }),
    ])
    expect(rows.map((r) => r.nickname)).toEqual(['aiuta', 'gioca'])
  })

  it('a parita di totale passa avanti chi ha giocato piu in compagnia', () => {
    // Lo spareggio: e' il motivo per cui il totale viene diviso.
    const rows = rankPlayers([
      player('solo', { playScore: 160, wins: 2 }),
      player('insieme', { playScore: 80, assistScore: 80, assists: 1, wins: 1 }),
    ])
    expect(rows.map((r) => r.nickname)).toEqual(['insieme', 'solo'])
    expect(rows.map((r) => r.rank)).toEqual([1, 2])
  })

  it('una giornata in compagnia vale come una giocata da soli', () => {
    // La regola che tiene in piedi tutto: se una parola indovinata al terzo
    // tentativo vale ottanta punti, vale ottanta a chi la gioca da solo e
    // ottanta a ciascuno di quelli che la giocano insieme.
    const rows = rankPlayers([
      player('sola', { playScore: 80, played: 1, wins: 1, avgAttempts: 3 }),
      player('host', { playScore: 80, played: 1, wins: 1, avgAttempts: 3 }),
      player('ospite', { assistScore: 80, assists: 1 }),
    ])
    expect(rows.map((r) => r.score)).toEqual([80, 80, 80])
  })

  it('a parita di totale e di assist guarda vittorie e media tentativi', () => {
    const rows = rankPlayers([
      player('lento', { playScore: 100, wins: 2, avgAttempts: 4.5 }),
      player('veloce', { playScore: 100, wins: 2, avgAttempts: 3.1 }),
      player('poche', { playScore: 100, wins: 1, avgAttempts: 2 }),
    ])
    expect(rows.map((r) => r.nickname)).toEqual(['veloce', 'lento', 'poche'])
  })

  it('manda in fondo chi non ha una media tentativi', () => {
    const rows = rankPlayers([
      player('senza', { playScore: 50, avgAttempts: null }),
      player('con', { playScore: 50, avgAttempts: 6 }),
    ])
    expect(rows.map((r) => r.nickname)).toEqual(['con', 'senza'])
  })

  it('a parita completa ordina per nickname, cosi le posizioni non ballano', () => {
    const rows = rankPlayers([player('zeta'), player('alfa'), player('Beta')])
    expect(rows.map((r) => r.nickname)).toEqual(['alfa', 'Beta', 'zeta'])
  })

  it('tiene in classifica chi ha giocato solo in compagnia', () => {
    const rows = rankPlayers([
      player('gioca', { playScore: 50, played: 1 }),
      player('insieme', { assistScore: 90, assists: 1 }),
    ])
    expect(rows[0].nickname).toBe('insieme')
    // Le partite proprie sono zero, e va bene: i tentativi erano dell'host.
    expect(rows[0].played).toBe(0)
  })

  it('non modifica l array ricevuto', () => {
    const input = [player('b', { playScore: 10 }), player('a', { playScore: 90 })]
    rankPlayers(input)
    expect(input.map((p) => p.nickname)).toEqual(['b', 'a'])
  })

  it('regge una classifica vuota', () => {
    expect(rankPlayers([])).toEqual([])
  })
})


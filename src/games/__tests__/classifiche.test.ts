import { describe, expect, it } from 'vitest'
import { indirizzoClassifica, nomeDelPeriodo, percorsoClassifica, percorsoPanoramica } from '../classifiche'
import { puzzleNumberFor } from '@shared/daily'
import { periodoDi } from '@shared/periodi'
import type { LeaderboardScope } from '@shared/types'

const n = puzzleNumberFor
const nome = (scope: LeaderboardScope, oggi: string, indietro = 0) =>
  nomeDelPeriodo(periodoDi(scope, n(oggi), indietro), n(oggi))

describe('il nome di un periodo', () => {
  it('dice oggi e ieri, poi il giorno', () => {
    expect(nome('today', '2026-09-27')).toEqual({ titolo: 'Oggi', sotto: 'domenica 27 settembre' })
    expect(nome('today', '2026-09-27', 1)).toEqual({ titolo: 'Ieri', sotto: 'sabato 26 settembre' })
    expect(nome('today', '2026-09-27', 2)).toEqual({ titolo: 'Venerdì 25 settembre', sotto: null })
  })

  it('dice le date della settimana, anche a cavallo di due mesi', () => {
    expect(nome('week', '2026-09-27')).toEqual({ titolo: 'Questa settimana', sotto: '21–27 settembre' })
    expect(nome('week', '2026-09-27', 1)).toEqual({ titolo: 'La settimana scorsa', sotto: '14–20 settembre' })
    expect(nome('week', '2026-09-27', 4)).toEqual({ titolo: '24–30 agosto', sotto: null })
    expect(nome('week', '2026-10-02')).toEqual({ titolo: 'Questa settimana', sotto: '28 settembre – 4 ottobre' })
  })

  it('mette l’anno solo quando non è quello di oggi', () => {
    expect(nome('week', '2027-01-02')).toEqual({ titolo: 'Questa settimana', sotto: '28 dicembre 2026 – 3 gennaio 2027' })
    expect(nome('month', '2027-01-15', 1)).toEqual({ titolo: 'Dicembre 2026', sotto: 'Il mese scorso' })
    expect(nome('today', '2027-01-01', 1)).toEqual({ titolo: 'Ieri', sotto: 'giovedì 31 dicembre 2026' })
  })

  it('dice il mese, e da quando si gioca', () => {
    expect(nome('month', '2026-09-27')).toEqual({ titolo: 'Settembre', sotto: 'Questo mese' })
    expect(nome('month', '2026-10-27', 2)).toEqual({ titolo: 'Agosto', sotto: null })
    expect(nome('all', '2026-09-27')).toEqual({ titolo: 'Da sempre', sotto: 'Dal 29 agosto 2026' })
  })
})

describe('gli indirizzi delle classifiche', () => {
  it('non scrivono il periodo di sempre, oggi', () => {
    expect(indirizzoClassifica(null, 'today')).toBe('/classifica')
    expect(indirizzoClassifica('generale', 'today')).toBe('/classifica/generale')
    expect(indirizzoClassifica('battaglia', 'week', 2)).toBe('/classifica/battaglia-navale?periodo=week&indietro=2')
    expect(indirizzoClassifica(null, 'today', 1)).toBe('/classifica?indietro=1')
  })

  it('chiedono al server il periodo giusto', () => {
    expect(percorsoClassifica('wordle', 'today')).toBe('/leaderboard?scope=today')
    expect(percorsoClassifica('quiz', 'month', 1)).toBe('/leaderboard/quiz?scope=month&indietro=1')
    expect(percorsoPanoramica('all')).toBe('/leaderboard/panoramica?scope=all')
  })
})

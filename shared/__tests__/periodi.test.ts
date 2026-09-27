import { describe, expect, it } from 'vitest'
import { EPOCH_DATE } from '../config'
import { puzzleNumberFor } from '../daily'
import { comprendeOggi, giornoDellaSettimana, indietroMassimo, periodoDi } from '../periodi'

const n = puzzleNumberFor

describe('i periodi delle classifiche', () => {
  // Domenica 27 settembre 2026; il primo giorno di gioco e' sabato 29 agosto.
  const oggi = n('2026-09-27')

  it('contano i giorni della settimana da lunedì', () => {
    expect(giornoDellaSettimana('2026-09-21')).toBe(0)
    expect(giornoDellaSettimana('2026-09-27')).toBe(6)
    expect(giornoDellaSettimana(EPOCH_DATE)).toBe(5)
  })

  it('un giorno è un giorno, e si torna indietro fino al primo', () => {
    expect(periodoDi('today', oggi)).toEqual({ scope: 'today', indietro: 0, massimo: oggi - 1, da: oggi, a: oggi })
    expect(periodoDi('today', oggi, 1)).toMatchObject({ indietro: 1, da: oggi - 1, a: oggi - 1 })
    expect(periodoDi('today', oggi, 999)).toMatchObject({ indietro: oggi - 1, da: 1, a: 1 })
  })

  it('la settimana va da lunedì a domenica, anche quando è appena cominciata', () => {
    expect(periodoDi('week', oggi)).toMatchObject({ da: n('2026-09-21'), a: n('2026-09-27') })
    expect(periodoDi('week', oggi, 1)).toMatchObject({ indietro: 1, da: n('2026-09-14'), a: n('2026-09-20') })
    const lunedi = n('2026-09-28')
    expect(periodoDi('week', lunedi)).toMatchObject({ da: lunedi, a: n('2026-10-04') })
    // Il cambio dell'ora non sposta niente: i giorni sono del calendario.
    expect(periodoDi('week', n('2026-10-27'))).toMatchObject({ da: n('2026-10-26'), a: n('2026-11-01') })
  })

  it('la prima settimana è quella del primo giorno di gioco', () => {
    expect(indietroMassimo('week', oggi)).toBe(4)
    expect(periodoDi('week', oggi, 4)).toMatchObject({ da: n('2026-08-24'), a: n('2026-08-30') })
    expect(periodoDi('week', oggi, 50)).toMatchObject({ indietro: 4, da: n('2026-08-24') })
  })

  it('il mese va dal primo all’ultimo, anche a cavallo dell’anno', () => {
    expect(periodoDi('month', oggi)).toMatchObject({ indietro: 0, massimo: 1, da: n('2026-09-01'), a: n('2026-09-30') })
    expect(periodoDi('month', oggi, 1)).toMatchObject({ da: n('2026-08-01'), a: n('2026-08-31') })
    const gennaio = n('2027-01-15')
    expect(periodoDi('month', gennaio, 1)).toMatchObject({ da: n('2026-12-01'), a: n('2026-12-31') })
    expect(periodoDi('month', n('2027-02-10'))).toMatchObject({ da: n('2027-02-01'), a: n('2027-02-28') })
    expect(indietroMassimo('month', gennaio)).toBe(5)
  })

  it('sempre va dal primo giorno a oggi, e non ha un prima', () => {
    expect(periodoDi('all', oggi, 3)).toEqual({ scope: 'all', indietro: 0, massimo: 0, da: 1, a: oggi })
  })

  it('il primo giorno di gioco non ha niente prima', () => {
    for (const scope of ['today', 'week', 'month', 'all'] as const) expect(indietroMassimo(scope, 1)).toBe(0)
  })

  it('sa se un periodo arriva a oggi', () => {
    expect(comprendeOggi(periodoDi('week', oggi), oggi)).toBe(true)
    expect(comprendeOggi(periodoDi('week', oggi, 1), oggi)).toBe(false)
    expect(comprendeOggi(periodoDi('today', oggi, 1), oggi)).toBe(false)
    expect(comprendeOggi(periodoDi('all', oggi), oggi)).toBe(true)
  })
})

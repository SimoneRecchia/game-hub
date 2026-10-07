import { describe, expect, it } from 'vitest'
import { CENTRO, leggiiDa, sacchettoDaSeme, type Mossa } from '../scarabeo'
import { TURNI_SENZA_PAROLE, statoADue, valoreLeggio } from '../scarabeo-due'

const INTERA = { mosseATesta: null }
const PASSO: Mossa = { tipo: 'passo' }

describe('la partita a due', () => {
  it('si alterna dal primo, otto tessere a testa', () => {
    const sacchetto = sacchettoDaSeme(11)
    const s = statoADue(sacchetto, [], INTERA)
    expect(s.turno).toBe(0)
    expect(s.leggii[0]).toHaveLength(8)
    expect(s.leggii[1]).toHaveLength(8)
    expect(statoADue(sacchetto, [PASSO], INTERA).turno).toBe(1)
  })

  it('sei turni di fila senza parole la fermano, e ognuno perde il valore delle sue tessere', () => {
    const sacchetto = sacchettoDaSeme(12)
    const quasi = statoADue(sacchetto, Array(TURNI_SENZA_PAROLE - 1).fill(PASSO), INTERA)
    expect(quasi.finita).toBe(false)
    const ferma = statoADue(sacchetto, Array(TURNI_SENZA_PAROLE).fill(PASSO), INTERA)
    expect(ferma.finita).toBe(true)
    expect(ferma.fine).toBe('ferma')
    expect(ferma.turno).toBeNull()
    const { leggii } = leggiiDa(sacchetto, [], 2)
    expect(ferma.aggiustamento).toEqual([-valoreLeggio(leggii[0]), -valoreLeggio(leggii[1])])
    expect(ferma.punti).toEqual(ferma.aggiustamento)
  })

  it('una parola rimette a zero il conto dei turni senza parole', () => {
    const sacchetto = sacchettoDaSeme(13)
    const { leggii } = leggiiDa(sacchetto, [], 2)
    const lettere = leggii[0].filter((t) => t !== '*')
    const posa: Mossa = {
      tipo: 'posa',
      posa: [
        { r: CENTRO, c: CENTRO, lettera: lettere[0], jolly: false },
        { r: CENTRO, c: CENTRO + 1, lettera: lettere[1], jolly: false },
      ],
    }
    const mosse = [PASSO, PASSO, PASSO, PASSO, posa, PASSO, PASSO, PASSO, PASSO, PASSO]
    const s = statoADue(sacchetto, mosse, INTERA)
    expect(s.finita).toBe(false)
    expect(statoADue(sacchetto, [...mosse, PASSO], INTERA).fine).toBe('ferma')
  })

  it('con le mosse a testa finisce li’, senza il conto delle tessere', () => {
    const sacchetto = sacchettoDaSeme(14)
    const regole = { mosseATesta: 10 }
    // Venti passi: con il limite della giornata non c'e' la regola dei turni senza parole.
    expect(statoADue(sacchetto, Array(19).fill(PASSO), regole).finita).toBe(false)
    const fine = statoADue(sacchetto, Array(20).fill(PASSO), regole)
    expect(fine.fine).toBe('mosse')
    expect(fine.aggiustamento).toEqual([0, 0])
    expect(fine.mosse).toEqual([10, 10])
  })

  it('il jolly non vale niente nel conto delle tessere', () => {
    expect(valoreLeggio(['a', '*', 'q'])).toBe(11)
  })
})

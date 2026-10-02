import { describe, expect, it } from 'vitest'
import { resa } from '../ruota'
import {
  CILIEGIE,
  PREMI,
  PUNTATA_MASSIMA_SLOT,
  PUNTATA_MINIMA_SLOT,
  RULLI,
  VINCITA_DOMANDA,
  contaSlot,
  deltaSlot,
  finestra,
  lineaDi,
  premioDellaLinea,
  puntataSlotValida,
  righeDellaTripla,
  simboliVincenti,
  triplaDiCategoria,
  type CodiceSlot,
} from '../slot'

const CATEGORIE = ['0', '1', '2', '3', '4', '5']

describe('i rulli della slot', () => {
  it('trenta fermate per rullo, e ogni categoria del giorno una volta sola, a cinque fermate dalle altre', () => {
    for (const rullo of RULLI) {
      expect(rullo).toHaveLength(30)
      const posti = CATEGORIE.map((k) => rullo.indexOf(k as CodiceSlot))
      for (const k of CATEGORIE) expect(rullo.filter((s) => s === k)).toHaveLength(1)
      const ordinati = [...posti].sort((a, b) => a - b)
      for (let i = 0; i < ordinati.length; i += 1) {
        const dopo = i + 1 < ordinati.length ? ordinati[i + 1] : ordinati[0] + rullo.length
        expect(dopo - ordinati[i]).toBe(5)
      }
    }
  })

  it('due simboli uguali non stanno mai vicini, nemmeno fra la fine e l’inizio', () => {
    for (const rullo of RULLI) {
      for (let i = 0; i < rullo.length; i += 1) expect(rullo[i]).not.toBe(rullo[(i + 1) % rullo.length])
    }
  })

  it('i sette sono uno per rullo, e ci sono tutti i simboli che pagano', () => {
    for (const rullo of RULLI) {
      expect(rullo.filter((s) => s === '7')).toHaveLength(1)
      for (const s of ['C', 'L', 'O', 'P', 'B', 'R']) expect(rullo).toContain(s)
    }
  })
})

describe('quel che paga', () => {
  it('tre uguali sulla linea, e le ciliegie contate da sinistra', () => {
    expect(premioDellaLinea(['7', '7', '7'])).toBe(PREMI['7'])
    expect(premioDellaLinea(['R', 'R', 'R'])).toBe(PREMI.R)
    expect(premioDellaLinea(['L', 'L', 'O'])).toBe(0)
    expect(premioDellaLinea(['C', 'L', 'O'])).toBe(CILIEGIE[1])
    expect(premioDellaLinea(['C', 'C', 'O'])).toBe(CILIEGIE[2])
    expect(premioDellaLinea(['C', 'C', 'C'])).toBe(CILIEGIE[3])
    // Una ciliegia che non parte da sinistra non paga.
    expect(premioDellaLinea(['L', 'C', 'C'])).toBe(0)
    // Tre categorie uguali sulla linea non pagano la linea: aprono la domanda.
    expect(premioDellaLinea(['0', '0', '0'])).toBe(0)
    expect(simboliVincenti(['C', 'C', 'O'])).toEqual([0, 1])
    expect(simboliVincenti(['B', 'B', 'B'])).toEqual([0, 1, 2])
    expect(simboliVincenti(['L', 'O', 'P'])).toEqual([])
  })

  it('la finestra ha tre righe, e la fermata sta in mezzo; i rulli girano in tondo', () => {
    const f = finestra([0, 0, 0])
    expect(f[1]).toEqual(lineaDi([0, 0, 0]))
    expect(f[0]).toEqual([RULLI[0][29], RULLI[1][29], RULLI[2][29]])
    expect(lineaDi([30, -1, 31])).toEqual(lineaDi([0, 29, 1]))
  })

  it('la tripla di una categoria vale dovunque nella finestra, una per rullo', () => {
    // Il primo rullo ha la categoria 0 in cima, il secondo in mezzo, il terzo in fondo.
    const fermate = [1, 10, 4]
    expect(triplaDiCategoria(fermate)).toBe(0)
    expect(righeDellaTripla(fermate, 0)).toEqual([0, 1, 2])
    // Due su tre non bastano.
    expect(triplaDiCategoria([1, 10, 9])).toBeNull()
  })

  it('una vincita restituisce la puntata moltiplicata, in punti interi', () => {
    expect(deltaSlot(5, 0)).toBe(-5)
    expect(deltaSlot(5, 2)).toBe(5)
    expect(deltaSlot(10, PREMI['7'])).toBe(2990)
    expect(deltaSlot(3, VINCITA_DOMANDA)).toBe(87)
  })

  it('si punta da uno a dieci, e mai piu’ del saldo', () => {
    expect(PUNTATA_MINIMA_SLOT).toBe(1)
    expect(PUNTATA_MASSIMA_SLOT).toBe(10)
    expect(puntataSlotValida(1, 1)).toBe(true)
    expect(puntataSlotValida(7, 100)).toBe(true)
    expect(puntataSlotValida(10, 9)).toBe(false)
    expect(puntataSlotValida(11, 100)).toBe(false)
    expect(puntataSlotValida(0, 100)).toBe(false)
    expect(puntataSlotValida(2.5, 100)).toBe(false)
  })
})

describe('la resa della slot', () => {
  const conto = contaSlot(1)

  it('a chi risponde sempre giusto, e’ quella di Crazy Time: nessun gioco della Fortuna conviene di piu’', () => {
    expect(conto.resa).toBeCloseTo(0.97, 10)
    expect(Math.abs(conto.resa - resa(1))).toBeLessThan(0.001)
    // Senza le domande la linea da sola rende il 79%: le domande sono un sesto della resa, come i bonus delle
    // slot vere.
    expect(conto.linea).toBeCloseTo(0.79, 10)
    expect(contaSlot(0).resa).toBeCloseTo(conto.linea, 10)
  })

  it('si vince di rado e quasi sempre poco: una volta ogni sei o sette giri', () => {
    expect(conto.frequenza).toBeGreaterThan(0.13)
    expect(conto.frequenza).toBeLessThan(0.17)
    // Una ciliegia sola e' piu' della meta' delle vincite.
    const [n0, n1] = RULLI.map((r) => r.length)
    const ciliegiaSola =
      (RULLI[0].filter((s) => s === 'C').length / n0) * (1 - RULLI[1].filter((s) => s === 'C').length / n1)
    expect(ciliegiaSola / conto.frequenza).toBeGreaterThan(0.5)
  })

  it('ma quando si vince grosso, si vince tanto: i sette una volta ogni ventisettemila, per trecento', () => {
    expect(1 / conto.sette).toBeCloseTo(27_000, 6)
    expect(PREMI['7']).toBe(300)
    // La domanda esce una volta ogni centosessantasette giri circa: abbastanza da vederla in una sera.
    expect(conto.domanda).toBeCloseTo(6 / 1000, 10)
  })
})

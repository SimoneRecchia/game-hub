import { describe, expect, it } from 'vitest'
import { resa } from '../ruota'
import {
  CILIEGIE,
  PREMI,
  PUNTATA_MASSIMA_SLOT,
  PUNTATA_MINIMA_SLOT,
  RULLI,
  VINCITA_DOMANDA,
  apreDomanda,
  contaSlot,
  deltaSlot,
  finestra,
  lineaDi,
  premioDellaLinea,
  puntataSlotValida,
  righeDelleDomande,
  simboliVincenti,
  vincitaDellaLinea,
} from '../slot'

describe('i rulli della slot', () => {
  it('quaranta fermate per rullo, e i punti di domanda abbastanza lontani da vederne uno solo per rullo', () => {
    for (const rullo of RULLI) {
      expect(rullo).toHaveLength(40)
      const posti = rullo.flatMap((s, i) => (s === 'Q' ? [i] : []))
      for (let i = 0; i < posti.length; i += 1) {
        const dopo = i + 1 < posti.length ? posti[i + 1] : posti[0] + rullo.length
        expect(dopo - posti[i]).toBeGreaterThanOrEqual(3)
      }
    }
    expect(RULLI.map((r) => r.filter((s) => s === 'Q').length)).toEqual([4, 4, 3])
  })

  it('due simboli uguali non stanno mai vicini, nemmeno fra la fine e l’inizio', () => {
    for (const rullo of RULLI) {
      for (let i = 0; i < rullo.length; i += 1) expect(rullo[i]).not.toBe(rullo[(i + 1) % rullo.length])
    }
  })

  it('i sette sono uno per rullo, e ci sono tutti i simboli che pagano', () => {
    for (const rullo of RULLI) {
      expect(rullo.filter((s) => s === '7')).toHaveLength(1)
      for (const s of ['C', 'L', 'O', 'P', 'U', 'B', 'R']) expect(rullo).toContain(s)
    }
  })
})

describe('quel che paga', () => {
  it('tre uguali sulla linea, e le ciliegie dovunque stiano', () => {
    expect(premioDellaLinea(['7', '7', '7'])).toBe(PREMI['7'])
    expect(premioDellaLinea(['R', 'R', 'R'])).toBe(PREMI.R)
    expect(premioDellaLinea(['U', 'U', 'U'])).toBe(PREMI.U)
    expect(premioDellaLinea(['L', 'L', 'O'])).toBe(0)
    expect(premioDellaLinea(['C', 'L', 'O'])).toBe(CILIEGIE[1])
    expect(premioDellaLinea(['L', 'O', 'C'])).toBe(CILIEGIE[1])
    expect(premioDellaLinea(['C', 'O', 'C'])).toBe(CILIEGIE[2])
    expect(premioDellaLinea(['C', 'C', 'C'])).toBe(CILIEGIE[3])
    // Tre punti di domanda sulla linea non pagano la linea: aprono la domanda.
    expect(premioDellaLinea(['Q', 'Q', 'Q'])).toBe(0)
    expect(vincitaDellaLinea(['L', 'C', 'Q'])).toEqual({ combinazione: 'C1', premio: 1, simboli: [1] })
    expect(vincitaDellaLinea(['B', 'B', 'B'])).toEqual({ combinazione: 'B', premio: PREMI.B, simboli: [0, 1, 2] })
    expect(vincitaDellaLinea(['C', 'C', 'C'])?.combinazione).toBe('C3')
    expect(simboliVincenti(['C', 'O', 'C'])).toEqual([0, 2])
    expect(simboliVincenti(['L', 'O', 'P'])).toEqual([])
  })

  it('una ciliegia ridà la puntata, e la scala dei premi sale con la rarita’', () => {
    expect(CILIEGIE).toEqual([0, 1, 5, 20])
    const scala = (['L', 'O', 'P', 'U', 'B', 'R', '7'] as const).map((s) => PREMI[s])
    for (let i = 1; i < scala.length; i += 1) expect(scala[i]).toBeGreaterThan(scala[i - 1])
  })

  it('la finestra ha tre righe, e la fermata sta in mezzo; i rulli girano in tondo', () => {
    const f = finestra([0, 0, 0])
    expect(f[1]).toEqual(lineaDi([0, 0, 0]))
    expect(f[0]).toEqual([RULLI[0][39], RULLI[1][39], RULLI[2][39]])
    expect(lineaDi([40, -1, 41])).toEqual(lineaDi([0, 39, 1]))
  })

  it('tre punti di domanda dovunque nella finestra, uno per rullo, aprono la domanda', () => {
    // Il primo rullo ha il punto di domanda in cima, il secondo in mezzo, il terzo in fondo.
    const fermate = [1, 5, 2]
    expect(righeDelleDomande(fermate)).toEqual([0, 1, 2])
    expect(apreDomanda(fermate)).toBe(true)
    // Due su tre non bastano.
    expect(apreDomanda([1, 5, 8])).toBe(false)
    expect(righeDelleDomande([1, 5, 8])).toEqual([0, 1, -1])
  })

  it('insieme a una domanda la linea paga al piu’ le prugne: la festa non copre mai la domanda', () => {
    // La pagina mostra prima la linea e poi i punti di domanda: una festa da x20 in mezzo li coprirebbe.
    let massimo = 0
    const [n0, n1, n2] = RULLI.map((r) => r.length)
    for (let a = 0; a < n0; a += 1) {
      for (let b = 0; b < n1; b += 1) {
        for (let c = 0; c < n2; c += 1) {
          if (apreDomanda([a, b, c])) massimo = Math.max(massimo, premioDellaLinea(lineaDi([a, b, c])))
        }
      }
    }
    expect(massimo).toBe(PREMI.P)
    expect(massimo).toBeLessThan(20)
  })

  it('una vincita restituisce la puntata moltiplicata, in punti interi', () => {
    expect(deltaSlot(5, 0)).toBe(-5)
    expect(deltaSlot(5, 1)).toBe(0)
    expect(deltaSlot(10, PREMI['7'])).toBe(2990)
    expect(deltaSlot(3, VINCITA_DOMANDA)).toBe(42)
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
  const ogni = (p: number) => 1 / p

  it('a chi risponde sempre giusto, e’ quella di Crazy Time: nessun gioco della Fortuna conviene di piu’', () => {
    expect(conto.resa).toBeCloseTo(0.97, 10)
    expect(Math.abs(conto.resa - resa(1))).toBeLessThan(0.002)
    expect(contaSlot(0).resa).toBeCloseTo(conto.linea, 10)
  })

  it('si vince un giro ogni tre, come nelle slot video a piu’ linee, e quasi sempre la puntata indietro', () => {
    // Lobstermania a quindici linee: qualcosa nel 33,5% dei giri (Harrigan e Dixon, 2009).
    expect(conto.frequenza).toBeGreaterThan(0.32)
    expect(conto.frequenza).toBeLessThan(0.35)
    // Tre vincite su quattro sono una ciliegia sola, che ridà la puntata: le vincite che non cambiano niente.
    expect(conto.pariAllaPuntata).toBeGreaterThan(0.7)
    expect(conto.pariAllaPuntata).toBeLessThan(0.8)
  })

  it('i limoni sono la tripla che si vede di piu’, e ogni premio piu’ alto e’ piu’ raro', () => {
    const c = conto.combinazioni
    const triple = [c.L, c.O, c.P, c.C3, c.U, c.B, c.R, c['7']]
    for (let i = 1; i < triple.length; i += 1) expect(triple[i]).toBeLessThan(triple[i - 1])
    expect(ogni(c.L)).toBeGreaterThan(50)
    expect(ogni(c.L)).toBeLessThan(80)
  })

  it('le vincite grosse sono rare: dal ×20 una ogni cinquecento giri, i sette una ogni sessantaquattromila', () => {
    expect(ogni(conto.grosse)).toBeGreaterThan(400)
    expect(ogni(conto.grosse)).toBeLessThan(600)
    expect(ogni(conto.combinazioni['7'])).toBeCloseTo(64_000, 6)
    expect(PREMI['7']).toBe(300)
  })

  it('la domanda esce ogni cinquanta giri circa, e fa poco meno di un terzo della resa', () => {
    // 12 × 12 × 9 combinazioni con un punto di domanda in vista su tutti e tre i rulli.
    expect(conto.domanda).toBeCloseTo(1296 / 64_000, 12)
    const quota = (conto.domanda * VINCITA_DOMANDA) / conto.resa
    expect(quota).toBeGreaterThan(0.25)
    expect(quota).toBeLessThan(1 / 3)
  })
})

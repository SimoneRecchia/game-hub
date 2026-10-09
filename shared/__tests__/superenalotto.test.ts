import { describe, expect, it } from 'vitest'
import { istanteItaliano } from '../daily'
import {
  CATEGORIE,
  COSTI,
  DURATA_DIRETTA_MS,
  PALLINE_MS,
  RIPARTIZIONE,
  concorsoAperto,
  costoDi,
  estrai,
  jackpotDi,
  liquida,
  momentiDi,
  montepremiDi,
  presiDi,
  schedaValida,
  ultimoConcorso,
  unaSu,
  type CategoriaEnalotto,
} from '../superenalotto'

const alle = (data: string, ore: number, minuti = 0, secondi = 0) => istanteItaliano(data, ore, minuti) + secondi * 1000

describe('il calendario del SuperEnalotto', () => {
  it('si estrae il lunedi’, il mercoledi’ e il venerdi’, alle 21:05', () => {
    // Il 12 ottobre 2026 e' un lunedi'.
    expect(concorsoAperto(alle('2026-10-12', 10))).toBe('2026-10-12')
    expect(concorsoAperto(alle('2026-10-13', 10))).toBe('2026-10-14')
    expect(concorsoAperto(alle('2026-10-17', 10))).toBe('2026-10-19')
    expect(momentiDi('2026-10-12').inizio - momentiDi('2026-10-12').chiusura).toBe(5 * 60_000)
  })

  it('alle 21 si chiude, e si riapre per il concorso dopo solo finita la diretta', () => {
    expect(concorsoAperto(alle('2026-10-12', 20, 59, 59))).toBe('2026-10-12')
    expect(concorsoAperto(alle('2026-10-12', 21))).toBeNull()
    expect(concorsoAperto(alle('2026-10-12', 21, 5, 30))).toBeNull()
    expect(concorsoAperto(momentiDi('2026-10-12').fine)).toBe('2026-10-14')
    expect(ultimoConcorso(alle('2026-10-12', 20, 59))).toBeNull()
    expect(ultimoConcorso(alle('2026-10-12', 21))).toBe('2026-10-12')
    expect(ultimoConcorso(alle('2026-10-13', 9))).toBe('2026-10-12')
  })

  it('prima del primo concorso non si estrae, e si gioca per il primo', () => {
    expect(concorsoAperto(alle('2026-10-09', 22))).toBe('2026-10-12')
    expect(ultimoConcorso(alle('2026-10-10', 22))).toBeNull()
  })

  it('le 21 sono italiane anche con l’ora solare', () => {
    // Il 26 ottobre 2026 e' un lunedi', il giorno dopo il ritorno all'ora solare: le 21 sono le 20 UTC.
    expect(new Date(momentiDi('2026-10-26').chiusura).toISOString()).toBe('2026-10-26T20:00:00.000Z')
    expect(new Date(momentiDi('2026-10-12').chiusura).toISOString()).toBe('2026-10-12T19:00:00.000Z')
  })

  it('le palline escono tutte durante la diretta, una dopo l’altra', () => {
    expect(PALLINE_MS).toHaveLength(4)
    PALLINE_MS.forEach((t, i) => expect(t).toBeGreaterThan(i === 0 ? 0 : PALLINE_MS[i - 1]))
    expect(PALLINE_MS[3]).toBeLessThan(DURATA_DIRETTA_MS)
  })
})

describe('la schedina e l’estrazione', () => {
  it('quattro numeri diversi da 1 a 90, o cinque con il 4+1', () => {
    expect(schedaValida([1, 2, 3, 90])).toBe(true)
    expect(schedaValida([1, 2, 3, 45, 90])).toBe(true)
    expect(schedaValida([1, 2, 3])).toBe(false)
    expect(schedaValida([1, 2, 3, 4, 5, 6])).toBe(false)
    expect(schedaValida([1, 2, 3, 3])).toBe(false)
    expect(schedaValida([1, 2, 3, 4, 4])).toBe(false)
    expect(schedaValida([0, 2, 3, 4])).toBe(false)
    expect(schedaValida([1, 2, 3, 91])).toBe(false)
    expect(schedaValida([1, 2, 3, 4.5])).toBe(false)
  })

  it('una scheda da quattro costa dieci punti, il 4+1 venti', () => {
    expect(COSTI).toEqual({ 4: 10, 5: 20 })
    expect(costoDi([1, 2, 3, 4])).toBe(10)
    expect(costoDi([1, 2, 3, 4, 5])).toBe(20)
  })

  it('l’estrazione pesca dall’urna senza rimettere', () => {
    let seme = 7
    for (let i = 0; i < 200; i += 1) {
      const fuori = estrai((n) => (seme = (seme * 48271) % 2147483647) % n)
      expect(schedaValida(fuori)).toBe(true)
    }
    expect(estrai(() => 0)).toEqual([1, 2, 3, 4])
    expect(estrai((n) => n - 1)).toEqual([90, 89, 88, 87])
    expect(presiDi([1, 5, 9, 20], [20, 9, 2, 3])).toBe(2)
    // Cinque numeri prendono al piu' i quattro estratti.
    expect(presiDi([2, 3, 9, 20, 44], [20, 9, 2, 3])).toBe(4)
  })

  it('le probabilita’ su novanta: il 4 una su 2.555.190, e con il 4+1 cinque volte piu’ spesso', () => {
    expect(unaSu(4)).toBe(2_555_190)
    expect(Math.round(unaSu(3))).toBe(7428)
    expect(unaSu(2)).toBeCloseTo(116.5, 1)
    expect(unaSu(4, 5)).toBe(2_555_190 / 5)
    expect(Math.round(unaSu(3, 5))).toBe(3006)
    expect(unaSu(2, 5)).toBeCloseTo(71.6, 1)
  })
})

describe('il montepremi', () => {
  const nessuno: Record<CategoriaEnalotto, number> = { 4: 0, 3: 0, 2: 0 }

  it('e’ il 60% della raccolta, diviso nelle proporzioni del gioco vero', () => {
    expect(montepremiDi(100)).toBe(6000)
    expect(RIPARTIZIONE[4] + RIPARTIZIONE[3] + RIPARTIZIONE[2]).toBe(100)
    // Il 17,4% del 6, il 34,2% delle categorie di mezzo e il 40% del 2, rifatti su 91,6.
    expect(RIPARTIZIONE[4]).toBe(Math.round((17.4 / 91.6) * 100))
    expect(RIPARTIZIONE[3]).toBe(Math.round((34.2 / 91.6) * 100))
    expect(RIPARTIZIONE[2]).toBe(Math.round((40 / 91.6) * 100))
  })

  it('senza vincitori tutto passa al jackpot', () => {
    const l = liquida(50, 1234, nessuno)
    expect(l.jackpot).toBe(1234 + montepremiDi(50))
    expect(l.premi.every((p) => p.premio === 0)).toBe(true)
    expect(jackpotDi(1234, 50)).toBe(Math.floor((1234 + Math.floor((3000 * 19) / 100)) / 100))
  })

  it('niente si perde: i premi e il jackpot fanno il montepremi piu’ il jackpot arrivato', () => {
    let seme = 11
    const caso = (n: number) => (seme = (seme * 16807) % 2147483647) % n
    for (let i = 0; i < 500; i += 1) {
      const raccolta = caso(200)
      const riporto = caso(100_000)
      const vincitori = { 4: caso(3) === 0 ? caso(2) : 0, 3: caso(4), 2: caso(30) } as Record<CategoriaEnalotto, number>
      const l = liquida(raccolta, riporto, vincitori)
      const pagati = l.premi.reduce((s, p) => s + p.premio * p.vincitori * 100, 0)
      expect(pagati + l.jackpot).toBe(montepremiDi(raccolta) + riporto)
      expect(l.jackpot).toBeGreaterThanOrEqual(0)
      // Dall'alto in basso, fra le categorie con vincitori, un premio non e' mai piu' basso di quello sotto.
      const con = l.premi.filter((p) => p.vincitori > 0)
      con.slice(1).forEach((p, k) => expect(con[k].premio).toBeGreaterThanOrEqual(p.premio))
    }
  })

  it('chi fa 4 si prende il jackpot, e il jackpot riparte da quel che avanza', () => {
    const l = liquida(40, 50_000, { 4: 1, 3: 2, 2: 6 })
    const quattro = l.premi.find((p) => p.categoria === 4)!
    expect(quattro.premio).toBe(Math.floor((50_000 + Math.floor((2400 * 19) / 100)) / 100))
    // Quel che avanza dagli arrotondamenti: meno di un punto per vincitore.
    expect(l.jackpot).toBeLessThan(100 * (1 + 2 + 6))
    expect(CATEGORIE).toEqual([4, 3, 2])
  })

  it('una categoria che pagherebbe meno di quella sotto si unisce a lei', () => {
    // Il jackpot appena vinto: una sola scheda da 4 e tante da 3 non possono prendere meno di chi ha fatto 2.
    const l = liquida(100, 0, { 4: 0, 3: 3, 2: 1 })
    const [, tre, due] = l.premi
    expect(tre.premio).toBe(due.premio)
    expect(tre.premio).toBe(Math.floor((Math.floor((6000 * 37) / 100) + Math.floor((6000 * 44) / 100)) / 4 / 100))
  })
})

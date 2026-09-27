import { describe, expect, it } from 'vitest'
import { proiezione, puntoDelNome, riquadroDi, unisciRiquadri } from '../geometria'

const p = proiezione(180)

/** Un anello rettangolare in gradi, da ovest a est. */
function rettangolo(o: number, s: number, e: number, n: number): Array<[number, number]> {
  return [
    [o, s],
    [e, s],
    [e, n],
    [o, n],
    [o, s],
  ]
}

describe('riquadri a cavallo del taglio', () => {
  it('la Russia va da Kaliningrad alla Čukotka passando per l’Asia, non per il mondo intero', () => {
    // Il corpo arriva al 180 e lo passa di un niente, come dopo l'arrotondamento; la punta sta oltre.
    const corpo = rettangolo(27, 45, 180.000001, 75)
    const kaliningrad = rettangolo(19, 54, 23, 55)
    const punta = rettangolo(-180, 64, -169, 68)
    const r = riquadroDi([corpo, kaliningrad, punta], p)!
    expect(r.x0).toBeCloseTo(19)
    expect(r.x1).toBeCloseTo(191)
    const centro = (r.x0 + r.x1) / 2
    expect(centro).toBeGreaterThan(p.ovest)
    expect(centro).toBeLessThan(p.est)
  })

  it('il nome di un paese che tocca il taglio resta nel mondo', () => {
    const [x] = puntoDelNome([rettangolo(27, 45, 180.000001, 75)], p, true)!
    expect(x).toBeGreaterThan(90)
    expect(x).toBeLessThan(120)
  })

  it('le Figi, tagliate dal 180, sono un riquadro piccolo e non il mondo', () => {
    const r = riquadroDi([rettangolo(177, -19, 180, -16), rettangolo(-180, -18, -178, -16)], p)!
    expect(r.x1 - r.x0).toBeCloseTo(5)
  })

  it('due posti ai due lati del taglio si uniscono per la via corta', () => {
    const alaska = riquadroDi([rettangolo(-170, 55, -140, 70)], p)
    const cukotka = riquadroDi([rettangolo(165, 60, 180, 70)], p)
    const r = unisciRiquadri([alaska, cukotka], p)!
    expect(r.x1 - r.x0).toBeCloseTo(55)
  })

  it('posti lontani fra loro si uniscono come prima', () => {
    const italia = riquadroDi([rettangolo(7, 37, 18, 47)], p)
    const brasile = riquadroDi([rettangolo(-74, -33, -35, 5)], p)
    const r = unisciRiquadri([italia, brasile], p)!
    expect(r.x0).toBeCloseTo(-74)
    expect(r.x1).toBeCloseTo(18)
  })
})

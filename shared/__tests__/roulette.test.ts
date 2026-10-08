import { describe, expect, it } from 'vitest'
import {
  PUNTATE,
  ROSSI,
  RUOTA_ROULETTE,
  coloreDi,
  deltaDi,
  leggiPuntate,
  nomeDi,
  pagaDi,
  resaRoulette,
  tipoDi,
  vincenti,
} from '../roulette'
import {
  BozzaRL,
  FINE_RL_MS,
  LANCIO_MS,
  PUNTATE_RL_MS,
  RegolaRL,
  tavoloRLNuovo,
  type ContestoRL,
  type TavoloRL,
} from '../roulette-tavolo'

describe('la ruota europea', () => {
  it('ha i trentasette numeri una volta sola, con lo zero in cima', () => {
    expect(RUOTA_ROULETTE).toHaveLength(37)
    expect(new Set(RUOTA_ROULETTE).size).toBe(37)
    expect(RUOTA_ROULETTE[0]).toBe(0)
    expect(Math.min(...RUOTA_ROULETTE)).toBe(0)
    expect(Math.max(...RUOTA_ROULETTE)).toBe(36)
  })

  it('alterna il rosso e il nero, e i rossi sono diciotto', () => {
    expect(ROSSI.size).toBe(18)
    const giro = RUOTA_ROULETTE.slice(1)
    for (let k = 1; k < giro.length; k += 1) expect(coloreDi(giro[k])).not.toBe(coloreDi(giro[k - 1]))
    expect(coloreDi(0)).toBe('verde')
    expect(coloreDi(32)).toBe('rosso')
    expect(coloreDi(26)).toBe('nero')
  })
})

describe('le puntate del panno', () => {
  it('sono le 157 che un croupier accetta', () => {
    const per = (tipo: string) => [...PUNTATE.keys()].filter((k) => tipoDi(k) === tipo).length
    expect(PUNTATE.size).toBe(157)
    expect(per('pieno')).toBe(37)
    expect(per('cavallo')).toBe(60)
    expect(per('terzina')).toBe(14)
    expect(per('carre')).toBe(23)
    expect(per('sestina')).toBe(11)
    expect(per('colonna')).toBe(3)
    expect(per('dozzina')).toBe(3)
    expect(per('semplice')).toBe(6)
    // Due numeri lontani sul panno non sono un cavallo.
    expect(PUNTATE.has('1-5')).toBe(false)
    expect(PUNTATE.has('3-4')).toBe(false)
    expect(PUNTATE.get('17-18-20-21')).toEqual([17, 18, 20, 21])
  })

  it('pagano come ai tavoli: dal 35 a 1 del pieno all’1 a 1 delle chances semplici', () => {
    expect(pagaDi('17')).toBe(35)
    expect(pagaDi('17-20')).toBe(17)
    expect(pagaDi('0-1-2')).toBe(11)
    expect(pagaDi('0-1-2-3')).toBe(8)
    expect(pagaDi('13-14-15-16-17-18')).toBe(5)
    expect(pagaDi('colonna2')).toBe(2)
    expect(pagaDi('dozzina3')).toBe(2)
    expect(pagaDi('rosso')).toBe(1)
    expect(nomeDi('17-20')).toBe('Cavallo 17-20')
    expect(nomeDi('dozzina2')).toBe('Seconda dozzina')
    expect(nomeDi('manque')).toBe('1–18')
  })

  it('rendono tutte 36 su 37, il 97,3%: nessuna conviene piu’ delle altre', () => {
    for (const chiave of PUNTATE.keys()) expect(resaRoulette(chiave), chiave).toBeCloseTo(36 / 37, 12)
    expect(resaRoulette()).toBeCloseTo(0.973, 3)
  })

  it('con lo zero perdono anche le chances semplici', () => {
    const p = { rosso: 10, pari: 10, manque: 10, '0': 1 }
    expect(vincenti(p, 0)).toEqual(['0'])
    expect(deltaDi(p, 0)).toBe(36 - 31)
    expect(deltaDi(p, 2)).toBe(20 + 20 - 31)
  })

  it('il telefono manda solo puntate del panno, a punti interi', () => {
    expect(leggiPuntate({ rosso: 1, '0-1-2-3': 25 })).toEqual({ rosso: 1, '0-1-2-3': 25 })
    expect(leggiPuntate({})).toEqual({})
    for (const sbagliata of [null, [], 'rosso', { blu: 1 }, { rosso: 0 }, { rosso: 2.5 }, { rosso: '3' }]) {
      expect(leggiPuntate(sbagliata), JSON.stringify(sbagliata)).toBeNull()
    }
  })
})

/** Un tavolo con un orologio finto e un numero deciso. */
function tavolo(presenti: string[], numero = 7) {
  let adesso = 1_000_000
  let stato: TavoloRL = tavoloRLNuovo()
  const contesto = (): ContestoRL => ({ adesso, estrai: () => numero, presente: (id) => presenti.includes(id) })
  const fai = (f: (b: BozzaRL) => void) => {
    const b = new BozzaRL(stato, contesto())
    b.avanza()
    f(b)
    b.avanza()
    stato = b.t
    return b.movimenti
  }
  return {
    fai,
    get t() {
      return stato
    },
    passa(ms: number) {
      adesso += ms
    },
  }
}

describe('il tavolo della roulette', () => {
  it('da soli la biglia parte con la puntata, e il giro si paga al lancio', () => {
    const t = tavolo(['anna'])
    t.fai((b) => b.siedi('anna'))
    const m = t.fai((b) => b.punta('anna', 1, { '7': 2, nero: 3 }, 100, 50))
    expect(t.t).toMatchObject({ fase: 'giro', lancio: { numero: 7 }, storia: [7] })
    expect(m).toEqual([
      { tipo: 'punta', id: 'anna', giro: 1, giorno: 50, puntate: { '7': 2, nero: 3 }, prima: 0 },
      { tipo: 'chiude', id: 'anna', giro: 1, giorno: 50, numero: 7, delta: 72 - 5 },
    ])
    // Finito il giro, il panno si svuota.
    t.passa(LANCIO_MS + FINE_RL_MS)
    t.fai(() => {})
    expect(t.t).toMatchObject({ giro: 2, fase: 'puntate', lancio: null })
    expect(t.t.posti[0]).toMatchObject({ puntate: {}, delta: null })
  })

  it('con altri aspetta le loro puntate, o la fine del tempo', () => {
    const t = tavolo(['anna', 'bruno', 'carla'])
    t.fai((b) => b.siedi('anna'))
    t.fai((b) => b.siedi('bruno'))
    t.fai((b) => b.siedi('carla'))
    t.fai((b) => b.punta('anna', 1, { rosso: 5 }, 100, 50))
    expect(t.t).toMatchObject({ fase: 'puntate' })
    expect(t.t.scadenza).toBe(1_000_000 + PUNTATE_RL_MS)
    t.fai((b) => b.punta('bruno', 1, { nero: 5 }, 100, 50))
    expect(t.t.fase).toBe('puntate')
    t.passa(PUNTATE_RL_MS)
    t.fai(() => {})
    // Carla guarda: il giro parte all'ora della scadenza, senza di lei.
    expect(t.t).toMatchObject({ fase: 'giro', lancio: { quando: 1_000_000 + PUNTATE_RL_MS } })
    expect(t.t.posti[2]).toMatchObject({ delta: null })
  })

  it('una puntata si cambia mandandola di nuovo, e vuota si ritira', () => {
    const t = tavolo(['anna', 'bruno'])
    t.fai((b) => b.siedi('anna'))
    t.fai((b) => b.siedi('bruno'))
    t.fai((b) => b.punta('anna', 1, { rosso: 5 }, 10, 50))
    // Il saldo ha gia' tolto i cinque di prima: copre la differenza.
    const m = t.fai((b) => b.punta('anna', 1, { rosso: 5, nero: 5 }, 5, 50))
    expect(m[0]).toMatchObject({ tipo: 'punta', prima: 5, puntate: { rosso: 5, nero: 5 } })
    expect(() => t.fai((b) => b.punta('anna', 1, { rosso: 30 }, 0, 50))).toThrow(RegolaRL)
    expect(t.fai((b) => b.punta('anna', 1, {}, 0, 50))).toEqual([{ tipo: 'rimborsa', id: 'anna', giro: 1, giorno: 50 }])
  })

  it('a biglia ferma una puntata comincia il giro dopo; mentre gira e’ chiusa', () => {
    const t = tavolo(['anna'])
    t.fai((b) => b.siedi('anna'))
    t.fai((b) => b.punta('anna', 1, { rosso: 1 }, 100, 50))
    expect(() => t.fai((b) => b.punta('anna', 2, { rosso: 1 }, 100, 50))).toThrow('Rien ne va plus')
    t.passa(LANCIO_MS)
    t.fai((b) => b.punta('anna', 2, { rosso: 1 }, 100, 50))
    expect(t.t).toMatchObject({ giro: 2, fase: 'giro', storia: [7, 7] })
  })

  it('chi si alza durante le puntate se le riprende; chi non c’e’ e non ha puntato lascia il posto', () => {
    const t = tavolo(['anna'])
    t.fai((b) => b.siedi('anna'))
    t.fai((b) => b.siedi('bruno'))
    expect(t.t.posti.filter(Boolean)).toHaveLength(2)
    t.passa(60 * 60_000)
    t.fai(() => {})
    expect(t.t.posti.map((p) => p?.id ?? null)).toEqual(['anna', null, null, null, null, null])
    t.fai((b) => b.siedi('carla'))
    t.fai((b) => b.punta('carla', 1, { nero: 2 }, 100, 50))
    expect(t.fai((b) => b.alzati('carla'))).toEqual([
      { tipo: 'rimborsa', id: 'carla', giro: 1, giorno: 50 },
      { tipo: 'alza', id: 'carla' },
    ])
  })
})

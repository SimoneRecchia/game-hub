import { describe, expect, it } from 'vitest'
import {
  MATERIE_RUOTA,
  PUNTATA_MINIMA,
  SPICCHI,
  deltaDi,
  eSfida,
  etichettaDi,
  improntaDomanda,
  nomeDi,
  postaDi,
  puntataValida,
  resa,
  type Spicchio,
} from '../ruota'

const conta = (prova: (s: Spicchio) => boolean) => SPICCHI.filter(prova).length

/** Quel che un giro da' o toglie in media, in punti, a una puntata vera: con gli arrotondamenti della posta. */
function attesoInPunti(puntata: number, s: number): number {
  let somma = 0
  for (const sp of SPICCHI) {
    if (sp.tipo === 'domanda') somma += s * deltaDi(sp, puntata, true) + (1 - s) * deltaDi(sp, puntata, false)
    else if (sp.tipo === 'moneta') somma += (deltaDi(sp, puntata, true) + deltaDi(sp, puntata, false)) / 2
    else somma += deltaDi(sp, puntata)
  }
  return somma / SPICCHI.length
}

/** Il colore di uno spicchio sulla ruota: arte, libri e cinema hanno quello della cultura, come nel quiz. */
function coloreDi(s: Spicchio): string {
  if (s.tipo !== 'domanda') return s.tipo
  return s.materia === 'arte' || s.materia === 'libri' || s.materia === 'cinema' ? 'cultura' : s.materia
}

/** Quanti posti ci sono fra due spicchi, girando dalla parte piu' corta. */
function distanza(a: number, b: number): number {
  const d = Math.abs(a - b)
  return Math.min(d, SPICCHI.length - d)
}

const posti = (prova: (s: Spicchio) => boolean) => SPICCHI.flatMap((s, i) => (prova(s) ? [i] : []))

describe('Crazy Time', () => {
  it('ha ventiquattro spicchi: abbastanza larghi da leggerli su un telefono', () => {
    expect(SPICCHI).toHaveLength(24)
  })

  it('vince il banco: a chi tira a indovinare, a chi sa e a chi sta in mezzo', () => {
    for (const s of [0, 0.25, 0.5, 0.75, 1]) expect(resa(s), `chi risponde giusto ${s * 100}%`).toBeLessThan(1)
    // Chi sa tre domande su quattro perde quanto al Crazy Time vero, che rende dal 94 al 96%.
    expect(resa(0.75)).toBeGreaterThan(0.94)
    expect(resa(0.75)).toBeLessThan(0.96)
    // Nemmeno chi le sa tutte ci guadagna.
    expect(resa(1)).toBeLessThan(0.99)
  })

  it('vince il banco a ogni puntata, anche con gli arrotondamenti', () => {
    for (let puntata = PUNTATA_MINIMA; puntata <= 2_000; puntata += 1) {
      expect(attesoInPunti(puntata, 1), `puntata ${puntata}`).toBeLessThan(0)
    }
  })

  it('ha un solo x2, che raddoppia la puntata', () => {
    expect(conta((s) => s.tipo === 'doppio')).toBe(1)
    const x2 = SPICCHI.find((s) => s.tipo === 'doppio')!
    for (const puntata of [PUNTATA_MINIMA, 137, 600]) expect(deltaDi(x2, puntata)).toBe(puntata)
  })

  it('ha tanti 0, che lasciano tutto com’è, mai due vicini', () => {
    const zeri = posti((s) => s.tipo === 'niente')
    expect(zeri.length).toBeGreaterThanOrEqual(8)
    for (const i of zeri) expect(deltaDi(SPICCHI[i], 300)).toBe(0)
    for (let k = 0; k < zeri.length; k += 1) expect(distanza(zeri[k], zeri[(k + 1) % zeri.length])).toBeGreaterThan(1)
  })

  it('le ✕ fanno perdere la puntata, e sono poche', () => {
    expect(conta((s) => s.tipo === 'perdi')).toBe(3)
    for (const s of SPICCHI.filter((s) => s.tipo === 'perdi')) expect(deltaDi(s, 250)).toBe(-250)
  })

  it('testa o croce vale la puntata, una domanda un quarto, per difetto', () => {
    expect(conta((s) => s.tipo === 'moneta')).toBe(3)
    for (const m of MATERIE_RUOTA) expect(conta((s) => s.tipo === 'domanda' && s.materia === m), m).toBe(1)
    const moneta = SPICCHI.find((s) => s.tipo === 'moneta')!
    const domanda = SPICCHI.find((s) => s.tipo === 'domanda')!
    expect([deltaDi(moneta, 137, true), deltaDi(moneta, 137, false)]).toEqual([137, -137])
    expect([deltaDi(domanda, 137, true), deltaDi(domanda, 137, false)]).toEqual([34, -34])
    expect(postaDi(domanda, PUNTATA_MINIMA)).toBeGreaterThan(0)
    expect(postaDi(SPICCHI.find((s) => s.tipo === 'niente')!, 100)).toBe(0)
  })

  it('si perde al massimo la puntata, e si vince al massimo la puntata', () => {
    for (const puntata of [PUNTATA_MINIMA, 51, 600]) {
      for (const s of SPICCHI) {
        expect(deltaDi(s, puntata, false), nomeDi(s)).toBeGreaterThanOrEqual(-puntata)
        expect(deltaDi(s, puntata, true), nomeDi(s)).toBeLessThanOrEqual(puntata)
      }
    }
  })

  it('due spicchi vicini non hanno mai lo stesso colore, e monete e ✕ stanno lontane', () => {
    for (let i = 0; i < SPICCHI.length; i += 1) {
      const dopo = SPICCHI[(i + 1) % SPICCHI.length]
      expect(coloreDi(SPICCHI[i]), `spicchi ${i} e ${i + 1}`).not.toBe(coloreDi(dopo))
    }
    for (const tipo of ['moneta', 'perdi'] as const) {
      const suoi = posti((s) => s.tipo === tipo)
      for (let k = 0; k < suoi.length; k += 1) {
        expect(distanza(suoi[k], suoi[(k + 1) % suoi.length]), tipo).toBeGreaterThanOrEqual(6)
      }
    }
    expect(SPICCHI[0].tipo).toBe('doppio')
  })

  it('si scrive corto sulla ruota, e per intero per chi non vede', () => {
    expect(SPICCHI.map(etichettaDi).slice(0, 5)).toEqual(['x2', '0', '', '0', '✕'])
    expect(SPICCHI.filter(eSfida).every((s) => etichettaDi(s) === '')).toBe(true)
    expect(nomeDi(SPICCHI[2])).toBe('Domanda di geografia')
    expect(nomeDi(SPICCHI[4])).toBe('Puntata persa')
  })

  it('riconosce una domanda già vista dal testo e dalla risposta, non dal posto', () => {
    const d = { testo: 'Qual è la capitale del Portogallo?', giusta: 'lis' }
    expect(improntaDomanda(d)).toBe(improntaDomanda({ ...d }))
    expect(improntaDomanda(d)).toMatch(/^[0-9a-f]{8}$/)
    expect(improntaDomanda({ ...d, giusta: 'opo' })).not.toBe(improntaDomanda(d))
  })
})

describe('la puntata', () => {
  it('è quanto si vuole, fra la minima e tutto il saldo, in punti interi', () => {
    for (let puntata = PUNTATA_MINIMA; puntata <= 420; puntata += 1) expect(puntataValida(puntata, 420)).toBe(true)
    expect(puntataValida(PUNTATA_MINIMA, PUNTATA_MINIMA)).toBe(true)
    expect(puntataValida(PUNTATA_MINIMA, PUNTATA_MINIMA - 1)).toBe(false)
    expect(puntataValida(421, 420)).toBe(false)
    expect(puntataValida(PUNTATA_MINIMA - 1, 420)).toBe(false)
    expect(puntataValida(100.5, 420)).toBe(false)
    expect(puntataValida('100', 420)).toBe(false)
  })
})

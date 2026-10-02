import { describe, expect, it } from 'vitest'
import {
  azioniPossibili,
  cartaACaso,
  consiglio,
  deltaMano,
  eBlackjack,
  esitoMano,
  giocaAzione,
  giocaBanco,
  resaBlackjack,
  totaleDi,
  type Carta,
  type ManoBJ,
} from '../blackjack'
import { mulberry32 } from '../daily'
import { resa } from '../ruota'
import { contaSlot } from '../slot'

/** Un mazzo deciso dalla prova: le carte escono in quest'ordine. */
const mazzo = (...carte: Carta[]) => () => {
  const c = carte.shift()
  if (!c) throw new Error('mazzo finito')
  return c
}
const mano = (carte: Carta[], altro: Partial<ManoBJ> = {}): ManoBJ => ({ carte, puntata: 10, ...altro })

describe('le carte e i totali', () => {
  it('gli assi contano undici quando si puo', () => {
    expect(totaleDi(['Ac', '6q'])).toEqual({ totale: 17, morbido: true })
    expect(totaleDi(['Ac', '6q', 'Tf'])).toEqual({ totale: 17, morbido: false })
    expect(totaleDi(['Ac', 'Aq', '9p'])).toEqual({ totale: 21, morbido: true })
    expect(totaleDi(['Kc', 'Qq'])).toEqual({ totale: 20, morbido: false })
  })

  it('il blackjack e’ un asso e un dieci con due carte, mai in una mano divisa', () => {
    expect(eBlackjack(['Ac', 'Jq'])).toBe(true)
    expect(eBlackjack(['Ac', 'Jq'], true)).toBe(false)
    expect(eBlackjack(['7c', '7q', '7p'])).toBe(false)
  })

  it('una carta a caso e’ una delle cinquantadue', () => {
    const viste = new Set<Carta>()
    let n = 0
    const caso = (k: number) => n++ % k
    for (let i = 0; i < 52; i += 1) viste.add(cartaACaso(caso))
    for (const c of viste) expect(c).toMatch(/^[A2-9TJQK][cqfp]$/)
  })
})

describe('le mosse', () => {
  it('si raddoppia con due carte qualunque, e si divide una coppia di valore', () => {
    expect(azioniPossibili(mano(['5c', '6q']), 1)).toEqual(['carta', 'stai', 'raddoppia'])
    expect(azioniPossibili(mano(['Kc', 'Qq']), 1)).toEqual(['carta', 'stai', 'raddoppia', 'dividi'])
    expect(azioniPossibili(mano(['5c', '6q', '2p']), 1)).toEqual(['carta', 'stai'])
    // Con quattro mani non si divide piu', e gli assi divisi non si dividono ancora.
    expect(azioniPossibili(mano(['8c', '8q']), 4)).not.toContain('dividi')
    expect(azioniPossibili(mano(['Ac', 'Aq'], { assi: true }), 2)).not.toContain('dividi')
    // A 21 si sta e basta.
    expect(azioniPossibili(mano(['7c', '7q', '7p']), 1)).toEqual(['stai'])
  })

  it('raddoppiare: una carta sola, la puntata doppia, e la mano e’ ferma', () => {
    const { mani, inPiu } = giocaAzione(mano(['5c', '6q']), 'raddoppia', mazzo('9p'))
    expect(mani).toEqual([{ carte: ['5c', '6q', '9p'], puntata: 20, raddoppiata: true, ferma: true }])
    expect(inPiu).toBe(10)
  })

  it('dividere: due mani da una carta, e gli assi ne prendono una sola', () => {
    const otto = giocaAzione(mano(['8c', '8q']), 'dividi', mazzo('3p', 'Kf'))
    expect(otto.inPiu).toBe(10)
    expect(otto.mani.map((m) => m.carte)).toEqual([
      ['8c', '3p'],
      ['8q', 'Kf'],
    ])
    expect(otto.mani.every((m) => m.divisa && !m.ferma)).toBe(true)
    const assi = giocaAzione(mano(['Ac', 'Aq']), 'dividi', mazzo('Kp', '5f'))
    expect(assi.mani.every((m) => m.assi && m.ferma)).toBe(true)
    // Asso e dieci dopo una divisione e' 21, non blackjack: vince come una mano qualunque.
    expect(esitoMano(assi.mani[0], ['Tc', '7q'])).toBe('vinta')
  })

  it('una carta che porta a 21 o oltre ferma la mano', () => {
    expect(giocaAzione(mano(['Tc', '5q']), 'carta', mazzo('6p')).mani[0].ferma).toBe(true)
    expect(giocaAzione(mano(['Tc', '5q']), 'carta', mazzo('9p')).mani[0].ferma).toBe(true)
    expect(giocaAzione(mano(['Tc', '5q']), 'carta', mazzo('2p')).mani[0].ferma).toBe(false)
  })
})

describe('il banco e i pagamenti', () => {
  it('il banco chiede fino a 17, e sta su tutti i 17, anche morbidi', () => {
    expect(giocaBanco(['Ac', '6q'], mazzo())).toEqual(['Ac', '6q'])
    expect(giocaBanco(['Tc', '6q'], mazzo('Kp'))).toEqual(['Tc', '6q', 'Kp'])
    // 2, 4 e l'asso fanno 17 morbido: il banco sta.
    expect(giocaBanco(['2c', '4q'], mazzo('Ap'))).toEqual(['2c', '4q', 'Ap'])
    // 2, 3, 4, 5 e l'asso fanno 15 duro: chiede ancora.
    expect(giocaBanco(['2c', '3q'], mazzo('4p', '5f', 'Ac', '2q'))).toEqual(['2c', '3q', '4p', '5f', 'Ac', '2q'])
  })

  it('il blackjack paga 1 a 1, e batte il 21 del banco fatto con tre carte', () => {
    expect(deltaMano(mano(['Ac', 'Kq']), ['7c', '7q', '7p'])).toBe(10)
    expect(esitoMano(mano(['Ac', 'Kq']), ['Ac', 'Tq'])).toBe('pari')
    expect(deltaMano(mano(['Ac', 'Kq']), ['Ac', 'Tq'])).toBe(0)
  })

  it('il blackjack del banco si prende tutto quel che si e’ messo, anche il raddoppio', () => {
    const raddoppiata = mano(['5c', '6q', 'Tp'], { puntata: 20, raddoppiata: true })
    expect(deltaMano(raddoppiata, ['Ac', 'Kq'])).toBe(-20)
  })

  it('chi sballa perde anche se il banco sballa; il pareggio restituisce la puntata', () => {
    expect(deltaMano(mano(['Tc', '6q', 'Kp']), ['Tc', '6q', '9p'])).toBe(-10)
    expect(deltaMano(mano(['Tc', '7q']), ['Tc', '6q', '9p'])).toBe(10)
    expect(deltaMano(mano(['Tc', '8q']), ['9c', '9q'])).toBe(0)
    expect(deltaMano(mano(['Tc', '7q']), ['9c', '9q'])).toBe(-10)
  })
})

describe('la resa del blackjack', () => {
  it('con il blackjack pagato 1 a 1 e la strategia migliore e’ quella di Crazy Time e della slot', () => {
    const bj = resaBlackjack()
    expect(bj).toBeCloseTo(0.9712, 4)
    expect(Math.abs(bj - resa(1))).toBeLessThan(0.001)
    expect(Math.abs(bj - contaSlot(1).resa)).toBeLessThan(0.0015)
  })

  it('con il 3 a 2 dei casinò sarebbe piu’ del 99%: e’ per questo che paga alla pari', () => {
    expect(resaBlackjack(1.5)).toBeGreaterThan(0.99)
  })

  it('il consiglio e’ la strategia di base: si sta su 17, si chiede su 12 contro il 7, si dividono gli assi', () => {
    expect(consiglio(mano(['Tc', '7q']), '6p', 1)).toBe('stai')
    expect(consiglio(mano(['Tc', '2q']), '7p', 1)).toBe('carta')
    expect(consiglio(mano(['Ac', 'Aq']), '6p', 1)).toBe('dividi')
    expect(consiglio(mano(['5c', '6q']), '6p', 1)).toBe('raddoppia')
    // Senza la carta coperta l'11 contro il dieci non si raddoppia: il blackjack del banco si prenderebbe il doppio.
    expect(consiglio(mano(['5c', '6q']), 'Tp', 1)).toBe('carta')
  })

  it('giocando col consiglio, il motore da’ la resa del conto', () => {
    const caso = mulberry32(2026)
    const pesca = () => cartaACaso((n) => Math.floor(caso() * n))
    let puntato = 0
    let reso = 0
    const giri = 400_000
    for (let g = 0; g < giri; g += 1) {
      const scoperta = pesca()
      let mani: ManoBJ[] = [{ carte: [pesca(), pesca()], puntata: 1 }]
      puntato += 1
      if (eBlackjack(mani[0].carte)) mani[0].ferma = true
      for (let i = 0; i < mani.length; i += 1) {
        while (!mani[i].ferma) {
          const azione = consiglio(mani[i], scoperta, mani.length)
          // La resa si conta sulla puntata iniziale: i raddoppi e le divisioni sono gia' nel delta delle mani.
          const { mani: nuove } = giocaAzione(mani[i], azione, pesca)
          mani = [...mani.slice(0, i), ...nuove, ...mani.slice(i + 1)]
        }
      }
      const banco = giocaBanco([scoperta, pesca()], pesca)
      for (const m of mani) reso += deltaMano(m, banco)
    }
    const media = 1 + reso / puntato
    // Uno scarto tipico di 1,15 puntate a mano: con quattrocentomila mani, quattro scarti sono lo 0,7%.
    expect(Math.abs(media - resaBlackjack())).toBeLessThan(0.0075)
  })
})

import { describe, expect, it } from 'vitest'
import type { Carta, ManoBJ } from '@shared/blackjack'
import { CARTA_MS } from '@shared/blackjack-tavolo'
import type { VistaTavoloBJ } from '@shared/types'
import { carteDi, chiaveBanco, chiaveCarta, pianoDi, type CarteViste } from '../piano'

const GIRO = 3

/** Il tavolo con me al centro, da solo: le mie mani e le carte del banco. */
function tavolo(mani: ManoBJ[], banco: Carta[]): VistaTavoloBJ {
  const giocatore = { playerId: 'p', nickname: 'anna', displayName: 'Anna', avatarColor: '#5856d6' }
  const puntata = mani.reduce((s, m) => s + m.puntata, 0)
  const io = { giocatore, puntata, mani, assicurazione: 0, delta: null, via: false, presente: true }
  return {
    id: 't',
    versione: 1,
    giro: GIRO,
    fase: 'gioco',
    scadenzaMs: null,
    aTempo: false,
    banco,
    turno: { posto: 2, mano: 0 },
    posti: [null, null, io, null, null],
    mio: 2,
    classificate: 100,
    saldo: 90,
    netto: -10,
    giri: 1,
    msToNextPuzzle: 0,
  }
}

const mia = (mano: number, i: number) => chiaveCarta(GIRO, 2, mano, i)

describe('il piano delle carte', () => {
  it('la distribuzione: la prima a chi gioca, quella del banco, poi la seconda', () => {
    const piano = pianoDi(tavolo([{ id: 0, carte: ['9c', '7f'], puntata: 10 }], ['5q']), new Map())
    expect([...piano.arrivi].map(([k, a]) => [k, a.ritardo, a.da])).toEqual([
      [mia(0, 0), 0, 'sabot'],
      [chiaveBanco(GIRO, 0), CARTA_MS, 'sabot'],
      [mia(0, 1), 2 * CARTA_MS, 'sabot'],
    ])
  })

  it('dopo uno split la seconda carta scivola nella mano nuova, e al suo posto ne vola una dal sabot', () => {
    const viste: CarteViste = new Map()
    for (const [k, c] of carteDi(tavolo([{ id: 0, carte: ['8c', '8q'], puntata: 10 }], ['6p']))) viste.set(k, c)
    const diviso = tavolo(
      [
        { id: 0, carte: ['8c', '3p'], puntata: 10, divisa: true },
        { id: 1, carte: ['8q', 'Kf'], puntata: 10, divisa: true },
      ],
      ['6p'],
    )
    const piano = pianoDi(diviso, viste)
    expect([...piano.arrivi].map(([k, a]) => [k, a.ritardo, a.da])).toEqual([
      [mia(1, 0), 0, 'divisa'],
      [mia(0, 1), 0, 'sabot'],
      [mia(1, 1), CARTA_MS, 'sabot'],
    ])
    // La prima carta resta dov'e', e il posto della seconda ora ha la carta nuova.
    expect(piano.arrivi.has(mia(0, 0))).toBe(false)
    expect(viste.get(mia(0, 1))).toBe('3p')
    // Letto di nuovo, lo stesso tavolo non fa volare niente.
    expect(pianoDi(diviso, viste).arrivi.size).toBe(0)
  })
})

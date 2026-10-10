import { describe, expect, it } from 'vitest'
import { GIOCHI_CHIAMATA, NOMI_CHIAMATA, SLUG_PARTITA_TAVOLO } from '@shared/notifiche'
import { GIOCHI_INSIEME } from '@/games/amici/amici'
import { SLUG_AL_TAVOLO } from '../rotte'

describe('le notifiche portano dove sono le cose', () => {
  it('"Tocca a te" apre la partita all\'indirizzo che l\'app usa', () => {
    expect(SLUG_PARTITA_TAVOLO).toEqual(SLUG_AL_TAVOLO)
  })

  it('si chiama a tutti i giochi a cui si invita, e ognuno ha il suo nome', () => {
    expect([...GIOCHI_CHIAMATA]).toEqual([...GIOCHI_INSIEME])
    for (const g of GIOCHI_CHIAMATA) expect(NOMI_CHIAMATA[g]).toMatch(/^\p{Lu}/u)
  })
})

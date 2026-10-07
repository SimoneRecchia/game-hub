import { describe, expect, it } from 'vitest'
import { CATEGORIE_LIBERE, GIOCHI, GIOCHI_DA_TAVOLO } from '../catalog'

describe('le famiglie delle Libere', () => {
  it('ogni gioco sta in una famiglia sola, e non ce n’e’ uno di troppo', () => {
    const nelleFamiglie = CATEGORIE_LIBERE.flatMap((c) => c.giochi)
    expect(new Set(nelleFamiglie).size).toBe(nelleFamiglie.length)
    const tutti = new Set([...GIOCHI.map((g) => g.id), ...GIOCHI_DA_TAVOLO.map((g) => g.id)])
    expect([...nelleFamiglie].sort()).toEqual([...tutti].sort())
  })

  it('Lupus sta da solo', () => {
    expect(CATEGORIE_LIBERE.find((c) => c.giochi.includes('lupus'))?.giochi).toEqual(['lupus'])
  })
})

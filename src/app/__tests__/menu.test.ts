import { describe, expect, it } from 'vitest'
import { MENU_LATERALE } from '@/app/menu'
import { ROTTE } from '@/app/rotte'
import { CATEGORIE_LIBERE, GIOCHI } from '@/games/catalog'

const voci = (scheda: string) => MENU_LATERALE[scheda].famiglie.flatMap((f) => f.voci)

describe('il menu laterale del computer', () => {
  it('nelle Libere ha ogni gioco delle Libere una volta, nelle sue famiglie', () => {
    expect(MENU_LATERALE[ROTTE.libere].famiglie.map((f) => f.nome)).toEqual(CATEGORIE_LIBERE.map((c) => c.nome))
    expect(voci(ROTTE.libere).map((v) => v.id)).toEqual(CATEGORIE_LIBERE.flatMap((c) => c.giochi))
  })

  it('nelle Giornaliere ha ogni classificata una volta, e porta alla partita del giorno', () => {
    const giornaliere = voci(ROTTE.home)
    expect(giornaliere.map((v) => v.id).sort()).toEqual(GIOCHI.map((g) => g.id).sort())
    for (const v of giornaliere) expect(v.a).toBe(ROTTE.classificata(v.id as (typeof GIOCHI)[number]['id']))
  })

  it('un gioco con la classificata porta alla sua libera, e la classificata non lo accende', () => {
    for (const g of GIOCHI) {
      const v = voci(ROTTE.libere).find((x) => x.id === g.id)!
      expect(v.a).toBe(ROTTE.libera(g.id))
      expect(v.acceso(ROTTE.classificata(g.id))).toBe(false)
    }
  })

  it('ogni voce si accende dove porta, e da sola', () => {
    for (const scheda of Object.keys(MENU_LATERALE)) {
      const tutte = voci(scheda)
      for (const v of tutte) {
        expect(v.acceso(v.a), `${scheda} ${v.id}`).toBe(true)
        expect(tutte.filter((x) => x.acceso(v.a)).map((x) => x.id)).toEqual([v.id])
      }
    }
  })
})

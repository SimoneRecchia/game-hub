import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../daily'
import {
  CASELLE,
  LATO,
  caselleDellaNave,
  disponiACaso,
  esitoDelColpo,
  flottaAffondata,
  flottaValida,
  type Nave,
} from '../battaglia'
import {
  casoDelColpo,
  colpoDelComputer,
  flottaDelGiorno,
  semeDelGiorno,
  type ColpoNoto,
  type LivelloBattaglia,
} from '../battaglia-computer'

/** Il computer spara finché la flotta non e' a fondo: quanti colpi, e quali. */
function affonda(flotta: Nave[], livello: LivelloBattaglia, seme: number) {
  const colpi: ColpoNoto[] = []
  const presi = new Set<number>()
  while (!flottaAffondata(flotta, presi)) {
    const k = colpoDelComputer(colpi, livello, casoDelColpo(seme, colpi.length))
    expect(presi.has(k), `casella ${k} sparata due volte`).toBe(false)
    expect(k).toBeGreaterThanOrEqual(0)
    expect(k).toBeLessThan(CASELLE)
    const { esito, nave } = esitoDelColpo(flotta, presi, k)
    presi.add(k)
    colpi.push({ casella: k, esito, nave: esito === 'affondato' ? nave : null })
    if (colpi.length > CASELLE) throw new Error('Il computer non finisce')
  }
  return colpi
}

describe('la flotta del giorno', () => {
  it('e’ valida, uguale per tutti e diversa da un giorno all’altro', () => {
    expect(flottaValida(flottaDelGiorno(29)).ok).toBe(true)
    expect(flottaDelGiorno(29)).toEqual(flottaDelGiorno(29))
    expect(flottaDelGiorno(30)).not.toEqual(flottaDelGiorno(29))
    expect(semeDelGiorno(29)).toBe(semeDelGiorno(29))
    expect(semeDelGiorno(30)).not.toBe(semeDelGiorno(29))
  })
})

describe('il computer della battaglia navale', () => {
  it('non spara mai due volte nella stessa casella e affonda sempre tutto', () => {
    for (const livello of ['facile', 'normale', 'difficile'] as const) {
      for (let s = 1; s <= 30; s += 1) affonda(disponiACaso(mulberry32(s)), livello, s)
    }
  })

  it('i livelli sono in ordine: il difficile ha bisogno di meno colpi', () => {
    const media = (livello: LivelloBattaglia) => {
      let totale = 0
      for (let s = 1; s <= 200; s += 1) totale += affonda(disponiACaso(mulberry32(s * 3)), livello, s).length
      return totale / 200
    }
    const facile = media('facile')
    const normale = media('normale')
    const difficile = media('difficile')
    expect(facile).toBeGreaterThan(normale + 5)
    expect(normale).toBeGreaterThan(difficile + 5)
    // I numeri della documentazione, con un margine.
    expect(facile).toBeGreaterThan(55)
    expect(difficile).toBeLessThan(45)
  })

  it('dal normale in su, non spreca colpi attorno a una nave affondata', () => {
    for (let s = 1; s <= 40; s += 1) {
      const flotta = disponiACaso(mulberry32(s + 100))
      const colpi = affonda(flotta, 'normale', s)
      const attorno = new Set<number>()
      colpi.forEach((colpo, i) => {
        // Dopo l'affondamento, nessun colpo successivo nelle otto caselle attorno.
        if (i > 0 && attorno.has(colpo.casella)) throw new Error(`colpo sprecato in ${colpo.casella}`)
        if (colpo.esito === 'affondato') {
          const nave = flotta.find((n) => caselleDellaNave(n).includes(colpo.casella))!
          for (const k of caselleDellaNave(nave)) {
            const r = Math.floor(k / LATO)
            const c = k % LATO
            for (let dr = -1; dr <= 1; dr += 1) {
              for (let dc = -1; dc <= 1; dc += 1) {
                const rr = r + dr
                const cc = c + dc
                if (rr >= 0 && cc >= 0 && rr < LATO && cc < LATO) attorno.add(rr * LATO + cc)
              }
            }
          }
        }
      })
    }
  })

  it('a parità di colpi ricevuti fa le stesse scelte: e’ lo stesso per tutti', () => {
    const flotta = flottaDelGiorno(40)
    const a = affonda(flotta, 'facile', semeDelGiorno(40))
    const b = affonda(flotta, 'facile', semeDelGiorno(40))
    expect(a).toEqual(b)
  })
})

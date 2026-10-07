import { describe, expect, it } from 'vitest'
import { applica, chiAspetta, compitiDellaNotte } from '../lupus'
import { richiestaPer, vistaPer } from '../lupus-vista'
import { avanti, notte, partitaCon, ruoliVisti, tuttiVotano, viviIn } from './lupus-banco'

/** Dieci giocatori: due lupi, il Veggente, Amleto o Dorian Wolf in p3, e sei villici. */
const DIECI = (chi: 'amleto' | 'dorian') =>
  partitaCon(['lupo', 'lupo', 'veggente', chi, 'villico', 'villico', 'villico', 'villico', 'villico', 'villico'], {
    primaNotteSenzaVittime: false,
  })

describe('Amleto', () => {
  it('consegna il teschio la prima notte, e il teschio lo vedono tutti', () => {
    let p = ruoliVisti(DIECI('amleto'))
    expect(compitiDellaNotte(p).find((c) => c.giocatore === 'p3')?.tipo).toBe('teschio')
    p = notte(p, { p0: 'p5', p1: 'p5', p2: 'p6', p3: 'p7' })
    // Con Amleto in gioco, i nuovi fantasmi passano dalla fase della decisione.
    expect(p.fase).toBe('decisione')
    expect(chiAspetta(p)).toEqual(['p5'])
    expect(richiestaPer(p, 'p5')).toEqual({ tipo: 'benvenuto', scelta: null })
    p = applica(p, { tipo: 'benvenuto', giocatore: 'p5' }, 0)
    expect(p.fase).toBe('alba')
    expect(p.teschio).toBe('p7')
    expect(vistaPer(p, 'p0').teschio).toBe('p7')
  })

  it('chi ha il teschio lo passa all’inizio della notte dopo', () => {
    let p = ruoliVisti(DIECI('amleto'))
    p = notte(p, { p0: 'p5', p1: 'p5', p2: 'p6', p3: 'p7' })
    p = applica(p, { tipo: 'benvenuto', giocatore: 'p5' }, 0)
    p = avanti(p, 2)
    p = tuttiVotano(p, 'p8', 'p9')
    p = avanti(p)
    p = tuttiVotano(p, 'p8', 'p9')
    // Il linciato riceve il Benvenuto.
    expect(p.fase).toBe('decisione')
    p = applica(p, { tipo: 'benvenuto', giocatore: 'p8' }, 0)
    expect(p.fase).toBe('notte')
    expect(p.notte).toBe(2)
    const compiti = compitiDellaNotte(p).filter((c) => c.giocatore === 'p7')
    expect(compiti.map((c) => c.tipo)).toEqual(['passa_teschio'])
    expect(richiestaPer(p, 'p7').tipo).toBe('indica')
    p = notte(p, { p0: 'p6', p1: 'p6', p2: 'p0', p7: 'p9' })
    expect(p.teschio).toBe('p9')
  })

  it('se Amleto muore e si rivela, muore anche chi ha il teschio', () => {
    let p = ruoliVisti(DIECI('amleto'))
    // I lupi sbranano Amleto.
    p = notte(p, { p0: 'p3', p1: 'p3', p2: 'p6', p3: 'p7' })
    expect(p.fase).toBe('decisione')
    expect(richiestaPer(p, 'p3')).toEqual({ tipo: 'benvenuto', scelta: { tipo: 'amleto', custode: 'p7' } })
    p = applica(p, { tipo: 'benvenuto', giocatore: 'p3', rivela: true }, 0)
    expect(p.fase).toBe('alba')
    expect(viviIn(p)).not.toContain('p7')
    expect(p.alba?.morti.slice().sort()).toEqual(['p3', 'p7'])
    expect(p.alba?.cause.p7).toBe('teschio')
    expect(p.teschio).toBeNull()
    expect(p.giocatori[3].rivelato).toBe(true)
    expect(vistaPer(p, 'p0').giocatori[3].ruolo).toBe('amleto')
  })

  it('se Amleto non si rivela, il teschio resta in gioco e nessuno sa chi era', () => {
    let p = ruoliVisti(DIECI('amleto'))
    p = notte(p, { p0: 'p3', p1: 'p3', p2: 'p6', p3: 'p7' })
    p = applica(p, { tipo: 'benvenuto', giocatore: 'p3', rivela: false }, 0)
    expect(p.fase).toBe('alba')
    expect(viviIn(p)).toContain('p7')
    expect(p.teschio).toBe('p7')
    expect(vistaPer(p, 'p0').giocatori[3].ruolo).toBeUndefined()
  })

  it('il teschio di un morto passa al vivo dopo di lui', () => {
    let p = ruoliVisti(DIECI('amleto'))
    // Muore chi riceve il teschio.
    p = notte(p, { p0: 'p7', p1: 'p7', p2: 'p6', p3: 'p7' })
    p = applica(p, { tipo: 'benvenuto', giocatore: 'p7' }, 0)
    p = avanti(p, 2)
    p = tuttiVotano(p, 'p9', 'p8')
    p = avanti(p)
    p = tuttiVotano(p, 'p9', 'p8')
    p = applica(p, { tipo: 'benvenuto', giocatore: 'p9' }, 0)
    expect(p.fase).toBe('notte')
    // Il primo vivo dopo p7, in senso orario.
    expect(p.teschio).toBe('p8')
  })
})

describe('Dorian Wolf', () => {
  it('se muore e si rivela resta in vita, e muore chi ha il ritratto', () => {
    let p = ruoliVisti(DIECI('dorian'))
    p = notte(p, { p0: 'p3', p1: 'p3', p2: 'p6', p3: 'p7' })
    expect(p.fase).toBe('decisione')
    expect(richiestaPer(p, 'p3')).toEqual({ tipo: 'benvenuto', scelta: { tipo: 'dorian', custode: 'p7' } })
    p = applica(p, { tipo: 'benvenuto', giocatore: 'p3', rivela: true }, 0)
    expect(p.fase).toBe('alba')
    expect(viviIn(p)).toContain('p3')
    expect(viviIn(p)).not.toContain('p7')
    expect(p.alba?.morti).toEqual(['p7'])
    expect(p.alba?.sopravvissuto).toBe('p3')
    expect(p.ritratto).toBeNull()
    expect(p.giocatori[3].rivelato).toBe(true)
  })

  it('funziona anche se e’ linciato di giorno', () => {
    let p = ruoliVisti(DIECI('dorian'))
    p = notte(p, { p0: 'p5', p1: 'p5', p2: 'p6', p3: 'p7' })
    p = applica(p, { tipo: 'benvenuto', giocatore: 'p5' }, 0)
    p = avanti(p, 2)
    p = tuttiVotano(p, 'p3', 'p9')
    p = avanti(p)
    p = tuttiVotano(p, 'p3', 'p9')
    expect(p.fase).toBe('decisione')
    p = applica(p, { tipo: 'benvenuto', giocatore: 'p3', rivela: true }, 0)
    expect(p.fase).toBe('notte')
    expect(viviIn(p)).toContain('p3')
    expect(viviIn(p)).not.toContain('p7')
    expect(p.esitoBallottaggio?.altriMorti).toEqual(['p7'])
    expect(p.esitoBallottaggio?.sopravvissuto).toBe('p3')
  })

  it('senza rivelarsi muore come tutti', () => {
    let p = ruoliVisti(DIECI('dorian'))
    p = notte(p, { p0: 'p3', p1: 'p3', p2: 'p6', p3: 'p7' })
    p = applica(p, { tipo: 'benvenuto', giocatore: 'p3', rivela: false }, 0)
    expect(viviIn(p)).not.toContain('p3')
    expect(viviIn(p)).toContain('p7')
  })

  it('chi conduce puo’ chiudere la decisione: chi non risponde non si rivela', () => {
    let p = ruoliVisti(DIECI('dorian'))
    p = notte(p, { p0: 'p3', p1: 'p3', p2: 'p6', p3: 'p7' })
    p = avanti(p)
    expect(p.fase).toBe('alba')
    expect(viviIn(p)).not.toContain('p3')
  })

  it('senza Amleto ne’ Dorian in gioco la decisione non c’e’', () => {
    let p = ruoliVisti(
      partitaCon(['lupo', 'lupo', 'veggente', 'villico', 'villico', 'villico'], { primaNotteSenzaVittime: false }),
    )
    p = notte(p, { p0: 'p3', p1: 'p3', p2: 'p4' })
    expect(p.fase).toBe('alba')
  })
})

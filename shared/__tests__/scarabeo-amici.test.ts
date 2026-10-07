import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Dawg } from '../dawg'
import { CENTRO, leggiiDa, sacchettoDaSeme, type Mossa } from '../scarabeo'
import {
  MOSSA_SCARABEO_MASSIMA,
  esitoScarabeo,
  giocaScarabeo,
  leggiPosizione,
  mossaDaTesto,
  mossaInTesto,
  scriviPosizione,
  vistaScarabeo,
  type PosizioneScarabeo,
} from '../scarabeo-amici'
import { mossaDelComputer } from '../scarabeo-computer'
import { PARTITA_INTERA, statoADue } from '../scarabeo-due'
import { giocaMossa, regoleDi } from '../tavolo-regole'

const dawg = Dawg.da(readFileSync(join(__dirname, '..', '..', 'public', 'scarabeo', 'dizionario.dawg')))

describe('lo Scarabeo fra amici: le regole del tavolo', () => {
  it('le mosse vanno e tornano dal testo, e quel che non si legge non e’ una mossa', () => {
    const mosse: Mossa[] = [
      { tipo: 'passo' },
      { tipo: 'cambio', tessere: ['a', 'e', '*'] },
      {
        tipo: 'posa',
        posa: [
          { r: 7, c: 6, lettera: 'c', jolly: false },
          { r: 7, c: 7, lettera: 'a', jolly: true },
        ],
      },
    ]
    for (const m of mosse) expect(mossaDaTesto(mossaInTesto(m))).toEqual(m)
    expect(mossaInTesto(mosse[2])).toBe('7.6.c 7.7.A')
    for (const no of ['', 'passa', 'cambio:', 'cambio:abcdefghi', 'cambio:AB', '7.7', '7.7.cc', '7.7.c,7.8.a']) {
      expect(mossaDaTesto(no)).toBeNull()
    }
    // Otto tessere sulle caselle piu' lontane ci stanno.
    const lunga = Array.from({ length: 8 }, (_, i) => `14.${i + 7}.a`).join(' ')
    expect(lunga.length).toBeLessThanOrEqual(MOSSA_SCARABEO_MASSIMA)
    expect(mossaDaTesto(lunga)).not.toBeNull()
  })

  it('la posizione ha il seme, e una posizione rotta non si legge', () => {
    const p: PosizioneScarabeo = { seme: 42, mosse: [{ tipo: 'passo' }] }
    expect(leggiPosizione(scriviPosizione(p))).toEqual(p)
    expect(leggiPosizione('{"s":-1,"m":[]}')).toBeNull()
    expect(leggiPosizione('{"s":1,"m":["vola"]}')).toBeNull()
    expect(leggiPosizione('niente')).toBeNull()
  })

  it('si gioca solo con le proprie tessere, a turno, e si cambia solo a sacchetto pieno', () => {
    const p: PosizioneScarabeo = { seme: 7, mosse: [] }
    const { leggii } = leggiiDa(sacchettoDaSeme(7), [], 2)
    const sua = leggii[1].find((t) => !leggii[0].includes(t) && t !== '*')
    if (sua) {
      const posa: Mossa = { tipo: 'posa', posa: [{ r: CENTRO, c: CENTRO, lettera: sua, jolly: false }] }
      expect(giocaScarabeo(p, posa)).toBeNull()
    }
    expect(giocaScarabeo(p, { tipo: 'cambio', tessere: [leggii[0][0]] })).not.toBeNull()
    expect(giocaScarabeo(p, { tipo: 'cambio', tessere: [] })).toBeNull()
    // Le regole del tavolo: tocca al primo, poi all'altro.
    const regole = regoleDi('scarabeo')
    const testo = scriviPosizione(p)
    expect(giocaMossa(regole, testo, [], 'passo', 1)).toBeNull()
    const dopo = giocaMossa(regole, testo, [], 'passo', 0)!
    expect(regole.tratto(dopo.posizione)).toBe(1)
    expect(dopo.esito).toBeNull()
  })

  it('una partita giocata fino in fondo finisce come dice il regolamento, e la vista lo racconta', () => {
    // Il computer gioca dalle due parti, fino in fondo al sacchetto: ogni sua mossa passa dalle regole del tavolo.
    const p: PosizioneScarabeo = { seme: 2024, mosse: [] }
    const sacchetto = sacchettoDaSeme(p.seme)
    for (;;) {
      const s = statoADue(sacchetto, p.mosse, PARTITA_INTERA)
      if (s.finita) break
      const mossa = mossaDelComputer(dawg, p.mosse, s.leggii[s.turno!], s.restanti, 'facile', () => 0.5)
      const dopo = giocaScarabeo(p, mossa)
      expect(dopo).not.toBeNull()
      p.mosse = dopo!.mosse
      expect(p.mosse.length).toBeLessThan(400)
    }
    const s = statoADue(sacchetto, p.mosse, PARTITA_INTERA)
    const esito = esitoScarabeo(p)!
    expect(esito.motivo).toBe(s.fine === 'chiusa' ? 'ultima' : 'ferma')
    expect(esito.vincitore).toBe(s.vincitore)
    expect(giocaScarabeo(p, { tipo: 'passo' })).toBeNull()

    const per0 = vistaScarabeo(p, 0)
    const per1 = vistaScarabeo(p, 1)
    expect(per0.punti).toEqual({ io: s.punti[0], altro: s.punti[1] })
    expect(per1.punti).toEqual({ io: s.punti[1], altro: s.punti[0] })
    expect(per0.leggioAltro).toEqual(s.leggii[1])
    expect(per0.fine).toBe(s.fine)
  })

  it('i cambi dell’altro restano senza tessere, e chi guarda un invito non vede leggii', () => {
    const p: PosizioneScarabeo = { seme: 5, mosse: [] }
    const { leggii } = leggiiDa(sacchettoDaSeme(5), [], 2)
    const dopo = giocaScarabeo(p, { tipo: 'cambio', tessere: leggii[0].slice(0, 2) })!
    expect(vistaScarabeo(dopo, 0).mosse).toEqual([{ tipo: 'cambio', tessere: leggii[0].slice(0, 2) }])
    expect(vistaScarabeo(dopo, 1).mosse).toEqual([{ tipo: 'cambio', tessere: [] }])
    expect(vistaScarabeo(dopo, 1).leggio).toEqual(leggii[1])
    expect(vistaScarabeo(p, null).leggio).toEqual([])
    expect(vistaScarabeo(p, 0).leggioAltro).toBeNull()
  })
})

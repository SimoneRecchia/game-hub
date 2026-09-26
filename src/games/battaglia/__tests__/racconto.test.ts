import { describe, expect, it } from 'vitest'
import { CASELLE_FLOTTA, FLOTTA, caselleDellaNave, type Nave } from '@shared/battaglia'
import type { ColpoVisto, VistaBattaglia } from '@shared/types'
import { celleNemiche, celleProprie } from '../celle'
import {
  DURATA_ANNUNCIO_MS,
  annuncioDi,
  naviNemiche,
  naviProprie,
  notiziaDi,
  primaDelComputer,
  senzaFine,
} from '../racconto'

/** Una flotta in fila, una nave ogni due righe: valida e facile da leggere. */
const FLOTTA_DI_PROVA: Nave[] = FLOTTA.map((t, i) => ({ tipo: t.id, r: i * 2, c: 0, verticale: false }))

function vista(parziale: Partial<VistaBattaglia> = {}): VistaBattaglia {
  return {
    id: 'p1',
    modalita: 'computer',
    livello: 'normale',
    puzzleNumber: null,
    punti: null,
    stato: 'battaglia',
    avversario: { playerId: 'cpu', nickname: 'computer', displayName: 'Computer', avatarColor: '#888', online: true },
    miaFlotta: FLOTTA_DI_PROVA,
    avversarioPronto: true,
    tuoTurno: true,
    colpiMiei: [],
    colpiSubiti: [],
    affondateNemiche: [],
    flottaNemica: null,
    ultimo: null,
    vincitore: null,
    motivo: null,
    attesaMs: 0,
    puoiReclamare: false,
    versione: 1,
    ...parziale,
  } as VistaBattaglia
}

const colpo = (casella: number, esito: ColpoVisto['esito'], nave: ColpoVisto['nave'] = null): ColpoVisto => ({
  casella,
  esito,
  nave,
})

describe('l’annuncio al centro dello schermo', () => {
  it('non c’e’ per l’acqua: succede quasi sempre, e smetterebbe di dire qualcosa', () => {
    expect(annuncioDi(vista({ colpiMiei: [colpo(5, 'acqua')], ultimo: { ...colpo(5, 'acqua'), mio: true } }))).toBeNull()
  })

  it('dice "Colpito!" con la casella per un colpo mio', () => {
    const a = annuncioDi(vista({ colpiMiei: [colpo(12, 'colpito')], ultimo: { ...colpo(12, 'colpito'), mio: true } }))
    expect(a).toMatchObject({ mio: true, esito: 'colpito', titolo: 'Colpito!', sotto: 'in C-2' })
  })

  it('accorda l’affondamento con la nave, e dice quante caselle aveva', () => {
    const corazzata = annuncioDi(
      vista({ colpiMiei: [colpo(3, 'affondato', 'corazzata')], ultimo: { ...colpo(3, 'affondato', 'corazzata'), mio: true } }),
    )
    expect(corazzata).toMatchObject({ titolo: 'Affondata!', sotto: 'La corazzata · 4 caselle' })
    const sottomarino = annuncioDi(
      vista({
        colpiMiei: [colpo(3, 'affondato', 'sottomarino')],
        ultimo: { ...colpo(3, 'affondato', 'sottomarino'), mio: true },
      }),
    )
    expect(sottomarino).toMatchObject({ titolo: 'Affondato!', sotto: 'Il sottomarino · 3 caselle' })
    expect(sottomarino?.nave?.lunghezza).toBe(3)
  })

  it('distingue i colpi presi da quelli dati', () => {
    const a = annuncioDi(vista({ colpiSubiti: [colpo(0, 'colpito')], ultimo: { ...colpo(0, 'colpito'), mio: false } }))
    expect(a).toMatchObject({ mio: false, titolo: 'Ti ha colpito', sotto: 'Il computer ha sparato in A-1' })
  })

  it('cambia id a ogni colpo, perché l’animazione riparta', () => {
    const uno = annuncioDi(vista({ colpiMiei: [colpo(1, 'colpito')], ultimo: { ...colpo(1, 'colpito'), mio: true } }))
    const due = annuncioDi(
      vista({ colpiMiei: [colpo(1, 'colpito'), colpo(2, 'colpito')], ultimo: { ...colpo(2, 'colpito'), mio: true } }),
    )
    expect(uno?.id).not.toBe(due?.id)
  })

  it('dura di piu’ per un affondamento che per un colpo', () => {
    expect(DURATA_ANNUNCIO_MS.affondato).toBeGreaterThan(DURATA_ANNUNCIO_MS.colpito)
  })
})

describe('la riga sotto il turno', () => {
  // Nella plancia di un telefono stretto una riga tiene una quarantina di caratteri.
  it('sta in una riga della plancia, contro il computer', () => {
    const esiti: ColpoVisto[] = FLOTTA.flatMap((t) => [colpo(99, 'affondato', t.id)])
    for (const mio of [true, false]) {
      for (const u of [colpo(99, 'acqua'), colpo(99, 'colpito'), ...esiti]) {
        const testo = notiziaDi(vista({ ultimo: { ...u, mio } }))!.testo
        expect(testo.length, testo).toBeLessThanOrEqual(36)
      }
    }
  })

  it('racconta l’ultimo colpo come al tavolo, con chi lo ha sparato', () => {
    expect(notiziaDi(vista())).toBeNull()
    expect(notiziaDi(vista({ ultimo: { ...colpo(0, 'acqua'), mio: true } }))).toEqual({
      testo: 'Acqua in A-1',
      tono: 'neutra',
    })
    expect(notiziaDi(vista({ ultimo: { ...colpo(0, 'affondato', 'portaerei'), mio: true } }))?.testo).toBe(
      'Affondata la portaerei!',
    )
    expect(notiziaDi(vista({ ultimo: { ...colpo(0, 'acqua'), mio: false } }))?.testo).toBe('Il computer: acqua in A-1')
    expect(
      notiziaDi(
        vista({
          modalita: 'amici',
          avversario: { playerId: 'g', nickname: 'giada', displayName: 'Giada', avatarColor: '#f0f', online: true },
          ultimo: { ...colpo(0, 'affondato', 'cacciatorpediniere'), mio: false },
        }),
      ),
    ).toEqual({ testo: 'Hai perso il cacciatorpediniere', tono: 'cattiva' })
  })
})

describe('il turno contro il computer, un pezzo per volta', () => {
  const prima = vista({ colpiMiei: [], colpiSubiti: [] })

  it('toglie il colpo del computer, così si vede prima il mio', () => {
    const dopo = vista({
      colpiMiei: [colpo(40, 'colpito')],
      colpiSubiti: [colpo(0, 'colpito')],
      ultimo: { ...colpo(0, 'colpito'), mio: false },
      tuoTurno: true,
    })
    const intermedia = primaDelComputer(prima, dopo)!
    expect(intermedia.colpiSubiti).toEqual([])
    expect(intermedia.ultimo).toEqual({ ...colpo(40, 'colpito'), mio: true })
    expect(intermedia.tuoTurno).toBe(false)
  })

  it('se e’ stato il computer a chiudere la partita, prima si torna alla battaglia', () => {
    const dopo = vista({
      colpiMiei: [colpo(40, 'acqua')],
      colpiSubiti: [colpo(0, 'affondato', 'portaerei')],
      ultimo: { ...colpo(0, 'affondato', 'portaerei'), mio: false },
      stato: 'finita',
      vincitore: 'avversario',
      motivo: 'flotta',
      flottaNemica: FLOTTA_DI_PROVA,
    })
    const intermedia = primaDelComputer(prima, dopo)!
    expect(intermedia).toMatchObject({ stato: 'battaglia', vincitore: null, flottaNemica: null })
  })

  it('non c’e’ niente da rimandare se il computer non ha risposto, o fra amici', () => {
    const vinta = vista({
      colpiMiei: [colpo(40, 'affondato', 'portaerei')],
      ultimo: { ...colpo(40, 'affondato', 'portaerei'), mio: true },
      stato: 'finita',
      vincitore: 'io',
      motivo: 'flotta',
    })
    expect(primaDelComputer(prima, vinta)).toBeNull()
    const fraAmici = vista({
      modalita: 'amici',
      colpiMiei: [colpo(40, 'acqua')],
      colpiSubiti: [colpo(0, 'acqua')],
      ultimo: { ...colpo(0, 'acqua'), mio: false },
    })
    expect(primaDelComputer(prima, fraAmici)).toBeNull()
  })

  it('la fine arriva dopo l’ultimo affondamento, non al suo posto', () => {
    const finita = vista({ stato: 'finita', vincitore: 'io', motivo: 'flotta', punti: 88, flottaNemica: FLOTTA_DI_PROVA })
    expect(senzaFine(finita)).toMatchObject({ stato: 'battaglia', vincitore: null, punti: null, flottaNemica: null })
    // Una resa non ha un colpo da guardare: si va dritti alla fine.
    const resa = vista({ stato: 'finita', vincitore: 'io', motivo: 'resa' })
    expect(senzaFine(resa)).toBe(resa)
    const inCorso = vista()
    expect(senzaFine(inCorso)).toBe(inCorso)
  })
})

describe('le navi, con le loro caselle', () => {
  it('dell’avversario si sa quanto e’ lunga ognuna, e quali sono a fondo', () => {
    const navi = naviNemiche([FLOTTA_DI_PROVA[1]])
    expect(navi.map((n) => n.pezzi.length)).toEqual([5, 4, 3, 3, 2])
    expect(navi.reduce((n, nave) => n + nave.pezzi.length, 0)).toBe(CASELLE_FLOTTA)
    expect(navi[1]).toMatchObject({ affondata: true, pezzi: ['affondato', 'affondato', 'affondato', 'affondato'] })
    expect(navi[0].pezzi.every((p) => p === 'ignoto')).toBe(true)
  })

  it('delle proprie si vede ogni pezzo: intero, colpito, a fondo con tutta la nave', () => {
    const portaerei = caselleDellaNave(FLOTTA_DI_PROVA[0])
    const caccia = caselleDellaNave(FLOTTA_DI_PROVA[4])
    const navi = naviProprie(FLOTTA_DI_PROVA, new Set([portaerei[1], ...caccia]))
    expect(navi[0].pezzi).toEqual(['intero', 'colpito', 'intero', 'intero', 'intero'])
    expect(navi[0].affondata).toBe(false)
    expect(navi[4]).toMatchObject({ affondata: true, pezzi: ['affondato', 'affondato'] })
  })
})

describe('le caselle dei due mari', () => {
  it('anima tutta la nave appena affondata, dalla prua alla poppa', () => {
    const caccia = FLOTTA_DI_PROVA[4]
    const [prua, poppa] = caselleDellaNave(caccia)
    const colpi = [colpo(prua, 'colpito'), colpo(poppa, 'affondato', 'cacciatorpediniere')]
    const celle = celleNemiche(colpi, [caccia], null, colpi[1])
    expect(celle[prua]).toMatchObject({ affondata: true, affondataOra: true, nave: { pezzo: 0 } })
    expect(celle[poppa]).toMatchObject({ affondata: true, affondataOra: true, nuovo: true, nave: { pezzo: 1 } })
    // Le altre caselle non si muovono.
    expect(celle.filter((c) => c.affondataOra)).toHaveLength(2)
  })

  it('segna dove ho appena sparato, finché la risposta non arriva', () => {
    expect(celleNemiche([], [], null, null, 33)[33].mirata).toBe(true)
    // Una casella gia' colpita non torna "mirata".
    expect(celleNemiche([colpo(33, 'acqua')], [], null, null, 33)[33].mirata).toBeUndefined()
  })

  it('nel proprio mare il colpo appena preso e’ quello nuovo', () => {
    const k = caselleDellaNave(FLOTTA_DI_PROVA[0])[2]
    const celle = celleProprie(FLOTTA_DI_PROVA, [colpo(k, 'colpito')], null, colpo(k, 'colpito'))
    expect(celle[k]).toMatchObject({ colpo: 'colpito', nuovo: true, nave: { tipo: 'portaerei' } })
    expect(celle[k].affondata).toBe(false)
  })
})

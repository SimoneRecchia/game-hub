import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  DA_INDOVINARE_CATENA,
  ERRORE_CATENA,
  JOLLY_CATENA,
  MONTEPREMI_CATENA,
  NASCOSTE_CATENA,
  PAROLE_CATENA,
  PASSO_FINALE,
  POSTO_TERZO,
  applicaCatena,
  catenaDelGiorno,
  giornataValida,
  inizio,
  jollyUsabile,
  mosseValide,
  normalizzaCatena,
  riparteIlMinuto,
  stessaParola,
  svolgiCatena,
  vistaCatena,
  type CatenaDelGiorno,
  type CatenaDellElenco,
  type MossaCatena,
} from '../catena'
import { VERSIONE_LIBERE_CATENA } from '../catena-libere'
import { isGameLetter } from '../wordle'

const RADICE = join(__dirname, '..', '..')
const classificate = JSON.parse(
  readFileSync(join(RADICE, 'scripts', 'data', 'catena-classificate.json'), 'utf8'),
) as CatenaDellElenco[]
const fileLibere = readFileSync(join(RADICE, 'public', 'dati', 'catena', 'libere.json'), 'utf8')
const libere = (JSON.parse(fileLibere) as { catene: Array<[string[], string[]]> }).catene.map(
  ([p, e]): CatenaDellElenco => ({ p, e }),
)

/** Una catena da provare: le parole da indovinare sono LIBERO, CAVALLO, SEDIA, BATTAGLIA e la finale NAVALE. */
const CATENA: CatenaDelGiorno = {
  parole: [
    'spirito',
    'libero',
    'tiro',
    'cavallo',
    'dondolo',
    'sedia',
    'campo',
    'battaglia',
    'grande',
    'navale',
    'base',
  ],
  espressioni: [
    'spirito libero',
    'tiro libero',
    'tiro da cavallo',
    'cavallo a dondolo',
    'sedia a dondolo',
    'campo di sedia',
    'campo di battaglia',
    'grande battaglia',
    'grande navale',
    'base navale',
  ],
}

const gioca = (...mosse: MossaCatena[]) => svolgiCatena(CATENA, mosse)
const prova = (w: string): MossaCatena => ({ k: 'p', w })
const giuste = NASCOSTE_CATENA.slice(0, PASSO_FINALE).map((posto) => prova(CATENA.parole[posto]))

describe('le parole', () => {
  it('si confrontano senza maiuscole, accenti e spazi', () => {
    expect(stessaParola('libero', ' LIBERO ')).toBe(true)
    expect(stessaParola('città', 'Citta')).toBe(true)
    expect(stessaParola('libero', 'libera')).toBe(false)
    expect(stessaParola('libero', '')).toBe(false)
  })
})

describe('la catena', () => {
  it('comincia dalla prima parola, con la prima lettera e il montepremi intero', () => {
    const s = inizio()
    expect(s.passo).toBe(0)
    expect(s.montepremi).toBe(MONTEPREMI_CATENA)
    expect(s.parole[0].lettere).toBe(1)
    // Della finale si vedono le prime due lettere.
    expect(s.parole[PASSO_FINALE].lettere).toBe(2)
  })

  it('una parola giusta fa scendere, e non costa niente', () => {
    const s = gioca(prova('Libero'))
    expect(s.passo).toBe(1)
    expect(s.parole[0].esito).toBe('giusta')
    expect(s.montepremi).toBe(MONTEPREMI_CATENA)
  })

  it('un errore costa sei punti e mostra un’altra lettera; il secondo mostra la parola e si va avanti', () => {
    const una = applicaCatena(CATENA, inizio(), prova('lancio'))!
    expect(una.esito).toBe('sbagliata')
    expect(una.dopo.passo).toBe(0)
    expect(una.dopo.parole[0].lettere).toBe(2)
    expect(una.dopo.montepremi).toBe(MONTEPREMI_CATENA - ERRORE_CATENA)
    const due = applicaCatena(CATENA, una.dopo, prova('lavoro'))!
    expect(due.esito).toBe('rivelata')
    expect(due.dopo.passo).toBe(1)
    expect(due.dopo.parole[0].esito).toBe('rivelata')
    expect(due.dopo.montepremi).toBe(MONTEPREMI_CATENA - 2 * ERRORE_CATENA)
  })

  it('il minuto riparte dopo un errore o un jolly, non dopo una parola trovata o mostrata', () => {
    expect(riparteIlMinuto('sbagliata')).toBe(true)
    expect(riparteIlMinuto('jolly')).toBe(true)
    for (const esito of ['giusta', 'rivelata', 'scaduta', 'comprato'] as const) expect(riparteIlMinuto(esito)).toBe(false)
  })

  it('i jolly sono due, mostrano la lettera dopo e non costano niente', () => {
    const s = gioca({ k: 'j' }, { k: 'j' })
    expect(s.jollyUsati).toBe(JOLLY_CATENA)
    expect(s.parole[0].lettere).toBe(3)
    expect(s.montepremi).toBe(MONTEPREMI_CATENA)
    expect(applicaCatena(CATENA, s, { k: 'j' })).toBeNull()
  })

  it('ne’ un jolly ne’ un errore mostrano l’ultima lettera: quella resta da trovare', () => {
    // Una parola di quattro lettere: un errore e un jolly ne mostrano tre, e il secondo jolly non si puo' usare.
    const corta: CatenaDelGiorno = { ...CATENA, parole: CATENA.parole.map((p, i) => (i === 1 ? 'lume' : p)) }
    const s = svolgiCatena(corta, [prova('lama'), { k: 'j' }, { k: 'j' }])
    expect(s.parole[0]).toMatchObject({ lettere: 3, errori: 1 })
    expect(s.jollyUsati).toBe(1)
    // Con due jolly se ne vedono tre lo stesso, e un errore non mostra la quarta: la mostra il secondo.
    const t = svolgiCatena(corta, [{ k: 'j' }, { k: 'j' }, prova('lama')])
    expect(t.parole[0]).toMatchObject({ lettere: 3, errori: 1 })
  })

  it('arrivati alla finale con tutti e due i jolly, il terzo elemento c’e’ gia’', () => {
    const s = gioca(...giuste)
    expect(s.passo).toBe(PASSO_FINALE)
    expect(s.terzo).toBe('regalato')
    expect(applicaCatena(CATENA, s, { k: 'c' })).toBeNull()
  })

  it('con un jolly usato il terzo elemento si compra, e costa quanto un errore', () => {
    const s = gioca({ k: 'j' }, ...giuste)
    expect(s.terzo).toBe('no')
    const comprato = applicaCatena(CATENA, s, { k: 'c' })!
    expect(comprato.esito).toBe('comprato')
    expect(comprato.dopo.terzo).toBe('comprato')
    expect(comprato.dopo.montepremi).toBe(MONTEPREMI_CATENA - ERRORE_CATENA)
    expect(applicaCatena(CATENA, comprato.dopo, { k: 'c' })).toBeNull()
  })

  it('nella finale non si provano parole: la risposta e’ una sola, a parte', () => {
    const s = gioca(...giuste)
    expect(applicaCatena(CATENA, s, prova('navale'))).toBeNull()
    // Ne' i jolly, anche se ne restano, ne' il tempo di una parola: quello della finale e' a parte.
    expect(applicaCatena(CATENA, s, { k: 'j' })).toBeNull()
    expect(jollyUsabile(CATENA, s)).toBe(false)
    expect(applicaCatena(CATENA, s, { k: 't' })).toBeNull()
  })

  it('il tempo finito mostra la parola e costa come i due errori che l’avrebbero mostrata', () => {
    const subito = applicaCatena(CATENA, inizio(), { k: 't' })!
    expect(subito.esito).toBe('scaduta')
    expect(subito.dopo).toMatchObject({ passo: 1, montepremi: MONTEPREMI_CATENA - 2 * ERRORE_CATENA })
    expect(subito.dopo.parole[0]).toMatchObject({ esito: 'rivelata', errori: 2 })
    const dopoUnErrore = applicaCatena(CATENA, gioca(prova('lancio')), { k: 't' })!
    expect(dopoUnErrore.dopo).toMatchObject({ passo: 1, montepremi: MONTEPREMI_CATENA - 2 * ERRORE_CATENA })
  })

  it('il terzo elemento non si compra prima della finale', () => {
    expect(applicaCatena(CATENA, inizio(), { k: 'c' })).toBeNull()
  })

  it('le mosse che non si potevano fare non contano', () => {
    expect(gioca({ k: 'c' }, prova('libero'))).toEqual(gioca(prova('libero')))
  })

  it('legge dal database solo le mosse che hanno la forma giusta', () => {
    expect(mosseValide([{ k: 'p', w: 'a' }, { k: 'j' }, { k: 'x' }, null, { k: 'p' }, { k: 'c' }])).toEqual([
      { k: 'p', w: 'a' },
      { k: 'j' },
      { k: 'c' },
    ])
    expect(mosseValide('no')).toEqual([])
  })
})

describe('quel che si vede', () => {
  it('all’inizio la prima coppia, e della parola in mezzo la prima lettera', () => {
    const voci = vistaCatena(CATENA, inizio(), { finita: false, indovinata: null })
    expect(voci.map((v) => v.parola)).toEqual(['spirito', null, 'tiro'])
    expect(voci[1]).toMatchObject({ tipo: 'nascosta', lettere: 'L', espressione: null })
  })

  it('le parole dopo la coppia di adesso non escono', () => {
    const voci = vistaCatena(CATENA, gioca(prova('libero')), { finita: false, indovinata: null })
    expect(voci).toHaveLength(5)
    expect(voci.map((v) => v.parola)).toEqual(['spirito', 'libero', 'tiro', null, 'dondolo'])
  })

  it('della finale le prime due lettere e l’ultima, e il terzo elemento solo se c’e’', () => {
    const conJolly = gioca({ k: 'j' }, ...giuste)
    const voci = vistaCatena(CATENA, conJolly, { finita: false, indovinata: null })
    expect(voci).toHaveLength(PAROLE_CATENA)
    expect(voci[NASCOSTE_CATENA[PASSO_FINALE]]).toMatchObject({ lettere: 'NA', ultima: 'E', parola: null })
    expect(voci[POSTO_TERZO]).toMatchObject({ tipo: 'terzo', parola: null })
    const regalato = vistaCatena(CATENA, gioca(...giuste), { finita: false, indovinata: null })
    expect(regalato[POSTO_TERZO].parola).toBe('base')
  })

  it('a partita finita tutto, con le espressioni', () => {
    const voci = vistaCatena(CATENA, gioca(...giuste), { finita: true, indovinata: false })
    expect(voci.map((v) => v.parola)).toEqual(CATENA.parole)
    expect(voci[NASCOSTE_CATENA[PASSO_FINALE]].tipo).toBe('rivelata')
    expect(voci.slice(0, -1).map((v) => v.espressione)).toEqual(CATENA.espressioni)
  })
})

describe('l’elenco delle catene', () => {
  const tutte = [...classificate, ...libere]

  it('ha undici parole e dieci espressioni per catena, e ogni espressione lega le sue due', () => {
    for (const c of tutte) {
      expect(giornataValida({ parole: c.p, espressioni: c.e }), c.p.join(' ')).toBe(true)
      for (let i = 0; i < PAROLE_CATENA - 1; i += 1) {
        const e = normalizzaCatena(c.e[i])
        for (const p of [c.p[i], c.p[i + 1]]) {
          // "Cuor di Leone" lega CUORE: basta la radice.
          const radice = normalizzaCatena(p).slice(0, Math.max(3, normalizzaCatena(p).length - 2))
          expect(e, `${c.e[i]} / ${p}`).toContain(radice)
        }
      }
    }
  })

  it('le parole da indovinare si scrivono con la tastiera del gioco', () => {
    for (const c of tutte) {
      for (const posto of NASCOSTE_CATENA) {
        expect([...normalizzaCatena(c.p[posto])].every(isGameLetter), c.p[posto]).toBe(true)
      }
    }
  })

  it('una parola sta in una catena una volta sola', () => {
    for (const c of tutte) expect(new Set(c.p.map(normalizzaCatena)).size, c.p.join(' ')).toBe(PAROLE_CATENA)
  })

  it('le libere non hanno nessuna espressione delle classificate: giocare a caso non mostra la catena di un giorno', () => {
    const delGiorno = new Set(classificate.flatMap((c) => c.e.map((e) => e.toLowerCase())))
    for (const c of libere) for (const e of c.e) expect(delGiorno.has(e.toLowerCase()), e).toBe(false)
    expect(classificate.length).toBeGreaterThan(180)
    expect(libere.length).toBeGreaterThan(60)
  })

  it('l’impronta nell’indirizzo delle libere e’ quella del file', () => {
    expect(createHash('sha256').update(fileLibere).digest('hex').slice(0, 10)).toBe(VERSIONE_LIBERE_CATENA)
  })
})

describe('la catena del giorno', () => {
  it('e’ la stessa per lo stesso giorno, e cambia da un giorno all’altro', () => {
    expect(catenaDelGiorno(300, classificate)).toEqual(catenaDelGiorno(300, classificate))
    expect(catenaDelGiorno(300, classificate)).not.toEqual(catenaDelGiorno(301, classificate))
  })

  it('non ripete una catena prima di averle date tutte', () => {
    const viste = new Set(
      Array.from({ length: classificate.length }, (_, i) => catenaDelGiorno(i, classificate).parole.join(' ')),
    )
    expect(viste.size).toBe(classificate.length)
  })

  it('salta quella da evitare, e sempre allo stesso modo', () => {
    const normale = catenaDelGiorno(42, classificate)
    const evitata = catenaDelGiorno(42, classificate, (c) => c.p[0] === normale.parole[0])
    expect(evitata.parole[0]).not.toBe(normale.parole[0])
    expect(catenaDelGiorno(42, classificate, (c) => c.p[0] === normale.parole[0])).toEqual(evitata)
  })

  it('ha cinque parole da indovinare', () => {
    expect(DA_INDOVINARE_CATENA).toBe(5)
  })
})

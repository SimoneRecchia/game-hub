import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  DA_INDOVINARE_CATENA,
  ERRORE_CATENA,
  FONDO_CATENA,
  JOLLY_CATENA,
  MONTEPREMI_CATENA,
  NASCOSTE_CATENA,
  PAROLE_CATENA,
  PASSO_FINALE,
  POSTO_TERZO,
  SECONDO_ERRORE_CATENA,
  applicaCatena,
  catenaDelGiorno,
  giornataValida,
  inizio,
  jollyUsabile,
  mosseValide,
  normalizzaCatena,
  parolaRiconosciuta,
  parolaVoluta,
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
  it('comincia dalla prima parola, con le prime due lettere e il montepremi intero', () => {
    const s = inizio()
    expect(s.passo).toBe(0)
    expect(s.montepremi).toBe(MONTEPREMI_CATENA)
    expect(s.parole[0].lettere).toBe(2)
    // Della finale se ne vede una sola: e' quella che deve far pensare.
    expect(s.parole[PASSO_FINALE].lettere).toBe(1)
  })

  it('una parola giusta fa scendere, e non costa niente', () => {
    const s = gioca(prova('Libero'))
    expect(s.passo).toBe(1)
    expect(s.parole[0].esito).toBe('giusta')
    expect(s.montepremi).toBe(MONTEPREMI_CATENA)
  })

  it('un errore costa dieci punti e mostra un’altra lettera; il secondo ne costa sei, mostra la parola e si va avanti', () => {
    const una = applicaCatena(CATENA, inizio(), prova('lancio'))!
    expect(una.esito).toBe('sbagliata')
    expect(una.dopo.passo).toBe(0)
    expect(una.dopo.parole[0].lettere).toBe(3)
    expect(una.dopo.montepremi).toBe(MONTEPREMI_CATENA - ERRORE_CATENA)
    const due = applicaCatena(CATENA, una.dopo, prova('lavoro'))!
    expect(due.esito).toBe('rivelata')
    expect(due.dopo.passo).toBe(1)
    expect(due.dopo.parole[0].esito).toBe('rivelata')
    expect(due.dopo.montepremi).toBe(MONTEPREMI_CATENA - ERRORE_CATENA - SECONDO_ERRORE_CATENA)
    // Sulla parola dopo il primo errore torna a costare dieci.
    const tre = applicaCatena(CATENA, due.dopo, prova('cammello'))!
    expect(tre.dopo.montepremi).toBe(MONTEPREMI_CATENA - 2 * ERRORE_CATENA - SECONDO_ERRORE_CATENA)
  })

  it('tutte le parole sbagliate due volte lasciano trentasei punti, e nessun errore e’ gratis', () => {
    const sbagliate = NASCOSTE_CATENA.slice(0, PASSO_FINALE).flatMap(() => [prova('nulla'), prova('niente')])
    const s = gioca(...sbagliate)
    expect(s.passo).toBe(PASSO_FINALE)
    expect(s.montepremi).toBe(MONTEPREMI_CATENA - 4 * (ERRORE_CATENA + SECONDO_ERRORE_CATENA))
    let prima = MONTEPREMI_CATENA
    for (let i = 1; i <= sbagliate.length; i += 1) {
      const dopo = gioca(...sbagliate.slice(0, i)).montepremi
      expect(dopo).toBeLessThan(prima)
      prima = dopo
    }
  })

  it('il minuto riparte dopo un errore o un jolly, non dopo una parola trovata o mostrata', () => {
    expect(riparteIlMinuto('sbagliata')).toBe(true)
    expect(riparteIlMinuto('jolly')).toBe(true)
    for (const esito of ['giusta', 'rivelata', 'scaduta', 'comprato'] as const) expect(riparteIlMinuto(esito)).toBe(false)
  })

  it('i jolly sono due, mostrano la lettera dopo e non costano niente', () => {
    const s = gioca({ k: 'j' }, { k: 'j' })
    expect(s.jollyUsati).toBe(JOLLY_CATENA)
    expect(s.parole[0].lettere).toBe(4)
    expect(s.montepremi).toBe(MONTEPREMI_CATENA)
    expect(applicaCatena(CATENA, s, { k: 'j' })).toBeNull()
  })

  it('ne’ un jolly ne’ un errore mostrano l’ultima lettera: quella resta da trovare', () => {
    // Una parola di cinque lettere: un errore e un jolly ne mostrano quattro, e il secondo jolly non si puo' usare.
    const corta: CatenaDelGiorno = { ...CATENA, parole: CATENA.parole.map((p, i) => (i === 1 ? 'lumen' : p)) }
    const s = svolgiCatena(corta, [prova('lama'), { k: 'j' }, { k: 'j' }])
    expect(s.parole[0]).toMatchObject({ lettere: 4, errori: 1 })
    expect(s.jollyUsati).toBe(1)
    // Con due jolly se ne vedono quattro lo stesso, e un errore non mostra la quinta: la mostra il secondo.
    const t = svolgiCatena(corta, [{ k: 'j' }, { k: 'j' }, prova('lama')])
    expect(t.parole[0]).toMatchObject({ lettere: 4, errori: 1 })
  })

  it('arrivati alla finale con tutti e due i jolly, il terzo elemento c’e’ gia’', () => {
    const s = gioca(...giuste)
    expect(s.passo).toBe(PASSO_FINALE)
    expect(s.terzo).toBe('regalato')
    expect(applicaCatena(CATENA, s, { k: 'c' })).toBeNull()
  })

  it('con un jolly usato il terzo elemento si compra, e dimezza il montepremi', () => {
    const s = gioca({ k: 'j' }, ...giuste)
    expect(s.terzo).toBe('no')
    const comprato = applicaCatena(CATENA, s, { k: 'c' })!
    expect(comprato.esito).toBe('comprato')
    expect(comprato.dopo.terzo).toBe('comprato')
    expect(comprato.dopo.montepremi).toBe(MONTEPREMI_CATENA / 2)
    expect(applicaCatena(CATENA, comprato.dopo, { k: 'c' })).toBeNull()
    // Dopo un errore si dimezza quel che resta.
    const conErrore = applicaCatena(CATENA, gioca({ k: 'j' }, prova('lancio'), ...giuste), { k: 'c' })!
    expect(conErrore.dopo.montepremi).toBe((MONTEPREMI_CATENA - ERRORE_CATENA) / 2)
  })

  it('dimezzato dopo tutti gli errori non scende sotto quel che vale una finale sbagliata', () => {
    const sbagliate = NASCOSTE_CATENA.slice(0, PASSO_FINALE).flatMap(() => [prova('nulla'), prova('niente')])
    const s = applicaCatena(CATENA, gioca({ k: 'j' }, ...sbagliate), { k: 'c' })!
    expect(s.dopo.montepremi).toBe(FONDO_CATENA)
    expect(FONDO_CATENA).toBeGreaterThan(0)
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
    const dueErrori = MONTEPREMI_CATENA - ERRORE_CATENA - SECONDO_ERRORE_CATENA
    expect(subito.dopo).toMatchObject({ passo: 1, montepremi: dueErrori })
    expect(subito.dopo.parole[0]).toMatchObject({ esito: 'rivelata', errori: 2 })
    const dopoUnErrore = applicaCatena(CATENA, gioca(prova('lancio')), { k: 't' })!
    expect(dopoUnErrore.dopo).toMatchObject({ passo: 1, montepremi: dueErrori })
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

describe('la parola scritta per intero', () => {
  const finale = () => gioca(...giuste)

  it('vale anche con le lettere che si vedevano già', () => {
    // La parola si scrive dopo la L; chi la riscrive tutta manda "llibero".
    expect(parolaVoluta('libero', 'llibero', { prime: 1, ultima: false })).toBe('libero')
    expect(parolaVoluta('libero', 'libero', { prime: 1, ultima: false })).toBe('libero')
    // Dopo un errore se ne vedono due: riscrivere la seconda, o tutte e due, vale lo stesso.
    expect(parolaVoluta('libero', 'liibero', { prime: 2, ultima: false })).toBe('libero')
    expect(parolaVoluta('libero', 'lilibero', { prime: 2, ultima: false })).toBe('libero')
    // All'inizio se ne vedono due: chi riscrive tutto manda "lilibero".
    const s = applicaCatena(CATENA, inizio(), prova(parolaRiconosciuta(CATENA, inizio(), 'lilibero')))!
    expect(s.esito).toBe('giusta')
  })

  it('nella finale vale anche riscrivendo la prima lettera', () => {
    // N…: si scrive AVALE. Chi scrive NAVALE manda "nnavale".
    for (const scritta of ['navale', 'nnavale']) {
      expect(parolaRiconosciuta(CATENA, finale(), scritta), scritta).toBe('navale')
    }
  })

  it('una parola sbagliata resta sbagliata', () => {
    expect(parolaVoluta('libero', 'llibera', { prime: 1, ultima: false })).toBe('llibera')
    expect(parolaVoluta('libero', 'lancio', { prime: 1, ultima: false })).toBe('lancio')
    expect(parolaVoluta('libero', 'l', { prime: 1, ultima: false })).toBe('l')
    expect(parolaRiconosciuta(CATENA, finale(), 'nnavigare')).toBe('nnavigare')
    // La lettera data da sola non e' una parola.
    expect(parolaRiconosciuta(CATENA, finale(), 'n')).toBe('n')
  })
})

describe('quel che si vede', () => {
  it('all’inizio la prima coppia, e della parola in mezzo le prime due lettere', () => {
    const voci = vistaCatena(CATENA, inizio(), { finita: false, indovinata: null })
    expect(voci.map((v) => v.parola)).toEqual(['spirito', null, 'tiro'])
    expect(voci[1]).toMatchObject({ tipo: 'nascosta', lettere: 'LI', espressione: null })
    expect(voci.map((v) => v.espressione)).toEqual([null, null, null])
  })

  it('le parole dopo la coppia di adesso non escono', () => {
    const voci = vistaCatena(CATENA, gioca(prova('libero')), { finita: false, indovinata: null })
    expect(voci).toHaveLength(5)
    expect(voci.map((v) => v.parola)).toEqual(['spirito', 'libero', 'tiro', null, 'dondolo'])
  })

  it('fra due parole che si vedono, l’espressione che le lega, che la parola sia trovata o mostrata', () => {
    const trovata = vistaCatena(CATENA, gioca(prova('libero')), { finita: false, indovinata: null })
    expect(trovata.map((v) => v.espressione)).toEqual(['spirito libero', 'tiro libero', null, null, null])
    const mostrata = vistaCatena(CATENA, gioca(prova('lancio'), prova('lavoro')), { finita: false, indovinata: null })
    expect(mostrata.map((v) => v.espressione)).toEqual(['spirito libero', 'tiro libero', null, null, null])
  })

  it('della finale la prima lettera sola, e il terzo elemento solo se c’e’', () => {
    const conJolly = gioca({ k: 'j' }, ...giuste)
    const voci = vistaCatena(CATENA, conJolly, { finita: false, indovinata: null })
    expect(voci).toHaveLength(PAROLE_CATENA)
    expect(voci[NASCOSTE_CATENA[PASSO_FINALE]]).toMatchObject({ lettere: 'N', parola: null, espressione: null })
    expect(voci[NASCOSTE_CATENA[PASSO_FINALE] - 1].espressione).toBeNull()
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

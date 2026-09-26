import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../daily'
import { CATEGORIE, CONTINENTI, VISTE, categoriaDelGiorno, dentroVista, type CategoriaQuiz } from '../quiz'
import {
  acqueAccettate,
  domandaValida,
  generaDomande,
  indicizza,
  rispostaGiusta,
  senzaRisposta,
  type AreaQuiz,
  type DomandaCompleta,
} from '../quiz-domande'
import {
  acquaConArticolo,
  conArticolo,
  daAcqua,
  diPaese,
  fiumeNellaFrase,
  inPaese,
  lagoInOpzione,
  lagoNellaFrase,
  suLago,
} from '../quiz-lingua'
import { ID, MONDO } from './quiz-mondo'

const ix = indicizza(MONDO)
const paese = (id: string) => ix.paesi.get(id)!

describe('l’italiano delle domande', () => {
  it('mette l’articolo giusto ai paesi', () => {
    expect(diPaese('IT', 'Italia')).toBe('dell’Italia')
    expect(diPaese('FR', 'Francia')).toBe('della Francia')
    expect(diPaese('PT', 'Portogallo')).toBe('del Portogallo')
    expect(diPaese('LK', 'Sri Lanka')).toBe('dello Sri Lanka')
    expect(diPaese('ZM', 'Zambia')).toBe('dello Zambia')
    expect(diPaese('YE', 'Yemen')).toBe('dello Yemen')
    expect(diPaese('US', 'Stati Uniti')).toBe('degli Stati Uniti')
    expect(diPaese('NL', 'Paesi Bassi')).toBe('dei Paesi Bassi')
    expect(diPaese('PH', 'Filippine')).toBe('delle Filippine')
    expect(diPaese('AE', 'Emirati Arabi Uniti')).toBe('degli Emirati Arabi Uniti')
    expect(diPaese('CU', 'Cuba')).toBe('di Cuba')
    expect(diPaese('HN', 'Honduras')).toBe('dell’Honduras')
    expect(diPaese('KE', 'Kenya')).toBe('del Kenya')
    expect(conArticolo('IT', 'Italia')).toBe('l’Italia')
    expect(conArticolo('CL', 'Cile')).toBe('il Cile')
    expect(conArticolo('MT', 'Malta')).toBe('Malta')
  })

  it('dice "in", "nel" e "a" come si dice', () => {
    expect(inPaese('IT', 'Italia')).toBe('in Italia')
    expect(inPaese('BR', 'Brasile')).toBe('in Brasile')
    expect(inPaese('GB', 'Regno Unito')).toBe('nel Regno Unito')
    expect(inPaese('CZ', 'Repubblica Ceca')).toBe('nella Repubblica Ceca')
    expect(inPaese('US', 'Stati Uniti')).toBe('negli Stati Uniti')
    expect(inPaese('PH', 'Filippine')).toBe('nelle Filippine')
    expect(inPaese('CU', 'Cuba')).toBe('a Cuba')
    expect(inPaese('HT', 'Haiti')).toBe('ad Haiti')
    expect(inPaese('IL', 'Israele')).toBe('in Israele')
  })

  it('e ai mari, ai fiumi e ai laghi', () => {
    expect(daAcqua('Mar Baltico')).toBe('dal Mar Baltico')
    expect(daAcqua('Oceano Indiano')).toBe('dall’Oceano Indiano')
    expect(daAcqua('Baia di Hudson')).toBe('dalla Baia di Hudson')
    expect(daAcqua('Stretto di Gibilterra')).toBe('dallo Stretto di Gibilterra')
    expect(acquaConArticolo('Manica')).toBe('la Manica')
    expect(fiumeNellaFrase('Senna')).toBe('il fiume Senna')
    expect(fiumeNellaFrase('Rio delle Amazzoni')).toBe('il Rio delle Amazzoni')
    expect(lagoNellaFrase('lago di Garda')).toBe('il lago di Garda')
    expect(lagoNellaFrase('Titicaca')).toBe('il lago Titicaca')
    expect(lagoNellaFrase('mar Caspio')).toBe('il Mar Caspio')
    expect(suLago('lago Vittoria')).toBe('sul lago Vittoria')
    expect(lagoInOpzione('lago di Garda')).toBe('Lago di Garda')
    expect(lagoInOpzione('Titicaca')).toBe('Lago Titicaca')
  })
})

describe('la categoria del giorno', () => {
  it('passa da tutte le categorie ogni sette giorni, e non si ripete mai due giorni di fila', () => {
    for (let giro = 0; giro < 100; giro += 1) {
      const settimana = Array.from({ length: CATEGORIE.length }, (_, i) => categoriaDelGiorno(giro * CATEGORIE.length + i + 1))
      expect(new Set(settimana).size).toBe(CATEGORIE.length)
    }
    for (let n = 2; n <= 730; n += 1) expect(categoriaDelGiorno(n)).not.toBe(categoriaDelGiorno(n - 1))
  })
})

describe('le viste della cartina', () => {
  it('contengono il loro continente e passano l’antimeridiano dove serve', () => {
    expect(dentroVista('mediterraneo', [9, 37.5, 16, 44])).toBe(true)
    expect(dentroVista('europa', [9, 37.5, 16, 44])).toBe(true)
    // Le Figi stanno a cavallo del 180: la vista dell'Oceania le prende intere.
    expect(dentroVista('oceania', [-179.9, -20, -178, -16])).toBe(true)
    expect(VISTE.oceania[2]).toBeGreaterThan(180)
  })
})

/** Tutte le domande di tante partite, per categoria e area. */
function tante(categoria: CategoriaQuiz, area: AreaQuiz = 'mondo', partite = 40): DomandaCompleta[] {
  const tutte: DomandaCompleta[] = []
  for (let seme = 1; seme <= partite; seme += 1) {
    tutte.push(...generaDomande(ix, { categoria, area, quante: 10 }, mulberry32(seme)))
  }
  return tutte
}

const opzioniSbagliate = (d: DomandaCompleta) => d.opzioni.filter((o) => o.id !== d.giusta)

describe('le domande', () => {
  it('sono in ordine in ogni categoria: quattro opzioni diverse, una giusta, nessun soggetto ripetuto', () => {
    for (const categoria of CATEGORIE) {
      for (let seme = 1; seme <= 25; seme += 1) {
        const partita = generaDomande(ix, { categoria, area: 'mondo', quante: 10 }, mulberry32(seme))
        expect(partita.length, categoria).toBeGreaterThan(0)
        expect(new Set(partita.map((d) => d.soggetto)).size).toBe(partita.length)
        for (const d of partita) expect(domandaValida(d), `${categoria}: ${d.testo}`).toBe(true)
      }
    }
  })

  it('ci sono tutte: i test qui sotto non passano per mancanza di domande', () => {
    const tipi = new Set(CATEGORIE.flatMap((c) => tante(c).map((d) => d.tipo)))
    expect([...tipi].sort()).toEqual(
      [
        'acqua-di-stato',
        'bandiera-di',
        'capitale-di',
        'dove-acqua',
        'dove-stato',
        'fiume-in-stato',
        'lago-in-stato',
        'quale-bandiera',
        'stato-bagnato',
        'stato-del-fiume',
        'stato-del-lago',
        'stato-di-capitale',
      ].sort(),
    )
  })

  it('sono le stesse con lo stesso seme', () => {
    for (const categoria of CATEGORIE) {
      const a = generaDomande(ix, { categoria, area: 'mondo', quante: 10 }, mulberry32(42))
      const b = generaDomande(ix, { categoria, area: 'mondo', quante: 10 }, mulberry32(42))
      expect(a).toEqual(b)
    }
  })

  it('non mostrano la risposta prima del tempo', () => {
    for (const d of tante('cartina', 'mondo', 3).concat(tante('capitali', 'mondo', 3))) {
      const vista: Record<string, unknown> = { ...senzaRisposta(d) }
      for (const segreto of ['giusta', 'accettate', 'risposta', 'soggetto']) expect(vista[segreto]).toBeUndefined()
    }
  })

  it('sulle capitali: la giusta è la capitale, le altre no', () => {
    for (const d of tante('capitali')) {
      if (d.tipo !== 'capitale-di') continue
      const p = paese(d.soggetto)
      expect(d.opzioni.find((o) => o.id === d.giusta)?.testo).toBe(p.cap)
      for (const o of opzioniSbagliate(d)) expect(o.testo).not.toBe(p.cap)
    }
  })

  it('sui mari: la risposta giusta conta davvero, e quelle sbagliate sono lontane', () => {
    for (const categoria of ['mari', 'oceani'] as const) {
      for (const d of tante(categoria)) {
        if (d.tipo === 'stato-bagnato') {
          const acqua = ix.dati.acque.find((a) => d.testo.includes(a.n))!
          const giusto = paese(d.giusta)
          const i = giusto.bagna.indexOf(acqua.id)
          expect(i, d.testo).toBeGreaterThanOrEqual(0)
          expect(giusto.peso[i]).toBeGreaterThanOrEqual(40)
          for (const o of opzioniSbagliate(d)) {
            const q = paese(o.id)
            expect(q.bagna.includes(acqua.id) || q.vicine.includes(acqua.id), `${d.testo} ${q.n}`).toBe(false)
          }
        }
        if (d.tipo === 'acqua-di-stato') {
          const p = paese(d.soggetto)
          const i = p.bagna.indexOf(d.giusta)
          expect(p.peso[i], d.testo).toBeGreaterThanOrEqual(40)
          for (const o of opzioniSbagliate(d)) {
            expect(p.bagna.includes(o.id) || p.vicine.includes(o.id), `${d.testo} ${o.testo}`).toBe(false)
          }
        }
      }
    }
  })

  it('non si fanno se il nome del mare dice la risposta', () => {
    for (const d of tante('mari')) {
      if (d.tipo === 'acqua-di-stato' && d.soggetto === 'PH') expect(d.giusta).not.toBe(ID.FILIPPINE)
      if (d.tipo === 'stato-bagnato' && d.testo.includes('Filippine')) expect(d.giusta).not.toBe('PH')
    }
  })

  it('il Cile è del Pacifico: un’acqua che bagna poco non è la risposta', () => {
    for (const d of tante('oceani')) {
      if (d.tipo === 'acqua-di-stato' && d.soggetto === 'CL') expect(d.giusta).toBe(ID.PAC)
      if (d.tipo === 'stato-bagnato' && d.testo.includes('Atlantico')) expect(d.giusta).not.toBe('CL')
    }
  })

  it('sui fiumi e sui laghi: gli errori non toccano la risposta né i paesi vicini', () => {
    for (const categoria of ['fiumi', 'laghi'] as const) {
      const sezione = ix.dati[categoria]
      for (const d of tante(categoria)) {
        if (d.tipo === 'stato-del-fiume' || d.tipo === 'stato-del-lago') {
          const c = sezione.find((x) => x.id === d.soggetto)!
          expect(c.p).toContain(d.giusta)
          const zona = new Set(c.p.flatMap((id) => [id, ...paese(id).conf]))
          for (const o of opzioniSbagliate(d)) expect(zona.has(o.id), `${d.testo} ${o.testo}`).toBe(false)
        }
        if (d.tipo === 'fiume-in-stato' || d.tipo === 'lago-in-stato') {
          const giusto = sezione.find((x) => x.id === d.giusta)!
          const p = ix.dati.paesi.find((q) => d.testo.endsWith(`${q.n}?`))!
          expect(giusto.p).toContain(p.id)
          const vietati = new Set([p.id, ...p.conf])
          for (const o of opzioniSbagliate(d)) {
            const c = sezione.find((x) => x.id === o.id)!
            expect(c.p.some((id) => vietati.has(id)), `${d.testo} ${o.testo}`).toBe(false)
          }
        }
      }
    }
  })

  it('con un continente parlano di quel continente', () => {
    for (const continente of CONTINENTI) {
      for (const d of tante('capitali', continente, 5)) expect(paese(d.soggetto).k).toContain(continente)
    }
  })

  it('con un paese solo parlano dei suoi fiumi, dal più noto', () => {
    const d = generaDomande(ix, { categoria: 'fiumi', area: 'paese:IT', quante: 10 }, mulberry32(3))
    expect(d.map((x) => x.risposta)).toEqual(['Po', 'Tevere', 'Arno', 'Adige'])
    for (const x of d) expect(x.testo).toBe('Quale di questi fiumi scorre in Italia?')
  })
})

describe('la cartina muta', () => {
  it('chiede i paesi con il loro codice, nel loro continente', () => {
    for (const d of tante('cartina')) {
      if (d.tipo !== 'dove-stato') continue
      const p = paese(d.soggetto)
      expect(d.giusta).toBe(`n${p.num}`)
      expect(d.cartina?.strato).toBe('paesi')
      expect(p.a).toBeGreaterThanOrEqual(20_000)
    }
  })

  it('conta giusto un mare che sta dentro quello chiesto, e non il contrario', () => {
    const med = acqueAccettate(ix, ix.acque.get(ID.MED)!)
    expect(med).toEqual(expect.arrayContaining([ID.MED, ID.TIR, ID.ADR]))
    const tirreno = acqueAccettate(ix, ix.acque.get(ID.TIR)!)
    expect(tirreno).toEqual([ID.TIR])
    // Per l'Atlantico valgono i suoi golfi, non i mari che hanno un nome loro.
    const atlantico = acqueAccettate(ix, ix.acque.get(ID.ATL)!)
    expect(atlantico).toContain(ID.BISCAGLIA)
    expect(atlantico).not.toContain(ID.MED)
    expect(atlantico).not.toContain(ID.NORD)
    const d = { cartina: { vista: 'mediterraneo', strato: 'acque' }, giusta: ID.MED, accettate: med } as DomandaCompleta
    expect(rispostaGiusta(d, ID.TIR)).toBe(true)
    expect(rispostaGiusta(d, ID.NORD)).toBe(false)
    expect(rispostaGiusta(d, null)).toBe(false)
  })
})

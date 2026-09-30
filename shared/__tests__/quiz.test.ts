import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../daily'
import {
  CATEGORIE as TUTTE_LE_CATEGORIE,
  CATEGORIE_CLASSIFICATA as CLASSIFICATA_DI_TUTTE,
  CONFINE_DEL_GIRO,
  CONTINENTI,
  GIORNI_CARTINA_PER_GIRO,
  GIORNI_PER_GIRO,
  MODI,
  QUANTE_MASSIME,
  VISTE,
  dentroVista,
  diGeografia,
  giornataDelQuiz,
  type CategoriaQuiz,
  type ModoQuiz,
} from '../quiz'
import {
  SUPERFICIE_MINIMA_CARTINA,
  TIPI,
  acqueAccettate,
  domandaValida,
  generaDomande,
  indicizza,
  rispostaGiusta,
  senzaRisposta,
  type AreaQuiz,
  type DomandaCompleta,
  type RichiestaQuiz,
  type TipoDomanda,
} from '../quiz-domande'
import {
  acquaConArticolo,
  conArticolo,
  daAcqua,
  diPaese,
  fiumeNellaFrase,
  inPaese,
  inRegione,
  lagoInOpzione,
  lagoNellaFrase,
  suLago,
} from '../quiz-lingua'
import { CITTA, ID, MONDO } from './quiz-mondo'

const ix = indicizza(MONDO)
// Qui si prova la geografia: le altre materie hanno i loro test (quiz-cultura.test.ts).
const CATEGORIE = TUTTE_LE_CATEGORIE.filter(diGeografia)
const CATEGORIE_CLASSIFICATA = CLASSIFICATA_DI_TUTTE.filter(diGeografia)
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
    expect(inRegione('Puglia')).toBe('in Puglia')
    expect(inRegione('Lazio')).toBe('nel Lazio')
    expect(inRegione('Marche')).toBe('nelle Marche')
    expect(inRegione('Isole Baleari')).toBe('nelle Isole Baleari')
  })
})

describe('la giornata della classificata', () => {
  const n = GIORNI_PER_GIRO
  it('passa da tutte le categorie di tutte le materie a ogni giro', () => {
    expect(n).toBe(CLASSIFICATA_DI_TUTTE.length)
    for (let giro = 0; giro < 100; giro += 1) {
      const giorni = Array.from({ length: n }, (_, i) => giornataDelQuiz(giro * n + i + 1).categoria)
      expect(new Set(giorni).size).toBe(n)
    }
  })

  it('non ripete una categoria prima di cinque giorni, nemmeno fra un giro e l’altro', () => {
    expect(CONFINE_DEL_GIRO).toBe(4)
    const ultimo = new Map<CategoriaQuiz, number>()
    for (let g = 1; g <= n * 400; g += 1) {
      const { categoria } = giornataDelQuiz(g)
      const prima = ultimo.get(categoria)
      if (prima !== undefined) expect(g - prima, `giorno ${g}`).toBeGreaterThan(CONFINE_DEL_GIRO)
      ultimo.set(categoria, g)
    }
  })

  it('non mette mai due giorni di geografia di fila, nemmeno fra un giro e l’altro', () => {
    for (let g = 2; g <= 1500; g += 1) {
      expect(diGeografia(giornataDelQuiz(g).categoria) && diGeografia(giornataDelQuiz(g - 1).categoria)).toBe(false)
    }
  })

  it('ha due giorni per giro sulla cartina, solo di geografia, e mai le città', () => {
    for (let giro = 0; giro < 100; giro += 1) {
      const giorni = Array.from({ length: n }, (_, i) => giornataDelQuiz(giro * n + i + 1))
      expect(giorni.filter((g) => g.modo === 'cartina').length).toBe(GIORNI_CARTINA_PER_GIRO)
      for (const g of giorni) if (g.modo === 'cartina') expect(diGeografia(g.categoria)).toBe(true)
    }
    for (let g = 1; g <= 1500; g += 1) expect(giornataDelQuiz(g).categoria).not.toBe('citta')
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

/** Tutte le domande di tante partite, per categoria, modo e area. */
function tante(
  categoria: CategoriaQuiz,
  modo: ModoQuiz = 'scelta',
  area: AreaQuiz = 'mondo',
  partite = 40,
  altro: Partial<RichiestaQuiz> = {},
): DomandaCompleta[] {
  const tutte: DomandaCompleta[] = []
  for (let seme = 1; seme <= partite; seme += 1) {
    tutte.push(...generaDomande(ix, { categoria, modo, area, quante: 10, citta: CITTA, ...altro }, mulberry32(seme)))
  }
  return tutte
}

const opzioniSbagliate = (d: DomandaCompleta) => d.opzioni.filter((o) => o.id !== d.giusta)

describe('le domande', () => {
  it('sono in ordine in ogni categoria e in ogni modo: le risposte diverse, una giusta, nessun soggetto ripetuto', () => {
    for (const categoria of CATEGORIE) {
      for (const modo of MODI) {
        for (let seme = 1; seme <= 25; seme += 1) {
          const partita = generaDomande(
            ix,
            { categoria, modo, area: 'mondo', quante: 10, citta: CITTA },
            mulberry32(seme),
          )
          expect(partita.length, `${categoria} ${modo}`).toBeGreaterThan(0)
          expect(new Set(partita.map((d) => d.soggetto)).size).toBe(partita.length)
          for (const d of partita) {
            expect(domandaValida(d), `${categoria} ${modo}: ${d.testo}`).toBe(true)
            expect(!!d.cartina, `${categoria} ${modo}: ${d.testo}`).toBe(modo === 'cartina')
          }
        }
      }
    }
  })

  it('ci sono tutte: i test qui sotto non passano per mancanza di domande', () => {
    const tipi = new Set<TipoDomanda>()
    for (const categoria of CATEGORIE) for (const modo of MODI) for (const d of tante(categoria, modo)) tipi.add(d.tipo)
    for (const d of tante('citta', 'scelta', 'paese:IT')) tipi.add(d.tipo)
    const attesi = new Set<TipoDomanda>([
      ...CATEGORIE.flatMap((c) => (c === 'cartina' ? [] : [...TIPI[c].scelta, ...TIPI[c].cartina])),
      'regione-della-citta',
      'citta-in-regione',
    ])
    expect([...tipi].sort()).toEqual([...attesi].sort())
  })

  it('sono le stesse con lo stesso seme', () => {
    for (const categoria of CATEGORIE) {
      for (const modo of MODI) {
        const r: RichiestaQuiz = { categoria, modo, area: 'mondo', quante: 10, citta: CITTA }
        expect(generaDomande(ix, r, mulberry32(42))).toEqual(generaDomande(ix, r, mulberry32(42)))
      }
    }
  })

  it('non mostrano la risposta prima del tempo, né dove guardare', () => {
    for (const d of [...tante('stati', 'cartina', 'mondo', 3), ...tante('capitali', 'scelta', 'mondo', 3)]) {
      const vista: Record<string, unknown> = { ...senzaRisposta(d) }
      for (const segreto of ['giusta', 'accettate', 'risposta', 'soggetto', 'luogo']) expect(vista[segreto]).toBeUndefined()
    }
  })

  it('dicono dove guardare a risposta data: la risposta giusta ha sempre un posto', () => {
    for (const categoria of CATEGORIE_CLASSIFICATA) {
      for (const modo of MODI) {
        for (const d of tante(categoria, modo, 'mondo', 10)) {
          // I fiumi senza linea (l'Arno) non hanno un posto: il resto si'.
          if (d.soggetto === 'F25') continue
          expect(d.luogo?.giusti.length, `${categoria} ${modo}: ${d.testo}`).toBeGreaterThan(0)
        }
      }
    }
  })

  it('arrivano fino a cinquanta per partita, se i dati bastano', () => {
    const d = generaDomande(ix, { categoria: 'bandiere', area: 'mondo', quante: 80 }, mulberry32(1))
    expect(d.length).toBe(Math.min(QUANTE_MASSIME, ix.dati.paesi.length))
  })
})

describe('le opzioni della libera', () => {
  it('scelgono fra quante risposte si vuole', () => {
    for (const risposte of [2, 3, 6]) {
      const partita = tante('capitali', 'scelta', 'mondo', 5, { risposte })
      expect(partita.length).toBeGreaterThan(0)
      for (const d of partita) expect(d.opzioni.length).toBe(risposte)
    }
  })

  it('fanno solo i tipi di domanda scelti', () => {
    for (const d of tante('capitali', 'scelta', 'mondo', 10, { tipi: ['stato-di-capitale'] })) {
      expect(d.tipo).toBe('stato-di-capitale')
    }
    for (const d of tante('stati', 'scelta', 'mondo', 10, { tipi: ['senza-mare'] })) expect(d.tipo).toBe('senza-mare')
  })

  it('con i più noti restano sul terzo più noto', () => {
    const noti = [...ix.dati.paesi].sort((a, b) => b.f - a.f).slice(0, Math.round(ix.dati.paesi.length * 0.35))
    const ids = new Set(noti.map((p) => p.id))
    for (const d of tante('bandiere', 'scelta', 'mondo', 10, { notorieta: 'noti', quante: 5 })) {
      expect(ids.has(d.soggetto), d.testo).toBe(true)
    }
  })

  it('mettono la bandiera accanto alla capitale da indovinare, e solo lì', () => {
    for (const d of tante('capitali')) {
      if (d.tipo === 'capitale-di') expect(d.bandiera).toBe(d.soggetto.toLowerCase())
      if (d.tipo === 'stato-di-capitale') expect(d.bandiera).toBeUndefined()
    }
    for (const d of tante('capitali', 'scelta', 'mondo', 10, { bandieraCapitali: false })) {
      expect(d.bandiera).toBeUndefined()
    }
  })
})

describe('le categorie', () => {
  it('sulle capitali: la giusta è la capitale, le altre no', () => {
    for (const d of tante('capitali')) {
      if (d.tipo !== 'capitale-di') continue
      const p = paese(d.soggetto)
      expect(d.opzioni.find((o) => o.id === d.giusta)?.testo).toBe(p.cap)
      for (const o of opzioniSbagliate(d)) expect(o.testo).not.toBe(p.cap)
    }
  })

  it('sui confini: la risposta confina davvero, e gli errori non confinano per niente', () => {
    for (const d of tante('stati')) {
      const p = paese(d.soggetto)
      if (d.tipo === 'confina-con') {
        expect(p.cm).toContain(d.giusta)
        for (const o of opzioniSbagliate(d)) expect(p.conf.includes(o.id), `${d.testo} ${o.testo}`).toBe(false)
      }
      if (d.tipo === 'non-confina') {
        expect(p.conf).not.toContain(d.giusta)
        for (const o of opzioniSbagliate(d)) expect(p.cm).toContain(o.id)
      }
      if (d.tipo === 'senza-mare') {
        expect(paese(d.giusta).ch).toBe(1)
        for (const o of opzioniSbagliate(d)) expect(paese(o.id).ch, o.testo).toBeUndefined()
      }
    }
    // La Spagna confina con la Francia, ma non in modo "principale": non e' mai né risposta né errore.
    for (const d of tante('stati')) {
      if (d.soggetto === 'FR') expect(d.opzioni.map((o) => o.id)).not.toContain('ES')
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

  it('gli oceani non hanno continenti: l’area si ignora', () => {
    const europa = generaDomande(ix, { categoria: 'oceani', area: 'eu', quante: 10 }, mulberry32(9))
    const mondo = generaDomande(ix, { categoria: 'oceani', area: 'mondo', quante: 10 }, mulberry32(9))
    expect(europa).toEqual(mondo)
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

  it('sulle città: lo stato giusto, le città del paese giusto, e mai un nome che si ripete', () => {
    const perId = new Map(CITTA.map((c) => [c.id, c]))
    for (const d of tante('citta')) {
      const c = perId.get(d.soggetto)!
      expect(c.n).not.toBe('Valencia')
      if (d.tipo === 'stato-della-citta') expect(d.giusta).toBe(c.p)
      if (d.tipo === 'citta-in-stato') {
        expect(d.giusta).toBe(`u:${c.id}`)
        for (const o of opzioniSbagliate(d)) expect(perId.get(o.id.slice(2))!.p).not.toBe(c.p)
      }
    }
    for (const d of tante('citta', 'scelta', 'paese:IT')) {
      const c = perId.get(d.soggetto)!
      expect(c.p).toBe('IT')
      if (d.tipo === 'regione-della-citta') {
        expect(d.giusta).toBe(`r:${c.r}`)
        expect(d.testo).toBe(`In quale regione si trova ${c.n}?`)
      }
      if (d.tipo === 'citta-in-regione') {
        for (const o of opzioniSbagliate(d)) expect(perId.get(o.id.slice(2))!.r).not.toBe(c.r)
      }
    }
  })

  it('con un continente parlano di quel continente', () => {
    for (const continente of CONTINENTI) {
      for (const d of tante('capitali', 'scelta', continente, 5)) expect(paese(d.soggetto).k).toContain(continente)
    }
  })

  it('con un paese solo parlano dei suoi fiumi, dal più noto', () => {
    const d = generaDomande(ix, { categoria: 'fiumi', area: 'paese:IT', quante: 10 }, mulberry32(3))
    expect(d.map((x) => x.risposta)).toEqual(['Po', 'Tevere', 'Arno', 'Adige'])
    for (const x of d) expect(x.testo).toBe('Quale di questi fiumi scorre in Italia?')
  })
})

describe('la cartina muta', () => {
  it('parte sempre dalla zona della partita, per tutte le domande: niente aiuto dalla vista', () => {
    for (const [area, vista] of [
      ['mondo', 'mondo'],
      ['eu', 'europa'],
      ['sa', 'sudamerica'],
    ] as const) {
      for (const d of tante('stati', 'cartina', area, 5)) expect(d.cartina?.vista).toBe(vista)
    }
  })

  it('chiede i paesi con il loro codice, e non quelli troppo piccoli', () => {
    for (const d of tante('stati', 'cartina')) {
      const p = paese(d.soggetto)
      expect(d.giusta).toBe(`n${p.num}`)
      expect(d.cartina?.strato).toBe('paesi')
      expect(p.a).toBeGreaterThanOrEqual(SUPERFICIE_MINIMA_CARTINA)
    }
  })

  it('cerca le capitali con il loro pallino', () => {
    for (const d of tante('capitali', 'cartina')) {
      expect(d.giusta).toBe(`c:${d.soggetto}`)
      expect(d.cartina?.strato).toBe('capitali')
      expect(paese(d.soggetto).cc).toBeDefined()
    }
  })

  it('cerca fiumi e laghi solo se hanno una linea o un punto', () => {
    for (const d of tante('fiumi', 'cartina')) {
      expect(ix.dati.fiumi.find((f) => `f:${f.id}` === d.giusta)?.g).toBe(1)
    }
    for (const d of tante('laghi', 'cartina')) {
      const l = ix.dati.laghi.find((x) => `l:${x.id}` === d.giusta)!
      expect(l.g === 1 || !!l.pt).toBe(true)
    }
  })

  it('sull’oceano di uno stato vale ogni oceano che lo bagna, e lo stato si vede mentre si cerca', () => {
    let fatte = 0
    for (const d of tante('oceani', 'cartina')) {
      if (d.tipo !== 'oceano-di-stato') continue
      fatte += 1
      const p = paese(d.soggetto)
      expect(d.cartina?.mostra).toEqual([`n${p.num}`])
      for (const oceano of p.bagna.filter((id) => ix.acque.get(id)?.t === 'oceano')) {
        expect(d.accettate).toContain(oceano)
      }
    }
    expect(fatte).toBeGreaterThan(0)
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

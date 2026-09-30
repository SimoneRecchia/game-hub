import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../daily'
import { AMBITI, type CategoriaQuiz } from '../quiz'
import {
  CATEGORIE_CULTURA,
  PERCORSO_IMMAGINE,
  annoInLettere,
  giornoInLettere,
  numeroSecolo,
  secolo,
  urlImmagine,
} from '../quiz-cultura'
import {
  TIPI,
  TIPI_SCIENZA,
  domandaValida,
  senzaRisposta,
  type DomandaCompleta,
  type TipoDomanda,
} from '../quiz-domande'
import { domandaSulTempo, generaPartita, type FontiQuiz } from '../quiz-domande-cultura'
import { diElemento, diNome, genereNome, nomeConArticolo } from '../quiz-lingua'
import { ARTE, CINEMA, LIBRI, LIRICA, NOBEL, OGGI, SCIENZA, STORIA } from './quiz-cultura-dati'

const FONTI: FontiQuiz = {
  cultura: { arte: ARTE, libri: LIBRI, cinema: CINEMA, lirica: LIRICA, nobel: NOBEL, storia: STORIA, scienza: SCIENZA },
  oggi: OGGI,
}

const DATA = '2026-03-15'

function partita(categoria: CategoriaQuiz, seme: number, altro: Record<string, unknown> = {}): DomandaCompleta[] {
  return generaPartita(FONTI, { categoria, area: 'mondo', quante: 10, data: DATA, ...altro }, mulberry32(seme))
}

function tante(categoria: CategoriaQuiz, semi = 20, altro: Record<string, unknown> = {}): DomandaCompleta[] {
  return Array.from({ length: semi }, (_, i) => partita(categoria, i + 1, altro)).flat()
}

const annoDi = (o: { id: string }) => Number(o.id.slice(5))

describe('le domande delle altre materie', () => {
  it('sono dieci per partita, in ordine: le risposte diverse, una giusta, nessun soggetto ripetuto', () => {
    for (const categoria of CATEGORIE_CULTURA) {
      for (let seme = 1; seme <= 20; seme += 1) {
        const domande = partita(categoria, seme)
        expect(domande.length, categoria).toBe(10)
        expect(new Set(domande.map((d) => d.soggetto)).size).toBe(10)
        for (const d of domande) {
          expect(domandaValida(d), `${categoria}: ${d.testo}`).toBe(true)
          expect(d.cartina).toBeUndefined()
          expect(d.spiegazione?.titolo, `${categoria}: ${d.testo}`).toBeTruthy()
        }
      }
    }
  })

  it('ci sono tutte: ogni tipo di ogni materia esce, se si sceglie solo lui', () => {
    for (const categoria of CATEGORIE_CULTURA) {
      for (const tipo of TIPI[categoria].scelta) {
        const ambito =
          categoria === 'scienza' ? Object.keys(TIPI_SCIENZA).find((a) => TIPI_SCIENZA[a].includes(tipo)) : 'tutti'
        const domande = tante(categoria, 5, { tipi: [tipo], ambito })
        expect(domande.filter((d) => d.tipo === tipo).length, `${categoria}: ${tipo}`).toBeGreaterThan(0)
      }
    }
  })

  it('sono le stesse con lo stesso seme', () => {
    for (const categoria of CATEGORIE_CULTURA) expect(partita(categoria, 42)).toEqual(partita(categoria, 42))
  })

  it('non mostrano prima del tempo né la risposta né la scheda', () => {
    for (const categoria of CATEGORIE_CULTURA) {
      for (const d of partita(categoria, 3)) {
        const vista: Record<string, unknown> = { ...senzaRisposta(d) }
        for (const segreto of ['giusta', 'risposta', 'soggetto', 'spiegazione']) expect(vista[segreto]).toBeUndefined()
      }
    }
  })

  it('restano nel loro ambito', () => {
    const quadri = new Map(ARTE.quadri.map((q) => [q.id, q]))
    for (const d of tante('arte', 10, { ambito: 'novecento' })) {
      expect(quadri.get(d.soggetto)!.anno!).toBeGreaterThanOrEqual(1900)
    }
    const eventi = new Map(STORIA.eventi.map((e) => [e.id, e]))
    for (const d of tante('storia', 10, { ambito: 'antichita' })) expect(eventi.get(d.soggetto)!.anno).toBeLessThan(476)
    for (const d of tante('nobel', 10, { ambito: 'fisica' })) expect(d.soggetto).toContain(':fisica:')
    for (const d of tante('scienza', 10, { ambito: 'chimica' })) expect(TIPI_SCIENZA.chimica).toContain(d.tipo)
    for (const d of tante('libri', 10, { ambito: 'italiani' })) {
      expect(LIBRI.libri.find((l) => l.id === d.soggetto)?.it).toBe(1)
    }
  })

  it('hanno un ambito "tutti" e nomi per ogni ambito', () => {
    for (const [categoria, ambiti] of Object.entries(AMBITI)) {
      expect(ambiti?.[0].id, categoria).toBe('tutti')
      for (const a of ambiti ?? []) expect(a.nome.length).toBeGreaterThan(2)
    }
  })
})

describe('gli anni e i secoli', () => {
  it('non danno l’anno zero, né un anno che deve ancora venire', () => {
    for (const categoria of ['storia', 'oggi', 'nobel', 'cinema'] as const) {
      for (const d of tante(categoria)) {
        for (const o of d.opzioni.filter((x) => x.id.startsWith('anno:'))) {
          expect(annoDi(o)).not.toBe(0)
          expect(annoDi(o)).toBeLessThanOrEqual(2026)
        }
      }
    }
  })

  it('mettono la risposta giusta in cima, in mezzo o in fondo, senza preferenze', () => {
    // Con le risposte in fila dalla piu' piccola, la giusta sta in ognuno dei quattro posti.
    const posti = [0, 0, 0, 0]
    for (const d of [...tante('storia', 40), ...tante('oggi', 40)]) {
      const anni = d.opzioni.filter((o) => o.id.startsWith('anno:')).map(annoDi)
      if (anni.length !== 4) continue
      const giusto = Number(d.giusta.slice(5))
      posti[[...anni].sort((a, b) => a - b).indexOf(giusto)] += 1
    }
    const totale = posti.reduce((a, b) => a + b, 0)
    expect(totale).toBeGreaterThan(100)
    for (const n of posti) expect(n / totale).toBeGreaterThan(0.12)
  })

  it('scrivono i secoli come a scuola', () => {
    expect(secolo(1492)).toBe('XV secolo')
    expect(secolo(1500)).toBe('XV secolo')
    expect(secolo(1501)).toBe('XVI secolo')
    expect(secolo(-44)).toBe('I secolo a.C.')
    expect(secolo(-480)).toBe('V secolo a.C.')
    expect(numeroSecolo(2026)).toBe(21)
    expect(annoInLettere(-44)).toBe('44 a.C.')
  })

  it('non chiedono il secolo di un anno a cavallo di due', () => {
    for (const d of tante('storia', 20, { tipi: ['secolo-evento'] })) {
      if (d.tipo !== 'secolo-evento') continue
      const anno = STORIA.eventi.find((e) => e.id === d.soggetto)!.anno
      const resto = Math.abs(anno) % 100
      expect(resto > 2 && resto < 98, `${anno}`).toBe(true)
    }
  })
})

describe('le regole di ogni materia', () => {
  it('nel Nobel non danno come sbagliato chi ha vinto lo stesso premio lo stesso anno', () => {
    for (const d of tante('nobel', 30, { tipi: ['nobel-anno'] })) {
      if (d.tipo !== 'nobel-anno') continue
      const [, premio, anno] = d.soggetto.split(':')
      const vincitori = new Set(
        NOBEL.premi.filter((x) => x.premio === premio && x.anno === Number(anno)).map((x) => x.chi),
      )
      for (const o of d.opzioni) if (o.id !== d.giusta) expect(vincitori.has(o.id)).toBe(false)
    }
  })

  it('nel Nobel non danno come anno sbagliato l’altro anno di chi l’ha vinto due volte', () => {
    const due = NOBEL.premiati[0].id
    const anni = new Set(NOBEL.premi.filter((x) => x.chi === due).map((x) => x.anno))
    for (let seme = 1; seme <= 60; seme += 1) {
      for (const d of partita('nobel', seme, { tipi: ['anno-nobel'] })) {
        if (!d.soggetto.startsWith(`${due}:`)) continue
        for (const o of d.opzioni) if (o.id !== d.giusta) expect(anni.has(annoDi(o))).toBe(false)
      }
    }
  })

  it('nella storia il fatto che viene prima viene prima davvero, e di parecchio', () => {
    const eventi = new Map(STORIA.eventi.map((e) => [e.id, e]))
    for (const d of tante('storia', 30, { tipi: ['prima-evento'] })) {
      if (d.tipo !== 'prima-evento') continue
      const giusto = eventi.get(d.giusta)!
      expect(d.lunga).toBe(1)
      for (const o of d.opzioni) {
        if (o.id !== d.giusta) expect(eventi.get(o.id)!.anno).toBeGreaterThanOrEqual(giusto.anno + 8)
      }
    }
  })

  it('nella storia non chiedono l’anno di un nome che ce l’ha dentro', () => {
    for (const d of tante('storia', 30)) expect(d.testo.includes('del ') && /\d{3}/.test(d.testo)).toBe(false)
  })

  it('nell’arte non chiedono il titolo di un quadro che ha il nome di altri', () => {
    for (const d of tante('arte', 30, { tipi: ['titolo-quadro'] })) {
      if (d.tipo === 'titolo-quadro') expect(d.risposta).not.toBe('Autoritratto')
      for (const o of d.opzioni) if (d.tipo === 'titolo-quadro') expect(o.testo).not.toBe('Autoritratto')
    }
  })

  it('nell’arte la corrente sbagliata non c’era quando il quadro fu dipinto', () => {
    const quadri = new Map(ARTE.quadri.map((q) => [q.id, q]))
    for (const d of tante('arte', 30, { tipi: ['corrente-quadro'] })) {
      if (d.tipo !== 'corrente-quadro') continue
      const q = quadri.get(d.soggetto)!
      for (const o of d.opzioni) {
        if (o.id === d.giusta) continue
        const anni = ARTE.quadri.filter((x) => x.c?.includes(o.id)).map((x) => x.anno!)
        expect(q.anno! < Math.min(...anni) - 25 || q.anno! > Math.max(...anni) + 25).toBe(true)
      }
    }
  })

  it('nell’arte si sceglie fra quadri, con le immagini di Commons', () => {
    for (const d of tante('arte', 10, { tipi: ['quadro-di'] })) {
      if (d.tipo !== 'quadro-di') continue
      expect(d.opzioni.every((o) => o.immagine && PERCORSO_IMMAGINE.test(o.immagine.f))).toBe(true)
    }
    for (const d of tante('arte', 5)) if (d.immagine) expect(PERCORSO_IMMAGINE.test(d.immagine.f)).toBe(true)
  })

  it('in "Accadde oggi" i fatti fra cui scegliere sono tutti di anni diversi', () => {
    for (const d of tante('oggi', 30, { tipi: ['oggi-fatto'] })) {
      if (d.tipo !== 'oggi-fatto') continue
      const anni = d.opzioni.map((o) => OGGI.fatti[Number(o.id.slice(1))].anno)
      expect(new Set(anni).size).toBe(anni.length)
    }
  })

  it('in "Accadde oggi" dicono "è nata" per le donne', () => {
    const nate = tante('oggi', 20, { tipi: ['oggi-nato'] }).filter((d) => d.tipo === 'oggi-nato')
    expect(nate.some((d) => d.testo.includes('è nata'))).toBe(true)
    for (const d of nate) {
      const n = OGGI.nati.find((x) => x.id === d.soggetto)!
      expect(d.testo.includes(n.fem ? 'è nata' : 'è nato')).toBe(true)
    }
  })

  it('nelle unità di misura non danno come sbagliata un’altra unità della stessa grandezza', () => {
    for (const d of tante('scienza', 30, { ambito: 'fisica', tipi: ['unita-grandezza'] })) {
      if (d.tipo !== 'unita-grandezza') continue
      const giusta = SCIENZA.unita.find((u) => u.id === d.giusta)!
      for (const o of d.opzioni) {
        if (o.id !== d.giusta) expect(SCIENZA.unita.find((u) => u.id === o.id)!.g).not.toBe(giusta.g)
      }
    }
  })
})

describe('l’italiano delle altre materie', () => {
  it('chiede quando con il verbo e l’articolo giusti', () => {
    expect(domandaSulTempo('battaglia di Waterloo', 'anno')).toBe('In che anno si combatté la battaglia di Waterloo?')
    expect(domandaSulTempo('trattato di Versailles', 'anno')).toBe('In che anno fu firmato il trattato di Versailles?')
    expect(domandaSulTempo('pace di Vestfalia', 'anno')).toBe('In che anno fu firmata la pace di Vestfalia?')
    expect(domandaSulTempo('guerra dei trent’anni', 'secolo')).toBe('In che secolo cominciò la guerra dei trent’anni?')
    expect(domandaSulTempo('vespri siciliani', 'anno')).toBe('In che anno ci furono i vespri siciliani?')
    expect(domandaSulTempo('assedio di Troia', 'secolo')).toBe('In che secolo ci fu l’assedio di Troia?')
    expect(domandaSulTempo('Grande Fuga', 'anno')).toBe('«Grande Fuga»: in che anno?')
  })

  it('mette l’articolo ai nomi comuni', () => {
    expect(diElemento('ferro')).toBe('del ferro')
    expect(diElemento('oro')).toBe('dell’oro')
    expect(diElemento('zinco')).toBe('dello zinco')
    expect(diElemento('iodio')).toBe('dello iodio')
    expect(diNome('acqua')).toBe('dell’acqua')
    expect(diNome('anidride carbonica')).toBe('dell’anidride carbonica')
    expect(diNome('metano')).toBe('del metano')
    expect(diNome('temperatura')).toBe('della temperatura')
    expect(diNome('tempo')).toBe('del tempo')
    expect(nomeConArticolo('mole')).toBe('la mole')
    expect(nomeConArticolo('pascal', genereNome('pascal', 'm'))).toBe('il pascal')
    expect(nomeConArticolo('ampere', genereNome('ampere', 'm'))).toBe('l’ampere')
    expect(nomeConArticolo('penicillina')).toBe('la penicillina')
    expect(nomeConArticolo('radio')).toBe('la radio')
    expect(nomeConArticolo('boh')).toBeNull()
  })

  it('scrive il giorno come si legge', () => {
    expect(giornoInLettere('03-15')).toBe('15 marzo')
    expect(giornoInLettere('01-01')).toBe('1º gennaio')
    expect(giornoInLettere('12-25')).toBe('25 dicembre')
  })
})

describe('le immagini di Commons', () => {
  it('hanno l’indirizzo delle miniature, con il nome codificato', () => {
    const url = urlImmagine({ f: 'e/ec/Mona_Lisa,_by_Leonardo_da_Vinci,_from_C2RMF_retouched.jpg' }, 500)
    expect(url).toBe(
      'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ec/' +
        'Mona_Lisa%2C_by_Leonardo_da_Vinci%2C_from_C2RMF_retouched.jpg/' +
        '500px-Mona_Lisa%2C_by_Leonardo_da_Vinci%2C_from_C2RMF_retouched.jpg',
    )
    expect(PERCORSO_IMMAGINE.test('e/ec/Mona_Lisa.jpg')).toBe(true)
    expect(PERCORSO_IMMAGINE.test('../../etc/passwd')).toBe(false)
    expect(PERCORSO_IMMAGINE.test('e/ec/x.svg')).toBe(false)
  })
})

// Il tipo serve ai test qui sopra: che le tabelle dei tipi coprano tutte le materie.
const _tutti: Record<(typeof CATEGORIE_CULTURA)[number], readonly TipoDomanda[]> = Object.fromEntries(
  CATEGORIE_CULTURA.map((c) => [c, TIPI[c].scelta]),
) as Record<(typeof CATEGORIE_CULTURA)[number], readonly TipoDomanda[]>
void _tutti

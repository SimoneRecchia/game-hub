import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../daily'
import { AMBITI, GENERI, type CategoriaQuiz } from '../quiz'
import {
  CATEGORIE_CULTURA,
  PERCORSO_IMMAGINE,
  VERTEBRATI,
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
  gruppiDiNotorieta,
  senzaRisposta,
  type DomandaCompleta,
  type TipoDomanda,
} from '../quiz-domande'
import {
  artistaInFrase,
  domandaSulTempo,
  generaPartita,
  nomeDecennio,
  type FontiQuiz,
} from '../quiz-domande-cultura'
import { diElemento, diNome, genereNome, nomeConArticolo } from '../quiz-lingua'
import {
  ARTE,
  CANZONI,
  CINEMA,
  CLASSICA,
  LIBRI,
  LIRICA,
  NOBEL,
  OGGI,
  SCIENZA,
  STORIA,
} from './quiz-cultura-dati'

const FONTI: FontiQuiz = {
  cultura: {
    arte: ARTE,
    libri: LIBRI,
    cinema: CINEMA,
    canzoni: CANZONI,
    classica: CLASSICA,
    lirica: LIRICA,
    nobel: NOBEL,
    storia: STORIA,
    scienza: SCIENZA,
  },
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

  it('hanno un ambito "tutti" e nomi per ogni ambito, e così i generi', () => {
    for (const [categoria, ambiti] of [...Object.entries(AMBITI), ...Object.entries(GENERI)]) {
      expect(ambiti?.[0].id, categoria).toBe('tutti')
      for (const a of ambiti ?? []) expect(a.nome.length).toBeGreaterThan(2)
    }
  })
})

describe('le difficoltà', () => {
  const posto = (categoria: CategoriaQuiz, elenco: readonly { id: string; f: number }[]) => {
    const ordine = [...elenco].sort((a, b) => b.f - a.f).map((x) => x.id)
    const [famosi, noti] = gruppiDiNotorieta(ordine.length)
    return (d: DomandaCompleta) => {
      const i = ordine.indexOf(d.soggetto)
      expect(i, `${categoria}: ${d.soggetto}`).toBeGreaterThanOrEqual(0)
      return i < famosi ? 'famosi' : i < noti ? 'noti' : 'altri'
    }
  }
  const conti = (domande: DomandaCompleta[], gruppo: (d: DomandaCompleta) => string) => {
    const n = { famosi: 0, noti: 0, altri: 0 } as Record<string, number>
    // Il paese di chi canta ha per soggetto l'artista, non la canzone.
    for (const d of domande) if (d.tipo !== 'paese-interprete') n[gruppo(d)] += 1
    return n
  }

  it('il facile chiede solo i famosi, il difficile quasi solo gli altri', () => {
    for (const [categoria, elenco] of [
      ['libri', LIBRI.libri],
      ['cinema', CINEMA.film],
      ['canzoni', CANZONI.canzoni],
    ] as const) {
      const gruppo = posto(categoria, elenco)
      const facile = conti(tante(categoria, 20, { notorieta: 'noti' }), gruppo)
      expect(facile.noti + facile.altri, categoria).toBe(0)
      const difficile = conti(tante(categoria, 20, { notorieta: 'rari' }), gruppo)
      expect(difficile.famosi, categoria).toBe(0)
      expect(difficile.altri, categoria).toBeGreaterThan(difficile.noti)
      // Il normale (e la classificata) sta a meta': per meta' dai famosi, e pochi degli altri.
      const normale = conti(tante(categoria, 20), gruppo)
      const tutte = normale.famosi + normale.noti + normale.altri
      expect(normale.famosi / tutte, categoria).toBeGreaterThan(0.4)
      expect(normale.altri / tutte, categoria).toBeLessThan(0.2)
    }
  })

  it('i famosi sono una sessantina al più', () => {
    expect(gruppiDiNotorieta(1500)).toEqual([60, 250])
    expect(gruppiDiNotorieta(195)).toEqual([39, 98])
    expect(gruppiDiNotorieta(50)).toEqual([20, 40])
    expect(gruppiDiNotorieta(10)).toEqual([10, 10])
  })

  it('il facile fa meno domande difficili, e gli anni più lontani', () => {
    const quanti = (notorieta: string) =>
      tante('cinema', 30, { notorieta }).filter((d) => d.tipo === 'anno-film').length
    expect(quanti('noti')).toBeLessThan(quanti('rari'))
    const distanze = (notorieta: string) =>
      tante('cinema', 30, { notorieta, tipi: ['anno-film'] })
        .filter((d) => d.tipo === 'anno-film')
        .map((d) => {
          const anni = d.opzioni.map(annoDi).sort((a, b) => a - b)
          return anni[anni.length - 1] - anni[0]
        })
    const media = (x: number[]) => x.reduce((a, b) => a + b, 0) / x.length
    expect(media(distanze('noti'))).toBeGreaterThan(media(distanze('misti')) * 1.5)
  })
})

describe('le partite di più categorie', () => {
  it('dividono le domande fra le categorie, e ognuna dice la sua', () => {
    for (let seme = 1; seme <= 20; seme += 1) {
      const sezioni = [{ categoria: 'arte' }, { categoria: 'libri' }, { categoria: 'cinema' }]
      const domande = partita('arte', seme, { sezioni, quante: 12 })
      expect(domande.length).toBe(12)
      const perCategoria = new Map<string, number>()
      for (const d of domande) perCategoria.set(d.categoria!, (perCategoria.get(d.categoria!) ?? 0) + 1)
      expect([...perCategoria.values()]).toEqual([4, 4, 4])
      expect(new Set(domande.map((d) => d.soggetto)).size).toBe(12)
      // La categoria arriva anche a chi gioca, senza la risposta.
      for (const d of domande) expect(senzaRisposta(d).categoria).toBe(d.categoria)
    }
  })

  it('mescolano le categorie invece di metterle una dopo l’altra', () => {
    const sezioni = [{ categoria: 'canzoni' as const }, { categoria: 'classica' as const }]
    const domande = partita('canzoni', 7, { sezioni, quante: 10 })
    const cambi = domande.slice(1).filter((d, i) => d.categoria !== domande[i].categoria).length
    expect(cambi).toBeGreaterThan(3)
  })

  it('una sezione sola resta una partita come prima, senza la sezione su ogni domanda', () => {
    for (const d of partita('libri', 3, { sezioni: [{ categoria: 'libri' }] })) expect(d.categoria).toBeUndefined()
  })

  it('gli argomenti della scienza sono sezioni, e ognuna dice il suo', () => {
    const sezioni = [
      { categoria: 'scienza', ambito: 'chimica' },
      { categoria: 'scienza', ambito: 'natura' },
      { categoria: 'nobel' },
    ]
    const domande = partita('scienza', 5, { sezioni, quante: 9 })
    expect(domande.length).toBe(9)
    for (const d of domande) {
      if (d.ambito === 'chimica') expect(TIPI_SCIENZA.chimica).toContain(d.tipo)
      else if (d.ambito === 'natura') expect(TIPI_SCIENZA.natura).toContain(d.tipo)
      else expect(d.categoria).toBe('nobel')
    }
  })
})

describe('gli anni e i secoli', () => {
  it('non danno l’anno zero, né un anno che deve ancora venire', () => {
    for (const categoria of ['storia', 'oggi', 'scienza', 'cinema'] as const) {
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
  it('nel Nobel si chiede il campo, mai l’anno, e l’altro campo di chi ne ha vinti due non e’ sbagliato', () => {
    const domande = tante('nobel', 30)
    expect(domande.every((d) => d.tipo === 'premio-nobel')).toBe(true)
    for (const d of domande) {
      const [chi] = d.soggetto.split(':')
      const vinti = new Set(NOBEL.premi.filter((x) => x.chi === chi).map((x) => `premio:${x.premio}`))
      for (const o of d.opzioni) if (o.id !== d.giusta) expect(vinti.has(o.id)).toBe(false)
    }
    // Anche chi chiede le domande sull'anno di prima riceve quelle sul campo.
    expect(tante('nobel', 5, { tipi: ['anno-nobel'] }).every((d) => d.tipo === 'premio-nobel')).toBe(true)
  })

  it('negli animali si chiede il gruppo, e gli errori sono dalla stessa parte', () => {
    const domande = tante('scienza', 20, { ambito: 'natura' }).filter((d) => d.tipo === 'gruppo-animale')
    expect(domande.length).toBeGreaterThan(0)
    let vicini = 0
    let tutti = 0
    for (const d of domande) {
      expect(d.testo).toMatch(/^A quale gruppo di animali appartiene /)
      const giusto = SCIENZA.specie.find((s) => `sp:${s.id}` === d.soggetto)!.gr
      for (const o of d.opzioni) {
        if (o.id === d.giusta) continue
        tutti += 1
        if (VERTEBRATI.has(o.id.slice(3) as never) === VERTEBRATI.has(giusto)) vicini += 1
      }
    }
    expect(vicini / tutti).toBeGreaterThan(0.6)
  })

  it('e quale animale e’ del gruppo: uno solo, e le sbagliate non tutte di un altro gruppo', () => {
    const specie = new Map(SCIENZA.specie.map((s) => [`sp:${s.id}`, s]))
    const domande = tante('scienza', 20, { ambito: 'natura' }).filter((d) => d.tipo === 'animale-del-gruppo')
    expect(domande.length).toBeGreaterThan(0)
    for (const d of domande) {
      const giusto = specie.get(d.giusta)!.gr
      expect(d.testo).toMatch(/^Quale di questi animali è un [a-z]+\?$/)
      const sbagliate = d.opzioni.filter((o) => o.id !== d.giusta).map((o) => specie.get(o.id)!.gr)
      for (const g of sbagliate) expect(g).not.toBe(giusto)
      expect(new Set(sbagliate).size).toBeGreaterThan(1)
    }
  })

  it('"a chi si deve" nel facile chiede solo di chi e’ noto, e risponde col piu’ noto dei due', () => {
    const scoperte = new Map(SCIENZA.scoperte.map((s) => [`sc:${s.id}`, s]))
    const domande = tante('scienza', 40, { ambito: 'scoperte', notorieta: 'noti' }).filter(
      (d) => d.tipo === 'autore-scoperta',
    )
    expect(domande.length).toBeGreaterThan(0)
    for (const d of domande) {
      const s = scoperte.get(d.soggetto)!
      const migliore = Math.max(...s.chi.map((_, i) => s.cf?.[i] ?? 1))
      expect(migliore).toBeGreaterThanOrEqual(0.5)
      expect(s.cf?.[s.chi.indexOf(d.risposta)] ?? 1).toBe(migliore)
    }
  })

  it('nelle scoperte si chiede di solito l’anno, con il verbo giusto', () => {
    const domande = tante('scienza', 20, { ambito: 'scoperte' })
    const anni = domande.filter((d) => d.tipo === 'anno-scoperta')
    expect(anni.length).toBeGreaterThan(domande.length / 2)
    for (const d of anni) {
      const s = SCIENZA.scoperte.find((x) => `sc:${x.id}` === d.soggetto)!
      const verbo = s.v === 'i' ? 'inventato' : s.v === 'f' ? 'formulato' : 'scoperto'
      const inizio = `In che anno ${s.chi.join(' e ')} ${s.chi.length > 1 ? 'hanno' : 'ha'} ${verbo} `
      expect(d.testo.startsWith(inizio)).toBe(true)
      expect(d.giusta).toBe(`anno:${s.anno}`)
    }
  })

  it('nelle canzoni il decennio non e’ mai a cavallo, e i duetti hanno chi canta fra le risposte', () => {
    const canzoni = new Map(CANZONI.canzoni.map((x) => [x.id, x]))
    const artisti = new Map(CANZONI.artisti.map((a) => [a.id, a]))
    let decenni = 0
    for (const d of tante('canzoni', 30)) {
      const x = canzoni.get(d.soggetto)
      if (d.tipo === 'decennio-canzone') {
        decenni += 1
        expect([0, 9]).not.toContain(x!.anno! % 10)
        expect(d.giusta).toBe(`dec:${Math.floor(x!.anno! / 10) * 10}`)
      }
      if (d.tipo === 'interprete-canzone') {
        expect(x!.a).toContain(d.giusta)
        for (const o of d.opzioni) if (o.id !== d.giusta) expect(x!.a).not.toContain(o.id)
      }
      if (d.tipo === 'canzone-di') {
        for (const o of d.opzioni) if (o.id !== d.giusta) expect(canzoni.get(o.id)!.a).not.toContain(x!.a[0])
      }
      // Di chi e' italiano non si chiede il paese.
      if (d.tipo === 'paese-interprete') expect(artisti.get(d.soggetto.slice(3))!.it).toBeUndefined()
    }
    expect(decenni).toBeGreaterThan(0)
  })

  it('chi canta nel ritornello o ha fatto una cover non e’ mai fra le risposte sbagliate', () => {
    const canzoni = new Map(CANZONI.canzoni.map((x) => [x.id, x]))
    let viste = 0
    for (const d of tante('canzoni', 40)) {
      const x = canzoni.get(d.soggetto)
      if (!x) continue
      if (d.tipo === 'interprete-canzone' && x.x) {
        viste += 1
        for (const o of d.opzioni) expect(x.x).not.toContain(o.id)
      }
      if (d.tipo === 'canzone-di') {
        for (const o of d.opzioni) {
          if (o.id === d.giusta) continue
          const altra = canzoni.get(o.id)!
          expect([...altra.a, ...(altra.x ?? [])].some((id) => x.a.includes(id))).toBe(false)
        }
      }
    }
    expect(viste).toBeGreaterThan(0)
  })

  it('nelle canzoni restano negli anni e nel genere scelti', () => {
    const canzoni = new Map(CANZONI.canzoni.map((x) => [x.id, x]))
    const artisti = new Map(CANZONI.artisti.map((a) => [a.id, a]))
    const di = (d: DomandaCompleta) => canzoni.get(d.soggetto) ?? null
    for (const d of tante('canzoni', 10, { ambito: 'anni80' })) {
      const x = di(d)
      if (x) expect(Math.floor(x.anno! / 10) * 10).toBe(1980)
    }
    for (const d of tante('canzoni', 10, { ambito: 'anni60' })) {
      const x = di(d)
      if (x) expect(x.anno!).toBeLessThan(1970)
    }
    for (const d of tante('canzoni', 10, { genere: 'rock' })) {
      const x = di(d)
      if (x) expect(x.g).toContain('rock')
    }
    for (const d of tante('canzoni', 10, { genere: 'italiana' })) {
      const x = di(d)
      if (x) expect(x.a.some((id) => artisti.get(id)?.it)).toBe(true)
    }
  })

  it('nella musica classica restano nel periodo del compositore', () => {
    const brani = new Map(CLASSICA.brani.map((b) => [b.id, b]))
    const compositori = new Map(CLASSICA.compositori.map((p) => [p.id, p]))
    for (const d of tante('classica', 10, { ambito: 'barocco' })) {
      expect(compositori.get(brani.get(d.soggetto)!.c[0])!.na!).toBeLessThan(1710)
    }
    for (const d of tante('classica', 10, { ambito: 'romanticismo' })) {
      const na = compositori.get(brani.get(d.soggetto)!.c[0])!.na!
      expect(na >= 1775 && na < 1860).toBe(true)
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

  it('in "Accadde oggi" si racconta il fatto e si chiede l’anno, sempre', () => {
    const domande = tante('oggi', 30)
    expect(domande.length).toBeGreaterThan(0)
    for (const d of domande) {
      expect(['oggi-anno', 'oggi-nato']).toContain(d.tipo)
      expect(d.testo.endsWith('In che anno?')).toBe(true)
      expect(d.opzioni.every((o) => o.id.startsWith('anno:'))).toBe(true)
    }
    // Anche chi chiede le domande "che cosa accadde" di prima riceve quelle sull'anno.
    expect(tante('oggi', 10, { tipi: ['oggi-fatto'] }).every((d) => d.tipo !== 'oggi-fatto')).toBe(true)
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
    const casi: Array<[string, 'anno' | 'secolo', boolean, string]> = [
      // Un assedio, un'epidemia, un fatto che dura: si chiede quando comincio', e la risposta e' una sola.
      ['assedio di Troia', 'secolo', false, 'In che secolo cominciò l’assedio di Troia?'],
      ['pandemia di COVID-19', 'anno', false, 'In che anno cominciò la pandemia di COVID-19?'],
      ['Fronda', 'anno', true, 'In che anno cominciò la Fronda?'],
      ['massacro di Deir Yassin', 'anno', true, 'In che anno cominciò il massacro di Deir Yassin?'],
      // Un trattato si firma il primo anno, anche quando dura.
      ['patto di Varsavia', 'anno', true, 'In che anno fu firmato il patto di Varsavia?'],
      // Gli aggettivi e i numeri davanti: il genere dalla desinenza, o dalla parola dopo.
      ['seconda guerra balcanica', 'anno', false, 'In che anno cominciò la seconda guerra balcanica?'],
      ['Cinque giornate di Milano', 'anno', false, 'In che anno ci furono le Cinque giornate di Milano?'],
      ['Grande carestia irlandese', 'secolo', false, 'In che secolo cominciò la Grande carestia irlandese?'],
      ['Grande Fuga', 'anno', false, '«Grande Fuga»: in che anno?'],
    ]
    for (const [nome, quando, dura, atteso] of casi) expect(domandaSulTempo(nome, quando, dura)).toBe(atteso)
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

  it('dice i gruppi con l’articolo, e i decenni per nome', () => {
    expect(artistaInFrase({ n: 'Queen', gr: 1 }, true)).toBe('dei Queen')
    expect(artistaInFrase({ n: 'U2', gr: 1 }, true)).toBe('degli U2')
    expect(artistaInFrase({ n: 'ABBA', gr: 1 })).toBe('gli ABBA')
    expect(artistaInFrase({ n: 'The Beatles', gr: 1 }, true)).toBe('dei Beatles')
    expect(artistaInFrase({ n: 'The Rolling Stones', gr: 1 })).toBe('i Rolling Stones')
    expect(artistaInFrase({ n: 'Scorpions', gr: 1 }, true)).toBe('degli Scorpions')
    expect(artistaInFrase({ n: 'Spice Girls', gr: 1 }, true)).toBe('delle Spice Girls')
    expect(artistaInFrase({ n: 'Il Volo', gr: 1 }, true)).toBe('del Volo')
    expect(artistaInFrase({ n: 'Le Vibrazioni', gr: 1 }, true)).toBe('delle Vibrazioni')
    expect(artistaInFrase({ n: 'Vasco Rossi' }, true)).toBe('di Vasco Rossi')
    expect(nomeDecennio(1970)).toBe('Anni Settanta')
    expect(nomeDecennio(2000)).toBe('Anni Duemila')
    expect(nomeDecennio(2010)).toBe('Anni 2010')
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

import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CATEGORIE_PER_PARTITA,
  LETTERE_NOMI,
  PAROLE_MINIME,
  TUTTE_LE_CATEGORIE,
  categorieIdonee,
  lessicoDa,
  normalizza,
  riconosci,
  type CategoriaNomi,
  type FileLessicoNomi,
  type LetteraNomi,
} from '../../shared/nomi-cose'
import { CONTI_LESSICO_NOMI, VERSIONI_LESSICO_NOMI, urlLessicoNomi } from '../../shared/nomi-cose-lessico'

const CARTELLA = join(__dirname, '..', '..', 'public', 'dati', 'nomi-cose')

const testi = new Map(LETTERE_NOMI.map((l) => [l, readFileSync(join(CARTELLA, `${l}.json`), 'utf8')]))
const file = new Map(LETTERE_NOMI.map((l) => [l, JSON.parse(testi.get(l)!) as FileLessicoNomi]))
const lessici = new Map(LETTERE_NOMI.map((l) => [l, lessicoDa(file.get(l)!)]))

/** La risposta come la riconosce il gioco, con la lettera della sua iniziale. */
const vale = (lettera: LetteraNomi, categoria: CategoriaNomi, risposta: string) =>
  riconosci(lessici.get(lettera)!, categoria, lettera, risposta)

/**
 * I file veri del lessico (scripts/genera-lessico-nomi.ts): che l'app li
 * chieda all'indirizzo giusto, che i conti con cui si scelgono le categorie
 * siano quelli dei file, e che le risposte che tutti si aspettano valgano.
 */
describe('il lessico di Nomi, cose e città', () => {
  it('c’e un file per ogni lettera del gioco, e nessun altro', () => {
    const presenti = readdirSync(CARTELLA)
      .filter((f) => f.endsWith('.json'))
      .sort()
    expect(presenti).toEqual(LETTERE_NOMI.map((l) => `${l}.json`).sort())
    for (const l of LETTERE_NOMI) expect(file.get(l)!.lettera).toBe(l)
  })

  it('l’impronta di ogni file e’ quella del contenuto, ed e’ quella dell’indirizzo', () => {
    for (const l of LETTERE_NOMI) {
      const { versione, ...corpo } = file.get(l)!
      const impronta = createHash('sha1').update(JSON.stringify(corpo)).digest('hex').slice(0, 10)
      expect(versione).toBe(impronta)
      expect(VERSIONI_LESSICO_NOMI[l]).toBe(versione)
      expect(urlLessicoNomi(l)).toBe(`/dati/nomi-cose/${l}.json?v=${versione}`)
    }
  })

  it('i conti delle categorie sono quelli dei file', () => {
    for (const l of LETTERE_NOMI) {
      const categorie = file.get(l)!.categorie
      const contati = Object.fromEntries(Object.entries(categorie).map(([c, parole]) => [c, parole.length]))
      expect(CONTI_LESSICO_NOMI[l]).toEqual(contati)
      for (const c of Object.keys(categorie)) expect(TUTTE_LE_CATEGORIE).toContain(c)
    }
  })

  it('ogni parola e’ gia’ normalizzata e comincia con la lettera; gli elenchi sono in ordine e senza doppioni', () => {
    // Le parole sono duecentomila: si raccolgono quelle storte e si confronta una volta sola.
    const storte: string[] = []
    for (const l of LETTERE_NOMI) {
      for (const [c, parole] of Object.entries(file.get(l)!.categorie)) {
        expect(parole.length).toBeGreaterThan(0)
        for (const p of parole) {
          if (!/^[a-z]{2,40}$/.test(p) || normalizza(p) !== p || !p.startsWith(l)) storte.push(`${l}/${c}: ${p}`)
        }
        expect(parole, `${l}/${c}`).toEqual([...new Set(parole)].sort())
      }
    }
    expect(storte).toEqual([])
  })

  it('le parole note stanno nella loro categoria, con la lettera, scritte come le scrive una persona', () => {
    const storte: string[] = []
    for (const l of LETTERE_NOMI) {
      const { categorie, note } = file.get(l)!
      expect(note, `note della ${l}`).toBeDefined()
      for (const [c, parole] of Object.entries(note ?? {}) as Array<[CategoriaNomi, string[]]>) {
        expect(parole.length, `${l}/${c}`).toBeGreaterThan(0)
        expect(parole.length, `${l}/${c}`).toBeLessThanOrEqual(40)
        const elenco = new Set(categorie[c] ?? [])
        const forme = parole.map(normalizza)
        expect(new Set(forme).size, `${l}/${c}: doppioni`).toBe(forme.length)
        for (const p of parole) {
          const n = normalizza(p)
          // Scritte, non normalizzate: niente spazi doppi o ai lati, e i nomi propri con la maiuscola.
          const proprio = c === 'nomi' || c === 'citta' || c === 'paesi' || c === 'acque'
          const scritta = p === p.trim() && !/\s{2}/.test(p) && (!proprio || p[0] === p[0].toUpperCase())
          if (!elenco.has(n) || !n.startsWith(l) || !scritta) storte.push(`${l}/${c}: ${p}`)
        }
      }
    }
    expect(storte).toEqual([])
  })

  it('fra le parole note ci sono quelle che scriverebbe chiunque', () => {
    const attese: Array<[LetteraNomi, CategoriaNomi, string]> = [
      ['m', 'nomi', 'Marco'],
      ['g', 'nomi', 'Giulia'],
      ['r', 'citta', 'Roma'],
      ['m', 'citta', 'Milano'],
      ['p', 'citta', 'Parigi'],
      ['f', 'paesi', 'Francia'],
      ['s', 'paesi', 'Spagna'],
      ['p', 'acque', 'Po'],
      ['t', 'acque', 'Tevere'],
      ['c', 'animali', 'cane'],
      ['g', 'animali', 'gatto'],
      ['m', 'frutta', 'mela'],
      ['p', 'cibi', 'pizza'],
      ['m', 'mestieri', 'medico'],
      ['c', 'sport', 'calcio'],
      ['c', 'strumenti', 'chitarra'],
      ['r', 'colori', 'rosso'],
      ['m', 'corpo', 'mano'],
      ['s', 'vestiti', 'scarpa'],
      ['m', 'verbi', 'mangiare'],
      ['b', 'aggettivi', 'bello'],
    ]
    for (const [lettera, categoria, parola] of attese) {
      expect(file.get(lettera)!.note?.[categoria], `${parola} fra ${categoria}`).toContain(parola)
    }
  })

  it('con ogni lettera escono almeno le categorie di una partita', () => {
    for (const l of LETTERE_NOMI) {
      const idonee = categorieIdonee(l, CONTI_LESSICO_NOMI)
      expect(idonee.length, `lettera ${l}`).toBeGreaterThanOrEqual(CATEGORIE_PER_PARTITA)
      for (const c of idonee) expect(CONTI_LESSICO_NOMI[l][c]).toBeGreaterThanOrEqual(PAROLE_MINIME)
    }
  })

  it('i file stanno in quel che si scarica volentieri su un telefono', () => {
    let totale = 0
    for (const testo of testi.values()) {
      const peso = Buffer.byteLength(testo, 'utf8')
      expect(peso).toBeLessThanOrEqual(450 * 1024)
      totale += peso
    }
    expect(totale).toBeLessThanOrEqual(4 * 1024 * 1024)
  })

  it('valgono le risposte che tutti si aspettano', () => {
    const attese: Array<[LetteraNomi, CategoriaNomi, string]> = [
      ['a', 'nomi', 'Anna'],
      ['n', 'nomi', 'Nicola'],
      ['a', 'citta', 'Ancona'],
      ['r', 'citta', 'Roma'],
      ['b', 'citta', 'Berlino'],
      ['f', 'paesi', 'Francia'],
      ['a', 'paesi', 'Austria'],
      ['t', 'acque', 'Tevere'],
      ['a', 'acque', 'Adige'],
      ['p', 'acque', 'il fiume Po'],
      ['b', 'acque', 'Baltico'],
      ['a', 'animali', 'aquila'],
      ['b', 'animali', 'balena'],
      ['p', 'piante', 'pino'],
      ['a', 'piante', 'abete'],
      ['p', 'frutta', 'pere'],
      ['a', 'frutta', 'albicocca'],
      ['b', 'frutta', 'broccolo'],
      ['c', 'cose', 'cucchiaio'],
      ['a', 'cose', 'armadio'],
      ['m', 'mestieri', 'medico'],
      ['m', 'mestieri', 'maestra'],
      ['a', 'mestieri', 'architetto'],
      ['b', 'mestieri', 'barbiere'],
      ['v', 'verbi', 'volare'],
      ['b', 'verbi', 'bere'],
      ['b', 'aggettivi', 'bello'],
      ['a', 'aggettivi', 'alto'],
      ['g', 'colori', 'giallo'],
      ['a', 'colori', 'azzurro'],
      ['s', 'sport', 'sci'],
      ['a', 'sport', 'atletica'],
      ['b', 'sport', 'baseball'],
      ['c', 'strumenti', 'chitarra'],
      ['a', 'strumenti', 'arpa'],
      ['b', 'strumenti', 'batteria'],
      ['m', 'corpo', 'mano'],
      ['a', 'corpo', 'ascella'],
      ['b', 'corpo', 'braccio'],
      ['c', 'vestiti', 'cappello'],
      ['a', 'vestiti', 'anello'],
      ['b', 'vestiti', 'berretto'],
      ['c', 'cibi', 'carbonara'],
      ['a', 'cibi', 'arrosto'],
      ['b', 'cibi', 'biscotto'],
    ]
    for (const [lettera, categoria, risposta] of attese) {
      expect(vale(lettera, categoria, risposta), `${risposta} fra ${categoria}`).not.toBeNull()
    }
  })

  it('le acque valgono senza "lago di", e i mari anche con il nome intero', () => {
    expect(vale('g', 'acque', 'Lago di Garda')).toBe('garda')
    expect(vale('l', 'acque', 'Lago di Garda')).toBeNull()
    expect(vale('m', 'acque', 'il Mar Mediterraneo')).toBe('marmediterraneo')
    expect(vale('m', 'acque', 'Mediterraneo')).toBe('mediterraneo')
    expect(vale('r', 'acque', 'Mar Rosso')).toBe('rosso')
    expect(vale('p', 'acque', 'Oceano Pacifico')).toBe('pacifico')
  })

  it('un plurale o un femminile e’ la stessa risposta della sua forma base', () => {
    expect(vale('p', 'frutta', 'le pere')).toBe('pera')
    expect(vale('m', 'mestieri', 'maestra')).toBe('maestro')
    expect(vale('p', 'mestieri', 'pittrice')).toBe('pittore')
    expect(vale('d', 'mestieri', 'dottoressa')).toBe('dottore')
    expect(vale('m', 'mestieri', 'le maestre')).toBe('maestro')
    expect(vale('g', 'animali', 'i gatti')).toBe('gatto')
    expect(vale('g', 'animali', 'la gatta')).toBe('gatto')
    expect(vale('t', 'cibi', 'tortellini')).toBe('tortellino')
    expect(vale('b', 'aggettivi', 'bella')).toBe('bello')
    expect(vale('b', 'aggettivi', 'belli')).toBe('bello')
    expect(vale('b', 'aggettivi', 'belle')).toBe('bello')
  })

  it('le citta’ con l’articolo valgono con tutte e due le iniziali', () => {
    expect(vale('l', 'citta', 'La Spezia')).toBe('laspezia')
    expect(vale('s', 'citta', 'La Spezia')).toBe('spezia')
  })

  it('una risposta fuori categoria, o con un’altra iniziale, non vale', () => {
    expect(vale('a', 'animali', 'armadio')).toBeNull()
    expect(vale('f', 'paesi', 'Firenze')).toBeNull()
    expect(vale('t', 'citta', 'tavolo')).toBeNull()
    expect(vale('m', 'mestieri', 'mela')).toBeNull()
    expect(vale('a', 'animali', 'balena')).toBeNull()
    expect(vale('c', 'colori', 'cane')).toBeNull()
  })
})

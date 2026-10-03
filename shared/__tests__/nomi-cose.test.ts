import { describe, expect, it } from 'vitest'
import {
  BASE_NOMI,
  CATEGORIE_PER_PARTITA,
  LETTERE_NOMI,
  PAROLE_MINIME,
  PUNTI_COMUNE,
  PUNTI_RARA,
  TEMPO_NOMI_MS,
  TUTTE_LE_CATEGORIE,
  categorieDelGiorno,
  categorieIdonee,
  contaLaGiornata,
  fattoreTempo,
  letteraDelGiorno,
  normalizza,
  puntiNomi,
  puntiRisposta,
  puntiSfida,
  rarita,
  riconosci,
  type CategoriaNomi,
  type LessicoNomi,
} from '../nomi-cose'
import { CONTI_LESSICO_NOMI } from '../nomi-cose-lessico'

const LESSICO: LessicoNomi = new Map<CategoriaNomi, ReadonlySet<string>>([
  ['frutta', new Set(['arancia', 'albicocca', 'ananas'])],
  ['mestieri', new Set(['pittore', 'pilota', 'postino', 'maestro'])],
  ['acque', new Set(['garda', 'gange'])],
  ['animali', new Set(['gatto', 'gabbiano'])],
  ['citta', new Set(['santagata', 'saronno'])],
])

describe('le risposte', () => {
  it('si confrontano senza maiuscole, accenti, spazi e apostrofi', () => {
    expect(normalizza("Sant'Agata")).toBe('santagata')
    expect(normalizza('Città del Vaticano')).toBe('cittadelvaticano')
    expect(riconosci(LESSICO, 'citta', 's', "Sant’Agata")).toBe('santagata')
  })

  it('valgono con l’articolo, al plurale e al femminile', () => {
    expect(riconosci(LESSICO, 'frutta', 'a', 'le arance')).toBe('arancia')
    expect(riconosci(LESSICO, 'animali', 'g', 'Il gatto')).toBe('gatto')
    expect(riconosci(LESSICO, 'animali', 'g', 'gabbiani')).toBe('gabbiano')
    expect(riconosci(LESSICO, 'mestieri', 'p', 'pittrice')).toBe('pittore')
    expect(riconosci(LESSICO, 'mestieri', 'm', 'maestre')).toBe('maestro')
    expect(riconosci(LESSICO, 'acque', 'g', 'il lago di Garda')).toBe('garda')
  })

  it('non valgono fuori dalla categoria, con un’altra lettera, o troppo lunghe', () => {
    expect(riconosci(LESSICO, 'frutta', 'a', 'gatto')).toBeNull()
    expect(riconosci(LESSICO, 'animali', 'a', 'gatto')).toBeNull()
    expect(riconosci(LESSICO, 'colori', 'a', 'azzurro')).toBeNull()
    expect(riconosci(LESSICO, 'frutta', 'a', `arancia${' '.repeat(40)}x`)).toBeNull()
  })
})

describe('i punti della classificata', () => {
  it('una risposta che ha scritto uno solo vale il massimo, una che hanno scritto tutti il minimo', () => {
    expect(rarita(1, 5000)).toBe(1)
    expect(rarita(5000, 5000)).toBe(0)
    expect(puntiRisposta(1, 5000)).toBe(PUNTI_RARA)
    expect(puntiRisposta(5000, 5000)).toBe(PUNTI_COMUNE)
  })

  it('con cinquemila giocatori non vale tutto zero: la risposta di tutti vale qualcosa, e la scala e’ graduale', () => {
    const scala = [1, 10, 100, 1000, 5000].map((k) => puntiRisposta(k, 5000))
    for (let i = 1; i < scala.length; i += 1) expect(scala[i]).toBeLessThan(scala[i - 1])
    expect(Math.min(...scala)).toBeGreaterThanOrEqual(PUNTI_COMUNE)
    // Dieci su cinquemila e' ancora una risposta rara.
    expect(puntiRisposta(10, 5000)).toBeGreaterThan((PUNTI_RARA + PUNTI_COMUNE) / 2)
  })

  it('la stessa proporzione vale lo stesso con pochi e con tanti: due su tre e’ comune in tre come in tremila', () => {
    expect(rarita(2, 3)).toBeLessThan(0.4)
    expect(rarita(2000, 3000)).toBeLessThan(0.1)
    expect(rarita(1, 2)).toBe(1)
  })

  it('il tempo toglie al piu’ un quarto, e solo alle risposte', () => {
    expect(fattoreTempo(0)).toBe(1)
    expect(fattoreTempo(TEMPO_NOMI_MS)).toBe(0.75)
    expect(fattoreTempo(TEMPO_NOMI_MS * 3)).toBe(0.75)
    const tutte = Array.from({ length: CATEGORIE_PER_PARTITA }, () => ({ scritta: true, uguali: 1 }))
    expect(puntiNomi(tutte, 10, TEMPO_NOMI_MS)).toBe(Math.round(BASE_NOMI + CATEGORIE_PER_PARTITA * PUNTI_RARA * 0.75))
  })

  it('la giornata contata: le stesse forme sono la stessa risposta, e gioca chi ha scritto qualcosa', () => {
    const conto = contaLaGiornata(LESSICO, 'a', ['frutta'], [
      { id: 'a', risposte: { frutta: 'le arance' }, tempoMs: 0 },
      { id: 'b', risposte: { frutta: 'Arancia' }, tempoMs: 0 },
      { id: 'c', risposte: { frutta: 'albicocca' }, tempoMs: 0 },
      { id: 'd', risposte: { frutta: 'abete' }, tempoMs: 0 },
      { id: 'e', risposte: {}, tempoMs: TEMPO_NOMI_MS },
    ])
    expect(conto.giocatori).toBe(4)
    const [a, b, c, d, e] = conto.partite
    expect(a.risposte.frutta).toMatchObject({ forma: 'arancia', uguali: 2 })
    expect(b.risposte.frutta?.uguali).toBe(2)
    expect(c.risposte.frutta).toMatchObject({ forma: 'albicocca', uguali: 1, punti: PUNTI_RARA })
    expect(d.risposte.frutta).toMatchObject({ forma: null, uguali: null, punti: 0 })
    expect(c.punti).toBeGreaterThan(a.punti)
    expect(d.punti).toBe(BASE_NOMI)
    expect(e.punti).toBe(0)
    // Le piu' date, come le hanno scritte i piu'.
    expect(conto.piuDate.frutta?.[0]).toMatchObject({ uguali: 2 })
  })

  it('vale quel che alla consegna e’ stato detto valere, anche se il lessico nel frattempo e’ cambiato', () => {
    const conto = contaLaGiornata(LESSICO, 'a', ['frutta'], [
      { id: 'a', risposte: { frutta: 'avocado' }, tempoMs: 0, forme: { frutta: 'avocado' } },
      { id: 'b', risposte: { frutta: 'arancia' }, tempoMs: 0, forme: { frutta: null } },
      { id: 'c', risposte: { frutta: 'ananas' }, tempoMs: 0, forme: null },
    ])
    expect(conto.partite.map((p) => p.risposte.frutta?.forma)).toEqual(['avocado', null, 'ananas'])
  })
})

describe('la giornata', () => {
  it('in diciannove giorni escono tutte le lettere, e mai la stessa due giorni di fila', () => {
    for (let giro = 0; giro < 6; giro += 1) {
      const lettere = Array.from({ length: LETTERE_NOMI.length }, (_, i) => letteraDelGiorno(giro * 19 + i + 1))
      expect(new Set(lettere).size).toBe(LETTERE_NOMI.length)
    }
    for (let n = 1; n < 400; n += 1) expect(letteraDelGiorno(n + 1)).not.toBe(letteraDelGiorno(n))
  })

  it('le categorie sono cinque, diverse, fra quelle che con la lettera hanno abbastanza parole', () => {
    for (let n = 1; n < 120; n += 1) {
      const categorie = categorieDelGiorno(n, CONTI_LESSICO_NOMI)
      expect(categorie).toHaveLength(CATEGORIE_PER_PARTITA)
      expect(new Set(categorie).size).toBe(CATEGORIE_PER_PARTITA)
      const lettera = letteraDelGiorno(n)
      for (const c of categorie) expect(CONTI_LESSICO_NOMI[lettera][c] ?? 0).toBeGreaterThanOrEqual(PAROLE_MINIME)
      // Nell'ordine del foglio, e sempre le stesse per lo stesso giorno.
      const ordine = categorie.map((c) => TUTTE_LE_CATEGORIE.indexOf(c))
      expect(ordine).toEqual([...ordine].sort((a, b) => a - b))
      expect(categorieDelGiorno(n, CONTI_LESSICO_NOMI)).toEqual(categorie)
    }
  })

  it('ogni lettera ha abbastanza categorie per una partita', () => {
    for (const l of LETTERE_NOMI) {
      expect(categorieIdonee(l, CONTI_LESSICO_NOMI).length, l).toBeGreaterThanOrEqual(CATEGORIE_PER_PARTITA + 3)
    }
  })
})

describe('la sfida', () => {
  it('venti a chi e’ l’unico a rispondere, dieci per una risposta diversa, cinque per una uguale', () => {
    expect(
      puntiSfida([
        ['arancia', 'pittore', null, 'garda'],
        ['arancia', 'pilota', 'gatto', null],
      ]),
    ).toEqual([
      [5, 10, 0, 20],
      [5, 10, 20, 0],
    ])
    // In tre: due uguali e una diversa.
    expect(puntiSfida([['a'], ['a'], ['b']])).toEqual([[5], [5], [10]])
  })
})

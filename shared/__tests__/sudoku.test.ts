import { describe, expect, it } from 'vitest'
import { NESSUN_AIUTO } from '../aiuti'
import { mulberry32 } from '../daily'
import {
  CASELLE,
  LIVELLI,
  NOTE_VUOTE,
  UNITA,
  VICINI,
  VUOTA,
  caselleSbagliate,
  contaSoluzioni,
  costiSudoku,
  doppioni,
  generaSchema,
  grigliaCompleta,
  LIVELLO_CLASSIFICATA,
  RITMO_SUDOKU,
  livelloDi,
  noteDaTesto,
  noteInTesto,
  possibili,
  puntiSudoku,
  quanteDate,
  risolvi,
  rispettaLeDate,
  schemaDelGiorno,
  valuta,
} from '../sudoku'

// Uno schema facile da manuale, con la sua soluzione.
const FACILE = '53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79'
const SOLUZIONE = '534678912672195348198342567859761423426853791713924856961537284287419635345286179'

describe('la griglia del sudoku', () => {
  it('ha 27 unità di nove caselle, e ogni casella ne vede venti', () => {
    expect(UNITA).toHaveLength(27)
    for (const u of UNITA) expect(new Set(u).size).toBe(9)
    for (const v of VICINI) expect(v).toHaveLength(20)
  })

  it('risolve uno schema e dice che la soluzione e’ una sola', () => {
    expect(risolvi(FACILE)).toBe(SOLUZIONE)
    expect(contaSoluzioni(FACILE)).toBe(1)
    expect(contaSoluzioni(VUOTA.repeat(CASELLE))).toBe(2)
    // Due cifre uguali nella stessa riga: nessuna soluzione.
    expect(contaSoluzioni('55' + VUOTA.repeat(79))).toBe(0)
  })

  it('trova i doppioni e le cifre sbagliate, e tiene le date al loro posto', () => {
    const conDoppione = '5' + '5' + FACILE.slice(2)
    expect(doppioni(conDoppione)).toEqual(expect.arrayContaining([0, 1]))
    expect(doppioni(SOLUZIONE)).toEqual([])
    const sbagliata = SOLUZIONE.slice(0, 2) + '9' + SOLUZIONE.slice(3)
    expect(caselleSbagliate(sbagliata, SOLUZIONE)).toEqual([2])
    expect(rispettaLeDate(SOLUZIONE, FACILE)).toBe(true)
    expect(rispettaLeDate('6' + SOLUZIONE.slice(1), FACILE)).toBe(false)
    // Le possibili della prima casella vuota: guardando riga, colonna e riquadro.
    expect(possibili(FACILE, 2)).toBe((1 << 0) | (1 << 1) | (1 << 3))
  })

  it('fa griglie complete giuste', () => {
    const g = grigliaCompleta(mulberry32(42))
    expect(g).toMatch(/^[1-9]{81}$/)
    expect(doppioni(g)).toEqual([])
  })
})

describe('la difficoltà e il generatore', () => {
  it('uno schema da singole con trenta cifre date e’ una media', () => {
    const v = valuta(FACILE)
    expect(v).toMatchObject({ risolta: true, gradino: 1, livello: 'media' })
  })

  it('il livello viene dal gradino della tecnica e dalle cifre date', () => {
    expect(livelloDi(1, 36)).toBe('facile')
    expect(livelloDi(1, 30)).toBe('media')
    expect(livelloDi(2, 30)).toBe('difficile')
    expect(livelloDi(2, 25)).toBe('esperto')
    expect(livelloDi(0, 25)).toBeNull()
  })

  it('le tecniche avanzate non le vuole nessun livello: lo schema non esce', () => {
    expect(livelloDi(3, 25)).toBeNull()
    expect(livelloDi(3, 40)).toBeNull()
    for (const livello of LIVELLI) {
      const schema = generaSchema(livello, mulberry32(livello.length * 37 + 5))!
      expect(valuta(schema.dati).gradino, livello).toBeLessThanOrEqual(2)
    }
  })

  it('fa schemi di ogni livello, con una soluzione sola, chiusi ragionando', () => {
    for (const livello of LIVELLI) {
      const schema = generaSchema(livello, mulberry32(livello.length * 101))
      expect(schema, livello).not.toBeNull()
      expect(contaSoluzioni(schema!.dati)).toBe(1)
      expect(risolvi(schema!.dati)).toBe(schema!.soluzione)
      expect(valuta(schema!.dati)).toMatchObject({ risolta: true, livello })
      expect(rispettaLeDate(schema!.soluzione, schema!.dati)).toBe(true)
    }
  })

  it('toglie le caselle a coppie simmetriche, come i giornali', () => {
    const { dati } = generaSchema('media', mulberry32(7))!
    for (let k = 0; k < CASELLE; k += 1) expect(dati[k] === VUOTA).toBe(dati[CASELLE - 1 - k] === VUOTA)
    expect(quanteDate(dati)).toBeGreaterThanOrEqual(30)
    expect(quanteDate(dati)).toBeLessThan(36)
  })

  it('la giornata e’ sempre la stessa, ed e’ facile tutti i giorni', () => {
    expect(schemaDelGiorno(31)).toEqual(schemaDelGiorno(31))
    expect(schemaDelGiorno(31)!.dati).not.toBe(schemaDelGiorno(32)!.dati)
    expect(LIVELLO_CLASSIFICATA).toBe('facile')
    for (let n = 40; n < 47; n += 1) {
      const schema = schemaDelGiorno(n)!
      expect(schema.livello).toBe('facile')
      // Una giornata da Wordle: poche cifre da trovare, tutte con le sole singole.
      expect(CASELLE - quanteDate(schema.dati)).toBeLessThanOrEqual(43)
      expect(valuta(schema.dati).gradino).toBe(1)
    }
  })
})

describe('i punti e le note', () => {
  it('cento finito presto e senza aiuti; gli aiuti costano le loro parti', () => {
    const costi = costiSudoku(schemaDelGiorno(31)!.dati)
    // Fra 42 e 43 cifre da trovare: una parte vale 2,3 punti.
    expect(costi).toMatchObject({ svelata: 7, errore: 2, controllo: 2, controlloSchema: 12 })
    expect(puntiSudoku(NESSUN_AIUTO, costi, 60_000)).toBe(100)
    expect(puntiSudoku({ svelate: 2, errori: 5, controlli: 1, controlliSchema: 0 }, costi, 60_000)).toBe(100 - 14 - 10 - 2)
    expect(puntiSudoku({ ...NESSUN_AIUTO, controlliSchema: 1 }, costi, 60_000)).toBe(88)
    expect(puntiSudoku({ ...NESSUN_AIUTO, svelate: 60 }, costi, 60_000)).toBe(0)
  })

  it('il tempo decide: cento fino a sei secondi a cifra, poi a scendere fino alla metà', () => {
    const costi = costiSudoku(schemaDelGiorno(31)!.dati)
    const n = costi.daTrovare
    expect(puntiSudoku(NESSUN_AIUTO, costi, RITMO_SUDOKU.pienoMs * n)).toBe(100)
    expect(puntiSudoku(NESSUN_AIUTO, costi, ((RITMO_SUDOKU.pienoMs + RITMO_SUDOKU.lentoMs) / 2) * n)).toBe(75)
    expect(puntiSudoku(NESSUN_AIUTO, costi, RITMO_SUDOKU.lentoMs * n)).toBe(50)
    expect(puntiSudoku(NESSUN_AIUTO, costi, 3_600_000)).toBe(50)
    // Una giornata normale, otto minuti: una novantina.
    expect(puntiSudoku(NESSUN_AIUTO, costi, 8 * 60_000)).toBeGreaterThanOrEqual(85)
    // Gli aiuti si tolgono da quel che vale il tempo.
    expect(puntiSudoku({ ...NESSUN_AIUTO, svelate: 2 }, costi, RITMO_SUDOKU.lentoMs * n)).toBe(50 - 14)
  })

  it('le note stanno in 243 caratteri e tornano uguali', () => {
    const note = new Uint16Array(CASELLE)
    note[0] = 0b101
    note[80] = 0x1ff
    const testo = noteInTesto(note)
    expect(testo).toHaveLength(243)
    expect(Array.from(noteDaTesto(testo))).toEqual(Array.from(note))
    expect(Array.from(noteDaTesto('rotto'))).toEqual(Array.from(noteDaTesto(NOTE_VUOTE)))
  })
})

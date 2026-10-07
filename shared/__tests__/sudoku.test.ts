import { describe, expect, it } from 'vitest'
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
  livelloDelGiorno,
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
    expect(livelloDi(3, 25)).toBe('esperto')
    expect(livelloDi(0, 25)).toBeNull()
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
    expect(quanteDate(dati)).toBeGreaterThanOrEqual(28)
    expect(quanteDate(dati)).toBeLessThan(34)
  })

  it('la giornata e’ sempre la stessa, e il livello segue la settimana', () => {
    expect(schemaDelGiorno(31, '2026-09-28')).toEqual(schemaDelGiorno(31, '2026-09-28'))
    expect(schemaDelGiorno(31, '2026-09-28')!.dati).not.toBe(schemaDelGiorno(32, '2026-09-29')!.dati)
    expect(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'].map(livelloDelGiorno)).toEqual(
      ['facile', 'facile', 'media', 'media', 'difficile', 'difficile', 'esperto'],
    )
  })
})

describe('i punti e le note', () => {
  it('centocinquanta senza aiuti, tre per cifra svelata, uno per errore, mai sotto zero', () => {
    const costi = costiSudoku(schemaDelGiorno(31, '2026-09-28')!.dati)
    expect(puntiSudoku(0, 0, costi)).toBe(150)
    expect(puntiSudoku(2, 5, costi)).toBe(139)
    expect(puntiSudoku(60, 0, costi)).toBe(0)
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

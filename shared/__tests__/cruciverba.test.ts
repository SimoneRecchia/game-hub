import { describe, expect, it } from 'vitest'
import {
  PUNTI_COMPLETO,
  caselleBianche,
  caselleSbagliate,
  caselleScritte,
  costiCruciverba,
  grigliaIniziale,
  grigliaPiena,
  grigliaValida,
  numeriDelleCaselle,
  punteggio,
  schemaVuoto,
  sequenzeDelloSchema,
} from '../cruciverba'

/*
 *   C A S A
 *   O # E #
 *   R E A #
 *
 * Tre righe per quattro colonne, scritto per esteso perché si legga a vista.
 */
const SOLUZIONE = 'casa' + 'o#e#' + 'rea#'

describe('le parole di uno schema', () => {
  const sequenze = sequenzeDelloSchema(SOLUZIONE, 3, 4)

  it('trova ogni tratto di almeno due caselle, e nessun altro', () => {
    const parole = sequenze.map((s) => s.caselle.map((k) => SOLUZIONE[k]).join(''))
    // Orizzontali prima, poi verticali: CASA, REA; COR, SEA.
    expect(parole).toEqual(['casa', 'rea', 'cor', 'sea'])
  })

  it("numera come il cruciverba italiano: un numero dove comincia una parola, riga per riga", () => {
    expect(sequenze.map((s) => [s.chiave, s.numero])).toEqual([
      ['o0', 1],
      ['o8', 3],
      ['v0', 1],
      ['v2', 2],
    ])
    // La C di CASA e COR porta un numero solo.
    const numeri = numeriDelleCaselle(sequenze)
    expect([...numeri.entries()]).toEqual([
      [0, 1],
      [8, 3],
      [2, 2],
    ])
  })

  it('una lettera fra due nere non e\' una parola', () => {
    // La E della seconda riga sta fra due nere in orizzontale: e' solo in SEA.
    expect(sequenze.filter((s) => s.caselle.includes(6)).map((s) => s.chiave)).toEqual(['v2'])
  })
})

describe('la griglia del giocatore', () => {
  it('parte vuota, con le nere al loro posto', () => {
    expect(grigliaIniziale(SOLUZIONE)).toBe('    ' + ' # #' + '   #')
    expect(schemaVuoto(SOLUZIONE)).toBe('....' + '.#.#' + '...#')
    expect(caselleBianche(SOLUZIONE)).toBe(9)
  })

  it('rifiuta una griglia che sposta una nera, scrive una lettera straniera o ha un\'altra misura', () => {
    expect(grigliaValida(grigliaIniziale(SOLUZIONE), SOLUZIONE)).toBe(true)
    expect(grigliaValida('casa' + 'o#e#' + 'rea#', SOLUZIONE)).toBe(true)
    expect(grigliaValida('casa' + 'oxe#' + 'rea#', SOLUZIONE)).toBe(false)
    expect(grigliaValida('casa' + 'o#e ' + 'rea#', SOLUZIONE)).toBe(false)
    expect(grigliaValida('cjsa' + 'o#e#' + 'rea#', SOLUZIONE)).toBe(false)
    expect(grigliaValida('CASA' + 'O#E#' + 'REA#', SOLUZIONE)).toBe(false)
    expect(grigliaValida('casa', SOLUZIONE)).toBe(false)
  })

  it('le caselle sbagliate sono solo quelle scritte con la lettera sbagliata', () => {
    const scritta = 'cosa' + '  e#' + 're #'
    expect(caselleSbagliate(scritta, SOLUZIONE)).toEqual([1])
    expect(caselleScritte(scritta)).toBe(7)
    expect(grigliaPiena(scritta)).toBe(false)
    expect(grigliaPiena(SOLUZIONE)).toBe(true)
  })
})

describe('il punteggio', () => {
  const costi = costiCruciverba(SOLUZIONE)

  it('vale il tetto senza aiuti', () => {
    expect(punteggio(0, 0, costi)).toBe(PUNTI_COMPLETO)
  })

  it('svelare costa piu\' che controllare: la risposta vale piu\' della conferma', () => {
    expect(costi.svelata).toBeGreaterThan(costi.errore)
    expect(punteggio(2, 3, costi)).toBe(PUNTI_COMPLETO - 2 * costi.svelata - 3 * costi.errore)
  })

  it('non scende sotto zero', () => {
    expect(punteggio(80, 50, costi)).toBe(0)
  })
})

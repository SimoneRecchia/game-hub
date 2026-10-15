import { describe, expect, it } from 'vitest'
import { NESSUN_AIUTO } from '../aiuti'
import {
  PUNTI_COMPLETO,
  RITMO_CRUCIVERBA,
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
    expect(punteggio(NESSUN_AIUTO, costi, 0)).toBe(PUNTI_COMPLETO)
  })

  it('svelare costa piu\' che controllare: la risposta vale piu\' della conferma', () => {
    expect(costi.svelata).toBeGreaterThan(costi.controllo + costi.errore)
    expect(costi.controlloSchema).toBeGreaterThan(costi.controllo)
    // Lo schema di prova ha poche lettere, e ognuna vale tanto: bastano tre aiuti.
    expect(punteggio({ svelate: 1, errori: 1, controlli: 1, controlliSchema: 0 }, costi, 0)).toBe(
      PUNTI_COMPLETO - costi.svelata - costi.errore - costi.controllo,
    )
  })

  it('non scende sotto zero', () => {
    expect(punteggio({ ...NESSUN_AIUTO, svelate: 80, errori: 50 }, costi, 0)).toBe(0)
  })

  it('il tempo fa i punti: pieni presto, a scendere fino alla meta\'', () => {
    const n = costi.daTrovare
    expect(punteggio(NESSUN_AIUTO, costi, RITMO_CRUCIVERBA.pienoMs * n)).toBe(PUNTI_COMPLETO)
    expect(punteggio(NESSUN_AIUTO, costi, ((RITMO_CRUCIVERBA.pienoMs + RITMO_CRUCIVERBA.lentoMs) / 2) * n)).toBe(75)
    expect(punteggio(NESSUN_AIUTO, costi, RITMO_CRUCIVERBA.lentoMs * n)).toBe(PUNTI_COMPLETO / 2)
    expect(punteggio(NESSUN_AIUTO, costi, 10 * 3_600_000)).toBe(PUNTI_COMPLETO / 2)
    // Gli aiuti si tolgono da quel che vale il tempo.
    const lento = { ...NESSUN_AIUTO, controlli: 1 }
    expect(punteggio(lento, costi, RITMO_CRUCIVERBA.lentoMs * n)).toBe(PUNTI_COMPLETO / 2 - costi.controllo)
  })

  it('un nove per nove facile si fa nel tempo di un Wordle per i punti pieni', () => {
    // Una sessantina di lettere da trovare: cinque minuti e mezzo per i cento punti.
    expect(RITMO_CRUCIVERBA.pienoMs * 65).toBeLessThanOrEqual(6 * 60_000)
  })
})

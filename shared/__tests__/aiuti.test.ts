import { describe, expect, it } from 'vitest'
import { costiAiuti, puntiConAiuti } from '../aiuti'
import { PUNTI_COMPLETO as TETTO_CRUCIVERBA, costiCruciverba, punteggio } from '../cruciverba'
import { CASELLE, MINIMO_DATE, PUNTI_COMPLETO as TETTO_SUDOKU, costiSudoku, puntiSudoku } from '../sudoku'

/** Le lettere di un cruciverba: dieci per dieci, con fra diciotto e ventidue nere (`disegnaSchema`). */
const LETTERE_CRUCIVERBA = [78, 79, 80, 81, 82]

/** Le cifre da trovare in un sudoku: dalle quarantaquattro misurate nel facile a quante ne permette l'esperto. */
const PIU_VUOTE = CASELLE - MINIMO_DATE.esperto
const CIFRE_SUDOKU = Array.from({ length: PIU_VUOTE - 44 + 1 }, (_, i) => 44 + i)

describe('gli aiuti costano quanto la parte di schema che danno', () => {
  const casi = [
    ...LETTERE_CRUCIVERBA.map((n) => ({ gioco: 'cruciverba', tetto: TETTO_CRUCIVERBA, n })),
    ...CIFRE_SUDOKU.map((n) => ({ gioco: 'sudoku', tetto: TETTO_SUDOKU, n })),
  ]

  it('una casella svelata costa la sua parte del tetto, arrotondata', () => {
    for (const { gioco, tetto, n } of casi) {
      const { svelata } = costiAiuti(tetto, n)
      // Svelare tutto lo schema costa quanto il tetto, a meno dell'arrotondamento.
      expect((svelata * n) / tetto, `${gioco} con ${n} caselle`).toBeGreaterThanOrEqual(0.85)
      expect((svelata * n) / tetto, `${gioco} con ${n} caselle`).toBeLessThanOrEqual(1.2)
    }
  })

  it('svelarne un quarto lascia circa tre quarti dei punti, svelarlo tutto zero', () => {
    for (const { gioco, tetto, n } of casi) {
      const costi = costiAiuti(tetto, n)
      const quarto = puntiConAiuti(tetto, costi, Math.round(n / 4), 0)
      expect(quarto / tetto, `${gioco} con ${n} caselle`).toBeGreaterThan(0.68)
      expect(quarto / tetto, `${gioco} con ${n} caselle`).toBeLessThan(0.8)
      expect(puntiConAiuti(tetto, costi, n, 0), `${gioco} con ${n} caselle`).toBe(0)
    }
  })

  it('un errore trovato costa meno di una casella svelata, e almeno un punto', () => {
    for (const { tetto, n } of casi) {
      const { svelata, errore } = costiAiuti(tetto, n)
      expect(errore).toBeGreaterThanOrEqual(1)
      expect(errore).toBeLessThan(svelata)
    }
  })

  it('nel cruciverba una lettera costa due punti e un errore uno; nel sudoku una cifra tre e un errore uno', () => {
    for (const n of LETTERE_CRUCIVERBA) expect(costiAiuti(TETTO_CRUCIVERBA, n)).toMatchObject({ svelata: 2, errore: 1 })
    for (const n of CIFRE_SUDOKU) expect(costiAiuti(TETTO_SUDOKU, n)).toMatchObject({ svelata: 3, errore: 1 })
  })

  it('una parola di otto lettere svelata toglie un decimo del cruciverba, non un quarto', () => {
    const costi = costiAiuti(TETTO_CRUCIVERBA, 80)
    expect(TETTO_CRUCIVERBA - puntiConAiuti(TETTO_CRUCIVERBA, costi, 8, 0)).toBe(16)
  })
})

describe('i costi vengono dallo schema', () => {
  it('nel cruciverba dalle caselle bianche', () => {
    const schema = '..#.....'
    const sette = costiAiuti(TETTO_CRUCIVERBA, 7)
    expect(costiCruciverba(schema)).toEqual(sette)
    expect(punteggio(1, 1, costiCruciverba(schema))).toBe(puntiConAiuti(TETTO_CRUCIVERBA, sette, 1, 1))
  })

  it('nel sudoku dalle caselle vuote', () => {
    const dati = '5'.repeat(30) + '.'.repeat(51)
    expect(costiSudoku(dati)).toEqual(costiAiuti(TETTO_SUDOKU, 51))
    expect(puntiSudoku(0, 0, costiSudoku(dati))).toBe(TETTO_SUDOKU)
  })
})

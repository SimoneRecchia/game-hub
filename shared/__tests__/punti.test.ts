import { describe, expect, it } from 'vitest'
import { CASELLE, CASELLE_FLOTTA } from '../battaglia'
import { COSTO_SVELATA, PUNTI_COMPLETO, punteggio as puntiCruciverba } from '../cruciverba'
import { MASSIMI, PUNTI_MASSIMI, RIFERIMENTO_SCARABEO, puntiBattaglia, puntiQuiz, puntiScarabeo, puntiSudoku } from '../punti'
import { COSTO_ERRORE as ERRORE_SUDOKU, COSTO_SVELATA as SVELATA_SUDOKU } from '../sudoku'
import { ATTEMPT_POINTS, ATTEMPT_STEP, MAX_DAY_SCORE, MAX_TIEBREAK } from '../scoring'

/**
 * I punti di tutti i giochi stanno sulla stessa scala, ed e' quel che rende
 * sommabile la classifica generale: se uno dei tetti si sposta da solo, la
 * generale comincia a pesare un gioco piu' degli altri senza che nessuno lo
 * abbia deciso.
 */
describe('una classificata vale al massimo cento punti', () => {
  it('in tutti i giochi', () => {
    for (const [gioco, massimo] of Object.entries(MASSIMI)) {
      expect(massimo, gioco).toBe(PUNTI_MASSIMI)
    }
  })

  it('nel Wordle i bonus restano uno spareggio', () => {
    // Sopra il cento ci sono solo velocita' e costanza, e meno di un gradino.
    expect(MAX_DAY_SCORE).toBe(100)
    expect(MAX_TIEBREAK).toBeLessThan(ATTEMPT_STEP)
  })

  it('nello Scarabeo pareggiare il computer vale cento, e oltre non si va', () => {
    expect(puntiScarabeo(273, 273)).toBe(100)
    expect(puntiScarabeo(400, 273)).toBe(100)
    expect(puntiScarabeo(0, 273)).toBe(0)
    // Senza riferimento del giorno si usa quello di ripiego, non una divisione per zero.
    expect(puntiScarabeo(RIFERIMENTO_SCARABEO, 0)).toBe(100)
  })

  it('nella battaglia la vittoria perfetta vale cento', () => {
    expect(puntiBattaglia({ vinta: true, colpi: CASELLE_FLOTTA, aSegno: CASELLE_FLOTTA })).toBe(100)
  })

  it('nel cruciverba il completo senza aiuti vale cento', () => {
    expect(PUNTI_COMPLETO).toBe(100)
    expect(puntiCruciverba(0, 0)).toBe(100)
  })

  it('nel sudoku il risolto senza aiuti vale cento', () => {
    expect(puntiSudoku(0, 0)).toBe(100)
  })

  it('nel quiz dieci risposte giuste su dieci valgono cento', () => {
    expect(puntiQuiz(10, 10)).toBe(100)
    expect(puntiQuiz(12, 10)).toBe(100)
    // Le partite libere possono avere un altro numero di domande: il tetto e' lo stesso.
    expect(puntiQuiz(15, 15)).toBe(100)
  })
})

/**
 * Il principio del Wordle vale per tutti: giocarla bene vale circa il doppio
 * di giocarla male, non dieci volte tanto. Una giornata storta si recupera.
 */
describe('una giornata storta si recupera', () => {
  it('nel Wordle la peggiore vittoria vale metà della migliore', () => {
    const peggiore = ATTEMPT_POINTS[ATTEMPT_POINTS.length - 1]
    expect(peggiore / MAX_DAY_SCORE).toBe(0.5)
  })

  it('nello Scarabeo metà del computer vale cinquanta', () => {
    expect(puntiScarabeo(150, 300)).toBe(50)
  })

  it('nella battaglia vincere è sempre meglio che perdere, anche col mare intero', () => {
    const vittoriaPeggiore = puntiBattaglia({ vinta: true, colpi: CASELLE, aSegno: CASELLE_FLOTTA })
    const sconfittaMigliore = puntiBattaglia({ vinta: false, colpi: CASELLE, aSegno: CASELLE_FLOTTA - 1 })
    expect(vittoriaPeggiore).toBeGreaterThan(sconfittaMigliore)
    expect(vittoriaPeggiore).toBeGreaterThanOrEqual(50)
    // Cinquanta colpi sono una partita giocata bene: vale piu' dell'ottanta.
    expect(puntiBattaglia({ vinta: true, colpi: 50, aSegno: CASELLE_FLOTTA })).toBeGreaterThan(80)
  })

  it('nel cruciverba ogni aiuto costa poco, non tutto', () => {
    expect(puntiCruciverba(1, 0)).toBe(100 - COSTO_SVELATA)
    expect(puntiCruciverba(0, 5)).toBeGreaterThan(90)
  })

  it('nel sudoku ogni aiuto costa poco, non tutto, e svelarlo tutto vale zero', () => {
    expect(puntiSudoku(1, 0)).toBe(100 - SVELATA_SUDOKU)
    expect(puntiSudoku(0, 1)).toBe(100 - ERRORE_SUDOKU)
    // Due cifre svelate e tre errori: una giornata con qualche aiuto resta sopra il novanta.
    expect(puntiSudoku(2, 3)).toBeGreaterThanOrEqual(90)
    expect(puntiSudoku(60, 0)).toBe(0)
  })

  it('nel quiz una partita storta vale circa la metà di una perfetta, e finirla vale sempre qualcosa', () => {
    const storta = puntiQuiz(3, 10)
    expect(storta / puntiQuiz(10, 10)).toBeGreaterThan(0.4)
    expect(storta / puntiQuiz(10, 10)).toBeLessThan(0.5)
    expect(puntiQuiz(0, 10)).toBe(20)
    // Ogni risposta giusta conta, e conta uguale.
    for (let g = 0; g < 10; g += 1) expect(puntiQuiz(g + 1, 10) - puntiQuiz(g, 10)).toBe(8)
  })
})

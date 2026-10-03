import { describe, expect, it } from 'vitest'
import { CASELLE, CASELLE_FLOTTA } from '../battaglia'
import { COSTO_ERRORE, COSTO_SVELATA, PUNTI_COMPLETO, punteggio as puntiCruciverba } from '../cruciverba'
import {
  MASSIMI,
  RIFERIMENTO_SCARABEO,
  TETTI,
  puntiBattaglia,
  puntiQuiz,
  puntiScarabeo,
  puntiSudoku,
  puntiTris,
} from '../punti'
import { PARTITE_TRIS } from '../tris'
import { PUNTI_BASE_QUIZ } from '../quiz'
import { COSTO_ERRORE as ERRORE_SUDOKU, COSTO_SVELATA as SVELATA_SUDOKU } from '../sudoku'
import { ATTEMPT_POINTS, ATTEMPT_STEP, MAX_DAY_SCORE, MAX_TIEBREAK } from '../scoring'

/**
 * I tetti decidono quanto pesa ogni gioco nella generale: se uno si sposta da
 * solo, la generale comincia a pesare un gioco piu' degli altri senza che
 * nessuno lo abbia deciso. Per questo la formula di ogni gioco deve arrivare
 * esattamente al suo tetto, e i tetti devono seguire il tempo che chiede ogni
 * gioco.
 */
describe('ogni classificata vale al massimo il suo tetto', () => {
  it('in tutti i giochi, e la formula di ognuno ci arriva', () => {
    for (const [gioco, massimo] of Object.entries(MASSIMI)) {
      expect(massimo, gioco).toBe(TETTI[gioco as keyof typeof TETTI])
    }
    expect(Object.keys(MASSIMI).sort()).toEqual(Object.keys(TETTI).sort())
  })

  it('i tetti seguono il tempo che chiede ogni gioco, ma nessuno vale piu’ di tre volte un altro', () => {
    const ordine = ['cruciverba', 'scarabeo', 'sudoku', 'battaglia', 'quiz', 'wordle', 'tris'] as const
    for (let i = 1; i < ordine.length; i += 1) expect(TETTI[ordine[i]]).toBeLessThanOrEqual(TETTI[ordine[i - 1]])
    const valori = Object.values(TETTI)
    expect(Math.max(...valori) / Math.min(...valori)).toBeLessThanOrEqual(3.2)
  })

  it('nel Wordle i bonus restano uno spareggio', () => {
    // Sopra il tetto ci sono solo velocita' e costanza, e meno di un gradino.
    expect(MAX_DAY_SCORE).toBe(TETTI.wordle)
    expect(MAX_TIEBREAK).toBeLessThan(ATTEMPT_STEP)
  })

  it('nello Scarabeo pareggiare il computer vale il tetto, e oltre non si va', () => {
    expect(puntiScarabeo(273, 273)).toBe(TETTI.scarabeo)
    expect(puntiScarabeo(400, 273)).toBe(TETTI.scarabeo)
    expect(puntiScarabeo(0, 273)).toBe(0)
    // Senza riferimento del giorno si usa quello di ripiego, non una divisione per zero.
    expect(puntiScarabeo(RIFERIMENTO_SCARABEO, 0)).toBe(TETTI.scarabeo)
  })

  it('nella battaglia la vittoria perfetta vale il tetto', () => {
    expect(puntiBattaglia({ vinta: true, colpi: CASELLE_FLOTTA, aSegno: CASELLE_FLOTTA })).toBe(TETTI.battaglia)
  })

  it('nel cruciverba il completo senza aiuti vale il tetto', () => {
    expect(PUNTI_COMPLETO).toBe(TETTI.cruciverba)
    expect(puntiCruciverba(0, 0)).toBe(TETTI.cruciverba)
  })

  it('nel sudoku il risolto senza aiuti vale il tetto, e gli aiuti costano come nel cruciverba', () => {
    expect(puntiSudoku(0, 0)).toBe(TETTI.sudoku)
    expect(SVELATA_SUDOKU).toBe(COSTO_SVELATA)
    expect(ERRORE_SUDOKU).toBe(COSTO_ERRORE)
  })

  it('nel quiz dieci risposte giuste su dieci valgono il tetto', () => {
    expect(puntiQuiz(10, 10)).toBe(TETTI.quiz)
    expect(puntiQuiz(12, 10)).toBe(TETTI.quiz)
    // Le partite libere possono avere un altro numero di domande: il tetto e' lo stesso.
    expect(puntiQuiz(15, 15)).toBe(TETTI.quiz)
  })

  it('nel tris la serie perfetta vale il tetto', () => {
    expect(puntiTris(PARTITE_TRIS, 0)).toBe(TETTI.tris)
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

  it('nello Scarabeo metà del computer vale metà del tetto', () => {
    expect(puntiScarabeo(150, 300)).toBe(TETTI.scarabeo / 2)
  })

  it('nella battaglia vincere è sempre meglio che perdere, anche col mare intero', () => {
    const vittoriaPeggiore = puntiBattaglia({ vinta: true, colpi: CASELLE, aSegno: CASELLE_FLOTTA })
    const sconfittaMigliore = puntiBattaglia({ vinta: false, colpi: CASELLE, aSegno: CASELLE_FLOTTA - 1 })
    expect(vittoriaPeggiore).toBeGreaterThan(sconfittaMigliore)
    expect(vittoriaPeggiore).toBeGreaterThanOrEqual(TETTI.battaglia / 2)
    // Cinquanta colpi sono una partita giocata bene: vale piu' dell'ottanta per cento.
    expect(puntiBattaglia({ vinta: true, colpi: 50, aSegno: CASELLE_FLOTTA })).toBeGreaterThan(0.8 * TETTI.battaglia)
  })

  it('nel cruciverba ogni aiuto costa poco, non tutto', () => {
    expect(puntiCruciverba(1, 0)).toBe(TETTI.cruciverba - COSTO_SVELATA)
    expect(puntiCruciverba(0, 5)).toBeGreaterThan(0.9 * TETTI.cruciverba)
  })

  it('nel sudoku ogni aiuto costa poco, non tutto, e svelarlo tutto vale zero', () => {
    expect(puntiSudoku(1, 0)).toBe(TETTI.sudoku - SVELATA_SUDOKU)
    expect(puntiSudoku(0, 1)).toBe(TETTI.sudoku - ERRORE_SUDOKU)
    // Due cifre svelate e due errori: una giornata con qualche aiuto resta sopra il novanta per cento.
    expect(puntiSudoku(2, 2)).toBeGreaterThanOrEqual(0.9 * TETTI.sudoku)
    expect(puntiSudoku(60, 0)).toBe(0)
  })

  it('nel tris una serie storta vale piu’ della meta’ di una perfetta, e finirla vale sempre qualcosa', () => {
    expect(puntiTris(1, 2) / puntiTris(PARTITE_TRIS, 0)).toBeGreaterThan(0.5)
    expect(puntiTris(0, 0)).toBeGreaterThan(0)
    // Una vittoria vale due patte: la patta e' il risultato di chi gioca bene contro chi gioca bene.
    expect(puntiTris(1, 0) - puntiTris(0, 0)).toBe(2 * (puntiTris(0, 1) - puntiTris(0, 0)))
  })

  it('nel quiz una partita storta vale circa la metà di una perfetta, e finirla vale sempre qualcosa', () => {
    const storta = puntiQuiz(3, 10)
    expect(storta / puntiQuiz(10, 10)).toBeGreaterThan(0.4)
    expect(storta / puntiQuiz(10, 10)).toBeLessThan(0.5)
    expect(puntiQuiz(0, 10)).toBe(PUNTI_BASE_QUIZ)
    // Ogni risposta giusta conta, e conta uguale.
    for (let g = 0; g < 10; g += 1) expect(puntiQuiz(g + 1, 10) - puntiQuiz(g, 10)).toBe(6)
  })
})

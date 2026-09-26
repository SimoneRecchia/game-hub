import { describe, expect, it } from 'vitest'
import { CASELLE, CASELLE_FLOTTA } from '../battaglia'
import { COSTO_SVELATA, PUNTI_COMPLETO, punteggio as puntiCruciverba } from '../cruciverba'
import { MASSIMI, PUNTI_MASSIMI, RIFERIMENTO_SCARABEO, puntiBattaglia, puntiScarabeo } from '../punti'
import { MAX_DAY_SCORE, MAX_TIEBREAK, WORD_BASE, WORD_STEP } from '../scoring'
import { MAX_ATTEMPTS } from '../config'

/**
 * I punti dei quattro giochi stanno sulla stessa scala, ed e' quel che rende
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
    expect(MAX_TIEBREAK).toBeLessThan(WORD_STEP[0])
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
})

/**
 * Il principio del Wordle vale per tutti: giocarla bene vale circa il doppio
 * di giocarla male, non dieci volte tanto. Una giornata storta si recupera.
 */
describe('una giornata storta si recupera', () => {
  it('nel Wordle la peggiore vittoria vale metà della migliore', () => {
    const peggiore = WORD_BASE.reduce((s, b) => s + b, 0)
    expect(peggiore / MAX_DAY_SCORE).toBe(0.5)
    expect(WORD_BASE[0] + WORD_STEP[0] * (MAX_ATTEMPTS - 1)).toBe(50)
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
})

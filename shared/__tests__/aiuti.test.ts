import { describe, expect, it } from 'vitest'
import {
  NESSUN_AIUTO,
  PARTI_AIUTI,
  caselleDaPagare,
  costiAiuti,
  puntiConAiuti,
  senzaAiuti,
  type AiutiChiesti,
} from '../aiuti'
import { PUNTI_COMPLETO as TETTO_CRUCIVERBA, costiCruciverba, punteggio } from '../cruciverba'
import { CASELLE, MINIMO_DATE, PUNTI_COMPLETO as TETTO_SUDOKU, costiSudoku, puntiSudoku } from '../sudoku'

/** Le lettere di un cruciverba: dieci per dieci, con fra diciotto e ventidue nere (`disegnaSchema`). */
const LETTERE_CRUCIVERBA = [78, 79, 80, 81, 82]

/** Le cifre da trovare in un sudoku: dalle quarantaquattro misurate nel facile a quante ne permette l'esperto. */
const PIU_VUOTE = CASELLE - MINIMO_DATE.esperto
const CIFRE_SUDOKU = Array.from({ length: PIU_VUOTE - 44 + 1 }, (_, i) => 44 + i)

const con = (aiuti: Partial<AiutiChiesti>): AiutiChiesti => ({ ...NESSUN_AIUTO, ...aiuti })

describe('gli aiuti costano quel che danno', () => {
  const casi = [
    ...LETTERE_CRUCIVERBA.map((n) => ({ gioco: 'cruciverba', tetto: TETTO_CRUCIVERBA, n })),
    ...CIFRE_SUDOKU.map((n) => ({ gioco: 'sudoku', tetto: TETTO_SUDOKU, n })),
  ]

  it('una casella svelata costa tre parti: svelato un terzo dello schema, la giornata vale zero o quasi', () => {
    for (const { gioco, tetto, n } of casi) {
      const costi = costiAiuti(tetto, n)
      const terzo = puntiConAiuti(tetto, costi, con({ svelate: Math.round(n / 3) }))
      expect(terzo / tetto, `${gioco} con ${n} caselle`).toBeLessThanOrEqual(0.1)
      // Un sesto svelato lascia circa la meta': la giornata storta, non quella persa.
      const sesto = puntiConAiuti(tetto, costi, con({ svelate: Math.round(n / 6) }))
      expect(sesto / tetto, `${gioco} con ${n} caselle`).toBeGreaterThanOrEqual(0.4)
      expect(sesto / tetto, `${gioco} con ${n} caselle`).toBeLessThan(0.6)
      expect(puntiConAiuti(tetto, costi, con({ svelate: n })), `${gioco} con ${n} caselle`).toBe(0)
    }
  })

  it('controllare costa meno che svelare, e tutto lo schema piu’ di una parola', () => {
    for (const { tetto, n } of casi) {
      const c = costiAiuti(tetto, n)
      // Un errore trovato da un controllo, con il controllo, costa meno della casella svelata.
      expect(c.controllo + c.errore).toBeLessThan(c.svelata)
      expect(c.controlloSchema).toBeGreaterThanOrEqual(4 * c.controllo)
      expect(c.controllo).toBeGreaterThanOrEqual(1)
      expect(c.errore).toBeGreaterThanOrEqual(1)
    }
  })

  it('un controllo si paga anche quando non trova errori', () => {
    for (const { tetto, n } of casi) {
      const c = costiAiuti(tetto, n)
      expect(puntiConAiuti(tetto, c, con({ controlli: 1 }))).toBe(tetto - c.controllo)
      expect(puntiConAiuti(tetto, c, con({ controlliSchema: 1 }))).toBe(tetto - c.controlloSchema)
    }
  })

  it('nel cruciverba una lettera sei punti, un controllo due, lo schema dieci; nel sudoku nove, tre, quindici', () => {
    for (const n of LETTERE_CRUCIVERBA) {
      expect(costiAiuti(TETTO_CRUCIVERBA, n)).toMatchObject({
        svelata: 6,
        errore: 2,
        controllo: 2,
        controlloSchema: 10,
      })
    }
    for (const n of CIFRE_SUDOKU) {
      expect(costiAiuti(TETTO_SUDOKU, n)).toMatchObject({ svelata: 9, errore: 3, controllo: 3, controlloSchema: 15 })
    }
    expect(PARTI_AIUTI).toEqual({ svelata: 3, errore: 1, controllo: 1, controlloSchema: 5 })
  })

  it('una parola di otto lettere svelata toglie trenta per cento del cruciverba', () => {
    const costi = costiAiuti(TETTO_CRUCIVERBA, 80)
    expect(TETTO_CRUCIVERBA - puntiConAiuti(TETTO_CRUCIVERBA, costi, con({ svelate: 8 }))).toBe(48)
  })

  it('i costi si sommano, e non si va mai sotto zero', () => {
    const c = costiAiuti(TETTO_CRUCIVERBA, 80)
    const aiuti = { svelate: 3, errori: 4, controlli: 2, controlliSchema: 1 }
    expect(puntiConAiuti(TETTO_CRUCIVERBA, c, aiuti)).toBe(160 - 18 - 8 - 4 - 10)
    expect(puntiConAiuti(TETTO_CRUCIVERBA, c, con({ controlliSchema: 40 }))).toBe(0)
  })

  it('senza aiuti vuol dire niente svelato, niente segnalato e niente controllato', () => {
    expect(senzaAiuti(NESSUN_AIUTO)).toBe(true)
    expect(senzaAiuti(con({ controlli: 1 }))).toBe(false)
    expect(senzaAiuti(con({ controlliSchema: 1 }))).toBe(false)
    expect(senzaAiuti(con({ errori: 1 }))).toBe(false)
    expect(senzaAiuti(con({ svelate: 1 }))).toBe(false)
  })
})

describe('i costi vengono dallo schema', () => {
  it('nel cruciverba dalle caselle bianche', () => {
    const schema = '..#.....'
    const sette = costiAiuti(TETTO_CRUCIVERBA, 7)
    expect(costiCruciverba(schema)).toEqual(sette)
    const aiuti = con({ svelate: 1, errori: 1, controlli: 1 })
    expect(punteggio(aiuti, costiCruciverba(schema))).toBe(puntiConAiuti(TETTO_CRUCIVERBA, sette, aiuti))
  })

  it('nel sudoku dalle caselle vuote', () => {
    const dati = '5'.repeat(30) + '.'.repeat(51)
    expect(costiSudoku(dati)).toEqual(costiAiuti(TETTO_SUDOKU, 51))
    expect(puntiSudoku(NESSUN_AIUTO, costiSudoku(dati))).toBe(TETTO_SUDOKU)
  })
})

describe('svelare si paga per ogni casella svelata', () => {
  it('anche se era già giusta, una volta sola, e mai quelle già svelate', () => {
    // Una parola di cinque lettere, di cui due gia' svelate da una parola che la incrocia.
    expect(caselleDaPagare([10, 11, 12, 13, 14], [12, 40, 14])).toEqual([10, 11, 13])
    expect(caselleDaPagare([3, 3, 4], new Set<number>())).toEqual([3, 4])
    expect(caselleDaPagare([7], new Set([7]))).toEqual([])
  })

  it('svelare una parola costa sempre più che controllarla, anche se è tutta sbagliata', () => {
    const schemi = [
      ...LETTERE_CRUCIVERBA.map((n) => costiAiuti(TETTO_CRUCIVERBA, n)),
      ...CIFRE_SUDOKU.map((n) => costiAiuti(TETTO_SUDOKU, n)),
    ]
    for (const c of schemi) {
      for (let lettere = 1; lettere <= 9; lettere += 1) {
        expect(c.controllo + lettere * c.errore).toBeLessThan(lettere * c.svelata)
      }
    }
  })
})

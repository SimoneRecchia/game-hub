import { describe, expect, it } from 'vitest'
import { NESSUN_AIUTO, costiAiuti, type AiutiChiesti } from '../aiuti'
import { PUNTI_COMPLETO, punteggio as puntiCruciverba } from '../cruciverba'
import {
  MASSIMI,
  RIFERIMENTO_SCARABEO,
  TETTI,
  puntiQuiz,
  puntiScarabeo,
  puntiSudoku,
  puntiTris,
} from '../punti'
import { PARTITE_TRIS } from '../tris'
import { BASE_NOMI, CATEGORIE_PER_PARTITA, TEMPO_NOMI_MS, puntiNomi } from '../nomi-cose'
import { PUNTI_BASE_QUIZ } from '../quiz'
import { LUNGHEZZE_ANAGRAMMI, PUNTI_FINITA_ANAGRAMMI, TEMPO_PAROLA_MS, puntiAnagrammi } from '../anagrammi'
import { PUNTI_FINITA_SEQUENZE, SEQUENZE_PER_TURNO, TURNI_SEQUENZE, puntiSequenze } from '../sequenze'
import { ATTEMPT_POINTS, ATTEMPT_STEP, MAX_DAY_SCORE, MAX_TIEBREAK } from '../scoring'

/** Uno schema del cruciverba e uno del sudoku della misura di tutti i giorni: ottanta lettere, cinquanta cifre. */
const CRUCIVERBA = costiAiuti(PUNTI_COMPLETO, 80)
const SUDOKU = costiAiuti(TETTI.sudoku, 50)

const con = (aiuti: Partial<AiutiChiesti>): AiutiChiesti => ({ ...NESSUN_AIUTO, ...aiuti })

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

  it("sono nove classificate, e valgono ottocentoventicinque: un po' meno di cento a gioco", () => {
    expect(Object.keys(TETTI)).toHaveLength(9)
    expect(Object.values(TETTI).reduce((s, t) => s + t, 0)).toBe(825)
  })

  it('i tetti seguono il tempo che chiede ogni gioco, ma nessuno vale piu’ di tre volte un altro', () => {
    const ordine = ['cruciverba', 'scarabeo', 'sudoku', 'quiz', 'wordle', 'nomi', 'anagrammi', 'sequenze', 'tris'] as const
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

  it('nel cruciverba il completo senza aiuti vale il tetto', () => {
    expect(PUNTI_COMPLETO).toBe(TETTI.cruciverba)
    expect(puntiCruciverba(NESSUN_AIUTO, CRUCIVERBA)).toBe(TETTI.cruciverba)
  })

  it('nel sudoku il risolto senza aiuti vale il tetto, e gli aiuti seguono la stessa regola del cruciverba', () => {
    expect(puntiSudoku(NESSUN_AIUTO, SUDOKU)).toBe(TETTI.sudoku)
    expect(SUDOKU).toEqual(costiAiuti(TETTI.sudoku, 50))
  })

  it('nel quiz dieci risposte giuste su dieci valgono il tetto', () => {
    expect(puntiQuiz(10, 10)).toBe(TETTI.quiz)
    expect(puntiQuiz(12, 10)).toBe(TETTI.quiz)
    // Le partite libere possono avere un altro numero di domande: il tetto e' lo stesso.
    expect(puntiQuiz(15, 15)).toBe(TETTI.quiz)
  })

  it('negli Anagrammi le cinque parole trovate subito valgono il tetto', () => {
    const subito = LUNGHEZZE_ANAGRAMMI.map((lettere) => ({ lettere, trovata: true, ms: 1_000, aiuto: false }))
    expect(puntiAnagrammi(subito)).toBe(TETTI.anagrammi)
  })

  it('nelle Sequenze arrivare a nove in tutti e cinque i turni vale il tetto', () => {
    expect(puntiSequenze(Array(TURNI_SEQUENZE).fill(SEQUENZE_PER_TURNO))).toBe(TETTI.sequenze)
    // Oltre i nove cubetti un turno non va: il tetto resta quello.
    expect(puntiSequenze(Array(TURNI_SEQUENZE).fill(SEQUENZE_PER_TURNO + 3))).toBe(TETTI.sequenze)
  })

  it('nel tris la serie perfetta vale il tetto', () => {
    expect(puntiTris(PARTITE_TRIS, 0)).toBe(TETTI.tris)
  })

  it('in Nomi, cose e città cinque risposte che non ha dato nessun altro, consegnate subito, valgono il tetto', () => {
    const rare = Array.from({ length: CATEGORIE_PER_PARTITA }, () => ({ scritta: true, uguali: 1 }))
    expect(puntiNomi(rare, 1000, 0)).toBe(TETTI.nomi)
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

  it('nel cruciverba un aiuto si sente ma non decide la giornata, e un sesto svelato ne vale la metà', () => {
    expect(puntiCruciverba(con({ svelate: 1 }), CRUCIVERBA)).toBe(TETTI.cruciverba - CRUCIVERBA.svelata)
    // Una lettera svelata e una parola controllata: meno del novanta per cento, piu' dell'ottanta.
    const qualcuno = puntiCruciverba(con({ svelate: 1, controlli: 1, errori: 1 }), CRUCIVERBA)
    expect(qualcuno).toBeLessThan(0.95 * TETTI.cruciverba)
    expect(qualcuno).toBeGreaterThan(0.9 * TETTI.cruciverba)
    expect(puntiCruciverba(con({ svelate: 13 }), CRUCIVERBA)).toBeGreaterThan(TETTI.cruciverba / 2)
    expect(puntiCruciverba(con({ svelate: 14 }), CRUCIVERBA)).toBeLessThan(TETTI.cruciverba / 2)
    expect(puntiCruciverba(con({ svelate: 80 }), CRUCIVERBA)).toBe(0)
  })

  it('nel sudoku lo stesso: un aiuto si sente, e svelarlo tutto vale zero', () => {
    expect(puntiSudoku(con({ svelate: 1 }), SUDOKU)).toBe(TETTI.sudoku - SUDOKU.svelata)
    expect(puntiSudoku(con({ controlli: 1, errori: 1 }), SUDOKU)).toBe(TETTI.sudoku - SUDOKU.controllo - SUDOKU.errore)
    // Due cifre svelate e due controlli con un errore: sotto il novanta per cento, sopra il settantacinque.
    const qualcuno = puntiSudoku(con({ svelate: 2, controlli: 2, errori: 1 }), SUDOKU)
    expect(qualcuno).toBeLessThan(0.9 * TETTI.sudoku)
    expect(qualcuno).toBeGreaterThan(0.75 * TETTI.sudoku)
    expect(puntiSudoku(con({ svelate: 8 }), SUDOKU)).toBeGreaterThan(TETTI.sudoku / 2)
    expect(puntiSudoku(con({ svelate: 50 }), SUDOKU)).toBe(0)
  })

  it('nel tris una serie storta vale piu’ della meta’ di una perfetta, e finirla vale sempre qualcosa', () => {
    expect(puntiTris(1, 2) / puntiTris(PARTITE_TRIS, 0)).toBeGreaterThan(0.5)
    expect(puntiTris(0, 0)).toBeGreaterThan(0)
    // Una vittoria vale due patte: la patta e' il risultato di chi gioca bene contro chi gioca bene.
    expect(puntiTris(1, 0) - puntiTris(0, 0)).toBe(2 * (puntiTris(0, 1) - puntiTris(0, 0)))
  })

  it('in Nomi, cose e città una partita normale vale piu’ della meta’ del tetto, e scrivere vale qualcosa', () => {
    // Quattro risposte valide su cinque, date da un giocatore su cinque, in due minuti: una partita normale.
    const normali = [1, 2, 3, 4].map(() => ({ scritta: true, uguali: 200 }))
    const normale = puntiNomi([...normali, { scritta: true, uguali: null }], 1000, (TEMPO_NOMI_MS * 2) / 3)
    expect(normale / TETTI.nomi).toBeGreaterThan(0.5)
    expect(normale / TETTI.nomi).toBeLessThan(0.8)
    // Una sola risposta, sbagliata: si e' giocato, e vale la base.
    expect(puntiNomi([{ scritta: true, uguali: null }], 1000, TEMPO_NOMI_MS)).toBe(BASE_NOMI)
    expect(puntiNomi([{ scritta: false, uguali: null }], 1000, 0)).toBe(0)
  })

  it('negli Anagrammi trovarle tutte allo scadere vale la metà, e giocare vale qualcosa', () => {
    const tardi = LUNGHEZZE_ANAGRAMMI.map((lettere) => ({ lettere, trovata: true, ms: TEMPO_PAROLA_MS, aiuto: false }))
    expect(puntiAnagrammi(tardi) / TETTI.anagrammi).toBe(0.5)
    // Tre su cinque, a meta' del tempo: una giornata normale, fra la meta' e i tre quarti.
    const normale = puntiAnagrammi(tardi.slice(0, 3).map((p) => ({ ...p, ms: TEMPO_PAROLA_MS / 2 })))
    expect(normale / TETTI.anagrammi).toBeGreaterThan(0.4)
    expect(normale / TETTI.anagrammi).toBeLessThan(0.75)
    expect(puntiAnagrammi([])).toBe(PUNTI_FINITA_ANAGRAMMI)
  })

  it('nelle Sequenze chi si ferma a quattro vale la metà di chi arriva a nove, e la media sta in mezzo', () => {
    // La sequenza piu' lunga ripetuta: quattro cubetti sono due sequenze giuste per turno, nove sono sette.
    const quattro = puntiSequenze(Array(TURNI_SEQUENZE).fill(2))
    expect(quattro / TETTI.sequenze).toBe(0.5)
    // Cinque o sei, la media degli adulti al test di Corsi: fra il sessanta e il settanta per cento.
    const media = puntiSequenze([3, 4, 3, 4, 3])
    expect(media / TETTI.sequenze).toBeGreaterThan(0.6)
    expect(media / TETTI.sequenze).toBeLessThan(0.7)
    expect(puntiSequenze(Array(TURNI_SEQUENZE).fill(0))).toBe(PUNTI_FINITA_SEQUENZE)
    // Ogni sequenza giusta conta, e conta uguale.
    expect(puntiSequenze([1, 0, 0, 0, 0]) - puntiSequenze([0, 0, 0, 0, 0])).toBe(1)
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

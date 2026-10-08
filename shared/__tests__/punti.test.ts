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
} from '../punti'
import { BASE_NOMI, CATEGORIE_PER_PARTITA, TEMPO_NOMI_MS, puntiNomi } from '../nomi-cose'
import { PUNTI_BASE_QUIZ } from '../quiz'
import { LUNGHEZZE_ANAGRAMMI, PUNTI_FINITA_ANAGRAMMI, TEMPO_PAROLA_MS, puntiAnagrammi } from '../anagrammi'
import { PUNTI_FINITA_SEQUENZE, PUNTI_SEQUENZA, SEQUENZE_PER_TURNO, TURNI_SEQUENZE, puntiSequenze } from '../sequenze'
import { COPPIE_GHIGLIOTTINA, montepremi, puntiGhigliottina } from '../ghigliottina'
import { PUNTI_GIOCATA_PAROLIERE, puntiParoliere } from '../paroliere'
import { inizio as inizioCatena, montepremiCatena, puntiCatena } from '../catena'
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

  it('sono undici classificate, e valgono cento ciascuna: nessuna pesa piu’ di un’altra nella generale', () => {
    expect(Object.keys(TETTI)).toHaveLength(11)
    for (const [gioco, tetto] of Object.entries(TETTI)) expect(tetto, gioco).toBe(100)
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

  it('nella Ghigliottina cinque scelte giuste e la parola vincente valgono il tetto', () => {
    expect(puntiGhigliottina(0, true)).toBe(TETTI.ghigliottina)
  })

  it('nella Catena le cinque parole senza errori, e la finale, valgono il tetto', () => {
    expect(puntiCatena(inizioCatena(), true)).toBe(TETTI.catena)
  })

  it('nel Paroliere arrivare al traguardo vale il tetto, e oltre non si va', () => {
    expect(puntiParoliere(40, 40)).toBe(TETTI.paroliere)
    expect(puntiParoliere(120, 40)).toBe(TETTI.paroliere)
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
    expect(puntiCruciverba(con({ svelate: 12 }), CRUCIVERBA)).toBeGreaterThan(TETTI.cruciverba / 2)
    expect(puntiCruciverba(con({ svelate: 14 }), CRUCIVERBA)).toBeLessThan(TETTI.cruciverba / 2)
    // Svelato un terzo dello schema, la giornata vale zero.
    expect(puntiCruciverba(con({ svelate: 27 }), CRUCIVERBA)).toBe(0)
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
    expect(puntiSequenze([1, 0, 0, 0, 0]) - puntiSequenze([0, 0, 0, 0, 0])).toBe(PUNTI_SEQUENZA)
  })

  it('nel quiz una partita storta vale circa la metà di una perfetta, e finirla vale sempre qualcosa', () => {
    const storta = puntiQuiz(3, 10)
    expect(storta / puntiQuiz(10, 10)).toBeGreaterThan(0.4)
    expect(storta / puntiQuiz(10, 10)).toBeLessThan(0.5)
    expect(puntiQuiz(0, 10)).toBe(PUNTI_BASE_QUIZ)
    // Ogni risposta giusta conta, e conta uguale.
    for (let g = 0; g < 10; g += 1) expect(puntiQuiz(g + 1, 10) - puntiQuiz(g, 10)).toBe(8)
  })

  it('nel Paroliere metà del traguardo vale quasi i due terzi, e aver giocato vale sempre qualcosa', () => {
    expect(puntiParoliere(20, 40) / TETTI.paroliere).toBeGreaterThan(0.6)
    expect(puntiParoliere(20, 40) / TETTI.paroliere).toBeLessThan(0.65)
    expect(puntiParoliere(0, 40)).toBe(PUNTI_GIOCATA_PAROLIERE)
  })
})

/**
 * La Ghigliottina e' l'eccezione, di proposito: si gioca come alla
 * televisione. Ogni scelta sbagliata dimezza il montepremi, e una parola
 * vincente sbagliata non vale niente.
 */
describe('la Ghigliottina si gioca come in televisione', () => {
  it('ogni scelta sbagliata dimezza il montepremi, per difetto', () => {
    expect(Array.from({ length: COPPIE_GHIGLIOTTINA + 1 }, (_, k) => montepremi(k))).toEqual([100, 50, 25, 12, 6, 3])
  })

  it('una parola vincente sbagliata non vale niente, ma chi ha sbagliato tutte le scelte può ancora vincere', () => {
    for (let k = 0; k <= COPPIE_GHIGLIOTTINA; k += 1) expect(puntiGhigliottina(k, false)).toBe(0)
    expect(puntiGhigliottina(COPPIE_GHIGLIOTTINA, true)).toBe(3)
  })
})

/** La Catena si gioca come la Ghigliottina: ogni errore dimezza, e la parola finale sbagliata azzera. */
describe('la Catena si gioca come in televisione', () => {
  it('ogni errore o acquisto dimezza il montepremi, che non scende sotto un punto', () => {
    expect(Array.from({ length: 10 }, (_, k) => montepremiCatena(k))).toEqual([100, 50, 25, 12, 6, 3, 1, 1, 1, 1])
  })

  it('una parola finale sbagliata non vale niente', () => {
    expect(puntiCatena(inizioCatena(), false)).toBe(0)
  })
})

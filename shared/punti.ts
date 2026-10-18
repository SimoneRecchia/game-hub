/**
 * I punti in classifica di tutti i giochi, in un posto solo.
 *
 * La regola comune: **ogni classificata vale cento** (`TETTI`), e la classifica
 * generale e' la somma. Per un periodo ogni gioco aveva il suo tetto, che
 * seguiva il tempo che chiede una giornata — centosessanta il cruciverba,
 * cinquanta il tris — e in pratica un gioco lungo valeva tre volte uno corto:
 * in alcuni si guadagnava troppo, in altri troppo poco. Adesso una giornata
 * giocata bene vale lo stesso in tutti, e chi gioca solo ai giochi brevi resta
 * in gara con chi fa anche il cruciverba.
 *
 *   gioco        tempo di chi gioca bene   tetto
 *   Cruciverba   5-10 minuti                100
 *   Scarabeo     4-6 minuti                 100
 *   Sudoku       4-10 minuti                100
 *   Quiz         3-4 minuti                 100
 *   Wordle       3-5 minuti                 100
 *   Ghigliottina 2-3 minuti                 100
 *   Catena       3-4 minuti                 100
 *   Nomi, cose   3 minuti                   100
 *   Paroliere    3 minuti                   100
 *   Anagrammi    2-4 minuti                 100
 *
 * Sono dieci, e fanno mille. Il tris ne e' uscito l'8 ottobre 2026, come la
 * battaglia navale due giorni prima: contro il computer del giorno la serie
 * non era una partita uguale per tutti, e ora e' solo una libera. Le Sequenze
 * il 15 ottobre: restano la libera e la sfida.
 *
 * Dentro i cento ogni gioco misura quel che gli e' proprio, e tutti tengono lo
 * stesso principio del Wordle: **giocarla bene vale circa il doppio di
 * giocarla male**, non dieci volte tanto. Una giornata storta si recupera.
 *
 *   gioco        cosa misura                          tipico    pessimo   perfetto
 *   Wordle       i tentativi                           70-90     20*       100 (+4)
 *   Scarabeo     punti rispetto al computer            60-90    ~40        100
 *   Cruciverba   il tempo, meno gli aiuti              75-95    50*       100
 *   Sudoku       il tempo, meno gli aiuti              75-95    50*       100
 *   Quiz         risposte giuste su dieci              60-92     20        100
 *   Nomi, cose   risposte valide, rare e veloci        60-75     25        100
 *   Anagrammi    parole trovate, e quanto presto       65-85     20        100
 *   Paroliere    i punti delle parole, al traguardo    60-85     25        100
 *   Ghigliottina il montepremi, se si indovina         70-90     20*       100
 *   Catena       il montepremi, se si indovina         68-84     20*       100
 *
 *   * la parola non indovinata vale venti, la peggiore indovinata cinquanta
 *     (nella Catena trentasei, e venti con il terzo elemento, che dimezza); un
 *     cruciverba o un sudoku svelato per intero non e' stato risolto: vale
 *     zero. Ogni casella svelata toglie la sua parte, e svelarne un sesto
 *     lascia la meta' dei punti (vedi shared/aiuti.ts).
 *
 * Gli errori costano lo stesso dappertutto: un tentativo del Wordle dieci
 * punti, una scelta sbagliata della Ghigliottina dieci, il primo errore su una
 * parola della Catena dieci e il secondo, quello che la mostra, sei. La
 * Ghigliottina e la Catena erano l'eccezione, come alla televisione, dove ogni
 * errore dimezza il montepremi e una parola finale sbagliata lo azzera: due
 * errori lasciavano un quarto, e una giornata storta non valeva piu' niente.
 * Della televisione resta il terzo elemento della Catena, che dimezza.
 *
 * I pochi punti oltre il tetto del Wordle sono i bonus di velocità e costanza,
 * che servono da spareggio e restano sotto il gradino di un tentativo.
 *
 * Una giornata vale quel che valeva quando la si e' giocata: i tetti si
 * cambiano per i giorni da giocare, e i punti salvati non si riscrivono.
 */

import { MAX_DAY_SCORE } from './scoring'
import { PUNTI_COMPLETO } from './cruciverba'
import { DOMANDE_PER_PARTITA, puntiQuiz } from './quiz'
import { PUNTI_COMPLETO as PUNTI_SUDOKU } from './sudoku'
import { MASSIMO_NOMI } from './nomi-cose'
import { MASSIMO_ANAGRAMMI } from './anagrammi'
import { MASSIMO_GHIGLIOTTINA } from './ghigliottina'
import { MASSIMO_PAROLIERE } from './paroliere'
import { MASSIMO_CATENA } from './catena'
import type { GiocoClassificato } from './types'

export { punteggio as puntiCruciverba } from './cruciverba'
export { puntiQuiz } from './quiz'
export { puntiSudoku } from './sudoku'
export { puntiAnagrammi } from './anagrammi'
export { puntiGhigliottina } from './ghigliottina'
export { puntiParoliere } from './paroliere'
export { puntiCatena } from './catena'

/** Il tetto di ogni classificata: quanto vale una giornata perfetta, cento per tutte. Un test lo confronta con le formule. */
export const TETTI: Record<GiocoClassificato, number> = {
  cruciverba: 100,
  scarabeo: 100,
  sudoku: 100,
  quiz: 100,
  wordle: 100,
  nomi: 100,
  anagrammi: 100,
  ghigliottina: 100,
  paroliere: 100,
  catena: 100,
}

/* ─────────────────────────────  Scarabeo  ─────────────────────────── */

/**
 * Il riferimento di ripiego, se lo script della notte non ha scritto quello del
 * giorno: la media del traguardo su quaranta giornate a leggii gemelli, cinque
 * mosse a testa con le parole note (vedi shared/scarabeo-gemelli.ts), da 91 a
 * 169. Con le dieci mosse dal sacchetto era 245. Non dovrebbe servire mai.
 */
export const RIFERIMENTO_SCARABEO = 119

/**
 * I punti in classifica di una giornata di Scarabeo: il punteggio fatto sul
 * tabellone in rapporto a quello del computer, con le stesse tessere.
 *
 * Il computer e' il normale, che gioca bene ma non conosce tutto il
 * dizionario: pareggiarlo vale il tetto, e oltre non si va. Il rapporto con il
 * computer invece di una scala fissa ha un vantaggio che una scala non puo'
 * avere: tiene conto della fortuna del sacchetto. In una giornata di Q, Z e H
 * fa meno punti anche il computer, e fare poco vale di piu'.
 */
export function puntiScarabeo(punteggio: number, riferimento: number): number {
  if (punteggio <= 0) return 0
  const base = riferimento > 0 ? riferimento : RIFERIMENTO_SCARABEO
  return Math.min(TETTI.scarabeo, Math.round((TETTI.scarabeo * punteggio) / base))
}

/* ─────────────────────────  I tetti, per i test  ─────────────────── */

export const MASSIMI: Record<GiocoClassificato, number> = {
  wordle: MAX_DAY_SCORE,
  cruciverba: PUNTI_COMPLETO,
  sudoku: PUNTI_SUDOKU,
  scarabeo: puntiScarabeo(RIFERIMENTO_SCARABEO, RIFERIMENTO_SCARABEO),
  quiz: puntiQuiz(DOMANDE_PER_PARTITA, DOMANDE_PER_PARTITA),
  nomi: MASSIMO_NOMI,
  anagrammi: MASSIMO_ANAGRAMMI,
  ghigliottina: MASSIMO_GHIGLIOTTINA,
  paroliere: MASSIMO_PAROLIERE,
  catena: MASSIMO_CATENA,
}

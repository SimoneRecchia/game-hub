/**
 * I punti in classifica di tutti i giochi, in un posto solo.
 *
 * La regola comune: **ogni classificata ha il suo tetto** (`TETTI`), e la
 * classifica generale e' la somma. Il tetto segue il tempo che una giornata
 * chiede a chi la gioca bene: una partita perfetta a tris non e' una partita
 * perfetta a sudoku. Non in proporzione diretta, pero': un cruciverba chiede
 * dieci volte il tempo del tris e vale tre volte tanto, cosi' nessun gioco da
 * solo decide la generale, e chi ha poco tempo con i giochi brevi resta in
 * gara.
 *
 *   gioco        tempo di chi gioca bene   tetto
 *   Cruciverba   15-25 minuti               160
 *   Scarabeo     10-20 minuti               150
 *   Sudoku       10-20 minuti               150
 *   Quiz         3-4 minuti                  75
 *   Wordle       3-5 minuti                  70
 *   Nomi, cose   2-3 minuti                  60
 *   Anagrammi    2-4 minuti                  60
 *   Sequenze     3-5 minuti                  50
 *   Tris         2-3 minuti                  50
 *
 * Sono nove, e la somma e' ottocentoventicinque: un po' meno di cento a
 * gioco. Gli Anagrammi valgono quanto Nomi, cose e città, che chiede lo stesso
 * tempo; le Sequenze, arrivate per ultime, quanto il tris: cinque turni brevi,
 * e il tempo se ne va a guardare i lampi.
 * Erano otto, e facevano ottocento, finché la battaglia navale ha avuto la sua
 * classificata (85, i colpi per affondare la flotta del giorno): era piu'
 * fortuna che bravura, e il 6 ottobre 2026 e' diventata solo una libera. Gli
 * altri tetti sono rimasti quelli, perché i giorni nuovi valgano come i vecchi.
 *
 * Dentro il suo tetto ogni gioco misura quel che gli e' proprio, e tutti
 * tengono lo stesso principio del Wordle: **giocarla bene vale circa il doppio
 * di giocarla male**, non dieci volte tanto. Una giornata storta si recupera.
 *
 *   gioco        cosa misura                          tipico    pessimo   perfetto
 *   Wordle       i tentativi                           49-63     14*       70 (+4)
 *   Scarabeo     punti rispetto al computer           90-135    ~60       150
 *   Cruciverba   completato, meno gli aiuti           150-158    0*       160
 *   Sudoku       risolto, meno gli aiuti              140-150    0*       150
 *   Quiz         risposte giuste su dieci              45-69     15        75
 *   Nomi, cose   risposte valide, rare e veloci        35-45     15        60
 *   Tris         vinte e patte su cinque partite       30-40     10        50
 *   Anagrammi    parole trovate, e quanto presto       40-50     10        60
 *   Sequenze     sequenze ripetute giuste in 5 turni   30-35     15        50
 *
 *   * la parola non indovinata vale quattordici, la peggiore indovinata
 *     trentacinque; un cruciverba o un sudoku svelato per intero non e' stato
 *     risolto: vale zero. Ogni casella svelata toglie la sua parte, e svelarne
 *     un quarto lascia tre quarti dei punti (vedi shared/aiuti.ts).
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
import { PARTITE_TRIS, puntiTris } from './tris'
import { MASSIMO_NOMI } from './nomi-cose'
import { MASSIMO_ANAGRAMMI } from './anagrammi'
import { MASSIMO_SEQUENZE } from './sequenze'
import type { GiocoClassificato } from './types'

export { punteggio as puntiCruciverba } from './cruciverba'
export { puntiQuiz } from './quiz'
export { puntiSudoku } from './sudoku'
export { puntiTris } from './tris'
export { puntiAnagrammi } from './anagrammi'
export { puntiSequenze } from './sequenze'

/** Il tetto di ogni classificata: quanto vale una giornata perfetta. Un test lo confronta con le formule. */
export const TETTI: Record<GiocoClassificato, number> = {
  cruciverba: 160,
  scarabeo: 150,
  sudoku: 150,
  quiz: 75,
  wordle: 70,
  tris: 50,
  nomi: 60,
  anagrammi: 60,
  sequenze: 50,
}

/* ─────────────────────────────  Scarabeo  ─────────────────────────── */

/**
 * Il riferimento di ripiego, se lo script della notte non ha scritto quello del
 * giorno: la media del computer normale su sessanta sacchetti (vedi
 * shared/scarabeo-motore.ts). Non dovrebbe servire mai.
 */
export const RIFERIMENTO_SCARABEO = 245

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
  tris: puntiTris(PARTITE_TRIS, 0),
  nomi: MASSIMO_NOMI,
  anagrammi: MASSIMO_ANAGRAMMI,
  sequenze: MASSIMO_SEQUENZE,
}

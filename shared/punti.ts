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
 *   Battaglia    5-8 minuti                  85
 *   Quiz         3-4 minuti                  75
 *   Wordle       3-5 minuti                  70
 *   Tris         2-3 minuti                  50
 *
 * Dentro il suo tetto ogni gioco misura quel che gli e' proprio, e tutti
 * tengono lo stesso principio del Wordle: **giocarla bene vale circa il doppio
 * di giocarla male**, non dieci volte tanto. Una giornata storta si recupera.
 *
 *   gioco        cosa misura                          tipico    pessimo   perfetto
 *   Wordle       i tentativi                           49-63     14*       70 (+4)
 *   Scarabeo     punti rispetto al computer           90-135    ~60       150
 *   Cruciverba   completato, meno gli aiuti           135-150    0*       160
 *   Sudoku       risolto, meno gli aiuti              135-150    0*       150
 *   Battaglia    colpi per affondare la flotta         64-72    ~25        85
 *   Quiz         risposte giuste su dieci              45-69     15        75
 *   Tris         vinte e patte su cinque partite       30-40     10        50
 *
 *   * la parola non indovinata vale quattordici, la peggiore indovinata
 *     trentacinque; un cruciverba o un sudoku svelato per intero non e' stato
 *     risolto: vale zero.
 *
 * I pochi punti oltre il tetto del Wordle sono i bonus di velocità e costanza,
 * che servono da spareggio e restano sotto il gradino di un tentativo.
 *
 * Una giornata vale quel che valeva quando la si e' giocata: i tetti si
 * cambiano per i giorni da giocare, e i punti salvati non si riscrivono.
 */

import { MAX_DAY_SCORE } from './scoring'
import { PUNTI_COMPLETO } from './cruciverba'
import { CASELLE_FLOTTA } from './battaglia'
import { DOMANDE_PER_PARTITA, puntiQuiz } from './quiz'
import { puntiSudoku } from './sudoku'
import { PARTITE_TRIS, puntiTris } from './tris'
import type { GiocoClassificato } from './types'

export { punteggio as puntiCruciverba } from './cruciverba'
export { puntiQuiz } from './quiz'
export { puntiSudoku } from './sudoku'
export { puntiTris } from './tris'

/** Il tetto di ogni classificata: quanto vale una giornata perfetta. Un test lo confronta con le formule. */
export const TETTI: Record<GiocoClassificato, number> = {
  cruciverba: 160,
  scarabeo: 150,
  sudoku: 150,
  battaglia: 85,
  quiz: 75,
  wordle: 70,
  tris: 50,
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

/* ─────────────────────────────  Battaglia  ────────────────────────── */

/** Un colpo in acqua costa mezzo punto: si conta a coppie. */
export const ACQUE_PER_PUNTO = 2
/** Ogni casella nemica colpita, in una partita persa. */
export const PUNTI_PER_COLPITA = 2

/**
 * I punti della battaglia classificata.
 *
 * Vincendo, il tetto meno un punto ogni due colpi in acqua: la flotta del
 * computer e' la stessa per tutti, quindi i colpi che servono ad affondarla sono
 * una misura esatta di come si e' giocato. Una partita da cinquanta colpi —
 * quanti ne servono a chi gioca bene — vale 69.
 *
 * Perdendo, due punti per ogni casella nemica colpita: al massimo 32, sotto la
 * vittoria peggiore possibile (44, con cento colpi). Vincere resta sempre meglio
 * che perdere, ma chi ha quasi affondato tutto non esce a mani vuote.
 */
export function puntiBattaglia({
  vinta,
  colpi,
  aSegno,
}: {
  vinta: boolean
  colpi: number
  aSegno: number
}): number {
  if (!vinta) return Math.min(aSegno, CASELLE_FLOTTA - 1) * PUNTI_PER_COLPITA
  const acque = Math.max(0, colpi - CASELLE_FLOTTA)
  return TETTI.battaglia - Math.floor(acque / ACQUE_PER_PUNTO)
}

/* ─────────────────────────  I tetti, per i test  ─────────────────── */

export const MASSIMI: Record<GiocoClassificato, number> = {
  wordle: MAX_DAY_SCORE,
  cruciverba: PUNTI_COMPLETO,
  sudoku: puntiSudoku(0, 0),
  scarabeo: puntiScarabeo(RIFERIMENTO_SCARABEO, RIFERIMENTO_SCARABEO),
  battaglia: puntiBattaglia({ vinta: true, colpi: CASELLE_FLOTTA, aSegno: CASELLE_FLOTTA }),
  quiz: puntiQuiz(DOMANDE_PER_PARTITA, DOMANDE_PER_PARTITA),
  tris: puntiTris(PARTITE_TRIS, 0),
}

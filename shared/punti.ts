/**
 * I punti in classifica di tutti i giochi, in un posto solo.
 *
 * La regola comune: **una partita classificata vale al massimo cento punti**,
 * qualunque sia il gioco. E' quel che rende confrontabili i giochi fra loro e
 * possibile la classifica generale, che e' la loro somma: una giornata di un
 * gioco non deve valere il doppio di quella di un altro solo perché ha piu'
 * mosse o piu' caselle.
 *
 * Dentro quel tetto, ogni gioco misura quel che gli e' proprio, e tutti tengono
 * lo stesso principio del Wordle: **giocarla bene vale circa il doppio di
 * giocarla male**, non dieci volte tanto. Una giornata storta si recupera.
 *
 *   gioco        cosa misura                          tipico   pessimo   perfetto
 *   Wordle       i tentativi                           70-90    20*       100 (+4)
 *   Scarabeo     punti rispetto al computer           60-90    ~40       100
 *   Cruciverba   completato, meno gli aiuti            85-95    0*        100
 *   Sudoku       risolto, meno gli aiuti               90-100   0*        100
 *   Battaglia    colpi per affondare la flotta         75-85    ~30       100
 *   Quiz         risposte giuste su dieci              60-90    20        100
 *
 *   * la parola non indovinata vale venti, la peggiore indovinata cinquanta;
 *     un cruciverba o un sudoku svelato per intero non e' stato risolto: vale zero.
 *
 * I pochi punti oltre il cento del Wordle sono i bonus di velocità e costanza,
 * che servono da spareggio e restano sotto il gradino di un tentativo.
 */

import { MAX_DAY_SCORE } from './scoring'
import { PUNTI_COMPLETO } from './cruciverba'
import { CASELLE_FLOTTA } from './battaglia'
import { DOMANDE_PER_PARTITA, puntiQuiz } from './quiz'
import { puntiSudoku } from './sudoku'

export { punteggio as puntiCruciverba } from './cruciverba'
export { puntiQuiz } from './quiz'
export { puntiSudoku } from './sudoku'

/** Il tetto di una partita classificata, per tutti i giochi. */
export const PUNTI_MASSIMI = 100

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
 * dizionario: pareggiarlo vale cento, e oltre non si va. Il rapporto con il
 * computer invece di una scala fissa ha un vantaggio che una scala non puo'
 * avere: tiene conto della fortuna del sacchetto. In una giornata di Q, Z e H
 * fa meno punti anche il computer, e fare poco vale di piu'.
 */
export function puntiScarabeo(punteggio: number, riferimento: number): number {
  if (punteggio <= 0) return 0
  const base = riferimento > 0 ? riferimento : RIFERIMENTO_SCARABEO
  return Math.min(PUNTI_MASSIMI, Math.round((PUNTI_MASSIMI * punteggio) / base))
}

/* ─────────────────────────────  Battaglia  ────────────────────────── */

/** Un colpo in acqua costa mezzo punto: si conta a coppie. */
export const ACQUE_PER_PUNTO = 2
/** Ogni casella nemica colpita, in una partita persa. */
export const PUNTI_PER_COLPITA = 3

/**
 * I punti della battaglia classificata.
 *
 * Vincendo, cento meno un punto ogni due colpi in acqua: la flotta del computer
 * e' la stessa per tutti, quindi i colpi che servono ad affondarla sono una
 * misura esatta di come si e' giocato. Una partita da cinquanta colpi — quanti
 * ne servono a chi gioca bene — vale 84.
 *
 * Perdendo, tre punti per ogni casella nemica colpita: al massimo 48, sotto la
 * vittoria peggiore possibile (59, con cento colpi). Vincere resta sempre meglio
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
  return PUNTI_MASSIMI - Math.floor(acque / ACQUE_PER_PUNTO)
}

/* ─────────────────────────  I tetti, per i test  ─────────────────── */

export const MASSIMI = {
  wordle: MAX_DAY_SCORE,
  cruciverba: PUNTI_COMPLETO,
  sudoku: puntiSudoku(0, 0),
  scarabeo: PUNTI_MASSIMI,
  battaglia: PUNTI_MASSIMI,
  quiz: puntiQuiz(DOMANDE_PER_PARTITA, DOMANDE_PER_PARTITA),
} as const

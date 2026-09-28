import type { LivelloSudoku } from '@shared/sudoku'
import type { Editor } from './useEditor'

/** Quanto costano gli aiuti: nella classificata tolgono punti, nella libera niente. */
export interface Aiuti {
  costoErrore: number
  costoSvelata: number
}

/**
 * Un sudoku in corso, visto dalla schermata: la stessa per la classificata e
 * per la libera, che cambiano solo in chi sa la soluzione — il server o il
 * telefono — e in cosa costano gli aiuti.
 */
export interface SudokuInCorso {
  editor: Editor
  dati: string | null
  livello: LivelloSudoku | null
  svelate: ReadonlySet<number>
  segnalate: ReadonlySet<number>
  /** La soluzione, solo a partita finita. */
  soluzione: string | null
  tempoMs: number
  /** I punti che varrebbe finirlo adesso: null nella libera. */
  punti: number | null
  finita: boolean
  messaggio: string | null
  inviando: boolean
  /** L'esito dell'ultimo controllo, per l'adesivo: quante cifre erano sbagliate. */
  ultimoControllo: { id: number; ambito: 'casella' | 'tutto'; errate: number } | null
  aiuti: Aiuti | null
  controlla: (ambito: 'casella' | 'tutto') => void
  svela: () => void
}

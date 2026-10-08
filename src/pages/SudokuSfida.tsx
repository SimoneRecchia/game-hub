import { ComeSiGiocaSudoku } from '@/games/sudoku/ComeSiGioca'
import { PartitaSfidaSudoku } from '@/games/sudoku/Sfida'
import { PaginaSfida } from '@/games/sfide/PaginaSfida'

/** Una sfida con un amico al sudoku: la stessa partita, dal via, ognuno sul suo telefono. */
export default function SudokuSfida() {
  return <PaginaSfida gioco="sudoku" Partita={PartitaSfidaSudoku} Regole={ComeSiGiocaSudoku} />
}

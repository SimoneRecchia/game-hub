import { useState } from 'react'
import { Collegamento } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Button } from '@/components/Button'
import { IconInfo, IconShuffle, IconTrophy } from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { ComeSiGiocaSudoku } from '@/games/sudoku/ComeSiGioca'
import { FineSudoku } from '@/games/sudoku/Fine'
import { PartitaSudoku } from '@/games/sudoku/PartitaSudoku'
import { useSudoku } from '@/games/sudoku/useSudoku'
import { useCountdown } from '@/games/wordle/useCountdown'
import { formatCountdown, formatCronometro, pluralize } from '@/lib/format'
import type { SudokuState } from '@shared/types'

/**
 * Il sudoku del giorno: lo stesso schema per tutti, e la soluzione sul server
 * finché non e' risolto. La schermata e' quella della libera (PartitaSudoku);
 * qui cambiano chi sa la soluzione e quanto costano gli aiuti.
 */
export default function Sudoku() {
  const g = useSudoku()
  const [regole, setRegole] = useState(false)
  const stato = g.stato

  return (
    <Pagina
      titolo={stato ? `Sudoku #${stato.puzzleNumber}` : 'Sudoku'}
      intera
      indietro={{ a: ROTTE.gioco('sudoku'), etichetta: 'Sudoku' }}
      azioni={
        <BottoneBarra etichetta="Come si gioca" onClick={() => setRegole(true)}>
          <IconInfo size={21} />
        </BottoneBarra>
      }
    >
      {g.loadError ? (
        <div className="sud-ripiego">
          <p>{g.loadError}</p>
          <Button variant="tinted" onClick={() => void g.ricarica()}>
            Riprova
          </Button>
        </div>
      ) : !stato ? (
        <div className="sud-attesa" aria-hidden="true">
          <div className="sud-attesa__griglia" />
        </div>
      ) : (
        <PartitaSudoku p={g} fine={<Fine stato={stato} />} dettaglioRisolto={`${g.punti} punti`} />
      )}
      <ComeSiGiocaSudoku open={regole} onClose={() => setRegole(false)} />
    </Pagina>
  )
}

/** Schema risolto: i punti, il tempo, cosa e' costato, e quando arriva il prossimo. */
function Fine({ stato }: { stato: SudokuState }) {
  const restano = useCountdown(stato.msToNextPuzzle)
  const svelate = stato.svelate.length
  const aiuti = [
    svelate > 0 && `${svelate} ${pluralize(svelate, 'cifra svelata', 'cifre svelate')}`,
    stato.errori > 0 && `${stato.errori} ${pluralize(stato.errori, 'errore segnalato', 'errori segnalati')}`,
  ].filter(Boolean)

  return (
    <FineSudoku
      titolo="Risolto"
      valore={`${stato.punti} punti`}
      dettaglio={`in ${formatCronometro(stato.tempoMs)} · ${aiuti.length > 0 ? aiuti.join(' · ') : 'senza aiuti'}`}
      azioni={
        <>
          <Collegamento to={ROTTE.classifica('sudoku')} className="sud-fine__link">
            <IconTrophy size={18} />
            Classifica
          </Collegamento>
          <Collegamento to={ROTTE.libera('sudoku')} className="sud-fine__link">
            <IconShuffle size={17} />
            Schema libero
          </Collegamento>
        </>
      }
      piede={
        <>
          Il prossimo fra <span className="u-tabnum">{formatCountdown(restano)}</span>
        </>
      }
    />
  )
}

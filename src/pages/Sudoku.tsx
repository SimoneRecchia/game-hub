import { useState } from 'react'
import { Collegamento, useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Button } from '@/components/Button'
import { IconInfo, IconShuffle, IconTrophy } from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { BottoneFine, CartaFine } from '@/games/cruciverba/CartaFine'
import { ComeSiGiocaSudoku } from '@/games/sudoku/ComeSiGioca'
import { FineSudoku } from '@/games/sudoku/Fine'
import { PartitaSudoku } from '@/games/sudoku/PartitaSudoku'
import { useSudoku } from '@/games/sudoku/useSudoku'
import { useCountdown } from '@/games/wordle/useCountdown'
import { formatCountdown, formatCronometro, pluralize } from '@/lib/format'
import { NOMI_LIVELLI, costiSudoku, puntiDelTempoSudoku } from '@shared/sudoku'
import type { SudokuState } from '@shared/types'

/** Il fondo chiaro della carta della fine del sudoku. */
export const FONDO_FINE_SUDOKU = 'linear-gradient(180deg, #f4edff, #ffe1ec)'

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
      titolo="Sudoku"
      intera
      indietro={{ a: ROTTE.home, etichetta: 'Giornaliere' }}
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
        <PartitaSudoku
          p={g}
          fine={<Fine stato={stato} />}
          dettaglioRisolto={`${g.punti} punti`}
          carta={(aperta, chiudi) => <Carta stato={stato} aperta={aperta} onChiudi={chiudi} />}
        />
      )}
      <ComeSiGiocaSudoku open={regole} onClose={() => setRegole(false)} costi={g.aiuti} />
    </Pagina>
  )
}

/** Gli aiuti di uno schema risolto, in parole: "2 cifre svelate · 1 controllo". */
function aiutiDi(stato: SudokuState): string[] {
  const svelate = stato.svelate.length
  const controlli = stato.controlli + stato.controlliSchema
  return [
    svelate > 0 && `${svelate} ${pluralize(svelate, 'cifra svelata', 'cifre svelate')}`,
    controlli > 0 && `${controlli} ${pluralize(controlli, 'controllo', 'controlli')}`,
    stato.errori > 0 && `${stato.errori} ${pluralize(stato.errori, 'errore segnalato', 'errori segnalati')}`,
  ].filter((a): a is string => Boolean(a))
}

/** La carta della fine, sopra lo schema appena risolto: il timbro con i punti, il tempo e gli aiuti. */
function Carta({ stato, aperta, onChiudi }: { stato: SudokuState; aperta: boolean; onChiudi: () => void }) {
  const { vai } = useNavigazione()
  const tempo = formatCronometro(stato.tempoMs)
  const delTempo = puntiDelTempoSudoku(stato.tempoMs, costiSudoku(stato.dati))
  const spesi = stato.spesi
  return (
    <CartaFine
      aperta={aperta}
      onChiudi={onChiudi}
      gioco="sudoku"
      colore="var(--sudoku-tinta)"
      fondo={FONDO_FINE_SUDOKU}
      titolo="Risolto!"
      testo={`${stato.livello ? `${NOMI_LIVELLI[stato.livello]} · ` : ''}in ${tempo} · ${
        aiutiDi(stato).length > 0 ? 'con gli aiuti' : 'senza aiuti'
      }`}
      timbro={`+${stato.punti}`}
      righe={[
        { nome: 'Il tempo', valore: `${tempo} · ${delTempo} punti` },
        { nome: 'Gli aiuti', valore: spesi > 0 ? `−${spesi}` : 'nessuno' },
      ]}
    >
      <BottoneFine onClick={() => vai(ROTTE.libera('sudoku'))}>Libero</BottoneFine>
      <BottoneFine tono="giallo" onClick={() => vai(ROTTE.home, { direzione: 'indietro' })}>
        Torna alle Giornaliere
      </BottoneFine>
    </CartaFine>
  )
}

/** Schema risolto, sotto la griglia: i punti, il tempo, cosa e' costato, e quando arriva il prossimo. */
function Fine({ stato }: { stato: SudokuState }) {
  const restano = useCountdown(stato.msToNextPuzzle)
  const aiuti = aiutiDi(stato)
  return (
    <FineSudoku
      titolo="Risolto"
      valore={`${stato.punti} punti`}
      timbro={stato.punti}
      dettaglio={`in ${formatCronometro(stato.tempoMs)} · ${aiuti.length > 0 ? aiuti.join(' · ') : 'senza aiuti'}`}
      azioni={
        <>
          <Collegamento to={ROTTE.classifica('sudoku')} className="sud-fine__link is-giallo">
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

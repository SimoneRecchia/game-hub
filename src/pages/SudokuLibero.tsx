import { useState } from 'react'
import { ROTTE } from '@/app/rotte'
import { Button } from '@/components/Button'
import { Elenco, Riga, Sezione, Tacche } from '@/components/Elementi'
import { IconFlag, IconInfo, IconRefresh } from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { Sheet } from '@/components/Sheet'
import { ComeSiGiocaSudoku } from '@/games/sudoku/ComeSiGioca'
import { FineSudoku } from '@/games/sudoku/Fine'
import { PartitaSudoku } from '@/games/sudoku/PartitaSudoku'
import { useSudokuLibero, type SudokuLiberoController } from '@/games/sudoku/useSudokuLibero'
import { formatCronometro } from '@/lib/format'
import { LIVELLI, NOMI_LIVELLI } from '@shared/sudoku'

/**
 * Il sudoku libero: si sceglie la difficoltà e lo schema si prepara nel
 * telefono. Uno schema in corso si riprende da solo; per cambiarlo lo si lascia.
 */
export default function SudokuLibero() {
  const g = useSudokuLibero()
  const [regole, setRegole] = useState(false)
  const [lascia, setLascia] = useState(false)
  const p = g.partita

  if (!p && !g.generando) {
    return (
      <Pagina
        key="scelta"
        titolo="Sudoku"
        indietro={{ a: ROTTE.salotto, etichetta: 'Salotto' }}
        azioni={
          <BottoneBarra etichetta="Come si gioca" onClick={() => setRegole(true)}>
            <IconInfo size={21} />
          </BottoneBarra>
        }
      >
        <SceltaLivello g={g} />
        <ComeSiGiocaSudoku open={regole} onClose={() => setRegole(false)} />
      </Pagina>
    )
  }

  return (
    <Pagina
      key="partita"
      titolo="Schema libero"
      intera
      indietro={{ a: ROTTE.salotto, etichetta: 'Salotto' }}
      azioni={
        <>
          <BottoneBarra etichetta="Come si gioca" onClick={() => setRegole(true)}>
            <IconInfo size={21} />
          </BottoneBarra>
          {p && !p.finita && !g.generando && (
            <BottoneBarra etichetta="Lascia lo schema" onClick={() => setLascia(true)}>
              <IconFlag size={19} />
            </BottoneBarra>
          )}
        </>
      }
    >
      {!p || g.generando ? (
        <div className="sud-attesa" aria-hidden="true">
          <div className="sud-attesa__griglia" />
        </div>
      ) : (
        <PartitaSudoku
          p={g.gioco}
          fine={<Fine g={g} />}
          dettaglioRisolto={g.record ? `Record: ${formatCronometro(p.tempoMs)}` : `In ${formatCronometro(p.tempoMs)}`}
        />
      )}

      <Sheet open={lascia} onClose={() => setLascia(false)} title="Lasciare lo schema?">
        <div className="sud-lascia">
          <Button
            size="lg"
            fullWidth
            variant="destructive"
            onClick={() => {
              setLascia(false)
              g.lascia()
            }}
          >
            Lascia
          </Button>
          <Button size="lg" fullWidth variant="plain" onClick={() => setLascia(false)}>
            Continua a giocare
          </Button>
        </div>
      </Sheet>
      <ComeSiGiocaSudoku open={regole} onClose={() => setRegole(false)} />
    </Pagina>
  )
}

/** Prima di cominciare: quattro livelli, con il record di ognuno. */
function SceltaLivello({ g }: { g: SudokuLiberoController }) {
  return (
    <Sezione titolo="Difficoltà">
      <Elenco>
        {LIVELLI.map((livello, i) => {
          const c = g.conti[livello]
          return (
            <Riga
              key={livello}
              icona={<Tacche piene={i + 1} di={4} colore="var(--sudoku-1)" />}
              titolo={NOMI_LIVELLI[livello]}
              valore={c.record !== null ? `Record ${formatCronometro(c.record)}` : undefined}
              onClick={() => g.nuova(livello)}
            />
          )
        })}
      </Elenco>
      {g.guasto && <p className="sud-guasto">{g.guasto}</p>}
    </Sezione>
  )
}

/** Sotto la griglia, a schema risolto. */
function Fine({ g }: { g: SudokuLiberoController }) {
  const p = g.partita!
  const nota = g.record ? 'nuovo record' : p.aiutata ? 'con aiuti' : null
  return (
    <FineSudoku
      titolo="Risolto"
      valore={formatCronometro(p.tempoMs)}
      dettaglio={`${NOMI_LIVELLI[p.livello]}${nota ? ` · ${nota}` : ''}`}
      azioni={
        <>
          <Button onClick={() => g.nuova(p.livello)}>
            <IconRefresh size={18} /> Un altro
          </Button>
          <Button variant="tinted" onClick={g.lascia}>
            Cambia difficoltà
          </Button>
        </>
      }
    />
  )
}

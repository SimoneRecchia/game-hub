import type { ReactNode } from 'react'
import { Collegamento } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Button } from '@/components/Button'
import { IconaGioco } from '@/components/IconaGioco'
import { Sheet } from '@/components/Sheet'
import { IconShare, IconShuffle, IconTrophy } from '@/components/Icons'
import { MiniGriglia, TITOLI_VITTORIA } from './fine'
import { StatsPanel } from './StatsPanel'
import { useCountdown } from './useCountdown'
import { useToast } from '@/components/Toast'
import { formatCountdown } from '@/lib/format'
import { shareText } from '@shared/wordle'
import type { Griglia } from './useWordle'
import type { PlayerStats, WordleState } from '@shared/types'
import './ResultSheet.css'

interface Props {
  open: boolean
  onClose: () => void
  state: WordleState
  stats: PlayerStats | null
  /** Porta alla parola libera: la classificata e' una al giorno, le altre sono lì. */
  onLibera: () => void
}

/** Il titolo del riepilogo: com'e' andata, in due parole. */
export function titoloRiepilogo(state: Griglia): string {
  return state.status === 'won' ? TITOLI_VITTORIA[Math.min(state.guesses.length, 6) - 1] : 'Peccato!'
}

export function ResultSheet({ open, onClose, state, stats, onLibera }: Props) {
  const toast = useToast()
  const won = state.status === 'won'
  const attempts = state.guesses.length

  const condividi = async () => {
    const text = shareText({
      puzzleNumber: state.puzzleNumber,
      guesses: state.guesses,
      status: state.status,
      score: state.score,
    })
    try {
      // Su telefono apre il foglio di condivisione di sistema; altrove si copia negli appunti.
      if (navigator.share) await navigator.share({ text })
      else {
        await navigator.clipboard.writeText(text)
        toast.show('Risultato copiato', 'success')
      }
    } catch {
      /* condivisione annullata dall'utente: niente da segnalare */
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={titoloRiepilogo(state)}>
      <div className="result">
        <TestaRiepilogo
          sopra={`Wordle #${state.puzzleNumber}`}
          state={state}
          punti={state.score !== null ? `+${state.score}` : null}
        />

        <dl className="result__dati">
          <div className="result__dato">
            <dt>Tentativi</dt>
            <dd className="u-tabnum">{won ? `${attempts} su ${state.maxAttempts}` : 'Finiti'}</dd>
          </div>
          <Countdown ms={state.msToNextPuzzle} />
        </dl>

        {stats && <StatsPanel stats={stats} highlight={won ? attempts : null} />}

        <div className="result__actions">
          <div className="result__fila">
            <Collegamento to={ROTTE.classifica('wordle')} className="btn btn--lg result__classifica" onClick={onClose}>
              <span className="btn__label">
                <IconTrophy size={18} />
                Vedi la classifica
              </span>
            </Collegamento>
            <Button variant="tinted" size="lg" onClick={() => void condividi()} aria-label="Condividi">
              <IconShare size={18} />
            </Button>
          </div>
          {/* La classificata e' una al giorno: chi ha voglia di giocarne altre le
              trova nella libera, a caso e senza punti. */}
          <Button
            size="lg"
            fullWidth
            onClick={() => {
              onClose()
              onLibera()
            }}
          >
            <IconShuffle size={18} />
            Gioca una parola libera
          </Button>
        </div>
      </div>
    </Sheet>
  )
}

/**
 * La testa del riepilogo, come nell'album: l'adesivo del Wordle nel suo posto
 * tratteggiato, com'e' andata, i punti in un bollino che dondola, e sotto i
 * tentativi in piccolo. Persa, la parola che era, su tessere d'oro.
 *
 * Il titolo del foglio lo legge chi legge lo schermo; qui si vede nella testa,
 * accanto all'adesivo.
 */
export function TestaRiepilogo({
  sopra,
  state,
  punti,
  extra,
}: {
  sopra: string
  state: Griglia
  /** Il bollino a destra: i punti, o niente nella libera. */
  punti: string | null
  extra?: ReactNode
}) {
  const won = state.status === 'won'
  const n = state.guesses.length
  return (
    <>
      <header className="result__testa">
        <span className="result__album">
          <IconaGioco gioco="wordle" lato={46} giro={-5} />
        </span>
        <div className="result__titoli">
          <span className="result__sopra">{sopra}</span>
          <p className="result__titolo" aria-hidden="true">
            {titoloRiepilogo(state)}
          </p>
          <span className="result__sotto">
            {won ? (n === 1 ? 'Al primo tentativo' : `Indovinata in ${n} tentativi`) : 'Non indovinata'}
          </span>
        </div>
        {punti && <span className={`result__punti u-tabnum${won ? '' : ' is-persa'}`}>{punti}</span>}
      </header>
      <MiniGriglia guesses={state.guesses} />
      {!won && state.answer && (
        <div className="result__soluzione">
          <span className="result__soluzione-titolo">La parola era</span>
          <span className="result__soluzione-lettere" aria-label={state.answer.toUpperCase()}>
            {[...state.answer.toUpperCase()].map((l, i) => (
              <span key={i} style={{ animationDelay: `${i * 0.12}s` }} aria-hidden="true">
                {l}
              </span>
            ))}
          </span>
        </div>
      )}
      {extra}
    </>
  )
}

/** Countdown alla prossima parola, aggiornato al secondo. */
function Countdown({ ms }: { ms: number }) {
  const remaining = useCountdown(ms)

  return (
    <div className="result__dato">
      <dt>Prossima parola fra</dt>
      <dd className="u-tabnum">{formatCountdown(remaining)}</dd>
    </div>
  )
}

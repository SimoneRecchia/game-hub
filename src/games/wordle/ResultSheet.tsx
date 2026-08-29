import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/Button'
import { Sheet } from '@/components/Sheet'
import { IconShare, IconTrophy } from '@/components/Icons'
import { StatsPanel } from './StatsPanel'
import { useToast } from '@/components/Toast'
import { formatCountdown } from '@/lib/format'
import { shareText } from '@shared/wordle'
import type { PlayerStats, WordleState } from '@shared/types'
import './ResultSheet.css'

interface Props {
  open: boolean
  onClose: () => void
  state: WordleState
  stats: PlayerStats | null
}

const WIN_TITLES = ['Al primo colpo!', 'Splendido', 'Ottimo', 'Bene', 'Per un pelo', 'In extremis']

export function ResultSheet({ open, onClose, state, stats }: Props) {
  const toast = useToast()
  const won = state.status === 'won'
  const attempts = state.guesses.length

  return (
    <Sheet open={open} onClose={onClose} title={won ? WIN_TITLES[attempts - 1] : 'Niente da fare'}>
      <div className="result">
        {won ? (
          <p className="result__lede">
            Indovinata in <strong>{attempts}</strong> {attempts === 1 ? 'tentativo' : 'tentativi'}.
          </p>
        ) : (
          <p className="result__lede">
            La parola era <strong className="result__answer">{state.answer?.toUpperCase()}</strong>.
          </p>
        )}

        {state.score !== null && (
          <div className="result__score">
            <span className="result__score-value u-tabnum">+{state.score}</span>
            <span className="result__score-label">punti</span>
          </div>
        )}

        {stats && <StatsPanel stats={stats} highlight={won ? attempts : null} />}

        <Countdown ms={state.msToNextPuzzle} />

        <div className="result__actions">
          <Button
            size="lg"
            fullWidth
            onClick={async () => {
              const text = shareText({
                puzzleNumber: state.puzzleNumber,
                guesses: state.guesses,
                status: state.status,
                score: state.score,
              })
              try {
                // Su telefono apre il foglio di condivisione di sistema;
                // altrove si copia negli appunti.
                if (navigator.share) await navigator.share({ text })
                else {
                  await navigator.clipboard.writeText(text)
                  toast.show('Risultato copiato', 'success')
                }
              } catch {
                /* condivisione annullata dall'utente: niente da segnalare */
              }
            }}
          >
            <IconShare size={18} />
            Condividi il risultato
          </Button>

          <Link to="/classifica" className="result__link">
            <IconTrophy size={18} />
            Vedi la classifica
          </Link>
        </div>
      </div>
    </Sheet>
  )
}

/** Countdown alla prossima parola, aggiornato al secondo. */
function Countdown({ ms }: { ms: number }) {
  const [remaining, setRemaining] = useState(ms)

  useEffect(() => {
    setRemaining(ms)
    const deadline = Date.now() + ms
    const id = window.setInterval(() => {
      setRemaining(Math.max(0, deadline - Date.now()))
    }, 1_000)
    return () => window.clearInterval(id)
  }, [ms])

  return (
    <div className="result__countdown">
      <span className="result__countdown-label">Prossima parola fra</span>
      <span className="result__countdown-value u-tabnum">{formatCountdown(remaining)}</span>
    </div>
  )
}

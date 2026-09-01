import { Link } from 'react-router-dom'
import { Button } from '@/components/Button'
import { Sheet } from '@/components/Sheet'
import { IconShare, IconTrophy } from '@/components/Icons'
import { StatsPanel } from './StatsPanel'
import { useCountdown } from './useCountdown'
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
  /** Porta alla prossima parola da giocare, se ce n'e' una. */
  onNextWord: (slot: number) => void
}

const WIN_TITLES = ['Al primo colpo!', 'Splendido', 'Ottimo', 'Bene', 'Per un pelo', 'In extremis']

export function ResultSheet({ open, onClose, state, stats, onNextWord }: Props) {
  const toast = useToast()
  const won = state.status === 'won'
  const attempts = state.guesses.length

  /*
   * La prossima parola aperta della giornata.
   *
   * E' il modo in cui le quattro parole in piu' si fanno scoprire: se restassero
   * solo nel selettore in cima, chi chiude la parola del giorno e chiude il
   * riepilogo non saprebbe mai che ce ne sono altre.
   */
  /*
   * Le parole si aprono una per volta, quindi la prossima e' semplicemente la
   * prima non ancora chiusa. Il filtro su `locked` c'e' comunque: se un domani
   * la progressione cambiasse, questo bottone non porterebbe su una parola che
   * il server rifiuta.
   */
  const prossima = state.day.find(
    (d) => d.status !== 'won' && d.status !== 'lost' && !d.locked && d.slot !== state.slot,
  )
  const rimaste = state.day.filter((d) => d.status !== 'won' && d.status !== 'lost').length
  const puntiGiornata = state.day.reduce((sum, d) => sum + (d.score ?? 0), 0)

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
            <span className="result__score-label">
              {state.slot === 1 ? 'punti' : `punti · ${state.slot}ª parola`}
            </span>
            {/* Il totale della giornata, quando non coincide col punteggio di
                questa parola: e' il numero che finisce in classifica. */}
            {puntiGiornata !== state.score && (
              <span className="result__score-day u-tabnum">
                {puntiGiornata} oggi in tutto
              </span>
            )}
          </div>
        )}

        {stats && <StatsPanel stats={stats} highlight={won ? attempts : null} />}

        {rimaste === 0 ? (
          <Countdown ms={state.msToNextPuzzle} />
        ) : (
          <p className="result__rimaste">
            {rimaste === 1
              ? 'Ti resta una parola oggi.'
              : `Ti restano ${rimaste} parole oggi.`}
          </p>
        )}

        <div className="result__actions">
          {prossima && (
            <Button
              size="lg"
              fullWidth
              onClick={() => {
                onNextWord(prossima.slot)
                onClose()
              }}
            >
              {/* Niente punti nell'etichetta: la scala sta nel foglio informativo,
                  e qui il numero sarebbe un'altra cifra da leggere in un foglio
                  che ne ha già parecchie. */}
              {prossima.slot === 1
                ? 'Gioca la parola del giorno'
                : `Gioca la ${prossima.slot}ª parola`}
            </Button>
          )}

          <Button
            variant={prossima ? 'tinted' : 'filled'}
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
  const remaining = useCountdown(ms)

  return (
    <div className="result__countdown">
      <span className="result__countdown-label">Prossima parola fra</span>
      <span className="result__countdown-value u-tabnum">{formatCountdown(remaining)}</span>
    </div>
  )
}

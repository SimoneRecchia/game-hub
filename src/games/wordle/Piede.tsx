import { notaWordle, piedeWordle } from './fine'
import type { Griglia } from './useWordle'

/**
 * La riga sotto la griglia: a che tentativo si e', o il messaggio del momento,
 * e a partita chiusa com'e' finita. Com'e' andato l'ultimo tentativo — quante
 * lettere al posto giusto, quante da spostare — lo sente chi legge lo schermo:
 * a vederlo lo dicono i colori.
 *
 * `revealing` e' la riga che sta girando: fino a che non ha finito la partita
 * non e' ancora finita, e la fine si dice quando si vede.
 */
export function Piede({
  state,
  message,
  revealing = null,
  testo,
}: {
  state: Griglia | null
  message: string | null
  revealing?: number | null
  /** Al posto del conto dei tentativi: nella partita di un altro, chi sta giocando. */
  testo?: string
}) {
  const guesses = state ? (revealing === null ? state.guesses : state.guesses.slice(0, revealing)) : []
  const status = state && revealing === null ? state.status : 'playing'
  const visto = state ? (testo ?? piedeWordle(guesses, status, state.answer, state.maxAttempts)) : ' '
  return (
    <>
      <p className={`wordle__piede${message ? ' is-messaggio' : ''}`} aria-hidden="true">
        {message ?? visto}
      </p>
      <p className="u-visually-hidden" aria-live="polite">
        {message ?? (state ? `${testo ? `${testo}. ` : ''}${notaWordle(guesses, status, state.answer)}` : '')}
      </p>
    </>
  )
}

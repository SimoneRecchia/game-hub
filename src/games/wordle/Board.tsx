import type { EvaluatedGuess } from '@shared/types'
import { Tile } from './Tile'
import './Board.css'

interface Props {
  guesses: readonly EvaluatedGuess[]
  /** Lettere digitate ma non ancora inviate. */
  draft: string
  wordLength: number
  maxAttempts: number
  /** Indice della riga che sta girando, oppure null. */
  revealing: number | null
  /** Riga da far saltellare dopo la vittoria. */
  winningRow: number | null
  /** Riga da scuotere per un tentativo rifiutato. */
  shakingRow: number | null
}

export function Board({
  guesses,
  draft,
  wordLength,
  maxAttempts,
  revealing,
  winningRow,
  shakingRow,
}: Props) {
  const draftRow = guesses.length

  return (
    <div className="board" role="grid" aria-label="Griglia dei tentativi">
      {Array.from({ length: maxAttempts }, (_, row) => {
        const guess = guesses[row]
        const isDraft = !guess && row === draftRow
        const letters = guess?.word ?? (isDraft ? draft : '')

        return (
          <div
            key={row}
            className={`board__row${shakingRow === row ? ' is-shaking' : ''}`}
            role="row"
          >
            {Array.from({ length: wordLength }, (_, col) => (
              <Tile
                key={col}
                index={col}
                letter={letters[col] ?? ''}
                state={guess?.pattern[col] ?? null}
                revealing={revealing === row}
                winning={winningRow === row}
              />
            ))}
          </div>
        )
      })}
    </div>
  )
}

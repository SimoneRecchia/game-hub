import type { TileState } from '@shared/types'
import './Tile.css'

interface Props {
  letter: string
  state: TileState | null
  /** Posizione nella riga: comanda il ritardo dell'animazione. */
  index: number
  /** La riga sta girando adesso: il colore compare a metà della rotazione. */
  revealing?: boolean
  /** Parte del tentativo vincente: fa il saltello finale. */
  winning?: boolean
}

const CLASS: Record<TileState, string> = {
  correct: 'is-correct',
  present: 'is-present',
  absent: 'is-absent',
}

export function Tile({ letter, state, index, revealing = false, winning = false }: Props) {
  const classes = ['tile']
  if (letter) classes.push('is-filled')
  if (state) {
    classes.push(CLASS[state])
    // Durante la rotazione il colore lo mette l'animazione: applicarlo anche
    // qui lo farebbe apparire prima che la casella si giri.
    if (!revealing) classes.push('is-scored')
  }
  if (revealing) classes.push('is-revealing')
  if (winning) classes.push('is-winning')

  return (
    <div
      className={classes.join(' ')}
      style={{ '--i': index } as React.CSSProperties}
      data-letter={letter || undefined}
    >
      <span className="tile__letter">{letter.toUpperCase()}</span>
    </div>
  )
}

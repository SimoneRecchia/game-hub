import type { TileState } from '@shared/types'
import { IconBackspace } from '@/components/Icons'
import './Keyboard.css'

/**
 * Tastiera con le 21 lettere dell'alfabeto italiano.
 *
 * E' la QWERTY senza J, K, W, X e Y: quelle cinque lettere compaiono solo nei
 * prestiti stranieri, che il dizionario del gioco non contiene. Togliendole,
 * su un telefono i tasti restano sensibilmente piu' grandi e non ce n'e'
 * nessuno che non possa mai servire.
 */
const ROWS = [
  ['q', 'e', 'r', 't', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'l'],
  ['ENTER', 'z', 'c', 'v', 'b', 'n', 'm', 'BACK'],
] as const

const STATE_CLASS: Record<TileState, string> = {
  correct: 'is-correct',
  present: 'is-present',
  absent: 'is-absent',
}

interface Props {
  states: Map<string, TileState>
  onLetter: (letter: string) => void
  onEnter: () => void
  onBackspace: () => void
  disabled: boolean
}

export function Keyboard({ states, onLetter, onEnter, onBackspace, disabled }: Props) {
  return (
    <div className="keyboard" role="group" aria-label="Tastiera">
      {ROWS.map((row, index) => (
        <div className="keyboard__row" key={index}>
          {row.map((key) => {
            if (key === 'ENTER') {
              return (
                <button
                  key={key}
                  type="button"
                  className="key key--wide"
                  onClick={onEnter}
                  disabled={disabled}
                  aria-label="Invia il tentativo"
                >
                  Invia
                </button>
              )
            }
            if (key === 'BACK') {
              return (
                <button
                  key={key}
                  type="button"
                  className="key key--wide"
                  onClick={onBackspace}
                  disabled={disabled}
                  aria-label="Cancella l'ultima lettera"
                >
                  <IconBackspace size={22} />
                </button>
              )
            }
            const state = states.get(key)
            return (
              <button
                key={key}
                type="button"
                className={`key${state ? ` ${STATE_CLASS[state]}` : ''}`}
                onClick={() => onLetter(key)}
                disabled={disabled}
                aria-label={key.toUpperCase()}
              >
                {key.toUpperCase()}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

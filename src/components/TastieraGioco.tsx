import { useEffect } from 'react'
import { IconBackspace } from '@/components/Icons'
import { KEYBOARD_ROWS, isGameLetter } from '@shared/wordle'
import '@/games/wordle/Keyboard.css'

/**
 * La tastiera del gioco, con le 21 lettere del Wordle, per i giochi che fanno
 * scrivere una parola sola: la Catena e la parola vincente della Ghigliottina.
 * Con quella del telefono aperta la scena non si vedrebbe, e lascerebbe
 * scrivere lettere che il gioco non ha. L'invio dice che cosa fa ("Prova",
 * "Conferma") e si accende quando c'e' qualcosa da mandare (`pronta`).
 */
export function TastieraGioco({
  disabled,
  pronta,
  invio,
  className = '',
  onLettera,
  onCancella,
  onInvio,
}: {
  disabled: boolean
  pronta: boolean
  invio: string
  /** La classe del gioco, per i colori: la tastiera sta sul suo palco scuro. */
  className?: string
  onLettera: (l: string) => void
  onCancella: () => void
  onInvio: () => void
}) {
  return (
    <div className={`keyboard tastiera-gioco ${className}`} role="group" aria-label="Tastiera">
      {KEYBOARD_ROWS.map((riga, i) => (
        <div className="keyboard__row" key={i}>
          {riga.map((tasto) => {
            if (tasto === 'ENTER') {
              return (
                <button
                  key={tasto}
                  type="button"
                  className={`key key--wide tastiera-gioco__invio${pronta ? ' is-pronta' : ''}`}
                  onClick={onInvio}
                  disabled={disabled || !pronta}
                >
                  {invio}
                </button>
              )
            }
            if (tasto === 'BACK') {
              return (
                <button
                  key={tasto}
                  type="button"
                  className="key key--wide"
                  onClick={onCancella}
                  disabled={disabled}
                  aria-label="Cancella"
                >
                  <IconBackspace size={22} />
                </button>
              )
            }
            return (
              <button
                key={tasto}
                type="button"
                className="key"
                onClick={() => onLettera(tasto)}
                disabled={disabled}
                aria-label={tasto.toUpperCase()}
              >
                {tasto.toUpperCase()}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

/**
 * La tastiera del computer per gli stessi giochi: le lettere del gioco, la
 * cancellazione e l'invio. Un campo di testo o un bottone col fuoco si tengono
 * i loro tasti: l'invio su un bottone lo preme da solo.
 */
export function useTastieraFisica(
  attiva: boolean,
  { onLettera, onCancella, onInvio }: { onLettera: (l: string) => void; onCancella: () => void; onInvio: () => void },
) {
  useEffect(() => {
    if (!attiva) return
    const tasto = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const bersaglio = e.target as HTMLElement | null
      if (bersaglio && /^(INPUT|TEXTAREA)$/.test(bersaglio.tagName)) return
      const k = e.key.toLowerCase()
      if (k === 'enter') {
        if (bersaglio?.tagName === 'BUTTON') return
        e.preventDefault()
        onInvio()
      } else if (k === 'backspace') {
        e.preventDefault()
        onCancella()
      } else if (isGameLetter(k)) {
        e.preventDefault()
        onLettera(k)
      }
    }
    window.addEventListener('keydown', tasto)
    return () => window.removeEventListener('keydown', tasto)
  }, [attiva, onLettera, onCancella, onInvio])
}

import { useEffect, type ReactNode } from 'react'
import { IconBackspace } from '@/components/Icons'
import { KEYBOARD_ROWS, isGameLetter } from '@shared/wordle'
import './TastieraGioco.css'

/** Il tasto in basso a destra: quello che manda, o nel cruciverba quello che cambia direzione. */
export interface AzioneTastiera {
  etichetta: ReactNode
  /** Per chi legge lo schermo, quando l'etichetta non basta. */
  aria?: string
  onClick: () => void
  /** C'e' qualcosa da mandare: il tasto si accende nel colore dell'app, come l'invio dei telefoni. */
  pronta: boolean
  /** Non si puo' premere, anche con la tastiera accesa. */
  spenta?: boolean
  /** Un'etichetta lunga, come "Suggerisci": un corpo piu' piccolo invece di tagliarla. */
  lunga?: boolean
}

/**
 * La tastiera dei giochi di parole, una sola per tutti: il Wordle, la Catena,
 * la Ghigliottina e il cruciverba. Le 21 lettere del gioco, la cancellazione a
 * destra e sotto di lei il tasto che manda, dove lo mettono i telefoni.
 * `stati` colora le lettere, come fa il Wordle con quelle gia' provate.
 */
export function TastieraLettere({
  disabled,
  className = '',
  stati,
  onLettera,
  onCancella,
  azione,
}: {
  disabled: boolean
  /** La classe del gioco, per i colori: la Catena e la Ghigliottina hanno il loro palco scuro. */
  className?: string
  stati?: ReadonlyMap<string, string>
  onLettera: (l: string) => void
  onCancella: () => void
  azione: AzioneTastiera
}) {
  return (
    <div className={`keyboard ${className}`} role="group" aria-label="Tastiera">
      {KEYBOARD_ROWS.map((riga, i) => (
        <div className="keyboard__row" key={i}>
          {riga.map((tasto) => {
            if (tasto === 'ENTER') {
              return (
                <button
                  key={tasto}
                  type="button"
                  className={`key key--azione${azione.pronta ? ' is-pronta' : ''}${azione.lunga ? ' is-lunga' : ''}`}
                  onClick={azione.onClick}
                  disabled={disabled || azione.spenta}
                  aria-label={azione.aria}
                >
                  {azione.etichetta}
                </button>
              )
            }
            if (tasto === 'BACK') {
              return (
                <button
                  key={tasto}
                  type="button"
                  className="key key--servizio"
                  onClick={onCancella}
                  disabled={disabled}
                  aria-label="Cancella"
                >
                  <IconBackspace size={22} />
                </button>
              )
            }
            const stato = stati?.get(tasto)
            const lettera = tasto.toUpperCase()
            return (
              <button
                key={tasto}
                type="button"
                className={`key key--lettera${stato ? ` ${stato}` : ''}`}
                data-tasto={lettera}
                onClick={() => onLettera(tasto)}
                disabled={disabled}
                aria-label={lettera}
              >
                {lettera}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

/**
 * La tastiera del gioco per i giochi che fanno scrivere una parola sola: la
 * Catena e la parola vincente della Ghigliottina. Con quella del telefono
 * aperta la scena non si vedrebbe, e lascerebbe scrivere lettere che il gioco
 * non ha. L'invio dice che cosa fa ("Prova", "Invia") e si accende quando c'e'
 * qualcosa da mandare (`pronta`).
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
  className?: string
  onLettera: (l: string) => void
  onCancella: () => void
  onInvio: () => void
}) {
  return (
    <TastieraLettere
      className={`tastiera-gioco ${className}`}
      disabled={disabled}
      onLettera={onLettera}
      onCancella={onCancella}
      azione={{ etichetta: invio, onClick: onInvio, pronta, spenta: !pronta }}
    />
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

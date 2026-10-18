import { useMemo } from 'react'
import type { TileState } from '@shared/types'
import { TastieraLettere } from '@/components/TastieraGioco'

/**
 * Tastiera con le 21 lettere dell'alfabeto italiano.
 *
 * E' la QWERTY senza J, K, W, X e Y: quelle cinque lettere compaiono solo nei
 * prestiti stranieri, che il dizionario del gioco non contiene. Togliendole,
 * su un telefono i tasti restano sensibilmente piu' grandi e non ce n'e'
 * nessuno che non possa mai servire. Il disegno e' quello di tutti i giochi di
 * parole (`TastieraLettere`); qui le lettere prendono il colore dei tentativi.
 */
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
  /**
   * Testo del tasto d'invio. Nella partita condivisa diventa "Suggerisci":
   * l'invitato propone una parola, non la gioca.
   */
  enterLabel?: string
  /** La riga e' piena: l'invio si accende. Con meno lettere si preme lo stesso, e il gioco dice che manca qualcosa. */
  pronta?: boolean
}

export function Keyboard({
  states,
  onLetter,
  onEnter,
  onBackspace,
  disabled,
  enterLabel = 'Invia',
  pronta = true,
}: Props) {
  const stati = useMemo(() => new Map([...states].map(([lettera, stato]) => [lettera, STATE_CLASS[stato]])), [states])
  return (
    <TastieraLettere
      disabled={disabled}
      stati={stati}
      onLettera={onLetter}
      onCancella={onBackspace}
      azione={{
        etichetta: enterLabel,
        aria: enterLabel === 'Invia' ? 'Invia il tentativo' : enterLabel,
        onClick: onEnter,
        pronta,
        lunga: enterLabel.length > 6,
      }}
    />
  )
}

import { TastieraLettere } from '@/components/TastieraGioco'
import type { Direzione } from './useCruciverba'

/**
 * La tastiera del cruciverba: le stesse 21 lettere del Wordle, con lo stesso
 * disegno dei tasti.
 *
 * Al posto di "Invia" c'e' il tasto che cambia direzione: qui non c'e' niente
 * da inviare — la griglia si salva da sola — mentre passare da orizzontale a
 * verticale e' il gesto che si fa di continuo, e toccare due volte la stessa
 * casella non e' ovvio a chi non lo sa. Sta dove sta l'invio, in basso a
 * destra, del grigio dei tasti di servizio.
 */
interface Props {
  direzione: Direzione
  disabled: boolean
  onLettera: (lettera: string) => void
  onCancella: () => void
  onDirezione: () => void
}

export function Tastiera({ direzione, disabled, onLettera, onCancella, onDirezione }: Props) {
  return (
    <TastieraLettere
      className="ctastiera"
      disabled={disabled}
      onLettera={onLettera}
      onCancella={onCancella}
      azione={{
        etichetta: <span aria-hidden="true">{direzione === 'o' ? '↕' : '↔'}</span>,
        aria: direzione === 'o' ? 'Scrivi in verticale' : 'Scrivi in orizzontale',
        onClick: onDirezione,
        pronta: false,
      }}
    />
  )
}

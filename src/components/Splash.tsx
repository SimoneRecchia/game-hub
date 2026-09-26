import { Marchio } from './Marchio'
import './Splash.css'

/**
 * Mostrata solo mentre si verifica la sessione salvata.
 * Volutamente spoglia: se la verifica e' rapida, appare e sparisce senza
 * che si noti, quindi non deve attirare l'attenzione.
 */
export function Splash() {
  return (
    <div className="splash">
      <Marchio lato={72} animato={false} />
      <span className="splash__spinner" aria-label="Caricamento" role="status" />
    </div>
  )
}

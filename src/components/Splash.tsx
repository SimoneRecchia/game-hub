import './Splash.css'

/**
 * Mostrata solo mentre si verifica la sessione salvata.
 * Volutamente spoglia: se la verifica e' rapida, appare e sparisce senza
 * che si noti, quindi non deve attirare l'attenzione.
 */
export function Splash() {
  return (
    <div className="splash">
      <img src="/icon.svg" alt="" width={72} height={72} className="splash__icon" />
      <span className="splash__spinner" aria-label="Caricamento" role="status" />
    </div>
  )
}

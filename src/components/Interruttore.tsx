import './Interruttore.css'

/**
 * L'interruttore delle Impostazioni: acceso o spento, e si tocca tutto. E' un
 * `switch` di WAI-ARIA, quindi chi legge lo schermo sente lo stato e non solo
 * il nome; acceso e' nell'indaco delle scelte, non nel verde del gioco.
 */
export function Interruttore({
  acceso,
  onCambia,
  etichetta,
  disabilitato = false,
}: {
  acceso: boolean
  onCambia: (acceso: boolean) => void
  etichetta: string
  disabilitato?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={acceso}
      aria-label={etichetta}
      className={`interruttore${acceso ? ' is-acceso' : ''}`}
      disabled={disabilitato}
      onClick={() => onCambia(!acceso)}
    >
      <span className="interruttore__pallino" aria-hidden="true" />
    </button>
  )
}

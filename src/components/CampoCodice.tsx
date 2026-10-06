import { forwardRef } from 'react'
import { CODE_LENGTH } from '@shared/config'
import './CampoCodice.css'

interface Props {
  id: string
  etichetta: string
  valore: string
  onCambia: (cifre: string) => void
  /** Il codice completo: parte da solo, senza cercare il tasto. */
  onCompleto: (cifre: string) => void
  disabled?: boolean
  errore?: boolean
}

/**
 * Il campo del codice a sei cifre, grande e spaziato. Tiene solo le cifre, e
 * un codice incollato con lo spazio in mezzo va bene lo stesso; il browser, e
 * iOS, suggerisce quello arrivato per posta (`one-time-code`).
 */
export const CampoCodice = forwardRef<HTMLInputElement, Props>(function CampoCodice(
  { id, etichetta, valore, onCambia, onCompleto, disabled, errore },
  ref,
) {
  return (
    <div className="campo-codice">
      <label className="u-visually-hidden" htmlFor={id}>
        {etichetta}
      </label>
      <input
        id={id}
        ref={ref}
        className="campo-codice__input u-tabnum"
        value={valore}
        onChange={(e) => {
          const cifre = e.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH)
          onCambia(cifre)
          if (cifre.length === CODE_LENGTH) onCompleto(cifre)
        }}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d*"
        placeholder={'0'.repeat(CODE_LENGTH)}
        disabled={disabled}
        aria-invalid={errore}
      />
    </div>
  )
})

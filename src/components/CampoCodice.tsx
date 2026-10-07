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
  /** Quanti caratteri: le sei cifre del codice per entrare, se non si dice altro. */
  lunghezza?: number
  /** Lettere al posto delle cifre: il codice di una stanza di Lupus. */
  lettere?: boolean
}

/**
 * Il campo del codice a sei cifre, grande e spaziato. Tiene solo le cifre, e
 * un codice incollato con lo spazio in mezzo va bene lo stesso; il browser, e
 * iOS, suggerisce quello arrivato per posta (`one-time-code`). Con `lettere`
 * tiene solo le lettere, in maiuscolo: il codice di una stanza che si detta.
 */
export const CampoCodice = forwardRef<HTMLInputElement, Props>(function CampoCodice(
  { id, etichetta, valore, onCambia, onCompleto, disabled, errore, lunghezza = CODE_LENGTH, lettere = false },
  ref,
) {
  const pulisci = (testo: string) =>
    (lettere ? testo.toUpperCase().replace(/[^A-Z]/g, '') : testo.replace(/\D/g, '')).slice(0, lunghezza)
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
          const cifre = pulisci(e.target.value)
          onCambia(cifre)
          if (cifre.length === lunghezza) onCompleto(cifre)
        }}
        inputMode={lettere ? 'text' : 'numeric'}
        autoComplete={lettere ? 'off' : 'one-time-code'}
        autoCapitalize={lettere ? 'characters' : undefined}
        autoCorrect={lettere ? 'off' : undefined}
        spellCheck={lettere ? false : undefined}
        pattern={lettere ? undefined : '\\d*'}
        placeholder={lettere ? 'ABCDEFGH'.slice(0, lunghezza) : '0'.repeat(lunghezza)}
        disabled={disabled}
        aria-invalid={errore}
      />
    </div>
  )
})

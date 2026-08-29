import { forwardRef, type InputHTMLAttributes } from 'react'
import './Field.css'

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  hint?: string
  error?: string | null
}

/**
 * Campo di testo in stile "inset grouped list" iOS: etichetta a sinistra,
 * valore a destra, separatore sottile fra le righe.
 */
export const Field = forwardRef<HTMLInputElement, Props>(function Field(
  { label, hint, error, id, className = '', ...rest },
  ref,
) {
  const inputId = id ?? `f-${label.toLowerCase().replace(/[^a-z]+/g, '-')}`
  return (
    <div className={`field${error ? ' field--error' : ''} ${className}`}>
      <label className="field__label" htmlFor={inputId}>
        {label}
      </label>
      <input ref={ref} id={inputId} className="field__input" {...rest} />
      {(hint || error) && (
        <p className="field__hint" role={error ? 'alert' : undefined}>
          {error ?? hint}
        </p>
      )}
    </div>
  )
})

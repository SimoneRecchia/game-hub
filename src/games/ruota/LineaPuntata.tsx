import { useEffect, useId, useState, type CSSProperties } from 'react'
import './LineaPuntata.css'

/**
 * La puntata: quanto si vuole, un punto alla volta, dalla minima a tutti.
 *
 * Una linea continua e non un cursore a punti: la puntata non e' una scelta
 * fra poche alternative, e' una cifra. La linea e' un `input type="range"`,
 * che da tastiera e con i lettori di schermo funziona gia' come deve; accanto
 * il numero si scrive, per la cifra esatta, che col dito su una linea lunga
 * trecento punti non si prende (Nielsen Norman Group: con un cursore, un campo
 * per il valore preciso). Il numero scritto vale appena sta fra la minima e
 * tutti; lasciando il campo torna al valore valido piu' vicino.
 */
export function LineaPuntata({
  min,
  max,
  valore,
  onChange,
}: {
  min: number
  max: number
  valore: number
  onChange: (puntata: number) => void
}) {
  const id = useId()
  const [testo, setTesto] = useState(String(valore))
  const [scrive, setScrive] = useState(false)
  // Mentre si scrive il campo tiene quel che c'e'; quando la linea si muove, il numero la segue.
  useEffect(() => {
    if (!scrive) setTesto(String(valore))
  }, [valore, scrive])

  const entro = (n: number) => Math.min(max, Math.max(min, n))
  const chiudi = () => {
    const n = Number.parseInt(testo, 10)
    const giusto = Number.isFinite(n) ? entro(n) : valore
    setScrive(false)
    setTesto(String(giusto))
    if (giusto !== valore) onChange(giusto)
  }

  const pieno = max > min ? (valore - min) / (max - min) : 1
  return (
    <div className="linea-puntata">
      <span className="linea-puntata__testa">
        <label className="linea-puntata__titolo" htmlFor={id}>
          Puntata
        </label>
        <span className="linea-puntata__valore">
          <input
            id={id}
            className="linea-puntata__campo u-tabnum"
            type="text"
            inputMode="numeric"
            enterKeyHint="done"
            autoComplete="off"
            value={testo}
            style={{ '--cifre': String(max).length } as CSSProperties}
            onFocus={(e) => {
              setScrive(true)
              e.currentTarget.select()
            }}
            onChange={(e) => {
              const cifre = e.currentTarget.value.replace(/\D/g, '').slice(0, String(max).length)
              setTesto(cifre)
              const n = Number.parseInt(cifre, 10)
              if (n >= min && n <= max) onChange(n)
            }}
            onBlur={chiudi}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
            }}
          />{' '}
          su <span className="u-tabnum">{max}</span>
        </span>
      </span>
      {max > min && (
        <>
          <input
            className="linea-puntata__linea"
            type="range"
            min={min}
            max={max}
            step={1}
            value={valore}
            aria-label={`Puntata, da ${min} a ${max}`}
            aria-valuetext={`${valore} punti su ${max}`}
            style={{ '--pieno': pieno } as CSSProperties}
            onChange={(e) => onChange(Number(e.currentTarget.value))}
          />
          <span className="linea-puntata__estremi u-tabnum" aria-hidden="true">
            <span>{min}</span>
            <span>{max}</span>
          </span>
        </>
      )}
    </div>
  )
}

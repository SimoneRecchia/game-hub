import { useId, type CSSProperties } from 'react'

/**
 * La clessidra della scatola: la sabbia di sopra scende verso il collo, quella
 * di sotto sale, e un filo le unisce finché corre. La quantita' la dice
 * `restante`, da 1 a 0, e il CSS la porta con una transizione lineare fra un
 * aggiornamento e l'altro: cosi' la sabbia scorre invece di scattare. Quando la
 * partita comincia si gira (`gira`), come quella vera.
 */
export function Clessidra({
  restante,
  corre,
  urgente,
  gira,
}: {
  restante: number
  corre: boolean
  urgente: boolean
  gira: boolean
}) {
  const id = useId()
  const sopra = `${id}-sopra`
  const sotto = `${id}-sotto`
  const quota = Math.max(0, Math.min(1, restante))
  return (
    <svg
      className={`par-clessidra${corre && quota > 0 ? ' is-corre' : ''}${urgente ? ' is-urgente' : ''}${gira ? ' is-gira' : ''}`}
      viewBox="0 0 40 64"
      aria-hidden="true"
      style={{ '--sabbia': quota } as CSSProperties}
    >
      <defs>
        <clipPath id={sopra}>
          <path d="M10.6 8H29.4C29.4 20 22.2 26 20.7 32H19.3C17.8 26 10.6 20 10.6 8Z" />
        </clipPath>
        <clipPath id={sotto}>
          <path d="M19.3 32H20.7C22.2 38 29.4 44 29.4 56H10.6C10.6 44 17.8 38 19.3 32Z" />
        </clipPath>
      </defs>
      <path
        className="par-clessidra__vetro"
        d="M10 7H30C30 20 22.6 26 21 32C22.6 38 30 44 30 57H10C10 44 17.4 38 19 32C17.4 26 10 20 10 7Z"
      />
      <g clipPath={`url(#${sopra})`}>
        <rect className="par-clessidra__sopra" x="8" y="12" width="24" height="20" />
      </g>
      <g clipPath={`url(#${sotto})`}>
        <rect className="par-clessidra__sotto" x="8" y="38" width="24" height="18" />
      </g>
      <line className="par-clessidra__filo" x1="20" y1="31" x2="20" y2="56" />
      <path className="par-clessidra__riflesso" d="M12.5 10C13 17 16 22 18 26" />
      <rect className="par-clessidra__legno" x="4" y="2" width="32" height="5.5" rx="2" />
      <rect className="par-clessidra__legno" x="4" y="56.5" width="32" height="5.5" rx="2" />
      <rect className="par-clessidra__legno" x="6" y="7" width="2.2" height="50" />
      <rect className="par-clessidra__legno" x="31.8" y="7" width="2.2" height="50" />
    </svg>
  )
}

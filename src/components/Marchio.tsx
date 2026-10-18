import { useId, type CSSProperties } from 'react'
import { FONDO, MISURE, POSTI, PUNTI, TESSERE } from './disegnoMarchio'
import './Marchio.css'

/**
 * Il marchio dell'app: l'icona (public/icon.svg), disegnata qui con i pezzi
 * veri invece che come immagine, perche' possa animarsi. Entrando il dado
 * salta fuori, le tessere si aprono a ventaglio dietro di lui e i punti si
 * accendono uno alla volta; poi galleggia appena.
 */
export function Marchio({ lato = 88, animato = true }: { lato?: number; animato?: boolean }) {
  const id = useId()
  const { tessera, dado, punto, centro } = MISURE
  const tessere = (['verde', 'giallo'] as const).map((nome, i) => {
    const verso = i === 0 ? -1 : 1
    const [cx, cy] = [centro.x + verso * tessera.x, centro.y + tessera.y]
    return (
      <g key={nome} transform={`rotate(${verso * tessera.angolo} ${cx} ${cy})`}>
        <rect
          className="marchio__tessera"
          style={{ '--verso': verso } as CSSProperties}
          x={cx - tessera.lato / 2}
          y={cy - tessera.lato / 2}
          width={tessera.lato}
          height={tessera.lato}
          rx={tessera.raggio}
          fill={`url(#${id}-${nome})`}
        />
      </g>
    )
  })

  return (
    <span
      className={`marchio${animato ? ' marchio--animato' : ''}`}
      style={{ '--marchio': `${lato}px` } as CSSProperties}
      aria-hidden="true"
    >
      <svg viewBox="0 0 512 512" width={lato} height={lato}>
        <defs>
          <linearGradient id={`${id}-fondo`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="230" y2="512">
            <stop offset="0" stopColor={FONDO[0]} />
            <stop offset="1" stopColor={FONDO[1]} />
          </linearGradient>
          {Object.entries(TESSERE).map(([nome, [da, a]]) => (
            <linearGradient key={nome} id={`${id}-${nome}`} x1="0" y1="0" x2="0.45" y2="1">
              <stop offset="0" stopColor={da} />
              <stop offset="1" stopColor={a} />
            </linearGradient>
          ))}
        </defs>
        <rect width="512" height="512" rx="114" fill={`url(#${id}-fondo)`} />
        {tessere}
        <g className="marchio__dado">
          <rect
            x={centro.x - dado.lato / 2}
            y={centro.y - dado.lato / 2}
            width={dado.lato}
            height={dado.lato}
            rx={dado.raggio}
            fill="#fff"
            stroke={`url(#${id}-fondo)`}
            strokeWidth={dado.solco}
          />
          {Object.values(PUNTI).map((colore, i) => (
            <circle
              key={colore}
              className="marchio__punto"
              style={{ '--i': i } as CSSProperties}
              cx={centro.x + POSTI[i][0] * punto.passo}
              cy={centro.y + POSTI[i][1] * punto.passo}
              r={punto.raggio}
              fill={colore}
            />
          ))}
        </g>
      </svg>
    </span>
  )
}

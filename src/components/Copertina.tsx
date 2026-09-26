import type { CSSProperties, ReactElement } from 'react'
import type { GiocoClassificato } from '@shared/types'
import './Copertina.css'

type Formato = 'icona' | 'carta' | 'eroe'

interface Props {
  gioco: GiocoClassificato | 'generale'
  formato?: Formato
  /** Nome della transizione condivisa: la copertina della card diventa quella della pagina. */
  transizione?: string
  className?: string
}

/**
 * La copertina di un gioco: il suo colore e un disegno che dice che gioco e'.
 *
 * I disegni sono SVG in linea e non immagini: si adattano al tema, pesano
 * pochi byte, e restano nitidi dalla icona da 28 punti della barra laterale
 * alla testata della pagina del gioco. Bianco e trasparenze sul gradiente del
 * gioco, niente altri colori: il colore della copertina e' uno solo.
 */
export function Copertina({ gioco, formato = 'carta', transizione, className = '' }: Props) {
  const stile = transizione ? ({ viewTransitionName: transizione } as CSSProperties) : undefined
  return (
    <div className={`copertina copertina--${gioco} copertina--${formato} ${className}`} style={stile} aria-hidden="true">
      <svg className="copertina__disegno" viewBox="0 0 120 120" preserveAspectRatio="xMidYMid meet">
        {DISEGNI[gioco]}
      </svg>
    </div>
  )
}

const TONDO = 'ui-rounded, -apple-system, "SF Pro Rounded", system-ui, sans-serif'

const DISEGNI: Record<GiocoClassificato | 'generale', ReactElement> = {
  // Una riga di tentativi: due lettere giuste, una al posto sbagliato, due grigie.
  wordle: (
    <g>
      <g transform="rotate(-8 60 60)">
        {[0, 1, 2, 3, 4].map((i) => (
          <rect
            key={i}
            x={11 + i * 20.5}
            y={30}
            width={18}
            height={18}
            rx={4.5}
            fill="#fff"
            fillOpacity={i === 0 || i === 3 ? 0.95 : i === 1 ? 0.55 : 0.18}
            stroke="#fff"
            strokeOpacity={0.5}
            strokeWidth={i === 2 || i === 4 ? 1.4 : 0}
          />
        ))}
        {[0, 1, 2, 3, 4].map((i) => (
          <rect key={`b${i}`} x={11 + i * 20.5} y={52} width={18} height={18} rx={4.5} fill="#fff" fillOpacity={0.14} />
        ))}
        <text x={20} y={44} textAnchor="middle" fontFamily={TONDO} fontWeight={800} fontSize={13} fill="var(--c2)">
          W
        </text>
        <text x={81.5} y={44} textAnchor="middle" fontFamily={TONDO} fontWeight={800} fontSize={13} fill="var(--c2)">
          D
        </text>
      </g>
    </g>
  ),

  // Tre tessere di legno, una sopra l'altra, con il valore nell'angolo.
  scarabeo: (
    <g fontFamily={TONDO} fontWeight={800}>
      {[
        { x: 18, y: 50, r: -12, l: 'S', v: '2' },
        { x: 46, y: 36, r: 4, l: 'C', v: '3' },
        { x: 74, y: 50, r: 14, l: 'A', v: '1' },
      ].map((t) => (
        <g key={t.l} transform={`rotate(${t.r} ${t.x + 14} ${t.y + 14})`}>
          <rect x={t.x} y={t.y + 2} width={28} height={28} rx={6} fill="#000" fillOpacity={0.12} />
          <rect x={t.x} y={t.y} width={28} height={28} rx={6} fill="#fff4dc" />
          <text x={t.x + 13} y={t.y + 20} textAnchor="middle" fontSize={17} fill="#5a3a0c">
            {t.l}
          </text>
          <text x={t.x + 23} y={t.y + 25} textAnchor="middle" fontSize={7} fill="#5a3a0c" fillOpacity={0.7}>
            {t.v}
          </text>
        </g>
      ))}
    </g>
  ),

  // Un angolo di schema: caselle bianche, qualche nera, il numero della prima.
  cruciverba: (
    <g transform="rotate(-6 60 60)">
      {Array.from({ length: 16 }, (_, k) => {
        const r = Math.floor(k / 4)
        const c = k % 4
        const nera = k === 5 || k === 10 || k === 15
        return (
          <rect
            key={k}
            x={24 + c * 18}
            y={24 + r * 18}
            width={17}
            height={17}
            rx={2.5}
            fill={nera ? 'var(--c2)' : '#fff'}
            fillOpacity={nera ? 0.9 : 0.93}
          />
        )
      })}
      <text x={27} y={31} fontFamily={TONDO} fontWeight={800} fontSize={6} fill="var(--c2)">
        1
      </text>
      <text x={32.5} y={37.5} textAnchor="middle" fontFamily={TONDO} fontWeight={800} fontSize={11} fill="var(--c2)">
        R
      </text>
      <text x={50.5} y={37.5} textAnchor="middle" fontFamily={TONDO} fontWeight={800} fontSize={11} fill="var(--c2)">
        E
      </text>
    </g>
  ),

  // Una nave in griglia, colpita, e uno spruzzo in acqua.
  battaglia: (
    <g>
      <g stroke="#fff" strokeOpacity={0.18} strokeWidth={1}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <line key={`v${i}`} x1={15 + i * 18} y1={15} x2={15 + i * 18} y2={105} />
        ))}
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <line key={`o${i}`} x1={15} y1={15 + i * 18} x2={105} y2={15 + i * 18} />
        ))}
      </g>
      <rect x={19} y={55} width={64} height={14} rx={7} fill="#fff" fillOpacity={0.92} />
      <circle cx={42} cy={62} r={4.5} fill="var(--c2)" fillOpacity={0.9} />
      <g stroke="#fff" strokeWidth={3} strokeLinecap="round">
        <line x1={64} y1={56} x2={74} y2={68} />
        <line x1={74} y1={56} x2={64} y2={68} />
      </g>
      <circle cx={87} cy={33} r={6} fill="none" stroke="#fff" strokeOpacity={0.7} strokeWidth={2} />
      <circle cx={87} cy={33} r={12} fill="none" stroke="#fff" strokeOpacity={0.3} strokeWidth={1.5} />
    </g>
  ),

  // La classifica generale: tre gradini di un podio.
  generale: (
    <g fontFamily={TONDO} fontWeight={800}>
      <rect x={20} y={56} width={26} height={40} rx={5} fill="#fff" fillOpacity={0.55} />
      <rect x={47} y={40} width={26} height={56} rx={5} fill="#fff" fillOpacity={0.95} />
      <rect x={74} y={66} width={26} height={30} rx={5} fill="#fff" fillOpacity={0.35} />
      <text x={60} y={60} textAnchor="middle" fontSize={16} fill="var(--c2)">
        1
      </text>
      <path d="M60 18l3.6 7.3 8 1.2-5.8 5.6 1.4 8-7.2-3.8-7.2 3.8 1.4-8-5.8-5.6 8-1.2z" fill="#fff" />
    </g>
  ),
}

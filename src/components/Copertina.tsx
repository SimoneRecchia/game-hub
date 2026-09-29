import type { CSSProperties, ReactElement } from 'react'
import type { GiocoClassificato, GiocoDaTavolo } from '@shared/types'
import './Copertina.css'

type Formato = 'icona' | 'carta' | 'eroe'

interface Props {
  gioco: GiocoClassificato | GiocoDaTavolo | 'generale'
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

const DISEGNI: Record<GiocoClassificato | GiocoDaTavolo | 'generale', ReactElement> = {
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

  // Un riquadro del sudoku: qualche cifra data, una casella scelta e una con le note a matita.
  sudoku: (
    <g transform="rotate(-6 60 60)">
      {Array.from({ length: 9 }, (_, k) => {
        const r = Math.floor(k / 3)
        const c = k % 3
        const scelta = k === 4
        return (
          <rect
            key={k}
            x={24 + c * 24.5}
            y={24 + r * 24.5}
            width={22}
            height={22}
            rx={4}
            fill="#fff"
            fillOpacity={scelta ? 0.98 : 0.9}
            stroke={scelta ? 'var(--c2)' : 'none'}
            strokeWidth={scelta ? 2.4 : 0}
          />
        )
      })}
      {[
        [0, '5'],
        [2, '3'],
        [4, '7'],
        [6, '9'],
        [8, '1'],
      ].map(([k, d]) => (
        <text
          key={String(k)}
          x={35 + (Number(k) % 3) * 24.5}
          y={41.5 + Math.floor(Number(k) / 3) * 24.5}
          textAnchor="middle"
          fontFamily={TONDO}
          fontWeight={800}
          fontSize={15}
          fill="var(--c2)"
          fillOpacity={k === 4 ? 1 : 0.85}
        >
          {d}
        </text>
      ))}
      {[
        [0, '2'],
        [2, '4'],
        [3, '8'],
      ].map(([i, d]) => (
        <text
          key={`n${i}`}
          x={24 + 24.5 * 2 + 4.5 + (Number(i) % 3) * 6.5}
          y={24 + 24.5 + 8 + Math.floor(Number(i) / 3) * 7}
          textAnchor="middle"
          fontFamily={TONDO}
          fontWeight={700}
          fontSize={6}
          fill="var(--c2)"
          fillOpacity={0.7}
        >
          {d}
        </text>
      ))}
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

  // Un mappamondo da scrivania, con lo spillo piantato sul posto da trovare.
  quiz: (
    <g>
      <g fill="none" stroke="#fff" strokeOpacity={0.6} strokeWidth={3.5} strokeLinecap="round">
        <path d="M58 24A34 34 0 0 0 58 92" />
        <path d="M58 92v8M46 100h24" />
      </g>
      <circle cx={58} cy={58} r={28} fill="#fff" fillOpacity={0.2} stroke="#fff" strokeWidth={3} />
      <g fill="none" stroke="#fff" strokeOpacity={0.45} strokeWidth={1.6}>
        <ellipse cx={58} cy={58} rx={11} ry={28} />
        <path d="M30 58h56M34 44h48M34 72h48" />
      </g>
      <g fill="#fff" fillOpacity={0.92}>
        <path d="M40 45c5-5 13-4 15 1s-3 8-1 12 7 4 5 10-9 6-13 2-8-7-7-13 0-9 1-12z" />
        <path d="M67 58c5-1 10 2 10 6s-4 5-5 9 1 7-3 8-6-5-5-10-3-12 3-13z" />
      </g>
      <g transform="translate(62 16)">
        <path d="M12 0C5.4 0 0 5 0 11.3 0 19.8 12 32 12 32s12-12.2 12-20.7C24 5 18.6 0 12 0z" fill="#fff" />
        <circle cx={12} cy={11} r={4.5} fill="var(--c2)" />
      </g>
    </g>
  ),

  // Il tabellone di Indovina chi: sei carte, due gia' abbassate, e la domanda.
  indovina: (
    <g>
      <g transform="rotate(-6 60 66)">
        <rect x={14} y={38} width={92} height={70} rx={9} fill="#fff" fillOpacity={0.18} />
        {[0, 1, 2].flatMap((c) =>
          [0, 1].map((r) => {
            const x = 21 + c * 27
            const y = 44 + r * 31
            const abbassata = (c === 1 && r === 0) || (c === 2 && r === 1)
            return abbassata ? (
              <rect key={`${c}${r}`} x={x} y={y + 19} width={24} height={7} rx={3} fill="#fff" fillOpacity={0.4} />
            ) : (
              <g key={`${c}${r}`}>
                <rect x={x} y={y} width={24} height={27} rx={4.5} fill="#fff" fillOpacity={0.96} />
                <circle cx={x + 12} cy={y + 11} r={5.6} fill="var(--c2)" fillOpacity={0.9} />
                <path d={`M${x + 3.5} ${y + 27}c0-6 3.8-9 8.5-9s8.5 3 8.5 9z`} fill="var(--c2)" fillOpacity={0.55} />
              </g>
            )
          }),
        )}
      </g>
      <g transform="translate(66 8)">
        <path
          d="M0 11C0 4.9 4.9 0 11 0h16c6.1 0 11 4.9 11 11v3c0 6.1-4.9 11-11 11h-9l-8 7v-7.4C4.3 23.4 0 19.2 0 14z"
          fill="#fff"
        />
        <text x={19} y={19.5} textAnchor="middle" fontFamily={TONDO} fontWeight={800} fontSize={16} fill="var(--c2)">
          ?
        </text>
      </g>
    </g>
  ),

  // Un cavallo sulla scacchiera, come nei disegni dei libri di scacchi.
  scacchi: (
    <g>
      <g transform="rotate(-8 60 76)">
        {Array.from({ length: 15 }, (_, k) => {
          const r = Math.floor(k / 5)
          const c = k % 5
          return (
            <rect
              key={k}
              x={15 + c * 18}
              y={62 + r * 14}
              width={18}
              height={14}
              fill="#fff"
              fillOpacity={(r + c) % 2 === 0 ? 0.34 : 0.1}
            />
          )
        })}
      </g>
      <g transform="translate(24 12) scale(1.75)" strokeLinejoin="round" strokeLinecap="round">
        <path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21" fill="#fff" />
        <path
          d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.04-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.99-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.99 2.5-3c1 0 1 3 1 3"
          fill="#fff"
        />
        <circle cx={12} cy={25.5} r={0.9} fill="var(--c2)" />
        <path d="M15 15.5a.5 1.5 30 1 1-1-.5" fill="none" stroke="var(--c2)" strokeWidth={1.3} />
        <path d="M24.55 10.4l-.45 1.45.5.15c3.15 1 5.65 2.49 7.9 6.75S35.75 29.06 35.25 39l-.05.5h2.25l.05-.5c.5-10.06-.88-16.85-3.25-21.34-2.37-4.49-5.79-6.64-9.19-7.16z" fill="var(--c2)" fillOpacity={0.35} />
      </g>
    </g>
  ),

  // Tre pedine su una diagonale: una dama, due pezzi impilati, e una pedina nera.
  dama: (
    <g>
      <g transform="rotate(-8 60 60)">
        {Array.from({ length: 16 }, (_, k) => {
          const r = Math.floor(k / 4)
          const c = k % 4
          return (
            <rect
              key={k}
              x={24 + c * 18}
              y={24 + r * 18}
              width={18}
              height={18}
              fill="#fff"
              fillOpacity={(r + c) % 2 === 1 ? 0.3 : 0.08}
            />
          )
        })}
      </g>
      {[
        { x: 42, y: 76, bianca: true, dama: true },
        { x: 80, y: 46, bianca: false, dama: false },
      ].map((p) => (
        <g key={p.x}>
          {(p.dama ? [0, 1] : [0]).map((piano) => {
            const y = p.y - piano * 9
            return (
              <g key={piano}>
                <ellipse cx={p.x} cy={y + 5} rx={17} ry={8} fill="#000" fillOpacity={0.14} />
                <path
                  d={`M${p.x - 17} ${y}v5a17 8 0 0 0 34 0v-5z`}
                  fill={p.bianca ? '#fff' : 'var(--c2)'}
                  fillOpacity={p.bianca ? 0.7 : 1}
                />
                <ellipse cx={p.x} cy={y} rx={17} ry={8} fill={p.bianca ? '#fff' : 'var(--c2)'} />
                <ellipse
                  cx={p.x}
                  cy={y}
                  rx={11}
                  ry={5}
                  fill="none"
                  stroke={p.bianca ? 'var(--c2)' : '#fff'}
                  strokeOpacity={p.bianca ? 0.35 : 0.45}
                  strokeWidth={1.6}
                />
              </g>
            )
          })}
        </g>
      ))}
    </g>
  ),

  // La griglia del Forza 4: i dischi di due colori, e uno che cade.
  forza4: (
    <g>
      {(() => {
        const buchi = [] as string[]
        for (let r = 0; r < 4; r += 1) {
          for (let c = 0; c < 5; c += 1) {
            const cx = 26 + c * 17
            const cy = 50 + r * 15.5
            buchi.push(`M${cx - 6} ${cy}a6 6 0 1 0 12 0a6 6 0 1 0-12 0z`)
          }
        }
        // I dischi giocati: 1 i bianchi, 2 quelli dell'altro, ad anello.
        const pedine: Record<string, 1 | 2> = { '3-1': 1, '3-2': 2, '3-3': 1, '2-2': 1, '2-3': 2, '3-4': 2, '1-3': 1 }
        return (
          <g>
            {Object.entries(pedine).map(([k, v]) => {
              const [r, c] = k.split('-').map(Number)
              return v === 1 ? (
                <circle key={k} cx={26 + c * 17} cy={50 + r * 15.5} r={6.4} fill="#fff" fillOpacity={0.95} />
              ) : (
                <circle
                  key={k}
                  cx={26 + c * 17}
                  cy={50 + r * 15.5}
                  r={4.6}
                  fill="var(--c2)"
                  stroke="#fff"
                  strokeWidth={2.2}
                  strokeOpacity={0.9}
                />
              )
            })}
            <path
              d={`M20 40h80a6 6 0 0 1 6 6v57a6 6 0 0 1-6 6H20a6 6 0 0 1-6-6V46a6 6 0 0 1 6-6z${buchi.join('')}`}
              fill="#fff"
              fillOpacity={0.3}
              fillRule="evenodd"
            />
            <circle cx={43} cy={22} r={6.4} fill="#fff" />
            <path
              d="M43 31v4M39 32.5l1.4 2.2M47 32.5l-1.4 2.2"
              stroke="#fff"
              strokeOpacity={0.6}
              strokeWidth={1.8}
              strokeLinecap="round"
            />
          </g>
        )
      })()}
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

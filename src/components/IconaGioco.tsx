import { memo } from 'react'
import type { GiocoClassificato, GiocoDaTavolo } from '@shared/types'
import './IconaGioco.css'

/** I giochi, i giochi della Fortuna, la Fortuna stessa e la classifica generale (la coppa). */
export type SoggettoIcona =
  | GiocoClassificato
  | GiocoDaTavolo
  | 'ruota'
  | 'slot'
  | 'blackjack'
  | 'roulette'
  | 'superenalotto'
  | 'fortuna'
  | 'generale'
  | 'trofeo'

/**
 * L'adesivo di un gioco: un disegno a colori con il contorno d'inchiostro e il
 * bordo bianco ritagliato attorno, come sulle figurine. Su una griglia di 48.
 *
 * Il bordo bianco e l'ombra non sono filtri: sono lo stesso disegno ripetuto
 * sotto, una volta con un tratto bianco largo e una spostato in basso e
 * velato. Un `drop-shadow` per lato, come nel prototipo, voleva cinque filtri
 * per icona, ridisegnati a ogni fotogramma di un'icona che galleggia.
 *
 * A `linea` resta il solo contorno, chiaro e trasparente: e' il posto vuoto
 * dell'album, il gioco che oggi non si e' ancora fatto.
 */
export const IconaGioco = memo(function IconaGioco({
  gioco,
  lato = 40,
  linea = false,
  giro = 0,
  fluttua = false,
  ritardo = 0,
  fluido = false,
  className = '',
}: {
  gioco: SoggettoIcona
  /** In punti: la misura, e lo spessore del bordo bianco. */
  lato?: number
  /** La misura la decide il CSS di chi la contiene: `lato` dice solo lo spessore del bordo. */
  fluido?: boolean
  linea?: boolean
  /** Di quanti gradi e' storto l'adesivo. */
  giro?: number
  /** Galleggia piano su e giu' (solo a colori). */
  fluttua?: boolean
  /** In secondi: le icone vicine non galleggiano tutte insieme. */
  ritardo?: number
  className?: string
}) {
  const pezzi = DISEGNI[gioco === 'generale' ? 'trofeo' : gioco] ?? DISEGNI.wordle
  // Il bordo bianco cresce con l'icona: a 24 punti e' un filo, a 96 un bordo vero. In unita' della griglia.
  const bordo = (Math.min(3.4, Math.max(1.2, lato * 0.04)) * 48) / lato
  const classi = ['icona-gioco', linea ? 'icona-gioco--linea' : '', fluttua && !linea ? 'icona-gioco--fluttua' : '', className]
  return (
    <span
      className={classi.filter(Boolean).join(' ')}
      style={{
        width: fluido ? undefined : lato,
        height: fluido ? undefined : lato,
        animationDelay: ritardo ? `${ritardo}s` : undefined,
      }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 48 48"
        width={fluido ? undefined : lato}
        height={fluido ? undefined : lato}
        style={giro ? { transform: `rotate(${giro}deg)` } : undefined}
      >
        {linea ? (
          pezzi.map((p, i) => (p.luce || p.soloB || p.s === 'none' ? null : <PezzoLinea key={i} p={p} />))
        ) : (
          <>
            <g className="icona-gioco__ombra" transform={`translate(0 ${(bordo * 1.2).toFixed(2)})`}>
              {pezzi.map((p, i) => (p.soloLinea ? null : <Sagoma key={i} p={p} bordo={bordo} />))}
            </g>
            <g className="icona-gioco__bordo">
              {pezzi.map((p, i) => (p.soloLinea ? null : <Sagoma key={i} p={p} bordo={bordo} />))}
            </g>
            {pezzi.map((p, i) => (p.soloLinea ? null : <Pezzo key={i} p={p} />))}
          </>
        )}
      </svg>
    </span>
  )
})

const INK = '#2A1F5C'
const W = '#FFFDF7'

interface P {
  d: string
  /** Il riempimento. */
  f: string
  /** Il tratto, se non e' l'inchiostro. */
  s?: string
  /** La larghezza del tratto. */
  w?: number
  /** La larghezza del tratto a linea. */
  wa?: number
  t?: string
  da?: string
  /** Solo a colori: l'acqua, il fumo. */
  soloB?: boolean
  /** Solo a linea: le onde senza il fondo. */
  soloLinea?: boolean
  /** I riflessi, che a linea non ci sono. */
  luce?: boolean
  /** A linea si riempie d'inchiostro. */
  pieno?: boolean
}

function Pezzo({ p }: { p: P }) {
  return (
    <path
      d={p.d}
      transform={p.t}
      fill={p.f}
      stroke={p.s ?? INK}
      strokeWidth={p.w ?? 2.2}
      strokeDasharray={p.da}
    />
  )
}

/** Il pezzo pieno e allargato del suo bordo: sotto il disegno fa il ritaglio bianco, e piu' sotto l'ombra. */
function Sagoma({ p, bordo }: { p: P; bordo: number }) {
  const pieno = p.f !== 'none'
  return (
    <path
      d={p.d}
      transform={p.t}
      fill={pieno ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={(p.w ?? 2.2) + bordo * 2}
    />
  )
}

/** A linea i contorni nel colore della linea, con le forme piene del fondo: quel che sta davanti copre quel che sta dietro. */
function PezzoLinea({ p }: { p: P }) {
  const pieno = p.pieno || p.f === INK
  return (
    <path
      d={p.d}
      transform={p.t}
      fill={p.f === 'none' ? 'none' : pieno ? 'var(--icona-linea)' : 'var(--icona-fondo)'}
      stroke="var(--icona-linea)"
      strokeWidth={p.wa ?? Math.max(p.w ?? 2.2, 2)}
      strokeDasharray={p.da}
    />
  )
}

const rr = (x: number, y: number, w: number, h: number, r: number) =>
  `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(w - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}z`
const tondo = (x: number, y: number, r: number) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`
const ovale = (x: number, y: number, rx: number, ry: number) =>
  `M${x - rx} ${y}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0z`
const P = (d: string, f: string, o: Partial<P> = {}): P => ({ d, f, ...o })
const punto = (cx: number, cy: number, r: number, a: number) => {
  const g = (a * Math.PI) / 180
  return [+(cx + r * Math.sin(g)).toFixed(2), +(cy - r * Math.cos(g)).toFixed(2)]
}
const spicchio = (cx: number, cy: number, r: number, a0: number, a1: number) => {
  const [x0, y0] = punto(cx, cy, r, a0)
  const [x1, y1] = punto(cx, cy, r, a1)
  return `M${cx} ${cy}L${x0} ${y0}A${r} ${r} 0 0 1 ${x1} ${y1}z`
}
const onde =
  'M4 37c2.5 0 2.5-2.5 5-2.5s2.5 2.5 5 2.5 2.5-2.5 5-2.5 2.5 2.5 5 2.5 2.5-2.5 5-2.5 2.5 2.5 5 2.5 2.5-2.5 5-2.5 2.5 2.5 5 2.5'
const FOGLIA = 'M24 22.5c-3.6-2.8-8.6-6.6-6.6-10.8 1.6-3.4 6-2.6 6.6.6.6-3.2 5-4 6.6-.6 2 4.2-3 8-6.6 10.8z'

/** I disegni, gli stessi del prototipo: ogni pezzo il suo colore, l'inchiostro per i contorni. */
const DISEGNI: Record<Exclude<SoggettoIcona, 'generale'>, P[]> = {
  wordle: [
    P(rr(4, 10, 12, 12, 3), '#DAD6E8'),
    P(rr(18, 10, 12, 12, 3), '#FFC93C'),
    P(rr(32, 10, 12, 12, 3), '#DAD6E8'),
    P(rr(4, 26, 12, 12, 3), '#5EDB84'),
    P(rr(18, 26, 12, 12, 3), '#5EDB84'),
    P(rr(32, 26, 12, 12, 3), '#5EDB84'),
  ],
  cruciverba: [
    P(rr(5, 5, 38, 38, 5), W, { s: 'none' }),
    P('M5 24h38v9.5H5z', '#BFD4FF', { s: 'none' }),
    P('M14.5 14.5h9.5v9.5h-9.5z', INK),
    P('M24 33.5h9.5v9.5H24z', INK),
    P('M14.5 5v38M24 5v38M33.5 5v38M5 14.5h38M5 24h38M5 33.5h38', 'none', { w: 1.5, wa: 1.5 }),
    P(rr(5, 5, 38, 38, 5), 'none', { w: 2.6 }),
  ],
  scarabeo: [
    P(rr(7, 9, 22, 24, 4), '#E8B464', { t: 'rotate(-12 18 21)' }),
    P(rr(17, 12, 24, 27, 4.5), '#FFD98A'),
    P(
      'M33.6 19.6c-1-1.6-2.6-2.4-4.5-2.4-2.6 0-4.4 1.4-4.4 3.4s1.7 2.8 4.6 3.4c2.9.6 4.7 1.6 4.7 3.8 0 2.2-2 3.7-4.8 3.7-2 0-3.9-.9-4.9-2.6',
      'none',
      { w: 2.6 },
    ),
    P('M37.4 32.6v4', 'none', { w: 1.8 }),
  ],
  sudoku: [
    P(rr(5, 5, 38, 38, 5), W, { s: 'none' }),
    P('M17.7 17.7h12.6v12.6H17.7z', '#E3D3FF', { s: 'none' }),
    P('M17.7 5v38M30.3 5v38M5 17.7h38M5 30.3h38', 'none', { w: 1.8 }),
    P('M9.6 9.4l2.2-1.5v7.8', 'none', { w: 2.2 }),
    P('M21 20.6h6l-3.4 7.4', 'none', { w: 2.2, s: '#6D28C9' }),
    P('M38.2 40.6v-8.2l-5 5.6h6.6', 'none', { w: 2.2 }),
    P(rr(5, 5, 38, 38, 5), 'none', { w: 2.6 }),
  ],
  quiz: [
    P('M24 6c10.5 0 19 7 19 16s-8.5 16-19 16c-2.2 0-4.3-.3-6.2-.9L9 41l2.3-7.4C7.6 30.7 5 26.6 5 22 5 13 13.5 6 24 6z', '#FF86AE'),
    P('M19.6 17.6a4.6 4.6 0 1 1 6.4 4.3c-1.3.6-2 1.6-2 3v.8', 'none', { s: W, w: 3.4 }),
    P('M24 30.8v.4', 'none', { s: W, w: 3.6 }),
    P('M40 3.5l1.1 2.6 2.6 1.1-2.6 1.1L40 11l-1.1-2.7-2.6-1.1 2.6-1.1z', '#FFD84D', { w: 1.6 }),
  ],
  ghigliottina: [
    P(rr(8, 3, 32, 5.5, 1.8), '#C88A52'),
    P('M11 8.5h5V40h-5z', '#E3A86B'),
    P('M32 8.5h5V40h-5z', '#E3A86B'),
    P('M24 8.5v3', 'none', { w: 1.8 }),
    P('M16 11.5h16v6L16 23.5z', '#DCE3F2'),
    P('M16 28h16v6H16z', '#E3A86B'),
    P('M21.4 28a2.6 2.6 0 0 0 5.2 0z', INK),
    P(rr(5, 39.5, 38, 5, 2), '#C88A52'),
  ],
  anagrammi: [
    P(rr(4, 20, 16, 16, 3.5), '#FFE2C9', { t: 'rotate(-10 12 28)' }),
    P('M8.6 32l3.4-8 3.4 8M9.9 29h4.2', 'none', { w: 2.2, t: 'rotate(-10 12 28)' }),
    P(rr(28, 20, 16, 16, 3.5), '#FFE2C9', { t: 'rotate(9 36 28)' }),
    P('M33 32v-8h3a2.3 2.3 0 0 1 0 4.6h-3M36 28.6l2.6 3.4', 'none', { w: 2.2, t: 'rotate(9 36 28)' }),
    P('M12.5 15.5c3.5-7 19.5-7 23 0', 'none', { s: '#E8672F', w: 2.6 }),
    P('M31.6 15.4l3.9.7.8-3.8', 'none', { s: '#E8672F', w: 2.6 }),
    P('M35.5 40.5c-3.5 7-19.5 7-23 0', 'none', { s: '#E8672F', w: 2.6 }),
    P('M16.4 40.6l-3.9-.7-.8 3.8', 'none', { s: '#E8672F', w: 2.6 }),
  ],
  catena: [
    P(rr(19, 17, 25, 14, 7), '#FFC93C', { t: 'rotate(-32 24 24)' }),
    P(rr(24, 21.5, 15, 5, 2.5), W, { t: 'rotate(-32 24 24)' }),
    P(rr(4, 17, 25, 14, 7), '#6E97FF', { t: 'rotate(-32 24 24)' }),
    P(rr(9, 21.5, 15, 5, 2.5), W, { t: 'rotate(-32 24 24)' }),
  ],
  nomi: [
    P(rr(7, 5, 27, 37, 3.5), W),
    P('M7 8.5A3.5 3.5 0 0 1 10.5 5h20A3.5 3.5 0 0 1 34 8.5V13H7z', '#FFD234'),
    P('M12 20h17M12 26h17M12 32h10', 'none', { s: '#B8B2D6', w: 1.8 }),
    P('M26.5 38.5L38 27l4 4-11.5 11.5z', '#FFC93C'),
    P('M26.5 38.5l-1.6 5.6 5.6-1.6z', '#FFE7C2'),
    P('M38 27l2-2a2.83 2.83 0 0 1 4 4l-2 2z', '#FF86AE'),
  ],
  paroliere: [
    P('M24 5l17 8-17 8-17-8z', '#C8F0A8'),
    P('M7 13l17 8v22L7 35z', '#9BDF6E'),
    P('M41 13L24 21v22l17-8z', '#6CC644'),
    P('M12.6 34.5V24.6l3.6 1.7c1.9.9 2.6 2.6 1.7 3.9-.9 1.2-2.6 1.4-4.3.6l-1-.4', 'none', { w: 2 }),
    P('M28.5 28l8-3.8M32.5 26.2v10.4', 'none', { w: 2 }),
  ],
  battaglia: [
    P('M21 19V8.5', 'none'),
    P('M21 8.5l7 3-7 3z', '#FFC93C', { w: 1.8 }),
    P(tondo(34, 10, 2.2) + tondo(37.6, 6.4, 1.7), '#E3E8F4', { w: 1.6, soloB: true }),
    P('M30 14h5v13h-5z', '#FF7B6B'),
    P('M15 19h12v8H15z', '#DCE3F2'),
    P('M6 27h36l-5 9H11z', '#8C98B0'),
    P('M18.5 23h.1M23.5 23h.1M14 31h.1M20 31h.1M26 31h.1M32 31h.1', 'none', { w: 2.4 }),
    P(onde + 'V44H4z', '#7CD3EE', { soloB: true }),
    P(onde, 'none', { soloLinea: true }),
  ],
  scacchi: [
    P(rr(11, 37.5, 26, 6, 2.2), '#6F7A90'),
    P(rr(14.5, 33, 19, 5, 1.8), '#9AA4B8'),
    P('M16 33c0-5 2-8 5-11l-5-2c-1.6-.6-2.2-2.4-1.2-3.8L20 9c1-1.5 2.6-2.2 4.2-2l.8-3 2.6 3.2C33 9 36 14.5 36 21v12z', '#B9C2D6'),
    P('M30.4 11.6c2.4 2 3.8 5.2 3.8 8.8', 'none', { s: W, w: 1.6, luce: true }),
    P('M22.6 13.6v.4', 'none', { w: 2.8 }),
    P('M17.3 18.6v.2', 'none', { w: 2.2 }),
  ],
  dama: [
    P('M8 30v5.5c0 3.3 7.2 6 16 6s16-2.7 16-6V30z', '#D9454A'),
    P(ovale(24, 30, 16, 6), '#FF7B7E'),
    P('M10 21v5c0 3 6.3 5.4 14 5.4s14-2.4 14-5.4v-5z', '#E0C9A6'),
    P(ovale(24, 21, 14, 5.2), '#FFF4E0'),
    P('M17.5 19.5l1.4-7 3.6 3.6L24 10.5l1.5 5.6 3.6-3.6 1.4 7z', '#FFD84D', { w: 1.8 }),
  ],
  forza4: [
    P(tondo(34, 6.5, 4.2), '#FFC93C'),
    P(rr(4, 13, 40, 30, 4), '#4D8DF7'),
    P(tondo(14, 22, 4.4), '#DCE6FF'),
    P(tondo(24, 22, 4.4), '#FFC93C'),
    P(tondo(34, 22, 4.4), '#DCE6FF'),
    P(tondo(14, 34, 4.4), '#FF5C6B'),
    P(tondo(24, 34, 4.4), '#FFC93C'),
    P(tondo(34, 34, 4.4), '#FF5C6B'),
  ],
  go: [
    P(rr(5, 5, 38, 38, 4), '#F2C78A'),
    P('M14 5v38M24 5v38M34 5v38M5 14h38M5 24h38M5 34h38', 'none', { s: '#B07A3A', w: 1.4, wa: 1.4 }),
    P(tondo(14, 24, 5.2), '#3A3550', { pieno: true }),
    P(tondo(24, 34, 5.2), '#3A3550', { pieno: true }),
    P(tondo(24, 24, 5.2), W),
    P(tondo(34, 14, 5.2), W),
    P('M11.6 21.8a3.4 3.4 0 0 1 3-1.2', 'none', { s: W, w: 1.3, luce: true }),
  ],
  tris: [
    P('M18 6v36M30 6v36M6 18h36M6 30h36', 'none', { w: 3 }),
    P('M8.5 8.5l7 7M15.5 8.5l-7 7', 'none', { s: '#FF5C9A', w: 3.4 }),
    P(tondo(36, 12, 4.2), 'none', { s: '#4D8DF7', w: 3.2 }),
    P(tondo(24, 24, 4.2), 'none', { s: '#4D8DF7', w: 3.2 }),
    P('M32.5 32.5l7 7M39.5 32.5l-7 7', 'none', { s: '#FF5C9A', w: 3.4 }),
  ],
  sequenze: [
    P(rr(21, 4, 11, 11, 2.8), '#E3E0F5'),
    P(rr(6, 28, 11, 11, 2.8), '#E3E0F5'),
    P('M9.5 10.5L39.5 20.5 30.5 36.5', 'none', { s: '#5A46E0', w: 2.2, da: '3 3.4' }),
    P(rr(4, 5, 11, 11, 2.8), '#2ED3E6', { pieno: true }),
    P(rr(34, 15, 11, 11, 2.8), '#2ED3E6', { pieno: true }),
    P(rr(25, 31, 11, 11, 2.8), '#2ED3E6', { pieno: true }),
    P('M7.4 8.6a2.4 2.4 0 0 1 2.2-1.2M37.4 18.6a2.4 2.4 0 0 1 2.2-1.2M28.4 34.6a2.4 2.4 0 0 1 2.2-1.2', 'none', {
      s: W,
      w: 1.4,
      luce: true,
    }),
  ],
  indovina: [
    P(rr(9, 5, 30, 38, 5), '#FFE3DE'),
    P('M13 43c.6-5.4 5-9 11-9s10.4 3.6 11 9z', '#7CC4FF'),
    P(tondo(24, 25, 8.5), '#FFD2A8'),
    P('M15.6 23.5c0-5.4 3.8-8.5 8.4-8.5s8.4 3.1 8.4 8.5c-2.8-.2-6.2-1.6-8-4-1.8 2.4-5.6 3.8-8.8 4z', '#8A5A3C'),
    P('M20.8 26.6v.4M27.2 26.6v.4', 'none', { w: 2.6 }),
    P('M21 29.6c1.7 1.6 4.3 1.6 6 0', 'none', { w: 1.8 }),
    P(tondo(36.5, 9.5, 6.3), '#FF6A5C'),
    P('M34.5 8.2a2 2 0 1 1 2.9 1.8c-.6.3-.9.7-.9 1.3v.3M36.5 13.6v.1', 'none', { s: W, w: 1.9 }),
  ],
  lupus: [
    P(tondo(31, 15, 11), '#FFE38A'),
    P(tondo(35, 10.5, 2) + tondo(37.6, 18, 1.4), '#F5CD57', { s: 'none' }),
    P('M4.6 5.4l.8 1.8 1.8.8-1.8.8-.8 1.8-.8-1.8-1.8-.8 1.8-.8z', W, { w: 1.3 }),
    P('M9 16l5 8h8l5-8 2 12c0 5.6-3 10-7.4 13L18 43.6 14.4 41C10 38 7 33.6 7 28z', '#6B6F9E'),
    P('M14 33.5c0-2.6 1.8-4 4-4s4 1.4 4 4c0 2.6-1.8 5-4 5s-4-2.4-4-5z', '#C9CDE8'),
    P('M10.6 27.4l4.2 1.4-2.4 1.6zM25.4 27.4l-4.2 1.4 2.4 1.6z', '#FFE38A', { w: 1.5, pieno: true }),
    P('M16.4 32.4h3.2l-1.6 2z', INK, { w: 1.5 }),
  ],
  scarabocchi: [
    P(rr(5, 7, 31, 28, 3), W, { s: 'none' }),
    P('M5 31c4-3 8.5-3.2 13-1s9 2 18-1.5V32a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3z', '#B5EBA0', { s: 'none' }),
    P(tondo(13, 14.5, 3), '#FFC93C', { w: 1.8 }),
    P('M11.5 24c2.4-3.6 4.8-4 6.4-1.2 1.6 2.8 4.2 3 6.4-.2 1.5-2.2 3.6-2.8 5.8-1.4', 'none', { s: '#FF5C9A', w: 2.6 }),
    P(rr(5, 7, 31, 28, 3), 'none', { w: 2.4 }),
    P('M28.5 39.5l11-11 4 4-11 11z', '#5AB8FF'),
    P('M28.5 39.5L27.3 44.7l5.2-1.2z', '#FFE7C2'),
    P('M36.5 31.5l4 4', 'none', { w: 1.8 }),
  ],
  ruota: [
    ...['#FFC93C', '#FF5C9A', '#4D8DF7', '#5EDB84', '#FF8A3D', '#9B7BFF'].map((c, i) =>
      P(spicchio(24, 27, 17, i * 60 - 30, i * 60 + 30), c, { w: 1.6 }),
    ),
    P(tondo(24, 27, 17), 'none', { w: 2.6 }),
    P(tondo(24, 27, 4.6), W),
    P('M19.5 3.5h9l-4.5 8z', '#FF5C6B', { w: 2 }),
  ],
  slot: [
    P(rr(5, 9.5, 36, 33, 5), '#FF4FA3'),
    P('M41 16h3v12h-3z', '#DCE3F2', { w: 1.8 }),
    P(tondo(42.5, 12.6, 3), '#FF5C6B', { w: 2 }),
    P(rr(12, 3.5, 24, 8, 3), '#FFC93C', { w: 2 }),
    P('M17 7.5h.1M22 7.5h.1M27 7.5h.1M32 7.5h.1', 'none', { s: W, w: 2.2, luce: true }),
    P(rr(9, 15, 28, 15, 2.5), W),
    P('M18.3 15v15M27.7 15v15', 'none', { w: 1.8 }),
    P([13.6, 23, 32.4].map((x) => `M${(x - 2.2).toFixed(1)} 18.8h4.4l-2.6 7.6`).join(''), 'none', { s: '#E5383B', w: 2.2 }),
    P(rr(10, 34, 26, 5, 2), '#C02A7E', { w: 1.8 }),
  ],
  blackjack: [
    P(rr(6, 9, 20, 28, 3), W, { t: 'rotate(-12 16 23)' }),
    P('M16 16c-2.4 3-6 5-6 8a3 3 0 0 0 5.2 2l-1 3.4h3.6l-1-3.4A3 3 0 0 0 22 24c0-3-3.6-5-6-8z', INK, {
      w: 1.4,
      t: 'rotate(-12 16 23)',
    }),
    P(rr(21, 10, 21, 29, 3), W, { t: 'rotate(10 31.5 24.5)' }),
    P('M31.5 33c-4.6-3-7-5.6-7-8.4a3.6 3.6 0 0 1 7-1.2 3.6 3.6 0 0 1 7 1.2c0 2.8-2.4 5.4-7 8.4z', '#E5383B', {
      w: 1.6,
      t: 'rotate(10 31.5 24.5)',
      pieno: true,
    }),
    P('M24.4 19l2-5.4 2 5.4M25.1 17.2h2.6', 'none', { s: '#E5383B', w: 1.8, t: 'rotate(10 31.5 24.5)' }),
  ],
  roulette: [
    P(tondo(24, 24, 19.5), '#C88A52'),
    P(tondo(24, 24, 15.5), '#2A2440'),
    P(tondo(24, 24, 12.8), 'none', { s: '#E5383B', w: 4.6, da: '5.03 5.03', wa: 3 }),
    P(tondo(24, 24, 9), '#E3A86B'),
    P('M24 16.5v15M16.5 24h15', 'none', { s: '#FFD84D', w: 2.6 }),
    P(tondo(24, 24, 2.8), '#FFD84D', { w: 1.8 }),
    P(tondo(36, 12, 2.6), W, { w: 1.8 }),
  ],
  superenalotto: [
    P(tondo(24, 14, 9.5), '#7DE89A'),
    P(tondo(14, 30, 10), '#8DB6FF'),
    P(tondo(34, 30, 10), '#FFD84D'),
    P(tondo(24, 14, 5) + tondo(14, 30, 5.3) + tondo(34, 30, 5.3), W, { s: 'none' }),
    P(
      'M22.8 12.2l1.8-1.4v6.6M11.8 27.2h4.4l-2.6 6M32 27.4c.6-.6 1.3-.8 2-.8 1.3 0 2.2.8 2.2 1.8s-.9 1.7-2.2 1.7c1.4 0 2.4.8 2.4 1.9s-1 1.9-2.4 1.9c-.8 0-1.5-.3-2.1-.9',
      'none',
      { w: 1.7 },
    ),
    P('M18.2 10a7 7 0 0 1 3-3M7.6 25.6a7 7 0 0 1 3-3M27.6 25.6a7 7 0 0 1 3-3', 'none', { s: W, w: 1.6, luce: true }),
  ],
  // Il quadrifoglio della Fortuna: quattro foglie a cuore, verdi alternate, e il gambo.
  fortuna: [
    P('M25.5 25.5c3 4.6 5 10 4.4 16.5', 'none', { s: '#3E9E5E', w: 2.6 }),
    ...[0, 90, 180, 270].map((g) => P(FOGLIA, g % 180 === 0 ? '#5EDB84' : '#8BE6A4', { t: `rotate(${g} 24 24)` })),
    P(tondo(24, 24, 2.4), '#FFD84D', { w: 1.6 }),
  ],
  // La coppa della classifica e della giornata finita.
  trofeo: [
    P('M14 12H8.5a4.5 4.5 0 0 0 4.5 8.5M34 12h5.5A4.5 4.5 0 0 1 35 20.5', 'none', { w: 2.6 }),
    P('M21 27h6v7h-6z', '#F2B33D'),
    P('M13 6h22v10c0 7-4.6 12-11 12S13 23 13 16z', '#FFD24A'),
    P('M17.6 10v5.6c0 3 1.3 5.4 3.3 6.9', 'none', { s: W, w: 2, luce: true }),
    P('M24 10.5l1.4 2.9 3.2.5-2.3 2.2.5 3.2-2.8-1.5-2.8 1.5.5-3.2-2.3-2.2 3.2-.5z', W, { w: 1.4 }),
    P(rr(13, 34, 22, 8, 2.5), '#C88A52'),
  ],
}

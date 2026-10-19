import { memo, type CSSProperties, type ReactNode } from 'react'
import './IconaFortuna.css'

/** I giochi della Fortuna; la ruota e' Crazy Time. */
export type GiocoIconaFortuna = 'ruota' | 'slot' | 'blackjack' | 'roulette' | 'superenalotto'

/**
 * Il disegno grande di un gioco della Fortuna, quello delle carte della sala:
 * strati di disegni su una griglia di 48, uno sopra l'altro, ognuno con il suo
 * movimento. La ruota gira e si ferma con la lancetta che scatta, la leva della
 * slot si tira e i rulli si fermano sul 7, le carte galleggiano, la roulette
 * inclinata gira con la pallina, le palline del SuperEnalotto saltano.
 *
 * Si muovono solo `transform` e `opacity`, e uno strato che si muove ha il suo
 * `will-change`: il telefono lo disegna una volta, ombra compresa, e poi lo
 * sposta. Cinque icone stanno sulla stessa schermata. Per questo l'ombra delle
 * carte e' sul disegno e non sullo strato che galleggia, e lo spessore di legno
 * della roulette non e' un filtro: e' la sagoma della conca ripetuta sotto e
 * spostata, come il bordo delle figurine di `IconaGioco`. Due `drop-shadow`
 * attorno a una ruota che gira si rifarebbero a ogni fotogramma.
 *
 * `ferma` la tiene immobile, nella posa in cui ogni movimento riparte.
 */
export const IconaFortuna = memo(function IconaFortuna({
  gioco,
  lato,
  ferma = false,
  className = '',
}: {
  gioco: GiocoIconaFortuna
  /** In punti: e' quadrata. */
  lato: number
  /** Senza movimento, per esempio sulla carta di un gioco che non si puo' giocare. */
  ferma?: boolean
  className?: string
}) {
  const g = GIOCHI[gioco] ?? GIOCHI.ruota
  // Il blackjack e' piatto: le forme senza contorno e un'ombra secca, che cresce con l'icona.
  const ombra = g.piatta ? `drop-shadow(0 ${(lato / 47).toFixed(2)}px 0 rgba(18,12,43,.28))` : undefined
  const classi = ['ifo-icona', ferma ? 'ifo-icona--ferma' : '', className].filter(Boolean).join(' ')
  return (
    <span className={classi} style={{ width: lato, height: lato }} aria-hidden="true">
      {g.inclinata && <Spessore lato={lato} />}
      <span className="ifo-piano" style={g.inclinata ? { transform: PIANO } : undefined}>
        {g.dietro.map((s, i) => (
          <DisegnoStrato key={i} s={s} piatta={g.piatta} ombra={ombra} />
        ))}
        {g.rulli && <Rulli lato={lato} />}
        {g.davanti?.map((s, i) => (
          <DisegnoStrato key={i} s={s} piatta={g.piatta} ombra={ombra} />
        ))}
      </span>
    </span>
  )
})

const INK = '#2A1F5C'
const W = '#FFFDF7'
/** La roulette si vede dal tavolo, inclinata. */
const PIANO = 'perspective(320px) rotateX(56deg)'

type Animazione =
  | 'luci-a'
  | 'luci-b'
  | 'gira-ferma'
  | 'premio'
  | 'tic'
  | 'tira'
  | 'lampeggia'
  | 'scintilla'
  | 'galleggia'
  | 'gira-svelta'
  | 'orbita'
  | 'saltella'

interface Pezzo {
  d: string
  /** Il riempimento. */
  f: string
  /** Il tratto, se non e' l'inchiostro. */
  s?: string
  /** La larghezza del tratto. */
  w?: number
  t?: string
  da?: string
}

interface Strato {
  pezzi: Pezzo[]
  anima?: Animazione
  /** Il centro su cui gira, in percentuali dello strato. */
  origine?: string
  /** In secondi. */
  ritardo?: number
  /** In gradi: quanto e' storto lo strato che galleggia. */
  piega?: number
}

interface Gioco {
  dietro: Strato[]
  /** Sopra i rulli. */
  davanti?: Strato[]
  rulli?: boolean
  piatta?: boolean
  inclinata?: boolean
}

function DisegnoStrato({ s, piatta, ombra }: { s: Strato; piatta?: boolean; ombra?: string }) {
  const stile = {
    transformOrigin: s.origine,
    animationDelay: s.ritardo ? `${s.ritardo}s` : undefined,
    '--ifo-r': s.piega ? `${s.piega}deg` : undefined,
  } as CSSProperties
  return (
    <span className={s.anima ? `ifo-strato ifo-${s.anima}` : 'ifo-strato'} style={stile}>
      <svg viewBox="0 0 48 48" style={ombra ? { filter: ombra } : undefined}>
        {s.pezzi.map((p, i) => (
          <path
            key={i}
            d={p.d}
            transform={p.t}
            fill={p.f}
            stroke={piatta && p.f !== 'none' ? 'none' : (p.s ?? INK)}
            strokeWidth={p.w ?? 2.2}
            strokeDasharray={p.da}
          />
        ))}
      </svg>
    </span>
  )
}

/**
 * Lo spessore della roulette: il prototipo lo faceva con due `drop-shadow` sul
 * piano inclinato, il legno e sotto il filo d'inchiostro. Sono la sagoma della
 * conca, che e' quella di tutto il disegno, ripetuta e spostata sullo schermo
 * (il `translateY` prima della prospettiva): ferme, si disegnano una volta.
 */
function Spessore({ lato }: { lato: number }) {
  const k = lato / 124
  const legno = +(7 * k).toFixed(1)
  const filo = +(2.5 * k).toFixed(1)
  return (
    <>
      <Sagoma y={filo} colore="#120C2B" />
      <Sagoma y={legno + filo} colore="#120C2B" />
      <Sagoma y={legno} colore="#8A5A2C" />
    </>
  )
}

/** La conca col suo contorno: raggio 21 e meta' del tratto. */
const CONCA = 21 + 2.2 / 2

function Sagoma({ y, colore }: { y: number; colore: string }) {
  return (
    <span className="ifo-spessore" style={{ transform: `translateY(${y}px) ${PIANO}` }}>
      <svg viewBox="0 0 48 48">
        <circle cx="24" cy="24" r={CONCA} fill={colore} />
      </svg>
    </span>
  )
}

type Simbolo = '7' | 'b' | 'c' | 'l'

/** I rulli della slot: tre strisce che scorrono nella finestra e si fermano sul 7, una dopo l'altra. */
const SEQUENZE: Simbolo[][] = [
  ['l', '7', 'c', 'b', 'l', '7', 'c', 'b', 'l', '7'],
  ['c', '7', 'b', 'l', 'c', '7', 'b', 'l', 'c', '7'],
  ['b', '7', 'l', 'c', 'b', '7', 'l', 'c', 'b', '7'],
]

const SIMBOLI: Record<Simbolo, ReactNode> = {
  '7': <span className="ifo-sette">7</span>,
  b: <span className="ifo-bar">BAR</span>,
  c: (
    <svg className="ifo-simbolo" viewBox="0 0 24 24">
      <path
        d="M15 3C12 5 9 8 8 11.5M15 3c.5 3 1 6 1.5 9.5"
        fill="none"
        stroke="#2F9E44"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path d="M15 3c2-1.6 4.6-1.6 6.2 0-1.6 1.8-4.2 2-6.2 0z" fill="#5EDB84" stroke={INK} strokeWidth="1.2" />
      <circle cx="8" cy="16" r="4.6" fill="#E5383B" stroke={INK} strokeWidth="1.6" />
      <circle cx="16.5" cy="17.2" r="4.6" fill="#E5383B" stroke={INK} strokeWidth="1.6" />
    </svg>
  ),
  l: (
    <svg className="ifo-simbolo" viewBox="0 0 24 24">
      <ellipse
        cx="12"
        cy="12.5"
        rx="8.6"
        ry="6.4"
        transform="rotate(-25 12 12.5)"
        fill="#FFE14D"
        stroke={INK}
        strokeWidth="1.6"
      />
      <path d="M8.5 11.2c1.2-1.6 3-2.4 4.8-2.4" fill="none" stroke="#FFFFFF" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
}

/** La finestra dei rulli, sopra il fondo bianco della slot e sotto la sua cornice. */
function Rulli({ lato }: { lato: number }) {
  const h = (15 / 48) * lato
  const stile = {
    borderRadius: Math.round((2.5 / 48) * lato),
    '--ifo-sette': `${Math.round(h * 0.8)}px`,
    '--ifo-bar': `${Math.round(h * 0.27)}px`,
    '--ifo-simbolo': `${Math.round(h * 0.58)}px`,
  } as CSSProperties
  return (
    <span className="ifo-rulli" style={stile}>
      {SEQUENZE.map((sequenza, i) => (
        <span key={i} className="ifo-colonna">
          <span className={`ifo-striscia ifo-rullo-${i + 1}`}>
            {sequenza.map((x, j) => (
              <span key={j} className="ifo-cella">
                {SIMBOLI[x]}
              </span>
            ))}
          </span>
        </span>
      ))}
    </span>
  )
}

const rr = (x: number, y: number, w: number, h: number, r: number) =>
  `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(w - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}z`
const tondo = (x: number, y: number, r: number) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`
const stella = (x: number, y: number, r: number) =>
  `M${x} ${y - r}Q${x} ${y} ${x + r} ${y}Q${x} ${y} ${x} ${y + r}Q${x} ${y} ${x - r} ${y}Q${x} ${y} ${x} ${y - r}z`
const P = (d: string, f: string, o: Partial<Pezzo> = {}): Pezzo => ({ d, f, ...o })
const punto = (cx: number, cy: number, r: number, a: number): [number, number] => {
  const g = (a * Math.PI) / 180
  return [+(cx + r * Math.sin(g)).toFixed(2), +(cy - r * Math.cos(g)).toFixed(2)]
}
const spicchio = (cx: number, cy: number, r: number, a0: number, a1: number) => {
  const [x0, y0] = punto(cx, cy, r, a0)
  const [x1, y1] = punto(cx, cy, r, a1)
  return `M${cx} ${cy}L${x0} ${y0}A${r} ${r} 0 0 1 ${x1} ${y1}z`
}
const S = (pezzi: Pezzo[], anima?: Animazione, o: Omit<Strato, 'pezzi' | 'anima'> = {}): Strato => ({
  pezzi,
  anima,
  ...o,
})

/** Le lampadine attorno alla ruota, a posti alterni: le due meta' si accendono a turno. */
const luci = (pari: boolean) => {
  let d = ''
  for (let k = 0; k < 12; k++) {
    if ((k % 2 === 0) !== pari) continue
    const [x, y] = punto(24, 27, 19, k * 30 + 15)
    d += tondo(x, y, 1.5)
  }
  return d
}

/** Dodici spicchi in sei colori: la ruota torna uguale ogni mezzo giro, e si ferma a due giri e mezzo. */
const COLORI_RUOTA = ['#FFC93C', '#FF5C9A', '#4D8DF7', '#5EDB84', '#FF8A3D', '#9B7BFF']

/** La roulette: diciotto caselle, lo zero verde in cima e poi rosse e nere a turno. */
const caselle = (r: number) => {
  const rosse: string[] = []
  const nere: string[] = []
  let verde = ''
  for (let i = 0; i < 18; i++) {
    const d = spicchio(24, 24, r, i * 20 - 10, i * 20 + 10)
    if (i === 0) verde = d
    else (i % 2 ? rosse : nere).push(d)
  }
  return { rosse: rosse.join(''), nere: nere.join(''), verde }
}
const CASELLE = caselle(16.5)

/** Una pallina del SuperEnalotto: il colore, il tondo bianco, il numero e il riflesso. */
const pallina = (cx: number, cy: number, r: number, c: string, rl: number, numero: string, luce: string) => [
  P(tondo(cx, cy, r), c),
  P(tondo(cx, cy, rl), W, { s: 'none' }),
  P(numero, 'none', { w: 1.7 }),
  P(luce, 'none', { s: W, w: 1.6 }),
]

/** Le parti della slot e del blackjack, le stesse delle loro icone piccole. */
const SLOT = {
  corpo: P(rr(5, 9.5, 36, 33, 5), '#FF4FA3'),
  leva: P('M41 16h3v12h-3z', '#DCE3F2', { w: 1.8 }),
  pomo: P(tondo(42.5, 12.6, 3), '#FF5C6B', { w: 2 }),
  insegna: P(rr(12, 3.5, 24, 8, 3), '#FFC93C', { w: 2 }),
  lampadine: P('M17 7.5h.1M22 7.5h.1M27 7.5h.1M32 7.5h.1', 'none', { s: W, w: 2.2 }),
  finestra: P(rr(9, 15, 28, 15, 2.5), W),
  divisori: P('M18.3 15v15M27.7 15v15', 'none', { w: 1.8 }),
  vassoio: P(rr(10, 34, 26, 5, 2), '#C02A7E', { w: 1.8 }),
}
const PICCHE = 'rotate(-12 16 23)'
const CUORI = 'rotate(10 31.5 24.5)'

const GIOCHI: Record<GiocoIconaFortuna, Gioco> = {
  ruota: {
    dietro: [
      S([P(luci(true), '#FFE27A', { w: 1.1 })], 'luci-a'),
      S([P(luci(false), '#FFE27A', { w: 1.1 })], 'luci-b'),
      S(
        [
          ...COLORI_RUOTA.map((c, j) =>
            P([j, j + 6].map((i) => spicchio(24, 27, 17, i * 30 - 15, i * 30 + 15)).join(''), c, { w: 1.3 }),
          ),
          P(tondo(24, 27, 17), 'none', { w: 2.6 }),
          P(tondo(24, 27, 11), 'none', { s: W, w: 1.2 }),
        ],
        'gira-ferma',
        { origine: '50% 56.25%' },
      ),
      S([P(tondo(24, 27, 5), '#FFD24A', { w: 1.8 }), P(stella(24, 27, 2.8), W, { w: 1 })], 'premio', {
        origine: '50% 56.25%',
      }),
      S([P('M19.5 3.5h9l-4.5 8z', '#FF5C6B', { w: 2 })], 'tic', { origine: '50% 7%' }),
    ],
  },
  slot: {
    dietro: [
      S([SLOT.leva, SLOT.pomo], 'tira', { origine: '88.5% 58.3%' }),
      S([SLOT.corpo, SLOT.insegna, SLOT.finestra, SLOT.vassoio]),
      S([SLOT.lampadine], 'lampeggia'),
    ],
    davanti: [
      S([P(rr(9, 15, 28, 15, 2.5), 'none', { w: 2.2 }), SLOT.divisori]),
      S([P(stella(5, 12, 3.4) + stella(45, 34, 2.8) + stella(3.5, 38, 2.6), '#FFE27A', { w: 1.2 })], 'scintilla'),
    ],
    rulli: true,
  },
  blackjack: {
    dietro: [
      S(
        [
          P(rr(6, 9, 20, 28, 3), W, { t: PICCHE }),
          P(
            'M16 16c-2.4 3-6 5-6 8a3 3 0 0 0 5.2 2l-1 3.4h3.6l-1-3.4A3 3 0 0 0 22 24c0-3-3.6-5-6-8z',
            INK,
            { w: 1.4, t: PICCHE },
          ),
        ],
        'galleggia',
        { piega: -8 },
      ),
      S(
        [
          P(rr(21, 10, 21, 29, 3), W, { t: CUORI }),
          P(
            'M31.5 33c-4.6-3-7-5.6-7-8.4a3.6 3.6 0 0 1 7-1.2 3.6 3.6 0 0 1 7 1.2c0 2.8-2.4 5.4-7 8.4z',
            '#E5383B',
            { w: 1.6, t: CUORI },
          ),
          P('M24.4 19l2-5.4 2 5.4M25.1 17.2h2.6', 'none', { s: '#E5383B', w: 1.8, t: CUORI }),
        ],
        'galleggia',
        { ritardo: 0.9, piega: 7 },
      ),
    ],
    piatta: true,
  },
  // La conca ha il suo spessore di legno (`Spessore`), il piatto gira e la pallina gli corre contro.
  roulette: {
    dietro: [
      S([P(tondo(24, 24, 21), '#B8743A'), P(tondo(24, 24, 18.4), '#FFD24A', { w: 1.4 })]),
      S(
        [
          P(CASELLE.rosse, '#E5383B', { w: 1 }),
          P(CASELLE.nere, '#2A2440', { w: 1 }),
          P(CASELLE.verde, '#22B45E', { w: 1 }),
          P(tondo(24, 24, 10.5), '#E3A86B', { w: 1.6 }),
          P(tondo(24, 24, 7), '#C88A52', { w: 1.3 }),
          P('M24 17.5v13M17.5 24h13', 'none', { s: '#FFD84D', w: 2.4 }),
          P(
            tondo(24, 17.5, 1.5) + tondo(24, 30.5, 1.5) + tondo(17.5, 24, 1.5) + tondo(30.5, 24, 1.5),
            '#FFD84D',
            { w: 1.1 },
          ),
          P(tondo(24, 24, 2.4), '#FFD84D', { w: 1.3 }),
        ],
        'gira-svelta',
      ),
      S([P(tondo(24, 10.4, 2), W, { w: 1.3 })], 'orbita'),
    ],
    inclinata: true,
  },
  superenalotto: {
    dietro: [
      S(pallina(24, 14, 9.5, '#7DE89A', 5, 'M22.8 12.2l1.8-1.4v6.6', 'M18.2 10a7 7 0 0 1 3-3'), 'saltella'),
      S(pallina(14, 30, 10, '#8DB6FF', 5.3, 'M11.8 27.2h4.4l-2.6 6', 'M7.6 25.6a7 7 0 0 1 3-3'), 'saltella', {
        ritardo: 0.3,
      }),
      S(
        pallina(
          34,
          30,
          10,
          '#FFD84D',
          5.3,
          'M32 27.4c.6-.6 1.3-.8 2-.8 1.3 0 2.2.8 2.2 1.8s-.9 1.7-2.2 1.7c1.4 0 2.4.8 2.4 1.9s-1 1.9-2.4 1.9c-.8 0-1.5-.3-2.1-.9',
          'M27.6 25.6a7 7 0 0 1 3-3',
        ),
        'saltella',
        { ritardo: 0.6 },
      ),
    ],
  },
}

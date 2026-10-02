import { memo, type CSSProperties, type ReactElement } from 'react'
import { coloreDellaCategoria, iconaDellaCategoria } from '@/games/ruota/disegni'
import type { CategoriaQuiz } from '@shared/quiz'
import type { CodiceSlot, SimboloClassico } from '@shared/slot'

/**
 * I simboli della slot, come sui rulli delle slot di una volta: frutta lucida,
 * la campana d'oro, la barra nera e il sette rosso bordato d'oro. Sono SVG con
 * i gradienti scritti una volta sola (`DefinizioniSlot`), perché sui rulli i
 * simboli sono duecentosettanta e ognuno con i suoi gradienti peserebbe.
 *
 * Le categorie del quiz sono tessere tonde nel colore della loro materia, con
 * l'icona del quiz e l'anello d'oro: si riconoscono subito, e si vede che non
 * sono frutta.
 */

/** I gradienti dei simboli: una volta per pagina, in un SVG che non si vede. */
export const DefinizioniSlot = memo(function DefinizioniSlot() {
  return (
    <svg className="slot-definizioni" width="0" height="0" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="slot-ciliegia" cx="35%" cy="30%" r="75%">
          <stop offset="0" stopColor="#ff8a95" />
          <stop offset="0.45" stopColor="#e3132f" />
          <stop offset="1" stopColor="#6d0014" />
        </radialGradient>
        <linearGradient id="slot-foglia" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9be15d" />
          <stop offset="1" stopColor="#2f7a1d" />
        </linearGradient>
        <radialGradient id="slot-limone" cx="38%" cy="32%" r="80%">
          <stop offset="0" stopColor="#fffbc4" />
          <stop offset="0.5" stopColor="#ffd60a" />
          <stop offset="1" stopColor="#b98a00" />
        </radialGradient>
        <radialGradient id="slot-arancia" cx="36%" cy="30%" r="80%">
          <stop offset="0" stopColor="#ffd9a0" />
          <stop offset="0.5" stopColor="#ff8a00" />
          <stop offset="1" stopColor="#b44a00" />
        </radialGradient>
        <radialGradient id="slot-prugna" cx="36%" cy="28%" r="85%">
          <stop offset="0" stopColor="#d9b8ff" />
          <stop offset="0.45" stopColor="#8136dc" />
          <stop offset="1" stopColor="#300863" />
        </radialGradient>
        <linearGradient id="slot-oro" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#fff6c2" />
          <stop offset="0.4" stopColor="#f4c430" />
          <stop offset="1" stopColor="#9a5b08" />
        </linearGradient>
        <linearGradient id="slot-nero" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3b3b44" />
          <stop offset="0.55" stopColor="#111116" />
          <stop offset="1" stopColor="#000" />
        </linearGradient>
        <linearGradient id="slot-sette" x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stopColor="#ff7a7a" />
          <stop offset="0.5" stopColor="#e3132f" />
          <stop offset="1" stopColor="#7d0012" />
        </linearGradient>
        <radialGradient id="slot-lucido" cx="50%" cy="0%" r="90%">
          <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  )
})

type ProprietaRiflesso = { cx: number; cy: number; rx: number; ry: number; giro?: number }

const Riflesso = ({ cx, cy, rx, ry, giro = -30 }: ProprietaRiflesso) => (
  <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="#fff" opacity={0.55} transform={`rotate(${giro} ${cx} ${cy})`} />
)

const DISEGNI: Record<SimboloClassico, ReactElement> = {
  C: (
    <g>
      <path
        d="M52 14 C46 30 38 42 33 52 M52 14 C58 32 63 44 66 56"
        stroke="#3d6e1e"
        strokeWidth={4}
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M52 14 C62 6 78 8 84 16 C74 24 60 24 52 14 Z"
        fill="url(#slot-foglia)"
        stroke="#2c5a14"
        strokeWidth={1.5}
      />
      <circle cx={33} cy={66} r={19} fill="url(#slot-ciliegia)" stroke="#5c0012" strokeWidth={1.5} />
      <circle cx={67} cy={70} r={19} fill="url(#slot-ciliegia)" stroke="#5c0012" strokeWidth={1.5} />
      <Riflesso cx={27} cy={58} rx={5} ry={3} />
      <Riflesso cx={61} cy={62} rx={5} ry={3} />
    </g>
  ),
  L: (
    <g>
      <path
        d="M14 58 C14 34 40 22 60 24 C76 25 88 36 88 48 C88 70 62 82 42 80 C26 79 14 72 14 58 Z"
        fill="url(#slot-limone)"
        stroke="#9a7300"
        strokeWidth={2}
        transform="rotate(-18 51 52)"
      />
      <circle cx={12} cy={66} r={4} fill="#e9bb00" stroke="#9a7300" strokeWidth={1.5} />
      <circle cx={90} cy={38} r={4} fill="#e9bb00" stroke="#9a7300" strokeWidth={1.5} />
      <Riflesso cx={40} cy={40} rx={11} ry={5} giro={-25} />
    </g>
  ),
  O: (
    <g>
      <circle cx={50} cy={56} r={33} fill="url(#slot-arancia)" stroke="#9a3f00" strokeWidth={2} />
      {[
        [38, 50],
        [58, 46],
        [48, 66],
        [66, 62],
        [36, 70],
        [56, 78],
      ].map(([x, y]) => (
        <circle key={`${x}${y}`} cx={x} cy={y} r={1.6} fill="#c25a00" opacity={0.55} />
      ))}
      <path d="M50 24 C52 18 56 14 60 12" stroke="#5a3a12" strokeWidth={3} fill="none" strokeLinecap="round" />
      <path
        d="M55 20 C64 12 78 14 82 20 C72 27 61 27 55 20 Z"
        fill="url(#slot-foglia)"
        stroke="#2c5a14"
        strokeWidth={1.5}
      />
      <Riflesso cx={38} cy={42} rx={9} ry={5} />
    </g>
  ),
  P: (
    <g>
      <path
        d="M50 22 C72 22 84 42 82 60 C80 78 66 88 50 88 C34 88 20 78 18 60 C16 42 28 22 50 22 Z"
        fill="url(#slot-prugna)"
        stroke="#260552"
        strokeWidth={2}
      />
      <path d="M50 26 C46 44 46 66 50 86" stroke="#3b0b78" strokeWidth={2} fill="none" opacity={0.6} />
      <path d="M50 24 C50 18 52 14 56 10" stroke="#5a3a12" strokeWidth={3} fill="none" strokeLinecap="round" />
      <path
        d="M53 16 C60 8 72 9 76 15 C68 21 59 21 53 16 Z"
        fill="url(#slot-foglia)"
        stroke="#2c5a14"
        strokeWidth={1.5}
      />
      <Riflesso cx={36} cy={44} rx={8} ry={5} giro={-40} />
    </g>
  ),
  B: (
    <g>
      <circle cx={50} cy={16} r={6} fill="url(#slot-oro)" stroke="#7a4706" strokeWidth={1.5} />
      <path
        d="M50 20 C32 20 28 34 28 50 C28 62 22 68 14 74 L86 74 C78 68 72 62 72 50 C72 34 68 20 50 20 Z"
        fill="url(#slot-oro)"
        stroke="#7a4706"
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      <rect x={12} y={72} width={76} height={8} rx={4} fill="url(#slot-oro)" stroke="#7a4706" strokeWidth={2} />
      <circle cx={50} cy={86} r={7} fill="url(#slot-oro)" stroke="#7a4706" strokeWidth={2} />
      <path
        d="M38 30 C34 38 34 50 34 58"
        stroke="#fff"
        strokeWidth={4}
        strokeLinecap="round"
        opacity={0.6}
        fill="none"
      />
    </g>
  ),
  R: (
    <g>
      <rect x={6} y={28} width={88} height={44} rx={9} fill="url(#slot-nero)" stroke="url(#slot-oro)" strokeWidth={5} />
      <rect x={12} y={33} width={76} height={14} rx={6} fill="url(#slot-lucido)" />
      <text
        x={50}
        y={51}
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="ui-rounded, -apple-system, 'SF Pro Rounded', system-ui, sans-serif"
        fontWeight={900}
        fontSize={30}
        letterSpacing={2}
        fill="#fff"
        stroke="#f4c430"
        strokeWidth={1.2}
        paintOrder="stroke"
      >
        BAR
      </text>
    </g>
  ),
  '7': (
    <g>
      <path
        d="M22 18 H82 V30 C66 46 56 64 52 88 H34 C38 66 48 46 62 32 H22 Z"
        fill="#5a000c"
        transform="translate(4 4)"
      />
      <path
        d="M22 18 H82 V30 C66 46 56 64 52 88 H34 C38 66 48 46 62 32 H22 Z"
        fill="url(#slot-sette)"
        stroke="url(#slot-oro)"
        strokeWidth={5}
        strokeLinejoin="round"
      />
      <path d="M28 23 H76" stroke="#fff" strokeWidth={3} strokeLinecap="round" opacity={0.6} />
    </g>
  ),
}

/**
 * Un simbolo: la frutta e gli altri classici, o una categoria del giorno, che
 * sui rulli e' la sua cifra. `categorie` dice quale categoria e' ogni cifra.
 */
export const Simbolo = memo(function Simbolo({
  codice,
  categorie,
}: {
  codice: CodiceSlot
  categorie: readonly CategoriaQuiz[]
}) {
  // Le categorie sono le cifre da 0 a 5: il 7 e' il sette.
  if (/^[0-5]$/.test(codice)) {
    const categoria = categorie[Number(codice)]
    if (!categoria) return <span className="slot-simbolo" />
    const Icona = iconaDellaCategoria(categoria)
    return (
      <span
        className="slot-simbolo slot-simbolo--categoria"
        style={{ '--colore': coloreDellaCategoria(categoria) } as CSSProperties}
      >
        <span className="slot-simbolo__tessera">
          <Icona size={30} />
        </span>
      </span>
    )
  }
  return (
    <span className={`slot-simbolo slot-simbolo--${codice === '7' ? 'sette' : codice}`}>
      <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
        {DISEGNI[codice as SimboloClassico]}
      </svg>
    </span>
  )
})

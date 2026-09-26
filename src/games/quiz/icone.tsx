import type { ReactElement, SVGProps } from 'react'
import type { CategoriaQuiz } from '@shared/quiz'

/**
 * Le icone del quiz, una per categoria, nello stile delle altre dell'app:
 * tratto 1.8, terminazioni tonde, niente colori propri.
 */

type Props = SVGProps<SVGSVGElement> & { size?: number }

function Svg({ size = 24, children, ...rest }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  )
}

/** Un palazzo con le colonne: la capitale. */
export const IconCapitale = (p: Props) => (
  <Svg {...p}>
    <path d="M3 9.5 12 4l9 5.5" />
    <path d="M4.5 20h15" />
    <path d="M6 10.5v7M10 10.5v7M14 10.5v7M18 10.5v7" />
  </Svg>
)

/** Una bandiera al vento. */
export const IconBandiera = (p: Props) => (
  <Svg {...p}>
    <path d="M5 21V4" />
    <path d="M5 5c2.5-1.6 5-1.6 7 0s4.5 1.6 7 0v8c-2.5 1.6-5 1.6-7 0s-4.5-1.6-7 0" />
  </Svg>
)

/** Una carta piegata con uno spillo. */
export const IconCartina = (p: Props) => (
  <Svg {...p}>
    <path d="M3 6.5 8.5 4l7 2.5L21 4v13.5L15.5 20l-7-2.5L3 20z" />
    <path d="M8.5 4v13.5M15.5 6.5V20" />
  </Svg>
)

/** Due onde: il mare. */
export const IconMare = (p: Props) => (
  <Svg {...p}>
    <path d="M3 9c1.5 0 1.5-1.5 3-1.5S7.5 9 9 9s1.5-1.5 3-1.5S13.5 9 15 9s1.5-1.5 3-1.5S19.5 9 21 9" />
    <path d="M3 14c1.5 0 1.5-1.5 3-1.5S7.5 14 9 14s1.5-1.5 3-1.5 1.5 1.5 3 1.5 1.5-1.5 3-1.5 1.5 1.5 3 1.5" />
    <path d="M3 19c1.5 0 1.5-1.5 3-1.5S7.5 19 9 19s1.5-1.5 3-1.5 1.5 1.5 3 1.5 1.5-1.5 3-1.5 1.5 1.5 3 1.5" />
  </Svg>
)

/** Il mondo con i meridiani: gli oceani lo coprono quasi tutto. */
export const IconOceano = (p: Props) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18" />
    <path d="M12 3c2.8 3 2.8 15 0 18M12 3c-2.8 3-2.8 15 0 18" />
  </Svg>
)

/** Un fiume che scende a curve. */
export const IconFiume = (p: Props) => (
  <Svg {...p}>
    <path d="M8 3c0 3 5 3 5 6s-6 3-6 6 5 3 5 6" />
    <path d="M13 3c0 3 5 3 5 6s-6 3-6 6 5 3 5 6" />
  </Svg>
)

/** Un lago fra le montagne. */
export const IconLago = (p: Props) => (
  <Svg {...p}>
    <path d="m3 15 5.5-8 3.5 5 2.5-3.5L21 15" />
    <ellipse cx="12" cy="18" rx="8" ry="2.5" />
  </Svg>
)

/** Il mappamondo: l'icona del gioco. */
export const IconMappamondo = (p: Props) => (
  <Svg {...p}>
    <circle cx="12" cy="10" r="6.5" />
    <path d="M5.5 10h13M12 3.5c2 1.8 2 11.2 0 13M12 3.5c-2 1.8-2 11.2 0 13" />
    <path d="M19 5a9.5 9.5 0 0 1-13.4 13" />
    <path d="M12 19.5V21M9 21h6" />
  </Svg>
)

export const ICONE_CATEGORIE: Record<CategoriaQuiz, (p: Props) => ReactElement> = {
  capitali: IconCapitale,
  bandiere: IconBandiera,
  cartina: IconCartina,
  mari: IconMare,
  oceani: IconOceano,
  fiumi: IconFiume,
  laghi: IconLago,
}

export function IconaCategoria({ categoria, size = 24 }: { categoria: CategoriaQuiz; size?: number }) {
  const Icona = ICONE_CATEGORIE[categoria]
  return <Icona size={size} />
}

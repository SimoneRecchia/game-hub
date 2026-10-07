import type { ReactElement, SVGProps } from 'react'
import type { CategoriaQuiz, MateriaQuiz } from '@shared/quiz'

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

/** Tre palazzi di altezze diverse: la città. */
export const IconCitta = (p: Props) => (
  <Svg {...p}>
    <path d="M3.5 20.5h17" />
    <path d="M5 20.5V11l4-2v11.5" />
    <path d="M9 20.5V5l6 2.5v13" />
    <path d="M15 20.5V11.5l4 1.5v7.5" />
    <path d="M11.5 9.5h1M11.5 12.5h1M11.5 15.5h1" />
  </Svg>
)

/** Due paesi con il confine in mezzo, tratteggiato. */
export const IconStati = (p: Props) => (
  <Svg {...p}>
    <path d="M4 7.5 9 4l4 2.5 3.5-1.5L20 8l-1 5 1.5 4-5 3-3.5-1.5L7 20l-3-4.5L5 11z" />
    <path d="M13 6.5c-.5 3 1 4.5.5 7s-1.5 3-1.5 5" strokeDasharray="1.6 2.2" />
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

/** La tavolozza del pittore: l'arte. */
export const IconArte = (p: Props) => (
  <Svg {...p}>
    <path d="M12 3.5c-4.9 0-8.5 3.4-8.5 7.9 0 4.3 3.4 7.6 7.4 7.6 1.4 0 2-1 1.6-2.1-.5-1.4.3-2.6 1.8-2.6h2.1c2.6 0 4.1-1.6 4.1-3.8 0-4-3.8-7-8.5-7Z" />
    <circle cx="7.8" cy="11" r="1.1" />
    <circle cx="10.5" cy="7.4" r="1.1" />
    <circle cx="15" cy="7.6" r="1.1" />
  </Svg>
)

/** Un libro aperto. */
export const IconLibri = (p: Props) => (
  <Svg {...p}>
    <path d="M12 6.5c-2-1.6-5-2-8-1.6v12.6c3-.4 6 0 8 1.6 2-1.6 5-2 8-1.6V4.9c-3-.4-6 0-8 1.6Z" />
    <path d="M12 6.5v12.6" />
  </Svg>
)

/** Il ciak. */
export const IconCinema = (p: Props) => (
  <Svg {...p}>
    <rect x="3.5" y="9.5" width="17" height="10" rx="1.5" />
    <path d="m3.8 9.3 15.7-4.4-.9-3-15.7 4.4.9 3Z" transform="translate(0 1.2)" />
    <path d="m8.2 5.9 2.4 2.7M13 4.6l2.4 2.7" transform="translate(0 1.2)" />
  </Svg>
)

/** Due note di musica: la musica. */
export const IconMusica = (p: Props) => (
  <Svg {...p}>
    <path d="M9 17.5V6l10-2v11" />
    <circle cx="6.8" cy="17.5" r="2.3" />
    <circle cx="16.8" cy="15" r="2.3" />
    <path d="m9 9.5 10-2" />
  </Svg>
)

/** Il microfono: le canzoni. */
export const IconCanzoni = (p: Props) => (
  <Svg {...p}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
    <path d="M12 17.5V21M8.5 21h7" />
  </Svg>
)

/** La tastiera del pianoforte: la musica classica. */
export const IconClassica = (p: Props) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="14" rx="1.5" />
    <path d="M7.5 19v-5M12 19v-5M16.5 19v-5" />
    <path d="M6.3 5v9h2.4V5M10.8 5v9h2.4V5M15.3 5v9h2.4V5" />
  </Svg>
)

/** La maschera del teatro: la lirica. */
export const IconLirica = (p: Props) => (
  <Svg {...p}>
    <path d="M4.5 5.5c4.6-1.8 10.4-1.8 15 0 .3 6.7-2.5 13-7.5 14-5-1-7.8-7.3-7.5-14Z" />
    <path d="M8 10c.8-.7 1.9-.7 2.7 0M13.3 10c.8-.7 1.9-.7 2.7 0" />
    <path d="M9 14.5c1.7 1.5 4.3 1.5 6 0" />
  </Svg>
)

/** La medaglia con il nastro: il Nobel. */
export const IconNobel = (p: Props) => (
  <Svg {...p}>
    <path d="m8 3 2.8 6M16 3l-2.8 6" />
    <circle cx="12" cy="14.5" r="5.5" />
    <path d="m12 11.8.9 1.8 2 .3-1.4 1.4.3 2-1.8-.9-1.8.9.3-2-1.4-1.4 2-.3Z" />
  </Svg>
)

/** Una colonna antica: la storia. */
export const IconStoria = (p: Props) => (
  <Svg {...p}>
    <path d="M5 5.5h14M6 3.5h12M5 20.5h14M6 18.5h12" />
    <path d="M8 5.5v13M12 5.5v13M16 5.5v13" />
  </Svg>
)

/** Il calendario con il giorno: accadde oggi. */
export const IconOggi = (p: Props) => (
  <Svg {...p}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
    <path d="M3.5 9.5h17M8 3v4M16 3v4" />
    <path d="M11 13h1.5v4.5M11 17.5h3" />
  </Svg>
)

/** La beuta: la scienza. */
export const IconScienza = (p: Props) => (
  <Svg {...p}>
    <path d="M9.5 3.5h5M10.5 3.5v5.2L5.2 18.3c-.6 1 .1 2.2 1.3 2.2h11c1.2 0 1.9-1.2 1.3-2.2l-5.3-9.6V3.5" />
    <path d="M7.6 14h8.8" />
  </Svg>
)

/** Tre atomi legati: la chimica. */
export const IconChimica = (p: Props) => (
  <Svg {...p}>
    <circle cx="7" cy="7" r="2.5" />
    <circle cx="17" cy="9" r="2.5" />
    <circle cx="10" cy="17" r="2.5" />
    <path d="M9.45 7.49 14.55 8.51M7.72 9.39l1.56 5.21M15.35 10.88l-3.7 4.24" />
  </Svg>
)

/** L'atomo con le orbite: la fisica. */
export const IconFisica = (p: Props) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="1.4" />
    <ellipse cx="12" cy="12" rx="9" ry="3.4" />
    <ellipse cx="12" cy="12" rx="9" ry="3.4" transform="rotate(60 12 12)" />
    <ellipse cx="12" cy="12" rx="9" ry="3.4" transform="rotate(120 12 12)" />
  </Svg>
)

/** Un pianeta con l'anello: l'astronomia. */
export const IconAstronomia = (p: Props) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="5" />
    <ellipse cx="12" cy="12" rx="10" ry="3.2" transform="rotate(-20 12 12)" />
  </Svg>
)

/** La lampadina: le scoperte e le invenzioni. */
export const IconScoperte = (p: Props) => (
  <Svg {...p}>
    <path d="M9.5 17.5h5M10.5 20.5h3" />
    <path d="M12 3a6 6 0 0 0-3.6 10.8c.8.6 1.1 1.4 1.1 2.2v.5h5V16c0-.8.3-1.6 1.1-2.2A6 6 0 0 0 12 3Z" />
  </Svg>
)

/** Una foglia: gli animali e le piante. */
export const IconNatura = (p: Props) => (
  <Svg {...p}>
    <path d="M19.5 4.5C11 4.5 5 9 5 15.8c0 1.3.3 2.5.8 3.7 6.8-.5 13.7-5.3 13.7-15Z" />
    <path d="M4 20.5c3-4.8 7-8.3 11.5-10.5" />
  </Svg>
)

/** Le icone degli argomenti della scienza, che nella libera si scelgono come categorie. */
export const ICONE_AMBITI: Record<string, (p: Props) => ReactElement> = {
  chimica: IconChimica,
  fisica: IconFisica,
  astronomia: IconAstronomia,
  scoperte: IconScoperte,
  natura: IconNatura,
}

export const ICONE_CATEGORIE: Record<CategoriaQuiz, (p: Props) => ReactElement> = {
  capitali: IconCapitale,
  citta: IconCitta,
  bandiere: IconBandiera,
  stati: IconStati,
  cartina: IconCartina,
  mari: IconMare,
  oceani: IconOceano,
  fiumi: IconFiume,
  laghi: IconLago,
  arte: IconArte,
  libri: IconLibri,
  cinema: IconCinema,
  canzoni: IconCanzoni,
  classica: IconClassica,
  lirica: IconLirica,
  nobel: IconNobel,
  storia: IconStoria,
  oggi: IconOggi,
  scienza: IconScienza,
}

export function IconaCategoria({
  categoria,
  ambito,
  size = 24,
}: {
  categoria: CategoriaQuiz
  /** Per gli argomenti della scienza, la loro icona. */
  ambito?: string
  size?: number
}) {
  const Icona = (ambito && ICONE_AMBITI[ambito]) || ICONE_CATEGORIE[categoria]
  return <Icona size={size} />
}

/** L'icona di una materia, nel menu della libera. */
export const ICONE_MATERIE: Record<MateriaQuiz, (p: Props) => ReactElement> = {
  geografia: IconMappamondo,
  storia: IconStoria,
  cultura: IconArte,
  musica: IconMusica,
  scienza: IconScienza,
}

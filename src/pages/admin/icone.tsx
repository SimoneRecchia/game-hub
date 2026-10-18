/**
 * Le icone del pannello che l'app non ha: lo stesso disegno di Icons.tsx —
 * tratto 1.8, terminazioni tonde, in stile SF Symbols — e stanno qui perché
 * servono solo qui.
 */
import type { SVGProps } from 'react'

type Props = SVGProps<SVGSVGElement> & { size?: number }

function Svg({ size = 24, children, ...resto }: Props) {
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
      {...resto}
    >
      {children}
    </svg>
  )
}

/** Il cruscotto: tre riquadri di misure diverse. */
export const IconaPanoramica = (p: Props) => (
  <Svg {...p}>
    <rect x="3.5" y="3.5" width="7.5" height="9" rx="2" />
    <rect x="13" y="3.5" width="7.5" height="5.5" rx="2" />
    <rect x="13" y="11" width="7.5" height="9.5" rx="2" />
    <rect x="3.5" y="14.5" width="7.5" height="6" rx="2" />
  </Svg>
)

export const IconaNuvola = (p: Props) => (
  <Svg {...p}>
    <path d="M7.2 18.5h10.3a3.9 3.9 0 0 0 .5-7.8 5.6 5.6 0 0 0-10.8-1.3 4.6 4.6 0 0 0 0 9.1Z" />
  </Svg>
)

export const IconaDatabase = (p: Props) => (
  <Svg {...p}>
    <ellipse cx="12" cy="5.8" rx="7.5" ry="2.8" />
    <path d="M4.5 5.8v12.4c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8V5.8" />
    <path d="M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8" />
  </Svg>
)

/** Il prompt di un terminale: la console SQL. */
export const IconaConsole = (p: Props) => (
  <Svg {...p}>
    <rect x="3" y="4.5" width="18" height="15" rx="3" />
    <path d="m7.5 9.5 3 2.5-3 2.5M12.5 15h4" />
  </Svg>
)

export const IconaMegafono = (p: Props) => (
  <Svg {...p}>
    <path d="M4 10.2v3.6a1.2 1.2 0 0 0 1.2 1.2H7l8.5 4.2V4.8L7 9H5.2A1.2 1.2 0 0 0 4 10.2Z" />
    <path d="M8 15.2l1 4.3M18.5 9.5a3.5 3.5 0 0 1 0 5" />
  </Svg>
)

/** Il registro: un foglio con le righe. */
export const IconaRegistro = (p: Props) => (
  <Svg {...p}>
    <path d="M7 3.5h7.5l4 4v11.3a1.7 1.7 0 0 1-1.7 1.7H7a1.7 1.7 0 0 1-1.7-1.7V5.2A1.7 1.7 0 0 1 7 3.5Z" />
    <path d="M14.5 3.5v4h4M8.8 12h6.4M8.8 15.5h6.4" />
  </Svg>
)

export const IconaAvviso = (p: Props) => (
  <Svg {...p}>
    <path d="M10.4 4.4 3.1 17.3a1.8 1.8 0 0 0 1.6 2.7h14.6a1.8 1.8 0 0 0 1.6-2.7L13.6 4.4a1.8 1.8 0 0 0-3.2 0Z" />
    <path d="M12 9.5v4.2" />
    <circle cx="12" cy="16.7" r="0.9" fill="currentColor" stroke="none" />
  </Svg>
)

/** I cursori di un mixer: il sistema e la sua configurazione. */
export const IconaSistema = (p: Props) => (
  <Svg {...p}>
    <path d="M5 4v4.5M5 12.5V20M12 4v9M12 17v3M19 4v2.5M19 10.5V20" />
    <circle cx="5" cy="10.5" r="2" />
    <circle cx="12" cy="15" r="2" />
    <circle cx="19" cy="8.5" r="2" />
  </Svg>
)

export const IconaCerca = (p: Props) => (
  <Svg {...p}>
    <circle cx="10.8" cy="10.8" r="6.3" />
    <path d="m15.6 15.6 4.4 4.4" />
  </Svg>
)

export const IconaScudo = (p: Props) => (
  <Svg {...p}>
    <path d="M12 3.5 5 6v5.6c0 4.3 2.9 7.6 7 8.9 4.1-1.3 7-4.6 7-8.9V6l-7-2.5Z" />
    <path d="m9 12 2.2 2.2L15.3 10" />
  </Svg>
)

export const IconaEsterno = (p: Props) => (
  <Svg {...p}>
    <path d="M13.5 4.5h6v6M19.5 4.5 11 13" />
    <path d="M17.5 14v3.8a1.7 1.7 0 0 1-1.7 1.7H6.2a1.7 1.7 0 0 1-1.7-1.7V8.2a1.7 1.7 0 0 1 1.7-1.7H10" />
  </Svg>
)

export const IconaGiu = (p: Props) => (
  <Svg {...p}>
    <path d="m6.5 9.5 5.5 5.5 5.5-5.5" />
  </Svg>
)

/** La bandierina del traguardo che si sposta: un deploy. */
export const IconaRazzo = (p: Props) => (
  <Svg {...p}>
    <path d="M14.5 4.2c2.6-.9 4.6-.8 5.3-.1.7.7.8 2.7-.1 5.3-.9 2.7-3.1 5.4-6 7.3l-3.4-3.4c1.9-2.9 4.6-5.1 7.3-6" />
    <path d="M10.3 13.3 7 12.6l2.8-3.3 3.6.2M10.7 13.7l.7 3.3 3.3-2.8-.2-3.6" />
    <path d="M6.6 15.8c-1.5.4-2.3 2-2.6 4.2 2.2-.3 3.8-1.1 4.2-2.6" />
  </Svg>
)

/** Un lucchetto aperto: lo sblocco. */
export const IconaSblocca = (p: Props) => (
  <Svg {...p}>
    <rect x="5" y="11" width="14" height="10" rx="2.6" />
    <path d="M8 11V8a4 4 0 0 1 7.7-1.5" />
  </Svg>
)

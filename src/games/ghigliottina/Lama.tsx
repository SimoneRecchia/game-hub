import { useId, type CSSProperties } from 'react'

export type PosizioneLama = 'alta' | 'cala' | 'giu'

/**
 * La ghigliottina: due montanti di legno, la traversa, la corda e la lama
 * d'acciaio col taglio di sbieco. La lama scende fino al montepremi, che sta
 * sotto, nella lunetta: "cala" e' il colpo di una scelta sbagliata, che poi
 * risale; "giu'" e' la parola vincente sbagliata, e la lama resta giu'.
 *
 * E' un SVG: la lama si muove con una trasformazione del suo gruppo, in unita'
 * del disegno, e il CSS ne fa la caduta (veloce, con un rimbalzo) e la risalita
 * (lenta, come tirata dalla corda).
 */
export function Lama({ posizione, colpi }: { posizione: PosizioneLama; colpi: number }) {
  // Gli id dei gradienti sono della pagina intera: ognuno il suo, se le ghigliottine fossero due.
  const id = useId()
  const legno = `${id}-legno`
  const acciaio = `${id}-acciaio`
  return (
    <svg
      className={`ghi-lama is-${posizione}`}
      viewBox="0 0 120 150"
      aria-hidden="true"
      style={{ '--colpi': colpi } as CSSProperties}
    >
      <defs>
        <linearGradient id={legno} x1="0" x2="1">
          <stop offset="0" stopColor="var(--ghi-legno-2)" />
          <stop offset="0.45" stopColor="var(--ghi-legno-1)" />
          <stop offset="1" stopColor="var(--ghi-legno-2)" />
        </linearGradient>
        <linearGradient id={acciaio} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--ghi-acciaio)" />
          <stop offset="0.55" stopColor="var(--ghi-acciaio-2)" />
          <stop offset="1" stopColor="var(--ghi-acciaio)" />
        </linearGradient>
      </defs>
      {/* La lama corre fra i montanti, e la traversa copre la corda: si disegna prima di loro. */}
      <g className="ghi-lama__ferro">
        <line className="ghi-lama__corda" x1="60" y1="-140" x2="60" y2="24" />
        <rect x="44" y="20" width="32" height="10" rx="2" fill="var(--ghi-legno-1)" />
        <path d="M26 30H94V52L26 70Z" fill={`url(#${acciaio})`} />
        {/* Il filo del taglio, che luccica. */}
        <path className="ghi-lama__filo" d="M26 70L94 52" />
        <circle cx="34" cy="38" r="1.6" fill="rgba(0,0,0,0.35)" />
        <circle cx="86" cy="38" r="1.6" fill="rgba(0,0,0,0.35)" />
      </g>
      {/* I montanti, con la scanalatura in cui corre la lama. */}
      <rect x="14" y="8" width="12" height="142" rx="2" fill={`url(#${legno})`} />
      <rect x="94" y="8" width="12" height="142" rx="2" fill={`url(#${legno})`} />
      <rect x="24" y="12" width="2" height="138" fill="rgba(0,0,0,0.35)" />
      <rect x="94" y="12" width="2" height="138" fill="rgba(0,0,0,0.35)" />
      <rect x="8" y="2" width="104" height="12" rx="3" fill={`url(#${legno})`} />
      <rect x="8" y="2" width="104" height="2.5" rx="1.2" fill="rgba(255,255,255,0.18)" />
    </svg>
  )
}

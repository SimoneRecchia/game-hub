/**
 * I segni del cruciverba che le icone dell'app non hanno: la lente e la griglia
 * dei controlli, l'occhio e la parola degli aiuti, le frecce della direzione.
 * Tratti su una griglia di 24, come le altre icone.
 */
const tondo = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`

export const SEGNI = {
  lente: `${tondo(11, 11, 6.5)} M16 16l4.5 4.5`,
  griglia: 'M4 4h16v16H4z M4 9.3h16 M4 14.7h16 M9.3 4v16 M14.7 4v16',
  occhio: `M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12z ${tondo(12, 12, 3)}`,
  parola: 'M3 8h18v8H3z M9 8v8 M15 8v8',
  orizzontale: 'M3.5 12h17 M16.5 8l4 4-4 4 M7.5 8l-4 4 4 4',
  verticale: 'M12 3.5v17 M8 7.5l4-4 4 4 M8 16.5l4 4 4-4',
  salvagente: `${tondo(12, 12, 9)} ${tondo(12, 12, 4)} M5.6 5.6l3.6 3.6 M14.8 14.8l3.6 3.6 M18.4 5.6l-3.6 3.6 M9.2 14.8l-3.6 3.6`,
} as const

export function Segno({ d, size = 20, spessore = 2.5 }: { d: string; size?: number; spessore?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={spessore}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  )
}

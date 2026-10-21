import type { CSSProperties } from 'react'
import { COLORE_FICHE as COLORI_FORTUNA, FICHES } from '@/games/fortuna/fiches'
import './Fiches.css'

/**
 * Le fiches del tavolo sono quelle della slot e di Crazy Time: uno, cinque,
 * dieci e venticinque, con i loro colori. Si toccano quante volte si vuole, e
 * la puntata e' la loro somma.
 */
export const GETTONI: readonly number[] = FICHES
export const COLORE_FICHE: Readonly<Record<number, string>> = COLORI_FORTUNA

/**
 * Le fiches di un importo, dalla piu' grande: il minimo numero di pezzi, come
 * li conta il croupier. Con uno, cinque, dieci e venticinque basta prendere
 * ogni volta la piu' grande che ci sta.
 */
export function scomponi(importo: number): number[] {
  const pezzi: number[] = []
  let resto = Math.max(0, Math.floor(importo))
  for (const t of [...GETTONI].sort((a, b) => b - a)) {
    while (resto >= t) {
      pezzi.push(t)
      resto -= t
    }
  }
  return pezzi
}

/** Il colore del taglio piu' grande che sta in un importo: per una fiche sola che porta un importo qualunque. */
export function coloreFiche(importo: number): string {
  const taglio = [...GETTONI].reverse().find((t) => t <= importo) ?? GETTONI[0]
  return COLORE_FICHE[taglio]
}

export function Fiche({
  valore,
  className = '',
  style,
}: {
  valore: number
  className?: string
  style?: CSSProperties
}) {
  return (
    <span
      className={`bj-fiche ${className}`}
      style={{ '--fiche': COLORE_FICHE[valore] ?? coloreFiche(valore), ...style } as CSSProperties}
    >
      <span className="bj-fiche__valore">{valore >= 1000 ? `${valore / 1000}K` : valore}</span>
    </span>
  )
}

/**
 * Una pila di fiches vista dall'alto, un filo di sbieco: ogni pezzo un po' piu'
 * su di quello sotto. `pezzi` sono le fiches dal basso: quelle posate una alla
 * volta mentre si punta, o un importo scomposto (`scomponi`). Oltre `massimo`
 * la pila non cresce piu', e l'importo lo dice la targhetta.
 */
export function PilaFiches({
  pezzi,
  massimo = 9,
  targhetta = true,
  className = '',
}: {
  pezzi: readonly number[]
  massimo?: number
  targhetta?: boolean
  className?: string
}) {
  const importo = pezzi.reduce((s, v) => s + v, 0)
  if (importo <= 0) return null
  return (
    <span className={`bj-pila ${className}`} aria-label={`${importo} punti`}>
      <span className="bj-pila__pezzi">
        {pezzi.slice(0, massimo).map((v, i) => (
          <Fiche key={i} valore={v} className="bj-pila__fiche" style={{ '--i': i } as CSSProperties} />
        ))}
      </span>
      {targhetta && <span className="bj-pila__targhetta u-tabnum">{importo}</span>}
    </span>
  )
}

import type { CSSProperties } from 'react'
import { GETTONI_RL } from '@shared/roulette'
import '@/games/blackjack/Fiches.css'

/** Il colore di una fiche della roulette, per taglio: il grigio dell'uno, poi rosso, verde, nero e viola. */
export const COLORE_FICHE_RL: Record<number, string> = {
  1: '#5d6b7d',
  5: '#d42a2a',
  25: '#118048',
  100: '#22252c',
  500: '#7b3aed',
}

/** Il colore del taglio piu' grande che sta in un importo: una fiche sola porta un importo qualunque. */
export function coloreRL(importo: number): string {
  const taglio = [...GETTONI_RL].reverse().find((t) => t <= importo) ?? GETTONI_RL[0]
  return COLORE_FICHE_RL[taglio]
}

/** Un importo scritto corto, come sulle fiches: 1500 e' "1,5K". */
export function corto(importo: number): string {
  if (importo < 1000) return String(importo)
  const k = importo / 1000
  return `${k >= 10 ? Math.round(k) : String(Math.round(k * 10) / 10).replace('.', ',')}K`
}

/** Una fiche: il taglio, o un importo qualunque con il colore del taglio piu' grande che ci sta. */
export function FicheRL({
  importo,
  colore,
  className = '',
  style,
}: {
  importo: number
  colore?: string
  className?: string
  style?: CSSProperties
}) {
  return (
    <span className={`bj-fiche ${className}`} style={{ '--fiche': colore ?? coloreRL(importo), ...style } as CSSProperties}>
      <span className="bj-fiche__valore">{corto(importo)}</span>
    </span>
  )
}

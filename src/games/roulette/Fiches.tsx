import type { CSSProperties } from 'react'
import { COLORE_FICHE, FICHES } from '@/games/fortuna/fiches'
import '@/games/blackjack/Fiches.css'

/**
 * Le fiches della roulette sono quelle della slot e di Crazy Time: uno, cinque,
 * dieci e venticinque, blu, rossa, verde e nera. Si posano una alla volta sul
 * panno, e sulla stessa puntata si sommano, quindi bastano a qualunque cifra.
 */
export const GETTONI_RL = FICHES

/** Il colore di una fiche della roulette, per taglio. */
export const COLORE_FICHE_RL = COLORE_FICHE

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

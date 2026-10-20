import type { CSSProperties } from 'react'
import { GETTONI_BJ } from '@shared/blackjack'
import './Fiches.css'

/**
 * Il colore di una fiche, per taglio, come ai tavoli veri: gli stessi di Crazy
 * Time e della slot, abbastanza scuri da reggere il numero color crema.
 */
export const COLORE_FICHE: Record<number, string> = {
  10: '#2563eb',
  25: '#118048',
  50: '#d62839',
  100: '#23262d',
  500: '#7c3aed',
}

/**
 * Le fiches di un importo, dalla piu' grande: il minimo numero di pezzi, come
 * li conta il croupier. Con i tagli del tavolo il 30 sono tre da dieci, non un
 * venticinque e un resto. Un importo che i tagli non fanno (non succede: si
 * punta con le fiches) resta con le fiches che ci stanno.
 */
export function scomponi(importo: number): number[] {
  const unita = 5
  const tagli = [...GETTONI_BJ].sort((a, b) => b - a)
  const n = Math.floor(importo / unita)
  if (n <= 0) return []
  // Il minimo di pezzi per ogni importo, a passi di cinque.
  const pezzi = new Array<number>(n + 1).fill(Infinity)
  const ultimo = new Array<number>(n + 1).fill(0)
  pezzi[0] = 0
  for (let i = 1; i <= n; i += 1) {
    for (const t of tagli) {
      const k = t / unita
      if (k <= i && pezzi[i - k] + 1 < pezzi[i]) {
        pezzi[i] = pezzi[i - k] + 1
        ultimo[i] = t
      }
    }
  }
  let i = n
  while (i > 0 && pezzi[i] === Infinity) i -= 1
  const fiches: number[] = []
  for (; i > 0; i -= ultimo[i] / unita) fiches.push(ultimo[i])
  return fiches.sort((a, b) => b - a)
}

/** Il colore del taglio piu' grande che sta in un importo: per una fiche sola che porta un importo qualunque. */
export function coloreFiche(importo: number): string {
  const taglio = [...GETTONI_BJ].reverse().find((t) => t <= importo) ?? GETTONI_BJ[0]
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
      style={{ '--fiche': COLORE_FICHE[valore] ?? COLORE_FICHE[10], ...style } as CSSProperties}
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

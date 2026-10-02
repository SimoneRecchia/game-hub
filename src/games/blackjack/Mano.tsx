import type { CSSProperties } from 'react'
import { eBlackjack, totaleDi, type Carta, type EsitoMano } from '@shared/blackjack'
import { CartaBJ } from './Carta'
import type { ArrivoCarta } from './piano'

export const TESTO_ESITO: Record<EsitoMano, string> = {
  blackjack: 'Blackjack',
  vinta: 'Vinta',
  pari: 'Pari',
  persa: 'Persa',
  sballata: 'Sballata',
}

/** Il totale come lo dicono i tavoli: "7/17" finché l'asso puo' contare uno o undici, "BJ" per il blackjack. */
export function testoTotale(carte: readonly Carta[], divisa = false): string {
  if (carte.length === 0) return ''
  if (eBlackjack(carte, divisa)) return 'BJ'
  const { totale, morbido } = totaleDi(carte)
  return morbido && totale < 21 ? `${totale - 10}/${totale}` : String(totale)
}

/**
 * Una mano sul panno: le carte a scala, ognuna un po' piu' a destra e piu' su
 * di quella prima, il totale delle carte gia' arrivate e, a giro finito,
 * l'esito. Le carte in volo non contano nel totale: arrivano prima di contare.
 */
export function Mano({
  carte,
  chiavi,
  arrivi,
  inArrivo,
  onAtterra,
  divisa = false,
  esito = null,
  attiva = false,
  className = '',
  style,
}: {
  carte: readonly Carta[]
  chiavi: readonly string[]
  arrivi: ReadonlyMap<string, ArrivoCarta>
  inArrivo: ReadonlySet<string>
  onAtterra: (chiave: string) => void
  divisa?: boolean
  esito?: EsitoMano | null
  attiva?: boolean
  className?: string
  style?: CSSProperties
}) {
  const arrivate = carte.filter((_, i) => !inArrivo.has(chiavi[i]))
  const totale = totaleDi(arrivate).totale
  const tutte = arrivate.length === carte.length
  const stato =
    totale > 21 ? ' is-oltre' : tutte && eBlackjack(carte, divisa) ? ' is-bj' : totale === 21 ? ' is-ventuno' : ''
  return (
    <div
      className={`bj-mano${attiva ? ' is-attiva' : ''}${esito ? ` is-${esito}` : ''} ${className}`}
      style={{ '--n': Math.max(1, carte.length), ...style } as CSSProperties}
    >
      <div className="bj-mano__carte">
        {carte.map((c, i) => (
          <CartaBJ
            key={chiavi[i]}
            carta={c}
            arrivo={arrivi.get(chiavi[i]) ?? null}
            onAtterra={() => onAtterra(chiavi[i])}
            className="bj-mano__carta"
            style={{ '--i': i } as CSSProperties}
          />
        ))}
      </div>
      {arrivate.length > 0 && (
        <span className={`bj-mano__totale u-tabnum${stato}`} key={`${arrivate.length}`}>
          {testoTotale(arrivate, divisa)}
        </span>
      )}
      {esito && (
        <span className={`bj-mano__esito is-${esito}`} key={esito}>
          {TESTO_ESITO[esito]}
        </span>
      )}
    </div>
  )
}

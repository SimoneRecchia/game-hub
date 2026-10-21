import type { CSSProperties } from 'react'
import { eBlackjack, totaleDi, type Carta, type EsitoMano } from '@shared/blackjack'
import { CartaBJ } from './Carta'
import type { ArrivoCarta } from './piano'

/**
 * La fascia di una mano a giro chiuso. Si dice quel che torna, e la mano che
 * non ridà niente non ha fascia: le carte se ne vanno con le altre. Oltre il
 * 21 si dice come un fatto del gioco, in grigio.
 */
export const TESTO_ESITO: Record<EsitoMano, string> = {
  blackjack: 'Blackjack',
  vinta: 'Vinta',
  pari: 'Pari',
  persa: '',
  sballata: 'Oltre 21',
}

/** Il totale come lo dicono i tavoli: "7/17" finché l'asso puo' contare uno o undici, "BJ" per il blackjack. */
export function testoTotale(carte: readonly Carta[], divisa = false): string {
  if (carte.length === 0) return ''
  if (eBlackjack(carte, divisa)) return 'BJ'
  const { totale, morbido } = totaleDi(carte)
  return morbido && totale < 21 ? `${totale - 10}/${totale}` : String(totale)
}

/**
 * Una mano sul panno: le carte a scala, ognuna un po' piu' a destra, il totale
 * delle carte gia' arrivate in alto a destra e, a giro finito, l'esito su una
 * fascia storta sopra le carte. Le carte in volo non contano nel totale: arrivano prima di contare.
 */
export function Mano({
  carte,
  chiavi,
  arrivi,
  inArrivo,
  onAtterra,
  divisa = false,
  esito = null,
  conto = null,
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
  /** Quel che la mano ridà, scritto sulla fascia accanto all'esito: solo per le mie, che sono grandi. */
  conto?: number | null
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
        {/* Una carta nuova al posto di un'altra, come dopo uno split, e' un'altra carta: vola anche lei. */}
        {carte.map((c, i) => (
          <CartaBJ
            key={`${chiavi[i]}:${c}`}
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
      {esito && TESTO_ESITO[esito] && (
        <span className={`bj-mano__esito is-${esito}`} key={esito}>
          {TESTO_ESITO[esito]}
          {conto !== null && conto > 0 && ` +${conto}`}
        </span>
      )}
    </div>
  )
}

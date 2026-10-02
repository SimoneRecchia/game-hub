import { useEffect, useRef, useState, type RefObject } from 'react'
import { Numero } from '@/components/Elementi'
import './Tabellone.css'

/**
 * Il tabellone in cima ai giochi della Fortuna: il saldo, che conta quando
 * cambia, e la puntata. Nient'altro: ne' quel che si e' vinto o perso oggi, ne'
 * da dove si e' partiti — al tavolo si guarda quel che si ha davanti. Il saldo
 * e' uno per tutti i giochi. A ogni cambio il tabellone si accende: rosso per
 * la puntata pagata, d'oro per la vincita che arriva. `saldoRef` e' il numero,
 * da dove partono le fiches e dove arrivano le monete.
 */
export function Tabellone({
  saldo,
  puntata,
  saldoRef,
}: {
  saldo: number
  /** La puntata in gioco o scelta; null se non ce n'e' una. */
  puntata: number | null
  saldoRef?: RefObject<HTMLSpanElement | null>
}) {
  const prima = useRef(saldo)
  const [lampo, setLampo] = useState<{ chiave: number; sale: boolean } | null>(null)
  useEffect(() => {
    const d = saldo - prima.current
    prima.current = saldo
    if (d !== 0) setLampo({ chiave: Date.now(), sale: d > 0 })
  }, [saldo])
  return (
    <div className="ct-tabellone">
      {lampo && (
        <span
          key={lampo.chiave}
          className={`ct-tabellone__lampo${lampo.sale ? ' is-incassa' : ' is-paga'}`}
          aria-hidden="true"
        />
      )}
      <span className="ct-tabellone__voce">
        <span className="ct-tabellone__etichetta">Saldo</span>
        <span className="ct-tabellone__saldo" ref={saldoRef}>
          <Numero valore={saldo} />
        </span>
      </span>
      <span className="ct-tabellone__voce is-destra">
        <span className="ct-tabellone__etichetta">Puntata</span>
        <span className="ct-tabellone__puntata u-tabnum" key={puntata ?? 0}>
          {puntata ?? '–'}
        </span>
      </span>
    </div>
  )
}

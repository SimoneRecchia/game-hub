import { useEffect, useRef, useState, type RefObject } from 'react'
import { Numero } from '@/components/Elementi'
import './Tabellone.css'

/**
 * Il tabellone in cima ai giochi della Fortuna: il saldo, che conta quando
 * cambia, e la puntata. Nient'altro: ne' quel che si e' vinto o perso oggi, ne'
 * da dove si e' partiti — al tavolo si guarda quel che si ha davanti. Il saldo
 * e' uno per tutti i giochi. A ogni cambio il tabellone si accende: rosso per
 * la puntata pagata, d'oro per la vincita che arriva. `saldoRef` e' il numero,
 * da dove partono le fiches e dove arrivano le monete. Quando il saldo non
 * basta per puntare (`scarso`) si tinge d'ambra, come l'avviso che lo dice
 * (`PochiPunti`): lo decide il gioco, che sa quando si sta puntando — durante
 * un giro il saldo e' gia' sceso della puntata, e non e' un problema.
 */
export function Tabellone({
  saldo,
  puntata,
  saldoRef,
  puntataRef,
  scarso = false,
  riga = false,
  etichetta = 'Puntata',
}: {
  saldo: number
  /** La puntata in gioco o scelta; null se non ce n'e' una. */
  puntata: number | null
  saldoRef?: RefObject<HTMLSpanElement | null>
  /** Il numero della puntata: dove arrivano le fiches toccate. */
  puntataRef?: RefObject<HTMLSpanElement | null>
  /** Il saldo non basta per la prima puntata. */
  scarso?: boolean
  /** Su una riga sola, l'etichetta accanto al numero: ai tavoli, dove l'altezza serve al panno. */
  riga?: boolean
  /** Il nome della voce a destra: "In gioco" durante una mano, "Giocato" al SuperEnalotto. */
  etichetta?: string
}) {
  const prima = useRef(saldo)
  /** Il saldo con cui il tabellone e' arrivato: c'e' gia', e non conta da zero. */
  const iniziale = useRef(saldo)
  const [lampo, setLampo] = useState<{ chiave: number; sale: boolean } | null>(null)
  useEffect(() => {
    const d = saldo - prima.current
    prima.current = saldo
    if (d !== 0) setLampo({ chiave: Date.now(), sale: d > 0 })
  }, [saldo])
  return (
    <div className={`ct-tabellone${riga ? ' is-riga' : ''}${scarso ? ' is-scarso' : ''}`}>
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
          <Numero valore={saldo} da={iniziale.current} />
        </span>
      </span>
      <span className="ct-tabellone__filo" aria-hidden="true" />
      <span className="ct-tabellone__voce is-destra">
        <span className="ct-tabellone__etichetta">{etichetta}</span>
        <span className="ct-tabellone__puntata u-tabnum" ref={puntataRef}>
          <span className="ct-tabellone__cifra" key={puntata ?? 0}>
            {puntata ?? '–'}
          </span>
        </span>
      </span>
    </div>
  )
}

import { useEffect, useRef, useState, type RefObject } from 'react'
import { Numero } from '@/components/Elementi'
import { conSegno } from '@shared/ruota'
import './Tabellone.css'

/**
 * Il tabellone in cima ai giochi della Fortuna: il saldo, che conta quando
 * cambia, e quel che il gioco ha dato o tolto oggi. Il saldo e' uno per tutti i
 * giochi; il conto di oggi e' di questo. A ogni cambio del saldo la differenza
 * sale e svanisce, grande, e il tabellone si accende: rosso per la puntata
 * pagata, d'oro per la vincita che arriva. `saldoRef` e' il numero, da dove
 * partono le fiches e dove arrivano le monete.
 */
export function Tabellone({
  saldo,
  netto,
  giri,
  unita = ['giro', 'giri'],
  saldoRef,
}: {
  saldo: number
  netto: number
  giri: number
  /** Come si contano le giocate: "1 giro", "3 mani". */
  unita?: readonly [string, string]
  saldoRef?: RefObject<HTMLSpanElement | null>
}) {
  const prima = useRef(saldo)
  const [variazione, setVariazione] = useState<{ chiave: number; quanto: number } | null>(null)
  useEffect(() => {
    const d = saldo - prima.current
    prima.current = saldo
    if (d !== 0) setVariazione({ chiave: Date.now(), quanto: d })
  }, [saldo])
  const tono = netto > 0 ? ' is-piu' : netto < 0 ? ' is-meno' : ''
  return (
    <div className="ct-tabellone">
      {variazione && (
        <span
          key={variazione.chiave}
          className={`ct-tabellone__lampo${variazione.quanto > 0 ? ' is-incassa' : ' is-paga'}`}
          aria-hidden="true"
        />
      )}
      <span className="ct-tabellone__voce">
        <span className="ct-tabellone__etichetta">Saldo</span>
        <span className="ct-tabellone__saldo" ref={saldoRef}>
          <Numero valore={saldo} />
          {variazione && (
            <span
              key={variazione.chiave}
              className={`ct-tabellone__variazione${variazione.quanto > 0 ? ' is-piu' : ' is-meno'}`}
              aria-hidden="true"
            >
              {conSegno(variazione.quanto)}
            </span>
          )}
        </span>
      </span>
      <span className="ct-tabellone__voce is-destra">
        <span className="ct-tabellone__etichetta">Oggi</span>
        <span className="ct-tabellone__oggi">
          <span className={`ct-tabellone__netto u-tabnum${tono}`}>{conSegno(netto)}</span>
          <span className="ct-tabellone__giri">
            in <span className="u-tabnum">{giri}</span> {giri === 1 ? unita[0] : unita[1]}
          </span>
        </span>
      </span>
    </div>
  )
}

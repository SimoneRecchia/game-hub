import type { CSSProperties, Ref } from 'react'
import { COLORE_FICHE, FICHES } from '@/games/fortuna/fiches'
import '@/games/blackjack/Fiches.css'
import './FichesPuntata.css'

/**
 * La puntata di Crazy Time: le fiches da toccare, che si sommano, su un vassoio
 * scuro sotto la ruota, con il tasto che le riporta indietro. Il numero della
 * puntata sta nel tabellone, dove le fiches volano; qui c'e' solo la regione
 * `polite` che la annuncia, come nella slot. Sotto la minima la ruota non si
 * lancia. A puntata zero la fila prende `rigaClasse` (`CHIAMA_FICHES`), e le
 * fiches si fanno toccare.
 */
export function FichesPuntata({
  valore,
  minima,
  tetto,
  attiva,
  rigaRef,
  rigaClasse = '',
  onAggiungi,
  onAzzera,
}: {
  valore: number
  minima: number
  /** Il saldo: una fiche che lo passerebbe si ferma li'. */
  tetto: number
  attiva: boolean
  /** Dove tornano quando la puntata si azzera. */
  rigaRef?: Ref<HTMLDivElement>
  /** Una classe in piu' per la fila delle fiches: quella che le fa saltare quando aspettano il primo tocco. */
  rigaClasse?: string
  onAggiungi: (fiche: number, bottone: HTMLElement) => void
  onAzzera: () => void
}) {
  return (
    <div className={`ct-fiches${attiva ? '' : ' is-spente'}`}>
      <span className="u-visually-hidden" aria-live="polite">
        Puntata {valore}
        {valore < minima ? `, da ${minima}` : ''}
      </span>
      <div className={`ct-fiches__gettoni ${rigaClasse}`} role="group" aria-label="Fiches" ref={rigaRef}>
        {FICHES.map((f) => (
          <button
            key={f}
            type="button"
            className={`bj-fiche ct-fiches__fiche is-${f}`}
            style={{ '--fiche': COLORE_FICHE[f] } as CSSProperties}
            aria-label={`Aggiungi ${f}`}
            disabled={!attiva || valore >= tetto}
            onClick={(e) => onAggiungi(f, e.currentTarget)}
          >
            <span className="bj-fiche__valore" aria-hidden="true">
              {f}
            </span>
          </button>
        ))}
      </div>
      <button type="button" className="ct-fiches__azzera" disabled={!attiva || valore === 0} onClick={onAzzera}>
        Azzera
      </button>
    </div>
  )
}

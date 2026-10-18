import type { CSSProperties, Ref } from 'react'
import { COLORE_FICHE, FICHES } from '@/games/fortuna/fiches'
import '@/games/blackjack/Fiches.css'
import './FichesPuntata.css'

/**
 * La puntata di Crazy Time: le fiches da toccare, che si sommano, e il numero
 * di quel che c'e' sul tavolo. Sotto la minima la ruota non si lancia, e la
 * riga lo dice. Le fiches sono bottoni ("Aggiungi 5"), e la puntata la annuncia
 * una regione `polite`, come nella slot. A puntata zero la loro fila prende
 * `rigaClasse` (`CHIAMA_FICHES`), e le fiches si fanno toccare.
 */
export function FichesPuntata({
  valore,
  minima,
  tetto,
  attiva,
  valoreRef,
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
  /** Dove arrivano le fiches toccate. */
  valoreRef?: Ref<HTMLSpanElement>
  /** Dove tornano quando la puntata si azzera. */
  rigaRef?: Ref<HTMLDivElement>
  /** Una classe in piu' per la fila delle fiches: quella che le fa saltare quando aspettano il primo tocco. */
  rigaClasse?: string
  onAggiungi: (fiche: number, bottone: HTMLElement) => void
  onAzzera: () => void
}) {
  const sotto = valore < minima
  return (
    <div className="ct-fiches">
      <div className="ct-fiches__testa">
        <span className="ct-fiches__titolo">Puntata</span>
        <span className="ct-fiches__stato" aria-live="polite">
          {sotto && <span className="ct-fiches__minima">{valore === 0 ? `da ${minima}` : `almeno ${minima}`}</span>}
          <span className={`ct-fiches__valore u-tabnum${sotto ? ' is-sotto' : ''}`} ref={valoreRef}>
            {valore}
          </span>
        </span>
      </div>
      <div className="ct-fiches__riga">
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
    </div>
  )
}

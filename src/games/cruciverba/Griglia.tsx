import { memo } from 'react'
import { NERA, VUOTA } from '@shared/cruciverba'
import './Griglia.css'

interface Props {
  righe: number
  colonne: number
  schema: string
  lettere: string
  numeri: Map<number, number>
  /** La casella selezionata. */
  attiva: number | null
  /** Le caselle della parola che si sta scrivendo. */
  parola: ReadonlySet<number>
  svelate: ReadonlySet<number>
  segnalate: ReadonlySet<number>
  /** Le lettere proposte da chi guarda in compagnia, che nella griglia dell'host non ci sono. */
  proposte?: ReadonlySet<number>
  /** Lo schema appena completato: un'onda in diagonale lo attraversa. */
  onda?: boolean
  onTocca: (casella: number) => void
}

/**
 * La griglia del cruciverba.
 *
 * Le caselle si dimensionano sulla larghezza della griglia (`cqw`), non sul
 * viewport: la griglia a sua volta si misura sullo spazio che resta fra
 * intestazione e tastiera, quindi numeri e lettere crescono e calano insieme
 * alle caselle, dal telefono piccolo al monitor.
 */
export const Griglia = memo(function Griglia({
  righe,
  colonne,
  schema,
  lettere,
  numeri,
  attiva,
  parola,
  svelate,
  segnalate,
  proposte,
  onda = false,
  onTocca,
}: Props) {
  return (
    <div
      className={`cgriglia${onda ? ' is-finita' : ''}`}
      role="grid"
      aria-label={`Cruciverba ${righe} per ${colonne}`}
      style={{ '--colonne': colonne, '--righe': righe } as React.CSSProperties}
    >
      {[...schema].map((casella, k) => {
        if (casella === NERA) {
          const onde = onda ? ({ '--onda': Math.floor(k / colonne) + (k % colonne) + 2 } as React.CSSProperties) : undefined
          return <div key={k} className="ccella is-nera" style={onde} aria-hidden="true" />
        }
        const lettera = lettere[k] === VUOTA ? '' : lettere[k]
        const numero = numeri.get(k)
        const classi = [
          'ccella',
          parola.has(k) ? 'is-parola' : '',
          attiva === k ? 'is-attiva' : '',
          segnalate.has(k) ? 'is-errata' : '',
          svelate.has(k) ? 'is-svelata' : '',
          proposte?.has(k) ? 'is-proposta' : '',
        ]
          .filter(Boolean)
          .join(' ')
        const r = Math.floor(k / colonne) + 1
        const c = (k % colonne) + 1
        return (
          <button
            key={k}
            type="button"
            role="gridcell"
            className={classi}
            style={onda ? ({ '--onda': r + c } as React.CSSProperties) : undefined}
            onClick={() => onTocca(k)}
            aria-label={`Riga ${r}, colonna ${c}${numero ? `, numero ${numero}` : ''}${
              lettera ? `, ${lettera.toUpperCase()}` : ', vuota'
            }${segnalate.has(k) ? ', sbagliata' : ''}${svelate.has(k) ? ', svelata' : ''}`}
            aria-selected={attiva === k}
          >
            {numero !== undefined && <span className="ccella__numero">{numero}</span>}
            {/* La chiave e' la lettera: una lettera nuova nasce, e nascendo salta dentro la casella. */}
            {lettera && (
              <span key={lettera} className="ccella__lettera">
                {lettera.toUpperCase()}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
})

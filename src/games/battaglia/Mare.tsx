import { memo } from 'react'
import { LATO, LETTERE_COLONNE, coordinata, type Esito, type IdNave } from '@shared/battaglia'
import './Mare.css'

export interface CellaMare {
  /** Un pezzo di nave: quale, e se e' la prua o la poppa (per arrotondare le estremita'). */
  nave?: { tipo: IdNave; inizio: boolean; fine: boolean; verticale: boolean }
  colpo?: Esito
  /** La nave qui sopra e' a fondo. */
  affondata?: boolean
  /** La nave qui sopra e' quella scelta per spostarla. */
  scelta?: boolean
  /** L'ultimo colpo arrivato: un'onda per farlo trovare con l'occhio. */
  nuovo?: boolean
}

interface Props {
  celle: readonly CellaMare[]
  /** Senza, il mare si guarda e non si tocca. */
  onTocca?: (casella: number) => void
  /** Le caselle che non si possono toccare, anche se il mare e' toccabile. */
  bloccata?: (casella: number) => boolean
  piccolo?: boolean
  etichetta: string
}

const NOMI_ESITO: Record<Esito, string> = {
  acqua: 'acqua',
  colpito: 'colpito',
  affondato: 'affondato',
}

/**
 * Un mare dieci per dieci, con le lettere delle colonne e i numeri delle righe
 * come sul foglio a quadretti.
 *
 * Lo stesso componente fa i due mari: il proprio, con le navi e i colpi presi, e
 * quello dell'avversario, dove si vedono solo i colpi sparati e le navi gia'
 * affondate. La differenza la fanno le celle che gli si passano.
 */
export const Mare = memo(function Mare({ celle, onTocca, bloccata, piccolo = false, etichetta }: Props) {
  const toccabile = Boolean(onTocca)
  return (
    <div className={`mare${piccolo ? ' mare--piccolo' : ''}`} role="grid" aria-label={etichetta}>
      <span className="mare__angolo" aria-hidden="true" />
      {[...LETTERE_COLONNE].map((l) => (
        <span key={l} className="mare__intestazione" aria-hidden="true">
          {l}
        </span>
      ))}
      {Array.from({ length: LATO }, (_, r) => (
        <Riga
          key={r}
          r={r}
          celle={celle}
          toccabile={toccabile}
          onTocca={onTocca}
          bloccata={bloccata}
        />
      ))}
    </div>
  )
})

function Riga({
  r,
  celle,
  toccabile,
  onTocca,
  bloccata,
}: {
  r: number
  celle: readonly CellaMare[]
  toccabile: boolean
  onTocca?: (casella: number) => void
  bloccata?: (casella: number) => boolean
}) {
  return (
    <>
      <span className="mare__intestazione" aria-hidden="true">
        {r + 1}
      </span>
      {Array.from({ length: LATO }, (_, c) => {
        const k = r * LATO + c
        const cella = celle[k] ?? {}
        const classi = [
          'mare__cella',
          cella.nave ? 'has-nave' : '',
          cella.nave?.inizio ? 'is-inizio' : '',
          cella.nave?.fine ? 'is-fine' : '',
          cella.nave?.verticale ? 'is-verticale' : '',
          cella.colpo ? `is-${cella.colpo}` : '',
          cella.affondata ? 'is-a-fondo' : '',
          cella.scelta ? 'is-scelta' : '',
          cella.nuovo ? 'is-nuovo' : '',
        ]
          .filter(Boolean)
          .join(' ')
        const descrizione = `${coordinata(k)}${cella.colpo ? `, ${NOMI_ESITO[cella.colpo]}` : ''}${
          cella.nave && !cella.colpo ? ', nave' : ''
        }`
        if (!toccabile) {
          return (
            <span key={k} className={classi} role="gridcell" aria-label={descrizione}>
              <Segno cella={cella} />
            </span>
          )
        }
        return (
          <button
            key={k}
            type="button"
            role="gridcell"
            className={classi}
            onClick={() => onTocca?.(k)}
            disabled={bloccata?.(k) ?? false}
            aria-label={descrizione}
          >
            <Segno cella={cella} />
          </button>
        )
      })}
    </>
  )
}

/** Il segno del colpo: un punto per l'acqua, una croce per il colpito. */
function Segno({ cella }: { cella: CellaMare }) {
  if (cella.colpo === 'acqua') return <span className="mare__acqua" aria-hidden="true" />
  if (cella.colpo) return <span className="mare__croce" aria-hidden="true" />
  return null
}

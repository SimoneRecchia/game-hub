import { memo } from 'react'
import { LATO, premioDi, type Casella, type Posa } from '@shared/scarabeo'
import type { Cursore } from './useComposizione'
import './Tabellone.css'

interface Props {
  tabellone: (Casella | null)[]
  /** Le tessere posate e non ancora giocate: si possono riprendere. */
  sospese: Posa[]
  cursore: Cursore | null
  bloccato: boolean
  onTocca: (r: number, c: number) => void
  /** Caselle da far notare: l'ultima mossa del computer, per un attimo. */
  evidenziate?: ReadonlySet<number>
  /** La posa in corso forma una parola che non esiste: le tessere diventano rosse. */
  sbagliata?: boolean
}

/**
 * Il tabellone: quindici per quindici, tutto in vista.
 *
 * Nessuno zoom e nessuno scorrimento dentro la griglia. Su un telefono una
 * casella viene 23 punti — meno del bersaglio di 44 delle linee guida Apple —
 * ed e' una scelta: un tabellone che si trascina costringerebbe a perdere di
 * vista dove si sta scrivendo, che in questo gioco e' l'unica informazione che
 * conta. Il tocco piccolo e' compensato dal fatto che sbagliare casella non
 * costa niente: si ritocca la tessera e torna in mano.
 */
export function Tabellone({ tabellone, sospese, cursore, bloccato, onTocca, evidenziate, sbagliata = false }: Props) {
  const inSospeso = new Set(sospese.map((p) => p.r * LATO + p.c))

  return (
    <div className="tabellone" role="grid" aria-label="Tabellone dello Scarabeo">
      {tabellone.map((casella, i) => {
        const r = Math.floor(i / LATO)
        const c = i % LATO
        return (
          <Cella
            key={i}
            r={r}
            c={c}
            casella={casella}
            sospesa={inSospeso.has(i)}
            sbagliata={sbagliata && inSospeso.has(i)}
            evidenziata={evidenziate?.has(i) ?? false}
            cursore={cursore !== null && cursore.r === r && cursore.c === c ? cursore.oriz : null}
            bloccato={bloccato}
            onTocca={onTocca}
          />
        )
      })}
    </div>
  )
}

interface CellaProps {
  r: number
  c: number
  casella: Casella | null
  sospesa: boolean
  sbagliata: boolean
  evidenziata: boolean
  /** true = cursore orizzontale, false = verticale, null = niente cursore. */
  cursore: boolean | null
  bloccato: boolean
  onTocca: (r: number, c: number) => void
}

const Cella = memo(function Cella({
  r,
  c,
  casella,
  sospesa,
  sbagliata,
  evidenziata,
  cursore,
  bloccato,
  onTocca,
}: CellaProps) {
  const premio = premioDi(r, c)
  const classi = ['cella']
  if (premio && !casella) classi.push(`cella--${premio}`)
  if (casella) classi.push(sospesa ? 'cella--sospesa' : 'cella--tessera')
  if (casella?.jolly) classi.push('cella--jolly')
  if (sbagliata) classi.push('cella--sbagliata')
  if (evidenziata && casella) classi.push('cella--evidenziata')
  if (cursore !== null) classi.push(cursore ? 'cella--cursore-oriz' : 'cella--cursore-vert')

  const nome = casella
    ? `${casella.lettera.toUpperCase()}${casella.jolly ? ' (jolly)' : ''} in ${r + 1},${c + 1}`
    : premio
      ? `${r + 1},${c + 1} ${NOMI[premio]}`
      : `${r + 1},${c + 1} libera`

  return (
    <button
      type="button"
      role="gridcell"
      className={classi.join(' ')}
      aria-label={nome}
      // Le caselle del tabellone non si disabilitano a giornata chiusa: restano
      // leggibili, e un bottone disabilitato su una griglia di 225 caselle
      // cambierebbe il contrasto di tutto il disegno.
      onClick={bloccato ? undefined : () => onTocca(r, c)}
    >
      {casella ? (
        <span className="cella__lettera">{casella.lettera.toUpperCase()}</span>
      ) : premio === 'centro' ? (
        <span className="cella__stella" aria-hidden="true">
          ★
        </span>
      ) : null}
    </button>
  )
})

const NOMI: Record<string, string> = {
  tp: 'parola tripla',
  dp: 'parola doppia',
  tl: 'lettera tripla',
  dl: 'lettera doppia',
  centro: 'casella centrale',
}

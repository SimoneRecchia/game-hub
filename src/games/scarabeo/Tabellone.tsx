import { memo } from 'react'
import { LATO, VALORI, premioDi, type Casella, type Posa } from '@shared/scarabeo'
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
    // La cornice di legno sta attorno alla griglia, con il filo e l'ombra secca degli oggetti dell'album.
    <div className="scr-tavola">
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
  if (premio) classi.push(`cella--${premio}`)
  if (casella) classi.push(sospesa ? 'cella--sospesa' : 'cella--tessera')
  if (cursore !== null) classi.push(cursore ? 'cella--cursore-oriz' : 'cella--cursore-vert')
  // La tessera e' un pezzo appoggiato sulla casella: si anima da sola, posata, arrivata o rifiutata.
  const tessera = ['cella__tessera']
  if (sospesa) tessera.push('is-sospesa')
  if (casella?.jolly) tessera.push('is-jolly')
  if (sbagliata) tessera.push('is-sbagliata')
  if (evidenziata && casella) tessera.push('is-evidenziata')

  const nome = casella
    ? `${casella.lettera.toUpperCase()}${casella.jolly ? ' (jolly)' : ''} in ${r + 1},${c + 1}`
    : `${r + 1},${c + 1} ${premio ? NOMI[premio] : 'libera'}${
        cursore === null ? '' : cursore ? ', si scrive verso destra' : ', si scrive verso il basso'
      }`

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
        <span className={tessera.join(' ')} aria-hidden="true">
          <span className="cella__lettera">{casella.lettera.toUpperCase()}</span>
          <span className="cella__valore">{casella.jolly ? 0 : VALORI[casella.lettera]}</span>
        </span>
      ) : cursore !== null ? (
        // Da che parte si scrive. Sulla casella centrale prende il posto della stella.
        <svg className="cella__freccia" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3 8h9.5M8.5 3.5 13 8l-4.5 4.5" />
        </svg>
      ) : premio === 'centro' ? (
        <svg className="cella__stella" viewBox="0 0 24 24" aria-hidden="true">
          <path d="m12 2.8 2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.6l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8Z" />
        </svg>
      ) : premio ? (
        // Il premio scritto sulla casella, come sul tabellone vero: il colore dice la famiglia, la scritta quanto.
        <span className="cella__premio" aria-hidden="true">
          {SIGLE[premio]}
        </span>
      ) : null}
    </button>
  )
})

/** Le sigle stampate sulle caselle premio: P la parola, L la lettera. */
const SIGLE: Record<string, string> = { tp: '3P', dp: '2P', tl: '3L', dl: '2L' }

const NOMI: Record<string, string> = {
  tp: 'parola tripla',
  dp: 'parola doppia',
  tl: 'lettera tripla',
  dl: 'lettera doppia',
  centro: 'casella centrale',
}

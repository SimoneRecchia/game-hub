import { memo, useEffect, useRef, type CSSProperties } from 'react'
import { LATO, LETTERE_COLONNE, coordinata, type Esito, type IdNave } from '@shared/battaglia'
import './Mare.css'

export interface CellaMare {
  /**
   * Un pezzo di nave: quale, se e' la prua o la poppa (per arrotondare le
   * estremita'), e quale pezzo e' contando dalla prua.
   */
  nave?: { tipo: IdNave; inizio: boolean; fine: boolean; verticale: boolean; pezzo: number }
  colpo?: Esito
  /** La nave qui sopra e' a fondo. */
  affondata?: boolean
  /** ...ed e' andata a fondo con l'ultimo colpo: la si vede affondare. */
  affondataOra?: boolean
  /** La nave qui sopra e' quella scelta per spostarla. */
  scelta?: boolean
  /** L'ultimo colpo arrivato: lo spruzzo, o l'esplosione, si vede qui. */
  nuovo?: boolean
  /** Ci si e' appena sparato, e la risposta sta arrivando. */
  mirata?: boolean
}

interface Props {
  celle: readonly CellaMare[]
  /** Senza, il mare si guarda e non si tocca. */
  onTocca?: (casella: number) => void
  /** Le caselle che non si possono toccare, anche se il mare e' toccabile. */
  bloccata?: (casella: number) => boolean
  piccolo?: boolean
  etichetta: string
  /**
   * Il colpo appena arrivato fa tremare il mare: poco se ha colpito, di piu'
   * se ha affondato. L'id cambia a ogni colpo, ed e' quello a farlo ripartire.
   */
  scossa?: { id: number; forte: boolean } | null
  /** Dove sta per sparare l'avversario: il suo mirino ci arriva cercando. */
  mirino?: number | null
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
 *
 * Tre segni, uno per esito, che si distinguono anche senza i colori: lo spruzzo
 * per l'acqua, il fuoco per una nave colpita e ancora a galla, il relitto scuro
 * con le croci per una nave a fondo.
 */
export const Mare = memo(function Mare({
  celle,
  onTocca,
  bloccata,
  piccolo = false,
  etichetta,
  scossa = null,
  mirino = null,
}: Props) {
  const toccabile = Boolean(onTocca)
  const ref = useRef<HTMLDivElement>(null)
  const idScossa = scossa?.id
  const forte = scossa?.forte ?? false

  // L'animazione si fa partire da qui e non con una classe: una classe gia'
  // messa non ripartirebbe al colpo successivo.
  useEffect(() => {
    const mare = ref.current
    if (idScossa === undefined || !mare || typeof mare.animate !== 'function') return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const d = forte ? 6 : 3
    mare.animate(
      [
        { transform: 'translate(0, 0)' },
        { transform: `translate(${-d}px, 1px) rotate(-0.4deg)` },
        { transform: `translate(${d}px, -1px) rotate(0.4deg)` },
        { transform: `translate(${-d / 2}px, 0)` },
        { transform: `translate(${d / 2}px, 0)` },
        { transform: 'translate(0, 0)' },
      ],
      { duration: forte ? 560 : 380, easing: 'ease-out' },
    )
  }, [idScossa, forte])

  return (
    <div ref={ref} className={`mare${piccolo ? ' mare--piccolo' : ''}${toccabile ? ' mare--bersaglio' : ''}`} role="grid" aria-label={etichetta}>
      <span className="mare__acque" aria-hidden="true" />
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
      {mirino !== null && <Mirino key={mirino} casella={mirino} />}
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
          cella.affondataOra ? 'is-affondata-ora' : '',
          cella.scelta ? 'is-scelta' : '',
          cella.nuovo ? 'is-nuovo' : '',
          cella.mirata ? 'is-mirata' : '',
        ]
          .filter(Boolean)
          .join(' ')
        const stile = cella.affondataOra ? ({ '--pezzo': cella.nave?.pezzo ?? 0 } as CSSProperties) : undefined
        const esito = cella.affondata ? 'affondato' : cella.colpo ? NOMI_ESITO[cella.colpo] : null
        const descrizione = `${coordinata(k)}${esito ? `, ${esito}` : ''}${cella.nave && !cella.colpo ? ', nave' : ''}`
        if (!toccabile) {
          return (
            <span key={k} className={classi} style={stile} role="gridcell" aria-label={descrizione}>
              <Segno cella={cella} k={k} />
            </span>
          )
        }
        return (
          <button
            key={k}
            type="button"
            role="gridcell"
            className={classi}
            style={stile}
            onClick={() => onTocca?.(k)}
            disabled={bloccata?.(k) ?? false}
            aria-label={descrizione}
          >
            <Segno cella={cella} k={k} />
          </button>
        )
      })}
    </>
  )
}

/** Il segno del colpo: lo spruzzo per l'acqua, il fuoco per il colpito, la croce sul relitto. */
function Segno({ cella, k }: { cella: CellaMare; k: number }) {
  if (!cella.colpo) return null
  if (cella.colpo === 'acqua') return <span className="mare__spruzzo" aria-hidden="true" />
  if (cella.affondata) return <span className="mare__croce" aria-hidden="true" />
  // Le fiamme non tremano tutte insieme: sembrerebbe un'insegna, non un incendio.
  return <Fuoco fase={(k % 5) * -170} />
}

/** La fiamma di una nave colpita e ancora a galla. */
export function Fuoco({ fase = 0 }: { fase?: number }) {
  return (
    <svg
      className="mare__fuoco"
      viewBox="0 0 24 24"
      aria-hidden="true"
      style={{ '--fase': `${fase}ms` } as CSSProperties}
    >
      <path
        className="mare__fiamma"
        d="M12 1.8c.7 3.3 2.8 5 4.3 6.9 1.5 1.9 2.4 3.9 2.4 6.3A6.7 6.7 0 0 1 12 21.7 6.7 6.7 0 0 1 5.3 15c0-3 1.6-5 3.2-6.4.2 1.6.9 2.8 2 3.4C10.2 8.5 10.8 5 12 1.8z"
      />
      <path
        className="mare__fiamma-cuore"
        d="M12 11.6c.5 1.7 1.5 2.6 2.1 3.5.5.8.8 1.6.8 2.4a2.9 2.9 0 0 1-5.8 0c0-1.3.6-2.1 1.3-2.8.1.7.4 1.2.9 1.5-.2-1.7.1-3.2.7-4.6z"
      />
    </svg>
  )
}

/**
 * Il mirino dell'avversario: parte da qualche casella piu' in la', cerca, e si
 * ferma dove arrivera' il colpo. Da dove parte dipende dalla casella, non dal
 * caso, così lo stesso colpo si vede sempre allo stesso modo.
 */
function Mirino({ casella }: { casella: number }) {
  const r = Math.floor(casella / LATO)
  const c = casella % LATO
  const dx = ((casella * 37) % 7) - 3 || 2
  const dy = ((casella * 53) % 7) - 3 || -2
  return (
    <span
      className="mare__mirino"
      aria-hidden="true"
      style={
        {
          // Con la sola linea d'inizio, un elemento assoluto arriva fino al
          // bordo della griglia: `span 1` lo tiene sulla sua casella.
          gridRow: `${r + 2} / span 1`,
          gridColumn: `${c + 2} / span 1`,
          '--da-x': `${dx * 100}%`,
          '--da-y': `${dy * 100}%`,
        } as CSSProperties
      }
    >
      <svg viewBox="0 0 40 40">
        <circle cx="20" cy="20" r="13" />
        <path d="M20 2v9M20 29v9M2 20h9M29 20h9" />
        <circle className="mare__mirino-centro" cx="20" cy="20" r="2.2" />
      </svg>
    </span>
  )
}

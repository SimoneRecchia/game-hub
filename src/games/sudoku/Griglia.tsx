import type { CSSProperties } from 'react'
import { LATO, UNITA, VUOTA, colonnaDi, rigaDi, riquadroDi } from '@shared/sudoku'
import './Griglia.css'

/** La casella k dal riquadro b e dalla posizione i dentro il riquadro. */
const casella = (b: number, i: number) => (Math.floor(b / 3) * 3 + Math.floor(i / 3)) * LATO + (b % 3) * 3 + (i % 3)

/**
 * La griglia del sudoku: nove riquadri di nove caselle, con il filo sottile
 * fra le caselle e quello spesso fra i riquadri, come sulla carta.
 *
 * La casella scelta e' indaco pieno come ogni selezione dell'app; la sua riga, la sua
 * colonna e il suo riquadro appena velati, e le altre caselle con la stessa
 * cifra un po' di piu': e' quel che si guarda per capire dove una cifra puo'
 * ancora stare. I doppioni si segnano subito, perché si vedono a occhio; gli
 * errori veri solo dopo un controllo, perché la soluzione la sa il server.
 */
export function Griglia({
  dati,
  cifre,
  note,
  scelta,
  svelate,
  segnalate,
  doppioni,
  completate,
  soluzione,
  onTocca,
}: {
  dati: string
  cifre: string
  note: Uint16Array
  scelta: number | null
  svelate: ReadonlySet<number>
  segnalate: ReadonlySet<number>
  doppioni: ReadonlySet<number>
  /** Le unità appena completate: un'onda le attraversa. */
  completate: ReadonlySet<number>
  /** Lo schema appena risolto: un'onda lo attraversa in diagonale. */
  soluzione: string | null
  onTocca: (k: number) => void
}) {
  const cifraScelta = scelta !== null && cifre[scelta] !== VUOTA ? cifre[scelta] : null
  const ondaDi = (k: number): number | null => {
    for (const u of [rigaDi(k), LATO + colonnaDi(k), 2 * LATO + riquadroDi(k)]) {
      if (completate.has(u)) return UNITA[u].indexOf(k)
    }
    return null
  }

  return (
    <div className="sud-griglia" role="grid" aria-label="Sudoku">
      {Array.from({ length: 9 }, (_, b) => (
        <div key={b} className="sud-riquadro" role="presentation">
          {Array.from({ length: 9 }, (_, i) => {
            const k = casella(b, i)
            const d = cifre[k]
            const data = dati[k] !== VUOTA
            const vicina =
              scelta !== null &&
              k !== scelta &&
              (rigaDi(k) === rigaDi(scelta) || colonnaDi(k) === colonnaDi(scelta) || riquadroDi(k) === riquadroDi(scelta))
            const onda = ondaDi(k)
            const classi = [
              'sud-casella',
              data ? 'is-data' : d !== VUOTA ? 'is-mia' : '',
              svelate.has(k) ? 'is-svelata' : '',
              segnalate.has(k) ? 'is-sbagliata' : '',
              doppioni.has(k) && !data ? 'is-doppione' : '',
              k === scelta ? 'is-scelta' : vicina ? 'is-vicina' : '',
              cifraScelta && d === cifraScelta && k !== scelta ? 'is-uguale' : '',
              onda !== null ? 'is-onda' : '',
              soluzione ? 'is-finita' : '',
            ]
              .filter(Boolean)
              .join(' ')
            const r = rigaDi(k) + 1
            const c = colonnaDi(k) + 1
            return (
              <button
                key={k}
                type="button"
                role="gridcell"
                className={classi}
                style={
                  onda !== null
                    ? ({ '--onda': onda } as CSSProperties)
                    : soluzione
                      ? ({ '--onda': rigaDi(k) + colonnaDi(k) } as CSSProperties)
                      : undefined
                }
                aria-label={`Riga ${r}, colonna ${c}: ${d !== VUOTA ? d : 'vuota'}${data ? ', data' : ''}${
                  segnalate.has(k) ? ', sbagliata' : ''
                }`}
                aria-selected={k === scelta}
                onClick={() => onTocca(k)}
              >
                {d !== VUOTA ? (
                  <span key={d} className="sud-casella__cifra">
                    {d}
                  </span>
                ) : note[k] ? (
                  <span className="sud-casella__note" aria-hidden="true">
                    {Array.from({ length: 9 }, (_, n) => (
                      <span key={n} className={cifraScelta === String(n + 1) ? 'is-uguale' : undefined}>
                        {note[k] & (1 << n) ? n + 1 : ''}
                      </span>
                    ))}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

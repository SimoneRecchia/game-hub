import type { DatiAdesivo } from '@/components/Adesivo'
import './adesivi.css'

/** Gli adesivi del sudoku: l'esito di un controllo e lo schema risolto, nel viola del gioco. */

export const ADESIVO_CONTROLLO_MS = 1_300
export const ADESIVO_RISOLTO_MS = 1_900

const VIOLA = 'linear-gradient(155deg, var(--sudoku-1), var(--sudoku-2) 80%)'

export function adesivoControllo(esito: { ambito: 'casella' | 'tutto'; errate: number }): Omit<DatiAdesivo, 'id'> {
  if (esito.errate === 0) {
    return {
      tono: 'vivace',
      titolo: 'Tutto giusto!',
      sotto: esito.ambito === 'casella' ? 'La cifra va bene' : 'Nessun errore, fin qui',
      colore: VIOLA,
      durata: ADESIVO_CONTROLLO_MS,
      suono: 'giusto',
    }
  }
  return {
    tono: 'bordato',
    titolo: esito.errate === 1 ? 'Una cifra' : `${esito.errate} cifre`,
    sotto: 'da correggere, in rosso',
    colore: 'var(--red)',
    durata: ADESIVO_CONTROLLO_MS,
    suono: 'sbagliato',
  }
}

export function adesivoRisolto(dettaglio: string): Omit<DatiAdesivo, 'id'> {
  return {
    tono: 'vivace',
    titolo: 'Risolto!',
    sotto: dettaglio,
    colore: VIOLA,
    durata: ADESIVO_RISOLTO_MS,
    disegno: <Riquadro />,
    suono: 'vittoria',
  }
}

/** Un riquadro che si riempie, cifra dopo cifra. */
function Riquadro() {
  return (
    <svg className="adesivo__disegno sud-riquadro-adesivo" viewBox="0 0 120 80" aria-hidden="true">
      {Array.from({ length: 9 }, (_, i) => (
        <g key={i} style={{ animationDelay: `${i * 70}ms` }}>
          <rect x={33 + (i % 3) * 19} y={8 + Math.floor(i / 3) * 22} width={16} height={19} rx={3.5} fill="#fff" fillOpacity={0.92} />
          <text
            x={41 + (i % 3) * 19}
            y={22.5 + Math.floor(i / 3) * 22}
            textAnchor="middle"
            fontFamily="ui-rounded, -apple-system, system-ui, sans-serif"
            fontWeight={800}
            fontSize={12}
            fill="var(--sudoku-2)"
          >
            {[5, 3, 8, 1, 9, 4, 7, 2, 6][i]}
          </text>
        </g>
      ))}
    </svg>
  )
}

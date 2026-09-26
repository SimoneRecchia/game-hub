import type { CSSProperties } from 'react'
import { Adesivo } from '@/components/Adesivo'
import { DURATA_ANNUNCIO_MS, type Annuncio } from './racconto'
import './Annuncio.css'

/**
 * Il colpo che conta, al centro dello schermo e per un attimo: "Colpito!" con
 * un'esplosione, "Affondata!" con la nave che va giu' fra le onde.
 *
 * E' un `Adesivo`: i propri colpi sono la carta colorata che salta fuori,
 * quelli presi la carta bianca bordata di rosso che trema. Si capisce chi ha
 * colpito chi prima di leggere.
 */
export function AnnuncioColpo({ annuncio }: { annuncio: Annuncio | null }) {
  if (!annuncio) return <Adesivo adesivo={null} />
  const colore = !annuncio.mio
    ? undefined
    : annuncio.esito === 'colpito'
      ? 'linear-gradient(155deg, #ff9a3c, #e0322b 72%)'
      : 'linear-gradient(155deg, var(--battaglia-1), var(--battaglia-2) 80%)'
  return (
    <Adesivo
      adesivo={{
        id: annuncio.id,
        tono: annuncio.mio ? 'vivace' : 'bordato',
        titolo: annuncio.titolo,
        sotto: annuncio.sotto,
        colore,
        durata: DURATA_ANNUNCIO_MS[annuncio.esito],
        classe: `annuncio is-${annuncio.esito} ${annuncio.mio ? 'is-mio' : 'is-suo'}`,
        disegno: annuncio.esito === 'colpito' ? <Esplosione /> : <Affondamento />,
        piede: annuncio.nave ? (
          <span className="annuncio__caselle">
            {Array.from({ length: annuncio.nave.lunghezza }, (_, i) => (
              <span key={i} style={{ '--i': i } as CSSProperties} />
            ))}
          </span>
        ) : undefined,
      }}
    />
  )
}

/** Una stella a punte alternate, attorno al centro del disegno. */
function stella(punte: number, fuori: number, dentro: number, giro = 0): string {
  return Array.from({ length: punte * 2 }, (_, i) => {
    const r = i % 2 === 0 ? fuori : dentro
    const a = ((i * Math.PI) / punte) + giro
    return `${(60 + r * Math.sin(a)).toFixed(1)},${(60 - r * Math.cos(a)).toFixed(1)}`
  }).join(' ')
}

const SCINTILLE = [0, 45, 90, 135, 180, 225, 270, 315]

/** Lo scoppio di un colpo andato a segno. Serve anche alla schermata di fine. */
export function Esplosione() {
  return (
    <svg className="adesivo__disegno annuncio__disegno annuncio__esplosione" viewBox="0 0 120 120">
      {SCINTILLE.map((a) => (
        <g key={a} transform={`rotate(${a + 22} 60 60)`}>
          <line className="annuncio__scintilla" x1="60" y1="14" x2="60" y2="4" />
        </g>
      ))}
      <polygon className="annuncio__scoppio" points={stella(11, 50, 30)} />
      <polygon className="annuncio__scoppio-dentro" points={stella(9, 30, 18, 0.3)} />
      <circle className="annuncio__scoppio-cuore" cx="60" cy="60" r="11" />
    </svg>
  )
}

/** La nave che va giu' fra le onde. Serve anche alla schermata di fine. */
export function Affondamento() {
  return (
    <svg className="adesivo__disegno annuncio__disegno annuncio__affondamento" viewBox="0 0 120 90">
      <defs>
        <clipPath id="annuncio-sopra-acqua">
          <rect x="0" y="0" width="120" height="62" />
        </clipPath>
        {/* L'acqua sfuma verso il basso: finisce nella carta, non con uno spigolo. */}
        <linearGradient id="annuncio-acqua" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="annuncio__acqua-su" />
          <stop offset="1" className="annuncio__acqua-giu" />
        </linearGradient>
      </defs>
      <g clipPath="url(#annuncio-sopra-acqua)">
        <g className="annuncio__nave">
          <rect className="annuncio__ciminiera" x="61" y="22" width="9" height="14" rx="1.5" />
          <rect className="annuncio__ponte" x="42" y="33" width="34" height="13" rx="3" />
          <path className="annuncio__scafo" d="M16 46h88l-11 17H28z" />
          <circle className="annuncio__oblo" cx="46" cy="53" r="2.4" />
          <circle className="annuncio__oblo" cx="60" cy="53" r="2.4" />
          <circle className="annuncio__oblo" cx="74" cy="53" r="2.4" />
        </g>
      </g>
      <circle className="annuncio__bolla" cx="54" cy="70" r="3" />
      <circle className="annuncio__bolla" cx="64" cy="74" r="2.2" />
      <circle className="annuncio__bolla" cx="59" cy="78" r="1.8" />
      <g className="annuncio__onde">
        <path fill="url(#annuncio-acqua)" d="M-40 62q10-6 20 0t20 0 20 0 20 0 20 0 20 0 20 0 20 0 20 0V90H-40z" />
      </g>
    </svg>
  )
}

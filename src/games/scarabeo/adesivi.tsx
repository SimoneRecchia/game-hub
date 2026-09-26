import { LettereAdesivo, type DatiAdesivo } from '@/components/Adesivo'
import './adesivi.css'

/**
 * Gli adesivi dello Scarabeo: la mossa appena giocata, con la parola in
 * tessere di legno e i punti; lo scarabeo, quando si posano tutte e otto le
 * tessere; la fine della partita.
 */

/** Una mossa appena fatta, da mostrare al centro. */
export interface MossaAppena {
  id: number
  mia: boolean
  parola: string
  punti: number
  scarabeo: boolean
}

export const ADESIVO_MOSSA_MS = 1_250
export const ADESIVO_SCARABEO_MS = 1_900
export const ADESIVO_FINE_SCARABEO_MS = 1_800

/** Una mossa del computer merita l'adesivo solo se ha fatto male: le altre bastano nel tabellino. */
export const MOSSA_DEL_COMPUTER_DA_ADESIVO = 24

const LEGNO = 'linear-gradient(155deg, var(--scarabeo-1), var(--scarabeo-2) 80%)'

export function adesivoMossa(m: MossaAppena): DatiAdesivo {
  const piede = <LettereAdesivo parola={m.parola} classe="is-legno" />
  if (m.scarabeo) {
    return {
      id: m.id,
      tono: m.mia ? 'vivace' : 'bordato',
      titolo: 'Scarabeo!',
      sotto: `${m.mia ? '' : 'Il computer · '}+${m.punti} punti`,
      colore: m.mia ? LEGNO : 'var(--scarabeo-2)',
      durata: ADESIVO_SCARABEO_MS,
      disegno: <Scarabeo />,
      piede,
    }
  }
  return {
    id: m.id,
    tono: m.mia ? 'vivace' : 'bordato',
    titolo: `+${m.punti}`,
    sotto: m.mia ? (m.punti >= 30 ? 'Gran mossa!' : m.punti >= 18 ? 'Bella mossa' : 'punti') : 'Il computer',
    colore: m.mia ? LEGNO : 'var(--scarabeo-2)',
    durata: ADESIVO_MOSSA_MS,
    piede,
  }
}

export function adesivoFineScarabeo(id: number, vinta: boolean, punti: number, altro: number): DatiAdesivo {
  return vinta
    ? {
        id,
        tono: 'vivace',
        titolo: 'Hai vinto!',
        sotto: `${punti} a ${altro} contro il computer`,
        colore: LEGNO,
        durata: ADESIVO_FINE_SCARABEO_MS,
        disegno: <Scarabeo />,
      }
    : {
        id,
        tono: 'bordato',
        titolo: punti === altro ? 'Pari!' : 'Ha vinto il computer',
        sotto: `${punti} a ${altro}`,
        colore: 'var(--scarabeo-2)',
        durata: ADESIVO_FINE_SCARABEO_MS,
      }
}

/**
 * Lo scarabeo: la mascotte del gioco, d'oro come quello degli egizi. Muove le
 * zampe e fa un saltello.
 */
export function Scarabeo({ classe = 'adesivo__disegno' }: { classe?: string }) {
  return (
    <svg className={`${classe} scarabeo-disegno`} viewBox="0 0 120 96" aria-hidden="true">
      <defs>
        <linearGradient id="scarabeo-guscio" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffe27a" />
          <stop offset="0.55" stopColor="#f5a623" />
          <stop offset="1" stopColor="#b8650f" />
        </linearGradient>
      </defs>
      <g className="scarabeo-disegno__corpo">
        {/* Le zampe: tre per lato, che si muovono a turno. */}
        <g className="scarabeo-disegno__zampe scarabeo-disegno__zampe--sx">
          <path d="M44 42 28 34 20 38" />
          <path d="M42 54 24 54 16 60" />
          <path d="M44 66 30 74 24 84" />
        </g>
        <g className="scarabeo-disegno__zampe scarabeo-disegno__zampe--dx">
          <path d="M76 42 92 34 100 38" />
          <path d="M78 54 96 54 104 60" />
          <path d="M76 66 90 74 96 84" />
        </g>
        {/* Le antenne e la testa. */}
        <path className="scarabeo-disegno__antenna" d="M54 22 48 10 42 8" />
        <path className="scarabeo-disegno__antenna" d="M66 22 72 10 78 8" />
        <ellipse className="scarabeo-disegno__testa" cx="60" cy="26" rx="12" ry="9" />
        {/* Il guscio: due ali d'oro con la riga in mezzo. */}
        <ellipse cx="60" cy="56" rx="22" ry="27" fill="url(#scarabeo-guscio)" />
        <path className="scarabeo-disegno__riga" d="M60 31v51" />
        <ellipse className="scarabeo-disegno__lucido" cx="51" cy="46" rx="5" ry="9" />
        <circle className="scarabeo-disegno__punto" cx="52" cy="66" r="3" />
        <circle className="scarabeo-disegno__punto" cx="68" cy="60" r="3.4" />
        <circle className="scarabeo-disegno__punto" cx="66" cy="73" r="2.4" />
      </g>
    </svg>
  )
}

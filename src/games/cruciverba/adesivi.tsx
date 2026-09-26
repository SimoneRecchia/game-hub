import type { DatiAdesivo } from '@/components/Adesivo'
import './adesivi.css'

/**
 * Gli adesivi del cruciverba: l'esito di un controllo, e lo schema completato.
 * Il tratto del gioco e' la matita: scrive il segno di spunta, o lo schema.
 */

export const ADESIVO_CONTROLLO_MS = 1_300
export const ADESIVO_COMPLETATO_MS = 1_900

const INCHIOSTRO = 'linear-gradient(155deg, var(--cruciverba-1), var(--cruciverba-2) 80%)'

export function adesivoControllo(esito: { ambito: 'parola' | 'tutto'; errate: number }): Omit<DatiAdesivo, 'id'> {
  if (esito.errate === 0) {
    return {
      tono: 'vivace',
      titolo: 'Tutto giusto!',
      sotto: esito.ambito === 'parola' ? 'La parola va bene' : 'Nessun errore, fin qui',
      colore: INCHIOSTRO,
      durata: ADESIVO_CONTROLLO_MS,
      disegno: <Spunta />,
    }
  }
  return {
    tono: 'bordato',
    titolo: esito.errate === 1 ? 'Una lettera' : `${esito.errate} lettere`,
    sotto: esito.errate === 1 ? 'da correggere: è segnata in rosso' : 'da correggere: sono segnate in rosso',
    colore: 'var(--red)',
    durata: ADESIVO_CONTROLLO_MS,
  }
}

export function adesivoCompletato(punti: number): Omit<DatiAdesivo, 'id'> {
  return {
    tono: 'vivace',
    titolo: 'Completato!',
    sotto: punti >= 100 ? 'Senza nessun aiuto' : `${punti} punti`,
    colore: INCHIOSTRO,
    durata: ADESIVO_COMPLETATO_MS,
    disegno: <Matita />,
  }
}

/** Il segno di spunta, tracciato come a mano. */
function Spunta() {
  return (
    <svg className="adesivo__disegno cru-spunta" viewBox="0 0 120 80" aria-hidden="true">
      <circle className="cru-spunta__cerchio" cx="60" cy="40" r="30" />
      <path className="cru-spunta__segno" d="M44 41l11 11 22-24" />
    </svg>
  )
}

/** La matita che scrive: la punta traccia una riga e fa la spunta alla fine. */
function Matita() {
  return (
    <svg className="adesivo__disegno cru-matita" viewBox="0 0 120 84" aria-hidden="true">
      <path className="cru-matita__riga" d="M14 66c14-10 26 6 40-4s22-4 30-8" />
      <path className="cru-spunta__segno cru-matita__spunta" d="M88 44l7 7 14-16" />
      <g className="cru-matita__corpo">
        <path className="cru-matita__legno" d="M52 12l14 8-26 45-10 4 1-11z" />
        <path className="cru-matita__vernice" d="M56 5l14 8-5 8-14-8z" />
        <path className="cru-matita__punta" d="M31 58l9 7-10 4z" />
      </g>
    </svg>
  )
}

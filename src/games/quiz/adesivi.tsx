import type { DatiAdesivo } from '@/components/Adesivo'
import './adesivi.css'

/**
 * Gli adesivi del quiz: la risposta giusta, quella sbagliata, il tempo finito,
 * la fine della partita. Il tratto del gioco e' il mappamondo: gira, e uno
 * spillo ci cade sopra quando si indovina.
 *
 * Durano meno dell'esito della domanda (vedi `durataEsito`), così se ne vanno
 * prima che arrivi quella dopo.
 */

export const ADESIVO_RISPOSTA_MS = 1_300
export const ADESIVO_FINE_MS = 2_200

const COLORE = 'linear-gradient(155deg, var(--quiz-1), var(--quiz-2) 80%)'
const LODI = ['Esatto!', 'Giusto!', 'Ottimo!', 'Perfetto!', 'Sì!']

export function adesivoGiusta(indice: number, serie: number, punti: number | null): Omit<DatiAdesivo, 'id'> {
  return {
    tono: 'vivace',
    titolo: serie >= 3 ? `${serie} di fila!` : LODI[indice % LODI.length],
    sotto: punti !== null ? `+${punti} punti` : serie >= 3 ? 'Non sbagli un colpo' : undefined,
    colore: COLORE,
    durata: ADESIVO_RISPOSTA_MS,
    disegno: <Mappamondo />,
  }
}

export function adesivoSbagliata(risposta: string, cartina: boolean): Omit<DatiAdesivo, 'id'> {
  return {
    tono: 'bordato',
    titolo: 'No!',
    sotto: cartina ? `In verde: ${risposta}` : `Giusta: ${risposta}`,
    colore: 'var(--red)',
    durata: ADESIVO_RISPOSTA_MS,
  }
}

export function adesivoTempo(risposta: string): Omit<DatiAdesivo, 'id'> {
  return {
    tono: 'bordato',
    titolo: 'Tempo!',
    sotto: `Giusta: ${risposta}`,
    colore: 'var(--orange)',
    durata: ADESIVO_RISPOSTA_MS,
    disegno: <Clessidra />,
  }
}

export function adesivoFine(
  giuste: number,
  totale: number,
  punti: number | null,
  fuori = false,
): Omit<DatiAdesivo, 'id'> {
  // Con la morte improvvisa conta la serie: "0 su 1" direbbe poco.
  if (fuori) {
    return {
      tono: giuste >= 5 ? 'vivace' : 'bordato',
      titolo: giuste >= 10 ? 'Che serie!' : giuste === 0 ? 'Fuori subito' : 'Fuori!',
      sotto: `${giuste} di fila`,
      colore: giuste >= 5 ? COLORE : 'var(--quiz-2)',
      durata: ADESIVO_FINE_MS,
      ...(giuste >= 10 ? { disegno: <Mappamondo /> } : {}),
    }
  }
  const quota = totale > 0 ? giuste / totale : 0
  const sotto = `${giuste} su ${totale}${punti !== null ? ` · ${punti} punti` : ''}`
  if (quota >= 0.7) {
    return {
      tono: 'vivace',
      titolo: giuste === totale ? 'Tutte giuste!' : 'Ottima partita!',
      sotto,
      colore: COLORE,
      durata: ADESIVO_FINE_MS,
      disegno: <Mappamondo />,
    }
  }
  return {
    tono: quota >= 0.4 ? 'vivace' : 'bordato',
    titolo: quota >= 0.4 ? 'Bella partita' : 'Si può fare di più',
    sotto,
    colore: quota >= 0.4 ? COLORE : 'var(--quiz-2)',
    durata: ADESIVO_FINE_MS,
  }
}

/** Il mappamondo che gira, con lo spillo che ci cade sopra. */
function Mappamondo() {
  return (
    <svg className="adesivo__disegno quiz-globo" viewBox="0 0 120 90" aria-hidden="true">
      <g className="quiz-globo__sfera">
        <circle cx="60" cy="50" r="30" className="quiz-globo__mare" />
        <g className="quiz-globo__meridiani">
          <ellipse cx="60" cy="50" rx="12" ry="30" />
          <ellipse cx="60" cy="50" rx="24" ry="30" />
          <path d="M30 50h60M34 36h52M34 64h52" />
        </g>
        <path className="quiz-globo__terra" d="M44 34c6-4 12-2 14 3s-4 7-2 11 8 3 6 9-10 7-14 3-8-6-7-13 0-10 3-13z" />
        <path className="quiz-globo__terra" d="M68 30c5 0 9 3 9 7s-5 5-7 9-1 9 3 11-1 8-5 7-6-7-5-12-4-9-2-14 3-8 7-8z" />
      </g>
      <g className="quiz-globo__spillo">
        <path d="M60 8c-6 0-10 4.4-10 9.8C50 25 60 36 60 36s10-11 10-18.2C70 12.4 66 8 60 8z" />
        <circle cx="60" cy="17.5" r="3.6" />
      </g>
    </svg>
  )
}

/** La clessidra che si rovescia. */
function Clessidra() {
  return (
    <svg className="adesivo__disegno quiz-clessidra" viewBox="0 0 120 84" aria-hidden="true">
      <g className="quiz-clessidra__corpo">
        <path d="M44 10h32M44 74h32" />
        <path d="M48 10c0 18 24 18 24 32S48 56 48 74M72 10c0 18-24 18-24 32s24 14 24 32" />
        <path className="quiz-clessidra__sabbia" d="M52 66c3-5 13-5 16 0v4H52z" />
      </g>
    </svg>
  )
}

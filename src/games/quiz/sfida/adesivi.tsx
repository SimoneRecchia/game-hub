import type { DatiAdesivo } from '@/components/Adesivo'
import { ADESIVO_FINE_MS, ADESIVO_RISPOSTA_MS } from '../adesivi'

/**
 * Gli adesivi della sfida a due: il punto, mio o dell'altro, il punto di
 * nessuno, il rallenty, la fine. Vivaci le cose belle e mie, bordati quelle
 * brutte o dell'avversario, come negli altri giochi.
 */

const COLORE = 'linear-gradient(155deg, var(--quiz-1), var(--quiz-2) 80%)'
/** Il rallenty ha un colore suo: freddo, come il tempo che si ferma. */
const COLORE_RALLENTY = 'linear-gradient(155deg, var(--rallenty-1), var(--rallenty-2) 85%)'

export const ADESIVO_RALLENTY_MS = 1_800

export function adesivoPunto(mio: boolean, nome: string, risposta: string): Omit<DatiAdesivo, 'id'> {
  return mio
    ? { tono: 'vivace', titolo: 'Punto!', sotto: risposta, colore: COLORE, durata: ADESIVO_RISPOSTA_MS, suono: 'punto' }
    : {
        tono: 'bordato',
        titolo: `Punto a ${nome}`,
        sotto: `Giusta: ${risposta}`,
        colore: 'var(--red)',
        durata: ADESIVO_RISPOSTA_MS,
        suono: 'puntoAltro',
      }
}

export function adesivoNessuno(risposta: string): Omit<DatiAdesivo, 'id'> {
  return {
    tono: 'bordato',
    titolo: 'Nessun punto',
    sotto: `Giusta: ${risposta}`,
    colore: 'var(--orange)',
    durata: ADESIVO_RISPOSTA_MS,
    suono: 'scaduto',
  }
}

export function adesivoRallenty(nome: string): Omit<DatiAdesivo, 'id'> {
  return {
    tono: 'vivace',
    titolo: 'Rallenty!',
    sotto: `${nome} ha sbagliato: il tuo tempo rallenta`,
    colore: COLORE_RALLENTY,
    durata: ADESIVO_RALLENTY_MS,
    disegno: <Lumaca />,
    suono: 'rallenty',
  }
}

export function adesivoFuori(nome: string): Omit<DatiAdesivo, 'id'> {
  return {
    tono: 'bordato',
    titolo: 'Sbagliato',
    sotto: `Ora tocca a ${nome}`,
    colore: 'var(--red)',
    durata: ADESIVO_RISPOSTA_MS,
    suono: 'sbagliato',
  }
}

export function adesivoFineDuello(io: number, lui: number, nome: string): Omit<DatiAdesivo, 'id'> {
  const sotto = `${io} a ${lui}`
  const durata = ADESIVO_FINE_MS
  if (io > lui) return { tono: 'vivace', titolo: 'Hai vinto!', sotto, colore: COLORE, durata, suono: 'vittoria' }
  if (io === lui) return { tono: 'vivace', titolo: 'Pareggio', sotto, colore: COLORE, durata, suono: 'pareggio' }
  return { tono: 'bordato', titolo: `Ha vinto ${nome}`, sotto, colore: 'var(--red)', durata, suono: 'sconfitta' }
}

/** La lumaca del rallenty: attraversa l'adesivo piano, e la scia le resta dietro. */
function Lumaca() {
  return (
    <svg className="adesivo__disegno duello-lumaca" viewBox="0 0 140 80" aria-hidden="true">
      <path className="duello-lumaca__scia" d="M10 66h60" />
      <g className="duello-lumaca__corpo">
        <path
          className="duello-lumaca__piede"
          d="M40 66c0-6 6-8 14-8h40c8 0 12-6 14-14 1-4 5-6 8-4 3 2 3 6 1 10-4 10-10 16-20 16H40z"
        />
        <path className="duello-lumaca__antenne" d="M110 42l-4-14M116 42l4-13" />
        <circle className="duello-lumaca__occhio" cx="105.5" cy="27" r="3" />
        <circle className="duello-lumaca__occhio" cx="120.5" cy="28" r="3" />
        <circle className="duello-lumaca__guscio" cx="70" cy="42" r="19" />
        <path className="duello-lumaca__spirale" d="M70 42c0-4 5-5 7-2 3 4-1 10-7 10-8 0-12-8-9-15 4-8 16-9 21-1" />
      </g>
    </svg>
  )
}

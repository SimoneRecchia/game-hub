import type { DatiAdesivo } from '@/components/Adesivo'
import { CATEGORIE_PER_PARTITA } from '@shared/nomi-cose'
import { TIMBRO_MS } from './scena'
import './adesivi.css'

/**
 * Gli adesivi di Nomi, cose e città. Lo stop e' un timbro: una carta di carta
 * con la cornice doppia d'inchiostro, che si abbatte storta sul foglio come
 * quelli degli uffici, e il foglio sotto sobbalza (`scuoti`). Lo stesso per
 * chi dice stop e per chi lo riceve: cambia la riga sotto, e il tono — il mio
 * stop e' vivace, quello dell'altro bordato. Il tempo finito e' lo stesso
 * timbro, arancione.
 *
 * La fine arriva dopo la correzione del foglio (vedi scena.ts): l'adesivo
 * dice com'e' andata, con la matita che ci scrive sopra.
 */

export const ADESIVO_FINE_MS = 2_200

const COLORE = 'linear-gradient(135deg, var(--nomi-1), var(--nomi-2))'

/** Lo stop: io, il computer, o un amico. */
export function adesivoStop(chi: 'io' | string): Omit<DatiAdesivo, 'id'> {
  return {
    tono: chi === 'io' ? 'vivace' : 'bordato',
    titolo: 'Stop!',
    sotto: chi === 'io' ? 'Hai detto stop' : `${chi} ha finito`,
    colore: 'var(--nomi-timbro)',
    classe: 'nomi-timbro',
    durata: TIMBRO_MS,
    suono: 'stop',
  }
}

/** Il tempo finito: lo stesso timbro, arancione. Il suono e' quello della matita che arriva in fondo. */
export function adesivoTempo(): Omit<DatiAdesivo, 'id'> {
  return {
    tono: 'bordato',
    titolo: 'Tempo!',
    sotto: 'Si posa la matita',
    colore: 'var(--orange)',
    classe: 'nomi-timbro',
    durata: TIMBRO_MS,
  }
}

/** La classificata consegnata: quante valgono. I punti arrivano la notte. */
export function adesivoConsegna(valide: number | null, scritte: number): Omit<DatiAdesivo, 'id'> {
  const bene = valide === null || valide >= 3
  return {
    tono: bene ? 'vivace' : 'bordato',
    titolo:
      valide === null
        ? 'Consegnata'
        : valide === CATEGORIE_PER_PARTITA
          ? 'Tutte valide!'
          : `${valide} su ${CATEGORIE_PER_PARTITA}`,
    sotto: valide === null ? `${scritte} su ${CATEGORIE_PER_PARTITA}` : 'I punti arrivano stanotte',
    colore: bene ? COLORE : 'var(--nomi-2)',
    classe: bene ? 'nomi-giallo' : undefined,
    durata: ADESIVO_FINE_MS,
    disegno: bene ? <MatitaCheScrive /> : undefined,
    suono: valide === CATEGORIE_PER_PARTITA ? 'vittoria' : bene ? 'giusto' : 'sbagliato',
  }
}

/** Com'e' finita al tavolo, contro il computer o un amico. */
export function adesivoFine(
  esito: 'vinta' | 'persa' | 'patta',
  miei: number,
  suoi: number,
  altro: string,
): Omit<DatiAdesivo, 'id'> {
  const sotto = `${miei} a ${suoi}`
  if (esito === 'vinta') {
    return {
      tono: 'vivace',
      titolo: 'Hai vinto!',
      sotto,
      colore: COLORE,
      classe: 'nomi-giallo',
      durata: ADESIVO_FINE_MS,
      disegno: <MatitaCheScrive />,
      suono: 'vittoria',
    }
  }
  if (esito === 'patta') {
    return {
      tono: 'vivace',
      titolo: 'Pari',
      sotto,
      colore: COLORE,
      classe: 'nomi-giallo',
      durata: ADESIVO_FINE_MS,
      suono: 'pareggio',
    }
  }
  return {
    tono: 'bordato',
    titolo: `Ha vinto ${altro}`,
    sotto,
    colore: 'var(--nomi-2)',
    durata: ADESIVO_FINE_MS,
    suono: 'sconfitta',
  }
}

/**
 * La matita che traccia una spunta: si disegna mentre l'adesivo salta fuori.
 * La punta della matita e' l'origine del gruppo, cosi' la si porta lungo il
 * tratto con le stesse tappe del tratto (adesivi.css).
 */
function MatitaCheScrive() {
  return (
    <svg className="adesivo__disegno nomi-scrive" viewBox="0 0 120 80" aria-hidden="true">
      <path className="nomi-scrive__segno" pathLength={1} d="M30 44c6 4 11 10 15 17 9-19 23-34 42-45" />
      <g className="nomi-scrive__matita">
        <path d="M0 0l8-4h26v8H8z" className="nomi-scrive__legno" />
        <path d="M0 0l8-4v8z" className="nomi-scrive__punta" />
        <path d="M0 0l2.6-1.3v2.6z" className="nomi-scrive__grafite" />
        <rect x="34" y="-4" width="6" height="8" rx="1.5" className="nomi-scrive__gomma" />
      </g>
    </svg>
  )
}

/**
 * Il foglio che sobbalza sotto il timbro: quando l'adesivo si abbatte, a meta'
 * della sua entrata. Con il movimento ridotto non si muove.
 */
export function scuoti(el: Element | null) {
  if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  el.animate(
    [
      { transform: 'none' },
      { transform: 'translateY(3px) rotate(-0.4deg)', offset: 0.25 },
      { transform: 'translateY(-1.5px) rotate(0.25deg)', offset: 0.55 },
      { transform: 'none' },
    ],
    { duration: 360, delay: TIMBRO_MS * 0.16, easing: 'ease-out' },
  )
}

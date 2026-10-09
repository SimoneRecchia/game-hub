/**
 * Le regole dei movimenti fra le schermate, senza React e senza DOM: come entra
 * una schermata che si monta, e dove sta lo scorrimento dopo una navigazione.
 * Le usa `navigazione.tsx`, e i test le provano da sole.
 */

/**
 * Il movimento di una navigazione: lo sceglie chi naviga (vedi `navigazione.tsx`).
 * `tavolo` e' il passaggio fra la sala della roulette e il tavolo, nei due versi.
 */
export type Direzione = 'avanti' | 'indietro' | 'scheda' | 'nessuna' | 'tavolo'

/** Come React Router chiama una navigazione: indietro o avanti nella history, una nuova, una sostituita. */
export type TipoNavigazione = 'POP' | 'PUSH' | 'REPLACE'

/** L'ultima navigazione partita dall'app. */
export interface Navigazione {
  direzione: Direzione
  /** L'ha portata una View Transition: la schermata nuova e' gia' entrata con lei. */
  transizione: boolean
  /** `performance.now()` della partenza. */
  quando: number
}

/** Come entra la schermata che si monta. */
export interface Entrata {
  /** Il contenuto arriva a cascata (`.entra`, l'eroe, il podio): una schermata nuova. */
  cascata: boolean
  /** La schermata entra da sé, con un movimento breve: dove una View Transition non l'ha portata. */
  daSola: boolean
}

/**
 * Oltre questo, la schermata che si monta non e' quella dell'ultima navigazione
 * dell'app: e' arrivata da un gesto del browser. Il tempo comprende una rotta
 * da scaricare, che aspetta il suo pezzo prima di montarsi.
 */
export const DOPO_LA_NAVIGAZIONE_MS = 2_000

const FERMA: Entrata = { cascata: false, daSola: false }

/**
 * Il contenuto entra a cascata solo in una schermata nuova: la prima dell'app e
 * quelle che arrivano avanti. Tornando indietro o cambiando scheda la
 * schermata c'era gia', e rifare l'entrata dava l'aria di un ricaricamento —
 * come in un'app, quel che si ritrova e' gia' li'.
 */
export function entrataDi({
  prima,
  tipo,
  ultima,
  adesso,
  ridotto,
}: {
  /** E' la prima schermata che si monta dall'avvio. */
  prima: boolean
  tipo: TipoNavigazione
  ultima: Navigazione | null
  adesso: number
  /** Movimento ridotto: niente che entri da sé. */
  ridotto: boolean
}): Entrata {
  if (prima) return { cascata: true, daSola: !ridotto }
  if (!ultima || adesso - ultima.quando > DOPO_LA_NAVIGAZIONE_MS) return FERMA
  // Un passo indietro col gesto del browser, subito dopo un avanti dell'app: la schermata c'era gia'.
  if (tipo === 'POP' && ultima.direzione !== 'indietro') return FERMA
  const daSola = !ultima.transizione && !ridotto
  if (ultima.direzione === 'avanti' || ultima.direzione === 'tavolo') return { cascata: true, daSola }
  if (ultima.direzione === 'indietro') return { cascata: false, daSola }
  return FERMA
}

/**
 * Dove va lo scorrimento dopo una navigazione, o `null` se resta dov'e'.
 *
 * Una schermata nuova comincia dall'alto, e una schermata ritrovata tornando
 * indietro e' dove la si era lasciata. Una sostituzione nella stessa schermata
 * (il periodo della classifica) non sposta niente. Senza, la pagina nuova
 * prendeva lo scorrimento di quella di prima: dal fondo delle Libere le
 * Giornaliere si aprivano a meta', senza il titolo.
 */
export function scorrimentoDopo(
  tipo: TipoNavigazione,
  da: string,
  a: string,
  salvato: number | undefined,
): number | null {
  if (tipo === 'POP') return salvato ?? 0
  if (tipo === 'REPLACE' && da === a) return null
  return 0
}

/**
 * Il riassunto dei dati del quiz: tutto quel che serve per fare le domande, e
 * niente di piu'.
 *
 * Lo costruisce ogni notte `scripts/genera-quiz.ts` da Wikidata (paesi,
 * capitali, confini, fiumi, laghi) e da Natural Earth (le coste: chi e'
 * bagnato da quale mare lo dice la geometria, perché su Wikidata l'Italia
 * risultava bagnata da due mari e la Grecia da nessuno). Sta in D1 a pezzi,
 * uno per sezione, e il browser lo scarica una volta e lo tiene: la partita
 * libera si fa tutta lì. Le bandiere e le cartine non ci sono: il browser le
 * prende da flagcdn e da jsDelivr, e il server non le vede mai.
 *
 * Chiavi corte, perché sono qualche centinaio di voci per sezione.
 */

import type { Continente } from './quiz'

export interface PaeseQuiz {
  /** Codice ISO a due lettere: e' anche il nome della bandiera su flagcdn. */
  id: string
  /** Nome italiano: "Italia", "Paesi Bassi". */
  n: string
  /** La capitale, in italiano. */
  cap: string
  /**
   * La città piu' popolosa, se non e' la capitale: il trabocchetto delle
   * domande sulle capitali (Sydney, Istanbul, Zurigo).
   */
  trap?: string
  /** I continenti: di solito uno, due per Russia, Turchia, Egitto e pochi altri. */
  k: Continente[]
  /** Codice numerico ISO: e' l'identificativo del paese nella cartina. */
  num?: string
  /** Superficie in km²: sulla cartina un paese troppo piccolo non si chiede. */
  a: number
  /** Quanto e' noto, da 0 a 1: decide quali domande sono facili. */
  f: number
  /** I paesi confinanti (codici ISO). */
  conf: string[]
  /** Le acque che lo bagnano di sicuro, dalla costa piu' lunga alla piu' corta. */
  bagna: string[]
  /**
   * Quanto conta ognuna, nello stesso ordine: 100 la costa piu' lunga del suo
   * tipo (oceano o mare), meno le altre. Una risposta giusta la fa solo un'acqua
   * che conta: il Cile tocca l'Atlantico, ma "l'oceano del Cile" e' il Pacifico.
   */
  peso: number[]
  /**
   * Le acque vicine senza certezza: a pochi chilometri, o parte di un mare che
   * lo bagna. Non sono mai una risposta, e non sono mai un errore: una domanda
   * che le tocca non si fa.
   */
  vicine: string[]
}

export type TipoAcqua = 'oceano' | 'mare' | 'golfo' | 'baia' | 'stretto' | 'canale'

export interface AcquaQuiz {
  /** L'identificativo Wikidata, lo stesso di Natural Earth: "Q38882". */
  id: string
  /** Nome italiano, con la maiuscola: "Mar Tirreno", "Oceano Atlantico". */
  n: string
  t: TipoAcqua
  /** L'acqua di cui fa parte, se ce n'e' una nel riassunto: il Tirreno del Mediterraneo. */
  p?: string
  /** Il rettangolo che la contiene: [ovest, sud, est, nord], in gradi. */
  bb: [number, number, number, number]
  f: number
}

/** Un fiume o un lago: il nome e i paesi che attraversa o che bagna. */
export interface CorsoQuiz {
  id: string
  /** Nome italiano come lo scrive Wikidata: "Danubio", "lago di Garda", "Titicaca". */
  n: string
  /** I paesi (codici ISO). */
  p: string[]
  f: number
}

export interface DatiQuiz {
  /** La data in cui lo script l'ha costruito. */
  versione: string
  paesi: PaeseQuiz[]
  acque: AcquaQuiz[]
  fiumi: CorsoQuiz[]
  laghi: CorsoQuiz[]
}

/** Le sezioni come stanno in D1: una riga ciascuna, sotto il limite di una istruzione. */
export const SEZIONI_DATI = ['paesi', 'acque', 'fiumi', 'laghi'] as const
export type SezioneDati = (typeof SEZIONI_DATI)[number]

/** Gli oceani, con i loro identificativi: sono cinque, e hanno una categoria loro. */
export const OCEANI: readonly string[] = ['Q97', 'Q98', 'Q1239', 'Q788', 'Q7354']

/**
 * Le geometrie di Natural Earth, a versioni fisse su jsDelivr: i confini dei
 * paesi (world-atlas, TopoJSON) e i poligoni dei mari. Le usano lo script della
 * notte, per sapere chi bagna cosa, e la cartina muta nel browser, per
 * disegnare: gli stessi file, così i due non possono non essere d'accordo. Una
 * versione fissa non cambia mai, e il browser la tiene in cache per sempre.
 */
export const URL_CONFINI = 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json'
export const URL_ACQUE =
  'https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@v5.1.2/geojson/ne_50m_geography_marine_polys.geojson'

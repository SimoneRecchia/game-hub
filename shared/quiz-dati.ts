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
  /**
   * I paesi confinanti (codici ISO), in senso largo: quelli che dice Wikidata,
   * e quelli con un tratto di confine sulla cartina — la Francia confina con il
   * Brasile, dalla Guyana. Servono a escludere: un fiume non si chiede con un
   * paese vicino a quelli che attraversa.
   */
  conf: string[]
  /**
   * I confinanti sicuri: per Wikidata e sulla cartina, con la parte principale
   * del paese. Sono le risposte di "con chi confina": il Brasile e' un vicino
   * della Francia, ma non e' la risposta che uno si aspetta.
   */
  cm?: string[]
  /** Dove sta la capitale: [longitudine, latitudine], in gradi al centesimo. */
  cc?: [number, number]
  /**
   * 1 se non ha sbocco sul mare: nessuna costa e nessun mare vicino. Il Caspio
   * non conta — e' un lago — e il Kazakistan e' il piu' grande paese senza mare.
   * Un paese senza la sua forma sulla cartina non lo ha: non si sa.
   */
  ch?: 1
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
  /** 1 se ha una linea (o una forma) sulla cartina: solo allora lo si cerca lì. */
  g?: 1
  /** Un lago senza forma, ma con un punto: sulla cartina che insegna e' un pallino. */
  pt?: [number, number]
}

/**
 * Una città, per la categoria delle città. Non sta nel riassunto: il browser la
 * chiede a Wikidata quando serve (src/games/quiz/citta.ts), perché le città
 * sono solo della libera, e sono migliaia.
 */
export interface CittaQuiz {
  /** L'identificativo Wikidata. */
  id: string
  n: string
  /** Il paese (codice ISO). */
  p: string
  /** La regione — la suddivisione di primo livello — con il suo nome, se Wikidata la sa. */
  r?: string
  rn?: string
  /** [longitudine, latitudine]. */
  pt: [number, number]
  f: number
}

export interface DatiQuiz {
  /** L'impronta del contenuto: cambia solo se cambia qualcosa. */
  versione: string
  paesi: PaeseQuiz[]
  acque: AcquaQuiz[]
  fiumi: CorsoQuiz[]
  laghi: CorsoQuiz[]
  /** La versione delle geometrie di fiumi e laghi, da chiedere a parte: `GET /quiz/geometrie`. */
  geo?: string
  /** La versione delle città, anche loro a parte: `GET /quiz/citta`. */
  citta?: string
}

/**
 * Le linee dei fiumi e le forme dei laghi, per identificativo: ognuna e' un
 * elenco di tratti scritti con `codificaLinea`. Sono due o trecento kB, e
 * stanno a parte dal riassunto: le scarica solo chi gioca a fiumi e laghi.
 */
export interface GeometrieQuiz {
  versione: string
  fiumi: Record<string, number[][]>
  laghi: Record<string, number[][]>
}

/** Le sezioni come stanno in D1: una riga ciascuna, sotto il limite di una istruzione. */
export const SEZIONI_DATI = ['paesi', 'acque', 'fiumi', 'laghi'] as const
export type SezioneDati = (typeof SEZIONI_DATI)[number]

/**
 * Le geometrie in D1: righe `geo:fiumi:0`, `geo:fiumi:1`, `geo:laghi:0`…, ognuna
 * un pezzo dell'oggetto sotto il limite di cento kB di una istruzione.
 */
export const PREFISSO_GEOMETRIE = 'geo:'

/**
 * Le città in D1, a pezzi come le geometrie: righe `citta:0`, `citta:1`…, ognuna
 * un oggetto dall'identificativo alla città scritta in breve (`CittaInBreve`), e
 * `citta:regioni` con i nomi delle regioni, che altrimenti si ripeterebbero per
 * ogni città: la Lombardia dodici volte.
 */
export const PREFISSO_CITTA = 'citta:'
export const PARTE_REGIONI = 'citta:regioni'

/** Una città come viaggia: [nome, paese, regione, longitudine, latitudine, notorietà in millesimi]. */
export type CittaInBreve = [string, string, string | null, number, number, number]

export function cittaInBreve(c: CittaQuiz): CittaInBreve {
  return [c.n, c.p, c.r ?? null, c.pt[0], c.pt[1], Math.round(c.f * 1000)]
}

export function cittaDaBreve(id: string, [n, p, r, lon, lat, f]: CittaInBreve, regioni: Record<string, string>): CittaQuiz {
  const rn = r ? regioni[r] : undefined
  return { id, n, p, ...(r && rn ? { r, rn } : {}), pt: [lon, lat], f: f / 1000 }
}

/**
 * Una linea in numeri interi: centesimi di grado, il primo punto intero e gli
 * altri come differenza dal precedente. Un centesimo di grado e' un chilometro:
 * piu' fine di quanto una cartina sul telefono possa mostrare.
 */
export function codificaLinea(punti: ReadonlyArray<readonly [number, number]>): number[] {
  const codici: number[] = []
  let px = 0
  let py = 0
  for (const [lon, lat] of punti) {
    const x = Math.round(lon * 100)
    const y = Math.round(lat * 100)
    // Due punti uguali dopo l'arrotondamento sono un punto solo.
    if (codici.length > 0 && x === px && y === py) continue
    codici.push(x - px, y - py)
    px = x
    py = y
  }
  return codici
}

export function decodificaLinea(codici: readonly number[]): Array<[number, number]> {
  const punti: Array<[number, number]> = []
  let x = 0
  let y = 0
  for (let i = 0; i + 1 < codici.length; i += 2) {
    x += codici[i]
    y += codici[i + 1]
    punti.push([x / 100, y / 100])
  }
  return punti
}

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

/**
 * Il quiz di geografia: le categorie, i modi, i tempi, i punti, la giornata.
 *
 * Una partita e' una serie di domande della stessa categoria: a risposte da
 * scegliere, o sulla cartina muta, dove la risposta si tocca. La classificata
 * e' una al giorno, uguale per tutti, e categoria e modo cambiano ogni giorno;
 * la libera la sceglie chi gioca, con la zona, il numero di domande e le
 * opzioni avanzate.
 *
 * Le domande non le scrive nessuno: le costruisce `shared/quiz-domande.ts` dai
 * dati di Wikidata e di Natural Earth, che lo script della notte riduce a un
 * riassunto (`shared/quiz-dati.ts`). Stesse funzioni per le due modalità: la
 * classificata le fa girare la notte e salva le domande, la libera nel browser.
 */

import { mulberry32 } from './daily'

/**
 * `cartina` e' la categoria di una volta, quando la cartina muta era una
 * categoria e non un modo: resta per le giornate gia' giocate, e non si sceglie
 * piu'.
 */
export type CategoriaQuiz =
  | 'capitali'
  | 'citta'
  | 'bandiere'
  | 'stati'
  | 'mari'
  | 'oceani'
  | 'fiumi'
  | 'laghi'
  | 'cartina'

/** Le categorie che si scelgono, nell'ordine in cui si mostrano. */
export const CATEGORIE: readonly CategoriaQuiz[] = [
  'capitali',
  'citta',
  'bandiere',
  'stati',
  'mari',
  'oceani',
  'fiumi',
  'laghi',
]

/**
 * Le categorie della classificata: tutte tranne le città, troppo difficili per
 * una partita uguale per tutti — le città principali di un paese lontano non le
 * sa nessuno — e che vengono da Wikidata solo nel browser di chi gioca.
 */
export const CATEGORIE_CLASSIFICATA: readonly CategoriaQuiz[] = [
  'capitali',
  'bandiere',
  'stati',
  'mari',
  'oceani',
  'fiumi',
  'laghi',
]

export const NOMI_CATEGORIE: Record<CategoriaQuiz, string> = {
  capitali: 'Capitali',
  citta: 'Città',
  bandiere: 'Bandiere',
  stati: 'Stati',
  mari: 'Mari',
  oceani: 'Oceani',
  fiumi: 'Fiumi',
  laghi: 'Laghi',
  cartina: 'Cartina muta',
}

export function eCategoria(valore: unknown): valore is CategoriaQuiz {
  return typeof valore === 'string' && (CATEGORIE as readonly string[]).includes(valore)
}

/** Come si risponde: scegliendo fra le risposte, o toccando la cartina muta. */
export type ModoQuiz = 'scelta' | 'cartina'

export const MODI: readonly ModoQuiz[] = ['scelta', 'cartina']

export const NOMI_MODI: Record<ModoQuiz, string> = {
  scelta: 'A scelta',
  cartina: 'Cartina muta',
}

export function eModo(valore: unknown): valore is ModoQuiz {
  return valore === 'scelta' || valore === 'cartina'
}

/**
 * Le categorie che si restringono a un continente. Gli oceani no: bagnano
 * tutti i continenti, e "gli oceani d'Europa" non vuol dire niente. I mari si',
 * perché ognuno ha la sua parte di mondo.
 */
export const CON_CONTINENTE: readonly CategoriaQuiz[] = [
  'capitali',
  'citta',
  'bandiere',
  'stati',
  'mari',
  'fiumi',
  'laghi',
]

/** Le categorie che si giocano anche su un paese solo: le città d'Italia, i fiumi della Francia. */
export const CON_PAESE: readonly CategoriaQuiz[] = ['citta', 'fiumi', 'laghi']

/**
 * I continenti, come li si studia a scuola: le Americhe divise in due, con
 * l'America centrale e i Caraibi insieme a quella del nord.
 */
export type Continente = 'eu' | 'as' | 'af' | 'na' | 'sa' | 'oc'

export const CONTINENTI: readonly Continente[] = ['eu', 'as', 'af', 'na', 'sa', 'oc']

export const NOMI_CONTINENTI: Record<Continente, string> = {
  eu: 'Europa',
  as: 'Asia',
  af: 'Africa',
  na: 'America del Nord',
  sa: 'America del Sud',
  oc: 'Oceania',
}

/* ───────────────────────────────  I tempi  ─────────────────────────────── */

/** Le domande della classificata, e quelle della libera se non si sceglie altro. */
export const DOMANDE_PER_PARTITA = 10

/** Quante domande puo' avere una partita libera: fino a cinquanta. */
export const QUANTE_LIBERE = [5, 10, 15, 20, 30, 40, 50] as const
export const QUANTE_MASSIME = 50

/** Fra quante risposte si sceglie, nella libera: quattro, se non si dice altro. */
export const RISPOSTE_LIBERE = [2, 3, 4, 6] as const
export const RISPOSTE_PREDEFINITE = 4

/**
 * Il tempo per rispondere. Quindici secondi bastano a leggere quattro risposte
 * e sceglierne una, e non a cercarla: e' la vera difesa di una classifica di
 * domande che hanno la risposta su qualunque atlante. La cartina ne ha di piu',
 * perché un paese piccolo va trovato, ingrandito e toccato.
 */
export const SECONDI_SCELTA = 15
export const SECONDI_CARTINA = 30

/** I tempi che si scelgono nella libera, per le domande a scelta: sulla cartina sono il doppio. */
export const SECONDI_LIBERI = [10, 15, 20, 30] as const

/**
 * Quel che il server concede in piu' al tempo misurato: la domanda parte quando
 * la risposta del server arriva al telefono, non quando parte dal server, e la
 * risposta impiega un po' a tornare.
 */
export const MARGINE_RETE_MS = 3_000

/* ───────────────────────────────  I punti  ─────────────────────────────── */

/** Quel che vale una partita finita, anche senza risposte giuste. */
export const PUNTI_BASE_QUIZ = 20

/**
 * I punti in classifica di una partita: venti per averla finita, e il resto in
 * proporzione alle risposte giuste. Dieci giuste su dieci fanno cento; tre su
 * dieci, una partita storta, 44: circa la metà, come vuole il principio comune
 * a tutti i giochi (vedi shared/punti.ts). Il tempo non da' punti: e' lo
 * spareggio in classifica.
 */
export function puntiQuiz(giuste: number, domande: number): number {
  if (domande <= 0) return 0
  const quota = Math.min(Math.max(giuste, 0), domande) / domande
  return Math.round(PUNTI_BASE_QUIZ + (100 - PUNTI_BASE_QUIZ) * quota)
}

/* ─────────────────────────  La giornata della classificata  ───────────────── */

const SEME_CATEGORIE = 0x9e0_a11a
const SEME_CARTINA = 0x5ea_c0de

/** Quanti giorni di ogni giro si giocano sulla cartina muta. */
export const GIORNI_CARTINA_PER_GIRO = 2

function mescola<T>(voci: readonly T[], caso: () => number): T[] {
  const copia = [...voci]
  for (let i = copia.length - 1; i > 0; i -= 1) {
    const j = Math.floor(caso() * (i + 1))
    ;[copia[i], copia[j]] = [copia[j], copia[i]]
  }
  return copia
}

/** L'ordine delle categorie di un giro, prima del ritocco al confine. */
function giro(indice: number): CategoriaQuiz[] {
  return mescola(CATEGORIE_CLASSIFICATA, mulberry32((SEME_CATEGORIE ^ Math.imul(indice + 1, 0x85eb_ca6b)) >>> 0))
}

/** I giorni di un giro che vanno sulla cartina: due, mai uno dopo l'altro. */
function giorniSullaCartina(indice: number): Set<number> {
  const n = CATEGORIE_CLASSIFICATA.length
  const caso = mulberry32((SEME_CARTINA ^ Math.imul(indice + 1, 0x27d4_eb2f)) >>> 0)
  for (;;) {
    const scelti = mescola(
      Array.from({ length: n }, (_, i) => i),
      caso,
    ).slice(0, GIORNI_CARTINA_PER_GIRO)
    const [a, b] = scelti
    if (Math.abs(a - b) > 1) return new Set(scelti)
  }
}

export interface GiornataQuiz {
  categoria: CategoriaQuiz
  modo: ModoQuiz
}

/**
 * La categoria e il modo della classificata di un giorno.
 *
 * Ogni giro di sette giorni passa da tutte le categorie, in un ordine diverso
 * ogni volta: nessuna torna prima di averle viste tutte, e non si puo'
 * indovinare quella di domani. Due giorni per giro sono sulla cartina muta, mai
 * di fila. L'unico ritocco e' al confine fra due giri: se il primo giorno di un
 * giro ripeterebbe l'ultimo del precedente, i primi due si scambiano — lo
 * scambio non tocca mai l'ultimo giorno di un giro, quindi basta guardare il
 * giro prima.
 */
export function giornataDelQuiz(numero: number): GiornataQuiz {
  const n = CATEGORIE_CLASSIFICATA.length
  const indice = Math.floor((numero - 1) / n)
  const posto = (((numero - 1) % n) + n) % n
  const ordine = giro(indice)
  if (indice > 0 && ordine[0] === giro(indice - 1)[n - 1]) {
    ;[ordine[0], ordine[1]] = [ordine[1], ordine[0]]
  }
  return { categoria: ordine[posto], modo: giorniSullaCartina(indice).has(posto) ? 'cartina' : 'scelta' }
}

/* ───────────────────────────────  La cartina  ─────────────────────────── */

/**
 * Le inquadrature della cartina muta: un rettangolo in gradi,
 * [ovest, sud, est, nord]. Un paese si cerca nel suo continente, un mare nella
 * piu' piccola che lo contiene; il mondo intero solo per gli oceani, perché su
 * un telefono l'Europa vista da lì e' grande come un pollice.
 *
 * Est puo' andare oltre 180: l'Oceania passa la linea del cambiamento di data,
 * e la cartina sposta di un giro le longitudini a ovest per tenerla intera.
 */
export type VistaCartina =
  | 'mondo'
  | 'europa'
  | 'mediterraneo'
  | 'asia'
  | 'africa'
  | 'nordamerica'
  | 'sudamerica'
  | 'oceania'

export type Riquadro = readonly [number, number, number, number]

export const VISTE: Record<VistaCartina, Riquadro> = {
  mondo: [-180, -58, 180, 84],
  europa: [-25, 34, 50, 72],
  mediterraneo: [-8, 29, 42, 48],
  asia: [25, -11, 150, 56],
  africa: [-20, -36, 55, 38],
  nordamerica: [-170, 6, -40, 76],
  sudamerica: [-92, -56, -32, 14],
  oceania: [110, -48, 190, 2],
}

export const VISTA_DEL_CONTINENTE: Record<Continente, VistaCartina> = {
  eu: 'europa',
  as: 'asia',
  af: 'africa',
  na: 'nordamerica',
  sa: 'sudamerica',
  oc: 'oceania',
}

/** Le viste regionali, dalla piu' stretta: la prima che contiene un mare e' la sua. */
export const VISTE_REGIONALI: readonly VistaCartina[] = [
  'mediterraneo',
  'europa',
  'sudamerica',
  'oceania',
  'africa',
  'nordamerica',
  'asia',
]

/** La vista da cui parte la cartina di una zona: il mondo, un continente, o quello del paese. */
export function vistaDellaZona(zona: 'mondo' | Continente | null): VistaCartina {
  return zona === null || zona === 'mondo' ? 'mondo' : VISTA_DEL_CONTINENTE[zona]
}

/** True se il rettangolo sta dentro la vista, con un filo di tolleranza. */
export function dentroVista(vista: VistaCartina, [o, s, e, n]: Riquadro, margine = 1): boolean {
  const [vo, vs, ve, vn] = VISTE[vista]
  // Un rettangolo a ovest dell'antimeridiano, in una vista che lo attraversa, si
  // sposta di un giro come fa la cartina.
  const giro = ve > 180 && e < 0 ? 360 : 0
  return o + giro >= vo - margine && e + giro <= ve + margine && s >= vs - margine && n <= vn + margine
}

/** L'identificativo di un paese sulla cartina: il suo codice numerico ISO, come in world-atlas. */
export function idPaeseCartina(numerico: string): string {
  return `n${numerico}`
}

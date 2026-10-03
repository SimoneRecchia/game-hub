/**
 * Il quiz: le materie e le loro categorie, i modi, i tempi, i punti, la
 * giornata.
 *
 * Una partita e' una serie di domande della stessa categoria: a risposte da
 * scegliere, o — in geografia — sulla cartina muta, dove la risposta si tocca.
 * La classificata e' una al giorno, uguale per tutti, e la categoria cambia
 * ogni giorno, di qualunque materia; la libera la sceglie chi gioca, con la
 * zona o l'ambito, il numero di domande e le opzioni avanzate.
 *
 * Le domande non le scrive nessuno: le costruiscono `shared/quiz-domande.ts`
 * dai dati di Wikidata e di Natural Earth, che lo script della notte riduce a
 * un riassunto (`shared/quiz-dati.ts`), e `shared/quiz-domande-cultura.ts` dai
 * file delle altre materie (`shared/quiz-cultura.ts`). Stesse funzioni per le
 * due modalità: la classificata le fa girare la notte e salva le domande, la
 * libera nel browser.
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
  | 'arte'
  | 'libri'
  | 'cinema'
  | 'lirica'
  | 'nobel'
  | 'storia'
  | 'oggi'
  | 'scienza'

/**
 * Le materie, cioe' come si mostrano le categorie: la geografia e le altre.
 * Le categorie dentro una materia sono in ordine di come si scelgono.
 */
export type MateriaQuiz = 'geografia' | 'storia' | 'cultura' | 'scienza'

export const MATERIE: ReadonlyArray<{ id: MateriaQuiz; nome: string; categorie: readonly CategoriaQuiz[] }> = [
  {
    id: 'geografia',
    nome: 'Geografia',
    categorie: ['capitali', 'citta', 'bandiere', 'stati', 'mari', 'oceani', 'fiumi', 'laghi'],
  },
  { id: 'storia', nome: 'Storia', categorie: ['storia', 'oggi'] },
  { id: 'cultura', nome: 'Arte e cultura', categorie: ['arte', 'libri', 'cinema', 'lirica'] },
  { id: 'scienza', nome: 'Scienza', categorie: ['scienza', 'nobel'] },
]

/** Le categorie che si scelgono, nell'ordine in cui si mostrano. */
export const CATEGORIE: readonly CategoriaQuiz[] = MATERIE.flatMap((m) => m.categorie)

export function materiaDi(categoria: CategoriaQuiz): MateriaQuiz {
  return MATERIE.find((m) => m.categorie.includes(categoria))?.id ?? 'geografia'
}

/** Le categorie di geografia: le sole con la cartina muta, le zone e i paesi. */
export function diGeografia(categoria: CategoriaQuiz): boolean {
  return categoria === 'cartina' || materiaDi(categoria) === 'geografia'
}

/**
 * Le categorie della classificata: tutte tranne le città, troppo difficili per
 * una partita uguale per tutti — le città principali di un paese lontano non le
 * sa nessuno.
 */
export const CATEGORIE_CLASSIFICATA: readonly CategoriaQuiz[] = CATEGORIE.filter((c) => c !== 'citta')

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
  arte: 'Arte',
  libri: 'Libri',
  cinema: 'Cinema',
  lirica: 'Lirica',
  nobel: 'Premi Nobel',
  storia: 'Storia',
  oggi: 'Accadde oggi',
  scienza: 'Scienza',
}

export function eCategoria(valore: unknown): valore is CategoriaQuiz {
  return typeof valore === 'string' && (CATEGORIE as readonly string[]).includes(valore)
}

/**
 * Gli ambiti delle altre materie: quel che per la geografia sono le zone. Il
 * primo e' "tutti", e vale se non si sceglie altro.
 */
export const AMBITI: Partial<Record<CategoriaQuiz, ReadonlyArray<{ id: string; nome: string }>>> = {
  arte: [
    { id: 'tutti', nome: 'Tutti' },
    { id: 'italiani', nome: 'Pittori italiani' },
    { id: 'antichi', nome: 'Fino al Cinquecento' },
    { id: 'barocchi', nome: 'Seicento e Settecento' },
    { id: 'ottocento', nome: 'Ottocento' },
    { id: 'novecento', nome: 'Novecento' },
  ],
  libri: [
    { id: 'tutti', nome: 'Tutti' },
    { id: 'italiani', nome: 'Letteratura italiana' },
    { id: 'stranieri', nome: 'Letteratura straniera' },
  ],
  cinema: [
    { id: 'tutti', nome: 'Tutti' },
    { id: 'italiani', nome: 'Cinema italiano' },
    { id: 'classici', nome: 'Prima del 1980' },
    { id: 'recenti', nome: 'Dal 1980' },
  ],
  lirica: [
    { id: 'tutti', nome: 'Tutte' },
    { id: 'italiani', nome: 'Opere italiane' },
    { id: 'stranieri', nome: 'Opere straniere' },
  ],
  nobel: [
    { id: 'tutti', nome: 'Tutti' },
    { id: 'letteratura', nome: 'Letteratura' },
    { id: 'fisica', nome: 'Fisica' },
    { id: 'chimica', nome: 'Chimica' },
    { id: 'medicina', nome: 'Medicina' },
    { id: 'pace', nome: 'Pace' },
    { id: 'economia', nome: 'Economia' },
    { id: 'italiani', nome: 'Italiani' },
  ],
  storia: [
    { id: 'tutti', nome: 'Tutta' },
    { id: 'antichita', nome: 'Antichità' },
    { id: 'medioevo', nome: 'Medioevo' },
    { id: 'moderna', nome: 'Età moderna' },
    { id: 'contemporanea', nome: 'Età contemporanea' },
    { id: 'italia', nome: 'Storia d’Italia' },
  ],
  scienza: [
    { id: 'tutti', nome: 'Tutto' },
    { id: 'chimica', nome: 'Chimica' },
    { id: 'fisica', nome: 'Fisica' },
    { id: 'astronomia', nome: 'Astronomia' },
    { id: 'scoperte', nome: 'Scoperte e invenzioni' },
    { id: 'natura', nome: 'Animali e piante' },
  ],
}

/** Come si chiama la scelta dell'ambito, nella libera: la domanda a cui risponde. */
export const TITOLI_AMBITI: Partial<Record<CategoriaQuiz, string>> = {
  arte: 'Quali quadri',
  libri: 'Quali libri',
  cinema: 'Quali film',
  lirica: 'Quali opere',
  nobel: 'Quale premio',
  storia: 'Quale periodo',
  scienza: 'Quale argomento',
}

/** L'ambito, se la categoria lo ha e se c'e': "tutti" altrimenti. */
export function ambitoValido(categoria: CategoriaQuiz, ambito: unknown): string {
  const ambiti = AMBITI[categoria]
  return ambiti?.some((a) => a.id === ambito) ? (ambito as string) : 'tutti'
}

/** Il nome dell'ambito: "Ottocento", "Fisica"; null per "tutti", che non si dice. */
export function nomeAmbito(categoria: CategoriaQuiz, ambito: string | null | undefined): string | null {
  if (!ambito || ambito === 'tutti') return null
  return AMBITI[categoria]?.find((a) => a.id === ambito)?.nome ?? null
}

/** Come si risponde: scegliendo fra le risposte, o toccando la cartina muta. */
export type ModoQuiz = 'scelta' | 'cartina'

export const MODI: readonly ModoQuiz[] = ['scelta', 'cartina']

export const NOMI_MODI: Record<ModoQuiz, string> = {
  scelta: 'Scelta multipla',
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

/** Quante domande puo' avere una partita libera: i punti del cursore, fino a cinquanta. */
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

/**
 * Le domande con risposte lunghe — quattro fatti di un giorno, quattro eventi
 * da mettere in ordine — ne hanno un terzo in piu': si deve leggere, prima di
 * scegliere.
 */
export const SECONDI_LUNGA = 20
export const FATTORE_LUNGA = SECONDI_LUNGA / SECONDI_SCELTA

/** Il tempo di una domanda della classificata, lo stesso per il server e per la pagina. */
export function secondiDellaDomanda(d: { cartina?: unknown; lunga?: 1 }): number {
  return d.cartina ? SECONDI_CARTINA : d.lunga ? SECONDI_LUNGA : SECONDI_SCELTA
}

/**
 * Una scelta e' l'id di un'opzione o di un posto della cartina. Gli id li fanno
 * i generatori dai dati — "chi:Nikola Tesla", "10-04/2", "citta:Monaco di
 * Baviera" — e hanno spazi, accenti e barre: il server controlla solo che sia
 * un testo corto, senza caratteri di controllo. Accettava le sole lettere
 * semplici, e le risposte a quelle domande gli arrivavano come errori.
 */
export const SCELTA_MASSIMA = 80

export function sceltaValida(valore: unknown): valore is string {
  return typeof valore === 'string' && valore.length > 0 && valore.length <= SCELTA_MASSIMA && !/\p{Cc}/u.test(valore)
}

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
export const PUNTI_BASE_QUIZ = 15
/** Tutte giuste: il tetto del quiz (vedi shared/punti.ts). */
export const PUNTI_QUIZ = 75

/**
 * I punti in classifica di una partita: quindici per averla finita, e il resto
 * in proporzione alle risposte giuste. Dieci giuste su dieci fanno settantacinque;
 * tre su dieci, una partita storta, 33: circa la metà, come vuole il principio
 * comune a tutti i giochi (vedi shared/punti.ts). Il tempo non da' punti: e' lo
 * spareggio in classifica.
 */
export function puntiQuiz(giuste: number, domande: number): number {
  if (domande <= 0) return 0
  const quota = Math.min(Math.max(giuste, 0), domande) / domande
  return Math.round(PUNTI_BASE_QUIZ + (PUNTI_QUIZ - PUNTI_BASE_QUIZ) * quota)
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

const GEOGRAFIA_DEL_GIORNO = CATEGORIE_CLASSIFICATA.filter((c) => diGeografia(c))
const ALTRE_DEL_GIORNO = CATEGORIE_CLASSIFICATA.filter((c) => !diGeografia(c))

/**
 * Un giro prima del ritocco al confine: le altre materie in un ordine, e dopo
 * alcune di loro un giorno di geografia. Le altre materie fanno da divisori —
 * la geografia va negli spazi che seguono ciascuna, uno per spazio — così due
 * giorni di geografia non sono mai di fila, nemmeno fra un giro e l'altro,
 * perché ogni giro comincia con un'altra materia.
 */
function giroGrezzo(indice: number): { altre: CategoriaQuiz[]; geografia: CategoriaQuiz[]; spazi: Set<number> } {
  const caso = mulberry32((SEME_CATEGORIE ^ Math.imul(indice + 1, 0x85eb_ca6b)) >>> 0)
  const altre = mescola(ALTRE_DEL_GIORNO, caso)
  const geografia = mescola(GEOGRAFIA_DEL_GIORNO, caso)
  const spazi = new Set(
    mescola(
      Array.from({ length: altre.length }, (_, i) => i),
      caso,
    ).slice(0, geografia.length),
  )
  return { altre, geografia, spazi }
}

function inFila({ altre, geografia, spazi }: ReturnType<typeof giroGrezzo>): CategoriaQuiz[] {
  const fila: CategoriaQuiz[] = []
  let g = 0
  altre.forEach((a, i) => {
    fila.push(a)
    if (spazi.has(i)) fila.push(geografia[g++])
  })
  return fila
}

/** Gli ultimi giorni di un giro, che non tornano nei primi del giro dopo. */
export const CONFINE_DEL_GIRO = 4

/**
 * Le prime voci (`quante`) che non sono da evitare: una da evitare si scambia
 * con una delle voci di mezzo, mai con le ultime due, che fanno la fine del giro.
 */
function inTesta<T>(voci: T[], evitare: ReadonlySet<T>, quante: number): void {
  for (let i = 0; i < quante; i += 1) {
    if (!evitare.has(voci[i])) continue
    const j = voci.findIndex((v, k) => k >= quante && k < voci.length - 2 && !evitare.has(v))
    if (j >= 0) [voci[i], voci[j]] = [voci[j], voci[i]]
  }
}

/**
 * L'ordine delle categorie di un giro, ritoccato al confine con il giro prima:
 * i primi giorni non ripetono gli ultimi del giro prima, altrimenti al cambio
 * di giro si leggeva "Libri, Fiumi, Libri, Fiumi". Nei primi quattro giorni ci
 * sono al piu' tre altre materie e due di geografia, e sono quelle che si
 * guardano. Il ritocco non tocca mai la fine di un giro, che sono le ultime due
 * voci di ognuna delle due file, quindi basta guardare il giro prima senza il
 * suo ritocco.
 */
function giro(indice: number): CategoriaQuiz[] {
  const grezzo = giroGrezzo(indice)
  if (indice > 0) {
    const fine = new Set(inFila(giroGrezzo(indice - 1)).slice(-CONFINE_DEL_GIRO))
    inTesta(grezzo.altre, fine, 3)
    inTesta(grezzo.geografia, fine, 2)
  }
  return inFila(grezzo)
}

/** I giorni di un giro che vanno sulla cartina: due giorni di geografia, che non sono mai di fila. */
function giorniSullaCartina(indice: number, ordine: readonly CategoriaQuiz[]): Set<number> {
  const caso = mulberry32((SEME_CARTINA ^ Math.imul(indice + 1, 0x27d4_eb2f)) >>> 0)
  const geografia = ordine.flatMap((c, i) => (diGeografia(c) ? [i] : []))
  return new Set(mescola(geografia, caso).slice(0, GIORNI_CARTINA_PER_GIRO))
}

export interface GiornataQuiz {
  categoria: CategoriaQuiz
  modo: ModoQuiz
}

/** Quanti giorni fa un giro: una volta ogni categoria della classificata. */
export const GIORNI_PER_GIRO = CATEGORIE_CLASSIFICATA.length

/**
 * La categoria e il modo della classificata di un giorno.
 *
 * Ogni giro passa da tutte le categorie di tutte le materie, in un ordine
 * diverso ogni volta: nessuna torna prima di averle viste tutte, e non si puo'
 * indovinare quella di domani. La geografia ha sette categorie su quindici, e
 * per questo due suoi giorni non sono mai di fila; due giorni per giro sono
 * sulla cartina muta.
 */
export function giornataDelQuiz(numero: number): GiornataQuiz {
  const n = GIORNI_PER_GIRO
  const indice = Math.floor((numero - 1) / n)
  const posto = (((numero - 1) % n) + n) % n
  const ordine = giro(indice)
  return { categoria: ordine[posto], modo: giorniSullaCartina(indice, ordine).has(posto) ? 'cartina' : 'scelta' }
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

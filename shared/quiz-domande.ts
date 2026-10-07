/**
 * Le domande del quiz, costruite dal riassunto dei dati.
 *
 * Una domanda a scelta ha una risposta giusta e qualche sbagliata, e il lavoro
 * vero e' scegliere quelle sbagliate: devono essere plausibili — un paese dello
 * stesso continente, un mare della stessa parte del mondo — e **sicuramente**
 * sbagliate. Le fonti non sono perfette: Wikidata puo' dimenticare un paese che
 * un fiume attraversa, e una costa di pochi chilometri puo' sfuggire alla
 * geometria. Per questo un distrattore non deve solo essere fuori dalla
 * risposta, ma lontano: un fiume non si chiede con un paese confinante con
 * quelli che attraversa, un mare non con un paese a poche decine di
 * chilometri. Nel dubbio la domanda non si fa.
 *
 * Sulla cartina muta la risposta si tocca: un paese, un mare, un fiume, un
 * lago, una capitale, una città. Ogni domanda porta anche il suo `luogo`, cioe'
 * dove guardare a risposta data: la cartina che insegna mostra lì la risposta
 * giusta, con il suo nome.
 *
 * Tutto dipende solo dal generatore di numeri che si passa: la notte, con il
 * seme del giorno, fa le domande della classificata; nel browser quelle delle
 * libere.
 */

import {
  DOMANDE_PER_PARTITA,
  QUANTE_MASSIME,
  RISPOSTE_PREDEFINITE,
  idPaeseCartina,
  sceltaValida,
  vistaDellaZona,
  type CategoriaQuiz,
  type Continente,
  type GiornataQuiz,
  type ModoQuiz,
  type VistaCartina,
} from './quiz'
import type { CategoriaCultura, ImmagineQuiz } from './quiz-cultura'
import { OCEANI, type AcquaQuiz, type CittaQuiz, type CorsoQuiz, type DatiQuiz, type PaeseQuiz } from './quiz-dati'
import {
  GENERE_PAESI,
  acquaConArticolo,
  cittaNellaFrase,
  conArticolo,
  daAcqua,
  diPaese,
  fiumeNellaFrase,
  inPaese,
  inRegione,
  lagoInOpzione,
  lagoNellaFrase,
  maiuscola,
  suLago,
  suddivisione,
} from './quiz-lingua'

export type TipoDomanda =
  | 'capitale-di'
  | 'stato-di-capitale'
  | 'dove-capitale'
  | 'stato-della-citta'
  | 'citta-in-stato'
  | 'regione-della-citta'
  | 'citta-in-regione'
  | 'dove-citta'
  | 'bandiera-di'
  | 'quale-bandiera'
  | 'dove-bandiera'
  | 'confina-con'
  | 'non-confina'
  | 'senza-mare'
  | 'dove-stato'
  | 'stato-bagnato'
  | 'acqua-di-stato'
  | 'dove-acqua'
  | 'oceano-di-stato'
  | 'stato-del-fiume'
  | 'fiume-in-stato'
  | 'dove-fiume'
  | 'stato-del-lago'
  | 'lago-in-stato'
  | 'dove-lago'
  | 'autore-quadro'
  | 'titolo-quadro'
  | 'quadro-di'
  | 'corrente-quadro'
  | 'secolo-quadro'
  | 'autore-libro'
  | 'libro-di'
  | 'secolo-libro'
  | 'regista-film'
  | 'film-di'
  | 'anno-film'
  | 'interprete-canzone'
  | 'canzone-di'
  | 'decennio-canzone'
  | 'paese-interprete'
  | 'compositore-brano'
  | 'brano-di'
  | 'secolo-brano'
  | 'compositore-opera'
  | 'opera-di'
  | 'citta-opera'
  | 'nobel-anno'
  | 'premio-nobel'
  | 'anno-nobel'
  | 'anno-evento'
  | 'secolo-evento'
  | 'prima-evento'
  | 'simbolo-elemento'
  | 'elemento-simbolo'
  | 'formula-composto'
  | 'grandezza-unita'
  | 'unita-grandezza'
  | 'nome-unita'
  | 'satellite-di'
  | 'ordine-pianeta'
  | 'autore-scoperta'
  | 'anno-scoperta'
  | 'nome-scientifico'
  | 'gruppo-animale'
  | 'animale-del-gruppo'
  | 'oggi-anno'
  | 'oggi-fatto'
  | 'oggi-nato'

type CategoriaAttuale = Exclude<CategoriaQuiz, 'cartina'>

/** Le categorie di geografia di adesso: quelle che fa questo file. */
export type CategoriaGeografia = Exclude<CategoriaAttuale, CategoriaCultura>

/**
 * I tipi di domanda di ogni categoria, per modo. Le citta' su un paese solo
 * chiedono le regioni al posto degli stati: sono le stesse due domande. Le
 * altre materie non hanno la cartina.
 */
export const TIPI: Record<CategoriaAttuale, Record<ModoQuiz, readonly TipoDomanda[]>> = {
  capitali: { scelta: ['capitale-di', 'stato-di-capitale'], cartina: ['dove-capitale'] },
  citta: { scelta: ['stato-della-citta', 'citta-in-stato'], cartina: ['dove-citta'] },
  bandiere: { scelta: ['bandiera-di', 'quale-bandiera'], cartina: ['dove-bandiera'] },
  stati: { scelta: ['confina-con', 'non-confina', 'senza-mare'], cartina: ['dove-stato'] },
  mari: { scelta: ['acqua-di-stato', 'stato-bagnato'], cartina: ['dove-acqua'] },
  // Sulla cartina un oceano si cerca: "quale bagna lo stato X?" con lo stato acceso si risolve guardando.
  oceani: { scelta: ['acqua-di-stato', 'stato-bagnato'], cartina: ['dove-acqua'] },
  fiumi: { scelta: ['stato-del-fiume', 'fiume-in-stato'], cartina: ['dove-fiume'] },
  laghi: { scelta: ['stato-del-lago', 'lago-in-stato'], cartina: ['dove-lago'] },
  arte: {
    scelta: ['autore-quadro', 'titolo-quadro', 'quadro-di', 'corrente-quadro', 'secolo-quadro'],
    cartina: [],
  },
  libri: { scelta: ['autore-libro', 'libro-di', 'secolo-libro'], cartina: [] },
  cinema: { scelta: ['regista-film', 'film-di', 'anno-film'], cartina: [] },
  canzoni: { scelta: ['interprete-canzone', 'canzone-di', 'decennio-canzone', 'paese-interprete'], cartina: [] },
  classica: { scelta: ['compositore-brano', 'brano-di', 'secolo-brano'], cartina: [] },
  lirica: { scelta: ['compositore-opera', 'opera-di', 'citta-opera'], cartina: [] },
  // L'anno di un Nobel non lo sa nessuno: si chiede il campo, a chi lo ha vinto.
  nobel: { scelta: ['premio-nobel'], cartina: [] },
  storia: { scelta: ['anno-evento', 'secolo-evento', 'prima-evento'], cartina: [] },
  oggi: { scelta: ['oggi-anno', 'oggi-nato'], cartina: [] },
  scienza: {
    scelta: [
      'simbolo-elemento',
      'elemento-simbolo',
      'formula-composto',
      'grandezza-unita',
      'unita-grandezza',
      'nome-unita',
      'satellite-di',
      'ordine-pianeta',
      'anno-scoperta',
      'autore-scoperta',
      'gruppo-animale',
      'animale-del-gruppo',
    ],
    cartina: [],
  },
}

/** I tipi della scienza di ogni argomento: scegliere la chimica vuol dire elementi, simboli e formule. */
export const TIPI_SCIENZA: Record<string, readonly TipoDomanda[]> = {
  chimica: ['simbolo-elemento', 'elemento-simbolo', 'formula-composto'],
  fisica: ['grandezza-unita', 'unita-grandezza', 'nome-unita'],
  astronomia: ['satellite-di', 'ordine-pianeta'],
  scoperte: ['anno-scoperta', 'autore-scoperta'],
  natura: ['gruppo-animale', 'animale-del-gruppo'],
}

/** I tipi che si possono scegliere per una categoria, in un modo e, per la scienza, in un argomento. */
export function tipiPossibili(categoria: CategoriaQuiz, modo: ModoQuiz, ambito = 'tutti'): readonly TipoDomanda[] {
  if (categoria === 'cartina') return []
  if (categoria === 'scienza' && TIPI_SCIENZA[ambito]) return modo === 'scelta' ? TIPI_SCIENZA[ambito] : []
  return TIPI[categoria][modo]
}

/** Come si chiama un tipo di domanda nelle opzioni avanzate: cosa si chiede, e cosa si risponde. */
export const NOMI_TIPI: Record<TipoDomanda, string> = {
  'capitale-di': 'La capitale di uno stato',
  'stato-di-capitale': 'Lo stato di una capitale',
  'dove-capitale': 'Dov’è una capitale',
  'stato-della-citta': 'In che stato è una città',
  'citta-in-stato': 'Quale città è in uno stato',
  'regione-della-citta': 'In che regione è una città',
  'citta-in-regione': 'Quale città è in una regione',
  'dove-citta': 'Dov’è una città',
  'bandiera-di': 'Di quale stato è una bandiera',
  'quale-bandiera': 'La bandiera di uno stato',
  'dove-bandiera': 'Dov’è lo stato di una bandiera',
  'confina-con': 'Con chi confina uno stato',
  'non-confina': 'Con chi non confina uno stato',
  'senza-mare': 'Gli stati senza sbocco sul mare',
  'dove-stato': 'Dov’è uno stato',
  'stato-bagnato': 'Quale stato si affaccia su un mare',
  'acqua-di-stato': 'Quale mare bagna uno stato',
  'dove-acqua': 'Dov’è un mare',
  'oceano-di-stato': 'Quale oceano bagna uno stato',
  'stato-del-fiume': 'In che stato scorre un fiume',
  'fiume-in-stato': 'Quale fiume scorre in uno stato',
  'dove-fiume': 'Dov’è un fiume',
  'stato-del-lago': 'In che stato è un lago',
  'lago-in-stato': 'Quale lago è in uno stato',
  'dove-lago': 'Dov’è un lago',
  'autore-quadro': 'Chi ha dipinto un quadro',
  'titolo-quadro': 'Il titolo di un quadro',
  'quadro-di': 'Un quadro di un pittore',
  'corrente-quadro': 'La corrente di un quadro',
  'secolo-quadro': 'Il secolo di un quadro',
  'autore-libro': 'Chi ha scritto un libro',
  'libro-di': 'Un libro di un autore',
  'secolo-libro': 'Il secolo di un libro',
  'regista-film': 'Chi ha diretto un film',
  'film-di': 'Un film di un regista',
  'anno-film': 'L’anno di un film',
  'interprete-canzone': 'Chi canta una canzone',
  'canzone-di': 'Una canzone di un artista',
  'decennio-canzone': 'Il decennio di una canzone',
  'paese-interprete': 'Il paese di un artista',
  'compositore-brano': 'Chi ha composto un brano',
  'brano-di': 'Un brano di un compositore',
  'secolo-brano': 'Il secolo di un brano',
  'compositore-opera': 'Chi ha composto un’opera',
  'opera-di': 'Un’opera di un compositore',
  'citta-opera': 'Dove ha debuttato un’opera',
  'nobel-anno': 'Chi ha vinto un Nobel',
  'premio-nobel': 'In quale campo',
  'anno-nobel': 'In che anno',
  'anno-evento': 'L’anno di un fatto',
  'secolo-evento': 'Il secolo di un fatto',
  'prima-evento': 'Quale fatto viene prima',
  'simbolo-elemento': 'Il simbolo di un elemento',
  'elemento-simbolo': 'L’elemento di un simbolo',
  'formula-composto': 'La formula di un composto',
  'grandezza-unita': 'Che cosa misura un’unità',
  'unita-grandezza': 'L’unità di una grandezza',
  'nome-unita': 'Da chi prende il nome un’unità',
  'satellite-di': 'Il pianeta di un satellite',
  'ordine-pianeta': 'L’ordine dei pianeti',
  'autore-scoperta': 'Chi ha fatto una scoperta',
  'anno-scoperta': 'L’anno di una scoperta',
  'nome-scientifico': 'Il nome scientifico di una specie',
  'gruppo-animale': 'Il gruppo di un animale',
  'animale-del-gruppo': 'L’animale di un gruppo',
  'oggi-anno': 'L’anno di un fatto',
  'oggi-fatto': 'Che cosa accadde in un anno',
  'oggi-nato': 'L’anno di nascita',
}

export interface OpzioneQuiz {
  id: string
  testo: string
  /** Il codice della bandiera, quando l'opzione e' una bandiera e non un nome. */
  bandiera?: string
  /** Un quadro, quando si sceglie fra quadri: il titolo resta sotto. */
  immagine?: ImmagineQuiz
}

/**
 * Cosa si tocca sulla cartina muta. I paesi hanno l'identificativo di
 * world-atlas (`n380`), i mari quello di Wikidata (`Q38882`); fiumi, laghi,
 * capitali e città un prefisso (`f:Q1653`, `l:Q6414`, `c:FR`, `u:Q490`),
 * perché un tocco sappia su quale strato e' caduto.
 */
export type StratoCartina = 'paesi' | 'acque' | 'fiumi' | 'laghi' | 'capitali' | 'citta'

/** Una domanda come la vede chi gioca: senza la risposta. */
export interface DomandaQuiz {
  tipo: TipoDomanda
  /** La sezione, nelle partite di piu' sezioni insieme: la domanda la dice sopra il testo. */
  categoria?: CategoriaQuiz
  /** L'argomento della sezione, se e' uno della scienza: "chimica". */
  ambito?: string
  /** Il genere della sezione, se e' uno delle canzoni: "rock". */
  genere?: string
  testo: string
  /** La bandiera da mostrare con la domanda. */
  bandiera?: string
  /** Il quadro da riconoscere: un'immagine di Wikimedia Commons. */
  immagine?: ImmagineQuiz
  /** 1 se le risposte sono lunghe da leggere: un terzo di tempo in piu' (`SECONDI_LUNGA`). */
  lunga?: 1
  /** Le risposte fra cui scegliere, in ordine sparso; vuote per la cartina. */
  opzioni: OpzioneQuiz[]
  /**
   * La cartina muta: da dove parte, cosa si tocca, e cosa mostrare mentre si
   * risponde — il paese di cui si chiede l'oceano.
   */
  cartina?: { vista: VistaCartina; strato: StratoCartina; mostra?: string[] }
}

/**
 * Dove guardare a risposta data: i posti della risposta giusta, e quelli di
 * cui parla la domanda — il paese di una capitale, i paesi di un fiume, il mare
 * di cui si chiede chi bagna. Sono identificativi della cartina.
 */
export interface LuogoQuiz {
  giusti: string[]
  altri?: string[]
}

/**
 * La scheda che insegna, a risposta data, per le materie senza cartina: di
 * chi e' il quadro, di che corrente, dov'e'; chi ha scritto il libro, quando.
 * La compone il generatore dai dati, e resta sul server con la risposta.
 */
export interface SpiegazioneQuiz {
  /** Di cosa parla: di solito la risposta, o il soggetto della domanda. */
  titolo: string
  /** La riga sotto il titolo: "Leonardo da Vinci, 1503". */
  sotto?: string
  /** I dati, una riga ciascuno: ["Corrente", "Rinascimento"]. */
  righe?: Array<[string, string]>
  /** Due frasi da Wikipedia: la corrente, il fatto. */
  testo?: string
  /** La voce di Wikipedia in italiano, per leggere di piu'. */
  voce?: string
  /** Il quadro, quando la scheda ne parla. */
  immagine?: ImmagineQuiz
}

/** Una domanda con la risposta: resta sul server, per la classificata, finché non si risponde. */
export interface DomandaCompleta extends DomandaQuiz {
  /** L'id dell'opzione giusta, o del posto sulla cartina. */
  giusta: string
  /** Sulla cartina, i posti che contano come giusti: il Tirreno per il Mediterraneo. */
  accettate?: string[]
  /** La risposta giusta a parole, per dirla a chi ha sbagliato. */
  risposta: string
  /** Di cosa parla: non torna due volte nella stessa partita. */
  soggetto: string
  luogo?: LuogoQuiz
  /** La scheda da mostrare a risposta data, per le materie senza cartina. */
  spiegazione?: SpiegazioneQuiz
}

/**
 * Una sezione di una partita di piu' sezioni: una categoria, e per la scienza
 * l'argomento — la chimica e la fisica sono due sezioni della stessa categoria
 * —, per le canzoni il genere: il rock e il pop sono due sezioni anche loro.
 */
export interface SezioneQuiz {
  categoria: CategoriaQuiz
  ambito?: string
  genere?: string
}

/** Tutto il mondo, un continente, o un paese solo (per città, fiumi e laghi). */
export type AreaQuiz = 'mondo' | Continente | `paese:${string}`

/** Quanto sono noti i soggetti: i piu' noti, un po' di tutto dal facile al difficile, o i meno noti. */
export type Notorieta = 'noti' | 'misti' | 'rari'

export interface RichiestaQuiz {
  categoria: CategoriaQuiz
  /**
   * Le sezioni di una partita di piu' sezioni insieme, nella libera: le
   * domande si dividono fra loro. `categoria` e' quella della prima.
   */
  sezioni?: readonly SezioneQuiz[]
  /** A scelta, se non si dice altro. */
  modo?: ModoQuiz
  area: AreaQuiz
  quante: number
  /** Fra quante risposte si sceglie: da due a sei. */
  risposte?: number
  /** I tipi di domanda da fare, fra quelli della categoria; tutti se non si dice. */
  tipi?: readonly TipoDomanda[]
  notorieta?: Notorieta
  /** Dalla piu' facile alla piu' difficile, o a caso. */
  ordine?: 'sale' | 'caso'
  /** La bandiera accanto a "qual e' la capitale di…": si', se non si dice altro. */
  bandieraCapitali?: boolean
  /** Le città, per la categoria delle città: il browser le chiede a Wikidata. */
  citta?: readonly CittaQuiz[]
  /** Per le altre materie, quel che per la geografia e' la zona: un periodo, un premio, un argomento. */
  ambito?: string
  /** Il genere, per le canzoni: "rock". */
  genere?: string
  /**
   * Per la musica, il paese di chi canta o compone: "Stati Uniti". Vale per
   * tutte le sezioni, come il periodo (`ambito`).
   */
  nazione?: string
  /**
   * Il giorno della partita, "AAAA-MM-GG": gli anni sbagliati non lo passano.
   * La classificata lo passa sempre, perché le domande dipendano solo dal giorno.
   */
  data?: string
}

/* ─────────────────────────────  L'indice dei dati  ──────────────────────── */

/** I dati con le tabelle che servono a fare domande in fretta. */
export interface IndiceQuiz {
  dati: DatiQuiz
  paesi: Map<string, PaeseQuiz>
  acque: Map<string, AcquaQuiz>
  /** Le acque che fanno parte di ognuna, direttamente. */
  figlie: Map<string, AcquaQuiz[]>
}

export function indicizza(dati: DatiQuiz): IndiceQuiz {
  const figlie = new Map<string, AcquaQuiz[]>()
  for (const a of dati.acque) {
    if (!a.p) continue
    const elenco = figlie.get(a.p) ?? []
    elenco.push(a)
    figlie.set(a.p, elenco)
  }
  return {
    dati,
    paesi: new Map(dati.paesi.map((p) => [p.id, p])),
    acque: new Map(dati.acque.map((a) => [a.id, a])),
    figlie,
  }
}

/* ────────────────────────────────  Le città  ───────────────────────────── */

/** Quante città per il mondo intero, e per un continente: le piu' note. Le altre non le sa nessuno. */
export const CITTA_NOTE_NEL_MONDO = 600
export const CITTA_NOTE_NEL_CONTINENTE = 300

/**
 * Le città di una partita: di un paese, tutte quelle che ci sono; del mondo o
 * di un continente, le piu' note, perché "dov'e' Ludhiana?" non e' una
 * domanda. La libera le prende cosi' nel browser, e la notte per la
 * classificata: le stesse, perché a risposta data la cartina ha il pallino
 * della città giusta.
 */
export function cittaDellArea(ix: IndiceQuiz, elenco: readonly CittaQuiz[], area: AreaQuiz): CittaQuiz[] {
  if (area.startsWith('paese:')) return elenco.filter((c) => c.p === area.slice(6))
  const nellArea = area === 'mondo' ? elenco : elenco.filter((c) => ix.paesi.get(c.p)?.k.includes(area as Continente))
  return [...nellArea]
    .sort((a, b) => b.f - a.f)
    .slice(0, area === 'mondo' ? CITTA_NOTE_NEL_MONDO : CITTA_NOTE_NEL_CONTINENTE)
}

/* ────────────────────────────  I posti della cartina  ───────────────────── */

export const posto = {
  paese: (p: PaeseQuiz | undefined): string | null => (p?.num ? idPaeseCartina(p.num) : null),
  capitale: (iso: string) => `c:${iso}`,
  fiume: (id: string) => `f:${id}`,
  lago: (id: string) => `l:${id}`,
  citta: (id: string) => `u:${id}`,
}

function luogo(giusti: Array<string | null>, altri: Array<string | null> = []): LuogoQuiz | undefined {
  const g = giusti.filter((x): x is string => !!x)
  const a = altri.filter((x): x is string => !!x && !g.includes(x))
  if (g.length === 0 && a.length === 0) return undefined
  return a.length > 0 ? { giusti: g, altri: a } : { giusti: g }
}

/* ───────────────────────────────  Il caso  ─────────────────────────────── */

export type Caso = () => number

export function mescola<T>(voci: readonly T[], caso: Caso): T[] {
  const copia = [...voci]
  for (let i = copia.length - 1; i > 0; i -= 1) {
    const j = Math.floor(caso() * (i + 1))
    ;[copia[i], copia[j]] = [copia[j], copia[i]]
  }
  return copia
}

export function unoDi<T>(voci: readonly T[], caso: Caso): T {
  return voci[Math.floor(caso() * voci.length)]
}

/**
 * I distrattori da un elenco di candidati, preferendo i piu' simili alla
 * risposta: stesso continente prima, poi notorietà vicina. Un po' di caso fra i
 * migliori, perché le stesse domande non abbiano sempre gli stessi compagni; e
 * chi ha gia' fatto da errore in questa partita passa in fondo, perché il Mar
 * Caspio non compaia in tre domande su dieci.
 */
export function distrattori<T extends { id: string }>(
  c: Pick<Contesto, 'caso' | 'usati'>,
  candidati: readonly T[],
  quanti: number,
  vicinanza: (t: T) => number,
): T[] {
  const ordinati = candidati
    .map((t) => ({ t, v: vicinanza(t) + c.caso() * 0.35 + (c.usati.get(t.id) ?? 0) * 0.6 }))
    .sort((a, b) => a.v - b.v)
    .map((x) => x.t)
  const scelti = mescola(ordinati.slice(0, Math.max(quanti * 3, 8)), c.caso).slice(0, quanti)
  for (const t of scelti) c.usati.set(t.id, (c.usati.get(t.id) ?? 0) + 1)
  return scelti
}

/**
 * I tre gruppi di notorietà di una fila di `n` voci, dalla piu' nota: fin dove
 * arrivano i famosi e fin dove i noti; gli altri sono il resto. A posti, non a
 * percentuali: con le percentuali i "facili" dei quadri, che sono settecento,
 * erano duecento, e il livello facile pescava il Martirio di san Matteo accanto
 * alla Gioconda. I famosi sono una sessantina al piu' — la Gioconda e la Notte
 * stellata, Bohemian Rhapsody, la capitale della Francia — e mai meno di
 * venti, se ci sono; i noti arrivano a duecentocinquanta.
 */
export function gruppiDiNotorieta(n: number): [famosi: number, noti: number] {
  const famosi = Math.min(n, Math.max(20, Math.min(60, Math.round(n * 0.2))))
  const noti = Math.min(n, Math.max(famosi + 20, Math.min(250, Math.round(n * 0.5))))
  return [famosi, noti]
}

/**
 * Da quale gruppo vengono le domande, per difficoltà: il facile tutto dai
 * famosi; il normale per meta' dai famosi e quasi tutto il resto dai noti; il
 * difficile dagli altri, con qualcuno dei noti. Prima il normale ne prendeva
 * quattro su dieci dal terzo piu' noto e due dall'ultimo, e il facile sei su
 * dieci da meta' fila: i tre livelli si somigliavano, e il normale — che e'
 * anche la classificata — era difficile per tutti.
 */
const PARTI: Record<Notorieta, readonly [number, number, number]> = {
  noti: [1, 0, 0],
  misti: [0.5, 0.4, 0.1],
  rari: [0, 0.3, 0.7],
}

/**
 * Da quale gruppo si completa uno che non basta, per difficoltà: verso i
 * famosi nel facile, verso gli altri nel difficile.
 */
const RIPIEGO: Record<Notorieta, readonly number[]> = { noti: [0, 1, 2], misti: [1, 0, 2], rari: [2, 1, 0] }

/** `quanti` in parti intere, con i resti piu' grandi: le stesse parti danno sempre gli stessi numeri. */
function inParti(quanti: number, parti: readonly number[]): number[] {
  const grezze = parti.map((p) => p * quanti)
  const intere = grezze.map((g) => Math.floor(g + 1e-9))
  let resto = quanti - intere.reduce((a, b) => a + b, 0)
  const ordine = grezze.map((g, i) => ({ r: g - intere[i], i })).sort((a, b) => b.r - a.r || a.i - b.i)
  for (const { i } of ordine) {
    if (resto <= 0) break
    intere[i] += 1
    resto -= 1
  }
  return intere
}

/**
 * I soggetti di una partita, dal piu' facile al piu' difficile: dai tre gruppi
 * di notorietà (`gruppiDiNotorieta`) nelle parti della difficoltà (`PARTI`).
 *
 * Chi ne chiede piu' di quante sono le domande — per averne di riserva, se un
 * soggetto non fa la sua domanda — li riceve in due pezzi: prima quelli della
 * partita, con le parti giuste e in ordine di notorietà, poi le riserve. Tutti
 * in ordine, le riserve dei famosi sarebbero venute prima dei noti, e una
 * partita normale sarebbe stata tutta di famosi.
 */
export function soggetti<T extends { f: number }>(
  tutti: readonly T[],
  quanti: number,
  caso: Caso,
  notorieta: Notorieta = 'misti',
  perPartita: number = quanti,
): T[] {
  const ordinati = [...tutti].sort((a, b) => b.f - a.f)
  const n = ordinati.length
  if (n <= quanti) return mescola(ordinati, caso).sort((a, b) => b.f - a.f)
  const [famosi, noti] = gruppiDiNotorieta(n)
  const gruppi = [ordinati.slice(0, famosi), ordinati.slice(famosi, noti), ordinati.slice(noti)].map((g) =>
    mescola(g, caso),
  )
  const prendi = (quanto: number): T[] => {
    const presi: T[] = []
    let mancano = 0
    inParti(quanto, PARTI[notorieta]).forEach((q, i) => {
      const via = gruppi[i].splice(0, q)
      presi.push(...via)
      mancano += q - via.length
    })
    // Un gruppo troppo corto — i famosi di un continente piccolo — si completa con quello piu' vicino.
    for (const i of RIPIEGO[notorieta]) {
      if (mancano <= 0) break
      const via = gruppi[i].splice(0, mancano)
      presi.push(...via)
      mancano -= via.length
    }
    return presi.sort((a, b) => b.f - a.f)
  }
  const partita = prendi(Math.min(perPartita, quanti))
  return [...partita, ...prendi(quanti - partita.length)]
}

/* ───────────────────────────────  Le regole  ───────────────────────────── */

export const senzaAccenti = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/**
 * Le capitali che non fanno una domanda: quelle che ripetono il nome del paese
 * (Gibuti, Città del Messico, Tunisi), e quelle contese o doppie per cui una
 * risposta sola sarebbe discutibile.
 */
const CAPITALI_ESCLUSE = new Set(['IL', 'PS', 'LK', 'XK', 'TW'])

function capitaleDaDomanda(p: PaeseQuiz): boolean {
  if (!p.cap || CAPITALI_ESCLUSE.has(p.id)) return false
  const paese = senzaAccenti(p.n)
  const capitale = senzaAccenti(p.cap)
  const radice = paese.slice(0, Math.max(4, paese.length - 2))
  return !capitale.includes(radice) && !paese.includes(capitale)
}

/**
 * Se il nome di una città ripete quello del suo paese o della sua regione, e
 * quindi lo dice: "Singapore", "Città del Messico", "Tunisi", "San Salvador",
 * "Aosta", "Reggio Emilia". Come per le capitali, e in piu' basta una parola
 * che comincia allo stesso modo. Le capitali tengono la regola loro: "qual e'
 * la capitale del Brasile?" ha la trappola di Rio, e Brasilia resta.
 */
export function cittaRipete(citta: string, di: string): boolean {
  const nome = senzaAccenti(citta)
  const paese = senzaAccenti(di)
  const radice = paese.slice(0, Math.max(4, paese.length - 2))
  if (nome.includes(radice) || paese.includes(nome)) return true
  const inizi = (s: string) => s.split(/[^a-z]+/).filter((w) => w.length >= 5).map((w) => w.slice(0, 5))
  const delPaese = new Set(inizi(paese))
  return inizi(nome).some((w) => delPaese.has(w))
}

/**
 * Le capitali che non si cercano sulla cartina: quelle contese, e quelle che si
 * chiamano come il paese — "dov'e' Lussemburgo?" chiede il paese, non la
 * capitale. Via anche il Vaticano, che sta dentro Roma: i due pallini sarebbero
 * uno sopra l'altro.
 */
function capitaleDaCercare(p: PaeseQuiz): boolean {
  return !!p.cap && !!p.cc && !CAPITALI_ESCLUSE.has(p.id) && p.id !== 'VA' && senzaAccenti(p.cap) !== senzaAccenti(p.n)
}

/** Se `b` sta nel continente di `a` — quello principale: il Kazakistan e' Asia, anche se tocca l'Europa. */
function stessoContinente(a: PaeseQuiz, b: PaeseQuiz): boolean {
  return b.k.includes(a.k[0])
}

/**
 * I piu' noti di un elenco. Wikidata ha seicento fiumi con una voce in quaranta
 * lingue, e dal duecentesimo in giu' non li conosce nessuno: le domande si
 * fanno sui primi, e i distrattori vengono da un gruppo poco piu' largo, perché
 * una risposta sbagliata deve essere un nome che si e' sentito.
 */
function celebri<T extends { f: number }>(voci: readonly T[], quanti: number): T[] {
  return [...voci].sort((a, b) => b.f - a.f).slice(0, quanti)
}

/**
 * Se il nome di un'acqua contiene quello del paese: "Quale mare bagna le
 * Filippine? Il Mare delle Filippine" non e' una domanda. Si confrontano le
 * radici delle parole lunghe, così "Golfo di Guinea" esclude anche la
 * Guinea-Bissau e "Mar Arabico" l'Arabia Saudita.
 */
function nomeRivelato(paese: string, acqua: string): boolean {
  const a = senzaAccenti(acqua)
  return senzaAccenti(paese)
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 4)
    .some((w) => a.includes(w.slice(0, -1)))
}

/** Quanto due paesi sono "vicini" per fare da distrattori l'uno all'altro: piu' basso, meglio. */
function vicinanzaPaesi(risposta: PaeseQuiz): (p: PaeseQuiz) => number {
  return (p) => (stessoContinente(risposta, p) ? 0 : 1) + Math.abs(risposta.f - p.f)
}

function nelContinente(p: PaeseQuiz, area: AreaQuiz): boolean {
  return area === 'mondo' || area.startsWith('paese:') || p.k.includes(area as Continente)
}

function paeseDellArea(area: AreaQuiz): string | null {
  return area.startsWith('paese:') ? area.slice(6) : null
}

/**
 * Sulla cartina un paese piu' piccolo di così non si chiede: il Lussemburgo si
 * trova ingrandendo, Andorra e Malta sono un punto anche da vicino.
 */
export const SUPERFICIE_MINIMA_CARTINA = 2_500

/* ─────────────────────────────  Le categorie  ──────────────────────────── */

/** Quel che serve a ogni generatore: i dati, la richiesta, il caso. */
interface Contesto {
  ix: IndiceQuiz
  /** Quante volte ogni posto ha gia' fatto da risposta sbagliata in questa partita. */
  usati: Map<string, number>
  area: AreaQuiz
  quante: number
  caso: Caso
  evitare: ReadonlySet<string>
  /** Quante risposte sbagliate per domanda. */
  sbagliate: number
  tipi: ReadonlySet<TipoDomanda> | null
  notorieta: Notorieta
  bandiera: boolean
  /** Da dove parte la cartina: la zona della partita, uguale per tutte le domande. */
  vista: VistaCartina
  citta: readonly CittaQuiz[]
}

type Generatore = (c: Contesto) => DomandaCompleta[]

/** I candidati senza quelli da evitare, se ne restano abbastanza. */
export function preferendo<T>(
  candidati: T[],
  chiave: (t: T) => string,
  evitare: ReadonlySet<string>,
  quanti: number,
): T[] {
  const nuovi = candidati.filter((t) => !evitare.has(chiave(t)))
  return nuovi.length >= quanti * 2 ? nuovi : candidati
}

/**
 * Il tipo di ogni domanda, fra quelli della categoria con la loro quota: se se
 * ne sono scelti solo alcuni, le quote si dividono fra quelli.
 */
/**
 * Quante domande di ogni tipo, su `quante`, con le quote date: a ognuno la sua
 * parte intera, e i posti che avanzano ai resti, estratti in proporzione.
 *
 * Arrotondare ogni quota e dare all'ultimo tipo quel che resta, come si faceva,
 * gli lasciava sempre zero: con 40, 20, 15, 15 e 10 su dieci domande gli
 * arrotondamenti fanno 4, 2, 2, 2, e il secolo dei quadri non usciva mai. Cosi'
 * un tipo al dieci per cento ha la sua domanda su dieci, e su cinque ha le sue
 * probabilita'.
 */
export function ripartisci(
  quante: number,
  quote: ReadonlyArray<readonly [TipoDomanda, number]>,
  caso: Caso,
): Map<TipoDomanda, number> {
  const totale = quote.reduce((n, [, q]) => n + q, 0)
  const parti = quote.map(([t, q]) => ({ t, parte: totale > 0 ? (quante * q) / totale : 0 }))
  const fuori = new Map(parti.map(({ t, parte }) => [t, Math.floor(parte + 1e-9)]))
  let dati = [...fuori.values()].reduce((a, b) => a + b, 0)
  const resti = parti.map(({ t, parte }) => ({ t, r: parte - fuori.get(t)! })).filter((x) => x.r > 1e-9)
  while (dati < quante && resti.length > 0) {
    let x = caso() * resti.reduce((a, y) => a + y.r, 0)
    let i = 0
    while (i < resti.length - 1 && x >= resti[i].r) {
      x -= resti[i].r
      i += 1
    }
    fuori.set(resti[i].t, fuori.get(resti[i].t)! + 1)
    resti.splice(i, 1)
    dati += 1
  }
  return fuori
}

export function assegna<T>(
  scelti: T[],
  quote: ReadonlyArray<readonly [TipoDomanda, number]>,
  c: Pick<Contesto, 'tipi' | 'caso'>,
): Array<{ s: T; tipo: TipoDomanda }> {
  const ammesse = quote.filter(([t]) => !c.tipi || c.tipi.has(t))
  const valide = ammesse.length > 0 ? ammesse : quote
  const tipi: TipoDomanda[] = []
  for (const [t, quanti] of ripartisci(scelti.length, valide, c.caso)) for (let k = 0; k < quanti; k += 1) tipi.push(t)
  const ordine = mescola(tipi, c.caso)
  return scelti.map((s, i) => ({ s, tipo: ordine[i] ?? valide[0][0] }))
}

/* ── Capitali ── */

const capitaliScelta: Generatore = (c) => {
  const tutti = c.ix.dati.paesi.filter((p) => p.cap)
  const candidati = preferendo(
    c.ix.dati.paesi.filter((p) => capitaleDaDomanda(p) && nelContinente(p, c.area)),
    (p) => p.id,
    c.evitare,
    c.quante,
  )
  const quote = [['capitale-di', 0.6], ['stato-di-capitale', 0.4]] as const
  return assegna(soggetti(candidati, c.quante, c.caso, c.notorieta), quote, c).map(({ s: p, tipo }) => {
    const altri = tutti.filter((q) => q.id !== p.id && senzaAccenti(q.cap) !== senzaAccenti(p.cap))
    if (tipo === 'capitale-di') {
      // Qual e' la capitale? Capitali di altri paesi, e a volte la città
      // piu' grande del paese: il trabocchetto di Sydney.
      const sbagliate = distrattori(c, altri, c.sbagliate, vicinanzaPaesi(p)).map((q) => ({
        id: `cap:${q.id}`,
        testo: q.cap,
      }))
      if (p.trap && c.caso() < 0.6 && !sbagliate.some((o) => senzaAccenti(o.testo) === senzaAccenti(p.trap!))) {
        sbagliate[0] = { id: `trap:${p.id}`, testo: p.trap }
      }
      const giusta = { id: `cap:${p.id}`, testo: p.cap }
      return {
        tipo,
        testo: `Qual è la capitale ${diPaese(p.id, p.n)}?`,
        // La bandiera del paese di cui si chiede la capitale: non aiuta, il nome c'e' gia'.
        ...(c.bandiera ? { bandiera: p.id.toLowerCase() } : {}),
        opzioni: mescola([giusta, ...sbagliate], c.caso),
        giusta: giusta.id,
        risposta: p.cap,
        soggetto: p.id,
        // Senza il punto della capitale, sulla cartina si mostra il paese.
        luogo: p.cc ? luogo([posto.capitale(p.id)], [posto.paese(p)]) : luogo([posto.paese(p)]),
      }
    }
    // Lo stato di una capitale: qui la bandiera direbbe la risposta, e si vede solo dopo.
    const sbagliati = distrattori(c, altri, c.sbagliate, vicinanzaPaesi(p))
    return {
      tipo: 'stato-di-capitale',
      testo: `Di quale stato è capitale ${cittaNellaFrase(p.cap)}?`,
      opzioni: mescola([p, ...sbagliati], c.caso).map((q) => ({ id: q.id, testo: q.n })),
      giusta: p.id,
      risposta: p.n,
      soggetto: p.id,
      luogo: luogo([posto.paese(p)], [p.cc ? posto.capitale(p.id) : null]),
    }
  })
}

const capitaliCartina: Generatore = (c) => {
  const candidati = preferendo(
    c.ix.dati.paesi.filter((p) => capitaleDaCercare(p) && nelContinente(p, c.area)),
    (p) => p.id,
    c.evitare,
    c.quante,
  )
  return soggetti(candidati, c.quante, c.caso, c.notorieta).map((p) => ({
    tipo: 'dove-capitale',
    testo: `Dov’è ${cittaNellaFrase(p.cap)}?`,
    opzioni: [],
    cartina: { vista: c.vista, strato: 'capitali' },
    giusta: posto.capitale(p.id),
    accettate: [posto.capitale(p.id)],
    risposta: `${p.cap}, ${p.n}`,
    soggetto: p.id,
    luogo: luogo([posto.capitale(p.id)], [posto.paese(p)]),
  }))
}

/* ── Città ── */

/**
 * Le città con un nome solo, fra quelle che si hanno: "Dov'è Valencia?" non ha
 * una risposta, ce ne sono due. Il confronto e' senza accenti.
 */
function cittaUniche(citta: readonly CittaQuiz[]): CittaQuiz[] {
  const conti = new Map<string, number>()
  for (const x of citta) conti.set(senzaAccenti(x.n), (conti.get(senzaAccenti(x.n)) ?? 0) + 1)
  return citta.filter((x) => conti.get(senzaAccenti(x.n)) === 1)
}

function cittaNellArea(c: Contesto): CittaQuiz[] {
  const unPaese = paeseDellArea(c.area)
  return cittaUniche(c.citta).filter((x) => {
    const p = c.ix.paesi.get(x.p)
    if (!p) return false
    return unPaese ? x.p === unPaese : nelContinente(p, c.area)
  })
}

const cittaScelta: Generatore = (c) => {
  const unPaese = paeseDellArea(c.area)
  const tutte = cittaNellArea(c)
  const domande: DomandaCompleta[] = []
  if (unPaese) {
    // Su un paese solo si chiedono le regioni: in quale si trova, e quale città ci sta.
    const p = c.ix.paesi.get(unPaese)
    const conRegione = tutte.filter((x) => x.r && x.rn)
    const regioni = [...new Map(conRegione.map((x) => [x.r!, x.rn!])).entries()]
    if (!p || regioni.length < 2) return []
    const termine = suddivisione(p.id)
    // Aosta nella Valle d'Aosta: il nome dice la regione.
    const candidati = preferendo(
      conRegione.filter((x) => !cittaRipete(x.n, x.rn!)),
      (x) => x.id,
      c.evitare,
      c.quante,
    )
    const regioniUsate = new Set<string>()
    // Le quote con i nomi dei tipi della categoria: su un paese "lo stato" diventa "la regione".
    const quote = [['stato-della-citta', 0.55], ['citta-in-stato', 0.45]] as const
    const scelti = soggetti(candidati, Math.ceil(c.quante * 1.5), c.caso, c.notorieta, c.quante)
    for (const { s: x, tipo } of assegna(scelti, quote, c)) {
      if (domande.length >= c.quante) break
      if (tipo === 'stato-della-citta') {
        const sbagliate = mescola(
          regioni.filter(([id]) => id !== x.r),
          c.caso,
        ).slice(0, c.sbagliate)
        if (sbagliate.length < c.sbagliate) continue
        domande.push({
          tipo: 'regione-della-citta',
          testo: `In quale ${termine} si trova ${cittaNellaFrase(x.n)}?`,
          opzioni: mescola([[x.r!, x.rn!] as const, ...sbagliate], c.caso).map(([id, n]) => ({
            id: `r:${id}`,
            testo: n,
          })),
          giusta: `r:${x.r}`,
          risposta: x.rn!,
          soggetto: x.id,
          luogo: luogo([posto.citta(x.id)], [posto.paese(p)]),
        })
      } else {
        // Una regione per partita: due domande sulla Puglia di fila sono una domanda sola.
        if (regioniUsate.has(x.r!)) continue
        const sbagliate = distrattori(
          c,
          conRegione.filter((y) => y.r !== x.r),
          c.sbagliate,
          (y) => Math.abs(y.f - x.f),
        )
        if (sbagliate.length < c.sbagliate) continue
        regioniUsate.add(x.r!)
        domande.push({
          tipo: 'citta-in-regione',
          testo: `Quale di queste città si trova ${inRegione(x.rn!)}?`,
          opzioni: mescola([x, ...sbagliate], c.caso).map((y) => ({ id: posto.citta(y.id), testo: y.n })),
          giusta: posto.citta(x.id),
          risposta: x.n,
          soggetto: x.id,
          luogo: luogo([posto.citta(x.id)], [posto.paese(p)]),
        })
      }
    }
    return domande
  }

  // Singapore a Singapore, Città del Messico in Messico: il nome dice lo stato.
  const candidati = preferendo(
    tutte.filter((x) => !cittaRipete(x.n, c.ix.paesi.get(x.p)!.n)),
    (x) => x.id,
    c.evitare,
    c.quante,
  )
  const paesiUsati = new Set<string>()
  const quote = [['stato-della-citta', 0.55], ['citta-in-stato', 0.45]] as const
  const scelti = soggetti(candidati, Math.ceil(c.quante * 1.5), c.caso, c.notorieta, c.quante)
  for (const { s: x, tipo } of assegna(scelti, quote, c)) {
    if (domande.length >= c.quante) break
    const p = c.ix.paesi.get(x.p)!
    // Un paese per partita, come nei fiumi: tre città della Cina sono una domanda sola.
    if (paesiUsati.has(p.id)) continue
    if (tipo === 'stato-della-citta') {
      const sbagliati = distrattori(
        c,
        c.ix.dati.paesi.filter((q) => q.id !== p.id),
        c.sbagliate,
        vicinanzaPaesi(p),
      )
      if (sbagliati.length < c.sbagliate) continue
      paesiUsati.add(p.id)
      domande.push({
        tipo: 'stato-della-citta',
        testo: `In quale stato si trova ${cittaNellaFrase(x.n)}?`,
        opzioni: mescola([p, ...sbagliati], c.caso).map((q) => ({ id: q.id, testo: q.n })),
        giusta: p.id,
        risposta: p.n,
        soggetto: x.id,
        luogo: luogo([posto.paese(p)], [posto.citta(x.id)]),
      })
    } else {
      // Le città sbagliate: dei paesi vicini prima, perché siano plausibili.
      const vicini = new Set(p.conf)
      const sbagliate = distrattori(
        c,
        tutte.filter((y) => y.p !== p.id),
        c.sbagliate,
        (y) => (vicini.has(y.p) ? 0 : stessoContinente(p, c.ix.paesi.get(y.p)!) ? 0.5 : 1.2) + Math.abs(y.f - x.f),
      )
      if (sbagliate.length < c.sbagliate) continue
      paesiUsati.add(p.id)
      domande.push({
        tipo: 'citta-in-stato',
        testo: `Quale di queste città si trova ${inPaese(p.id, p.n)}?`,
        opzioni: mescola([x, ...sbagliate], c.caso).map((y) => ({ id: posto.citta(y.id), testo: y.n })),
        giusta: posto.citta(x.id),
        risposta: x.n,
        soggetto: x.id,
        luogo: luogo([posto.citta(x.id)], [posto.paese(p)]),
      })
    }
  }
  return domande
}

const cittaCartina: Generatore = (c) => {
  const candidati = preferendo(cittaNellArea(c), (x) => x.id, c.evitare, c.quante)
  return soggetti(candidati, c.quante, c.caso, c.notorieta).map((x) => {
    const p = c.ix.paesi.get(x.p)!
    return {
      tipo: 'dove-citta',
      testo: `Dov’è ${cittaNellaFrase(x.n)}?`,
      opzioni: [],
      cartina: { vista: c.vista, strato: 'citta' },
      giusta: posto.citta(x.id),
      accettate: [posto.citta(x.id)],
      risposta: `${x.n}, ${p.n}`,
      soggetto: x.id,
      luogo: luogo([posto.citta(x.id)], [posto.paese(p)]),
    }
  })
}

/* ── Bandiere ── */

const bandiereScelta: Generatore = (c) => {
  const tutti = c.ix.dati.paesi
  const candidati = preferendo(
    tutti.filter((p) => nelContinente(p, c.area)),
    (p) => p.id,
    c.evitare,
    c.quante,
  )
  const quote = [['bandiera-di', 0.6], ['quale-bandiera', 0.4]] as const
  return assegna(soggetti(candidati, c.quante, c.caso, c.notorieta), quote, c).map(({ s: p, tipo }) => {
    const sbagliati = distrattori(
      c,
      tutti.filter((q) => q.id !== p.id),
      c.sbagliate,
      vicinanzaPaesi(p),
    )
    const opzioni = mescola([p, ...sbagliati], c.caso)
    if (tipo === 'bandiera-di') {
      return {
        tipo,
        testo: 'Di quale stato è questa bandiera?',
        bandiera: p.id.toLowerCase(),
        opzioni: opzioni.map((q) => ({ id: q.id, testo: q.n })),
        giusta: p.id,
        risposta: p.n,
        soggetto: p.id,
        luogo: luogo([posto.paese(p)]),
      }
    }
    return {
      tipo: 'quale-bandiera',
      testo: `Qual è la bandiera ${diPaese(p.id, p.n)}?`,
      opzioni: opzioni.map((q) => ({ id: q.id, testo: q.n, bandiera: q.id.toLowerCase() })),
      giusta: p.id,
      risposta: p.n,
      soggetto: p.id,
      luogo: luogo([posto.paese(p)]),
    }
  })
}

/** I paesi che si cercano sulla cartina: con la loro forma, e non troppo piccoli. */
function paesiDaCercare(c: Contesto): PaeseQuiz[] {
  return c.ix.dati.paesi.filter((p) => p.num && p.a >= SUPERFICIE_MINIMA_CARTINA && nelContinente(p, c.area))
}

const bandiereCartina: Generatore = (c) =>
  soggetti(preferendo(paesiDaCercare(c), (p) => p.id, c.evitare, c.quante), c.quante, c.caso, c.notorieta).map((p) => ({
    tipo: 'dove-bandiera',
    testo: 'Dov’è lo stato di questa bandiera?',
    bandiera: p.id.toLowerCase(),
    opzioni: [],
    cartina: { vista: c.vista, strato: 'paesi' },
    giusta: posto.paese(p)!,
    accettate: [posto.paese(p)!],
    risposta: p.n,
    soggetto: p.id,
    luogo: luogo([posto.paese(p)]),
  }))

/* ── Stati ── */

/** "Dov’è la Francia?", ma "Dove sono gli Stati Uniti?". */
function doveE(p: PaeseQuiz): string {
  const g = GENERE_PAESI[p.id]
  return g === 'mp' || g === 'fp' ? `Dove sono ${conArticolo(p.id, p.n)}?` : `Dov’è ${conArticolo(p.id, p.n)}?`
}

/** Le acque su cui si fanno domande: le piu' note, perché il Mare di Ceram non lo chiede nessuno. */
const ACQUE_NOTE = 0.45

/**
 * Sotto questo peso un'acqua bagna un paese ma non ne e' una risposta: il Cile
 * tocca l'Atlantico per un decimo della costa che ha sul Pacifico. Non e' mai
 * nemmeno un errore, perché e' fra quelle che lo bagnano.
 */
const PESO_RISPOSTA = 40

/** Il Mar Caspio: per Natural Earth un mare, ma chi lo ha solo lui non ha lo sbocco sul mare. */
const CASPIO = 'Q5484'

/** Le acque che contano per un paese: quelle che possono essere la risposta giusta. */
function acqueDi(p: PaeseQuiz): Set<string> {
  return new Set(p.bagna.filter((_, i) => (p.peso[i] ?? 0) >= PESO_RISPOSTA))
}

/** Chi ha davvero il mare: una costa che conta, e non solo sul Caspio. */
function costiero(p: PaeseQuiz): boolean {
  return [...acqueDi(p)].some((id) => id !== CASPIO)
}

const statiScelta: Generatore = (c) => {
  const tutti = c.ix.dati.paesi
  const nellArea = tutti.filter((p) => nelContinente(p, c.area))
  /**
   * I vicini dei vicini — dei confinanti sicuri, non di quelli d'oltremare: i
   * distrattori migliori per un confine, plausibili e sicuramente sbagliati. Un
   * paese senza confini di terra e' un errore troppo facile, e viene dopo.
   */
  const secondi = (p: PaeseQuiz) => {
    const s = new Set<string>()
    for (const v of p.cm ?? []) for (const w of c.ix.paesi.get(v)?.cm ?? []) s.add(w)
    return s
  }
  const lontanoDaConfine = (p: PaeseQuiz) => {
    const vicini2 = secondi(p)
    return (q: PaeseQuiz) =>
      (vicini2.has(q.id) ? 0 : stessoContinente(p, q) ? 1 : 2.5) + (q.cm?.length ? 0 : 0.8) + Math.abs(p.f - q.f) * 0.6
  }
  const sicuriDi = (p: PaeseQuiz) => (p.cm ?? []).map((id) => c.ix.paesi.get(id)).filter((q): q is PaeseQuiz => !!q)

  /** Ogni tipo ha i suoi soggetti: chi confina con qualcuno, chi ne ha abbastanza, chi non ha il mare. */
  const pool: Record<'confina-con' | 'non-confina' | 'senza-mare', PaeseQuiz[]> = {
    'confina-con': nellArea.filter((p) => sicuriDi(p).length > 0),
    'non-confina': nellArea.filter((p) => sicuriDi(p).length >= c.sbagliate),
    'senza-mare': nellArea.filter((p) => p.ch),
  }
  const quote = [['confina-con', 0.45], ['non-confina', 0.3], ['senza-mare', 0.25]] as const
  const conti = new Map<TipoDomanda, number>()
  for (const { tipo } of assegna(
    Array.from({ length: c.quante }, (_, i) => i),
    quote.filter(([t]) => pool[t].length > 0),
    c,
  )) {
    conti.set(tipo, (conti.get(tipo) ?? 0) + 1)
  }

  const usati = new Set<string>()
  const domande: DomandaCompleta[] = []
  for (const [tipo] of quote) {
    const quanti = conti.get(tipo) ?? 0
    if (quanti === 0) continue
    const candidati = preferendo(
      pool[tipo].filter((p) => !usati.has(p.id)),
      (p) => p.id,
      c.evitare,
      quanti,
    )
    let fatte = 0
    for (const p of soggetti(candidati, quanti * 2, c.caso, c.notorieta, quanti)) {
      if (fatte >= quanti) break
      const suoi = new Set([p.id, ...p.conf])
      let d: DomandaCompleta | null = null
      if (tipo === 'confina-con') {
        // Uno dei confinanti sicuri, fra i tre piu' noti.
        const giusto = unoDi(celebri(sicuriDi(p), 3), c.caso)
        const sbagliati = distrattori(
          c,
          tutti.filter((q) => !suoi.has(q.id)),
          c.sbagliate,
          lontanoDaConfine(p),
        )
        if (sbagliati.length === c.sbagliate) {
          d = {
            tipo,
            testo: `Con quale di questi stati confina ${conArticolo(p.id, p.n)}?`,
            opzioni: mescola([giusto, ...sbagliati], c.caso).map((q) => ({ id: q.id, testo: q.n })),
            giusta: giusto.id,
            risposta: giusto.n,
            soggetto: p.id,
            luogo: luogo([posto.paese(giusto)], [posto.paese(p)]),
          }
        }
      } else if (tipo === 'non-confina') {
        const vicini = mescola(sicuriDi(p), c.caso).slice(0, c.sbagliate)
        const [intruso] = distrattori(
          c,
          tutti.filter((q) => !suoi.has(q.id)),
          1,
          lontanoDaConfine(p),
        )
        if (intruso) {
          d = {
            tipo,
            testo: `Quale di questi stati non confina con ${conArticolo(p.id, p.n)}?`,
            opzioni: mescola([intruso, ...vicini], c.caso).map((q) => ({ id: q.id, testo: q.n })),
            giusta: intruso.id,
            risposta: intruso.n,
            soggetto: p.id,
            luogo: luogo([posto.paese(intruso)], [posto.paese(p), ...vicini.map((v) => posto.paese(v))]),
          }
        }
      } else {
        // Gli altri hanno il mare davvero: una costa che conta, non un'ansa di pochi chilometri.
        const sbagliati = distrattori(
          c,
          tutti.filter((q) => q.id !== p.id && costiero(q) && !q.ch),
          c.sbagliate,
          (q) => (stessoContinente(p, q) ? 0 : 1) + (p.conf.includes(q.id) ? 0 : 0.3) + Math.abs(p.f - q.f),
        )
        if (sbagliati.length === c.sbagliate) {
          d = {
            tipo,
            testo: 'Quale di questi stati non ha lo sbocco sul mare?',
            opzioni: mescola([p, ...sbagliati], c.caso).map((q) => ({ id: q.id, testo: q.n })),
            giusta: p.id,
            risposta: p.n,
            soggetto: p.id,
            luogo: luogo([posto.paese(p)]),
          }
        }
      }
      if (!d) continue
      usati.add(p.id)
      domande.push(d)
      fatte += 1
    }
  }
  // I tre tipi mescolati, dal paese piu' noto al meno noto: la partita sale.
  const fama = (d: DomandaCompleta) => c.ix.paesi.get(d.soggetto)?.f ?? 0
  return mescola(domande, c.caso).sort((a, b) => fama(b) - fama(a))
}

const statiCartina: Generatore = (c) =>
  soggetti(preferendo(paesiDaCercare(c), (p) => p.id, c.evitare, c.quante), c.quante, c.caso, c.notorieta).map((p) => ({
    tipo: 'dove-stato',
    testo: doveE(p),
    opzioni: [],
    cartina: { vista: c.vista, strato: 'paesi' },
    giusta: posto.paese(p)!,
    accettate: [posto.paese(p)!],
    risposta: p.n,
    soggetto: p.id,
    luogo: luogo([posto.paese(p)]),
  }))

/* ── Mari e oceani ── */

/**
 * Le acque che contano come giuste per un bersaglio sulla cartina: lui e quelle
 * che ne fanno parte. Il Tirreno e' Mediterraneo; ma il Mediterraneo non e'
 * Atlantico, anche se Wikidata lo mette lì, e per un oceano valgono solo i
 * suoi golfi e le sue baie, non i mari con un nome loro.
 */
export function acqueAccettate(ix: IndiceQuiz, bersaglio: AcquaQuiz): string[] {
  const dentro = new Set<string>([bersaglio.id])
  const visita = (a: AcquaQuiz) => {
    for (const figlia of ix.figlie.get(a.id) ?? []) {
      if (dentro.has(figlia.id) || figlia.t === 'oceano') continue
      if (bersaglio.t === 'oceano' && figlia.t === 'mare') continue
      dentro.add(figlia.id)
      visita(figlia)
    }
  }
  visita(bersaglio)
  return [...dentro]
}

/** Un mare e' di un continente se ne bagna almeno un paese: il Mediterraneo e' d'Europa, d'Africa e d'Asia. */
function acquaInArea(ix: IndiceQuiz, a: AcquaQuiz, area: AreaQuiz): boolean {
  if (area === 'mondo' || area.startsWith('paese:')) return true
  const continente = area as Continente
  return ix.dati.paesi.some((p) => p.k.includes(continente) && p.bagna.includes(a.id))
}

/** Le acque che un paese non tocca, e nemmeno sfiora: le uniche che possono fare da errore. */
function lontana(p: PaeseQuiz, acqua: string): boolean {
  return !p.bagna.includes(acqua) && !p.vicine.includes(acqua)
}

function perAcque(tipi: (a: AcquaQuiz) => boolean, parola: 'mare' | 'oceano'): Generatore {
  return (c) => {
    const acque = c.ix.dati.acque.filter(tipi)
    const idAcque = new Set(acque.map((a) => a.id))
    const unPaese = paeseDellArea(c.area)
    const costieri = c.ix.dati.paesi.filter((p) => [...acqueDi(p)].some((id) => idAcque.has(id)))
    const domande: DomandaCompleta[] = []

    // "Quale mare bagna la Grecia?": il paese e' il soggetto, la risposta un'acqua
    // fra quelle vere; gli errori sono acque che non lo sfiorano.
    const acquaDiStato = (p: PaeseQuiz, giuste: AcquaQuiz[], soggetto: string): DomandaCompleta | null => {
      const candidate = celebri(
        giuste.filter((a) => (parola === 'oceano' || a.t === 'mare') && !nomeRivelato(p.n, a.n)),
        2,
      )
      if (candidate.length === 0) return null
      // La piu' nota delle due, di solito: il Regno Unito e' il Mare del Nord, non il Mare delle Ebridi.
      const giusta = c.caso() < 0.65 ? candidate[0] : unoDi(candidate, c.caso)
      const sbagliate = distrattori(
        c,
        celebri(acque, 45).filter((a) => lontana(p, a.id) && (parola === 'oceano' || a.t === 'mare')),
        c.sbagliate,
        (a) =>
          (c.ix.dati.paesi.some((q) => stessoContinente(q, p) && q.bagna.includes(a.id)) ? 0 : 1) +
          Math.abs(a.f - giusta.f),
      )
      if (sbagliate.length < c.sbagliate) return null
      return {
        tipo: 'acqua-di-stato',
        testo: `Quale ${parola} bagna ${conArticolo(p.id, p.n)}?`,
        opzioni: mescola([giusta, ...sbagliate], c.caso).map((a) => ({ id: a.id, testo: a.n })),
        giusta: giusta.id,
        risposta: giusta.n,
        soggetto,
        luogo: luogo([giusta.id], [posto.paese(p)]),
      }
    }

    if (unPaese) {
      const p = c.ix.paesi.get(unPaese)
      if (!p) return []
      const principali = acqueDi(p)
      const sue = mescola(
        acque.filter((a) => principali.has(a.id)),
        c.caso,
      )
      for (const a of sue.slice(0, c.quante)) {
        const d = acquaDiStato(p, [a], a.id)
        if (d) domande.push(d)
      }
      return domande
    }

    // Il soggetto e' il paese giusto: in una partita ogni domanda parla di un paese diverso.
    const candidati = preferendo(
      costieri.filter((p) => nelContinente(p, c.area)),
      (p) => p.id,
      c.evitare,
      c.quante,
    )
    const quote = [['stato-bagnato', 0.5], ['acqua-di-stato', 0.5]] as const
    for (const { s: p, tipo } of assegna(soggetti(candidati, c.quante * 2, c.caso, c.notorieta, c.quante), quote, c)) {
      if (domande.length >= c.quante) break
      const principali = acqueDi(p)
      const sue = acque.filter((a) => principali.has(a.id))
      if (sue.length === 0) continue
      if (tipo === 'stato-bagnato') {
        // "Quale di questi stati e' bagnato dal Mar Baltico?"
        const note = celebri(
          sue.filter((a) => !nomeRivelato(p.n, a.n)),
          3,
        )
        if (note.length === 0) continue
        const acqua = unoDi(note, c.caso)
        // Gli errori dallo stesso continente prima: il Mar di Tasman con l'Iran e' troppo facile.
        const sbagliati = distrattori(
          c,
          c.ix.dati.paesi.filter((q) => q.id !== p.id && lontana(q, acqua.id)),
          c.sbagliate,
          (q) => (stessoContinente(p, q) ? 0 : 1.6) + (q.bagna.length > 0 ? 0 : 0.5) + Math.abs(q.f - p.f),
        )
        if (sbagliati.length < c.sbagliate) continue
        domande.push({
          tipo: 'stato-bagnato',
          testo: `Quale di questi stati è bagnato ${daAcqua(acqua.n)}?`,
          opzioni: mescola([p, ...sbagliati], c.caso).map((q) => ({ id: q.id, testo: q.n })),
          giusta: p.id,
          risposta: p.n,
          soggetto: p.id,
          luogo: luogo([posto.paese(p)], [acqua.id]),
        })
      } else {
        const d = acquaDiStato(p, sue, p.id)
        if (d) domande.push(d)
      }
    }
    return domande.sort((a, b) => (c.ix.paesi.get(b.soggetto)?.f ?? 0) - (c.ix.paesi.get(a.soggetto)?.f ?? 0))
  }
}

const eOceano = (a: AcquaQuiz) => OCEANI.includes(a.id)
const eMare = (a: AcquaQuiz) =>
  (a.t === 'mare' || a.t === 'golfo' || a.t === 'baia' || a.t === 'canale') && a.f >= ACQUE_NOTE

/** "Dov'è il Mar Egeo?": un'acqua da toccare, e contano anche quelle che ne fanno parte. */
function doveAcqua(c: Contesto, a: AcquaQuiz): DomandaCompleta {
  const accettate = acqueAccettate(c.ix, a)
  return {
    tipo: 'dove-acqua',
    testo: `Dov’è ${acquaConArticolo(a.n)}?`,
    opzioni: [],
    cartina: { vista: c.vista, strato: 'acque' },
    giusta: a.id,
    accettate,
    risposta: a.n,
    soggetto: a.id,
    luogo: luogo([a.id]),
  }
}

const mariCartina: Generatore = (c) =>
  soggetti(
    preferendo(
      c.ix.dati.acque.filter((a) => eMare(a) && acquaInArea(c.ix, a, c.area)),
      (a) => a.id,
      c.evitare,
      c.quante,
    ),
    c.quante,
    c.caso,
    c.notorieta,
  ).map((a) => doveAcqua(c, a))

/**
 * Gli oceani sulla cartina: dove sono, uno per domanda, cinque in tutto. Si
 * chiedeva anche quale oceano bagna un paese, con il paese acceso mentre si
 * cerca: bastava guardare quale acqua gli stava accanto, e non si imparava
 * niente. Quella domanda resta a scelta, dove il paese non si vede.
 */
const oceaniCartina: Generatore = (c) =>
  soggetti(c.ix.dati.acque.filter(eOceano), c.quante, c.caso, c.notorieta).map((a) => doveAcqua(c, a))

/* ── Fiumi e laghi ── */

/** Fiumi e laghi: la stessa domanda, con le parole di ognuno. */
function perCorsi(
  sezione: 'fiumi' | 'laghi',
  parole: {
    doveSta: (c: CorsoQuiz, piuPaesi: boolean) => string
    qualeIn: (p: PaeseQuiz) => string
    opzione: (c: CorsoQuiz) => string
    tipi: [TipoDomanda, TipoDomanda]
    /** Fra quanti dei piu' noti si scelgono le domande, e fra quanti gli errori. */
    quanti: [number, number]
    posto: (id: string) => string
  },
): Generatore {
  return (c) => {
    const tutti = c.ix.dati[sezione].filter((x) => x.p.every((id) => c.ix.paesi.has(id)) && x.p.length > 0)
    const [perDomande, perErrori] = parole.quanti
    /** I nomi che possono fare da risposta sbagliata: noti, ma un po' piu' in la' di quelli delle domande. */
    const corsi = celebri(tutti, perErrori)
    const unPaese = paeseDellArea(c.area)
    /** I paesi toccati da un corso, e i loro vicini: fuori da tutti questi, un paese e' sicuramente sbagliato. */
    const zona = (x: CorsoQuiz) => {
      const z = new Set(x.p)
      for (const id of x.p) for (const v of c.ix.paesi.get(id)?.conf ?? []) z.add(v)
      return z
    }
    const paesiDi = (x: CorsoQuiz) => x.p.map((id) => posto.paese(c.ix.paesi.get(id)))

    /**
     * "Quale di questi fiumi scorre in Francia?": gli errori sono fiumi che non
     * toccano la Francia né i suoi vicini. Simili per notorietà alla risposta,
     * così la domanda resta della difficoltà che ha; ma con un paese solo le
     * risposte arrivano fino ai fiumi minori, e gli errori devono restare nomi
     * che si conoscono.
     */
    const corsoInStato = (p: PaeseQuiz, giusto: CorsoQuiz, noti = false): DomandaCompleta | null => {
      const vietati = new Set([p.id, ...p.conf])
      const sbagliati = distrattori(
        c,
        corsi.filter((x) => x.id !== giusto.id && x.p.every((id) => !vietati.has(id))),
        c.sbagliate,
        (x) =>
          (x.p.some((id) => stessoContinente(c.ix.paesi.get(id)!, p)) ? 0 : 1) +
          (noti ? 1 - x.f : Math.abs(x.f - giusto.f)),
      )
      if (sbagliati.length < c.sbagliate) return null
      return {
        tipo: parole.tipi[1],
        testo: parole.qualeIn(p),
        opzioni: mescola([giusto, ...sbagliati], c.caso).map((x) => ({ id: x.id, testo: parole.opzione(x) })),
        giusta: giusto.id,
        risposta: parole.opzione(giusto),
        soggetto: giusto.id,
        luogo: luogo([parole.posto(giusto.id)], [posto.paese(p)]),
      }
    }

    if (unPaese) {
      const p = c.ix.paesi.get(unPaese)
      if (!p) return []
      // Di un paese solo si chiedono i piu' noti, in ordine: prima la Senna, poi l'Ardèche.
      const suoi = celebri(
        tutti.filter((x) => x.p.includes(p.id)),
        c.quante,
      )
      return suoi.map((x) => corsoInStato(p, x, true)).filter((d): d is DomandaCompleta => d !== null)
    }

    const nellArea = tutti.filter(
      (x) => c.area === 'mondo' || x.p.some((id) => c.ix.paesi.get(id)!.k.includes(c.area as Continente)),
    )
    // In un continente i piu' noti sono meno: un terzo del gruppo del mondo.
    const quantiNoti = c.area === 'mondo' ? perDomande : Math.max(c.quante * 2, Math.round(perDomande / 3))
    const allargato = c.notorieta === 'rari' ? Math.round(quantiNoti * 1.7) : quantiNoti
    const candidati = preferendo(celebri(nellArea, allargato), (x) => x.id, c.evitare, c.quante)
    /**
     * Il paese a cui un fiume "appartiene" di piu': quello dove ha meno fiumi
     * piu' noti davanti. Il Tibisco attraversa l'Ucraina, ma e' il fiume
     * dell'Ungheria; a parità, il paese piu' noto.
     */
    const posizione = (x: CorsoQuiz, p: PaeseQuiz) => tutti.filter((y) => y.f > x.f && y.p.includes(p.id)).length
    const suoPaese = (x: CorsoQuiz) =>
      x.p
        .map((id) => c.ix.paesi.get(id)!)
        .reduce((a, b) =>
          posizione(x, b) < posizione(x, a) || (posizione(x, b) === posizione(x, a) && b.f > a.f) ? b : a,
        )

    const domande: DomandaCompleta[] = []
    const paesiUsati = new Set<string>()
    const quote = [[parole.tipi[0], 0.6], [parole.tipi[1], 0.4]] as const
    const scelti = soggetti(candidati, Math.ceil(c.quante * 1.5), c.caso, c.notorieta, c.quante)
    for (const { s: x, tipo } of assegna(scelti, quote, c)) {
      if (domande.length >= c.quante) break
      const giusto = suoPaese(x)
      // Un paese per partita: due domande sul Canada di fila sono una domanda sola.
      if (paesiUsati.has(giusto.id)) continue
      if (tipo === parole.tipi[0]) {
        const fuori = zona(x)
        const sbagliati = distrattori(
          c,
          c.ix.dati.paesi.filter((q) => !fuori.has(q.id)),
          c.sbagliate,
          vicinanzaPaesi(giusto),
        )
        if (sbagliati.length < c.sbagliate) continue
        paesiUsati.add(giusto.id)
        domande.push({
          tipo: parole.tipi[0],
          testo: parole.doveSta(x, x.p.length > 1),
          opzioni: mescola([giusto, ...sbagliati], c.caso).map((q) => ({ id: q.id, testo: q.n })),
          giusta: giusto.id,
          risposta: giusto.n,
          soggetto: x.id,
          luogo: luogo([posto.paese(giusto)], [parole.posto(x.id), ...paesiDi(x)]),
        })
      } else {
        const d = corsoInStato(giusto, x)
        if (d) {
          paesiUsati.add(giusto.id)
          domande.push(d)
        }
      }
    }
    return domande
  }
}

const PAROLE_FIUMI = {
  doveSta: (x: CorsoQuiz) => `In quale stato scorre ${fiumeNellaFrase(x.n)}?`,
  qualeIn: (p: PaeseQuiz) => `Quale di questi fiumi scorre ${inPaese(p.id, p.n)}?`,
  opzione: (x: CorsoQuiz) => maiuscola(x.n),
  tipi: ['stato-del-fiume', 'fiume-in-stato'] as [TipoDomanda, TipoDomanda],
  quanti: [150, 260] as [number, number],
  posto: posto.fiume,
}

const PAROLE_LAGHI = {
  // Un lago di piu' paesi non "si trova" in uno solo: ci si affaccia.
  doveSta: (x: CorsoQuiz, piuPaesi: boolean) =>
    piuPaesi ? `Quale di questi stati si affaccia ${suLago(x.n)}?` : `In quale stato si trova ${lagoNellaFrase(x.n)}?`,
  qualeIn: (p: PaeseQuiz) => `Quale di questi laghi si trova ${inPaese(p.id, p.n)}?`,
  opzione: (x: CorsoQuiz) => lagoInOpzione(x.n),
  tipi: ['stato-del-lago', 'lago-in-stato'] as [TipoDomanda, TipoDomanda],
  quanti: [100, 170] as [number, number],
  posto: posto.lago,
}

/** Fiumi e laghi sulla cartina: quelli che hanno una linea, o un punto, da toccare. */
function corsiCartina(sezione: 'fiumi' | 'laghi', perDomande: number): Generatore {
  return (c) => {
    const unPaese = paeseDellArea(c.area)
    const disegnati = c.ix.dati[sezione].filter(
      (x) => (x.g || x.pt) && x.p.length > 0 && x.p.every((id) => c.ix.paesi.has(id)),
    )
    const nellArea = disegnati.filter((x) =>
      unPaese
        ? x.p.includes(unPaese)
        : c.area === 'mondo' || x.p.some((id) => c.ix.paesi.get(id)!.k.includes(c.area as Continente)),
    )
    const quanti = unPaese
      ? nellArea.length
      : c.area === 'mondo'
        ? perDomande
        : Math.max(c.quante * 2, Math.round(perDomande / 3))
    const candidati = preferendo(
      celebri(nellArea, c.notorieta === 'rari' ? Math.round(quanti * 1.7) : quanti),
      (x) => x.id,
      c.evitare,
      c.quante,
    )
    const fiume = sezione === 'fiumi'
    return soggetti(candidati, c.quante, c.caso, c.notorieta).map((x) => {
      const id = fiume ? posto.fiume(x.id) : posto.lago(x.id)
      return {
        tipo: fiume ? 'dove-fiume' : 'dove-lago',
        testo: `Dov’è ${fiume ? fiumeNellaFrase(x.n) : lagoNellaFrase(x.n)}?`,
        opzioni: [],
        cartina: { vista: c.vista, strato: sezione },
        giusta: id,
        accettate: [id],
        risposta: fiume ? maiuscola(x.n) : lagoInOpzione(x.n),
        soggetto: x.id,
        luogo: luogo([id], x.p.map((p) => posto.paese(c.ix.paesi.get(p)))),
      }
    })
  }
}

const GENERATORI: Record<CategoriaGeografia, Record<ModoQuiz, Generatore>> = {
  capitali: { scelta: capitaliScelta, cartina: capitaliCartina },
  citta: { scelta: cittaScelta, cartina: cittaCartina },
  bandiere: { scelta: bandiereScelta, cartina: bandiereCartina },
  stati: { scelta: statiScelta, cartina: statiCartina },
  mari: { scelta: perAcque(eMare, 'mare'), cartina: mariCartina },
  oceani: { scelta: perAcque(eOceano, 'oceano'), cartina: oceaniCartina },
  fiumi: { scelta: perCorsi('fiumi', PAROLE_FIUMI), cartina: corsiCartina('fiumi', 150) },
  laghi: { scelta: perCorsi('laghi', PAROLE_LAGHI), cartina: corsiCartina('laghi', 100) },
}

/** La vista da cui parte la cartina di una partita: il mondo, o il continente della zona. */
function vistaDellArea(ix: IndiceQuiz, area: AreaQuiz): VistaCartina {
  const unPaese = paeseDellArea(area)
  if (unPaese) return vistaDellaZona(ix.paesi.get(unPaese)?.k[0] ?? null)
  return vistaDellaZona(area as 'mondo' | Continente)
}

/**
 * Le domande di una partita.
 *
 * `evitare` sono i soggetti da non riproporre se si puo': la notte ci mette
 * quelli delle ultime settimane, perché la capitale della Francia non torni
 * ogni sette giorni. Se tolti loro i candidati sono troppo pochi — un
 * continente piccolo, un paese solo — si usano lo stesso.
 */
export function generaDomande(
  dati: DatiQuiz | IndiceQuiz,
  richiesta: RichiestaQuiz,
  caso: Caso,
  evitare: ReadonlySet<string> = new Set(),
): DomandaCompleta[] {
  const ix = 'figlie' in dati ? dati : indicizza(dati)
  const quante = Math.max(1, Math.min(richiesta.quante, QUANTE_MASSIME))
  const risposte = Math.max(2, Math.min(6, richiesta.risposte ?? RISPOSTE_PREDEFINITE))
  // La cartina muta di una volta e' diventata il modo cartina degli stati.
  const categoria = (richiesta.categoria === 'cartina' ? 'stati' : richiesta.categoria) as CategoriaGeografia
  if (!GENERATORI[categoria]) throw new Error(`La categoria ${richiesta.categoria} non e' di geografia`)
  const modo: ModoQuiz = richiesta.categoria === 'cartina' ? 'cartina' : (richiesta.modo ?? 'scelta')
  // Gli oceani non hanno continenti: bagnano tutti.
  const area: AreaQuiz = categoria === 'oceani' ? 'mondo' : richiesta.area
  const tipi = richiesta.tipi?.length ? new Set(richiesta.tipi.filter((t) => TIPI[categoria][modo].includes(t))) : null
  const c: Contesto = {
    ix,
    usati: new Map(),
    area,
    quante,
    caso,
    evitare,
    sbagliate: risposte - 1,
    tipi: tipi && tipi.size > 0 ? tipi : null,
    notorieta: richiesta.notorieta ?? 'misti',
    bandiera: richiesta.bandieraCapitali ?? true,
    vista: vistaDellArea(ix, area),
    citta: richiesta.citta ?? [],
  }
  return rifinisci(GENERATORI[categoria][modo](c), quante, risposte, richiesta.ordine, caso)
}

/**
 * Le domande di una partita come escono dal generatore, ripulite: una per
 * soggetto, solo quelle in ordine, quante se ne sono chieste, e mescolate se si
 * gioca "a caso" invece che dalla piu' facile.
 */
export function rifinisci(
  domande: readonly DomandaCompleta[],
  quante: number,
  risposte: number,
  ordine: RichiestaQuiz['ordine'],
  caso: Caso,
): DomandaCompleta[] {
  const visti = new Set<string>()
  const buone = domande
    .filter((d) => {
      if (visti.has(d.soggetto) || !domandaValida(d, risposte)) return false
      visti.add(d.soggetto)
      return true
    })
    .slice(0, quante)
  return ordine === 'caso' ? mescola(buone, caso) : buone
}

/** Le domande della classificata di un giorno: la categoria e il modo del giorno, in tutto il mondo. */
export function domandeDelGiorno(
  dati: DatiQuiz | IndiceQuiz,
  giornata: GiornataQuiz,
  caso: Caso,
  evitare: ReadonlySet<string> = new Set(),
): DomandaCompleta[] {
  return generaDomande(
    dati,
    { categoria: giornata.categoria, modo: giornata.modo, area: 'mondo', quante: DOMANDE_PER_PARTITA },
    caso,
    evitare,
  )
}

/**
 * Una domanda si fa solo se e' in ordine: le opzioni che si sono chieste,
 * diverse di id e di testo, con dentro quella giusta; o un bersaglio sulla
 * cartina.
 */
export function domandaValida(d: DomandaCompleta, risposte = RISPOSTE_PREDEFINITE): boolean {
  // Ogni risposta possibile deve essere una scelta che il server accetta.
  if (!sceltaValida(d.giusta)) return false
  if (d.cartina) return d.opzioni.length === 0 && (d.accettate ?? []).includes(d.giusta)
  if (d.opzioni.length !== risposte || !d.opzioni.every((o) => sceltaValida(o.id))) return false
  const id = new Set(d.opzioni.map((o) => o.id))
  const testi = new Set(d.opzioni.map((o) => senzaAccenti(o.testo)))
  return id.size === risposte && testi.size === risposte && id.has(d.giusta)
}

/** La domanda come va a chi gioca: senza la risposta, senza dove guardare, senza la scheda. */
export function senzaRisposta(d: DomandaCompleta): DomandaQuiz {
  return {
    tipo: d.tipo,
    ...(d.categoria ? { categoria: d.categoria } : {}),
    ...(d.ambito ? { ambito: d.ambito } : {}),
    ...(d.genere ? { genere: d.genere } : {}),
    testo: d.testo,
    ...(d.bandiera ? { bandiera: d.bandiera } : {}),
    ...(d.immagine ? { immagine: d.immagine } : {}),
    ...(d.lunga ? { lunga: d.lunga } : {}),
    opzioni: d.opzioni,
    ...(d.cartina ? { cartina: d.cartina } : {}),
  }
}

/** Se una scelta e' giusta: un'opzione, o un posto della cartina fra quelli accettati. */
export function rispostaGiusta(d: DomandaCompleta, scelta: string | null): boolean {
  if (scelta === null) return false
  return d.cartina ? (d.accettate ?? [d.giusta]).includes(scelta) : scelta === d.giusta
}

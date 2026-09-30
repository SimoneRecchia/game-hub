/**
 * I dati delle materie del quiz che non sono geografia: arte, libri, cinema,
 * lirica, premi Nobel, storia, scienza e "Accadde oggi".
 *
 * Vengono da Wikidata (CC0) e, per "Accadde oggi" e le correnti artistiche,
 * da Wikipedia in italiano (CC BY-SA: la scheda della risposta cita la voce).
 * Li prepara `npm run quiz:cultura`, che li scrive in `public/quiz/` come file
 * statici versionati — come le parole del Wordle e il dizionario dello
 * Scarabeo: il build non dipende dalla rete, e le domande di un giorno non
 * cambiano perché una fonte si e' spostata. Il browser li scarica dalle Pages
 * solo quando si gioca quella materia, e il server non li vede: la notte lo
 * script del quiz li legge dal repository per fare le domande della
 * classificata, che restano in D1 perché le risposte del giorno non escano
 * prima del tempo.
 *
 * Le immagini sono di Wikimedia Commons, e il browser le prende da lì: qui c'e'
 * solo il percorso del file. Chiavi corte, come nel riassunto della geografia:
 * sono migliaia di voci.
 */

import { VERSIONI_CULTURA } from './quiz-cultura-versioni'

/** Le materie con i loro dati: una categoria del quiz ciascuna. */
export type CategoriaCultura = 'arte' | 'libri' | 'cinema' | 'lirica' | 'nobel' | 'storia' | 'scienza' | 'oggi'

export const CATEGORIE_CULTURA: readonly CategoriaCultura[] = [
  'arte',
  'libri',
  'cinema',
  'lirica',
  'nobel',
  'storia',
  'scienza',
  'oggi',
]

/* ──────────────────────────────  Le immagini  ──────────────────────────── */

/**
 * Un'immagine di Wikimedia Commons: il percorso del file sotto `thumb/`, cioe'
 * le due cartelle dell'MD5 del nome e il nome con i trattini bassi
 * (`e/ec/Mona_Lisa,_by_Leonardo_da_Vinci,_from_C2RMF_retouched.jpg`), e il
 * rapporto fra larghezza e altezza, per tenere il posto prima che arrivi.
 * Solo JPEG e PNG, e solo di pubblico dominio: niente attribuzioni da portarsi
 * dietro.
 */
export interface ImmagineQuiz {
  f: string
  /** Larghezza / altezza. */
  r: number
}

/**
 * Le larghezze che Commons da': dal 2025 le miniature si fanno solo di misure
 * standard, e una larghezza qualunque (480) risponde 400. Verificato: 330, 500
 * e 960 si', 480 no.
 */
export const LARGHEZZE_IMMAGINI = [330, 500, 960] as const
export type LarghezzaImmagine = (typeof LARGHEZZE_IMMAGINI)[number]

/** Un percorso di Commons come deve essere: niente che esca dalla cartella delle miniature. */
export const PERCORSO_IMMAGINE = /^[0-9a-f]\/[0-9a-f]{2}\/[^/?#\\]{1,240}\.(?:jpe?g|png)$/i

export function urlImmagine(img: Pick<ImmagineQuiz, 'f'>, larghezza: LarghezzaImmagine): string {
  const barra = img.f.indexOf('/', 2)
  const cartelle = img.f.slice(0, barra)
  const nome = encodeURIComponent(img.f.slice(barra + 1))
  return `https://upload.wikimedia.org/wikipedia/commons/thumb/${cartelle}/${nome}/${larghezza}px-${nome}`
}

/** La pagina del file su Commons: la scheda della risposta ci porta. */
export function paginaImmagine(img: Pick<ImmagineQuiz, 'f'>): string {
  return `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(img.f.slice(img.f.indexOf('/', 2) + 1))}`
}

/** La voce di Wikipedia in italiano, dal titolo: "Gioconda" → https://it.wikipedia.org/wiki/Gioconda. */
export function urlVoce(titolo: string): string {
  return `https://it.wikipedia.org/wiki/${encodeURIComponent(titolo.replace(/ /g, '_'))}`
}

/* ──────────────────────────────  Le voci comuni  ───────────────────────── */

/**
 * Una persona dei quiz di cultura: un pittore, uno scrittore, un regista, un
 * compositore, chi ha vinto un Nobel (anche un'organizzazione, per la pace).
 */
export interface PersonaQuiz {
  /** L'identificativo Wikidata. */
  id: string
  /** Il nome come si scrive in italiano: "Leonardo da Vinci". */
  n: string
  /** Gli anni di nascita e di morte; negativi avanti Cristo. */
  na?: number
  mo?: number
  /** Il paese, in italiano: "Italia", "Paesi Bassi". */
  p?: string
  /** 1 se e' italiano: le partite "solo italiani" guardano questo. */
  it?: 1
  /** Le correnti o i movimenti (identificativi della tabella della materia). */
  c?: string[]
  /** Chi e', in poche parole: "pittore fiammingo", "fisico tedesco". */
  d?: string
  /** Il titolo della voce di Wikipedia in italiano. */
  w?: string
  /** Quanto e' nota, da 1 (la piu' nota) a 0: la posizione per numero di Wikipedia. */
  f: number
}

/** Una voce di contorno: una corrente, un genere. Con una o due frasi da Wikipedia, se ci sono. */
export interface VoceQuiz {
  id: string
  /** Il nome, con la maiuscola: "Impressionismo". */
  n: string
  /** Una o due frasi dalla voce di Wikipedia in italiano. */
  d?: string
  w?: string
}

/* ──────────────────────────────  Le materie  ─────────────────────────────── */

export interface QuadroQuiz {
  id: string
  /** Il titolo in italiano: "La Gioconda". */
  n: string
  /** Chi l'ha dipinto: di solito uno (identificativi di `pittori`). */
  a: string[]
  /** L'anno, o l'anno d'inizio; negativo avanti Cristo. */
  anno?: number
  /** Le correnti del quadro, o del pittore se il quadro non le ha. */
  c?: string[]
  /** La tecnica, in italiano: "olio su tavola". */
  t?: string
  /** Dov'e': il museo, e la città. */
  m?: string
  l?: string
  /** Il genere: "ritratto", "paesaggio". */
  g?: string
  img: ImmagineQuiz
  w?: string
  f: number
}

export interface DatiArte {
  versione: string
  quadri: QuadroQuiz[]
  pittori: PersonaQuiz[]
  correnti: VoceQuiz[]
}

export interface LibroQuiz {
  id: string
  /** Il titolo in italiano: "Il piccolo principe". */
  n: string
  /** Gli autori (identificativi di `autori`), nell'ordine di Wikidata. */
  a: string[]
  /** L'anno di pubblicazione, o di composizione; negativo avanti Cristo. */
  anno?: number
  /** La lingua originale, in italiano: "francese". */
  lingua?: string
  /** Il genere: "romanzo", "poema epico". */
  g?: string
  /** 1 se e' letteratura italiana: l'autore e' italiano, o l'opera e' in italiano. */
  it?: 1
  w?: string
  f: number
}

export interface DatiLibri {
  versione: string
  libri: LibroQuiz[]
  autori: PersonaQuiz[]
}

export interface FilmQuiz {
  id: string
  n: string
  /** I registi (identificativi di `registi`). */
  r: string[]
  /** L'anno della prima uscita. */
  anno?: number
  /** Il paese di produzione, in italiano; "Italia" per quelli italiani. */
  p?: string
  it?: 1
  g?: string
  /** Gli interpreti principali, per nome: al massimo tre, i piu' noti. */
  cast?: string[]
  /** 1 se ha vinto l'Oscar al miglior film. */
  oscar?: 1
  w?: string
  f: number
}

export interface DatiCinema {
  versione: string
  film: FilmQuiz[]
  registi: PersonaQuiz[]
}

export interface OperaQuiz {
  id: string
  /** Il titolo: "La traviata". */
  n: string
  /** I compositori (identificativi di `compositori`). */
  c: string[]
  /** I librettisti, per nome. */
  lib?: string[]
  /** L'anno della prima rappresentazione. */
  anno?: number
  /** Dove ando' in scena la prima volta: il teatro e la città. */
  teatro?: string
  citta?: string
  lingua?: string
  it?: 1
  w?: string
  f: number
}

export interface DatiLirica {
  versione: string
  opere: OperaQuiz[]
  compositori: PersonaQuiz[]
}

export type PremioNobel = 'letteratura' | 'fisica' | 'chimica' | 'medicina' | 'pace' | 'economia'

export const PREMI_NOBEL: readonly PremioNobel[] = ['letteratura', 'fisica', 'chimica', 'medicina', 'pace', 'economia']

/** Un premio a una persona (o a un'organizzazione) in un anno. */
export interface NobelQuiz {
  /** Chi l'ha vinto (identificativo di `premiati`). */
  chi: string
  premio: PremioNobel
  anno: number
  /** La motivazione, se Wikidata ce l'ha in italiano. */
  motivo?: string
}

export interface DatiNobel {
  versione: string
  premi: NobelQuiz[]
  premiati: PersonaQuiz[]
}

/** Che cos'e' un fatto della storia: serve alla frase della domanda ("la battaglia", "il trattato"). */
export type TipoEvento =
  | 'battaglia'
  | 'guerra'
  | 'assedio'
  | 'trattato'
  | 'rivoluzione'
  | 'rivolta'
  | 'assassinio'
  | 'disastro'
  | 'scoperta'
  | 'altro'

export interface EventoQuiz {
  id: string
  /** Il nome come lo scrive Wikidata in italiano: "battaglia di Waterloo". */
  n: string
  /** L'anno, o l'anno d'inizio; negativo avanti Cristo. */
  anno: number
  /** L'anno della fine, se e' diverso: le guerre. */
  fine?: number
  tipo: TipoEvento
  /** Dove, in italiano: "Waterloo", "Belgio". */
  luogo?: string
  /** Di che cosa fa parte: "guerre napoleoniche". */
  parte?: string
  /** 1 se riguarda la storia d'Italia: e' successo in Italia, o l'Italia c'era. */
  it?: 1
  w?: string
  f: number
}

export interface DatiStoria {
  versione: string
  eventi: EventoQuiz[]
}

export interface ElementoQuiz {
  id: string
  /** Il nome in italiano, minuscolo: "ferro". */
  n: string
  /** Il simbolo: "Fe". */
  s: string
  /** Il numero atomico. */
  z: number
  /** La famiglia: "metallo alcalino", "gas nobile". */
  g?: string
  /** Chi l'ha scoperto, per nome, e quando. */
  chi?: string[]
  anno?: number
  w?: string
  f: number
}

export interface CompostoQuiz {
  id: string
  /** "acqua", "anidride carbonica". */
  n: string
  /** La formula con i pedici di Unicode, come la scrive Wikidata: "H₂O". */
  formula: string
  w?: string
  f: number
}

export interface UnitaQuiz {
  id: string
  /** "pascal". */
  n: string
  /** Il simbolo: "Pa". */
  s: string
  /** La grandezza che misura, in italiano: "pressione". */
  g: string
  /** Da chi prende il nome, se da una persona: "Blaise Pascal". */
  da?: string
  w?: string
  f: number
}

/** Un corpo del sistema solare: i pianeti, i pianeti nani, i satelliti piu' noti. */
export interface AstroQuiz {
  id: string
  /** "Titano". */
  n: string
  tipo: 'pianeta' | 'pianeta nano' | 'satellite'
  /** Per un satellite, il suo pianeta: "Saturno". */
  di?: string
  /** Per un pianeta, il posto dal Sole: 1 Mercurio, 8 Nettuno. */
  ordine?: number
  /** Chi l'ha scoperto, e quando: non per i pianeti che si vedono a occhio nudo. */
  chi?: string[]
  anno?: number
  w?: string
  f: number
}

/** Una scoperta o un'invenzione, con chi l'ha fatta. */
export interface ScopertaQuiz {
  id: string
  /** "penicillina", "telefono". */
  n: string
  /** Chi, per nome: di solito uno, a volte due. */
  chi: string[]
  anno?: number
  w?: string
  f: number
}

/** Una specie con il nome italiano e quello scientifico. */
export interface SpecieQuiz {
  id: string
  /** Il nome comune: "lupo", "pomodoro". */
  n: string
  /** Il nome scientifico: "Canis lupus". */
  sci: string
  /** Il regno, in breve: animale o pianta. */
  regno: 'animale' | 'pianta' | 'altro'
  w?: string
  f: number
}

export interface DatiScienza {
  versione: string
  elementi: ElementoQuiz[]
  composti: CompostoQuiz[]
  unita: UnitaQuiz[]
  astri: AstroQuiz[]
  scoperte: ScopertaQuiz[]
  specie: SpecieQuiz[]
}

/* ───────────────────────────────  Accadde oggi  ──────────────────────────── */

/** Un fatto di un giorno dell'anno, dall'"Accadde oggi" di Wikipedia in italiano. */
export interface FattoQuiz {
  /** L'anno; negativo avanti Cristo. */
  anno: number
  /** La frase di Wikipedia: "Idi di marzo: Giulio Cesare viene assassinato nel Senato". */
  t: string
  /** La voce che lo racconta, e le prime frasi. */
  w?: string
  d?: string
  /** Quanto e' noto, da 1 a 0, fra i fatti dello stesso giorno. */
  f: number
}

/** Chi e' nato in un giorno dell'anno. */
export interface NatoQuiz {
  id: string
  n: string
  anno: number
  /** 1 se e' una donna (P21 = Q6581072): la domanda dice "e' nata". */
  fem?: 1
  /** "fisico tedesco". */
  d?: string
  w?: string
  f: number
}

export interface DatiOggi {
  versione: string
  /** Il giorno: "03-15". */
  giorno: string
  fatti: FattoQuiz[]
  nati: NatoQuiz[]
}

/** I dati di ogni materia, per categoria. */
export interface DatiCultura {
  arte: DatiArte
  libri: DatiLibri
  cinema: DatiCinema
  lirica: DatiLirica
  nobel: DatiNobel
  storia: DatiStoria
  scienza: DatiScienza
  oggi: DatiOggi
}

/* ───────────────────────────────  I file  ─────────────────────────────── */

/** Il giorno dell'anno di una data "AAAA-MM-GG": "03-15". */
export function giornoDellAnno(data: string): string {
  return data.slice(5, 10)
}

/**
 * L'indirizzo dei dati di una materia: `/quiz/arte.json?v=…`. La versione e'
 * l'impronta del file, scritta da `npm run quiz:cultura` in
 * `shared/quiz-cultura-versioni.ts`: `_headers` li tiene in cache per sempre.
 */
export function urlDatiCultura(categoria: Exclude<CategoriaCultura, 'oggi'>): string {
  return `/quiz/${categoria}.json?v=${VERSIONI_CULTURA[categoria] ?? ''}`
}

/** I dati di "Accadde oggi" di un giorno dell'anno: `/quiz/oggi/03-15.json?v=…`. */
export function urlOggi(giorno: string): string {
  return `/quiz/oggi/${giorno}.json?v=${VERSIONI_CULTURA.oggi ?? ''}`
}

/** Un anno come si legge: 1492, 44 a.C. */
export function annoInLettere(anno: number): string {
  return anno < 0 ? `${-anno} a.C.` : String(anno)
}

/** Il secolo di un anno, in numeri romani: 1492 → XV, -44 → I a.C. */
export function secolo(anno: number): string {
  const s = anno > 0 ? Math.floor((anno - 1) / 100) + 1 : Math.floor((-anno - 1) / 100) + 1
  return `${romano(s)} secolo${anno < 0 ? ' a.C.' : ''}`
}

/** Il numero del secolo, con il segno: 15 per il Quattrocento, -1 per il primo avanti Cristo. */
export function numeroSecolo(anno: number): number {
  return anno > 0 ? Math.floor((anno - 1) / 100) + 1 : -(Math.floor((-anno - 1) / 100) + 1)
}

export function romano(n: number): string {
  const cifre: Array<[number, string]> = [
    [1000, 'M'],
    [900, 'CM'],
    [500, 'D'],
    [400, 'CD'],
    [100, 'C'],
    [90, 'XC'],
    [50, 'L'],
    [40, 'XL'],
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ]
  let resto = n
  let testo = ''
  for (const [valore, segno] of cifre) {
    while (resto >= valore) {
      testo += segno
      resto -= valore
    }
  }
  return testo
}

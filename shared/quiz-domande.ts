/**
 * Le domande del quiz, costruite dal riassunto dei dati.
 *
 * Una domanda ha una risposta giusta e tre sbagliate, e il lavoro vero e'
 * scegliere quelle sbagliate: devono essere plausibili — un paese dello stesso
 * continente, un mare della stessa parte del mondo — e **sicuramente**
 * sbagliate. Le fonti non sono perfette: Wikidata puo' dimenticare un paese che
 * un fiume attraversa, e una costa di pochi chilometri puo' sfuggire alla
 * geometria. Per questo un distrattore non deve solo essere fuori dalla
 * risposta, ma lontano: un fiume non si chiede con un paese confinante con
 * quelli che attraversa, un mare non con un paese a poche decine di
 * chilometri. Nel dubbio la domanda non si fa.
 *
 * Tutto dipende solo dal generatore di numeri che si passa: la notte, con il
 * seme del giorno, fa le domande della classificata; nel browser quelle delle
 * libere.
 */

import {
  DOMANDE_PER_PARTITA,
  VISTE_REGIONALI,
  VISTA_DEL_CONTINENTE,
  dentroVista,
  idPaeseCartina,
  type CategoriaQuiz,
  type Continente,
  type VistaCartina,
} from './quiz'
import { OCEANI, type AcquaQuiz, type CorsoQuiz, type DatiQuiz, type PaeseQuiz } from './quiz-dati'
import {
  GENERE_PAESI,
  acquaConArticolo,
  cittaNellaFrase,
  conArticolo,
  daAcqua,
  diPaese,
  fiumeNellaFrase,
  inPaese,
  lagoInOpzione,
  lagoNellaFrase,
  maiuscola,
  suLago,
} from './quiz-lingua'

export type TipoDomanda =
  | 'capitale-di'
  | 'stato-di-capitale'
  | 'bandiera-di'
  | 'quale-bandiera'
  | 'stato-bagnato'
  | 'acqua-di-stato'
  | 'stato-del-fiume'
  | 'fiume-in-stato'
  | 'stato-del-lago'
  | 'lago-in-stato'
  | 'dove-stato'
  | 'dove-acqua'

export interface OpzioneQuiz {
  id: string
  testo: string
  /** Il codice della bandiera, quando l'opzione e' una bandiera e non un nome. */
  bandiera?: string
}

/** Una domanda come la vede chi gioca: senza la risposta. */
export interface DomandaQuiz {
  tipo: TipoDomanda
  testo: string
  /** La bandiera da mostrare con la domanda. */
  bandiera?: string
  /** Quattro, in ordine sparso; vuote per la cartina. */
  opzioni: OpzioneQuiz[]
  /** La cartina muta: dove guardare, e cosa si tocca. */
  cartina?: { vista: VistaCartina; strato: 'paesi' | 'acque' }
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
}

/** Tutto il mondo, un continente, o un paese solo (per fiumi, laghi e mari). */
export type AreaQuiz = 'mondo' | Continente | `paese:${string}`

export interface RichiestaQuiz {
  categoria: CategoriaQuiz
  area: AreaQuiz
  quante: number
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

/* ───────────────────────────────  Il caso  ─────────────────────────────── */

type Caso = () => number

function mescola<T>(voci: readonly T[], caso: Caso): T[] {
  const copia = [...voci]
  for (let i = copia.length - 1; i > 0; i -= 1) {
    const j = Math.floor(caso() * (i + 1))
    ;[copia[i], copia[j]] = [copia[j], copia[i]]
  }
  return copia
}

function unoDi<T>(voci: readonly T[], caso: Caso): T {
  return voci[Math.floor(caso() * voci.length)]
}

/**
 * Tre distrattori da un elenco di candidati, preferendo i piu' simili alla
 * risposta: stesso continente prima, poi notorietà vicina. Un po' di caso fra i
 * migliori, perché le stesse domande non abbiano sempre gli stessi compagni.
 */
function distrattori<T>(
  candidati: readonly T[],
  quanti: number,
  vicinanza: (t: T) => number,
  caso: Caso,
): T[] {
  const ordinati = candidati
    .map((t) => ({ t, v: vicinanza(t) + caso() * 0.35 }))
    .sort((a, b) => a.v - b.v)
    .map((x) => x.t)
  return mescola(ordinati.slice(0, Math.max(quanti * 3, 8)), caso).slice(0, quanti)
}

/**
 * I soggetti di una partita, dal piu' facile al piu' difficile: si dividono i
 * candidati per notorietà in tre fasce e se ne prendono quattro facili,
 * quattro medi e due difficili ogni dieci. In ordine, così la partita sale.
 */
function soggetti<T extends { f: number }>(candidati: readonly T[], quanti: number, caso: Caso): T[] {
  if (candidati.length <= quanti) return mescola(candidati, caso).sort((a, b) => b.f - a.f)
  const ordinati = [...candidati].sort((a, b) => b.f - a.f)
  const n = ordinati.length
  const fasce = [ordinati.slice(0, Math.ceil(n * 0.3)), ordinati.slice(Math.ceil(n * 0.3), Math.ceil(n * 0.7)), ordinati.slice(Math.ceil(n * 0.7))]
  const facili = Math.round(quanti * 0.4)
  const medi = Math.round(quanti * 0.4)
  const quote = [facili, medi, quanti - facili - medi]
  const scelti: T[] = []
  const avanzi: T[] = []
  fasce.forEach((fascia, i) => {
    const presi = mescola(fascia, caso)
    scelti.push(...presi.slice(0, quote[i]).sort((a, b) => b.f - a.f))
    avanzi.push(...presi.slice(quote[i]))
  })
  // Una fascia troppo corta si completa con quel che avanza delle altre.
  for (const t of mescola(avanzi, caso)) {
    if (scelti.length >= quanti) break
    scelti.push(t)
  }
  return scelti.slice(0, quanti)
}

/* ───────────────────────────────  Le regole  ───────────────────────────── */

const senzaAccenti = (s: string) =>
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

/** Sulla cartina un paese piu' piccolo di così non si trova con un dito. */
const SUPERFICIE_MINIMA_CARTINA = 20_000

/* ─────────────────────────────  Le categorie  ──────────────────────────── */

type Generatore = (ix: IndiceQuiz, area: AreaQuiz, quante: number, caso: Caso, evitare: ReadonlySet<string>) => DomandaCompleta[]

/** I candidati senza quelli da evitare, se ne restano abbastanza. */
function preferendo<T>(candidati: T[], chiave: (t: T) => string, evitare: ReadonlySet<string>, quanti: number): T[] {
  const nuovi = candidati.filter((t) => !evitare.has(chiave(t)))
  return nuovi.length >= quanti * 2 ? nuovi : candidati
}

/** Due tipi di domanda in una partita, con la quota del primo. */
function alterna<T>(soggettiScelti: T[], quota: number, caso: Caso): Array<{ s: T; primo: boolean }> {
  const quanti = Math.round(soggettiScelti.length * quota)
  const primi = new Set(mescola(soggettiScelti.map((_, i) => i), caso).slice(0, quanti))
  return soggettiScelti.map((s, i) => ({ s, primo: primi.has(i) }))
}

const capitali: Generatore = (ix, area, quante, caso, evitare) => {
  const tutti = ix.dati.paesi.filter((p) => p.cap)
  const candidati = preferendo(
    ix.dati.paesi.filter((p) => capitaleDaDomanda(p) && nelContinente(p, area)),
    (p) => p.id,
    evitare,
    quante,
  )
  return alterna(soggetti(candidati, quante, caso), 0.6, caso).map(({ s: p, primo }) => {
    const altri = tutti.filter((q) => q.id !== p.id && senzaAccenti(q.cap) !== senzaAccenti(p.cap))
    if (primo) {
      // Qual e' la capitale? Tre capitali di altri paesi, e a volte la città
      // piu' grande del paese: il trabocchetto di Sydney.
      const sbagliate = distrattori(altri, 3, vicinanzaPaesi(p), caso).map((q) => ({ id: `cap:${q.id}`, testo: q.cap }))
      if (p.trap && caso() < 0.6 && !sbagliate.some((o) => senzaAccenti(o.testo) === senzaAccenti(p.trap!))) {
        sbagliate[0] = { id: `trap:${p.id}`, testo: p.trap }
      }
      const giusta = { id: `cap:${p.id}`, testo: p.cap }
      return {
        tipo: 'capitale-di',
        testo: `Qual è la capitale ${diPaese(p.id, p.n)}?`,
        opzioni: mescola([giusta, ...sbagliate], caso),
        giusta: giusta.id,
        risposta: p.cap,
        soggetto: p.id,
      }
    }
    const sbagliati = distrattori(altri, 3, vicinanzaPaesi(p), caso)
    return {
      tipo: 'stato-di-capitale',
      testo: `Di quale stato è capitale ${cittaNellaFrase(p.cap)}?`,
      opzioni: mescola([p, ...sbagliati], caso).map((q) => ({ id: q.id, testo: q.n })),
      giusta: p.id,
      risposta: p.n,
      soggetto: p.id,
    }
  })
}

const bandiere: Generatore = (ix, area, quante, caso, evitare) => {
  const tutti = ix.dati.paesi
  const candidati = preferendo(
    tutti.filter((p) => nelContinente(p, area)),
    (p) => p.id,
    evitare,
    quante,
  )
  return alterna(soggetti(candidati, quante, caso), 0.6, caso).map(({ s: p, primo }) => {
    const sbagliati = distrattori(
      tutti.filter((q) => q.id !== p.id),
      3,
      vicinanzaPaesi(p),
      caso,
    )
    const opzioni = mescola([p, ...sbagliati], caso)
    if (primo) {
      return {
        tipo: 'bandiera-di',
        testo: 'Di quale stato è questa bandiera?',
        bandiera: p.id.toLowerCase(),
        opzioni: opzioni.map((q) => ({ id: q.id, testo: q.n })),
        giusta: p.id,
        risposta: p.n,
        soggetto: p.id,
      }
    }
    return {
      tipo: 'quale-bandiera',
      testo: `Qual è la bandiera ${diPaese(p.id, p.n)}?`,
      opzioni: opzioni.map((q) => ({ id: q.id, testo: q.n, bandiera: q.id.toLowerCase() })),
      giusta: p.id,
      risposta: p.n,
      soggetto: p.id,
    }
  })
}

/** "Dov’è la Francia?", ma "Dove sono gli Stati Uniti?". */
function doveE(p: PaeseQuiz): string {
  const g = GENERE_PAESI[p.id]
  return g === 'mp' || g === 'fp' ? `Dove sono ${conArticolo(p.id, p.n)}?` : `Dov’è ${conArticolo(p.id, p.n)}?`
}

/**
 * La vista piu' stretta che contiene un'acqua; il mondo per gli oceani. Un mare
 * che non sta in nessuna vista regionale non si chiede: sul mappamondo intero,
 * su un telefono, il Mare di Barents e' una striscia.
 */
function vistaDellAcqua(a: AcquaQuiz): VistaCartina | null {
  if (a.t === 'oceano') return 'mondo'
  return VISTE_REGIONALI.find((v) => dentroVista(v, a.bb, 2)) ?? null
}

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

function acquaInArea(ix: IndiceQuiz, a: AcquaQuiz, area: AreaQuiz): boolean {
  if (area === 'mondo' || area.startsWith('paese:')) return true
  const continente = area as Continente
  if (a.t === 'oceano') {
    return ix.dati.paesi.some((p) => p.k.includes(continente) && p.bagna.includes(a.id))
  }
  return dentroVista(VISTA_DEL_CONTINENTE[continente], a.bb, 3)
}

const cartina: Generatore = (ix, area, quante, caso, evitare) => {
  const paesi = preferendo(
    ix.dati.paesi.filter((p) => p.num && p.a >= SUPERFICIE_MINIMA_CARTINA && nelContinente(p, area)),
    (p) => p.id,
    evitare,
    quante,
  )
  const acque = preferendo(
    ix.dati.acque.filter((a) => a.t !== 'stretto' && a.f >= ACQUE_NOTE && vistaDellAcqua(a) && acquaInArea(ix, a, area)),
    (a) => a.id,
    evitare,
    quante,
  )
  const quanteAcque = acque.length === 0 ? 0 : Math.min(acque.length, Math.round(quante * 0.3))
  const domandePaesi: DomandaCompleta[] = soggetti(paesi, quante - quanteAcque, caso).map((p) => ({
    tipo: 'dove-stato',
    testo: doveE(p),
    opzioni: [],
    cartina: { vista: VISTA_DEL_CONTINENTE[p.k[0]], strato: 'paesi' },
    giusta: idPaeseCartina(p.num!),
    accettate: [idPaeseCartina(p.num!)],
    risposta: p.n,
    soggetto: p.id,
  }))
  const domandeAcque: DomandaCompleta[] = soggetti(acque, quanteAcque, caso).map((a) => ({
    tipo: 'dove-acqua',
    testo: `Dov’è ${acquaConArticolo(a.n)}?`,
    opzioni: [],
    cartina: { vista: vistaDellAcqua(a)!, strato: 'acque' },
    giusta: a.id,
    accettate: acqueAccettate(ix, a),
    risposta: a.n,
    soggetto: a.id,
  }))
  // Le acque in mezzo ai paesi, non tutte in fondo: una ogni tre o quattro.
  const tutte: DomandaCompleta[] = []
  const passo = domandeAcque.length > 0 ? Math.max(2, Math.floor(quante / domandeAcque.length)) : Infinity
  let a = 0
  for (const d of domandePaesi) {
    tutte.push(d)
    if ((tutte.length + 1) % passo === 0 && a < domandeAcque.length) tutte.push(domandeAcque[a++])
  }
  while (a < domandeAcque.length) tutte.push(domandeAcque[a++])
  return tutte
}

/** Le acque che un paese non tocca, e nemmeno sfiora: le uniche che possono fare da errore. */
function lontana(p: PaeseQuiz, acqua: string): boolean {
  return !p.bagna.includes(acqua) && !p.vicine.includes(acqua)
}

/**
 * Sotto questo peso un'acqua bagna un paese ma non ne e' una risposta: il Cile
 * tocca l'Atlantico per un decimo della costa che ha sul Pacifico. Non e' mai
 * nemmeno un errore, perché e' fra quelle che lo bagnano.
 */
const PESO_RISPOSTA = 40

/** Le acque che contano per un paese: quelle che possono essere la risposta giusta. */
function acqueDi(p: PaeseQuiz): Set<string> {
  return new Set(p.bagna.filter((_, i) => (p.peso[i] ?? 0) >= PESO_RISPOSTA))
}

function perAcque(tipi: (a: AcquaQuiz) => boolean, parola: 'mare' | 'oceano'): Generatore {
  return (ix, area, quante, caso, evitare) => {
    const acque = ix.dati.acque.filter(tipi)
    const idAcque = new Set(acque.map((a) => a.id))
    const unPaese = paeseDellArea(area)
    const costieri = ix.dati.paesi.filter((p) => [...acqueDi(p)].some((id) => idAcque.has(id)))
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
      const giusta = caso() < 0.65 ? candidate[0] : unoDi(candidate, caso)
      const sbagliate = distrattori(
        celebri(acque, 45).filter((a) => lontana(p, a.id) && (parola === 'oceano' || a.t === 'mare')),
        3,
        (a) => (ix.dati.paesi.some((q) => stessoContinente(q, p) && q.bagna.includes(a.id)) ? 0 : 1) + Math.abs(a.f - giusta.f),
        caso,
      )
      if (sbagliate.length < 3) return null
      return {
        tipo: 'acqua-di-stato',
        testo: `Quale ${parola} bagna ${conArticolo(p.id, p.n)}?`,
        opzioni: mescola([giusta, ...sbagliate], caso).map((a) => ({ id: a.id, testo: a.n })),
        giusta: giusta.id,
        risposta: giusta.n,
        soggetto,
      }
    }

    if (unPaese) {
      const p = ix.paesi.get(unPaese)
      if (!p) return []
      const principali = acqueDi(p)
      const sue = mescola(
        acque.filter((a) => principali.has(a.id)),
        caso,
      )
      for (const a of sue.slice(0, quante)) {
        const d = acquaDiStato(p, [a], a.id)
        if (d) domande.push(d)
      }
      return domande
    }

    // Il soggetto e' il paese giusto: in una partita ogni domanda parla di un paese diverso.
    const candidati = preferendo(
      costieri.filter((p) => nelContinente(p, area)),
      (p) => p.id,
      evitare,
      quante,
    )
    for (const { s: p, primo } of alterna(soggetti(candidati, quante * 2, caso), 0.5, caso)) {
      if (domande.length >= quante) break
      const principali = acqueDi(p)
      const sue = acque.filter((a) => principali.has(a.id))
      if (sue.length === 0) continue
      if (primo) {
        // "Quale di questi stati e' bagnato dal Mar Baltico?"
        const note = celebri(
          sue.filter((a) => !nomeRivelato(p.n, a.n)),
          3,
        )
        if (note.length === 0) continue
        const acqua = unoDi(note, caso)
        const sbagliati = distrattori(
          ix.dati.paesi.filter((q) => q.id !== p.id && lontana(q, acqua.id)),
          3,
          (q) => (stessoContinente(p, q) ? 0 : 1) + (q.bagna.length > 0 ? 0 : 0.5) + Math.abs(q.f - p.f),
          caso,
        )
        if (sbagliati.length < 3) continue
        domande.push({
          tipo: 'stato-bagnato',
          testo: `Quale di questi stati è bagnato ${daAcqua(acqua.n)}?`,
          opzioni: mescola([p, ...sbagliati], caso).map((q) => ({ id: q.id, testo: q.n })),
          giusta: p.id,
          risposta: p.n,
          soggetto: p.id,
        })
      } else {
        const d = acquaDiStato(p, sue, p.id)
        if (d) domande.push(d)
      }
    }
    return domande.sort((a, b) => (ix.paesi.get(b.soggetto)?.f ?? 0) - (ix.paesi.get(a.soggetto)?.f ?? 0))
  }
}

/** Le acque su cui si fanno domande: le piu' note, perché il Mare di Ceram non lo chiede nessuno. */
const ACQUE_NOTE = 0.45

const oceani = perAcque((a) => OCEANI.includes(a.id), 'oceano')
const mari = perAcque(
  (a) => (a.t === 'mare' || a.t === 'golfo' || a.t === 'baia' || a.t === 'canale') && a.f >= ACQUE_NOTE,
  'mare',
)

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
  },
): Generatore {
  return (ix, area, quante, caso, evitare) => {
    const tutti = ix.dati[sezione].filter((c) => c.p.every((id) => ix.paesi.has(id)) && c.p.length > 0)
    const [perDomande, perErrori] = parole.quanti
    /** I nomi che possono fare da risposta sbagliata: noti, ma un po' piu' in la' di quelli delle domande. */
    const corsi = celebri(tutti, perErrori)
    const unPaese = paeseDellArea(area)
    /** I paesi toccati da un corso, e i loro vicini: fuori da tutti questi, un paese e' sicuramente sbagliato. */
    const zona = (c: CorsoQuiz) => {
      const z = new Set(c.p)
      for (const id of c.p) for (const v of ix.paesi.get(id)?.conf ?? []) z.add(v)
      return z
    }

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
        corsi.filter((c) => c.id !== giusto.id && c.p.every((id) => !vietati.has(id))),
        3,
        (c) =>
          (c.p.some((id) => stessoContinente(ix.paesi.get(id)!, p)) ? 0 : 1) +
          (noti ? 1 - c.f : Math.abs(c.f - giusto.f)),
        caso,
      )
      if (sbagliati.length < 3) return null
      return {
        tipo: parole.tipi[1],
        testo: parole.qualeIn(p),
        opzioni: mescola([giusto, ...sbagliati], caso).map((c) => ({ id: c.id, testo: parole.opzione(c) })),
        giusta: giusto.id,
        risposta: parole.opzione(giusto),
        soggetto: giusto.id,
      }
    }

    if (unPaese) {
      const p = ix.paesi.get(unPaese)
      if (!p) return []
      // Di un paese solo si chiedono i piu' noti, in ordine: prima la Senna, poi l'Ardèche.
      const suoi = celebri(
        tutti.filter((c) => c.p.includes(p.id)),
        quante,
      )
      return suoi.map((c) => corsoInStato(p, c, true)).filter((d): d is DomandaCompleta => d !== null)
    }

    const nellArea = tutti.filter(
      (c) => area === 'mondo' || c.p.some((id) => ix.paesi.get(id)!.k.includes(area as Continente)),
    )
    // In un continente i piu' noti sono meno: un terzo del gruppo del mondo.
    const candidati = preferendo(
      celebri(nellArea, area === 'mondo' ? perDomande : Math.max(quante * 2, Math.round(perDomande / 3))),
      (c) => c.id,
      evitare,
      quante,
    )
    /**
     * Il paese a cui un fiume "appartiene" di piu': quello dove ha meno fiumi
     * piu' noti davanti. Il Tibisco attraversa l'Ucraina, ma e' il fiume
     * dell'Ungheria; a parità, il paese piu' noto.
     */
    const posto = (c: CorsoQuiz, p: PaeseQuiz) => tutti.filter((x) => x.f > c.f && x.p.includes(p.id)).length
    const suoPaese = (c: CorsoQuiz) =>
      c.p
        .map((id) => ix.paesi.get(id)!)
        .reduce((a, b) => (posto(c, b) < posto(c, a) || (posto(c, b) === posto(c, a) && b.f > a.f) ? b : a))

    const domande: DomandaCompleta[] = []
    const paesiUsati = new Set<string>()
    for (const { s: c, primo } of alterna(soggetti(candidati, Math.ceil(quante * 1.5), caso), 0.6, caso)) {
      if (domande.length >= quante) break
      const giusto = suoPaese(c)
      // Un paese per partita: due domande sul Canada di fila sono una domanda sola.
      if (paesiUsati.has(giusto.id)) continue
      if (primo) {
        const fuori = zona(c)
        const sbagliati = distrattori(
          ix.dati.paesi.filter((q) => !fuori.has(q.id)),
          3,
          vicinanzaPaesi(giusto),
          caso,
        )
        if (sbagliati.length < 3) continue
        paesiUsati.add(giusto.id)
        domande.push({
          tipo: parole.tipi[0],
          testo: parole.doveSta(c, c.p.length > 1),
          opzioni: mescola([giusto, ...sbagliati], caso).map((q) => ({ id: q.id, testo: q.n })),
          giusta: giusto.id,
          risposta: giusto.n,
          soggetto: c.id,
        })
      } else {
        const d = corsoInStato(giusto, c)
        if (d) {
          paesiUsati.add(giusto.id)
          domande.push(d)
        }
      }
    }
    return domande
  }
}

const fiumi = perCorsi('fiumi', {
  doveSta: (c) => `In quale stato scorre ${fiumeNellaFrase(c.n)}?`,
  qualeIn: (p) => `Quale di questi fiumi scorre ${inPaese(p.id, p.n)}?`,
  opzione: (c) => maiuscola(c.n),
  tipi: ['stato-del-fiume', 'fiume-in-stato'],
  quanti: [150, 260],
})

const laghi = perCorsi('laghi', {
  // Un lago di piu' paesi non "si trova" in uno solo: ci si affaccia.
  doveSta: (c, piuPaesi) =>
    piuPaesi
      ? `Quale di questi stati si affaccia ${suLago(c.n)}?`
      : `In quale stato si trova ${lagoNellaFrase(c.n)}?`,
  qualeIn: (p) => `Quale di questi laghi si trova ${inPaese(p.id, p.n)}?`,
  opzione: (c) => lagoInOpzione(c.n),
  tipi: ['stato-del-lago', 'lago-in-stato'],
  quanti: [100, 170],
})

const GENERATORI: Record<CategoriaQuiz, Generatore> = {
  capitali,
  bandiere,
  cartina,
  oceani,
  mari,
  fiumi,
  laghi,
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
  const quante = Math.max(1, Math.min(richiesta.quante, 40))
  const domande = GENERATORI[richiesta.categoria](ix, richiesta.area, quante, caso, evitare)
  const visti = new Set<string>()
  return domande
    .filter((d) => {
      if (visti.has(d.soggetto) || !domandaValida(d)) return false
      visti.add(d.soggetto)
      return true
    })
    .slice(0, quante)
}

/** Le domande della classificata di un giorno: la categoria del giorno, in tutto il mondo. */
export function domandeDelGiorno(
  dati: DatiQuiz | IndiceQuiz,
  categoria: CategoriaQuiz,
  caso: Caso,
  evitare: ReadonlySet<string> = new Set(),
): DomandaCompleta[] {
  return generaDomande(dati, { categoria, area: 'mondo', quante: DOMANDE_PER_PARTITA }, caso, evitare)
}

/**
 * Una domanda si fa solo se e' in ordine: quattro opzioni diverse — di id e di
 * testo — con dentro quella giusta, o un bersaglio sulla cartina.
 */
export function domandaValida(d: DomandaCompleta): boolean {
  if (d.cartina) return d.opzioni.length === 0 && !!d.giusta && (d.accettate ?? []).includes(d.giusta)
  if (d.opzioni.length !== 4) return false
  const id = new Set(d.opzioni.map((o) => o.id))
  const testi = new Set(d.opzioni.map((o) => senzaAccenti(o.testo)))
  return id.size === 4 && testi.size === 4 && id.has(d.giusta)
}

/** La domanda come va a chi gioca: senza la risposta. */
export function senzaRisposta(d: DomandaCompleta): DomandaQuiz {
  return {
    tipo: d.tipo,
    testo: d.testo,
    ...(d.bandiera ? { bandiera: d.bandiera } : {}),
    opzioni: d.opzioni,
    ...(d.cartina ? { cartina: d.cartina } : {}),
  }
}

/** Se una scelta e' giusta: un'opzione, o un posto della cartina fra quelli accettati. */
export function rispostaGiusta(d: DomandaCompleta, scelta: string | null): boolean {
  if (scelta === null) return false
  return d.cartina ? (d.accettate ?? [d.giusta]).includes(scelta) : scelta === d.giusta
}

/**
 * Le domande delle materie che non sono geografia: arte, libri, cinema,
 * canzoni, musica classica, lirica, premi Nobel, storia, scienza e "Accadde
 * oggi".
 *
 * Le regole sono quelle della geografia (shared/quiz-domande.ts): una
 * risposta giusta e qualche sbagliata, **plausibili e sicuramente
 * sbagliate**. Un pittore sbagliato e' dello stesso tempo di quello giusto, un
 * anno sbagliato e' vicino a quello giusto — piu' largo quanto piu' e' lontano
 * da oggi, perché un anno del Duecento non lo sa nessuno al giorno —, una
 * corrente sbagliata e' una che a quel tempo non c'era. Dove il dubbio c'e' —
 * un titolo che hanno cento quadri, un anno a cavallo di due secoli — la
 * domanda non si fa.
 *
 * Ogni domanda porta la sua scheda (`spiegazione`): la mostra, a risposta
 * data, chi ha acceso le spiegazioni, ed e' la parte del quiz che insegna — di
 * chi e' il quadro, di che corrente, dov'e'. Come la risposta, resta sul
 * server fino a quando non si e' risposto.
 *
 * Tutto dipende solo dal generatore di numeri che si passa, come per la
 * geografia: la notte fa le domande della classificata, il browser quelle
 * delle libere.
 */

import {
  DOMANDE_PER_PARTITA,
  QUANTE_MASSIME,
  RISPOSTE_PREDEFINITE,
  ambitoValido,
  diMusica,
  genereValido,
  nazioneValida,
  nelPeriodo,
  type CategoriaQuiz,
} from './quiz'
import {
  CATEGORIE_CULTURA,
  GRUPPI_ANIMALI,
  NOMI_GENERI,
  PREMI_NOBEL,
  VERTEBRATI,
  annoInLettere,
  giornoInLettere,
  numeroSecolo,
  romano,
  type ArtistaQuiz,
  type AstroQuiz,
  type BranoQuiz,
  type CanzoneQuiz,
  type CategoriaCultura,
  type CompostoQuiz,
  type DatiCultura,
  type DatiOggi,
  type ElementoQuiz,
  type EventoQuiz,
  type FattoQuiz,
  type FilmQuiz,
  type GenereCanzone,
  type GruppoAnimale,
  type LibroQuiz,
  type NatoQuiz,
  type NobelQuiz,
  type OperaQuiz,
  type PersonaQuiz,
  type PremioNobel,
  type QuadroQuiz,
  type ScopertaQuiz,
  type SpecieQuiz,
  type UnitaQuiz,
} from './quiz-cultura'
import type { CittaQuiz, DatiQuiz } from './quiz-dati'
import {
  TIPI_SCIENZA,
  assegna,
  distrattori,
  domandaValida,
  generaDomande,
  mescola,
  preferendo,
  rifinisci,
  ripartisci,
  senzaAccenti,
  soggetti,
  tipiPossibili,
  type Caso,
  type DomandaCompleta,
  type IndiceQuiz,
  type Notorieta,
  type OpzioneQuiz,
  type RichiestaQuiz,
  type SezioneQuiz,
  type SpiegazioneQuiz,
  type TipoDomanda,
} from './quiz-domande'
import { diElemento, diNome, genereNome, maiuscola, nomeConArticolo, plurale, testaDelNome } from './quiz-lingua'

export function eCultura(categoria: CategoriaQuiz): categoria is CategoriaCultura {
  return (CATEGORIE_CULTURA as readonly string[]).includes(categoria)
}

/* ─────────────────────────────  Il contesto  ──────────────────────────── */

interface Contesto {
  caso: Caso
  quante: number
  /** Quante risposte sbagliate per domanda. */
  sbagliate: number
  tipi: ReadonlySet<TipoDomanda> | null
  notorieta: Notorieta
  ambito: string
  /** Il genere, per le canzoni: "tutti" se non si e' scelto. */
  genere: string
  /** Per la musica, il paese di chi canta o compone: null per tutti. */
  nazione: string | null
  evitare: ReadonlySet<string>
  /** Quante volte ogni voce ha gia' fatto da risposta sbagliata in questa partita. */
  usati: Map<string, number>
  /** Quante volte ogni persona e' gia' stata la risposta giusta: Van Gogh non tre volte su dieci. */
  giuste: Map<string, number>
  /** L'anno della partita: gli anni sbagliati non vanno oltre. */
  annoMassimo: number
}

/** Quante volte, al massimo, la stessa persona e' la risposta giusta in una partita. */
const STESSA_RISPOSTA = 2

function ancoraGiusta(c: Contesto, id: string): boolean {
  return (c.giuste.get(id) ?? 0) < STESSA_RISPOSTA
}

function segnaGiusta(c: Contesto, id: string): void {
  c.giuste.set(id, (c.giuste.get(id) ?? 0) + 1)
}

/**
 * I tipi di domanda piu' difficili di ogni categoria: il secolo e la corrente
 * di un quadro, l'anno di un film o di un fatto, la città di una prima. Il
 * livello facile ne fa pochi e il difficile di piu': i livelli si distinguono
 * anche per quel che chiedono, oltre che per i soggetti.
 */
const DIFFICILI: ReadonlySet<TipoDomanda> = new Set<TipoDomanda>([
  'corrente-quadro',
  'secolo-quadro',
  'secolo-libro',
  'anno-film',
  'citta-opera',
  'secolo-brano',
  'paese-interprete',
  'anno-evento',
  'prima-evento',
  'formula-composto',
  'nome-unita',
])

/** Quanto pesano i tipi difficili, per difficoltà. */
const PESO_DIFFICILI: Record<Notorieta, number> = { noti: 0.3, misti: 1, rari: 1.6 }

/** Le quote dei tipi di domanda per la difficoltà della partita. */
function perDifficolta(
  quote: ReadonlyArray<readonly [TipoDomanda, number]>,
  notorieta: Notorieta,
): Array<readonly [TipoDomanda, number]> {
  return quote.map(([t, q]) => [t, DIFFICILI.has(t) ? q * PESO_DIFFICILI[notorieta] : q] as const)
}

type Fai<T> = (tipo: TipoDomanda, soggetto: T) => DomandaCompleta | null

/**
 * Le domande di una partita: i soggetti con i loro tipi, e se un soggetto non
 * da' la domanda del suo tipo — un quadro senza corrente, un libro senza anno —
 * prova gli altri tipi della categoria, poi passa a un soggetto di riserva.
 */
function componi<T extends { f: number }>(
  candidati: readonly T[],
  quote: ReadonlyArray<readonly [TipoDomanda, number]>,
  c: Contesto,
  fai: Fai<T>,
): DomandaCompleta[] {
  const scelti = soggetti(candidati, c.quante, c.caso, c.notorieta)
  const presi = new Set(scelti)
  const pesate = perDifficolta(quote, c.notorieta)
  // Le riserve dagli stessi gruppi della difficoltà: dalle piu' note, una partita difficile tornerebbe facile.
  const resto = candidati.filter((t) => !presi.has(t))
  const riserva = soggetti(resto, Math.min(resto.length, c.quante * 3), c.caso, c.notorieta)
  const ammessi = quote.map(([t]) => t).filter((t) => !c.tipi || c.tipi.has(t))
  const tipi = ammessi.length > 0 ? ammessi : quote.map(([t]) => t)
  // Una domanda che la pulizia finale scarterebbe (due risposte con lo stesso testo) non conta: se no la partita
  // resterebbe con una domanda in meno.
  const buona = (d: DomandaCompleta | null) => (d && domandaValida(d, c.sbagliate + 1) ? d : null)
  const prova = (tipo: TipoDomanda, s: T): DomandaCompleta | null => {
    const prima = buona(fai(tipo, s))
    if (prima) return prima
    for (const altro of tipi) {
      if (altro === tipo) continue
      const d = buona(fai(altro, s))
      if (d) return d
    }
    return null
  }
  const domande: DomandaCompleta[] = []
  for (const { s, tipo } of assegna(scelti, pesate, c)) {
    const d = prova(tipo, s)
    if (d) domande.push(d)
  }
  for (const s of riserva) {
    if (domande.length >= c.quante) break
    const d = prova(tipi[Math.floor(c.caso() * tipi.length)], s)
    if (d) domande.push(d)
  }
  // Un filtro stretto — l'Ottocento della classica, con pochi compositori che possono essere la risposta due volte
  // sole — puo' finire le riserve: allora tutti gli altri, dai piu' noti.
  if (domande.length < c.quante) {
    const provati = new Set([...presi, ...riserva])
    for (const s of [...candidati].filter((t) => !provati.has(t)).sort((a, b) => b.f - a.f)) {
      if (domande.length >= c.quante) break
      const d = prova(tipi[Math.floor(c.caso() * tipi.length)], s)
      if (d) domande.push(d)
    }
  }
  return domande
}

/* ─────────────────────────────  Le risposte  ──────────────────────────── */

function opzione(id: string, testo: string, extra: Partial<OpzioneQuiz> = {}): OpzioneQuiz {
  return { id, testo, ...extra }
}

function conGiusta(c: Contesto, giusta: OpzioneQuiz, sbagliate: OpzioneQuiz[]): OpzioneQuiz[] | null {
  if (sbagliate.length < c.sbagliate) return null
  return mescola([giusta, ...sbagliate.slice(0, c.sbagliate)], c.caso)
}

/** Il numero delle notorietà: due voci con notorietà vicine si somigliano. */
function scarto(a: { f: number }, b: { f: number }): number {
  return Math.abs(a.f - b.f)
}

/** L'anno di mezzo di una vita, per dire se due persone sono dello stesso tempo. */
function epoca(p: PersonaQuiz): number | null {
  if (p.na !== undefined && p.mo !== undefined) return (p.na + p.mo) / 2
  if (p.na !== undefined) return p.na + 35
  if (p.mo !== undefined) return p.mo - 35
  return null
}

/** Quanto due persone si somigliano come risposte: lo stesso tempo, la stessa notorietà, lo stesso paese. */
function vicinanzaPersone(a: PersonaQuiz, b: PersonaQuiz): number {
  const ea = epoca(a)
  const eb = epoca(b)
  const tempo = ea === null || eb === null ? 1 : Math.min(3, Math.abs(ea - eb) / 60)
  const stessaCorrente = a.c?.some((x) => b.c?.includes(x)) ? -0.4 : 0
  return tempo + scarto(a, b) + (a.it === b.it ? 0 : 0.3) + stessaCorrente
}

/**
 * Una finestra di valori consecutivi che contiene quello giusto in un punto
 * qualunque: gli altri sono le risposte sbagliate. Con i vicini scelti a caso
 * attorno alla risposta, la giusta sarebbe quasi sempre quella in mezzo, e si
 * indovinerebbe senza sapere; con la finestra sta in mezzo, in cima o in fondo
 * con la stessa probabilità. `buono` scarta i valori che non esistono (l'anno
 * zero, gli anni futuri).
 */
function finestra(posto: number, quanti: number, caso: Caso, buono: (p: number) => boolean): number[] {
  const inizio = posto - Math.floor(caso() * (quanti + 1))
  const fuori: number[] = []
  // Si prendono i posti della finestra, e se qualcuno non va si allarga dalla parte che va.
  for (let k = 0; fuori.length < quanti && k < quanti * 4; k += 1) {
    for (const p of [inizio + k, inizio + quanti - k]) {
      if (fuori.length >= quanti) break
      if (p !== posto && buono(p) && !fuori.includes(p)) fuori.push(p)
    }
  }
  return fuori
}

/**
 * Anni sbagliati vicini a quello giusto. Il passo cresce con la distanza da
 * oggi: fra il 1969 e il 1971 si sceglie sapendo, fra il 1215 e il 1217 si tira
 * a indovinare. Gli anni sono multipli del passo dalla risposta, cosi' la
 * giusta non si riconosce dalle cifre.
 */
function anniVicini(
  anno: number,
  quanti: number,
  c: Pick<Contesto, 'caso' | 'annoMassimo'> & Partial<Pick<Contesto, 'notorieta'>>,
  escludi: ReadonlySet<number> = new Set(),
  minimo = -5000,
): number[] {
  const distanza = Math.max(1, c.annoMassimo - anno)
  const passi: Array<[number, number]> = [
    [2000, 100],
    [1000, 50],
    [500, 20],
    [200, 10],
    [80, 5],
    [25, 3],
  ]
  // Al livello facile gli anni sono il doppio piu' lontani: si sceglie sapendo l'epoca, non l'anno.
  const passo = (passi.find(([oltre]) => distanza > oltre)?.[1] ?? 1) * (c.notorieta === 'noti' ? 2 : 1)
  const valore = (k: number) => anno + k * passo
  return finestra(0, quanti, c.caso, (k) => {
    const a = valore(k)
    return a !== 0 && a <= c.annoMassimo && a >= minimo && !escludi.has(a)
  }).map(valore)
}

function opzioniAnni(c: Contesto, anno: number, escludi?: ReadonlySet<number>, minimo?: number): OpzioneQuiz[] | null {
  const sbagliati = anniVicini(anno, c.sbagliate, c, escludi, minimo)
  return conGiusta(
    c,
    opzione(`anno:${anno}`, annoInLettere(anno)),
    sbagliati.map((a) => opzione(`anno:${a}`, annoInLettere(a))),
  )
}

/** Il nome di un secolo dal suo numero: 15 → "XV secolo", -5 → "V secolo a.C.". */
function nomeSecolo(n: number): string {
  return n > 0 ? `${romano(n)} secolo` : `${romano(-n)} secolo a.C.`
}

/** Se un anno sta a pochi anni dal cambio di secolo: il secolo di una data "circa" non e' sicuro. */
function aCavalloDelSecolo(anno: number): boolean {
  const resto = ((Math.abs(anno) % 100) + 100) % 100
  return resto <= 2 || resto >= 98
}

function opzioniSecoli(c: Contesto, anno: number): OpzioneQuiz[] | null {
  const giusto = numeroSecolo(anno)
  // Sulla linea dei secoli il primo avanti Cristo sta subito prima del primo dopo: niente secolo zero.
  const posto = giusto > 0 ? giusto : giusto + 1
  const daPosto = (p: number) => (p > 0 ? p : p - 1)
  const oggi = numeroSecolo(c.annoMassimo)
  const vicini = finestra(posto, c.sbagliate, c.caso, (p) => daPosto(p) <= oggi && daPosto(p) >= -40).map(daPosto)
  return conGiusta(
    c,
    opzione(`sec:${giusto}`, nomeSecolo(giusto)),
    vicini.map((n) => opzione(`sec:${n}`, nomeSecolo(n))),
  )
}

/* ─────────────────────────────  Le schede  ──────────────────────────── */

/** Gli anni di una vita: "1452–1519", "384–322 a.C.", "n. 1942". */
function vita(p: PersonaQuiz): string | null {
  if (p.na !== undefined && p.mo !== undefined) {
    if (p.na < 0 && p.mo < 0) return `${-p.na}–${-p.mo} a.C.`
    return `${annoInLettere(p.na)}–${annoInLettere(p.mo)}`
  }
  if (p.na !== undefined) return `n. ${annoInLettere(p.na)}`
  if (p.mo !== undefined) return `m. ${annoInLettere(p.mo)}`
  return null
}

/** Una persona in una riga della scheda: "Leonardo da Vinci (1452–1519), Italia". */
function inRiga(p: PersonaQuiz): string {
  const anni = vita(p)
  return `${p.n}${anni ? ` (${anni})` : ''}${p.p ? `, ${p.p}` : ''}`
}

function righe(...voci: Array<[string, string | null | undefined] | null>): Array<[string, string]> {
  // Con la maiuscola ("Santuario di Santa Lucia"), tranne "n. 1947" e "m. 1528", che sono abbreviazioni.
  return voci
    .filter((v): v is [string, string] => !!v && !!v[1])
    .map(([k, v]) => [k, /^[nm]\. /.test(v) ? v : maiuscola(v)])
}

function scheda(s: SpiegazioneQuiz): SpiegazioneQuiz {
  return Object.fromEntries(
    Object.entries(s).filter(([, v]) => v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0)),
  ) as unknown as SpiegazioneQuiz
}

function elenco(nomi: readonly string[]): string {
  if (nomi.length <= 1) return nomi[0] ?? ''
  return `${nomi.slice(0, -1).join(', ')} e ${nomi[nomi.length - 1]}`
}

/** "Leonardo da Vinci, 1503": chi e quando, se si sa. */
function conAnno(chi: string, anno: number | undefined): string {
  return [chi, anno !== undefined ? annoInLettere(anno) : null].filter(Boolean).join(', ')
}

/** Il titolo di un'opera in una frase: fra le caporali. */
const titolo = (n: string) => `«${n}»`

/** Se due titoli dicono la stessa cosa, anche con maiuscole e accenti diversi. */
const stessoTesto = (a: string, b: string) => senzaAccenti(a) === senzaAccenti(b)

/**
 * I titoli che hanno piu' opere: "Autoritratto", "Ritratto di donna",
 * "Madonna col Bambino". Chiesti per titolo sarebbero ambigui.
 */
function titoliDoppi(titoli: readonly string[]): Set<string> {
  const conti = new Map<string, number>()
  for (const t of titoli) conti.set(senzaAccenti(t), (conti.get(senzaAccenti(t)) ?? 0) + 1)
  return new Set([...conti].filter(([, n]) => n > 1).map(([t]) => t))
}

/** Il piu' noto di una lista di persone: la risposta giusta, quando gli autori sono due. */
function piuNota(persone: readonly PersonaQuiz[]): PersonaQuiz {
  return [...persone].sort((a, b) => b.f - a.f)[0]
}

/**
 * Le scuole non sono correnti: un quadro fiorentino del Rinascimento e' della
 * scuola fiorentina e del Rinascimento insieme, e fra le due non si sceglie.
 */
const unaScuola = (v: { n: string }) => /\bscuola\b/i.test(v.n)

/**
 * Se il titolo dice l'autore: il «Vangelo secondo Matteo», il «Diario di Anna
 * Frank». Chiedere chi l'ha scritto, o quale ha scritto lui, sarebbe regalato.
 */
function ilTitoloDice(titolo: string, autori: readonly PersonaQuiz[]): boolean {
  const nel = new Set(senzaAccenti(titolo).split(/[^a-z0-9]+/))
  return autori.some((p) =>
    senzaAccenti(p.n)
      .split(/[^a-z0-9]+/)
      .some((w) => w.length >= 4 && nel.has(w)),
  )
}

/* ─────────────────────────────────  Arte  ─────────────────────────────── */

const QUOTE_ARTE = [
  ['autore-quadro', 40],
  ['titolo-quadro', 20],
  ['quadro-di', 15],
  ['corrente-quadro', 15],
  ['secolo-quadro', 10],
] as const

function nellAmbitoArte(q: QuadroQuiz, ambito: string, pittori: Map<string, PersonaQuiz>): boolean {
  const anno = q.anno
  switch (ambito) {
    case 'italiani':
      return q.a.some((id) => pittori.get(id)?.it === 1)
    case 'antichi':
      return anno !== undefined && anno < 1600
    case 'barocchi':
      return anno !== undefined && anno >= 1600 && anno < 1800
    case 'ottocento':
      return anno !== undefined && anno >= 1800 && anno < 1900
    case 'novecento':
      return anno !== undefined && anno >= 1900
    default:
      return true
  }
}

function arte(dati: DatiCultura['arte'], c: Contesto): DomandaCompleta[] {
  const pittori = new Map(dati.pittori.map((p) => [p.id, p]))
  const correnti = new Map(dati.correnti.map((v) => [v.id, v]))
  const quadri = dati.quadri
    .filter((q) => q.a.length > 0 && q.a.every((id) => pittori.has(id)))
    .map((q) => ({ ...q, n: maiuscola(q.n) }))
  const doppi = titoliDoppi(quadri.map((q) => q.n))
  // Quando c'era ogni corrente, dai quadri che la portano: una corrente sbagliata e' una che a quel tempo non c'era.
  const anniCorrente = new Map<string, [number, number]>()
  for (const q of quadri) {
    if (q.anno === undefined) continue
    for (const id of q.c ?? []) {
      const [da, a] = anniCorrente.get(id) ?? [q.anno, q.anno]
      anniCorrente.set(id, [Math.min(da, q.anno), Math.max(a, q.anno)])
    }
  }

  const schedaQuadro = (q: QuadroQuiz): SpiegazioneQuiz => {
    const autori = q.a.map((id) => pittori.get(id)!)
    const suoi = (q.c ?? []).map((id) => correnti.get(id)).filter((v) => !!v)
    return scheda({
      titolo: q.n,
      sotto: conAnno(elenco(autori.map((p) => p.n)), q.anno),
      righe: righe(
        [autori.length > 1 ? 'Pittori' : 'Pittore', autori.map(inRiga).join('; ')],
        ['Corrente', suoi.map((v) => v.n).join(', ')],
        ['Tecnica', q.t],
        ['Dove si trova', [q.m, q.l].filter(Boolean).join(', ')],
      ),
      testo: suoi.find((v) => v.d)?.d,
      voce: q.w,
      immagine: q.img,
    })
  }

  const fai: Fai<QuadroQuiz> = (tipo, q) => {
    const autori = q.a.map((id) => pittori.get(id)!)
    const autore = piuNota(autori)
    const altriPittori = dati.pittori.filter((p) => !q.a.includes(p.id))
    switch (tipo) {
      case 'autore-quadro': {
        if (!ancoraGiusta(c, autore.id)) return null
        const sbagliati = distrattori(c, altriPittori, c.sbagliate, (p) => vicinanzaPersone(autore, p))
        const opzioni = conGiusta(
          c,
          opzione(autore.id, autore.n),
          sbagliati.map((p) => opzione(p.id, p.n)),
        )
        if (!opzioni) return null
        segnaGiusta(c, autore.id)
        return {
          tipo,
          testo: 'Chi ha dipinto questo quadro?',
          immagine: q.img,
          opzioni,
          giusta: autore.id,
          risposta: autore.n,
          soggetto: q.id,
          spiegazione: schedaQuadro(q),
        }
      }
      case 'titolo-quadro': {
        if (doppi.has(senzaAccenti(q.n))) return null
        const altri = quadri.filter((x) => x.id !== q.id && !doppi.has(senzaAccenti(x.n)) && !stessoTesto(x.n, q.n))
        const sbagliati = distrattori(c, altri, c.sbagliate, (x) => {
          const stesso = x.a.some((id) => q.a.includes(id)) ? -0.6 : 0
          const tempo = x.anno !== undefined && q.anno !== undefined ? Math.min(2, Math.abs(x.anno - q.anno) / 80) : 1
          return stesso + tempo + scarto(x, q)
        })
        const opzioni = conGiusta(
          c,
          opzione(q.id, q.n),
          sbagliati.map((x) => opzione(x.id, x.n)),
        )
        if (!opzioni) return null
        return {
          tipo,
          testo: 'Come si intitola questo quadro?',
          immagine: q.img,
          opzioni,
          giusta: q.id,
          risposta: q.n,
          soggetto: q.id,
          spiegazione: schedaQuadro(q),
        }
      }
      case 'quadro-di': {
        if (!ancoraGiusta(c, autore.id) || doppi.has(senzaAccenti(q.n))) return null
        const altri = quadri.filter(
          (x) => !x.a.some((id) => q.a.includes(id)) && !doppi.has(senzaAccenti(x.n)) && !stessoTesto(x.n, q.n),
        )
        // Quattro quadri al massimo: sei, su un telefono, sarebbero francobolli.
        const fra = { ...c, sbagliate: Math.min(c.sbagliate, 3) }
        const sbagliati = distrattori(fra, altri, fra.sbagliate, (x) => {
          const tempo = x.anno !== undefined && q.anno !== undefined ? Math.min(2, Math.abs(x.anno - q.anno) / 60) : 1
          return tempo + scarto(x, q)
        })
        const opzioni = conGiusta(
          fra,
          opzione(q.id, q.n, { immagine: q.img }),
          sbagliati.map((x) => opzione(x.id, x.n, { immagine: x.img })),
        )
        if (!opzioni) return null
        segnaGiusta(c, autore.id)
        return {
          tipo,
          testo: `Quale di questi quadri è di ${autore.n}?`,
          opzioni,
          giusta: q.id,
          risposta: q.n,
          soggetto: q.id,
          spiegazione: schedaQuadro(q),
        }
      }
      case 'corrente-quadro': {
        // Una corrente sola: con due ("Rinascimento", "Alto Rinascimento") la risposta sarebbe da discutere.
        if (q.anno === undefined || q.c?.length !== 1) return null
        const giusta = correnti.get(q.c[0])
        if (!giusta || unaScuola(giusta)) return null
        const parole = new Set(senzaAccenti(giusta.n).split(/\W+/).filter((w) => w.length > 3))
        const altre = dati.correnti.filter((v) => {
          const anni = anniCorrente.get(v.id)
          if (v.id === giusta.id || !anni || stessoTesto(v.n, giusta.n) || unaScuola(v)) return false
          if (senzaAccenti(v.n).split(/\W+/).some((w) => parole.has(w))) return false
          return q.anno! < anni[0] - 25 || q.anno! > anni[1] + 25
        })
        const [da] = anniCorrente.get(giusta.id) ?? [q.anno]
        const sbagliate = distrattori(
          c,
          altre,
          c.sbagliate,
          (v) => Math.abs((anniCorrente.get(v.id)?.[0] ?? da) - da) / 100,
        )
        const opzioni = conGiusta(
          c,
          opzione(giusta.id, maiuscola(giusta.n)),
          sbagliate.map((v) => opzione(v.id, maiuscola(v.n))),
        )
        if (!opzioni) return null
        return {
          tipo,
          testo: 'A quale corrente appartiene questo quadro?',
          immagine: q.img,
          opzioni,
          giusta: giusta.id,
          risposta: maiuscola(giusta.n),
          soggetto: q.id,
          spiegazione: schedaQuadro(q),
        }
      }
      case 'secolo-quadro': {
        if (q.anno === undefined || aCavalloDelSecolo(q.anno)) return null
        const opzioni = opzioniSecoli(c, q.anno)
        if (!opzioni) return null
        return {
          tipo,
          testo: 'In che secolo è stato dipinto questo quadro?',
          immagine: q.img,
          opzioni,
          giusta: `sec:${numeroSecolo(q.anno)}`,
          risposta: nomeSecolo(numeroSecolo(q.anno)),
          soggetto: q.id,
          spiegazione: schedaQuadro(q),
        }
      }
      default:
        return null
    }
  }

  const candidati = preferendo(
    quadri.filter((q) => nellAmbitoArte(q, c.ambito, pittori)),
    (q) => q.id,
    c.evitare,
    c.quante,
  )
  return componi(candidati, QUOTE_ARTE, c, fai)
}

/* ─────────────────────────────  Libri, cinema, lirica  ───────────────────── */

/**
 * Le tre materie delle opere con un autore — chi l'ha scritto, diretto,
 * composto — fatte allo stesso modo: l'opera e i suoi autori, "chi ha fatto
 * questa", "quale di queste ha fatto lui", e una domanda sul tempo o sul posto.
 */
interface Opera {
  id: string
  n: string
  autori: string[]
  /** Chi c'entra senza essere la risposta (chi canta nel ritornello): mai fra le risposte sbagliate. */
  anche?: readonly string[]
  anno?: number
  it?: 1
  w?: string
  f: number
}

interface Descrizione<T extends Opera> {
  persone: readonly PersonaQuiz[]
  opere: readonly T[]
  /** "Chi ha scritto «X»?" */
  chi: (o: T) => string
  /** "Quale di questi libri ha scritto Y?" */
  quale: (p: PersonaQuiz) => string
  scheda: (o: T, autori: PersonaQuiz[]) => SpiegazioneQuiz
  tipoChi: TipoDomanda
  tipoQuale: TipoDomanda
  /** La terza domanda, sul tempo o sul posto: null se per quest'opera non si fa. */
  terza?: { tipo: TipoDomanda; fai: (o: T, autori: PersonaQuiz[]) => DomandaCompleta | null }
  /** Altre domande ancora, come la terza: il paese di chi canta. */
  altre?: ReadonlyArray<{ tipo: TipoDomanda; fai: (o: T, autori: PersonaQuiz[]) => DomandaCompleta | null }>
  /** Quanto due autori si somigliano come risposte: il tempo e il paese, e per le canzoni il genere. */
  vicinanza?: (a: PersonaQuiz, b: PersonaQuiz) => number
  quote: ReadonlyArray<readonly [TipoDomanda, number]>
  nellAmbito: (o: T, persone: Map<string, PersonaQuiz>) => boolean
  /** Le opere di cui chi le ha fatte non lo sa nessuno: di loro si chiede solo la terza domanda. */
  senzaAutore?: (o: T) => boolean
}

/**
 * Quanto dev'essere noto chi si nomina in "quale di queste ha fatto lui", per
 * difficoltà: la fascia della persona fra quelle del file. "Quale di queste
 * canzoni è di Sergio Ortega?" non la sa nemmeno chi conosce «El pueblo
 * unido»: la canzone e' nota, chi l'ha scritta no.
 */
const NOTA_PER_NOME: Record<Notorieta, number> = { noti: 0.5, misti: 0.3, rari: 0.1 }

function opereConAutore<T extends Opera>(d: Descrizione<T>, c: Contesto): DomandaCompleta[] {
  const persone = new Map(d.persone.map((p) => [p.id, p]))
  const opere = d.opere.filter((o) => o.autori.length > 0 && o.autori.every((id) => persone.has(id)))
  const doppi = titoliDoppi(opere.map((o) => o.n))

  const fai: Fai<T> = (tipo, o) => {
    const autori = o.autori.map((id) => persone.get(id)!)
    const autore = piuNota(autori)
    if ((tipo === d.tipoChi || tipo === d.tipoQuale) && (ilTitoloDice(o.n, autori) || d.senzaAutore?.(o))) return null
    if (tipo === d.tipoChi) {
      if (!ancoraGiusta(c, autore.id)) return null
      const altri = d.persone.filter((p) => !o.autori.includes(p.id) && !o.anche?.includes(p.id))
      const vicini = d.vicinanza ?? vicinanzaPersone
      const sbagliati = distrattori(c, altri, c.sbagliate, (p) => vicini(autore, p))
      const opzioni = conGiusta(
        c,
        opzione(autore.id, autore.n),
        sbagliati.map((p) => opzione(p.id, p.n)),
      )
      if (!opzioni) return null
      segnaGiusta(c, autore.id)
      return {
        tipo,
        testo: d.chi(o),
        opzioni,
        giusta: autore.id,
        risposta: autore.n,
        soggetto: o.id,
        spiegazione: d.scheda(o, autori),
      }
    }
    if (tipo === d.tipoQuale) {
      if (!ancoraGiusta(c, autore.id) || doppi.has(senzaAccenti(o.n))) return null
      if (autore.f < NOTA_PER_NOME[c.notorieta]) return null
      const altre = opere.filter(
        (x) =>
          ![...x.autori, ...(x.anche ?? [])].some((id) => o.autori.includes(id)) &&
          !doppi.has(senzaAccenti(x.n)) &&
          !stessoTesto(x.n, o.n),
      )
      const sbagliate = distrattori(c, altre, c.sbagliate, (x) => {
        const tempo = x.anno !== undefined && o.anno !== undefined ? Math.min(2, Math.abs(x.anno - o.anno) / 40) : 1
        return tempo + scarto(x, o) + (x.it === o.it ? 0 : 0.3)
      })
      const opzioni = conGiusta(
        c,
        opzione(o.id, o.n),
        sbagliate.map((x) => opzione(x.id, x.n)),
      )
      if (!opzioni) return null
      segnaGiusta(c, autore.id)
      return {
        tipo,
        testo: d.quale(autore),
        opzioni,
        giusta: o.id,
        risposta: o.n,
        soggetto: o.id,
        spiegazione: d.scheda(o, autori),
      }
    }
    if (d.terza && tipo === d.terza.tipo) return d.terza.fai(o, autori)
    const altra = d.altre?.find((x) => x.tipo === tipo)
    return altra ? altra.fai(o, autori) : null
  }

  const candidati = preferendo(
    opere.filter((o) => d.nellAmbito(o, persone)),
    (o) => o.id,
    c.evitare,
    c.quante,
  )
  return componi(candidati, d.quote, c, fai)
}

function nellAmbitoItaliano(o: Opera, ambito: string): boolean {
  if (ambito === 'italiani') return o.it === 1
  if (ambito === 'stranieri') return o.it !== 1
  return true
}

function libri(dati: DatiCultura['libri'], c: Contesto): DomandaCompleta[] {
  const opere = dati.libri.map((l) => ({ ...l, n: maiuscola(l.n), autori: l.a }))
  const schedaLibro = (l: LibroQuiz, autori: PersonaQuiz[]): SpiegazioneQuiz =>
    scheda({
      titolo: l.n,
      sotto: conAnno(elenco(autori.map((p) => p.n)), l.anno),
      righe: righe(
        [autori.length > 1 ? 'Autori' : 'Autore', autori.map(inRiga).join('; ')],
        ['Anno', l.anno !== undefined ? annoInLettere(l.anno) : null],
        ['Lingua originale', l.lingua],
      ),
      testo: autori.length === 1 && autori[0].d ? maiuscola(`${autori[0].n}: ${autori[0].d}.`) : undefined,
      voce: l.w,
    })
  return opereConAutore<LibroQuiz & Opera>(
    {
      persone: dati.autori,
      opere,
      chi: (l) => `Chi ha scritto ${titolo(l.n)}?`,
      quale: (p) => `Quale di questi libri ha scritto ${p.n}?`,
      scheda: schedaLibro,
      tipoChi: 'autore-libro',
      tipoQuale: 'libro-di',
      terza: {
        tipo: 'secolo-libro',
        fai: (l, autori) => {
          if (l.anno === undefined || aCavalloDelSecolo(l.anno)) return null
          const opzioni = opzioniSecoli(c, l.anno)
          if (!opzioni) return null
          return {
            tipo: 'secolo-libro',
            testo: `In che secolo è stato scritto ${titolo(l.n)}?`,
            opzioni,
            giusta: `sec:${numeroSecolo(l.anno)}`,
            risposta: nomeSecolo(numeroSecolo(l.anno)),
            soggetto: l.id,
            spiegazione: schedaLibro(l, autori),
          }
        },
      },
      quote: [
        ['autore-libro', 50],
        ['libro-di', 30],
        ['secolo-libro', 20],
      ],
      nellAmbito: (l) => nellAmbitoItaliano(l, c.ambito),
    },
    c,
  )
}

function cinema(dati: DatiCultura['cinema'], c: Contesto): DomandaCompleta[] {
  const opere = dati.film.map((f) => ({ ...f, n: maiuscola(f.n), autori: f.r }))
  const schedaFilm = (f: FilmQuiz, registi: PersonaQuiz[]): SpiegazioneQuiz =>
    scheda({
      titolo: f.n,
      sotto: [elenco(registi.map((p) => p.n)), f.anno !== undefined ? String(f.anno) : null].filter(Boolean).join(', '),
      righe: righe(
        ['Regia', registi.map(inRiga).join('; ')],
        ['Anno', f.anno !== undefined ? String(f.anno) : null],
        ['Paese', f.p],
        ['Interpreti', f.cast?.length ? elenco(f.cast) : null],
        ['Premi', f.oscar ? 'Oscar al miglior film' : null],
      ),
      voce: f.w,
    })
  return opereConAutore<FilmQuiz & Opera>(
    {
      persone: dati.registi,
      opere,
      chi: (f) => `Chi ha diretto ${titolo(f.n)}?`,
      quale: (p) => `Quale di questi film ha diretto ${p.n}?`,
      scheda: schedaFilm,
      tipoChi: 'regista-film',
      tipoQuale: 'film-di',
      // Chi ha diretto un cartone animato non lo sa quasi nessuno: di quelli si chiede l'anno.
      senzaAutore: (f) => /animazion/i.test(f.g ?? ''),
      terza: {
        tipo: 'anno-film',
        fai: (f, registi) => {
          if (f.anno === undefined) return null
          const opzioni = opzioniAnni(c, f.anno, undefined, 1888)
          if (!opzioni) return null
          return {
            tipo: 'anno-film',
            testo: `In che anno è uscito ${titolo(f.n)}?`,
            opzioni,
            giusta: `anno:${f.anno}`,
            risposta: String(f.anno),
            soggetto: f.id,
            spiegazione: schedaFilm(f, registi),
          }
        },
      },
      quote: [
        ['regista-film', 45],
        ['film-di', 30],
        ['anno-film', 25],
      ],
      nellAmbito: (f) => {
        if (c.ambito === 'classici') return f.anno !== undefined && f.anno < 1980
        if (c.ambito === 'recenti') return f.anno !== undefined && f.anno >= 1980
        return nellAmbitoItaliano(f, c.ambito)
      },
    },
    c,
  )
}

/* ───────────────────────────────  Canzoni  ─────────────────────────────── */

/** Gli articoli con cui comincia il nome di un gruppo italiano, e la preposizione articolata che fanno con "di". */
const ARTICOLI_DI: ReadonlyArray<readonly [RegExp, string]> = [
  [/^Il /, 'del '],
  [/^Lo /, 'dello '],
  [/^La /, 'della '],
  [/^L[’'](?=\S)/, 'dell’'],
  [/^I /, 'dei '],
  [/^Gli /, 'degli '],
  [/^Le /, 'delle '],
]

/**
 * Un gruppo come lo si dice in una frase: "i Queen", "gli U2", "i Beatles"
 * (senza il "The" del nome), "le Spice Girls", "il Volo". `di` da' la
 * preposizione: "dei Queen", "degli ABBA", "del Volo". Una persona resta il
 * suo nome: "di Vasco Rossi".
 */
export function artistaInFrase(a: Pick<ArtistaQuiz, 'n' | 'gr'>, di = false): string {
  if (!a.gr) return di ? `di ${a.n}` : a.n
  for (const [articolo, preposizione] of ARTICOLI_DI) {
    if (articolo.test(a.n)) return di ? a.n.replace(articolo, preposizione) : a.n
  }
  const nome = a.n.replace(/^The /, '')
  const femminile = /\b(?:Girls|Sisters)$/.test(nome)
  const gli = /^(?:[AEIOUaeiouÀ-ÖØ-öø-ÿ]|[Ss][^aeiou]|[Zz]|[Xx]|[Yy]|[Gg]n|[Pp]s|W)/.test(nome)
  const articolo = femminile ? 'le' : gli ? 'gli' : 'i'
  return di ? `${{ le: 'delle', gli: 'degli', i: 'dei' }[articolo]} ${nome}` : `${articolo} ${nome}`
}

/** Il nome di un decennio: "anni Settanta", "anni Duemila", "anni 2010". */
export function nomeDecennio(decennio: number): string {
  const nomi: Record<number, string> = {
    1920: 'Anni Venti',
    1930: 'Anni Trenta',
    1940: 'Anni Quaranta',
    1950: 'Anni Cinquanta',
    1960: 'Anni Sessanta',
    1970: 'Anni Settanta',
    1980: 'Anni Ottanta',
    1990: 'Anni Novanta',
    2000: 'Anni Duemila',
  }
  return nomi[decennio] ?? `Anni ${decennio}`
}

const decennioDi = (anno: number) => Math.floor(anno / 10) * 10

/** Se una canzone sta negli anni, nel genere e nel paese scelti: il paese di uno di chi la canta. */
function nellAmbitoCanzoni(x: CanzoneQuiz, c: Contesto, artisti: Map<string, ArtistaQuiz>): boolean {
  if (!nelPeriodo(x.anno, c.ambito)) return false
  if (c.genere !== 'tutti' && !(x.g ?? []).includes(c.genere as GenereCanzone)) return false
  return c.nazione === null || x.a.some((id) => artisti.get(id)?.p === c.nazione)
}

/**
 * L'anno di un brano o di un'opera, per i periodi: il suo, o quello in cui il
 * compositore aveva trentacinque anni, se era ancora vivo. Una stima, ma
 * Vivaldi resta nel Settecento e Puccini nel Novecento.
 */
function annoComposto(x: { anno?: number; c: readonly string[] }, compositori: ReadonlyMap<string, PersonaQuiz>) {
  if (x.anno !== undefined) return x.anno
  const primo = compositori.get(x.c[0])
  return primo?.na !== undefined ? Math.min(primo.na + 35, primo.mo ?? Infinity) : undefined
}

/** Se un brano o un'opera sta negli anni e nel paese scelti: il paese di uno dei compositori. */
function nellAmbitoComposto(
  x: { anno?: number; c: readonly string[] },
  c: Contesto,
  compositori: ReadonlyMap<string, PersonaQuiz>,
): boolean {
  if (!nelPeriodo(annoComposto(x, compositori), c.ambito)) return false
  return c.nazione === null || x.c.some((id) => compositori.get(id)?.p === c.nazione)
}

/** Un soggetto della musica come lo contano i filtri: l'anno, e i paesi di chi canta o compone. */
export interface SoggettoMusica {
  id: string
  anno?: number
  nazioni: readonly string[]
}

/**
 * I soggetti delle sezioni della musica scelte, una volta sola anche se una
 * canzone sta in due generi: la pagina della libera ci conta quanti ne restano
 * per ogni periodo e ogni paese, con gli stessi conti delle domande, e offre
 * solo quel che basta a una partita.
 */
export function soggettiDellaMusica(
  cultura: Partial<Pick<DatiCultura, 'canzoni' | 'classica' | 'lirica'>>,
  sezioni: readonly SezioneQuiz[],
): SoggettoMusica[] {
  const fuori = new Map<string, SoggettoMusica>()
  for (const s of sezioni) {
    if (s.categoria === 'canzoni' && cultura.canzoni) {
      const artisti = new Map(cultura.canzoni.artisti.map((a) => [a.id, a]))
      for (const x of cultura.canzoni.canzoni) {
        if (s.genere && s.genere !== 'tutti' && !(x.g ?? []).includes(s.genere as GenereCanzone)) continue
        const nazioni = x.a.map((id) => artisti.get(id)?.p).filter((p): p is string => !!p)
        fuori.set(x.id, { id: x.id, ...(x.anno !== undefined ? { anno: x.anno } : {}), nazioni })
      }
    }
    const composti = s.categoria === 'classica' ? cultura.classica : s.categoria === 'lirica' ? cultura.lirica : null
    if (!composti) continue
    const compositori = new Map(composti.compositori.map((p) => [p.id, p]))
    const elenco: ReadonlyArray<{ id: string; anno?: number; c: readonly string[] }> =
      'brani' in composti ? composti.brani : composti.opere
    for (const x of elenco) {
      const anno = annoComposto(x, compositori)
      const nazioni = x.c.map((id) => compositori.get(id)?.p).filter((p): p is string => !!p)
      fuori.set(x.id, { id: x.id, ...(anno !== undefined ? { anno } : {}), nazioni })
    }
  }
  return [...fuori.values()]
}

function canzoni(dati: DatiCultura['canzoni'], c: Contesto): DomandaCompleta[] {
  const artisti = new Map(dati.artisti.map((a) => [a.id, a]))
  const italiana = (x: CanzoneQuiz) => x.a.some((id) => artisti.get(id)?.it === 1)
  const opere = dati.canzoni.map((x) => ({
    ...x,
    autori: x.a,
    ...(x.x ? { anche: x.x } : {}),
    ...(italiana(x) ? { it: 1 as const } : {}),
  }))
  // Il tempo e i generi di chi canta, dalle sue canzoni: un gruppo non ha un anno di nascita da confrontare.
  const anniDi = new Map<string, number[]>()
  const generiDi = new Map<string, Set<GenereCanzone>>()
  for (const x of dati.canzoni) {
    for (const id of x.a) {
      if (x.anno !== undefined) anniDi.set(id, [...(anniDi.get(id) ?? []), x.anno])
      const g = generiDi.get(id) ?? new Set<GenereCanzone>()
      for (const y of x.g ?? []) g.add(y)
      generiDi.set(id, g)
    }
  }
  const epocaDi = (id: string) => {
    const anni = anniDi.get(id)
    return anni?.length ? anni.reduce((a, b) => a + b, 0) / anni.length : null
  }
  const vicinanza = (a: PersonaQuiz, b: PersonaQuiz) => {
    const ea = epocaDi(a.id)
    const eb = epocaDi(b.id)
    const tempo = ea === null || eb === null ? 1 : Math.min(2, Math.abs(ea - eb) / 15)
    const ga = generiDi.get(a.id) ?? new Set()
    const genere = [...(generiDi.get(b.id) ?? [])].some((g) => ga.has(g)) ? 0 : 0.6
    return tempo + genere + scarto(a, b) + (a.it === b.it ? 0 : 0.8)
  }
  const inRigaArtista = (a: ArtistaQuiz) => (a.gr ? `${a.n}${a.p ? `, ${a.p}` : ''}` : inRiga(a))
  const schedaCanzone = (x: CanzoneQuiz, chi: PersonaQuiz[]): SpiegazioneQuiz =>
    scheda({
      titolo: x.n,
      sotto: conAnno(elenco(chi.map((p) => p.n)), x.anno),
      righe: righe(
        [chi.length > 1 ? 'Interpreti' : 'Interprete', chi.map((p) => inRigaArtista(p as ArtistaQuiz)).join('; ')],
        ['Anno', x.anno !== undefined ? annoInLettere(x.anno) : null],
        ['Genere', x.g?.length ? x.g.map((g) => NOMI_GENERI[g]).join(', ') : null],
      ),
      testo: chi.length === 1 && chi[0].d ? maiuscola(`${chi[0].n}: ${chi[0].d}.`) : undefined,
      voce: x.w,
    })
  // I paesi di chi canta, dai piu' frequenti: sono le risposte sbagliate credibili.
  const quantiPerPaese = new Map<string, number>()
  for (const a of dati.artisti) if (a.p) quantiPerPaese.set(a.p, (quantiPerPaese.get(a.p) ?? 0) + 1)
  const chiestiPaese = new Set<string>()
  return opereConAutore<CanzoneQuiz & Opera>(
    {
      persone: dati.artisti,
      opere,
      // Chi la firma non sempre la canta: un brano strumentale, o di un dj con la voce di un altro.
      chi: (x) => (x.dc ? `Di chi è ${titolo(x.n)}?` : `Chi canta ${titolo(x.n)}?`),
      quale: (p) => `Quale di queste canzoni è ${artistaInFrase(p as ArtistaQuiz, true)}?`,
      scheda: schedaCanzone,
      tipoChi: 'interprete-canzone',
      tipoQuale: 'canzone-di',
      vicinanza,
      terza: {
        tipo: 'decennio-canzone',
        fai: (x, chi) => {
          // Negli anni scelti il decennio lo dice gia' la partita.
          if (x.anno === undefined || c.ambito !== 'tutti') return null
          // A cavallo di due decenni l'uscita e il successo possono cadere in due: "1979" non e' una risposta sicura.
          const resto = x.anno % 10
          if (resto === 0 || resto === 9) return null
          const giusto = decennioDi(x.anno)
          const passo = c.notorieta === 'noti' ? 20 : 10
          const ultimo = decennioDi(c.annoMassimo)
          const altri = finestra(0, c.sbagliate, c.caso, (k) => {
            const d = giusto + k * passo
            return d >= 1950 && d <= ultimo
          }).map((k) => giusto + k * passo)
          const opzioni = conGiusta(
            c,
            opzione(`dec:${giusto}`, nomeDecennio(giusto)),
            altri.map((d) => opzione(`dec:${d}`, nomeDecennio(d))),
          )
          if (!opzioni) return null
          const autore = piuNota(chi) as ArtistaQuiz
          return {
            tipo: 'decennio-canzone',
            testo: `In che decennio è uscita ${titolo(x.n)} ${artistaInFrase(autore, true)}?`,
            opzioni,
            giusta: `dec:${giusto}`,
            risposta: nomeDecennio(giusto),
            soggetto: x.id,
            spiegazione: schedaCanzone(x, chi),
          }
        },
      },
      altre: [
        {
          tipo: 'paese-interprete',
          fai: (x, chi) => {
            // Di chi e' italiano lo sa chi gioca: si chiede di chi viene da fuori. Con un paese scelto, lo dice lui.
            const a = chi[0] as ArtistaQuiz
            if (c.nazione !== null || chi.length > 1 || !a.p || a.it) return null
            if (chiestiPaese.has(a.id) || !ancoraGiusta(c, a.id)) return null
            const paesi = [...quantiPerPaese.keys()].filter((p) => p !== a.p)
            const sbagliati = distrattori(
              c,
              paesi.map((p) => ({ id: p })),
              c.sbagliate,
              (p) => 1 / (quantiPerPaese.get(p.id) ?? 1),
            )
            const opzioni = conGiusta(
              c,
              opzione(`paese:${a.p}`, a.p),
              sbagliati.map((p) => opzione(`paese:${p.id}`, p.id)),
            )
            if (!opzioni) return null
            chiestiPaese.add(a.id)
            segnaGiusta(c, a.id)
            return {
              tipo: 'paese-interprete',
              testo: a.gr ? `Da quale paese vengono ${artistaInFrase(a)}?` : `Da quale paese viene ${a.n}?`,
              opzioni,
              giusta: `paese:${a.p}`,
              risposta: a.p,
              soggetto: `ar:${a.id}`,
              spiegazione: schedaCanzone(x, chi),
            }
          },
        },
      ],
      quote: [
        ['interprete-canzone', 45],
        ['canzone-di', 25],
        ['decennio-canzone', 20],
        ['paese-interprete', 10],
      ],
      nellAmbito: (x) => nellAmbitoCanzoni(x, c, artisti),
    },
    c,
  )
}

/* ────────────────────────────  Musica classica  ──────────────────────────── */

function classica(dati: DatiCultura['classica'], c: Contesto): DomandaCompleta[] {
  const compositori = new Map(dati.compositori.map((p) => [p.id, p]))
  const italiano = (b: BranoQuiz) => b.c.some((id) => compositori.get(id)?.it === 1)
  const opere = dati.brani.map((b) => ({
    ...b,
    n: maiuscola(b.n),
    autori: b.c,
    ...(italiano(b) ? { it: 1 as const } : {}),
  }))
  const schedaBrano = (b: BranoQuiz, compositori: PersonaQuiz[]): SpiegazioneQuiz =>
    scheda({
      titolo: maiuscola(b.n),
      sotto: conAnno(elenco(compositori.map((p) => p.n)), b.anno),
      righe: righe(
        [compositori.length > 1 ? 'Compositori' : 'Compositore', compositori.map(inRiga).join('; ')],
        ['Anno', b.anno !== undefined ? annoInLettere(b.anno) : null],
      ),
      testo:
        compositori.length === 1 && compositori[0].d
          ? maiuscola(`${compositori[0].n}: ${compositori[0].d}.`)
          : undefined,
      voce: b.w,
    })
  return opereConAutore<BranoQuiz & Opera>(
    {
      persone: dati.compositori,
      opere,
      chi: (b) => `Chi ha composto ${titolo(b.n)}?`,
      quale: (p) => `Quale di questi brani ha composto ${p.n}?`,
      scheda: schedaBrano,
      tipoChi: 'compositore-brano',
      tipoQuale: 'brano-di',
      terza: {
        tipo: 'secolo-brano',
        fai: (b, compositori) => {
          // Negli anni scelti il secolo lo dice gia' la partita.
          if (b.anno === undefined || aCavalloDelSecolo(b.anno) || c.ambito !== 'tutti') return null
          const opzioni = opzioniSecoli(c, b.anno)
          if (!opzioni) return null
          return {
            tipo: 'secolo-brano',
            testo: `In che secolo è stato composto ${titolo(b.n)}?`,
            opzioni,
            giusta: `sec:${numeroSecolo(b.anno)}`,
            risposta: nomeSecolo(numeroSecolo(b.anno)),
            soggetto: b.id,
            spiegazione: schedaBrano(b, compositori),
          }
        },
      },
      quote: [
        ['compositore-brano', 50],
        ['brano-di', 30],
        ['secolo-brano', 20],
      ],
      nellAmbito: (b, persone) => nellAmbitoComposto(b, c, persone),
    },
    c,
  )
}

function lirica(dati: DatiCultura['lirica'], c: Contesto): DomandaCompleta[] {
  const opere = dati.opere.map((o) => ({ ...o, n: maiuscola(o.n), autori: o.c }))
  const citta = [...new Set(dati.opere.map((o) => o.citta).filter((x): x is string => !!x))]
  const schedaOpera = (o: OperaQuiz, compositori: PersonaQuiz[]): SpiegazioneQuiz =>
    scheda({
      titolo: o.n,
      sotto: conAnno(elenco(compositori.map((p) => p.n)), o.anno),
      righe: righe(
        ['Musica', compositori.map(inRiga).join('; ')],
        ['Libretto', o.lib?.length ? elenco(o.lib) : null],
        ['Prima rappresentazione', [o.teatro, o.citta, o.anno].filter(Boolean).join(', ')],
        ['Lingua', o.lingua],
      ),
      voce: o.w,
    })
  return opereConAutore<OperaQuiz & Opera>(
    {
      persone: dati.compositori,
      opere,
      chi: (o) => `Chi ha composto ${titolo(o.n)}?`,
      quale: (p) => `Quale di queste opere ha composto ${p.n}?`,
      scheda: schedaOpera,
      tipoChi: 'compositore-opera',
      tipoQuale: 'opera-di',
      terza: {
        tipo: 'citta-opera',
        fai: (o, compositori) => {
          if (!o.citta) return null
          const sbagliate = mescola(
            citta.filter((x) => !stessoTesto(x, o.citta!)),
            c.caso,
          ).slice(0, c.sbagliate)
          const opzioni = conGiusta(
            c,
            opzione(`citta:${o.citta}`, o.citta),
            sbagliate.map((x) => opzione(`citta:${x}`, x)),
          )
          if (!opzioni) return null
          return {
            tipo: 'citta-opera',
            testo: `In quale città è andata in scena per la prima volta ${titolo(o.n)}?`,
            opzioni,
            giusta: `citta:${o.citta}`,
            risposta: o.citta,
            soggetto: o.id,
            spiegazione: schedaOpera(o, compositori),
          }
        },
      },
      quote: [
        ['compositore-opera', 50],
        ['opera-di', 35],
        ['citta-opera', 15],
      ],
      nellAmbito: (o, persone) => nellAmbitoComposto(o, c, persone),
    },
    c,
  )
}

/* ──────────────────────────────  Premi Nobel  ─────────────────────────── */

export const NOMI_PREMI: Record<PremioNobel, string> = {
  letteratura: 'Letteratura',
  fisica: 'Fisica',
  chimica: 'Chimica',
  medicina: 'Medicina',
  pace: 'Pace',
  economia: 'Economia',
}

/** "per la fisica", "per l'economia": come si dice il premio in una frase. */
const PER_PREMIO: Record<PremioNobel, string> = {
  letteratura: 'per la letteratura',
  fisica: 'per la fisica',
  chimica: 'per la chimica',
  medicina: 'per la medicina',
  pace: 'per la pace',
  economia: 'per l’economia',
}

function nobel(dati: DatiCultura['nobel'], c: Contesto): DomandaCompleta[] {
  const premiati = new Map(dati.premiati.map((p) => [p.id, p]))
  const premi = dati.premi.filter((x) => premiati.has(x.chi))
  const chiDelPremio = (premio: PremioNobel, anno: number) =>
    premi.filter((x) => x.premio === premio && x.anno === anno).map((x) => x.chi)
  const premiDi = (chi: string) => premi.filter((x) => x.chi === chi)

  const schedaPremio = (x: NobelQuiz): SpiegazioneQuiz => {
    const p = premiati.get(x.chi)!
    const insieme = chiDelPremio(x.premio, x.anno)
      .filter((id) => id !== x.chi)
      .map((id) => premiati.get(id)!.n)
    return scheda({
      titolo: p.n,
      sotto: `Nobel ${PER_PREMIO[x.premio]}, ${x.anno}`,
      righe: righe(
        ['Chi è', p.d ? maiuscola(p.d) : null],
        ['Paese', p.p],
        ['Vita', vita(p)],
        ['Motivazione', x.motivo],
        ['Insieme a', insieme.length ? elenco(insieme) : null],
      ),
      voce: p.w,
    })
  }

  type Premio = NobelQuiz & { id: string; f: number }
  const candidati: Premio[] = premi
    .filter((x) => {
      if (c.ambito === 'italiani') return premiati.get(x.chi)?.it === 1
      return (PREMI_NOBEL as readonly string[]).includes(c.ambito) ? x.premio === c.ambito : true
    })
    .map((x) => ({ ...x, id: `${x.chi}:${x.premio}:${x.anno}`, f: premiati.get(x.chi)!.f }))

  /*
   * Si chiede il campo a chi l'ha vinto: "In quale campo ha vinto il premio
   * Nobel Albert Einstein?". Prima si chiedeva anche chi l'aveva vinto in un
   * anno, e in che anno: un anno di un Nobel non lo sa nessuno, e si tirava a
   * indovinare. Chi ne ha vinti due in due campi (Marie Curie) ha l'altro fuori
   * dalle risposte sbagliate.
   */
  const fai: Fai<Premio> = (tipo, x) => {
    if (tipo !== 'premio-nobel') return null
    const p = premiati.get(x.chi)!
    if (!ancoraGiusta(c, p.id)) return null
    const vinti = new Set(premiDi(p.id).map((y) => y.premio))
    const altri = mescola(
      PREMI_NOBEL.filter((q) => !vinti.has(q)),
      c.caso,
    )
    const opzioni = conGiusta(
      c,
      opzione(`premio:${x.premio}`, NOMI_PREMI[x.premio]),
      altri.map((q) => opzione(`premio:${q}`, NOMI_PREMI[q])),
    )
    if (!opzioni) return null
    segnaGiusta(c, p.id)
    return {
      tipo,
      testo: `In quale campo ha vinto il premio Nobel ${p.n}?`,
      opzioni,
      giusta: `premio:${x.premio}`,
      risposta: NOMI_PREMI[x.premio],
      soggetto: x.id,
      spiegazione: schedaPremio(x),
    }
  }

  // Chi ha vinto due volte non fa due domande: i premi sono i soggetti, e la persona e' la stessa.
  const unoAPersona = [...new Map(candidati.map((x) => [x.chi, x])).values()]
  return componi(preferendo(unoAPersona, (x) => x.id, c.evitare, c.quante), [['premio-nobel', 100]], c, fai)
}

/* ──────────────────────────────────  Storia  ──────────────────────────── */

/**
 * La domanda su quando: "In che anno si combatté la battaglia di Waterloo?",
 * "In che secolo cominciò la guerra dei cent'anni?", "In che anno fu firmato
 * il trattato di Versailles?". Il verbo lo decide la prima parola del nome, il
 * genere anche; se la parola non la si conosce, il nome va fra virgolette.
 */
/**
 * I fatti che durano per forza: una guerra, un'epidemia, un assedio. Si chiede
 * quando cominciarono anche se Wikidata non dice quando finirono, come per la
 * pandemia di COVID-19.
 */
const COMINCIANO = new RegExp(
  `^(${[
    'guerr',
    'rivoluzion',
    'rivolt',
    'insurrezion',
    'crociat',
    'campagn',
    'occupazion',
    'invasion',
    'pandemi',
    'epidemi',
    'carestia',
    'crisi',
    'assedi',
    'blocc',
  ].join('|')})`,
)

export function domandaSulTempo(
  nome: string,
  quando: 'anno' | 'secolo',
  /**
   * Se il fatto e' durato piu' di quell'anno o di quel secolo: allora si chiede
   * quando comincio', perché "in che anno ci fu la pandemia di COVID-19?"
   * avrebbe piu' risposte giuste.
   */
  dura = false,
): string {
  const genere = genereNome(nome)
  if (!genere) return `${titolo(maiuscola(nome))}: in che ${quando}?`
  const conArticolo = nomeConArticolo(nome, genere)!
  const molti = plurale(genere)
  const femminile = genere === 'f' || genere === 'fp'
  // Il verbo segue il nome che regge, non l'aggettivo davanti: "cominciò la seconda guerra balcanica".
  const prima = testaDelNome(nome)
  let verbo: string
  // Un trattato si firma il primo anno anche quando dura: il patto di Varsavia "fu firmato", nel 1955.
  if (/^(trattat|pace|accord|patt|armistizi|convenzion|concordat)/.test(prima)) {
    verbo = molti ? (femminile ? 'furono firmate' : 'furono firmati') : femminile ? 'fu firmata' : 'fu firmato'
  } else if (dura || COMINCIANO.test(prima)) {
    verbo = molti ? 'cominciarono' : 'cominciò'
  } else if (/^battagli/.test(prima)) verbo = molti ? 'si combatterono' : 'si combatté'
  else verbo = molti ? 'ci furono' : 'ci fu'
  return `In che ${quando} ${verbo} ${conArticolo}?`
}

function nellAmbitoStoria(e: EventoQuiz, ambito: string): boolean {
  switch (ambito) {
    case 'antichita':
      return e.anno < 476
    case 'medioevo':
      return e.anno >= 476 && e.anno < 1492
    case 'moderna':
      return e.anno >= 1492 && e.anno < 1815
    case 'contemporanea':
      return e.anno >= 1815
    case 'italia':
      return e.it === 1
    default:
      return true
  }
}

/** Gli anni di un fatto: "1815", "1337–1453", "480 a.C.". */
function anniEvento(e: EventoQuiz): string {
  if (e.fine === undefined || e.fine === e.anno) return annoInLettere(e.anno)
  if (e.anno < 0 && e.fine < 0) return `${-e.anno}–${-e.fine} a.C.`
  return `${annoInLettere(e.anno)}–${annoInLettere(e.fine)}`
}

/** Un nome con un anno dentro ("terremoto di Messina del 1908") non fa una domanda sul tempo. */
const haUnAnno = (nome: string) => /\d{3,4}/.test(nome)

function storia(dati: DatiCultura['storia'], c: Contesto): DomandaCompleta[] {
  const eventi = dati.eventi
  const schedaEvento = (e: EventoQuiz, altri: EventoQuiz[] = []): SpiegazioneQuiz =>
    scheda({
      titolo: maiuscola(e.n),
      sotto: anniEvento(e),
      righe: altri.length
        ? [...altri, e]
            .sort((a, b) => a.anno - b.anno)
            .map((x): [string, string] => [annoInLettere(x.anno), maiuscola(x.n)])
        : righe(
            ['Quando', anniEvento(e)],
            ['Secolo', nomeSecolo(numeroSecolo(e.anno))],
            ['Dove', e.luogo],
            ['Parte di', e.parte],
          ),
      voce: e.w,
    })

  const fai: Fai<EventoQuiz> = (tipo, e) => {
    switch (tipo) {
      case 'anno-evento': {
        // Un anno si chiede dal Mille in poi, o per i fatti famosissimi: le Idi di marzo, Maratona.
        if (haUnAnno(e.n) || (e.anno < 1000 && e.f < 0.8)) return null
        const opzioni = opzioniAnni(c, e.anno)
        if (!opzioni) return null
        return {
          tipo,
          testo: domandaSulTempo(e.n, 'anno', e.fine !== undefined && e.fine !== e.anno),
          opzioni,
          giusta: `anno:${e.anno}`,
          risposta: annoInLettere(e.anno),
          soggetto: e.id,
          spiegazione: schedaEvento(e),
        }
      }
      case 'secolo-evento': {
        if (haUnAnno(e.n) || aCavalloDelSecolo(e.anno)) return null
        const opzioni = opzioniSecoli(c, e.anno)
        if (!opzioni) return null
        return {
          tipo,
          testo: domandaSulTempo(
            e.n,
            'secolo',
            e.fine !== undefined && numeroSecolo(e.fine) !== numeroSecolo(e.anno),
          ),
          opzioni,
          giusta: `sec:${numeroSecolo(e.anno)}`,
          risposta: nomeSecolo(numeroSecolo(e.anno)),
          soggetto: e.id,
          spiegazione: schedaEvento(e),
        }
      }
      case 'prima-evento': {
        // Gli altri vengono dopo, e abbastanza dopo da non dover sapere l'anno esatto.
        // Con un anno nel nome ("rivoluzione cinese del 1911") l'ordine si leggerebbe.
        if (haUnAnno(e.n)) return null
        const distacco = Math.max(8, Math.round((c.annoMassimo - e.anno) / 25))
        const dopo = eventi.filter(
          (x) => x.id !== e.id && x.anno >= e.anno + distacco && !stessoTesto(x.n, e.n) && !haUnAnno(x.n),
        )
        const scelti = distrattori(c, dopo, c.sbagliate, (x) => Math.abs(x.anno - e.anno) / 400 + scarto(x, e))
        const opzioni = conGiusta(
          c,
          opzione(e.id, maiuscola(e.n)),
          scelti.map((x) => opzione(x.id, maiuscola(x.n))),
        )
        if (!opzioni) return null
        return {
          tipo,
          testo: 'Quale di questi fatti è avvenuto prima?',
          lunga: 1,
          opzioni,
          giusta: e.id,
          risposta: maiuscola(e.n),
          soggetto: e.id,
          spiegazione: schedaEvento(e, scelti),
        }
      }
      default:
        return null
    }
  }

  return componi(
    preferendo(
      eventi.filter((e) => nellAmbitoStoria(e, c.ambito)),
      (e) => e.id,
      c.evitare,
      c.quante,
    ),
    [
      ['anno-evento', 45],
      ['secolo-evento', 25],
      ['prima-evento', 30],
    ],
    c,
    fai,
  )
}

/* ──────────────────────────────────  Scienza  ──────────────────────────── */

const ORDINALI = [
  '',
  'il primo',
  'il secondo',
  'il terzo',
  'il quarto',
  'il quinto',
  'il sesto',
  'il settimo',
  'l’ottavo',
]

/** Le lettere degli elementi di una formula: "H₂SO₄" → H, S, O. */
function elementiDellaFormula(formula: string): Set<string> {
  return new Set(formula.match(/[A-Z][a-z]?/g) ?? [])
}

/**
 * Quanti tipi di domanda per argomento, se si gioca su tutto: la chimica e le
 * scoperte piu' delle altre. Nelle scoperte l'anno viene prima di chi: e' la
 * domanda che si fa di solito, e di chi l'ha fatta lo dice anche la domanda.
 */
const QUOTE_SCIENZA: ReadonlyArray<readonly [TipoDomanda, number]> = [
  ['simbolo-elemento', 12],
  ['elemento-simbolo', 10],
  ['formula-composto', 10],
  ['grandezza-unita', 10],
  ['unita-grandezza', 8],
  ['nome-unita', 6],
  ['satellite-di', 8],
  ['ordine-pianeta', 4],
  ['anno-scoperta', 12],
  ['autore-scoperta', 8],
  ['gruppo-animale', 8],
  ['animale-del-gruppo', 6],
]

/** I nomi dei gruppi di animali, come risposte. */
const NOMI_GRUPPI: Record<GruppoAnimale, string> = {
  mammiferi: 'Mammiferi',
  uccelli: 'Uccelli',
  rettili: 'Rettili',
  anfibi: 'Anfibi',
  pesci: 'Pesci',
  insetti: 'Insetti',
  aracnidi: 'Aracnidi',
  crostacei: 'Crostacei',
  molluschi: 'Molluschi',
}

/** Un animale del gruppo, nella domanda: "Quale di questi animali è un mammifero?". */
const UNO_DEL_GRUPPO: Record<GruppoAnimale, string> = {
  mammiferi: 'un mammifero',
  uccelli: 'un uccello',
  rettili: 'un rettile',
  anfibi: 'un anfibio',
  pesci: 'un pesce',
  insetti: 'un insetto',
  aracnidi: 'un aracnide',
  crostacei: 'un crostaceo',
  molluschi: 'un mollusco',
}

/**
 * Quanto e' noto l'`i`-esimo di chi ha fatto una scoperta. Senza la misura,
 * come nei file di prima, vale come noto: la domanda si fa come si faceva.
 */
function famaDi(s: ScopertaQuiz, i: number): number {
  return s.cf?.[i] ?? 1
}

const famaMassima = (s: ScopertaQuiz) => Math.max(...s.chi.map((_, i) => famaDi(s, i)))

/** Come si dice che qualcuno l'ha fatta: "ha scoperto la penicillina", "ha inventato il telefono". */
function fatto(s: ScopertaQuiz): string {
  const verbo = s.v === 'i' ? 'inventato' : s.v === 'f' ? 'formulato' : 'scoperto'
  return `${s.chi.length > 1 ? 'hanno' : 'ha'} ${verbo}`
}

function scienza(dati: DatiCultura['scienza'], c: Contesto): DomandaCompleta[] {
  const pianeti = dati.astri.filter((a) => a.tipo === 'pianeta' && a.ordine)
  const nomiPianeti = new Set(pianeti.map((a) => a.n))
  const schedaElemento = (e: ElementoQuiz): SpiegazioneQuiz =>
    scheda({
      titolo: maiuscola(e.n),
      sotto: `${e.s} · numero atomico ${e.z}`,
      righe: righe(
        ['Simbolo', e.s],
        ['Numero atomico', String(e.z)],
        ['Famiglia', e.g],
        ['Scoperto da', e.chi?.length ? conAnno(elenco(e.chi), e.anno) : null],
      ),
      voce: e.w,
    })
  const schedaComposto = (k: CompostoQuiz): SpiegazioneQuiz =>
    scheda({ titolo: maiuscola(k.n), sotto: k.formula, righe: righe(['Formula', k.formula]), voce: k.w })
  const schedaUnita = (u: UnitaQuiz): SpiegazioneQuiz =>
    scheda({
      titolo: u.n,
      sotto: `${u.s} · ${u.g}`,
      righe: righe(['Simbolo', u.s], ['Misura', maiuscola(u.g)], ['Prende il nome da', u.da]),
      voce: u.w,
    })
  const schedaAstro = (a: AstroQuiz): SpiegazioneQuiz =>
    scheda({
      titolo: a.n,
      sotto: a.tipo === 'satellite' && a.di ? `satellite di ${a.di}` : a.tipo,
      righe: righe(
        ['Che cos’è', maiuscola(a.tipo)],
        ['Pianeta', a.di],
        ['Posizione dal Sole', a.ordine ? `${a.ordine}º` : null],
        ['Scoperto da', a.chi?.length ? conAnno(elenco(a.chi), a.anno) : null],
      ),
      voce: a.w,
    })
  const schedaScoperta = (s: ScopertaQuiz): SpiegazioneQuiz =>
    scheda({
      titolo: maiuscola(s.n),
      sotto: [elenco(s.chi), s.anno !== undefined ? annoInLettere(s.anno) : null].filter(Boolean).join(', '),
      righe: righe(['Di chi', elenco(s.chi)], ['Quando', s.anno !== undefined ? annoInLettere(s.anno) : null]),
      voce: s.w,
    })
  const schedaSpecie = (s: SpecieQuiz): SpiegazioneQuiz =>
    scheda({ titolo: maiuscola(s.n), sotto: NOMI_GRUPPI[s.gr], righe: righe(['Gruppo', NOMI_GRUPPI[s.gr]]), voce: s.w })

  /** Una domanda di un tipo sulla voce di una lista: null se non si fa. */
  type Lista = { voci: readonly { id: string; f: number }[]; fai: (x: never) => DomandaCompleta | null }
  const perTipo: Partial<Record<TipoDomanda, Lista>> =
    {
      'simbolo-elemento': {
        voci: dati.elementi,
        fai: (e: ElementoQuiz) => {
          const iniziale = e.n.charAt(0).toUpperCase()
          const altri = dati.elementi.filter((x) => x.id !== e.id && x.s !== e.s)
          const sbagliati = distrattori(c, altri, c.sbagliate, (x) => {
            return (x.s.charAt(0) === iniziale ? 0 : 1) + scarto(x, e)
          })
          const opzioni = conGiusta(
            c,
            opzione(e.id, e.s),
            sbagliati.map((x) => opzione(x.id, x.s)),
          )
          return opzioni && {
            tipo: 'simbolo-elemento',
            testo: `Qual è il simbolo chimico ${diElemento(e.n)}?`,
            opzioni,
            giusta: e.id,
            risposta: e.s,
            soggetto: `el:${e.id}`,
            spiegazione: schedaElemento(e),
          }
        },
      },
      'elemento-simbolo': {
        voci: dati.elementi,
        fai: (e: ElementoQuiz) => {
          const iniziale = e.s.charAt(0).toLowerCase()
          const altri = dati.elementi.filter((x) => x.id !== e.id && !stessoTesto(x.n, e.n))
          const sbagliati = distrattori(c, altri, c.sbagliate, (x) => {
            return (x.n.charAt(0) === iniziale ? 0 : 1) + scarto(x, e)
          })
          const opzioni = conGiusta(
            c,
            opzione(e.id, maiuscola(e.n)),
            sbagliati.map((x) => opzione(x.id, maiuscola(x.n))),
          )
          return opzioni && {
            tipo: 'elemento-simbolo',
            testo: `Quale elemento chimico ha il simbolo ${e.s}?`,
            opzioni,
            giusta: e.id,
            risposta: maiuscola(e.n),
            soggetto: `el:${e.id}`,
            spiegazione: schedaElemento(e),
          }
        },
      },
      'formula-composto': {
        voci: dati.composti,
        fai: (k: CompostoQuiz) => {
          const suoi = elementiDellaFormula(k.formula)
          const altri = dati.composti.filter((x) => x.id !== k.id && x.formula !== k.formula)
          const sbagliati = distrattori(c, altri, c.sbagliate, (x) => {
            const comuni = [...elementiDellaFormula(x.formula)].filter((s) => suoi.has(s)).length
            return (comuni > 0 ? 0 : 1) + scarto(x, k)
          })
          const opzioni = conGiusta(
            c,
            opzione(k.id, k.formula),
            sbagliati.map((x) => opzione(x.id, x.formula)),
          )
          const di = diNome(k.n, genereNome(k.n, null, true)) ?? `di ${titolo(k.n)}`
          return opzioni && {
            tipo: 'formula-composto',
            testo: `Qual è la formula chimica ${di}?`,
            opzioni,
            giusta: k.id,
            risposta: k.formula,
            soggetto: `co:${k.id}`,
            spiegazione: schedaComposto(k),
          }
        },
      },
      'grandezza-unita': {
        voci: dati.unita,
        fai: (u: UnitaQuiz) => {
          const altre = [...new Set(dati.unita.map((x) => x.g))].filter((g) => !stessoTesto(g, u.g))
          const opzioni = conGiusta(
            c,
            opzione(`g:${u.g}`, maiuscola(u.g)),
            mescola(altre, c.caso).map((g) => opzione(`g:${g}`, maiuscola(g))),
          )
          const unita = nomeConArticolo(u.n, genereNome(u.n, 'm'))!
          return opzioni && {
            tipo: 'grandezza-unita',
            testo: `Quale grandezza misura ${unita}?`,
            opzioni,
            giusta: `g:${u.g}`,
            risposta: maiuscola(u.g),
            soggetto: `un:${u.id}`,
            spiegazione: schedaUnita(u),
          }
        },
      },
      'unita-grandezza': {
        voci: dati.unita,
        fai: (u: UnitaQuiz) => {
          // Le unità della stessa grandezza (kelvin e grado Celsius) sono giuste tutte e due: fuori.
          const altre = dati.unita.filter((x) => !stessoTesto(x.g, u.g))
          const sbagliate = distrattori(c, altre, c.sbagliate, (x) => scarto(x, u))
          const opzioni = conGiusta(
            c,
            opzione(u.id, u.n),
            sbagliate.map((x) => opzione(x.id, x.n)),
          )
          const grandezza = diNome(u.g, genereNome(u.g, 'f')) ?? `di ${titolo(u.g)}`
          return opzioni && {
            tipo: 'unita-grandezza',
            testo: `Quale di queste è un’unità di misura ${grandezza}?`,
            opzioni,
            giusta: u.id,
            risposta: u.n,
            soggetto: `un:${u.id}`,
            spiegazione: schedaUnita(u),
          }
        },
      },
      'nome-unita': {
        voci: dati.unita.filter((u) => u.da),
        fai: (u: UnitaQuiz) => {
          const nomi = dati.unita.map((x) => x.da).filter((x): x is string => !!x)
          const altri = [...new Set(nomi)].filter((x) => x !== u.da)
          const opzioni = conGiusta(
            c,
            opzione(`da:${u.da}`, u.da!),
            mescola(altri, c.caso).map((x) => opzione(`da:${x}`, x)),
          )
          const unita = nomeConArticolo(u.n, genereNome(u.n, 'm'))!
          return opzioni && {
            tipo: 'nome-unita',
            testo: `Da chi prende il nome ${unita}?`,
            opzioni,
            giusta: `da:${u.da}`,
            risposta: u.da!,
            soggetto: `un:${u.id}`,
            spiegazione: schedaUnita(u),
          }
        },
      },
      'satellite-di': {
        voci: dati.astri.filter((a) => a.tipo === 'satellite' && a.di && nomiPianeti.has(a.di)),
        fai: (a: AstroQuiz) => {
          const conLune = new Set(dati.astri.filter((x) => x.tipo === 'satellite' && x.di).map((x) => x.di!))
          const altri = pianeti.filter((p) => p.n !== a.di)
          const sbagliati = distrattori(c, altri, c.sbagliate, (p) => (conLune.has(p.n) ? 0 : 1))
          const opzioni = conGiusta(
            c,
            opzione(`pi:${a.di}`, a.di!),
            sbagliati.map((p) => opzione(`pi:${p.n}`, p.n)),
          )
          return opzioni && {
            tipo: 'satellite-di',
            testo: `Di quale pianeta è un satellite ${a.n}?`,
            opzioni,
            giusta: `pi:${a.di}`,
            risposta: a.di!,
            soggetto: `as:${a.id}`,
            spiegazione: schedaAstro(a),
          }
        },
      },
      'ordine-pianeta': {
        voci: pianeti,
        fai: (a: AstroQuiz) => {
          const altri = pianeti.filter((p) => p.id !== a.id)
          const sbagliati = distrattori(c, altri, c.sbagliate, (p) => Math.abs((p.ordine ?? 0) - (a.ordine ?? 0)) / 3)
          const opzioni = conGiusta(
            c,
            opzione(`pi:${a.n}`, a.n),
            sbagliati.map((p) => opzione(`pi:${p.n}`, p.n)),
          )
          return opzioni && {
            tipo: 'ordine-pianeta',
            testo: `Qual è ${ORDINALI[a.ordine ?? 0]} pianeta dal Sole?`,
            opzioni,
            giusta: `pi:${a.n}`,
            risposta: a.n,
            soggetto: `as:${a.id}`,
            spiegazione: schedaAstro(a),
          }
        },
      },
      'autore-scoperta': {
        // Chi l'ha fatta dev'essere noto quanto vuole la difficoltà, come in "quale di queste ha fatto lui".
        voci: dati.scoperte.filter((s) => s.chi.length > 0 && famaMassima(s) >= NOTA_PER_NOME[c.notorieta]),
        fai: (s: ScopertaQuiz) => {
          // Di due, il piu' noto: l'altro non sta fra le risposte sbagliate.
          const chi = s.chi[s.chi.reduce((a, _, i) => (famaDi(s, i) > famaDi(s, a) ? i : a), 0)]
          const persone = new Map<string, { id: string; n: string; anno?: number; f: number }>()
          for (const x of dati.scoperte) {
            x.chi.forEach((n, i) => {
              if (!s.chi.includes(n) && !persone.has(n)) persone.set(n, { id: n, n, anno: x.anno, f: famaDi(x, i) })
            })
          }
          // Le sbagliate dello stesso tempo, e nel facile nomi noti anche loro: fra quattro sconosciuti si tira a caso.
          const lontano = (p: { f: number }) => (p.f < NOTA_PER_NOME[c.notorieta] ? 1 : 0)
          const sbagliati = distrattori(
            c,
            [...persone.values()],
            c.sbagliate,
            (p) =>
              (p.anno !== undefined && s.anno !== undefined ? Math.min(2, Math.abs(p.anno - s.anno) / 80) : 1) +
              lontano(p),
          )
          const opzioni = conGiusta(
            c,
            opzione(`chi:${chi}`, chi),
            sbagliati.map((p) => opzione(`chi:${p.n}`, p.n)),
          )
          const genere = genereNome(s.n, null, true)
          const cosa = nomeConArticolo(s.n, genere) ?? titolo(s.n)
          return opzioni && {
            tipo: 'autore-scoperta',
            testo: `A chi si ${genere && plurale(genere) ? 'devono' : 'deve'} ${cosa}?`,
            opzioni,
            giusta: `chi:${chi}`,
            risposta: chi,
            soggetto: `sc:${s.id}`,
            spiegazione: schedaScoperta(s),
          }
        },
      },
      'anno-scoperta': {
        voci: dati.scoperte.filter((s) => s.chi.length > 0 && s.anno !== undefined),
        fai: (s: ScopertaQuiz) => {
          const opzioni = opzioniAnni(c, s.anno!)
          if (!opzioni) return null
          const genere = genereNome(s.n, null, true)
          const cosa = nomeConArticolo(s.n, genere) ?? titolo(s.n)
          return {
            tipo: 'anno-scoperta',
            testo: `In che anno ${elenco(s.chi)} ${fatto(s)} ${cosa}?`,
            opzioni,
            giusta: `anno:${s.anno}`,
            risposta: annoInLettere(s.anno!),
            soggetto: `sc:${s.id}`,
            spiegazione: schedaScoperta(s),
          }
        },
      },
      'gruppo-animale': {
        voci: dati.specie,
        fai: (s: SpecieQuiz) => {
          // Gli errori dalla stessa parte: un delfino si scambia con un pesce, un ragno con un insetto.
          const vicino = (g: GruppoAnimale) => (VERTEBRATI.has(g) === VERTEBRATI.has(s.gr) ? 0 : 1) + c.caso() * 0.9
          const altri = GRUPPI_ANIMALI.filter((g) => g !== s.gr).sort((a, b) => vicino(a) - vicino(b))
          const opzioni = conGiusta(
            c,
            opzione(`gr:${s.gr}`, NOMI_GRUPPI[s.gr]),
            altri.map((g) => opzione(`gr:${g}`, NOMI_GRUPPI[g])),
          )
          const animale = nomeConArticolo(s.n, genereNome(s.n, null, true)) ?? titolo(s.n)
          return opzioni && {
            tipo: 'gruppo-animale',
            testo: `A quale gruppo di animali appartiene ${animale}?`,
            opzioni,
            giusta: `gr:${s.gr}`,
            risposta: NOMI_GRUPPI[s.gr],
            soggetto: `sp:${s.id}`,
            spiegazione: schedaSpecie(s),
          }
        },
      },
      'animale-del-gruppo': {
        voci: dati.specie,
        fai: (s: SpecieQuiz) => {
          // Le sbagliate di altri gruppi, e se si puo' vicine: per i mammiferi un pesce o un uccello, non un ragno.
          const altri = dati.specie.filter((x) => x.gr !== s.gr)
          const sbagliati = distrattori(
            c,
            altri,
            c.sbagliate,
            (x) => (VERTEBRATI.has(x.gr) === VERTEBRATI.has(s.gr) ? 0 : 1) + (1 - x.f),
          )
          // Non tutte dello stesso gruppo: tre uccelli e un leone direbbero il mammifero a chi non sa che cos'e'.
          if (new Set(sbagliati.map((x) => x.gr)).size < Math.min(2, sbagliati.length)) return null
          // Le risposte come le altre, con la maiuscola: "Delfino", non "delfino".
          const opzioni = conGiusta(
            c,
            opzione(`sp:${s.id}`, maiuscola(s.n)),
            sbagliati.map((x) => opzione(`sp:${x.id}`, maiuscola(x.n))),
          )
          return opzioni && {
            tipo: 'animale-del-gruppo',
            testo: `Quale di questi animali è ${UNO_DEL_GRUPPO[s.gr]}?`,
            opzioni,
            giusta: `sp:${s.id}`,
            risposta: maiuscola(s.n),
            soggetto: `sp:${s.id}`,
            spiegazione: schedaSpecie(s),
          }
        },
      },
    }

  const ammessi = TIPI_SCIENZA[c.ambito] ?? QUOTE_SCIENZA.map(([t]) => t)
  const pesate = perDifficolta(QUOTE_SCIENZA, c.notorieta)
  const quote = pesate.filter(([t]) => ammessi.includes(t) && (!c.tipi || c.tipi.has(t)) && perTipo[t])
  const valide = quote.length > 0 ? quote : pesate.filter(([t]) => ammessi.includes(t))
  const perQuota = ripartisci(c.quante, valide, c.caso)
  // Quante domande per tipo, in proporzione, e le voci di ognuno dalla piu' nota. Lo stesso
  // elemento non fa due domande (il simbolo e l'elemento del simbolo): chi e' gia' uscito si salta.
  const domande: DomandaCompleta[] = []
  const presi = new Set<string>()
  const prova = (tipo: TipoDomanda, quanti: number, voci: readonly { id: string; f: number }[]) => {
    let fatte = 0
    for (const x of voci) {
      if (fatte >= quanti) break
      const d = perTipo[tipo]!.fai(x as never)
      if (!d || presi.has(d.soggetto)) continue
      presi.add(d.soggetto)
      domande.push(d)
      fatte += 1
    }
  }
  valide.forEach(([tipo]) => {
    const quanti = perQuota.get(tipo) ?? 0
    const lista = perTipo[tipo]
    if (!lista || quanti <= 0) return
    const voci = preferendo([...lista.voci], (x) => x.id, c.evitare, quanti)
    prova(tipo, quanti, soggetti(voci, quanti * 3, c.caso, c.notorieta, quanti))
  })
  // Un tipo con poche voci (i pianeti sono otto) lascia posto agli altri.
  for (const [tipo] of mescola(valide, c.caso)) {
    if (domande.length >= c.quante) break
    const lista = perTipo[tipo]
    if (lista) prova(tipo, c.quante - domande.length, mescola(lista.voci, c.caso))
  }
  return mescola(domande, c.caso)
}

/* ────────────────────────────────  Accadde oggi  ───────────────────────── */

/** Un fatto come domanda: la frase di Wikipedia, e poi la domanda. */
function fraseConDomanda(t: string, domanda: string): string {
  return /[.!?…]$/.test(t) ? `${t} ${domanda}` : `${t}. ${domanda}`
}

function oggi(dati: DatiOggi, c: Contesto): DomandaCompleta[] {
  const data = giornoInLettere(dati.giorno)
  // L'id porta il giorno: la notte evita i soggetti delle classificate di prima, che sono di altri giorni.
  const fatti = dati.fatti.map((x, i) => ({ ...x, id: `${dati.giorno}/${i}` }))
  const nati = dati.nati
  type Fatto = FattoQuiz & { id: string }
  type Voce = { id: string; f: number; fatto?: Fatto; nato?: NatoQuiz }

  const schedaFatto = (x: Fatto): SpiegazioneQuiz =>
    scheda({ titolo: `${data} ${annoInLettere(x.anno)}`, sotto: x.t, testo: x.d, voce: x.w })
  const schedaNato = (n: NatoQuiz): SpiegazioneQuiz =>
    scheda({
      titolo: n.n,
      sotto: `${n.fem ? 'Nata' : 'Nato'} il ${data} ${annoInLettere(n.anno)}`,
      testo: n.d ? maiuscola(`${n.d}.`) : undefined,
      voce: n.w,
    })

  const fai: Fai<Voce> = (tipo, v) => {
    if (v.fatto && tipo === 'oggi-anno') {
      const x = v.fatto
      const opzioni = opzioniAnni(c, x.anno)
      if (!opzioni) return null
      return {
        tipo,
        testo: fraseConDomanda(x.t, 'In che anno?'),
        opzioni,
        giusta: `anno:${x.anno}`,
        risposta: annoInLettere(x.anno),
        soggetto: x.id,
        spiegazione: schedaFatto(x),
      }
    }
    if (v.nato && tipo === 'oggi-nato') {
      const n = v.nato
      const opzioni = opzioniAnni(c, n.anno)
      if (!opzioni) return null
      return {
        tipo,
        testo: `Il ${data} è ${n.fem ? 'nata' : 'nato'} ${n.n}${n.d ? `, ${n.d}` : ''}. In che anno?`,
        opzioni,
        giusta: `anno:${n.anno}`,
        risposta: annoInLettere(n.anno),
        soggetto: n.id,
        spiegazione: schedaNato(n),
      }
    }
    return null
  }

  // I fatti e i nati sono due liste: le domande su ognuna vengono dalle sue voci. Di un fatto si chiede
  // sempre l'anno: scegliere fra quattro fatti poco noti di quel giorno non si poteva indovinare, mentre
  // l'anno lo avvicina anche chi non conosce il fatto ("oggi-fatto" resta nei tipi per le partite di prima).
  const perFatti = c.tipi ? c.tipi.has('oggi-anno') : true
  const perNati = c.tipi ? c.tipi.has('oggi-nato') : true
  const quanteNati = perNati ? (perFatti ? Math.round(c.quante * 0.3) : c.quante) : 0
  const voceFatti: Voce[] = fatti.map((x) => ({ id: x.id, f: x.f, fatto: x }))
  const voceNati: Voce[] = nati.map((n) => ({ id: n.id, f: n.f, nato: n }))
  const suiFatti = perFatti
    ? componi(
        preferendo(voceFatti, (v) => v.id, c.evitare, c.quante - quanteNati),
        [['oggi-anno', 100]],
        { ...c, quante: c.quante - quanteNati },
        fai,
      )
    : []
  const suiNati =
    quanteNati > 0
      ? componi(
          preferendo(voceNati, (v) => v.id, c.evitare, quanteNati),
          [['oggi-nato', 100]],
          { ...c, quante: quanteNati },
          fai,
        )
      : []
  // Un nato ogni tre fatti, piu' o meno: la partita alterna.
  const insieme: DomandaCompleta[] = []
  let i = 0
  let j = 0
  while (i < suiFatti.length || j < suiNati.length) {
    if (i < suiFatti.length) insieme.push(suiFatti[i++])
    if (i < suiFatti.length) insieme.push(suiFatti[i++])
    if (j < suiNati.length) insieme.push(suiNati[j++])
  }
  return insieme
}

/* ─────────────────────────────────  La partita  ───────────────────────── */

/** Da dove vengono le domande: il riassunto della geografia, i file delle altre materie, il giorno di oggi. */
export interface FontiQuiz {
  geo?: DatiQuiz | IndiceQuiz
  cultura?: Partial<Omit<DatiCultura, 'oggi'>>
  /** "Accadde oggi" del giorno della partita. */
  oggi?: DatiOggi
}

/**
 * Le domande di una partita di qualunque materia. `richiesta.data` e' il
 * giorno della partita, "AAAA-MM-GG": gli anni sbagliati non lo passano, e per
 * la classificata deve esserci, perché le domande dipendano solo dal giorno.
 * Con piu' sezioni (`richiesta.sezioni`) la partita le mescola.
 */
export function generaPartita(
  fonti: FontiQuiz,
  richiesta: RichiestaQuiz,
  caso: Caso,
  evitare: ReadonlySet<string> = new Set(),
): DomandaCompleta[] {
  const chiave = (x: SezioneQuiz) => `${x.categoria}:${x.ambito ?? 'tutti'}:${x.genere ?? 'tutti'}`
  const sezioni = [...new Map((richiesta.sezioni ?? []).map((x) => [chiave(x), x])).values()]
  if (sezioni.length > 1) return partitaMista(fonti, richiesta, sezioni, caso, evitare)
  const sola = sezioni[0]
  const una = sola
    ? {
        ...richiesta,
        categoria: sola.categoria,
        ambito: sola.ambito ?? richiesta.ambito,
        genere: sola.genere ?? richiesta.genere,
      }
    : richiesta
  return partitaDi(fonti, { ...una, sezioni: undefined }, caso, evitare)
}

function partitaDi(
  fonti: FontiQuiz,
  richiesta: RichiestaQuiz,
  caso: Caso,
  evitare: ReadonlySet<string>,
): DomandaCompleta[] {
  const categoria = richiesta.categoria
  if (!eCultura(categoria)) {
    if (!fonti.geo) throw new Error('Mancano i dati della geografia')
    return generaDomande(fonti.geo, richiesta, caso, evitare)
  }
  const quante = Math.max(1, Math.min(richiesta.quante, QUANTE_MASSIME))
  const risposte = Math.max(2, Math.min(6, richiesta.risposte ?? RISPOSTE_PREDEFINITE))
  const ambito = ambitoValido(categoria, richiesta.ambito)
  const possibili = tipiPossibili(categoria, 'scelta', ambito)
  const tipi = richiesta.tipi?.length ? new Set(richiesta.tipi.filter((t) => possibili.includes(t))) : null
  const annoMassimo = Number((richiesta.data ?? '').slice(0, 4)) || new Date().getFullYear()
  const c: Contesto = {
    caso,
    quante,
    sbagliate: risposte - 1,
    tipi: tipi && tipi.size > 0 ? tipi : null,
    notorieta: richiesta.notorieta ?? 'misti',
    ambito,
    genere: genereValido(categoria, richiesta.genere),
    nazione: diMusica(categoria) ? nazioneValida(richiesta.nazione) : null,
    evitare,
    usati: new Map(),
    giuste: new Map(),
    annoMassimo,
  }
  const domande = (() => {
    if (categoria === 'oggi') {
      if (!fonti.oggi) throw new Error('Mancano i fatti di oggi')
      return oggi(fonti.oggi, c)
    }
    const dati = fonti.cultura?.[categoria]
    if (!dati) throw new Error(`Mancano i dati di ${categoria}`)
    switch (categoria) {
      case 'arte':
        return arte(dati as DatiCultura['arte'], c)
      case 'libri':
        return libri(dati as DatiCultura['libri'], c)
      case 'cinema':
        return cinema(dati as DatiCultura['cinema'], c)
      case 'canzoni':
        return canzoni(dati as DatiCultura['canzoni'], c)
      case 'classica':
        return classica(dati as DatiCultura['classica'], c)
      case 'lirica':
        return lirica(dati as DatiCultura['lirica'], c)
      case 'nobel':
        return nobel(dati as DatiCultura['nobel'], c)
      case 'storia':
        return storia(dati as DatiCultura['storia'], c)
      case 'scienza':
        return scienza(dati as DatiCultura['scienza'], c)
    }
  })()
  return rifinisci(domande, quante, risposte, richiesta.ordine, caso)
}

/**
 * Una partita di piu' sezioni insieme, nella libera: le città, le bandiere e
 * gli stati, o la chimica e l'astronomia. Le domande si dividono in parti
 * uguali, con i resti a caso, e ognuna porta la sua sezione; poi si mettono in
 * fila mescolando le sezioni e tenendo la salita, perché ogni domanda va al
 * posto che ha nella fila della sua. Una sezione che non ne ha abbastanza —
 * gli oceani sulla cartina sono cinque — lascia il posto alle altre. Lo stesso
 * soggetto non torna in due sezioni: la Francia delle capitali tiene fuori
 * quella delle bandiere.
 */
function partitaMista(
  fonti: FontiQuiz,
  richiesta: RichiestaQuiz,
  sezioni: readonly SezioneQuiz[],
  caso: Caso,
  evitare: ReadonlySet<string>,
): DomandaCompleta[] {
  const quante = Math.max(1, Math.min(richiesta.quante, QUANTE_MASSIME))
  const visti = new Set(evitare)
  const fatte = new Map<SezioneQuiz, DomandaCompleta[]>(sezioni.map((x) => [x, []]))
  const chiedi = (x: SezioneQuiz, quanteQui: number) => {
    if (quanteQui <= 0) return 0
    const nuove = partitaDi(
      fonti,
      {
        ...richiesta,
        categoria: x.categoria,
        // I filtri di una sezione sola (il periodo dei quadri) con piu' sezioni non valgono; nella musica gli
        // anni e il paese sono di tutti i generi, e il genere e' della sezione.
        ambito: x.ambito ?? (diMusica(x.categoria) ? richiesta.ambito : undefined),
        genere: x.genere,
        nazione: diMusica(x.categoria) ? richiesta.nazione : undefined,
        sezioni: undefined,
        quante: quanteQui,
        ordine: 'sale',
      },
      caso,
      visti,
    ).filter((d) => !visti.has(d.soggetto))
    for (const d of nuove) visti.add(d.soggetto)
    const tag = {
      categoria: x.categoria,
      ...(x.ambito && x.ambito !== 'tutti' ? { ambito: x.ambito } : {}),
      ...(x.genere && x.genere !== 'tutti' ? { genere: x.genere } : {}),
    }
    fatte.get(x)!.push(...nuove.map((d) => ({ ...d, ...tag })))
    return nuove.length
  }
  // Le parti: uguali, e i resti a caso, perché la prima sezione non abbia sempre una domanda in piu'.
  const base = Math.floor(quante / sezioni.length)
  const conUnaInPiu = new Set(mescola(sezioni, caso).slice(0, quante - base * sezioni.length))
  const piene: SezioneQuiz[] = []
  let mancano = 0
  for (const x of sezioni) {
    const parte = base + (conUnaInPiu.has(x) ? 1 : 0)
    const date = chiedi(x, parte)
    if (date >= parte) piene.push(x)
    else mancano += parte - date
  }
  // Quel che manca lo fanno le sezioni che ne hanno ancora, un giro alla volta.
  for (let giro = 0; mancano > 0 && piene.length > 0 && giro < 3; giro += 1) {
    for (const x of mescola(piene, caso)) {
      if (mancano <= 0) break
      mancano -= chiedi(x, 1)
    }
  }
  const fila = [...fatte.values()].flatMap((elenco) =>
    elenco.map((d, i) => ({ d, posto: (i + 0.5) / elenco.length, prima: caso() })),
  )
  fila.sort((a, b) => a.posto - b.posto || a.prima - b.prima)
  const risposte = Math.max(2, Math.min(6, richiesta.risposte ?? RISPOSTE_PREDEFINITE))
  return rifinisci(
    fila.map((x) => x.d),
    quante,
    risposte,
    richiesta.ordine,
    caso,
  )
}

/**
 * Le domande della classificata di un giorno: la categoria e il modo del
 * giorno, in tutto il mondo. Per le città servono le piu' note del mondo
 * (`cittaDellArea`), le stesse che la pagina carica per la cartina.
 */
export function domandeDelGiornoQuiz(
  fonti: FontiQuiz,
  giornata: { categoria: CategoriaQuiz; modo: 'scelta' | 'cartina' },
  data: string,
  caso: Caso,
  evitare: ReadonlySet<string> = new Set(),
  citta?: readonly CittaQuiz[],
): DomandaCompleta[] {
  return generaPartita(
    fonti,
    {
      categoria: giornata.categoria,
      modo: giornata.modo,
      area: 'mondo',
      quante: DOMANDE_PER_PARTITA,
      data,
      ...(citta ? { citta } : {}),
    },
    caso,
    evitare,
  )
}

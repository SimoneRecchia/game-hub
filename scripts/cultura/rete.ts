/**
 * La rete delle materie di cultura: Wikidata con SPARQL, e le API di Commons e
 * di Wikipedia in italiano.
 *
 * Wikimedia risponde 429 dopo poche richieste ravvicinate da una stessa
 * macchina, e QLever pure. Per questo qui si chiede una cosa alla volta, con un
 * intervallo minimo per servizio; un 429 o un 503 fa aspettare quanto dice
 * `Retry-After`, o 20, 40, 80 secondi; e tutto resta su disco in
 * scripts/.cache/cultura, cosi' rifare lo script non chiede niente a nessuno.
 *
 * Le query SPARQL vanno in POST: molte portano elenchi di identificativi
 * (`VALUES`) che in un indirizzo non ci starebbero. Prima QLever, che risponde
 * in pochi secondi anche alle query pesanti, poi il servizio di Wikidata; le
 * regole per scriverle sono quelle di scripts/quiz/fonti.ts — niente
 * `SERVICE wikibase:label`, niente filtri numerici sui sitelink.
 *
 * Commons e Wikipedia si chiedono a gruppi (cinquanta file, venti voci), ma si
 * salvano voce per voce: se l'elenco cambia di poco, si chiede solo quel che
 * manca. Le letture delle voci (`letture`) sono l'eccezione: il servizio delle
 * statistiche ne da' una per richiesta, e si chiedono in parallelo.
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Riga } from '../quiz/fonti'

export type { Riga }

export const CACHE = join(dirname(fileURLToPath(import.meta.url)), '..', '.cache', 'cultura')

/** Chi siamo, per i server che ce lo chiedono: nessun dato personale, solo il progetto. */
const AGENTE = 'game-hub-quiz/1.0 (quiz di cultura; https://github.com/SimoneRecchia/game-hub)'

/**
 * Quanto vale una risposta SPARQL salvata: una settimana. Le query sono pesanti
 * e lo script si lancia a mano; `--rinnova` le richiede tutte. Commons e
 * Wikipedia invece non scadono: licenze e prime frasi cambiano di rado, e
 * richiederle vorrebbe dire minuti di attese.
 */
let validitaSparql = 7 * 24 * 3_600_000

export function rinnovaSparql(): void {
  validitaSparql = 0
}

const MOTORI = [
  { nome: 'QLever', url: 'https://qlever.dev/api/wikidata' },
  { nome: 'Wikidata', url: 'https://query.wikidata.org/sparql' },
]

const PREFISSI = `PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX p: <http://www.wikidata.org/prop/>
PREFIX ps: <http://www.wikidata.org/prop/statement/>
PREFIX psv: <http://www.wikidata.org/prop/statement/value/>
PREFIX pq: <http://www.wikidata.org/prop/qualifier/>
PREFIX pqv: <http://www.wikidata.org/prop/qualifier/value/>
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX schema: <http://schema.org/>
`

/** L'intervallo minimo fra due richieste allo stesso servizio. */
const INTERVALLI: Record<string, number> = {
  QLever: 2_000,
  Wikidata: 2_000,
  commons: 1_600,
  wikipedia: 1_600,
  'wikipedia-en': 1_600,
  wikidata: 1_600,
  // Le letture vanno in parallelo (`IN_VIAGGIO`), e il limite e' quello.
  letture: 0,
}

const pausa = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** Quando si e' chiesto l'ultima volta a ogni servizio. */
const ultima = new Map<string, number>()

async function turno(servizio: string): Promise<void> {
  const attesa = (ultima.get(servizio) ?? 0) + (INTERVALLI[servizio] ?? 2_000) - Date.now()
  if (attesa > 0) await pausa(attesa)
  ultima.set(servizio, Date.now())
}

/** Un errore che non si risolve riprovando: una query sbagliata, una pagina che non c'e'. */
class ErroreDefinitivo extends Error {}

/** Un servizio che chiede di aspettare: un 429, o un errore suo. `attesa` e' quanto, se lo dice. */
class ErroreRiprova extends Error {
  constructor(
    messaggio: string,
    readonly attesa?: number,
  ) {
    super(messaggio)
  }
}

/** Un solo tentativo: la risposta, o un errore che dice se ha senso riprovare. */
async function tentativo(servizio: string, url: string, init: RequestInit, limite: number): Promise<string> {
  await turno(servizio)
  let risposta: Response
  try {
    risposta = await fetch(url, {
      ...init,
      headers: { 'user-agent': AGENTE, 'api-user-agent': AGENTE, ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(limite),
    })
  } catch (e) {
    throw new ErroreRiprova(String(e).slice(0, 160))
  }
  if (risposta.ok) return await risposta.text()
  const testo = (await risposta.text()).replace(/\s+/g, ' ').slice(0, 300)
  if (risposta.status !== 429 && risposta.status < 500) {
    throw new ErroreDefinitivo(`${risposta.status} ${risposta.statusText}: ${testo}`)
  }
  const dopo = Number(risposta.headers.get('retry-after'))
  throw new ErroreRiprova(
    `${risposta.status} ${risposta.statusText}`,
    Number.isFinite(dopo) && dopo > 0 ? Math.min(dopo * 1000, 300_000) : undefined,
  )
}

/**
 * Una richiesta, con le attese di chi chiede troppo. A un 429 o a un errore del
 * server si aspetta quanto dice `Retry-After` (fino a cinque minuti), o 20, 40,
 * 80 secondi; a un errore di rete un poco meno. Un altro 4xx non si riprova.
 */
async function richiesta(
  servizio: string,
  url: string,
  init: RequestInit,
  limite: number,
  tentativi = 4,
): Promise<string> {
  let ultimoErrore: unknown
  for (let i = 0; i < tentativi; i += 1) {
    try {
      return await tentativo(servizio, url, init, limite)
    } catch (e) {
      if (!(e instanceof ErroreRiprova)) throw e
      ultimoErrore = e
      const attesa = e.attesa ?? (e.message.startsWith('429') || /^5\d\d/.test(e.message) ? 20_000 : 5_000) * 2 ** i
      console.log(`    ${servizio}: ${e.message}, riprovo fra ${Math.round(attesa / 1000)} s`)
      if (i < tentativi - 1) await pausa(attesa)
    }
  }
  throw new Error(`${servizio} non risponde: ${String(ultimoErrore)}`)
}

function leggiCache(file: string, validita: number): string | null {
  if (!existsSync(file)) return null
  if (Date.now() - statSync(file).mtimeMs > validita) return null
  return readFileSync(file, 'utf8')
}

function scriviCache(file: string, testo: string): void {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, testo)
}

/* ─────────────────────────────────  SPARQL  ───────────────────────────── */

/** Fino a quando un motore ha chiesto di lasciarlo stare, e quante volte di fila. */
const fermo = new Map<string, { fino: number; volte: number }>()

/**
 * La risposta di un motore qualunque. Quando uno chiede di aspettare si prova
 * subito l'altro, e si aspetta solo se lo chiedono tutti e due: QLever a volte
 * risponde 429 per minuti a chi condivide l'indirizzo con altri, e il servizio
 * di Wikidata regge bene le query con un elenco di voci. Un errore della query
 * (un 400) passa all'altro motore, e se lo da' anche quello la query e' sbagliata.
 */
async function daUnMotore(nome: string, query: string, motori: typeof MOTORI): Promise<string> {
  const errori: string[] = []
  const sbagliata = new Set<string>()
  for (let giro = 0; giro < 8; giro += 1) {
    for (const motore of motori) {
      const stato = fermo.get(motore.nome)
      if (sbagliata.has(motore.nome) || (stato && stato.fino > Date.now())) continue
      try {
        const t = await tentativo(
          motore.nome,
          motore.url,
          {
            method: 'POST',
            headers: { accept: 'application/sparql-results+json', 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ query }).toString(),
          },
          motore.nome === 'QLever' ? 240_000 : 90_000,
        )
        JSON.parse(t)
        fermo.delete(motore.nome)
        console.log(`  ${nome}: da ${motore.nome}`)
        return t
      } catch (e) {
        errori.push(`${motore.nome}: ${String(e).slice(0, 400)}`)
        if (e instanceof ErroreDefinitivo || e instanceof SyntaxError) {
          sbagliata.add(motore.nome)
          continue
        }
        const volte = (stato?.volte ?? 0) + 1
        const attesa = e instanceof ErroreRiprova && e.attesa ? e.attesa : Math.min(20_000 * 2 ** (volte - 1), 300_000)
        fermo.set(motore.nome, { fino: Date.now() + attesa, volte })
        console.log(`    ${nome}: ${motore.nome} ${String(e instanceof Error ? e.message : e).slice(0, 80)}`)
      }
    }
    if (sbagliata.size === motori.length) break
    const prossimo = Math.min(
      ...motori.filter((m) => !sbagliata.has(m.nome)).map((m) => fermo.get(m.nome)?.fino ?? Date.now()),
    )
    if (prossimo > Date.now()) {
      console.log(`    ${nome}: aspetto ${Math.round((prossimo - Date.now()) / 1000)} s`)
      await pausa(prossimo - Date.now())
    }
  }
  throw new Error(`La query "${nome}" non e' andata:\n  ${errori.slice(-6).join('\n  ')}`)
}

/**
 * Una query SPARQL, con le righe ridotte a stringhe come in scripts/quiz/fonti.ts:
 * gli URI delle voci diventano "Q38", anche dentro i GROUP_CONCAT, e i numeri
 * restano testo.
 */
export async function interroga(nome: string, corpo: string, solo?: 'QLever' | 'Wikidata'): Promise<Riga[]> {
  const query = PREFISSI + corpo
  const file = join(CACHE, 'sparql', `${nome}-${createHash('sha1').update(query).digest('hex').slice(0, 12)}.json`)
  let testo = leggiCache(file, validitaSparql)
  if (!testo) {
    testo = await daUnMotore(nome, query, solo ? MOTORI.filter((m) => m.nome === solo) : MOTORI)
    scriviCache(file, testo)
  }
  const risultato = JSON.parse(testo) as { results: { bindings: Array<Record<string, { value: string }>> } }
  return risultato.results.bindings.map((b) => {
    const riga: Riga = {}
    for (const [k, v] of Object.entries(b)) {
      riga[k] = v.value.replace(/<?http:\/\/www\.wikidata\.org\/entity\/(Q\d+)>?/g, '$1')
    }
    return riga
  })
}

/* ──────────────────────  Le API di Commons e di Wikipedia  ───────────────── */

type Archivio<T> = Record<string, T | null>

function leggiArchivio<T>(nome: string): Archivio<T> {
  const file = join(CACHE, `${nome}.json`)
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Archivio<T>) : {}
}

function scriviArchivio<T>(nome: string, archivio: Archivio<T>): void {
  scriviCache(join(CACHE, `${nome}.json`), JSON.stringify(archivio))
}

const BASI_API = {
  commons: 'https://commons.wikimedia.org/w/api.php',
  wikipedia: 'https://it.wikipedia.org/w/api.php',
  'wikipedia-en': 'https://en.wikipedia.org/w/api.php',
  wikidata: 'https://www.wikidata.org/w/api.php',
}

async function api(servizio: keyof typeof BASI_API, parametri: Record<string, string>): Promise<unknown> {
  const base = BASI_API[servizio]
  const url = `${base}?${new URLSearchParams({ format: 'json', formatversion: '2', ...parametri })}`
  return JSON.parse(await richiesta(servizio, url, {}, 60_000, 5))
}

interface Pagina {
  title: string
  missing?: boolean
  invalid?: boolean
}

interface Risposta<P> {
  query?: {
    pages?: P[]
    normalized?: Array<{ from: string; to: string }>
    redirects?: Array<{ from: string; to: string }>
  }
}

/**
 * I titoli chiesti ritrovati nelle pagine della risposta: le API li normalizzano
 * (la maiuscola, i trattini bassi) e seguono i rinvii, e la risposta li scrive
 * come li ha trovati.
 */
function perTitolo<P extends Pagina>(risposta: Risposta<P>, titoli: string[]): Map<string, P | null> {
  const q = risposta.query ?? {}
  const pagine = new Map((q.pages ?? []).map((p) => [p.title, p]))
  const passi = new Map<string, string>([...(q.normalized ?? []), ...(q.redirects ?? [])].map((x) => [x.from, x.to]))
  const esito = new Map<string, P | null>()
  for (const titolo of titoli) {
    let t = titolo
    for (let i = 0; i < 3 && passi.has(t); i += 1) t = passi.get(t)!
    const p = pagine.get(t)
    esito.set(titolo, p && !p.missing && !p.invalid ? p : null)
  }
  return esito
}

/** Quel che serve sapere di un file di Commons per mostrarlo senza attribuzioni. */
export interface InfoFile {
  /** Larghezza e altezza dell'originale. */
  w: number
  h: number
  mime: string
  /** LicenseShortName, License e Copyrighted dell'extmetadata. */
  nome?: string
  licenza?: string
  protetto?: string
}

interface PaginaFile extends Pagina {
  imageinfo?: Array<{
    width: number
    height: number
    mime: string
    extmetadata?: Record<string, { value: string } | undefined>
  }>
}

/** Licenza e misure dei file di Commons, per nome ("Mona Lisa.jpg"); `null` se il file non c'e'. */
export async function infoFile(nomi: readonly string[]): Promise<Map<string, InfoFile | null>> {
  const archivio = leggiArchivio<InfoFile>('commons')
  const mancano = [...new Set(nomi)].filter((n) => !(n in archivio))
  if (mancano.length > 0) console.log(`  Commons: ${mancano.length} file da chiedere`)
  for (let i = 0; i < mancano.length; i += 50) {
    const gruppo = mancano.slice(i, i + 50)
    const titoli = gruppo.map((n) => `File:${n}`)
    const risposta = (await api('commons', {
      action: 'query',
      prop: 'imageinfo',
      iiprop: 'size|mime|extmetadata',
      iiextmetadatafilter: 'LicenseShortName|License|Copyrighted',
      iiextmetadatalanguage: 'en',
      titles: titoli.join('|'),
    })) as Risposta<PaginaFile>
    const pagine = perTitolo(risposta, titoli)
    gruppo.forEach((nome, j) => {
      const info = pagine.get(titoli[j])?.imageinfo?.[0]
      const meta = info?.extmetadata ?? {}
      archivio[nome] = info
        ? {
            w: info.width,
            h: info.height,
            mime: info.mime,
            nome: meta.LicenseShortName?.value,
            licenza: meta.License?.value,
            protetto: meta.Copyrighted?.value,
          }
        : null
    })
    scriviArchivio('commons', archivio)
  }
  return new Map(nomi.map((n) => [n, archivio[n] ?? null]))
}

interface PaginaVoce extends Pagina {
  extract?: string
}

/**
 * Le prime frasi delle voci di Wikipedia in italiano, per titolo, in testo
 * semplice; `null` se la voce non c'e'. Venti per volta: e' il massimo che
 * l'API da' con `exintro`.
 */
export async function introduzioni(titoli: readonly string[]): Promise<Map<string, string | null>> {
  const archivio = leggiArchivio<string>('wikipedia')
  const mancano = [...new Set(titoli)].filter((t) => !(t in archivio))
  if (mancano.length > 0) console.log(`  Wikipedia: ${mancano.length} voci da chiedere`)
  for (let i = 0; i < mancano.length; i += 20) {
    const gruppo = mancano.slice(i, i + 20)
    const risposta = (await api('wikipedia', {
      action: 'query',
      prop: 'extracts',
      exintro: '1',
      explaintext: '1',
      exsentences: '3',
      exlimit: '20',
      redirects: '1',
      titles: gruppo.join('|'),
    })) as Risposta<PaginaVoce>
    const pagine = perTitolo(risposta, gruppo)
    for (const t of gruppo) archivio[t] = pagine.get(t)?.extract ?? null
    scriviArchivio('wikipedia', archivio)
  }
  return new Map(titoli.map((t) => [t, archivio[t] ?? null]))
}

/** Le Wikipedia da cui si leggono le pagine: l'italiana, e l'inglese per le classifiche di fuori. */
export type SitoWikipedia = 'it' | 'en'

const SERVIZIO: Record<SitoWikipedia, keyof typeof BASI_API> = { it: 'wikipedia', en: 'wikipedia-en' }

/** Quanto vale un elenco di pagine: una settimana, perché le pagine dei nuovi anni si trovino. */
const VALIDITA_ELENCHI = 7 * 24 * 3_600_000

/**
 * I titoli delle pagine che cominciano con `prefisso`: "Billboard Year-End Hot
 * 100 singles of" da' gli anni che ci sono, senza scriverli a mano, e quando
 * arriva quello nuovo lo trova da solo.
 */
export async function pagineConPrefisso(sito: SitoWikipedia, prefisso: string): Promise<string[]> {
  const file = join(CACHE, 'elenchi', `${sito}-${createHash('sha1').update(prefisso).digest('hex').slice(0, 12)}.json`)
  const salvato = leggiCache(file, VALIDITA_ELENCHI)
  if (salvato) return JSON.parse(salvato) as string[]
  const titoli: string[] = []
  let seguito: Record<string, string> = {}
  for (let giro = 0; giro < 20; giro += 1) {
    const risposta = (await api(SERVIZIO[sito], {
      action: 'query',
      list: 'allpages',
      apprefix: prefisso,
      apnamespace: '0',
      apfilterredir: 'nonredirects',
      aplimit: '500',
      ...seguito,
    })) as { query?: { allpages?: Array<{ title: string }> }; continue?: Record<string, string> }
    titoli.push(...(risposta.query?.allpages ?? []).map((p) => p.title))
    if (!risposta.continue) break
    seguito = risposta.continue
  }
  scriviCache(file, JSON.stringify(titoli))
  return titoli
}

interface PaginaTesto extends Pagina {
  revisions?: Array<{ slots?: { main?: { content?: string } } }>
}

/**
 * Il wikitesto delle pagine di Wikipedia, per titolo, seguendo i rinvii; `null`
 * se la pagina non c'e'. Dieci per volta, perché le pagine delle classifiche
 * sono lunghe. Come le prime frasi non scade: la classifica di un anno chiuso
 * non cambia. Una pagina che non c'e' non si salva, e si richiede: puo' essere
 * quella dell'anno che sta per chiudersi.
 */
export async function wikitesti(sito: SitoWikipedia, titoli: readonly string[]): Promise<Map<string, string | null>> {
  const nome = `wikitesti-${sito}`
  const archivio = leggiArchivio<string>(nome)
  const mancano = [...new Set(titoli)].filter((t) => !(t in archivio))
  if (mancano.length > 0) console.log(`  Wikipedia (${sito}): ${mancano.length} pagine da leggere`)
  for (let i = 0; i < mancano.length; i += 10) {
    const gruppo = mancano.slice(i, i + 10)
    const risposta = (await api(SERVIZIO[sito], {
      action: 'query',
      prop: 'revisions',
      rvprop: 'content',
      rvslots: 'main',
      redirects: '1',
      titles: gruppo.join('|'),
    })) as Risposta<PaginaTesto>
    const pagine = perTitolo(risposta, gruppo)
    for (const t of gruppo) {
      const testo = pagine.get(t)?.revisions?.[0]?.slots?.main?.content
      if (testo !== undefined) archivio[t] = testo
    }
    scriviArchivio(nome, archivio)
  }
  return new Map(titoli.map((t) => [t, archivio[t] ?? null]))
}

interface PaginaVoceWikidata extends Pagina {
  pageprops?: { wikibase_item?: string }
}

/**
 * La voce di Wikidata delle pagine di Wikipedia, per titolo, seguendo i rinvii:
 * e' cosi' che un collegamento in una tabella ("[[Cenere (Lazza)|Cenere]]")
 * diventa una voce di cui si sanno l'anno, chi la canta e da dove viene.
 * Cinquanta per volta; `null` per una pagina che non c'e' o non ha una voce.
 */
export async function vociDiWikidata(
  sito: SitoWikipedia,
  titoli: readonly string[],
): Promise<Map<string, string | null>> {
  const nome = `wikidata-di-${sito}`
  const archivio = leggiArchivio<string>(nome)
  const mancano = [...new Set(titoli)].filter((t) => !(t in archivio))
  if (mancano.length > 0) console.log(`  Wikipedia (${sito}): le voci di Wikidata di ${mancano.length} pagine`)
  for (let i = 0; i < mancano.length; i += 50) {
    const gruppo = mancano.slice(i, i + 50)
    const risposta = (await api(SERVIZIO[sito], {
      action: 'query',
      prop: 'pageprops',
      ppprop: 'wikibase_item',
      redirects: '1',
      titles: gruppo.join('|'),
    })) as Risposta<PaginaVoceWikidata>
    const pagine = perTitolo(risposta, gruppo)
    for (const t of gruppo) archivio[t] = pagine.get(t)?.pageprops?.wikibase_item ?? null
    if ((i / 50) % 10 === 9 || i + 50 >= mancano.length) scriviArchivio(nome, archivio)
  }
  return new Map(titoli.map((t) => [t, archivio[t] ?? null]))
}

/** L'anno delle letture: uno intero e passato, così rifare lo script da' gli stessi numeri. */
export const ANNO_LETTURE = 2025

/** Quante richieste delle letture sono in viaggio insieme: il servizio ne regge cento al secondo. */
const IN_VIAGGIO = 6

/**
 * Quanto si legge in un anno ogni voce di Wikipedia in italiano, per titolo: le
 * visite di un mese tipico (la mediana dei dodici) per dodici. La mediana e non
 * la somma, perché un mese solo — un film in televisione, un anniversario, un
 * giro di programmi che si fingono persone — non faccia famosa una voce
 * qualunque. Zero se la voce non ha visite, o non c'e'.
 *
 * Il servizio delle statistiche risponde una voce alla volta: qui se ne chiedono
 * `IN_VIAGGIO` insieme, e l'archivio si salva ogni tanto e alla fine.
 */
export async function letture(titoli: readonly string[]): Promise<Map<string, number>> {
  const archivio = leggiArchivio<number>('letture')
  const mancano = [...new Set(titoli)].filter((t) => !(t in archivio))
  if (mancano.length > 0) console.log(`  Wikipedia: le letture di ${mancano.length} voci`)
  let prossima = 0
  let fatte = 0
  const lavora = async () => {
    while (prossima < mancano.length) {
      const titolo = mancano[prossima]
      prossima += 1
      const url =
        'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/it.wikipedia/all-access/user/' +
        `${encodeURIComponent(titolo.replace(/ /g, '_'))}/monthly/${ANNO_LETTURE}010100/${ANNO_LETTURE}123100`
      let mesi: number[] = []
      try {
        const risposta = JSON.parse(await richiesta('letture', url, {}, 30_000, 5)) as { items?: { views: number }[] }
        mesi = (risposta.items ?? []).map((i) => i.views)
      } catch (e) {
        // Una voce senza visite nell'anno il servizio non la conosce: 404.
        if (!(e instanceof ErroreDefinitivo && e.message.startsWith('404'))) throw e
      }
      const dodici = [...mesi, ...Array<number>(Math.max(0, 12 - mesi.length)).fill(0)].sort((a, b) => a - b)
      archivio[titolo] = Math.round(((dodici[5] + dodici[6]) / 2) * 12)
      fatte += 1
      if (fatte % 250 === 0) {
        scriviArchivio('letture', archivio)
        console.log(`    ${fatte} di ${mancano.length}`)
      }
    }
  }
  await Promise.all(Array.from({ length: IN_VIAGGIO }, lavora))
  if (mancano.length > 0) scriviArchivio('letture', archivio)
  return new Map(titoli.map((t) => [t, archivio[t] ?? 0]))
}

interface Dichiarazione {
  rank?: string
  mainsnak?: { datavalue?: { value?: { id?: string } } }
}

/**
 * L'ordine delle dichiarazioni, che SPARQL non dice e l'API di Wikidata si':
 * gli autori di un libro "nell'ordine di Wikidata" sono Marx e poi Engels.
 * Serve solo per le voci con piu' valori, e si chiede a gruppi di cinquanta.
 */
export async function ordineDichiarazioni(
  ids: readonly string[],
  proprieta: readonly string[],
): Promise<Map<string, Map<string, string[]>>> {
  const archivio = leggiArchivio<string[]>('wikidata-ordine')
  const chiave = (id: string, p: string) => `${id} ${p}`
  const mancano = [...new Set(ids)].filter((id) => proprieta.some((p) => !(chiave(id, p) in archivio)))
  if (mancano.length > 0) console.log(`  Wikidata: l'ordine di ${mancano.length} voci`)
  for (let i = 0; i < mancano.length; i += 50) {
    const gruppo = mancano.slice(i, i + 50)
    const risposta = (await api('wikidata', { action: 'wbgetentities', props: 'claims', ids: gruppo.join('|') })) as {
      entities?: Record<string, { claims?: Record<string, Dichiarazione[]> }>
    }
    for (const id of gruppo) {
      const dichiarazioni = risposta.entities?.[id]?.claims ?? {}
      for (const p of proprieta) {
        archivio[chiave(id, p)] = (dichiarazioni[p] ?? [])
          .filter((d) => d.rank !== 'deprecated')
          .map((d) => d.mainsnak?.datavalue?.value?.id)
          .filter((x): x is string => !!x)
      }
    }
    scriviArchivio('wikidata-ordine', archivio)
  }
  return new Map(ids.map((id) => [id, new Map(proprieta.map((p) => [p, archivio[chiave(id, p)] ?? []]))]))
}

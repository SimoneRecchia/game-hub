/**
 * Da dove vengono i dati del quiz: Wikidata e Natural Earth.
 *
 * Wikidata si interroga con SPARQL. Il servizio ufficiale (query.wikidata.org)
 * va in timeout dopo un minuto, e "i seicento fiumi con piu' voci di
 * Wikipedia" ci arriva: per questo si chiede prima a QLever, un motore
 * dell'Università di Friburgo sugli stessi dati che risponde in pochi secondi,
 * e al servizio ufficiale solo se QLever non risponde. Le query sono scritte per
 * andare bene a tutti e due: niente `SERVICE wikibase:label`, che QLever non ha,
 * e niente filtri numerici sui sitelink, che QLever sbaglia — si ordina e si
 * taglia.
 *
 * Natural Earth arriva da jsDelivr, a versioni fisse: i paesi di world-atlas e
 * i mari del repository di Natural Earth. Sono gli stessi file che la cartina
 * muta scarica nel browser.
 *
 * Tutto passa da una cache su disco (scripts/.cache/quiz), valida mezza
 * giornata: provare lo script in locale dieci volte non deve voler dire dieci
 * giri di query.
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const CACHE = join(dirname(fileURLToPath(import.meta.url)), '..', '.cache', 'quiz')
const VALIDITA_CACHE_MS = 12 * 3_600_000

/** Chi siamo, per i server che ce lo chiedono: nessun dato personale, solo il progetto. */
const AGENTE = 'game-hub-quiz/1.0 (quiz di geografia; https://github.com/SimoneRecchia/game-hub)'

export { URL_ACQUE as URL_MARI, URL_CONFINI as URL_PAESI } from '../../shared/quiz-dati'

const MOTORI = [
  { nome: 'QLever', url: 'https://qlever.dev/api/wikidata' },
  { nome: 'Wikidata', url: 'https://query.wikidata.org/sparql' },
]

const PREFISSI = `PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX p: <http://www.wikidata.org/prop/>
PREFIX ps: <http://www.wikidata.org/prop/statement/>
PREFIX pq: <http://www.wikidata.org/prop/qualifier/>
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
`

function inCache(chiave: string): string | null {
  const file = join(CACHE, `${chiave}.json`)
  if (!existsSync(file)) return null
  if (Date.now() - statSync(file).mtimeMs > VALIDITA_CACHE_MS) return null
  return readFileSync(file, 'utf8')
}

function inCacheScrivi(chiave: string, testo: string): void {
  mkdirSync(CACHE, { recursive: true })
  writeFileSync(join(CACHE, `${chiave}.json`), testo)
}

async function scarica(url: string, init: RequestInit = {}, tentativi = 3): Promise<string> {
  let ultimo: unknown
  for (let i = 0; i < tentativi; i += 1) {
    try {
      const risposta = await fetch(url, {
        ...init,
        headers: { 'user-agent': AGENTE, ...(init.headers ?? {}) },
        signal: AbortSignal.timeout(90_000),
      })
      if (!risposta.ok) throw new Error(`${risposta.status} ${risposta.statusText}`)
      return await risposta.text()
    } catch (e) {
      ultimo = e
      await new Promise((r) => setTimeout(r, 2_000 * 2 ** i))
    }
  }
  throw new Error(`Non riesco a scaricare ${url}: ${String(ultimo)}`)
}

/** Un file di Natural Earth o di world-atlas, dalla cache se c'e'. */
export async function geometria<T>(url: string): Promise<T> {
  const chiave = createHash('sha1').update(url).digest('hex').slice(0, 16)
  const salvato = inCache(chiave)
  if (salvato) return JSON.parse(salvato) as T
  const testo = await scarica(url)
  inCacheScrivi(chiave, testo)
  return JSON.parse(testo) as T
}

export type Riga = Record<string, string | undefined>

/**
 * Una query SPARQL, con le righe ridotte a stringhe: `?paese` diventa "Q38",
 * gli URI di Wikidata perdono il prefisso, i numeri restano testo.
 */
export async function sparql(nome: string, corpo: string): Promise<Riga[]> {
  const query = PREFISSI + corpo
  const chiave = `${nome}-${createHash('sha1').update(query).digest('hex').slice(0, 12)}`
  const salvato = inCache(chiave)
  const testo =
    salvato ??
    (await (async () => {
      const errori: string[] = []
      for (const motore of MOTORI) {
        try {
          const t = await scarica(`${motore.url}?query=${encodeURIComponent(query)}`, {
            headers: { accept: 'application/sparql-results+json' },
          }, 2)
          JSON.parse(t)
          console.log(`  ${nome}: da ${motore.nome}`)
          return t
        } catch (e) {
          errori.push(`${motore.nome}: ${String(e)}`)
        }
      }
      throw new Error(`La query "${nome}" non e' andata:\n  ${errori.join('\n  ')}`)
    })())
  if (!salvato) inCacheScrivi(chiave, testo)
  const risultato = JSON.parse(testo) as {
    results: { bindings: Array<Record<string, { value: string }>> }
  }
  return risultato.results.bindings.map((b) => {
    const riga: Riga = {}
    for (const [k, v] of Object.entries(b)) {
      // Anche dentro i GROUP_CONCAT, dove QLever lascia gli URI fra parentesi angolari.
      riga[k] = v.value.replace(/<?http:\/\/www\.wikidata\.org\/entity\/(Q\d+)>?/g, '$1')
    }
    return riga
  })
}

/* ─────────────────────────────────  Le query  ───────────────────────────── */

/**
 * Le etichette di una voce: italiana, multilingue, inglese. Wikidata sta
 * spostando i nomi uguali in tutte le lingue sotto "mul": Oslo non ha piu' ne'
 * l'italiano ne' l'inglese, e senza il ripiego la Norvegia restava senza capitale.
 */
const ETICHETTE = (x: string) => `OPTIONAL { ?${x} rdfs:label ?nome . FILTER(LANG(?nome) = "it") }
  OPTIONAL { ?${x} rdfs:label ?nomeMul . FILTER(LANG(?nomeMul) = "mul") }
  OPTIONAL { ?${x} rdfs:label ?nomeEn . FILTER(LANG(?nomeEn) = "en") }`

/**
 * Gli stati: i sovrani con un codice ISO, piu' la Danimarca, che su Wikidata
 * ha il codice sulla Danimarca e l'indipendenza sul Regno di Danimarca.
 */
const STATI = `{ ?paese wdt:P31 wd:Q3624078 } UNION { VALUES ?paese { wd:Q35 } }
  ?paese wdt:P297 ?iso2 .
  FILTER NOT EXISTS { ?paese wdt:P576 ?fine }`

export const Q_PAESI = `SELECT ?paese ?iso2 ?nome ?nomeMul ?nomeEn
    (SAMPLE(?num) AS ?numerico) (MAX(?link) AS ?voci) (MAX(?area) AS ?superficie) (MAX(?pop) AS ?abitanti)
    (GROUP_CONCAT(DISTINCT STR(?cont); separator=" ") AS ?continenti)
  WHERE {
  ${STATI}
  OPTIONAL { ?paese wdt:P299 ?num }
  ${ETICHETTE('paese')}
  OPTIONAL { ?paese wikibase:sitelinks ?link }
  OPTIONAL { ?paese wdt:P2046 ?area }
  OPTIONAL { ?paese wdt:P1082 ?pop }
  OPTIONAL { ?paese wdt:P30 ?cont }
}
GROUP BY ?paese ?iso2 ?nome ?nomeMul ?nomeEn`

/** Le capitali in carica: senza data di fine. Piu' d'una per paese si sceglie dopo. */
export const Q_CAPITALI = `SELECT ?iso2 ?capitale ?nome ?nomeMul ?nomeEn (MAX(?link) AS ?voci) WHERE {
  ${STATI}
  ?paese p:P36 ?st . ?st ps:P36 ?capitale .
  FILTER NOT EXISTS { ?st pq:P582 ?finecap }
  ${ETICHETTE('capitale')}
  OPTIONAL { ?capitale wikibase:sitelinks ?link }
}
GROUP BY ?iso2 ?capitale ?nome ?nomeMul ?nomeEn`

/**
 * I confini. I Paesi Bassi sono il caso da ricordare: molti puntano ai Paesi
 * Bassi "nazione costitutiva", senza codice ISO, che sta sul Regno.
 */
export const Q_CONFINI = `SELECT ?iso2 (GROUP_CONCAT(DISTINCT ?altro; separator=" ") AS ?confini) WHERE {
  ${STATI}
  ?paese wdt:P47 ?vicino .
  { ?vicino wdt:P297 ?altro } UNION { ?vicino wdt:P17 ?stato . ?stato wdt:P297 ?altro }
}
GROUP BY ?iso2`

/** Le città con piu' abitanti: la piu' grande di ogni paese, se non e' la capitale, e' il trabocchetto. */
export const Q_CITTA = `SELECT ?iso2 ?citta ?nome (MAX(?pop) AS ?abitanti) WHERE {
  ${STATI}
  ?citta wdt:P17 ?paese ; wdt:P1082 ?pop .
  ?citta wdt:P31/wdt:P279* wd:Q515 .
  ?citta rdfs:label ?nome . FILTER(LANG(?nome) = "it")
}
GROUP BY ?iso2 ?citta ?nome
ORDER BY DESC(?abitanti)
LIMIT 8000`

/** I paesi di un fiume o di un lago, anche quando Wikidata indica la parte (i Paesi Bassi) e non lo stato. */
const PAESI_DI = (x: string) =>
  `OPTIONAL { ?${x} wdt:P17 ?luogo . { ?luogo wdt:P297 ?iso2 } UNION { ?luogo wdt:P17 ?stato . ?stato wdt:P297 ?iso2 } }`

/**
 * I fiumi piu' noti: quelli con piu' voci di Wikipedia, che siano davvero fiumi
 * — con una foce — e non valli o laghi classificati come tali.
 */
export const Q_FIUMI = `SELECT ?fiume ?nome ?nomeMul ?voci (GROUP_CONCAT(DISTINCT ?iso2; separator=" ") AS ?paesi) WHERE {
  { SELECT DISTINCT ?fiume ?voci WHERE {
      ?fiume wdt:P31/wdt:P279* wd:Q4022 .
      ?fiume wdt:P403 ?foce .
      ?fiume wikibase:sitelinks ?voci .
      FILTER NOT EXISTS { ?fiume wdt:P31 wd:Q23397 }
    } ORDER BY DESC(?voci) LIMIT 700 }
  ${PAESI_DI('fiume')}
  OPTIONAL { ?fiume rdfs:label ?nome . FILTER(LANG(?nome) = "it") }
  OPTIONAL { ?fiume rdfs:label ?nomeMul . FILTER(LANG(?nomeMul) = "mul") }
}
GROUP BY ?fiume ?nome ?nomeMul ?voci`

/**
 * I laghi piu' noti, con la superficie: sotto i dieci chilometri quadrati un
 * lago e' famoso per altro (un cratere, una sorgente) e non da' una domanda.
 * Fuori le baie, i porti e le lagune classificati come laghi, e i laghi che non
 * ci sono piu' — il lago Agassiz si e' prosciugato ottomila anni fa.
 */
export const Q_LAGHI = `SELECT ?lago ?nome ?nomeMul ?voci (MAX(?area) AS ?superficie) (GROUP_CONCAT(DISTINCT ?iso2; separator=" ") AS ?paesi) WHERE {
  { SELECT DISTINCT ?lago ?voci WHERE {
      ?lago wdt:P31/wdt:P279* wd:Q23397 .
      ?lago wikibase:sitelinks ?voci .
      FILTER NOT EXISTS { ?lago wdt:P31 ?altro . VALUES ?altro { wd:Q39594 wd:Q283202 wd:Q187223 wd:Q1322134 wd:Q47053 wd:Q45776 wd:Q1140845 wd:Q7205721 wd:Q55965244 } }
    } ORDER BY DESC(?voci) LIMIT 500 }
  ${PAESI_DI('lago')}
  OPTIONAL { ?lago wdt:P2046 ?area }
  OPTIONAL { ?lago rdfs:label ?nome . FILTER(LANG(?nome) = "it") }
  OPTIONAL { ?lago rdfs:label ?nomeMul . FILTER(LANG(?nomeMul) = "mul") }
}
GROUP BY ?lago ?nome ?nomeMul ?voci`

/**
 * Le acque di Natural Earth su Wikidata: di cosa fanno parte (anche piu' in su,
 * per scavalcare i pezzi intermedi come "Atlantico settentrionale") e quante
 * voci hanno.
 */
export function qAcque(id: readonly string[]): string {
  const valori = id.map((q) => `wd:${q}`).join(' ')
  return `SELECT ?acqua ?nome ?voci ?antenato WHERE {
  VALUES ?acqua { ${valori} }
  OPTIONAL { ?acqua wikibase:sitelinks ?voci }
  OPTIONAL { ?acqua rdfs:label ?nome . FILTER(LANG(?nome) = "it") }
  OPTIONAL { ?acqua wdt:P361+ ?antenato . VALUES ?antenato { ${valori} } }
}`
}

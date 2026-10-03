/**
 * Il lessico di "Nomi, cose e città": per ogni lettera del gioco, le parole
 * che ogni categoria riconosce, in public/dati/nomi-cose/<lettera>.json; e in
 * shared/nomi-cose-lessico.ts l'impronta di ogni file e quante parole ha ogni
 * categoria con ogni lettera, che decidono quali categorie possono uscire.
 * Ogni file ha anche le parole note di ogni categoria (`note`), come le
 * scriverebbe una persona: le risposte del computer della libera.
 *
 * E' permissivo di proposito, come il dizionario dello Scarabeo: in una
 * partita a tempo rifiutare una risposta giusta e' molto peggio che
 * accettarne una insolita. Le parole sono gia' come le confronta il gioco
 * (`normalizza`), al singolare e al maschile dove si puo': "le arance" e
 * "pittrice" le ritrova `riconosci`, che prova anche le forme base.
 *
 * FONTI
 *
 *  - il Wikizionario italiano e le voci italiane del Wiktionary inglese,
 *    nelle estrazioni di kaikki.org (CC BY-SA 4.0): i nomi comuni con il loro
 *    ambito ("Zoologia", "Professioni", "Abbigliamento"; "Fruits" e
 *    "Musical instruments" per l'inglese), i verbi, gli aggettivi, i nomi di
 *    persona, qualche citta', stato e fiume;
 *  - Wikidata (CC0), con QLever: i comuni italiani, le citta' del mondo con
 *    almeno cinquantamila abitanti e le capitali, gli stati, i fiumi, i laghi
 *    e i mari con una voce sulla Wikipedia in italiano, i nomi italiani delle
 *    specie animali e vegetali, i nomi di persona che portano almeno tre
 *    persone note, i mestieri, gli sport, gli strumenti, i colori, i vestiti,
 *    i frutti, gli ortaggi e i piatti;
 *  - napolux/paroleitaliane (MIT): i nomi di persona; le parole attestate,
 *    che decidono quali voci del Wiktionary inglese entrano fra le cose, i
 *    verbi e gli aggettivi (ha molte forme antiche); e le parolacce, che
 *    restano fuori da tutto;
 *  - per le parole note: le frequenze dei sottotitoli italiani
 *    (hermitdave/FrequencyWords, MIT); e da Wikidata in quante Wikipedia ha
 *    una voce ogni citta', paese e acqua, e quanti italiani portano ogni nome.
 *
 * Quel che resta fuori: le voci che il Wiktionary da' solo come volgari,
 * offensive, antiche o dialettali, le sigle, le etichette di Wikidata che
 * sono nomi scientifici ("Vulpes vulpes") o non sembrano italiane, e i
 * plurali di una parola che c'e' gia' ("talpe" accanto a "talpa"), che
 * conterebbero come una risposta diversa.
 *
 * Tutto quel che arriva dalla rete resta in scripts/.cache/nomi-cose: le
 * risposte di QLever, e un estratto dei due Wiktionary, che si legge in pochi
 * secondi invece di mezzo minuto. Rifare lo script non chiede niente a
 * nessuno. Accanto c'e' fonti.json, che dice da dove viene ogni parola: e' il
 * posto dove guardare quando il gioco ne accetta una che non dovrebbe.
 *
 *   npx vite-node scripts/genera-lessico-nomi.ts              (npm run nomi:lessico)
 *   … -- --rinnova     richiede di nuovo le query a QLever
 *   … -- --offline     non va in rete: si ferma se manca qualcosa
 *   … -- --campioni    stampa quindici parole a caso per categoria, con la A, la M e la Z
 */

import { createHash } from 'node:crypto'
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { createGunzip } from 'node:zlib'
import { mulberry32 } from '../shared/daily'
import {
  CATEGORIE_PER_PARTITA,
  DAVANTI_ACQUE,
  LETTERE_NOMI,
  PAROLE_MINIME,
  TUTTE_LE_CATEGORIE,
  categorieIdonee,
  formeBase,
  lessicoDa,
  normalizza,
  riconosci,
  senzaArticolo,
  type CategoriaNomi,
  type FileLessicoNomi,
  type LetteraNomi,
} from '../shared/nomi-cose'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..')
const CACHE = join(RADICE, 'scripts', '.cache')
const CACHE_NOMI = join(CACHE, 'nomi-cose')
const CARTELLA = join(RADICE, 'public', 'dati', 'nomi-cose')
const FILE_CONTI = join(RADICE, 'shared', 'nomi-cose-lessico.ts')

/** Il peso massimo del file di una lettera, e di tutti insieme: si scaricano su un telefono. */
const MASSIMO_FILE = 450 * 1024
const MASSIMO_TOTALE = 4 * 1024 * 1024

const argomenti = process.argv.slice(2)
const OFFLINE = argomenti.includes('--offline')
const RINNOVA = argomenti.includes('--rinnova')

/** Chi siamo, per i server che ce lo chiedono: nessun dato personale, solo il progetto. */
const AGENTE = 'game-hub-nomi-cose/1.0 (lessico di Nomi, cose e città; https://github.com/SimoneRecchia/game-hub)'

const NAPOLUX = 'https://raw.githubusercontent.com/napolux/paroleitaliane/master/paroleitaliane'
const FONTI = {
  parole: { url: `${NAPOLUX}/280000_parole_italiane.txt`, file: '280000_parole_italiane.txt' },
  nomi: { url: `${NAPOLUX}/9000_nomi_propri.txt`, file: '9000_nomi_propri.txt' },
  parolacce: { url: `${NAPOLUX}/lista_badwords.txt`, file: 'lista_badwords.txt' },
  // Le stesse estrazioni del dizionario dello Scarabeo e del cruciverba: la cache e' una sola.
  wikizionario: {
    url: 'https://kaikki.org/itwiktionary/raw-wiktextract-data.jsonl.gz',
    file: 'itwiktionary-wiktextract.jsonl.gz',
  },
  wiktionary: {
    url: 'https://kaikki.org/dictionary/Italian/kaikki.org-dictionary-Italian.jsonl.gz',
    file: 'enwiktionary-italiano.jsonl.gz',
  },
  // Le stesse frequenze del Wordle: quanto e' nota una parola, per le parole note.
  frequenze: {
    url: 'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/it/it_50k.txt',
    file: 'it_50k.txt',
  },
}

const pausa = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const sha1 = (testo: string) => createHash('sha1').update(testo).digest('hex')
const righe = (testo: string) =>
  testo
    .split('\n')
    .map((r) => r.trim())
    .filter(Boolean)

/** Un insieme scritto come elenco: le voci sono separate da "|". */
const elenco = (...gruppi: string[]) => new Set(gruppi.flatMap((g) => g.split('|')))

/** La fine di una parola. Non `\b`, che non sa che "à" e' una lettera: in "città di" non trova la fine di "città". */
const FINE = '(?![\\p{L}\\p{N}])'

/** Gli aggettivi che possono stare davanti a quel che una cosa e': "piccolo recipiente", "lunga asta". */
const DI_FORMA = '(?:piccol|grand|lung|cort|sottil|robust|legger|pesant|antic|tipic|semplic|special|apposit)\\p{L}*'

/**
 * Una glossa (o un'etichetta) che comincia con una di queste parole. Le
 * alternative sono separate da "|", e l'asterisco vuol dire "una parola che
 * comincia cosi'": "cavit*" e' cavita' e cavitazione. Davanti possono stare
 * una parola fra parentesi, un articolo, e fino a `salta` parole qualunque
 * ("densa pietanza", "tipo di salume"), o solo un aggettivo di forma
 * ("piccolo recipiente", non "quantita' di oggetti").
 */
function comincia(salta: number | 'aggettivo', ...gruppi: string[]): RegExp {
  const alternative = gruppi
    .flatMap((g) => g.split('|'))
    .map((a) => a.trim().replace(/\*/g, '\\p{L}*').replace(/ /g, '\\s+'))
  const parole = salta === 'aggettivo' ? `(?:${DI_FORMA}\\s+)?` : `(?:\\S+\\s+){0,${salta}}?`
  const prima = `(?:\\([^)]*\\)\\s*)?(?:(?:il|lo|la|i|gli|le|un|una|uno)\\s+|l['’]\\s*)?${parole}`
  return new RegExp(`^${prima}(?:${alternative.join('|')})${FINE}`, 'iu')
}

async function fonte({ url, file }: { url: string; file: string }): Promise<string> {
  const locale = join(CACHE, file)
  if (existsSync(locale)) return locale
  if (OFFLINE) throw new Error(`Manca ${file} in scripts/.cache e sono in --offline`)
  console.log(`  scarico ${file}…`)
  const risposta = await fetch(url, { headers: { 'user-agent': AGENTE } })
  if (!risposta.ok) throw new Error(`${file}: HTTP ${risposta.status}`)
  mkdirSync(CACHE, { recursive: true })
  writeFileSync(locale, Buffer.from(await risposta.arrayBuffer()))
  return locale
}

/* ────────────────────────────  Il Wiktionary  ───────────────────────────── */

/** Cambia quando cambia quel che l'estratto tiene: l'estratto vecchio si rifà. */
const VERSIONE_ESTRATTO = 6

interface Senso {
  /** Gli ambiti: categorie, argomenti, etichette ("Zoologia-IT", "zoology", "professione"; "Fruits" in inglese). */
  c: string[]
  /** Le etichette di registro e di forma ("archaic", "vulgar", "toscano"). */
  t: string[]
  /** La prima glossa, accorciata: per i nomi e gli aggettivi, non per i verbi. */
  g: string
}

interface Voce {
  /** Da quale Wiktionary: il Wikizionario o le voci italiane di quello inglese. */
  s: 'it' | 'en'
  /** La parte del discorso: noun, name, adj, verb. */
  p: string
  w: string
  /** Un lemma: almeno un senso che non e' una forma flessa o un rimando. */
  l: boolean
  /** Le categorie della voce intera (il Wikizionario), per le voci i cui sensi non ne hanno. */
  c: string[]
  sensi: Senso[]
  /** Le forme femminili che la voce elenca, dei nomi e degli aggettivi: "maestro" → "maestra". */
  fem: string[]
  /** I plurali che la voce elenca, dei nomi: "dente" → "denti", "puma" → "puma". */
  plu: string[]
  /** Le parole di cui la voce e' il femminile: "pittrice" → "pittore". */
  femDi: string[]
  /** Una voce al plurale: "spaghetti", "lemuri", "Coccodrilli", "occhiali". */
  pl: boolean
}

interface Estratto {
  chiave: string
  voci: Voce[]
  /** Tutte le parole e le forme che i due Wiktionary conoscono, normalizzate. */
  vocabolario: string[]
  /**
   * Le altre parti del discorso delle parole frequenti, come sono scritte:
   * "ancora" e' anche un avverbio, "letto" un participio ("verb~": una voce
   * di un verbo). Dicono quando la frequenza di un nome non e' la sua.
   */
  altre: Record<string, string[]>
}

type CategoriaGrezza = string | { orig?: string; name?: string }
interface SensoGrezzo {
  glosses?: string[]
  tags?: string[]
  raw_tags?: string[]
  topics?: string[]
  categories?: CategoriaGrezza[]
  form_of?: Array<{ word?: string }>
  alt_of?: Array<{ word?: string }>
  compound_of?: unknown[]
}
interface VoceGrezza {
  word?: string
  lang_code?: string
  pos?: string
  tags?: string[]
  categories?: CategoriaGrezza[]
  senses?: SensoGrezzo[]
  forms?: Array<{ form?: string; tags?: string[] }>
}

const PARTI = new Set(['noun', 'name', 'adj', 'verb'])
const RIMANDI = new Set(['form-of', 'alt-of', 'compound-of'])
/**
 * La glossa di una forma flessa. Il Wikizionario ha pagine per i plurali e i
 * femminili ("denti": "plurale di dente"; "canina": "femminile di canino")
 * che l'estrazione non sempre segna come forme: senza, "canina" sarebbe un
 * aggettivo a se', e un'altra risposta di "canino".
 */
const GLOSSA_FORMA = new RegExp(
  '^(?:(?:femminile|maschile)(?:\\s+(?:singolare|plurale))?|plurale|singolare)' +
    "\\s+(?:di|del|dello|della|dell['’]|dei|degli|delle)\\b" +
    '|^(?:(?:feminine|masculine)\\s+(?:singular|plural)|plural|female equivalent)\\s+of\\b',
  'i',
)
/** "femminile di pittore", "female equivalent of cuoco". */
const GLOSSA_FEMMINILE = { it: /^femminile\b/i, en: /^female equivalent of\b/i }
/** Il maschile scritto nella glossa di un femminile: "femminile di abate". */
const FEMMINILE_DI = /^femminile(?:\s+singolare)?\s+(?:di|del|dello|della|dell['’])\s*([\p{L}'’-]+)\s*$/iu

/** Il nome di una categoria: quelle del Wiktionary inglese sono "it:Fruits", e servono solo quelle. */
function nomeCategoria(c: CategoriaGrezza, fonte: 'it' | 'en'): string | null {
  const nome = typeof c === 'string' ? c : (c.orig ?? c.name ?? '')
  if (fonte === 'it') return nome || null
  return nome.startsWith('it:') ? nome.slice(3) : null
}

function voceDa(grezza: VoceGrezza, fonte: 'it' | 'en'): Voce | null {
  const p = grezza.pos ?? ''
  const w = grezza.word ?? ''
  if (!PARTI.has(p) || !w) return null
  const sensiGrezzi = grezza.senses ?? []
  const rimando = (s: SensoGrezzo) =>
    !!(s.form_of?.length || s.alt_of?.length || s.compound_of?.length) ||
    (s.tags ?? []).some((t) => RIMANDI.has(t)) ||
    GLOSSA_FORMA.test(s.glosses?.[0] ?? '')
  const l = !(grezza.tags ?? []).includes('form-of') && sensiGrezzi.some((s) => !rimando(s))
  // Delle forme flesse servono solo i femminili dei nomi, per i mestieri e per le risposte uguali.
  const femDi =
    l || p !== 'noun'
      ? []
      : sensiGrezzi
          .filter((s) => GLOSSA_FEMMINILE[fonte].test(s.glosses?.[0] ?? ''))
          .flatMap((s) => {
            const di = (s.form_of ?? []).map((x) => x.word ?? '').filter(Boolean)
            const scritto = fonte === 'it' ? FEMMINILE_DI.exec(s.glosses?.[0] ?? '')?.[1] : undefined
            return di.length > 0 ? di : scritto ? [scritto] : []
          })
  if (!l && femDi.length === 0) return null
  const conGlossa = p !== 'verb'
  const sensi = sensiGrezzi.map((s) => ({
    c: [
      ...(s.categories ?? []).map((c) => nomeCategoria(c, fonte)).filter((c): c is string => !!c),
      ...(fonte === 'it' ? [...(s.topics ?? []), ...(s.raw_tags ?? [])] : []),
    ],
    t: [...(s.tags ?? []), ...(s.raw_tags ?? [])],
    g: conGlossa ? (s.glosses?.[0] ?? '').slice(0, 160) : '',
  }))
  const c =
    fonte === 'it'
      ? (grezza.categories ?? []).map((x) => nomeCategoria(x, 'it')).filter((x): x is string => !!x)
      : []
  const forme = (vale: (tag: string[]) => boolean) =>
    (grezza.forms ?? [])
      .filter((f) => vale(f.tags ?? []))
      .map((f) => f.form ?? '')
      .filter(Boolean)
  const fem =
    l && (p === 'noun' || p === 'adj')
      ? forme((t) => t.includes('feminine') && !t.includes('plural')).filter((f) => f !== w)
      : []
  // I plurali anche quando sono come il singolare ("puma", "città"): dicono che il nome non cambia.
  const plu = l && p === 'noun' ? forme((t) => t.includes('plural')) : []
  const tag = grezza.tags ?? []
  const pl =
    (tag.includes('plural') && !tag.includes('singular')) ||
    (sensiGrezzi.length > 0 && sensiGrezzi.every((s) => (s.tags ?? []).includes('plural')))
  return { s: fonte, p, w, l, c, sensi, fem, femDi, pl, plu }
}

/**
 * Quel che serve dei due Wiktionary: le voci dei nomi, dei nomi propri, degli
 * aggettivi e dei verbi, e tutte le parole che conoscono. Leggere i due file
 * interi costa una trentina di secondi; l'estratto resta in cache finché i file
 * non cambiano.
 */
async function estratto(fileIt: string, fileEn: string, frequenti: ReadonlySet<string>): Promise<Estratto> {
  const impronta = (f: string) => {
    const s = statSync(f)
    return `${s.size}:${Math.round(s.mtimeMs)}`
  }
  const chiave = `${VERSIONE_ESTRATTO}|${impronta(fileIt)}|${impronta(fileEn)}|${frequenti.size}`
  const file = join(CACHE_NOMI, 'wiktionary.json')
  if (existsSync(file)) {
    const salvato = JSON.parse(readFileSync(file, 'utf8')) as Estratto
    if (salvato.chiave === chiave) return salvato
  }
  console.log('  leggo il Wikizionario e il Wiktionary inglese (poi resta in cache)…')
  const voci: Voce[] = []
  const vocabolario = new Set<string>()
  const conosciuta = (testo: string) => {
    if (/\s/.test(testo.trim())) return
    const n = normalizza(testo)
    if (n) vocabolario.add(n)
  }
  const altre = new Map<string, Set<string>>()
  const estrazioni: Array<[string, 'it' | 'en', string | null]> = [
    // Il Wikizionario ha voci di ogni lingua: il filtro evita di leggere le altre.
    [fileIt, 'it', '"lang_code": "it"'],
    [fileEn, 'en', null],
  ]
  for (const [percorso, origine, filtro] of estrazioni) {
    const lettore = createInterface({ input: createReadStream(percorso).pipe(createGunzip()), crlfDelay: Infinity })
    for await (const riga of lettore) {
      if (!riga || (filtro && !riga.includes(filtro))) continue
      let grezza: VoceGrezza
      try {
        grezza = JSON.parse(riga) as VoceGrezza
      } catch {
        continue
      }
      if (grezza.lang_code !== 'it') continue
      conosciuta(grezza.word ?? '')
      const scritta = (grezza.word ?? '').toLowerCase()
      if (frequenti.has(scritta) && grezza.pos && grezza.pos !== 'noun' && grezza.pos !== 'name') {
        const sensi = grezza.senses ?? []
        const forma =
          (grezza.tags ?? []).includes('form-of') || (sensi.length > 0 && sensi.every((x) => x.form_of?.length))
        altre.set(scritta, (altre.get(scritta) ?? new Set<string>()).add(forma ? `${grezza.pos}~` : grezza.pos))
      }
      for (const f of grezza.forms ?? []) if (f.form) conosciuta(f.form)
      const voce = voceDa(grezza, origine)
      if (voce) voci.push(voce)
    }
  }
  const risultato: Estratto = {
    chiave,
    voci,
    vocabolario: [...vocabolario],
    altre: Object.fromEntries([...altre].map(([parola, parti]) => [parola, [...parti].sort()])),
  }
  mkdirSync(CACHE_NOMI, { recursive: true })
  writeFileSync(file, JSON.stringify(risultato))
  return risultato
}

/* ───────────────────────────────  Wikidata  ─────────────────────────────── */

const QLEVER = 'https://qlever.dev/api/wikidata'
/** QLever risponde 429 a chi chiede troppo in fretta: una query alla volta, con calma. */
const INTERVALLO_QUERY_MS = 6_000

const PREFISSI = `PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX schema: <http://schema.org/>
`

type Riga = Record<string, string>

let ultimaQuery = 0

/** Una risposta di QLever, con le attese di chi chiede troppo: 30, 60, 120 secondi… */
async function chiediAQLever(nome: string, query: string): Promise<string> {
  let motivo = ''
  for (let tentativo = 0; tentativo < 6; tentativo += 1) {
    if (tentativo > 0) {
      const attesa = 30_000 * 2 ** (tentativo - 1)
      console.log(`    ${nome}: ${motivo}, riprovo fra ${attesa / 1000} s`)
      await pausa(attesa)
    }
    const prima = ultimaQuery + INTERVALLO_QUERY_MS - Date.now()
    if (prima > 0) await pausa(prima)
    ultimaQuery = Date.now()
    let testo: string
    let stato: number
    try {
      const risposta = await fetch(QLEVER, {
        method: 'POST',
        headers: {
          accept: 'application/sparql-results+json',
          'content-type': 'application/x-www-form-urlencoded',
          'user-agent': AGENTE,
        },
        body: new URLSearchParams({ query }).toString(),
        signal: AbortSignal.timeout(300_000),
      })
      stato = risposta.status
      testo = await risposta.text()
    } catch (e) {
      motivo = String(e).slice(0, 120)
      continue
    }
    if (stato === 429 || stato >= 500) {
      motivo = `HTTP ${stato}`
      continue
    }
    let json: { results?: { bindings?: unknown[] }; exception?: string }
    try {
      json = JSON.parse(testo) as typeof json
    } catch {
      motivo = `HTTP ${stato}, risposta non JSON`
      continue
    }
    if (json.results?.bindings) {
      console.log(`  ${nome}: ${json.results.bindings.length} righe`)
      return testo
    }
    // Una query che va in timeout puo' andare al giro dopo, quando QLever e' meno carico.
    motivo = `HTTP ${stato}: ${(json.exception ?? testo).slice(0, 160)}`
    if (!/time/i.test(motivo)) throw new Error(`La query "${nome}" e' sbagliata: ${motivo}`)
  }
  throw new Error(`QLever non risponde alla query "${nome}": ${motivo}`)
}

/**
 * Una query SPARQL, con le righe ridotte a stringhe: gli URI delle voci
 * diventano "Q38". La risposta resta in cache finché non la si rinnova.
 */
async function interroga(nome: string, corpo: string): Promise<Riga[]> {
  const query = PREFISSI + corpo
  const file = join(CACHE_NOMI, 'sparql', `${nome}-${sha1(query).slice(0, 12)}.json`)
  let testo = !RINNOVA && existsSync(file) ? readFileSync(file, 'utf8') : null
  if (!testo) {
    if (OFFLINE) throw new Error(`La query "${nome}" non e' in cache e sono in --offline`)
    testo = await chiediAQLever(nome, query)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, testo)
  }
  const risultato = JSON.parse(testo) as { results: { bindings: Array<Record<string, { value: string }>> } }
  return risultato.results.bindings.map((b) => {
    const riga: Riga = {}
    for (const [k, v] of Object.entries(b)) riga[k] = v.value.replace(/^http:\/\/www\.wikidata\.org\/entity\//, '')
    return riga
  })
}

/** Le etichette che hanno una voce sulla Wikipedia in italiano: `?w` e' 1 o 0. */
const VOCE_IT = 'OPTIONAL { ?voce schema:about ?x ; schema:isPartOf <https://it.wikipedia.org/> }'

/**
 * Le etichette dei taxa si chiedono in tre pezzi — l'etichetta, il nome
 * comune (P1843), gli alias — perché una query sola andava in timeout; si
 * tengono quelle diverse dal nome scientifico.
 */
function queryTaxa(regno: string): Record<string, string> {
  return {
    etichette: `SELECT DISTINCT (STR(?l) AS ?nome) WHERE {
  ?x wdt:P171* wd:${regno} ; rdfs:label ?l ; wdt:P225 ?scientifico .
  FILTER(LANG(?l) = "it")
  FILTER(STR(?l) != STR(?scientifico))
}`,
    comuni: `SELECT DISTINCT (STR(?l) AS ?nome) WHERE {
  ?x wdt:P171* wd:${regno} ; wdt:P1843 ?l .
  FILTER(LANG(?l) = "it")
}`,
    alias: `SELECT DISTINCT (STR(?l) AS ?nome) WHERE {
  ?x wdt:P171* wd:${regno} ; skos:altLabel ?l ; wdt:P225 ?scientifico .
  FILTER(LANG(?l) = "it")
  FILTER(STR(?l) != STR(?scientifico))
}`,
  }
}

const QUERY = {
  // I nomi di persona (Q202444, maschili, femminili, unisex) che portano almeno tre persone di Wikidata.
  nomiPersona: `SELECT ?x (STR(SAMPLE(?l)) AS ?nome) WHERE {
  VALUES ?tipo { wd:Q202444 wd:Q12308941 wd:Q11879590 wd:Q3409032 }
  ?x wdt:P31 ?tipo ; rdfs:label ?l .
  FILTER(LANG(?l) = "it" || LANG(?l) = "mul")
  ?persona wdt:P735 ?x .
}
GROUP BY ?x
HAVING (COUNT(DISTINCT ?persona) >= 3)`,
  comuni: `SELECT DISTINCT ?x (STR(?l) AS ?nome) WHERE {
  ?x wdt:P31 wd:Q747074 ; rdfs:label ?l .
  FILTER(LANG(?l) = "it")
  FILTER NOT EXISTS { ?x wdt:P576 ?fine }
}`,
  // Le citta' (Q515 e le sue sottoclassi) da cinquantamila abitanti, e i comuni del mondo (Q15284) da
  // cinquantamila che hanno anche una voce in italiano.
  cittaMondo: `SELECT DISTINCT ?x (STR(?l) AS ?nome) (LANG(?l) AS ?lingua) WHERE {
  ?x wdt:P31/wdt:P279* wd:Q515 ; wdt:P1082 ?abitanti .
  FILTER(?abitanti >= 50000)
  FILTER NOT EXISTS { ?x wdt:P576 ?fine }
  { ?x rdfs:label ?l . FILTER(LANG(?l) = "it" || LANG(?l) = "mul" || LANG(?l) = "en") }
  UNION { ?x skos:altLabel ?l . FILTER(LANG(?l) = "it") }
}`,
  comuniMondo: `SELECT DISTINCT ?x (STR(?l) AS ?nome) (LANG(?l) AS ?lingua) WHERE {
  ?x wdt:P31/wdt:P279* wd:Q15284 ; wdt:P1082 ?abitanti .
  FILTER(?abitanti >= 50000)
  FILTER NOT EXISTS { ?x wdt:P576 ?fine }
  ?voce schema:about ?x ; schema:isPartOf <https://it.wikipedia.org/> .
  ?x rdfs:label ?l . FILTER(LANG(?l) = "it" || LANG(?l) = "mul" || LANG(?l) = "en")
}`,
  capitali: `SELECT DISTINCT ?x (STR(?l) AS ?nome) (LANG(?l) AS ?lingua) WHERE {
  ?stato wdt:P31 wd:Q3624078 ; wdt:P36 ?x .
  FILTER NOT EXISTS { ?stato wdt:P576 ?fine }
  ?x rdfs:label ?l . FILTER(LANG(?l) = "it" || LANG(?l) = "mul" || LANG(?l) = "en")
}`,
  // Gli stati sovrani, i paesi (Q6256: anche la Groenlandia, Aruba) e le nazioni del Regno Unito.
  paesi: `SELECT DISTINCT ?x (STR(?l) AS ?nome) ?tipo WHERE {
  VALUES ?classe { wd:Q3624078 wd:Q6256 wd:Q3336843 }
  ?x wdt:P31 ?classe .
  FILTER NOT EXISTS { ?x wdt:P576 ?fine }
  { ?x rdfs:label ?l . BIND("etichetta" AS ?tipo) } UNION { ?x skos:altLabel ?l . BIND("alias" AS ?tipo) }
  FILTER(LANG(?l) = "it")
}`,
  acque: `SELECT DISTINCT ?x (STR(?l) AS ?nome) ?classe WHERE {
  VALUES ?classe { wd:Q4022 wd:Q23397 wd:Q165 wd:Q9430 wd:Q1322134 wd:Q39594 }
  ?x wdt:P31/wdt:P279* ?classe .
  ?voce schema:about ?x ; schema:isPartOf <https://it.wikipedia.org/> .
  ?x rdfs:label ?l . FILTER(LANG(?l) = "it")
}`,
  // La frutta (Q3314483: il frutto come alimento, non quello della botanica), la verdura, le noci, i legumi.
  frutta: `SELECT DISTINCT ?x (STR(?l) AS ?nome) WHERE {
  VALUES ?classe { wd:Q3314483 wd:Q11004 wd:Q11009 wd:Q145909 }
  ?x wdt:P279+ ?classe ; rdfs:label ?l .
  FILTER(LANG(?l) = "it")
}`,
  // I piatti (Q746549) e gli alimenti (Q2095) con una voce in italiano, senza le bevande.
  cibi: `SELECT DISTINCT ?x (STR(?l) AS ?nome) ?classe WHERE {
  VALUES ?classe { wd:Q746549 wd:Q2095 }
  ?x wdt:P31/wdt:P279* ?classe .
  ?voce schema:about ?x ; schema:isPartOf <https://it.wikipedia.org/> .
  ?x rdfs:label ?l . FILTER(LANG(?l) = "it")
  MINUS { ?x (wdt:P31|wdt:P279)/wdt:P279* wd:Q40050 }
}`,
  mestieri: `SELECT DISTINCT ?x (STR(?l) AS ?nome) WHERE {
  VALUES ?classe { wd:Q12737077 wd:Q28640 }
  ?x wdt:P31/wdt:P279* ?classe ; rdfs:label ?l .
  FILTER(LANG(?l) = "it")
}`,
  // I tipi di sport (Q31629) e gli sport di squadra (Q216048); le sottoclassi di sport (Q349) sono anche
  // gare e campionati, e valgono solo con una voce in italiano.
  sport: `SELECT DISTINCT ?x (STR(?l) AS ?nome) ?via (IF(BOUND(?voce), 1, 0) AS ?w) WHERE {
  { ?x wdt:P31 wd:Q31629 . BIND("tipo" AS ?via) }
  UNION { ?x wdt:P31 wd:Q216048 . BIND("tipo" AS ?via) }
  UNION { ?x wdt:P279+ wd:Q349 . BIND("sottoclasse" AS ?via) }
  ?x rdfs:label ?l . FILTER(LANG(?l) = "it")
  ${VOCE_IT}
}`,
  strumenti: `SELECT DISTINCT ?x (STR(?l) AS ?nome) (IF(BOUND(?voce), 1, 0) AS ?w) WHERE {
  ?x wdt:P279+ wd:Q34379 ; rdfs:label ?l .
  FILTER(LANG(?l) = "it")
  ${VOCE_IT}
}`,
  colori: `SELECT DISTINCT ?x (STR(?l) AS ?nome) WHERE {
  ?x wdt:P31/wdt:P279* wd:Q1075 ; rdfs:label ?l .
  FILTER(LANG(?l) = "it")
}`,
  // I vestiti, i copricapi e i gioielli.
  vestiti: `SELECT DISTINCT ?x (STR(?l) AS ?nome) (IF(BOUND(?voce), 1, 0) AS ?w) WHERE {
  VALUES ?classe { wd:Q11460 wd:Q14952 wd:Q161439 }
  ?x wdt:P279+ ?classe ; rdfs:label ?l .
  FILTER(LANG(?l) = "it")
  ${VOCE_IT}
}`,
  // Per le parole note: i nomi di almeno cinque italiani nati dal 1940, con quanti sono e il genere.
  nomiNoti: `SELECT ?x (SAMPLE(STR(?l)) AS ?nome) (SAMPLE(?tipo) AS ?genere)
  (COUNT(DISTINCT ?persona) AS ?persone) WHERE {
  VALUES ?tipo { wd:Q12308941 wd:Q11879590 wd:Q3409032 }
  ?x wdt:P31 ?tipo ; rdfs:label ?l .
  FILTER(LANG(?l) = "it")
  ?persona wdt:P735 ?x ; wdt:P27 wd:Q38 ; wdt:P569 ?nascita .
  FILTER(YEAR(?nascita) >= 1940)
}
GROUP BY ?x
HAVING (COUNT(DISTINCT ?persona) >= 5)`,
  // I comuni italiani da diecimila abitanti, le citta' del mondo da trecentomila e le capitali, con il
  // nome inglese, gli abitanti e in quante Wikipedia hanno una voce (`?quante`).
  cittaNote: `PREFIX wikibase: <http://wikiba.se/ontology#>
SELECT ?x (SAMPLE(STR(?l)) AS ?nome) (SAMPLE(STR(?e)) AS ?inglese) (MAX(?i) AS ?italia) (MAX(?n) AS ?quante)
  (MAX(?abitanti) AS ?ab) WHERE {
  { ?x wdt:P31 wd:Q747074 ; wdt:P1082 ?abitanti . FILTER(?abitanti >= 10000) BIND(1 AS ?i) }
  UNION { ?x wdt:P31/wdt:P279* wd:Q515 ; wdt:P1082 ?abitanti . FILTER(?abitanti >= 300000) BIND(0 AS ?i) }
  UNION { ?stato wdt:P31 wd:Q3624078 ; wdt:P36 ?x . FILTER NOT EXISTS { ?stato wdt:P576 ?finito } BIND(0 AS ?i) }
  FILTER NOT EXISTS { ?x wdt:P576 ?fine }
  ?x rdfs:label ?l ; wikibase:sitelinks ?n .
  FILTER(LANG(?l) = "it")
  OPTIONAL { ?x rdfs:label ?e . FILTER(LANG(?e) = "en") }
}
GROUP BY ?x`,
  paesiNoti: `PREFIX wikibase: <http://wikiba.se/ontology#>
SELECT ?x (SAMPLE(STR(?l)) AS ?nome) (MAX(?n) AS ?quante) WHERE {
  VALUES ?classe { wd:Q3624078 wd:Q6256 wd:Q3336843 }
  ?x wdt:P31 ?classe ; rdfs:label ?l ; wikibase:sitelinks ?n .
  FILTER NOT EXISTS { ?x wdt:P576 ?fine }
  FILTER(LANG(?l) = "it")
}
GROUP BY ?x`,
  // Le acque con una voce in italiano, con il nome inglese, in quante Wikipedia, e se stanno in Italia.
  acqueNote: `PREFIX wikibase: <http://wikiba.se/ontology#>
SELECT ?x (SAMPLE(STR(?l)) AS ?nome) (SAMPLE(STR(?e)) AS ?inglese) (MAX(?n) AS ?quante) (MAX(?i) AS ?italia)
WHERE {
  VALUES ?classe { wd:Q4022 wd:Q23397 wd:Q165 wd:Q9430 wd:Q1322134 wd:Q39594 }
  ?x wdt:P31/wdt:P279* ?classe ; rdfs:label ?l ; wikibase:sitelinks ?n .
  FILTER(LANG(?l) = "it")
  ?voce schema:about ?x ; schema:isPartOf <https://it.wikipedia.org/> .
  OPTIONAL { ?x rdfs:label ?e . FILTER(LANG(?e) = "en") }
  OPTIONAL { ?x wdt:P17 wd:Q38 . BIND(1 AS ?i) }
}
GROUP BY ?x`,
}

/* ──────────────────────────────  Le parole  ─────────────────────────────── */

/** Una forma del lessico: solo lettere, da due a quaranta. */
const VALIDA = /^[a-z]{2,40}$/

/** Le parole di una categoria, ognuna con la fonte da cui e' arrivata per prima, e come era scritta. */
class Raccolta {
  readonly parole = new Map<string, string>()
  /** Come era scritta ogni forma la prima volta: "L'Aquila", "colibrì", "dente di leone". */
  readonly scritte = new Map<string, string>()

  metti(testo: string, fonte: string): boolean {
    const forma = normalizza(testo)
    if (!VALIDA.test(forma)) return false
    if (!this.parole.has(forma)) {
      this.parole.set(forma, fonte)
      this.scritte.set(forma, testo.replace(/\s+/g, ' ').trim())
    }
    return true
  }

  has(forma: string): boolean {
    return this.parole.has(forma)
  }
}

/**
 * Le etichette di registro che fanno di un senso una parola da non
 * accettare: volgare, offensiva, antica, dialettale, sbagliata. Una voce resta
 * fuori solo se lo sono tutti i suoi sensi: "toro" ha anche un senso volgare.
 */
const FUORI_REGISTRO = elenco(
  // il Wiktionary inglese
  'vulgar|offensive|slur|obsolete|archaic|dialectal|regional|misspelling|proscribed|nonstandard',
  'Tuscany|Northern|Southern|Naples|Lombardy|Milan|Roman|Bologna',
  // il Wikizionario
  'volgare|offensivo|arcaico|disusato|dialettale|dialetto|toscano|settentrionale|meridionale|romanesco',
  'siciliano|napoletano|regionalismo|regionale',
)

const fuoriRegistro = (s: Senso) => s.t.some((t) => FUORI_REGISTRO.has(t))
/** Una voce con almeno un senso accettabile; una senza sensi non dice niente contro. */
const pulita = (v: Voce) => v.sensi.length === 0 || v.sensi.some((s) => !fuoriRegistro(s))

/** Un senso che e' un'azione, non una cosa: "il generare radici", "l'aggrapparsi a qualcosa". */
const AZIONE = /^(?:il|lo|l['’])\s*\p{L}+(?:are|ere|ire|arsi|ersi|irsi)(?![\p{L}])/iu

/**
 * I sensi di una voce che stanno in un ambito. Se nessun senso ne ha uno vale
 * quello della voce, ma solo se e' uno: "mediastino", senza definizioni, sta
 * sia nell'Anatomia sia nella Botanica.
 */
function sensiIn(v: Voce, ambiti: ReadonlySet<string>): Senso[] {
  const nessuno = v.sensi.every((s) => s.c.length === 0)
  if (nessuno && DOMINI.filter((a) => v.c.some((c) => a.has(c))).length > 1) return []
  return v.sensi.filter(
    (s) => !fuoriRegistro(s) && !AZIONE.test(s.g) && (nessuno ? v.c : s.c).some((c) => ambiti.has(c)),
  )
}

/** Le parole che legano un nome composto: "aquila di Bonelli", "erba della Madonna", "ferro da stiro". */
const CONNETTIVI = elenco(
  'a|ad|al|alla|alle|ai|all|con|d|da|dal|dalla|dalle|dai|dall|dei|degli|del|della|delle|dello|dell',
  'di|e|ed|in|nel|nella|nell|sul|sulla|sull',
)

const maiuscola = (parola: string) => parola[0] !== parola[0]?.toLowerCase()

/** Le scritture che non sono dell'alfabeto latino: i nomi in cirillico o in cinese non servono. */
const LATINA = /^[\p{Script=Latin}\s'’\-.]+$/u

/** Quel che sanno i due Wiktionary: le parole, i lemmi, i nomi comuni e gli aggettivi. */
interface Conoscenze {
  vocabolario: ReadonlySet<string>
  lemmi: ReadonlySet<string>
  nomiComuni: ReadonlySet<string>
  aggettivi: ReadonlySet<string>
}

/**
 * Un'etichetta di Wikidata che sembra italiana: ogni parola e' una parola
 * italiana, un connettivo, o un nome proprio dopo un connettivo ("Aquila di
 * Bonelli"). Tiene fuori i nomi scientifici ("Vulpes vulpes"), le cultivar
 * ("Rosa 'Alba Maxima'", "Madame Molin") e le parole straniere.
 */
function italiana(etichetta: string, sa: Conoscenze, massimo = 4): boolean {
  const testo = etichetta.trim()
  if (/[0-9()[\]{}.,;:/!?"«»“”‘ʽ×]/.test(testo) || /(^|\s)['’]|['’](\s|$)/.test(testo)) return false
  const parole = testo.split(/[\s'’-]+/).filter(Boolean)
  if (parole.length === 0 || parole.length > massimo) return false
  return parole.every((parola, i) => {
    const n = normalizza(parola)
    if (!n) return false
    if (i > 0 && CONNETTIVI.has(n)) return true
    if (i > 0 && maiuscola(parola)) return CONNETTIVI.has(normalizza(parole[i - 1]))
    return sa.vocabolario.has(n)
  })
}

/** Toglie quel che sta fra parentesi: "Reno (fiume)", "Tabou (Costa d'Avorio)". */
const senzaParentesi = (testo: string) => testo.replace(/\s*\([^)]*\)/g, '').trim()

/** La prima parola di un'etichetta, normalizzata. */
const testa = (etichetta: string) => normalizza(etichetta.trim().split(/[\s'’-]+/)[0] ?? '')

/* ─────────────────────────────  Le categorie  ───────────────────────────── */

/** Gli ambiti del Wikizionario (categorie, argomenti, etichette, anche con i refusi che ha). */
const AMBITI = {
  animali: elenco(
    'Zoologia-IT|Mammalogia-IT|Ornitologia-IT|Entomologia-IT|Ittiologia-IT|Erpetologia-IT|Malacologia-IT',
    'Zootecnica-IT|zoology|mammalogy|ornithology|entomology|ichthyology|herpetology|primatologia|cetologia',
    'aracnologia|zootecnica|zootecnia|ornitolgia|ornitilogia|ornitlogia|entomologa|zollogia|zoologia ',
  ),
  piante: elenco('Botanica-IT|botany|botanica |giardinaggio'),
  frutta: elenco('Botanica-IT|botany|botanica |Agricoltura-IT|agriculture|Gastronomia-IT|gastronomia'),
  cibi: elenco('Gastronomia-IT|gastronomia|cucina|alimentazione|gastonomia|gastromomia|gastronimia'),
  mestieri: elenco('Professioni-IT|professione'),
  vestiti: elenco('Abbigliamento-IT|clothing|abbigliamento|abbigliamemnto|sartoria'),
  corpo: elenco('Anatomia-IT|anatomy|anatomai'),
  strumenti: elenco('Strumenti musicali-IT'),
  colori: elenco('Colori-IT|color|colori'),
  sport: elenco('Sport-IT|sports|Calcio-IT|soccer|Atletica-IT|atletica|Ciclismo-IT|Tennis-IT'),
}

/** Gli ambiti distinti: quello della frutta e' fatto di quelli delle piante e dei cibi. */
const DOMINI = [AMBITI.animali, AMBITI.piante, AMBITI.cibi, AMBITI.mestieri, AMBITI.vestiti, AMBITI.corpo]
DOMINI.push(AMBITI.strumenti, AMBITI.colori, AMBITI.sport)

/**
 * Le glosse che dicono che il senso non e' la cosa ma una sua parte, chi la
 * fa, dove si fa, come si studia: "arto di un animale", "chi produce
 * biscotti", "negozio dove si vendono dolci".
 */
const NON_E = {
  animali: comincia(
    0,
    'parte|organo|arto|appendic*|insieme|struttur*|cavit*|ghiandol*|membran*|tessut*|secrezion*|escrement*|sterco',
    'pelo|peli|piuma|piume|penna|penne|piumaggio|guscio|conchigli*|corno|corna|coda|ala|ali|zampa|zampe|becco',
    'squam*|pinna|pinne|branchi*|tana|nido|verso|grido|carne|pelle|pellicci*|lana|uovo|uova|studio|scienz*',
    'disciplin*|ramo|malatti*|relativ*|chi|colui|colei|person*|luogo|recinto|stalla|allevament*|tecnica|arte',
    'attivit*|process*|fenomen*|condizion*|period*|fase|moviment*|comportament*|raccolta|collezion*|strato',
    'segment*|muscol*|osso|ossa|dente|denti|zanna|zanne|cellul*|figura araldica|costellazion*|segno zodiacale',
    'nato|nata',
  ),
  piante: comincia(
    0,
    'parte|organo|insieme|struttur*|tessut*|cellul*|membran*|strato|frutto|frutti|seme|semi|fiore|fiori',
    'foglia|foglie|radice|radici|ramo|rami|fusto|tronco|corteccia|polline|petal*|infiorescenz*|bacca|bacche',
    'studio|scienz*|disciplin*|tecnica|arte|relativ*|chi|colui|person*|luogo|campo|terreno|bosco|coltivazion*',
    'coltur*|malatti*|process*|fenomen*|formazion*|escrescenz*|protuberanz*|sostanz*|succo|resina|lattice|legno',
  ),
  cibi: comincia(
    0,
    'chi|colui|colei|person*|negozio|bottega|locale|ristorante|luogo|arnese|utensil*|recipient*|contenitor*',
    'macchin*|apparecchi*|attrezz*|strumento|impianto|stabiliment*|fabbrica|servizio|modalit*|tecnica|arte',
    'metodo|insieme|complesso|operazion*|procediment*|azione|atto|studio|scienz*|disciplin*|bevand*|liquor*',
    'vino|birra|cocktail|distillat*|acquavite|piastra|graticola|padella|pentola|tegame|forno|mestolo|cottura',
  ),
  vestiti: comincia(
    0,
    'chi|colui|colei|person*|addett*|fabbrica|negozio|laboratorio|bottega|azienda|industria|arte|tecnica',
    'attivit*|il cucire|cucitura|operazion*|studio|scienz*|tessuto|stoffa|filato|fibra|formato|parte|pezzo di',
    'contenitor*|valigia|insieme di regole|insieme di norme|insieme di tecniche|donna|uomo|artigian*|operai*',
    'lavorat*|sarto|sarta|negoziante|venditor*|venditrice|fabbricant*|produttor*',
  ),
  corpo: comincia(
    0,
    'studio|scienz*|disciplin*|ramo|branca|tecnica|malatti*|patologi*|infiammazion*|tumor*|process*|funzion*',
    'fenomen*|condizion*|distribuzion*|moviment*|atto|azione|operazion*|intervento|esame|relativ*|chi|colui',
    'person*|medico|specialist*|strumento|apparecchi*|curvatur*|lo stesso che|capacit*|propriet*|misura',
    'distanza|lunghezza|diametro|fase|period*|evento|parto|coalescenz*|innervazion*|vascolarizzazion*',
  ),
}

/** Le glosse dei frutti e degli ortaggi e quelle dei cibi, che cominciano con quel che sono. */
const E_FRUTTA = comincia(
  1,
  'frutto|frutti|ortagg*|verdur*|legum*|bacca|bacche|agrum*|tubero|drupa|pomo|variet* di mela|variet* di pera',
  'variet* di uva|variet* di pesca|variet* di patata|variet* di pomodoro|variet* di cavolo|variet* di lattuga',
  'variet* di insalata|variet* di cicoria|variet* di zucca|variet* di fagiol*|variet* di cipolla|variet* di carciofo',
  'variet* di peperon*|variet* di melanzana|pianta orticola|pianta ortiva',
  'seme commestibile|semi commestibili',
)
const E_CIBO = comincia(
  3,
  'piatt*|pietanz*|vivand*|cibo|cibi|aliment*|dolce|dolci|dolciume|torta|torte|biscott*|pane|pani|panin*',
  'focacc*|pizz*|pasta|paste|formagg*|salum*|salsicc*|insaccat*|carne|carni|pesce|zupp*|minestr*|brodo',
  'sugo|sughi|salsa|salse|condiment*|crema|creme|budin*|gelat*|caramell*|cioccolat*|confett*|frittat*',
  'polpett*|antipast*|merend*|spuntin*|prodotto alimentare|frittell*|crostat*|tortin*|sformat*|stufat*',
  'arrost*|lesso|bollito|polenta|riso|risott*|gnocch*|raviol*|tortell*|marmellat*|confettur*|panna|burro',
  'yogurt|uovo|uova|farina|semolino|frutta|verdur*|ortagg*|legum*|piadina|frittura|fritto|insalata|maial*|porcell*',
  'pollo|vitell*|agnell*|manzo|tacchin*|capretto|tramezzin*',
)
const E_SPORT = comincia(
  0,
  'sport|disciplin* sportiv*|specialit* sportiv*|gioco di squadra|gioco sportivo|attivit* sportiv*|arte marziale',
  'arti marziali|insieme di discipline sportive|insieme delle discipline sportive',
)
const E_STRUMENTO = comincia(1, 'strumento musicale|strumento a corde|strumento a fiato|strumento a percussione')
const E_COLORE = comincia(0, 'di colore|del colore|colore')

/** Le categorie del Wiktionary inglese per frutti, cibi, mestieri, vestiti, corpo, strumenti, colori e paesi. */
const INGLESI = {
  frutta: elenco(
    'Fruits|Vegetables|Nuts|Berries|Root vegetables|Alliums|Brassicas|Pome fruits|Stone fruits|Citrus fruits',
    'Melons|Squashes|Leaf vegetables|Tropical fruits',
  ),
  cibi: elenco(
    'Foods|Dishes|Pasta|Cheeses|Desserts|Cakes and pastries|Pastries|Breads|Sausages|Meats|Cuts of meat|Sauces',
    'Soups|Salads|Sandwiches|Pizza|Snacks|Sweets|Ice cream|Seafood|Dairy products|Condiments|Fats and oils',
  ),
  mestieri: elenco(
    'Occupations|Healthcare occupations|Legal occupations|Nautical occupations|Musicians|Artists|Scientists',
    'Athletes|Craftsmen|Military ranks',
  ),
  vestiti: elenco(
    'Clothing|Footwear|Headwear|Jewelry|Underwear|Swimwear|Skirts|Eyewear|Bags|Clerical vestments|Coats|Gloves',
    'Neckwear|Sleepwear',
  ),
  corpo: elenco(
    'Anatomy|Body parts|Face|Skeleton|Muscles|Organs|Teeth|Eye|Mouth|Head and neck|Bones|Brain|Brain regions',
    'Genitalia|Skin|Neuroanatomy|Organ systems|Bodily fluids',
  ),
  strumenti: elenco(
    'Musical instruments|String instruments|Percussion instruments|Woodwind instruments|Brass instruments',
    'Organ instruments|Keyboard instruments',
  ),
  colori: elenco(
    'Colors|Colors of the rainbow|Reds|Greens|Blues|Browns|Purples|Yellows|Pinks|Greys|Whites|Blacks',
    'Oranges',
  ),
  paesi: /^Countries in /,
}

/** Una regola che trova una di queste parole inglesi in una glossa. */
const inglese = (...gruppi: string[]) => new RegExp(`\\b(?:${gruppi.join('|')})\\b`, 'i')

/**
 * Le glosse inglesi che, in una categoria, non dicono la cosa: "gattaiola"
 * (cat flap) sta fra i gatti, "calzaturificio" (shoe factory) fra le
 * calzature, "bamboccione" fra le parole del viso.
 */
const NON_E_INGLESE: Partial<Record<CategoriaNomi, RegExp>> = {
  animali: inglese(
    'flap|house|home|shelter|pen|sty|stable|shed|coop|kennel|cattery|sound|noise|cry|call|meow|miaow|bark',
    'neigh|moo|meat|leather|wool|fur|hide|skin|disease|breeding|breeder|keeper|lover|fancier|food|feed|fodder',
    'hunting|hunter|race|racing|show|collar|leash|saddle|bridle|harness|fold|aviary|nest|pond|cage|hutch',
    'trough|farm|herd|flock|pack|swarm|colony|litter|droppings|dung|manure|eggs?|lair|den|burrow|trap|net|bait',
    'study|science|scientist|specialist|relating|pertaining|person|people|man|woman|constellation|zodiac|sign',
  ),
  piante: inglese(
    'wood|timber|grove|orchard|plantation|garden|nursery|study|science|scientist|relating|pertaining|leaf',
    'leaves|bark|root|seed|petal|stem|branch|resin|sap|juice|oil|essence|disease|person|constellation',
  ),
  vestiti: inglese('factory|maker|shop|industry|manufacturer|workshop|making|seller|dealer|worker|person who'),
  corpo: inglese(
    'study|science|disease|inflammation|surgery|surgeon|specialist|doctor|physician|wig|hairstyle|haircut',
    'style|treatment|relating|pertaining|person|someone|one who|man|woman|boy|girl|baby|measurement',
  ),
  cibi: inglese('factory|shop|maker|seller|dealer|pan|pot|utensil|tool|machine|grill|oven|paddy|field|restaurant'),
}

/** Le parole del corpo che sono una scienza, un esame o una malattia: arteriologia, craniometria, artrite. */
const SCIENZA = /(?:logia|metria|grafia|scopia|tomia|patia|ite)$/

/**
 * Gli sport del Wiktionary inglese: nelle sue categorie ci sono anche
 * l'arbitro e il traguardo, e vale la voce la cui glossa e' il nome di uno
 * sport ("volleyball", "cycling, cycle racing"), non una sua parola.
 */
const SPORT_INGLESI = elenco(
  'Sports|Ball games|Martial arts|Winter sports|Water sports|Athletics|Cycling|Motor racing|Equestrianism|Skiing',
  'Swimming|Tennis|Boxing|Wrestling|Fencing|Archery|Golf|Rugby|Baseball|Basketball|Volleyball|Gymnastics|Rowing',
  'Sailing|Surfing|Climbing|Football (soccer)|Combat sports|Racket sports|Cue sports|Motorcycling|Ice hockey',
  'Field hockey',
)
const GLOSSA_SPORT = new RegExp(
  '^(?:the )?(?:[\\w-]+ ){0,2}(?:[\\w-]+ball|sports?|[\\w-]+ing|tennis|hockey|golf|polo|rugby|cricket|lacrosse' +
    '|curling|slalom|judo|karate|athletics|gymnastics|aerobics|bowls?|billiards|darts|chess|boxing|biathlon' +
    '|triathlon|decathlon|pentathlon|heptathlon|marathon|fencing|archery)(?:\\s*[(,;].*)?$',
  'i',
)
/**
 * Le glosse che sono il nome di uno sport anche senza categoria: "volley" e'
 * "volleyball", "boxe" "boxing". Solo i nomi che non sono anche altro: con
 * "curling" arriverebbe l'arricciatura, con "fencing" la recinzione.
 */
const NOME_DI_SPORT = new RegExp(
  '^(?:the )?(?:[\\w-]+ )?(?:football|basketball|volleyball|handball|baseball|softball|netball|dodgeball|korfball' +
    '|floorball|paintball|racquetball|pickleball|tennis|hockey|rugby|lacrosse|judo|karate|athletics|gymnastics' +
    '|aerobics|billiards|boxing|biathlon|triathlon|decathlon|pentathlon|heptathlon|archery|skiing|snowboarding' +
    '|surfing|windsurfing|kitesurfing|cycling|canoeing|kayaking|mountaineering|wrestling|weightlifting|bodybuilding' +
    '|bobsleigh|luge|motorsport|motocross|trekking|hiking|jogging|orienteering|parachuting|paragliding)' +
    '(?:\\s*[(,;].*)?$',
  'i',
)
const NON_SPORT_INGLESE = inglese(
  'king|ring|string|fixing|riding|batting|training|booking|caution|swing|market|stopping|trapping|flooring',
  'dribbling|marking|passing|thrashing',
)

/* ──────────────────────────────  Il lavoro  ─────────────────────────────── */

console.log('Lessico di Nomi, cose e città')

const [fileParole, fileNomi, fileParolacce, fileIt, fileEn, fileFrequenze] = await Promise.all([
  fonte(FONTI.parole),
  fonte(FONTI.nomi),
  fonte(FONTI.parolacce),
  fonte(FONTI.wikizionario),
  fonte(FONTI.wiktionary),
  fonte(FONTI.frequenze),
])

const napolux = new Set(righe(readFileSync(fileParole, 'utf8')).map(normalizza))
const nomiNapolux = righe(readFileSync(fileNomi, 'utf8'))
const parolacce = new Set(righe(readFileSync(fileParolacce, 'utf8')).map(normalizza))

/** Quante volte compare ogni parola nei sottotitoli italiani, scritta com'e': "caffè", "però". */
const frequenze = new Map<string, number>()
for (const riga of righe(readFileSync(fileFrequenze, 'utf8'))) {
  const [parola, quante] = riga.split(' ')
  if (parola && Number(quante) > 0) frequenze.set(parola, Number(quante))
}
const frequenza = (parola: string) => frequenze.get(parola.toLowerCase()) ?? 0

const { voci, vocabolario: vocabolarioWiki, altre: altreParti } = await estratto(
  fileIt,
  fileEn,
  new Set(frequenze.keys()),
)
console.log(`  voci del Wiktionary: ${voci.length.toLocaleString('it-IT')}`)

const sa: Conoscenze = {
  vocabolario: new Set([...vocabolarioWiki, ...napolux]),
  // I nomi propri no: "Rossi" e "Tamburi" non fanno di "rossi" e "tamburi" dei lemmi.
  lemmi: new Set(voci.filter((v) => v.l && v.p !== 'name').map((v) => normalizza(v.w))),
  nomiComuni: new Set(voci.filter((v) => v.l && v.p === 'noun' && pulita(v)).map((v) => normalizza(v.w))),
  aggettivi: new Set(voci.filter((v) => v.l && v.p === 'adj').map((v) => normalizza(v.w))),
}

const raccolte = Object.fromEntries(TUTTE_LE_CATEGORIE.map((c) => [c, new Raccolta()])) as Record<
  CategoriaNomi,
  Raccolta
>

/** Un plurale: non e' un lemma, ma una sua forma base si' ("arpe", "flauti", "capelli"). */
const plurale = (parola: string) => {
  const n = normalizza(parola)
  return !sa.lemmi.has(n) && formeBase(n).some((b) => sa.lemmi.has(b))
}

/**
 * I femminili dei nomi con il loro maschile, come li scrivono le voci: quelli
 * che il maschile elenca ("maestro": "maestra") e quelli che dicono di
 * esserlo ("femminile di pittore"). Servono ai mestieri, e a contare "gatta"
 * come "gatto".
 */
const FEMMINILI: Array<[femminile: string, maschile: string]> = []
for (const v of voci) {
  for (const f of v.fem) FEMMINILI.push([f, v.w])
  if (v.sensi.every((s) => !/\bplural/i.test(s.g))) for (const d of v.femDi) FEMMINILI.push([v.w, d])
}

/**
 * Una voce del Wikizionario di un'altra lingua, che l'estrazione segna come
 * italiana: "mischievous" sta fra gli "Aggettivi in inglese", "zestfulness"
 * non ha categorie. Senza una categoria italiana vale se napolux la conosce.
 */
const estera = (v: Voce) =>
  v.s === 'it' &&
  (v.c.some((c) => /^(?:Sostantivi|Aggettivi|Verbi) in (?!italiano$)/.test(c)) ||
    (!v.c.some((c) => / in italiano$|-IT$/.test(c)) && !napolux.has(normalizza(v.w))))

/** I nomi comuni minuscoli, puliti, di una o due parole (o tre, se la seconda lega: "ferro da stiro"). */
function nomeComune(v: Voce): boolean {
  if (v.p !== 'noun' || !v.l || maiuscola(v.w) || !pulita(v) || estera(v)) return false
  const parole = v.w.trim().split(/\s+/)
  return parole.length <= 2 || (parole.length === 3 && CONNETTIVI.has(parole[1]))
}

/** Le voci del Wikizionario che stanno in un ambito, con una glossa che lo conferma. */
function dalWikizionario(
  categoria: CategoriaNomi,
  ambiti: ReadonlySet<string>,
  vale: (g: string) => boolean = () => true,
): void {
  for (const v of voci) {
    if (v.s !== 'it' || !nomeComune(v)) continue
    if (sensiIn(v, ambiti).some((s) => vale(s.g))) raccolte[categoria].metti(v.w, 'wikizionario')
  }
}

/**
 * Le voci del Wiktionary inglese in una delle sue categorie, con un senso
 * pulito che non le smentisce. La categoria si guarda sulla voce intera:
 * kaikki la assegna a un senso a occhio, e a "pisello" ha dato "Vegetables" con
 * il senso volgare invece che con "pea".
 */
function dalWiktionary(categoria: CategoriaNomi, nomi: ReadonlySet<string>): void {
  const no = NON_E_INGLESE[categoria]
  for (const v of voci) {
    if (v.s !== 'en' || !nomeComune(v) || !v.sensi.some((s) => s.c.some((c) => nomi.has(c)))) continue
    if (v.sensi.some((s) => !fuoriRegistro(s) && (!no || !no.test(s.g)))) raccolte[categoria].metti(v.w, 'wiktionary')
  }
}

/**
 * Le voci che il Wikizionario spiega con un'altra parola: "boxe" e' "sinonimo
 * di pugilato", "micio" lo stesso che "gatto". Valgono se l'altra c'e' gia', e
 * se il senso sta nell'ambito della categoria: "sinonimo di" rimanda a una
 * parola, non a un suo senso.
 */
const RIMANDO = new RegExp(
  "^(?:sinonimo di|lo stesso che|variante di|altra forma di)\\s+(?:(?:il|lo|la|i|gli|le)\\s+|l['’]\\s*)?" +
    "([\\p{L}'’ -]+?)\\s*(?:[;,.(]|$)",
  'iu',
)

function sinonimi(categoria: CategoriaNomi, ambiti: ReadonlySet<string>): void {
  // Anche la glossa che e' solo l'altra parola: "basket" e' "pallacanestro", "ping-pong" "tennis da tavolo".
  const nota = (g: string) =>
    raccolte[categoria].has(normalizza(RIMANDO.exec(g)?.[1] ?? '')) ||
    (g.trim().split(/\s+/).length <= 3 && raccolte[categoria].has(normalizza(g.replace(/[.;]$/, ''))))
  for (const v of voci) {
    if (v.s !== 'it' || !nomeComune(v)) continue
    if (sensiIn(v, ambiti).some((s) => nota(s.g))) raccolte[categoria].metti(v.w, 'wikizionario (sinonimo)')
  }
}

/**
 * Le categorie del Wiktionary inglese degli animali e delle piante sono
 * centinaia, una per gruppo ("Antelopes", "Rose family plants"): si prendono
 * quelle in cui almeno meta' delle parole e' gia' nota come animale o pianta
 * per le altre fonti, piu' quelle generali, meno quelle di un argomento
 * ("Ichthyology", che ha anche "ittiologo").
 */
function categorieDi(note: ReadonlySet<string>, sempre: ReadonlySet<string>, mai: ReadonlySet<string>): Set<string> {
  const parole = new Map<string, Set<string>>()
  for (const v of voci) {
    if (v.s !== 'en' || !nomeComune(v)) continue
    for (const s of v.sensi) {
      for (const c of s.c) {
        if (!parole.has(c)) parole.set(c, new Set())
        parole.get(c)!.add(normalizza(v.w))
      }
    }
  }
  const scelte = new Set(sempre)
  for (const [c, ws] of parole) {
    const conosciute = [...ws].filter((w) => note.has(w)).length
    if (!mai.has(c) && conosciute >= 2 && conosciute * 2 >= ws.size) scelte.add(c)
  }
  return scelte
}

/**
 * Le specie con il loro nome italiano, da Wikidata: l'etichetta, il nome
 * comune e gli alias, se sembrano italiani. Restituisce quante etichette
 * apre ogni prima parola, per le teste (vedi `teste`).
 */
async function taxa(categoria: CategoriaNomi, regno: string): Promise<Map<string, number>> {
  const etichette = new Set<string>()
  for (const [pezzo, corpo] of Object.entries(queryTaxa(regno))) {
    for (const r of await interroga(`${categoria}-${pezzo}`, corpo)) etichette.add(r.nome)
  }
  const perTesta = new Map<string, number>()
  for (const e of etichette) {
    if (!italiana(e, sa)) continue
    raccolte[categoria].metti(e, 'wikidata')
    if (/\s/.test(e.trim())) perTesta.set(testa(e), (perTesta.get(testa(e)) ?? 0) + 1)
  }
  return perTesta
}

/** Un'etichetta di Wikidata di una cosa comune: minuscola, senza numeri, di poche parole italiane. */
function comune(etichetta: string, massimo = 3): boolean {
  const e = etichetta.trim()
  return !!e && e === e.toLowerCase() && italiana(e, sa, massimo)
}

/* ───────────────────────────  Nomi di persona  ──────────────────────────── */

// Il Wikizionario: "nome proprio di persona femminile"; il Wiktionary inglese: "a male given name".
const NOME_DI_PERSONA_IT = /^nome (?:proprio )?(?:di persona|maschile|femminile|proprio maschile|proprio femminile)/i
const NOME_DI_PERSONA_EN = /\b(?:male|female|unisex) given name\b|^a given name\b/i
const nomiConfermati = new Set<string>()
/** I nomi di persona dei due Wiktionary e di napolux: un nome noto di Wikidata deve stare anche qui ("Elenora" no). */
const nomiDegliElenchi = new Set(nomiNapolux.map(normalizza))
for (const v of voci) {
  if (v.p !== 'name' || /\s/.test(v.w.trim())) continue
  const persona =
    v.s === 'it'
      ? v.c.some((c) => c.startsWith('Antroponimi')) || v.sensi.some((s) => NOME_DI_PERSONA_IT.test(s.g))
      : v.sensi.some((s) => NOME_DI_PERSONA_EN.test(s.g))
  if (persona && raccolte.nomi.metti(v.w, v.s === 'it' ? 'wikizionario' : 'wiktionary')) {
    nomiConfermati.add(normalizza(v.w))
    nomiDegliElenchi.add(normalizza(v.w))
  }
}
for (const r of await interroga('nomi-persona', QUERY.nomiPersona)) {
  const nome = r.nome.trim()
  if (!nome || /\s/.test(nome) || !LATINA.test(nome) || nome === nome.toUpperCase()) continue
  if (raccolte.nomi.metti(nome, 'wikidata')) nomiConfermati.add(normalizza(nome))
}

/* ─────────────────────────  Citta', paesi, acque  ───────────────────────── */

/**
 * Un nome di luogo con l'articolo davanti vale con e senza: "La Spezia" con la
 * L e con la S, "Il Cairo" con la I e con la C, come lo cerca `candidati`.
 */
function luogo(categoria: CategoriaNomi, nome: string, fonte: string): void {
  const pulito = senzaParentesi(nome)
  raccolte[categoria].metti(pulito, fonte)
  const senza = senzaArticolo(pulito)
  if (senza !== pulito) raccolte[categoria].metti(senza, fonte)
}

/** Le etichette che non sono una citta' ma un suo territorio: "contea di Hardin", "Distretto di Yenişehir". */
const TERRITORIO = new RegExp(
  '^(?:contea|distretto|municipalit[aà]|reggenza|dipartimento|comunit[aà]|kabupaten|municipio|provincia|regione' +
    '|prefettura|comune|partido|citt[aà] metropolitana|area|circondario|governatorato|arrondissement|cantone|stato' +
    `|territorio|isola|isole)${FINE}|\\b(?:district|county|metropolitan|urban area|township|town|rayon|municipality` +
    '|statistical|prefecture|regency|subdistrict|census)\\b',
  'iu',
)

for (const r of await interroga('comuni', QUERY.comuni)) luogo('citta', r.nome, 'wikidata (comuni)')
{
  // Per ogni citta': l'etichetta e gli alias italiani, o l'etichetta di tutte le lingue ("mul"), o quella inglese.
  const perCitta = new Map<string, Map<string, string[]>>()
  for (const [nome, corpo] of [
    ['citta-mondo', QUERY.cittaMondo],
    ['comuni-mondo', QUERY.comuniMondo],
    ['capitali', QUERY.capitali],
  ] as const) {
    for (const r of await interroga(nome, corpo)) {
      const lingue = perCitta.get(r.x) ?? new Map<string, string[]>()
      perCitta.set(r.x, lingue)
      lingue.set(r.lingua, [...(lingue.get(r.lingua) ?? []), r.nome])
    }
  }
  const buona = (n: string) => {
    const s = senzaParentesi(n)
    const sigla = s === s.toUpperCase()
    return !!s && maiuscola(s) && !sigla && LATINA.test(s) && !TERRITORIO.test(s) && s.split(/\s+/).length <= 4
  }
  for (const lingue of perCitta.values()) {
    const scelte = (lingue.get('it') ?? lingue.get('mul') ?? lingue.get('en') ?? []).filter(buona)
    for (const n of scelte) luogo('citta', n, 'wikidata')
  }
}
/** Le glosse del Wikizionario e le categorie del Wiktionary inglese delle citta'. */
const GLOSSA_CITTA = new RegExp(`^(?:citt[aà]|cittadina|comune|capoluogo|capitale|centro abitato)${FINE}`, 'iu')
const CATEGORIA_CITTA = /^(?:Cities|Towns|Villages|Municipalities|(?:National|Provincial|Regional) capitals)\b/
for (const v of voci) {
  if (v.p !== 'name' || !maiuscola(v.w) || v.w.split(/\s+/).length > 4) continue
  const citta =
    v.s === 'it'
      ? v.sensi.some((s) => GLOSSA_CITTA.test(s.g))
      : v.sensi.some((s) => s.c.some((c) => CATEGORIA_CITTA.test(c)))
  if (citta) luogo('citta', v.w, v.s === 'it' ? 'wikizionario' : 'wiktionary')
}

/** Gli alias di Wikidata che sono il nome di un paese di una volta, o un soprannome. */
const NOMI_DI_UNA_VOLTA = /^(?:Alto Volta|Rhodesia|Honduras Britannico|Roccia della Polinesia|Yankees|Zaire)$/

const righePaesi = await interroga('paesi', QUERY.paesi)
{
  // Gli alias di Wikidata sono anche sigle ("UAE"), nomi in altre lingue ("Sverige") e frasi ("Stato
  // dell'Africa del Nord"): un alias vale se ogni sua parola e' italiana o sta nel nome del paese.
  const nomiDelPaese = new Map<string, Set<string>>()
  for (const r of righePaesi) {
    if (r.tipo !== 'etichetta') continue
    const parole = nomiDelPaese.get(r.x) ?? new Set<string>()
    for (const p of r.nome.split(/[\s'’-]+/)) parole.add(normalizza(p))
    nomiDelPaese.set(r.x, parole)
  }
  for (const r of righePaesi) {
    const nome = senzaParentesi(r.nome)
    if (!nome || !LATINA.test(nome)) continue
    if (r.tipo === 'alias') {
      const sigla = nome === nome.toUpperCase()
      const note = nomiDelPaese.get(r.x) ?? new Set<string>()
      const italiane = nome
        .split(/[\s'’-]+/)
        .filter(Boolean)
        .every((p, i) => {
          const n = normalizza(p)
          return (i > 0 && CONNETTIVI.has(n)) || note.has(n) || sa.vocabolario.has(n)
        })
      const frase = /^Stato (?:dell|del|della|degli|delle)\b/.test(nome)
      if (sigla || frase || NOMI_DI_UNA_VOLTA.test(nome) || !maiuscola(nome) || !italiane) continue
    }
    luogo('paesi', nome, 'wikidata')
  }
}
// Il Wiktionary inglese ha i nomi d'uso ("Olanda", "Corea"); non quelli di una volta ("Zaire") ne' le sigle.
const paesiDUso = new Set<string>()
for (const v of voci) {
  if (v.s !== 'en' || v.p !== 'name' || !maiuscola(v.w) || v.w === v.w.toUpperCase()) continue
  const paese = v.sensi.some(
    (s) =>
      s.c.some((c) => INGLESI.paesi.test(c)) &&
      !s.c.some((c) => /^(?:Former|Abbreviations|Official names of former)\b/.test(c)) &&
      !s.t.some((t) => t === 'historical' || t === 'abbreviation' || t === 'initialism') &&
      !/\b(?:former|historical|obsolete) (?:name|country)\b/i.test(s.g),
  )
  if (paese) {
    luogo('paesi', v.w, 'wiktionary')
    paesiDUso.add(normalizza(v.w))
  }
}

/**
 * Le acque si salvano come le cerca `candidati`: "il lago di Garda" e' "garda",
 * "il fiume Po" e' "po". I mari, gli oceani e i golfi anche con il nome intero,
 * perché "Mar Rosso" con la M e' una risposta naturale quanto "Rosso" con la R;
 * "Lago di Garda" invece vale con la G, come "Fiume Po" con la P.
 */
const DAVANTI_PIENO = /\b(?:mar|mare|oceano|golfo|canale|stretto)\b/i
/** Le etichette minuscole che sono un'acqua: le altre sono un porto, un parco, una base navale. */
const NOME_D_ACQUA = /^(?:fiume|torrente|lago|laghi|mar|mare|oceano|golfo|canale|stretto)\b/i

function acqua(nome: string, fonte: string): void {
  const pulito = senzaParentesi(nome)
  if (!pulito || !LATINA.test(pulito)) return
  const senza = senzaArticolo(pulito)
  const davanti = DAVANTI_ACQUE.exec(senza)?.[0] ?? ''
  raccolte.acque.metti(senza.slice(davanti.length), fonte)
  if (!davanti || DAVANTI_PIENO.test(davanti)) raccolte.acque.metti(senza, fonte)
}

for (const r of await interroga('acque', QUERY.acque)) {
  const nome = senzaParentesi(r.nome)
  if (!nome || (!maiuscola(nome) && !NOME_D_ACQUA.test(nome)) || nome.split(/\s+/).length > 5) continue
  // Le baie di Wikidata sono anche porti e fiordi: valgono quelle che si chiamano golfo.
  if (r.classe === 'Q39594' && !/^golfo\b/i.test(nome)) continue
  acqua(nome, 'wikidata')
}
for (const v of voci) {
  // Il Wiktionary inglese scrive anche "oceano Artico", con la minuscola.
  if (v.p !== 'name' || (!maiuscola(v.w) && !NOME_D_ACQUA.test(v.w)) || v.w.split(/\s+/).length > 4) continue
  const acque =
    v.s === 'it'
      ? v.sensi.some((s) => /^(?:fiume|torrente|lago|mare|oceano|golfo)\b/i.test(s.g))
      : v.sensi.some((s) => s.c.some((c) => /^(?:Rivers|Lakes|Seas|Oceans)\b/.test(c)))
  if (acque) acqua(v.w, v.s === 'it' ? 'wikizionario' : 'wiktionary')
}

// L'elenco di napolux ha anche luoghi ("milano", "francia"): un luogo resta fra i nomi solo se e' anche un nome.
for (const nome of nomiNapolux) {
  const n = normalizza(nome)
  const luoghi = raccolte.citta.has(n) || raccolte.paesi.has(n) || raccolte.acque.has(n)
  if (!luoghi || nomiConfermati.has(n)) raccolte.nomi.metti(nome, 'napolux')
}

/* ───────────────────────────  Animali e piante  ─────────────────────────── */

dalWikizionario('animali', AMBITI.animali, (g) => !NON_E.animali.test(g))
const testeAnimali = await taxa('animali', 'Q729')
const INGLESI_ANIMALI = categorieDi(
  new Set(raccolte.animali.parole.keys()),
  elenco(
    'Animals|Mammals|Birds|Fish|Insects|Reptiles|Amphibians|Female animals|Male animals|Baby animals|Dogs|Horses',
    'Livestock',
  ),
  elenco(
    'Ichthyology|Zoology|Entomology|Ornithology|Mammalogy|Constellations in the zodiac|Constellations|Astrology',
    'Heraldic charges|Heraldry|Cleaning|Parasites|Artemisias|Seafood|Meats|Cuts of meat|Animal body parts',
    'Animal dwellings|Animal sounds|Animal foods|Fishing|Hunting',
  ),
)
dalWiktionary('animali', INGLESI_ANIMALI)

dalWikizionario('piante', AMBITI.piante, (g) => !NON_E.piante.test(g))
const testePiante = await taxa('piante', 'Q756')
const INGLESI_PIANTE = categorieDi(
  new Set(raccolte.piante.parole.keys()),
  elenco('Plants|Trees|Flowers|Shrubs|Herbs|Grasses|Vegetables|Succulents|Conifers|Palm trees'),
  elenco('Botany|Fruits|Pome fruits|Stone fruits|Berries|Nuts|Foods|Spices|Woods|Colors'),
)
dalWiktionary('piante', INGLESI_PIANTE)

/* ────────────────────────  Frutta, verdura e cibi  ──────────────────────── */

dalWikizionario('frutta', AMBITI.frutta, (g) => E_FRUTTA.test(g))
dalWiktionary('frutta', INGLESI.frutta)
{
  // Wikidata ha anche le cultivar: valgono le etichette comuni di una parola, e quelle di piu' parole
  // se la prima e' gia' un frutto o un ortaggio ("cipolla rossa", "fagiolo borlotto").
  const noti = new Set(raccolte.frutta.parole.keys())
  const conosciuto = (p: string) => noti.has(p) || formeBase(p).some((b) => noti.has(b))
  // Le conserve e le categorie ("ortaggi da foglia") non sono un frutto o un ortaggio.
  const conserva = /\b(?:sottacet\w*|in scatola|essiccat\w*|sciroppat\w*|chips|ornamentale|da seme)\b|^ortaggi\b/i
  for (const r of await interroga('frutta', QUERY.frutta)) {
    const nome = r.nome.trim()
    if (!comune(nome) || conserva.test(nome) || plurale(testa(nome))) continue
    if (!/\s/.test(nome) || conosciuto(testa(nome))) raccolte.frutta.metti(nome, 'wikidata')
  }
}

dalWikizionario('cibi', AMBITI.cibi, (g) => E_CIBO.test(g) && !NON_E.cibi.test(g))
dalWiktionary('cibi', INGLESI.cibi)
/** I marchi d'origine dopo il nome di un prodotto: "pancetta piacentina DOP" e' la pancetta piacentina. */
const MARCHIO = /\s+(?:DOP|DOC|DOCG|IGP|IGT|PAT|STG)$/
for (const r of await interroga('cibi', QUERY.cibi)) {
  const nome = senzaParentesi(r.nome).replace(MARCHIO, '')
  if (/\b(?:DOC|DOCG|IGT)\b|[0-9]/.test(r.nome)) continue
  // Un nome solo deve essere minuscolo: con la maiuscola e' un marchio ("Charms").
  if (italiana(nome, sa, 4) && (/\s/.test(nome) || !maiuscola(nome))) raccolte.cibi.metti(nome, 'wikidata')
}
// Un frutto e un ortaggio sono anche un cibo.
for (const [forma] of raccolte.frutta.parole) raccolte.cibi.metti(forma, 'frutta')

/* ───────────────────────────────  Mestieri  ─────────────────────────────── */

dalWikizionario('mestieri', AMBITI.mestieri)
dalWiktionary('mestieri', INGLESI.mestieri)
/** Le "occupazioni" di Wikidata che non sono un mestiere. */
const NON_MESTIERE = comincia(
  0,
  'serial killer|killer|assassin*|criminal*|terrorist*|trafficant*|disoccupat*|disertor*|ammutinat*|pedone',
  'amante|alunno|studente|perpetrator*|groupie|turista|pirata|vittima|prigionier*|ostaggio|schiav*',
)
for (const r of await interroga('mestieri', QUERY.mestieri)) {
  if (comune(r.nome, 2) && !NON_MESTIERE.test(r.nome)) raccolte.mestieri.metti(r.nome, 'wikidata')
}
{
  // I femminili singolari che `formeBase` non riporta al maschile: "badessa" non e' "abate" con un'altra
  // desinenza. Solo dei mestieri del Wiktionary: fra le "occupazioni" di Wikidata c'e' anche il gallo.
  for (const [femminile, maschile] of FEMMINILI) {
    const f = normalizza(femminile)
    const origine = raccolte.mestieri.parole.get(normalizza(maschile))
    if (origine !== 'wikizionario' && origine !== 'wiktionary') continue
    if (!VALIDA.test(f) || !f.endsWith('a') || formeBase(f).some((b) => raccolte.mestieri.has(b))) continue
    raccolte.mestieri.metti(femminile, 'femminile')
  }
}

/* ───────────────  Sport, strumenti, colori, vestiti, corpo  ─────────────── */

for (const v of voci) {
  if (v.s !== 'it' || !nomeComune(v)) continue
  // Lo sport e lo strumento musicale si riconoscono dalla glossa, in qualunque ambito.
  if (v.sensi.some((s) => !fuoriRegistro(s) && E_SPORT.test(s.g))) raccolte.sport.metti(v.w, 'wikizionario')
  if (v.sensi.some((s) => !fuoriRegistro(s) && E_STRUMENTO.test(s.g))) raccolte.strumenti.metti(v.w, 'wikizionario')
}
dalWikizionario('sport', AMBITI.sport, (g) => E_SPORT.test(g))
/**
 * Le varianti di uno sport che c'e' gia', le gare, le leghe e la loro storia;
 * e quel che Wikidata mette fra le sottoclassi di sport senza esserlo: le
 * danze, i giochi di carte e d'azzardo, le parole delle corse.
 */
const NON_SPORT = new RegExp(
  '^(?:campionat|competizion|coppa|lega|federazion|associazion|storia|studio|problema|disciplin|torneo|tappa' +
    '|finale|giochi|corsa agli|gara|prova)|\\b(?:femminil[ei]|maschil[ei]|paralimpic[oaie]|paraolimpic[oaie]' +
    '|universitari[oaie]|giovanile|amatoriale|professionistic[oaie]|in carrozzina|per ciechi|indoor)\\b' +
    '|^(?:polka|valzer|minuetto|gavotta|ciaccona|gagliarda|passamezzo|saltarello|can-can|cancan|corrente' +
    '|blackjack|burraco|canasta|poker|ramino|solitario|mahjong|casin[oò]|gioco di carte|sudoku|fantino' +
    '|capocordata|fessura|lasca|raid|simultanea|miglio|fondo|velocit[aà]|looping|tonneau|torta in faccia' +
    '|toreo|combattimento di|juniores|maiden|reclamare|salti|attacchi|americana|formula|gobbe|p[aä]rk' +
    '|montada|partita lampo|prima ascensione|stile himalayano|mobilit[aà] ciclabile|cibi|danzare|deriva|master)$',
  'i',
)
for (const r of await interroga('sport', QUERY.sport)) {
  const nome = r.nome.trim()
  if (NON_SPORT.test(nome) || (r.via === 'sottoclasse' && r.w !== '1')) continue
  // Wikidata scrive gli sport minuscoli ("sci alpino"); un tipo di sport maiuscolo vale se e' una parola ("Aikido").
  const maiuscolo =
    r.via === 'tipo' && maiuscola(nome) && !/\s/.test(nome) && r.w === '1' && sa.vocabolario.has(normalizza(nome))
  if (comune(nome, 4) || maiuscolo) raccolte.sport.metti(nome, 'wikidata')
}

for (const v of voci) {
  if (v.s !== 'en' || !nomeComune(v)) continue
  const sport = v.sensi.some(
    (s) =>
      !fuoriRegistro(s) &&
      ((s.c.some((c) => SPORT_INGLESI.has(c)) && GLOSSA_SPORT.test(s.g) && !NON_SPORT_INGLESE.test(s.g)) ||
        (s.c.length === 0 && NOME_DI_SPORT.test(s.g))),
  )
  if (sport) raccolte.sport.metti(v.w, 'wiktionary')
}

dalWikizionario('strumenti', AMBITI.strumenti)
dalWiktionary('strumenti', INGLESI.strumenti)
/**
 * Sotto "strumento musicale" Wikidata mette anche le classi della
 * Hornbostel-Sachs, al plurale ("arpe arcuate"), le voci ("soprano lirico"),
 * le apparecchiature ("altoparlante") e le tecniche ("fingerstyle").
 */
const NON_STRUMENTO = comincia(
  0,
  'soprano*|sopranista|mezzosoprano*|contralt*|tenor*|baritono*|bassobaritono|basso buffo|basso cantante',
  'basso profondo|castrat*|voce|controtenore|falsetto|spinto|altoparlant*|auricolar*|microfon*|mixer',
  'giradischi|grammofono|fonografo|testina|tweeter|treble|pedaliera|pick|effett*|tracker|drum machine',
  'sequencer|sirena|allarme|sparo|nitrito|fischio|cucchiaio|ossa|frusta|trottola*|sonaglio per bambini',
  'campanello elettrico|campana della|campana dell|macchina del vento|megafono|richiamo|apparat*|corda',
  'manuale|diapason|famiglia|strument*|tecnica|fingerstyle|tremolo*|chicken|sweep|rasgueado|fidget|mobile',
  'multimedialit*|marble machine|geofono|idrofono|digital|console|tastiera janko',
)
for (const r of await interroga('strumenti', QUERY.strumenti)) {
  const nome = r.nome.trim()
  if (NON_STRUMENTO.test(nome) || plurale(testa(nome))) continue
  // Un nome che il vocabolario non ha vale se ha una voce in italiano: "charango", "sitar".
  const conVoce =
    r.w === '1' && nome === nome.toLowerCase() && /^[\p{L}'’-]+(?: [\p{L}'’-]+){0,2}$/u.test(nome) && LATINA.test(nome)
  if (comune(nome) || conVoce) raccolte.strumenti.metti(nome, 'wikidata')
}

/** Le voci fra i colori che sono un colore solo per metafora, o non lo sono. */
const NON_COLORE = comincia(
  0,
  'colore|colori|tonalit*|bicolore|tricolore|sfumatur*|visione|pigment*|aposematismo|fosforescenz*|iridescenz*',
  'canizie|monocromo|capelli|occhi|carnagione|mantello|bioluminescenz*|mimetismo|plasticit*|di carnagione',
  'al naturale',
)
for (const v of voci) {
  if (!v.l || maiuscola(v.w) || !pulita(v) || (v.p !== 'noun' && v.p !== 'adj') || v.w.split(/\s+/).length > 3) continue
  if (NON_COLORE.test(v.w)) continue
  // L'aggettivo del Wikizionario vale per il suo ambito, o per la glossa: "di colore castano".
  const colore =
    v.s === 'it'
      ? sensiIn(v, AMBITI.colori).length > 0 || (v.p === 'adj' && v.sensi.some((s) => E_COLORE.test(s.g)))
      : v.sensi.some((s) => !fuoriRegistro(s) && s.c.some((c) => INGLESI.colori.has(c)))
  if (colore) raccolte.colori.metti(v.w, v.s === 'it' ? 'wikizionario' : 'wiktionary')
}
for (const r of await interroga('colori', QUERY.colori)) {
  const nome = r.nome.trim()
  if (comune(nome) && !NON_COLORE.test(nome) && !plurale(testa(nome))) {
    raccolte.colori.metti(nome, 'wikidata')
  }
}

dalWikizionario('vestiti', AMBITI.vestiti, (g) => !NON_E.vestiti.test(g))
dalWiktionary('vestiti', INGLESI.vestiti)
{
  // Sotto "abbigliamento" Wikidata mette anche medaglie, armature, orologi e mascherine: un'etichetta di
  // piu' parole vale se la prima e' gia' un capo ("giacca a vento"), una sola se ha una voce in italiano.
  const NON_VESTITO = comincia(
    0,
    'medagli*|ordin*|croce|distintivo|armatur*|gradi|storia|privilegio|nastrino|decorazion*|onorificenz*',
    'accendino|attrezzatura|bastone|calumet|ceramica|cilicio|colonnello|corona|fornello|fiore|fiori|foglia',
    'ferro|menzione|neo|nodo|ombrello|orologio|pannolino|pettine|pipa|piuma|premio|scarabeo|scudo|sudario',
    'tatuaggio|toppa|trampoli|trucco|vita|vespaio|zampa|zibellino|stupida|testone|tenia|dopo|badge|regalia',
    'resta|panoplia|lunula|maschera|mascherina|dispositivo|componente|codice|accessorio|articolo|smartwatch',
    'cronografo|tagliasigari|mordacchia|granulazione|pastorale|testiera|cavezza|barda|bigoncia|bodyart|faretra',
    'cintura esplosiva|cintura di castit*|occhiali intelligenti|biancheria intima commestibile|costumi',
  )
  const capi = new Set(raccolte.vestiti.parole.keys())
  const capo = (p: string) => capi.has(p) || formeBase(p).some((b) => capi.has(b))
  for (const r of await interroga('vestiti', QUERY.vestiti)) {
    const nome = r.nome.trim()
    if (!comune(nome) || NON_VESTITO.test(nome)) continue
    if (/\s/.test(nome) ? capo(testa(nome)) : r.w === '1') raccolte.vestiti.metti(nome, 'wikidata')
  }
}

dalWikizionario('corpo', AMBITI.corpo, (g) => !NON_E.corpo.test(g))
dalWiktionary('corpo', INGLESI.corpo)
// Anche chi le studia: "anatomista" sta nella categoria "Anatomy" del Wiktionary inglese.
for (const forma of [...raccolte.corpo.parole.keys()]) {
  if (SCIENZA.test(forma) || /(?:ista|ologo|ologa|iatra)$/.test(forma)) raccolte.corpo.parole.delete(forma)
}

/* ────────────────────────  Cose, verbi, aggettivi  ──────────────────────── */

/** Un infinito: "volare", "bere", "porre", "lavarsi", "andarsene". */
const INFINITO = /(?:are|ere|ire|rre|rsi|rsene)$/
/** Un gerundio, che il Wiktionary inglese da' a volte fra gli aggettivi. */
const GERUNDIO = /(?:ando|endo)$/

for (const v of voci) {
  if (!v.l || maiuscola(v.w) || !pulita(v) || estera(v)) continue
  const n = normalizza(v.w)
  // Del Wiktionary inglese valgono le parole che napolux conosce: ha molte forme antiche e letterarie.
  if (v.s === 'en' && !napolux.has(n)) continue
  const origine = v.s === 'it' ? 'wikizionario' : 'wiktionary'
  if (v.p === 'noun' && nomeComune(v)) raccolte.cose.metti(v.w, origine)
  else if (v.p === 'verb' && !/\s/.test(v.w) && INFINITO.test(n)) raccolte.verbi.metti(v.w, origine)
  else if (v.p === 'adj' && !/\s/.test(v.w) && !GERUNDIO.test(n)) raccolte.aggettivi.metti(v.w, origine)
}

// "boxe" per "pugilato", "micio" per "gatto": una volta raccolte le categorie, i sinonimi che il Wikizionario da'.
const CON_SINONIMI = ['animali', 'piante', 'frutta', 'cibi', 'mestieri', 'sport', 'strumenti', 'colori'] as const
for (const c of [...CON_SINONIMI, 'vestiti', 'corpo'] as const) sinonimi(c, AMBITI[c])


/* ──────────────────────  Le teste dei nomi composti  ────────────────────── */

/**
 * La prima parola dei nomi composti delle specie, se e' un nome comune e
 * apre almeno due nomi: "zigolo" da "zigolo giallo" e "zigolo nero",
 * "gambero" da "gambero di fiume". Non se e' un aggettivo ("grande") o una
 * parola di un'altra categoria: "dente di leone" e' una pianta, il dente no.
 */
function teste(categoria: CategoriaNomi, perTesta: ReadonlyMap<string, number>, altrove: CategoriaNomi[]): string[] {
  const no = elenco(
    'famiglia|macchia|piccola|piccolo|re|regina|vanga|homo|cavaliere|bella|cencio|cuscino|radice|martin|orco|diavolo',
  )
  const aggiunte: string[] = []
  for (const [t, quante] of perTesta) {
    if (quante < 2 || no.has(t) || !sa.nomiComuni.has(t) || sa.aggettivi.has(t) || raccolte[categoria].has(t)) continue
    if (altrove.some((c) => raccolte[c].has(t) || formeBase(t).some((b) => raccolte[c].has(b)))) continue
    raccolte[categoria].metti(t, 'wikidata (testa)')
    aggiunte.push(t)
  }
  return aggiunte.sort()
}
const ALTROVE: CategoriaNomi[] = ['corpo', 'frutta', 'cibi', 'vestiti', 'strumenti', 'colori', 'mestieri']
const testeAggiunte = {
  animali: teste('animali', testeAnimali, [...ALTROVE, 'piante']),
  piante: teste('piante', testePiante, [...ALTROVE, 'animali']),
}

/* ──────────────────────────────  La pulizia  ────────────────────────────── */

/** Le categorie di nomi propri: un plurale li' e' un nome a se' ("Filippine"). */
const PROPRI = new Set<CategoriaNomi>(['nomi', 'citta', 'paesi', 'acque'])

/**
 * Le parole che sono un lemma a se', e non il plurale di un altro: "pesce" non
 * e' il plurale di "pesca", ne' "alce" di "alca". Non lo sono le voci al
 * plurale, anche se hanno una definizione loro ("spaghetti", "lemuri",
 * "occhiali"), ne' i gruppi della zoologia e della botanica, che il
 * Wikizionario scrive maiuscoli ("Coccodrilli", "Aceracee").
 */
const singolari = new Set(
  voci.filter((v) => v.l && v.p !== 'name' && !maiuscola(v.w) && !v.pl).map((v) => normalizza(v.w)),
)

/** I maschili di ogni femminile: quelli delle voci, e le femmine degli animali ("la femmina del topo"). */
const maschiliDi = new Map<string, Set<string>>()
const segnaMaschile = (femminile: string, maschile: string) => {
  const f = normalizza(femminile)
  maschiliDi.set(f, (maschiliDi.get(f) ?? new Set<string>()).add(normalizza(maschile)))
}
for (const [femminile, maschile] of FEMMINILI) segnaMaschile(femminile, maschile)
for (const v of voci) {
  if (v.s !== 'it' || v.p !== 'noun') continue
  for (const s of v.sensi) {
    if (/^(?:la\s+)?femmina\b/i.test(s.g)) for (const p of s.g.split(/[\s'’,;.()]+/)) segnaMaschile(v.w, p)
  }
}

/** Un femminile di mestiere: "maestra" di "maestro", "cameriera" di "cameriere", "pittrice" di "pittore". */
function femminileDiMestiere(f: string, base: string): boolean {
  const radice = (n: number) => f.slice(0, f.length - n)
  return (
    (f.endsWith('a') && base === `${radice(1)}o`) ||
    (f.endsWith('iera') && base === `${radice(1)}e`) ||
    (f.endsWith('essa') && ['e', 'o', 'a'].some((x) => base === radice(4) + x)) ||
    (f.endsWith('trice') && base === `${radice(5)}tore`)
  )
}

/**
 * Se `forma` e' un'altra scrittura di `base` — il suo plurale, il suo
 * femminile — e quindi la stessa risposta. Una forma che non e' un lemma lo
 * e' sempre; un lemma solo se e' un plurale, o un femminile che le voci
 * dicono tale, o un femminile di mestiere: "pala" e "palo" restano due cose.
 */
function variante(c: CategoriaNomi, forma: string, base: string): boolean {
  if (!sa.lemmi.has(forma)) return true
  if (/[ie]$/.test(forma) && !singolari.has(forma)) return true
  if (maschiliDi.get(forma)?.has(base)) return true
  return c === 'mestieri' && femminileDiMestiere(forma, base)
}

const tolte = { parolacce: 0, plurali: 0 }
for (const c of TUTTE_LE_CATEGORIE) {
  const r = raccolte[c]
  for (const forma of [...r.parole.keys()]) {
    if (parolacce.has(forma)) {
      r.parole.delete(forma)
      tolte.parolacce += 1
    }
  }
  if (PROPRI.has(c)) continue
  // Un plurale o un femminile accanto alla sua forma base conterebbe come un'altra risposta: la ritrova `riconosci`.
  const via = new Map<string, string>()
  for (const forma of [...r.parole.keys()]) {
    if (formeBase(forma).some((b) => b !== forma && r.has(b) && variante(c, forma, b))) {
      via.set(forma, r.parole.get(forma)!)
      r.parole.delete(forma)
    }
  }
  // Una forma tolta deve restare riconoscibile: se e' stata tolta anche la sua base, torna.
  for (let rimessa = true; rimessa; ) {
    rimessa = false
    for (const [forma, fonte] of via) {
      if (r.has(forma) || formeBase(forma).some((b) => r.has(b))) continue
      r.parole.set(forma, fonte)
      rimessa = true
    }
  }
  tolte.plurali += [...via.keys()].filter((forma) => !r.has(forma)).length
}

/* ─────────────────────────────  Le parole note  ──────────────────────────── */

/**
 * Le parole note di ogni categoria e lettera, come le scriverebbe una persona
 * e dalla piu' nota: le risposte del computer della libera, e "le piu'
 * comuni" a partita finita. Non tutte quelle che il gioco accetta, ma quelle
 * che un adulto qualunque scriverebbe davvero; ognuna ha una prova di quanto
 * e' nota, e una categoria senza prove resta senza.
 *
 *  - i nomi: quanti italiani nati dal 1940 lo portano, per Wikidata, un
 *    maschile e un femminile alla volta;
 *  - le citta', i paesi e le acque: in quante Wikipedia hanno una voce. Le
 *    visite delle voci direbbero di piu', ma il loro servizio risponde 429 a
 *    chi lo chiede da una rete condivisa. Le citta' italiane e quelle del
 *    mondo si alternano; del mondo, e delle acque fuori d'Italia, valgono
 *    quelle famose ovunque e quelle che un italiano nomina, con le parole del
 *    nome fra quelle dei sottotitoli ("New York", "Pittsburgh");
 *  - il resto: quanto e' frequente la parola nei sottotitoli italiani, per la
 *    parte dei suoi sensi che sta nella categoria ("calcio" e' anche un
 *    elemento chimico, la "vita" e' poco una parte del corpo), e solo se i
 *    suoi sensi volgari, antichi o rari non sono quanto gli altri. Fra le
 *    cose, solo gli oggetti.
 */
const NOTE_MASSIME = 40

interface Nota {
  scritta: string
  punti: number
  /** Quel che nomina: di due nomi della stessa cosa ("Stati Uniti", "Stati Uniti d'America") se ne tiene uno. */
  chiave?: string
  /** I gruppi si alternano: un nome maschile, uno femminile. */
  gruppo?: string
}
const daNotare = Object.fromEntries(TUTTE_LE_CATEGORIE.map((c) => [c, [] as Nota[]])) as Record<CategoriaNomi, Nota[]>

/** Una parola nota, se la categoria la conosce cosi' come e' scritta. */
function nota(c: CategoriaNomi, testo: string, punti: number, chiave?: string, gruppo?: string): void {
  const scritta = testo.replace(/\s+/g, ' ').trim()
  if (punti > 0 && raccolte[c].has(normalizza(scritta))) daNotare[c].push({ scritta, punti, chiave, gruppo })
}

/** Le parole note di una categoria con una lettera, dalla piu' nota. */
function noteDi(c: CategoriaNomi, lettera: LetteraNomi): string[] {
  const ordinate = daNotare[c]
    .filter((n) => normalizza(n.scritta).startsWith(lettera))
    .sort((a, b) => b.punti - a.punti || a.scritta.length - b.scritta.length || a.scritta.localeCompare(b.scritta))
  const viste = new Set<string>()
  const gruppi = new Map<string, string[]>()
  for (const n of ordinate) {
    const forma = normalizza(n.scritta)
    const chiave = `#${n.chiave ?? forma}`
    if (viste.has(forma) || viste.has(chiave)) continue
    viste.add(forma).add(chiave)
    gruppi.set(n.gruppo ?? '', [...(gruppi.get(n.gruppo ?? '') ?? []), n.scritta])
  }
  // Un elemento per gruppo alla volta, cominciando dal gruppo della parola piu' nota.
  const code = [...gruppi.values()]
  const scelte: string[] = []
  for (let i = 0; scelte.length < NOTE_MASSIME && code.some((q) => i < q.length); i += 1) {
    for (const q of code) if (i < q.length) scelte.push(q[i])
  }
  return scelte.slice(0, NOTE_MASSIME)
}

/** I nomi che portano davvero degli italiani: "Vittoria" si', "Portland" (che Wikidata conosce come nome) no. */
const nomiItaliani = new Set<string>()
for (const r of await interroga('nomi-noti', QUERY.nomiNoti)) {
  const nome = r.nome.trim()
  if (!nome || /\s/.test(nome) || !LATINA.test(nome) || nome === nome.toUpperCase()) continue
  nomiItaliani.add(normalizza(nome))
  if (!nomiDegliElenchi.has(normalizza(nome))) continue
  nota('nomi', nome, Number(r.persone), r.x, r.genere === 'Q11879590' ? 'femminile' : 'maschile')
}

/** Le parole dei sottotitoli, normalizzate, con la loro frequenza. */
const frequenzeNormalizzate = new Map<string, number>()
for (const [parola, quante] of frequenze) {
  const n = normalizza(parola)
  frequenzeNormalizzate.set(n, Math.max(frequenzeNormalizzate.get(n) ?? 0, quante))
}
/** Parole inglesi che stanno nei nomi di luogo e nei sottotitoli per conto loro: "Port Louis", "Porto Said". */
const INGLESI_COMUNI = elenco('port|prince|said|city|saint|fort|east|west|north|south|island|islands|beach|lake|river')

/**
 * Se un italiano conosce un luogo di un altro paese: le parole che lo
 * distinguono stanno tutte, almeno centocinquanta volte, nei sottotitoli
 * ("New York", "Pittsburgh", "Città del Messico"; non "Ashgabat"). Non
 * distinguono i connettivi, le parole italiane (anche gli avverbi: il fiume
 * Meno), i nomi di persona e qualche parola inglese: "Male" e' un'altra
 * parola, "Augusta" un nome, "Port Louis" e' due parole che si dicono per altro.
 */
function notoInItalia(nome: string): boolean {
  const parole = nome
    .split(/[\s'’-]+/)
    .map(normalizza)
    .filter((p) => p.length > 3 && !CONNETTIVI.has(p))
  const distinte = parole.filter(
    (p) =>
      !sa.lemmi.has(p) && !nomiItaliani.has(p) && !INGLESI_COMUNI.has(p) && !plurale(p) && !altreParti[p]?.length,
  )
  return distinte.length > 0 && distinte.every((p) => (frequenzeNormalizzate.get(p) ?? 0) >= 150)
}

/** Un nome proprio con la maiuscola: Wikidata scrive "mar Nero", "lago di Garda". */
const maiuscolo = (nome: string) => nome.charAt(0).toUpperCase() + nome.slice(1)

// Le citta': le italiane e quelle del mondo si alternano, le italiane per prime. Delle italiane conta anche
// quanto sono grandi: qualche paese ha una voce in piu' Wikipedia di Bergamo, scritte da un programma. Del
// mondo, le citta' con una voce in almeno duecentocinquanta Wikipedia, o in cento e un nome che un italiano
// conosce.
for (const r of await interroga('citta-note', QUERY.cittaNote)) {
  const nome = maiuscolo(senzaParentesi(r.nome))
  const quante = Number(r.quante)
  const italia = r.italia === '1'
  if (!italia && ((quante < 250 && (quante < 100 || !notoInItalia(nome))) || /^The\s/.test(nome))) continue
  const punti = italia ? quante * 3 * (Number(r.ab) / 100_000) ** 0.25 : quante
  const gruppo = italia ? 'italia' : 'mondo'
  nota('citta', nome, punti, r.x, gruppo)
  // "Il Cairo" anche con la C, "La Spezia" con la S; "L'Aquila" con la A no, non la scrive nessuno.
  const senza = senzaArticolo(nome)
  if (senza !== nome && !/^l['’]/i.test(nome)) nota('citta', maiuscolo(senza), punti, r.x, gruppo)
}

{
  const etichette = new Map<string, string>()
  const punti = new Map<string, number>()
  for (const r of await interroga('paesi-noti', QUERY.paesiNoti)) {
    etichette.set(r.x, maiuscolo(senzaParentesi(r.nome)))
    punti.set(r.x, Number(r.quante))
  }
  // Degli altri nomi, quelli d'uso: l'inizio del nome ("Stati Uniti") e i nomi del Wiktionary ("Olanda").
  const nomiDi = new Map([...etichette].map(([x, nome]) => [x, [nome]]))
  for (const r of righePaesi) {
    const etichetta = etichette.get(r.x)
    const altro = maiuscolo(senzaParentesi(r.nome))
    if (r.tipo !== 'alias' || !etichetta || normalizza(altro).length < 4) continue
    if (normalizza(etichetta).startsWith(normalizza(altro)) || paesiDUso.has(normalizza(altro))) {
      nomiDi.get(r.x)!.push(altro)
    }
  }
  // Il nome ufficiale no, se e' un altro nome del paese ("Italia", non "Repubblica Italiana") o il nome di un
  // altro paese con il titolo davanti ("Regno di Danimarca"); si' se e' quello d'uso ("Regno Unito").
  const ufficiale = /^(?:Repubblica|Regno|Federazione|Stato|Granducato|Sultanato|Emirato|Confederazione)\b/
  const tutti = new Set([...nomiDi.values()].flat().map(normalizza))
  for (const [x, nomi] of nomiDi) {
    nomi.forEach((nome, i) => {
      const resto = nome.split(/\s+(?:di|del|della|dei|degli|delle|dell['’]|d['’])\s*/).slice(1).join(' ')
      if (ufficiale.test(nome) && (i > 0 || (resto !== '' && tutti.has(normalizza(resto))))) return
      nota('paesi', nome, punti.get(x)!, x)
    })
  }
}

/** Il nome di un mare che si scrive anche da solo: "Adriatico", "Tirreno", "Ligure"; non "Rosso", "Nero". */
const MARE_DA_SOLO = /^\p{Lu}\p{L}*(?:ico|eo|io|eno|ure)$/u
/** Le parole con cui comincia il nome di un'acqua, oltre a quelle che si tolgono: "Laguna di Venezia". */
const ACQUA_DAVANTI = elenco('laguna|baia|rio|bocche|delta|foce|fiordo|cascate|cascata|palude|stagno')

/**
 * Come si scrive un'acqua sul foglio: "Po", "Garda", "Mar Rosso", "Adriatico"
 * e "Mar Adriatico", "Atlantico" e "Oceano Atlantico", "Golfo di Napoli". Non
 * il lago Maggiore ne' il lago Vittoria: un aggettivo e un nome di persona da
 * soli non li scrive nessuno, e "Lago Maggiore" vale con la M, non con la L
 * (`candidati` toglie "lago"). Niente per le etichette che non sono il nome
 * di un'acqua ("Arsenale di Venezia", "porto di Genova") o hanno un refuso
 * ("Mmare di Barents"): un nome composto comincia con una parola d'acqua
 * ("Laguna di Venezia").
 */
function scritteDAcqua(nome: string): string[] {
  const intero = maiuscolo(senzaArticolo(nome))
  const davanti = DAVANTI_ACQUE.exec(intero)?.[0] ?? ''
  if (!davanti) {
    const [prima, seconda] = intero.split(/\s+/)
    const composto = seconda !== undefined && CONNETTIVI.has(normalizza(seconda))
    return composto && !ACQUA_DAVANTI.has(normalizza(prima)) ? [] : [intero]
  }
  const resto = maiuscolo(intero.slice(davanti.length))
  const parola = normalizza(davanti.trim().split(/\s+/)[0])
  if (parola === 'mar' || parola === 'mare') return MARE_DA_SOLO.test(resto) ? [intero, resto] : [intero]
  if (parola === 'oceano') return [intero, resto]
  if (parola === 'golfo' || parola === 'canale' || parola === 'stretto') return [intero]
  const n = normalizza(resto)
  return sa.aggettivi.has(n) || nomiItaliani.has(n) ? [] : [resto]
}

/**
 * Un'acqua di un altro paese che un italiano nomina: una voce in almeno
 * centoventi Wikipedia (il mar Rosso, il Nilo, la Senna), o in novanta e un
 * nome che conosce ("Mar del Giappone"; non "Mare di Laptev").
 */
function acquaNota(nome: string, quante: number): boolean {
  const intero = senzaArticolo(nome)
  const davanti = DAVANTI_ACQUE.exec(intero)?.[0] ?? ''
  return quante >= 120 || (quante >= 90 && notoInItalia(intero.slice(davanti.length)))
}

// Le acque: d'Italia quelle con una voce in almeno venti Wikipedia, e valgono il doppio; del mondo quelle note.
for (const r of await interroga('acque-note', QUERY.acqueNote)) {
  const nome = senzaParentesi(r.nome)
  const quante = Number(r.quante)
  const italia = r.italia === '1'
  if (italia ? quante < 20 : !acquaNota(nome, quante)) continue
  for (const scritta of scritteDAcqua(nome)) nota('acque', scritta, quante * (italia ? 2 : 1), r.x)
}

/* Le altre categorie, dalla frequenza delle parole. */

/** Le voci di ogni parola comune (lemmi, minuscoli), per forma. */
const vociDi = new Map<string, Voce[]>()
for (const v of voci) {
  if (!v.l || maiuscola(v.w)) continue
  const forma = normalizza(v.w)
  vociDi.set(forma, [...(vociDi.get(forma) ?? []), v])
}

/** I sensi che dicono qualcosa: non le definizioni mancanti o rimandate ad altre pagine, non le forme. */
const sensiVeri = (v: Voce) =>
  v.sensi.filter(
    (s) =>
      s.g &&
      !/^definizione mancante/i.test(s.g) &&
      !/\(\s*(?:approfondimento|citazioni)\s*\)/.test(s.g) &&
      !GLOSSA_FORMA.test(s.g),
  )
/**
 * Un senso da non scrivere: volgare, offensivo, antico, dialettale, raro,
 * letterario. Non lo spregiativo: "orso" e' anche una persona scorbutica.
 */
const RARO = elenco('rare|literary|poetic|raro|letterario|poetico|Parole rare-IT')
const cattivo = (s: Senso) => fuoriRegistro(s) || s.t.some((t) => RARO.has(t)) || s.c.some((c) => RARO.has(c))

/** Il principio di una glossa che rimanda a quel che segue: "nome generico di mammifero plantigrado". */
const NOME_DI = /^(?:nome\s+(?:generico\s+|comune\s+|volgare\s+)?(?:di|del|della|dello|dei|degli|delle)\s+)/i
const dopoIlNome = (g: string) => g.replace(NOME_DI, '')

const inAmbito = (v: Voce, s: Senso, ambiti: ReadonlySet<string>) =>
  (v.sensi.every((x) => x.c.length === 0) ? v.c : s.c).some((c) => ambiti.has(c))

/**
 * Le glosse che dicono che cosa e' la cosa, per le categorie i cui sensi
 * spesso non hanno un ambito. Davanti a quel che e' sta al piu' un aggettivo
 * di forma ("piccolo mammifero"): con qualunque parola, "quantita' di
 * oggetti" sarebbe un oggetto, e "di veicoli" un veicolo.
 */
const E_ANIMALE = comincia(
  'aggettivo',
  'animal*|mammifer*|uccell*|pesce|pesci|insett*|rettil*|anfibi*|mollusc*|crostace*|aracnid*|serpent*|rapace',
  'felin*|roditor*|cetace*|primat*|ruminant*|equin*|bovin*|ovin*|suin*|larva|verme|farfall*|scimmi*|antilop*',
  'marsupial*|tartarug*|squal*|femmina del|femmina della|femmina dello|femmina dell|maschio del|cucciolo',
  'vacca|bue|toro|cavallo|cane|gallinace*|palmiped*|passerac*|lepidotter*|coleotter*|cefalopod*|gasteropod*',
  'canid*|felid*|cervid*|bovid*|equid*|mustelid*|ursid*|plantigrad*|carnivor*|erbivor*|insettivor*',
)
const E_PIANTA = comincia(
  'aggettivo',
  'pianta|piante|albero|alberi|arbust*|erba|erbe|fiore|fiori|alga|alghe|fungo|funghi|felce|felci|muschio',
  'liana|rampicante|cespuglio|graminacea|conifera|palma|genere di piante|specie di pianta',
)
const E_MESTIERE = comincia(
  'aggettivo',
  'professionist*|addett*|operai*|lavorat*|artigian*|impiegat*|tecnico|specialist*|dipendente|funzionari*',
  'militare|ufficiale|insegnante|commerciante|negoziante|venditor*|venditrice|esercente|imprenditor*',
  'chi esercita|chi svolge|chi pratica|chi lavora|chi insegna|chi vende|chi ripara|chi costruisce|chi produce',
  'chi guida|chi conduce|chi dirige|chi gestisce|chi cura|chi allena|chi coltiva|chi alleva|chi prepara',
  'chi cucina|chi recapita|chi consegna|chi per professione|chi di professione|chi per mestiere|chi di mestiere',
  'colui che esercita|colui che svolge|colui che lavora|persona che esercita|persona che lavora|persona addetta',
)
const E_VESTITO = comincia(
  'aggettivo',
  'indumento|indumenti|capo di abbigliamento|calzatur*|copricapo|gioiell*|monile|costume|uniforme|divisa',
  "capo d['’]abbigliamento",
  'veste|abito|giacca|maglia|scarpa|scarpe|stivale|pantalon*|gonna|camicia|cintura|guant*|sciarpa|calza|calze',
  'cappello|berretto|ornamento|accessori*|striscia di cuoio|striscia di tessuto|striscia di stoffa|paio di',
  'calzino|calzini|soprabito|cappotto|giubbotto|maglione|felpa|camicetta|tunica|mantello|copertura per',
  'biancheria|elemento di biancheria|capo di biancheria|articolo di abbigliamento|articolo caratteristico dell',
)
/** Un oggetto: per le cose, che sul foglio sono cose da toccare. */
const OGGETTO = comincia(
  'aggettivo',
  'oggett*|strument*|utensil*|attrezz*|arnes*|mobile|mobili|articolo di arredamento|pezzo di arredamento|arred*',
  'contenitor*|recipient*|apparecchi*|dispositiv*|congegn*|macchina|macchine|macchinari*|veicol*|automezz*',
  'mezzo di trasporto|imbarcazion*|elettrodomestic*|indumento|capo di abbigliamento|calzatura|copricapo',
  'gioiello|arma|armi|giocattol*|accessori*|suppellettil*|posata|posate|vaso|tazza|bottiglia|lampada|cassa',
  'scatola|sacco|sacca|borsa|attrezzatura|manufatto|edificio|costruzione|abitazione|fabbricato|foglio',
  'insieme di fogli|pezzo di carta|cartoncino|lastra|asta|bastone|tubo|serramento|infisso|battente|chiusura',
  'copertura di un edificio|apertura di una parete|apertura, la cui base',
)
/**
 * Le glosse che cominciano come un oggetto e non lo sono: "oggetto o cosa
 * posseduto", "oggetto di studio", "arma di un esercito" (la fanteria),
 * "strumento di scambio" (il denaro), "costruzione data da un insieme di punti".
 */
const NON_OGGETTO = new RegExp(
  "^(?:l['’]\\s*)?(?:oggetto\\s+(?:o|di|a\\s+cui|di\\s+cui|in\\s+cui|indefinito|qualsiasi|qualunque|granuloso)" +
    '|arma\\s+(?:di|dell)|strumento\\s+di\\s+scambio|costruzione\\s+data)\\b',
  'i',
)
const OGGETTI_INGLESI = elenco(
  'Furniture|Household|Cookware and bakeware|Cutlery|Tableware|Containers|Tools|Vehicles|Watercraft|Aircraft',
  'Light sources|Home appliances|Toys|Musical instruments|Weapons|Firearms|Swords|Clothing|Headwear|Footwear',
  'Jewelry|Bags|Electronics|Smoking|Automotive parts|Bedding|Armor|Explosives|Board games|Stationery|Buildings',
  'Rooms|Building materials|Eyewear|Kitchenware|Writing instruments|Office equipment|Timekeeping devices',
)

/**
 * Quando un senso del Wikizionario sta nella categoria: per il suo ambito, o
 * per quel che dice la glossa. Per gli animali, le piante, i cibi e i vestiti
 * solo per la glossa: l'ambito della zoologia ha anche il mangime e il
 * pollaio, quello della gastronomia l'aroma.
 */
const NEL_DOMINIO: Partial<Record<CategoriaNomi, (v: Voce, s: Senso) => boolean>> = {
  animali: (_, s) => !NON_E.animali.test(s.g) && E_ANIMALE.test(dopoIlNome(s.g)),
  piante: (_, s) => !NON_E.piante.test(s.g) && E_PIANTA.test(dopoIlNome(s.g)),
  // La pianta di un frutto e' il frutto: "anguria" e' prima la pianta della famiglia delle Cucurbitacee.
  frutta: (_, s) => E_FRUTTA.test(s.g) || (E_PIANTA.test(s.g) && !NON_E.piante.test(s.g)),
  cibi: (_, s) => !NON_E.cibi.test(s.g) && (E_CIBO.test(s.g) || E_FRUTTA.test(s.g)),
  mestieri: (v, s) => inAmbito(v, s, AMBITI.mestieri) || E_MESTIERE.test(s.g),
  sport: (v, s) => inAmbito(v, s, AMBITI.sport) || E_SPORT.test(s.g),
  strumenti: (v, s) => inAmbito(v, s, AMBITI.strumenti) || E_STRUMENTO.test(s.g),
  colori: (v, s) => inAmbito(v, s, AMBITI.colori) || E_COLORE.test(s.g),
  // I vestiti per la glossa: l'ambito dell'abbigliamento ha anche la tasca, la taglia e la stoffa.
  vestiti: (_, s) => !NON_E.vestiti.test(s.g) && E_VESTITO.test(s.g),
  // Il corpo per l'ambito: "sporgenza" e "regione" sono anche i promontori.
  corpo: (v, s) => !NON_E.corpo.test(s.g) && inAmbito(v, s, AMBITI.corpo),
  cose: (_, s) => OGGETTO.test(s.g) && !NON_OGGETTO.test(s.g),
}
/** Le stesse categorie, per le voci del Wiktionary inglese. */
const NEL_DOMINIO_INGLESE: Partial<Record<CategoriaNomi, ReadonlySet<string>>> = {
  animali: INGLESI_ANIMALI,
  piante: INGLESI_PIANTE,
  frutta: INGLESI.frutta,
  cibi: new Set([...INGLESI.cibi, ...INGLESI.frutta]),
  mestieri: INGLESI.mestieri,
  sport: SPORT_INGLESI,
  strumenti: INGLESI.strumenti,
  colori: INGLESI.colori,
  vestiti: INGLESI.vestiti,
  corpo: INGLESI.corpo,
  cose: OGGETTI_INGLESI,
}
/**
 * Quanto deve essere della categoria una parola, se il suo primo senso non lo
 * e': per gli animali, le piante e il corpo piu' della meta' dei sensi,
 * perché anche il "monaco", la "porcellana" e il "promontorio" ne hanno uno;
 * per gli sport poco, perché "calcio" e' prima un elemento chimico ed e' il
 * primo sport che viene in mente, ma non cosi' poco da prendere "fondo".
 */
const SOGLIA: Partial<Record<CategoriaNomi, number>> = {
  animali: 0.6,
  piante: 0.6,
  corpo: 0.6,
  vestiti: 0.5,
  frutta: 0.5,
  cibi: 0.34,
  colori: 0.34,
  cose: 0.34,
  mestieri: 0.25,
  sport: 0.2,
  strumenti: 0.15,
}

/**
 * Le parole che il gioco accetta ma che il computer non deve scrivere: il nome
 * della categoria ("animale" fra gli animali) e quel che stona in un gioco fra
 * colleghi, anche se vale.
 */
const NON_NOTE: Partial<Record<CategoriaNomi, ReadonlySet<string>>> = {
  animali: elenco(
    'animale|animaletto|bestia|bestiola|maschio|femmina|cucciolo|porco|troia|zoccola|cagna|cagnaccio|apollo',
    'carnivoro|erbivoro|onnivoro|mammifero|anfibio|rettile|mollusco|crostaceo|cardio|calliope|capricorno',
    'mezzosangue|fornaio|felino|berta|golia|ibrido|rapace|sfinge|cardinale|averla',
  ),
  piante: elenco(
    'pianta|piantina|vegetale|alfa|coca|miseria|polio|benedetta|beta|giulietta|germoglio|impaziente|reo|sabina',
  ),
  frutta: elenco(
    'frutto|frutta|verdura|ortaggio|pigna|coscia|beta|grano|ghianda|germoglio|baccello|bacca|pinocchio|vaniglia',
  ),
  cibi: elenco(
    'cibo|alimento|pietanza|piatto|porzione|portata|aroma|prelibatezza|leccornia|delizia|specialita|africano',
    'pigna|cottura|bottoni|dolcezza|garo|guarnizione|ghianda|baccello|bacca|raperonzolo|surrogato|verdura',
    'pinocchio|dolce|grano',
  ),
  mestieri: elenco(
    'mestiere|professione|lavoro|lavoratore|mafioso|pornostar|prostituta|escort|gigolo|spacciatore|killer|sicario',
    'ladro|assassino|criminale|terrorista|mendicante|massone|anarchico|moralista|mistico|profeta|papa|pioniere',
    'automobilista|motociclista|professionista|aiutante|ferramenta|boia|biker|dilettante|escursionista|executive',
    'intellettuale|nobile|religioso|spogliarellista|sportivo|stratega|saltatore|surfista|studioso|scout|teorico',
    'tessile|veterano|velocista',
  ),
  sport: elenco('sport|gioco|inseguimento|pallone|tiro'),
  strumenti: elenco('strumento|calliope|fiato|fagottino|regale|siringa|tibia'),
  colori: elenco(
    'colore|tinta|pallido|acceso|chiaro|scuro|vivo|vivace|tenue|intenso|spento|cupo|brillante|cesio|fumo|livido',
  ),
  vestiti: elenco(
    'asciugamano|piumone|pianeta|lenzuolo|coperta|cuoio|pelle|seta|lana|cotone|cashmere|cotta|basta|eleganza',
    'indugio|indumento|look|outfit|topless|bottone|laccio',
  ),
  corpo: elenco(
    'corpo|organo|ano|pene|vagina|vulva|prepuzio|pube|perineo|scroto|testicolo|clitoride|glande|carne|parto',
    'mentale|capitato|cavita|criniera|corno|artiglio|pinna|zoccolo|zampa|coda|ala|bellico|imene|sopravvivenza',
    'statura|carnagione|tenue|alvo',
  ),
  cose: elenco(
    'cosa|oggetto|personaggio|articolo|manufatto|memorandum|mas|postale|portavoce|arteria|avena|cola|caverna',
    'centimetro|pianeta|polizza|esodo|dildo|dependance|deterrente|grana|figura|dispositivo|banca|bacino',
    'indugio|imperiale|isolato|ostruzione|regale|lista|topless|tornado|vibratore|vena|spia|simbolo|scacchi',
    'scroto|stabile|buttafuori',
  ),
  verbi: elenco(
    'ammazzare|ammazzarsi|massacrare|torturare|uccidersi|suicidarsi|ubriacare|ubriacarsi|drogarsi|vomitare',
  ),
  aggettivi: elenco(
    'porco|maledetto|dannato|schifoso|anale|mafioso|principe|prigioniero',
    'continente|contadino|cellulare|bono|bruto|bicipite|free|imbecille|natale|offline|lesbico|volare|vaginale',
    'sessuale|temporale',
  ),
}

/**
 * Quanto una parola e' della categoria, da 0 a 1: la parte dei suoi sensi che
 * ci stanno, e almeno tre quarti se ci sta il primo della prima voce, che e'
 * quello che si intende ("radio" e' prima l'apparecchio, poi l'osso). Prima il
 * Wikizionario, poi il Wiktionary inglese. I sensi dell'aggettivo contano solo
 * se sono piu' di quelli del nome, e solo nelle categorie di cose
 * (`CON_AGGETTIVI`), e allora il primo senso non basta: "simpatico" e' poco un
 * nervo e "semplice" poco un'erba, ma "rosa" resta un fiore. Null se i sensi
 * da non scrivere sono almeno quanti gli altri, o se non ce n'e' nessuno.
 */
function parteNella(c: CategoriaNomi, scritta: string): number | null {
  const tutte = vociDi.get(normalizza(scritta)) ?? []
  // La stessa scrittura, se c'e': "papa" non e' "papà".
  const stesse = tutte.filter((v) => v.w.toLowerCase() === scritta)
  const scelte = stesse.length > 0 ? stesse : tutte
  const vere = (vs: Voce[]) => {
    const conSensi = vs.filter((v) => sensiVeri(v).length > 0)
    return conSensi.some((v) => v.s === 'it') ? conSensi.filter((v) => v.s === 'it') : conSensi
  }
  const principali = c === 'colori' ? ['adj', 'noun'] : ['noun']
  const nomi = vere(scelte.filter((v) => principali.includes(v.p)))
  const aggettivi = CON_AGGETTIVI.has(c) ? vere(scelte.filter((v) => v.p === 'adj')) : []
  const quanti = (vs: Voce[]) => vs.flatMap(sensiVeri).length
  const aggettivale = quanti(aggettivi) > quanti(nomi)
  const usate = aggettivale ? [...nomi, ...aggettivi] : nomi
  const sensi = usate.flatMap(sensiVeri)
  if (sensi.length === 0 || sensi.filter(cattivo).length * 2 >= sensi.length) return null
  // Una glossa da aggettivo ("che concerne il sistema simpatico", "relativo al cuore") non e' una cosa.
  const comeAggettivo = (g: string) => c !== 'colori' && c !== 'mestieri' && GLOSSA_AGGETTIVALE.test(g)
  const dentro = (v: Voce, s: Senso) =>
    !cattivo(s) &&
    !comeAggettivo(s.g) &&
    (v.s === 'it' ? NEL_DOMINIO[c]!(v, s) : s.c.some((x) => NEL_DOMINIO_INGLESE[c]!.has(x)))
  const primo = !aggettivale && nomi.length > 0 && dentro(nomi[0], sensiVeri(nomi[0])[0])
  const nella = usate.flatMap((v) => sensiVeri(v).filter((s) => dentro(v, s))).length
  return Math.max(nella / sensi.length, primo ? 0.75 : 0)
}

/** Una glossa che descrive come un aggettivo: "che concerne...", "relativo a...". */
const GLOSSA_AGGETTIVALE = /^(?:che\b|(?:relativ|riguardant|inerent|attinent|concernent)\p{L}*)/iu

/** Le parti del discorso che fanno di un nome un'altra parola: un avverbio, un verbo, una sua voce. */
const ALTRA_PARTE = /^(?:adv|num|verb)/
/** Le parole grammaticali: "sulla" e' anche una pianta, ma la sua frequenza non dice niente. */
const GRAMMATICALE = /^(?:prep|conj|pron|det|article|contraction|particle|intj)/
/** Il plurale di un nome per regola, quando la voce non lo dice. */
function pluraleDaRegola(p: string): string[] {
  if (/[cg]a$/.test(p)) return [`${p.slice(0, -1)}he`]
  if (/[cg]ia$/.test(p)) return [`${p.slice(0, -1)}e`, `${p.slice(0, -2)}e`]
  if (/io$/.test(p)) return [p.slice(0, -1)]
  if (/[oe]$/.test(p)) return [`${p.slice(0, -1)}i`]
  // I nomi maschili in -a sono pochi, e il plurale in -i di "basta" sarebbe una voce di bastare.
  if (/a$/.test(p)) return [`${p.slice(0, -1)}e`]
  return []
}

/**
 * I nomi propri noti, che nei sottotitoli si scrivono minuscoli come le
 * parole: "argentina", "aurora", "mosca", e i nomi di persona di napolux
 * ("giulietta", che e' anche una pianta).
 */
const propriNoti = new Set([
  ...(['nomi', 'citta', 'paesi', 'acque'] as const).flatMap((c) => daNotare[c].map((n) => normalizza(n.scritta))),
  ...nomiNapolux.map(normalizza),
])

/**
 * Quanto e' frequente una parola come nome comune: niente se e' anche una
 * parola grammaticale ("sulla"). Se e' anche un avverbio, un verbo o una sua
 * voce ("ancora", "sedere", "letto", "porta"), o un nome proprio noto
 * ("Argentina", "Aurora", "Mosca"), la sua frequenza e' in parte dell'altra, e
 * vale al piu' otto volte quella del plurale, che l'altra non ha. Il plurale
 * e' quello della voce (anche uguale, come "puma"), o per regola.
 */
function frequenzaDelNome(scritta: string): number {
  if ((altreParti[scritta] ?? []).some((p) => GRAMMATICALE.test(p))) return 0
  const f = frequenza(scritta)
  const altra = (altreParti[scritta] ?? []).some((p) => ALTRA_PARTE.test(p))
  if (!altra && !propriNoti.has(normalizza(scritta))) return f
  const voce = (vociDi.get(normalizza(scritta)) ?? []).filter((v) => v.p === 'noun')
  const elencati = voce.flatMap((v) => v.plu)
  const plurali = elencati.length > 0 ? elencati : pluraleDaRegola(scritta)
  if (plurali.includes(scritta)) return f
  return Math.min(f, 8 * Math.max(0, ...plurali.map(frequenza)))
}

/** Le parole comuni di una categoria: una parola sola, come l'ha scritta la fonte, in minuscolo. */
function comuni(c: CategoriaNomi): Array<[forma: string, scritta: string]> {
  return [...raccolte[c].parole.keys()]
    .map((forma): [string, string] => [forma, (raccolte[c].scritte.get(forma) ?? forma).toLowerCase()])
    .filter(([forma, scritta]) => !/[\s-]/.test(scritta) && normalizza(scritta) === forma && !NON_NOTE[c]?.has(forma))
}

/**
 * Le categorie in cui un nome che e' soprattutto un aggettivo conta anche i
 * sensi dell'aggettivo (vedi `parteNella`). Non i mestieri: "medico" e' piu'
 * aggettivo che nome, ma e' il primo mestiere che viene in mente.
 */
const CON_AGGETTIVI = new Set<CategoriaNomi>(['animali', 'piante', 'vestiti', 'corpo', 'cose'])

/** L'albero di un frutto che c'e': "pero" accanto a "pera", "ciliegio" accanto a "ciliegia". */
const alberoDi = (forma: string) =>
  forma.endsWith('o') && [`${forma.slice(0, -1)}a`, `${forma.slice(0, -2)}a`].some((f) => raccolte.frutta.has(f))

for (const c of TUTTE_LE_CATEGORIE) {
  if (!NEL_DOMINIO[c]) continue
  for (const [forma, scritta] of comuni(c)) {
    if (c === 'frutta' && alberoDi(forma)) continue
    const quanto = parteNella(c, scritta)
    if (quanto === null || quanto < SOGLIA[c]!) continue
    nota(c, scritta, frequenzaDelNome(scritta) * quanto)
  }
}

for (const [forma, scritta] of comuni('verbi')) {
  const sensi = (vociDi.get(forma) ?? []).filter((v) => v.p === 'verb').flatMap((v) => v.sensi)
  if (sensi.length > 0 && sensi.filter(cattivo).length * 2 < sensi.length) nota('verbi', scritta, frequenza(scritta))
}

/** I superlativi e gli ordinali: "moltissimo", "nono", "ennesimo". */
const NON_AGGETTIVO = /issim[oa]$|esimo$|^(?:prim|second|terz|quart|quint|sest|settim|ottav|non|decim)o$/

/*
 * Gli aggettivi del Wikizionario, per la frequenza del maschile e del
 * femminile insieme (la media geometrica): il maschile da solo e' anche un
 * avverbio ("solo"), il femminile da solo un nome ("Monica" per "monico").
 * Non quelli che sono soprattutto altro: i possessivi, i numerali e gli
 * indefiniti, che sono anche pronomi o determinanti; i participi ("andato");
 * gli avverbi, che non hanno un femminile e non finiscono in -e come "grande"
 * ("avanti", "meglio"); e quelli che sono nomi almeno quanto aggettivi
 * ("amico", "madre", "ponte").
 */
for (const [forma, scritta] of comuni('aggettivi')) {
  if (NON_AGGETTIVO.test(forma) || (altreParti[scritta] ?? []).some((p) => /^(?:pron|det|num|article|verb~)/.test(p))) {
    continue
  }
  const voci = (vociDi.get(forma) ?? []).filter((v) => v.p === 'adj' && v.s === 'it' && v.w === scritta)
  const sensi = voci.flatMap(sensiVeri)
  if (sensi.length === 0 || sensi.filter(cattivo).length * 2 >= sensi.length) continue
  const femminili = voci.flatMap((v) => v.fem).filter((f) => f !== scritta)
  if (femminili.length === 0 && !scritta.endsWith('e')) continue
  const comeNome = (vociDi.get(forma) ?? []).filter((v) => v.p === 'noun' && v.s === 'it').flatMap(sensiVeri)
  if (comeNome.length >= sensi.length) continue
  const femminile = Math.max(0, ...femminili.map(frequenza))
  nota('aggettivi', scritta, femminili.length > 0 ? Math.sqrt(frequenza(scritta) * femminile) : frequenza(scritta))
}

/* ────────────────────────────────  I file  ──────────────────────────────── */

const corpi = new Map<LetteraNomi, { testo: string; file: FileLessicoNomi }>()
const conti: Record<string, Partial<Record<CategoriaNomi, number>>> = {}
for (const lettera of LETTERE_NOMI) {
  const categorie: Partial<Record<CategoriaNomi, string[]>> = {}
  for (const c of TUTTE_LE_CATEGORIE) {
    const parole = [...raccolte[c].parole.keys()].filter((p) => p.startsWith(lettera)).sort()
    if (parole.length > 0) categorie[c] = parole
  }
  const note: Partial<Record<CategoriaNomi, string[]>> = {}
  for (const c of TUTTE_LE_CATEGORIE) {
    const parole = noteDi(c, lettera)
    if (parole.length > 0) note[c] = parole
  }
  const corpo = { lettera, categorie, note }
  const versione = sha1(JSON.stringify(corpo)).slice(0, 10)
  const file: FileLessicoNomi = { versione, ...corpo }
  corpi.set(lettera, { testo: JSON.stringify(file), file })
  conti[lettera] = Object.fromEntries(Object.entries(categorie).map(([c, p]) => [c, p.length]))
}

const problemi: string[] = []
const peso = (testo: string) => Buffer.byteLength(testo, 'utf8')
let totale = 0
for (const [lettera, { testo }] of corpi) {
  totale += peso(testo)
  if (peso(testo) > MASSIMO_FILE) problemi.push(`${lettera}.json pesa ${Math.round(peso(testo) / 1024)} kB`)
  const idonee = categorieIdonee(lettera, conti)
  if (idonee.length < CATEGORIE_PER_PARTITA) {
    problemi.push(`con la ${lettera.toUpperCase()} solo ${idonee.length} categorie hanno ${PAROLE_MINIME} parole`)
  }
}
if (totale > MASSIMO_TOTALE) problemi.push(`i file pesano ${Math.round(totale / 1024)} kB in tutto`)

/**
 * Le risposte che tutti si aspettano: se una non vale, una fonte e' cambiata
 * o un filtro e' sbagliato, e lo script si ferma prima di scrivere.
 */
const ATTESE: Array<[LetteraNomi, CategoriaNomi, string]> = [
  ['a', 'nomi', 'Anna'],
  ['n', 'nomi', 'Nicola'],
  ['a', 'citta', 'Ancona'],
  ['r', 'citta', 'Roma'],
  ['p', 'citta', 'Parigi'],
  ['f', 'paesi', 'Francia'],
  ['s', 'paesi', 'Stati Uniti'],
  ['t', 'acque', 'Tevere'],
  ['p', 'acque', 'il fiume Po'],
  ['g', 'acque', 'Lago di Garda'],
  ['m', 'acque', 'Mar Mediterraneo'],
  ['a', 'acque', 'Mar Adriatico'],
  ['a', 'animali', 'aquila'],
  ['b', 'animali', 'balena'],
  ['g', 'animali', 'gatto'],
  ['p', 'piante', 'pino'],
  ['p', 'frutta', 'pere'],
  ['c', 'cose', 'cucchiaio'],
  ['m', 'mestieri', 'medico'],
  ['m', 'mestieri', 'maestra'],
  ['v', 'verbi', 'volare'],
  ['b', 'aggettivi', 'bello'],
  ['g', 'colori', 'giallo'],
  ['s', 'sport', 'sci'],
  ['c', 'strumenti', 'chitarra'],
  ['m', 'corpo', 'mano'],
  ['c', 'vestiti', 'cappello'],
  ['l', 'cibi', 'lasagne'],
]
for (const [lettera, categoria, risposta] of ATTESE) {
  const voce = corpi.get(lettera)!
  if (!riconosci(lessicoDa(voce.file), categoria, lettera, risposta)) {
    problemi.push(`"${risposta}" non vale fra ${categoria} con la ${lettera.toUpperCase()}`)
  }
}
/** Le parole note che chiunque scriverebbe: se una manca, un filtro delle parole note e' sbagliato. */
const NOTE_ATTESE: Array<[LetteraNomi, CategoriaNomi, string]> = [
  ['m', 'nomi', 'Marco'],
  ['g', 'nomi', 'Giulia'],
  ['r', 'citta', 'Roma'],
  ['p', 'citta', 'Parigi'],
  ['f', 'paesi', 'Francia'],
  ['p', 'acque', 'Po'],
  ['c', 'animali', 'cane'],
  ['m', 'frutta', 'mela'],
  ['p', 'cibi', 'pizza'],
  ['m', 'mestieri', 'medico'],
  ['c', 'sport', 'calcio'],
  ['c', 'strumenti', 'chitarra'],
  ['r', 'colori', 'rosso'],
  ['m', 'corpo', 'mano'],
  ['s', 'vestiti', 'scarpa'],
  ['t', 'cose', 'tavolo'],
  ['m', 'verbi', 'mangiare'],
  ['b', 'aggettivi', 'bello'],
]
for (const [lettera, categoria, parola] of NOTE_ATTESE) {
  if (!corpi.get(lettera)!.file.note?.[categoria]?.includes(parola)) {
    problemi.push(`"${parola}" non e' fra le parole note di ${categoria} con la ${lettera.toUpperCase()}`)
  }
}

// Da dove viene ogni parola, per chi deve capire perché il gioco ne accetta una.
mkdirSync(CACHE_NOMI, { recursive: true })
writeFileSync(
  join(CACHE_NOMI, 'fonti.json'),
  JSON.stringify(Object.fromEntries(TUTTE_LE_CATEGORIE.map((c) => [c, Object.fromEntries(raccolte[c].parole)]))),
)

if (problemi.length > 0) {
  console.error(`Il lessico non torna, non scrivo niente:\n  ${problemi.join('\n  ')}`)
  process.exit(1)
}

mkdirSync(CARTELLA, { recursive: true })
for (const vecchio of readdirSync(CARTELLA)) {
  if (vecchio.endsWith('.json') && !corpi.has(vecchio.replace(/\.json$/, '') as LetteraNomi)) {
    rmSync(join(CARTELLA, vecchio))
  }
}
for (const [lettera, { testo }] of corpi) writeFileSync(join(CARTELLA, `${lettera}.json`), testo)

const righeVersioni = LETTERE_NOMI.map((l) => `  ${l}: '${corpi.get(l)!.file.versione}',`)
const righeConti = LETTERE_NOMI.flatMap((l) => [
  `  ${l}: {`,
  ...TUTTE_LE_CATEGORIE.filter((c) => conti[l][c]).map((c) => `    ${c}: ${conti[l][c]},`),
  '  },',
])
writeFileSync(
  FILE_CONTI,
  [
    '// Scritto da `npm run nomi:lessico` (scripts/genera-lessico-nomi.ts): non a mano.',
    "// Il lessico di Nomi, cose e città sta in public/dati/nomi-cose, un file per lettera: qui l'impronta di",
    "// ogni file, per l'indirizzo, e quante parole ha ogni categoria con ogni lettera.",
    "import type { CategoriaNomi, LetteraNomi } from './nomi-cose'",
    '',
    "/** L'impronta del file di ogni lettera: un file nuovo ha un indirizzo nuovo, e si tiene in cache per sempre. */",
    'export const VERSIONI_LESSICO_NOMI: Record<LetteraNomi, string> = {',
    ...righeVersioni,
    '}',
    '',
    '/** Quante parole conosce ogni categoria con ogni lettera: escono solo quelle che ne hanno abbastanza. */',
    'export const CONTI_LESSICO_NOMI: Record<LetteraNomi, Partial<Record<CategoriaNomi, number>>> = {',
    ...righeConti,
    '}',
    '',
    "/** L'indirizzo del file di una lettera, con l'impronta. */",
    'export function urlLessicoNomi(lettera: LetteraNomi): string {',
    '  return `/dati/nomi-cose/${lettera}.json?v=${VERSIONI_LESSICO_NOMI[lettera]}`',
    '}',
    '',
  ].join('\n'),
)

/* ─────────────────────────────  Il resoconto  ───────────────────────────── */

const SIGLE: Record<CategoriaNomi, string> = {
  nomi: 'nomi',
  cose: 'cose',
  citta: 'citt',
  animali: 'anim',
  piante: 'pian',
  frutta: 'frut',
  cibi: 'cibi',
  mestieri: 'mest',
  paesi: 'paes',
  acque: 'acqu',
  sport: 'spor',
  strumenti: 'strm',
  colori: 'colo',
  vestiti: 'vest',
  corpo: 'corp',
  verbi: 'verb',
  aggettivi: 'aggt',
}
const colonna = (x: string | number) => String(x).padStart(6)
console.log(`\n     ${TUTTE_LE_CATEGORIE.map((c) => colonna(SIGLE[c])).join('')}    kB`)
for (const lettera of LETTERE_NOMI) {
  const riga = TUTTE_LE_CATEGORIE.map((c) => colonna(conti[lettera][c] ?? 0)).join('')
  console.log(`  ${lettera.toUpperCase()}  ${riga}${colonna(Math.round(peso(corpi.get(lettera)!.testo) / 1024))}`)
}
const totali = TUTTE_LE_CATEGORIE.map((c) => colonna(raccolte[c].parole.size)).join('')
console.log(`  Σ  ${totali}${colonna(Math.round(totale / 1024))}`)

console.log('\n  Da dove vengono:')
for (const c of TUTTE_LE_CATEGORIE) {
  const perFonte = new Map<string, number>()
  for (const f of raccolte[c].parole.values()) perFonte.set(f, (perFonte.get(f) ?? 0) + 1)
  const fonti = [...perFonte].sort((a, b) => b[1] - a[1]).map(([f, n]) => `${f} ${n}`)
  console.log(`    ${c}: ${fonti.join(', ')}`)
}
console.log(`\n  Tolte: ${tolte.parolacce} parolacce, ${tolte.plurali} plurali e femminili di una parola che c'e'`)

if (argomenti.includes('--campioni')) {
  const rng = mulberry32(0x6e6f6d69)
  for (const lettera of ['a', 'm', 'z'] as const) {
    console.log(`\n  Con la ${lettera.toUpperCase()}:`)
    for (const c of TUTTE_LE_CATEGORIE) {
      const parole = [...(corpi.get(lettera)!.file.categorie[c] ?? [])]
      for (let i = parole.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rng() * (i + 1))
        ;[parole[i], parole[j]] = [parole[j], parole[i]]
      }
      console.log(`    ${c}: ${parole.slice(0, 15).join(' ')}`)
    }
  }
  console.log(`\n  Teste aggiunte (animali): ${testeAggiunte.animali.join(' ')}`)
  console.log(`\n  Teste aggiunte (piante): ${testeAggiunte.piante.join(' ')}`)
}
console.log(`\n  scritto public/dati/nomi-cose (${Math.round(totale / 1024)} kB) e shared/nomi-cose-lessico.ts`)

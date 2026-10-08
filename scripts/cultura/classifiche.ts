/**
 * Le classifiche di Wikipedia: le canzoni che hanno avuto successo, anno per
 * anno e paese per paese, con chi le cantava.
 *
 * Le canzoni di Wikidata con la voce in italiano erano poche proprio dove
 * servivano di piu': il rap italiano degli ultimi dieci anni riempie le
 * classifiche e ha poche voci tradotte, e fra le candidate ordinate per numero
 * di Wikipedia non ci arrivava. Le classifiche dicono che cosa si e' ascoltato,
 * di ogni genere: la classifica annuale della FIMI dal 2002, i numeri uno
 * italiani dal 1960, la classifica annuale di Billboard dal 1959, i numeri uno
 * inglesi dal 1952 e quelli latini di Billboard dal 1990. Sono tutte pagine di
 * Wikipedia, lette con la stessa API (`wikitesti`), e le pagine di un anno
 * nuovo si trovano da sole (`pagineConPrefisso`).
 *
 * Le tabelle si leggono per intestazione — la colonna del titolo, quella di
 * chi canta, il posto o la data — con le celle che coprono piu' righe (le
 * settimane di un numero uno) ripetute dove valgono. Chi canta e' quel che dice
 * la classifica, prima del "feat.": gli ospiti non sono la risposta, e non sono
 * mai una risposta sbagliata. Un nome che conta e' un collegamento, e il
 * collegamento porta alla voce di Wikidata.
 */

import { createHash } from 'node:crypto'
import { pagineConPrefisso, vociDiWikidata, wikitesti, type SitoWikipedia } from './rete'
import { titoloNormale } from './wikidata'

export type Classifica = 'italia' | 'italia-1' | 'usa' | 'regno-unito-1' | 'latina-1'

interface Fonte {
  classifica: Classifica
  sito: SitoWikipedia
  prefissi: readonly string[]
  /** Solo le pagine che lo dicono: i numeri uno italiani fra quelli di tutti i paesi. */
  filtro: RegExp
  /** Una classifica di numeri uno: ogni riga e' una settimana in cima, e il posto non c'e'. */
  numeriUno?: true
}

export const FONTI: readonly Fonte[] = [
  {
    classifica: 'italia',
    sito: 'it',
    prefissi: ['Classifica dei singoli più venduti in Italia nel'],
    filtro: /nel \d{4}$/,
  },
  {
    classifica: 'italia-1',
    sito: 'en',
    prefissi: ['List of number-one hits of'],
    filtro: /^List of number-one hits of \d{4} \(Italy\)$/,
    numeriUno: true,
  },
  { classifica: 'usa', sito: 'en', prefissi: ['Billboard Year-End Hot 100 singles of'], filtro: /of \d{4}$/ },
  {
    classifica: 'regno-unito-1',
    sito: 'en',
    prefissi: ['List of UK singles chart number ones of the'],
    filtro: /of the \d{4}s$/,
    numeriUno: true,
  },
  {
    classifica: 'latina-1',
    sito: 'en',
    prefissi: ['List of number-one Billboard Hot Latin', 'List of Billboard Hot Latin Songs and Latin Airplay'],
    filtro: /of \d{4}$/,
    numeriUno: true,
  },
]

/** Un nome nei crediti: com'e' scritto, e la pagina a cui porta, se e' un collegamento. */
export interface Credito {
  nome: string
  pagina?: string
}

/** Una canzone in una classifica di un anno. */
export interface Successo {
  classifica: Classifica
  sito: SitoWikipedia
  anno: number
  /** Il posto nella classifica di fine anno; per i numeri uno, 1. */
  posto: number
  /** Per i numeri uno, quante settimane in cima in quell'anno; per le altre, 1. */
  settimane: number
  titolo: string
  /** La pagina di Wikipedia della canzone, se il titolo e' un collegamento. */
  pagina?: string
  /** Chi la canta, prima del "feat.". */
  artisti: Credito[]
  /** Chi canta con loro ("feat.", "con"). */
  ospiti: Credito[]
}

/* ─────────────────────────────  I modelli  ─────────────────────────────── */

/** I modelli che non si leggono: note, riferimenti, bandiere, ancore, segni della legenda. */
const MUTI = new Set([
  '#tag:ref',
  'efn',
  'efn-ua',
  'efn-lr',
  'refn',
  'r',
  'rp',
  'sfn',
  'dead link',
  'cn',
  'citation needed',
  'clarify',
  'nota',
  'sronly',
  'anchor',
  'flagicon',
  'flag',
  'bandiera',
  'dagger',
  'double dagger',
  '*',
  'webarchive',
  'cite web',
  'cite news',
  'cita web',
  'cita news',
  'cita',
  'refbegin',
  'refend',
  'reflist',
  'note label',
  'ref label',
  'better source needed',
  'certification cite ref',
])

/** I parametri di un modello, separati dalle sbarre che non stanno dentro un collegamento. */
function parametri(corpo: string): string[] {
  const fuori: string[] = []
  let profondita = 0
  let pezzo = ''
  for (let i = 0; i < corpo.length; i += 1) {
    if (corpo.startsWith('[[', i)) profondita += 1
    if (corpo.startsWith(']]', i)) profondita = Math.max(0, profondita - 1)
    if (corpo[i] === '|' && profondita === 0) {
      fuori.push(pezzo)
      pezzo = ''
    } else pezzo += corpo[i]
  }
  fuori.push(pezzo)
  return fuori
}

/** Un modello letto: il testo che mostrerebbe, con i suoi collegamenti. */
function espandi(corpo: string): string {
  const [testa, ...resto] = parametri(corpo)
  const nome = testa.trim().replace(/^template:/i, '').toLowerCase()
  const posizionali = resto.filter((p) => !/^\s*[\w-]+\s*=/.test(p)).map((p) => p.trim())
  const nominato = (k: string) => resto.find((p) => new RegExp(`^\\s*${k}\\s*=`).test(p))?.replace(/^[^=]*=/, '').trim()
  if (MUTI.has(nome)) return ''
  if (nome === 'nbsp' || nome === '·' || nome === 'spaced ndash' || nome === 'snd') return ' '
  if (nome === "'s") return "'s"
  if (nome === "'") return "'"
  if (nome === 'sortname') {
    const [nomeProprio = '', cognome = '', pagina] = posizionali
    const testo = `${nomeProprio} ${cognome}`.trim()
    if (nominato('nolink')) return testo
    return `[[${pagina || testo}|${testo}]]`
  }
  if (nome === 'sort' || nome === 'hs' || nome === 'sort date') return posizionali[1] ?? posizionali[0] ?? ''
  if (nome === 'ill' || nome === 'interlanguage link' || nome === 'interlanguage link multi') {
    const pagina = posizionali[0] ?? ''
    return `[[${pagina}|${nominato('lt') ?? pagina}]]`
  }
  if (/^(dts|dts2|date|start date|birth date)$/.test(nome)) return posizionali.join('-')
  if (nome === 'abbr' || nome === 'tooltip' || nome === 'nowrap' || nome === 'nobr' || nome === 'small') {
    return posizionali[0] ?? ''
  }
  if (nome === 'not a typo' || nome === 'big' || nome === 'nts' || nome === 'center') return posizionali[0] ?? ''
  if (nome === 'lang' || nome === 'langx') return posizionali[1] ?? ''
  if (nome.startsWith('lang-')) return posizionali[0] ?? ''
  return ''
}

/**
 * Il wikitesto con i modelli letti, dal piu' interno: un "sort" che contiene
 * un collegamento diventa il collegamento. Prima vanno via i commenti e i
 * riferimenti, che hanno sbarre loro e spezzerebbero le celle.
 */
export function leggiModelli(testo: string): string {
  let t = testo
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<ref[^>]*\/>/gi, '')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
  for (let giro = 0; giro < 12; giro += 1) {
    const dopo = t.replace(/\{\{([^{}]*)\}\}/g, (_, corpo: string) => espandi(corpo))
    if (dopo === t) break
    t = dopo
  }
  return t
}

/* ─────────────────────────────  Le tabelle  ────────────────────────────── */

interface Cella {
  intestazione: boolean
  testo: string
  righe: number
  colonne: number
}

/** Le sbarre doppie che separano le celle, fuori dai collegamenti. */
function spezza(riga: string, separatore: '||' | '!!'): string[] {
  const fuori: string[] = []
  let profondita = 0
  let pezzo = ''
  for (let i = 0; i < riga.length; i += 1) {
    if (riga.startsWith('[[', i)) profondita += 1
    if (riga.startsWith(']]', i)) profondita = Math.max(0, profondita - 1)
    if (profondita === 0 && riga.startsWith(separatore, i)) {
      fuori.push(pezzo)
      pezzo = ''
      i += 1
    } else pezzo += riga[i]
  }
  fuori.push(pezzo)
  return fuori
}

/**
 * Una cella: gli attributi prima della sbarra, e il testo. Come fa MediaWiki,
 * quel che sta prima della prima sbarra fuori dai collegamenti sono attributi
 * anche quando sono scritti male: `align="center" "|[[Marcel Amont]]` e
 * `rowspan="2= | [[Coez]]` stanno davvero nelle pagine.
 */
function cella(grezza: string, intestazione: boolean): Cella {
  let attributi = ''
  let testo = grezza
  let profondita = 0
  for (let i = 0; i < grezza.length; i += 1) {
    if (grezza.startsWith('[[', i)) profondita += 1
    if (grezza.startsWith(']]', i)) profondita = Math.max(0, profondita - 1)
    if (profondita === 0 && grezza[i] === '|') {
      attributi = grezza.slice(0, i)
      testo = grezza.slice(i + 1)
      break
    }
  }
  const quante = (nome: string) => {
    const m = attributi.match(new RegExp(`${nome}\\s*=\\s*["']?(\\d+)`, 'i'))
    return m ? Math.max(1, Math.min(200, Number(m[1]))) : 1
  }
  return { intestazione, testo: testo.trim(), righe: quante('rowspan'), colonne: quante('colspan') }
}

/** Le tabelle di un wikitesto, come righe di celle grezze. */
function tabelleGrezze(testo: string): Cella[][][] {
  const tabelle: Cella[][][] = []
  const aperte: Cella[][][] = []
  for (const linea of testo.split('\n')) {
    const l = linea.trim()
    const tabella = aperte.at(-1)
    if (l.startsWith('{|')) {
      aperte.push([[]])
      continue
    }
    if (!tabella) continue
    const riga = tabella.at(-1)!
    if (l.startsWith('|}')) {
      tabelle.push(aperte.pop()!.filter((r) => r.length > 0))
    } else if (l.startsWith('|-')) {
      tabella.push([])
    } else if (l.startsWith('|+')) {
      // La didascalia non e' una riga.
    } else if (l.startsWith('!')) {
      for (const pezzo of spezza(l.slice(1), '!!').flatMap((p) => spezza(p, '||'))) riga.push(cella(pezzo, true))
    } else if (l.startsWith('|')) {
      for (const pezzo of spezza(l.slice(1), '||')) riga.push(cella(pezzo, false))
    } else if (riga.length > 0) {
      // Una cella che continua sulla riga dopo.
      riga[riga.length - 1].testo += `\n${l}`
    }
  }
  return tabelle
}

/** Le righe di una tabella come una griglia: una cella che copre piu' righe o colonne c'e' in ognuna. */
function griglia(righe: Cella[][]): Cella[][] {
  const fuori: Cella[][] = []
  const restano = new Map<number, { cella: Cella; quante: number }>()
  for (const riga of righe) {
    const piena: Cella[] = []
    let colonna = 0
    const occupa = () => {
      for (;;) {
        const r = restano.get(colonna)
        if (!r || r.quante <= 0) return
        piena[colonna] = r.cella
        r.quante -= 1
        if (r.quante === 0) restano.delete(colonna)
        colonna += 1
      }
    }
    for (const c of riga) {
      occupa()
      for (let k = 0; k < c.colonne; k += 1) {
        piena[colonna + k] = c
        if (c.righe > 1) restano.set(colonna + k, { cella: c, quante: c.righe - 1 })
      }
      colonna += c.colonne
    }
    // Le colonne in fondo coperte dalle righe di sopra.
    for (const [k, r] of [...restano].sort((a, b) => a[0] - b[0])) {
      if (k < colonna || piena[k]) continue
      piena[k] = r.cella
      r.quante -= 1
      if (r.quante === 0) restano.delete(k)
    }
    fuori.push(piena)
  }
  return fuori
}

/* ─────────────────────────────  Il testo  ──────────────────────────────── */

type Pezzo = { testo: string; pagina?: string }

const ALTRI_SPAZI = /^(?:file|image|immagine|category|categoria|media):/i

/** Il titolo di una pagina come lo vuole l'API: senza l'ancora, con gli spazi. */
export function paginaPulita(t: string): string | undefined {
  const p = t
    .replace(/#.*$/, '')
    .replace(/_/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return p.length > 0 && !p.startsWith(':') ? p : undefined
}

/** Il testo che si legge: senza grassetti, corsivi, tag, segni della legenda ("†") e spazi doppi. */
function leggibile(t: string): string {
  return t
    .replace(/<br\s*\/?>/gi, ' / ')
    .replace(/<[^>]+>/g, '')
    .replace(/'{2,}/g, '')
    .replace(/[†‡§¶]/g, '')
    // I rimandi alle note rimasti nel testo: "That Don't Impress Me Much[No 3]".
    .replace(/\[(?:no|nb|note|n)?\s*\d+\]|\[[a-z]\]/gi, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
}

/** Una cella in pezzi: i collegamenti, con la loro pagina, e il testo fra l'uno e l'altro. */
function pezzi(testo: string): Pezzo[] {
  const fuori: Pezzo[] = []
  let da = 0
  for (const m of testo.matchAll(/\[\[([^\]|]*)(?:\|([^\]]*))?\]\]/g)) {
    if (m.index > da) fuori.push({ testo: leggibile(testo.slice(da, m.index)) })
    da = m.index + m[0].length
    if (ALTRI_SPAZI.test(m[1].trim())) continue
    const pagina = paginaPulita(m[1])
    fuori.push({ testo: leggibile(m[2] ?? m[1]).trim(), ...(pagina ? { pagina } : {}) })
  }
  if (da < testo.length) fuori.push({ testo: leggibile(testo.slice(da)) })
  return fuori.filter((p) => p.testo.length > 0)
}

/** Le parole che dicono gli ospiti: dopo di loro, chi canta con chi canta. */
const OSPITI = /\b(?:feat\.?|featuring|ft\.?|with|con)(?=\s|$)/i

/** Quel che separa due nomi: le virgole, "e", "and", "&", "x", "vs.". */
const SEPARATORI = /(?:,|;|&|\+|\/|\band\b|\be\b|\bed\b|\bx\b|\bvs\.?|\bversus\b|\(|\))/gi

/** I crediti di una cella: chi canta e chi e' ospite, nell'ordine. */
export function crediti(testo: string): { artisti: Credito[]; ospiti: Credito[] } {
  const artisti: Credito[] = []
  const ospiti: Credito[] = []
  let dove = artisti
  for (const p of pezzi(testo)) {
    if (p.pagina) {
      dove.push({ nome: p.testo, pagina: p.pagina })
      continue
    }
    // Il testo fra due nomi: separatori, e magari "feat." o un nome senza collegamento.
    const parti = p.testo.split(OSPITI)
    parti.forEach((parte, i) => {
      if (i > 0) dove = ospiti
      for (const nome of parte.split(SEPARATORI)) {
        const n = nome.replace(/["“”]/g, '').trim()
        if (n.length > 1 && /\p{L}/u.test(n)) dove.push({ nome: n })
      }
    })
  }
  return { artisti, ospiti }
}

/**
 * Il titolo di una cella, senza le virgolette: quello del primo collegamento,
 * se ce n'e' uno — un lato B ha il suo, e "Town Called Malice" e "Precious"
 * attaccati non sono un titolo —, se no il testo.
 */
function titoloDi(testo: string): { titolo: string; pagina?: string } | null {
  const tutti = pezzi(testo)
  const primo = tutti.find((p) => p.pagina)
  const scritto = (primo ? primo.testo : tutti.map((p) => p.testo).join(''))
    .replace(/["“”]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!scritto) return null
  // Un collegamento in corsivo e' un album o un EP, non un singolo.
  const album = /''\s*\[\[/.test(testo)
  return { titolo: scritto, ...(primo?.pagina && !album ? { pagina: primo.pagina } : {}) }
}

/* ─────────────────────────────  Le classifiche  ─────────────────────────── */

const COLONNA_TITOLO = /\b(?:titolo|title|single|song|brano|canzone|singolo)/i
const COLONNA_ARTISTA = /\b(?:artista|artist|interpret|performer)/i
const COLONNA_POSTO = /^(?:n°|nº|no\.?|n\.|#|pos\.?|posizione|position|rank|numero|number)$/i
const COLONNA_DATA = /\b(?:data|date|issue)\b/i
const COLONNA_SETTIMANE = /\bweeks?\s+at\b|\bsettimane\b/i

/** L'anno scritto in un testo: "1980-1-19", "5 January 1980". */
function annoIn(t: string): number | null {
  const m = t.match(/\b(19[5-9]\d|20[0-4]\d)\b/)
  return m ? Number(m[1]) : null
}

/**
 * Le canzoni di una pagina. L'anno e' quello del titolo; per le pagine di un
 * decennio quello della data di ogni riga. Le tabelle senza una colonna del
 * titolo e una di chi canta (le legende, gli indici, gli artisti con piu'
 * settimane) non contano.
 */
export function successiDellaPagina(fonte: Fonte, titoloPagina: string, wikitesto: string): Successo[] {
  const annoPagina = /\d{4}s$/.test(titoloPagina) ? null : annoIn(titoloPagina)
  const fuori = new Map<string, Successo>()
  for (const grezza of tabelleGrezze(leggiModelli(wikitesto))) {
    const g = griglia(grezza)
    // Le intestazioni sono le righe tutte di intestazioni in cima: piu' sotto sono gli anni di un decennio.
    let testate = 0
    while (testate < g.length && g[testate].length > 0 && g[testate].every((c) => c?.intestazione)) testate += 1
    if (testate === 0) continue
    const colonne = Math.max(...g.map((r) => r.length))
    // Il nome di una colonna e' quello piu' in basso, senza le righe di una cella sola larga quanto la
    // tabella: sopra le colonne c'e' magari "Singles Chart", sotto il primo anno del decennio.
    const vere = g.slice(0, testate).filter((r) => new Set(r).size > 1)
    if (vere.length === 0) continue
    const nomi = Array.from({ length: colonne }, (_, k) => leggibile(vere.at(-1)![k]?.testo ?? '').trim())
    const titolo = nomi.findIndex((n) => COLONNA_TITOLO.test(n) && !/album/i.test(n))
    if (titolo < 0) continue
    const artista = nomi
      .map((n, k) => ({ n, k }))
      .filter(({ n }) => COLONNA_ARTISTA.test(n))
      .sort((a, b) => Math.abs(a.k - titolo) - Math.abs(b.k - titolo) || b.k - a.k)[0]?.k
    if (artista === undefined) continue
    const posto = fonte.numeriUno ? -1 : nomi.findIndex((n) => COLONNA_POSTO.test(n))
    const data = nomi.findIndex((n) => COLONNA_DATA.test(n) && !COLONNA_SETTIMANE.test(n))
    const durata = nomi.findIndex((n) => COLONNA_SETTIMANE.test(n))
    let ultimoPosto = 0
    // La cella del titolo dell'ultima riga di ogni canzone: una cella che copre piu' righe e' la stessa volta in cima.
    const ultimaCella = new Map<string, Cella | undefined>()
    for (const riga of g.slice(testate)) {
      const t = riga[titolo]
      const a = riga[artista]
      if (!t || !a || t.intestazione || a.intestazione) continue
      const anno = annoPagina ?? (data >= 0 && riga[data] ? annoIn(leggibile(riga[data]!.testo)) : null)
      if (anno === null) continue
      const letto = titoloDi(t.testo)
      // Un EP in classifica non e' una canzone: "Vasco Extended Play", "Too Much Too Young (EP)".
      if (!letto || /\bextended play\b|\(ep\)|\bep$/i.test(letto.titolo)) continue
      const { artisti, ospiti } = crediti(a.testo)
      if (artisti.length === 0) continue
      const numero = posto >= 0 && riga[posto] ? Number(leggibile(riga[posto]!.testo).match(/\d+/)?.[0]) : NaN
      const qui = fonte.numeriUno ? 1 : Number.isFinite(numero) && numero > 0 ? numero : ultimoPosto + 1
      ultimoPosto = qui
      // Le pagine inglesi dei numeri uno hanno una riga per volta in cima, con le sue settimane;
      // quelle italiane una per settimana.
      const lette = durata >= 0 && riga[durata] ? Number(leggibile(riga[durata]!.testo).match(/\d+/)?.[0]) : NaN
      const settimane = Number.isFinite(lette) && lette > 0 ? Math.min(lette, 52) : 1
      const chiave = `${anno}\u0000${letto.titolo}\u0000${artisti.map((x) => x.nome).join(',')}`
      const prima = fuori.get(chiave)
      if (prima) {
        // Lo stesso numero uno un'altra volta: senza la colonna delle settimane ogni riga e' una
        // settimana; con la colonna, una riga nuova e' un'altra volta in cima, con le sue.
        if (fonte.numeriUno && durata < 0) prima.settimane += 1
        else if (fonte.numeriUno && riga[titolo] !== ultimaCella.get(chiave)) prima.settimane += settimane
        ultimaCella.set(chiave, riga[titolo])
        prima.posto = Math.min(prima.posto, qui)
        continue
      }
      ultimaCella.set(chiave, riga[titolo])
      fuori.set(chiave, {
        classifica: fonte.classifica,
        sito: fonte.sito,
        anno,
        posto: qui,
        settimane,
        titolo: letto.titolo,
        ...(letto.pagina ? { pagina: letto.pagina } : {}),
        artisti,
        ospiti,
      })
    }
  }
  return [...fuori.values()]
}

/** Le pagine di una fonte, dal piu' vecchio. */
async function pagineDi(fonte: Fonte): Promise<string[]> {
  const tutte = await Promise.all(fonte.prefissi.map((p) => pagineConPrefisso(fonte.sito, p)))
  return [...new Set(tutte.flat())].filter((t) => fonte.filtro.test(t)).sort()
}

/** Tutte le canzoni delle classifiche, di tutte le fonti. */
export async function successi(): Promise<Successo[]> {
  const fuori: Successo[] = []
  for (const fonte of FONTI) {
    const titoli = await pagineDi(fonte)
    const testi = await wikitesti(fonte.sito, titoli)
    let quante = 0
    for (const titolo of titoli) {
      const testo = testi.get(titolo)
      if (!testo) continue
      const qui = successiDellaPagina(fonte, titolo, testo)
      quante += qui.length
      fuori.push(...qui)
    }
    console.log(`  ${fonte.classifica}: ${titoli.length} pagine, ${quante} canzoni`)
  }
  return fuori
}

/* ─────────────────────  Dalle classifiche alle voci  ───────────────────── */

/**
 * Quanto conta una classifica per chi gioca in italiano: le italiane per
 * intero, quella di Billboard e i numeri uno inglesi un terzo, i numeri uno
 * latini un quarto. Il successo di fuori qui si e' sentito meno, e una canzone
 * famosa anche da noi ha comunque la sua voce in italiano, che si legge.
 */
const PESO_CLASSIFICA: Record<Classifica, number> = {
  italia: 1,
  'italia-1': 1,
  usa: 0.35,
  'regno-unito-1': 0.35,
  'latina-1': 0.25,
}

const NUMERI_UNO = new Set(FONTI.filter((f) => f.numeriUno).map((f) => f.classifica))

/**
 * Quanto vale un anno in classifica: il primo posto uno, il quarto la meta', il
 * centesimo un decimo. Un numero uno vale come il primo posto, e fino al
 * doppio se ci e' rimasto per mesi.
 */
function valoreDi(s: Successo): number {
  const posto = NUMERI_UNO.has(s.classifica) ? Math.min(2, 1 + (s.settimane - 1) / 8) : 1 / Math.sqrt(s.posto)
  return PESO_CLASSIFICA[s.classifica] * posto
}

/** Un nome come si confronta: minuscolo, senza accenti e segni, senza "The" davanti. */
export function nomeNormale(n: string): string {
  return n
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/^the /, '')
}

/** Una canzone delle classifiche, con le voci di Wikidata di chi la canta. */
export interface CanzoneDiClassifica {
  /** La voce della canzone, se ha una pagina che e' davvero sua; se no un identificativo dal titolo. */
  id: string
  /** Se `id` e' una voce di Wikidata. */
  voce: boolean
  titolo: string
  /** Chi la canta, nell'ordine della classifica: vuoto se qualcuno non ha una voce. */
  artisti: string[]
  /**
   * Chi la canta in ognuna delle versioni entrate in classifica, dalla piu' in
   * alto: una canzone con la sua voce puo' esserci con una cover ("Volare" di
   * Bobby Rydell e' la voce di "Nel blu dipinto di blu"), e chi la canta lo
   * sceglie chi sa di chi e' la canzone.
   */
  versioni: string[][]
  ospiti: string[]
  /** Il primo anno in classifica. */
  anno: number
  /** Il successo: la somma degli anni in classifica, ognuno con il suo posto e il peso della classifica. */
  successo: number
  dove: Classifica[]
}

/**
 * Le canzoni delle classifiche, una per canzone anche quando e' in piu'
 * classifiche e in piu' anni. Wikipedia collega un nome solo la prima volta
 * che compare: un nome senza collegamento prende la pagina che ha altrove
 * sullo stesso sito, o quella col suo nome. Il collegamento del titolo porta
 * spesso all'album o all'artista — la pagina della canzone non c'e' e rinvia —
 * e `sonoCanzoni` dice quali voci sono davvero canzoni. Le altre si
 * riconoscono dal titolo e da chi le canta.
 */
export async function canzoniDelleClassifiche(
  sonoCanzoni: (ids: readonly string[]) => Promise<Set<string>>,
): Promise<CanzoneDiClassifica[]> {
  const tutti = await successi()

  const pagineDeiNomi = new Map<string, Map<string, number>>()
  for (const s of tutti) {
    for (const c of [...s.artisti, ...s.ospiti]) {
      if (!c.pagina) continue
      const k = `${s.sito} ${nomeNormale(c.nome)}`
      const volte = pagineDeiNomi.get(k) ?? new Map<string, number>()
      volte.set(c.pagina, (volte.get(c.pagina) ?? 0) + 1)
      pagineDeiNomi.set(k, volte)
    }
  }
  const paginaDi = (sito: SitoWikipedia, c: Credito): string | undefined => {
    if (c.pagina) return c.pagina
    const volte = pagineDeiNomi.get(`${sito} ${nomeNormale(c.nome)}`)
    if (volte) return [...volte].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]
    return paginaPulita(c.nome)
  }

  const voci = new Map<SitoWikipedia, Map<string, string | null>>()
  for (const sito of ['it', 'en'] as const) {
    const pagine = new Set<string>()
    for (const s of tutti) {
      if (s.sito !== sito) continue
      if (s.pagina) pagine.add(s.pagina)
      for (const c of [...s.artisti, ...s.ospiti]) {
        const p = paginaDi(sito, c)
        if (p) pagine.add(p)
      }
    }
    voci.set(sito, await vociDiWikidata(sito, [...pagine]))
  }
  const voceDi = (sito: SitoWikipedia, pagina: string | undefined) =>
    (pagina ? voci.get(sito)?.get(pagina) : null) ?? undefined

  const letti = tutti.map((s) => ({
    s,
    id: voceDi(s.sito, s.pagina),
    artisti: s.artisti.map((c) => voceDi(s.sito, paginaDi(s.sito, c))),
    ospiti: s.ospiti.map((c) => voceDi(s.sito, paginaDi(s.sito, c))).filter((q): q is string => !!q),
  }))
  const canzoni = await sonoCanzoni([...new Set(letti.map((l) => l.id).filter((q): q is string => !!q))])
  for (const l of letti) if (l.id && !canzoni.has(l.id)) l.id = undefined

  // La stessa canzone senza pagina in una classifica e con la pagina in un'altra: dal titolo e da chi la canta.
  const chiave = (titolo: string, artista: string) => `${titoloNormale(titolo)} ${artista}`
  const dalTitolo = new Map<string, string>()
  for (const l of letti) if (l.id && l.artisti[0]) dalTitolo.set(chiave(l.s.titolo, l.artisti[0]), l.id)
  const gruppi = new Map<string, typeof letti>()
  for (const l of letti) {
    const primo = l.artisti[0]
    const id = l.id ?? (primo ? dalTitolo.get(chiave(l.s.titolo, primo)) : undefined)
    const k = id ?? (primo ? chiave(l.s.titolo, primo) : null)
    if (!k) continue
    if (id) l.id = id
    gruppi.set(k, [...(gruppi.get(k) ?? []), l])
  }

  const fuori: CanzoneDiClassifica[] = []
  for (const [k, gruppo] of gruppi) {
    const ordinati = [...gruppo].sort((a, b) => valoreDi(b.s) - valoreDi(a.s))
    const id = ordinati.find((l) => l.id)?.id
    // Chi la canta: dalla classifica che l'ha messa piu' in alto, fra quelle dove tutti hanno una voce.
    const complete = ordinati.filter((l) => l.artisti.every((q) => q))
    const credito = complete[0]
    const artisti = (credito?.artisti ?? []) as string[]
    const versioni = [...new Map(complete.map((l) => [l.artisti.join(' '), l.artisti as string[]])).values()]
    const ospiti = [...new Set(ordinati.flatMap((l) => l.ospiti))].filter((q) => !artisti.includes(q))
    fuori.push({
      id: id ?? `cl${createHash('sha1').update(k).digest('hex').slice(0, 10)}`,
      voce: !!id,
      titolo: (credito ?? ordinati[0]).s.titolo,
      artisti,
      versioni,
      ospiti,
      anno: Math.min(...gruppo.map((l) => l.s.anno)),
      successo: Math.round(gruppo.reduce((somma, l) => somma + valoreDi(l.s), 0) * 1000) / 1000,
      dove: [...new Set(gruppo.map((l) => l.s.classifica))],
    })
  }
  const conVoce = fuori.filter((c) => c.voce).length
  console.log(`  ${tutti.length} righe, ${fuori.length} canzoni, ${conVoce} con la loro voce`)
  return fuori
}

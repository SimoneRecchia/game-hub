/**
 * Le linee dei fiumi e le forme dei laghi per la cartina, da Natural Earth.
 *
 * I laghi di Natural Earth hanno quasi tutti l'identificativo di Wikidata, e si
 * prendono con quello. I fiumi no: il file del mondo intero non ne ha nessuno,
 * e quelli d'Europa e del Nord America solo in parte. Un fiume si ritrova
 * allora per nome — quello inglese, che e' il nome che usa Natural Earth, e gli
 * altri nomi inglesi di Wikidata ("Amazonas" e' un alias) — e per posto: un
 * tratto con il nome giusto vale solo se passa vicino al punto di Wikidata, o
 * se sta dentro i paesi che il fiume attraversa. Senza, il Colorado del Texas
 * e quello dell'Argentina sarebbero lo stesso fiume.
 *
 * Poi le linee si semplificano — a scala di mondo un fiume non ha bisogno di
 * un punto ogni cento metri — e si scrivono come numeri interi, in centesimi
 * di grado e come differenze dal punto prima (`codificaLinea`): un terzo del
 * peso di un GeoJSON, ed e' quel che scarica il telefono.
 */

import { codificaLinea } from '../../shared/quiz-dati'
import type { Punto } from '../../shared/topojson'

/** I file di Natural Earth, dal repository ufficiale e a una versione fissa: non cambiano mai. */
export function urlNaturalEarth(file: string): string {
  return `https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@v5.1.2/geojson/${file}.geojson`
}

/** I laghi: il mondo, e i due file con i laghi minori d'Europa e del Nord America. */
export const FILE_LAGHI = ['ne_10m_lakes', 'ne_10m_lakes_europe', 'ne_10m_lakes_north_america'] as const
/** I fiumi: il mondo prima, per nome; poi i due file regionali, che hanno gli identificativi. */
export const FILE_FIUMI = ['ne_10m_rivers_lake_centerlines', 'ne_10m_rivers_europe', 'ne_10m_rivers_north_america'] as const

export interface FeatureNE {
  properties: Record<string, unknown>
  geometry: { type: string; coordinates: unknown } | null
}

export interface RaccoltaNE {
  features: FeatureNE[]
}

/** Un fiume o un lago da ritrovare: i suoi nomi, e dove dovrebbe stare. */
export interface Cercato {
  id: string
  nomi: string[]
  /** Il punto di Wikidata: per un fiume di solito la foce o la sorgente. */
  punto: Punto | null
  /** I rettangoli dei paesi che tocca: [ovest, sud, est, nord]. */
  riquadri: Array<readonly [number, number, number, number]>
}

type Linea = Punto[]

/**
 * Il Nilo di Natural Earth comincia a Khartum: il resto ha i nomi dei suoi
 * tratti. Wikidata lo fa partire dal lago Vittoria, e i paesi che attraversa
 * sono quelli di tutto il corso.
 */
const TRATTI_IN_PIU: Record<string, string[]> = {
  Q3392: ['White Nile', 'Mountain Nile', 'Albert Nile', 'Victoria Nile'],
}

/** Le parole che non fanno il nome: "River Thames" e "Thames" sono lo stesso fiume. */
const GENERICHE =
  /\b(the|river|rivers|rio|riviere|fleuve|fluss|reka|rzeka|nehri|lake|lakes|lago|lac|see|ozero|jezioro|jarvi|hu|co|nuur|nur|reservoir|vodokhranilishche|of|r)\b/g

/** Il nome ridotto all'osso: senza accenti, parentesi, maiuscole e parole generiche. */
export function chiaveNome(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^a-z]+/g, ' ')
    .replace(GENERICHE, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function linee(g: FeatureNE['geometry']): Linea[] {
  if (!g) return []
  if (g.type === 'LineString') return [g.coordinates as Linea]
  if (g.type === 'MultiLineString') return g.coordinates as Linea[]
  return []
}

/** Gli anelli esterni: le isole in mezzo a un lago, a questa scala, non si vedono. */
function anelli(g: FeatureNE['geometry']): Linea[] {
  if (!g) return []
  if (g.type === 'Polygon') return [(g.coordinates as Linea[])[0]]
  if (g.type === 'MultiPolygon') return (g.coordinates as Linea[][]).map((p) => p[0])
  return []
}

const nomiDi = (f: FeatureNE) =>
  ['name_en', 'name', 'name_alt']
    .map((k) => f.properties[k])
    .filter((v): v is string => typeof v === 'string' && v.length > 0)

/** Se un tratto passa vicino al punto di Wikidata: entro un grado e mezzo, circa cento chilometri. */
function vicino(parti: Linea[], punto: Punto | null, raggio = 1.5): boolean {
  if (!punto) return false
  return parti.some((l) => l.some(([x, y]) => Math.abs(x - punto[0]) <= raggio && Math.abs(y - punto[1]) <= raggio))
}

/** Se la maggior parte dei punti sta dentro i paesi che il fiume attraversa, con un grado di margine. */
function neiSuoiPaesi(parti: Linea[], riquadri: Cercato['riquadri']): boolean {
  if (riquadri.length === 0) return false
  let dentro = 0
  let tutti = 0
  for (const l of parti) {
    for (const [x, y] of l) {
      tutti += 1
      if (riquadri.some(([o, s, e, n]) => x >= o - 1 && x <= e + 1 && y >= s - 1 && y <= n + 1)) dentro += 1
    }
  }
  return tutti > 0 && dentro / tutti >= 0.6
}

/** Le feature di una raccolta per nome ridotto. */
function perNome(raccolte: readonly RaccoltaNE[]): Map<string, FeatureNE[]> {
  const indice = new Map<string, FeatureNE[]>()
  for (const r of raccolte) {
    for (const f of r.features) {
      for (const chiave of new Set(nomiDi(f).map(chiaveNome))) {
        if (!chiave) continue
        const elenco = indice.get(chiave) ?? []
        elenco.push(f)
        indice.set(chiave, elenco)
      }
    }
  }
  return indice
}

function perIdentificativo(raccolte: readonly RaccoltaNE[]): Map<string, FeatureNE[]> {
  const indice = new Map<string, FeatureNE[]>()
  // Il primo file che ha un identificativo lo tiene: gli altri lo ripetono, con piu' dettaglio.
  for (const r of raccolte) {
    const qui = new Map<string, FeatureNE[]>()
    for (const f of r.features) {
      const id = f.properties.wikidataid
      if (typeof id !== 'string' || !/^Q\d+$/.test(id) || indice.has(id)) continue
      const elenco = qui.get(id) ?? []
      elenco.push(f)
      qui.set(id, elenco)
    }
    for (const [id, elenco] of qui) indice.set(id, elenco)
  }
  return indice
}

/** Le feature con uno dei nomi cercati, che stanno dove dovrebbero. */
function perNomeEPosto(c: Cercato, indice: Map<string, FeatureNE[]>, forma: (g: FeatureNE['geometry']) => Linea[]): Linea[] {
  const chiavi = new Set([...c.nomi, ...(TRATTI_IN_PIU[c.id] ?? [])].map(chiaveNome).filter(Boolean))
  const candidate = new Set<FeatureNE>()
  for (const k of chiavi) for (const f of indice.get(k) ?? []) candidate.add(f)
  const buone: Linea[] = []
  let soloNeiLaghi = true
  for (const f of candidate) {
    const parti = forma(f.geometry)
    if (!vicino(parti, c.punto) && !neiSuoiPaesi(parti, c.riquadri)) continue
    buone.push(...parti)
    if (f.properties.featurecla !== 'Lake Centerline') soloNeiLaghi = false
  }
  // Un fiume che nel mondo e' solo le sue linee dentro i laghi (lo Snake, tre bacini) non ha una linea da mostrare.
  if (soloNeiLaghi && forma === linee) return []
  return collegate(buone, c.punto)
}

/** Quanto possono distare due tratti della stessa rete: Natural Earth spezza un fiume a ogni affluente. */
const TOCCA = 1
/** Il buco piu' lungo fra due pezzi dello stesso corso: un lago, una gola che Natural Earth non ha. */
const BUCO_MASSIMO = 3

function riquadroLinea(l: Linea): [number, number, number, number] {
  let [o, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const [x, y] of l) {
    if (x < o) o = x
    if (x > e) e = x
    if (y < s) s = y
    if (y > n) n = y
  }
  return [o, s, e, n]
}

function lunghezza(l: Linea): number {
  let totale = 0
  for (let i = 1; i < l.length; i += 1) totale += Math.hypot(l[i][0] - l[i - 1][0], l[i][1] - l[i - 1][1])
  return totale
}

/**
 * I tratti che fanno il fiume, fra quelli con il suo nome. Il riquadro dei
 * paesi non basta: la Cina e' grande, e il "Black River" del Vietnam, che ha
 * un nome inglese dell'Amur, ci stava dentro.
 *
 * I tratti che si toccano a un capo sono una rete. Si tengono le reti vicine al
 * punto di Wikidata, o se non ce ne sono la piu' lunga; e la piu' lunga anche
 * quando e' il doppio di quelle, perché il punto sta spesso alla sorgente, dove
 * il fiume ha un altro nome (l'Irtyš nasce in Cina come Ertix). Poi le reti che
 * cominciano poco dopo la fine di una tenuta: il corso che Natural Earth
 * interrompe a un lago, o in una gola (il Lualaba, il Brahmaputra).
 */
export function collegate(parti: readonly Linea[], punto: Punto | null): Linea[] {
  if (parti.length <= 1) return [...parti]
  const riquadri = parti.map(riquadroLinea)
  const capi = (l: Linea) => [l[0], l[l.length - 1]]
  const tocca = (i: number, j: number) => {
    const [o1, s1, e1, n1] = riquadri[i]
    const [o2, s2, e2, n2] = riquadri[j]
    if (o1 > e2 + TOCCA || o2 > e1 + TOCCA || s1 > n2 + TOCCA || s2 > n1 + TOCCA) return false
    const capoSu = (a: Linea, b: Linea) =>
      capi(a).some(([x, y]) => b.some(([u, v]) => Math.abs(x - u) <= TOCCA && Math.abs(y - v) <= TOCCA))
    return capoSu(parti[i], parti[j]) || capoSu(parti[j], parti[i])
  }

  const capo = parti.map((_, i) => i)
  const radice = (i: number): number => (capo[i] === i ? i : (capo[i] = radice(capo[i])))
  for (let i = 0; i < parti.length; i += 1) {
    for (let j = i + 1; j < parti.length; j += 1) if (radice(i) !== radice(j) && tocca(i, j)) capo[radice(i)] = radice(j)
  }
  const perRadice = new Map<number, number[]>()
  parti.forEach((_, i) => perRadice.set(radice(i), [...(perRadice.get(radice(i)) ?? []), i]))
  const reti = [...perRadice.values()]
  const lunga = (rete: number[]) => rete.reduce((s, i) => s + lunghezza(parti[i]), 0)
  const piuLunga = reti.reduce((a, b) => (lunga(b) > lunga(a) ? b : a))
  const vicine = reti.filter((rete) => rete.some((i) => vicino([parti[i]], punto)))
  const prese = new Set(vicine.length > 0 ? vicine : [piuLunga])
  if (lunga(piuLunga) >= 2 * [...prese].reduce((s, r) => s + lunga(r), 0)) prese.add(piuLunga)

  const capiDi = (rete: number[]) => rete.flatMap((i) => capi(parti[i]))
  // Un capo sul punto di Wikidata e' la foce o la sorgente: di la' il fiume non continua. La fine del
  // Salado del Norte e' a due gradi dall'inizio del Salado di Buenos Aires, che e' un altro fiume.
  const sulPunto = ([x, y]: Punto) => !!punto && Math.abs(x - punto[0]) <= 0.5 && Math.abs(y - punto[1]) <= 0.5
  for (let cresciuta = true; cresciuta; ) {
    cresciuta = false
    for (const rete of reti) {
      if (prese.has(rete)) continue
      const suoi = capiDi(rete)
      const dopo = [...prese].some((p) =>
        capiDi(p).some(
          (c) => !sulPunto(c) && suoi.some(([u, v]) => Math.hypot(c[0] - u, c[1] - v) <= BUCO_MASSIMO),
        ),
      )
      if (!dopo) continue
      prese.add(rete)
      cresciuta = true
    }
  }
  const tenute = new Set([...prese].flat())
  return parti.filter((_, i) => tenute.has(i))
}

/**
 * I tratti di un fiume uniti dove si toccano: Natural Earth spezza un fiume a
 * ogni affluente, e cento pezzi da tre punti pesano piu' di dieci da trenta.
 */
export function unisci(parti: readonly Linea[]): Linea[] {
  const chiave = ([x, y]: Punto) => `${Math.round(x * 1000)},${Math.round(y * 1000)}`
  const restanti = parti.filter((l) => l.length >= 2).map((l) => [...l])
  const uniti: Linea[] = []
  while (restanti.length > 0) {
    let linea = restanti.pop()!
    let cresciuta = true
    while (cresciuta) {
      cresciuta = false
      for (let i = 0; i < restanti.length; i += 1) {
        const altra = restanti[i]
        const [a, b] = [linea[0], linea[linea.length - 1]]
        const [c, d] = [altra[0], altra[altra.length - 1]]
        let nuova: Linea | null = null
        if (chiave(b) === chiave(c)) nuova = [...linea, ...altra.slice(1)]
        else if (chiave(b) === chiave(d)) nuova = [...linea, ...[...altra].reverse().slice(1)]
        else if (chiave(a) === chiave(d)) nuova = [...altra, ...linea.slice(1)]
        else if (chiave(a) === chiave(c)) nuova = [...[...altra].reverse(), ...linea.slice(1)]
        if (nuova) {
          linea = nuova
          restanti.splice(i, 1)
          cresciuta = true
          break
        }
      }
    }
    uniti.push(linea)
  }
  return uniti
}

/** Douglas-Peucker: tiene i punti che si scostano dalla linea piu' della tolleranza, in gradi. */
export function semplifica(punti: Linea, tolleranza: number): Linea {
  if (punti.length < 3) return punti
  const tieni = new Uint8Array(punti.length)
  tieni[0] = 1
  tieni[punti.length - 1] = 1
  const pila: Array<[number, number]> = [[0, punti.length - 1]]
  while (pila.length > 0) {
    const [da, a] = pila.pop()!
    const [ax, ay] = punti[da]
    const [bx, by] = punti[a]
    const dx = bx - ax
    const dy = by - ay
    const lungo = dx * dx + dy * dy
    let massimo = -1
    let indice = -1
    for (let i = da + 1; i < a; i += 1) {
      const [x, y] = punti[i]
      const t = lungo > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / lungo)) : 0
      const d = Math.hypot(x - (ax + t * dx), y - (ay + t * dy))
      if (d > massimo) {
        massimo = d
        indice = i
      }
    }
    if (massimo > tolleranza) {
      tieni[indice] = 1
      pila.push([da, indice], [indice, a])
    }
  }
  return punti.filter((_, i) => tieni[i] === 1)
}

/** Le tolleranze, in gradi: un fiume e' una riga, un lago ha una forma da riconoscere. */
export const TOLLERANZA_FIUMI = 0.03
export const TOLLERANZA_LAGHI = 0.012

function codifica(parti: Linea[], tolleranza: number, chiuse: boolean): number[][] {
  return parti
    .map((l) => codificaLinea(semplifica(l, tolleranza)))
    // Un tratto ridotto a un punto, o un lago a un segmento, non si vede: via.
    .filter((c) => c.length >= (chiuse ? 8 : 4))
}

/**
 * I fiumi: prima il file del mondo, per nome e posto; quelli che mancano, o
 * che nel mondo sono solo qualche pezzo, dai file regionali, per
 * identificativo. Il risultato e' gia' codificato.
 */
export function geometrieFiumi(cercati: readonly Cercato[], raccolte: Record<(typeof FILE_FIUMI)[number], RaccoltaNE>): Map<string, number[][]> {
  const nomi = perNome([raccolte.ne_10m_rivers_lake_centerlines])
  const regionali = perIdentificativo([raccolte.ne_10m_rivers_europe, raccolte.ne_10m_rivers_north_america])
  const trovati = new Map<string, number[][]>()
  const totale = (parti: Linea[]) => parti.reduce((s, l) => s + lunghezza(l), 0)
  for (const c of cercati) {
    const perNome = perNomeEPosto(c, nomi, linee)
    const perId = (regionali.get(c.id) ?? []).flatMap((f) => linee(f.geometry))
    // Il file regionale anche quando il mondo ha solo qualche pezzo: lo Snake, nel mondo, sono tre laghi.
    const parti = totale(perNome) >= 0.3 * totale(perId) ? perNome : perId
    if (parti.length === 0) continue
    const codici = codifica(unisci(parti), TOLLERANZA_FIUMI, false)
    if (codici.length > 0) trovati.set(c.id, codici)
  }
  return trovati
}

/**
 * I laghi: per identificativo in tutti e tre i file, e per nome e posto quelli
 * che non l'hanno — fra le forme che non sono gia' di un altro lago cercato.
 */
export function geometrieLaghi(cercati: readonly Cercato[], raccolte: Record<(typeof FILE_LAGHI)[number], RaccoltaNE>): Map<string, number[][]> {
  const tutte = FILE_LAGHI.map((f) => raccolte[f])
  const perId = perIdentificativo(tutte)
  const nostri = new Set(cercati.map((c) => c.id))
  const libere: RaccoltaNE = {
    features: tutte.flatMap((r) =>
      r.features.filter((f) => {
        const id = f.properties.wikidataid
        return typeof id !== 'string' || !nostri.has(id)
      }),
    ),
  }
  const nomi = perNome([libere])
  const trovati = new Map<string, number[][]>()
  for (const c of cercati) {
    let parti = (perId.get(c.id) ?? []).flatMap((f) => anelli(f.geometry))
    if (parti.length === 0) parti = perNomeEPosto(c, nomi, anelli)
    if (parti.length === 0) continue
    const codici = codifica(parti, TOLLERANZA_LAGHI, true)
    if (codici.length > 0) trovati.set(c.id, codici)
  }
  return trovati
}

/**
 * Le geometrie della cartina muta: da Natural Earth ai tracciati SVG.
 *
 * I confini dei paesi e i mari arrivano da jsDelivr (vedi `URL_CONFINI` e
 * `URL_ACQUE`): i confini sempre, i mari solo quando servono — sono mezzo mega
 * compresso, e chi gioca alle capitali non li scarica. Le linee dei fiumi e le
 * forme dei laghi vengono dal nostro server, gia' semplificate (`GET
 * /quiz/geometrie`): i file di Natural Earth da cui nascono pesano molti mega.
 * Una volta scaricato, tutto resta in memoria per la sessione e nella cache del
 * browser, perché le versioni sono fisse.
 *
 * La proiezione e' quella di Mercatore, la stessa delle cartine dei telefoni:
 * conserva le forme a ogni scala, e l'Italia ha la sua forma sia sul mondo
 * intero sia da vicino. La proiezione di prima accorciava le longitudini del
 * coseno della latitudine di mezzo della vista, e fuori da quella latitudine
 * la cartina si vedeva schiacciata. Il mondo si taglia a un meridiano, di solito
 * il 180: un poligono che lo attraversa si disegna due volte, spostato di un
 * giro, e il ritaglio della cartina tiene la parte che si vede.
 */

import { api } from '@/lib/api'
import { URL_ACQUE, URL_CONFINI, decodificaLinea, type GeometrieQuiz } from '@shared/quiz-dati'
import { forme, partiPrincipali, poligoniGeoJson, type Poligono, type Topologia } from '@shared/topojson'

export type PuntoXY = [number, number]

export interface Luogo {
  id: string
  /** Il nome come lo scrive la fonte: inglese per i paesi, italiano per i mari. */
  nome: string
  poligoni: Poligono[]
  /** Le parti che contano per inquadrarlo: la Francia senza la Guyana. */
  principali: Poligono[]
}

export interface Tratti {
  id: string
  /** Linee (fiumi) o anelli (laghi), in gradi. */
  linee: Array<Array<[number, number]>>
}

let paesi: Promise<Luogo[]> | null = null
let acque: Promise<Luogo[]> | null = null
let geometrie: { versione: string; promessa: Promise<{ fiumi: Map<string, Tratti>; laghi: Map<string, Tratti> }> } | null =
  null

async function scarica<T>(url: string): Promise<T> {
  const risposta = await fetch(url)
  if (!risposta.ok) throw new Error(`La cartina non si carica (${risposta.status}).`)
  return (await risposta.json()) as T
}

/** I paesi del mondo, con l'identificativo della cartina: "n" e il codice numerico. */
export function caricaPaesi(): Promise<Luogo[]> {
  paesi ??= scarica<Topologia>(URL_CONFINI)
    .then((topo) =>
      forme(topo, 'countries').map((f) => ({
        id: `n${f.id}`,
        nome: f.nome,
        poligoni: f.poligoni,
        principali: partiPrincipali(f.poligoni),
      })),
    )
    .catch((e) => {
      paesi = null
      throw e
    })
  return paesi
}

interface GeoJsonMari {
  features: Array<{ properties: Record<string, unknown>; geometry: { type: string; coordinates: unknown } | null }>
}

/** I mari e gli oceani, uno per identificativo Wikidata: l'Atlantico sono due poligoni, un luogo solo. */
export function caricaAcque(): Promise<Luogo[]> {
  acque ??= scarica<GeoJsonMari>(URL_ACQUE)
    .then((geo) => {
      const perId = new Map<string, Luogo>()
      for (const f of geo.features) {
        const id = String(f.properties.wikidataid ?? '')
        if (!/^Q\d+$/.test(id) || !f.geometry) continue
        const luogo = perId.get(id) ?? {
          id,
          nome: String(f.properties.name_it ?? f.properties.name ?? id),
          poligoni: [],
          principali: [],
        }
        luogo.poligoni.push(...poligoniGeoJson(f.geometry))
        perId.set(id, luogo)
      }
      for (const l of perId.values()) l.principali = l.poligoni
      return [...perId.values()]
    })
    .catch((e) => {
      acque = null
      throw e
    })
  return acque
}

/**
 * Le linee dei fiumi e le forme dei laghi, della versione che dice il
 * riassunto: l'indirizzo con la versione resta in cache per sempre.
 */
export function caricaGeometrie(versione: string): Promise<{ fiumi: Map<string, Tratti>; laghi: Map<string, Tratti> }> {
  if (geometrie?.versione === versione) return geometrie.promessa
  const promessa = api<GeometrieQuiz>(`/quiz/geometrie?v=${encodeURIComponent(versione)}`)
    .then((g) => {
      const decodifica = (voci: Record<string, number[][]>) =>
        new Map(Object.entries(voci).map(([id, linee]) => [id, { id, linee: linee.map(decodificaLinea) }]))
      return { fiumi: decodifica(g.fiumi), laghi: decodifica(g.laghi) }
    })
    .catch((e) => {
      geometrie = null
      throw e
    })
  geometrie = { versione, promessa }
  return promessa
}

/* ─────────────────────────────  La proiezione  ─────────────────────────── */

/** Le latitudini che si vedono: dall'Artico fino alle coste dell'Antartide, dove finisce l'Oceano Antartico. */
export const NORD = 84
export const SUD = -72

const GRADI = 180 / Math.PI

/** La y di Mercatore, in "gradi": all'equatore un grado di latitudine e uno di longitudine sono lunghi uguali. */
export function mercatore(lat: number): number {
  const phi = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180
  return Math.log(Math.tan(Math.PI / 4 + phi / 2)) * GRADI
}

export function latitudine(y: number): number {
  return (2 * Math.atan(Math.exp(y / GRADI)) - Math.PI / 2) * GRADI
}

export interface Proiezione {
  /** Il meridiano a est del quale si taglia il mondo: il mondo va da `taglio - 360` a `taglio`. */
  taglio: number
  ovest: number
  est: number
  alto: number
  basso: number
  /** Longitudine e latitudine in coordinate della cartina: la y cresce verso sud. */
  punto: (lon: number, lat: number) => PuntoXY
  /** Il contrario: da un punto della cartina ai gradi. */
  gradi: (x: number, y: number) => PuntoXY
}

export function proiezione(taglio = 180): Proiezione {
  const ovest = taglio - 360
  const x = (lon: number) => ((((lon - ovest) % 360) + 360) % 360) + ovest
  return {
    taglio,
    ovest,
    est: taglio,
    alto: -mercatore(NORD),
    basso: -mercatore(SUD),
    punto: (lon, lat) => [x(lon), -mercatore(lat)],
    gradi: (px, py) => [px > 180 ? px - 360 : px < -180 ? px + 360 : px, latitudine(-py)],
  }
}

/** Il taglio per un riquadro: il 180, o l'Atlantico se il riquadro lo passa (l'Oceania). */
export function taglioPer([, , est]: readonly number[]): number {
  return est > 180 ? 330 : 180
}

/**
 * I punti di una linea in coordinate della cartina, senza salti: ogni punto
 * prende il giro piu' vicino al precedente, così un'isola a cavallo del taglio
 * resta intera, un po' fuori dal mondo, e la si ridisegna spostata di un giro.
 */
function srotolata(linea: ReadonlyArray<readonly [number, number]>, p: Proiezione): PuntoXY[] {
  const punti: PuntoXY[] = []
  let prima = 0
  for (const [lon, lat] of linea) {
    let [x, y] = p.punto(lon, lat)
    if (punti.length > 0) {
      while (x - prima > 180) x -= 360
      while (prima - x > 180) x += 360
    }
    punti.push([x, y])
    prima = x
  }
  return punti
}

/** Gli spostamenti di un giro con cui una linea srotolata cade nel mondo: di solito uno, a volte due. */
function giri(punti: readonly PuntoXY[], p: Proiezione): number[] {
  let min = Infinity
  let max = -Infinity
  for (const [x] of punti) {
    if (x < min) min = x
    if (x > max) max = x
  }
  const esito: number[] = []
  for (const k of [-360, 0, 360]) if (max + k > p.ovest && min + k < p.est) esito.push(k)
  return esito
}

function d(punti: readonly PuntoXY[], k: number, tolleranza: number, chiusa: boolean): string {
  let testo = ''
  let [ux, uy] = punti[0]
  testo += `M${(ux + k).toFixed(3)} ${uy.toFixed(3)}`
  for (let i = 1; i < punti.length; i += 1) {
    const [x, y] = punti[i]
    if (Math.abs(x - ux) + Math.abs(y - uy) < tolleranza && i < punti.length - 1) continue
    testo += `L${(x + k).toFixed(3)} ${y.toFixed(3)}`
    ux = x
    uy = y
  }
  return chiusa ? `${testo}Z` : testo
}

/**
 * Il tracciato SVG di poligoni o linee: i punti piu' vicini della tolleranza
 * al precedente si saltano — a scala di continente la meta' dei punti cade
 * nello stesso pixel — e ogni anello si ripete ai giri che servono.
 */
export function tracciato(
  parti: ReadonlyArray<ReadonlyArray<readonly [number, number]>>,
  p: Proiezione,
  tolleranza: number,
  chiusa = true,
): string {
  const pezzi: string[] = []
  for (const parte of parti) {
    if (parte.length < 2) continue
    const punti = srotolata(parte, p)
    for (const k of giri(punti, p)) pezzi.push(d(punti, k, tolleranza, chiusa))
  }
  return pezzi.join('')
}

/** Gli anelli di un luogo: il bordo di ogni poligono e i suoi buchi. */
export function anelliDi(poligoni: readonly Poligono[]): Array<Array<[number, number]>> {
  return poligoni.flatMap((p) => p)
}

export interface Riquadro {
  x0: number
  y0: number
  x1: number
  y1: number
}

/**
 * Il giro con cui una linea srotolata cade di piu' dentro il mondo. Non il
 * primo che la tocca: il bordo della Russia arriva al 180 e lo passa di un
 * niente per l'arrotondamento, e con il primo giro valido la Russia intera
 * finiva un giro piu' a ovest, fuori dal mondo, con il suo nome.
 */
function giroPrincipale(punti: readonly PuntoXY[], p: Proiezione): number {
  let min = Infinity
  let max = -Infinity
  for (const [x] of punti) {
    if (x < min) min = x
    if (x > max) max = x
  }
  let migliore = 0
  let dentro = -Infinity
  for (const k of [0, -360, 360]) {
    const quanto = Math.min(max + k, p.est) - Math.max(min + k, p.ovest)
    if (quanto > dentro) [dentro, migliore] = [quanto, k]
  }
  return migliore
}

/**
 * Il tratto di longitudini piu' corto che copre tutti gli intervalli, sul
 * giro del mondo: e' il resto del buco piu' largo fra due di loro. La Russia va
 * da Kaliningrad alla Čukotka passando per l'Asia, non per l'Atlantico; e la
 * Čukotka oltre il 180 non la allarga al mondo intero. Il centro del tratto
 * cade nel mondo; le punte possono uscirne.
 */
function arcoMinimo(intervalli: ReadonlyArray<readonly [number, number]>, p: Proiezione): [number, number] {
  const giro = p.est - p.ovest
  if (intervalli.some(([a, b]) => b - a >= giro)) return [p.ovest, p.est]
  const ordinati = intervalli
    .map(([a, b]): [number, number] => {
      const inizio = ((((a - p.ovest) % giro) + giro) % giro) + p.ovest
      return [inizio, inizio + (b - a)]
    })
    .sort((u, v) => u[0] - v[0])
  let fine = ordinati[0][1]
  let buco = -Infinity
  let dopo = 0
  for (let i = 1; i < ordinati.length; i += 1) {
    if (ordinati[i][0] - fine > buco) [buco, dopo] = [ordinati[i][0] - fine, i]
    fine = Math.max(fine, ordinati[i][1])
  }
  if (ordinati[0][0] + giro - fine >= buco) [buco, dopo] = [ordinati[0][0] + giro - fine, 0]
  if (buco <= 0) return [p.ovest, p.est]
  const x0 = ordinati[dopo][0]
  const x1 = x0 + giro - buco
  const sposta = (x0 + x1) / 2 > p.est ? -giro : 0
  return [x0 + sposta, x1 + sposta]
}

/** Il rettangolo di alcune linee in coordinate della cartina: il centro nel mondo, le punte anche oltre il taglio. */
export function riquadroDi(parti: ReadonlyArray<ReadonlyArray<readonly [number, number]>>, p: Proiezione): Riquadro | null {
  const intervalli: Array<[number, number]> = []
  let y0 = Infinity
  let y1 = -Infinity
  for (const parte of parti) {
    if (parte.length === 0) continue
    const punti = srotolata(parte, p)
    const k = giroPrincipale(punti, p)
    let a = Infinity
    let b = -Infinity
    for (const [x, y] of punti) {
      if (x + k < a) a = x + k
      if (x + k > b) b = x + k
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
    intervalli.push([a, b])
  }
  if (intervalli.length === 0) return null
  const [x0, x1] = arcoMinimo(intervalli, p)
  return { x0, y0, x1, y1 }
}

export function unisciRiquadri(riquadri: ReadonlyArray<Riquadro | null>, p: Proiezione): Riquadro | null {
  const buoni = riquadri.filter((r): r is Riquadro => r !== null)
  if (buoni.length === 0) return null
  const [x0, x1] = arcoMinimo(
    buoni.map((r): [number, number] => [r.x0, r.x1]),
    p,
  )
  return { x0, y0: Math.min(...buoni.map((r) => r.y0)), x1, y1: Math.max(...buoni.map((r) => r.y1)) }
}

/** Il lato piu' lungo di un riquadro, in unita' della cartina. */
export function latoDi(r: Riquadro): number {
  return Math.max(r.x1 - r.x0, r.y1 - r.y0)
}

/**
 * Dove mettere il nome di un posto: il baricentro del poligono piu' grande, o
 * il punto di mezzo della linea piu' lunga. Per un paese a forma di C il
 * baricentro puo' cadere fuori, ma a questa scala nessuno se ne accorge.
 */
export function puntoDelNome(parti: ReadonlyArray<ReadonlyArray<readonly [number, number]>>, p: Proiezione, chiusa: boolean): PuntoXY | null {
  let migliore: PuntoXY | null = null
  let misura = -1
  for (const parte of parti) {
    if (parte.length === 0) continue
    const punti = srotolata(parte, p)
    const k = giroPrincipale(punti, p)
    if (chiusa) {
      let area = 0
      let cx = 0
      let cy = 0
      for (let i = 0, j = punti.length - 1; i < punti.length; j = i, i += 1) {
        const f = punti[j][0] * punti[i][1] - punti[i][0] * punti[j][1]
        area += f
        cx += (punti[j][0] + punti[i][0]) * f
        cy += (punti[j][1] + punti[i][1]) * f
      }
      if (Math.abs(area) > misura && area !== 0) {
        misura = Math.abs(area)
        migliore = [cx / (3 * area) + k, cy / (3 * area)]
      }
    } else {
      let lunghezza = 0
      for (let i = 1; i < punti.length; i += 1) lunghezza += Math.hypot(punti[i][0] - punti[i - 1][0], punti[i][1] - punti[i - 1][1])
      if (lunghezza > misura) {
        misura = lunghezza
        // Il punto a meta' strada, lungo la linea.
        let fatta = 0
        migliore = punti[Math.floor(punti.length / 2)]
        for (let i = 1; i < punti.length; i += 1) {
          const tratto = Math.hypot(punti[i][0] - punti[i - 1][0], punti[i][1] - punti[i - 1][1])
          if (fatta + tratto >= lunghezza / 2) {
            const t = tratto > 0 ? (lunghezza / 2 - fatta) / tratto : 0
            migliore = [punti[i - 1][0] + (punti[i][0] - punti[i - 1][0]) * t + k, punti[i - 1][1] + (punti[i][1] - punti[i - 1][1]) * t]
            break
          }
          fatta += tratto
        }
      }
    }
  }
  return migliore
}

/* ──────────────────────────────  I tocchi  ─────────────────────────────── */

/** Le linee di un posto gia' proiettate, per cercare il piu' vicino a un dito senza rifare i conti. */
export interface LineeProiettate {
  id: string
  linee: Float64Array[]
  chiusa: boolean
}

export function proietta(id: string, parti: ReadonlyArray<ReadonlyArray<readonly [number, number]>>, p: Proiezione, chiusa: boolean): LineeProiettate {
  const linee: Float64Array[] = []
  for (const parte of parti) {
    if (parte.length === 0) continue
    const punti = srotolata(parte, p)
    for (const k of giri(punti, p)) {
      const a = new Float64Array(punti.length * 2)
      punti.forEach(([x, y], i) => {
        a[i * 2] = x + k
        a[i * 2 + 1] = y
      })
      linee.push(a)
    }
  }
  return { id, linee, chiusa }
}

/** La distanza di un punto da una spezzata, in coordinate della cartina. */
function distanzaDaLinea(x: number, y: number, a: Float64Array): number {
  let migliore = Infinity
  for (let i = 2; i < a.length; i += 2) {
    const ax = a[i - 2]
    const ay = a[i - 1]
    const dx = a[i] - ax
    const dy = a[i + 1] - ay
    const l = dx * dx + dy * dy
    const t = l > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l)) : 0
    const d = Math.hypot(x - (ax + t * dx), y - (ay + t * dy))
    if (d < migliore) migliore = d
  }
  if (a.length === 2) migliore = Math.hypot(x - a[0], y - a[1])
  return migliore
}

function dentro(x: number, y: number, a: Float64Array): boolean {
  let si = false
  for (let i = 0, j = a.length - 2; i < a.length; j = i, i += 2) {
    const yi = a[i + 1]
    const yj = a[j + 1]
    if (yi > y !== yj > y && x < ((a[j] - a[i]) * (y - yi)) / (yj - yi) + a[i]) si = !si
  }
  return si
}

/**
 * Il posto piu' vicino a un punto, entro un raggio: dentro un lago vale zero,
 * un fiume o un pallino a qualche pixel dal dito vale lo stesso. Un dito e'
 * largo come Malta, e un fiume sottile come un capello.
 */
export function piuVicino(x: number, y: number, raggio: number, posti: readonly LineeProiettate[]): string | null {
  let migliore: string | null = null
  let distanza = raggio
  for (const posto of posti) {
    for (const linea of posto.linee) {
      const d = posto.chiusa && dentro(x, y, linea) ? 0 : distanzaDaLinea(x, y, linea)
      if (d < distanza) {
        distanza = d
        migliore = posto.id
      }
    }
  }
  return migliore
}

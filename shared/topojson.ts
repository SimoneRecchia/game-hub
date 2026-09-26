/**
 * Il minimo di TopoJSON che serve al quiz: da world-atlas (i confini di Natural
 * Earth, su jsDelivr) agli anelli di punti di ogni paese.
 *
 * TopoJSON salva ogni confine una volta sola — il tratto fra Italia e Francia e'
 * un arco condiviso dai due — con le coordinate intere e scritte come
 * differenze dal punto prima: per questo il mondo a 1:50 milioni pesa 750 kB e
 * non tre volte tanto. Qui si fa il contrario: si sommano le differenze, si
 * torna ai gradi, si incollano gli archi in anelli. Una libreria intera per
 * questo sarebbe il triplo del codice che serve.
 *
 * Lo usano lo script della notte, per sapere quali coste toccano quali mari, e
 * la cartina muta nel browser.
 */

export type Punto = [number, number]
export type Anello = Punto[]
/** Un poligono: il primo anello e' il bordo, gli altri i buchi. */
export type Poligono = Anello[]

interface GeometriaTopo {
  type: 'Polygon' | 'MultiPolygon' | null
  id?: string
  arcs?: number[][] | number[][][]
  properties?: Record<string, unknown>
}

export interface Topologia {
  type: 'Topology'
  transform?: { scale: [number, number]; translate: [number, number] }
  arcs: number[][][]
  objects: Record<string, { type: 'GeometryCollection'; geometries: GeometriaTopo[] }>
}

export interface Forma {
  id: string
  nome: string
  poligoni: Poligono[]
}

/** Gli archi in gradi: le coordinate intere tornano longitudini e latitudini. */
function archiInGradi(topo: Topologia): Anello[] {
  const t = topo.transform
  return topo.arcs.map((arco) => {
    let x = 0
    let y = 0
    return arco.map(([dx, dy]) => {
      if (!t) return [dx, dy] as Punto
      x += dx
      y += dy
      return [x * t.scale[0] + t.translate[0], y * t.scale[1] + t.translate[1]] as Punto
    })
  })
}

/** Un anello dagli archi che lo compongono: un indice negativo e' un arco percorso al contrario. */
function anelloDa(indici: number[], archi: Anello[]): Anello {
  const anello: Anello = []
  for (const i of indici) {
    const arco = i >= 0 ? archi[i] : [...archi[~i]].reverse()
    // Il primo punto di ogni arco e' l'ultimo del precedente: non si ripete.
    anello.push(...(anello.length > 0 ? arco.slice(1) : arco))
  }
  return anello
}

/**
 * Le forme di un oggetto della topologia: per world-atlas, `countries`.
 *
 * Due geometrie con lo stesso codice diventano una forma sola: in world-atlas
 * le isole Ashmore e Cartier hanno il codice dell'Australia, e tenerne una
 * sola voleva dire perdere l'altra — l'Australia risultava bagnata da un mare.
 */
export function forme(topo: Topologia, oggetto: string): Forma[] {
  const archi = archiInGradi(topo)
  const perId = new Map<string, Forma>()
  for (const g of topo.objects[oggetto]?.geometries ?? []) {
    if (!g.type || !g.arcs || g.id === undefined) continue
    const poligoni: Poligono[] =
      g.type === 'Polygon'
        ? [(g.arcs as number[][]).map((a) => anelloDa(a, archi))]
        : (g.arcs as number[][][]).map((p) => p.map((a) => anelloDa(a, archi)))
    const id = String(g.id)
    const gia = perId.get(id)
    if (gia) gia.poligoni.push(...poligoni)
    else perId.set(id, { id, nome: String(g.properties?.name ?? g.id), poligoni })
  }
  return [...perId.values()]
}

/** I poligoni di una geometria GeoJSON: e' il formato dei mari di Natural Earth. */
export function poligoniGeoJson(geometria: { type: string; coordinates: unknown }): Poligono[] {
  if (geometria.type === 'Polygon') return [geometria.coordinates as Poligono]
  if (geometria.type === 'MultiPolygon') return geometria.coordinates as Poligono[]
  return []
}

/** Il rettangolo che contiene dei poligoni: [ovest, sud, est, nord]. */
export function rettangolo(poligoni: readonly Poligono[]): [number, number, number, number] {
  let o = Infinity
  let s = Infinity
  let e = -Infinity
  let n = -Infinity
  for (const p of poligoni) {
    for (const [x, y] of p[0] ?? []) {
      if (x < o) o = x
      if (x > e) e = x
      if (y < s) s = y
      if (y > n) n = y
    }
  }
  return [o, s, e, n]
}

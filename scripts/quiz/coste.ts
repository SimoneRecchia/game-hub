/**
 * Chi e' bagnato da quale mare, dalla geometria.
 *
 * Wikidata lo sa male: l'Italia vi risultava bagnata da due mari, la Grecia e
 * la Cina da nessuno. Natural Earth invece ha le coste dei paesi e i poligoni
 * dei mari alla stessa scala, e la domanda diventa geometrica: una costa tocca
 * un mare se un suo punto ha quel mare a un passo.
 *
 * Il modo e' il piu' semplice che regge: i mari si dipingono su una griglia di
 * un decimo di grado, un numero per casella, e per ogni punto dei confini di un
 * paese si guardano le caselle attorno. Entro due caselle (una ventina di
 * chilometri) il mare lo bagna; entro quindici (un centinaio e mezzo) gli e'
 * vicino — la zona grigia: non e' una risposta giusta, ma nemmeno una
 * sbagliata, e il generatore delle domande la evita.
 */

import type { Poligono } from '../../shared/topojson'

const PASSO = 0.1
const COLONNE = Math.round(360 / PASSO)
const RIGHE = Math.round(180 / PASSO)

export const TOCCA = 2
export const VICINO = 15

/**
 * Un anello che attraversa la linea del cambiamento di data — il Mare di
 * Bering, quello dei Ciukci, quello di Ross — ha un lato che salta da +180 a
 * -180, e dipinto così riempirebbe tutto il giro del mondo, terra compresa. Qui
 * le longitudini si rendono continue (179, 181, 183...); la griglia poi le
 * riporta dentro il giro. Gli anelli che fanno davvero il giro del mondo — gli
 * oceani attorno ai poli, chiusi lungo il bordo della carta — restano come sono.
 */
function srotola(anello: Poligono[number]): Poligono[number] {
  let giro = 0
  const continuo: Poligono[number] = anello.map(([x, y], i) => {
    const salto = i > 0 ? x - anello[i - 1][0] : 0
    if (salto > 180) giro -= 360
    else if (salto < -180) giro += 360
    return [x + giro, y]
  })
  const ampiezza = (a: Poligono[number]) => {
    let o = Infinity
    let e = -Infinity
    for (const [x] of a) {
      if (x < o) o = x
      if (x > e) e = x
    }
    return e - o
  }
  return ampiezza(anello) > 270 && ampiezza(continuo) < 200 ? continuo : anello
}

export class Griglia {
  /** L'indice del mare in ogni casella, piu' uno: zero e' terra o niente. */
  readonly celle = new Uint16Array(COLONNE * RIGHE)

  static colonna(lon: number): number {
    return (((Math.floor((lon + 180) / PASSO) % COLONNE) + COLONNE) % COLONNE)
  }

  static riga(lat: number): number {
    return Math.min(RIGHE - 1, Math.max(0, Math.floor((90 - lat) / PASSO)))
  }

  /**
   * Dipinge un poligono con la regola pari-dispari: per ogni riga di caselle si
   * cercano gli incroci con i bordi e si riempie a coppie. I buchi (isole in
   * mezzo al mare) restano fuori da soli, perché sono bordi anche loro.
   */
  dipingi(originale: Poligono, valore: number): void {
    const poligono = originale.map(srotola)
    let sud = Infinity
    let nord = -Infinity
    for (const anello of poligono) {
      for (const [, y] of anello) {
        if (y < sud) sud = y
        if (y > nord) nord = y
      }
    }
    const primaRiga = Griglia.riga(nord)
    const ultimaRiga = Griglia.riga(sud)
    for (let r = primaRiga; r <= ultimaRiga; r += 1) {
      const lat = 90 - (r + 0.5) * PASSO
      const incroci: number[] = []
      for (const anello of poligono) {
        for (let i = 0, j = anello.length - 1; i < anello.length; j = i, i += 1) {
          const [x1, y1] = anello[j]
          const [x2, y2] = anello[i]
          if (y1 > lat !== y2 > lat) incroci.push(x1 + ((lat - y1) * (x2 - x1)) / (y2 - y1))
        }
      }
      incroci.sort((a, b) => a - b)
      for (let k = 0; k + 1 < incroci.length; k += 2) {
        const da = Math.ceil((incroci[k] + 180) / PASSO - 0.5)
        const a = Math.floor((incroci[k + 1] + 180) / PASSO - 0.5)
        for (let c = da; c <= a; c += 1) {
          const col = ((c % COLONNE) + COLONNE) % COLONNE
          this.celle[r * COLONNE + col] = valore
        }
      }
    }
  }

  /**
   * I mari attorno a un punto, entro un raggio in caselle. In longitudine il
   * raggio si allarga verso i poli, dove un grado e' piu' corto: la distanza
   * resta piu' o meno quella in chilometri.
   */
  attorno(lon: number, lat: number, raggio: number, dentro: Set<number>): void {
    const r0 = Griglia.riga(lat)
    const c0 = Griglia.colonna(lon)
    const largo = Math.min(COLONNE / 2, Math.ceil(raggio / Math.max(0.15, Math.cos((lat * Math.PI) / 180))))
    for (let r = Math.max(0, r0 - raggio); r <= Math.min(RIGHE - 1, r0 + raggio); r += 1) {
      const base = r * COLONNE
      for (let d = -largo; d <= largo; d += 1) {
        const v = this.celle[base + ((((c0 + d) % COLONNE) + COLONNE) % COLONNE)]
        if (v) dentro.add(v - 1)
      }
    }
  }
}

/**
 * I punti di un confine, uno ogni decimo di grado al massimo: un lato lungo non
 * salta una costa. Un lato che attraversa la linea del cambiamento di data (da
 * 179,9 a -179,9, in Chukotka) si percorre per la via corta: per la lunga
 * faceva il giro del mondo lungo il sessantottesimo parallelo, e la Russia
 * risultava bagnata dalla Baia di Baffin.
 */
export function* puntiDelBordo(poligoni: readonly Poligono[], passo = PASSO): Generator<[number, number]> {
  for (const poligono of poligoni) {
    for (const anello of poligono) {
      for (let i = 0; i < anello.length; i += 1) {
        const [x1, y1] = anello[i]
        const [grezzo, y2] = anello[(i + 1) % anello.length]
        const x2 = grezzo - x1 > 180 ? grezzo - 360 : grezzo - x1 < -180 ? grezzo + 360 : grezzo
        const tratti = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / passo))
        for (let t = 0; t < tratti; t += 1) yield [x1 + ((x2 - x1) * t) / tratti, y1 + ((y2 - y1) * t) / tratti]
      }
    }
  }
}

/** Quanti punti di costa, un decimo di grado l'uno, servono perché un mare "bagni": una sessantina di km. */
export const COSTA_MINIMA = 6

/**
 * Per ogni paese, quanto tocca ogni mare — in punti di costa, il peso — e quali
 * mari gli sono vicini.
 *
 * Un mare bagna un paese se lo tocca per almeno `COSTA_MINIMA` punti: un
 * contatto di pochi chilometri e' vero, ma non e' una risposta da quiz — chi
 * risponde "no" non ha sbagliato. Sotto la soglia il mare e' vicino, nella zona
 * grigia. Per i vicini basta un punto ogni mezzo grado circa: il raggio e'
 * largo, e i punti di un decimo farebbero la stessa ricerca venticinque volte.
 */
export function costeDi(
  griglia: Griglia,
  poligoni: readonly Poligono[],
): { contatti: Map<number, number>; vicine: Set<number> } {
  const tutti = new Map<number, number>()
  const vicine = new Set<number>()
  const qui = new Set<number>()
  let ultimo: [number, number] = [Infinity, Infinity]
  for (const [x, y] of puntiDelBordo(poligoni)) {
    qui.clear()
    griglia.attorno(x, y, TOCCA, qui)
    for (const m of qui) tutti.set(m, (tutti.get(m) ?? 0) + 1)
    if (Math.abs(x - ultimo[0]) + Math.abs(y - ultimo[1]) < 0.5) continue
    griglia.attorno(x, y, VICINO, vicine)
    ultimo = [x, y]
  }
  const contatti = new Map<number, number>()
  for (const [m, n] of tutti) {
    if (n >= COSTA_MINIMA) contatti.set(m, n)
    else vicine.add(m)
  }
  for (const m of contatti.keys()) vicine.delete(m)
  return { contatti, vicine }
}

const KM_PER_GRADO = 111.2

function superficie(anello: readonly [number, number][]): number {
  let doppia = 0
  let lat = 0
  for (let i = 0, j = anello.length - 1; i < anello.length; j = i, i += 1) {
    doppia += anello[j][0] * anello[i][1] - anello[i][0] * anello[j][1]
    lat += anello[i][1]
  }
  const coseno = Math.cos(((lat / Math.max(1, anello.length)) * Math.PI) / 180)
  return (Math.abs(doppia) / 2) * KM_PER_GRADO * KM_PER_GRADO * coseno
}

function distanzaKm(a: readonly number[], b: readonly number[]): number {
  const dLat = Math.max(0, a[1] - b[3], b[1] - a[3])
  let dLon = Math.max(0, a[0] - b[2], b[0] - a[2])
  dLon = Math.min(dLon, Math.max(0, 360 - dLon - (a[2] - a[0]) - (b[2] - b[0])))
  const lat = ((Math.max(a[1], b[1]) + Math.min(a[3], b[3])) / 2) * (Math.PI / 180)
  return Math.hypot(dLat, dLon * Math.cos(lat)) * KM_PER_GRADO
}

/**
 * Le parti di un paese che contano per le sue coste: il corpo principale, le
 * isole vicine e le parti grandi. La Francia di Natural Earth comprende la
 * Riunione e la Guyana, e ne risultava bagnata dall'Oceano Indiano e dai
 * Caraibi; l'Alaska invece resta degli Stati Uniti, perché e' grande.
 */
export function partiPrincipali(poligoni: readonly Poligono[]): Poligono[] {
  if (poligoni.length <= 1) return [...poligoni]
  const misure = poligoni.map((p) => {
    let o = Infinity, s = Infinity, e = -Infinity, n = -Infinity
    for (const [x, y] of p[0]) {
      if (x < o) o = x
      if (x > e) e = x
      if (y < s) s = y
      if (y > n) n = y
    }
    return { p, area: superficie(p[0]), bb: [o, s, e, n] }
  })
  const grande = misure.reduce((a, b) => (b.area > a.area ? b : a))
  return misure
    .filter((m) => m === grande || m.area >= grande.area * 0.18 || distanzaKm(m.bb, grande.bb) <= 900)
    .map((m) => m.p)
}

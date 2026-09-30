/**
 * Le sagome delle zone del quiz, per il foglio "Dove" della libera: una piccola
 * cartina di ogni continente, e del mondo, con le terre della zona nel colore
 * della materia e le altre del riquadro in grigio. Si scrivono una volta in
 * src/games/quiz/sagome.ts, come i pezzi degli scacchi: il browser non scarica
 * niente per disegnarle.
 *
 *   npx vite-node scripts/genera-sagome.ts
 *
 * I confini sono quelli di world-atlas a 1:110 milioni (Natural Earth, su
 * jsDelivr), i continenti di ogni paese quelli del riassunto del quiz, che lo
 * script legge dal D1 locale: prima serve `npm run quiz:locale`. Il riquadro di
 * ogni zona e' quello della cartina muta (`VISTE`), in Mercatore come lei.
 */

import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { VISTA_DEL_CONTINENTE, VISTE, type Continente, type VistaCartina } from '../shared/quiz'
import type { PaeseQuiz } from '../shared/quiz-dati'
import { forme, type Anello, type Topologia } from '../shared/topojson'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const FILE = join(ROOT, 'src', 'games', 'quiz', 'sagome.ts')
const URL_110M = 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json'

/** La larghezza della cartina di ogni sagoma; l'altezza la da' il riquadro. */
const LARGO = 100
/** Le isole piu' piccole di cosi', in unita' della sagoma al quadrato, non si vedono: fuori. */
const AREA_MINIMA = 0.8
/** Quanto si puo' scostare un contorno semplificato da quello vero, in unita' della sagoma. */
const TOLLERANZA = 0.45
/** Il margine oltre il riquadro in cui le terre si tagliano: il bordo non si vede. */
const MARGINE = 1

const mercatore = (lat: number) => (Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * 180) / Math.PI

function paesiDelQuiz(): PaeseQuiz[] {
  const domanda = "SELECT dati FROM quiz_dati WHERE parte = 'paesi'"
  const uscita = execFileSync('npx', ['wrangler', 'd1', 'execute', 'game-hub-db', '--local', '--json', '--command', domanda], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  const righe = JSON.parse(uscita) as Array<{ results: Array<{ dati: string }> }>
  const dati = righe[0]?.results[0]?.dati
  if (!dati) throw new Error('Il riassunto del quiz non c’e’ nel D1 locale: prima `npm run quiz:locale`.')
  return JSON.parse(dati) as PaeseQuiz[]
}

/** L'area di un anello, con il segno: basta il valore per scartare le isole piccole. */
function area(anello: P[]): number {
  let a = 0
  for (let i = 0, j = anello.length - 1; i < anello.length; j = i++) {
    a += (anello[j][0] - anello[i][0]) * (anello[j][1] + anello[i][1])
  }
  return Math.abs(a / 2)
}

type P = [number, number]

/**
 * Un anello tagliato su un rettangolo (Sutherland e Hodgman): un lato alla
 * volta, si tengono i punti dentro e si aggiungono quelli dove il contorno
 * attraversa il lato. Russia intera per un'Europa larga cento non serve.
 */
function taglia(anello: P[], x0: number, y0: number, x1: number, y1: number): P[] {
  const lati: Array<[(p: P) => boolean, (a: P, b: P) => P]> = [
    [(p) => p[0] >= x0, (a, b) => [x0, a[1] + ((b[1] - a[1]) * (x0 - a[0])) / (b[0] - a[0])]],
    [(p) => p[0] <= x1, (a, b) => [x1, a[1] + ((b[1] - a[1]) * (x1 - a[0])) / (b[0] - a[0])]],
    [(p) => p[1] >= y0, (a, b) => [a[0] + ((b[0] - a[0]) * (y0 - a[1])) / (b[1] - a[1]), y0]],
    [(p) => p[1] <= y1, (a, b) => [a[0] + ((b[0] - a[0]) * (y1 - a[1])) / (b[1] - a[1]), y1]],
  ]
  let punti = anello
  for (const [dentro, incrocio] of lati) {
    const fuori: P[] = []
    for (let i = 0; i < punti.length; i += 1) {
      const a = punti[i]
      const b = punti[(i + 1) % punti.length]
      if (dentro(a)) {
        fuori.push(a)
        if (!dentro(b)) fuori.push(incrocio(a, b))
      } else if (dentro(b)) fuori.push(incrocio(a, b))
    }
    punti = fuori
    if (punti.length === 0) break
  }
  return punti
}

/** La distanza di un punto da un segmento. */
function distanza(p: P, a: P, b: P): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const l = dx * dx + dy * dy
  const t = l === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l))
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)
}

/** Douglas e Peucker: si tengono solo i punti che si scostano piu' della tolleranza. */
function semplifica(punti: P[], tolleranza: number): P[] {
  if (punti.length < 4) return punti
  const tieni = new Array<boolean>(punti.length).fill(false)
  tieni[0] = tieni[punti.length - 1] = true
  const pila: Array<[number, number]> = [[0, punti.length - 1]]
  while (pila.length > 0) {
    const [da, a] = pila.pop()!
    let lontano = -1
    let massimo = tolleranza
    for (let i = da + 1; i < a; i += 1) {
      const d = distanza(punti[i], punti[da], punti[a])
      if (d > massimo) {
        massimo = d
        lontano = i
      }
    }
    if (lontano >= 0) {
      tieni[lontano] = true
      pila.push([da, lontano], [lontano, a])
    }
  }
  return punti.filter((_, i) => tieni[i])
}

interface Sagoma {
  larga: number
  alta: number
  zona: string
  resto: string
}

function sagoma(vista: VistaCartina, dellaZona: (id: string) => boolean, poligoni: Map<string, Anello[][]>): Sagoma {
  const [o, s, e, n] = VISTE[vista]
  const alto = mercatore(n)
  const basso = mercatore(s)
  const scala = LARGO / (e - o)
  const alta = Math.round((alto - basso) * scala)
  // L'Oceania passa il 180: le isole a ovest si spostano di un giro, come nella cartina.
  const giro = e > 180 ? 360 : 0
  const proietta = ([lon, lat]: [number, number]): [number, number] => {
    const x = giro && lon < 0 ? lon + giro : lon
    return [(x - o) * scala, (alto - mercatore(Math.max(-85, Math.min(85, lat)))) * scala]
  }
  const dentro = ([x, y]: P) => x >= -MARGINE && x <= LARGO + MARGINE && y >= -MARGINE && y <= alta + MARGINE
  const tracciati = { zona: [] as string[], resto: [] as string[] }
  for (const [id, poli] of poligoni) {
    const dove = dellaZona(id) ? tracciati.zona : tracciati.resto
    for (const poligono of poli) {
      // Un anello che passa il 180 (la Russia, le Figi) salta da una parte all'altra del mondo: si
      // porta tutto a est, e il pezzo oltre il riquadro si taglia.
      const salta = poligono[0].some((q, i) => i > 0 && Math.abs(q[0] - poligono[0][i - 1][0]) > 180)
      const anello = salta
        ? poligono[0].map(([lon, lat]): [number, number] => [lon < 0 ? lon + 360 : lon, lat])
        : poligono[0]
      const intero = anello.map(proietta)
      if (!intero.some(dentro)) continue
      const bordo = semplifica(taglia(intero, -MARGINE, -MARGINE, LARGO + MARGINE, alta + MARGINE), TOLLERANZA)
      if (bordo.length < 3 || area(bordo) < AREA_MINIMA) continue
      // Mezza unita' basta a una sagoma di cento: i punti che cadono sullo stesso si tolgono.
      const punti: string[] = []
      for (const [x, y] of bordo) {
        const p = `${Math.round(x * 2) / 2},${Math.round(y * 2) / 2}`
        if (p !== punti[punti.length - 1]) punti.push(p)
      }
      if (punti.length >= 3) dove.push(`M${punti.join('L')}Z`)
    }
  }
  return { larga: LARGO, alta, zona: tracciati.zona.join(''), resto: tracciati.resto.join('') }
}

const topo = (await (await fetch(URL_110M)).json()) as Topologia
const paesi = paesiDelQuiz()
const continentiDi = new Map(paesi.filter((p) => p.num).map((p) => [String(Number(p.num)), p.k]))
const poligoni = new Map(forme(topo, 'countries').map((f) => [String(Number(f.id)), f.poligoni]))

const zone: Array<['mondo' | Continente, VistaCartina]> = [
  ['mondo', 'mondo'],
  ...(Object.entries(VISTA_DEL_CONTINENTE) as Array<[Continente, VistaCartina]>),
]
const sagome: Record<string, Sagoma> = {}
for (const [zona, vista] of zone) {
  sagome[zona] = sagoma(vista, (id) => zona === 'mondo' || (continentiDi.get(id) ?? []).includes(zona), poligoni)
}

const righe = Object.entries(sagome).map(([zona, s]) =>
  [
    `  ${zona}: {`,
    `    larga: ${s.larga},`,
    `    alta: ${s.alta},`,
    `    zona: '${s.zona}',`,
    `    resto: '${s.resto}',`,
    '  },',
  ].join('\n'),
)
writeFileSync(
  FILE,
  `/**
 * Le sagome delle zone del quiz: una piccola cartina del mondo e di ogni
 * continente, in Mercatore, con le terre della zona e quelle intorno. Il file lo
 * scrive scripts/genera-sagome.ts dai confini di Natural Earth: non si tocca a
 * mano.
 */

import type { Continente } from '@shared/quiz'

export interface Sagoma {
  larga: number
  alta: number
  /** Le terre della zona, un tracciato SVG. */
  zona: string
  /** Le altre terre del riquadro. */
  resto: string
}

export const SAGOME: Record<'mondo' | Continente, Sagoma> = {
${righe.join('\n')}
}
`,
)
const peso = Object.values(sagome).reduce((n, s) => n + s.zona.length + s.resto.length, 0)
console.log(`Sagome: ${Object.keys(sagome).length} zone, ${Math.round(peso / 1024)} kB di tracciati`)

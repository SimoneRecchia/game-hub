/**
 * Le geometrie della cartina muta: da Natural Earth ai tracciati SVG di una
 * vista.
 *
 * I file arrivano da jsDelivr (vedi `URL_CONFINI` e `URL_ACQUE`): i confini
 * alla prima domanda di cartina, i mari solo quando se ne chiede uno — sono
 * mezzo mega compresso, e chi gioca ai paesi non li scarica. Una volta
 * scaricati restano in memoria per tutta la sessione e nella cache del
 * browser per sempre, perché le versioni sono fisse.
 *
 * La proiezione e' la piu' semplice che regge a scala di continente: gradi
 * dritti, con le longitudini accorciate del coseno della latitudine di mezzo.
 * L'Europa non viene schiacciata come in una carta a gradi uguali, e non
 * gonfia la Scandinavia come Mercatore; e tornare da un tocco ai gradi e' una
 * divisione.
 */

import { VISTE, type VistaCartina } from '@shared/quiz'
import { URL_ACQUE, URL_CONFINI } from '@shared/quiz-dati'
import { forme, poligoniGeoJson, type Poligono, type Topologia } from '@shared/topojson'

export interface Luogo {
  id: string
  /** Il nome come lo scrive la fonte: inglese per i paesi, italiano per i mari. */
  nome: string
  poligoni: Poligono[]
}

let paesi: Promise<Luogo[]> | null = null
let acque: Promise<Luogo[]> | null = null

async function scarica<T>(url: string): Promise<T> {
  const risposta = await fetch(url)
  if (!risposta.ok) throw new Error(`La cartina non si carica (${risposta.status}).`)
  return (await risposta.json()) as T
}

/** I paesi del mondo, con l'identificativo della cartina: "n" e il codice numerico. */
export function caricaPaesi(): Promise<Luogo[]> {
  paesi ??= scarica<Topologia>(URL_CONFINI)
    .then((topo) => forme(topo, 'countries').map((f) => ({ id: `n${f.id}`, nome: f.nome, poligoni: f.poligoni })))
    .catch((e) => {
      paesi = null
      throw e
    })
  return paesi
}

interface GeoJsonMari {
  features: Array<{ properties: Record<string, unknown>; geometry: { type: string; coordinates: unknown } }>
}

/** I mari e gli oceani, uno per identificativo Wikidata: l'Atlantico sono due poligoni, un luogo solo. */
export function caricaAcque(): Promise<Luogo[]> {
  acque ??= scarica<GeoJsonMari>(URL_ACQUE)
    .then((geo) => {
      const perId = new Map<string, Luogo>()
      for (const f of geo.features) {
        const id = String(f.properties.wikidataid ?? '')
        if (!/^Q\d+$/.test(id)) continue
        const luogo = perId.get(id) ?? { id, nome: String(f.properties.name_it ?? f.properties.name ?? id), poligoni: [] }
        luogo.poligoni.push(...poligoniGeoJson(f.geometry))
        perId.set(id, luogo)
      }
      return [...perId.values()]
    })
    .catch((e) => {
      acque = null
      throw e
    })
  return acque
}

/* ─────────────────────────────  La proiezione  ─────────────────────────── */

export interface Proiezione {
  /** Larghezza e altezza della vista, nelle unita' dei tracciati. */
  larghezza: number
  altezza: number
  punto: (lon: number, lat: number) => [number, number]
}

export function proiezione(vista: VistaCartina): Proiezione {
  const [o, s, e, n] = VISTE[vista]
  const coseno = Math.cos((((s + n) / 2) * Math.PI) / 180)
  // Una vista che passa il 180 (l'Oceania) sposta di un giro le longitudini a ovest.
  const giro = e > 180
  return {
    larghezza: (e - o) * coseno,
    altezza: n - s,
    punto: (lon, lat) => [((giro && lon < 0 ? lon + 360 : lon) - o) * coseno, n - lat],
  }
}

/**
 * Il tracciato SVG di un luogo nella vista: gli anelli fuori dalla vista si
 * saltano, i punti piu' vicini della tolleranza al precedente pure — a scala di
 * continente la meta' dei punti di Natural Earth cade nello stesso pixel. Un
 * lato che salta da un capo all'altro del mondo (un'isola a cavallo del 180, in
 * una vista che non lo passa) interrompe il tracciato invece di attraversare la
 * cartina.
 */
export function tracciato(luogo: Luogo, p: Proiezione, tolleranza: number): string {
  const margine = p.larghezza * 0.2
  const parti: string[] = []
  for (const poligono of luogo.poligoni) {
    for (const anello of poligono) {
      const punti = anello.map(([lon, lat]) => p.punto(lon, lat))
      let fuori = true
      for (const [x, y] of punti) {
        if (x > -margine && x < p.larghezza + margine && y > -margine && y < p.altezza + margine) {
          fuori = false
          break
        }
      }
      if (fuori || punti.length < 3) continue
      let d = ''
      let [ux, uy] = punti[0]
      d += `M${ux.toFixed(2)} ${uy.toFixed(2)}`
      for (let i = 1; i < punti.length; i += 1) {
        const [x, y] = punti[i]
        if (Math.abs(x - ux) > p.larghezza / 2) {
          d += `M${x.toFixed(2)} ${y.toFixed(2)}`
        } else if (Math.abs(x - ux) + Math.abs(y - uy) < tolleranza && i < punti.length - 1) {
          continue
        } else {
          d += `L${x.toFixed(2)} ${y.toFixed(2)}`
        }
        ux = x
        uy = y
      }
      parti.push(`${d}Z`)
    }
  }
  return parti.join('')
}

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { Dawg } from '../dawg'
import { mulberry32 } from '../daily'
import {
  CENTRO,
  JOLLY,
  LATO,
  TESSERE_LEGGIO,
  sacchettoDaSeme,
  tabelloneVuoto,
  validaPosa,
  type Casella,
  type Posa,
} from '../scarabeo'
import { chiave, mosseLegali, sceltaDelComputer, type MossaTrovata } from '../scarabeo-motore'

const RADICE_PROGETTO = join(__dirname, '..', '..')
/** Le parole del computer: le note. */
const parole = new Set(
  gunzipSync(readFileSync(join(RADICE_PROGETTO, 'scripts', 'data', 'dizionario-scarabeo-note.txt.gz')))
    .toString('utf8')
    .split('\n')
    .filter(Boolean),
)
const dawg = Dawg.da(readFileSync(join(RADICE_PROGETTO, 'public', 'scarabeo', 'dizionario.dawg')))

/** Una posizione di meta' partita: il computer gioca `mosse` volte da un sacchetto a caso. */
function posizione(seme: number, mosse: number) {
  const tab: (Casella | null)[] = tabelloneVuoto()
  const coda = sacchettoDaSeme(seme)
  let prossima = 0
  const leggio: string[] = []
  const pesca = () => {
    while (leggio.length < TESSERE_LEGGIO && prossima < coda.length) leggio.push(coda[prossima++])
  }
  pesca()
  let prima = true
  const caso = mulberry32(seme)
  for (let i = 0; i < mosse; i += 1) {
    const scelta = sceltaDelComputer(mosseLegali(dawg, tab, leggio, prima), 'normale', caso)
    if (!scelta) break
    for (const p of scelta.posa) {
      tab[p.r * LATO + p.c] = { lettera: p.lettera, jolly: p.jolly }
      leggio.splice(leggio.indexOf(p.jolly ? JOLLY : p.lettera), 1)
    }
    pesca()
    prima = false
  }
  return { tab, leggio, prima }
}

function controlla(tab: (Casella | null)[], leggio: string[], prima: boolean, mosse: MossaTrovata[]) {
  const chiavi = new Set<string>()
  for (const m of mosse) {
    const esito = validaPosa(tab, m.posa, prima)
    expect(esito.ok, JSON.stringify(m.posa)).toBe(true)
    if (!esito.ok) continue
    expect(esito.punti).toBe(m.punti)
    for (const p of esito.parole) expect(parole.has(p.parola), p.parola).toBe(true)
    // Le tessere usate sono quelle del leggio.
    const mano = [...leggio]
    for (const p of m.posa) {
      const i = mano.indexOf(p.jolly ? JOLLY : p.lettera)
      expect(i).toBeGreaterThanOrEqual(0)
      mano.splice(i, 1)
    }
    const k = chiave(m)
    expect(chiavi.has(k), k).toBe(false)
    chiavi.add(k)
  }
}

/**
 * Tutte le pose legali, cercate alla cieca: ogni linea, ogni inizio, ogni modo
 * di mettere le tessere del leggio sulle caselle vuote. Lentissimo, e per questo
 * solo con leggii corti: serve a dire che il motore non ne dimentica nessuna.
 */
function forzaBruta(tab: (Casella | null)[], leggio: string[], prima: boolean): Set<string> {
  const trovate = new Set<string>()
  const lettere = 'abcdefghilmnopqrstuvz'
  for (const oriz of [true, false]) {
    for (let i = 0; i < LATO; i += 1) {
      for (let inizio = 0; inizio < LATO; inizio += 1) {
        // Le caselle vuote da `inizio` in poi, lungo la linea.
        const vuote: { r: number; c: number }[] = []
        for (let j = inizio; j < LATO && vuote.length < leggio.length; j += 1) {
          const r = oriz ? i : j
          const c = oriz ? j : i
          if (!tab[r * LATO + c]) vuote.push({ r, c })
        }
        const prova = (n: number, posa: Posa[], mano: string[]) => {
          if (posa.length > 0) {
            const esito = validaPosa(tab, posa, prima)
            if (esito.ok && esito.parole.every((p) => parole.has(p.parola))) {
              trovate.add(chiave({ posa, punti: esito.punti }))
            }
          }
          if (n >= vuote.length) return
          const usate = new Set<string>()
          mano.forEach((t, idx) => {
            if (usate.has(t)) return
            usate.add(t)
            const resto = [...mano.slice(0, idx), ...mano.slice(idx + 1)]
            const scelte = t === JOLLY ? [...lettere].map((l) => ({ lettera: l, jolly: true })) : [{ lettera: t, jolly: false }]
            for (const s of scelte) prova(n + 1, [...posa, { ...vuote[n], ...s }], resto)
          })
        }
        prova(0, [], leggio)
      }
    }
  }
  return trovate
}

describe('motore delle mosse dello Scarabeo', () => {
  it('ogni mossa trovata e’ legale, vale quel che dice validaPosa e forma solo parole vere', () => {
    for (const [seme, mosse] of [[1, 0], [2, 3], [3, 6], [4, 9], [5, 12]] as const) {
      const { tab, leggio, prima } = posizione(seme, mosse)
      const trovate = mosseLegali(dawg, tab, leggio, prima)
      expect(trovate.length).toBeGreaterThan(0)
      controlla(tab, leggio, prima, trovate)
    }
  })

  it('con i jolly resta corretto', () => {
    const { tab, prima } = posizione(7, 5)
    const leggio = ['a', 'r', 'e', 't', JOLLY, JOLLY, 'o', 'n']
    const trovate = mosseLegali(dawg, tab, leggio, prima)
    controlla(tab, leggio, prima, trovate)
    expect(trovate.some((m) => m.posa.some((p) => p.jolly))).toBe(true)
  })

  it('la prima mossa passa sempre dal centro', () => {
    const trovate = mosseLegali(dawg, tabelloneVuoto(), ['c', 'a', 's', 'e', 'r', 'm', 'o', 'i'], true)
    expect(trovate.length).toBeGreaterThan(100)
    for (const m of trovate) expect(m.posa.some((p) => p.r === CENTRO && p.c === CENTRO)).toBe(true)
  })

  it('non dimentica nessuna mossa: stesso elenco di una ricerca esaustiva', () => {
    const casi: { seme: number; mosse: number; leggio: string[] }[] = [
      { seme: 11, mosse: 0, leggio: ['c', 'a', 's', 'o'] },
      { seme: 12, mosse: 4, leggio: ['r', 'e', 'i', 'a'] },
      { seme: 13, mosse: 7, leggio: ['l', 'o', 't', JOLLY] },
    ]
    for (const caso of casi) {
      const { tab, prima } = posizione(caso.seme, caso.mosse)
      const motore = new Set(mosseLegali(dawg, tab, caso.leggio, prima).map(chiave))
      const esaustiva = forzaBruta(tab, caso.leggio, prima)
      expect([...motore].sort()).toEqual([...esaustiva].sort())
    }
  })

  it('senza tessere utili non trova niente, e non si inventa pose', () => {
    expect(mosseLegali(dawg, tabelloneVuoto(), ['q', 'q', 'z', 'z', 'h', 'h', 'b', 'v'], true)).toEqual([])
  })

  it('il computer sceglie in modo ripetibile, e i livelli pescano in fasce diverse', () => {
    const { tab, leggio, prima } = posizione(21, 6)
    const trovate = mosseLegali(dawg, tab, leggio, prima)
    const a = sceltaDelComputer(trovate, 'normale', mulberry32(5))
    const b = sceltaDelComputer([...trovate].reverse(), 'normale', mulberry32(5))
    expect(a && chiave(a)).toBe(b && chiave(b))

    const migliore = Math.max(...trovate.map((m) => m.punti))
    expect(sceltaDelComputer(trovate, 'difficile', () => 0)?.punti).toBe(migliore)
    const facile = sceltaDelComputer(trovate, 'facile', () => 0.5)!
    const normale = sceltaDelComputer(trovate, 'normale', () => 0.5)!
    expect(facile.punti).toBeLessThanOrEqual(normale.punti)
    expect(sceltaDelComputer([], 'normale', () => 0)).toBeNull()
  })
})

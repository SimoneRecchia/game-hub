/**
 * Il sudoku: la griglia, le regole, il risolutore, il generatore e la
 * difficoltà.
 *
 * Una griglia e' una stringa di 81 caratteri, riga per riga: le cifre da 1 a 9,
 * e un punto per le caselle vuote. Le stesse funzioni girano nello script della
 * notte, che prepara le classificate, e nel browser, che fa le libere.
 *
 * La difficoltà e' quel che serve per risolverlo ragionando, come farebbe una
 * persona: `valuta` lo risolve con le tecniche in ordine — prima le singole,
 * poi gli incastri e le coppie, poi le tecniche avanzate (terzine, x-wing,
 * xy-wing, swordfish) — e conta la piu' difficile che gli e' servita. Facile e
 * media si chiudono con le sole singole, e la media ha meno cifre date, quindi
 * le singole sono piu' nascoste; la difficile chiede incastri e coppie,
 * l'esperto le tecniche avanzate. E' la scala delle app di sudoku, e ha un
 * vantaggio pratico: ogni livello e' una fascia larga, e il generatore ci
 * arriva in pochi tentativi. Uno schema che a ragionare non si chiude
 * (servirebbe tirare a indovinare) non si propone mai.
 */

import { costiAiuti, puntiConAiuti, type AiutiChiesti, type CostiAiuti } from './aiuti'
import { mulberry32 } from './daily'

export const LATO = 9
export const CASELLE = 81
export const VUOTA = '.'

export type LivelloSudoku = 'facile' | 'media' | 'difficile' | 'esperto'
export const LIVELLI: readonly LivelloSudoku[] = ['facile', 'media', 'difficile', 'esperto']
export const NOMI_LIVELLI: Record<LivelloSudoku, string> = {
  facile: 'Facile',
  media: 'Media',
  difficile: 'Difficile',
  esperto: 'Esperto',
}

/* ─────────────────────────────  La geometria  ───────────────────────────── */

export const rigaDi = (k: number) => Math.floor(k / LATO)
export const colonnaDi = (k: number) => k % LATO
export const riquadroDi = (k: number) => Math.floor(rigaDi(k) / 3) * 3 + Math.floor(colonnaDi(k) / 3)

/** Le 27 unità: nove righe, nove colonne, nove riquadri. */
export const UNITA: readonly number[][] = [
  ...Array.from({ length: 9 }, (_, r) => Array.from({ length: 9 }, (_, c) => r * 9 + c)),
  ...Array.from({ length: 9 }, (_, c) => Array.from({ length: 9 }, (_, r) => r * 9 + c)),
  ...Array.from({ length: 9 }, (_, b) =>
    Array.from({ length: 9 }, (_, i) => (Math.floor(b / 3) * 3 + Math.floor(i / 3)) * 9 + (b % 3) * 3 + (i % 3)),
  ),
]

/** Le venti caselle che ogni casella vede: la sua riga, la sua colonna, il suo riquadro. */
export const VICINI: readonly number[][] = Array.from({ length: CASELLE }, (_, k) => {
  const v = new Set<number>()
  for (const u of [rigaDi(k), 9 + colonnaDi(k), 18 + riquadroDi(k)]) for (const j of UNITA[u]) if (j !== k) v.add(j)
  return [...v]
})

/* ─────────────────────────────  I bit delle cifre  ───────────────────────────── */

const TUTTE = 0x1ff
/** Quante cifre ha una maschera di nove bit. */
const QUANTE = Uint8Array.from({ length: 512 }, (_, m) => {
  let n = 0
  for (let x = m; x; x &= x - 1) n += 1
  return n
})
const bit = (d: number) => 1 << (d - 1)
/** La cifra di una maschera con un bit solo. */
const cifraDi = (m: number) => 32 - Math.clz32(m)

export function cifreDi(maschera: number): number[] {
  const out: number[] = []
  for (let d = 1; d <= 9; d += 1) if (maschera & bit(d)) out.push(d)
  return out
}

/* ─────────────────────────────  Le regole  ───────────────────────────── */

/** true se la stringa e' una griglia: 81 caratteri, cifre o punti. */
export function eGriglia(testo: unknown): testo is string {
  return typeof testo === 'string' && /^[1-9.]{81}$/.test(testo)
}

/** Le caselle che hanno la stessa cifra di un'altra nella sua riga, colonna o riquadro. */
export function doppioni(griglia: string): number[] {
  const out = new Set<number>()
  for (const unita of UNITA) {
    const dove = new Map<string, number>()
    for (const k of unita) {
      const d = griglia[k]
      if (d === VUOTA) continue
      const prima = dove.get(d)
      if (prima === undefined) dove.set(d, k)
      else {
        out.add(prima)
        out.add(k)
      }
    }
  }
  return [...out].sort((a, b) => a - b)
}

/** Le cifre che una casella vuota potrebbe avere, guardando quelle scritte intorno. */
export function possibili(griglia: string, k: number): number {
  let m = TUTTE
  for (const j of VICINI[k]) if (griglia[j] !== VUOTA) m &= ~bit(Number(griglia[j]))
  return m
}

/** Le caselle scritte che non sono quelle della soluzione. */
export function caselleSbagliate(griglia: string, soluzione: string): number[] {
  const out: number[] = []
  for (let k = 0; k < CASELLE; k += 1) if (griglia[k] !== VUOTA && griglia[k] !== soluzione[k]) out.push(k)
  return out
}

export const grigliaPiena = (griglia: string) => !griglia.includes(VUOTA)

/** Una griglia del giocatore va bene se tiene le cifre date al loro posto. */
export function rispettaLeDate(griglia: string, date: string): boolean {
  if (!eGriglia(griglia) || !eGriglia(date)) return false
  for (let k = 0; k < CASELLE; k += 1) if (date[k] !== VUOTA && griglia[k] !== date[k]) return false
  return true
}

export function quanteDate(griglia: string): number {
  let n = 0
  for (let k = 0; k < CASELLE; k += 1) if (griglia[k] !== VUOTA) n += 1
  return n
}

/* ─────────────────────────────  Il risolutore  ───────────────────────────── */

/**
 * Cerca le soluzioni per tentativi, fino a `limite`: la casella con meno
 * possibilità per prima, con le maschere di bit di righe, colonne e riquadri.
 * Per uno schema da giornale sono millesimi di secondo.
 */
function cerca(griglia: string, limite: number, ordine?: (m: number) => number[]): { trovate: number; prima: string | null } {
  const valori = new Uint8Array(CASELLE)
  const righe = new Uint16Array(9)
  const colonne = new Uint16Array(9)
  const riquadri = new Uint16Array(9)
  for (let k = 0; k < CASELLE; k += 1) {
    if (griglia[k] === VUOTA) continue
    const d = Number(griglia[k])
    const b = bit(d)
    const r = rigaDi(k)
    const c = colonnaDi(k)
    const q = riquadroDi(k)
    if (righe[r] & b || colonne[c] & b || riquadri[q] & b) return { trovate: 0, prima: null }
    righe[r] |= b
    colonne[c] |= b
    riquadri[q] |= b
    valori[k] = d
  }
  let trovate = 0
  let prima: string | null = null

  const passo = (): boolean => {
    let scelta = -1
    let minimo = 10
    let maschera = 0
    for (let k = 0; k < CASELLE; k += 1) {
      if (valori[k]) continue
      const m = TUTTE & ~(righe[rigaDi(k)] | colonne[colonnaDi(k)] | riquadri[riquadroDi(k)])
      const n = QUANTE[m]
      if (n === 0) return false
      if (n < minimo) {
        minimo = n
        scelta = k
        maschera = m
        if (n === 1) break
      }
    }
    if (scelta < 0) {
      trovate += 1
      if (prima === null) prima = Array.from(valori, String).join('')
      return trovate >= limite
    }
    const r = rigaDi(scelta)
    const c = colonnaDi(scelta)
    const q = riquadroDi(scelta)
    for (const d of ordine ? ordine(maschera) : cifreDi(maschera)) {
      const b = bit(d)
      valori[scelta] = d
      righe[r] |= b
      colonne[c] |= b
      riquadri[q] |= b
      if (passo()) return true
      righe[r] &= ~b
      colonne[c] &= ~b
      riquadri[q] &= ~b
    }
    valori[scelta] = 0
    return false
  }

  passo()
  return { trovate, prima }
}

/** Quante soluzioni ha, fermandosi a `limite`: uno schema giusto ne ha una sola. */
export function contaSoluzioni(griglia: string, limite = 2): number {
  return cerca(griglia, limite).trovate
}

/** La soluzione, se ce n'e' una. */
export function risolvi(griglia: string): string | null {
  return cerca(griglia, 1).prima
}

function mescola<T>(voci: T[], caso: () => number): T[] {
  for (let i = voci.length - 1; i > 0; i -= 1) {
    const j = Math.floor(caso() * (i + 1))
    ;[voci[i], voci[j]] = [voci[j], voci[i]]
  }
  return voci
}

/** Una griglia completa a caso: il risolutore su una griglia vuota, con le cifre in ordine casuale. */
export function grigliaCompleta(caso: () => number): string {
  return cerca(VUOTA.repeat(CASELLE), 1, (m) => mescola(cifreDi(m), caso)).prima!
}

/* ─────────────────────────────  La difficoltà  ───────────────────────────── */

/** Le tecniche, dalla piu' semplice, con il gradino che portano: 1 le singole, 2 incastri e coppie, 3 le avanzate. */
export const TECNICHE = {
  singolaNuda: 1,
  singolaNascosta: 1,
  incastro: 2,
  coppiaNuda: 2,
  coppiaNascosta: 2,
  terzinaNuda: 3,
  terzinaNascosta: 3,
  xWing: 3,
  xyWing: 3,
  swordfish: 3,
} as const
export type Tecnica = keyof typeof TECNICHE

export interface Valutazione {
  /** Chiusa ragionando, senza tirare a indovinare. */
  risolta: boolean
  /** Il gradino della tecnica piu' difficile che e' servita (1, 2, 3); 0 se non si chiude. */
  gradino: number
  /** Il livello, dal gradino e dalle cifre date; null se non si chiude. */
  livello: LivelloSudoku | null
  /** Quante volte e' servita ogni tecnica. */
  usate: Partial<Record<Tecnica, number>>
}

/** Con le sole singole e almeno tante cifre date e' facile; con meno, media. */
export const DATE_FACILE = 34

export function livelloDi(gradino: number, date: number): LivelloSudoku | null {
  if (gradino === 1) return date >= DATE_FACILE ? 'facile' : 'media'
  if (gradino === 2) return 'difficile'
  if (gradino === 3) return 'esperto'
  return null
}

/** Il gradino piu' alto che un livello ammette mentre si tolgono le caselle. */
const GRADINO: Record<LivelloSudoku, number> = { facile: 1, media: 1, difficile: 2, esperto: 3 }

/** Lo stato del ragionamento: le cifre messe e le possibili di ogni casella vuota. */
class Ragionamento {
  valori = new Uint8Array(CASELLE)
  possibili = new Uint16Array(CASELLE)
  vuote = 0

  constructor(griglia: string) {
    this.possibili.fill(TUTTE)
    for (let k = 0; k < CASELLE; k += 1) this.vuote += 1
    for (let k = 0; k < CASELLE; k += 1) if (griglia[k] !== VUOTA) this.metti(k, Number(griglia[k]))
  }

  metti(k: number, d: number): void {
    this.valori[k] = d
    this.possibili[k] = 0
    this.vuote -= 1
    const b = bit(d)
    for (const j of VICINI[k]) this.possibili[j] &= ~b
  }

  /** Toglie cifre da una casella; true se ha cambiato qualcosa. */
  togli(k: number, maschera: number): boolean {
    if (this.valori[k] || !(this.possibili[k] & maschera)) return false
    this.possibili[k] &= ~maschera
    return true
  }

  contraddizione(): boolean {
    for (let k = 0; k < CASELLE; k += 1) if (!this.valori[k] && this.possibili[k] === 0) return true
    return false
  }
}

function singolaNuda(s: Ragionamento): boolean {
  for (let k = 0; k < CASELLE; k += 1) {
    if (!s.valori[k] && QUANTE[s.possibili[k]] === 1) {
      s.metti(k, cifraDi(s.possibili[k]))
      return true
    }
  }
  return false
}

function singolaNascosta(s: Ragionamento): boolean {
  for (const unita of UNITA) {
    for (let d = 1; d <= 9; d += 1) {
      const b = bit(d)
      let dove = -1
      let quante = 0
      for (const k of unita) {
        if (s.valori[k] === d) {
          quante = 2
          break
        }
        if (s.possibili[k] & b) {
          quante += 1
          dove = k
        }
      }
      if (quante === 1) {
        s.metti(dove, d)
        return true
      }
    }
  }
  return false
}

/** Incastri: in un riquadro una cifra sta tutta su una riga (o colonna), o in una riga tutta in un riquadro. */
function incastro(s: Ragionamento): boolean {
  let cambiato = false
  for (let d = 1; d <= 9; d += 1) {
    const b = bit(d)
    for (let u = 0; u < 27; u += 1) {
      const dove = UNITA[u].filter((k) => s.possibili[k] & b)
      if (dove.length < 2) continue
      if (u >= 18) {
        // Un riquadro che punta su una riga o una colonna.
        for (const linea of [rigaDi, colonnaDi]) {
          if (dove.every((k) => linea(k) === linea(dove[0]))) {
            const altra = linea === rigaDi ? UNITA[rigaDi(dove[0])] : UNITA[9 + colonnaDi(dove[0])]
            for (const k of altra) if (riquadroDi(k) !== u - 18 && s.togli(k, b)) cambiato = true
          }
        }
      } else if (dove.every((k) => riquadroDi(k) === riquadroDi(dove[0]))) {
        // Una riga o una colonna che si chiude in un riquadro.
        for (const k of UNITA[18 + riquadroDi(dove[0])]) if (!UNITA[u].includes(k) && s.togli(k, b)) cambiato = true
      }
      if (cambiato) return true
    }
  }
  return false
}

/** Gruppi nudi di n caselle con n cifre in tutto: quelle cifre non stanno altrove nell'unità. */
function gruppoNudo(s: Ragionamento, n: number): boolean {
  for (const unita of UNITA) {
    const libere = unita.filter((k) => !s.valori[k] && QUANTE[s.possibili[k]] <= n)
    if (libere.length < n) continue
    for (const gruppo of combinazioni(libere, n)) {
      let unione = 0
      for (const k of gruppo) unione |= s.possibili[k]
      if (QUANTE[unione] !== n) continue
      let cambiato = false
      for (const k of unita) if (!gruppo.includes(k) && s.togli(k, unione)) cambiato = true
      if (cambiato) return true
    }
  }
  return false
}

/** Gruppi nascosti: n cifre che in un'unità stanno solo in n caselle, che non possono avere altro. */
function gruppoNascosto(s: Ragionamento, n: number): boolean {
  for (const unita of UNITA) {
    const cifre: number[] = []
    for (let d = 1; d <= 9; d += 1) {
      const quante = unita.filter((k) => s.possibili[k] & bit(d)).length
      if (quante >= 1 && quante <= n) cifre.push(d)
    }
    for (const gruppo of combinazioni(cifre, n)) {
      let maschera = 0
      for (const d of gruppo) maschera |= bit(d)
      const dove = unita.filter((k) => s.possibili[k] & maschera)
      if (dove.length !== n) continue
      let cambiato = false
      for (const k of dove) if (s.togli(k, ~maschera & TUTTE)) cambiato = true
      if (cambiato) return true
    }
  }
  return false
}

/** X-wing (2) e swordfish (3): una cifra che in n righe sta in n colonne soltanto, o viceversa. */
function pesce(s: Ragionamento, n: number): boolean {
  for (let d = 1; d <= 9; d += 1) {
    const b = bit(d)
    for (const [linee, croce] of [
      [UNITA.slice(0, 9), colonnaDi],
      [UNITA.slice(9, 18), rigaDi],
    ] as const) {
      const candidate = linee
        .map((linea, i) => ({ i, dove: linea.filter((k) => s.possibili[k] & b).map(croce) }))
        .filter((l) => l.dove.length >= 2 && l.dove.length <= n)
      for (const gruppo of combinazioni(candidate, n)) {
        const incroci = new Set(gruppo.flatMap((l) => l.dove))
        if (incroci.size !== n) continue
        const scelte = new Set(gruppo.map((l) => l.i))
        let cambiato = false
        for (let i = 0; i < 9; i += 1) {
          if (scelte.has(i)) continue
          for (const x of incroci) {
            const k = croce === colonnaDi ? i * 9 + x : x * 9 + i
            if (s.togli(k, b)) cambiato = true
          }
        }
        if (cambiato) return true
      }
    }
  }
  return false
}

/** XY-wing: un perno {x,y} e due pinze {x,z} e {y,z} che vede: z non sta dove si vedono entrambe le pinze. */
function xyWing(s: Ragionamento): boolean {
  for (let perno = 0; perno < CASELLE; perno += 1) {
    const mp = s.possibili[perno]
    if (s.valori[perno] || QUANTE[mp] !== 2) continue
    const pinze = VICINI[perno].filter((k) => !s.valori[k] && QUANTE[s.possibili[k]] === 2 && QUANTE[s.possibili[k] & mp] === 1)
    for (let i = 0; i < pinze.length; i += 1) {
      for (let j = i + 1; j < pinze.length; j += 1) {
        const a = s.possibili[pinze[i]]
        const c = s.possibili[pinze[j]]
        const z = a & c & ~mp
        if (QUANTE[z] !== 1 || (a & mp) === (c & mp) || QUANTE[(a | c) & mp] !== 2) continue
        let cambiato = false
        for (const k of VICINI[pinze[i]]) if (k !== perno && VICINI[pinze[j]].includes(k) && s.togli(k, z)) cambiato = true
        if (cambiato) return true
      }
    }
  }
  return false
}

function* combinazioni<T>(voci: readonly T[], n: number, da = 0, prese: T[] = []): Generator<T[]> {
  if (prese.length === n) {
    yield prese
    return
  }
  for (let i = da; i <= voci.length - (n - prese.length); i += 1) yield* combinazioni(voci, n, i + 1, [...prese, voci[i]])
}

const PASSI: Array<[Tecnica, (s: Ragionamento) => boolean]> = [
  ['singolaNuda', singolaNuda],
  ['singolaNascosta', singolaNascosta],
  ['incastro', incastro],
  ['coppiaNuda', (s) => gruppoNudo(s, 2)],
  ['coppiaNascosta', (s) => gruppoNascosto(s, 2)],
  ['terzinaNuda', (s) => gruppoNudo(s, 3)],
  ['terzinaNascosta', (s) => gruppoNascosto(s, 3)],
  ['xWing', (s) => pesce(s, 2)],
  ['xyWing', xyWing],
  ['swordfish', (s) => pesce(s, 3)],
]

/**
 * Risolve ragionando, sempre con la tecnica piu' semplice che fa un passo: la
 * difficoltà e' la piu' difficile che e' servita.
 */
export function valuta(griglia: string): Valutazione {
  const s = new Ragionamento(griglia)
  const usate: Partial<Record<Tecnica, number>> = {}
  let gradino = 1
  while (s.vuote > 0) {
    if (s.contraddizione()) return { risolta: false, gradino: 0, livello: null, usate }
    let avanti = false
    for (const [nome, tecnica] of PASSI) {
      if (tecnica(s)) {
        usate[nome] = (usate[nome] ?? 0) + 1
        gradino = Math.max(gradino, TECNICHE[nome])
        avanti = true
        break
      }
    }
    if (!avanti) return { risolta: false, gradino: 0, livello: null, usate }
  }
  return { risolta: true, gradino, livello: livelloDi(gradino, quanteDate(griglia)), usate }
}

/* ─────────────────────────────  Il generatore  ───────────────────────────── */

export interface SchemaSudoku {
  livello: LivelloSudoku
  /** Le cifre date, con i punti per le vuote. */
  dati: string
  soluzione: string
}

/** Sotto quante cifre date non si scende, per livello: uno schema facile ne lascia molte. */
export const MINIMO_DATE: Record<LivelloSudoku, number> = { facile: 36, media: 28, difficile: 24, esperto: 22 }

/**
 * Uno schema del livello chiesto, dal generatore dato.
 *
 * Si parte da una griglia completa e si tolgono le caselle a coppie simmetriche
 * rispetto al centro, come negli schemi dei giornali: una coppia resta tolta se
 * la soluzione resta una sola e lo schema non diventa piu' difficile del
 * livello. Alla fine lo schema deve essere proprio di quel livello, o si
 * ricomincia. Il limite si conta in tentativi e non in millisecondi: una
 * macchina piu' lenta non cambia lo schema.
 */
export function generaSchema(livello: LivelloSudoku, caso: () => number, tentativi = 2000): SchemaSudoku | null {
  const tetto = GRADINO[livello]
  for (let t = 0; t < tentativi; t += 1) {
    const soluzione = grigliaCompleta(caso)
    const celle = [...soluzione]
    const coppie = mescola(
      Array.from({ length: 41 }, (_, k) => k),
      caso,
    )
    let date = CASELLE
    for (const k of coppie) {
      const j = CASELLE - 1 - k
      const togliendo = k === j ? 1 : 2
      if (date - togliendo < MINIMO_DATE[livello]) continue
      const prima = [celle[k], celle[j]]
      celle[k] = VUOTA
      celle[j] = VUOTA
      const prova = celle.join('')
      const v = contaSoluzioni(prova) === 1 ? valuta(prova) : null
      if (v?.risolta && v.gradino <= tetto) {
        date -= togliendo
      } else {
        celle[k] = prima[0]
        celle[j] = prima[1]
      }
    }
    const dati = celle.join('')
    const v = valuta(dati)
    if (v.risolta && v.livello === livello) return { livello, dati, soluzione }
  }
  return null
}

/* ─────────────────────────────  La giornata  ───────────────────────────── */

const SEME_SUDOKU = 0x5d0c0

/**
 * Il livello della classificata, dal giorno della settimana: facile il lunedì
 * e il martedì, media il mercoledì e il giovedì, difficile il venerdì e il
 * sabato, esperto la domenica — come i giornali, che la domenica lo fanno
 * difficile. Il giorno della settimana viene dalla data, non dal numero, così
 * resta giusto anche se un domani cambiasse il primo giorno di gioco.
 */
export function livelloDelGiorno(data: string): LivelloSudoku {
  const [anno, mese, giorno] = data.split('-').map(Number)
  const settimana = (new Date(Date.UTC(anno, mese - 1, giorno)).getUTCDay() + 6) % 7
  return (['facile', 'facile', 'media', 'media', 'difficile', 'difficile', 'esperto'] as const)[settimana]
}

/** Lo schema della classificata di una giornata: sempre lo stesso, dal numero del giorno. */
export function schemaDelGiorno(numero: number, data: string): SchemaSudoku | null {
  return generaSchema(livelloDelGiorno(data), mulberry32((SEME_SUDOKU ^ numero) >>> 0))
}

/* ─────────────────────────────  I punti  ───────────────────────────── */

/** Cento a chi lo completa senza aiuti (vedi shared/punti.ts). */
export const PUNTI_COMPLETO = 100

/** Quanto costano gli aiuti in questo schema (vedi shared/aiuti.ts): le caselle da trovare sono le vuote. */
export function costiSudoku(dati: string): CostiAiuti {
  let vuote = 0
  for (const d of dati) if (d === VUOTA) vuote += 1
  return costiAiuti(PUNTI_COMPLETO, vuote)
}

export function puntiSudoku(aiuti: AiutiChiesti, costi: CostiAiuti): number {
  return puntiConAiuti(PUNTI_COMPLETO, costi, aiuti)
}

/* ─────────────────────────────  Le note  ───────────────────────────── */

/**
 * Le note a matita, compatte: tre cifre in base otto per casella, cioe' la
 * maschera di nove bit delle cifre annotate. 243 caratteri per tutta la griglia.
 */
export function noteInTesto(note: ArrayLike<number>): string {
  let out = ''
  for (let k = 0; k < CASELLE; k += 1) out += ((note[k] ?? 0) & TUTTE).toString(8).padStart(3, '0')
  return out
}

export function noteDaTesto(testo: string): Uint16Array {
  const note = new Uint16Array(CASELLE)
  if (!/^[0-7]{243}$/.test(testo)) return note
  for (let k = 0; k < CASELLE; k += 1) note[k] = parseInt(testo.slice(k * 3, k * 3 + 3), 8) & TUTTE
  return note
}

export const NOTE_VUOTE = '0'.repeat(CASELLE * 3)

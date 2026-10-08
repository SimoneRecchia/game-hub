/**
 * La geometria del panno, in piedi come sul telefono: lo zero in cima, i
 * numeri in tre colonne e dodici righe, i "2 a 1" delle colonne in fondo; a
 * sinistra le dozzine e, piu' fuori, le chances semplici. Le misure sono in
 * unita' della griglia del panno — `COLONNE` di larghezza, quattordici righe —
 * e le posizioni in percentuale, cosi' le fiches stanno al loro posto a
 * qualunque misura.
 *
 * Le puntate interne si scelgono dal punto toccato (`puntataDa`): il centro di
 * un numero e' il pieno, il bordo fra due numeri il cavallo, l'incrocio fra
 * quattro il carré; il bordo esterno di una riga la terzina, quello fra due
 * righe la sestina. Come al tavolo, dove la fiche si posa sulla riga.
 */

import { PUNTATE, chiaveDi, colonnaDi, rigaDi, type PuntataEsterna } from '@shared/roulette'

/** Le colonne della griglia: le chances semplici, le dozzine, e i tre numeri di ogni riga. */
export const COLONNE = [0.8, 0.8, 1, 1, 1] as const
export const RIGHE = 14
const LARGO = COLONNE.reduce((s, c) => s + c, 0)
/** Dove cominciano i numeri, da sinistra. */
const NUMERI_X = COLONNE[0] + COLONNE[1]

/** Le chances semplici, dall'alto: ognuna alta due righe. */
export const SEMPLICI: readonly PuntataEsterna[] = ['manque', 'pari', 'rosso', 'nero', 'dispari', 'passe']

export interface Posto {
  /** Il centro, in percentuale della larghezza e dell'altezza del panno. */
  x: number
  y: number
}

const inPercento = (x: number, y: number): Posto => ({ x: (x / LARGO) * 100, y: (y / RIGHE) * 100 })

/**
 * Dove si posa la fiche di una puntata. Le interne si misurano sui numeri:
 * x da 0 a 3, y da 0 a 13, con lo zero nella prima riga.
 */
export function postoDi(chiave: string): Posto {
  const semplice = SEMPLICI.indexOf(chiave as PuntataEsterna)
  if (semplice >= 0) return inPercento(COLONNE[0] / 2, 2 + semplice * 2)
  if (chiave.startsWith('dozzina')) {
    const d = Number(chiave.slice(-1))
    return inPercento(COLONNE[0] + COLONNE[1] / 2, 3 + (d - 1) * 4)
  }
  if (chiave.startsWith('colonna')) return inPercento(NUMERI_X + Number(chiave.slice(-1)) - 0.5, 13.5)
  const numeri = PUNTATE.get(chiave) ?? [0]
  const altri = numeri.filter((n) => n > 0)
  const media = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length
  let x: number
  let y: number
  if (altri.length === 0) {
    x = 1.5
    y = 0.5
  } else if (numeri.includes(0)) {
    // Con lo zero: sul bordo fra lo zero e la prima riga; i primi quattro all'angolo di fuori.
    x = altri.length === 3 ? 0 : media(altri.map((n) => colonnaDi(n) - 1)) + 0.5
    y = 1
  } else if (numeri.length === 3 || numeri.length === 6) {
    x = 0
    y = media(numeri.map((n) => rigaDi(n) - 1)) + 1.5
  } else {
    x = media(numeri.map((n) => colonnaDi(n) - 1)) + 0.5
    y = media(numeri.map((n) => rigaDi(n) - 1)) + 1.5
  }
  return inPercento(NUMERI_X + x, y)
}

/** Quanto vicino a un bordo, in frazioni della casella, il tocco vale per la riga. */
const BORDO = 0.26

/**
 * La puntata interna sotto un punto dei numeri, dato in frazioni dell'area dei
 * numeri (lo zero e le dodici righe): `fx` da 0 a 1 sulla larghezza, `fy` da 0
 * a 1 sull'altezza. Null fuori dall'area.
 */
export function puntataDa(fx: number, fy: number): string | null {
  if (fx < 0 || fx > 1 || fy < 0 || fy > 1) return null
  const cx = Math.min(2.999, fx * 3)
  const cy = Math.min(12.999, fy * 13)
  const col = Math.floor(cx)
  const riga = Math.floor(cy)
  const dx = cx - col
  const dy = cy - riga
  const sinistra = dx < BORDO
  const destra = dx > 1 - BORDO
  const sopra = dy < BORDO
  const sotto = dy > 1 - BORDO
  const scegli = (numeri: number[]) => {
    const k = chiaveDi(numeri)
    return PUNTATE.has(k) ? k : null
  }
  if (riga === 0) {
    // Lo zero: sul bordo con la prima riga i cavalli e le terzine con lo zero, all'angolo i primi quattro.
    if (!sotto) return '0'
    if (sinistra && col === 0) return scegli([0, 1, 2, 3])
    if (destra && col < 2) return scegli([0, col + 1, col + 2])
    if (sinistra && col > 0) return scegli([0, col, col + 1])
    return scegli([0, col + 1])
  }
  const r = riga - 1
  const n = 3 * r + col + 1
  // Il bordo di fuori della prima colonna: la terzina della riga, o la sestina con quella vicina.
  if (sinistra && col === 0) {
    if (sopra && r > 0) return scegli(Array.from({ length: 6 }, (_, k) => n - 3 + k))
    if (sopra && r === 0) return scegli([0, 1, 2, 3])
    if (sotto && r < 11) return scegli(Array.from({ length: 6 }, (_, k) => n + k))
    return scegli([n, n + 1, n + 2])
  }
  const lato = sinistra ? -1 : destra && col < 2 ? 1 : 0
  const verticale = sopra ? -1 : sotto && r < 11 ? 1 : 0
  if (lato !== 0 && verticale !== 0) {
    if (r === 0 && verticale === -1) return scegli([0, n, n + lato])
    return scegli([n, n + lato, n + 3 * verticale, n + lato + 3 * verticale])
  }
  if (lato !== 0) return scegli([n, n + lato])
  if (verticale !== 0) return verticale === -1 && r === 0 ? scegli([0, n]) : scegli([n, n + 3 * verticale])
  return String(n)
}

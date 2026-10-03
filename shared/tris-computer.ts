/**
 * Il computer del tris.
 *
 * Il tris e' risolto: con il gioco perfetto da tutti e due finisce patta, e le
 * posizioni possibili sono poche migliaia. Il valore di ognuna si calcola fino
 * in fondo e si ricorda (`valore`), quindi il computer sa sempre quali mosse
 * tengono la patta e quali la perdono. Quel che lo rende un avversario e non un
 * muro e' che a volte sbaglia, come una persona: quasi mai una mossa che lascia
 * fare tris subito (non parare una fila e' una svista grossa), piu' spesso una
 * che lascia fare una forchetta — due file aperte insieme, che non si parano —
 * e tanto piu' spesso quanto meno sono le mosse giuste: una trappola ben tesa
 * e' una posizione cosi'.
 *
 * Il computer della classificata sbaglia sempre allo stesso modo nella stessa
 * posizione: le sue scelte vengono dal seme della partita del giorno e dalla
 * posizione (`mossaDelGiorno`), non dal caso del momento, quindi chi gioca le
 * stesse mosse trova le stesse risposte, e la serie del giorno e' la stessa per
 * tutti. Ogni partita della serie ha un seme suo e un punto debole, una
 * posizione dove il computer sbaglia di sicuro: c'e' sempre almeno un modo di
 * vincerla (`computerDellaPartita`).
 *
 * Dentro, le posizioni sono due maschere di nove bit, una per segno, e i
 * valori si leggono da una tabella calcolata una volta (shared/tris-valori.ts):
 * il server ha dieci millisecondi per richiesta, e il minimax a ogni isolato
 * nuovo ne costava sei, con le posizioni come oggetti trenta.
 */

import { mulberry32 } from './daily'
import { CASELLE, FILE, segnoDelGiocatore, type PosizioneTris, type Segno } from './tris'
import { VALORI_TRIS } from './tris-valori'

export type ValoreTris = -1 | 0 | 1

/* ─────────────────────────────  Le maschere  ─────────────────────────────── */

const PIENA = (1 << CASELLE) - 1
const FILE_BIT = FILE.map(([a, b, c]) => (1 << a) | (1 << b) | (1 << c))
const POTENZE = Array.from({ length: CASELLE }, (_, k) => 3 ** k)

function maschereDi(p: PosizioneTris): { zero: number; uno: number } {
  let zero = 0
  let uno = 0
  for (let k = 0; k < CASELLE; k += 1) {
    if (p.caselle[k] === 0) zero |= 1 << k
    else if (p.caselle[k] === 1) uno |= 1 << k
  }
  return { zero, uno }
}

function fila(maschera: number): boolean {
  for (const f of FILE_BIT) if ((maschera & f) === f) return true
  return false
}

/** L'indice in base tre della posizione: due posizioni uguali hanno lo stesso, e il tratto si ricava dai segni. */
function indice(zero: number, uno: number): number {
  let i = 0
  for (let k = 0; k < CASELLE; k += 1) {
    if (zero & (1 << k)) i += POTENZE[k]
    else if (uno & (1 << k)) i += 2 * POTENZE[k]
  }
  return i
}

function contaBit(x: number): number {
  let n = 0
  for (let y = x; y; y &= y - 1) n += 1
  return n
}

/** Chi ha il tratto: 0 quando i segni dell'uno e dell'altro sono tanti uguali. */
function trattoDi(zero: number, uno: number): Segno {
  return contaBit(zero) === contaBit(uno) ? 0 : 1
}

/* ─────────────────────────────  I valori  ─────────────────────────────── */

/** La tabella dei valori, quattro posizioni per byte (vedi scripts/genera-tris-valori.ts). */
const TABELLA = Uint8Array.from(atob(VALORI_TRIS), (c) => c.charCodeAt(0))

/** Il valore per chi ha il tratto, con il gioco perfetto da tutti e due. */
function valoreBit(zero: number, uno: number): ValoreTris {
  const i = indice(zero, uno)
  const codice = (TABELLA[i >> 2] >> ((i & 3) * 2)) & 3
  // 3 e' una posizione che non puo' esistere: qui non ci si arriva giocando.
  return (codice === 3 ? 0 : codice - 1) as ValoreTris
}

/**
 * Il valore di una posizione per chi ha il tratto, con il gioco perfetto da
 * tutti e due: 1 se vince, 0 se e' patta, -1 se perde. A partita finita, per
 * chi avrebbe il tratto: -1 se l'altro ha fatto tris, 0 se la griglia e' piena.
 */
export function valore(p: PosizioneTris): ValoreTris {
  const { zero, uno } = maschereDi(p)
  return valoreBit(zero, uno)
}

/** Le mosse libere e il loro valore per chi ha il tratto; nessuna a partita finita. */
function valoriBit(zero: number, uno: number): Array<[number, ValoreTris]> {
  const tratto = trattoDi(zero, uno)
  const occupate = zero | uno
  if (fila(zero) || fila(uno) || occupate === PIENA) return []
  const valori: Array<[number, ValoreTris]> = []
  for (let k = 0; k < CASELLE; k += 1) {
    if (occupate & (1 << k)) continue
    const v = tratto === 0 ? -valoreBit(zero | (1 << k), uno) : -valoreBit(zero, uno | (1 << k))
    valori.push([k, v as ValoreTris])
  }
  return valori
}

/** Il valore di ogni mossa per chi ha il tratto, casella per casella. */
export function valoriDelleMosse(p: PosizioneTris): Map<number, ValoreTris> {
  const { zero, uno } = maschereDi(p)
  return new Map(valoriBit(zero, uno))
}

/** Le caselle libere dove chi ha questi segni fa tris subito. */
function chiudeSubito(suoi: number, occupate: number): number[] {
  const caselle: number[] = []
  for (const f of FILE_BIT) {
    const mancante = f & ~suoi
    if (contaBit(mancante) === 1 && !(occupate & mancante)) {
      const k = 31 - Math.clz32(mancante)
      if (!caselle.includes(k)) caselle.push(k)
    }
  }
  return caselle.sort((a, b) => a - b)
}

/* ─────────────────────────────  Le distrazioni  ─────────────────────────────── */

/** Quanto spesso il computer sbaglia: una svista grossa lascia fare tris subito, una sottile una forchetta. */
export interface Distrazione {
  sottile: number
  grossa: number
}

function mossaDistrattaBit(zero: number, uno: number, distrazione: Distrazione, rng: () => number): number {
  const valori = valoriBit(zero, uno)
  if (valori.length === 0) throw new Error('La partita è finita: non ci sono mosse.')
  const tratto = trattoDi(zero, uno)
  const miei = tratto === 0 ? zero : uno
  const suoi = tratto === 0 ? uno : zero
  const occupate = zero | uno
  const scegli = (fra: number[]) => fra[Math.floor(rng() * fra.length) % fra.length]
  const mosse = valori.map(([k]) => k)
  const migliore = Math.max(...valori.map(([, v]) => v))

  if (migliore === 1) {
    const subito = chiudeSubito(miei, occupate)
    return scegli(subito.length > 0 ? subito : valori.filter(([, v]) => v === 1).map(([k]) => k))
  }
  if (migliore === -1) {
    // Persa: almeno la fila che l'altro chiude subito si para.
    const parate = chiudeSubito(suoi, occupate)
    return scegli(parate.length > 0 ? parate : mosse)
  }

  const tengono = valori.filter(([, v]) => v === 0).map(([k]) => k)
  const perdono = valori.filter(([, v]) => v === -1).map(([k]) => k)
  // Una svista grossa lascia all'altro una fila da chiudere subito: non para la sua.
  const grosse = perdono.filter((k) => chiudeSubito(suoi, occupate | (1 << k)).length > 0)
  const sottili = perdono.filter((k) => !grosse.includes(k))
  // Si sbaglia di piu' dove le mosse giuste sono poche: una trappola ben tesa e' una posizione cosi'.
  const r = rng()
  if (r < (distrazione.sottile * sottili.length) / mosse.length) return scegli(sottili)
  if (r >= 1 - distrazione.grossa && grosse.length > 0) return scegli(grosse)
  return scegli(tengono)
}

/**
 * La mossa di un computer che conosce il valore di tutto ma a volte si
 * distrae. `rng` decide: il caso del momento nelle libere, il seme della
 * posizione nella classificata.
 *
 * Con una vittoria in mano la prende, la piu' corta. In una posizione persa
 * para quel che si puo' parare, per durare. In una posizione patta tiene la
 * patta, tranne quando si distrae: allora sceglie, fra le mosse che perdono,
 * una sottile o — piu' di rado — una grossa.
 */
export function mossaDistratta(p: PosizioneTris, distrazione: Distrazione, rng: () => number): number {
  const { zero, uno } = maschereDi(p)
  return mossaDistrattaBit(zero, uno, distrazione, rng)
}

/* ─────────────────────────────  Le libere  ─────────────────────────────── */

export type LivelloTris = 'facile' | 'normale' | 'difficile'

export const LIVELLI_TRIS: readonly LivelloTris[] = ['facile', 'normale', 'difficile']

/**
 * Le distrazioni di ogni livello. Il difficile non si distrae mai: con lui il
 * meglio che si puo' fare e' la patta, come al tris vero fra due che lo sanno.
 */
export const DISTRAZIONI: Record<LivelloTris, Distrazione> = {
  facile: { sottile: 0.9, grossa: 0.3 },
  normale: { sottile: 0.45, grossa: 0.05 },
  difficile: { sottile: 0, grossa: 0 },
}

/** La mossa del computer delle libere, al suo livello. */
export function mossaDelComputer(p: PosizioneTris, livello: LivelloTris, rng: () => number = Math.random): number {
  return mossaDistratta(p, DISTRAZIONI[livello], rng)
}

/* ──────────────────────────  La classificata  ───────────────────────────── */

/** Le distrazioni del computer del giorno: quelle del normale. */
export const DISTRAZIONE_DEL_GIORNO: Distrazione = DISTRAZIONI.normale

/** Mescola due interi a 32 bit in uno: il seme di ogni posizione, di ogni partita. */
function mescola(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e37_79b9, 0x85eb_ca6b) ^ Math.imul(b + 0x6a09_e667, 0xc2b2_ae35)
  h ^= h >>> 16
  h = Math.imul(h, 0x7feb_352d)
  h ^= h >>> 15
  h = Math.imul(h, 0x846c_a68b)
  return (h ^ (h >>> 16)) >>> 0
}

/** Il computer di una partita della classificata: il suo seme, chi ha davanti, e il suo punto debole. */
export interface ComputerDelGiorno {
  seme: number
  umano: Segno
  /** L'indice della posizione dove sbaglia di sicuro: c'e' sempre un modo di vincere. */
  debolezza: number
}

/** Le mosse che perdono senza lasciare un tris subito: le sviste sottili. */
function sottiliBit(zero: number, uno: number): number[] {
  const tratto = trattoDi(zero, uno)
  const suoi = tratto === 0 ? uno : zero
  const occupate = zero | uno
  return valoriBit(zero, uno)
    .filter(([k, v]) => v === -1 && chiudeSubito(suoi, occupate | (1 << k)).length === 0)
    .map(([k]) => k)
}

/** Le sviste del punto debole: le sottili, o se non ce ne sono le grosse. */
function svisteBit(zero: number, uno: number): number[] {
  const sottili = sottiliBit(zero, uno)
  if (sottili.length > 0) return sottili
  return valoriBit(zero, uno)
    .filter(([, v]) => v === -1)
    .map(([k]) => k)
}

/** La mossa del computer del giorno dove non e' il suo punto debole: quella del normale, col seme della posizione. */
function mossaNormaleBit(zero: number, uno: number, seme: number): number {
  return mossaDistrattaBit(zero, uno, DISTRAZIONE_DEL_GIORNO, mulberry32(mescola(seme, indice(zero, uno))))
}

function mossaBit(zero: number, uno: number, computer: ComputerDelGiorno): number {
  if (indice(zero, uno) === computer.debolezza) {
    const sviste = svisteBit(zero, uno)
    const rng = mulberry32(mescola(computer.seme, indice(zero, uno)))
    if (sviste.length > 0) return sviste[Math.floor(rng() * sviste.length) % sviste.length]
  }
  return mossaNormaleBit(zero, uno, computer.seme)
}

/** Da quale mossa puo' cadere il punto debole: non sulla prima risposta, che sarebbe un'apertura fortunata. */
const PRIMA_MOSSA_DEBOLE = 3

/**
 * Il punto debole del computer di una partita: una posizione in cui ha una
 * svista a disposizione, e ci si arriva senza che lui sbagli prima. Li' la fa
 * sempre, quindi chi ci arriva puo' vincere: ogni partita della serie si puo'
 * vincere, e la si vince trovando la strada. Altrove il computer si distrae
 * come al livello normale.
 *
 * Si cerca prima una svista sottile, che lascia una forchetta. Quando comincia
 * il computer di solito non ce n'e': chi ha la mossa in piu' perde con una
 * forchetta solo alla quinta, e contro chi tiene la patta non ci arriva quasi
 * mai. Allora il punto debole e' una fila lasciata aperta, che chi gioca deve
 * vedere in tempo. Non cade mai sulla prima risposta del computer
 * (`PRIMA_MOSSA_DEBOLE`): sarebbe un'apertura fortunata, non una strada.
 *
 * La ricerca segue chi gioca su tutte le mosse che tengono la patta, in un
 * ordine mescolato dal seme, e il computer sulle mosse che giocherebbe in
 * partita (`mossaNormaleBit`): prima del punto debole nessuna posizione della
 * strada ha la svista cercata, quindi il computer ci risponde come sempre e
 * il punto debole e' raggiungibile. -1 se non ce n'e' nessuno.
 */
function debolezzaDi(seme: number, umano: Segno): number {
  const cerca = (zero: number, uno: number, sviste: typeof sottiliBit, visti: Set<number>): number => {
    if (fila(zero) || fila(uno) || (zero | uno) === PIENA) return -1
    const i = indice(zero, uno)
    if (visti.has(i)) return -1
    visti.add(i)
    const tratto = trattoDi(zero, uno)
    const dopo = (k: number) =>
      tratto === 0 ? cerca(zero | (1 << k), uno, sviste, visti) : cerca(zero, uno | (1 << k), sviste, visti)
    if (tratto !== umano) {
      if (contaBit(zero | uno) >= PRIMA_MOSSA_DEBOLE && sviste(zero, uno).length > 0) return i
      return dopo(mossaNormaleBit(zero, uno, seme))
    }
    // Chi gioca tiene la patta: la strada verso il punto debole non regala niente.
    const tengono = valoriBit(zero, uno)
      .filter(([, v]) => v >= 0)
      .map(([k]) => k)
    const rng = mulberry32(mescola(seme, 0x6465_626f ^ i))
    for (let j = tengono.length - 1; j > 0; j -= 1) {
      const r = Math.floor(rng() * (j + 1)) % (j + 1)
      ;[tengono[j], tengono[r]] = [tengono[r], tengono[j]]
    }
    for (const k of tengono) {
      const trovata = dopo(k)
      if (trovata >= 0) return trovata
    }
    return -1
  }
  for (const sviste of [sottiliBit, svisteBit]) {
    const trovata = cerca(0, 0, sviste, new Set())
    if (trovata >= 0) return trovata
  }
  return -1
}

const computer = new Map<string, ComputerDelGiorno>()

/** Il computer della partita `k` del giorno: lo stesso per tutti, e per sempre. */
export function computerDellaPartita(puzzleNumber: number, k: number): ComputerDelGiorno {
  const chiave = `${puzzleNumber}:${k}`
  let c = computer.get(chiave)
  if (!c) {
    const seme = mescola(0x7472_6973 ^ puzzleNumber, k)
    const umano = segnoDelGiocatore(k)
    c = { seme, umano, debolezza: debolezzaDi(seme, umano) }
    computer.set(chiave, c)
  }
  return c
}

/**
 * La mossa del computer della classificata: una funzione del computer della
 * partita e della posizione, e di nient'altro. Chi arriva nella stessa
 * posizione trova la stessa risposta.
 */
export function mossaDelGiorno(p: PosizioneTris, c: ComputerDelGiorno): number {
  const { zero, uno } = maschereDi(p)
  return mossaBit(zero, uno, c)
}

function vittoriaBit(zero: number, uno: number, c: ComputerDelGiorno, visti: Map<number, boolean>): boolean {
  if (fila(c.umano === 0 ? zero : uno)) return true
  if (fila(c.umano === 0 ? uno : zero) || (zero | uno) === PIENA) return false
  const i = indice(zero, uno)
  const noto = visti.get(i)
  if (noto !== undefined) return noto
  const tratto = trattoDi(zero, uno)
  const dopo = (k: number) =>
    tratto === 0 ? vittoriaBit(zero | (1 << k), uno, c, visti) : vittoriaBit(zero, uno | (1 << k), c, visti)
  let vince = false
  if (tratto !== c.umano) {
    vince = dopo(mossaBit(zero, uno, c))
  } else {
    const occupate = zero | uno
    for (let k = 0; k < CASELLE && !vince; k += 1) if (!(occupate & (1 << k))) vince = dopo(k)
  }
  visti.set(i, vince)
  return vince
}

/**
 * Se chi gioca puo' ancora vincere contro il computer della partita, da
 * questa posizione: le risposte del computer sono fisse, quindi basta una
 * strada. Serve ai test, che lo verificano per ogni partita.
 */
export function vittoriaPossibile(p: PosizioneTris, c: ComputerDelGiorno): boolean {
  const { zero, uno } = maschereDi(p)
  return vittoriaBit(zero, uno, c, new Map())
}

/**
 * Gli scacchi: le regole della FIDE, le stesse per l'interfaccia, per il
 * computer (che gira in un Web Worker) e per il server, che convalida ogni
 * mossa.
 *
 * La stessa posizione ha due forme:
 *
 *  - la `Posizione`, immutabile, e' quella che si passa in giro: la usano
 *    l'interfaccia e il server, si legge e si scrive in FEN, e `gioca` ne
 *    restituisce una nuova senza toccare quella che riceve;
 *  - la `Scacchiera`, mutabile, e' quella su cui si lavora: i pezzi in un
 *    `Int8Array`, le mosse come numeri interi, e un `fai` che ha il suo
 *    `disfai`. Il computer esplora centinaia di migliaia di posizioni, e un
 *    oggetto nuovo per ognuna costerebbe piu' di tutto il resto. Anche le
 *    funzioni pubbliche passano da lei: convertire costa un microsecondo, e
 *    le regole sono scritte una volta sola.
 *
 * Le mosse si generano come si muovono i pezzi, e poi si scartano quelle che
 * lasciano il re sotto scacco. Per quasi tutte basta guardare se il pezzo stava
 * sulla linea del re; le altre — le mosse del re, l'en passant, le risposte a
 * uno scacco — si provano davvero sulla scacchiera. Il server fa `daFen`,
 * `mossaDaUci`, `gioca` ed `esito` per ogni mossa: tutto insieme sono decine
 * di microsecondi, sui dieci millisecondi di CPU che ha una richiesta.
 *
 * Tre cose che non si vedono dal codice:
 *
 *  - la **chiave di ripetizione** sono i primi quattro campi del FEN, con la
 *    casella en passant solo se la presa e' davvero legale. Per la FIDE due
 *    posizioni sono la stessa se hanno gli stessi pezzi sulle stesse caselle,
 *    lo stesso tratto e le stesse mosse possibili (articolo 9.2.3): una casella
 *    en passant che nessuno puo' usare non cambia le mosse, e con il FEN intero
 *    la posizione dopo una spinta di due non si ripeterebbe mai. E' un testo e
 *    non un numero perché si legge, non cambia da una versione all'altra — si
 *    puo' salvare con la partita — e il computer la rilegge con `daFen`;
 *  - la **triplice ripetizione** e le **cinquanta mosse** sono patte
 *    automatiche, come nelle app. Per la FIDE vanno reclamate (articoli 9.2 e
 *    9.3) e diventano automatiche solo a cinque ripetizioni e a settantacinque
 *    mosse; ma qui non c'e' un arbitro a cui reclamarle, e due persone che non
 *    sanno di poterlo fare girerebbero in tondo per sempre. Il materiale
 *    insufficiente e' automatico anche per la FIDE (la posizione "morta",
 *    articolo 5.2.2): si riconoscono i casi di scuola, non le posizioni
 *    bloccate, come fanno le app;
 *  - la **notazione** e' l'algebrica con le iniziali italiane, come sui libri e
 *    sui formulari della federazione: Re, Donna, Torre, Alfiere, Cavallo, e il
 *    pedone senza lettera. "Cf3", "exd6", "Dxf7#", "O-O", "e8=D".
 */

import { mulberry32 } from './daily'

export type Colore = 'w' | 'b'
export type TipoPezzo = 'p' | 'n' | 'b' | 'r' | 'q' | 'k'

export interface Pezzo {
  colore: Colore
  tipo: TipoPezzo
}

export type Promozione = 'q' | 'r' | 'b' | 'n'

/** Casella: 0..63, indice = traversa * 8 + colonna; a1 = 0, h1 = 7, a8 = 56, h8 = 63. */
export interface Posizione {
  readonly caselle: readonly (Pezzo | null)[]
  readonly tratto: Colore
  /** Sottoinsieme di 'KQkq' in quest'ordine, '' se nessuno. */
  readonly arrocchi: string
  /** La casella dietro il pedone appena spinto di due, come nel FEN: anche se nessuno lo puo' prendere. */
  readonly enPassant: number | null
  /** Le semimosse dall'ultima presa o mossa di pedone, per la regola delle cinquanta mosse. */
  readonly semimosse: number
  /** Il numero della mossa, come nel FEN: cresce dopo quella del nero. */
  readonly mossa: number
}

/**
 * Una mossa. Per giocarla bastano `da`, `a` e la promozione; gli altri campi li
 * aggiunge chi la genera (`mosseLegali`, `mossaDaUci`) per chi la mostra: il
 * pezzo preso, la torre che si sposta con l'arrocco, il pedone preso en passant
 * che non sta sulla casella d'arrivo. Dipendono solo dalla posizione, quindi
 * due mosse uguali restano uguali, e `gioca` non li legge: li ricava.
 */
export interface Mossa {
  readonly da: number
  readonly a: number
  readonly promozione?: Promozione
  /** Il pezzo preso, anche quello preso en passant. */
  readonly presa?: TipoPezzo
  readonly arrocco?: 'corto' | 'lungo'
  /** Presa en passant: il pedone preso sta dietro la casella d'arrivo. */
  readonly enPassant?: boolean
}

export type Fine = 'matto' | 'stallo' | 'ripetizione' | 'cinquanta' | 'materiale'

export const FEN_INIZIALE = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

/* ─────────────────────────────  Le caselle  ───────────────────────────── */

const COLONNE = 'abcdefgh'

/** 0 → 'a1', 28 → 'e4', 63 → 'h8'. */
export function nomeCasella(k: number): string {
  if (!Number.isInteger(k) || k < 0 || k > 63) throw new RangeError(`Casella fuori dalla scacchiera: ${k}`)
  return COLONNE[k & 7] + String((k >> 3) + 1)
}

/** 'e4' → 28; null se non e' una casella. */
export function casellaDa(nome: string): number | null {
  if (typeof nome !== 'string' || nome.length !== 2) return null
  const colonna = nome.charCodeAt(0) - 97
  const traversa = nome.charCodeAt(1) - 49
  if (colonna < 0 || colonna > 7 || traversa < 0 || traversa > 7) return null
  return traversa * 8 + colonna
}

/* ─────────────────────────────  I pezzi e le mosse, come numeri  ───────────────────────────── */

/*
 * Sulla scacchiera un pezzo e' un numero: il tipo nei tre bit bassi, il colore
 * nel quarto. I due lati sono 0, il bianco, e 1, il nero: il lato di un pezzo e'
 * `pezzo >> 3`. Lo zero e' la casella vuota.
 */
export const PEDONE = 1
export const CAVALLO = 2
export const ALFIERE = 3
export const TORRE = 4
export const DONNA = 5
export const RE = 6
export const NERO = 8

/*
 * Una mossa e' un intero: la casella di partenza nei bit 0-5, quella d'arrivo
 * nei 6-11, il tipo della promozione nei 12-14, il genere nei 15-16 e il pezzo
 * preso nei 17-20. C'e' tutto quel che serve per disfarla, e per ordinarle nella
 * ricerca non serve guardare la scacchiera.
 */
export const SPINTA = 1 << 15
export const EN_PASSANT = 2 << 15
export const ARROCCO = 3 << 15
export const GENERE = 3 << 15

export const daDi = (m: number) => m & 63
export const aDi = (m: number) => (m >>> 6) & 63
export const promozioneDi = (m: number) => (m >>> 12) & 7
export const presaDi = (m: number) => (m >>> 17) & 15

/** Le mosse pseudo-legali di una posizione stanno ampiamente qui dentro: quelle legali sono al massimo 218. */
export const MOSSE_MASSIME = 512

const TIPI: readonly TipoPezzo[] = ['p', 'p', 'n', 'b', 'r', 'q', 'k']
const CODICE_TIPO: Readonly<Record<string, number>> = { p: PEDONE, n: CAVALLO, b: ALFIERE, r: TORRE, q: DONNA, k: RE }
const PROMOZIONI: readonly (Promozione | undefined)[] = [undefined, undefined, 'n', 'b', 'r', 'q']

/** I pezzi delle posizioni, uno per codice: sempre gli stessi oggetti, per non crearne uno a ogni casella. */
const PEZZI: readonly (Pezzo | null)[] = Array.from({ length: 16 }, (_, q) =>
  (q & 7) >= PEDONE && (q & 7) <= RE ? Object.freeze<Pezzo>({ colore: q & NERO ? 'b' : 'w', tipo: TIPI[q & 7] }) : null,
)

/** La lettera del FEN di ogni codice: maiuscole le bianche. */
const LETTERE_FEN = ' PNBRQK  pnbrqk '
const CODICE_FEN = new Map([...'PNBRQKpnbrqk'].map((l) => [l, LETTERE_FEN.indexOf(l)]))

/** Le iniziali italiane: Cavallo, Alfiere, Torre, Donna, Re. */
const INIZIALI = '  CATDR'

/* ─────────────────────────────  Le tabelle  ───────────────────────────── */

/** Le otto direzioni come passi di colonna e di traversa: le prime quattro dritte, le altre in diagonale. */
const DIREZIONI = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]] as const
const SALTI = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]] as const

const dentro = (colonna: number, traversa: number) => colonna >= 0 && colonna < 8 && traversa >= 0 && traversa < 8

/** Tanti elenchi in un vettore solo: l'elenco `i` va da `da[i]` a `da[i + 1]`, e scorrerlo non crea niente. */
function inFila(elenchi: number[][]): { da: Int16Array; a: Int8Array } {
  const da = new Int16Array(elenchi.length + 1)
  const a: number[] = []
  elenchi.forEach((elenco, i) => {
    da[i] = a.length
    a.push(...elenco)
  })
  da[elenchi.length] = a.length
  return { da, a: Int8Array.from(a) }
}

function passi(verso: readonly (readonly [number, number])[]): number[][] {
  return Array.from({ length: 64 }, (_, k) =>
    verso.filter(([dc, dt]) => dentro((k & 7) + dc, (k >> 3) + dt)).map(([dc, dt]) => k + dt * 8 + dc),
  )
}

const { da: CAVALLO_DA, a: CAVALLO_A } = inFila(passi(SALTI))
const { da: RE_DA, a: RE_A } = inFila(passi(DIREZIONI))

/** I raggi: da ogni casella, in ogni direzione, le caselle in fila fino al bordo. Il raggio (k, d) e' il k * 8 + d. */
const { da: RAGGIO_DA, a: RAGGIO_A } = inFila(
  Array.from({ length: 64 * 8 }, (_, i) => {
    const k = i >> 3
    const [dc, dt] = DIREZIONI[i & 7]
    const raggio: number[] = []
    for (let c = (k & 7) + dc, t = (k >> 3) + dt; dentro(c, t); c += dc, t += dt) raggio.push(t * 8 + c)
    return raggio
  }),
)

/** La direzione che va da una casella all'altra, se sono sulla stessa riga, colonna o diagonale; -1 se no. */
const DIREZIONE = new Int8Array(64 * 64).fill(-1)
for (let k = 0; k < 64; k += 1) {
  for (let d = 0; d < 8; d += 1) {
    for (let i = RAGGIO_DA[k * 8 + d]; i < RAGGIO_DA[k * 8 + d + 1]; i += 1) DIREZIONE[k * 64 + RAGGIO_A[i]] = d
  }
}

/*
 * I diritti di arrocco sono quattro bit: 1 il corto del bianco, 2 il lungo, 4 e
 * 8 quelli del nero. Una mossa che parte da una di queste caselle o ci arriva ne
 * toglie qualcuno: il re che si muove li perde tutti e due, una torre il suo, e
 * anche una torre presa sulla sua casella, che non potra' piu' arroccare.
 */
const ARROCCHI_DOPO = new Int8Array(64).fill(15)
ARROCCHI_DOPO[0] = 15 & ~2
ARROCCHI_DOPO[4] = 15 & ~3
ARROCCHI_DOPO[7] = 15 & ~1
ARROCCHI_DOPO[56] = 15 & ~8
ARROCCHI_DOPO[60] = 15 & ~12
ARROCCHI_DOPO[63] = 15 & ~4

function testoArrocchi(diritti: number): string {
  return (diritti & 1 ? 'K' : '') + (diritti & 2 ? 'Q' : '') + (diritti & 4 ? 'k' : '') + (diritti & 8 ? 'q' : '')
}

/*
 * Le chiavi di Zobrist: un numero a caso per ogni pezzo su ogni casella, per il
 * tratto, per i diritti di arrocco e per la colonna en passant. L'impronta di una
 * posizione e' lo xor di quelli che la descrivono, e una mossa la aggiorna con
 * pochi xor. Sono due interi da 32 bit perché JavaScript non ne ha da 64: con
 * 32 soli, fra le centinaia di migliaia di posizioni di una ricerca, due diverse
 * con la stessa impronta capiterebbero davvero.
 */
const caso = mulberry32(0x5ca_cc4e)
const casuale = () => (caso() * 4294967296) | 0
const Z_LO = Int32Array.from({ length: 16 * 64 }, casuale)
const Z_HI = Int32Array.from({ length: 16 * 64 }, casuale)
const Z_ARROCCHI_LO = Int32Array.from({ length: 16 }, casuale)
const Z_ARROCCHI_HI = Int32Array.from({ length: 16 }, casuale)
const Z_EP_LO = Int32Array.from({ length: 8 }, casuale)
const Z_EP_HI = Int32Array.from({ length: 8 }, casuale)
const Z_TRATTO_LO = casuale()
const Z_TRATTO_HI = casuale()

/** Il valore dei pezzi negli scambi, in centesimi di pedone: il re non si scambia. */
export const VALORE_SCAMBIO = [0, 100, 300, 300, 500, 900, 20000, 0] as const
const GUADAGNI = new Int32Array(40)
const TOLTI = new Int8Array(40)
const PEZZI_TOLTI = new Int8Array(40)

/** Le promozioni di una mossa di pedone, dalla donna al cavallo. Nella ricerca delle sole prese basta la donna. */
function promozioni(buf: Int32Array, n: number, m: number, soloDonna: boolean): number {
  buf[n++] = m | (DONNA << 12)
  if (soloDonna) return n
  buf[n++] = m | (TORRE << 12)
  buf[n++] = m | (ALFIERE << 12)
  buf[n++] = m | (CAVALLO << 12)
  return n
}

/* ─────────────────────────────  La scacchiera  ───────────────────────────── */

/**
 * La posizione su cui si lavora: si fa una mossa, si guarda, la si disfa.
 *
 * L'interfaccia e il server usano le funzioni pubbliche qui sotto, che la
 * creano e la buttano; il computer ne tiene una per tutta la ricerca. Le mosse
 * che riceve `fai` devono venire da `genera` e aver passato `legale`: la
 * scacchiera non le ricontrolla.
 */
export class Scacchiera {
  /** I pezzi, casella per casella; 0 dove e' vuota. */
  readonly c = new Int8Array(64)
  /** Dove stanno i due re: il bianco, poi il nero. */
  readonly re = new Int8Array(2)
  /** Chi muove: 0 il bianco, 1 il nero. */
  tratto = 0
  arrocchi = 0
  /** La casella dietro il pedone appena spinto di due; -1 se l'ultima mossa non e' stata una spinta di due. */
  ep = -1
  /** La stessa casella, ma solo se la presa en passant e' legale: e' quella che conta per la ripetizione. */
  epChiave = -1
  semimosse = 0
  mossa = 1
  /** L'impronta di Zobrist, in due meta'. */
  lo = 0
  hi = 0
  /** Le mosse fatte e non ancora disfatte. */
  ply = 0
  /** Le impronte delle posizioni da cui sono partite le mosse fatte: la i-esima e' quella prima della mossa i. */
  readonly storiaLo: Int32Array
  readonly storiaHi: Int32Array

  private readonly sMossa: Int32Array
  private readonly sArrocchi: Uint8Array
  private readonly sEp: Int8Array
  private readonly sEpChiave: Int8Array
  private readonly sSemimosse: Int32Array

  /** `capacita` e' quante mosse si possono fare prima di disfarle: alle funzioni pubbliche ne basta una. */
  constructor(capacita = 4) {
    this.storiaLo = new Int32Array(capacita)
    this.storiaHi = new Int32Array(capacita)
    this.sMossa = new Int32Array(capacita)
    this.sArrocchi = new Uint8Array(capacita)
    this.sEp = new Int8Array(capacita)
    this.sEpChiave = new Int8Array(capacita)
    this.sSemimosse = new Int32Array(capacita)
  }

  /** La scacchiera di una posizione, che deve venire da `daFen` o da `gioca`: non la ricontrolla. */
  static da(p: Posizione, capacita?: number): Scacchiera {
    const s = new Scacchiera(capacita)
    for (let k = 0; k < 64; k += 1) {
      const pezzo = p.caselle[k]
      if (!pezzo) continue
      const q = CODICE_TIPO[pezzo.tipo] | (pezzo.colore === 'b' ? NERO : 0)
      s.c[k] = q
      if ((q & 7) === RE) s.re[q >> 3] = k
    }
    s.tratto = p.tratto === 'b' ? 1 : 0
    for (let i = 0; i < 4; i += 1) if (p.arrocchi.includes('KQkq'[i])) s.arrocchi |= 1 << i
    s.ep = p.enPassant ?? -1
    s.semimosse = p.semimosse
    s.mossa = p.mossa
    s.epChiave = s.ep >= 0 ? s.epPossibile() : -1
    s.ricalcolaImpronta()
    return s
  }

  inPosizione(): Posizione {
    const caselle = new Array<Pezzo | null>(64)
    for (let k = 0; k < 64; k += 1) caselle[k] = PEZZI[this.c[k]]
    return {
      caselle,
      tratto: this.tratto === 0 ? 'w' : 'b',
      arrocchi: testoArrocchi(this.arrocchi),
      enPassant: this.ep >= 0 ? this.ep : null,
      semimosse: this.semimosse,
      mossa: this.mossa,
    }
  }

  /** L'impronta calcolata da capo; `fai` e `disfai` la tengono aggiornata da soli. */
  ricalcolaImpronta(): void {
    let lo = Z_ARROCCHI_LO[this.arrocchi]
    let hi = Z_ARROCCHI_HI[this.arrocchi]
    for (let k = 0; k < 64; k += 1) {
      const q = this.c[k]
      if (q === 0) continue
      lo ^= Z_LO[q * 64 + k]
      hi ^= Z_HI[q * 64 + k]
    }
    if (this.tratto === 1) {
      lo ^= Z_TRATTO_LO
      hi ^= Z_TRATTO_HI
    }
    if (this.epChiave >= 0) {
      lo ^= Z_EP_LO[this.epChiave & 7]
      hi ^= Z_EP_HI[this.epChiave & 7]
    }
    this.lo = lo
    this.hi = hi
  }

  /** La casella `k` e' attaccata dai pezzi del lato `lato`? */
  attaccata(k: number, lato: number): boolean {
    const c = this.c
    const colonna = k & 7
    const colore = lato << 3
    // Un pedone bianco attacca in avanti, verso le traverse alte: lo si cerca dietro la casella.
    if (lato === 0) {
      if (colonna > 0 && k >= 9 && c[k - 9] === PEDONE) return true
      if (colonna < 7 && k >= 7 && c[k - 7] === PEDONE) return true
    } else {
      if (colonna > 0 && k <= 56 && c[k + 7] === (PEDONE | NERO)) return true
      if (colonna < 7 && k <= 54 && c[k + 9] === (PEDONE | NERO)) return true
    }
    const cavallo = CAVALLO | colore
    for (let i = CAVALLO_DA[k], fine = CAVALLO_DA[k + 1]; i < fine; i += 1) if (c[CAVALLO_A[i]] === cavallo) return true
    const re = RE | colore
    for (let i = RE_DA[k], fine = RE_DA[k + 1]; i < fine; i += 1) if (c[RE_A[i]] === re) return true
    const donna = DONNA | colore
    for (let d = 0; d < 8; d += 1) {
      const lungo = (d < 4 ? TORRE : ALFIERE) | colore
      for (let i = RAGGIO_DA[k * 8 + d], fine = RAGGIO_DA[k * 8 + d + 1]; i < fine; i += 1) {
        const q = c[RAGGIO_A[i]]
        if (q === 0) continue
        if (q === lungo || q === donna) return true
        break
      }
    }
    return false
  }

  /** Il re di chi ha il tratto e' sotto scacco? */
  sottoScacco(): boolean {
    return this.attaccata(this.re[this.tratto], this.tratto ^ 1)
  }

  /** Il pezzo che vale meno fra quelli del lato `lato` che attaccano la casella `k`: dove sta, o -1. */
  private attaccanteMinore(k: number, lato: number): number {
    const c = this.c
    const colonna = k & 7
    const colore = lato << 3
    if (lato === 0) {
      if (colonna > 0 && k >= 9 && c[k - 9] === PEDONE) return k - 9
      if (colonna < 7 && k >= 7 && c[k - 7] === PEDONE) return k - 7
    } else {
      if (colonna > 0 && k <= 56 && c[k + 7] === (PEDONE | NERO)) return k + 7
      if (colonna < 7 && k <= 54 && c[k + 9] === (PEDONE | NERO)) return k + 9
    }
    const cavallo = CAVALLO | colore
    for (let i = CAVALLO_DA[k], fine = CAVALLO_DA[k + 1]; i < fine; i += 1) {
      if (c[CAVALLO_A[i]] === cavallo) return CAVALLO_A[i]
    }
    // Il primo pezzo di ogni raggio; alfiere, torre e donna hanno i codici in ordine di valore.
    let dove = -1
    let minimo = RE
    for (let d = 0; d < 8; d += 1) {
      for (let i = RAGGIO_DA[k * 8 + d], fine = RAGGIO_DA[k * 8 + d + 1]; i < fine; i += 1) {
        const q = c[RAGGIO_A[i]]
        if (q === 0) continue
        const tipo = q & 7
        if ((q & NERO) === colore && (tipo === DONNA || tipo === (d < 4 ? TORRE : ALFIERE)) && tipo < minimo) {
          minimo = tipo
          dove = RAGGIO_A[i]
        }
        break
      }
    }
    if (dove >= 0) return dove
    const re = RE | colore
    for (let i = RE_DA[k], fine = RE_DA[k + 1]; i < fine; i += 1) if (c[RE_A[i]] === re) return RE_A[i]
    return -1
  }

  /**
   * Lo scambio sulla casella di una presa: quanto ci guadagna chi la fa, se poi
   * ognuno riprende con il pezzo che vale meno finché gli conviene. Il re
   * riprende solo dove non puo' essere ripreso. Non guarda le inchiodature ne' le
   * minacce: e' una stima, che serve a scartare senza giocarle le prese che
   * perdono materiale, come la donna che prende un pedone difeso.
   */
  scambio(m: number): number {
    const c = this.c
    const da = m & 63
    const a = (m >>> 6) & 63
    // I pezzi che hanno preso si tolgono dalla scacchiera, cosi' si scoprono quelli dietro; alla fine si rimettono.
    let tolti = 1
    TOLTI[0] = da
    PEZZI_TOLTI[0] = c[da]
    if ((m & GENERE) === EN_PASSANT) {
      TOLTI[1] = this.tratto === 0 ? a - 8 : a + 8
      PEZZI_TOLTI[1] = c[TOLTI[1]]
      c[TOLTI[1]] = 0
      tolti = 2
    }
    GUADAGNI[0] = VALORE_SCAMBIO[(m >>> 17) & 7]
    let sulCampo = VALORE_SCAMBIO[c[da] & 7]
    c[da] = 0
    let lato = this.tratto ^ 1
    let d = 0
    for (;;) {
      const k = this.attaccanteMinore(a, lato)
      if (k < 0) break
      const pezzo = c[k]
      if ((pezzo & 7) === RE) {
        c[k] = 0
        const difesa = this.attaccanteMinore(a, lato ^ 1) >= 0
        c[k] = pezzo
        if (difesa) break
      }
      d += 1
      GUADAGNI[d] = sulCampo - GUADAGNI[d - 1]
      sulCampo = VALORE_SCAMBIO[pezzo & 7]
      TOLTI[tolti] = k
      PEZZI_TOLTI[tolti] = pezzo
      tolti += 1
      c[k] = 0
      lato ^= 1
    }
    for (; d > 0; d -= 1) GUADAGNI[d - 1] = -Math.max(-GUADAGNI[d - 1], GUADAGNI[d])
    for (let i = tolti - 1; i >= 0; i -= 1) c[TOLTI[i]] = PEZZI_TOLTI[i]
    return GUADAGNI[0]
  }

  /**
   * Le mosse pseudo-legali di chi ha il tratto, in `buf` da `n` in poi: dice
   * dove finiscono. Con `soloPrese` solo le prese e le promozioni a donna, che
   * sono le mosse della ricerca di quiete.
   */
  genera(buf: Int32Array, n: number, soloPrese: boolean): number {
    const c = this.c
    const colore = this.tratto << 3
    for (let k = 0; k < 64; k += 1) {
      const q = c[k]
      if (q === 0 || (q & NERO) !== colore) continue
      const tipo = q & 7
      if (tipo === PEDONE) n = this.pedone(buf, n, k, soloPrese)
      else if (tipo === CAVALLO) n = this.salti(buf, n, k, CAVALLO_DA, CAVALLO_A, soloPrese)
      else if (tipo === ALFIERE) n = this.raggi(buf, n, k, 4, 8, soloPrese)
      else if (tipo === TORRE) n = this.raggi(buf, n, k, 0, 4, soloPrese)
      else if (tipo === DONNA) n = this.raggi(buf, n, k, 0, 8, soloPrese)
      else {
        n = this.salti(buf, n, k, RE_DA, RE_A, soloPrese)
        if (!soloPrese) n = this.arrocchiPossibili(buf, n)
      }
    }
    return n
  }

  private pedone(buf: Int32Array, n: number, k: number, soloPrese: boolean): number {
    const c = this.c
    const bianco = this.tratto === 0
    const avanti = bianco ? k + 8 : k - 8
    const promuove = bianco ? avanti >= 56 : avanti < 8
    if (c[avanti] === 0) {
      if (promuove) n = promozioni(buf, n, k | (avanti << 6), soloPrese)
      else if (!soloPrese) {
        buf[n++] = k | (avanti << 6)
        const due = bianco ? avanti + 8 : avanti - 8
        if ((bianco ? k < 16 : k >= 48) && c[due] === 0) buf[n++] = k | (due << 6) | SPINTA
      }
    }
    if ((k & 7) > 0) n = this.presaDiPedone(buf, n, k, avanti - 1, promuove, soloPrese)
    if ((k & 7) < 7) n = this.presaDiPedone(buf, n, k, avanti + 1, promuove, soloPrese)
    return n
  }

  private presaDiPedone(buf: Int32Array, n: number, k: number, t: number, promuove: boolean, soloPrese: boolean) {
    const q = this.c[t]
    const nemico = (this.tratto ^ 1) << 3
    if (q !== 0) {
      if ((q & NERO) !== nemico) return n
      const m = k | (t << 6) | (q << 17)
      if (promuove) return promozioni(buf, n, m, soloPrese)
      buf[n] = m
      return n + 1
    }
    if (t !== this.ep) return n
    buf[n] = k | (t << 6) | EN_PASSANT | ((PEDONE | nemico) << 17)
    return n + 1
  }

  private salti(buf: Int32Array, n: number, k: number, da: Int16Array, a: Int8Array, soloPrese: boolean): number {
    const c = this.c
    const colore = this.tratto << 3
    for (let i = da[k], fine = da[k + 1]; i < fine; i += 1) {
      const t = a[i]
      const q = c[t]
      if (q === 0) {
        if (!soloPrese) buf[n++] = k | (t << 6)
      } else if ((q & NERO) !== colore) buf[n++] = k | (t << 6) | (q << 17)
    }
    return n
  }

  private raggi(buf: Int32Array, n: number, k: number, primo: number, ultimo: number, soloPrese: boolean): number {
    const c = this.c
    const colore = this.tratto << 3
    for (let d = primo; d < ultimo; d += 1) {
      for (let i = RAGGIO_DA[k * 8 + d], fine = RAGGIO_DA[k * 8 + d + 1]; i < fine; i += 1) {
        const t = RAGGIO_A[i]
        const q = c[t]
        if (q === 0) {
          if (!soloPrese) buf[n++] = k | (t << 6)
          continue
        }
        if ((q & NERO) !== colore) buf[n++] = k | (t << 6) | (q << 17)
        break
      }
    }
    return n
  }

  /**
   * Gli arrocchi, con tutte le condizioni tranne l'ultima: il diritto, le
   * caselle vuote fra re e torre, il re non sotto scacco e la casella che
   * attraversa non attaccata. Che la casella d'arrivo sia sicura lo dice
   * `legale`, come per ogni mossa del re. Re e torre si guardano anche se il
   * diritto c'e': una posizione fatta a mano potrebbe dirlo senza averli.
   */
  private arrocchiPossibili(buf: Int32Array, n: number): number {
    const c = this.c
    const lato = this.tratto
    const diritti = lato === 0 ? this.arrocchi & 3 : this.arrocchi >> 2
    if (diritti === 0) return n
    const base = lato === 0 ? 0 : 56
    const re = base + 4
    const torre = TORRE | (lato << 3)
    const nemico = lato ^ 1
    if (c[re] !== (RE | (lato << 3)) || this.attaccata(re, nemico)) return n
    if (diritti & 1 && c[base + 5] === 0 && c[base + 6] === 0 && c[base + 7] === torre) {
      if (!this.attaccata(base + 5, nemico)) buf[n++] = re | ((base + 6) << 6) | ARROCCO
    }
    if (diritti & 2 && c[base + 3] === 0 && c[base + 2] === 0 && c[base + 1] === 0 && c[base] === torre) {
      if (!this.attaccata(base + 3, nemico)) buf[n++] = re | ((base + 2) << 6) | ARROCCO
    }
    return n
  }

  /**
   * Una mossa pseudo-legale lascia il re al sicuro? `scacco` dice se il re e'
   * sotto scacco adesso: chi lo sa gia' lo passa, e si risparmia di guardarlo
   * per ogni mossa.
   *
   * Se il re non e' sotto scacco e non si muove, una mossa lo espone solo se il
   * pezzo stava sulla sua linea e la lascia: allora si guarda quella linea, e
   * basta. Le mosse del re, l'en passant (che toglie due pedoni dalla stessa
   * traversa) e le risposte a uno scacco si provano davvero.
   */
  legale(m: number, scacco: boolean): boolean {
    const c = this.c
    const da = m & 63
    const a = (m >>> 6) & 63
    const lato = this.tratto
    const pezzo = c[da]
    const genere = m & GENERE
    if (!scacco && (pezzo & 7) !== RE && genere !== EN_PASSANT) {
      const re = this.re[lato]
      const d = DIREZIONE[re * 64 + da]
      if (d < 0 || DIREZIONE[re * 64 + a] === d) return true
      const nemico = (lato ^ 1) << 3
      const lungo = (d < 4 ? TORRE : ALFIERE) | nemico
      const donna = DONNA | nemico
      for (let i = RAGGIO_DA[re * 8 + d], fine = RAGGIO_DA[re * 8 + d + 1]; i < fine; i += 1) {
        const t = RAGGIO_A[i]
        if (t === da) continue
        const q = c[t]
        if (q !== 0) return q !== lungo && q !== donna
      }
      return true
    }
    const preso = c[a]
    const dovePreso = genere === EN_PASSANT ? (lato === 0 ? a - 8 : a + 8) : -1
    c[a] = pezzo
    c[da] = 0
    if (dovePreso >= 0) c[dovePreso] = 0
    const sicuro = !this.attaccata((pezzo & 7) === RE ? a : this.re[lato], lato ^ 1)
    c[da] = pezzo
    c[a] = preso
    if (dovePreso >= 0) c[dovePreso] = PEDONE | ((lato ^ 1) << 3)
    return sicuro
  }

  /** Fa una mossa di `genera` che ha passato `legale`. */
  fai(m: number): void {
    const c = this.c
    const da = m & 63
    const a = (m >>> 6) & 63
    const promozione = (m >>> 12) & 7
    const genere = m & GENERE
    const presa = (m >>> 17) & 15
    const lato = this.tratto
    const pezzo = c[da]
    const i = this.ply
    this.sMossa[i] = m
    this.sArrocchi[i] = this.arrocchi
    this.sEp[i] = this.ep
    this.sEpChiave[i] = this.epChiave
    this.sSemimosse[i] = this.semimosse
    this.storiaLo[i] = this.lo
    this.storiaHi[i] = this.hi
    this.ply = i + 1

    let lo = this.lo ^ Z_ARROCCHI_LO[this.arrocchi] ^ Z_TRATTO_LO
    let hi = this.hi ^ Z_ARROCCHI_HI[this.arrocchi] ^ Z_TRATTO_HI
    if (this.epChiave >= 0) {
      lo ^= Z_EP_LO[this.epChiave & 7]
      hi ^= Z_EP_HI[this.epChiave & 7]
    }
    if (presa !== 0) {
      const dove = genere === EN_PASSANT ? (lato === 0 ? a - 8 : a + 8) : a
      c[dove] = 0
      lo ^= Z_LO[presa * 64 + dove]
      hi ^= Z_HI[presa * 64 + dove]
    }
    const arriva = promozione !== 0 ? promozione | (lato << 3) : pezzo
    c[da] = 0
    c[a] = arriva
    lo ^= Z_LO[pezzo * 64 + da] ^ Z_LO[arriva * 64 + a]
    hi ^= Z_HI[pezzo * 64 + da] ^ Z_HI[arriva * 64 + a]
    if (genere === ARROCCO) {
      // La torre va dall'angolo alla casella che il re ha attraversato.
      const daTorre = a > da ? da + 3 : da - 4
      const aTorre = a > da ? da + 1 : da - 1
      const torre = c[daTorre]
      c[daTorre] = 0
      c[aTorre] = torre
      lo ^= Z_LO[torre * 64 + daTorre] ^ Z_LO[torre * 64 + aTorre]
      hi ^= Z_HI[torre * 64 + daTorre] ^ Z_HI[torre * 64 + aTorre]
    }
    if ((pezzo & 7) === RE) this.re[lato] = a
    this.arrocchi &= ARROCCHI_DOPO[da] & ARROCCHI_DOPO[a]
    lo ^= Z_ARROCCHI_LO[this.arrocchi]
    hi ^= Z_ARROCCHI_HI[this.arrocchi]
    this.ep = genere === SPINTA ? (da + a) >> 1 : -1
    this.semimosse = presa !== 0 || (pezzo & 7) === PEDONE ? 0 : this.semimosse + 1
    if (lato === 1) this.mossa += 1
    this.tratto = lato ^ 1
    this.epChiave = genere === SPINTA ? this.epPossibile() : -1
    if (this.epChiave >= 0) {
      lo ^= Z_EP_LO[this.epChiave & 7]
      hi ^= Z_EP_HI[this.epChiave & 7]
    }
    this.lo = lo
    this.hi = hi
  }

  /** Disfa l'ultima mossa fatta con `fai`. */
  disfai(): void {
    const i = this.ply - 1
    this.ply = i
    const m = this.sMossa[i]
    const c = this.c
    const da = m & 63
    const a = (m >>> 6) & 63
    const genere = m & GENERE
    const presa = (m >>> 17) & 15
    const lato = this.tratto ^ 1
    this.tratto = lato
    this.arrocchi = this.sArrocchi[i]
    this.ep = this.sEp[i]
    this.epChiave = this.sEpChiave[i]
    this.semimosse = this.sSemimosse[i]
    this.lo = this.storiaLo[i]
    this.hi = this.storiaHi[i]
    if (lato === 1) this.mossa -= 1
    const pezzo = (m >>> 12) & 7 ? PEDONE | (lato << 3) : c[a]
    c[da] = pezzo
    if (genere === EN_PASSANT) {
      c[a] = 0
      c[lato === 0 ? a - 8 : a + 8] = presa
    } else c[a] = presa
    if (genere === ARROCCO) {
      const daTorre = a > da ? da + 3 : da - 4
      const aTorre = a > da ? da + 1 : da - 1
      c[daTorre] = c[aTorre]
      c[aTorre] = 0
    }
    if ((pezzo & 7) === RE) this.re[lato] = da
  }

  /** Passa il tratto senza muovere: la "mossa nulla" della ricerca. Si disfa con `disfaiNulla`. */
  faiNulla(): void {
    const i = this.ply
    this.sMossa[i] = 0
    this.sArrocchi[i] = this.arrocchi
    this.sEp[i] = this.ep
    this.sEpChiave[i] = this.epChiave
    this.sSemimosse[i] = this.semimosse
    this.storiaLo[i] = this.lo
    this.storiaHi[i] = this.hi
    this.ply = i + 1
    if (this.epChiave >= 0) {
      this.lo ^= Z_EP_LO[this.epChiave & 7]
      this.hi ^= Z_EP_HI[this.epChiave & 7]
    }
    this.lo ^= Z_TRATTO_LO
    this.hi ^= Z_TRATTO_HI
    this.ep = -1
    this.epChiave = -1
    // Le posizioni di prima non si ripetono attraverso una mossa che non esiste.
    this.semimosse = 0
    this.tratto ^= 1
  }

  disfaiNulla(): void {
    const i = this.ply - 1
    this.ply = i
    this.ep = this.sEp[i]
    this.epChiave = this.sEpChiave[i]
    this.semimosse = this.sSemimosse[i]
    this.lo = this.storiaLo[i]
    this.hi = this.storiaHi[i]
    this.tratto ^= 1
  }

  /** Le mosse legali, come numeri. */
  legali(): number[] {
    const buf = new Int32Array(MOSSE_MASSIME)
    const n = this.genera(buf, 0, false)
    const scacco = this.sottoScacco()
    const legali: number[] = []
    for (let i = 0; i < n; i += 1) if (this.legale(buf[i], scacco)) legali.push(buf[i])
    return legali
  }

  /** Chi ha il tratto ha almeno una mossa? Si ferma alla prima. */
  haMosse(): boolean {
    const buf = new Int32Array(MOSSE_MASSIME)
    const n = this.genera(buf, 0, false)
    const scacco = this.sottoScacco()
    for (let i = 0; i < n; i += 1) if (this.legale(buf[i], scacco)) return true
    return false
  }

  /** La mossa legale da `da` ad `a` con quella promozione (un codice di tipo, 0 se nessuna); -1 se non c'e'. */
  trova(da: number, a: number, promozione: number): number {
    const buf = new Int32Array(MOSSE_MASSIME)
    const n = this.genera(buf, 0, false)
    for (let i = 0; i < n; i += 1) {
      const m = buf[i]
      if ((m & 63) !== da || ((m >>> 6) & 63) !== a || ((m >>> 12) & 7) !== promozione) continue
      return this.legale(m, this.sottoScacco()) ? m : -1
    }
    return -1
  }

  /**
   * Nessuno dei due puo' dare matto, con nessuna serie di mosse: re contro re,
   * un pezzo minore solo, o soli alfieri tutti sullo stesso colore di casella.
   * Re e due cavalli contro re non ci sta: il matto non si puo' forzare, ma
   * esiste, e per la FIDE la partita continua.
   */
  materialeInsufficiente(): boolean {
    let cavalli = 0
    let colori = 0
    let alfieri = 0
    for (let k = 0; k < 64; k += 1) {
      const tipo = this.c[k] & 7
      if (tipo === 0 || tipo === RE) continue
      if (tipo === CAVALLO) cavalli += 1
      else if (tipo === ALFIERE) {
        alfieri += 1
        colori |= 1 << (((k >> 3) + k) & 1)
      } else return false
    }
    return cavalli === 0 ? colori !== 3 : cavalli === 1 && alfieri === 0
  }

  /** Il primo campo del FEN: le traverse dall'ottava alla prima. */
  disposizione(): string {
    let testo = ''
    for (let t = 7; t >= 0; t -= 1) {
      let vuote = 0
      for (let colonna = 0; colonna < 8; colonna += 1) {
        const q = this.c[t * 8 + colonna]
        if (q === 0) vuote += 1
        else {
          if (vuote > 0) testo += vuote
          testo += LETTERE_FEN[q]
          vuote = 0
        }
      }
      if (vuote > 0) testo += vuote
      if (t > 0) testo += '/'
    }
    return testo
  }

  /** La chiave di ripetizione: vedi in testa al file. */
  chiave(): string {
    const ep = this.epChiave >= 0 ? nomeCasella(this.epChiave) : '-'
    return `${this.disposizione()} ${this.tratto === 0 ? 'w' : 'b'} ${testoArrocchi(this.arrocchi) || '-'} ${ep}`
  }

  /**
   * La casella en passant se chi ha il tratto puo' davvero prendere, -1 se no.
   * Si prova la presa: tolti i due pedoni dalla stessa traversa, il re potrebbe
   * restare scoperto a una torre, ed e' il caso che rende illegale una presa
   * che sembrerebbe possibile.
   */
  private epPossibile(): number {
    const c = this.c
    const ep = this.ep
    const lato = this.tratto
    const preso = lato === 0 ? ep - 8 : ep + 8
    if (preso < 0 || preso > 63 || c[preso] !== (PEDONE | ((lato ^ 1) << 3)) || c[ep] !== 0) return -1
    const mio = PEDONE | (lato << 3)
    if ((ep & 7) > 0 && c[preso - 1] === mio && this.presaEpSicura(preso - 1, ep, preso)) return ep
    if ((ep & 7) < 7 && c[preso + 1] === mio && this.presaEpSicura(preso + 1, ep, preso)) return ep
    return -1
  }

  private presaEpSicura(da: number, ep: number, preso: number): boolean {
    const c = this.c
    const pedone = c[da]
    const altro = c[preso]
    c[da] = 0
    c[preso] = 0
    c[ep] = pedone
    const sicura = !this.attaccata(this.re[this.tratto], this.tratto ^ 1)
    c[ep] = 0
    c[preso] = altro
    c[da] = pedone
    return sicura
  }
}

/** La mossa pubblica di una mossa interna, con i campi che servono a chi la mostra. */
export function mossaPubblica(m: number): Mossa {
  const mossa: { -readonly [K in keyof Mossa]: Mossa[K] } = { da: m & 63, a: (m >>> 6) & 63 }
  const promozione = (m >>> 12) & 7
  if (promozione !== 0) mossa.promozione = PROMOZIONI[promozione]
  const presa = (m >>> 17) & 15
  if (presa !== 0) mossa.presa = TIPI[presa & 7]
  const genere = m & GENERE
  if (genere === ARROCCO) mossa.arrocco = (mossa.a & 7) === 6 ? 'corto' : 'lungo'
  else if (genere === EN_PASSANT) mossa.enPassant = true
  return mossa
}

/* ─────────────────────────────  Il FEN  ───────────────────────────── */

export function posizioneIniziale(): Posizione {
  return daFen(FEN_INIZIALE)!
}

/**
 * La posizione di un FEN, o null se non ne descrive una possibile.
 *
 * Oltre alla forma — otto traverse di otto caselle, pezzi noti, tratto, arrocchi,
 * en passant, contatori — si controlla quel che renderebbe la posizione
 * impossibile da raggiungere o da giocare: un re per parte, al massimo sedici
 * pezzi e otto pedoni per parte, nessun pedone sulla prima o sull'ultima
 * traversa, i diritti d'arrocco con il re e la torre al loro posto, la casella
 * en passant dietro un pedone appena arrivato, e chi non ha il tratto che non e'
 * sotto scacco. Si accettano anche i soli primi quattro campi, che sono la
 * chiave di ripetizione: i contatori valgono allora 0 e 1.
 */
export function daFen(fen: string): Posizione | null {
  if (typeof fen !== 'string') return null
  const campi = fen.trim().split(/\s+/)
  if (campi.length !== 4 && campi.length !== 6) return null
  const [disposizione, tratto, arrocchi, ep] = campi
  const semimosse = campi[4] ?? '0'
  const mossa = campi[5] ?? '1'

  const traverse = disposizione.split('/')
  if (traverse.length !== 8) return null
  const s = new Scacchiera()
  const pezzi = [0, 0]
  const pedoni = [0, 0]
  const re = [0, 0]
  for (let i = 0; i < 8; i += 1) {
    let colonna = 0
    let cifra = false
    for (const lettera of traverse[i]) {
      if (lettera >= '1' && lettera <= '8') {
        // "44" farebbe otto caselle, ma nessun FEN scrive cosi' una traversa vuota.
        if (cifra) return null
        cifra = true
        colonna += Number(lettera)
        continue
      }
      const q = CODICE_FEN.get(lettera)
      if (q === undefined || colonna > 7) return null
      const k = (7 - i) * 8 + colonna
      const lato = q >> 3
      s.c[k] = q
      pezzi[lato] += 1
      if ((q & 7) === PEDONE) {
        if (i === 0 || i === 7) return null
        pedoni[lato] += 1
      } else if ((q & 7) === RE) {
        re[lato] += 1
        s.re[lato] = k
      }
      colonna += 1
      cifra = false
    }
    if (colonna !== 8) return null
  }
  if (re[0] !== 1 || re[1] !== 1 || pezzi[0] > 16 || pezzi[1] > 16 || pedoni[0] > 8 || pedoni[1] > 8) return null

  if (tratto !== 'w' && tratto !== 'b') return null
  s.tratto = tratto === 'w' ? 0 : 1

  if (arrocchi !== '-') {
    if (!/^K?Q?k?q?$/.test(arrocchi)) return null
    for (let i = 0; i < 4; i += 1) if (arrocchi.includes('KQkq'[i])) s.arrocchi |= 1 << i
  }
  const reBianco = s.c[4] === RE
  const reNero = s.c[60] === (RE | NERO)
  if (
    (s.arrocchi & 1 && !(reBianco && s.c[7] === TORRE)) ||
    (s.arrocchi & 2 && !(reBianco && s.c[0] === TORRE)) ||
    (s.arrocchi & 4 && !(reNero && s.c[63] === (TORRE | NERO))) ||
    (s.arrocchi & 8 && !(reNero && s.c[56] === (TORRE | NERO)))
  ) {
    return null
  }

  if (ep !== '-') {
    const k = casellaDa(ep)
    if (k === null) return null
    // Se muove il bianco, il nero ha appena spinto: la casella e' sulla sesta, con il pedone davanti.
    const bianco = s.tratto === 0
    const pedone = bianco ? k - 8 : k + 8
    const partenza = bianco ? k + 8 : k - 8
    if (k >> 3 !== (bianco ? 5 : 2)) return null
    if (s.c[pedone] !== (PEDONE | (bianco ? NERO : 0)) || s.c[k] !== 0 || s.c[partenza] !== 0) return null
    s.ep = k
  }

  if (!/^\d{1,9}$/.test(semimosse) || !/^\d{1,9}$/.test(mossa) || Number(mossa) < 1) return null
  s.semimosse = Number(semimosse)
  s.mossa = Number(mossa)

  // Chi non ha il tratto sotto scacco vorrebbe dire che l'ultima mossa ha lasciato il re attaccato.
  if (s.attaccata(s.re[s.tratto ^ 1], s.tratto)) return null
  return s.inPosizione()
}

/** Il FEN di una posizione, con tutti e sei i campi. */
export function inFen(p: Posizione): string {
  const ep = p.enPassant === null ? '-' : nomeCasella(p.enPassant)
  return `${Scacchiera.da(p).disposizione()} ${p.tratto} ${p.arrocchi || '-'} ${ep} ${p.semimosse} ${p.mossa}`
}

/* ─────────────────────────────  Le mosse  ───────────────────────────── */

/** Solo le mosse legali: nessuna lascia il proprio re sotto scacco. */
export function mosseLegali(p: Posizione): Mossa[] {
  return Scacchiera.da(p).legali().map(mossaPubblica)
}

/** La mossa nella notazione dei programmi: 'e2e4', 'e7e8q', l'arrocco come mossa del re, 'e1g1'. */
export function uci(m: Mossa): string {
  return nomeCasella(m.da) + nomeCasella(m.a) + (m.promozione ?? '')
}

const UCI = /^([a-h][1-8])([a-h][1-8])([qrbn]?)$/

/** La mossa legale scritta cosi', o null: una promozione senza il pezzo non e' una mossa. */
export function mossaDaUci(p: Posizione, testo: string): Mossa | null {
  const parti = typeof testo === 'string' ? UCI.exec(testo) : null
  if (!parti) return null
  const m = Scacchiera.da(p).trova(casellaDa(parti[1])!, casellaDa(parti[2])!, parti[3] ? CODICE_TIPO[parti[3]] : 0)
  return m < 0 ? null : mossaPubblica(m)
}

/**
 * La posizione dopo la mossa, che dev'essere legale: se non lo e' solleva un
 * errore, perché giocarla lo stesso produrrebbe una partita impossibile.
 */
export function gioca(p: Posizione, m: Mossa): Posizione {
  const s = Scacchiera.da(p, 1)
  const interna = s.trova(m.da, m.a, m.promozione ? (CODICE_TIPO[m.promozione] ?? -1) : 0)
  if (interna < 0) throw new Error(`Mossa non legale: ${JSON.stringify(m)}`)
  s.fai(interna)
  return s.inPosizione()
}

/** Il re di chi ha il tratto e' attaccato. */
export function sottoScacco(p: Posizione): boolean {
  return Scacchiera.da(p).sottoScacco()
}

/* ─────────────────────────────  La fine della partita  ───────────────────────────── */

export function chiaveRipetizione(p: Posizione): string {
  return Scacchiera.da(p).chiave()
}

/**
 * Se la partita e' finita, come; null se si continua.
 *
 * `chiaviPrecedenti` sono le chiavi di tutte le posizioni prima di questa,
 * quella iniziale compresa. L'ordine dei controlli conta: se l'ultima mossa da'
 * matto vale il matto, anche quando e' la centesima semimossa senza prese o
 * completa una ripetizione.
 */
export function esito(
  p: Posizione,
  chiaviPrecedenti: readonly string[],
): { fine: Fine; vincitore: Colore | null } | null {
  const s = Scacchiera.da(p)
  if (!s.haMosse()) {
    if (s.sottoScacco()) return { fine: 'matto', vincitore: p.tratto === 'w' ? 'b' : 'w' }
    return { fine: 'stallo', vincitore: null }
  }
  if (s.materialeInsufficiente()) return { fine: 'materiale', vincitore: null }
  const chiave = s.chiave()
  let volte = 1
  for (const precedente of chiaviPrecedenti) {
    if (precedente === chiave && ++volte >= 3) return { fine: 'ripetizione', vincitore: null }
  }
  if (s.semimosse >= 100) return { fine: 'cinquanta', vincitore: null }
  return null
}

/* ─────────────────────────────  La notazione  ───────────────────────────── */

/**
 * La mossa in notazione algebrica, con le iniziali italiane, dalla posizione
 * prima della mossa.
 *
 * Se due pezzi uguali possono andare sulla stessa casella si aggiunge la
 * colonna di partenza; se sono sulla stessa colonna, la traversa; se non basta
 * nemmeno quella, tutte e due. Contano solo le mosse legali: un cavallo
 * inchiodato non rende ambigua la mossa dell'altro.
 */
export function notazione(p: Posizione, m: Mossa): string {
  const s = Scacchiera.da(p, 1)
  const legali = s.legali()
  const promozione = m.promozione ? (CODICE_TIPO[m.promozione] ?? -1) : 0
  const x = legali.find((y) => (y & 63) === m.da && ((y >>> 6) & 63) === m.a && ((y >>> 12) & 7) === promozione)
  if (x === undefined) throw new Error(`Mossa non legale: ${JSON.stringify(m)}`)
  const da = x & 63
  const a = (x >>> 6) & 63
  const tipo = s.c[da] & 7
  const presa = (x >>> 17) & 15
  let testo: string
  if ((x & GENERE) === ARROCCO) testo = a > da ? 'O-O' : 'O-O-O'
  else if (tipo === PEDONE) {
    testo = (presa ? `${COLONNE[da & 7]}x` : '') + nomeCasella(a)
    if (promozione) testo += `=${INIZIALI[promozione]}`
  } else {
    let altri = false
    let stessaColonna = false
    let stessaTraversa = false
    for (const y of legali) {
      const dy = y & 63
      if (((y >>> 6) & 63) !== a || dy === da || (s.c[dy] & 7) !== tipo) continue
      altri = true
      if ((dy & 7) === (da & 7)) stessaColonna = true
      if (dy >> 3 === da >> 3) stessaTraversa = true
    }
    testo = INIZIALI[tipo]
    if (altri) testo += !stessaColonna ? COLONNE[da & 7] : !stessaTraversa ? String((da >> 3) + 1) : nomeCasella(da)
    testo += (presa ? 'x' : '') + nomeCasella(a)
  }
  s.fai(x)
  if (s.sottoScacco()) testo += s.haMosse() ? '+' : '#'
  return testo
}

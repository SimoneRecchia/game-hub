/**
 * Il computer della dama italiana: una ricerca alfa-beta sulle regole di
 * shared/dama.ts.
 *
 * Le mosse che il computer puo' giocare le decide sempre shared/dama.ts: quelle
 * della radice sono le `mosseLegali` della posizione, e la mossa restituita e'
 * una di loro. Per guardare avanti serve pero' un generatore molto piu' veloce,
 * e il computer ne ha uno suo: le 32 caselle scure stanno nei 32 bit di un
 * intero — il bit k per la casella k + 1 — con un intero per i pezzi bianchi,
 * uno per i neri e uno per le dame. Una posizione sono tre numeri, una mossa li
 * cambia con qualche operazione sui bit, e la ricerca se li passa da un livello
 * all'altro invece di disfare le mosse. Il generatore applica le stesse regole,
 * precedenze comprese, e un test lo confronta con quello di shared/dama.ts
 * contando le posizioni a qualche mossa di distanza (`perft`).
 *
 * La ricerca e' quella classica dei programmi di dama e di scacchi:
 *
 *  - negamax con potatura alfa-beta e finestra nulla (PVS), ad approfondimento
 *    iterativo: prima a una semimossa, poi a due, e così via finché c'e' tempo;
 *  - una tabella delle trasposizioni (chiavi di Zobrist), le mosse killer e la
 *    storia delle mosse, per provare prima quelle che hanno gia' funzionato;
 *  - le prese allungano la ricerca: finché chi ha il tratto deve prendere si
 *    va avanti, e siccome la presa e' obbligatoria non c'e' lo "stare fermi"
 *    degli scacchi. Senza, il computer si fermerebbe a meta' di uno scambio e
 *    conterebbe un pezzo di vantaggio che sta per restituire. Anche una mossa
 *    obbligata, l'unica legale, non consuma profondita';
 *  - una posizione si valuta solo quando e' tranquilla: se e' l'avversario a
 *    minacciare una presa si guarda ancora una semimossa, per vedere se la
 *    minaccia si para (al massimo `estensioni` volte per ramo, per non
 *    esplodere). Nelle partite fra computer non sposta il risultato — 53 per
 *    cento con, al normale, in 40 partite — ma costa poco, e toglie il caso di
 *    un pezzo in presa valutato come se niente fosse.
 *
 * Le riduzioni delle mosse tardive (LMR) dei programmi di scacchi, provate,
 * arrivano una o due semimosse piu' in fondo ma giocano peggio: 40 per cento
 * contro la ricerca piena a parita' di tempo, in 24 partite. Nella dama le mosse
 * che riducono sono spesso proprio i sacrifici che preparano un colpo.
 *
 * La valutazione e' in centesimi di pedina, dal punto di vista di chi muove:
 *
 *  - il materiale: la pedina 100, la dama 250. Una dama vale piu' di due pedine
 *    perché nella dama italiana la pedina non la puo' prendere, e contro le sole
 *    pedine una dama non si perde mai; ma non ne vale tre, perché non vola e
 *    muove di una casella come loro (una dama da 300 ha fatto il 52 per cento in
 *    64 partite: nessuna differenza). Chi e' in vantaggio guadagna qualcosa a
 *    ogni scambio: meno pezzi restano, piu' il vantaggio pesa;
 *  - l'avanzamento delle pedine, poco a inizio partita e molto nel finale,
 *    quando una pedina che corre verso la base avversaria e' una dama in arrivo;
 *  - il centro: le quattro caselle centrali, 14, 15, 18 e 19, e il loro giro;
 *  - la difesa della base: le pedine rimaste sulla prima fila chiudono la strada
 *    alle pedine avversarie che vanno a dama, soprattutto la 30 e la 31, nel
 *    mezzo (la 3 e la 2 per il Nero). Conta finché i pezzi sono tanti;
 *  - le dame al centro, dove tengono quattro diagonali, e non sui bordi;
 *  - la mobilita': quante mosse ha ciascuno. Chi resta senza mosse perde.
 *
 * Patte. La ripetizione e le quaranta mosse sono patte anche nella ricerca, con
 * `storia`: le chiavi delle posizioni gia' giocate, come per `esito`. Per il
 * computer una patta vale un po' meno di zero (il "disprezzo", `DISPREZZO`):
 * in vantaggio o in parita' evita le ripetizioni e cerca di vincere, sotto di
 * piu' del disprezzo le cerca, perché una patta e' meglio di una sconfitta. Una
 * posizione gia' vista durante la ricerca e' patta alla seconda volta, una della
 * partita alla terza, come fa Stockfish: ripetere e' una scelta, e chi l'ha
 * fatta una volta la puo' rifare.
 *
 * I livelli, per giocatori da bar:
 *
 *  - **facile** guarda una mossa e la risposta, piu' le prese che ne seguono, e
 *    sceglie a caso fra le mosse che valgono quasi quanto la migliore. Una volta
 *    su tre si distrae, e la scelta si allarga a mosse che regalano una pedina:
 *    chi ha appena imparato lo batte, se si accorge dei regali. Risponde subito;
 *  - **normale** guarda sei semimosse avanti, con tutte le estensioni, e sceglie
 *    fra le mosse migliori con uno scarto di pochi punti, perché le partite non
 *    siano tutte uguali. Non regala pezzi e vede i colpi semplici; su un
 *    telefono resta sotto il mezzo secondo, e un limite di tempo lo garantisce;
 *  - **difficile** approfondisce finché ha tempo, un secondo e mezzo, e gioca la
 *    migliore che ha trovato. Non comincia una profondita' nuova dopo meta' del
 *    tempo, perché non la finirebbe.
 *
 * Misurati in Node su un portatile (un telefono e' da due a cinque volte piu'
 * lento): il facile risponde in qualche decimo di millisecondo; il normale in
 * pochi millisecondi, una quarantina al massimo nelle posizioni d'apertura, che
 * sono le piu' care; il difficile guarda due o tre milioni di posizioni al
 * secondo e arriva a 10-16 semimosse, prese escluse. Nei finali di sole dame in
 * vantaggio, tre contro una o due contro una, vede la vittoria a venti o trenta
 * semimosse e la porta a casa prima delle quaranta mosse. Fra loro, a colori
 * alterni: il normale ha battuto il facile 20 volte su 20, e il difficile, con un
 * decimo del suo tempo, il normale 15 su 16, con una patta. Contro un
 * principiante che muove a caso ma non lascia pezzi in presa e prende quel che
 * trova, il facile fa il 60 per cento: 12 vinte, 6 perse e 12 patte su 30.
 *
 * Con lo stesso generatore di numeri a caso e senza toccare il limite di tempo
 * il computer e' deterministico: la stessa posizione, la stessa mossa. Il tempo
 * del difficile lo rende dipendente dalla velocita' del telefono.
 */

import { mulberry32 } from './daily'
import {
  CASELLE,
  LIMITE_SENZA_PROGRESSO,
  casellaDi,
  mosseLegali,
  posizioneDaChiave,
  rigaColonna,
  type Mossa,
  type Posizione,
} from './dama'

export type LivelloDama = 'facile' | 'normale' | 'difficile'

export const LIVELLI_DAMA: readonly LivelloDama[] = ['facile', 'normale', 'difficile']

/** Limiti per una ricerca, al posto di quelli del livello: servono ai test, e a chi vuole un computer piu' svelto. */
export interface LimitiRicerca {
  /** Il tempo massimo per la mossa, in millisecondi. */
  tempoMs?: number
  /** La profondita' massima, in semimosse. */
  profondita?: number
}

interface Regole {
  /** Fin dove approfondisce, in semimosse. */
  profondita: number
  /** Il tempo massimo per la mossa, in millisecondi. */
  tempoMs: number
  /** Si sceglie a caso fra le mosse che valgono fino a tanto meno della migliore. */
  margine: number
  /** La probabilita' di una svista, e il margine della scelta quando capita. */
  svista: number
  margineSvista: number
  /** Quante volte per ramo si guarda oltre la profondita' per una presa minacciata. */
  estensioni: number
  /** La tabella delle trasposizioni ha 2^tabella righe. */
  tabella: number
}

const REGOLE: Record<LivelloDama, Regole> = {
  facile: { profondita: 2, tempoMs: 100, margine: 30, svista: 1 / 3, margineSvista: 150, estensioni: 0, tabella: 12 },
  normale: { profondita: 6, tempoMs: 400, margine: 8, svista: 0, margineSvista: 0, estensioni: 2, tabella: 16 },
  difficile: { profondita: 64, tempoMs: 1500, margine: 0, svista: 0, margineSvista: 0, estensioni: 2, tabella: 19 },
}

/* ─────────────────────────────  La damiera in bit  ───────────────────────────── */

/*
 * Le righe pari (0, 2, 4, 6) hanno le caselle scure nelle colonne pari, le
 * dispari nelle dispari: andare in alto a sinistra e' togliere cinque da una
 * riga pari e quattro da una dispari, e così via. Con le maschere delle righe si
 * spostano tutti i pezzi di un intero nello stesso colpo; i bordi (la colonna 0
 * sta solo nelle righe pari, la 7 solo nelle dispari) si tolgono prima, e la
 * prima e l'ultima riga escono da sole dai 32 bit.
 */
const PARI = 0x0f0f0f0f
const DISPARI = 0xf0f0f0f0 | 0
const PARI_SENZA_BORDO = 0x0e0e0e0e
const DISPARI_SENZA_BORDO = 0x70707070

const suSinistra = (x: number) => ((x & PARI_SENZA_BORDO) >>> 5) | ((x & DISPARI) >>> 4)
const suDestra = (x: number) => ((x & PARI) >>> 4) | ((x & DISPARI_SENZA_BORDO) >>> 3)
const giuSinistra = (x: number) => ((x & PARI_SENZA_BORDO) << 3) | ((x & DISPARI) << 4)
const giuDestra = (x: number) => ((x & PARI) << 4) | ((x & DISPARI_SENZA_BORDO) << 5)

/** Quanti bit ha un intero. */
function conta(x: number): number {
  x -= (x >>> 1) & 0x55555555
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333)
  return Math.imul((x + (x >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24
}

/** Le direzioni come in shared/dama.ts: 0 e 1 in alto (il Bianco), 2 e 3 in basso (il Nero). */
const VICINA = new Int8Array(CASELLE * 4).fill(-1)
const OLTRE = new Int8Array(CASELLE * 4).fill(-1)
for (let k = 0; k < CASELLE; k += 1) {
  const { riga, colonna } = rigaColonna(k + 1)
  ;[
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ].forEach(([dr, dc], d) => {
    const vicina = casellaDi(riga + dr, colonna + dc)
    const oltre = casellaDi(riga + 2 * dr, colonna + 2 * dc)
    if (vicina !== null) VICINA[k * 4 + d] = vicina - 1
    if (vicina !== null && oltre !== null) OLTRE[k * 4 + d] = oltre - 1
  })
}

/** Il Bianco diventa dama sulle caselle 1-4 (bit 0-3), il Nero sulle 29-32 (bit 28-31). */
const promuove = (bianco: boolean, a: number) => (bianco ? a < 4 : a >= 28)

interface Bit {
  bianchi: number
  neri: number
  dame: number
  bianco: boolean
}

function inBit(p: Posizione): Bit {
  let bianchi = 0
  let neri = 0
  let dame = 0
  for (let k = 0; k < CASELLE; k += 1) {
    const pezzo = p.caselle[k]
    if (!pezzo) continue
    if (pezzo.colore === 'bianco') bianchi |= 1 << k
    else neri |= 1 << k
    if (pezzo.dama) dame |= 1 << k
  }
  return { bianchi, neri, dame, bianco: p.tratto === 'bianco' }
}

/* ─────────────────────────────  Le chiavi di Zobrist  ───────────────────────────── */

/*
 * Due chiavi a 32 bit per posizione: la prima sceglie la riga della tabella, la
 * seconda la conferma. Ci sono quattro tipi di pezzo — pedina e dama bianca,
 * pedina e dama nera, in quest'ordine — e due chiavi in piu': il Nero al tratto,
 * e il computer che gioca col Nero, perché il disprezzo per la patta dipende da
 * chi e' il computer e una riga scritta per l'uno non deve servire all'altro.
 */
const Z1 = new Int32Array(4 * CASELLE)
const Z2 = new Int32Array(4 * CASELLE)
const casoZobrist = mulberry32(0x0da3_a17a)
const intero = () => (casoZobrist() * 0x1_0000_0000) | 0
for (let i = 0; i < Z1.length; i += 1) {
  Z1[i] = intero()
  Z2[i] = intero()
}
const NERO1 = intero()
const NERO2 = intero()
const MOTORE_NERO1 = intero()
const MOTORE_NERO2 = intero()

function chiavi(b: Bit, motoreBianco: boolean): [number, number] {
  let h1 = (b.bianco ? 0 : NERO1) ^ (motoreBianco ? 0 : MOTORE_NERO1)
  let h2 = (b.bianco ? 0 : NERO2) ^ (motoreBianco ? 0 : MOTORE_NERO2)
  for (let r = b.bianchi | b.neri; r !== 0; r &= r - 1) {
    const k = 31 - Math.clz32(r & -r)
    const tipo = (b.bianchi & (1 << k) ? 0 : 2) + (b.dame & (1 << k) ? 1 : 0)
    h1 ^= Z1[tipo * 32 + k]
    h2 ^= Z2[tipo * 32 + k]
  }
  return [h1, h2]
}

/* ─────────────────────────────  Le mosse  ───────────────────────────── */

/**
 * Le mosse di tutti i livelli della ricerca stanno in una pila sola: quelle
 * della semimossa `ply` cominciano a `inizio[ply]`. Di ogni mossa servono solo
 * partenza, arrivo e pezzi presi: due prese con gli stessi tre, in un ordine
 * diverso, portano nella stessa posizione e per la ricerca sono una.
 */
const PILA = 1 << 15
const MAX_PLY = 128
const DA = new Int8Array(PILA)
const A = new Int8Array(PILA)
const PRESI = new Int32Array(PILA)
const VOTO = new Int32Array(PILA)
const inizio = new Int32Array(MAX_PLY + 1)

/**
 * I pezzi di chi ha il tratto che possono cominciare una presa, con gli
 * spostamenti dei bit e senza cercare le sequenze. Si parte dalle caselle
 * libere e si torna indietro di due passi: per prendere verso l'alto a sinistra
 * serve un pezzo avversario in basso a destra di una casella libera, e il pezzo
 * che prende ancora in basso a destra.
 */
function chiPrende(mio: number, suo: number, dame: number, bianco: boolean): number {
  const vuote = ~(mio | suo)
  const pedine = mio & ~dame
  const pedineSue = suo & ~dame
  let da = bianco
    ? (giuDestra(giuDestra(vuote) & pedineSue) | giuSinistra(giuSinistra(vuote) & pedineSue)) & pedine
    : (suDestra(suDestra(vuote) & pedineSue) | suSinistra(suSinistra(vuote) & pedineSue)) & pedine
  const re = mio & dame
  if (re !== 0) {
    da |= (giuDestra(giuDestra(vuote) & suo) | giuSinistra(giuSinistra(vuote) & suo)) & re
    da |= (suDestra(suDestra(vuote) & suo) | suSinistra(suSinistra(vuote) & suo)) & re
  }
  return da
}

/** Chi ha il tratto deve prendere? */
const haPrese = (mio: number, suo: number, dame: number, bianco: boolean) => chiPrende(mio, suo, dame, bianco) !== 0

/** Quante mosse senza presa ha chi ha il tratto. */
function mobilita(mio: number, suo: number, dame: number, bianco: boolean): number {
  const vuote = ~(mio | suo)
  const pedine = mio & ~dame
  let n = bianco
    ? conta(suSinistra(pedine) & vuote) + conta(suDestra(pedine) & vuote)
    : conta(giuSinistra(pedine) & vuote) + conta(giuDestra(pedine) & vuote)
  const re = mio & dame
  if (re !== 0) {
    n += conta(suSinistra(re) & vuote) + conta(suDestra(re) & vuote)
    n += conta(giuSinistra(re) & vuote) + conta(giuDestra(re) & vuote)
  }
  return n
}

function generaMosse(mio: number, suo: number, dame: number, bianco: boolean, base: number): number {
  const vuote = ~(mio | suo)
  let n = base
  for (let r = mio; r !== 0; r &= r - 1) {
    const b = r & -r
    const k = 31 - Math.clz32(b)
    const dama = (dame & b) !== 0
    const d0 = dama || bianco ? 0 : 2
    const d1 = dama || !bianco ? 4 : 2
    for (let d = d0; d < d1; d += 1) {
      const v = VICINA[k * 4 + d]
      if (v >= 0 && vuote & (1 << v) && n < PILA) {
        DA[n] = k
        A[n] = v
        PRESI[n] = 0
        n += 1
      }
    }
  }
  return n - base
}

/*
 * Le prese, con le precedenze dell'art. 6 della FID in un numero solo: il
 * numero di pezzi presi, poi se prende una dama, poi quante dame prende, poi
 * l'ordine in cui le incontra — un bit per pezzo preso, dal primo al dodicesimo,
 * acceso se era una dama. Il numero piu' alto vince, e a parita' si sceglie:
 * sono le stesse regole di `precedenza` in shared/dama.ts, messe in fila nei bit.
 */
let sSuo = 0
let sDame = 0
let sVuote = 0
let sDa = 0
let sDama = false
let sBianco = true
let sPeso = -1
let sBase = 0
let sQuante = 0

function registra(a: number, presi: number, quante: number, dame: number, ordine: number): void {
  const peso = (quante << 17) | (sDama ? 1 << 16 : 0) | (dame << 12) | ordine
  if (peso < sPeso) return
  if (peso > sPeso) {
    sPeso = peso
    sQuante = 0
  }
  const fine = sBase + sQuante
  for (let j = sBase; j < fine; j += 1) if (DA[j] === sDa && A[j] === a && PRESI[j] === presi) return
  if (fine >= PILA) return
  DA[fine] = sDa
  A[fine] = a
  PRESI[fine] = presi
  sQuante += 1
}

function salta(k: number, presi: number, quante: number, dame: number, ordine: number): void {
  let prosegue = false
  const d0 = sDama || sBianco ? 0 : 2
  const d1 = sDama || !sBianco ? 4 : 2
  for (let d = d0; d < d1; d += 1) {
    const oltre = OLTRE[k * 4 + d]
    if (oltre < 0) continue
    const b = 1 << VICINA[k * 4 + d]
    if ((sSuo & b) === 0 || (presi & b) !== 0) continue
    const dama = (sDame & b) !== 0
    if (dama && !sDama) continue
    if ((sVuote & (1 << oltre)) === 0) continue
    prosegue = true
    salta(oltre, presi | b, quante + 1, dama ? dame + 1 : dame, dama ? ordine | (1 << (11 - quante)) : ordine)
  }
  if (!prosegue && quante > 0) registra(k, presi, quante, dame, ordine)
}

/** Le prese dei pezzi in `chi` (quelli di `chiPrende`), nella pila da `base`. */
function generaPrese(mio: number, suo: number, dame: number, bianco: boolean, chi: number, base: number): number {
  sSuo = suo
  sDame = dame
  sBianco = bianco
  sPeso = -1
  sBase = base
  sQuante = 0
  const vuote = ~(mio | suo)
  for (let r = chi; r !== 0; r &= r - 1) {
    const b = r & -r
    sDa = 31 - Math.clz32(b)
    sDama = (dame & b) !== 0
    // La casella di partenza si libera: una dama che gira attorno ci puo' ripassare.
    sVuote = vuote | b
    salta(sDa, 0, 0, 0, 0)
  }
  return sQuante
}

/** Le mosse di chi ha il tratto, nella pila da `base`: le prese se ce ne sono, se no gli spostamenti. */
function genera(mio: number, suo: number, dame: number, bianco: boolean, base: number): number {
  const chi = chiPrende(mio, suo, dame, bianco)
  return chi !== 0
    ? generaPrese(mio, suo, dame, bianco, chi, base)
    : generaMosse(mio, suo, dame, bianco, base)
}

/*
 * Una mossa, sulla posizione e sulle chiavi. Il risultato va nelle variabili
 * `f*`, che chi chiama copia subito: la ricerca le riscrive al livello dopo.
 */
let fBianchi = 0
let fNeri = 0
let fDame = 0
let fContatore = 0
let fH1 = 0
let fH2 = 0

function muovi(
  bianchi: number,
  neri: number,
  dame: number,
  bianco: boolean,
  contatore: number,
  h1: number,
  h2: number,
  da: number,
  a: number,
  presi: number,
): void {
  const bDa = 1 << da
  const bA = 1 << a
  const eraDama = (dame & bDa) !== 0
  const promossa = !eraDama && promuove(bianco, a)
  const tipo = bianco ? 0 : 2
  h1 ^= Z1[(tipo + (eraDama ? 1 : 0)) * 32 + da] ^ Z1[(tipo + (eraDama || promossa ? 1 : 0)) * 32 + a] ^ NERO1
  h2 ^= Z2[(tipo + (eraDama ? 1 : 0)) * 32 + da] ^ Z2[(tipo + (eraDama || promossa ? 1 : 0)) * 32 + a] ^ NERO2
  for (let r = presi; r !== 0; r &= r - 1) {
    const b = r & -r
    const k = 31 - Math.clz32(b)
    const suo = (bianco ? 2 : 0) + (dame & b ? 1 : 0)
    h1 ^= Z1[suo * 32 + k]
    h2 ^= Z2[suo * 32 + k]
  }
  if (bianco) {
    fBianchi = (bianchi & ~bDa) | bA
    fNeri = neri & ~presi
  } else {
    fNeri = (neri & ~bDa) | bA
    fBianchi = bianchi & ~presi
  }
  let nuove = dame & ~presi
  if (eraDama) nuove = (nuove & ~bDa) | bA
  else if (promossa) nuove |= bA
  fDame = nuove
  fContatore = presi !== 0 || !eraDama ? 0 : contatore + 1
  fH1 = h1
  fH2 = h2
}

/**
 * Quante posizioni si raggiungono in `profondita` semimosse, con il generatore
 * del computer. Due prese con la stessa partenza, lo stesso arrivo e gli stessi
 * pezzi presi contano una volta sola. Serve ai test, per confrontarlo con le
 * regole di shared/dama.ts.
 */
export function perft(p: Posizione, profondita: number): number {
  const b = inBit(p)
  inizio[0] = 0
  return foglie(b.bianchi, b.neri, b.dame, b.bianco, profondita, 0)
}

function foglie(bianchi: number, neri: number, dame: number, bianco: boolean, prof: number, ply: number): number {
  if (prof === 0) return 1
  const base = inizio[ply]
  const n = genera(bianco ? bianchi : neri, bianco ? neri : bianchi, dame, bianco, base)
  if (prof === 1) return n
  inizio[ply + 1] = base + n
  let totale = 0
  for (let j = base; j < base + n; j += 1) {
    muovi(bianchi, neri, dame, bianco, 0, 0, 0, DA[j], A[j], PRESI[j])
    totale += foglie(fBianchi, fNeri, fDame, !bianco, prof - 1, ply + 1)
  }
  return totale
}

/* ─────────────────────────────  La valutazione  ───────────────────────────── */

const PEDINA = 100
const DAMA = 250
const MOBILITA = 2

/*
 * I valori di posizione, per le caselle viste dal Bianco (il Nero legge la
 * casella simmetrica, 31 - k): per le pedine uno a inizio partita e uno per il
 * finale, e fra i due si scorre con il numero di pezzi rimasti.
 */
const PEDINA_INIZIO = new Int16Array(CASELLE)
const PEDINA_FINALE = new Int16Array(CASELLE)
const DAMA_POSTO = new Int16Array(CASELLE)
{
  // Quanto vale una pedina per ogni traversa avanzata dalla propria base.
  const avanzataInizio = [0, 1, 2, 3, 5, 7, 10, 0]
  const avanzataFinale = [0, 4, 8, 13, 19, 26, 34, 0]
  // La base, per colonna: la 30 e la 31, nel mezzo, sono le piu' preziose; la 29 un po' meno, e la 32, il
  // cantone, ancora meno, perché ci si arriva da una casella sola.
  const difesa = [0, 4, 0, 7, 0, 7, 0, 2]
  for (let k = 0; k < CASELLE; k += 1) {
    const { riga, colonna } = rigaColonna(k + 1)
    const centro = (riga === 3 || riga === 4) && colonna >= 2 && colonna <= 5
    const giro = riga >= 2 && riga <= 5 && colonna >= 1 && colonna <= 6
    PEDINA_INIZIO[k] = avanzataInizio[7 - riga] + (centro ? 6 : giro ? 2 : 0) + (riga === 7 ? difesa[colonna] : 0)
    PEDINA_FINALE[k] = avanzataFinale[7 - riga]
    DAMA_POSTO[k] = 8 - 2 * (Math.abs(riga - 3.5) + Math.abs(colonna - 3.5) - 1)
  }
}

/** Il valore della posizione per chi ha il tratto, che ha `mieMosse` mosse. */
function valuta(bianchi: number, neri: number, dame: number, bianco: boolean, mieMosse: number): number {
  const pedineB = bianchi & ~dame
  const pedineN = neri & ~dame
  const dameB = bianchi & dame
  const dameN = neri & dame
  const pb = conta(pedineB)
  const pn = conta(pedineN)
  const db = conta(dameB)
  const dn = conta(dameN)
  const pezzi = pb + pn + db + dn
  const materiale = PEDINA * (pb - pn) + DAMA * (db - dn)

  let inizioPartita = 0
  let finale = 0
  for (let r = pedineB; r !== 0; r &= r - 1) {
    const k = 31 - Math.clz32(r & -r)
    inizioPartita += PEDINA_INIZIO[k]
    finale += PEDINA_FINALE[k]
  }
  // Per il Nero la casella simmetrica: 31 - k, che e' proprio Math.clz32 del suo bit.
  for (let r = pedineN; r !== 0; r &= r - 1) {
    const simmetrica = Math.clz32(r & -r)
    inizioPartita -= PEDINA_INIZIO[simmetrica]
    finale -= PEDINA_FINALE[simmetrica]
  }
  let posto = 0
  for (let r = dameB; r !== 0; r &= r - 1) posto += DAMA_POSTO[31 - Math.clz32(r & -r)]
  for (let r = dameN; r !== 0; r &= r - 1) posto -= DAMA_POSTO[Math.clz32(r & -r)]

  const fase = pezzi > 24 ? 24 : pezzi
  const posizione = posto + (((inizioPartita * fase + finale * (24 - fase)) / 24) | 0)
  const altreMosse = bianco ? mobilita(neri, bianchi, dame, false) : mobilita(bianchi, neri, dame, true)
  const mosse = MOBILITA * (bianco ? mieMosse - altreMosse : altreMosse - mieMosse)
  // Chi e' avanti ci guadagna a scambiare: il vantaggio pesa di piu' su meno pezzi.
  const scambi = ((materiale * (24 - fase)) / 64) | 0
  const totale = materiale + posizione + mosse + scambi
  return bianco ? totale : -totale
}

/* ─────────────────────────────  La ricerca  ───────────────────────────── */

const VITTORIA = 30000
const INFINITO = 32000
/** Quanto sotto lo zero vale una patta per il computer. */
const DISPREZZO = 50
/** Oltre questo, un punteggio e' una vittoria o una sconfitta a un certo numero di semimosse. */
const QUASI_VITTORIA = VITTORIA - MAX_PLY

const ESATTO = 1
const ALMENO = 2
const AL_PIU = 3
const NESSUNA = 0xffff

/** La tabella delle trasposizioni: si alloca alla prima ricerca che la vuole, e si svuota a ogni mossa. */
let ttChiave = new Int32Array(0)
let ttValore = new Int16Array(0)
let ttProf = new Int8Array(0)
let ttTipo = new Uint8Array(0)
let ttMossa = new Uint16Array(0)
let ttMaschera = 0

function preparaTabella(bit: number): void {
  const righe = 1 << bit
  if (ttChiave.length < righe) {
    ttChiave = new Int32Array(righe)
    ttValore = new Int16Array(righe)
    ttProf = new Int8Array(righe)
    ttTipo = new Uint8Array(righe)
    ttMossa = new Uint16Array(righe)
  } else ttTipo.fill(0, 0, righe)
  ttMaschera = righe - 1
}

/** Le vittorie nella tabella si contano da quella posizione, non dalla radice. */
const inTabella = (v: number, ply: number) => (v >= QUASI_VITTORIA ? v + ply : v <= -QUASI_VITTORIA ? v - ply : v)
const daTabella = (v: number, ply: number) => (v >= QUASI_VITTORIA ? v - ply : v <= -QUASI_VITTORIA ? v + ply : v)

const killer1 = new Int16Array(MAX_PLY)
const killer2 = new Int16Array(MAX_PLY)
const storiaMosse = new Int32Array(2 * 1024)

/** Le chiavi della partita fino alla radice, e poi quelle del ramo che si sta guardando. */
const MAX_STORIA = LIMITE_SENZA_PROGRESSO + 2
const percorso1 = new Int32Array(MAX_STORIA + MAX_PLY + 2)
const percorso2 = new Int32Array(MAX_STORIA + MAX_PLY + 2)

let radiceStoria = 0
let motoreBianco = true
let estensioniMassime = 2
let nodi = 0
let scadenza = Infinity
/**
 * Un tetto ai nodi, oltre al tempo: dieci milioni al secondo sono piu' di quanti ne faccia qualunque
 * telefono, quindi di solito ferma il tempo; il tetto serve dove l'orologio non avanza durante il
 * calcolo, come nel Worker di Cloudflare.
 */
const NODI_AL_MS = 10_000
let limiteNodi = Infinity
let fermabile = false
const FERMA = { tempo: 'scaduto' }

/** La patta, per chi ha il tratto: un po' meno di zero per il computer, un po' di piu' per l'avversario. */
const patta = (bianco: boolean) => (bianco === motoreBianco ? -DISPREZZO : DISPREZZO)

function cerca(
  bianchi: number,
  neri: number,
  dame: number,
  bianco: boolean,
  contatore: number,
  h1: number,
  h2: number,
  prof: number,
  alfa: number,
  beta: number,
  ply: number,
  estese: number,
): number {
  nodi += 1
  if (fermabile && (nodi & 1023) === 0 && (Date.now() >= scadenza || nodi >= limiteNodi)) throw FERMA

  const mio = bianco ? bianchi : neri
  const suo = bianco ? neri : bianchi
  // Le patte: le quaranta mosse, e la ripetizione. Come in `esito`, chi resta bloccato perde anche
  // all'ottantesima semimossa. Si ripete solo nelle ultime `contatore` semimosse, perché prima c'e'
  // stata una presa o una mossa di pedina, e con lo stesso tratto la posizione torna ogni due.
  if (contatore >= LIMITE_SENZA_PROGRESSO) {
    const bloccato = mobilita(mio, suo, dame, bianco) === 0 && !haPrese(mio, suo, dame, bianco)
    return bloccato ? -(VITTORIA - ply) : patta(bianco)
  }
  const qui = radiceStoria + ply
  percorso1[qui] = h1
  percorso2[qui] = h2
  if (contatore >= 4) {
    let volte = 0
    const fin = qui - contatore
    for (let j = qui - 4; j >= fin && j >= 0; j -= 2) {
      if (percorso1[j] !== h1 || percorso2[j] !== h2) continue
      if (j > radiceStoria) return patta(bianco)
      volte += 1
      if (volte >= 2) return patta(bianco)
    }
  }

  if (ply >= MAX_PLY - 1) return valuta(bianchi, neri, dame, bianco, mobilita(mio, suo, dame, bianco))

  const chi = chiPrende(mio, suo, dame, bianco)
  const prese = chi !== 0
  if (!prese && prof <= 0) {
    // Una posizione tranquilla si valuta, a meno che l'avversario minacci una presa.
    if (estese < estensioniMassime && haPrese(suo, mio, dame, !bianco)) {
      prof = 1
      estese += 1
    } else {
      const mieMosse = mobilita(mio, suo, dame, bianco)
      if (mieMosse === 0) return -(VITTORIA - ply)
      return valuta(bianchi, neri, dame, bianco, mieMosse)
    }
  }

  // La tabella prima di generare le mosse: se basta a chiudere, non servono.
  let mossaTT = NESSUNA
  const riga = h1 & ttMaschera
  if (prof > 0 && ttTipo[riga] !== 0 && ttChiave[riga] === h2) {
    mossaTT = ttMossa[riga]
    if (ttProf[riga] >= prof) {
      const v = daTabella(ttValore[riga], ply)
      const tipo = ttTipo[riga]
      if (tipo === ESATTO || (tipo === ALMENO && v >= beta) || (tipo === AL_PIU && v <= alfa)) return v
    }
  }

  const base = inizio[ply]
  const n = prese ? generaPrese(mio, suo, dame, bianco, chi, base) : generaMosse(mio, suo, dame, bianco, base)
  // Chi non puo' muovere ha perso.
  if (n === 0) return -(VITTORIA - ply)
  inizio[ply + 1] = base + n

  // L'ordine: la mossa della tabella, poi le killer, poi la storia; e le promozioni prima delle altre.
  const lato = bianco ? 0 : 1024
  for (let j = base; j < base + n; j += 1) {
    const codice = DA[j] * 32 + A[j]
    let voto = 0
    if (codice === mossaTT) voto = 1 << 30
    else if (!prese) {
      if (codice === killer1[ply]) voto = 1 << 29
      else if (codice === killer2[ply]) voto = 1 << 28
      else voto = storiaMosse[lato + codice]
      if ((dame & (1 << DA[j])) === 0 && promuove(bianco, A[j])) voto += 1 << 27
    }
    VOTO[j] = voto
  }

  // Una mossa obbligata non consuma profondita'.
  const nuova = n === 1 ? prof : prof - 1
  const alfaPrima = alfa
  let migliore = -INFINITO
  let codiceMigliore = NESSUNA
  for (let i = base; i < base + n; i += 1) {
    let scelta = i
    for (let j = i + 1; j < base + n; j += 1) if (VOTO[j] > VOTO[scelta]) scelta = j
    if (scelta !== i) {
      const da = DA[i]
      const a = A[i]
      const presi = PRESI[i]
      const voto = VOTO[i]
      DA[i] = DA[scelta]
      A[i] = A[scelta]
      PRESI[i] = PRESI[scelta]
      VOTO[i] = VOTO[scelta]
      DA[scelta] = da
      A[scelta] = a
      PRESI[scelta] = presi
      VOTO[scelta] = voto
    }
    muovi(bianchi, neri, dame, bianco, contatore, h1, h2, DA[i], A[i], PRESI[i])
    const b2 = fBianchi
    const n2 = fNeri
    const d2 = fDame
    const c2 = fContatore
    const g1 = fH1
    const g2 = fH2
    let v: number
    if (i === base) v = -cerca(b2, n2, d2, !bianco, c2, g1, g2, nuova, -beta, -alfa, ply + 1, estese)
    else {
      v = -cerca(b2, n2, d2, !bianco, c2, g1, g2, nuova, -alfa - 1, -alfa, ply + 1, estese)
      if (v > alfa && v < beta) v = -cerca(b2, n2, d2, !bianco, c2, g1, g2, nuova, -beta, -alfa, ply + 1, estese)
    }
    if (v > migliore) {
      migliore = v
      codiceMigliore = DA[i] * 32 + A[i]
      if (v > alfa) {
        alfa = v
        if (v >= beta) {
          if (!prese) {
            if (killer1[ply] !== codiceMigliore) {
              killer2[ply] = killer1[ply]
              killer1[ply] = codiceMigliore
            }
            // La storia resta sotto le killer e le promozioni, che valgono da 1 << 27 in su.
            const storia = storiaMosse[lato + codiceMigliore] + (prof > 1 ? prof * prof : 1)
            storiaMosse[lato + codiceMigliore] = storia < 1 << 26 ? storia : 1 << 26
          }
          break
        }
      }
    }
  }

  if (prof > 0 && (ttTipo[riga] === 0 || ttChiave[riga] === h2 || ttProf[riga] <= prof)) {
    ttChiave[riga] = h2
    ttValore[riga] = inTabella(migliore, ply)
    ttProf[riga] = prof
    ttMossa[riga] = codiceMigliore
    ttTipo[riga] = migliore <= alfaPrima ? AL_PIU : migliore >= beta ? ALMENO : ESATTO
  }
  return migliore
}

/* ─────────────────────────────  La scelta  ───────────────────────────── */

/** Quel che il computer ha visto. Con una mossa sola non cerca: profondita', nodi e punteggio sono zero. */
export interface Analisi {
  /** La mossa scelta, una di `mosseLegali`; null se non ce ne sono. */
  mossa: Mossa | null
  /** Quanto vale per il computer, in centesimi di pedina; vicino a ±30000 e' una vittoria o una sconfitta vista. */
  punteggio: number
  /** L'ultima profondita' cercata per intero, in semimosse. */
  profondita: number
  nodi: number
}

/**
 * La mossa del computer, con quel che ha visto per sceglierla.
 *
 * `storia` sono le chiavi (`chiaveRipetizione`) delle posizioni gia' giocate,
 * l'iniziale compresa e l'attuale esclusa, come per `esito`: servono a vedere le
 * ripetizioni. `rng` decide fra le mosse che valgono uguale, o quasi.
 */
export function analizza(
  p: Posizione,
  livello: LivelloDama,
  rng: () => number,
  storia: readonly string[] = [],
  limiti: LimitiRicerca = {},
): Analisi {
  const legali = mosseLegali(p)
  if (legali.length === 0) return { mossa: null, punteggio: -VITTORIA, profondita: 0, nodi: 0 }
  if (legali.length === 1) return { mossa: legali[0], punteggio: 0, profondita: 0, nodi: 0 }

  const regole = REGOLE[livello]
  const profondita = Math.max(1, Math.min(limiti.profondita ?? regole.profondita, MAX_PLY - 8))
  const tempoMs = limiti.tempoMs ?? regole.tempoMs
  const svista = regole.svista > 0 && rng() < regole.svista
  const margine = svista ? regole.margineSvista : regole.margine

  const radice = inBit(p)
  motoreBianco = radice.bianco
  estensioniMassime = regole.estensioni
  preparaTabella(regole.tabella)
  killer1.fill(-1)
  killer2.fill(-1)
  storiaMosse.fill(0)

  // Le posizioni della partita che si possono ripetere: solo quelle dopo l'ultima presa o mossa di pedina.
  const utili = storia.slice(Math.max(0, storia.length - Math.min(p.senzaProgresso, MAX_STORIA)))
  radiceStoria = utili.length
  utili.forEach((chiave, i) => {
    const q = posizioneDaChiave(chiave)
    const [h1, h2] = q ? chiavi(inBit(q), motoreBianco) : [0x2545_f491, 0x2545_f491]
    percorso1[i] = h1
    percorso2[i] = h2
  })
  const [h1, h2] = chiavi(radice, motoreBianco)
  percorso1[radiceStoria] = h1
  percorso2[radiceStoria] = h2

  const { bianchi, neri, dame, bianco } = radice
  const figli = legali.map((m) => {
    const da = m.percorso[0] - 1
    const a = m.percorso[m.percorso.length - 1] - 1
    const presi = m.prese.reduce((x, c) => x | (1 << (c - 1)), 0)
    muovi(bianchi, neri, dame, bianco, p.senzaProgresso, h1, h2, da, a, presi)
    return { bianchi: fBianchi, neri: fNeri, dame: fDame, contatore: fContatore, h1: fH1, h2: fH2 }
  })

  nodi = 0
  fermabile = false
  const partenza = Date.now()
  scadenza = partenza + tempoMs
  limiteNodi = tempoMs * NODI_AL_MS
  let ordine = legali.map((_, i) => i)
  let punti: number[] = []
  let completata = 0
  for (let prof = 1; prof <= profondita; prof += 1) {
    const questi = legali.map(() => -INFINITO)
    let migliore = -INFINITO
    try {
      for (const i of ordine) {
        const { bianchi: b, neri: n, dame: d, contatore, h1: g1, h2: g2 } = figli[i]
        // Le mosse vicine alla migliore meno il margine hanno il loro valore esatto, le altre solo un tetto.
        const soglia = migliore === -INFINITO ? -INFINITO : migliore - margine - 1
        inizio[1] = 0
        const v = -cerca(b, n, d, !bianco, contatore, g1, g2, prof - 1, -INFINITO, -soglia, 1, 0)
        questi[i] = v
        if (v > migliore) migliore = v
      }
    } catch (e) {
      if (e !== FERMA) throw e
      break
    }
    punti = questi
    completata = prof
    // Dalla prima profondita' finita in poi il tempo puo' fermare la ricerca.
    fermabile = true
    ordine = [...ordine].sort((x, y) => punti[y] - punti[x])
    if (migliore >= QUASI_VITTORIA) break
    if (Date.now() - partenza > tempoMs / 2) break
  }

  const migliore = punti[ordine[0]]
  const candidate = ordine.filter((i) => punti[i] >= migliore - margine)
  const scelta = candidate[Math.min(candidate.length - 1, Math.floor(rng() * candidate.length))]
  return { mossa: legali[scelta], punteggio: punti[scelta], profondita: completata, nodi }
}

/**
 * La mossa del computer, una di `mosseLegali(p)`; null se non ha mosse. Con una
 * mossa sola la gioca subito.
 */
export function mossaDelComputer(
  p: Posizione,
  livello: LivelloDama,
  rng: () => number,
  storia?: readonly string[],
  limiti?: LimitiRicerca,
): Mossa | null {
  return analizza(p, livello, rng, storia, limiti).mossa
}

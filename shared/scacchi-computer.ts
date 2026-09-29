/**
 * Il computer degli scacchi.
 *
 * E' un programma classico, di quelli che si scrivono dagli anni Novanta, sulla
 * scacchiera mutabile di shared/scacchi.ts:
 *
 *  - la **ricerca** e' un alfa-beta ad approfondimento iterativo: prima tutte le
 *    mosse a una semimossa di profondità, poi a due, e cosi' via, ogni giro
 *    cominciando dalla mossa migliore del giro prima. Le mosse si provano
 *    nell'ordine in cui e' piu' probabile che siano buone — quella che la
 *    tabella delle trasposizioni ricorda per la posizione, le prese dalla
 *    vittima piu' preziosa con l'attaccante che lo e' meno (MVV-LVA), le mosse
 *    "killer" che hanno appena tagliato alla stessa profondità, le prese che
 *    perdono materiale nello scambio, poi le altre secondo quante volte sono
 *    servite — e con quell'ordine l'alfa-beta scarta quasi tutto il resto senza
 *    guardarlo. Sotto scacco si guarda una semimossa in piu';
 *  - in fondo a ogni variante la **ricerca di quiete** gioca le prese finché ce
 *    ne sono: senza, il computer si fermerebbe a meta' di uno scambio, e
 *    crederebbe di aver vinto una donna che sta per perdere. Non prova le prese
 *    che perdono materiale nello scambio (`scambio`, la SEE dei programmi), e
 *    ricorda le posizioni gia' viste: nelle posizioni piene di pezzi che si
 *    attaccano, senza tutte e due le cose, una sola mossa costava decine di
 *    migliaia di posizioni;
 *  - la **valutazione** sono le tavole di PeSTO, di Ronald Friederich
 *    (Rofchade), pubblicate sulla Chess Programming Wiki: un valore per ogni
 *    pezzo su ogni casella, uno per il mediogioco e uno per il finale, mescolati
 *    secondo i pezzi che restano. Sono tarate su milioni di posizioni e da sole
 *    valgono piu' di tante valutazioni scritte a mano. Nei finali vinti senza
 *    pedoni si aggiunge la spinta del re che perde verso il bordo, che le tavole
 *    non conoscono: senza, il computer con una torre in piu' girerebbe a vuoto
 *    fino alla patta delle cinquanta mosse;
 *  - un **matto** vale trentamila meno la sua distanza: fra due matti il
 *    computer sceglie il piu' vicino, e appena ne trova uno che un giro in piu'
 *    non potrebbe accorciare smette di pensare.
 *
 * Una **patta** vale per il computer un po' meno di niente (`DISPREZZO`, un
 * quarto di pedone): in vantaggio evita di ripetere, in svantaggio ci prova, e
 * con un pezzo in meno si salva con lo scacco perpetuo se c'e'. Una posizione
 * conta come patta gia' la seconda volta che compare, nella ricerca o nella
 * `storia` della partita, come in quasi tutti i programmi: chi puo' ripetere una
 * volta puo' ripetere anche la terza.
 *
 * Il **rumore** e' quel che rende diverse due partite: alla radice ogni mossa
 * riceve qualche centesimo di pedone a caso, preso da `rng`, e vince la mossa con
 * il valore piu' il rumore piu' alto. Ai matti non si aggiunge, e quando la
 * partita e' decisa si spegne: chi vince deve chiudere, chi perde resistere.
 *
 * I tre livelli, con i tempi misurati in Node su un portatile (un telefono va da
 * due a quattro volte piu' piano):
 *
 *  - **facile** guarda una semimossa e le prese che ne seguono, e sceglie con
 *    un po' di rumore fra le mosse che non perdono niente. Una mossa su cinque
 *    e' distratto: guarda solo la posizione dopo la mossa, senza accorgersi che
 *    il pezzo appena mosso si puo' prendere, e con un rumore piu' forte, che a
 *    volte gli fa lasciare un pezzo in presa o non prendere quello dell'altro.
 *    Non vede le minacce: chi ha appena imparato deve poterlo battere, e chi
 *    guarda i pezzi in presa lo batte quasi sempre. Pensa un millisecondo, sette
 *    nelle posizioni piu' intricate;
 *  - **normale** vede quattro semimosse, due sue e due dell'altro, piu' la
 *    quiete, senza potature, e sceglie a caso fra le mosse a una trentina di
 *    centesimi dalla migliore: non regala niente, ma non vede le combinazioni
 *    lunghe. Pensa decine di millisecondi, e ha un tetto di posizioni che lo
 *    ferma sotto i due decimi di secondo; il tetto e' contato e non
 *    cronometrato, cosi' a parita' di `rng` gioca la stessa mossa su ogni
 *    macchina;
 *  - **difficile** approfondisce per un secondo e mezzo, e non comincia un giro
 *    che non avrebbe il tempo di finire. Pota anche: la mossa nulla (se passando
 *    il turno la posizione resta sopra beta, e' troppo buona perché l'altro la
 *    conceda), le riduzioni delle mosse tranquille che arrivano tardi
 *    nell'ordine, e vicino al fondo le mosse che non possono cambiare niente.
 *    Nel mediogioco arriva a dieci o dodici semimosse, e risolve nove delle
 *    prime dieci posizioni di "Win At Chess". Ha anche un tetto di posizioni:
 *    nel Worker di Cloudflare l'orologio non avanza mentre si calcola, e senza
 *    non si fermerebbe (ma il computer gira nel browser: al server, dieci
 *    millisecondi bastano solo al facile).
 */

import {
  ALFIERE,
  CAVALLO,
  DONNA,
  MOSSE_MASSIME,
  NERO,
  PEDONE,
  RE,
  Scacchiera,
  VALORE_SCAMBIO,
  daFen,
  mossaPubblica,
  presaDi,
  promozioneDi,
  type Mossa,
  type Posizione,
} from './scacchi'

export type LivelloScacchi = 'facile' | 'normale' | 'difficile'

export const LIVELLI_SCACCHI: readonly LivelloScacchi[] = ['facile', 'normale', 'difficile']

/** Un matto vale MATTO meno la sua distanza in semimosse; oltre QUASI_MATTO un punteggio e' un matto. */
export const MATTO = 30000
const QUASI_MATTO = MATTO - 1000
const INFINITO = 32000
/** Quanto puo' allungarsi una variante, estensioni e quiete comprese; i giri si fermano prima, per lasciare posto. */
const PLY_MASSIMI = 100
const PROFONDITA_MASSIMA = 64
/** Quanto vale una patta per il computer, in centesimi di pedone: un po' meno di niente. */
export const DISPREZZO = 25

/** Il facile: quanto spesso e' distratto, e fino a quanti centesimi di rumore aggiunge a ogni mossa. */
const DISTRAZIONE = 0.2
const RUMORE_FACILE = 60
const RUMORE_DISTRATTO = 200
/** Quante prese guarda il facile dopo la sua mossa. */
const QUIETE_FACILE = 6
/** Il normale: profondita', tetto di nodi e rumore. */
const PROFONDITA_NORMALE = 4
const NODI_NORMALE = 60_000
const RUMORE_NORMALE = 30
/** Oltre questo vantaggio, per l'uno o per l'altro, il rumore si spegne. */
const PARTITA_DECISA = 300
/** Il difficile: il tempo, il tetto per quando l'orologio non va, e un po' di rumore nelle prime mosse. */
const TEMPO_DIFFICILE = 1500
const NODI_DIFFICILE = 3_000_000
const RUMORE_APERTURA = 12
const MOSSE_APERTURA = 8

/* ─────────────────────────────  La valutazione  ───────────────────────────── */

/*
 * Le tavole di PeSTO, dal punto di vista del bianco e scritte come si guarda la
 * scacchiera: la prima riga e' l'ottava traversa. Il valore di un pezzo e' quello
 * del suo tipo piu' quello della casella, per il mediogioco (MG) e per il finale
 * (EG); per il nero la tavola si capovolge.
 */
const VALORE_MG = [0, 82, 337, 365, 477, 1025, 0]
const VALORE_EG = [0, 94, 281, 297, 512, 936, 0]

const TAVOLE_MG: readonly (readonly number[])[] = [
  [],
  // pedone
  [
       0,    0,    0,    0,    0,    0,    0,    0,
      98,  134,   61,   95,   68,  126,   34,  -11,
      -6,    7,   26,   31,   65,   56,   25,  -20,
     -14,   13,    6,   21,   23,   12,   17,  -23,
     -27,   -2,   -5,   12,   17,    6,   10,  -25,
     -26,   -4,   -4,  -10,    3,    3,   33,  -12,
     -35,   -1,  -20,  -23,  -15,   24,   38,  -22,
       0,    0,    0,    0,    0,    0,    0,    0,
  ],
  // cavallo
  [
    -167,  -89,  -34,  -49,   61,  -97,  -15, -107,
     -73,  -41,   72,   36,   23,   62,    7,  -17,
     -47,   60,   37,   65,   84,  129,   73,   44,
      -9,   17,   19,   53,   37,   69,   18,   22,
     -13,    4,   16,   13,   28,   19,   21,   -8,
     -23,   -9,   12,   10,   19,   17,   25,  -16,
     -29,  -53,  -12,   -3,   -1,   18,  -14,  -19,
    -105,  -21,  -58,  -33,  -17,  -28,  -19,  -23,
  ],
  // alfiere
  [
     -29,    4,  -82,  -37,  -25,  -42,    7,   -8,
     -26,   16,  -18,  -13,   30,   59,   18,  -47,
     -16,   37,   43,   40,   35,   50,   37,   -2,
      -4,    5,   19,   50,   37,   37,    7,   -2,
      -6,   13,   13,   26,   34,   12,   10,    4,
       0,   15,   15,   15,   14,   27,   18,   10,
       4,   15,   16,    0,    7,   21,   33,    1,
     -33,   -3,  -14,  -21,  -13,  -12,  -39,  -21,
  ],
  // torre
  [
      32,   42,   32,   51,   63,    9,   31,   43,
      27,   32,   58,   62,   80,   67,   26,   44,
      -5,   19,   26,   36,   17,   45,   61,   16,
     -24,  -11,    7,   26,   24,   35,   -8,  -20,
     -36,  -26,  -12,   -1,    9,   -7,    6,  -23,
     -45,  -25,  -16,  -17,    3,    0,   -5,  -33,
     -44,  -16,  -20,   -9,   -1,   11,   -6,  -71,
     -19,  -13,    1,   17,   16,    7,  -37,  -26,
  ],
  // donna
  [
     -28,    0,   29,   12,   59,   44,   43,   45,
     -24,  -39,   -5,    1,  -16,   57,   28,   54,
     -13,  -17,    7,    8,   29,   56,   47,   57,
     -27,  -27,  -16,  -16,   -1,   17,   -2,    1,
      -9,  -26,   -9,  -10,   -2,   -4,    3,   -3,
     -14,    2,  -11,   -2,   -5,    2,   14,    5,
     -35,   -8,   11,    2,    8,   15,   -3,    1,
      -1,  -18,   -9,   10,  -15,  -25,  -31,  -50,
  ],
  // re
  [
     -65,   23,   16,  -15,  -56,  -34,    2,   13,
      29,   -1,  -20,   -7,   -8,   -4,  -38,  -29,
      -9,   24,    2,  -16,  -20,    6,   22,  -22,
     -17,  -20,  -12,  -27,  -30,  -25,  -14,  -36,
     -49,   -1,  -27,  -39,  -46,  -44,  -33,  -51,
     -14,  -14,  -22,  -46,  -44,  -30,  -15,  -27,
       1,    7,   -8,  -64,  -43,  -16,    9,    8,
     -15,   36,   12,  -54,    8,  -28,   24,   14,
  ],
]

const TAVOLE_EG: readonly (readonly number[])[] = [
  [],
  // pedone
  [
       0,    0,    0,    0,    0,    0,    0,    0,
     178,  173,  158,  134,  147,  132,  165,  187,
      94,  100,   85,   67,   56,   53,   82,   84,
      32,   24,   13,    5,   -2,    4,   17,   17,
      13,    9,   -3,   -7,   -7,   -8,    3,   -1,
       4,    7,   -6,    1,    0,   -5,   -1,   -8,
      13,    8,    8,   10,   13,    0,    2,   -7,
       0,    0,    0,    0,    0,    0,    0,    0,
  ],
  // cavallo
  [
     -58,  -38,  -13,  -28,  -31,  -27,  -63,  -99,
     -25,   -8,  -25,   -2,   -9,  -25,  -24,  -52,
     -24,  -20,   10,    9,   -1,   -9,  -19,  -41,
     -17,    3,   22,   22,   22,   11,    8,  -18,
     -18,   -6,   16,   25,   16,   17,    4,  -18,
     -23,   -3,   -1,   15,   10,   -3,  -20,  -22,
     -42,  -20,  -10,   -5,   -2,  -20,  -23,  -44,
     -29,  -51,  -23,  -15,  -22,  -18,  -50,  -64,
  ],
  // alfiere
  [
     -14,  -21,  -11,   -8,   -7,   -9,  -17,  -24,
      -8,   -4,    7,  -12,   -3,  -13,   -4,  -14,
       2,   -8,    0,   -1,   -2,    6,    0,    4,
      -3,    9,   12,    9,   14,   10,    3,    2,
      -6,    3,   13,   19,    7,   10,   -3,   -9,
     -12,   -3,    8,   10,   13,    3,   -7,  -15,
     -14,  -18,   -7,   -1,    4,   -9,  -15,  -27,
     -23,   -9,  -23,   -5,   -9,  -16,   -5,  -17,
  ],
  // torre
  [
      13,   10,   18,   15,   12,   12,    8,    5,
      11,   13,   13,   11,   -3,    3,    8,    3,
       7,    7,    7,    5,    4,   -3,   -5,   -3,
       4,    3,   13,    1,    2,    1,   -1,    2,
       3,    5,    8,    4,   -5,   -6,   -8,  -11,
      -4,    0,   -5,   -1,   -7,  -12,   -8,  -16,
      -6,   -6,    0,    2,   -9,   -9,  -11,   -3,
      -9,    2,    3,   -1,   -5,  -13,    4,  -20,
  ],
  // donna
  [
      -9,   22,   22,   27,   27,   19,   10,   20,
     -17,   20,   32,   41,   58,   25,   30,    0,
     -20,    6,    9,   49,   47,   35,   19,    9,
       3,   22,   24,   45,   57,   40,   57,   36,
     -18,   28,   19,   47,   31,   34,   39,   23,
     -16,  -27,   15,    6,    9,   17,   10,    5,
     -22,  -23,  -30,  -16,  -16,  -23,  -36,  -32,
     -33,  -28,  -22,  -43,   -5,  -32,  -20,  -41,
  ],
  // re
  [
     -74,  -35,  -18,  -18,  -11,   15,    4,  -17,
     -12,   17,   14,   17,   17,   38,   23,   11,
      10,   17,   23,   15,   20,   45,   44,   13,
      -8,   22,   24,   27,   26,   33,   26,    3,
     -18,   -4,   21,   24,   27,   23,    9,  -11,
     -19,   -3,   11,   21,   23,   16,    7,   -9,
     -27,  -11,    4,   13,   14,    4,   -5,  -17,
     -53,  -34,  -21,  -11,  -28,  -14,  -24,  -43,
  ],
]

/** Pezzo e casella insieme, gia' con il segno: positivi i bianchi, negativi i neri. */
const MG = new Int16Array(16 * 64)
const EG = new Int16Array(16 * 64)
for (let tipo = PEDONE; tipo <= RE; tipo += 1) {
  for (let k = 0; k < 64; k += 1) {
    // La casella k vista dal bianco e' la riga 7 - traversa della tavola: k ^ 56.
    MG[tipo * 64 + k] = VALORE_MG[tipo] + TAVOLE_MG[tipo][k ^ 56]
    EG[tipo * 64 + k] = VALORE_EG[tipo] + TAVOLE_EG[tipo][k ^ 56]
    MG[(tipo | NERO) * 64 + k] = -(VALORE_MG[tipo] + TAVOLE_MG[tipo][k])
    EG[(tipo | NERO) * 64 + k] = -(VALORE_EG[tipo] + TAVOLE_EG[tipo][k])
  }
}

/** Quanto pesa ogni pezzo sulla fase: 24 all'inizio, 0 con i soli pedoni. */
const FASE = [0, 0, 1, 1, 2, 4, 0]
/** Il materiale in centesimi tondi, per decidere chi sta vincendo un finale e per potare la quiete. */
const MATERIALE = [0, 100, 300, 300, 500, 900, 0]
/** Quanto una casella e' lontana dal centro, in passi dritti: 0 le quattro centrali, 6 gli angoli. */
const DAL_CENTRO = Int8Array.from(
  { length: 64 },
  (_, k) => Math.max(3 - (k & 7), (k & 7) - 4) + Math.max(3 - (k >> 3), (k >> 3) - 4),
)

/** Nei finali vinti senza pedoni: il re che perde verso il bordo, quello che vince vicino a lui. */
function spinta(debole: number, forte: number): number {
  const distanza = Math.abs((debole & 7) - (forte & 7)) + Math.abs((debole >> 3) - (forte >> 3))
  return 10 * DAL_CENTRO[debole] + 4 * (14 - distanza)
}

/**
 * Il valore della posizione per chi ha il tratto, in centesimi di pedone. Se
 * nessuno puo' piu' dare matto e' `patta`, quel che vale una patta per lui.
 */
function valuta(s: Scacchiera, patta: number): number {
  const c = s.c
  let mg = 0
  let eg = 0
  let fase = 0
  let pedoniBianchi = 0
  let pedoniNeri = 0
  let pesanti = 0
  let cavalli = 0
  let alfieri = 0
  let colori = 0
  let bianchi = 0
  let neri = 0
  for (let k = 0; k < 64; k += 1) {
    const q = c[k]
    if (q === 0) continue
    mg += MG[q * 64 + k]
    eg += EG[q * 64 + k]
    const tipo = q & 7
    fase += FASE[tipo]
    if (q & NERO) neri += MATERIALE[tipo]
    else bianchi += MATERIALE[tipo]
    if (tipo === PEDONE) {
      if (q & NERO) pedoniNeri += 1
      else pedoniBianchi += 1
    } else if (tipo === CAVALLO) cavalli += 1
    else if (tipo === ALFIERE) {
      alfieri += 1
      colori |= 1 << (((k >> 3) + k) & 1)
    } else if (tipo !== RE) pesanti += 1
  }
  if (pedoniBianchi + pedoniNeri + pesanti === 0 && (cavalli === 0 ? colori !== 3 : cavalli === 1 && alfieri === 0)) {
    return patta
  }
  const f = fase > 24 ? 24 : fase
  let v = ((mg * f + eg * (24 - f)) / 24) | 0
  if (fase <= 8) {
    if (bianchi >= neri + 400 && pedoniNeri === 0) v += spinta(s.re[1], s.re[0])
    else if (neri >= bianchi + 400 && pedoniBianchi === 0) v -= spinta(s.re[0], s.re[1])
  }
  // 0 - v e non -v: una posizione pari deve valere zero, non meno zero.
  return s.tratto === 0 ? v : 0 - v
}

/** Il valore statico di una posizione, per chi ha il tratto: senza ricerca, com'e' adesso. */
export function valutazione(p: Posizione): number {
  return valuta(Scacchiera.da(p), 0)
}

/** Ha qualcosa oltre al re e ai pedoni? Senza, passare il turno puo' essere la cosa peggiore (lo zugzwang). */
function haPezzi(s: Scacchiera, lato: number): boolean {
  const c = s.c
  for (let k = 0; k < 64; k += 1) {
    const q = c[k]
    if (q !== 0 && q >> 3 === lato && (q & 7) !== PEDONE && (q & 7) !== RE) return true
  }
  return false
}

/* ─────────────────────────────  La tabella delle trasposizioni  ───────────────────────────── */

/*
 * Le posizioni gia' viste, per impronta: il punteggio, fin dove si e' cercato,
 * se e' esatto o solo un limite, e la mossa migliore, che sara' la prima da
 * provare quando la posizione torna — per un'altra strada, o al giro dopo.
 * 2^18 righe, tre megabyte e mezzo, create alla prima ricerca. Ogni ricerca ha
 * la sua eta' e non legge le righe di quelle di prima: non serve svuotarla, e
 * una mossa non dipende da quelle che il computer ha calcolato prima.
 */
const BIT_TT = 18
const MASCHERA_TT = (1 << BIT_TT) - 1
const ESATTO = 1
const ALMENO = 2
const AL_PIU = 3

interface Trasposizioni {
  chiave: Int32Array
  mossa: Int32Array
  punti: Int16Array
  prof: Int8Array
  tipo: Uint8Array
  eta: Uint8Array
  corrente: number
}

let tabella: Trasposizioni | null = null

function tabellaPerUnaRicerca(): Trasposizioni {
  const righe = 1 << BIT_TT
  tabella ??= {
    chiave: new Int32Array(righe),
    mossa: new Int32Array(righe),
    punti: new Int16Array(righe),
    prof: new Int8Array(righe),
    tipo: new Uint8Array(righe),
    eta: new Uint8Array(righe),
    corrente: 0,
  }
  tabella.corrente = (tabella.corrente + 1) & 255
  if (tabella.corrente === 0) {
    tabella.eta.fill(0)
    tabella.corrente = 1
  }
  return tabella
}

// Un matto si salva come distanza dalla posizione, non dalla radice: la stessa posizione torna a profondita' diverse.
const inTabella = (v: number, ply: number) => (v >= QUASI_MATTO ? v + ply : v <= -QUASI_MATTO ? v - ply : v)
const daTabella = (v: number, ply: number) => (v >= QUASI_MATTO ? v - ply : v <= -QUASI_MATTO ? v + ply : v)

/* ─────────────────────────────  La ricerca  ───────────────────────────── */

const adesso: () => number =
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? () => performance.now()
    : () => Date.now()

/** L'impronta in un numero solo, per l'insieme delle posizioni della partita: 53 bit bastano. */
const impronta = (lo: number, hi: number) => (hi >>> 11) * 4294967296 + (lo >>> 0)

/**
 * Voti per l'ordine delle mosse: prima quella della tabella, poi le prese che
 * non perdono materiale, le killer, le prese che lo perdono, le altre secondo
 * lo storico.
 */
const VOTO_TT = 1 << 30
const VOTO_PRESA = 1 << 28
const VOTO_KILLER = 1 << 27
const VOTO_PRESA_CATTIVA = (1 << 26) + 4096
const TETTO_STORICO = 1 << 26
/** Nella quiete, una presa che nemmeno con questo margine riporterebbe alfa non si prova. */
const MARGINE_DELTA = 200
/** Quanto puo' cambiare una posizione in una semimossa tranquilla, per le potature vicino al fondo. */
const MARGINE_FUTILITA = 150

interface Impostazioni {
  profondita: number
  tempoMs: number
  nodi: number
  rumore: number
  potature: boolean
}

class Ricerca {
  readonly s: Scacchiera
  nodi = 0
  fermata = false
  /** La profondita' dell'ultimo giro finito. */
  profondita = 0
  private readonly tt = tabellaPerUnaRicerca()
  private readonly mosse = new Int32Array(1 << 16)
  private readonly voti = new Int32Array(1 << 16)
  private cima = 0
  private readonly killer = new Int32Array(PLY_MASSIMI * 2)
  private readonly storico = new Int32Array(2 * 4096)
  private readonly lato: number
  private readonly partita = new Set<number>()
  private scadenza = Infinity
  private limiteNodi = Infinity
  private potature = false
  /** Fin dove arriva la quiete: il facile si ferma prima, e vede solo gli scambi corti. */
  fondoQuiete = PLY_MASSIMI - 1

  constructor(p: Posizione, storia: readonly string[]) {
    this.s = Scacchiera.da(p, PLY_MASSIMI + 8)
    this.lato = this.s.tratto
    // Oltre le ultime cento posizioni non serve guardare: prima c'e' stata una presa o una mossa di pedone.
    for (const chiave of storia.slice(-100)) {
      const vista = daFen(chiave)
      if (!vista) continue
      const s = Scacchiera.da(vista)
      this.partita.add(impronta(s.lo, s.hi))
    }
  }

  /** Quanto vale una patta per chi ha il tratto adesso. */
  patta(): number {
    return this.s.tratto === this.lato ? -DISPREZZO : DISPREZZO
  }

  /**
   * La posizione c'e' gia' stata? Nella ricerca si guarda indietro di due in due
   * — le altre hanno l'altro tratto — fin dove non c'e' stata una presa o una
   * mossa di pedone; nella partita, solo se da qui a lei non ce ne sono state.
   */
  ripetizione(): boolean {
    const s = this.s
    const lo = s.lo
    const hi = s.hi
    const fine = s.ply - Math.min(s.semimosse, s.ply)
    for (let i = s.ply - 2; i >= fine; i -= 2) if (s.storiaLo[i] === lo && s.storiaHi[i] === hi) return true
    return s.semimosse >= s.ply && this.partita.size > 0 && this.partita.has(impronta(lo, hi))
  }

  private controlla(): void {
    if (this.nodi >= this.limiteNodi || ((this.nodi & 1023) === 0 && adesso() >= this.scadenza)) this.fermata = true
  }

  /**
   * L'ordine delle mosse da `inizio` a `fine`, come voti: `prossima` le tira
   * fuori dalla migliore. Lo scambio si calcola solo per le prese di un pezzo
   * con uno che vale di piu', le sole che possono perdere materiale.
   */
  private vota(inizio: number, fine: number, mossaTT: number, ply: number, conScambio: boolean): void {
    const s = this.s
    const c = s.c
    const primo = this.killer[ply * 2]
    const secondo = this.killer[ply * 2 + 1]
    const storico = s.tratto * 4096
    for (let j = inizio; j < fine; j += 1) {
      const m = this.mosse[j]
      let voto: number
      if (m === mossaTT) voto = VOTO_TT
      else if (presaDi(m) !== 0 || promozioneDi(m) === DONNA) {
        const vittima = presaDi(m) & 7
        const attaccante = c[m & 63] & 7
        const mvvLva = vittima * 64 + (promozioneDi(m) === DONNA ? 320 : 0) - attaccante
        const puoPerdere = conScambio && promozioneDi(m) === 0 && VALORE_SCAMBIO[attaccante] > VALORE_SCAMBIO[vittima]
        voto = (puoPerdere && s.scambio(m) < 0 ? VOTO_PRESA_CATTIVA : VOTO_PRESA) + mvvLva
      } else if (m === primo) voto = VOTO_KILLER + 1
      else if (m === secondo) voto = VOTO_KILLER
      else voto = promozioneDi(m) !== 0 ? -1 : this.storico[storico + (m & 4095)]
      this.voti[j] = voto
    }
  }

  private prossima(j: number, fine: number): number {
    const mosse = this.mosse
    const voti = this.voti
    let migliore = j
    for (let k = j + 1; k < fine; k += 1) if (voti[k] > voti[migliore]) migliore = k
    const m = mosse[migliore]
    if (migliore !== j) {
      mosse[migliore] = mosse[j]
      mosse[j] = m
      const v = voti[migliore]
      voti[migliore] = voti[j]
      voti[j] = v
    }
    return m
  }

  private taglio(m: number, ply: number, prof: number): void {
    if (this.killer[ply * 2] !== m) {
      this.killer[ply * 2 + 1] = this.killer[ply * 2]
      this.killer[ply * 2] = m
    }
    const i = this.s.tratto * 4096 + (m & 4095)
    this.storico[i] += prof * prof
    if (this.storico[i] > TETTO_STORICO) for (let k = 0; k < this.storico.length; k += 1) this.storico[k] >>= 1
  }

  /** L'alfa-beta: il valore della posizione per chi ha il tratto, fra `alfa` e `beta`. */
  private alfaBeta(prof: number, alfa: number, beta: number, ply: number, nullaPermessa: boolean): number {
    const s = this.s
    if (this.ripetizione()) return this.patta()
    // Un matto da qui non puo' essere piu' vicino di cosi': se la finestra e' tutta oltre, e' inutile cercare.
    alfa = Math.max(alfa, -MATTO + ply)
    beta = Math.min(beta, MATTO - ply - 1)
    if (alfa >= beta) return alfa
    const scacco = s.sottoScacco()
    // Sotto scacco si guarda una semimossa in piu': le risposte sono poche, e sbagliarle costa caro.
    if (scacco) prof += 1
    if (prof <= 0) return this.quiete(alfa, beta, ply)
    this.nodi += 1
    this.controlla()
    if (this.fermata) return 0
    if (ply >= PLY_MASSIMI - 1 || this.cima + MOSSE_MASSIME > this.mosse.length) return valuta(s, this.patta())
    if (s.semimosse >= 100) return scacco && !s.haMosse() ? -MATTO + ply : this.patta()

    const tt = this.tt
    const riga = s.lo & MASCHERA_TT
    let mossaTT = 0
    const pv = beta - alfa > 1
    if (tt.eta[riga] === tt.corrente && tt.chiave[riga] === s.hi) {
      mossaTT = tt.mossa[riga]
      if (!pv && tt.prof[riga] >= prof) {
        const v = daTabella(tt.punti[riga], ply)
        const tipo = tt.tipo[riga]
        if (tipo === ESATTO || (tipo === ALMENO && v >= beta) || (tipo === AL_PIU && v <= alfa)) return v
      }
    }

    // Le potature del difficile, lontano dalla variante principale e senza scacchi di mezzo.
    const potabile = this.potature && !pv && !scacco && Math.abs(beta) < QUASI_MATTO
    const statica = potabile ? valuta(s, this.patta()) : 0
    // Vicino al fondo, una posizione che vale tanto piu' di beta non scende sotto: l'altro non la raggiunge.
    if (potabile && prof <= 3 && statica - MARGINE_FUTILITA * prof >= beta) return statica
    // La mossa nulla: se anche passando il turno si resta sopra beta, la posizione e' troppo buona per contare.
    if (potabile && nullaPermessa && prof >= 3 && statica >= beta && haPezzi(s, s.tratto)) {
      s.faiNulla()
      const v = -this.alfaBeta(prof - (prof > 6 ? 4 : 3), -beta, -beta + 1, ply + 1, false)
      s.disfaiNulla()
      if (this.fermata) return 0
      if (v >= beta) return v >= QUASI_MATTO ? beta : v
    }
    // E se vale tanto meno di alfa, a una o due semimosse dal fondo le mosse tranquille non la salvano.
    const futile = potabile && prof <= 2 && statica + MARGINE_FUTILITA * prof <= alfa

    const inizio = this.cima
    const fine = s.genera(this.mosse, inizio, false)
    this.cima = fine
    this.vota(inizio, fine, mossaTT, ply, true)
    const alfaIniziale = alfa
    let migliore = -INFINITO
    let mossaMigliore = 0
    let legali = 0
    for (let j = inizio; j < fine; j += 1) {
      const m = this.prossima(j, fine)
      if (!s.legale(m, scacco)) continue
      legali += 1
      const tranquilla = presaDi(m) === 0 && promozioneDi(m) === 0
      s.fai(m)
      if (futile && legali > 1 && tranquilla && !s.sottoScacco()) {
        s.disfai()
        continue
      }
      let v: number
      if (legali === 1) v = -this.alfaBeta(prof - 1, -beta, -alfa, ply + 1, true)
      else {
        // Le mosse tranquille che arrivano tardi di solito non servono: prima si guardano un po' meno a fondo.
        let riduzione = 0
        if (this.potature && prof >= 3 && legali > 3 && tranquilla && !scacco && this.voti[j] < VOTO_KILLER) {
          if (!s.sottoScacco()) riduzione = legali > 8 && prof >= 5 ? 2 : 1
        }
        v = -this.alfaBeta(prof - 1 - riduzione, -alfa - 1, -alfa, ply + 1, true)
        if (v > alfa && riduzione > 0) v = -this.alfaBeta(prof - 1, -alfa - 1, -alfa, ply + 1, true)
        if (v > alfa && v < beta) v = -this.alfaBeta(prof - 1, -beta, -alfa, ply + 1, true)
      }
      s.disfai()
      if (this.fermata) {
        this.cima = inizio
        return 0
      }
      if (v > migliore) {
        migliore = v
        mossaMigliore = m
        if (v > alfa) {
          alfa = v
          if (v >= beta) {
            if (tranquilla) this.taglio(m, ply, prof)
            break
          }
        }
      }
    }
    this.cima = inizio
    if (legali === 0) return scacco ? -MATTO + ply : this.patta()

    tt.chiave[riga] = s.hi
    tt.mossa[riga] = mossaMigliore
    tt.punti[riga] = inTabella(migliore, ply)
    tt.prof[riga] = prof
    tt.tipo[riga] = migliore >= beta ? ALMENO : migliore > alfaIniziale ? ESATTO : AL_PIU
    tt.eta[riga] = tt.corrente
    return migliore
  }

  /**
   * La ricerca di quiete: solo prese e promozioni, finché la posizione si calma.
   * Chi ha il tratto puo' anche fermarsi e tenersi il valore di adesso; sotto
   * scacco no, e si provano tutte le risposte, cosi' anche un matto in fondo a
   * una serie di prese si vede.
   *
   * Anche qui serve la tabella: in una posizione piena di pezzi che si
   * attaccano, gli stessi scambi alla pari si possono fare in tanti ordini, e
   * senza ricordarsi dove si e' gia' passati la quiete arrivava a decine di
   * migliaia di posizioni per una mossa sola. Le righe della quiete non prendono
   * il posto di quelle della ricerca, che valgono di piu'.
   */
  quiete(alfa: number, beta: number, ply: number): number {
    const s = this.s
    this.nodi += 1
    this.controlla()
    if (this.fermata) return 0
    const tt = this.tt
    const riga = s.lo & MASCHERA_TT
    const vista = tt.eta[riga] === tt.corrente && tt.chiave[riga] === s.hi
    if (vista) {
      const v = daTabella(tt.punti[riga], ply)
      const tipo = tt.tipo[riga]
      if (tipo === ESATTO || (tipo === ALMENO && v >= beta) || (tipo === AL_PIU && v <= alfa)) return v
    }
    const scacco = s.sottoScacco()
    let migliore = -MATTO + ply
    if (!scacco) {
      migliore = valuta(s, this.patta())
      if (migliore >= beta) return migliore
      if (migliore > alfa) alfa = migliore
    }
    if (ply >= this.fondoQuiete || this.cima + MOSSE_MASSIME > this.mosse.length) {
      return scacco ? valuta(s, this.patta()) : migliore
    }
    const alfaIniziale = alfa
    const inizio = this.cima
    const fine = s.genera(this.mosse, inizio, !scacco)
    this.cima = fine
    this.vota(inizio, fine, vista ? tt.mossa[riga] : 0, ply, false)
    let mossaMigliore = 0
    let legali = 0
    for (let j = inizio; j < fine; j += 1) {
      const m = this.prossima(j, fine)
      if (!scacco && promozioneDi(m) === 0) {
        // Le prese che non possono riportare alfa, e quelle che perdono materiale nello scambio.
        const vittima = presaDi(m) & 7
        if (migliore + MATERIALE[vittima] + MARGINE_DELTA < alfa) continue
        if (VALORE_SCAMBIO[s.c[m & 63] & 7] > VALORE_SCAMBIO[vittima] && s.scambio(m) < 0) continue
      }
      if (!s.legale(m, scacco)) continue
      legali += 1
      s.fai(m)
      const v = -this.quiete(-beta, -alfa, ply + 1)
      s.disfai()
      if (this.fermata) {
        this.cima = inizio
        return 0
      }
      if (v > migliore) {
        migliore = v
        mossaMigliore = m
        if (v > alfa) {
          alfa = v
          if (v >= beta) break
        }
      }
    }
    this.cima = inizio
    if (scacco && legali === 0) return -MATTO + ply
    if (tt.eta[riga] !== tt.corrente || tt.prof[riga] <= 0) {
      tt.chiave[riga] = s.hi
      tt.mossa[riga] = mossaMigliore
      tt.punti[riga] = inTabella(migliore, ply)
      tt.prof[riga] = 0
      tt.tipo[riga] = migliore >= beta ? ALMENO : migliore > alfaIniziale ? ESATTO : AL_PIU
      tt.eta[riga] = tt.corrente
    }
    return migliore
  }

  /**
   * L'approfondimento iterativo dalla radice.
   *
   * Il rumore si aggiunge al valore di ogni mossa della radice, uno per mossa e
   * lo stesso per tutti i giri; si cerca la mossa con il valore piu' il rumore
   * piu' alto spostando la finestra di ogni mossa del suo rumore, cosi' costa
   * come una ricerca normale. Ai matti non si aggiunge niente: fra due matti
   * vince sempre il piu' vicino.
   */
  cerca(radici: number[], imp: Impostazioni, rng: () => number, partenza: number): { mossa: number; punti: number } {
    const s = this.s
    this.potature = imp.potature
    const rumori = radici.map(() => (imp.rumore > 0 ? Math.floor(rng() * (imp.rumore + 1)) : 0))
    const ordine = radici.map((_, i) => i)
    const voti = new Array<number>(radici.length).fill(-INFINITO)
    let mossa = radici[0]
    let punti = 0
    for (let prof = 1; prof <= imp.profondita; prof += 1) {
      // Il primo giro finisce sempre: e' quello che da' una mossa.
      this.scadenza = prof === 1 ? Infinity : partenza + imp.tempoMs
      this.limiteNodi = prof === 1 ? Infinity : imp.nodi
      let alfa = -INFINITO
      let migliore = -1
      let puntiMigliore = 0
      for (const i of ordine) {
        const r = rumori[i]
        const soglia = alfa - r
        s.fai(radici[i])
        let v: number
        if (migliore < 0) v = -this.alfaBeta(prof - 1, -INFINITO, -soglia, 1, true)
        else {
          v = -this.alfaBeta(prof - 1, -soglia - 1, -soglia, 1, true)
          if (v > soglia && !this.fermata) v = -this.alfaBeta(prof - 1, -INFINITO, -soglia, 1, true)
        }
        s.disfai()
        if (this.fermata) break
        const conRumore = Math.abs(v) < QUASI_MATTO ? v + r : v
        voti[i] = conRumore
        if (migliore < 0 || conRumore > alfa) {
          alfa = conRumore
          migliore = i
          puntiMigliore = v
        }
      }
      // Un giro interrotto vale se ha finito almeno la prima mossa, che e' la migliore del giro prima.
      if (migliore >= 0) {
        mossa = radici[migliore]
        punti = puntiMigliore
      }
      if (this.fermata) break
      this.profondita = prof
      ordine.sort((a, b) => voti[b] - voti[a])
      // In una partita gia' decisa il rumore toglie e non da': chi vince deve chiudere, chi perde resistere.
      if (prof === 1 && Math.abs(punti) >= PARTITA_DECISA) rumori.fill(0)
      if (Math.abs(punti) >= QUASI_MATTO && MATTO - Math.abs(punti) <= prof) break
      if (adesso() - partenza > imp.tempoMs / 2 || this.nodi >= imp.nodi) break
    }
    return { mossa, punti }
  }
}

/* ─────────────────────────────  Le mosse del computer  ───────────────────────────── */

export interface OpzioniAnalisi {
  /** Fin dove approfondire, in semimosse. */
  profondita?: number
  /** Quanto pensare al massimo, in millisecondi. */
  tempoMs?: number
  /** Quante posizioni guardare al massimo. */
  nodi?: number
  /** Fino a quanti centesimi di pedone di rumore aggiungere a ogni mossa, scelti con `rng`. */
  rumore?: number
  /** Mossa nulla e riduzioni delle mosse tardive. */
  potature?: boolean
  rng?: () => number
  /** Le chiavi di ripetizione delle posizioni precedenti. */
  storia?: readonly string[]
}

export interface Analisi {
  /** La mossa migliore; null se non ce ne sono. */
  mossa: Mossa | null
  /** Il valore per chi ha il tratto, in centesimi di pedone, senza il rumore. */
  punteggio: number
  /** Matto in quante mosse: positivo se lo da' chi ha il tratto, negativo se lo riceve. */
  matto: number | null
  /** L'ultimo giro finito. */
  profondita: number
  nodi: number
  ms: number
}

/**
 * La ricerca con le opzioni date: e' quella del normale e del difficile, e serve
 * ai test e a chi vuole un consiglio. Senza limiti pensa quanto il difficile: un
 * secondo e mezzo, o tre milioni di posizioni.
 */
export function analizza(p: Posizione, opzioni: OpzioniAnalisi = {}): Analisi {
  const partenza = adesso()
  const ricerca = new Ricerca(p, opzioni.storia ?? [])
  const radici = ricerca.s.legali()
  if (radici.length === 0) {
    return { mossa: null, punteggio: 0, matto: null, profondita: 0, nodi: 0, ms: adesso() - partenza }
  }
  const { mossa, punti } = ricerca.cerca(
    radici,
    {
      profondita: Math.min(opzioni.profondita ?? PROFONDITA_MASSIMA, PROFONDITA_MASSIMA),
      tempoMs: opzioni.tempoMs ?? TEMPO_DIFFICILE,
      nodi: opzioni.nodi ?? NODI_DIFFICILE,
      rumore: opzioni.rumore ?? 0,
      potature: opzioni.potature ?? true,
    },
    opzioni.rng ?? (() => 0.5),
    partenza,
  )
  const distanza = MATTO - Math.abs(punti)
  return {
    mossa: mossaPubblica(mossa),
    // Le negazioni della ricerca fanno anche dei meno zero: fuori non servono.
    punteggio: punti === 0 ? 0 : punti,
    matto: Math.abs(punti) >= QUASI_MATTO ? Math.sign(punti) * Math.ceil(distanza / 2) : null,
    profondita: ricerca.profondita,
    nodi: ricerca.nodi,
    ms: adesso() - partenza,
  }
}

/**
 * Il facile: ogni mossa si guarda da sola, con le prese che ne seguono, e si
 * sceglie la migliore dopo averle aggiunto un po' di rumore. Distratto, guarda
 * solo la posizione dopo la mossa, con piu' rumore. Come alla radice della
 * ricerca vera, la quiete di ogni mossa cerca solo se batte la migliore finora
 * tenendo conto del rumore, e cosi' taglia.
 */
function mossaFacile(p: Posizione, rng: () => number, storia: readonly string[]): number {
  const ricerca = new Ricerca(p, storia)
  ricerca.fondoQuiete = 1 + QUIETE_FACILE
  const s = ricerca.s
  const distratto = rng() < DISTRAZIONE
  const rumore = distratto ? RUMORE_DISTRATTO : RUMORE_FACILE
  let scelta = 0
  let meglio = -INFINITO
  for (const m of s.legali()) {
    const r = Math.floor(rng() * (rumore + 1))
    s.fai(m)
    // I valori sono per chi risponde: per il computer vanno girati.
    let v: number
    if (ricerca.ripetizione()) v = -ricerca.patta()
    else if (distratto) v = -valuta(s, ricerca.patta())
    else v = -ricerca.quiete(-INFINITO, r - meglio, 1)
    s.disfai()
    if (Math.abs(v) < QUASI_MATTO) v += r
    if (v > meglio) {
      meglio = v
      scelta = m
    }
  }
  return scelta
}

/**
 * La mossa del computer, o null se non ne ha (matto o stallo). `storia`: le
 * chiavi di ripetizione delle posizioni precedenti, per riconoscere le
 * ripetizioni.
 *
 * Le patte che non dipendono dalle mosse — la ripetizione, le cinquanta mosse,
 * il materiale — le dice `esito`: a partita finita il computer non si
 * interroga. Con una mossa sola la gioca subito, senza pensare.
 */
export function mossaDelComputer(
  p: Posizione,
  livello: LivelloScacchi,
  rng: () => number,
  storia: readonly string[] = [],
): Mossa | null {
  const legali = Scacchiera.da(p).legali()
  if (legali.length === 0) return null
  if (legali.length === 1) return mossaPubblica(legali[0])
  if (livello === 'facile') return mossaPubblica(mossaFacile(p, rng, storia))
  if (livello === 'normale') {
    // Senza orologio: a parita' di posizione e di `rng`, la stessa mossa su ogni macchina.
    return analizza(p, {
      profondita: PROFONDITA_NORMALE,
      tempoMs: Infinity,
      nodi: NODI_NORMALE,
      rumore: RUMORE_NORMALE,
      potature: false,
      rng,
      storia,
    }).mossa
  }
  return analizza(p, {
    tempoMs: TEMPO_DIFFICILE,
    nodi: NODI_DIFFICILE,
    rumore: p.mossa <= MOSSE_APERTURA ? RUMORE_APERTURA : 0,
    potature: true,
    rng,
    storia,
  }).mossa
}

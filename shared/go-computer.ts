/**
 * Il computer del go, e la stima delle pietre morte.
 *
 * E' una ricerca ad albero Monte Carlo (MCTS), la tecnica con cui i programmi
 * di go hanno imparato a giocare bene prima delle reti neurali: dalla posizione
 * si giocano migliaia di partite veloci fino in fondo, le **simulazioni**, e si
 * conta chi vince; le mosse che vincono piu' spesso si esplorano di piu', e
 * l'albero cresce dove serve. Lo schema e' quello di Michi, il programma minimo
 * di Petr Baudiš (l'autore di Pachi):
 *
 *  - nell'albero si sceglie con **RAVE**: oltre alle statistiche di una mossa
 *    giocata subito contano quelle della stessa mossa giocata piu' avanti nella
 *    stessa simulazione ("tutte le mosse come la prima", AMAF). Sono meno
 *    precise ma molto piu' numerose, e pesano sempre meno man mano che le
 *    visite vere crescono;
 *  - ogni mossa nuova parte con dei **prior**, visite e vittorie finte con quel
 *    che un giocatore vede a colpo d'occhio: prendere un gruppo in atari o
 *    salvarne uno proprio, rispondere vicino all'ultima mossa (contando ogni
 *    gruppo come un punto solo), le forme 3x3 buone, la terza linea e non la
 *    prima dove non c'e' nessuno, non mettersi in atari da soli;
 *  - le **scale** le legge un piccolo lettore, alla radice e nelle risposte:
 *    le simulazioni giocano a caso e una scala non la seguono mai fino in fondo.
 *    L'atari che manda un gruppo in una scala che funziona parte avvantaggiato,
 *    allungarsi dentro una scala che non si salva parte con un'avvertenza;
 *  - le simulazioni sono leggere ma non stupide: prendono il gruppo che le
 *    ultime due mosse hanno lasciato in atari, o salvano il proprio
 *    (allungandosi se guadagna libertà, o prendendo chi lo minaccia),
 *    rispondono con le forme 3x3 di MoGo attorno alle ultime due mosse, e
 *    altrimenti giocano a caso; non riempiono mai un proprio occhio, e
 *    un'autoatari di piu' pietre la scartano nove volte su dieci se suggerita,
 *    una su due se a caso (a volte serve, per uccidere un occhio grande
 *    giocandoci dentro), e sempre da sei pietre in su.
 *
 * Il premio di una simulazione e' la vittoria, con un decimo che viene dal
 * margine, misurato rispetto a quello medio della ricerca: a partita decisa le
 * vittorie sono tutte uguali, e senza i punti l'albero non distinguerebbe una
 * mossa che guadagna da una che regala. Si conta ad area con il komi, come nel
 * conteggio vero di go.ts: il computer gioca per il punteggio con cui si
 * decide la partita. La mossa scelta e' la piu' visitata, la piu' sicura, con
 * un'eccezione: un gruppo di tre pietre o piu' in atari si prende subito, se la
 * ricerca non vede niente di chiaramente meglio.
 *
 * Il goban della ricerca non e' la posizione immutabile di go.ts ma un array di
 * interi con un giro di bordo, e ogni gruppo tiene le sue "pseudo-libertà": il
 * numero, la somma e la somma dei quadrati dei punti vuoti accanto alle sue
 * pietre. Con le tre somme si sa in un passo se un gruppo e' in atari (lo e' se
 * e solo se n × Σx² = (Σx)²) e dov'e' la sua ultima libertà, senza contarle. Una
 * simulazione parte copiando il goban della radice, un array solo. In Node, su
 * un computer da tavolo, sono circa 13.000 simulazioni al secondo sul 9x9 vuoto,
 * 6.000 sul 13x13 e 3.000 sul 19x19; un telefono ne fa la meta' o un terzo.
 *
 * I livelli, pensati per giocatori da bar sul 9x9 (sul 13 e sul 19 giocano
 * mosse sensate, ma non fanno paura a nessuno):
 *
 *  - **facile**: 300 simulazioni, e una volta su due la mossa si pesca fra le
 *    sei che la ricerca ha guardato di piu': chi ha appena imparato lo batte.
 *    Risponde in qualche decina di millisecondi, e comunque entro 140;
 *  - **normale**: fino a 5.000 simulazioni o mezzo secondo;
 *  - **difficile**: fino a 25.000 simulazioni o un secondo e mezzo.
 *
 * Sui goban grandi il tetto delle simulazioni si scala con l'area. Il tempo e'
 * un limite, non un obiettivo: la ricerca si ferma appena la mossa piu' visitata
 * non puo' piu' essere superata. Sul 9x9, fra loro, il normale batte il facile
 * dieci partite su dieci, e il difficile batte il normale circa sette volte su
 * dieci. La radice non guarda la prima linea ne' la seconda dove non c'e'
 * nessuno, e sui goban grandi, in apertura, la prima linea se non prende o non
 * salva niente: con qualche centinaio di simulazioni le statistiche AMAF le
 * premierebbero a caso.
 *
 * **Quando passa.** Se l'avversario ha appena passato e, contando con la stima
 * delle pietre morte, la partita chiusa li' e' vinta. Altrimenti solo quando non
 * resta niente da fare — niente da prendere o da salvare, nessun punto che le
 * simulazioni non sappiano di chi e' (le dame contano solo in una partita
 * stretta) — e regalare una mossa all'avversario non gli serve: lo dicono due
 * ricerche piccole, dalla posizione e dopo il passo. Non riempie mai un proprio
 * occhio, e da una partita persa senza speranza passa invece di giocare mosse
 * inutili; la resa la offre l'interfaccia.
 *
 * **Le pietre morte** non si stabiliscono con certezza, e `stimaMorte` guarda
 * due cose insieme. A colpo d'occhio: un gruppo con due occhi, o con un occhio
 * di almeno sette punti, e' vivo e basta. Gli altri sono candidati, e li
 * giudicano quattrocento simulazioni dalla posizione finale, in cui i territori
 * chiusi non si invadono (a caso ci si vivrebbe piu' spesso di quanto farebbe
 * chiunque) e le autoatari di tre pietre o piu' non si giocano (sono quelle che
 * rompono un seki): un candidato che sopravvive meno di tre volte su quattro, e
 * che e' chiuso da gruppi piu' forti di lui, e' morto. Si toglie un gruppo alla
 * volta, dal piu' debole, e dopo ognuno si ricontano gli occhi di chi lo
 * circondava. Due gruppi che si uccidono a vicenda — muoiono spesso tutti e
 * due, e mai insieme — sono in seki, e restano. La stima si corregge toccando i
 * gruppi, come al tavolo, dove i morti si decidono d'accordo: nei casi dubbi
 * (un occhio di quattro punti, una lotta lasciata aperta) le simulazioni possono
 * sbagliare, e le persone no.
 */

import { KOMI, PASSO, chiaveRipetizione, gioca, legale, punteggio, type Mossa, type Posizione } from './go'

export type LivelloGo = 'facile' | 'normale' | 'difficile'

export const LIVELLI_GO: readonly LivelloGo[] = ['facile', 'normale', 'difficile']

export interface OpzioniGo {
  /** Il tempo per pensare, al posto di quello del livello. */
  tempoMs?: number
  /** Il tetto delle simulazioni, al posto di quello del livello; da solo toglie il limite di tempo. */
  simulazioni?: number
  /** L'ultima mossa dell'avversario, se si sa: le risposte vicine partono avvantaggiate. */
  ultima?: number | null
}

const VUOTO = 0
const NERO = 1
const BIANCO = 2
const FUORI = 3

/** Il passo, nella ricerca: il punto 0 e' un angolo del bordo, dove non si gioca mai. */
const PASSA = 0

/** Per il conteggio di una zona: chi tocca, in bit. Vuoto 4, nero 1, bianco 2, bordo niente. */
const TOCCA = [4, 1, 2, 0]

const adesso: () => number =
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? () => performance.now()
    : () => Date.now()

/* ─────────────────────────────  Il caso  ───────────────────────────── */

/**
 * Il generatore delle simulazioni: uno xorshift a 32 bit, molto piu' veloce di
 * una chiamata a funzione per ogni numero. Il seme viene dal generatore di chi
 * chiama, quindi a parita' di generatore la ricerca e' la stessa.
 */
class Caso {
  private stato: number

  constructor(rng: () => number) {
    this.stato = Math.floor(rng() * 0x1_0000_0000) | 0 || 0x2545_f491
  }

  /** Fra 0 (compreso) e 1 (escluso). */
  numero(): number {
    let x = this.stato
    x ^= x << 13
    x ^= x >>> 17
    x ^= x << 5
    this.stato = x
    return (x >>> 0) / 0x1_0000_0000
  }

  /** Un intero fra 0 e n - 1. */
  intero(n: number): number {
    return Math.floor(this.numero() * n)
  }
}

/* ─────────────────────────────  La geometria  ───────────────────────────── */

/**
 * Le misure di un lato. Attorno al goban c'e' un giro di punti FUORI, così i
 * quattro vicini e le quattro diagonali di un punto stanno sempre nell'array e
 * nessun ciclo deve controllare i bordi.
 */
class Geometria {
  readonly w: number
  readonly celle: number
  /**
   * I punti del goban nell'indice con il bordo, nell'ordine della posizione:
   * `interni[k]` e' il punto `k` di go.ts. `aPunto` e' il ritorno (-1 sul bordo).
   */
  readonly interni: Int32Array
  readonly aPunto: Int32Array
  /** La linea di ogni punto contando da 0: 0 la prima, 2 la terza. */
  readonly linea: Int8Array
  /** I quattro vicini, come scarti. */
  readonly lati: Int32Array
  /** Il quadrato 3x3 attorno a un punto, il punto per primo. */
  readonly intorno: Int32Array
  /** Il punto e i suoi quattro vicini: i soli gruppi a cui una pietra puo' aver tolto libertà. */
  readonly croce: Int32Array
  /** Per ogni punto, quelli a tre passi o meno: `vicinato[inizio[s]]` .. `vicinato[inizio[s + 1] - 1]`. */
  readonly vicinato: Int32Array
  readonly inizio: Int32Array
  /** Oltre, una simulazione si ferma comunque: con il ko semplice un triplo ko potrebbe girare per sempre. */
  readonly mosseMassime: number

  constructor(readonly lato: number) {
    const w = lato + 2
    this.w = w
    this.celle = w * w
    this.interni = new Int32Array(lato * lato)
    this.aPunto = new Int32Array(this.celle).fill(-1)
    this.linea = new Int8Array(this.celle)
    for (let r = 0; r < lato; r += 1) {
      for (let c = 0; c < lato; c += 1) {
        const s = (r + 1) * w + c + 1
        this.interni[r * lato + c] = s
        this.aPunto[s] = r * lato + c
        this.linea[s] = Math.min(r, c, lato - 1 - r, lato - 1 - c)
      }
    }
    this.lati = Int32Array.from([-w, -1, 1, w])
    this.intorno = Int32Array.from([0, -w - 1, -w, -w + 1, -1, 1, w - 1, w, w + 1])
    this.croce = Int32Array.from([0, -w, -1, 1, w])
    const vicinato: number[] = []
    this.inizio = new Int32Array(this.celle + 1)
    for (let s = 0; s < this.celle; s += 1) {
      this.inizio[s] = vicinato.length
      if (this.aPunto[s] < 0) continue
      const r = Math.floor(s / w)
      const c = s % w
      for (let dr = -3; dr <= 3; dr += 1) {
        for (let dc = -3; dc <= 3; dc += 1) {
          if (Math.abs(dr) + Math.abs(dc) > 3 || (dr === 0 && dc === 0)) continue
          const rr = r + dr
          const cc = c + dc
          if (rr >= 1 && rr <= lato && cc >= 1 && cc <= lato) vicinato.push(rr * w + cc)
        }
      }
    }
    this.inizio[this.celle] = vicinato.length
    this.vicinato = Int32Array.from(vicinato)
    this.mosseMassime = lato * lato * 3
  }
}

const GEOMETRIE = new Map<number, Geometria>()

function geometria(lato: number): Geometria {
  let g = GEOMETRIE.get(lato)
  if (!g) {
    g = new Geometria(lato)
    GEOMETRIE.set(lato, g)
  }
  return g
}

/* ─────────────────────────────  Le forme 3x3  ───────────────────────────── */

/**
 * Le forme 3x3 di MoGo (Gelly e Wang, 2006), nella scrittura di Michi: la mossa
 * e' al centro, X e O sono i due colori (in tutti e due i modi), x "non X",
 * o "non O", ? qualunque cosa, e lo spazio e' il bordo del goban.
 */
const FORME: readonly (readonly string[])[] = [
  // Hane che chiude.
  ['XOX', '...', '???'],
  // Hane che non taglia.
  ['XO.', '...', '?.?'],
  // Hane sotto una pietra (magari).
  ['XO?', 'X..', 'x.?'],
  // Attaccatura in diagonale.
  ['.O.', 'X..', '...'],
  // Taglio non protetto.
  ['XO?', 'O.o', '?o?'],
  // Taglio dopo una sbirciata.
  ['XO?', 'O.X', '???'],
  // Taglio in mezzo.
  ['?X?', 'O.O', 'ooo'],
  // Taglio del passo del cavallo.
  ['OX?', 'o.O', '???'],
  // Sul bordo: inseguire.
  ['X.?', 'O.?', '   '],
  // Sul bordo: chiudere il taglio.
  ['OX?', 'X.O', '   '],
  // Sul bordo: impedire il collegamento.
  ['?X?', 'x.O', '   '],
  // Sul bordo: scendere (sagari).
  ['?XO', 'x.x', '   '],
  // Sul bordo: tagliare.
  ['?OX', 'X.O', '   '],
]

/**
 * Tutti gli intorni che somigliano a una forma, per codice: i colori degli otto
 * vicini, due bit ciascuno, nell'ordine della lettura (nordovest, nord,
 * nordest, ovest, est, sudovest, sud, sudest). Sono 65.536 byte, e un'occhiata
 * alla tabella costa quanto leggere otto punti.
 */
const SCHEMI: Uint8Array = (() => {
  const tabella = new Uint8Array(1 << 16)
  const ruota = (p: readonly string[]) => [0, 1, 2].map((c) => p[2][c] + p[1][c] + p[0][c])
  const capovolgi = (p: readonly string[]) => [p[2], p[1], p[0]]
  const specchia = (p: readonly string[]) => p.map((riga) => [...riga].reverse().join(''))
  const scambio: Record<string, string> = { X: 'O', O: 'X', x: 'o', o: 'x' }
  const scambia = (p: readonly string[]) => p.map((riga) => riga.replace(/[XOxo]/g, (ch) => scambio[ch]))
  const valori: Record<string, readonly number[]> = {
    '.': [VUOTO],
    X: [NERO],
    O: [BIANCO],
    ' ': [FUORI],
    '?': [VUOTO, NERO, BIANCO, FUORI],
    x: [VUOTO, BIANCO, FUORI],
    o: [VUOTO, NERO, FUORI],
  }
  const posti = [0, 1, 2, 3, 5, 6, 7, 8]
  const segna = (p: readonly string[]) => {
    const s = p.join('')
    const scrivi = (i: number, codice: number): void => {
      if (i === posti.length) {
        tabella[codice] = 1
        return
      }
      for (const v of valori[s[posti[i]]]) scrivi(i + 1, codice | (v << (2 * i)))
    }
    scrivi(0, 0)
  }
  for (const forma of FORME) {
    for (const a of [forma, ruota(forma)]) {
      for (const b of [a, capovolgi(a)]) {
        for (const c of [b, specchia(b)]) {
          segna(c)
          segna(scambia(c))
        }
      }
    }
  }
  return tabella
})()

/* ─────────────────────────────  Il goban della ricerca  ───────────────────────────── */

/**
 * Il goban mutabile della ricerca. Tutto quel che cambia da una mossa all'altra
 * sta in un solo array di interi, a sezioni: una simulazione parte copiando
 * quello della radice.
 *
 * Ogni gruppo e' un anello di pietre (`seguente`) con un capo, e il capo tiene
 * le pietre del gruppo e le sue pseudo-libertà: quante sono le coppie (pietra,
 * vicino vuoto), la somma dei punti vuoti e la somma dei loro quadrati. Una
 * libertà toccata da due pietre conta due volte, ma le somme bastano: il gruppo
 * e' in atari se e solo se tutte le pseudo-libertà sono lo stesso punto, cioe'
 * se n × Σx² = (Σx)², e quel punto e' Σx / n. Il gruppo non ha libertà se n e'
 * zero.
 */
class Goban {
  readonly dati: Int32Array
  readonly colore: Int32Array
  readonly capo: Int32Array
  readonly seguente: Int32Array
  readonly pietre: Int32Array
  readonly nLib: Int32Array
  readonly sLib: Int32Array
  readonly qLib: Int32Array
  /** I punti vuoti, in un elenco senza ordine, e dove sta ognuno. */
  readonly vuoti: Int32Array
  readonly dove: Int32Array
  nVuoti = 0
  ko = 0
  tratto = NERO
  ultima = PASSA
  penultima = PASSA

  // Gli attrezzi di chi conta: non fanno parte della posizione e non si copiano. Un punto e'
  // segnato se `segno[s] === giro`: un giro nuovo cancella tutti i segni senza toccare l'array.
  readonly segno: Int32Array
  private giro = 0
  readonly visto: Int32Array
  private giroVisto = 0
  readonly pila: Int32Array
  readonly candidati: Int32Array
  readonly posto: Int32Array
  /**
   * I territori chiusi, se si guardano: per ogni punto il colore di chi lo
   * chiude (0 se nessuno). L'altro ci gioca solo per prendere.
   */
  bloccati: Uint8Array | null = null

  constructor(readonly geo: Geometria) {
    const c = geo.celle
    this.dati = new Int32Array(c * 9)
    this.colore = this.dati.subarray(0, c)
    this.capo = this.dati.subarray(c, 2 * c)
    this.seguente = this.dati.subarray(2 * c, 3 * c)
    this.pietre = this.dati.subarray(3 * c, 4 * c)
    this.nLib = this.dati.subarray(4 * c, 5 * c)
    this.sLib = this.dati.subarray(5 * c, 6 * c)
    this.qLib = this.dati.subarray(6 * c, 7 * c)
    this.vuoti = this.dati.subarray(7 * c, 8 * c)
    this.dove = this.dati.subarray(8 * c, 9 * c)
    this.segno = new Int32Array(c)
    this.visto = new Int32Array(c)
    this.pila = new Int32Array(c)
    this.candidati = new Int32Array(c * 4)
    this.posto = new Int32Array(c)
    this.colore.fill(FUORI)
    for (const s of geo.interni) {
      this.colore[s] = VUOTO
      this.dove[s] = this.nVuoti
      this.vuoti[this.nVuoti++] = s
    }
  }

  static da(p: Posizione): Goban {
    const g = new Goban(geometria(p.lato))
    const { interni } = g.geo
    // Le pietre una alla volta: in una posizione valida nessun gruppo resta
    // mai senza libertà a meta' strada, quindi non c'e' niente da catturare.
    for (let k = 0; k < p.punti.length; k += 1) {
      const x = p.punti[k]
      if (x !== null) g.metti(interni[k], x === 'nero' ? NERO : BIANCO)
    }
    g.ko = p.ko === null ? 0 : interni[p.ko]
    g.tratto = p.tratto === 'nero' ? NERO : BIANCO
    return g
  }

  /** Un giro nuovo di segni; prima che il contatore esca dagli interi a 32 bit, si ripuliscono. */
  nuovoGiro(): number {
    if (this.giro >= 0x3fff_ffff) {
      this.segno.fill(0)
      this.giro = 0
    }
    return ++this.giro
  }

  nuovoGiroVisto(): number {
    if (this.giroVisto >= 0x3fff_ffff) {
      this.visto.fill(0)
      this.giroVisto = 0
    }
    return ++this.giroVisto
  }

  copia(da: Goban): void {
    this.dati.set(da.dati)
    this.nVuoti = da.nVuoti
    this.ko = da.ko
    this.tratto = da.tratto
    this.ultima = da.ultima
    this.penultima = da.penultima
  }

  inAtari(g: number): boolean {
    const n = this.nLib[g]
    const s = this.sLib[g]
    return n > 0 && n * this.qLib[g] === s * s
  }

  /** L'ultima libertà di un gruppo in atari. */
  libertaDi(g: number): number {
    return this.sLib[g] / this.nLib[g]
  }

  /** Una pietra sul goban, con i gruppi aggiornati; le catture le fa chi chiama. */
  private metti(s: number, c: number): void {
    const { colore, capo, seguente, pietre, nLib, sLib, qLib } = this
    const lati = this.geo.lati
    const i = this.dove[s]
    const ultimo = this.vuoti[--this.nVuoti]
    this.vuoti[i] = ultimo
    this.dove[ultimo] = i
    colore[s] = c
    capo[s] = s
    seguente[s] = s
    pietre[s] = 1
    const q = s * s
    let nl = 0
    let sl = 0
    let ql = 0
    for (let d = 0; d < 4; d += 1) {
      const n = s + lati[d]
      const x = colore[n]
      if (x === VUOTO) {
        nl += 1
        sl += n
        ql += n * n
      } else if (x !== FUORI) {
        const g = capo[n]
        nLib[g] -= 1
        sLib[g] -= s
        qLib[g] -= q
      }
    }
    nLib[s] = nl
    sLib[s] = sl
    qLib[s] = ql
    for (let d = 0; d < 4; d += 1) {
      const n = s + lati[d]
      if (colore[n] === c && capo[n] !== capo[s]) this.unisci(capo[s], capo[n])
    }
  }

  /** Due gruppi in uno: le pietre del piu' piccolo passano al capo del piu' grande, e gli anelli si saldano. */
  private unisci(a: number, b: number): void {
    const { capo, seguente, pietre, nLib, sLib, qLib } = this
    if (pietre[a] < pietre[b]) {
      const t = a
      a = b
      b = t
    }
    let t = b
    do {
      capo[t] = a
      t = seguente[t]
    } while (t !== b)
    const dopoA = seguente[a]
    seguente[a] = seguente[b]
    seguente[b] = dopoA
    pietre[a] += pietre[b]
    nLib[a] += nLib[b]
    sLib[a] += sLib[b]
    qLib[a] += qLib[b]
  }

  /** Il gruppo catturato lascia il goban, e i suoi punti diventano libertà dei gruppi accanto. */
  private togli(g: number): void {
    const { colore, capo, seguente, nLib, sLib, qLib, vuoti, dove } = this
    const lati = this.geo.lati
    let t = g
    do {
      colore[t] = VUOTO
      dove[t] = this.nVuoti
      vuoti[this.nVuoti++] = t
      const q = t * t
      for (let d = 0; d < 4; d += 1) {
        const n = t + lati[d]
        const x = colore[n]
        if ((x === NERO || x === BIANCO) && capo[n] !== g) {
          const h = capo[n]
          nLib[h] += 1
          sLib[h] += t
          qLib[h] += q
        }
      }
      t = seguente[t]
    } while (t !== g)
  }

  /** La pietra di chi ha il tratto in `s`, che deve essere legale; restituisce quante pietre ha preso. */
  gioca(s: number): number {
    const c = this.tratto
    const a = 3 - c
    this.metti(s, c)
    const { colore, capo, nLib, pietre } = this
    const lati = this.geo.lati
    let prese = 0
    let presa = 0
    for (let d = 0; d < 4; d += 1) {
      const n = s + lati[d]
      if (colore[n] === a && nLib[capo[n]] === 0) {
        prese += pietre[capo[n]]
        presa = n
        this.togli(capo[n])
      }
    }
    const g = capo[s]
    this.ko = prese === 1 && pietre[g] === 1 && nLib[g] === 1 ? presa : 0
    this.penultima = this.ultima
    this.ultima = s
    this.tratto = a
    return prese
  }

  passa(): void {
    this.ko = 0
    this.penultima = this.ultima
    this.ultima = PASSA
    this.tratto = 3 - this.tratto
  }

  /** La pietra di chi ha il tratto in `s` e' legale? Vuoto, non il ko, e dopo le catture con una libertà. */
  legale(s: number): boolean {
    if (this.colore[s] !== VUOTO || s === this.ko) return false
    const { colore, capo } = this
    const lati = this.geo.lati
    const c = this.tratto
    for (let d = 0; d < 4; d += 1) {
      const n = s + lati[d]
      const x = colore[n]
      if (x === VUOTO) return true
      if (x === FUORI) continue
      const atari = this.inAtari(capo[n])
      if (x === c ? !atari : atari) return true
    }
    return false
  }

  /**
   * Il punto vuoto e' un occhio di `c`? I quattro vicini sono suoi (o il bordo),
   * e le diagonali dell'avversario non bastano a farne un occhio falso: due in
   * mezzo al goban, una sul bordo o nell'angolo.
   */
  occhio(s: number, c: number): boolean {
    const colore = this.colore
    const w = this.geo.w
    let x = colore[s - w]
    if (x !== c && x !== FUORI) return false
    x = colore[s - 1]
    if (x !== c && x !== FUORI) return false
    x = colore[s + 1]
    if (x !== c && x !== FUORI) return false
    x = colore[s + w]
    if (x !== c && x !== FUORI) return false
    const a = 3 - c
    let falsi = 0
    let bordo = 0
    x = colore[s - w - 1]
    if (x === FUORI) bordo = 1
    else if (x === a) falsi += 1
    x = colore[s - w + 1]
    if (x === FUORI) bordo = 1
    else if (x === a) falsi += 1
    x = colore[s + w - 1]
    if (x === FUORI) bordo = 1
    else if (x === a) falsi += 1
    x = colore[s + w + 1]
    if (x === FUORI) bordo = 1
    else if (x === a) falsi += 1
    return falsi + bordo < 2
  }

  /**
   * Quante libertà avrebbe il gruppo di una pietra di `c` in `s`, contate fino
   * a `limite`. Delle pietre che la mossa catturerebbe contano quelle che
   * toccano `s`: per dire se una mossa si mette in atari da sola basta.
   */
  libertaDopo(s: number, c: number, limite: number): number {
    const { colore, capo, seguente, nLib, segno } = this
    const lati = this.geo.lati
    const giro = this.nuovoGiro()
    const a = 3 - c
    segno[s] = giro
    let conta = 0
    for (let d = 0; d < 4; d += 1) {
      const n = s + lati[d]
      const x = colore[n]
      if (x === VUOTO || (x === a && this.inAtari(capo[n]))) {
        if (segno[n] !== giro) {
          segno[n] = giro
          conta += 1
          if (conta >= limite) return conta
        }
      }
    }
    for (let d = 0; d < 4; d += 1) {
      const n = s + lati[d]
      if (colore[n] !== c) continue
      const g = capo[n]
      if (segno[g] === giro) continue
      segno[g] = giro
      // Piu' di 4 × limite pseudo-libertà vogliono dire piu' di `limite` libertà vere.
      if (nLib[g] > 4 * limite) return limite
      let t = g
      do {
        for (let e = 0; e < 4; e += 1) {
          const m = t + lati[e]
          if (colore[m] === VUOTO && segno[m] !== giro) {
            segno[m] = giro
            conta += 1
            if (conta >= limite) return conta
          }
        }
        t = seguente[t]
      } while (t !== g)
    }
    return conta
  }

  /** Se la pietra di `c` in `s` resterebbe in atari, quante pietre ci resterebbero; 0 se no. */
  autoAtari(s: number, c: number): number {
    if (this.libertaDopo(s, c, 2) >= 2) return 0
    const { colore, capo, pietre } = this
    const lati = this.geo.lati
    let quante = 1
    let g0 = -1
    let g1 = -1
    let g2 = -1
    for (let d = 0; d < 4; d += 1) {
      const n = s + lati[d]
      if (colore[n] !== c) continue
      const g = capo[n]
      if (g === g0 || g === g1 || g === g2) continue
      quante += pietre[g]
      if (g0 < 0) g0 = g
      else if (g1 < 0) g1 = g
      else g2 = g
    }
    return quante
  }

  /** La pietra di `c` in `s` e' permessa dai territori chiusi? */
  libera(s: number, c: number): boolean {
    const b = this.bloccati
    return b === null || b[s] === 0 || b[s] === c || this.prende(s, c)
  }

  /** Una pietra in `s` prende qualcosa, o toglie dall'atari un gruppo proprio? */
  urgente(s: number): boolean {
    const { colore, capo } = this
    const lati = this.geo.lati
    for (let d = 0; d < 4; d += 1) {
      const n = s + lati[d]
      if ((colore[n] === NERO || colore[n] === BIANCO) && this.inAtari(capo[n])) return true
    }
    return false
  }

  /** La pietra di `c` in `s` prende qualcosa? */
  prende(s: number, c: number): boolean {
    const { colore, capo } = this
    const lati = this.geo.lati
    for (let d = 0; d < 4; d += 1) {
      const n = s + lati[d]
      if (colore[n] === 3 - c && this.inAtari(capo[n])) return true
    }
    return false
  }

  /** Le ultime libertà dei gruppi dell'avversario in atari che toccano il gruppo `g`: prenderli lo salva. */
  contrattacchi(g: number, fuori: Int32Array, n: number): number {
    const { colore, capo, seguente } = this
    const lati = this.geo.lati
    const a = 3 - colore[g]
    let t = g
    do {
      for (let d = 0; d < 4; d += 1) {
        const m = t + lati[d]
        if (colore[m] === a && this.inAtari(capo[m]) && n < fuori.length) fuori[n++] = this.libertaDi(capo[m])
      }
      t = seguente[t]
    } while (t !== g)
    return n
  }

  /** Le libertà del gruppo `g`, fino a `limite`, scritte in `fuori`: quante sono. */
  elencaLiberta(g: number, fuori: Int32Array, limite: number): number {
    const { colore, seguente, segno } = this
    const lati = this.geo.lati
    const giro = this.nuovoGiro()
    let n = 0
    let t = g
    do {
      for (let d = 0; d < 4; d += 1) {
        const m = t + lati[d]
        if (colore[m] === VUOTO && segno[m] !== giro) {
          segno[m] = giro
          fuori[n++] = m
          if (n >= limite) return n
        }
      }
      t = seguente[t]
    } while (t !== g)
    return n
  }

  /** I colori degli otto vicini, per la tabella delle forme. */
  codice(s: number): number {
    const c = this.colore
    const w = this.geo.w
    return (
      c[s - w - 1] |
      (c[s - w] << 2) |
      (c[s - w + 1] << 4) |
      (c[s - 1] << 6) |
      (c[s + 1] << 8) |
      (c[s + w - 1] << 10) |
      (c[s + w] << 12) |
      (c[s + w + 1] << 14)
    )
  }

  /** Nessuna pietra a tre passi o meno. */
  zonaVuota(s: number): boolean {
    const { vicinato, inizio } = this.geo
    const colore = this.colore
    for (let j = inizio[s]; j < inizio[s + 1]; j += 1) {
      const x = colore[vicinato[j]]
      if (x === NERO || x === BIANCO) return false
    }
    return true
  }

  /**
   * Il conteggio ad area del goban com'e': nero meno bianco, senza komi. Alla
   * fine di una simulazione i vuoti sono quasi tutti occhi di un punto; una zona
   * piu' grande si conta per intero. `possesso`, se c'e', riceve di chi e' ogni
   * punto: 1 il Nero, -1 il Bianco, 0 nessuno.
   */
  area(possesso: Int8Array | null): number {
    const { colore, segno, pila } = this
    const { interni, lati, w } = this.geo
    const giro = this.nuovoGiro()
    let totale = 0
    for (let i = 0; i < interni.length; i += 1) {
      const s = interni[i]
      const x = colore[s]
      let o = 0
      if (x === NERO) o = 1
      else if (x === BIANCO) o = -1
      else {
        if (segno[s] === giro) continue
        const m = TOCCA[colore[s - w]] | TOCCA[colore[s - 1]] | TOCCA[colore[s + 1]] | TOCCA[colore[s + w]]
        if ((m & 4) === 0) o = m === 1 ? 1 : m === 2 ? -1 : 0
        else {
          let n = 0
          let letti = 0
          let tocca = 0
          pila[n++] = s
          segno[s] = giro
          while (letti < n) {
            const t = pila[letti++]
            for (let d = 0; d < 4; d += 1) {
              const u = t + lati[d]
              const y = colore[u]
              if (y === VUOTO) {
                if (segno[u] !== giro) {
                  segno[u] = giro
                  pila[n++] = u
                }
              } else tocca |= TOCCA[y]
            }
          }
          const oz = tocca === 1 ? 1 : tocca === 2 ? -1 : 0
          totale += oz * n
          if (possesso) for (let j = 0; j < n; j += 1) possesso[pila[j]] = oz
          continue
        }
      }
      totale += o
      if (possesso) possesso[s] = o
    }
    return totale
  }
}

/* ─────────────────────────────  Le simulazioni  ───────────────────────────── */

interface Politica {
  /** La probabilità di guardare prima le catture e le fughe attorno alle ultime due mosse. */
  readonly cattura: number
  /** La probabilità di guardare poi le forme 3x3 attorno alle ultime due mosse. */
  readonly forma: number
  /** La probabilità di scartare un'autoatari di piu' pietre: fra le mosse suggerite, e fra quelle a caso. */
  readonly scartaSuggerite: number
  readonly scartaCasuali: number
  /** Da quante pietre un'autoatari si scarta sempre: un gruppo grande non si butta via. */
  readonly semprePietre: number
}

/**
 * Le simulazioni della ricerca. Le autoatari a caso passano una volta su due:
 * servono, per esempio, a uccidere un occhio grande giocandoci dentro.
 */
const POLITICA_RICERCA: Politica = {
  cattura: 0.9,
  forma: 0.95,
  scartaSuggerite: 0.9,
  scartaCasuali: 0.5,
  semprePietre: 6,
}

/**
 * Le simulazioni della stima delle pietre morte. Le catture e le fughe si
 * guardano sempre, e un'autoatari di tre pietre o piu' non si gioca mai: e'
 * quella che romperebbe un seki. Due pietre si buttano ancora, a volte: e' così
 * che si uccide un occhio di tre punti giocandoci dentro.
 */
const POLITICA_STIMA: Politica = {
  cattura: 1,
  forma: 0.9,
  scartaSuggerite: 0.9,
  scartaCasuali: 0.5,
  semprePietre: 3,
}

function accettabile(g: Goban, s: number, caso: Caso, scarta: number, pol: Politica): boolean {
  const c = g.tratto
  if (g.occhio(s, c) || !g.legale(s) || !g.libera(s, c)) return false
  const quante = g.autoAtari(s, c)
  return quante <= 1 || (quante < pol.semprePietre && caso.numero() >= scarta)
}

/** Catture e fughe attorno alle ultime due mosse. */
function mossaDiCattura(g: Goban, caso: Caso, pol: Politica): number {
  const { colore, capo, candidati, visto } = g
  const croce = g.geo.croce
  const c = g.tratto
  const giro = g.nuovoGiroVisto()
  let n = 0
  for (let volta = 0; volta < 2; volta += 1) {
    const q = volta === 0 ? g.ultima : g.penultima
    if (q === PASSA) continue
    for (let d = 0; d < 5; d += 1) {
      const t = q + croce[d]
      const x = colore[t]
      if (x !== NERO && x !== BIANCO) continue
      const gr = capo[t]
      if (visto[gr] === giro) continue
      visto[gr] = giro
      if (!g.inAtari(gr)) continue
      const lib = g.libertaDi(gr)
      if (x !== c) candidati[n++] = lib
      else {
        n = g.contrattacchi(gr, candidati, n)
        if (g.libertaDopo(lib, c, 2) >= 2) candidati[n++] = lib
      }
    }
  }
  while (n > 0) {
    const i = caso.intero(n)
    const s = candidati[i]
    candidati[i] = candidati[--n]
    if (accettabile(g, s, caso, pol.scartaSuggerite, pol)) return s
  }
  return PASSA
}

/** Le forme 3x3 attorno alle ultime due mosse. */
function mossaDiForma(g: Goban, caso: Caso, pol: Politica): number {
  const { colore, candidati } = g
  const intorno = g.geo.intorno
  let n = 0
  for (let volta = 0; volta < 2; volta += 1) {
    const q = volta === 0 ? g.ultima : g.penultima
    if (q === PASSA) continue
    for (let d = 1; d < 9; d += 1) {
      const t = q + intorno[d]
      if (colore[t] === VUOTO && SCHEMI[g.codice(t)] === 1) candidati[n++] = t
    }
  }
  while (n > 0) {
    const i = caso.intero(n)
    const s = candidati[i]
    candidati[i] = candidati[--n]
    if (accettabile(g, s, caso, pol.scartaSuggerite, pol)) return s
  }
  return PASSA
}

/** Un punto a caso fra quelli giocabili: si pesca, e chi non va si mette da parte in fondo all'elenco. */
function mossaACaso(g: Goban, caso: Caso, pol: Politica): number {
  const { vuoti, dove } = g
  let n = g.nVuoti
  while (n > 0) {
    const i = caso.intero(n)
    const s = vuoti[i]
    n -= 1
    if (i !== n) {
      const t = vuoti[n]
      vuoti[n] = s
      vuoti[i] = t
      dove[s] = n
      dove[t] = i
    }
    if (accettabile(g, s, caso, pol.scartaCasuali, pol)) return s
  }
  return PASSA
}

function mossaDiSimulazione(g: Goban, caso: Caso, pol: Politica): number {
  if (g.ultima !== PASSA || g.penultima !== PASSA) {
    if (caso.numero() < pol.cattura) {
      const s = mossaDiCattura(g, caso, pol)
      if (s !== PASSA) return s
    }
    if (caso.numero() < pol.forma) {
      const s = mossaDiForma(g, caso, pol)
      if (s !== PASSA) return s
    }
  }
  return mossaACaso(g, caso, pol)
}

/** La partita fino in fondo: finisce con due passi, quando a nessuno restano che i propri occhi. */
function giocaFinoInFondo(g: Goban, caso: Caso, pol: Politica, amaf: Int8Array | null, passi: number): void {
  let resto = g.geo.mosseMassime
  while (passi < 2 && resto > 0) {
    resto -= 1
    const s = mossaDiSimulazione(g, caso, pol)
    if (s === PASSA) {
      g.passa()
      passi += 1
    } else {
      if (amaf !== null && amaf[s] === 0) amaf[s] = g.tratto
      g.gioca(s)
      passi = 0
    }
  }
}

/* ─────────────────────────────  L'albero  ───────────────────────────── */

/**
 * Per ogni figlio: le visite e le vittorie vere, le visite e le vittorie con i
 * prior (per scegliere nell'albero), le visite e le vittorie AMAF.
 */
const CAMPI = 6
const VERE = 0
const VINTE_VERE = 1
const VISITE = 2
const VINTE = 3
const VISITE_AMAF = 4
const VINTE_AMAF = 5

/** Quante simulazioni prima che una mossa diventi un nodo con i suoi figli. */
const ESPANDI = 8
/**
 * Il peso delle statistiche AMAF: pesano quanto quelle vere a circa questo
 * numero di visite. Michi usa 3500; con 1000 il normale ne vince tre su quattro
 * a 2000 simulazioni (quelle che fa in mezzo secondo su un telefono), e a 6000
 * sono pari.
 */
const RAVE_EQUIV = 1000
/** Quanto del premio di una simulazione viene dal margine, e non dalla vittoria. */
const PESO_PUNTI = 0.1

// I prior, in visite finte: con vittorie (un incoraggiamento) o senza (un'avvertenza).
const PRIOR_PARI = 10
const PRIOR_AUTOATARI = 10
/** Prendere o salvare un gruppo: tanto per pietra, e un tanto in piu' se le pietre sono piu' d'una. */
const PRIOR_CATTURA = 15
const PRIOR_CATTURA_MASSIMO = 120
const PRIOR_FORMA = 10
/** Per la distanza dall'ultima mossa: 1, 2 e 3. */
const PRIOR_VICINE = [0, 24, 22, 8]
const PRIOR_ZONA_VUOTA = 10

class Nodo {
  readonly figli: (Nodo | null)[]
  readonly stat: Float32Array

  constructor(
    readonly tratto: number,
    readonly mosse: Int32Array,
  ) {
    this.figli = Array<Nodo | null>(mosse.length).fill(null)
    this.stat = new Float32Array(mosse.length * CAMPI)
  }
}

/** Le mosse di un nodo: i punti legali che non sono propri occhi, e il passo se non c'e' altro. */
function espandi(g: Goban, radice = false): Nodo {
  const c = g.tratto
  let mosse: number[] = []
  for (let i = 0; i < g.nVuoti; i += 1) {
    const s = g.vuoti[i]
    if (!g.occhio(s, c) && g.legale(s) && g.libera(s, c)) mosse.push(s)
  }
  // Alla radice non si guardano la prima e la seconda linea dove non c'e' nessuno, e sui goban
  // grandi, in apertura, la prima linea se non prende o non salva niente: con poche simulazioni
  // (sul 19x19 sono qualche centinaio) le statistiche AMAF le premiano a caso.
  if (radice) {
    const { linea, lato } = g.geo
    const apertura = lato >= 13 && g.geo.interni.length - g.nVuoti < 2 * lato
    const sensate = mosse.filter(
      (s) => (linea[s] > 1 || !g.zonaVuota(s)) && (!apertura || linea[s] > 0 || g.urgente(s)),
    )
    if (sensate.length > 0) mosse = sensate
  }
  if (mosse.length === 0) mosse.push(PASSA)
  const nodo = new Nodo(c, Int32Array.from(mosse))
  prior(g, nodo)
  return nodo
}

/** Quel che un giocatore vede a colpo d'occhio, in visite e vittorie finte. */
function prior(g: Goban, nodo: Nodo): void {
  const { mosse, stat } = nodo
  const k = mosse.length
  const { posto, colore, capo, pietre } = g
  const { interni, linea, lati } = g.geo
  for (let i = 0; i < k; i += 1) {
    posto[mosse[i]] = i
    stat[i * CAMPI + VISITE] = PRIOR_PARI
    stat[i * CAMPI + VINTE] = PRIOR_PARI / 2
  }
  const aggiungi = (s: number, visite: number, vinte: number) => {
    const i = posto[s]
    if (i >= 0 && i < k && mosse[i] === s) {
      stat[i * CAMPI + VISITE] += visite
      stat[i * CAMPI + VINTE] += vinte
    }
  }
  const c = nodo.tratto

  // Catture e fughe, su tutto il goban: un gruppo e' in atari se il suo capo lo dice.
  for (let j = 0; j < interni.length; j += 1) {
    const s = interni[j]
    const x = colore[s]
    if ((x !== NERO && x !== BIANCO) || capo[s] !== s || !g.inAtari(s)) continue
    const lib = g.libertaDi(s)
    const peso = Math.min(PRIOR_CATTURA_MASSIMO, PRIOR_CATTURA * (pietre[s] > 1 ? pietre[s] + 1 : 1))
    if (x !== c) aggiungi(lib, peso, peso)
    else {
      const n = g.contrattacchi(s, g.candidati, 0)
      for (let t = 0; t < n; t += 1) aggiungi(g.candidati[t], peso, peso)
      if (g.libertaDopo(lib, c, 2) >= 2) aggiungi(lib, peso, peso)
    }
  }

  // Vicino all'ultima mossa, a una distanza che conta ogni gruppo come un punto solo.
  const u = g.ultima
  if (u !== PASSA && colore[u] !== VUOTO) {
    const { segno, pila, seguente } = g
    const giro = g.nuovoGiro()
    let n = 0
    let t = capo[u]
    do {
      segno[t] = giro
      pila[n++] = t
      t = seguente[t]
    } while (t !== capo[u])
    let inizio = 0
    for (let d = 1; d <= 3; d += 1) {
      const fine = n
      for (let j = inizio; j < fine; j += 1) {
        const q = pila[j]
        for (let e = 0; e < 4; e += 1) {
          const v = q + lati[e]
          const x = colore[v]
          if (x === FUORI || segno[v] === giro) continue
          if (x === VUOTO) {
            segno[v] = giro
            pila[n++] = v
            aggiungi(v, PRIOR_VICINE[d], PRIOR_VICINE[d])
          } else {
            let r = v
            do {
              segno[r] = giro
              pila[n++] = r
              r = seguente[r]
            } while (r !== v)
          }
        }
      }
      inizio = fine
    }
  }

  // Mossa per mossa: le forme, le zone vuote, le autoatari.
  for (let i = 0; i < k; i += 1) {
    const s = mosse[i]
    const b = i * CAMPI
    if (s === PASSA) continue
    if (SCHEMI[g.codice(s)] === 1) {
      stat[b + VISITE] += PRIOR_FORMA
      stat[b + VINTE] += PRIOR_FORMA
    }
    // Dove non c'e' nessuno, la prima e la seconda linea sono lente e la terza e' quella giusta
    // (sui goban grandi anche la quarta).
    const l = linea[s]
    if ((l <= 2 || (l === 3 && g.geo.lato >= 13)) && g.zonaVuota(s)) {
      stat[b + VISITE] += PRIOR_ZONA_VUOTA
      if (l >= 2) stat[b + VINTE] += PRIOR_ZONA_VUOTA
    }
    if (g.autoAtari(s, c) > 1) stat[b + VISITE] += PRIOR_AUTOATARI
  }
}

/* ─────────────────────────────  Le scale  ───────────────────────────── */

/** Quanti nodi puo' leggere una scala, e quanto puo' andare a fondo in tratti per lato. */
const NODI_SCALA = 300
/** Il prior di una scala, per pietra presa o persa, e il suo tetto. */
const PRIOR_SCALA = 40
const PRIOR_SCALA_MASSIMO = 240

/** I goban su cui si legge una scala, uno per tratto, per ogni lato: si copiano, non si disfano. */
const TAVOLE_SCALA = new Map<number, Goban[]>()

function tavolaDiScala(geo: Geometria, i: number): Goban {
  let tavole = TAVOLE_SCALA.get(geo.lato)
  if (!tavole) {
    tavole = []
    TAVOLE_SCALA.set(geo.lato, tavole)
  }
  while (tavole.length <= i) tavole.push(new Goban(geo))
  return tavole[i]
}

/**
 * La scala: il gruppo della pietra in `s`, in atari e con il tratto, e' preso?
 * Si legge come si gioca. Chi scappa, se puo' prendere una pietra che lo
 * minaccia, e' salvo; altrimenti allunga sull'ultima libertà, e se dopo ne ha
 * tre e' salvo, se ne ha una e' preso. Con due, chi insegue prova l'atari da
 * tutte e due le parti, e il gruppo e' preso se uno dei due funziona. Una
 * scala troppo lunga da leggere si da' per salva.
 */
function presoInScala(g: Goban, s: number, profondita: number, conto: { nodi: number }): boolean {
  if (conto.nodi <= 0 || profondita + 2 >= 4 * g.geo.lato) return false
  conto.nodi -= 1
  const gr = g.capo[s]
  if (g.contrattacchi(gr, g.candidati, 0) > 0) return false
  const ultima = g.libertaDi(gr)
  if (!g.legale(ultima)) return true
  const h = tavolaDiScala(g.geo, profondita)
  h.copia(g)
  h.gioca(ultima)
  const libere = h.elencaLiberta(h.capo[s], h.candidati, 3)
  if (libere !== 2) return libere < 2
  const attacchi = [h.candidati[0], h.candidati[1]]
  const k = tavolaDiScala(g.geo, profondita + 1)
  for (const a of attacchi) {
    k.copia(h)
    if (!k.legale(a)) continue
    k.gioca(a)
    if (k.inAtari(k.capo[s]) && presoInScala(k, s, profondita + 2, conto)) return true
  }
  return false
}

/**
 * Le scale, solo alla radice: le simulazioni giocano a caso e una scala non la
 * seguono mai fino in fondo, quindi non sanno che il gruppo e' perso. L'atari
 * che manda un gruppo dell'avversario in una scala che funziona parte con un
 * prior forte, e allungarsi dentro una scala che non si salva con uno
 * contrario. Valgono anche per le statistiche AMAF, che alla radice pesano piu'
 * dei prior.
 */
function priorScale(g: Goban, nodo: Nodo): void {
  const { mosse, stat } = nodo
  const { colore, capo, pietre } = g
  const c = g.tratto
  const libere = new Int32Array(3)
  const aggiungi = (mossa: number, stones: number, buona: boolean) => {
    const i = mosse.indexOf(mossa)
    if (i < 0) return
    const peso = Math.min(PRIOR_SCALA_MASSIMO, PRIOR_SCALA * (stones + 1))
    const b = i * CAMPI
    stat[b + VISITE] += peso
    stat[b + VISITE_AMAF] += peso
    if (buona) {
      stat[b + VINTE] += peso
      stat[b + VINTE_AMAF] += peso
    }
  }
  for (const s of g.geo.interni) {
    const x = colore[s]
    if ((x !== NERO && x !== BIANCO) || capo[s] !== s) continue
    if (x === c) {
      if (!g.inAtari(s)) continue
      const k = tavolaDiScala(g.geo, 0)
      k.copia(g)
      if (presoInScala(k, s, 1, { nodi: NODI_SCALA })) aggiungi(g.libertaDi(s), pietre[s], false)
      continue
    }
    if (g.elencaLiberta(s, libere, 3) !== 2) continue
    const attacchi = [libere[0], libere[1]]
    for (const a of attacchi) {
      if (!g.legale(a)) continue
      const k = tavolaDiScala(g.geo, 0)
      k.copia(g)
      k.gioca(a)
      if (k.inAtari(k.capo[s]) && presoInScala(k, s, 1, { nodi: NODI_SCALA })) aggiungi(a, pietre[s], true)
    }
  }
}

/** Il figlio piu' promettente: la media delle vittorie, mescolata con quella AMAF finché le visite sono poche. */
function seleziona(nodo: Nodo, caso: Caso): number {
  const { stat } = nodo
  const k = nodo.mosse.length
  let migliore = 0
  let valore = -1
  // Si comincia da un figlio a caso: fra due valori uguali vince il primo incontrato.
  let i = caso.intero(k)
  for (let j = 0; j < k; j += 1) {
    const b = i * CAMPI
    const v = stat[b + VISITE]
    let u = stat[b + VINTE] / v
    const na = stat[b + VISITE_AMAF]
    if (na > 0) {
      const beta = na / (na + v + (v * na) / RAVE_EQUIV)
      u += beta * (stat[b + VINTE_AMAF] / na - u)
    }
    if (u > valore) {
      valore = u
      migliore = i
    }
    i += 1
    if (i === k) i = 0
  }
  return migliore
}

/** Una ricerca dalla posizione: l'albero, e quel che le simulazioni dicono di ogni punto. */
class Ricerca {
  readonly radiceGoban: Goban
  readonly lavoro: Goban
  readonly radice: Nodo
  readonly caso: Caso
  readonly amaf: Int8Array
  readonly finale: Int8Array
  /** La somma dei proprietari finali di ogni punto (1 il Nero, -1 il Bianco): diviso le simulazioni, il possesso. */
  readonly possesso: Float64Array
  /** La somma dei punteggi finali, Nero meno Bianco con il komi. */
  sommaPunti = 0
  /** Per ogni figlio della radice, la somma dei punteggi finali visti da chi ha il tratto alla radice. */
  readonly puntiFigli: Float64Array
  simulazioni = 0
  private readonly passiRadice: number
  private readonly cammino: Nodo[] = []
  private readonly scelte: number[] = []

  /** `chiusi`: i territori chiusi non si invadono, ne' nell'albero ne' nelle simulazioni. */
  constructor(p: Posizione, rng: () => number, chiusi: boolean, ultima: number | null) {
    this.radiceGoban = Goban.da(p)
    const geo = this.radiceGoban.geo
    if (ultima !== null && ultima >= 0 && ultima < p.punti.length && p.punti[ultima] !== null) {
      this.radiceGoban.ultima = geo.interni[ultima]
    }
    this.lavoro = new Goban(geo)
    if (chiusi) {
      this.radiceGoban.bloccati = territoriChiusi(this.radiceGoban)
      this.lavoro.bloccati = this.radiceGoban.bloccati
    }
    this.caso = new Caso(rng)
    this.amaf = new Int8Array(geo.celle)
    this.finale = new Int8Array(geo.celle)
    this.possesso = new Float64Array(geo.celle)
    this.passiRadice = p.passi
    this.radice = espandi(this.radiceGoban, true)
    priorScale(this.radiceGoban, this.radice)
    this.puntiFigli = new Float64Array(this.radice.mosse.length)
  }

  /** Il punteggio medio dopo il figlio `i` della radice, per chi ha il tratto alla radice. */
  media(i: number): number {
    const v = this.radice.stat[i * CAMPI + VERE]
    return v > 0 ? this.puntiFigli[i] / v : 0
  }

  simula(): void {
    const g = this.lavoro
    g.copia(this.radiceGoban)
    const { amaf, cammino, scelte, caso } = this
    amaf.fill(0)
    let nodo = this.radice
    let profondita = 0
    let passi = this.passiRadice
    for (;;) {
      const i = seleziona(nodo, caso)
      cammino[profondita] = nodo
      scelte[profondita] = i
      profondita += 1
      const m = nodo.mosse[i]
      if (m === PASSA) {
        g.passa()
        passi += 1
      } else {
        if (amaf[m] === 0) amaf[m] = g.tratto
        g.gioca(m)
        passi = 0
      }
      if (passi >= 2) break
      let figlio = nodo.figli[i]
      if (figlio === null) {
        if (nodo.stat[i * CAMPI + VERE] + 1 < ESPANDI) break
        figlio = espandi(g)
        // Anche le risposte alla mossa della radice sanno delle scale: e' li' che chi scappa si perde.
        if (profondita === 1) priorScale(g, figlio)
        nodo.figli[i] = figlio
      }
      nodo = figlio
    }
    if (passi < 2) giocaFinoInFondo(g, caso, POLITICA_RICERCA, amaf, passi)
    const punti = g.area(this.finale) - KOMI
    const { interni } = g.geo
    for (let j = 0; j < interni.length; j += 1) this.possesso[interni[j]] += this.finale[interni[j]]
    const riferimento = this.simulazioni > 0 ? this.sommaPunti / this.simulazioni : punti
    this.sommaPunti += punti
    this.puntiFigli[scelte[0]] += this.radiceGoban.tratto === NERO ? punti : -punti
    const vinceNero = punti > 0
    // Il premio e' soprattutto la vittoria, e un poco il margine: a partita decisa
    // le vittorie sono tutte uguali, e senza i punti l'albero non saprebbe piu'
    // distinguere una mossa che guadagna da una che regala. Il margine si misura
    // rispetto a quello medio della ricerca, che a partita decisa e' lontano da
    // zero: sono i punti in piu' o in meno che contano.
    const scarto = Math.tanh((punti - riferimento) / g.geo.lato)
    const premioNero = (vinceNero ? 1 - PESO_PUNTI : 0) + PESO_PUNTI * (0.5 + 0.5 * scarto)
    for (let j = 0; j < profondita; j += 1) {
      const n = cammino[j]
      const i = scelte[j]
      const nero = n.tratto === NERO
      const vince = nero === vinceNero ? 1 : 0
      const premio = nero ? premioNero : 1 - premioNero
      const st = n.stat
      st[i * CAMPI + VERE] += 1
      st[i * CAMPI + VINTE_VERE] += vince
      st[i * CAMPI + VISITE] += 1
      st[i * CAMPI + VINTE] += premio
      const mosse = n.mosse
      const t = n.tratto
      for (let k = 0; k < mosse.length; k += 1) {
        if (amaf[mosse[k]] === t) {
          st[k * CAMPI + VISITE_AMAF] += 1
          st[k * CAMPI + VINTE_AMAF] += premio
        }
      }
    }
    this.simulazioni += 1
  }
}

/** Le simulazioni fino al tetto o al tempo; si smette prima se la mossa piu' visitata non puo' piu' cambiare. */
function cerca(r: Ricerca, simulazioni: number, tempoMs: number): void {
  const inizio = adesso()
  const scadenza = inizio + tempoMs
  const st = r.radice.stat
  const k = r.radice.mosse.length
  while (r.simulazioni < simulazioni) {
    r.simula()
    if (tempoMs !== Infinity && adesso() > scadenza) break
    if (r.simulazioni % 64 === 0 && k > 1) {
      let prima = 0
      let seconda = 0
      for (let i = 0; i < k; i += 1) {
        const v = st[i * CAMPI + VERE]
        if (v > prima) {
          seconda = prima
          prima = v
        } else if (v > seconda) seconda = v
      }
      let restano = simulazioni - r.simulazioni
      if (tempoMs !== Infinity) {
        const trascorso = adesso() - inizio
        restano = Math.min(restano, ((scadenza - adesso()) * r.simulazioni) / Math.max(trascorso, 1e-3))
      }
      if (prima - seconda > restano) break
    }
  }
}

/* ─────────────────────────────  La mossa  ───────────────────────────── */

interface Livello {
  /** Il tetto delle simulazioni sul 9x9; sui goban piu' grandi si scala con l'area. */
  readonly simulazioni: number
  /** Il minimo, sui goban grandi. */
  readonly minime: number
  readonly tempoMs: number
  /** La probabilità che la scelta finale sia a caso fra le mosse che la ricerca ha guardato di piu'. */
  readonly caso: number
}

const LIVELLI: Record<LivelloGo, Livello> = {
  facile: { simulazioni: 300, minime: 100, tempoMs: 140, caso: 0.5 },
  normale: { simulazioni: 5000, minime: 500, tempoMs: 500, caso: 0 },
  difficile: { simulazioni: 25000, minime: 1500, tempoMs: 1500, caso: 0 },
}

/** Un punto e' di qualcuno se le simulazioni glielo danno almeno quattro volte su cinque (possesso ±0,6). */
const SICURO = 0.6
/** Oltre questa probabilità di vincere, o sotto il suo complemento, la partita e' decisa. */
const DECISA = 0.9
/** Una partita persa con meno di così e' persa senza speranza. */
const SPERANZA = 0.15
/** Da quante pietre un gruppo in atari si prende senza pensarci. */
const PRESA_GRANDE = 3
/**
 * La ricerca principale ha tre quarti del tempo; l'ultimo quarto resta alle
 * due ricerche che verificano il passo, quando servono, così la risposta non
 * supera mai il tempo del livello. Le simulazioni di ognuna sono un terzo.
 */
const PARTE_RICERCA = 0.75
const PARTE_PASSO = 0.3

/**
 * La mossa del computer (anche il passo). `storia` sono le chiavi di
 * ripetizione delle posizioni precedenti, per non rifare una posizione la
 * terza volta quando si sta vincendo.
 */
export function mossaDelComputer(
  p: Posizione,
  livello: LivelloGo,
  rng: () => number,
  storia: readonly string[] = [],
  opzioni: OpzioniGo = {},
): Mossa {
  if (p.passi >= 2) return PASSO
  const inizio = adesso()
  const conf = LIVELLI[livello]
  const scala = Math.min(1, 81 / (p.lato * p.lato))
  const simulazioni = opzioni.simulazioni ?? Math.max(conf.minime, Math.round(conf.simulazioni * scala))
  const tempoMs = opzioni.tempoMs ?? (opzioni.simulazioni !== undefined ? Infinity : conf.tempoMs)

  // L'avversario ha passato: se la partita chiusa qui e' vinta, si chiude.
  if (p.passi === 1) {
    const dopo = gioca(p, PASSO)
    if (punteggio(dopo, stima(dopo, rng, SIMULAZIONI_PASSO)).vincitore === p.tratto) return PASSO
  }

  const r = new Ricerca(p, rng, false, opzioni.ultima ?? null)
  if (r.radice.mosse.length === 1 && r.radice.mosse[0] === PASSA) return PASSO
  cerca(r, simulazioni, Math.max(1, inizio + tempoMs * PARTE_RICERCA - adesso()))
  const { scelta, passabile, vinte } = decidi(r, conf, rng)

  let passo = false
  if (passabile) {
    // Chiuderebbe l'avversario, e la partita e' persa comunque; oppure regalargli una mossa non costa niente.
    if (p.passi === 1) passo = vinte < SPERANZA
    else {
      const resto = Math.max(0, inizio + tempoMs - adesso()) / 2
      passo = passoInnocuo(p, rng, Math.ceil(simulazioni * PARTE_PASSO), resto)
    }
  }
  return verificata(p, r, passo ? PASSA : scelta, storia)
}

/** L'indice dei figli della radice dal piu' visitato. */
function ordinati(nodo: Nodo): number[] {
  const st = nodo.stat
  return Array.from(nodo.mosse, (_, i) => i).sort(
    (a, b) => st[b * CAMPI + VERE] - st[a * CAMPI + VERE] || st[b * CAMPI + VISITE] - st[a * CAMPI + VISITE],
  )
}

/** La frazione di simulazioni vinte dopo il figlio `i`, senza i prior; mezzo se non ne ha. */
function vittorie(nodo: Nodo, i: number): number {
  const v = nodo.stat[i * CAMPI + VERE]
  return v > 0 ? nodo.stat[i * CAMPI + VINTE_VERE] / v : 0.5
}

/**
 * Dopo la ricerca, la mossa: la piu' visitata, che e' la piu' sicura (una mossa
 * poco visitata ha statistiche che l'albero non ha ancora messo alla prova).
 * L'eccezione e' a partita decisa, quando la piu' visitata cade su un punto gia'
 * di qualcuno e restano pietre in atari da prendere o da salvare: si fa quello.
 * `passabile` dice che non resta niente da fare: niente da prendere, da
 * salvare, da chiudere.
 */
function decidi(r: Ricerca, conf: Livello, rng: () => number): { scelta: number; passabile: boolean; vinte: number } {
  const radice = r.radice
  const st = radice.stat
  const ordine = ordinati(radice)
  const migliore = ordine[0]
  const vinte = vittorie(radice, migliore)
  const decisa = vinte >= DECISA || vinte <= 1 - DECISA
  let scelta = radice.mosse[migliore]
  const verso = r.radiceGoban.tratto === NERO ? 1 : -1
  const quante = Math.max(1, r.simulazioni)
  const margine = (verso * r.sommaPunti) / quante
  const { utili, urgenti, dame, prese } = mosseUtili(r)
  if (Math.abs(margine) <= dame.size + 1.5) for (const d of dame) utili.add(d)

  if (decisa && urgenti.size > 0 && !urgenti.has(scelta) && Math.abs(r.possesso[scelta] / quante) >= SICURO) {
    const serve = ordine.find((i) => urgenti.has(radice.mosse[i]))
    if (serve !== undefined) scelta = radice.mosse[serve]
  }
  // Un gruppo grande in atari si prende subito, se la ricerca non vede niente di chiaramente
  // meglio: aspettare (una rete, una scala) di rado vale di piu', e rischia sempre.
  if (!urgenti.has(scelta)) {
    const presa = ordine.find((i) => (prese.get(radice.mosse[i]) ?? 0) >= PRESA_GRANDE)
    if (presa !== undefined && st[presa * CAMPI + VERE] >= 20 && vittorie(radice, presa) >= vinte - 0.05) {
      scelta = radice.mosse[presa]
    }
  }

  // Il facile, una volta ogni tanto, sceglie a caso fra le mosse che la ricerca ha guardato di piu'.
  if (conf.caso > 0 && rng() < conf.caso) {
    const buone = ordine.filter((i) => st[i * CAMPI + VERE] >= 2).slice(0, 6)
    if (buone.length > 1) {
      const pesi = buone.map((i) => st[i * CAMPI + VERE] ** 2)
      let x = rng() * pesi.reduce((a, b) => a + b, 0)
      for (let j = 0; j < buone.length; j += 1) {
        x -= pesi[j]
        if (x <= 0) {
          scelta = radice.mosse[buone[j]]
          break
        }
      }
    }
  }
  return { scelta, passabile: urgenti.size === 0 && utili.size === 0, vinte }
}

/**
 * Passare regala una mossa all'avversario: e' innocuo solo se non gli serve a
 * niente. Lo dicono due ricerche piccole, una dalla posizione e una dopo il
 * passo con l'avversario al tratto: se con la mossa in piu' lui non vince piu'
 * spesso e non guadagna piu' di una dama o due (e le dame contano solo in una
 * partita stretta), si puo' passare. Le simulazioni da sole non basterebbero:
 * giocano a caso, e un punto vitale lasciato libero lo troverebbero di rado.
 * Nelle due ricerche i territori chiusi non si invadono: a caso ci si vive piu'
 * spesso di quanto farebbe chiunque, e ogni passo sembrerebbe un regalo.
 */
function passoInnocuo(p: Posizione, rng: () => number, simulazioni: number, tempoMs: number): boolean {
  const prima = new Ricerca(p, rng, true, null)
  if (prima.radice.mosse.length === 1 && prima.radice.mosse[0] === PASSA) return true
  const dopo = new Ricerca(gioca(p, PASSO), rng, true, null)
  if (dopo.radice.mosse.length === 1 && dopo.radice.mosse[0] === PASSA) return true
  cerca(prima, simulazioni, tempoMs)
  cerca(dopo, simulazioni, tempoMs)
  const mia = ordinati(prima.radice)[0]
  const loro = ordinati(dopo.radice)[0]
  if (1 - vittorie(dopo.radice, loro) < vittorie(prima.radice, mia) - 0.03) return false
  const puntiDopo = -dopo.media(loro)
  const costo = prima.media(mia) - puntiDopo
  return costo <= 0.6 || (costo <= 2 && Math.abs(puntiDopo) >= 5)
}

/**
 * Le mosse che servono ancora: prendere un gruppo in atari, salvarne uno
 * proprio che non sia gia' perso, giocare su un punto che le simulazioni non
 * sanno di chi sia, fuori dai territori chiusi. I punti incerti fra due muri
 * ormai vivi sono dame, e contano solo se la partita e' stretta.
 */
function mosseUtili(r: Ricerca): {
  utili: Set<number>
  urgenti: Set<number>
  dame: Set<number>
  prese: Map<number, number>
} {
  const g = r.radiceGoban
  const { colore, capo, pietre, seguente } = g
  const { interni, lati } = g.geo
  const c = g.tratto
  const a = 3 - c
  const verso = c === NERO ? 1 : -1
  const quante = Math.max(1, r.simulazioni)
  const mio = (s: number) => (verso * r.possesso[s]) / quante
  const utili = new Set<number>()
  const urgenti = new Set<number>()
  const dame = new Set<number>()
  /** Le catture, e quante pietre prende ognuna. */
  const prese = new Map<number, number>()
  const buona = (s: number) => g.legale(s) && !g.occhio(s, c) && g.autoAtari(s, c) <= 1

  for (let j = 0; j < interni.length; j += 1) {
    const s = interni[j]
    const x = colore[s]
    if ((x !== NERO && x !== BIANCO) || capo[s] !== s || !g.inAtari(s)) continue
    const lib = g.libertaDi(s)
    if (x === a) {
      if (g.legale(lib) && (pietre[s] > 1 || g.libertaDopo(lib, c, 2) >= 2)) {
        urgenti.add(lib)
        prese.set(lib, (prese.get(lib) ?? 0) + pietre[s])
      }
      continue
    }
    // Un gruppo proprio in atari: si salva se non e' gia' dell'avversario.
    let somma = 0
    let t = s
    do {
      somma += mio(t)
      t = seguente[t]
    } while (t !== s)
    if (somma / pietre[s] <= -SICURO) continue
    const n = g.contrattacchi(s, g.candidati, 0)
    for (let i = 0; i < n; i += 1) if (g.legale(g.candidati[i])) urgenti.add(g.candidati[i])
    if (g.legale(lib) && g.libertaDopo(lib, c, 2) >= 2) urgenti.add(lib)
  }

  // I territori chiusi non si guardano: a fine partita nessuno ci entra, anche se le
  // simulazioni, giocando a caso, ogni tanto ci vivono.
  const chiusi = territoriChiusi(g)
  for (let i = 0; i < g.nVuoti; i += 1) {
    const s = g.vuoti[i]
    if (chiusi[s] !== 0 || Math.abs(mio(s)) >= SICURO || !buona(s)) continue
    if (dama(s)) dame.add(s)
    else utili.add(s)
  }
  return { utili, urgenti, dame, prese }

  /** La zona vuota del punto e' piccola, tocca tutti e due i colori, e i muri attorno sono vivi e sicuri. */
  function dama(s: number): boolean {
    const zona = [s]
    const vista = new Set(zona)
    let tocca = 0
    for (let i = 0; i < zona.length; i += 1) {
      for (let d = 0; d < 4; d += 1) {
        const v = zona[i] + lati[d]
        const x = colore[v]
        if (x === FUORI) continue
        if (x === VUOTO) {
          if (vista.has(v)) continue
          if (Math.abs(mio(v)) >= SICURO || zona.length >= 4) return false
          vista.add(v)
          zona.push(v)
        } else {
          tocca |= x
          // La pietra resta di chi e' quasi sempre.
          if ((x === c ? 1 : -1) * mio(v) < 0.8) return false
        }
      }
    }
    return tocca === 3
  }
}

/**
 * L'ultima verifica: la mossa e' legale per le regole (non solo per la
 * ricerca), e se rifarebbe una posizione per la terza volta — una patta — la si
 * gioca solo se la partita e' persa; altrimenti la migliore dopo di lei.
 */
function verificata(p: Posizione, r: Ricerca, scelta: number, storia: readonly string[]): Mossa {
  const geo = r.radiceGoban.geo
  const mossaDa = (s: number): Mossa => (s === PASSA ? PASSO : { tipo: 'pietra', punto: geo.aPunto[s] })
  const ripete = (m: Mossa) => {
    if (m.tipo === 'passo' || storia.length < 2) return false
    const chiave = chiaveRipetizione(gioca(p, m))
    let volte = 0
    for (const c of storia) if (c === chiave) volte += 1
    return volte >= 2
  }
  const prima = mossaDa(scelta)
  if (!legale(p, prima)) return PASSO
  if (!ripete(prima)) return prima
  const radice = r.radice
  const i = radice.mosse.indexOf(scelta)
  if (i >= 0 && vittorie(radice, i) < 0.5) return prima
  for (const j of ordinati(radice)) {
    const m = mossaDa(radice.mosse[j])
    if (legale(p, m) && !ripete(m)) return m
  }
  return PASSO
}

/* ─────────────────────────────  Le pietre morte  ───────────────────────────── */

/** Le simulazioni della stima. */
const SIMULAZIONI_STIMA = 400
/** Quelle della stima con cui il computer decide se passare. */
const SIMULAZIONI_PASSO = 200
/** Un gruppo che le simulazioni lasciano vivo almeno così spesso non si da' per morto. */
const SOGLIA_VIVE = 0.75
/** Un occhio grande almeno così basta per farne due. */
const OCCHIO_GRANDE = 7
/** Un territorio chiuso grande almeno così, nelle simulazioni della stima, non si invade. */
const TERRITORIO_CHIUSO = 7
/** Due gruppi vicini di colore diverso che muoiono tutti e due almeno così spesso, e mai insieme, sono in seki. */
const SEKI = 0.25
const SEKI_INSIEME = 0.05

/** Le pietre probabilmente morte, a gioco fermo: deterministica a parita' di rng. */
export function stimaMorte(p: Posizione, rng: () => number): number[] {
  return stima(p, rng, SIMULAZIONI_STIMA)
}

interface Gruppo {
  readonly colore: number
  readonly pietre: number[]
}

function stima(p: Posizione, rng: () => number, quante: number): number[] {
  const g0 = Goban.da(p)
  const geo = g0.geo
  const { colore, capo, seguente } = g0
  const gruppi: Gruppo[] = []
  const gruppoDi = new Int32Array(geo.celle).fill(-1)
  for (const s of geo.interni) {
    const x = colore[s]
    if ((x !== NERO && x !== BIANCO) || capo[s] !== s) continue
    const pietre: number[] = []
    let t = s
    do {
      pietre.push(t)
      gruppoDi[t] = gruppi.length
      t = seguente[t]
    } while (t !== s)
    gruppi.push({ colore: x, pietre })
  }
  if (gruppi.length === 0) return []

  // Le coppie di gruppi vicini di colore diverso, per riconoscere i seki.
  const coppie: number[] = []
  const viste = new Set<number>()
  for (let a = 0; a < gruppi.length; a += 1) {
    for (const s of gruppi[a].pietre) {
      for (const d of geo.lati) {
        const b = gruppoDi[s + d]
        if (b < 0 || gruppi[b].colore === gruppi[a].colore) continue
        const chiave = Math.min(a, b) * gruppi.length + Math.max(a, b)
        if (viste.has(chiave)) continue
        viste.add(chiave)
        coppie.push(Math.min(a, b), Math.max(a, b))
      }
    }
  }

  // Le simulazioni. I territori chiusi e grandi restano come sono: dopo due
  // passi nessuno dei due ci giocherebbe, e a caso invece li si invade, e ci si
  // vive, piu' spesso di quanto farebbe chiunque.
  const g = new Goban(geo)
  g.bloccati = territoriChiusi(g0)
  const caso = new Caso(rng)
  const finale = new Int8Array(geo.celle)
  const morti = new Int32Array(gruppi.length)
  const insieme = new Int32Array(coppie.length / 2)
  const mortoOra = new Uint8Array(gruppi.length)
  for (let i = 0; i < quante; i += 1) {
    g.copia(g0)
    // A gioco fermo non conta chi muove: meta' delle simulazioni comincia l'altro.
    if (i % 2 === 1) {
      g.tratto = 3 - g.tratto
      g.ko = 0
    }
    giocaFinoInFondo(g, caso, POLITICA_STIMA, null, 0)
    g.area(finale)
    for (let j = 0; j < gruppi.length; j += 1) {
      const { colore: c, pietre } = gruppi[j]
      const suo = c === NERO ? 1 : -1
      let suoi = 0
      for (const s of pietre) if (finale[s] === suo) suoi += 1
      const morto = suoi * 2 < pietre.length ? 1 : 0
      mortoOra[j] = morto
      morti[j] += morto
    }
    for (let j = 0; j < insieme.length; j += 1) {
      if (mortoOra[coppie[2 * j]] && mortoOra[coppie[2 * j + 1]]) insieme[j] += 1
    }
  }
  const vive = Array.from(morti, (m) => 1 - m / quante)

  // Due gruppi che si uccidono a vicenda — muoiono tutti e due spesso, e mai
  // insieme — sono in un seki, o in una lotta che nessuno ha chiuso: vivi.
  const inSeki = new Uint8Array(gruppi.length)
  for (let j = 0; j < insieme.length; j += 1) {
    const a = coppie[2 * j]
    const b = coppie[2 * j + 1]
    if (morti[a] >= SEKI * quante && morti[b] >= SEKI * quante && insieme[j] <= SEKI_INSIEME * quante) {
      inSeki[a] = 1
      inSeki[b] = 1
    }
  }

  // Si toglie un gruppo alla volta, dal piu' debole: senza due occhi (o un
  // occhio grande), vivo in meno di tre simulazioni su quattro, e chiuso da
  // gruppi piu' forti di lui. Tolto un gruppo, chi lo circondava puo' avere
  // guadagnato un occhio: si ricontano.
  const morto = new Uint8Array(gruppi.length)
  for (;;) {
    const sicuri = gruppiSicuri(g0, gruppi, gruppoDi, morto)
    const candidati = gruppi
      .map((_, j) => j)
      .filter((j) => !morto[j] && !sicuri[j] && !inSeki[j] && vive[j] < SOGLIA_VIVE)
      .sort((a, b) => vive[a] - vive[b])
    const scelto = candidati.find((j) =>
      circondanti(g0, gruppi, gruppoDi, morto, j).every((k) => sicuri[k] || vive[k] > vive[j] + 0.1),
    )
    if (scelto === undefined) break
    morto[scelto] = 1
  }

  const fuori: number[] = []
  gruppi.forEach((gr, j) => {
    if (morto[j]) for (const s of gr.pietre) fuori.push(geo.aPunto[s])
  })
  return fuori.sort((x, y) => x - y)
}

/**
 * I territori chiusi: le zone vuote di almeno sette punti, e non piu' di meta'
 * goban, che toccano pietre di un colore solo. Per ogni punto, chi lo chiude.
 */
function territoriChiusi(g: Goban): Uint8Array {
  const { colore } = g
  const { celle, interni, lati } = g.geo
  const chiusi = new Uint8Array(celle)
  const visti = new Uint8Array(celle)
  for (const s of interni) {
    if (colore[s] !== VUOTO || visti[s]) continue
    const zona = [s]
    visti[s] = 1
    let tocca = 0
    for (let i = 0; i < zona.length; i += 1) {
      for (const d of lati) {
        const v = zona[i] + d
        const x = colore[v]
        if (x === VUOTO) {
          if (!visti[v]) {
            visti[v] = 1
            zona.push(v)
          }
        } else if (x !== FUORI) tocca |= x
      }
    }
    // Una zona di meta' goban o piu' non e' un territorio: all'inizio della partita, con
    // una pietra sola, tutto il goban toccherebbe un colore solo.
    const territorio = zona.length >= TERRITORIO_CHIUSO && zona.length * 2 <= interni.length
    if ((tocca === NERO || tocca === BIANCO) && territorio) for (const v of zona) chiusi[v] = tocca
  }
  return chiusi
}

/**
 * I gruppi che vivono di sicuro, a colpo d'occhio: quelli con due occhi, o con
 * un occhio grande. Un occhio e' una zona senza pietre vive dell'altro colore,
 * chiusa da pietre proprie (le pietre morte contano come vuote); un occhio di
 * un punto solo vale se non e' falso. I gruppi che chiudono lo stesso occhio lo
 * condividono, e vivono o muoiono insieme.
 */
function gruppiSicuri(g: Goban, gruppi: readonly Gruppo[], gruppoDi: Int32Array, morto: Uint8Array): Uint8Array {
  const { colore } = g
  const { celle, interni, lati, w } = g.geo
  const sicuri = new Uint8Array(gruppi.length)
  const vivo = (s: number) => {
    const j = gruppoDi[s]
    return j >= 0 && !morto[j]
  }
  for (const c of [NERO, BIANCO]) {
    const padre = gruppi.map((_, j) => j)
    const radice = (j: number): number => (padre[j] === j ? j : (padre[j] = radice(padre[j])))
    const occhi: { grandezza: number; gruppi: number[] }[] = []
    const visti = new Uint8Array(celle)
    for (const s of interni) {
      if (visti[s] || (colore[s] === c && vivo(s))) continue
      const zona = [s]
      visti[s] = 1
      let pulita = true
      const bordo = new Set<number>()
      for (let i = 0; i < zona.length; i += 1) {
        const t = zona[i]
        if (colore[t] === 3 - c && vivo(t)) pulita = false
        for (const d of lati) {
          const v = t + d
          if (colore[v] === FUORI) continue
          if (colore[v] === c && vivo(v)) bordo.add(gruppoDi[v])
          else if (!visti[v]) {
            visti[v] = 1
            zona.push(v)
          }
        }
      }
      if (!pulita || bordo.size === 0) continue
      if (zona.length === 1) {
        // Un occhio falso: troppe diagonali dell'avversario (una sola basta sul bordo).
        let falsi = 0
        let lato = 0
        for (const d of [-w - 1, -w + 1, w - 1, w + 1]) {
          const v = s + d
          if (colore[v] === FUORI) lato = 1
          else if (colore[v] === 3 - c && vivo(v)) falsi += 1
        }
        if (falsi + lato >= 2) continue
      }
      const chi = [...bordo]
      for (const j of chi) padre[radice(j)] = radice(chi[0])
      occhi.push({ grandezza: zona.length, gruppi: chi })
    }
    const conti = new Map<number, { occhi: number; grande: boolean }>()
    for (const o of occhi) {
      const r = radice(o.gruppi[0])
      const conto = conti.get(r) ?? { occhi: 0, grande: false }
      conto.occhi += 1
      if (o.grandezza >= OCCHIO_GRANDE) conto.grande = true
      conti.set(r, conto)
    }
    gruppi.forEach((gr, j) => {
      if (gr.colore !== c || morto[j]) return
      const conto = conti.get(radice(j))
      if (conto && (conto.occhi >= 2 || conto.grande)) sicuri[j] = 1
    })
  }
  return sicuri
}

/** I gruppi vivi dell'avversario che chiudono la zona del gruppo `j`: vuoti, pietre morte e pietre sue. */
function circondanti(
  g: Goban,
  gruppi: readonly Gruppo[],
  gruppoDi: Int32Array,
  morto: Uint8Array,
  j: number,
): number[] {
  const { colore } = g
  const { celle, lati } = g.geo
  const c = gruppi[j].colore
  const visti = new Uint8Array(celle)
  const zona = [...gruppi[j].pietre]
  for (const s of zona) visti[s] = 1
  const fuori = new Set<number>()
  for (let i = 0; i < zona.length; i += 1) {
    for (const d of lati) {
      const v = zona[i] + d
      if (visti[v] || colore[v] === FUORI) continue
      const k = gruppoDi[v]
      if (colore[v] === 3 - c && !morto[k]) {
        fuori.add(k)
        continue
      }
      visti[v] = 1
      zona.push(v)
    }
  }
  return [...fuori]
}

/* ─────────────────────────────  Per i test  ───────────────────────────── */

/** Quante simulazioni al secondo fa il motore da una posizione, senza albero: per misurare. */
export function simulazioniAlSecondo(p: Posizione, rng: () => number, durataMs = 1000): number {
  const g0 = Goban.da(p)
  const g = new Goban(g0.geo)
  const caso = new Caso(rng)
  const inizio = adesso()
  let n = 0
  while (adesso() - inizio < durataMs) {
    g.copia(g0)
    giocaFinoInFondo(g, caso, POLITICA_RICERCA, null, 0)
    g.area(null)
    n += 1
  }
  return (n * 1000) / (adesso() - inizio)
}

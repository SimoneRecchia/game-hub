/**
 * Il computer di Forza 4.
 *
 * E' una ricerca alfa-beta (negamax) sulle mosse possibili, con una
 * valutazione che guarda le **finestre**: le 69 file di quattro caselle in cui
 * si puo' fare quattro. Una finestra con dischi di tutti e due non vale piu'
 * niente; una con tre dischi miei e una casella vuota e' una minaccia, e vale
 * molto; una con due vale poco; i dischi nella colonna di mezzo, che sta in piu'
 * finestre di tutte, valgono qualcosa di loro. La valutazione si tiene
 * aggiornata a ogni disco messo o tolto, guardando solo le finestre che passano
 * da quella casella (al massimo tredici): per questo la ricerca va in
 * profondita' anche su un telefono.
 *
 * Le mosse si provano dal centro verso i bordi, che e' quasi sempre l'ordine
 * giusto, e prima quella che era la migliore al giro precedente (tabella delle
 * trasposizioni): con un buon ordine l'alfa-beta taglia la maggior parte
 * dell'albero.
 *
 * Tre livelli:
 *  - **facile** guarda una mossa avanti e la sua risposta, con un po' di caso
 *    nella valutazione: vede le minacce piu' evidenti, non quelle preparate;
 *  - **normale** guarda sei mosse avanti (tre per parte);
 *  - **difficile** va in profondita' finché ha tempo, circa un secondo: a meta'
 *    partita vede la fine, e sbaglia raramente.
 */

import { CASELLE, COLONNE, RIGHE, casellaDi, type Disco, type PosizioneForza4 } from './forza4'

export type LivelloForza4 = 'facile' | 'normale' | 'difficile'

export const LIVELLI_FORZA4: readonly LivelloForza4[] = ['facile', 'normale', 'difficile']

/** Dal centro verso i bordi: nel Forza 4 la colonna di mezzo e' la piu' preziosa. */
const ORDINE = [3, 2, 4, 1, 5, 0, 6]

/** Le file di quattro caselle, e per ogni casella quelle che la contengono. */
const FINESTRE: readonly number[][] = (() => {
  const finestre: number[][] = []
  for (let r = 0; r < RIGHE; r += 1) {
    for (let c = 0; c < COLONNE; c += 1) {
      for (const [dr, dc] of [
        [0, 1],
        [1, 0],
        [1, 1],
        [1, -1],
      ]) {
        const rFine = r + 3 * dr
        const cFine = c + 3 * dc
        if (rFine < 0 || rFine >= RIGHE || cFine < 0 || cFine >= COLONNE) continue
        finestre.push([0, 1, 2, 3].map((i) => casellaDi(r + i * dr, c + i * dc)))
      }
    }
  }
  return finestre
})()

const FINESTRE_DI: readonly number[][] = (() => {
  const di: number[][] = Array.from({ length: CASELLE }, () => [])
  FINESTRE.forEach((f, w) => {
    for (const k of f) di[k].push(w)
  })
  return di
})()

/** Quanto vale, per il primo giocatore, una finestra con `a` dischi suoi e `b` dell'altro. */
function valoreFinestra(a: number, b: number): number {
  if (a > 0 && b > 0) return 0
  if (a === 3) return 50
  if (a === 2) return 10
  if (a === 1) return 1
  if (b === 3) return -50
  if (b === 2) return -10
  if (b === 1) return -1
  return 0
}

const CENTRO = 3
const BONUS_CENTRO = 3
const VITTORIA = 1_000_000

/** Il limite della tabella delle trasposizioni: oltre, si svuota e si ricomincia. */
const TABELLA_MASSIMA = 400_000

/**
 * Il tavoliere della ricerca: le caselle, le altezze delle colonne, i conti di
 * ogni finestra e la valutazione, tutti aggiornati a ogni disco messo o tolto.
 */
class Ricerca {
  readonly celle = new Int8Array(CASELLE).fill(-1)
  readonly altezze = new Int8Array(COLONNE)
  readonly conti = [new Uint8Array(FINESTRE.length), new Uint8Array(FINESTRE.length)]
  /** La valutazione dal punto di vista del primo giocatore. */
  valore = 0
  /** L'impronta della posizione, per la tabella: due numeri a caso per casella e disco. */
  impronta = 0
  dischi = 0
  nodi = 0
  readonly tabella = new Map<number, { profondita: number; valore: number; tipo: 0 | 1 | 2; mossa: number }>()
  scadenza = Infinity
  interrotta = false

  constructor(
    p: PosizioneForza4,
    private readonly zobrist: readonly Float64Array[],
  ) {
    for (let k = 0; k < CASELLE; k += 1) {
      const d = p.caselle[k]
      if (d !== null) this.metti(k, d)
    }
  }

  metti(k: number, d: Disco): boolean {
    this.celle[k] = d
    this.altezze[k % COLONNE] += 1
    this.dischi += 1
    this.impronta += this.zobrist[d][k]
    if (k % COLONNE === CENTRO) this.valore += d === 0 ? BONUS_CENTRO : -BONUS_CENTRO
    let quattro = false
    const mie = this.conti[d]
    const sue = this.conti[1 - d]
    for (const w of FINESTRE_DI[k]) {
      const prima = d === 0 ? valoreFinestra(mie[w], sue[w]) : valoreFinestra(sue[w], mie[w])
      mie[w] += 1
      if (mie[w] === 4) quattro = true
      this.valore += (d === 0 ? valoreFinestra(mie[w], sue[w]) : valoreFinestra(sue[w], mie[w])) - prima
    }
    return quattro
  }

  togli(k: number, d: Disco): void {
    const mie = this.conti[d]
    const sue = this.conti[1 - d]
    for (const w of FINESTRE_DI[k]) {
      const prima = d === 0 ? valoreFinestra(mie[w], sue[w]) : valoreFinestra(sue[w], mie[w])
      mie[w] -= 1
      this.valore += (d === 0 ? valoreFinestra(mie[w], sue[w]) : valoreFinestra(sue[w], mie[w])) - prima
    }
    if (k % COLONNE === CENTRO) this.valore -= d === 0 ? BONUS_CENTRO : -BONUS_CENTRO
    this.impronta -= this.zobrist[d][k]
    this.dischi -= 1
    this.altezze[k % COLONNE] -= 1
    this.celle[k] = -1
  }

  /** Il disco nella colonna farebbe quattro? Senza metterlo davvero. */
  vincerebbe(colonna: number, d: Disco): boolean {
    const r = this.altezze[colonna]
    if (r >= RIGHE) return false
    const k = casellaDi(r, colonna)
    const mie = this.conti[d]
    for (const w of FINESTRE_DI[k]) if (mie[w] === 3) return true
    return false
  }

  /**
   * Negamax con alfa-beta: il valore della posizione per chi ha il tratto
   * (`d`). `ply` e' la distanza dalla radice, e accorcia le vittorie: fra due
   * vittorie la piu' vicina vale di piu'.
   */
  cerca(d: Disco, profondita: number, alfa: number, beta: number, ply: number): number {
    this.nodi += 1
    if ((this.nodi & 1023) === 0 && adesso() > this.scadenza) this.interrotta = true
    if (this.interrotta) return 0
    if (this.dischi === CASELLE) return 0

    // Una vittoria subito non ha bisogno di cercare altro.
    for (const c of ORDINE) if (this.vincerebbe(c, d)) return VITTORIA - ply - 1
    if (profondita === 0) return d === 0 ? this.valore : -this.valore

    const alfaIniziale = alfa
    const voce = this.tabella.get(this.impronta + d)
    let prima = -1
    if (voce) {
      prima = voce.mossa
      if (voce.profondita >= profondita) {
        if (voce.tipo === 0) return voce.valore
        if (voce.tipo === 1 && voce.valore >= beta) return voce.valore
        if (voce.tipo === 2 && voce.valore <= alfa) return voce.valore
      }
    }

    // Se l'altro minaccia di vincere, l'unica mossa che conta e' chiudergli la colonna.
    const altro = (1 - d) as Disco
    let obbligate: number[] | null = null
    for (const c of ORDINE) {
      if (this.vincerebbe(c, altro)) (obbligate ??= []).push(c)
    }
    if (obbligate && obbligate.length > 1) return -(VITTORIA - ply - 2)

    let migliore = -Infinity
    let mossaMigliore = -1
    const mosse = obbligate ?? (prima >= 0 ? [prima, ...ORDINE.filter((c) => c !== prima)] : ORDINE)
    for (const c of mosse) {
      const r = this.altezze[c]
      if (r >= RIGHE) continue
      const k = casellaDi(r, c)
      this.metti(k, d)
      const v = -this.cerca(altro, profondita - 1, -beta, -alfa, ply + 1)
      this.togli(k, d)
      if (this.interrotta) return 0
      if (v > migliore) {
        migliore = v
        mossaMigliore = c
      }
      if (v > alfa) alfa = v
      if (alfa >= beta) break
    }
    if (mossaMigliore < 0) return 0

    if (this.tabella.size > TABELLA_MASSIMA) this.tabella.clear()
    this.tabella.set(this.impronta + d, {
      profondita,
      valore: migliore,
      tipo: migliore <= alfaIniziale ? 2 : migliore >= beta ? 1 : 0,
      mossa: mossaMigliore,
    })
    return migliore
  }
}

const adesso: () => number =
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? () => performance.now()
    : () => Date.now()

/**
 * I numeri dell'impronta: interi fino a 2^40, così la somma di quarantadue
 * resta esatta nei numeri di JavaScript. Sono fissi, da un generatore con un
 * seme suo: la ricerca non dipende dal caso di chi la chiama.
 */
const ZOBRIST: readonly Float64Array[] = (() => {
  let s = 0x2f6b3c19
  const caso = () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return [0, 1].map(() => Float64Array.from({ length: CASELLE }, () => Math.floor(caso() * 2 ** 40) * 2))
})()

/** Quanto pensa il difficile: circa un secondo, di cui si usa quel che serve. */
const TEMPO_DIFFICILE_MS = 900

/**
 * La colonna del computer, o null se non ce ne sono. `rng` sceglie fra le
 * mosse che valgono uguale, e al livello facile aggiunge un po' di disordine.
 */
export function mossaDelComputer(
  p: PosizioneForza4,
  livello: LivelloForza4,
  rng: () => number,
  opzioni: { tempoMs?: number; profondita?: number } = {},
): number | null {
  const ricerca = new Ricerca(p, ZOBRIST)
  const d = p.tratto
  const libere = ORDINE.filter((c) => ricerca.altezze[c] < RIGHE)
  if (libere.length === 0) return null
  if (libere.length === 1) return libere[0]

  // Una vittoria subito si prende sempre, anche al facile: lasciarla sarebbe strano.
  const vincenti = libere.filter((c) => ricerca.vincerebbe(c, d))
  if (vincenti.length > 0) return vincenti[Math.floor(rng() * vincenti.length)]

  if (livello === 'facile') return mossaFacile(ricerca, d, libere, rng)

  const valuta = (profondita: number): Map<number, number> | null => {
    const valori = new Map<number, number>()
    for (const c of libere) {
      const k = casellaDi(ricerca.altezze[c], c)
      ricerca.metti(k, d)
      const v = -ricerca.cerca((1 - d) as Disco, profondita - 1, -Infinity, Infinity, 1)
      ricerca.togli(k, d)
      if (ricerca.interrotta) return null
      valori.set(c, v)
    }
    return valori
  }

  let valori: Map<number, number> | null
  if (livello === 'normale') {
    valori = valuta(6)
  } else {
    // Il primo giro, corto, si fa sempre intero: da lì in poi si va avanti finché c'e' tempo. Con
    // `profondita` (nei test) ci si ferma li' e il tempo non conta: la mossa non dipende dalla macchina.
    valori = valuta(2)
    ricerca.scadenza = opzioni.profondita ? Infinity : adesso() + (opzioni.tempoMs ?? TEMPO_DIFFICILE_MS)
    const fino = Math.min(opzioni.profondita ?? CASELLE, CASELLE - ricerca.dischi)
    for (let profondita = 4; profondita <= fino; profondita += 2) {
      const piuFonda = valuta(profondita)
      if (!piuFonda) break
      valori = piuFonda
      // Una vittoria (o una sconfitta certa) trovata non cambia piu' andando avanti.
      const migliore = Math.max(...piuFonda.values())
      if (Math.abs(migliore) > VITTORIA / 2) break
    }
  }
  return sceltaFraLeMigliori(valori!, rng)
}

/** Fra le mosse che valgono uguale, una a caso: altrimenti il computer giocherebbe sempre la stessa partita. */
function sceltaFraLeMigliori(valori: Map<number, number>, rng: () => number): number {
  const migliore = Math.max(...valori.values())
  const pari = [...valori].filter(([, v]) => v === migliore).map(([c]) => c)
  return pari[Math.floor(rng() * pari.length)]
}

/**
 * Il facile: blocca una vittoria dell'altro quasi sempre, e per il resto
 * guarda la propria mossa e la risposta, con un disordine nella valutazione
 * che gli fa scegliere spesso la seconda o la terza migliore.
 */
function mossaFacile(ricerca: Ricerca, d: Disco, libere: number[], rng: () => number): number {
  const altro = (1 - d) as Disco
  const daChiudere = libere.filter((c) => ricerca.vincerebbe(c, altro))
  if (daChiudere.length > 0 && rng() < 0.85) return daChiudere[0]
  const valori = new Map<number, number>()
  for (const c of libere) {
    const k = casellaDi(ricerca.altezze[c], c)
    ricerca.metti(k, d)
    const v = -ricerca.cerca(altro, 1, -Infinity, Infinity, 1)
    ricerca.togli(k, d)
    valori.set(c, v + (rng() - 0.5) * 60)
  }
  return sceltaFraLeMigliori(valori, rng)
}

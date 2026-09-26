/**
 * Il motore delle mosse dello Scarabeo: tutte le pose legali di un leggio.
 *
 * E' l'algoritmo di Appel e Jacobson ("The world's fastest Scrabble program",
 * 1988), quello che usano da allora quasi tutti i programmi di Scrabble:
 *
 *  1. per ogni casella vuota si calcola quali lettere ci possono stare senza
 *     rompere la parola **trasversale** (i "controlli incrociati");
 *  2. le **ancore** sono le caselle vuote accanto a una tessera: ogni parola
 *     nuova ne deve coprire almeno una;
 *  3. per ogni ancora si costruisce la parte sinistra della parola con le
 *     tessere del leggio, seguendo il DAWG, e poi la si estende verso destra
 *     attraverso l'ancora, passando sulle tessere gia' posate.
 *
 * Le colonne sono le righe del tabellone trasposto: lo stesso codice cerca le
 * parole orizzontali e quelle verticali.
 *
 * I punti si contano mentre si cerca, con le stesse regole di `validaPosa` —
 * premi solo sulle caselle appena coperte, parole trasversali comprese, bonus
 * per le otto tessere — e un test controlla che i due conti coincidano su
 * migliaia di mosse. Il motore non sostituisce `validaPosa`: chi gioca davvero
 * una mossa la fa comunque passare di lì.
 */

import { Dawg, FOGLIA, LETTERE, NUMERO_LETTERE, RADICE, TUTTE, indiceDi } from './dawg'
import {
  BONUS_SCARABEO,
  CENTRO,
  JOLLY,
  LATO,
  PREMI,
  TESSERE_LEGGIO,
  VALORI,
  type Posa,
  type Tabellone,
} from './scarabeo'

export interface MossaTrovata {
  posa: Posa[]
  punti: number
}

const CASELLE = LATO * LATO

/** Il valore di ogni lettera, per indice. */
const VALORE = Int8Array.from([...LETTERE].map((l) => VALORI[l]))

/** Il moltiplicatore di lettera e quello di parola di ogni casella. */
const PER_LETTERA = Int8Array.from(PREMI.map((p) => (p === 'tl' ? 3 : p === 'dl' ? 2 : 1)))
const PER_PAROLA = Int8Array.from(
  PREMI.map((p) => (p === 'tp' ? 3 : p === 'dp' || p === 'centro' ? 2 : 1)),
)

/**
 * Tutte le mosse legali, senza doppioni.
 *
 * `leggio` e' quello del giocatore, con il jolly come "*". Il tabellone non
 * viene toccato. L'ordine delle mosse e' deterministico: stessi ingressi,
 * stesso elenco, che e' quel che rende ripetibile la scelta del computer.
 */
export function mosseLegali(
  dawg: Dawg,
  tab: Tabellone,
  leggio: readonly string[],
  primaMossa: boolean,
): MossaTrovata[] {
  const lettere = new Int8Array(CASELLE).fill(-1)
  const valori = new Int8Array(CASELLE)
  for (let k = 0; k < CASELLE; k += 1) {
    const casella = tab[k]
    if (casella) {
      lettere[k] = indiceDi(casella.lettera)
      valori[k] = casella.jolly ? 0 : VALORE[lettere[k]]
    }
  }

  const mano = new Int8Array(NUMERO_LETTERE)
  let jolly = 0
  for (const t of leggio) {
    if (t === JOLLY) jolly += 1
    else {
      const l = indiceDi(t)
      if (l >= 0) mano[l] += 1
    }
  }

  const trovate: MossaTrovata[] = []
  cerca(dawg, lettere, valori, mano, jolly, primaMossa, true, trovate)
  cerca(dawg, lettere, valori, mano, jolly, primaMossa, false, trovate)
  return trovate
}

/**
 * Le mosse in una direzione.
 *
 * `oriz` dice come leggere le linee: vero, la linea `i` e' la riga `i`; falso,
 * e' la colonna `i`. La posizione `j` lungo la linea diventa una casella con
 * `casellaDi`, e da lì in poi il codice non sa piu' in che verso sta cercando.
 */
function cerca(
  dawg: Dawg,
  lettere: Int8Array,
  valori: Int8Array,
  mano: Int8Array,
  jollyIniziali: number,
  primaMossa: boolean,
  oriz: boolean,
  trovate: MossaTrovata[],
): void {
  const casellaDi = oriz
    ? (i: number, j: number) => i * LATO + j
    : (i: number, j: number) => j * LATO + i

  /*
   * I controlli incrociati: per ogni casella vuota, le lettere ammesse dalla
   * parola trasversale, la somma dei valori delle tessere che la compongono, e
   * se una parola trasversale c'e' davvero.
   */
  const ammesse = new Int32Array(CASELLE).fill(TUTTE)
  const sommaTrasversale = new Int16Array(CASELLE)
  const haTrasversale = new Uint8Array(CASELLE)
  const prima: number[] = []
  const dopo: number[] = []

  for (let i = 0; i < LATO; i += 1) {
    for (let j = 0; j < LATO; j += 1) {
      const k = casellaDi(i, j)
      if (lettere[k] >= 0) continue

      // La trasversale corre lungo l'altro asse: stessa `j`, `i` che cambia.
      prima.length = 0
      dopo.length = 0
      let somma = 0
      for (let ii = i - 1; ii >= 0; ii -= 1) {
        const kk = casellaDi(ii, j)
        if (lettere[kk] < 0) break
        prima.push(lettere[kk])
        somma += valori[kk]
      }
      prima.reverse()
      for (let ii = i + 1; ii < LATO; ii += 1) {
        const kk = casellaDi(ii, j)
        if (lettere[kk] < 0) break
        dopo.push(lettere[kk])
        somma += valori[kk]
      }
      if (prima.length === 0 && dopo.length === 0) continue

      haTrasversale[k] = 1
      sommaTrasversale[k] = somma
      let maschera = 0
      const nodo = prima.length === 0 ? RADICE : dawg.segui(RADICE, prima)
      if (nodo !== FOGLIA) {
        for (let e = nodo; ; e += 1) {
          const chiude = dopo.length === 0 ? dawg.finale(e) : finisceInParola(dawg, dawg.destinazione(e), dopo)
          if (chiude) maschera |= 1 << dawg.lettera(e)
          if (dawg.ultimo(e)) break
        }
      }
      ammesse[k] = maschera
    }
  }

  const piena = (k: number) => lettere[k] >= 0
  const eAncora = (i: number, j: number): boolean => {
    const k = casellaDi(i, j)
    if (piena(k)) return false
    if (primaMossa) return k === CENTRO * LATO + CENTRO
    const r = Math.floor(k / LATO)
    const c = k % LATO
    return (
      (r > 0 && piena(k - LATO)) ||
      (r < LATO - 1 && piena(k + LATO)) ||
      (c > 0 && piena(k - 1)) ||
      (c < LATO - 1 && piena(k + 1))
    )
  }

  // Lo stato della ricerca: le tessere posate finora e i conti della parola.
  const posate: { k: number; l: number; jolly: boolean }[] = []
  let jolly = jollyIniziali
  let sommaPrincipale = 0
  let moltiplicatore = 1
  let trasversali = 0

  const registra = () => {
    // Una tessera sola, con una parola anche nell'altro verso, la trova anche
    // la ricerca orizzontale: nella verticale si salta, per non contarla due volte.
    if (!oriz && posate.length === 1 && haTrasversale[posate[0].k]) return
    const punti =
      sommaPrincipale * moltiplicatore +
      trasversali +
      (posate.length === TESSERE_LEGGIO ? BONUS_SCARABEO : 0)
    trovate.push({
      punti,
      posa: posate.map((p) => ({
        r: Math.floor(p.k / LATO),
        c: p.k % LATO,
        lettera: LETTERE[p.l],
        jolly: p.jolly,
      })),
    })
  }

  /** Mette una tessera sulla casella `k` e aggiorna i conti. Restituisce il valore da togliere dopo. */
  const posa = (k: number, l: number, comeJolly: boolean) => {
    const valore = comeJolly ? 0 : VALORE[l] * PER_LETTERA[k]
    sommaPrincipale += valore
    moltiplicatore *= PER_PAROLA[k]
    const incrocio = haTrasversale[k] ? (sommaTrasversale[k] + valore) * PER_PAROLA[k] : 0
    trasversali += incrocio
    posate.push({ k, l, jolly: comeJolly })
    if (comeJolly) jolly -= 1
    else mano[l] -= 1
    return { valore, incrocio }
  }

  const togli = (k: number, l: number, comeJolly: boolean, conto: { valore: number; incrocio: number }) => {
    sommaPrincipale -= conto.valore
    moltiplicatore /= PER_PAROLA[k]
    trasversali -= conto.incrocio
    posate.pop()
    if (comeJolly) jolly += 1
    else mano[l] += 1
  }

  /**
   * Estende la parola verso destra dalla posizione `j` della linea `i`.
   * `lunghezza` e' quante lettere ha gia' la parola.
   */
  const estendi = (i: number, nodo: number, j: number, lunghezza: number) => {
    if (j >= LATO || nodo === FOGLIA) return
    const k = casellaDi(i, j)
    const finisceQui = j + 1 >= LATO || !piena(casellaDi(i, j + 1))

    if (piena(k)) {
      const e = dawg.arco(nodo, lettere[k])
      if (e < 0) return
      sommaPrincipale += valori[k]
      if (finisceQui && dawg.finale(e) && posate.length > 0 && lunghezza + 1 >= 2) registra()
      estendi(i, dawg.destinazione(e), j + 1, lunghezza + 1)
      sommaPrincipale -= valori[k]
      return
    }

    const maschera = ammesse[k]
    if (maschera === 0) return
    for (let e = nodo; ; e += 1) {
      const l = dawg.lettera(e)
      if ((maschera >> l) & 1) {
        const opzioni = (mano[l] > 0 ? 1 : 0) + (jolly > 0 ? 2 : 0)
        for (const comeJolly of [false, true]) {
          if (comeJolly ? !(opzioni & 2) : !(opzioni & 1)) continue
          const conto = posa(k, l, comeJolly)
          if (finisceQui && dawg.finale(e) && lunghezza + 1 >= 2) registra()
          if (j + 1 < LATO) estendi(i, dawg.destinazione(e), j + 1, lunghezza + 1)
          togli(k, l, comeJolly, conto)
        }
      }
      if (dawg.ultimo(e)) break
    }
  }

  /** La parte sinistra, costruita dal leggio: `prefisso` e' gia' nel DAWG fino a `nodo`. */
  const prefisso: { l: number; jolly: boolean }[] = []
  const sinistra = (i: number, ancora: number, nodo: number, limite: number) => {
    // Con questa parte sinistra, si prova a passare dall'ancora.
    const inizio = ancora - prefisso.length
    const conti: { valore: number; incrocio: number }[] = []
    prefisso.forEach((p, n) => conti.push(posa(casellaDi(i, inizio + n), p.l, p.jolly)))
    estendi(i, nodo, ancora, prefisso.length)
    for (let n = prefisso.length - 1; n >= 0; n -= 1) {
      togli(casellaDi(i, inizio + n), prefisso[n].l, prefisso[n].jolly, conti[n])
    }

    if (limite === 0 || nodo === FOGLIA) return
    for (let e = nodo; ; e += 1) {
      const l = dawg.lettera(e)
      const figlio = dawg.destinazione(e)
      if (figlio !== FOGLIA) {
        for (const comeJolly of [false, true]) {
          if (comeJolly ? jolly === 0 : mano[l] === 0) continue
          if (comeJolly) jolly -= 1
          else mano[l] -= 1
          prefisso.push({ l, jolly: comeJolly })
          sinistra(i, ancora, figlio, limite - 1)
          prefisso.pop()
          if (comeJolly) jolly += 1
          else mano[l] += 1
        }
      }
      if (dawg.ultimo(e)) break
    }
  }

  for (let i = 0; i < LATO; i += 1) {
    for (let j = 0; j < LATO; j += 1) {
      if (!eAncora(i, j)) continue

      if (j > 0 && piena(casellaDi(i, j - 1))) {
        // A sinistra c'e' gia' un pezzo di parola: la parte sinistra e' quella.
        let da = j - 1
        while (da > 0 && piena(casellaDi(i, da - 1))) da -= 1
        let nodo = RADICE
        let somma = 0
        for (let jj = da; jj < j && nodo !== FOGLIA; jj += 1) {
          const kk = casellaDi(i, jj)
          const e = dawg.arco(nodo, lettere[kk])
          nodo = e < 0 ? FOGLIA : dawg.destinazione(e)
          somma += valori[kk]
        }
        if (nodo === FOGLIA) continue
        sommaPrincipale += somma
        estendi(i, nodo, j, j - da)
        sommaPrincipale -= somma
        continue
      }

      // Caselle libere a sinistra che non sono ancore: lo spazio della parte sinistra.
      let limite = 0
      for (let jj = j - 1; jj >= 0; jj -= 1) {
        const kk = casellaDi(i, jj)
        if (piena(kk) || eAncora(i, jj)) break
        limite += 1
      }
      sinistra(i, j, RADICE, Math.min(limite, TESSERE_LEGGIO - 1))
    }
  }
}

/** Leggendo `lettere` da `nodo` si arriva alla fine di una parola? */
function finisceInParola(dawg: Dawg, nodo: number, lettere: readonly number[]): boolean {
  let n = nodo
  for (let i = 0; i < lettere.length; i += 1) {
    const e = dawg.arco(n, lettere[i])
    if (e < 0) return false
    if (i === lettere.length - 1) return dawg.finale(e)
    n = dawg.destinazione(e)
  }
  return false
}

/* ────────────────────────────  Il computer  ─────────────────────────── */

export type Livello = 'facile' | 'normale' | 'difficile'

/**
 * Dove pesca il computer, per livello, nell'elenco delle mosse dalla migliore
 * alla peggiore: fra la posizione `da` e la posizione `a`, in frazioni.
 *
 * La mossa migliore non e' un livello di gioco: con tutto il dizionario in
 * memoria e' spesso una parola che nessuno al tavolo conosce, da ottanta punti,
 * e in dieci mosse fa in media 557 punti — imbattibile, quindi noioso. I tre
 * livelli pescano piu' in basso. Misurati su sessanta sacchetti, dieci mosse da
 * soli:
 *
 *     facile     170 punti in media   chi gioca per la prima volta
 *     normale    245                  chi gioca bene
 *     difficile  366                  chi conosce il dizionario a memoria
 *
 * Il normale e' anche il computer della classificata: il suo punteggio sulle
 * tessere del giorno e' il riferimento dei punti in classifica.
 */
const FASCE: Record<Livello, readonly [number, number]> = {
  facile: [0.2, 0.45],
  normale: [0.04, 0.16],
  difficile: [0, 0.03],
}

/**
 * La mossa che sceglie il computer, oppure null se non ne ha.
 *
 * `rng` rende la scelta ripetibile: con lo stesso generatore e le stesse mosse
 * il computer fa la stessa cosa, e una partita si puo' rigiocare.
 */
export function sceltaDelComputer(
  mosse: readonly MossaTrovata[],
  livello: Livello,
  rng: () => number,
): MossaTrovata | null {
  if (mosse.length === 0) return null
  const ordinate = [...mosse].sort((a, b) => b.punti - a.punti || chiave(a).localeCompare(chiave(b)))
  const [da, a] = FASCE[livello]
  const inizio = Math.floor(da * (ordinate.length - 1))
  const fine = Math.floor(a * (ordinate.length - 1))
  const indice = inizio + Math.floor(rng() * (fine - inizio + 1))
  return ordinate[Math.min(indice, ordinate.length - 1)]
}

/** Una chiave stabile di una posa: serve a rompere i pareggi sempre nello stesso modo. */
export function chiave(mossa: MossaTrovata): string {
  return mossa.posa
    .map((p) => `${p.r * LATO + p.c}:${p.lettera}${p.jolly ? '*' : ''}`)
    .sort()
    .join(',')
}

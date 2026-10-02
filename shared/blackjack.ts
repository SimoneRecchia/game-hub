/**
 * Il blackjack, con le regole europee dei casinò italiani: il banco prende la
 * seconda carta solo dopo i giocatori, e sta su tutti i 17. Si raddoppia con
 * due carte qualunque, anche dopo aver diviso; si divide fino a quattro mani,
 * gli assi una volta sola e con una carta ciascuno, e un 21 dopo una divisione
 * non e' blackjack. Niente assicurazione e niente resa.
 *
 * Una regola e' diversa da quella dei casinò: **il blackjack paga 1 a 1**, non
 * 3 a 2. E' il prezzo della resa uguale per tutti i giochi della Fortuna: con
 * il 3 a 2 chi gioca al meglio riceverebbe il 99,4% di quel che punta, piu'
 * della slot e di Crazy Time; pagato alla pari il 97,1% (`resaBlackjack`, il
 * conto esatto con la strategia migliore). Le regole dicono "il blackjack paga
 * 1 a 1", come lo dicono certi tavoli veri.
 *
 * Il banco non guarda la carta coperta, perché non ce l'ha: se fa blackjack con
 * la seconda carta, chi ha raddoppiato o diviso perde tutto quel che ha messo.
 * Il sabot si rimescola a ogni carta, come le macchine dei casinò online:
 * ogni carta e' a caso fra le cinquantadue, e contarle non serve.
 *
 * Le carte sono due lettere: il valore ("A", "2"…"9", "T", "J", "Q", "K") e
 * il seme (c, q, f, p: cuori, quadri, fiori, picche).
 */

export type Carta = string

export const VALORI = ['A', '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K'] as const
export const SEMI = ['c', 'q', 'f', 'p'] as const

/** Il blackjack paga la puntata una volta: e' una vincita come le altre, ma subito e sicura. */
export const PAGA_BLACKJACK = 1
/** Le mani massime di un giocatore, dopo le divisioni. */
export const MANI_MASSIME = 4

export const NOME_BLACKJACK = 'Blackjack'
export const PUNTATA_MINIMA_BJ = 10
/** I gettoni della puntata, dal piu' piccolo: si sommano. */
export const GETTONI_BJ: readonly number[] = [10, 25, 50, 100, 500]

/** Quanto vale una carta: gli assi uno (o undici, nel totale), le figure dieci. */
export function punti(c: Carta): number {
  const v = c[0]
  if (v === 'A') return 1
  if (v === 'T' || v === 'J' || v === 'Q' || v === 'K') return 10
  return Number(v)
}

export interface Totale {
  totale: number
  /** Un asso conta undici: il totale e' "morbido", e una carta non lo fa sballare. */
  morbido: boolean
}

export function totaleDi(carte: readonly Carta[]): Totale {
  let t = 0
  let assi = 0
  for (const c of carte) {
    t += punti(c)
    if (c[0] === 'A') assi += 1
  }
  if (assi > 0 && t + 10 <= 21) return { totale: t + 10, morbido: true }
  return { totale: t, morbido: false }
}

/** Blackjack: un asso e un dieci con le prime due carte, e mai in una mano divisa. */
export function eBlackjack(carte: readonly Carta[], divisa = false): boolean {
  return !divisa && carte.length === 2 && totaleDi(carte).totale === 21
}

export const sballata = (carte: readonly Carta[]) => totaleDi(carte).totale > 21

/** Una mano del giocatore: le carte, la puntata (raddoppiata, se lo e'), e com'e' nata. */
export interface ManoBJ {
  /** Al tavolo, il nome della mano nel posto: resta lo stesso quando una divisione sposta le altre. */
  id?: number
  carte: Carta[]
  puntata: number
  raddoppiata?: boolean
  /** Nata da una divisione: un 21 con due carte non e' blackjack. */
  divisa?: boolean
  /** Un asso diviso: una carta sola, e la mano e' ferma. */
  assi?: boolean
  /** Ferma: sta, ha raddoppiato, ha sballato, o e' blackjack. */
  ferma?: boolean
}

export type AzioneBJ = 'carta' | 'stai' | 'raddoppia' | 'dividi'

/** Le mosse che una mano puo' fare adesso. `mani` sono tutte le mani del giocatore, per il tetto delle divisioni. */
export function azioniPossibili(mano: ManoBJ, mani: number): AzioneBJ[] {
  if (mano.ferma) return []
  const { totale } = totaleDi(mano.carte)
  if (totale >= 21) return ['stai']
  const azioni: AzioneBJ[] = ['carta', 'stai']
  if (mano.carte.length === 2) {
    azioni.push('raddoppia')
    const [a, b] = mano.carte
    if (punti(a) === punti(b) && mani < MANI_MASSIME && !mano.assi) azioni.push('dividi')
  }
  return azioni
}

/**
 * Una mossa su una mano: le carte nuove arrivano da `pesca`. Restituisce le
 * mani che ne escono, una o due (la divisione), e la puntata in piu' che la
 * mossa chiede al saldo.
 */
export function giocaAzione(
  mano: ManoBJ,
  azione: AzioneBJ,
  pesca: () => Carta,
): { mani: ManoBJ[]; inPiu: number } {
  if (azione === 'stai') return { mani: [{ ...mano, ferma: true }], inPiu: 0 }
  if (azione === 'carta') {
    const carte = [...mano.carte, pesca()]
    return { mani: [{ ...mano, carte, ferma: totaleDi(carte).totale >= 21 }], inPiu: 0 }
  }
  if (azione === 'raddoppia') {
    const carte = [...mano.carte, pesca()]
    const doppia = { ...mano, carte, puntata: mano.puntata * 2, raddoppiata: true, ferma: true }
    return { mani: [doppia], inPiu: mano.puntata }
  }
  // La divisione: due mani da una carta, e a ognuna la seconda. Gli assi ne prendono una sola, e stanno.
  const [a, b] = mano.carte
  const assi = a[0] === 'A'
  const nuova = (c: Carta): ManoBJ => {
    const carte = [c, pesca()]
    return { carte, puntata: mano.puntata, divisa: true, assi, ferma: assi || totaleDi(carte).totale >= 21 }
  }
  return { mani: [nuova(a), nuova(b)], inPiu: mano.puntata }
}

/** Il banco: pesca finché non arriva almeno a 17, e sta su tutti i 17, anche quelli morbidi. */
export function giocaBanco(carte: readonly Carta[], pesca: () => Carta): Carta[] {
  const mano = [...carte]
  while (totaleDi(mano).totale < 17) mano.push(pesca())
  return mano
}

export type EsitoMano = 'blackjack' | 'vinta' | 'pari' | 'persa' | 'sballata'

/** Com'e' andata una mano contro il banco, a carte tutte scoperte. */
export function esitoMano(mano: ManoBJ, banco: readonly Carta[]): EsitoMano {
  const mio = totaleDi(mano.carte).totale
  if (mio > 21) return 'sballata'
  const bj = eBlackjack(mano.carte, mano.divisa)
  const bjBanco = eBlackjack(banco)
  if (bj && bjBanco) return 'pari'
  if (bj) return 'blackjack'
  if (bjBanco) return 'persa'
  const suo = totaleDi(banco).totale
  if (suo > 21 || mio > suo) return 'vinta'
  return mio === suo ? 'pari' : 'persa'
}

/** Quel che una mano da' o toglie: la puntata vinta o persa, intera; il blackjack paga `PAGA_BLACKJACK`. */
export function deltaMano(mano: ManoBJ, banco: readonly Carta[]): number {
  const esito = esitoMano(mano, banco)
  if (esito === 'blackjack') return Math.floor(mano.puntata * PAGA_BLACKJACK)
  if (esito === 'vinta') return mano.puntata
  if (esito === 'pari') return 0
  return -mano.puntata
}

/** Una carta a caso fra le cinquantadue, con il caso che si da': il sabot si rimescola a ogni carta. */
export function cartaACaso(caso: (n: number) => number): Carta {
  return VALORI[caso(13)] + SEMI[caso(4)]
}

/* ─────────────────────────────  La resa  ───────────────────────────── */

const P = (r: number) => (r === 10 ? 4 / 13 : 1 / 13)
const RANGHI = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

/** Una carta in piu' su un totale: il totale nuovo, e se e' morbido. */
function aggiungi(t: number, m: boolean, c: number): [number, boolean] {
  let tt = t + c
  let mm = m
  if (c === 1 && !m && tt + 10 <= 21) {
    tt += 10
    mm = true
  }
  if (tt > 21 && mm) {
    tt -= 10
    mm = false
  }
  return [tt, mm]
}

const da = (carte: readonly number[]) => carte.reduce<[number, boolean]>(([t, m], c) => aggiungi(t, m, c), [0, false])

const memoBanco = new Map<string, number[]>()
/** La distribuzione finale del banco da un totale: 17, 18, 19, 20, 21, sballato. Sta su tutti i 17. */
function distribuzioneBanco(t: number, m: boolean): number[] {
  const k = `${t}:${m}`
  const nota = memoBanco.get(k)
  if (nota) return nota
  let d = [0, 0, 0, 0, 0, 0]
  if (t > 21) d[5] = 1
  else if (t >= 17) d[t - 17] = 1
  else {
    for (const r of RANGHI) {
      const s = distribuzioneBanco(...aggiungi(t, m, r))
      d = d.map((x, i) => x + P(r) * s[i])
    }
  }
  memoBanco.set(k, d)
  return d
}

/**
 * Il valore atteso delle mosse contro una carta del banco, a mazzo infinito,
 * per unità di puntata. Senza la carta coperta il blackjack del banco arriva
 * dopo: lo si mette nel conto con la sua probabilita', e con lui si perde tutto
 * quel che si e' messo.
 */
class Analisi {
  private readonly pbj: number
  private readonly d: number[]
  private readonly memoGioca = new Map<string, number>()
  private readonly memoMano = new Map<string, number>()

  constructor(scoperta: number) {
    let pbj = 0
    let d = [0, 0, 0, 0, 0, 0]
    for (const r of RANGHI) {
      if ((scoperta === 1 && r === 10) || (scoperta === 10 && r === 1)) {
        pbj += P(r)
        continue
      }
      const s = distribuzioneBanco(...da([scoperta, r]))
      d = d.map((x, i) => x + P(r) * s[i])
    }
    this.pbj = pbj
    this.d = d.map((x) => x / (1 - pbj))
  }

  /** Blackjack del banco con la seconda carta. */
  get blackjackDelBanco(): number {
    return this.pbj
  }

  /** Stare con un totale, contro il banco senza blackjack. */
  sta(t: number): number {
    if (t > 21) return -1
    let e = 0
    for (let i = 0; i < 6; i += 1) {
      const b = i === 5 ? 0 : 17 + i
      e += t > b ? this.d[i] : t < b ? -this.d[i] : 0
    }
    return e
  }

  /** Il meglio fra stare e chiedere, senza piu' raddoppiare ne' dividere. */
  gioca(t: number, m: boolean): number {
    if (t > 21) return -1
    const k = `${t}:${m}`
    const noto = this.memoGioca.get(k)
    if (noto !== undefined) return noto
    let carta = 0
    for (const r of RANGHI) carta += P(r) * this.gioca(...aggiungi(t, m, r))
    const v = Math.max(this.sta(t), carta)
    this.memoGioca.set(k, v)
    return v
  }

  /** Con il rischio del blackjack del banco, che si prende tutta la puntata. */
  valore(evSenzaBj: number, puntata: number): number {
    return (1 - this.pbj) * evSenzaBj - this.pbj * puntata
  }

  /** Il valore di una mossa da una mano qualunque, con quante mani ha gia' il giocatore. */
  mossa(carte: readonly number[], azione: AzioneBJ, mani: number): number {
    const [t, m] = da(carte)
    if (azione === 'stai') return this.valore(this.sta(t), 1)
    if (azione === 'carta') {
      let e = 0
      for (const r of RANGHI) e += P(r) * this.gioca(...aggiungi(t, m, r))
      return this.valore(e, 1)
    }
    if (azione === 'raddoppia') {
      let e = 0
      for (const r of RANGHI) e += P(r) * this.sta(aggiungi(t, m, r)[0])
      return this.valore(2 * e, 2)
    }
    const a = carte[0]
    let una = 0
    for (const r of RANGHI) {
      // Gli assi divisi prendono una carta e stanno; le altre mani si giocano al meglio, anche dividendo ancora.
      una += P(r) * (a === 1 ? this.valore(this.sta(da([1, r])[0]), 1) : this.mano(a, r, true, mani + 1))
    }
    return 2 * una
  }

  /** Il meglio di una mano di due carte, con tutte le mosse che le sono permesse. */
  mano(a: number, b: number, divisa: boolean, mani: number): number {
    const k = `${a}:${b}:${divisa}:${mani}`
    const noto = this.memoMano.get(k)
    if (noto !== undefined) return noto
    const scelte = [this.mossa([a, b], 'stai', mani), this.mossa([a, b], 'carta', mani)]
    scelte.push(this.mossa([a, b], 'raddoppia', mani))
    if (a === b && mani < MANI_MASSIME && !(divisa && a === 1)) scelte.push(this.mossa([a, b], 'dividi', mani))
    const v = Math.max(...scelte)
    this.memoMano.set(k, v)
    return v
  }
}

const analisi = new Map<number, Analisi>()
function analisiDi(scoperta: number): Analisi {
  let a = analisi.get(scoperta)
  if (!a) {
    a = new Analisi(scoperta)
    analisi.set(scoperta, a)
  }
  return a
}

/**
 * La mossa migliore per una mano, contro la carta scoperta del banco: quella
 * che rende di piu' fra le possibili. E' la strategia con cui si conta la resa.
 */
export function consiglio(mano: ManoBJ, scoperta: Carta, mani: number): AzioneBJ {
  const possibili = azioniPossibili(mano, mani)
  if (possibili.length <= 1) return possibili[0] ?? 'stai'
  const a = analisiDi(punti(scoperta))
  const carte = mano.carte.map(punti)
  let migliore = possibili[0]
  let valore = -Infinity
  for (const azione of possibili) {
    const v = a.mossa(carte, azione, mani)
    if (v > valore + 1e-12) {
      valore = v
      migliore = azione
    }
  }
  return migliore
}

/**
 * La resa esatta con la strategia migliore, a mazzo infinito: il valore atteso
 * di ogni mano iniziale contro ogni carta del banco. Con il sabot che si
 * rimescola a ogni carta il mazzo e' davvero infinito, quindi il conto e'
 * quello del gioco. `pagaBlackjack` serve ai test, per vedere che con il 3 a 2
 * la resa sarebbe quella dei libri.
 */
export function resaBlackjack(pagaBlackjack = PAGA_BLACKJACK): number {
  let totale = 0
  for (const u of RANGHI) {
    const a = analisiDi(u)
    let evU = 0
    for (const x of RANGHI) {
      for (const y of RANGHI) {
        const bj = (x === 1 && y === 10) || (x === 10 && y === 1)
        evU += P(x) * P(y) * (bj ? (1 - a.blackjackDelBanco) * pagaBlackjack : a.mano(x, y, false, 1))
      }
    }
    totale += P(u) * evU
  }
  return 1 + totale
}

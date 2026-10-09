/**
 * Il SuperEnalotto, con quattro numeri estratti invece di sei: le regole, il
 * calendario delle estrazioni e la divisione del montepremi.
 *
 * I numeri vanno da 1 a 90, come nel gioco vero. Una scheda ha quattro numeri e
 * costa dieci punti del saldo della Fortuna, o cinque — il "4+1" — e ne costa
 * venti (`COSTI`): fra cinque numeri ci sono cinque quaterne, quindi il 4 esce
 * cinque volte piu' spesso, per il doppio. Una scheda vince una volta sola, con
 * i numeri che ha preso. Ognuno ne gioca al piu' `SCHEDE_MASSIME` per concorso.
 * Si estrae il lunedi', il mercoledi' e il venerdi': alle 21 il gioco chiude,
 * alle 21:05 c'e' la diretta, e finita la diretta si pagano i premi, che vanno
 * nel saldo da soli: non c'e' niente da riscuotere. Le schede di un concorso
 * pagato restano una settimana (`CONSERVA_GIORNI`), poi se ne vanno; restano il
 * concorso, con i suoi numeri e i suoi premi, e i conti delle giornate.
 *
 * I premi sono quelli del gioco vero: il 60% della raccolta va nel montepremi
 * (`QUOTA_PREMI`), e il montepremi si divide fra le categorie nelle proporzioni
 * del SuperEnalotto, che ne ha sei — al 6 il 17,4%, a 5+1, 5, 4 e 3 insieme il
 * 34,2%, al 2 il 40%, e l'8,4% che resta va alle vincite immediate, che qui non
 * ci sono —: con quattro numeri il 4 e' il jackpot, il 3 prende la parte delle
 * categorie di mezzo e il 2 la sua, rifatte su cento (`RIPARTIZIONE`). In ogni
 * categoria il premio si divide in parti uguali fra chi l'ha fatta, quindi
 * quanto vale dipende da quanti giocano e da quanti indovinano. Se nessuno fa 4
 * il jackpot passa al concorso dopo, e cosi' le parti delle categorie senza
 * vincitori. Come nel regolamento, una categoria non paga mai meno di quella
 * sotto: se succede, le due si uniscono e si dividono insieme (`liquida`).
 *
 * I conti si fanno in centesimi di punto, e i premi si pagano in punti interi,
 * per difetto: quel che avanza va nel jackpot, e niente si perde oltre al 40%
 * che il gioco tiene, come il banco.
 *
 * Il nome e' quello del gioco vero, e il marchio e' di Sisal: per un gioco fra
 * amici e senza soldi va bene, ma se l'app diventasse pubblica andrebbe cambiato.
 */

import { addDays, gameDate, giornoDellaSettimana, istanteItaliano } from './daily'

export const NOME_SUPERENALOTTO = 'SuperEnalotto'

/** I numeri della schedina, da 1 a novanta. */
export const NUMERI = 90
/** Quanti se ne estraggono. */
export const ESTRATTI = 4
/** Le due giocate, per quanti numeri hanno: quattro, o cinque (il "4+1"). */
export type GiocataEnalotto = 4 | 5
export const GIOCATE: readonly GiocataEnalotto[] = [4, 5]
/** Quanto costa una scheda, in punti. */
export const COSTI: Readonly<Record<GiocataEnalotto, number>> = { 4: 10, 5: 20 }
export const SCHEDE_MASSIME = 5
/** Per quanti giorni dopo l'estrazione si tengono le schede di un concorso pagato. */
export const CONSERVA_GIORNI = 7

/** Le categorie: quanti numeri presi. */
export type CategoriaEnalotto = 4 | 3 | 2
export const CATEGORIE: readonly CategoriaEnalotto[] = [4, 3, 2]

/** La parte della raccolta che va nel montepremi, in percento: quella del SuperEnalotto. */
export const QUOTA_PREMI = 60
/** Le parti del montepremi, in percento: quelle del gioco vero rifatte su tre categorie (vedi in testa). */
export const RIPARTIZIONE: Readonly<Record<CategoriaEnalotto, number>> = { 4: 19, 3: 37, 2: 44 }

/** Le estrazioni: il lunedi', il mercoledi' e il venerdi'. */
export const GIORNI_ESTRAZIONE: readonly number[] = [1, 3, 5]
/** Alle 21 si chiude, alle 21:05 comincia la diretta. */
export const CHIUSURA = { ore: 21, minuti: 0 } as const
export const DIRETTA = { ore: 21, minuti: 5 } as const
/** Quando esce ogni pallina, dall'inizio della diretta, e quanto dura tutta. */
export const PALLINE_MS: readonly number[] = [16_000, 30_000, 44_000, 58_000]
export const DURATA_DIRETTA_MS = 78_000
/** Il primo concorso: prima il gioco non c'era. */
export const PRIMO_CONCORSO = '2026-10-12'

/* ─────────────────────────────  Il calendario  ───────────────────────────── */

export const eGiornoDiEstrazione = (data: string) => GIORNI_ESTRAZIONE.includes(giornoDellaSettimana(data))

/** I momenti di un concorso: la chiusura del gioco, l'inizio e la fine della diretta. */
export function momentiDi(data: string): { chiusura: number; inizio: number; fine: number } {
  const inizio = istanteItaliano(data, DIRETTA.ore, DIRETTA.minuti)
  return { chiusura: istanteItaliano(data, CHIUSURA.ore, CHIUSURA.minuti), inizio, fine: inizio + DURATA_DIRETTA_MS }
}

/** Il primo giorno di estrazione da `data` compresa. */
export function prossimaData(data: string): string {
  let d = data < PRIMO_CONCORSO ? PRIMO_CONCORSO : data
  while (!eGiornoDiEstrazione(d)) d = addDays(d, 1)
  return d
}

/**
 * Il concorso per cui si gioca adesso: quello di oggi fino alle 21, poi il
 * prossimo, ma solo finita la diretta. Fra le due il gioco e' chiuso (null).
 */
export function concorsoAperto(adesso: number): string | null {
  const oggi = gameDate(new Date(adesso))
  const d = prossimaData(oggi)
  if (d !== oggi) return d
  const { chiusura, fine } = momentiDi(d)
  if (adesso < chiusura) return d
  if (adesso < fine) return null
  return prossimaData(addDays(d, 1))
}

/** L'ultimo concorso chiuso, cioe' con le 21 passate, o null se non ce n'e' ancora stato uno. */
export function ultimoConcorso(adesso: number): string | null {
  let d = gameDate(new Date(adesso))
  for (let i = 0; i < 7; i += 1, d = addDays(d, -1)) {
    if (d < PRIMO_CONCORSO) return null
    if (eGiornoDiEstrazione(d) && momentiDi(d).chiusura <= adesso) return d
  }
  return null
}

/* ─────────────────────────────  La schedina e l'estrazione  ───────────────────────────── */

/** Quattro numeri diversi da 1 a `NUMERI`, nell'ordine in cui escono. `caso(n)` da' un intero da 0 a n-1. */
export function estrai(caso: (n: number) => number): number[] {
  const urna = Array.from({ length: NUMERI }, (_, i) => i + 1)
  const fuori: number[] = []
  for (let i = 0; i < ESTRATTI; i += 1) fuori.push(urna.splice(caso(urna.length), 1)[0])
  return fuori
}

/** Quattro o cinque numeri diversi, da 1 a `NUMERI`. */
export function schedaValida(numeri: unknown): numeri is number[] {
  return (
    Array.isArray(numeri) &&
    (GIOCATE as readonly number[]).includes(numeri.length) &&
    numeri.every((n) => Number.isInteger(n) && n >= 1 && n <= NUMERI) &&
    new Set(numeri).size === numeri.length
  )
}

/** Quanto costa una scheda valida: dalla giocata, cioe' da quanti numeri ha. */
export const costoDi = (numeri: readonly number[]) => COSTI[numeri.length as GiocataEnalotto]

/** Quanti numeri di una scheda sono fra gli estratti. */
export const presiDi = (numeri: readonly number[], estratti: readonly number[]) =>
  numeri.filter((n) => estratti.includes(n)).length

/** La categoria di una scheda, o null se non ha vinto niente. */
export const categoriaDi = (presi: number): CategoriaEnalotto | null =>
  presi >= 2 ? (Math.min(presi, ESTRATTI) as CategoriaEnalotto) : null

/* ─────────────────────────────  Il montepremi  ───────────────────────────── */

/** Il montepremi di una raccolta (i punti delle schede giocate), in centesimi di punto: il 60%. */
export const montepremiDi = (raccolta: number) => raccolta * QUOTA_PREMI

/** La parte di una categoria, in centesimi, per difetto. */
export const quotaDi = (categoria: CategoriaEnalotto, raccolta: number) =>
  Math.floor((montepremiDi(raccolta) * RIPARTIZIONE[categoria]) / 100)

/** Il jackpot di un concorso aperto, in punti: quel che e' arrivato dal concorso prima, piu' la sua parte di adesso. */
export const jackpotDi = (riporto: number, raccolta: number) => Math.floor((riporto + quotaDi(4, raccolta)) / 100)

export interface PremioEnalotto {
  categoria: CategoriaEnalotto
  vincitori: number
  /** Quanto vince ognuno, in punti; zero se nessuno l'ha fatta. */
  premio: number
}

export interface Liquidazione {
  premi: PremioEnalotto[]
  /** Il jackpot che passa al concorso dopo, in centesimi. */
  jackpot: number
}

/**
 * I premi di un concorso: la raccolta in punti, il jackpot arrivato dal concorso prima
 * (in centesimi) e quanti hanno fatto ogni categoria. Le categorie senza
 * vincitori vanno nel jackpot; fra quelle con vincitori, una che pagherebbe a
 * testa meno di quella sotto si unisce a lei, e si dividono insieme, finché
 * dall'alto in basso i premi non salgono mai.
 */
export function liquida(raccolta: number, riporto: number, vincitori: Record<CategoriaEnalotto, number>): Liquidazione {
  const quote = CATEGORIE.map((c) => quotaDi(c, raccolta))
  quote[0] += riporto
  let jackpot = montepremiDi(raccolta) - CATEGORIE.reduce((s, c) => s + quotaDi(c, raccolta), 0)

  // I gruppi di categorie con vincitori, dall'alto: quando uno paga meno del successivo, si uniscono.
  const gruppi: { categorie: CategoriaEnalotto[]; quota: number; vincitori: number }[] = []
  CATEGORIE.forEach((c, i) => {
    if (vincitori[c] === 0) {
      jackpot += quote[i]
      return
    }
    gruppi.push({ categorie: [c], quota: quote[i], vincitori: vincitori[c] })
    while (gruppi.length >= 2) {
      const [sopra, sotto] = gruppi.slice(-2)
      if (sopra.quota / sopra.vincitori >= sotto.quota / sotto.vincitori) break
      gruppi.splice(-2, 2, {
        categorie: [...sopra.categorie, ...sotto.categorie],
        quota: sopra.quota + sotto.quota,
        vincitori: sopra.vincitori + sotto.vincitori,
      })
    }
  })

  const premio = new Map<CategoriaEnalotto, number>()
  for (const g of gruppi) {
    const aTesta = Math.floor(g.quota / g.vincitori / 100)
    jackpot += g.quota - aTesta * g.vincitori * 100
    for (const c of g.categorie) premio.set(c, aTesta)
  }
  return {
    premi: CATEGORIE.map((c) => ({ categoria: c, vincitori: vincitori[c], premio: premio.get(c) ?? 0 })),
    jackpot,
  }
}

/** Le probabilita' di una scheda della giocata data, per le regole: una su quante fa ogni categoria. */
export function unaSu(categoria: CategoriaEnalotto, giocata: GiocataEnalotto = 4): number {
  const comb = (n: number, k: number): number => (k === 0 ? 1 : (comb(n - 1, k - 1) * n) / k)
  const tutte = comb(NUMERI, ESTRATTI)
  const modi = comb(giocata, categoria) * comb(NUMERI - giocata, ESTRATTI - categoria)
  return tutte / modi
}

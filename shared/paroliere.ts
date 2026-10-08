/**
 * Il Paroliere: sedici dadi con le lettere, una griglia di quattro per
 * quattro, tre minuti per trovare quante piu' parole si puo'.
 *
 * E' il Boggle di Alan Turoff (1972), che in Italia Editrice Giochi ha
 * venduto come "Il Paroliere", e le regole sono le sue: una parola si scrive
 * passando da una lettera a una vicina — di lato, sopra, sotto o di sbieco —
 * senza usare due volte lo stesso dado; vale da tre lettere in su, e piu' e'
 * lunga piu' vale (1, 1, 2, 3, 5, 11); la faccia "Qu" conta due lettere. Si
 * accettano tutte le parole del dizionario dello Scarabeo, plurali e voci dei
 * verbi comprese, come al tavolo.
 *
 * La classificata e' una griglia al giorno, la stessa per tutti, che la notte
 * sceglie fra quelle con abbastanza parole (scripts/genera-paroliere.ts); la
 * libera tira i dadi nel telefono.
 */

import { mulberry32 } from './daily'
import { FOGLIA, RADICE, indiceDi, type Dawg } from './dawg'

export const NOME_PAROLIERE = 'Paroliere'

/** Il lato della griglia della classificata, come nella scatola. */
export const LATO_PAROLIERE = 4

/** I tre minuti della clessidra. */
export const TEMPO_PAROLIERE_MS = 180_000

/** Quanto arriva in ritardo una parola per la rete e vale lo stesso, come nel quiz. */
export const MARGINE_PAROLIERE_MS = 3_000

/** Una parola vale da tre lettere in su. */
export const LETTERE_MINIME = 3

/** La parola piu' lunga che si cerca: sedici dadi, e un "qu" in piu'. */
export const LETTERE_MASSIME = 17

/**
 * I sedici dadi, con le lettere dell'italiano: le vocali su quasi la meta'
 * delle facce, come nelle parole, e una faccia sola per le lettere rare. Sono
 * le 21 lettere del gioco, la "q" solo con la sua "u". Erano calcolati sulle
 * frequenze delle lettere italiane, poi aggiustati perché nessun dado abbia due
 * consonanti rare e ogni dado abbia almeno due vocali. Cambiarli non cambia le
 * classificate gia' scritte, che stanno nel database con la loro griglia.
 */
export const DADI: readonly (readonly string[])[] = [
  ['a', 'e', 'i', 'n', 'r', 't'],
  ['a', 'e', 'o', 'l', 's', 'c'],
  ['a', 'i', 'o', 'n', 'r', 'd'],
  ['e', 'i', 'o', 'l', 't', 's'],
  ['a', 'e', 'u', 'n', 'c', 'm'],
  ['a', 'i', 'o', 'r', 's', 'p'],
  ['e', 'i', 'o', 'n', 'l', 'g'],
  ['a', 'e', 'i', 't', 'r', 'v'],
  ['a', 'o', 'u', 'l', 'n', 'd'],
  ['e', 'i', 'o', 's', 'c', 'p'],
  ['a', 'e', 'i', 'r', 'm', 't'],
  ['a', 'o', 'i', 'n', 'l', 'b'],
  ['e', 'o', 'u', 's', 't', 'f'],
  ['a', 'e', 'i', 'c', 'r', 'z'],
  ['a', 'e', 'o', 'n', 'd', 'h'],
  ['e', 'i', 'o', 'qu', 'v', 'g'],
]

/**
 * Nove dadi in piu' per la griglia di cinque per cinque della libera, come
 * nel Boggle grande: le stesse proporzioni, senza un'altra "qu".
 */
export const DADI_IN_PIU: readonly (readonly string[])[] = [
  ['a', 'e', 'i', 'n', 's', 't'],
  ['a', 'e', 'o', 'r', 'l', 'c'],
  ['a', 'i', 'o', 'n', 't', 'm'],
  ['e', 'i', 'o', 'r', 's', 'd'],
  ['a', 'e', 'i', 'l', 'n', 'p'],
  ['a', 'o', 'u', 'r', 't', 'c'],
  ['e', 'i', 'o', 'n', 's', 'v'],
  ['a', 'e', 'i', 'l', 'r', 'g'],
  ['a', 'e', 'o', 't', 'n', 'b'],
]

/** I lati della griglia che si possono scegliere nella libera. */
export const LATI_PAROLIERE = [4, 5] as const
export type LatoParoliere = (typeof LATI_PAROLIERE)[number]

/** Quanti punti vale una parola, dalla sua lunghezza in lettere ("qu" ne conta due), come nel Boggle. */
export function puntiParola(lettere: number): number {
  if (lettere < LETTERE_MINIME) return 0
  if (lettere <= 4) return 1
  if (lettere === 5) return 2
  if (lettere === 6) return 3
  if (lettere === 7) return 5
  return 11
}

/** Il punteggio di un elenco di parole trovate. */
export function punteggioDi(parole: readonly string[]): number {
  return parole.reduce((s, p) => s + puntiParola(p.length), 0)
}

/**
 * Tira i dadi: li mescola nella scatola e ognuno mostra una faccia. Per la
 * griglia di cinque si aggiungono i nove dadi in piu'.
 */
export function lanciaDadi(caso: () => number, lato: number = LATO_PAROLIERE): string[] {
  const dadi = lato === 5 ? [...DADI, ...DADI_IN_PIU] : [...DADI]
  for (let i = dadi.length - 1; i > 0; i -= 1) {
    const j = Math.floor(caso() * (i + 1))
    ;[dadi[i], dadi[j]] = [dadi[j], dadi[i]]
  }
  return dadi.slice(0, lato * lato).map((d) => d[Math.floor(caso() * d.length)])
}

/** Le caselle vicine a una casella: di lato, sopra, sotto e di sbieco. */
export function vicine(casella: number, lato: number): number[] {
  const r = Math.floor(casella / lato)
  const c = casella % lato
  const out: number[] = []
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (dr === 0 && dc === 0) continue
      const rr = r + dr
      const cc = c + dc
      if (rr >= 0 && rr < lato && cc >= 0 && cc < lato) out.push(rr * lato + cc)
    }
  }
  return out
}

const ACCENTI: Record<string, string> = {
  à: 'a',
  á: 'a',
  è: 'e',
  é: 'e',
  ì: 'i',
  í: 'i',
  ò: 'o',
  ó: 'o',
  ù: 'u',
  ú: 'u',
}

/** Una parola come la confronta il gioco: minuscola, senza accenti, solo lettere. */
export function normalizzaParoliere(parola: string): string {
  return parola
    .toLowerCase()
    .replace(/[àáèéìíòóùú]/g, (c) => ACCENTI[c])
    .replace(/[^a-z]/g, '')
}

/**
 * La strada di una parola sulla griglia: le caselle, nell'ordine, o null se
 * la parola non si puo' scrivere passando da una casella a una vicina senza
 * ripassare da nessuna. Una faccia "qu" prende due lettere.
 */
export function stradaDi(griglia: readonly string[], parola: string): number[] | null {
  const lato = Math.round(Math.sqrt(griglia.length))
  const usate = new Array<boolean>(griglia.length).fill(false)
  const strada: number[] = []
  const cerca = (casella: number, da: number): boolean => {
    const faccia = griglia[casella]
    if (usate[casella] || !parola.startsWith(faccia, da)) return false
    usate[casella] = true
    strada.push(casella)
    const dopo = da + faccia.length
    if (dopo === parola.length) return true
    for (const v of vicine(casella, lato)) if (cerca(v, dopo)) return true
    usate[casella] = false
    strada.pop()
    return false
  }
  for (let i = 0; i < griglia.length; i += 1) if (cerca(i, 0)) return strada
  return null
}

/**
 * Tutte le parole della griglia che il dizionario conosce, da tre lettere in
 * su: si parte da ogni casella e si va avanti finché il dizionario ha parole
 * che cominciano cosi'. Con il dizionario dello Scarabeo una griglia di sedici
 * si legge in pochi millisecondi, una di venticinque in qualche decina.
 */
export function paroleDellaGriglia(griglia: readonly string[], dawg: Dawg): string[] {
  const lato = Math.round(Math.sqrt(griglia.length))
  const facce = griglia.map((f) => [...f].map(indiceDi))
  const trovate = new Set<string>()
  const usate = new Array<boolean>(griglia.length).fill(false)
  const lettere: string[] = []
  const visita = (casella: number, nodo: number) => {
    // Segue la faccia nel dizionario: una lettera, o due per "qu".
    let n = nodo
    let finisce = false
    for (const l of facce[casella]) {
      if (n === FOGLIA || l < 0) return
      const e = dawg.arco(n, l)
      if (e < 0) return
      finisce = dawg.finale(e)
      n = dawg.destinazione(e)
    }
    usate[casella] = true
    lettere.push(griglia[casella])
    const parola = lettere.join('')
    if (finisce && parola.length >= LETTERE_MINIME) trovate.add(parola)
    if (n !== FOGLIA && parola.length < LETTERE_MASSIME) {
      for (const v of vicine(casella, lato)) if (!usate[v]) visita(v, n)
    }
    lettere.pop()
    usate[casella] = false
  }
  for (let i = 0; i < griglia.length; i += 1) visita(i, RADICE)
  return ordinaParole([...trovate])
}

/** Le parole dalla piu' lunga, e a pari lunghezza in ordine alfabetico: come si leggono a fine partita. */
export function ordinaParole(parole: readonly string[]): string[] {
  return [...parole].sort((a, b) => b.length - a.length || a.localeCompare(b, 'it'))
}

/* ─────────────────────────────  La libera  ───────────────────────────── */

/**
 * Le parole comuni che vuole una griglia libera: meno di quelle del giorno,
 * perché la libera tira i dadi nel telefono e non deve cercare a lungo, ma
 * abbastanza perché non sia una griglia vuota. Con cinque dadi per lato le
 * parole sono quasi il triplo.
 */
export const PAROLE_MINIME_LIBERE: Record<LatoParoliere, number> = { 4: 60, 5: 160 }

/** Una griglia della libera: i dadi, le parole comuni da mostrare alla fine, e tutte quelle che valgono. */
export interface GrigliaLibera {
  griglia: string[]
  comuni: string[]
  tutte: string[]
}

/**
 * Tira i dadi finché non esce una griglia con abbastanza parole comuni, al
 * massimo una trentina di volte: dopo, tiene la migliore. `dawg` e' il
 * dizionario intero, che decide quali parole valgono.
 */
export function grigliaLibera(dawg: Dawg, lato: number, caso: () => number): GrigliaLibera {
  const minimo = PAROLE_MINIME_LIBERE[lato as LatoParoliere] ?? PAROLE_MINIME_LIBERE[4]
  const comuni = dawg.comuni()
  let migliore: { griglia: string[]; comuni: string[] } | null = null
  for (let tiro = 0; tiro < 30; tiro += 1) {
    const griglia = lanciaDadi(caso, lato)
    const parole = paroleDellaGriglia(griglia, comuni)
    if (!migliore || parole.length > migliore.comuni.length) migliore = { griglia, comuni: parole }
    if (parole.length >= minimo) break
  }
  const { griglia, comuni: parole } = migliore!
  return { griglia, comuni: parole, tutte: paroleDellaGriglia(griglia, dawg) }
}

/* ─────────────────────────────  La classificata  ───────────────────────────── */

/**
 * Le griglie della classificata hanno almeno tante parole comuni: una con
 * venti parole si gioca in un minuto, e non dice chi e' bravo.
 */
export const PAROLE_MINIME_DEL_GIORNO = 80

/** I punti di chi ha giocato, anche senza una parola: come in Nomi, cose e città. */
export const PUNTI_GIOCATA_PAROLIERE = 25

/** I punti delle parole, al traguardo: il tetto e' cento. */
export const PUNTI_PAROLE_PAROLIERE = 75

export const MASSIMO_PAROLIERE = PUNTI_GIOCATA_PAROLIERE + PUNTI_PAROLE_PAROLIERE

/**
 * Il traguardo di una griglia: quel che fa in tre minuti chi gioca bene. Le
 * griglie non sono tutte uguali — in una le parole lunghe ci sono, in
 * un'altra no — e il traguardo segue la griglia: e' una parte fissa del
 * punteggio di tutte le sue parole comuni, fra un minimo e un massimo. La
 * parte la dice la misura fatta su un anno di griglie (vedi il test).
 */
export const PARTE_DEL_TOTALE = 0.2
export const TRAGUARDO_MINIMO = 25
export const TRAGUARDO_MASSIMO = 60

export function traguardoDi(comuni: readonly string[]): number {
  const totale = punteggioDi(comuni)
  return Math.min(TRAGUARDO_MASSIMO, Math.max(TRAGUARDO_MINIMO, Math.round(totale * PARTE_DEL_TOTALE)))
}

/**
 * I punti di una partita finita: venticinque per averla giocata, e settantacinque
 * in proporzione al traguardo, che oltre il traguardo non crescono piu'.
 * Arrivare a meta' strada vale sessantatre: circa due terzi di chi ci arriva.
 */
export function puntiParoliere(punteggio: number, traguardo: number): number {
  const quota = traguardo > 0 ? Math.min(1, Math.max(0, punteggio) / traguardo) : 0
  return PUNTI_GIOCATA_PAROLIERE + Math.round(PUNTI_PAROLE_PAROLIERE * quota)
}

/** Una giornata come la scrive la notte nel database. */
export interface ParoliereDelGiorno {
  griglia: string[]
  /** Le parole comuni della griglia, dalla piu' lunga: si vedono a partita finita. */
  comuni: string[]
  traguardo: number
}

/** Una giornata letta dal database: tiene solo quel che ha la forma giusta. */
export function giornataValida(valore: unknown): valore is ParoliereDelGiorno {
  if (!valore || typeof valore !== 'object') return false
  const g = valore as ParoliereDelGiorno
  return (
    Array.isArray(g.griglia) &&
    g.griglia.length === LATO_PAROLIERE * LATO_PAROLIERE &&
    g.griglia.every((f) => typeof f === 'string' && /^[a-z]{1,2}$/.test(f)) &&
    Array.isArray(g.comuni) &&
    g.comuni.every((p) => typeof p === 'string') &&
    Number.isFinite(g.traguardo) &&
    g.traguardo > 0
  )
}

/**
 * La griglia di un giorno: si tirano i dadi con un seme del numero del giorno
 * finché non esce una griglia con abbastanza parole comuni, e i tiri sono gli
 * stessi per chiunque li rifaccia. `comuni` e' il dizionario come lo vede il
 * computer dello Scarabeo (`Dawg.comuni()`).
 */
export function grigliaDelGiorno(numero: number, comuni: Dawg): ParoliereDelGiorno {
  for (let tiro = 0; tiro < 200; tiro += 1) {
    const griglia = lanciaDadi(mulberry32(numero * 104_729 + tiro * 7_919 + 0x9a20))
    const parole = paroleDellaGriglia(griglia, comuni)
    if (parole.length >= PAROLE_MINIME_DEL_GIORNO) return { griglia, comuni: parole, traguardo: traguardoDi(parole) }
  }
  throw new Error(`Nessuna griglia con ${PAROLE_MINIME_DEL_GIORNO} parole per il giorno ${numero}`)
}

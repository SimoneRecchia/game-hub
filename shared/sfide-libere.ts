/**
 * Le sfide fra amici delle libere che si giocano da soli: il sudoku, gli
 * Anagrammi, il Paroliere, la Ghigliottina e la Catena.
 *
 * Una sfida e' la stessa partita per tutti e due, nello stesso momento: chi
 * sfida sceglie le opzioni, quando l'altro accetta il server pesca il seme, e
 * dal via ognuno gioca sul suo telefono lo schema, le parole o la griglia che
 * il seme da' a tutti e due — con lo stesso motore della libera. Vince chi fa
 * piu' punti, e a pari punti chi ci ha messo meno.
 *
 * I conti li fa il telefono, che li manda al server mentre gioca: e'
 * un'amichevole, come la sfida a quiz, e il prezzo di non avere i motori nel
 * Worker, che ha dieci millisecondi. Il server guarda solo la misura (punti
 * dentro il massimo del gioco, un tempo dentro la durata) e decide chi ha
 * vinto. Il seme esce solo dal via: prima, chi lo sapesse potrebbe prepararsi
 * lo schema.
 */

import { LIVELLI as LIVELLI_SUDOKU, type LivelloSudoku } from './sudoku'

export type GiocoSfidaLibera = 'sudoku' | 'anagrammi' | 'paroliere' | 'ghigliottina' | 'catena'

export const GIOCHI_SFIDA_LIBERA: readonly GiocoSfidaLibera[] = [
  'sudoku',
  'anagrammi',
  'paroliere',
  'ghigliottina',
  'catena',
]

export function eGiocoSfidaLibera(x: unknown): x is GiocoSfidaLibera {
  return typeof x === 'string' && (GIOCHI_SFIDA_LIBERA as readonly string[]).includes(x)
}

/* ─────────────────────────────  Le opzioni  ───────────────────────────── */

export type LivelloAnagrammi = 'facile' | 'normale' | 'difficile'
export const LIVELLI_ANAGRAMMI: readonly LivelloAnagrammi[] = ['facile', 'normale', 'difficile']

/** I lati del Paroliere libero: sedici dadi, o venticinque. */
export type LatoLibero = 4 | 5
export const LATI_LIBERI: readonly LatoLibero[] = [4, 5]

/**
 * I tempi fra cui si sceglie, per gioco, in ordine. Il primo valore di
 * `PREDEFINITE` e' quello della classificata, dove c'e': la libera si gioca
 * come la giornata finché non si cambia.
 */
export const MINUTI_SUDOKU = [10, 15, 20, 30, 45] as const
export const SECONDI_ANAGRAMMI = [30, 45, 60, 90, 120] as const
export const MINUTI_PAROLIERE = [1, 2, 3, 4, 5] as const
export const SECONDI_FINALE = [30, 45, 60, 90] as const

export interface ImpostazioniSudoku {
  livello: LivelloSudoku
  /** Il tempo per risolverlo: chi non ci arriva conta le caselle giuste. */
  minuti: (typeof MINUTI_SUDOKU)[number]
}

export interface ImpostazioniAnagrammi {
  livello: LivelloAnagrammi
  /** Il tempo di ogni parola. */
  secondi: (typeof SECONDI_ANAGRAMMI)[number]
}

export interface ImpostazioniParoliere {
  lato: LatoLibero
  minuti: (typeof MINUTI_PAROLIERE)[number]
}

/** La Ghigliottina e la Catena: il tempo della parola finale. */
export interface ImpostazioniFinale {
  secondi: (typeof SECONDI_FINALE)[number]
}

export interface ImpostazioniDi {
  sudoku: ImpostazioniSudoku
  anagrammi: ImpostazioniAnagrammi
  paroliere: ImpostazioniParoliere
  ghigliottina: ImpostazioniFinale
  catena: ImpostazioniFinale
}

export type ImpostazioniSfidaLibera = ImpostazioniDi[GiocoSfidaLibera]

export const PREDEFINITE: { [G in GiocoSfidaLibera]: ImpostazioniDi[G] } = {
  sudoku: { livello: 'media', minuti: 20 },
  anagrammi: { livello: 'normale', secondi: 90 },
  paroliere: { lato: 4, minuti: 3 },
  ghigliottina: { secondi: 60 },
  catena: { secondi: 60 },
}

function tra<T>(valori: readonly T[], x: unknown): x is T {
  return valori.includes(x as T)
}

/**
 * Le opzioni di una sfida come le manda il telefono, controllate una per una:
 * quel che non e' fra le scelte prende il valore di sempre, e quel che non
 * c'entra col gioco se ne va.
 */
export function impostazioniValide<G extends GiocoSfidaLibera>(gioco: G, valore: unknown): ImpostazioniDi[G] {
  const v = (valore && typeof valore === 'object' ? valore : {}) as Record<string, unknown>
  const base = PREDEFINITE[gioco] as ImpostazioniSfidaLibera
  switch (gioco) {
    case 'sudoku': {
      const b = base as ImpostazioniSudoku
      return {
        livello: tra(LIVELLI_SUDOKU, v.livello) ? v.livello : b.livello,
        minuti: tra(MINUTI_SUDOKU, v.minuti) ? v.minuti : b.minuti,
      } as ImpostazioniDi[G]
    }
    case 'anagrammi': {
      const b = base as ImpostazioniAnagrammi
      return {
        livello: tra(LIVELLI_ANAGRAMMI, v.livello) ? v.livello : b.livello,
        secondi: tra(SECONDI_ANAGRAMMI, v.secondi) ? v.secondi : b.secondi,
      } as ImpostazioniDi[G]
    }
    case 'paroliere': {
      const b = base as ImpostazioniParoliere
      return {
        lato: tra(LATI_LIBERI, v.lato) ? v.lato : b.lato,
        minuti: tra(MINUTI_PAROLIERE, v.minuti) ? v.minuti : b.minuti,
      } as ImpostazioniDi[G]
    }
    default: {
      const b = base as ImpostazioniFinale
      return { secondi: tra(SECONDI_FINALE, v.secondi) ? v.secondi : b.secondi } as ImpostazioniDi[G]
    }
  }
}

/* ─────────────────────────────  Il tempo  ───────────────────────────── */

/** Le parole degli Anagrammi, in ogni partita. */
export const PAROLE_ANAGRAMMI_SFIDA = 5

/**
 * Quanto puo' durare al massimo la partita di uno dei due, dal via. Oltre, il
 * server chiude la sfida con quel che ognuno ha detto: chi ha chiuso l'app a
 * meta' non fa aspettare l'altro per sempre. Il sudoku e il Paroliere hanno un
 * tempo solo; negli Anagrammi fra una parola e l'altra ci si ferma, e la
 * Ghigliottina e la Catena prima della finale non hanno un orologio: lì il
 * tetto e' largo, e serve solo a chiudere.
 */
export function durataMassimaMs(gioco: GiocoSfidaLibera, imp: ImpostazioniSfidaLibera): number {
  switch (gioco) {
    case 'sudoku':
      return (imp as ImpostazioniSudoku).minuti * 60_000
    case 'paroliere':
      return (imp as ImpostazioniParoliere).minuti * 60_000
    case 'anagrammi':
      return PAROLE_ANAGRAMMI_SFIDA * ((imp as ImpostazioniAnagrammi).secondi * 1_000 + 30_000)
    case 'ghigliottina':
      return 5 * 60_000 + (imp as ImpostazioniFinale).secondi * 1_000
    case 'catena':
      return 10 * 60_000 + (imp as ImpostazioniFinale).secondi * 1_000
  }
}

/** Quel che il server aspetta oltre la durata: la rete, e la scena che apre la partita. */
export const MARGINE_SFIDA_LIBERA_MS = 30_000

/* ─────────────────────────────  I conti  ───────────────────────────── */

/**
 * Il massimo dei punti che un telefono puo' dire, per gioco: il sudoku conta
 * le caselle giuste, gli Anagrammi, la Ghigliottina e la Catena i punti della
 * libera, il Paroliere i punti delle parole, che non hanno un tetto vero.
 */
export const PUNTI_MASSIMI_SFIDA: Record<GiocoSfidaLibera, number> = {
  sudoku: 81,
  anagrammi: 100,
  paroliere: 9_999,
  ghigliottina: 100,
  catena: 100,
}

/**
 * Fin dove e' arrivato uno dei due, come lo dice il suo telefono: i punti se la
 * partita finisse adesso, quanta strada ha fatto (le caselle giuste, le parole
 * trovate, le coppie scelte) e il tempo che conta per lo spareggio.
 */
export interface AvanzamentoSfida {
  punti: number
  passo: number
  tempoMs: number
}

/** L'avanzamento come lo manda il telefono, nella misura del gioco; null se non e' un avanzamento. */
export function avanzamentoValido(
  gioco: GiocoSfidaLibera,
  imp: ImpostazioniSfidaLibera,
  valore: unknown,
): AvanzamentoSfida | null {
  const v = (valore && typeof valore === 'object' ? valore : {}) as Record<string, unknown>
  const intero = (x: unknown, max: number) =>
    typeof x === 'number' && Number.isInteger(x) && x >= 0 && x <= max ? x : null
  const punti = intero(v.punti, PUNTI_MASSIMI_SFIDA[gioco])
  const passo = intero(v.passo, 10_000)
  const tempoMs = intero(v.tempoMs, durataMassimaMs(gioco, imp) + MARGINE_SFIDA_LIBERA_MS)
  if (punti === null || passo === null || tempoMs === null) return null
  return { punti, passo, tempoMs }
}

/** Chi ha vinto fra due partite finite: piu' punti, poi meno tempo; pari se e' tutto uguale. */
export function vincitoreSfida(a: AvanzamentoSfida, b: AvanzamentoSfida): 'a' | 'b' | 'pari' {
  if (a.punti !== b.punti) return a.punti > b.punti ? 'a' : 'b'
  if (a.tempoMs !== b.tempoMs) return a.tempoMs < b.tempoMs ? 'a' : 'b'
  return 'pari'
}

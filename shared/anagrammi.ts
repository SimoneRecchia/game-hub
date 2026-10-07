/**
 * Gli Anagrammi: le lettere di una parola, mescolate, e si scrive la parola.
 *
 * Il gioco c'e' da sempre nelle riviste di enigmistica, e si chiama cosi'. La
 * classificata e' di cinque parole, una per lunghezza dalla piu' corta, le
 * stesse per tutti; ognuna ha il suo tempo, e piu' presto la si trova piu'
 * vale. Le parole e le risposte che si accettano le sceglie la notte
 * (scripts/genera-anagrammi.ts) da un elenco fatto dalle fonti del Wordle e
 * dalle definizioni del cruciverba (scripts/build-anagrammi.mjs).
 */

import { mulberry32, solutionPermutation } from './daily'

export const NOME_ANAGRAMMI = 'Anagrammi'

/** Le lunghezze delle parole di una giornata, nell'ordine in cui si giocano: dalla piu' corta. */
export const LUNGHEZZE_ANAGRAMMI = [5, 6, 7, 8, 9] as const

export const PAROLE_ANAGRAMMI = LUNGHEZZE_ANAGRAMMI.length

/** Il tempo di una parola: dopo, la parola e' persa e si passa alla seguente. */
export const TEMPO_PAROLA_MS = 90_000

/** Quanto arriva in ritardo una risposta per la rete e vale lo stesso, come nel quiz. */
export const MARGINE_ANAGRAMMI_MS = 3_000

/** I punti di una giornata finita, anche senza nessuna parola: si e' giocato. */
export const PUNTI_FINITA_ANAGRAMMI = 10

/** I punti di una parola trovata, comunque. */
export const PUNTI_PAROLA_ANAGRAMMI = 4

/** I punti in piu' di una parola trovata subito, che scendono con il tempo fino a zero. */
export const BONUS_ANAGRAMMI = 6

/** Quanto costa l'aiuto, la definizione della parola: meta' di quel che vale una parola trovata subito. */
export const COSTO_AIUTO_ANAGRAMMI = 3

/** Entro quanto una parola si trova "subito": tre secondi per lettera, perché nove lettere chiedono di piu'. */
export function subitoMs(lettere: number): number {
  return 3_000 * lettere
}

/**
 * I punti di una parola trovata in `ms`: quattro, piu' un bonus che vale sei
 * fino a `subitoMs` e scende dritto fino a zero allo scadere del tempo. Con
 * l'aiuto ne costa tre, e una parola trovata vale almeno uno.
 */
export function puntiParola(lettere: number, ms: number, aiuto: boolean): number {
  const subito = subitoMs(lettere)
  const quota = Math.min(1, Math.max(0, (TEMPO_PAROLA_MS - ms) / (TEMPO_PAROLA_MS - subito)))
  const punti = PUNTI_PAROLA_ANAGRAMMI + Math.round(BONUS_ANAGRAMMI * quota)
  return Math.max(1, punti - (aiuto ? COSTO_AIUTO_ANAGRAMMI : 0))
}

/** Una parola giocata, per i conti: trovata o no, in quanto, e con l'aiuto o senza. */
export interface ParolaGiocata {
  lettere: number
  trovata: boolean
  ms: number
  aiuto: boolean
}

/** I punti di una giornata finita: i dieci per averla giocata e quelli delle parole trovate. */
export function puntiAnagrammi(parole: readonly ParolaGiocata[]): number {
  return parole.reduce(
    (s, p) => s + (p.trovata ? puntiParola(p.lettere, p.ms, p.aiuto) : 0),
    PUNTI_FINITA_ANAGRAMMI,
  )
}

/** Il tetto: tutte le parole trovate subito, senza aiuto. */
export const MASSIMO_ANAGRAMMI = PUNTI_FINITA_ANAGRAMMI + PAROLE_ANAGRAMMI * (PUNTI_PAROLA_ANAGRAMMI + BONUS_ANAGRAMMI)

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

/** Una risposta come la confronta il gioco: minuscola, senza accenti, solo lettere. */
export function normalizzaAnagramma(parola: string): string {
  return parola
    .toLowerCase()
    .replace(/[àáèéìíòóùú]/g, (c) => ACCENTI[c])
    .replace(/[^a-z]/g, '')
}

/** Le lettere in ordine: due parole sono l'una l'anagramma dell'altra se hanno la stessa chiave. */
export function chiaveAnagramma(parola: string): string {
  return [...normalizzaAnagramma(parola)].sort().join('')
}

/**
 * Le lettere mescolate di una parola, con il generatore dato: mai una delle
 * risposte, e con meno lettere possibile al loro posto. Su venti mescolate
 * tiene quella che lascia meno lettere dove stavano, perché "ATTOER" per
 * ATTORE si legge da solo.
 */
export function mescolaAnagramma(parola: string, risposte: readonly string[], caso: () => number): string {
  const vietate = new Set(risposte.map(normalizzaAnagramma))
  vietate.add(normalizzaAnagramma(parola))
  const lettere = [...normalizzaAnagramma(parola)]
  let migliore: string | null = null
  let fermeMigliore = Infinity
  for (let tentativo = 0; tentativo < 20; tentativo += 1) {
    const prova = [...lettere]
    for (let i = prova.length - 1; i > 0; i -= 1) {
      const j = Math.floor(caso() * (i + 1))
      ;[prova[i], prova[j]] = [prova[j], prova[i]]
    }
    const testo = prova.join('')
    if (vietate.has(testo)) continue
    const ferme = prova.filter((c, i) => c === lettere[i]).length
    if (ferme < fermeMigliore) {
      migliore = testo
      fermeMigliore = ferme
      if (ferme === 0) break
    }
  }
  // Venti mescolate tutte uguali a una risposta non capitano: ma se capitasse, la parola al contrario.
  return migliore ?? [...lettere].reverse().join('')
}

/** Il seme delle lettere mescolate di una parola del giorno: lo stesso per tutti. */
export function semeMescolata(numero: number, indice: number): () => number {
  return mulberry32(numero * 7919 + indice * 104_729 + 0x5eed)
}

/** Una parola di una giornata, come la scrive la notte nel database. */
export interface ParolaDelGiorno {
  parola: string
  /** Le lettere mescolate, come le vede chi gioca. */
  lettere: string
  /** Tutte le parole con quelle lettere che si accettano, la parola compresa. */
  risposte: string[]
  definizione: string
}

/** Una risposta vale se e' una delle risposte della parola. */
export function rispostaGiusta(parola: Pick<ParolaDelGiorno, 'risposte'>, tentativo: string): boolean {
  const t = normalizzaAnagramma(tentativo)
  return parola.risposte.some((r) => normalizzaAnagramma(r) === t)
}

/** Una parola dell'elenco delle classificate: la scelgono le giornate. */
export interface ParolaDellElenco {
  parola: string
  risposte: string[]
  definizione: string
}

/** Il seme della sequenza di ogni lunghezza: cambiarlo cambierebbe le parole dei giorni ancora da scrivere. */
const SEME_SEQUENZA = 0xa9a9

/**
 * Le cinque parole di un giorno: per ogni lunghezza, la parola che la
 * sequenza di quella lunghezza mette al giorno `numero`. La sequenza e' una
 * permutazione fissa dell'elenco, come quella del Wordle, quindi una parola
 * non torna finché l'elenco della sua lunghezza non e' finito. Le lettere
 * mescolate vengono dal numero del giorno, le stesse per tutti.
 */
export function paroleDelGiorno(
  numero: number,
  elenco: ReadonlyMap<number, readonly ParolaDellElenco[]>,
): ParolaDelGiorno[] {
  return LUNGHEZZE_ANAGRAMMI.map((lunghezza, i) => {
    const parole = elenco.get(lunghezza)
    if (!parole || parole.length === 0) throw new Error(`Nessuna parola di ${lunghezza} lettere`)
    const ordine = solutionPermutation(parole.length, SEME_SEQUENZA + lunghezza)
    const k = ((numero % parole.length) + parole.length) % parole.length
    const scelta = parole[ordine[k]]
    return {
      parola: scelta.parola,
      lettere: mescolaAnagramma(scelta.parola, scelta.risposte, semeMescolata(numero, i)),
      risposte: scelta.risposte,
      definizione: scelta.definizione,
    }
  })
}

/** L'elenco delle classificate letto dal suo TSV: parola, risposte separate da virgole, definizione. */
export function elencoDaTsv(testo: string): Map<number, ParolaDellElenco[]> {
  const perLunghezza = new Map<number, ParolaDellElenco[]>()
  for (const riga of testo.split('\n')) {
    const [parola, risposte, definizione] = riga.split('\t')
    if (!parola || !definizione) continue
    const voce = { parola, risposte: risposte ? risposte.split(',') : [parola], definizione }
    const lista = perLunghezza.get(parola.length) ?? []
    lista.push(voce)
    perLunghezza.set(parola.length, lista)
  }
  for (const lista of perLunghezza.values()) lista.sort((a, b) => (a.parola < b.parola ? -1 : 1))
  return perLunghezza
}

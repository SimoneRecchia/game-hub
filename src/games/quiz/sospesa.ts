/**
 * Il quiz libero lasciato a meta', nel telefono.
 *
 * Si salvano le domande gia' fatte, non il seme: rigenerarle vorrebbe gli
 * stessi file del quiz, e un file aggiornato nel frattempo darebbe un'altra
 * partita. Cinquanta domande dell'arte, le piu' pesanti per le immagini e le
 * schede, sono una cinquantina di kB. Delle risposte bastano la scelta e il
 * tempo: il resto lo dice la domanda, come quando si e' risposto.
 *
 * Il tempo della domanda aperta si ferma quando si esce: `trascorsoMs` e'
 * quel che se ne e' gia' speso, `restanteMs` quel che ne resta (null, il tempo
 * intero o una domanda senza tempo).
 *
 * Il registro delle sospese decide se la partita c'e' ancora: lasciata dalle
 * Libere, o scaduta, la chiave se ne va con lei, ma una chiave rimasta senza il
 * suo biglietto vale come nessuna partita.
 */

import { chiudiSospesa, sospesaDi } from '@/games/sospese/registro'
import type { DomandaCompleta } from '@shared/quiz-domande'

export const CHIAVE_PARTITA = 'giochi.quiz.libera.partita'

export interface PartitaSalvata {
  v: 1
  /** L'indirizzo della partita, con le sue scelte: e' quello che la riprende. */
  a: string
  /** Il giorno della partita, per "Accadde oggi". */
  data: string
  /** Il giorno di "Accadde oggi", "03-12", se la partita e' quella. */
  giorno: string | null
  domande: DomandaCompleta[]
  /** Le risposte date, nell'ordine delle domande. */
  risposte: Array<{ scelta: string | null; ms: number }>
  indice: number
  ripassoDa: number | null
  finita: boolean
  aiutiRimasti: number
  trascorsoMs: number
  restanteMs: number | null
}

function eSalvata(x: unknown): x is PartitaSalvata {
  const p = x as PartitaSalvata | null
  return (
    !!p &&
    p.v === 1 &&
    typeof p.a === 'string' &&
    typeof p.data === 'string' &&
    Array.isArray(p.domande) &&
    p.domande.length > 0 &&
    Array.isArray(p.risposte) &&
    Number.isInteger(p.indice) &&
    p.indice >= 0 &&
    p.indice < p.domande.length &&
    p.risposte.length <= p.indice + 1
  )
}

/** La partita in sospeso, se c'e' ed e' quella di questo indirizzo. */
export function leggiPartitaQuiz(a: string): PartitaSalvata | null {
  const sospesa = sospesaDi('quiz')
  let grezza: unknown = null
  try {
    grezza = JSON.parse(localStorage.getItem(CHIAVE_PARTITA) ?? 'null')
  } catch {
    grezza = null
  }
  if (!sospesa) {
    // Lasciata da fuori, o mai registrata: quel che resta nel telefono non e' piu' una partita.
    if (grezza !== null) buttaPartitaQuiz()
    return null
  }
  if (!eSalvata(grezza)) {
    // Il biglietto senza la partita non si riprende: meglio toglierlo che lasciarlo li' a vuoto.
    buttaPartitaQuiz()
    chiudiSospesa('quiz', 'annullata')
    return null
  }
  return grezza.a === a ? grezza : null
}

export function salvaPartitaQuiz(p: PartitaSalvata): void {
  try {
    localStorage.setItem(CHIAVE_PARTITA, JSON.stringify(p))
  } catch {
    // Senza spazio la partita resta in memoria: uscendo si perde, come prima.
  }
}

export function buttaPartitaQuiz(): void {
  try {
    localStorage.removeItem(CHIAVE_PARTITA)
  } catch {
    // vedi salvaPartitaQuiz
  }
}

/** Lascia la partita in sospeso da fuori, prima di cominciarne un'altra. */
export function lasciaPartitaQuiz(): void {
  buttaPartitaQuiz()
  chiudiSospesa('quiz', 'annullata')
}

/**
 * Il riassunto dei dati del quiz nel browser: per le partite libere, e per dare
 * un nome a quel che si tocca sulla cartina.
 *
 * Si scarica una volta — un centinaio di kB, un quarto compresso — e si tiene
 * nel localStorage con la sua versione. Le volte dopo si chiede al server solo
 * se e' cambiato: la risposta e' due parole, e il riassunto cambia di rado. Se
 * il localStorage non c'e' (una finestra privata) si riscarica ogni volta, che
 * e' piu' lento ma funziona.
 */

import { api } from '@/lib/api'
import type { DatiQuiz } from '@shared/quiz-dati'
import { indicizza, type IndiceQuiz } from '@shared/quiz-domande'
import type { QuizDatiRisposta } from '@shared/types'

const CHIAVE = 'quiz-dati-v1'

let inCorso: Promise<IndiceQuiz> | null = null

function salvati(): DatiQuiz | null {
  try {
    const testo = localStorage.getItem(CHIAVE)
    return testo ? (JSON.parse(testo) as DatiQuiz) : null
  } catch {
    return null
  }
}

function salva(dati: DatiQuiz): void {
  try {
    localStorage.setItem(CHIAVE, JSON.stringify(dati))
  } catch {
    // Pieno o vietato: la prossima volta si riscarica.
  }
}

/** I dati del quiz, gia' indicizzati. Una richiesta per sessione, al massimo. */
export function caricaDatiQuiz(): Promise<IndiceQuiz> {
  inCorso ??= (async () => {
    const vecchi = salvati()
    const r = await api<QuizDatiRisposta>(`/quiz/dati${vecchi ? `?versione=${encodeURIComponent(vecchi.versione)}` : ''}`)
    const dati = r.dati ?? vecchi
    if (!dati) throw new Error('I dati del quiz non sono arrivati.')
    if (r.dati) salva(r.dati)
    return indicizza(dati)
  })().catch((e) => {
    inCorso = null
    throw e
  })
  return inCorso
}

/**
 * Il nome italiano di un posto della cartina: per dire "hai toccato la
 * Slovenia". I paesi hanno il codice numerico, i mari il loro identificativo.
 */
export function nomeDelLuogo(ix: IndiceQuiz, id: string): string | null {
  if (id.startsWith('n')) {
    const num = id.slice(1)
    return ix.dati.paesi.find((p) => p.num === num)?.n ?? null
  }
  return ix.acque.get(id)?.n ?? null
}

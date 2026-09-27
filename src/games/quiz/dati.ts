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

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { DatiQuiz } from '@shared/quiz-dati'
import { indicizza, type IndiceQuiz } from '@shared/quiz-domande'
import type { QuizDatiRisposta } from '@shared/types'

// La versione 2 ha le capitali sulla cartina, i confini sicuri e le geometrie: quella di prima non basta.
const CHIAVE = 'quiz-dati-v2'

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
    if (!dati) throw new Error('Non riesco a scaricare i dati del quiz.')
    if (r.dati) salva(r.dati)
    return indicizza(dati)
  })().catch((e) => {
    inCorso = null
    throw e
  })
  return inCorso
}

/** I dati, quando servono e quando arrivano: `attivo` falso non li chiede. */
export function useIndiceQuiz(attivo = true): IndiceQuiz | null {
  const [ix, setIx] = useState<IndiceQuiz | null>(null)
  useEffect(() => {
    if (!attivo) return
    let vivo = true
    caricaDatiQuiz()
      .then((i) => vivo && setIx(i))
      .catch(() => {
        // La cartina lo dira' da sola: qui i dati sono un contorno.
      })
    return () => {
      vivo = false
    }
  }, [attivo])
  return ix
}

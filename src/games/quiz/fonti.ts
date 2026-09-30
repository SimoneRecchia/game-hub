/**
 * Da dove vengono le domande di una partita nel browser: il riassunto della
 * geografia, o il file della materia, o i fatti del giorno di "Accadde oggi".
 *
 * I file delle altre materie sono statici, sulle Pages (`public/quiz/`), con
 * l'impronta nell'indirizzo: si scaricano la prima volta che si gioca quella
 * materia, e poi li tiene la cache del browser. Il server non li vede.
 */

import { gameDate } from '@shared/daily'
import type { CategoriaQuiz } from '@shared/quiz'
import {
  giornoDellAnno,
  urlDatiCultura,
  urlOggi,
  type CategoriaCultura,
  type DatiCultura,
  type DatiOggi,
} from '@shared/quiz-cultura'
import type { CittaQuiz } from '@shared/quiz-dati'
import type { AreaQuiz } from '@shared/quiz-domande'
import { eCultura, type FontiQuiz } from '@shared/quiz-domande-cultura'
import { caricaCitta } from './citta'
import { caricaDatiQuiz } from './dati'

type Materia = Exclude<CategoriaCultura, 'oggi'>

const inCorso = new Map<string, Promise<unknown>>()

async function scaricaJson<T>(url: string): Promise<T> {
  const r = await fetch(url)
  // A un indirizzo che non c'e' le Pages rispondono con la pagina dell'app, e con un 200.
  if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) {
    throw new Error('Non riesco a scaricare le domande: riprova fra poco.')
  }
  return (await r.json()) as T
}

function una<T>(url: string): Promise<T> {
  let p = inCorso.get(url) as Promise<T> | undefined
  if (!p) {
    p = scaricaJson<T>(url).catch((e) => {
      inCorso.delete(url)
      throw e
    })
    inCorso.set(url, p)
  }
  return p
}

export function caricaCultura<C extends Materia>(categoria: C): Promise<DatiCultura[C]> {
  return una<DatiCultura[C]>(urlDatiCultura(categoria))
}

/** I fatti di un giorno dell'anno: "03-15". */
export function caricaOggi(giorno: string): Promise<DatiOggi> {
  return una<DatiOggi>(urlOggi(giorno))
}

/** Tutto quel che serve alle domande di una categoria, e le città se la categoria e' quella. */
export async function fontiDelQuiz(
  categoria: CategoriaQuiz,
  area: AreaQuiz,
): Promise<{ fonti: FontiQuiz; citta: CittaQuiz[] | null }> {
  if (eCultura(categoria)) {
    if (categoria === 'oggi') return { fonti: { oggi: await caricaOggi(giornoDellAnno(gameDate())) }, citta: null }
    return { fonti: { cultura: { [categoria]: await caricaCultura(categoria) } }, citta: null }
  }
  const ix = await caricaDatiQuiz()
  const citta = categoria === 'citta' ? await caricaCitta(ix, area) : null
  return { fonti: { geo: ix }, citta }
}

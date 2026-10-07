/**
 * Da dove vengono le domande di una partita nel browser: il riassunto della
 * geografia, o il file della materia, o i fatti del giorno di "Accadde oggi".
 *
 * I file delle altre materie sono statici, sulle Pages (`public/quiz/`), con
 * l'impronta nell'indirizzo: si scaricano la prima volta che si gioca quella
 * materia, e poi li tiene la cache del browser. Il server non li vede.
 */

import { api } from '@/lib/api'
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
import type { QuizSummary } from '@shared/types'
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

/**
 * Tutto quel che serve alle domande di una o piu' categorie, e le città se fra
 * le categorie ci sono. `data` e' il giorno di "Accadde oggi".
 */
export async function fontiDelQuiz(
  categorie: CategoriaQuiz | readonly CategoriaQuiz[],
  area: AreaQuiz,
  data = gameDate(),
): Promise<{ fonti: FontiQuiz; citta: CittaQuiz[] | null }> {
  const elenco = [...new Set(typeof categorie === 'string' ? [categorie] : categorie)]
  const fonti: FontiQuiz = {}
  let citta: CittaQuiz[] | null = null
  await Promise.all(
    elenco.map(async (categoria) => {
      if (categoria === 'oggi') {
        fonti.oggi = await caricaOggi(giornoDellAnno(data))
      } else if (eCultura(categoria)) {
        // Prima il file e poi l'elenco: `{ ...fonti.cultura, [c]: await ... }` copierebbe l'elenco prima di
        // aspettare, e con due materie insieme l'ultima ad arrivare cancellerebbe l'altra.
        const dati = await caricaCultura(categoria)
        fonti.cultura = { ...fonti.cultura, [categoria]: dati }
      } else {
        const ix = await caricaDatiQuiz()
        fonti.geo = ix
        if (categoria === 'citta') citta = await caricaCitta(ix, area)
      }
    }),
  )
  return { fonti, citta }
}

/** Un giorno dell'anno a caso, ma non quello di `oggi`: "2026-03-12". Il 29 febbraio c'e', come negli altri anni. */
export function giornoACaso(oggi: string): string {
  const giorni: string[] = []
  for (let m = 1; m <= 12; m += 1) {
    const fine = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]
    for (let g = 1; g <= fine; g += 1) giorni.push(`${String(m).padStart(2, '0')}-${String(g).padStart(2, '0')}`)
  }
  const altri = giorni.filter((g) => g !== giornoDellAnno(oggi))
  return `${oggi.slice(0, 4)}-${altri[Math.floor(Math.random() * altri.length)]}`
}

/**
 * Il giorno di una partita di "Accadde oggi" fuori dalla classificata: oggi,
 * se non e' anche il quiz del giorno, o un giorno a caso. La libera sa che
 * oggi e' "Accadde oggi" e lo aspetta finché la classificata non e' chiusa;
 * la sfida non lo usa mai, perché l'altro potrebbe non averla giocata. Senza
 * rete si gioca oggi: la classificata, senza rete, non si gioca comunque.
 */
export async function giornoDellaPartita(giorno: 'caso' | undefined, sfida: boolean): Promise<string> {
  const oggi = gameDate()
  if (giorno === 'caso') return giornoACaso(oggi)
  const s = await api<QuizSummary>('/quiz/summary').catch(() => null)
  const libero = !s || s.categoria !== 'oggi' || (!sfida && s.status === 'done')
  return libero ? oggi : giornoACaso(oggi)
}

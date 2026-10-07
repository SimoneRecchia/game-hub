/**
 * Le città della categoria delle città, nel browser.
 *
 * Le prepara lo script della notte da Wikidata — le principali di ogni paese,
 * fino ai capoluoghi, con la loro regione — e il browser le chiede solo quando
 * si gioca alle città: sono qualche migliaio, e chi gioca alle bandiere non le
 * scarica. L'indirizzo porta la versione, e il browser le tiene per sempre.
 */

import { api } from '@/lib/api'
import { cittaDaBreve, type CittaInBreve, type CittaQuiz } from '@shared/quiz-dati'
import { cittaDellArea, type AreaQuiz, type IndiceQuiz } from '@shared/quiz-domande'

let inCorso: { versione: string; promessa: Promise<CittaQuiz[]> } | null = null

function tutte(versione: string): Promise<CittaQuiz[]> {
  if (inCorso?.versione === versione) return inCorso.promessa
  const promessa = api<{ versione: string; regioni: Record<string, string>; citta: Record<string, CittaInBreve> }>(
    `/quiz/citta?v=${encodeURIComponent(versione)}`,
  )
    .then((r) => Object.entries(r.citta).map(([id, breve]) => cittaDaBreve(id, breve, r.regioni)))
    .catch((e) => {
      inCorso = null
      throw e
    })
  inCorso = { versione, promessa }
  return promessa
}

/** Le città di una partita (vedi `cittaDellArea`): di un paese tutte, del mondo o di un continente le piu' note. */
export async function caricaCitta(ix: IndiceQuiz, area: AreaQuiz): Promise<CittaQuiz[]> {
  if (!ix.dati.citta) throw new Error('Le città del quiz non sono ancora pronte. Riprova più tardi.')
  return cittaDellArea(ix, await tutte(ix.dati.citta), area)
}

/** Quante città ha ogni paese: per l'elenco dei paesi su cui si puo' giocare. */
export async function contaCitta(ix: IndiceQuiz): Promise<Map<string, number>> {
  const conti = new Map<string, number>()
  if (!ix.dati.citta) return conti
  for (const c of await tutte(ix.dati.citta)) conti.set(c.p, (conti.get(c.p) ?? 0) + 1)
  return conti
}

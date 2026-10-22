import { Navigate, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { ROTTE, SLUG, giocoDaSlug, giocoFortunaDaSlug } from '@/app/rotte'
import type { ChiaveClassifica, GiocoClassificato } from '@shared/types'
import { Panoramica } from './classifica/Panoramica'
import { indietroDa, scopeDa } from './classifica/Periodo'
import './classifica/Classifica.css'

/**
 * Le classifiche, in una pagina sola: la generale, che somma le classificate
 * di tutti i giochi, con il podio grande, e sotto i primi tre di ogni gioco.
 * Una classifica per intero si apre in un foglio sopra la pagina, e non in
 * una pagina sua: erano tre schermate che dicevano la stessa cosa, la
 * panoramica, la classifica di un gioco e il foglio di un giocatore.
 *
 * Il foglio aperto sta nell'indirizzo (/classifica/wordle), come il periodo
 * (?periodo=week&indietro=1): le schermate di fine partita ci portano dritte,
 * e tornando indietro dal profilo di un giocatore il foglio e' ancora aperto.
 * Una rotta sola, con il gioco facoltativo, così aprire e chiudere il foglio
 * non rimonta la pagina.
 */
export default function Classifica() {
  const { gioco: slug } = useParams()
  const [query] = useSearchParams()
  const { pathname } = useLocation()

  // I vecchi link: /classifica?gioco=scarabeo.
  const vecchio = query.get('gioco')
  if (vecchio && pathname === '/classifica') {
    const g = (Object.keys(SLUG) as GiocoClassificato[]).find((k) => k === vecchio)
    return <Navigate to={g ? ROTTE.classifica(g) : ROTTE.classifica()} replace />
  }

  const scope = scopeDa(query.get('periodo'))
  const indietro = indietroDa(query.get('indietro'))
  // /classifica/fortuna non apre un foglio: porta alle classifiche dei suoi giochi, una per gioco.
  const fortuna = slug === 'fortuna'
  const aperta: ChiaveClassifica | null =
    !slug || fortuna ? null : slug === 'generale' ? slug : (giocoDaSlug(slug) ?? giocoFortunaDaSlug(slug))
  if (slug && !fortuna && !aperta) return <Navigate to={ROTTE.classifica()} replace />
  return <Panoramica scope={scope} indietro={indietro} aperta={aperta} fortuna={fortuna} />
}

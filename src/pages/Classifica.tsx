import { Navigate, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { ROTTE, SLUG, giocoDaSlug } from '@/app/rotte'
import type { ChiaveClassifica, GiocoClassificato } from '@shared/types'
import { Completa } from './classifica/Completa'
import { Panoramica } from './classifica/Panoramica'
import { indietroDa, scopeDa } from './classifica/Periodo'
import './classifica/Classifica.css'

/**
 * Le classifiche: la generale, che somma le classificate di tutti i giochi, e
 * quella di ogni gioco, per giorno, settimana, mese o da sempre.
 *
 * Si possono sommare perché ogni classificata vale al massimo cento punti
 * (vedi shared/punti.ts); ogni gioco tiene comunque la sua, con i suoi
 * spareggi, perché chi gioca solo al cruciverba vuole sapere come va lì.
 *
 * /classifica le mette tutte insieme, i primi tre di ognuna; /classifica/generale
 * e /classifica/<gioco> ne aprono una per intero. Il periodo sta nell'indirizzo
 * (?periodo=week&indietro=1), così una classifica si linka com'e'.
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
  if (!slug) return <Panoramica scope={scope} indietro={indietro} />

  const chiave: ChiaveClassifica | null = slug === 'generale' ? 'generale' : giocoDaSlug(slug)
  if (!chiave) return <Navigate to={ROTTE.classifica()} replace />
  return <Completa key={chiave} chiave={chiave} scope={scope} indietro={indietro} />
}

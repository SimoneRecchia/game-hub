/**
 * Le città dei luoghi: di un museo, di un teatro. Wikidata le dice risalendo
 * "si trova in" (P131), che pero' si ferma spesso a un quartiere: il Louvre e'
 * nel primo arrondissement, la Scala nel Municipio 1. Si risale fino in cima e
 * si tiene la città piu' nota che si incontra, e il primo arrondissement lascia
 * il posto a Parigi.
 */

import { aPezzi, nomeItaliano, schede } from './wikidata'

/**
 * Le città che Wikidata mette dentro un'altra: i quartieri di Londra sono
 * "city" anche loro, e la National Gallery risulterebbe a Westminster.
 */
const CITTA_DI_OGGI: Record<string, string> = {
  Q179351: 'Londra', // City of Westminster
  Q23311: 'Londra', // City of London
}

/** La città di ogni luogo, per identificativo; manca se non se ne trova una con il nome italiano. */
export async function cittaDi(nome: string, ids: readonly string[]): Promise<Map<string, string>> {
  const righe = await aPezzi(
    nome,
    ids,
    `SELECT ?q ?citta WHERE {
  VALUES ?q { #VOCI# }
  ?q (wdt:P131|wdt:P276)+ ?citta .
  ?citta wdt:P31/wdt:P279* ?tipo .
  VALUES ?tipo { wd:Q515 wd:Q15284 }
}`,
  )
  const idCitta = [...new Set(righe.map((r) => r.citta).filter((c): c is string => !!c))]
  const s = await schede(`${nome}-schede`, idCitta)
  const migliore = new Map<string, { nome: string; voci: number }>()
  for (const r of righe) {
    const sc = r.citta ? s.get(r.citta) : undefined
    const trovato = r.citta && CITTA_DI_OGGI[r.citta] ? CITTA_DI_OGGI[r.citta] : nomeItaliano(sc)
    if (!r.q || !sc || !trovato || r.citta === r.q) continue
    // "comune di Copenaghen" e' il comune: la città si chiama Copenaghen.
    const citta = trovato.replace(/^comune di /i, '')
    const prima = migliore.get(r.q)
    if (!prima || sc.voci > prima.voci) migliore.set(r.q, { nome: citta, voci: sc.voci })
  }
  return new Map([...migliore].map(([q, c]) => [q, c.nome]))
}

/** I luoghi che sono essi stessi città: la prima di un'opera a volte e' "Vienna", non un teatro. */
export async function sonoCitta(nome: string, ids: readonly string[]): Promise<Set<string>> {
  const righe = await aPezzi(
    nome,
    ids,
    `SELECT DISTINCT ?q WHERE {
  VALUES ?q { #VOCI# }
  ?q wdt:P31/wdt:P279* ?tipo .
  VALUES ?tipo { wd:Q515 wd:Q15284 }
}`,
  )
  return new Set(righe.map((r) => r.q).filter((q): q is string => !!q))
}

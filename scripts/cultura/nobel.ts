/**
 * I premi Nobel: chi li ha vinti, quale e in che anno, per tutti e sei i premi.
 *
 * Un premio e' una dichiarazione "premio ricevuto" con il suo anno (P585): chi
 * ne ha vinti due ne ha due (Marie Curie, la fisica nel 1903 e la chimica nel
 * 1911), e il Comitato internazionale della Croce Rossa tre. Senza l'anno il
 * premio non entra. La motivazione solo se Wikidata la ha in italiano.
 */

import { PREMI_NOBEL, type DatiNobel, type NobelQuiz, type PremioNobel } from '../../shared/quiz-cultura'
import { elencoPersone, persone } from './persone'
import { interroga } from './rete'
import { annoDaData, nonDeprecata, valoriSparql } from './wikidata'

const PREMI: Record<string, PremioNobel> = {
  Q37922: 'letteratura',
  Q38104: 'fisica',
  Q44585: 'chimica',
  Q80061: 'medicina',
  Q35637: 'pace',
  Q47170: 'economia',
}

const Q_PREMI = `SELECT ?chi ?premio ?st ?anno ?motivo ?lingua ?rango WHERE {
  VALUES ?premio { ${valoriSparql(Object.keys(PREMI))} }
  ?chi p:P166 ?st . ?st ps:P166 ?premio ; wikibase:rank ?rango .
  OPTIONAL { ?st pq:P585 ?anno }
  OPTIONAL { ?st pq:P6208 ?motivo . BIND(LANG(?motivo) AS ?lingua) }
}`

export async function nobel(): Promise<Omit<DatiNobel, 'versione'>> {
  console.log('Nobel')
  const righe = (await interroga('nobel-premi', Q_PREMI)).filter(nonDeprecata)
  const perChiave = new Map<string, NobelQuiz>()
  for (const r of righe) {
    const premio = PREMI[r.premio ?? '']
    const anno = annoDaData(r.anno)
    if (!r.chi || !premio || anno === undefined || anno < 1901) continue
    const chiave = `${r.chi} ${premio} ${anno}`
    const prima = perChiave.get(chiave)
    const motivo = r.lingua === 'it' && r.motivo ? r.motivo.trim().replace(/'/g, '’') : undefined
    if (!prima) perChiave.set(chiave, { chi: r.chi, premio, anno, ...(motivo ? { motivo } : {}) })
    else if (motivo && !prima.motivo) prima.motivo = motivo
  }
  const premiati = await persone('nobel-premiati', [...new Set([...perChiave.values()].map((p) => p.chi))])
  const premi = [...perChiave.values()]
    .filter((p) => premiati.has(p.chi))
    .sort(
      (a, b) =>
        a.anno - b.anno || PREMI_NOBEL.indexOf(a.premio) - PREMI_NOBEL.indexOf(b.premio) || a.chi.localeCompare(b.chi),
    )
  console.log(`  ${perChiave.size} premi con l'anno, ${premi.length} con il nome di chi l'ha vinto`)
  const usati = [...new Set(premi.map((p) => p.chi))].map((id) => premiati.get(id)!)
  return { premi, premiati: await elencoPersone(usati) }
}

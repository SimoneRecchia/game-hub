/**
 * La lirica: le opere con chi le ha composte, il libretto, la prima
 * rappresentazione — l'anno, il teatro, la città — e la lingua.
 *
 * Un'opera e' una voce che Wikidata dice opera lirica, per classe (anche le sue
 * sottoclassi: l'opera buffa, il dramma giocoso, il Singspiel), per genere o per
 * forma, con un compositore che e' una persona. Serve anche la forma (P7937):
 * Rigoletto e' solo un'"opera drammatico-musicale" di forma "opera", e senza
 * sarebbe rimasto fuori. La città della prima e' quella del teatro,
 * risalendo "si trova in" come per i musei (vedi luoghi.ts).
 */

import type { DatiLirica, OperaQuiz } from '../../shared/quiz-cultura'
import { lingueDi } from './lingue'
import { cittaDi, sonoCitta } from './luoghi'
import { elencoPersone, persone } from './persone'
import { interroga, letture, ordineDichiarazioni } from './rete'
import {
  anni,
  annoSicuro,
  inOrdine,
  maiuscolaIniziale,
  nomeItaliano,
  notorietaItaliana,
  numero,
  perFama,
  perNotorieta,
  primi,
  schede,
  titoliUnici,
  titoloItaliano,
  valori,
  valoriCerti,
} from './wikidata'

const OPERE = 400

/** Quel che il filtro delle classi non prende, perché Wikidata lo dice in un altro modo. */
const NON_OPERE = new Set([
  'Q1469717', // La donna è mobile, un'aria del Rigoletto
  'Q1074321', // Tanz der Vampire, un musical
])
const CANDIDATI = 1500

/*
 * Le arie hanno il genere "opera" anche loro: senza toglierle, "La donna è
 * mobile" e "Nessun dorma" erano opere di Verdi e di Puccini. Per Wikidata
 * un'aria e' un'"opera musicale" (Q105543609), un'opera un'"opera
 * drammatico-musicale"; fuori anche i musical, che hanno il genere loro.
 */
const Q_CANDIDATI = `SELECT DISTINCT ?q ?voci WHERE {
  { ?q wdt:P31/wdt:P279* wd:Q1344 } UNION { ?q wdt:P136 wd:Q1344 } UNION { ?q wdt:P7937 wd:Q1344 }
  FILTER NOT EXISTS { ?q wdt:P31 wd:Q105543609 }
  FILTER NOT EXISTS { ?q wdt:P136 wd:Q2743 }
  ?q wdt:P86 ?compositore .
  ?compositore wdt:P31 wd:Q5 .
  ?q wikibase:sitelinks ?voci .
}
ORDER BY DESC(?voci)
LIMIT ${CANDIDATI}`

export async function lirica(): Promise<Omit<DatiLirica, 'versione'>> {
  console.log('Lirica')
  const candidati = await interroga('lirica-candidati-senza-arie-2', Q_CANDIDATI)
  const voci = new Map(candidati.map((r) => [r.q!, numero(r.voci)]))
  const ids = [...voci.keys()]
  const s = await schede('lirica-schede', ids)
  const conNome = ids.filter((id) => titoloItaliano(s.get(id)))
  const v = await valori('lirica-valori', conNome, ['P87', 'P4647', 'P407'])
  const date = await anni('lirica-anni', conNome, ['P1191'])
  const certi = await valoriCerti('lirica-composte', conNome, 'P86')

  const compositori = await persone('lirica-compositori', [...new Set(conNome.flatMap((id) => certi.get(id) ?? []))])
  const umani = (id: string) => (certi.get(id) ?? []).filter((c) => compositori.get(c)?.umano)
  const conCompositore = conNome.filter((id) => umani(id).length > 0)
  const nomiLingue = await schede('lirica-lingue', [...new Set(conCompositore.flatMap((id) => primi(v, id, 'P407')))])
  const lingue = (id: string) => lingueDi(primi(v, id, 'P407'), nomiLingue)
  const italiano = (id: string) => umani(id).some((c) => compositori.get(c)?.it) || lingue(id).includes('italiano')
  const lette = await letture(conCompositore.map((id) => s.get(id)?.voce).filter((t): t is string => !!t))
  const peso = (id: string) => notorietaItaliana(voci.get(id) ?? 0, lette.get(s.get(id)?.voce ?? '') ?? 0)
  const unici = titoliUnici(
    conCompositore.filter((id) => !NON_OPERE.has(id)),
    (id) => titoloItaliano(s.get(id))!,
    (id) => voci.get(id) ?? 0,
    (id) => umani(id).join(' '),
  )
  const scelte = unici.sort((a, b) => peso(b) - peso(a) || a.localeCompare(b)).slice(0, OPERE)
  console.log(
    `  ${ids.length} candidate, ${conNome.length} con il titolo in italiano, ` +
      `${conCompositore.length} con il compositore, ${unici.length} con un titolo solo, ${scelte.length} tenute`,
  )

  const ordine = await ordineDichiarazioni(
    scelte.filter((id) => umani(id).length > 1 || primi(v, id, 'P87').length > 1),
    ['P86', 'P87'],
  )
  const teatri = [...new Set(scelte.flatMap((id) => primi(v, id, 'P4647')))]
  const librettisti = [...new Set(scelte.flatMap((id) => primi(v, id, 'P87')))]
  const contorno = await schede('lirica-contorno', [...teatri, ...librettisti])
  const citta = await cittaDi('lirica-citta', teatri)
  const cittaStesse = await sonoCitta('lirica-teatri-citta', teatri)

  const fama = perNotorieta(
    scelte.map((id) => ({ id })),
    (x) => peso(x.id),
  )
  const elenco: OperaQuiz[] = scelte.map((id) => {
    const c = inOrdine(umani(id), ordine.get(id)?.get('P86'), (x) => compositori.get(x)?.voci ?? 0)
    const lib = inOrdine(primi(v, id, 'P87'), ordine.get(id)?.get('P87'), (x) => contorno.get(x)?.voci ?? 0)
      .map((x) => nomeItaliano(contorno.get(x), { mul: true }))
      .filter((n): n is string => !!n)
    // La prima rappresentazione: una sola, e se Wikidata ne dice due lontane non si sa quale.
    const anno = annoSicuro(date.get(id)?.get('P1191'), { scarto: 1 })
    // Un teatro solo: "la prima fu a Vienna e a Praga" non e' una risposta.
    const [luogo, altro] = primi(v, id, 'P4647')
    const unico = luogo && !altro ? luogo : undefined
    // "teatro alla Scala" e' l'etichetta, "Teatro alla Scala" il nome.
    const etichettaTeatro = unico && !cittaStesse.has(unico) ? nomeItaliano(contorno.get(unico)) : undefined
    const nomeTeatro = etichettaTeatro && maiuscolaIniziale(etichettaTeatro)
    const cittaTeatro = !unico
      ? undefined
      : cittaStesse.has(unico)
        ? nomeItaliano(contorno.get(unico))
        : citta.get(unico)
    const lingueOpera = lingue(id)
    const sc = s.get(id)!
    return {
      id,
      n: titoloItaliano(sc)!,
      c,
      ...(lib.length > 0 ? { lib } : {}),
      ...(anno !== undefined ? { anno } : {}),
      ...(nomeTeatro ? { teatro: nomeTeatro } : {}),
      // La città anche senza il teatro, quando Wikidata dice solo quella.
      ...(cittaTeatro ? { citta: cittaTeatro } : {}),
      ...(lingueOpera.length === 1 ? { lingua: lingueOpera[0] } : {}),
      ...(italiano(id) ? { it: 1 as const } : {}),
      ...(sc.voce ? { w: sc.voce } : {}),
      f: fama.get(id) ?? 0,
    }
  })
  const usati = [...new Set(elenco.flatMap((o) => o.c))].map((c) => compositori.get(c)!).filter(Boolean)
  return { opere: perFama(elenco), compositori: await elencoPersone(usati) }
}

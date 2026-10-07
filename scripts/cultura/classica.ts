/**
 * La musica classica: i brani piu' noti — sinfonie, concerti, balletti, suite,
 * sonate — con chi li ha composti e quando.
 *
 * Un brano e' una composizione musicale o un balletto di Wikidata, di un
 * compositore nato fra il 1550 e il 1910, con la voce di Wikipedia in
 * italiano. Le opere liriche stanno nella lirica, e qui non entrano: ne' le
 * opere drammatico-musicali, ne' quello che ha la lirica per genere o per
 * forma. Fuori anche gli inni nazionali e religiosi, le canzoni e le carole di
 * Natale, che hanno un compositore ma non sono "musica classica" per nessuno.
 *
 * Wikidata dice "composizione musicale" anche di "'O sole mio", di
 * "L'Internazionale" e di "Over the Rainbow", e i loro autori sono compositori
 * nati prima del 1910 anche loro. Un brano resta se ha un genere della musica
 * classica (`GENERI_CLASSICI`), o se l'ha scritto un compositore classico
 * (per genere o per mestiere), o se chi l'ha scritto non scriveva canzoni e il
 * brano non ha un genere popolare (`GENERI_POPOLARI`): Chopin e Paganini per
 * Wikidata non hanno un genere, ma nemmeno scrivevano canzoni. Le arie stanno
 * nella lirica: un brano che e' parte di un'opera, o scritto per un'opera, o
 * che ha la forma di un'aria o di una canzone, resta fuori; e per Wikidata le
 * opere sono "opere drammatico-musicali" prima che opere liriche.
 *
 * Il titolo deve dire un brano solo. "Sinfonia n. 9" sono quattro sinfonie di
 * quattro compositori, e "chi l'ha composta?" avrebbe quattro risposte: un
 * titolo con un numero d'ordine o di catalogo resta fuori, a meno che il brano
 * non abbia un soprannome ("Sinfonia n. 3 «Eroica»"), e cosi' quelli che
 * dicono una forma e basta ("Requiem", "Ave Maria").
 */

import type { BranoQuiz, DatiClassica } from '../../shared/quiz-cultura'
import { elencoPersone, persone } from './persone'
import { interroga, letture, ordineDichiarazioni } from './rete'
import {
  anni,
  annoSicuro,
  aPezzi,
  inOrdine,
  notorietaItaliana,
  numero,
  perFama,
  perNotorieta,
  schede,
  titoliUnici,
  titoloItaliano,
  titoloNormale,
  valoriCerti,
  valoriSparql,
} from './wikidata'

const BRANI = 300
const CANDIDATI = 2500

/** Le classi dei brani: la composizione musicale e il balletto. */
const CLASSI = ['Q105543609', 'Q15079786']

/** Quel che ha un compositore ma non e' un brano da quiz: le opere per la scena, gli inni, le canzoni. */
const NON_BRANI = [
  'Q58483083', // opera drammatico-musicale: le opere liriche, le operette
  'Q1344', // opera lirica
  'Q23691', // inno nazionale
  'Q484692', // inno
  'Q856713', // inno cristiano
  'Q7366', // canzone
  'Q134556', // singolo
  'Q503354', // carola natalizia
  'Q1123037', // filastrocca
  'Q7148059', // canto patriottico
  'Q2743', // musical
]

/** I generi e le forme della musica classica: da uno di loro (o da una sua sottoclasse) un brano e' classico. */
const GENERI_CLASSICI = [
  'Q9730', // musica classica
  'Q8361', // musica barocca
  'Q207591', // musica romantica
  'Q271802', // poema sinfonico
  'Q9748', // concerto
  'Q633441', // concerto per violino
  'Q217295', // messa
  'Q189201', // musica da camera
  'Q639197', // musica strumentale
  'Q3328774', // musica sinfonica
  'Q209741', // musica a programma
  'Q464769', // rapsodia
  'Q781815', // passione
  'Q85477', // oratorio
  'Q1065742', // musica sacra
  'Q935586', // musica liturgica
  'Q893466', // ciclo di canzoni: i Lieder
  'Q1464124', // valzer da concerto
  'Q180853', // pavana
  'Q194172', // notturno
  'Q1147752', // musiche di scena
  'Q41425', // balletto
  'Q211025', // marcia
]

/** I generi di quel che non e' musica classica: le canzoni, gli inni, il jazz, la musica popolare. */
const GENERI_POPOLARI = [
  'Q373342', // musica popolare
  'Q235858', // musica tradizionale
  'Q43343', // folk
  'Q943929', // canto popolare
  'Q182659', // ballata popolare
  'Q1195630', // canzone napoletana
  'Q7366', // canzone
  'Q493169', // canzone per bambini
  'Q2389651', // musica per bambini
  'Q265147', // canzone politica
  'Q7148059', // canto patriottico
  'Q2298624', // canto di soldati
  'Q6774721', // musica militare
  'Q484692', // inno
  'Q541947', // inno
  'Q503354', // carola natalizia
  'Q1443316', // musica natalizia
  'Q37073', // musica pop
  'Q1196752', // pop tradizionale
  'Q8341', // jazz
  'Q9759', // blues
  'Q203775', // swing
  'Q185652', // ragtime
  'Q14390274', // tango
  'Q1062400', // chanson
  'Q83440', // country
  'Q2743', // musical
  'Q241501', // cantastorie
  'Q153071', // polka
  'Q1716019', // musica ebraica
  'Q1151663', // novelty song
]

/** Un compositore classico per mestiere. */
const COMPOSITORE_CLASSICO = 'Q21680663'

/** I mestieri di chi scriveva canzoni: l'autore, il paroliere, il cantante, il musicista jazz, il capobanda. */
const SCRIVEVA_CANZONI = [
  'Q753110', // autore di canzoni
  'Q822146', // paroliere
  'Q488205', // cantautore
  'Q177220', // cantante
  'Q15981151', // musicista jazz
  'Q806349', // direttore di banda musicale
]

/** I brani che passano ogni regola e non sono da quiz: un canone di Mozart dal titolo che non si scrive, un inno. */
const BRANI_SBAGLIATI = new Set([
  'Q1373720', // il canone di Mozart in si bemolle, K 231
  'Q215729', // Rule, Britannia!
  'Q747113', // una canzone di guerra inglese
  'Q16035010', // Je cherche après Titine
  'Q18385093', // Casatschok
  'Q1352178', // Va, pensiero: e' il coro del Nabucco, e sta nella lirica
  // Canzoni, inni e canti che Wikidata non dice tali.
  'Q18288', // Katjuša
  'Q546850', // Fischia il vento
  'Q369453', // Funiculì funiculà
  'Q747869', // Gloomy Sunday
  'Q947444', // John Brown's Body
  'Q583210', // The Battle Hymn of the Republic
  'Q2528266', // It's Oh So Quiet
  'Q3596177', // 'A Vucchella
  'Q1828805', // The Man I Love
])

const Q_CANDIDATI = `SELECT DISTINCT ?q ?voci WHERE {
  VALUES ?classe { ${valoriSparql(CLASSI)} }
  ?q wdt:P31 ?classe ; wdt:P86 ?chi .
  ?chi wdt:P31 wd:Q5 ; wdt:P106 wd:Q36834 ; wdt:P569 ?nato .
  FILTER(YEAR(?nato) > 1550 && YEAR(?nato) < 1910)
  ?articolo schema:about ?q ; schema:isPartOf <https://it.wikipedia.org/> .
  ?q wikibase:sitelinks ?voci .
}
ORDER BY DESC(?voci)
LIMIT ${CANDIDATI}`

/**
 * I titoli che sono una forma e basta, e che hanno decine di brani: "chi ha
 * composto il Requiem?" ha Mozart, Verdi, Fauré e Brahms.
 */
const SOLO_UNA_FORMA = new Set(
  [
    'requiem',
    'ave maria',
    'stabat mater',
    'magnificat',
    'gloria',
    'te deum',
    'messa',
    'messa da requiem',
    'miserere',
    'salve regina',
    'ave verum corpus',
    'marcia nuziale',
    'marcia funebre',
    'ninna nanna',
    'serenata',
    'notturno',
    'barcarola',
    'rapsodia',
    'ciaccona',
    'passacaglia',
    'canone',
    'adagio',
    'minuetto',
    'valzer',
    'preludio',
    'toccata',
  ].map(titoloNormale),
)

/** Un numero d'ordine o di catalogo: "n. 9", "op. 27", "BWV 565", "K 525", "RV 269". */
const NUMERATO = /\b(?:n\.|op\.|bwv|k\.?|kv|rv|hob\.?|d\.?)\s*\d/i

export async function classica(lirica: ReadonlySet<string>): Promise<Omit<DatiClassica, 'versione'>> {
  console.log('Classica')
  const candidati = await interroga('classica-candidati', Q_CANDIDATI)
  const voci = new Map(candidati.map((r) => [r.q!, numero(r.voci)]))
  const ids = [...voci.keys()].filter((id) => !lirica.has(id))
  const s = await schede('classica-schede', ids)
  const righeNon = await aPezzi(
    'classica-non',
    ids,
    `SELECT DISTINCT ?q WHERE {
  VALUES ?q { #VOCI# }
  VALUES ?radice { ${valoriSparql(NON_BRANI)} }
  { ?q wdt:P31/wdt:P279* ?radice } UNION { ?q wdt:P136 wd:Q1344 } UNION { ?q wdt:P7937 wd:Q1344 }
  UNION { ?q wdt:P361 ?opera . VALUES ?scena { wd:Q1344 wd:Q58483083 } ?opera wdt:P31/wdt:P279* ?scena . }
  UNION { ?q wdt:P9899 ?per . VALUES ?palco { wd:Q1344 wd:Q58483083 } ?per wdt:P31/wdt:P279* ?palco . }
  UNION { VALUES ?forma { wd:Q178122 wd:Q7366 } ?q wdt:P7937 ?forma . }
}`,
  )
  const nonBrani = new Set([...righeNon.map((r) => r.q), ...BRANI_SBAGLIATI])
  const generi = async (nome: string, radici: readonly string[]) =>
    new Set(
      (
        await aPezzi(
          nome,
          ids,
          `SELECT DISTINCT ?q WHERE {
  VALUES ?q { #VOCI# }
  VALUES ?radice { ${valoriSparql(radici)} }
  ?q wdt:P136/wdt:P279* ?radice .
}`,
        )
      ).map((r) => r.q!),
    )
  const classici = await generi('classica-generi-classici', GENERI_CLASSICI)
  const popolari = await generi('classica-generi-popolari', GENERI_POPOLARI)
  const righeSoprannomi = await aPezzi(
    'classica-soprannomi',
    ids,
    `SELECT ?q ?nome WHERE {
  VALUES ?q { #VOCI# }
  ?q wdt:P1449 ?nome . FILTER(LANG(?nome) = "it")
}`,
  )
  const soprannome = new Map<string, string>()
  for (const r of righeSoprannomi) if (r.q && r.nome && !soprannome.has(r.q)) soprannome.set(r.q, r.nome.trim())
  /** Il titolo che dice il brano: quello di Wikidata, con il soprannome se il titolo e' un numero. */
  const titolo = (id: string): string | undefined => {
    const t = titoloItaliano(s.get(id))
    if (!t) return undefined
    if (!NUMERATO.test(t)) return SOLO_UNA_FORMA.has(titoloNormale(t)) ? undefined : t
    const detto = soprannome.get(id)
    return detto && !NUMERATO.test(detto) ? `${t} «${detto.replace(/^["“«]+|["”»]+$/g, '')}»` : undefined
  }
  const conTitolo = ids.filter((id) => !nonBrani.has(id) && titolo(id))
  const certi = await valoriCerti('classica-compositori', conTitolo, 'P86')
  const date = await anni('classica-anni', conTitolo, ['P571', 'P577', 'P1191'])
  const idCompositori = [...new Set(conTitolo.flatMap((id) => certi.get(id) ?? []))]
  const compositori = await persone('classica-persone', idCompositori)
  const righeClassici = await aPezzi(
    'classica-compositori-classici',
    idCompositori,
    `SELECT DISTINCT ?q WHERE {
  VALUES ?q { #VOCI# }
  { ?q wdt:P136/wdt:P279* wd:Q9730 } UNION { ?q wdt:P136/wdt:P279* wd:Q1344 }
  UNION { ?q wdt:P106 wd:${COMPOSITORE_CLASSICO} }
}`,
  )
  const compositoriClassici = new Set(righeClassici.map((r) => r.q))
  const righeCanzoni = await aPezzi(
    'classica-compositori-di-canzoni',
    idCompositori,
    `SELECT DISTINCT ?q WHERE {
  VALUES ?q { #VOCI# }
  VALUES ?mestiere { ${valoriSparql(SCRIVEVA_CANZONI)} }
  ?q wdt:P106 ?mestiere .
}`,
  )
  const scrivevaCanzoni = new Set(righeCanzoni.map((r) => r.q))
  const umani = (id: string) => (certi.get(id) ?? []).filter((c) => compositori.get(c)?.umano)
  /** Musica classica: per il genere, per chi l'ha scritta, o perché non e' una canzone. */
  const classico = (id: string) =>
    classici.has(id) ||
    umani(id).some((c) => compositoriClassici.has(c)) ||
    (!popolari.has(id) && umani(id).every((c) => !scrivevaCanzoni.has(c)))
  // Un compositore, o due: tre nomi su un brano sono un'orchestrazione, o una raccolta.
  const buoni = conTitolo.filter((id) => umani(id).length >= 1 && umani(id).length <= 2 && classico(id))
  const lette = await letture(buoni.map((id) => s.get(id)?.voce).filter((t): t is string => !!t))
  const peso = (id: string) => notorietaItaliana(voci.get(id) ?? 0, lette.get(s.get(id)?.voce ?? '') ?? 0)
  const unici = titoliUnici(
    buoni,
    (id) => titolo(id)!,
    (id) => voci.get(id) ?? 0,
    (id) => umani(id).join(' '),
  )
  const scelti = unici.sort((a, b) => peso(b) - peso(a) || a.localeCompare(b)).slice(0, BRANI)
  console.log(
    `  ${candidati.length} candidati, ${conTitolo.length} con un titolo che dice un brano, ` +
      `${buoni.length} con il compositore, ${unici.length} con un titolo solo, ${scelti.length} tenuti`,
  )
  const ordine = await ordineDichiarazioni(
    scelti.filter((id) => umani(id).length > 1),
    ['P86'],
  )
  const fama = perNotorieta(
    scelti.map((id) => ({ id })),
    (x) => peso(x.id),
  )
  const brani: BranoQuiz[] = scelti.map((id) => {
    const c = inOrdine(umani(id), ordine.get(id)?.get('P86'), (x) => compositori.get(x)?.voci ?? 0)
    // L'anno: la composizione, se no la pubblicazione o la prima esecuzione; e dentro la vita di chi l'ha scritto.
    const d = date.get(id)
    const anno =
      annoSicuro(d?.get('P571'), { scarto: 3 }) ??
      annoSicuro(d?.get('P577'), { scarto: 3 }) ??
      annoSicuro(d?.get('P1191'), { scarto: 3 })
    const vita = compositori.get(c[0])
    const plausibile =
      anno !== undefined &&
      (vita?.na === undefined || anno >= vita.na + 5) &&
      (vita?.mo === undefined || anno <= vita.mo + 1)
    const sc = s.get(id)!
    return {
      id,
      n: titolo(id)!,
      c,
      ...(plausibile ? { anno } : {}),
      ...(sc.voce ? { w: sc.voce } : {}),
      f: fama.get(id) ?? 0,
    }
  })
  const usati = [...new Set(brani.flatMap((b) => b.c))].map((c) => compositori.get(c)!).filter(Boolean)
  return { brani: perFama(brani), compositori: await elencoPersone(usati) }
}

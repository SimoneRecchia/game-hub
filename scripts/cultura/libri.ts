/**
 * I libri: le opere letterarie piu' note, con chi le ha scritte, l'anno, la
 * lingua e il genere.
 *
 * Un libro entra se ha almeno un autore che e' una persona: la Bibbia no, il
 * Vangelo secondo Luca si', come il Manifesto del Partito Comunista e l'Origine
 * delle specie. Le classi sono quelle dei libri — opera letteraria, opera
 * scritta, opera drammatica, romanzo, poema, trattato... — e non le serie
 * (Harry Potter e' sette libri, non uno), i fumetti a puntate, i film tratti da
 * un libro, le edizioni e le traduzioni; e nemmeno gli atti ufficiali e le opere
 * collettive, che un autore da chiedere non ce l'hanno.
 *
 * Come per i quadri, un titolo deve dire un libro solo: fra due "Metamorfosi"
 * resta la piu' nota se lo e' molto piu' dell'altra, altrimenti nessuna.
 */

import type { DatiLibri, LibroQuiz } from '../../shared/quiz-cultura'
import { lingueDi } from './lingue'
import { elencoPersone, PERSONE, persone } from './persone'
import { interroga, ordineDichiarazioni } from './rete'
import {
  anni,
  annoSicuro,
  inOrdine,
  numero,
  perFama,
  perNotorieta,
  primi,
  schede,
  titoliUnici,
  titoloItaliano,
  valori,
  valoriCerti,
  valoriSparql,
} from './wikidata'

const LIBRI = 1000
const CANDIDATI = 3000
/** I candidati italiani, cercati a parte: vedi `Q_ITALIANI`. */
const CANDIDATI_ITALIANI = 1000

/**
 * Un libro italiano pesa due volte e mezzo, non 1,4 come nelle altre materie.
 * I classici della scuola hanno poche Wikipedia — "Il fu Mattia Pascal" 12, "I
 * Malavoglia" 13, "La coscienza di Zeno" 17 — e con la spinta delle altre
 * materie restavano fuori tutti: i libri italiani erano 40 su mille.
 */
const SPINTA_LIBRI_ITALIANI = 2.5

/** Le classi dei libri (le etichette italiane di Wikidata). */
const CLASSI = [
  'Q7725634', // opera letteraria
  'Q47461344', // opera scritta
  'Q116476516', // opera drammatica
  'Q571', // libro
  'Q8261', // romanzo
  'Q25379', // opera teatrale
  'Q37484', // poema epico
  'Q474090', // poesia narrativa
  'Q5185279', // poesia
  'Q49084', // racconto
  'Q149537', // novella
  'Q699', // fiaba
  'Q24723', // fiaba letteraria
  'Q1347298', // romanzo d'appendice
  'Q20225034', // romanzo incompiuto
  'Q2910675', // opera incompiuta
  'Q17518461', // opera postuma
  'Q3026037', // dialogo platonico
  'Q12765855', // opera filosofica
  'Q384515', // trattato
  'Q193495', // monografia
  'Q20540385', // libro di saggistica
  'Q1517777', // opera storica
  'Q10916116', // libro storico
  'Q11826511', // opera scientifica
  'Q35760', // saggio
  'Q46337', // manifesto
  'Q179461', // testo sacro
  'Q29154430', // libro della Bibbia
  'Q215495', // epistola
  'Q725377', // romanzo grafico
  'Q7099402', // poesia orale
]

/**
 * Le forme, con il nome da scrivere, nell'ordine in cui si scelgono quando un
 * libro ne ha piu' d'una (dalla forma, dal genere o dalla classe). Solo forme,
 * e larghe: "romanzo di formazione" e "romanzo", o "giallo" e "poliziesco",
 * sarebbero due risposte giuste alla stessa domanda. Le etichette sono quelle
 * di Wikidata.
 */
const GENERI: Array<[string, string]> = [
  ['Q37484', 'poema epico'],
  ['Q80930', 'tragedia'],
  ['Q34620', 'tragedia'], // tragedia greca
  ['Q192881', 'tragicommedia'],
  ['Q40831', 'commedia'],
  ['Q5151421', 'commedia'],
  ['Q1152184', 'commedia'], // commedie shakespeariane
  ['Q25379', 'opera teatrale'],
  ['Q116476516', 'opera teatrale'], // opera drammatica
  ['Q21010853', 'opera teatrale'], // dramma
  ['Q25372', 'opera teatrale'], // dramma
  ['Q5774663', 'opera teatrale'], // dramma storico
  ['Q1279564', 'raccolta di racconti'],
  ['Q12106333', 'raccolta di poesie'],
  ['Q27560760', 'raccolta di fiabe'],
  ['Q8261', 'romanzo'],
  ['Q1347298', 'romanzo'], // d'appendice
  ['Q20225034', 'romanzo'], // incompiuto
  ['Q223945', 'romanzo'], // di formazione
  ['Q1312571', 'romanzo'], // developmental novel
  ['Q2016518', 'romanzo'], // filosofico
  ['Q44563', 'romanzo'], // picaresco
  ['Q465821', 'romanzo'], // epistolare
  ['Q1248788', 'romanzo'], // realistico
  ['Q512207', 'romanzo'], // a chiave
  ['Q149537', 'novella'],
  ['Q49084', 'racconto'],
  ['Q699', 'fiaba'],
  ['Q24723', 'fiaba'], // fiaba letteraria
  ['Q693', 'favola'],
  ['Q5185279', 'poema'],
  ['Q474090', 'poema'], // poesia narrativa
  ['Q3026037', 'dialogo filosofico'], // dialogo platonico
  ['Q3026054', 'dialogo filosofico'], // dialogo socratico
  ['Q3025978', 'dialogo filosofico'], // dialogo
  ['Q384515', 'trattato'],
  ['Q35760', 'saggio'],
  ['Q27801', 'saggio'], // saggistica
  ['Q4184', 'autobiografia'],
  ['Q46337', 'manifesto'],
  ['Q29154430', 'testo sacro'], // libro della Bibbia
  ['Q34274', 'testo sacro'], // vangelo
  ['Q179461', 'testo sacro'],
  ['Q215495', 'epistola'],
]


const Q_CANDIDATI = `SELECT DISTINCT ?q ?voci WHERE {
  VALUES ?classe { ${valoriSparql(CLASSI)} }
  VALUES ?persona { ${valoriSparql(PERSONE)} }
  ?q wdt:P31 ?classe ; wdt:P50 ?autore .
  ?autore wdt:P31 ?persona .
  ?q wikibase:sitelinks ?voci .
}
ORDER BY DESC(?voci)
LIMIT ${CANDIDATI}`

/**
 * I libri italiani: di un autore italiano (anche del Regno), o in italiano.
 * Fra i primi tremila del mondo per numero di Wikipedia non ci arrivano. Due
 * query semplici e non una con l'unione: con l'unione QLever non rispondeva in
 * quattro minuti, cosi' ognuna risponde in pochi secondi. Che l'autore sia una
 * persona lo guarda poi `persone`, come per gli altri.
 */
const Q_ITALIANI_AUTORE = `SELECT DISTINCT ?q ?voci WHERE {
  VALUES ?classe { ${valoriSparql(CLASSI)} }
  VALUES ?paese { wd:Q38 wd:Q172579 }
  ?q wdt:P31 ?classe ; wdt:P50 ?autore .
  ?autore wdt:P27 ?paese .
  ?q wikibase:sitelinks ?voci .
}
ORDER BY DESC(?voci)
LIMIT ${CANDIDATI_ITALIANI}`

const Q_ITALIANI_LINGUA = `SELECT DISTINCT ?q ?voci WHERE {
  VALUES ?classe { ${valoriSparql(CLASSI)} }
  ?q wdt:P31 ?classe ; wdt:P407 wd:Q652 ; wdt:P50 ?autore .
  ?q wikibase:sitelinks ?voci .
}
ORDER BY DESC(?voci)
LIMIT ${CANDIDATI_ITALIANI}`

/**
 * Le classi che non sono un libro solo, anche quando una voce e' anche "opera
 * letteraria": le serie, le altre opere, gli atti ufficiali (la Legge
 * fondamentale tedesca ha tre autori, ma non e' un libro), e le voci che
 * mescolano un libro con altro — l'Ordine degli Assassini ha anche il romanzo
 * gallese che porta il suo nome, e "Alessandro I" e' una disambigua.
 */
const NON_LIBRI = [
  'Q7725310', // serie di opere
  'Q1667921', // serie di romanzi
  'Q277759', // serie di libri
  'Q13593966', // trilogia letteraria
  'Q17710986', // pentalogia letteraria
  'Q867335', // ciclo letterario
  'Q17518870', // gruppo di opere letterarie
  'Q21198342', // serie manga
  'Q104213567', // serie di light novel
  'Q14406742', // serie a fumetti
  'Q196600', // media franchise
  'Q11424', // film
  'Q5398426', // serie televisiva
  'Q7889', // videogioco
  'Q3331189', // versione, edizione o traduzione
  'Q105543609', // opera musicale
  'Q58483083', // opera drammatico-musicale
  'Q602446', // lirica musicale: gli inni, come il Te Deum
  'Q5051330', // catalogo di composizioni di musica classica
  'Q6941730', // catalogo musicale
  'Q7755', // costituzione
  'Q820655', // legge
  'Q131569', // trattato internazionale
  'Q189867', // bolla pontificia
  'Q221409', // enciclica
  'Q1284645', // editto
  'Q2571972', // decreto
  'Q1630279', // linea guida
  'Q321839', // accordo delle parti
  'Q13418847', // evento storico
  'Q276548', // società segreta
  'Q4167410', // pagina di disambiguazione
  'Q22808320', // pagina di disambiguazione per nomi di persona
]

/**
 * Il Signore degli Anelli per Wikidata e' una trilogia e una serie di romanzi,
 * ma e' un romanzo solo in tre volumi, e la domanda che si fa e' su di lui.
 */
const UN_LIBRO = new Set(['Q15228'])

/**
 * Con piu' di tre autori e' un'opera collettiva: "chi ha scritto
 * l'Encyclopédie?" avrebbe diciassette risposte.
 */
const AUTORI_MASSIMI = 3

/**
 * Le enciclopedie e i dizionari moderni sono di una redazione, non di un autore:
 * la Britannica non l'ha scritta Andrew Bell. Quelli antichi e medievali sì, come
 * la Naturalis historia di Plinio.
 */
const CONSULTAZIONE = ['Q5292', 'Q23622'] // enciclopedia, dizionario
const CONSULTAZIONE_D_AUTORE_FINO_AL = 1500

export async function libri(): Promise<Omit<DatiLibri, 'versione'>> {
  console.log('Libri')
  const candidati = [
    ...(await interroga('libri-candidati', Q_CANDIDATI)),
    ...(await interroga('libri-candidati-autori-italiani', Q_ITALIANI_AUTORE)),
    ...(await interroga('libri-candidati-in-italiano', Q_ITALIANI_LINGUA)),
  ]
  const voci = new Map(candidati.map((r) => [r.q!, numero(r.voci)]))
  const ids = [...voci.keys()]
  const s = await schede('libri-schede', ids)
  const conNome = ids.filter((id) => titoloItaliano(s.get(id)))
  const v = await valori('libri-valori', conNome, ['P31', 'P136', 'P7937', 'P407'])
  const date = await anni('libri-anni', conNome, ['P577', 'P571'])
  const certi = await valoriCerti('libri-scrittori', conNome, 'P50')
  // La prima edizione: fra le date di pubblicazione la piu' vecchia, anche se ce ne sono di molto lontane.
  const annoDi = (id: string) =>
    annoSicuro(date.get(id)?.get('P577'), { scarto: Infinity }) ??
    annoSicuro(date.get(id)?.get('P571'), { scarto: Infinity })
  const diRedazione = (id: string) =>
    [...primi(v, id, 'P136'), ...primi(v, id, 'P7937')].some((g) => CONSULTAZIONE.includes(g)) &&
    !((annoDi(id) ?? Infinity) < CONSULTAZIONE_D_AUTORE_FINO_AL)
  const unLibro = conNome.filter(
    (id) => UN_LIBRO.has(id) || (!primi(v, id, 'P31').some((c) => NON_LIBRI.includes(c)) && !diRedazione(id)),
  )

  const autori = await persone('libri-autori', [...new Set(unLibro.flatMap((id) => certi.get(id) ?? []))])
  const umani = (id: string) => (certi.get(id) ?? []).filter((a) => autori.get(a)?.umano)
  const conAutore = unLibro.filter((id) => umani(id).length > 0 && umani(id).length <= AUTORI_MASSIMI)
  const nomiLingue = await schede('libri-lingue', [...new Set(conAutore.flatMap((id) => primi(v, id, 'P407')))])
  const lingue = (id: string) => lingueDi(primi(v, id, 'P407'), nomiLingue)
  // Italiano se lo e' un autore, o se l'italiano e' la sola lingua: una traduzione non fa italiano un libro.
  const italiano = (id: string) =>
    umani(id).some((a) => autori.get(a)?.it) || (lingue(id).length === 1 && lingue(id)[0] === 'italiano')
  const peso = (id: string) => (voci.get(id) ?? 0) * (italiano(id) ? SPINTA_LIBRI_ITALIANI : 1)
  const unici = titoliUnici(
    conAutore,
    (id) => titoloItaliano(s.get(id))!,
    (id) => voci.get(id) ?? 0,
    (id) => umani(id).join(' '),
  )
  const scelti = unici.sort((a, b) => peso(b) - peso(a) || a.localeCompare(b)).slice(0, LIBRI)
  console.log(
    `  ${ids.length} candidati, ${conNome.length} con il titolo in italiano, ${conAutore.length} libri con l'autore, ` +
      `${unici.length} con un titolo solo, ${scelti.length} tenuti`,
  )

  // L'ordine degli autori, dove sono piu' d'uno.
  const ordine = await ordineDichiarazioni(scelti.filter((id) => umani(id).length > 1), ['P50'])

  const fama = perNotorieta(
    scelti.map((id) => ({ id })),
    (x) => peso(x.id),
  )
  const elenco: LibroQuiz[] = scelti.map((id) => {
    const a = inOrdine(umani(id), ordine.get(id)?.get('P50'), (x) => autori.get(x)?.voci ?? 0)
    const anno = annoDi(id)
    const lingueLibro = lingue(id)
    const g = genereDi([...primi(v, id, 'P7937'), ...primi(v, id, 'P136'), ...primi(v, id, 'P31')])
    const sc = s.get(id)!
    return {
      id,
      n: titoloItaliano(sc)!,
      a,
      ...(anno !== undefined ? { anno } : {}),
      // Una lingua sola: con due ("latino" e "greco antico") la domanda avrebbe due risposte.
      ...(lingueLibro.length === 1 ? { lingua: lingueLibro[0] } : {}),
      ...(g ? { g } : {}),
      ...(italiano(id) ? { it: 1 as const } : {}),
      ...(sc.voce ? { w: sc.voce } : {}),
      f: fama.get(id) ?? 0,
    }
  })
  const usati = [...new Set(elenco.flatMap((l) => l.a))].map((a) => autori.get(a)!).filter(Boolean)
  return { libri: perFama(elenco), autori: elencoPersone(usati) }
}

function genereDi(valori: readonly string[]): string | undefined {
  return GENERI.find(([q]) => valori.includes(q))?.[1]
}

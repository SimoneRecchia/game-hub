/**
 * Il cinema: i film piu' noti, con chi li ha diretti, l'anno, il paese, il
 * genere, i piu' noti fra gli interpreti principali e l'Oscar al miglior film.
 *
 * I film sono quelli di Wikidata con un regista che e' una persona, anche
 * d'animazione (il Re Leone e' un "lungometraggio d'animazione", non un
 * "film").
 *
 * Il paese di un film di piu' paesi non e' il primo dell'elenco di Wikidata,
 * che spesso e' in ordine alfabetico — La dolce vita e' "Francia, Italia" — e
 * nemmeno l'Italia ogni volta che c'e': Il padrino, Casino Royale e Dune hanno
 * l'Italia fra i paesi di produzione. E' il paese della lingua originale (per
 * l'inglese, il primo dei paesi di lingua inglese), o quello dei registi. Un
 * film e' italiano se l'Italia e' fra i paesi e il film e' in italiano o ha un
 * regista italiano: Blow-Up di Antonioni si', il Padrino no. Uno stato che non
 * c'e' piu' diventa quello di oggi (la Germania Ovest e' la Germania), e un
 * film sovietico resta senza paese: "Russia" sarebbe sbagliato per metà.
 *
 * Come per i libri, un titolo deve dire un film solo: fra i due "King Kong"
 * resta il piu' noto se lo e' molto piu' dell'altro, altrimenti nessuno.
 */

import type { DatiCinema, FilmQuiz } from '../../shared/quiz-cultura'
import { CITTADINANZE_ITALIANE, elencoPersone, ITALIA, moderno, nomePaese, persone, statiDi } from './persone'
import { interroga, letture, ordineDichiarazioni } from './rete'
import {
  anni,
  annoSicuro,
  aPezzi,
  confrontaId,
  inOrdine,
  lettureDiSempre,
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
  valoriSparql,
} from './wikidata'

const FILM = 1200
const CANDIDATI = 3200
/** I candidati italiani, cercati a parte come per i libri: fra i primi del mondo non ci arrivano. */
const CANDIDATI_ITALIANI = 800

/**
 * I film d'animazione pesano meno della meta': li doppiano in tutte le lingue,
 * e le Wikipedia ne fanno una voce in ognuna. Erano 36 dei primi cento, e chi
 * ha diretto "Biancaneve e i sette nani" non lo sa nessuno.
 */
const PESO_ANIMAZIONE = 0.4

/** Anche per genere, oltre alle classi di `ANIMAZIONE`: i lungometraggi animati, e gli anime. */
const GENERI_ANIMATI = new Set(['Q202866', 'Q29168811', 'Q17013749', 'Q28968511', 'Q1107'])
/** Gli interpreti fra cui si scelgono i tre del cast: i primi dei titoli di testa. */
const PRINCIPALI = 6

const CLASSI = [
  'Q11424', // film
  'Q29168811', // lungometraggio d'animazione
  'Q202866', // film d'animazione
  'Q24869', // lungometraggio
]

/** L'Oscar al miglior film. */
const OSCAR = 'Q102427'

/** Le classi dei film d'animazione: il genere e' "animazione", qualunque altro abbiano. */
const ANIMAZIONE = new Set(['Q29168811', 'Q202866'])

/**
 * I generi, a gruppi larghi e dal piu' riconoscibile al piu' generico: il primo
 * che il film ha e' quello che si scrive. Il Padrino e' un film di gangster
 * prima che un drammatico, Guerre stellari fantascienza prima che avventura.
 * Noir, gangster e thriller polizieschi sono un genere solo: da risposte
 * diverse, sarebbero giuste insieme. Un genere che non sta qui non si scrive.
 */
const GENERI: Array<[string, string]> = [
  ['Q1535153', 'supereroi'],
  ['Q172980', 'western'],
  ['Q1433443', 'peplum'],
  ['Q200092', 'horror'], // film dell'orrore
  ['Q853630', 'horror'], // slasher
  ['Q3072049', 'horror'], // zombie
  ['Q2137852', 'horror'], // vampiri
  ['Q909586', 'horror'], // splatter
  ['Q471839', 'fantascienza'],
  ['Q20656232', 'fantascienza'], // d'azione
  ['Q174526', 'fantascienza'], // cyberpunk
  ['Q1341051', 'fantascienza'], // post apocalittico
  ['Q20443008', 'fantascienza'], // distopico
  ['Q157394', 'fantasy'],
  ['Q842256', 'musical'], // film musicale
  ['Q369747', 'guerra'],
  ['Q2297927', 'spionaggio'],
  ['Q7444356', 'poliziesco'], // gangster
  ['Q185867', 'poliziesco'], // noir
  ['Q2421031', 'poliziesco'], // neo-noir
  ['Q19367312', 'poliziesco'], // thriller poliziesco
  ['Q959790', 'poliziesco'], // film giallo, cioe' crime
  ['Q496523', 'poliziesco'], // caper movie
  ['Q645928', 'biografico'],
  ['Q17013749', 'storico'],
  ['Q542475', 'storico'], // in costume
  ['Q2484376', 'thriller'],
  ['Q3990883', 'thriller'], // d'azione
  ['Q1200678', 'thriller'], // del mistero
  ['Q188473', 'azione'],
  ['Q319221', 'avventura'],
  ['Q860626', 'commedia'], // romantica
  ['Q157443', 'commedia'],
  ['Q5778924', 'commedia'], // nera
  ['Q859369', 'commedia'], // commedia drammatica
  ['Q1054574', 'sentimentale'],
  ['Q130232', 'drammatico'],
  ['Q1919632', 'drammatico'], // melodramma
  ['Q63214877', 'drammatico'], // dramma psicologico
]

/**
 * I paesi di ogni lingua originale: per scegliere, fra i paesi di produzione,
 * quello del film. Il Padrino e' in inglese e fra i suoi paesi ci sono gli
 * Stati Uniti e l'Italia: e' statunitense.
 */
const PAESI_DELLE_LINGUE: Record<string, string[]> = {
  Q652: ['Q38'], // italiano
  Q1860: ['Q30', 'Q145', 'Q16', 'Q408', 'Q27', 'Q664'], // inglese: Stati Uniti, Regno Unito, Canada, Australia...
  Q150: ['Q142', 'Q31', 'Q39', 'Q16'], // francese
  Q188: ['Q183', 'Q40', 'Q39'], // tedesco
  Q1321: ['Q29', 'Q96', 'Q414', 'Q739', 'Q298', 'Q419', 'Q241'], // spagnolo
  Q5146: ['Q45', 'Q155'], // portoghese
  Q5287: ['Q17'], // giapponese
  Q9176: ['Q884'], // coreano
  Q7850: ['Q148', 'Q8646', 'Q865'], // cinese
  Q9192: ['Q148', 'Q865'], // mandarino
  Q9186: ['Q8646'], // cantonese
  Q7737: ['Q159'], // russo
  Q9027: ['Q34'], // svedese
  Q9035: ['Q35'], // danese
  Q9043: ['Q20'], // norvegese
  Q1412: ['Q33'], // finlandese
  Q7411: ['Q29999'], // olandese
  Q809: ['Q36'], // polacco
  Q9056: ['Q213'], // ceco
  Q9067: ['Q28'], // ungherese
  Q256: ['Q43'], // turco
  Q1568: ['Q668'], // hindi
  Q9168: ['Q794'], // persiano
}

const Q_CANDIDATI = `SELECT DISTINCT ?q ?voci WHERE {
  VALUES ?classe { ${valoriSparql(CLASSI)} }
  ?q wdt:P31 ?classe ; wdt:P57 ?regista .
  ?regista wdt:P31 wd:Q5 .
  ?q wikibase:sitelinks ?voci .
}
ORDER BY DESC(?voci)
LIMIT ${CANDIDATI}`

const Q_ITALIANI = `SELECT DISTINCT ?q ?voci WHERE {
  VALUES ?classe { ${valoriSparql(CLASSI)} }
  ?q wdt:P31 ?classe ; wdt:P57 ?regista ; wdt:P495 wd:Q38 .
  ?regista wdt:P31 wd:Q5 .
  ?q wikibase:sitelinks ?voci .
}
ORDER BY DESC(?voci)
LIMIT ${CANDIDATI_ITALIANI}`

export async function cinema(): Promise<Omit<DatiCinema, 'versione'>> {
  console.log('Cinema')
  const candidati = [
    ...(await interroga('cinema-candidati', Q_CANDIDATI)),
    ...(await interroga('cinema-candidati-italiani', Q_ITALIANI)),
  ]
  const voci = new Map(candidati.map((r) => [r.q!, numero(r.voci)]))
  const ids = [...voci.keys()]
  const s = await schede('cinema-schede', ids)
  const conNome = ids.filter((id) => titoloItaliano(s.get(id)))
  const v = await valori('cinema-valori', conNome, ['P31', 'P136', 'P495', 'P364', 'P166'])
  const date = await anni('cinema-anni', conNome, ['P577'])
  const certi = await valoriCerti('cinema-diretti', conNome, 'P57')

  const registi = await persone('cinema-registi', [...new Set(conNome.flatMap((id) => certi.get(id) ?? []))])
  const umani = (id: string) => (certi.get(id) ?? []).filter((r) => registi.get(r)?.umano)
  const conRegista = conNome.filter((id) => umani(id).length > 0)
  // In italiano vuol dire solo in italiano: Il padrino e' "inglese, italiano" per le scene in Sicilia.
  const soloInItaliano = (id: string) => primi(v, id, 'P364').length === 1 && primi(v, id, 'P364')[0] === 'Q652'
  const italiano = (id: string) => {
    const paesiFilm = primi(v, id, 'P495')
    return (
      paesiFilm.some((p) => CITTADINANZE_ITALIANE.has(p)) &&
      (paesiFilm.length === 1 || soloInItaliano(id) || umani(id).some((r) => registi.get(r)?.it))
    )
  }
  const animato = (id: string) =>
    primi(v, id, 'P31').some((c) => ANIMAZIONE.has(c)) || primi(v, id, 'P136').some((g) => GENERI_ANIMATI.has(g))
  const lette = await letture(conRegista.map((id) => s.get(id)?.voce).filter((t): t is string => !!t))
  // L'uscita: la prima, anche se il film e' tornato in sala decenni dopo.
  const annoDi = (id: string) => annoSicuro(date.get(id)?.get('P577'), { scarto: Infinity })
  const peso = (id: string) =>
    notorietaItaliana(voci.get(id) ?? 0, lettureDiSempre(lette.get(s.get(id)?.voce ?? '') ?? 0, annoDi(id))) *
    (animato(id) ? PESO_ANIMAZIONE : 1)
  const unici = titoliUnici(
    conRegista,
    (id) => titoloItaliano(s.get(id))!,
    (id) => voci.get(id) ?? 0,
    (id) => umani(id).join(' '),
  )
  const scelti = unici.sort((a, b) => peso(b) - peso(a) || a.localeCompare(b)).slice(0, FILM)
  console.log(
    `  ${ids.length} candidati, ${conNome.length} con il titolo in italiano, ${conRegista.length} con il regista, ` +
      `${unici.length} con un titolo solo, ${scelti.length} tenuti`,
  )

  // L'ordine dei registi e dei paesi, dove sono piu' d'uno.
  const ordine = await ordineDichiarazioni(
    scelti.filter((id) => umani(id).length > 1 || primi(v, id, 'P495').length > 1),
    ['P57', 'P495'],
  )
  const stati = await statiDi('cinema-stati', [...new Set(scelti.flatMap((id) => primi(v, id, 'P495')))])
  /** I paesi di produzione di oggi, senza doppioni, nell'ordine di Wikidata. */
  const paesi = (id: string) => [
    ...new Set(
      inOrdine(primi(v, id, 'P495'), ordine.get(id)?.get('P495'), () => 0)
        .map((p) => (CITTADINANZE_ITALIANE.has(p) ? ITALIA : moderno(p, [], stati)))
        .filter((p): p is string => !!p),
    ),
  ]
  const paeseDi = (id: string): string | undefined => {
    const suoi = paesi(id)
    if (italiano(id)) return 'Italia'
    // Qui l'Italia, se c'e', e' solo coproduttrice: non e' il paese del film.
    const altri = suoi.filter((p) => p !== ITALIA)
    if (altri.length === 1) return nomePaese(altri[0], stati)
    const dellaLingua = altri.filter((p) => primi(v, id, 'P364').some((l) => PAESI_DELLE_LINGUE[l]?.includes(p)))
    if (dellaLingua.length > 0) return nomePaese(dellaLingua[0], stati)
    const deiRegisti = [...new Set(umani(id).map((r) => registi.get(r)?.p))]
    const nomi = altri.map((p) => nomePaese(p, stati))
    return deiRegisti.length === 1 && deiRegisti[0] && nomi.includes(deiRegisti[0]) ? deiRegisti[0] : undefined
  }

  /*
   * Gli interpreti: fra i primi sei nell'ordine di Wikidata, che di solito e'
   * quello dei titoli di testa, il primo e i due con piu' Wikipedia, nell'ordine
   * dei titoli. Scelti solo per notorietà sarebbero sbagliati: in Forrest Gump ci
   * sono John Lennon e Gerald Ford, nei filmati d'archivio; e senza il primo il
   * Cavaliere oscuro resterebbe senza Christian Bale, che ha meno Wikipedia di
   * Heath Ledger, Michael Caine e Gary Oldman.
   */
  const righeCast = await aPezzi(
    'cinema-cast',
    scelti,
    `SELECT ?q ?attore ?voci WHERE {
  VALUES ?q { #VOCI# }
  ?q wdt:P161 ?attore .
  ?attore wikibase:sitelinks ?voci .
}`,
  )
  const vociAttori = new Map<string, number>()
  const perFilm = new Map<string, string[]>()
  for (const r of righeCast) {
    if (!r.q || !r.attore) continue
    vociAttori.set(r.attore, numero(r.voci))
    perFilm.set(r.q, [...(perFilm.get(r.q) ?? []), r.attore])
  }
  const ordineCast = await ordineDichiarazioni(scelti, ['P161'])
  const vociDi = (a: string) => vociAttori.get(a) ?? 0
  const principali = (id: string) =>
    inOrdine(perFilm.get(id) ?? [], ordineCast.get(id)?.get('P161'), vociDi).slice(0, PRINCIPALI)
  const nomiAttori = await schede('cinema-attori', [...new Set(scelti.flatMap(principali))])
  const nomeAttore = (a: string) => nomeItaliano(nomiAttori.get(a), { mul: true })
  const castDi = (id: string): string[] => {
    const conNome = principali(id).filter((a) => nomeAttore(a))
    const [primo, ...altri] = conNome
    const noti = new Set(altri.sort((a, b) => vociDi(b) - vociDi(a) || confrontaId(a, b)).slice(0, 2))
    return conNome.filter((a) => a === primo || noti.has(a)).map((a) => nomeAttore(a)!)
  }

  const fama = perNotorieta(
    scelti.map((id) => ({ id })),
    (x) => peso(x.id),
  )
  const elenco: FilmQuiz[] = scelti.map((id) => {
    const r = inOrdine(umani(id), ordine.get(id)?.get('P57'), (x) => registi.get(x)?.voci ?? 0)
    const anno = annoDi(id)
    const p = paeseDi(id)
    const g = primi(v, id, 'P31').some((c) => ANIMAZIONE.has(c))
      ? 'animazione'
      : GENERI.find(([q]) => primi(v, id, 'P136').includes(q))?.[1]
    const cast = castDi(id)
    const sc = s.get(id)!
    return {
      id,
      n: titoloItaliano(sc)!,
      r,
      ...(anno !== undefined ? { anno } : {}),
      ...(p ? { p } : {}),
      ...(italiano(id) ? { it: 1 as const } : {}),
      ...(g ? { g } : {}),
      ...(cast.length > 0 ? { cast } : {}),
      ...(primi(v, id, 'P166').includes(OSCAR) ? { oscar: 1 as const } : {}),
      ...(sc.voce ? { w: sc.voce } : {}),
      f: fama.get(id) ?? 0,
    }
  })
  const usati = [...new Set(elenco.flatMap((f) => f.r))].map((r) => registi.get(r)!).filter(Boolean)
  return { film: perFama(elenco), registi: await elencoPersone(usati) }
}

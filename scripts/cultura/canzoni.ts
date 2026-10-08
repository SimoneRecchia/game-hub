/**
 * Le canzoni: le piu' note a chi gioca in italiano, con chi le canta, l'anno
 * d'uscita e i generi.
 *
 * Una canzone e' una voce che Wikidata dice canzone, singolo o composizione
 * musicale, con un interprete, e con la voce di Wikipedia in italiano: senza,
 * non sarebbe una canzone che si conosce qui. Le piu' famose sono composizioni:
 * per Wikidata Bohemian Rhapsody e Imagine non sono "canzoni", e con le sole
 * canzoni e i singoli restavano fuori, con tutte le canzoni di prima dei
 * singoli. Le candidate sono tre elenchi: come per i film le piu' tradotte
 * del mondo, e quelle di interpreti italiani, che fra le prime del mondo non
 * ci arrivano — "Albachiara" ha quattro Wikipedia —; e le canzoni delle
 * classifiche di Wikipedia (scripts/cultura/classifiche.ts), che hanno avuto
 * successo anche senza una voce tradotta, come il rap italiano di adesso. Di
 * quelle chi canta e' quello della classifica, e l'anno la prima volta che ci
 * e' entrata, se Wikidata non ne dice uno di prima.
 *
 * Chi canta e' una persona o un gruppo, e al piu' due: "We Are the World" e'
 * degli USA for Africa, ma una canzone di tre interpreti e' una raccolta di
 * nomi, e chiedere chi la canta non avrebbe una risposta. Il paese di un
 * gruppo e' quello d'origine (P495), o quello di dove si e' formato.
 *
 * Fra gli interpreti di Wikidata ci sono anche le cover ("Like a Prayer" ha
 * Susan Boyle, "The Final Countdown" una banda di ottoni svedese) e chi canta
 * nel ritornello. La descrizione italiana dice chi la canta ("singolo di
 * Madonna del 1989"): quando ne nomina qualcuno, la risposta e' lui, e gli
 * altri non sono mai fra le risposte sbagliate (`x`). Quando ne nomina un
 * altro ("canzone dei Tears for Fears", per una voce che ha Lorde e Patti
 * Smith) la canzone resta fuori. Quando Wikidata ha solo la prima versione,
 * che non conosce nessuno ("Hound Dog" di Big Mama Thornton, "Twist and Shout"
 * dei Top Notes), o l'anno di quella, lo corregge a mano
 * scripts/data/canzoni-a-mano.tsv: chi la canta, l'anno, o fuori. Fuori anche
 * quel che non e' di nessuno: i canti tradizionali e natalizi, gli inni, le
 * filastrocche ("La cucaracha" non e' di Bill Haley), e quel che e' uscito
 * prima del 1950, quando le canzoni erano degli autori e le cantavano tutti — e
 * che sono anche i canti di guerra e del ventennio.
 *
 * L'anno e' quello della descrizione, o la prima uscita di Wikidata: una
 * ristampa e' sempre dopo. Le canzoni italiane hanno meno Wikipedia delle
 * straniere, e chi gioca le conosce meglio: pesano `PESO_ITALIANE` volte tanto,
 * nella scelta e nella difficolta'.
 *
 * I generi vengono da chi canta, e li dice a mano scripts/data/generi-artisti.tsv:
 * uno di solito, due quando un artista ha due anime, come lo metterebbe
 * un'app di musica. Una canzone ha i generi dei suoi interpreti, tranne quelle
 * di scripts/data/generi-canzoni.tsv, che ne hanno uno loro ("Beat It" e'
 * rock). Prima venivano da Wikidata, risalendo le sottoclassi fino ai generi
 * larghi, ed erano spesso sbagliati: una canzone senza genere prendeva tutti
 * quelli di chi la cantava, cinque per "Perfect" di Ed Sheeran; Lucio Dalla era
 * rock, e il tango, "musica da ballo", finiva nella dance con "4'33" di John
 * Cage. Wikidata resta per chi l'elenco non ha ancora — lo script lo dice —,
 * senza la musica da ballo e con un genere solo, il primo.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  GENERI_CANZONI,
  type ArtistaQuiz,
  type CanzoneQuiz,
  type DatiCanzoni,
  type GenereCanzone,
} from '../../shared/quiz-cultura'
import { canzoniDelleClassifiche, nomeNormale } from './classifiche'
import { moderno, nomePaese, persone, statiDi, type Persona } from './persone'
import { ANNO_LETTURE, interroga, letture, ordineDichiarazioni } from './rete'
import {
  anni,
  annoSicuro,
  type AnnoWikidata,
  aPezzi,
  inOrdine,
  lettureDiSempre,
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

/** Quante canzoni restano, dalla piu' nota: con le classifiche ce ne sono molte di piu' di prima. */
const CANZONI = Number(process.env.CANZONI ?? 6000)
/**
 * Quanto vale nella notorietà un anno al primo posto in Italia (`successo` 1,
 * scripts/cultura/classifiche.ts): quanto una canzone italiana con tre
 * Wikipedia che si legge una dozzina di migliaia di volte l'anno.
 */
const SUCCESSO = Number(process.env.SUCCESSO ?? 60_000)
const CANDIDATI = 5000
/** Le candidate di interpreti italiani, cercate a parte: fra le prime del mondo non ci arrivano. */
const CANDIDATI_ITALIANI = 4000

/** Le classi di una canzone: la canzone, il singolo, la composizione musicale. */
const CLASSI = ['Q7366', 'Q134556', 'Q105543609']

/** Un insieme musicale: il gruppo, il duo, la band, l'orchestra (le sue sottoclassi). */
const INSIEME_MUSICALE = 'Q2088357'

/** Il disc jockey, fra i mestieri di Wikidata: le sue canzoni le canta spesso qualcun altro. */
const DISC_JOCKEY = 'Q130857'

/**
 * Per chi l'elenco non ha: i generi larghi, con le radici di Wikidata da cui
 * discendono. La musica da ballo (Q316930) non c'e': ci stanno il tango e il
 * valzer. I cantautori non si riconoscono dai generi di Wikidata.
 */
const RADICI: Partial<Record<GenereCanzone, readonly string[]>> = {
  pop: ['Q37073'],
  // Il metal e il punk sono rock anche per Wikidata; il rock and roll e' il padre, e si conta.
  rock: ['Q11399', 'Q7749'],
  rap: ['Q11401', 'Q6010'],
  dance: ['Q9778', 'Q58339', 'Q20502'],
  soul: ['Q45981', 'Q131272', 'Q164444'],
  jazz: ['Q8341', 'Q203775'],
  latina: ['Q18345375', 'Q547137', 'Q202930'],
}

const DATI = join(dirname(fileURLToPath(import.meta.url)), '..', 'data')

/** Le righe di un elenco a mano di scripts/data: i campi separati da tabulazioni, senza i commenti ("#"). */
function righeAMano(file: string): string[][] {
  const righe = readFileSync(join(DATI, file), 'utf8').split('\n')
  const fuori = righe.filter((r) => r.trim() && !r.startsWith('#')).map((r) => r.split('\t'))
  const sbagliata = fuori.find(([id]) => !/^Q\d+$/.test(id))
  if (sbagliata) throw new Error(`${file}: riga senza QID, ${sbagliata.join(' ')}`)
  return fuori
}

/** Un elenco di generi a mano: il QID, il nome, e i generi separati da una virgola. */
function generiAMano(file: string): Map<string, GenereCanzone[]> {
  const fuori = new Map<string, GenereCanzone[]>()
  for (const [id, nome, generi] of righeAMano(file)) {
    const tutti = (generi ?? '').split(',')
    if (!tutti.every((g): g is GenereCanzone => GENERI_CANZONI.includes(g as GenereCanzone))) {
      throw new Error(`${file}: genere sbagliato per ${nome ?? id}`)
    }
    fuori.set(id, tutti)
  }
  return fuori
}

/**
 * Una correzione di scripts/data/canzoni-a-mano.tsv: la canzone resta fuori,
 * cambia chi la canta o l'anno, o chi la firma non la canta (`di-chi`).
 */
interface Correzione {
  fuori?: true
  a?: string[]
  anno?: number
  diChi?: true
}

function correzioniAMano(file: string): Map<string, Correzione> {
  const fuori = new Map<string, Correzione>()
  for (const [id, titolo, cosa] of righeAMano(file)) {
    const c: Correzione = {}
    for (const parte of (cosa ?? '').split(' ')) {
      if (parte === 'fuori') c.fuori = true
      else if (parte === 'di-chi') c.diChi = true
      else if (/^a=Q\d+(,Q\d+)*$/.test(parte)) c.a = parte.slice(2).split(',')
      else if (/^anno=\d{4}$/.test(parte)) c.anno = Number(parte.slice(5))
      else throw new Error(`${file}: correzione sbagliata per ${titolo ?? id}`)
    }
    fuori.set(id, c)
  }
  return fuori
}

const candidate = (limite: number, italiane: boolean) => `SELECT DISTINCT ?q ?voci WHERE {
  VALUES ?classe { ${valoriSparql(CLASSI)} }
  ?q wdt:P31 ?classe ; wdt:P175 ?chi .
  ${italiane ? '{ ?chi wdt:P27 wd:Q38 } UNION { ?chi wdt:P495 wd:Q38 }' : ''}
  ?articolo schema:about ?q ; schema:isPartOf <https://it.wikipedia.org/> .
  ?q wikibase:sitelinks ?voci .
}
ORDER BY DESC(?voci)
LIMIT ${limite}`

/**
 * Le canzoni che non fanno una domanda: un inno (l'Inno di Mameli lo canta
 * chiunque), le sigle di cartoni e programmi; e le arie, che sono composizioni
 * con un interprete anche loro: "Nessun dorma" l'hanno cantata tutti i tenori.
 * Un'aria e' parte di un'opera, o ha la lirica per genere; non basta che sia
 * parte di qualcosa che ha la lirica per genere: per Wikidata ce l'ha anche
 * l'album "A Night at the Opera", e "Bohemian Rhapsody" restava fuori.
 */
const NON_CANZONI = [
  'Q23691', // inno nazionale
  'Q484692', // inno
  'Q1407213', // sigla
]

/** Le canzoni dal 1950: prima erano degli autori, e le cantavano tutti. */
const ANNO_MINIMO = 1950

/** Quanto pesano le canzoni italiane, nella scelta e nella difficolta'. */
const PESO_ITALIANE = Number(process.env.PESO_ITALIANE ?? 2.5)

/** Al piu' quanti interpreti per Wikidata, quando la descrizione dice quali sono quelli veri. */
const INTERPRETI_DI_WIKIDATA = 6

/** Le descrizioni di quel che non e' di nessuno: i canti tradizionali, gli inni, quel che si canta in coro. */
const DI_NESSUNO = new RegExp(
  [
    'tradizional|popolare|natalizi|filastrocca|ninna nanna|\\binno\\b|\\bcanto\\b|\\bmarcia\\b',
    'coloniale|fascis|nazis|patriottic|militar|partigian|religios|liturgic|spiritual',
  ].join('|'),
  'i',
)

/**
 * Una descrizione che dice chi la canta: "singolo di Madonna", "canzone dei
 * Beatles", "brano musicale degli Europe del 1986". Non "canzone del 1956
 * composta da", ne' "canzone del film Frozen".
 */
const DICE_CHI = new RegExp(
  [
    '^(?:(?:il|un|una|lo)\\s+)?(?:singolo|canzone|brano|ballata|pezzo|traccia|successo)',
    '(?:\\s+(?:musicale|originale|pop|rock|dance|rap|soul))?',
    "\\s+(?:di|dei|degli|delle|del|della|dello|d['’])\\s*",
    '(?!\\d|festival|film|album|musical|cartone|programma|serie|colonna|gruppo|cantante|duo|anni)',
  ].join(''),
  'i',
)

/** Le parole di un nome che non lo dicono da sole: "Bill Haley & His Comets" si riconosce da "Haley". */
const PAROLE_COMUNI = new Set([
  'band',
  'orchestra',
  'group',
  'brothers',
  'sisters',
  'family',
  'singers',
  'quartet',
  'comets',
  'experience',
  'street',
  'project',
  'music',
  'girls',
  'boys',
])

/** Un testo da confrontare: minuscolo, senza accenti e segni, "&" come "and", con gli spazi ai capi. */
function perConfronto(t: string): string {
  const pulito = t
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[’'`´.]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
  return ` ${pulito} `
}

/** Se la descrizione nomina chi canta: il nome intero, senza "The", o una sua parola che lo dica da sola. */
function nominato(descrizione: string, nome: string): boolean {
  const d = perConfronto(descrizione)
  const n = perConfronto(nome).replace(/^ the /, ' ')
  if (d.includes(n)) return true
  return n
    .trim()
    .split(' ')
    .some((p) => p.length >= 5 && !PAROLE_COMUNI.has(p) && d.includes(` ${p} `))
}

/** L'anno detto dalla descrizione: "singolo di Madonna del 1989". */
function annoDescritto(descrizione: string | undefined): number | undefined {
  const m = descrizione?.match(/\bdel\s+(\d{4})\b/)
  const anno = m ? Number(m[1]) : undefined
  return anno !== undefined && anno >= 1900 && anno <= ANNO_LETTURE + 1 ? anno : undefined
}

/** Il primo anno preciso: le altre date sono le ristampe. */
function primoAnno(valori: readonly AnnoWikidata[] | undefined): number | undefined {
  const anni = (valori ?? []).filter((v) => v.precisione >= 9).map((v) => v.anno)
  return anni.length > 0 ? Math.min(...anni) : undefined
}

/**
 * Il titolo di una canzone: quello italiano, senza il lato B dei singoli di una
 * volta ("Il ragazzo della via Gluck/Chi era lui") e senza le virgolette.
 */
function titoloCanzone(t: string | undefined): string | undefined {
  if (!t) return undefined
  const [primo] = t.split(/\s*\/\s*/)
  const pulito = (primo.length >= 3 ? primo : t).replace(/^["“«]+|["”»]+$/g, '').trim()
  return pulito.length > 0 ? pulito : undefined
}

/**
 * Il titolo senza chi la canta fra parentesi: qualche etichetta di Wikidata
 * distingue cosi' le versioni ("Mississippi (Pussycat)", "Celebration
 * (Madonna)"), e nella domanda sarebbe la risposta.
 */
function senzaInterprete(t: string, nomi: readonly string[]): string {
  const m = t.match(/^(.*\S)\s*\(([^()]+)\)$/)
  if (!m) return t
  const dentro = nomeNormale(m[2])
  return nomi.some((n) => nomeNormale(n) === dentro) ? m[1] : t
}

/** Il genere largo del primo genere di Wikidata che ne ha uno: per chi l'elenco non ha. */
function largo(generi: readonly string[], radiciDi: Map<string, Set<GenereCanzone>>): GenereCanzone[] {
  for (const g of generi) {
    const radici = radiciDi.get(g)
    if (radici?.size) return GENERI_CANZONI.filter((x) => radici.has(x)).slice(0, 1)
  }
  return []
}

/** Le voci che Wikidata dice canzoni, singoli o composizioni, anche per una loro sottoclasse. */
async function soloCanzoni(ids: readonly string[]): Promise<Set<string>> {
  const righe = await aPezzi(
    'canzoni-classifiche-classi',
    ids,
    `SELECT DISTINCT ?q WHERE {
  VALUES ?q { #VOCI# }
  VALUES ?classe { ${valoriSparql(CLASSI)} }
  ?q wdt:P31/wdt:P279* ?classe .
}`,
  )
  return new Set(righe.map((r) => r.q!).filter(Boolean))
}

export async function canzoni(): Promise<Omit<DatiCanzoni, 'versione'>> {
  console.log('Canzoni')
  const mondo = await interroga('canzoni-candidate', candidate(CANDIDATI, false))
  const italiane = await interroga('canzoni-candidate-italiane', candidate(CANDIDATI_ITALIANI, true))
  const voci = new Map([...mondo, ...italiane].map((r) => [r.q!, numero(r.voci)]))
  const classificate = await canzoniDelleClassifiche(soloCanzoni)
  const classifica = new Map(classificate.map((c) => [c.id, c]))
  const conVoce = [...new Set([...voci.keys(), ...classificate.filter((c) => c.voce).map((c) => c.id)])]
  const s = await schede('canzoni-schede', conVoce)
  /** Il titolo: quello italiano, per le canzoni con la voce in italiano; se no quello della classifica. */
  const titoloDi = (id: string): string | undefined =>
    s.get(id)?.voce ? titoloCanzone(titoloItaliano(s.get(id))) : titoloCanzone(classifica.get(id)?.titolo)
  const conTitolo = conVoce.filter((id) => titoloDi(id))
  const v = await valori('canzoni-valori', conTitolo, ['P136', 'P31'])
  const date = await anni('canzoni-anni-2', conTitolo, ['P577', 'P571'])
  const certi = await valoriCerti('canzoni-interpreti', conTitolo, 'P175')
  const corrette = correzioniAMano('canzoni-a-mano.tsv')
  const vecchie = [...corrette.keys()].filter((id) => !conTitolo.includes(id))
  if (vecchie.length > 0) console.log(`  correzioni a mano per canzoni che non ci sono piu': ${vecchie.join(', ')}`)
  const righeNon = await aPezzi(
    'canzoni-non-3',
    conTitolo,
    `SELECT DISTINCT ?q WHERE {
  VALUES ?q { #VOCI# }
  { VALUES ?radice { ${valoriSparql(NON_CANZONI)} } ?q wdt:P31/wdt:P279* ?radice . }
  UNION { ?q wdt:P136 wd:Q1344 }
  UNION { ?q wdt:P136 wd:Q9730 }
  UNION { ?q wdt:P361 ?opera . ?opera wdt:P31/wdt:P279* wd:Q1344 . }
}`,
  )
  const nonCanzoni = new Set(righeNon.map((r) => r.q))
  // Le canzoni delle classifiche senza una voce loro: si sanno il titolo, chi la canta e l'anno.
  const senzaVoce = classificate.filter((c) => !c.voce && titoloCanzone(c.titolo))

  /* ── Chi canta ── */
  const aMano = [...corrette.values()].flatMap((c) => c.a ?? [])
  const idInterpreti = [
    ...new Set([
      ...conTitolo.flatMap((id) => certi.get(id) ?? []),
      ...aMano,
      ...classificate.flatMap((c) => [...c.artisti, ...c.ospiti]),
    ]),
  ]
  const gente = await persone('canzoni-artisti', idInterpreti)
  const righeGruppi = await aPezzi(
    'canzoni-gruppi',
    idInterpreti,
    `SELECT DISTINCT ?q WHERE {
  VALUES ?q { #VOCI# }
  ?q wdt:P31/wdt:P279* wd:${INSIEME_MUSICALE} .
}`,
  )
  const gruppi = new Set(righeGruppi.map((r) => r.q!))
  const vGruppi = await valori('canzoni-gruppi-valori', [...gruppi], ['P495', 'P136'])
  const anniGruppi = await anni('canzoni-gruppi-anni', [...gruppi], ['P571', 'P576'])
  const formazione = await aPezzi(
    'canzoni-gruppi-formazione',
    [...gruppi],
    `SELECT ?q ?paese WHERE {
  VALUES ?q { #VOCI# }
  ?q wdt:P740 ?luogo . ?luogo wdt:P17 ?paese .
}`,
  )
  const formatiIn = new Map<string, string[]>()
  for (const r of formazione) {
    if (!r.q || !r.paese) continue
    formatiIn.set(r.q, [...new Set([...(formatiIn.get(r.q) ?? []), r.paese])])
  }
  const stati = await statiDi('canzoni-gruppi-stati', [
    ...new Set([...[...gruppi].flatMap((g) => primi(vGruppi, g, 'P495')), ...[...formatiIn.values()].flat()]),
  ])
  const vPersone = await valori(
    'canzoni-artisti-generi',
    idInterpreti.filter((id) => !gruppi.has(id)),
    ['P136'],
  )
  const mestieri = await valori(
    'canzoni-artisti-mestieri',
    idInterpreti.filter((id) => !gruppi.has(id)),
    ['P106'],
  )
  /** Un interprete come lo vogliono le domande: una persona, o un gruppo con il suo paese e i suoi anni. */
  const interprete = (id: string): Persona | undefined => {
    const p = gente.get(id)
    if (!p) return undefined
    if (p.umano) return p
    if (!gruppi.has(id)) return undefined
    const origini = primi(vGruppi, id, 'P495')
    const luoghi = origini.length > 0 ? origini : (formatiIn.get(id) ?? [])
    const paesi = [...new Set(luoghi.map((q) => moderno(q, [], stati)))]
    const paese = paesi.length === 1 && paesi[0] ? paesi[0] : undefined
    const da = annoSicuro(anniGruppi.get(id)?.get('P571'))
    const a = annoSicuro(anniGruppi.get(id)?.get('P576'), { ultimo: true })
    // Senza un paese d'origine resta quello della descrizione: "gruppo musicale britannico".
    const nome = paese ? nomePaese(paese, stati) : p.p
    return {
      ...p,
      ...(da !== undefined ? { na: da } : {}),
      ...(a !== undefined ? { mo: a } : {}),
      ...(nome ? { p: nome } : {}),
      ...(nome === 'Italia' ? { it: 1 as const } : {}),
    }
  }
  const descrizione = (id: string) => s.get(id)?.descrizione ?? ''
  /**
   * Chi la canta per la classifica: la versione che ha avuto successo. Se la
   * voce di Wikidata dice gia' chi la canta, vale la versione di uno di loro;
   * una versione di altri e' una cover, e vale solo se chi la canta e' piu'
   * noto, per numero di Wikipedia: "Nel blu dipinto di blu" resta di Modugno
   * anche se in classifica c'e' entrato Bobby Rydell, e "Speedy Gonzales" e'
   * di Pat Boone, non di David Hess, che l'aveva incisa per primo.
   */
  const perLaClassifica = (id: string): string[] | undefined => {
    const diWikidata = (certi.get(id) ?? []).filter((x) => interprete(x))
    const noto = (a: readonly string[]) => Math.max(0, ...a.map((x) => interprete(x)?.voci ?? 0))
    const valide = (classifica.get(id)?.versioni ?? []).filter((a) => a.length <= 2 && a.every((x) => interprete(x)))
    if (diWikidata.length === 0) return valide[0]
    return (
      valide.find((a) => a.some((x) => diWikidata.includes(x))) ??
      valide.find((a) => noto(a) > noto(diWikidata))
    )
  }
  /**
   * Chi la canta: quelli dell'elenco a mano, se c'e'; quelli della classifica,
   * se c'e' entrata; se no quelli di Wikidata che la descrizione nomina, se
   * nomina qualcuno, o tutti, se non nomina nessuno. Nessuno se la descrizione
   * dice un altro, o se uno degli interpreti non e' ne' una persona ne' un gruppo.
   */
  const interpretiDi = (id: string): string[] => {
    const scritti = corrette.get(id)?.a
    if (scritti) return scritti.every((x) => interprete(x)) ? scritti : []
    const dallaClassifica = perLaClassifica(id)
    if (dallaClassifica) return dallaClassifica
    if (!s.has(id)) return []
    const tutti = certi.get(id) ?? []
    const d = descrizione(id)
    if (!DICE_CHI.test(d)) return tutti.length <= 2 && tutti.every((x) => interprete(x)) ? tutti : []
    if (tutti.length > INTERPRETI_DI_WIKIDATA) return []
    const detti = tutti.filter((x) => interprete(x) && nominato(d, interprete(x)!.n))
    return detti.length <= 2 ? detti : []
  }
  /**
   * L'anno: quello scritto a mano, della descrizione o della prima uscita, se
   * non e' dopo la prima volta in classifica — una ristampa e' sempre dopo;
   * se no quello della classifica.
   */
  const annoDi = (id: string): number | undefined => {
    const scritto = corrette.get(id)?.anno
    if (scritto !== undefined) return scritto
    const daWikidata =
      annoDescritto(descrizione(id)) ?? primoAnno(date.get(id)?.get('P577')) ?? primoAnno(date.get(id)?.get('P571'))
    const inClassifica = classifica.get(id)?.anno
    if (inClassifica === undefined) return daWikidata
    return daWikidata !== undefined && daWikidata <= inClassifica ? daWikidata : inClassifica
  }
  const italiana = (id: string) => interpretiDi(id).some((x) => interprete(x)?.it)

  /* ── Le canzoni che restano ── */
  const buone = [
    ...conTitolo.filter((id) => !nonCanzoni.has(id) && !corrette.get(id)?.fuori && !DI_NESSUNO.test(descrizione(id))),
    ...senzaVoce.map((c) => c.id),
  ].filter((id) => {
    const anno = annoDi(id)
    return anno !== undefined && anno >= ANNO_MINIMO && interpretiDi(id).length > 0
  })
  const voceItaliana = (id: string) => s.get(id)?.voce
  const lette = await letture(buone.map(voceItaliana).filter((t): t is string => !!t))
  const vociDi = (id: string) => voci.get(id) ?? s.get(id)?.voci ?? 0
  /**
   * Quanto e' nota: le Wikipedia e le letture della voce italiana, come per le
   * altre materie, piu' il successo in classifica. Un primo posto dell'anno in
   * Italia vale `SUCCESSO`: quanto una canzone italiana famosa, e cosi' una hit
   * senza voce tradotta sta con le altre.
   */
  const peso = (id: string) => {
    const t = voceItaliana(id)
    const wiki = notorietaItaliana(vociDi(id), t ? lettureDiSempre(lette.get(t) ?? 0, annoDi(id)) : 0)
    return wiki * (italiana(id) ? PESO_ITALIANE : 1) + SUCCESSO * (classifica.get(id)?.successo ?? 0)
  }
  const titolo = (id: string) =>
    senzaInterprete(
      titoloDi(id) ?? titoloCanzone(classifica.get(id)?.titolo)!,
      [...interpretiDi(id), ...(certi.get(id) ?? [])].map((x) => gente.get(x)?.n ?? ''),
    )
  const unici = titoliUnici(buone, titolo, peso, (id) => interpretiDi(id).join(' '))
  const scelte = unici.sort((a, b) => peso(b) - peso(a) || a.localeCompare(b)).slice(0, CANZONI)
  console.log(
    `  ${conVoce.length} candidate con una voce, ${conTitolo.length} con un titolo, ${senzaVoce.length} ` +
      `dalle classifiche senza voce; ${buone.length} con uno o due interpreti, ${unici.length} con un titolo ` +
      `solo, ${scelte.length} tenute, ${scelte.filter((id) => classifica.has(id)).length} in classifica`,
  )

  /* ── I generi ── */
  const generiCanzone = (id: string) => primi(v, id, 'P136')
  const generiArtista = (id: string) => (gruppi.has(id) ? primi(vGruppi, id, 'P136') : primi(vPersone, id, 'P136'))
  const tuttiGeneri = [
    ...new Set(scelte.flatMap((id) => [...generiCanzone(id), ...interpretiDi(id).flatMap(generiArtista)])),
  ]
  const righeRadici = await aPezzi(
    'canzoni-generi',
    tuttiGeneri,
    `SELECT DISTINCT ?q ?radice WHERE {
  VALUES ?q { #VOCI# }
  VALUES ?radice { ${valoriSparql(Object.values(RADICI).flat())} }
  ?q wdt:P279* ?radice .
}`,
  )
  const radiciDi = new Map<string, Set<GenereCanzone>>()
  for (const r of righeRadici) {
    const g = GENERI_CANZONI.find((x) => RADICI[x]?.includes(r.radice ?? ''))
    if (!r.q || !g) continue
    radiciDi.set(r.q, (radiciDi.get(r.q) ?? new Set()).add(g))
  }
  const perArtista = generiAMano('generi-artisti.tsv')
  const perCanzone = generiAMano('generi-canzoni.tsv')
  const senza = [...new Set(scelte.flatMap(interpretiDi))].filter((id) => !perArtista.has(id))
  if (senza.length > 0) {
    const nomi = senza.map((id) => gente.get(id)?.n ?? id).join(', ')
    console.log(`  ${senza.length} artisti senza genere a mano, da Wikidata: ${nomi}`)
  }
  /** I generi di una canzone: i suoi a mano, o quelli dei suoi interpreti, il primo per primo. */
  const generiDi = (id: string, a: readonly string[]): GenereCanzone[] => {
    const propri = perCanzone.get(id)
    if (propri) return propri
    const daiNomi = a.flatMap((x) => perArtista.get(x) ?? largo([...generiCanzone(id), ...generiArtista(x)], radiciDi))
    return [...new Set(daiNomi)]
  }

  /* ── L'ordine di chi canta, nei duetti: quello della classifica, o quello di Wikidata ── */
  const ordine = await ordineDichiarazioni(
    scelte.filter((id) => s.has(id) && !perLaClassifica(id) && interpretiDi(id).length > 1),
    ['P175'],
  )
  const fama = perNotorieta(
    scelte.map((id) => ({ id })),
    (x) => peso(x.id),
  )
  // Gli altri interpreti contano solo se sono fra gli artisti: e' fra loro che si pescano le sbagliate.
  // Sono quelli di Wikidata, gli ospiti della classifica e chi ci e' entrato con un'altra versione.
  const artistiUsati = new Set(scelte.flatMap(interpretiDi))
  const altriDi = (id: string, a: readonly string[]) => {
    const c = classifica.get(id)
    return [...new Set([...(certi.get(id) ?? []), ...(c?.ospiti ?? []), ...(c?.versioni.flat() ?? [])])].filter(
      (x) => !a.includes(x) && artistiUsati.has(x),
    )
  }
  /**
   * Si chiede di chi e', e non chi la canta, quando chi la firma non e' detto
   * che la canti: le canzoni dell'elenco a mano, quelle con un ospite ("Lean
   * On" dei Major Lazer, con MØ) e quelle di un dj. "Di chi è" non e' mai
   * sbagliato; "chi canta «Wake Me Up»?" con Avicii per risposta si'.
   */
  const diChi = (id: string, a: readonly string[]) =>
    corrette.get(id)?.diChi ||
    (classifica.get(id)?.ospiti.length ?? 0) > 0 ||
    a.some((x) => primi(mestieri, x, 'P106').includes(DISC_JOCKEY))
  const elenco: CanzoneQuiz[] = scelte.map((id) => {
    const a = perLaClassifica(id)
      ? interpretiDi(id)
      : inOrdine(interpretiDi(id), ordine.get(id)?.get('P175'), (x) => gente.get(x)?.voci ?? 0)
    const g = generiDi(id, a)
    const anno = annoDi(id)
    const voce = voceItaliana(id)
    return {
      id,
      n: titolo(id),
      a,
      ...(altriDi(id, a).length > 0 ? { x: altriDi(id, a) } : {}),
      ...(anno !== undefined ? { anno } : {}),
      ...(g.length > 0 ? { g } : {}),
      ...(diChi(id, a) ? { dc: 1 as const } : {}),
      ...(voce ? { w: voce } : {}),
      f: fama.get(id) ?? 0,
    }
  })

  /* ── Gli artisti, con la loro notorietà: le Wikipedia, le letture e il successo delle loro canzoni ── */
  const usati = [...new Set(elenco.flatMap((c) => c.a))].map((id) => interprete(id)!).filter(Boolean)
  const letteArtisti = await letture(usati.map((p) => p.w).filter((t): t is string => !!t))
  const successoDi = new Map<string, number>()
  for (const c of elenco) {
    for (const x of c.a) successoDi.set(x, (successoDi.get(x) ?? 0) + (classifica.get(c.id)?.successo ?? 0))
  }
  const famaArtisti = perNotorieta(
    usati,
    (p) => notorietaItaliana(p.voci, letteArtisti.get(p.w ?? '') ?? 0) + SUCCESSO * (successoDi.get(p.id) ?? 0),
  )
  const artisti: ArtistaQuiz[] = usati.map((p) => ({
    id: p.id,
    n: p.n,
    ...(gruppi.has(p.id) ? { gr: 1 as const } : {}),
    ...(p.na !== undefined ? { na: p.na } : {}),
    ...(p.mo !== undefined ? { mo: p.mo } : {}),
    ...(p.p ? { p: p.p } : {}),
    ...(p.it ? { it: p.it } : {}),
    ...(p.d ? { d: p.d } : {}),
    ...(p.w ? { w: p.w } : {}),
    f: famaArtisti.get(p.id) ?? 0,
  }))
  return { canzoni: perFama(elenco), artisti: perFama(artisti) }
}

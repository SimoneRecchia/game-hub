/**
 * Le persone delle materie: chi ha dipinto, scritto, girato, composto, chi ha
 * vinto un Nobel. Per tutte le stesse cose: il nome, gli anni, il paese, se e'
 * italiana, due parole su chi e'.
 *
 * Il paese e' uno di oggi, come negli esempi dello schema ("Paesi Bassi"):
 * Wikidata da' a Rembrandt la cittadinanza della Repubblica delle Sette
 * Province Unite, e a Van Gogh quella del Regno dei Paesi Bassi, e in una
 * domanda "di che paese era?" le due risposte giuste sarebbero diverse. Prima
 * si guarda la descrizione italiana di Wikidata, che dice la nazionalità come
 * la dice un libro di scuola: "pittore fiammingo", "fisico tedesco naturalizzato
 * statunitense" — l'aggettivo che viene prima. Senza, la cittadinanza al
 * momento della morte: uno stato che non c'e' piu' diventa quello di oggi con
 * la tabella qui sotto, e gli imperi di molti popoli (il Sacro Romano Impero,
 * l'Impero austriaco) il paese dove la persona e' nata. Con due cittadinanze
 * diverse alla morte il paese non si scrive: meglio niente che una risposta a
 * meta'.
 *
 * Italiano e' chi la descrizione dice italiano (o "italo-statunitense", come
 * Fermi). Se la descrizione non dice una nazionalità, chi ha la cittadinanza
 * italiana o del Regno d'Italia, o e' nato fra la caduta dell'Impero romano
 * d'Occidente e il 1861 dove oggi e' Italia (Dante, Leonardo, Manzoni). La
 * descrizione viene prima: Sargent e' nato a Firenze e Scorsese ha anche la
 * cittadinanza italiana, ma sono un pittore e un regista statunitensi. Prima del
 * 476 no: Archimede era di Siracusa e Cicerone di Arpino, ma sono un matematico
 * greco e un oratore romano. E non basta la cittadinanza di uno stato di prima
 * dell'Unità: El Greco era suddito della Repubblica di Venezia, perché Creta
 * era veneziana. Le organizzazioni non sono mai italiane: il Programma
 * alimentare mondiale ha sede a Roma, ma e' delle Nazioni Unite.
 */

import type { PersonaQuiz } from '../../shared/quiz-cultura'
import {
  anni,
  annoDaData,
  annoSicuro,
  aPezzi,
  conSpinta,
  nomeItaliano,
  perFama,
  perNotorieta,
  primi,
  schede,
  valori,
} from './wikidata'

/** Una persona, prima della notorietà: quella si calcola dentro l'elenco di ogni materia. */
export interface Persona extends Omit<PersonaQuiz, 'f'> {
  voci: number
  /** Un essere umano: il Nobel per la pace va anche alle organizzazioni. */
  umano: boolean
}

export const ITALIA = 'Q38'

/**
 * Le classi delle persone: gli esseri umani, e quelli "che potrebbero essere
 * immaginari". Omero e' della seconda, e senza l'Iliade non avrebbe un autore:
 * nei libri di scuola e' di Omero, e la domanda si fa cosi'.
 */
export const PERSONE = ['Q5', 'Q21070568']

/** Le cittadinanze che fanno italiani: l'Italia e il Regno d'Italia. */
export const CITTADINANZE_ITALIANE = new Set([ITALIA, 'Q172579'])

/**
 * Gli stati che non ci sono piu', con il paese di oggi che li continua: il
 * Regno di Francia e' la Francia, l'Impero russo la Russia. Le etichette sono
 * quelle di Wikidata, verificate sulle cittadinanze delle persone delle materie.
 */
export const STATI_DI_OGGI: Record<string, string> = {
  Q170072: 'Q29999', // Repubblica delle Sette Province Unite → Paesi Bassi
  Q27996474: 'Q29999', // Paesi Bassi settentrionali
  Q55: 'Q29999', // Paesi Bassi, la nazione costitutiva: il codice ISO sta sul Regno
  Q1054923: 'Q8646', // Hong Kong britannico → Hong Kong
  Q34266: 'Q159', // Impero russo → Russia
  Q170770: 'Q159', // Moscovia
  Q161885: 'Q145', // Regno di Gran Bretagna → Regno Unito
  Q174193: 'Q145', // Regno Unito di Gran Bretagna e Irlanda
  Q70972: 'Q142', // Regno di Francia → Francia
  Q27306: 'Q183', // Regno di Prussia → Germania
  Q47261: 'Q183', // Ducato di Baviera
  Q43287: 'Q183', // Impero tedesco
  Q41304: 'Q183', // Repubblica di Weimar
  Q7318: 'Q183', // Germania nazista
  Q713750: 'Q183', // Germania Ovest
  Q16957: 'Q183', // Germania Est
  Q188712: 'Q17', // Impero giapponese → Giappone
  Q217196: 'Q29', // Regno di Castiglia e León → Spagna
  Q204920: 'Q29', // Corona d'Aragona
  Q62633: 'Q33', // Granducato di Finlandia → Finlandia
  Q501303: 'Q36', // Repubblica di Cracovia → Polonia
  Q9683: 'Q148', // dinastia Tang → Cina
  Q7313: 'Q148', // Yuan
}

/**
 * Gli stati di molti popoli: per chi ne era cittadino, il paese di oggi e'
 * quello in cui e' nato. Dürer era del Sacro Romano Impero e nacque a Norimberga.
 */
export const IMPERI = new Set([
  'Q12548', // Sacro Romano Impero
  'Q131964', // Impero austriaco
  'Q533534', // Cisleitania
  'Q15180', // Unione Sovietica
  'Q28513', // Austria-Ungheria
  'Q33946', // Cecoslovacchia
  'Q36704', // Jugoslavia
  'Q8680', // Impero britannico
  'Q1031430', // Paesi Bassi asburgici
  'Q6581823', // Paesi Bassi meridionali
  'Q157109', // Paesi Bassi borgognoni
  'Q622783', // Paesi Bassi spagnoli
  'Q159856', // ducato di Brabante
])

/**
 * Gli aggettivi di nazionalità delle descrizioni, con il paese di oggi, scritto
 * come lo scrivono le etichette di Wikidata (con le correzioni di NOMI_PAESI).
 * "Fiammingo" e' il Belgio: e' dove sono le Fiandre di van Eyck e di Rubens.
 */
const AGGETTIVI: Record<string, string> = {
  italiano: 'Italia',
  francese: 'Francia',
  tedesco: 'Germania',
  prussiano: 'Germania',
  bavarese: 'Germania',
  spagnolo: 'Spagna',
  catalano: 'Spagna',
  portoghese: 'Portogallo',
  inglese: 'Regno Unito',
  britannico: 'Regno Unito',
  scozzese: 'Regno Unito',
  gallese: 'Regno Unito',
  nordirlandese: 'Regno Unito',
  irlandese: 'Irlanda',
  olandese: 'Paesi Bassi',
  neerlandese: 'Paesi Bassi',
  fiammingo: 'Belgio',
  belga: 'Belgio',
  svizzero: 'Svizzera',
  austriaco: 'Austria',
  russo: 'Russia',
  ucraino: 'Ucraina',
  bielorusso: 'Bielorussia',
  polacco: 'Polonia',
  ceco: 'Repubblica Ceca',
  boemo: 'Repubblica Ceca',
  slovacco: 'Slovacchia',
  ungherese: 'Ungheria',
  romeno: 'Romania',
  rumeno: 'Romania',
  bulgaro: 'Bulgaria',
  serbo: 'Serbia',
  croato: 'Croazia',
  sloveno: 'Slovenia',
  greco: 'Grecia',
  turco: 'Turchia',
  danese: 'Danimarca',
  svedese: 'Svezia',
  norvegese: 'Norvegia',
  finlandese: 'Finlandia',
  islandese: 'Islanda',
  estone: 'Estonia',
  lettone: 'Lettonia',
  lituano: 'Lituania',
  georgiano: 'Georgia',
  armeno: 'Armenia',
  statunitense: 'Stati Uniti',
  americano: 'Stati Uniti',
  canadese: 'Canada',
  messicano: 'Messico',
  cubano: 'Cuba',
  argentino: 'Argentina',
  brasiliano: 'Brasile',
  cileno: 'Cile',
  colombiano: 'Colombia',
  peruviano: 'Perù',
  venezuelano: 'Venezuela',
  uruguaiano: 'Uruguay',
  guatemalteco: 'Guatemala',
  australiano: 'Australia',
  neozelandese: 'Nuova Zelanda',
  sudafricano: 'Sudafrica',
  nigeriano: 'Nigeria',
  egiziano: 'Egitto',
  israeliano: 'Israele',
  iraniano: 'Iran',
  indiano: 'India',
  pakistano: 'Pakistan',
  cinese: 'Cina',
  giapponese: 'Giappone',
  coreano: 'Corea del Sud',
  sudcoreano: 'Corea del Sud',
  vietnamita: 'Vietnam',
}

/** Le forme femminili e plurali: "pittrice olandese", "fisica tedesca", "fratelli francesi". */
const FORME_AGGETTIVI = new Map<string, string>()
for (const [maschile, paese] of Object.entries(AGGETTIVI)) {
  const forme = /o$/.test(maschile)
    ? [maschile, maschile.replace(/o$/, 'a'), maschile.replace(/o$/, 'i'), maschile.replace(/o$/, 'e')]
    : /e$/.test(maschile)
      ? [maschile, maschile.replace(/e$/, 'i')]
      : [maschile]
  // "Tedesco" fa "tedeschi", "greco" fa "greci": le forme con la h si aggiungono a parte.
  if (/co$/.test(maschile)) forme.push(maschile.replace(/co$/, 'che'), maschile.replace(/co$/, 'chi'))
  // "Belga" e "vietnamita" fanno il plurale in -i.
  if (/a$/.test(maschile)) forme.push(maschile.replace(/a$/, 'i'))
  for (const f of forme) FORME_AGGETTIVI.set(f, paese)
}
// "Fisico italo-statunitense": il primo pezzo dice dov'e' nato, come l'aggettivo che viene prima.
FORME_AGGETTIVI.set('italo', 'Italia')

/**
 * Le nazionalità che non diventano un paese di oggi: un pittore sovietico
 * poteva essere russo, ucraino o georgiano, un autore romano non e' "italiano".
 * Con una di queste la descrizione dice che il paese non si scrive.
 */
const SENZA_PAESE = new Set([
  ...['sovietico', 'jugoslavo', 'cecoslovacco', 'bizantino', 'romano', 'spartano', 'babilonese', 'assiro'].flatMap(
    (a) => [a, a.replace(/o$/, 'a'), a.replace(/o$/, 'i'), a.replace(/o$/, 'e')],
  ),
  'ateniese',
  'ateniesi',
])

/** Le parole dopo cui gli aggettivi non dicono piu' la nazionalità: "di origine polacca", "naturalizzato francese". */
const FINE_NAZIONALITA = /^(origine|origini|discendenza|naturalizzat[oaie]|nat[oaie])$/

/**
 * Il paese detto dalla descrizione: il primo aggettivo di nazionalità, se non
 * viene dopo "lingua" ("scrittore di lingua tedesca" non dice di dov'e').
 * `null` vuol dire che la descrizione dice una nazionalità senza paese di oggi.
 */
export function paeseDallaDescrizione(d: string | undefined): string | null | undefined {
  const parole = (d ?? '').toLowerCase().split(/[^\p{L}]+/u).filter(Boolean)
  for (let i = 0; i < parole.length; i += 1) {
    if (FINE_NAZIONALITA.test(parole[i])) return undefined
    if (SENZA_PAESE.has(parole[i])) return null
    const paese = FORME_AGGETTIVI.get(parole[i])
    if (paese && parole[i - 1] !== 'lingua') return paese
  }
  return undefined
}

/** I nomi che Wikidata dice in modo ufficiale e l'italiano di tutti i giorni no: come in scripts/quiz/riassunto.ts. */
const NOMI_PAESI: Record<string, string> = {
  NL: 'Paesi Bassi',
  PS: 'Palestina',
  FM: 'Micronesia',
  US: 'Stati Uniti',
  CZ: 'Repubblica Ceca',
}

interface Cittadinanza {
  paese: string
  inizio?: number
  fine?: number
  preferita: boolean
}

export interface Stato {
  nome?: string
  iso?: string
  /** L'anno in cui ha smesso di esistere. */
  fine?: number
}

/** Una persona come la vuole lo schema, con la sua notorietà: senza i campi di lavoro. */
export function personaQuiz(p: Persona, f: number): PersonaQuiz {
  const correnti = p.c ?? []
  return {
    id: p.id,
    n: p.n,
    ...(p.na !== undefined ? { na: p.na } : {}),
    ...(p.mo !== undefined ? { mo: p.mo } : {}),
    ...(p.p ? { p: p.p } : {}),
    ...(p.it ? { it: p.it } : {}),
    ...(correnti.length > 0 ? { c: correnti } : {}),
    ...(p.d ? { d: p.d } : {}),
    ...(p.w ? { w: p.w } : {}),
    f,
  }
}

/** Le persone di un elenco come le vuole lo schema, dalla piu' nota: le italiane contano un po' di piu'. */
export function elencoPersone(voci: readonly Persona[]): PersonaQuiz[] {
  const fama = perNotorieta(voci, (p) => conSpinta(p.voci, !!p.it))
  return perFama(voci.map((p) => personaQuiz(p, fama.get(p.id) ?? 0)))
}

/** "pittore italiano (1475-1564)" → "pittore italiano": gli anni ci sono gia'. */
export function descrizioneBreve(d: string | undefined): string | undefined {
  if (!d) return undefined
  const breve = d
    .replace(/\s*\([^()]*\d[^()]*\)\s*$/, '')
    .replace(/'/g, '’')
    .trim()
  if (breve.length === 0) return undefined
  if (breve.length <= 90) return breve
  // Troppo lunga: fino all'ultima virgola che ci sta, o niente.
  const taglio = breve.lastIndexOf(',', 90)
  return taglio > 20 ? breve.slice(0, taglio) : undefined
}

export async function persone(
  nome: string,
  ids: readonly string[],
  { correnti = false }: { correnti?: boolean } = {},
): Promise<Map<string, Persona>> {
  const s = await schede(`${nome}-schede`, ids)
  const v = await valori(`${nome}-valori`, ids, correnti ? ['P31', 'P135'] : ['P31'])
  const a = await anni(`${nome}-anni`, ids, ['P569', 'P570'])
  const righe = await aPezzi(
    `${nome}-paesi`,
    ids,
    `SELECT ?q ?tipo ?paese ?inizio ?fine ?rango WHERE {
  VALUES ?q { #VOCI# }
  { ?q p:P27 ?st . ?st ps:P27 ?paese ; wikibase:rank ?rango .
    OPTIONAL { ?st pq:P580 ?inizio } OPTIONAL { ?st pq:P582 ?fine } BIND("c" AS ?tipo) }
  UNION { ?q wdt:P19 ?luogo . ?luogo wdt:P17 ?paese . BIND("n" AS ?tipo) }
  UNION { ?q wdt:P17 ?paese . BIND("s" AS ?tipo) }
}`,
  )
  const cittadinanze = new Map<string, Cittadinanza[]>()
  const nascita = new Map<string, string[]>()
  const sede = new Map<string, string[]>()
  for (const r of righe) {
    if (!r.q || !r.paese || !/^Q\d+$/.test(r.paese)) continue
    if (r.tipo === 'c') {
      if ((r.rango ?? '').endsWith('DeprecatedRank')) continue
      const elenco = cittadinanze.get(r.q) ?? []
      elenco.push({
        paese: r.paese,
        inizio: annoDaData(r.inizio),
        fine: annoDaData(r.fine),
        preferita: (r.rango ?? '').endsWith('PreferredRank'),
      })
      cittadinanze.set(r.q, elenco)
    } else {
      const m = r.tipo === 'n' ? nascita : sede
      const elenco = m.get(r.q) ?? []
      if (!elenco.includes(r.paese)) elenco.push(r.paese)
      m.set(r.q, elenco)
    }
  }
  const idStati = [
    ...new Set([
      ...[...cittadinanze.values()].flat().map((c) => c.paese),
      ...[...nascita.values(), ...sede.values()].flat(),
    ]),
  ]
  const stati = await statiDi(`${nome}-stati`, idStati)

  const esito = new Map<string, Persona>()
  for (const id of ids) {
    const scheda = s.get(id)
    // Il nome di una persona e' lo stesso in tutte le lingue che scrivono in latino: "mul" va bene.
    const n = nomeItaliano(scheda, { mul: true })
    if (!scheda || !n) continue
    const tipi = primi(v, id, 'P31')
    const umano = tipi.some((t) => PERSONE.includes(t))
    const na = umano ? annoSicuro(a.get(id)?.get('P569')) : undefined
    const mo = umano ? annoSicuro(a.get(id)?.get('P570')) : undefined
    const suoi = cittadinanze.get(id) ?? []
    const nato = nascita.get(id) ?? []
    const descritto = paeseDallaDescrizione(scheda.descrizione)
    const nataNel = na ?? mo
    // Una nazionalità scritta nella descrizione decide; la cittadinanza e la nascita solo dove non c'e'.
    const italiano =
      umano &&
      (descritto === 'Italia' ||
        (descritto === undefined &&
          (suoi.some((c) => CITTADINANZE_ITALIANE.has(c.paese)) ||
            (nataNel !== undefined && nataNel >= 476 && nataNel < 1861 && nato.includes(ITALIA)))))
    const cittadino = umano
      ? paeseDi(suoi, nato, mo, stati)
      : unico((sede.get(id) ?? []).map((q) => moderno(q, [], stati)))
    const paese = italiano
      ? 'Italia'
      : descritto === null
        ? undefined
        : (descritto ?? (cittadino ? nomePaese(cittadino, stati) : undefined))
    const d = descrizioneBreve(scheda.descrizione)
    esito.set(id, {
      id,
      n,
      ...(na !== undefined ? { na } : {}),
      ...(mo !== undefined ? { mo } : {}),
      ...(paese ? { p: paese } : {}),
      ...(italiano ? { it: 1 as const } : {}),
      ...(correnti && primi(v, id, 'P135').length > 0 ? { c: primi(v, id, 'P135') } : {}),
      ...(d ? { d } : {}),
      ...(scheda.voce ? { w: scheda.voce } : {}),
      voci: scheda.voci,
      umano,
    })
  }
  return esito
}

/** Nome, codice ISO e fine degli stati; con quelli di oggi della tabella, per il loro nome. */
export async function statiDi(nome: string, ids: readonly string[]): Promise<Map<string, Stato>> {
  const righe = await aPezzi(
    nome,
    [...new Set([...ids, ...Object.values(STATI_DI_OGGI)])],
    `SELECT ?q ?nome ?iso ?fine WHERE {
  VALUES ?q { #VOCI# }
  OPTIONAL { ?q rdfs:label ?nome . FILTER(LANG(?nome) = "it") }
  OPTIONAL { ?q wdt:P297 ?iso }
  OPTIONAL { ?q wdt:P576 ?fine }
}`,
  )
  const esito = new Map<string, Stato>()
  for (const r of righe) {
    if (!r.q) continue
    const prima = esito.get(r.q)
    const fine = annoDaData(r.fine)
    esito.set(r.q, {
      nome: prima?.nome ?? r.nome,
      iso: prima?.iso ?? r.iso,
      fine: prima?.fine !== undefined && fine !== undefined ? Math.min(prima.fine, fine) : (prima?.fine ?? fine),
    })
  }
  return esito
}

/** Uno stato di oggi: ha il codice ISO e non ha smesso di esistere. */
export const diOggi = (id: string, stati: Map<string, Stato>) =>
  !!stati.get(id)?.iso && stati.get(id)?.fine === undefined

/** Il paese di oggi di uno stato, o `undefined` se non si sa dire. */
export function moderno(id: string, nato: readonly string[], stati: Map<string, Stato>): string | undefined {
  if (diOggi(id, stati)) return id
  if (STATI_DI_OGGI[id]) return STATI_DI_OGGI[id]
  if (IMPERI.has(id)) return natoIn(nato, stati)
  return undefined
}

/** Il paese di oggi dove una persona e' nata: i Paesi Bassi di Wikidata sono due voci, e il codice e' sul Regno. */
function natoIn(nato: readonly string[], stati: Map<string, Stato>): string | undefined {
  return nato.map((q) => (diOggi(q, stati) ? q : STATI_DI_OGGI[q])).find((q): q is string => !!q)
}

const unico = (elenco: Array<string | undefined>) => {
  const diversi = [...new Set(elenco.filter((x): x is string => !!x))]
  return diversi.length === 1 ? diversi[0] : undefined
}

/**
 * Il paese di una persona: le cittadinanze che valevano quando e' morta (o
 * adesso, per chi vive), portate agli stati di oggi. Senza cittadinanze, il
 * paese dove e' nata; con due diverse, quello dove e' nata se e' fra le due.
 */
function paeseDi(
  suoi: readonly Cittadinanza[],
  nato: readonly string[],
  morte: number | undefined,
  stati: Map<string, Stato>,
): string | undefined {
  // Per chi vive, "adesso" e' un anno che non arriva: valgono le cittadinanze senza fine.
  const quando = morte ?? Number.MAX_SAFE_INTEGER
  const valide = suoi.filter((c) => {
    const fine = c.fine ?? stati.get(c.paese)?.fine
    return (c.inizio === undefined || c.inizio <= quando) && (fine === undefined || fine >= quando)
  })
  const scelte = valide.length > 0 ? valide : suoi.some((c) => c.preferita) ? suoi.filter((c) => c.preferita) : suoi
  if (scelte.length === 0) return natoIn(nato, stati)
  const moderni = [...new Set(scelte.map((c) => moderno(c.paese, nato, stati)).filter((x): x is string => !!x))]
  if (moderni.length === 1) return moderni[0]
  if (moderni.length > 1) return moderni.find((q) => q === natoIn(nato, stati))
  return undefined
}

export function nomePaese(id: string, stati: Map<string, Stato>): string | undefined {
  const s = stati.get(id)
  if (id === ITALIA) return 'Italia'
  const nome = (s?.iso && NOMI_PAESI[s.iso]) ?? s?.nome
  return nome ? nome.replace(/'/g, '’') : undefined
}

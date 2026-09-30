/**
 * La scienza: gli elementi, i composti, le unità di misura, i corpi del sistema
 * solare, le scoperte e le invenzioni, le specie di animali e di piante.
 *
 * Dove Wikidata e' disordinato si scrive a mano quel che si studia a scuola, e
 * lo si dice: la famiglia di un elemento viene dal suo numero atomico, perché
 * le sottoclassi di Wikidata mettono metà dei metalli di transizione fra gli
 * "elementi del blocco d" e basta; la grandezza di un'unità da una tabella,
 * perché per Wikidata il kelvin misura la "temperatura di Néel" e il metro
 * l'"altezza".
 */

import type {
  AstroQuiz,
  CompostoQuiz,
  DatiScienza,
  ElementoQuiz,
  ScopertaQuiz,
  SpecieQuiz,
  UnitaQuiz,
} from '../../shared/quiz-cultura'
import { persone, type Persona } from './persone'
import { interroga } from './rete'
import {
  anni,
  annoSicuro,
  aPezzi,
  conSpinta,
  nomeItaliano,
  numero,
  perFama,
  perNotorieta,
  primi,
  schede,
  titoliUnici,
  titoloNormale,
  valori,
  valoriCerti,
  valoriSparql,
  type Scheda,
} from './wikidata'

const COMPOSTI = 120
/**
 * Le scoperte sono state rilette una per una (vedi `SCOPERTE_SBAGLIATE`), e
 * l'elenco e' quello: tolte quelle che non vanno, delle prime 150 ne restano
 * 110. Per allungarlo si rilegge quel che entra.
 */
const SCOPERTE = 110
const SPECIE = 300
const SATELLITI = 30

/* ─────────────────────────────  Gli elementi  ──────────────────────────── */

/**
 * Le famiglie per numero atomico, come nella tavola periodica di scuola. Dove i
 * libri non sono d'accordo la famiglia non si scrive: il gruppo 12 (zinco,
 * cadmio, mercurio) e' di transizione per alcuni e no per altri, il polonio e'
 * un metallo o un semimetallo, e dal 113 al 118 le proprietà sono previste.
 */
function famiglia(z: number): string | undefined {
  const fra = (a: number, b: number) => z >= a && z <= b
  if ([3, 11, 19, 37, 55, 87].includes(z)) return 'metallo alcalino'
  if ([4, 12, 20, 38, 56, 88].includes(z)) return 'metallo alcalino-terroso'
  if (fra(57, 71)) return 'lantanide'
  if (fra(89, 103)) return 'attinide'
  if ([30, 48, 80, 112].includes(z)) return undefined
  if (fra(21, 29) || fra(39, 47) || fra(72, 79) || fra(104, 111)) return 'metallo di transizione'
  if ([13, 31, 49, 50, 81, 82, 83].includes(z)) return 'metallo post-transizionale'
  if ([5, 14, 32, 33, 51, 52].includes(z)) return 'semimetallo'
  if ([9, 17, 35, 53, 85].includes(z)) return 'alogeno'
  if ([2, 10, 18, 36, 54, 86].includes(z)) return 'gas nobile'
  if ([1, 6, 7, 8, 15, 16, 34].includes(z)) return 'non metallo'
  return undefined
}

const Q_ELEMENTI = `SELECT ?q ?z ?simbolo WHERE {
  ?q wdt:P31 wd:Q11344 ; wdt:P1086 ?z ; wdt:P246 ?simbolo .
}`

/* ───────────────────────────  Le unità di misura  ─────────────────────────── */

/**
 * Le unità, con la grandezza come la dice un libro di fisica: le sette
 * fondamentali del SI, le ventidue derivate con un nome proprio, e il litro e
 * l'ettaro, che si usano ogni giorno. Gli identificativi sono verificati sulle
 * etichette di Wikidata.
 */
const UNITA: Array<[string, string]> = [
  ['Q11573', 'lunghezza'], // metro
  ['Q11570', 'massa'], // chilogrammo
  ['Q11574', 'tempo'], // secondo
  ['Q25272', 'intensità di corrente elettrica'], // ampere
  ['Q11579', 'temperatura'], // kelvin
  ['Q41509', 'quantità di sostanza'], // mole
  ['Q83216', 'intensità luminosa'], // candela
  ['Q33680', 'angolo piano'], // radiante
  ['Q177612', 'angolo solido'], // steradiante
  ['Q39369', 'frequenza'], // hertz
  ['Q12438', 'forza'], // newton
  ['Q44395', 'pressione'], // pascal
  ['Q25269', 'energia'], // joule
  ['Q25236', 'potenza'], // watt
  ['Q25406', 'carica elettrica'], // coulomb
  ['Q25250', 'tensione elettrica'], // volt
  ['Q131255', 'capacità elettrica'], // farad
  ['Q47083', 'resistenza elettrica'], // ohm
  ['Q169893', 'conduttanza elettrica'], // siemens
  ['Q170804', 'flusso magnetico'], // weber
  ['Q163343', 'induzione magnetica'], // tesla
  ['Q163354', 'induttanza'], // henry
  ['Q25267', 'temperatura'], // grado Celsius
  ['Q484092', 'flusso luminoso'], // lumen
  ['Q179836', 'illuminamento'], // lux
  ['Q102573', 'attività di un radionuclide'], // becquerel
  ['Q190095', 'dose assorbita'], // gray
  ['Q103246', 'dose equivalente'], // sievert
  ['Q208634', 'attività catalitica'], // katal
  ['Q11582', 'volume'], // litro
  ['Q35852', 'superficie'], // ettaro
]

/** Un simbolo si legge in alfabeto latino o greco: "m", "Ω", "°C". Niente "м" né "מ". */
const SIMBOLO = /^[A-Za-zΩµμ°·/⁻¹²³0-9]+$/u

/* ───────────────────────────────  Gli astri  ─────────────────────────────── */

/** I pianeti in ordine dal Sole. I primi sei si vedono a occhio nudo (con la Terra): nessuno li ha scoperti. */
const PIANETI: Array<[string, number]> = [
  ['Q308', 1], // Mercurio
  ['Q313', 2], // Venere
  ['Q2', 3], // Terra
  ['Q111', 4], // Marte
  ['Q319', 5], // Giove
  ['Q193', 6], // Saturno
  ['Q324', 7], // Urano
  ['Q332', 8], // Nettuno
]
const A_OCCHIO_NUDO = new Set(['Q308', 'Q313', 'Q2', 'Q111', 'Q319', 'Q193'])

/**
 * I cinque pianeti nani dell'Unione astronomica internazionale. Makemake su
 * Wikidata non ha il nome italiano (e' "136472 Makemake"): in italiano si
 * chiama come in tutte le lingue.
 */
const PIANETI_NANI: Array<[string, string]> = [
  ['Q339', 'Plutone'],
  ['Q596', 'Cerere'],
  ['Q611', 'Eris'],
  ['Q604', 'Makemake'],
  ['Q601', 'Haumea'],
]

/** La Luna non l'ha scoperta nessuno. */
const LUNA = 'Q405'

const Q_SATELLITI = `SELECT DISTINCT ?q ?pianeta ?voci WHERE {
  VALUES ?pianeta { ${valoriSparql([...PIANETI.map(([q]) => q), 'Q339'])} }
  ?q wdt:P397 ?pianeta .
  ?q wdt:P31/wdt:P279* wd:Q2537 .
  ?q wikibase:sitelinks ?voci .
}
ORDER BY DESC(?voci)
LIMIT 80`

/* ─────────────────────────────  Le scoperte  ──────────────────────────── */

/**
 * Quel che non e' una scoperta da quiz anche se Wikidata ne dice lo
 * scopritore: i luoghi (l'America, le isole, i fiumi), i corpi celesti (stanno
 * fra gli astri), gli elementi (fra gli elementi), le specie, i minerali, i
 * siti archeologici; e le idee e i nomi che qualcuno ha dato a qualcosa — il
 * marxismo, l'impressionismo, il Neolitico, il genocidio (la parola e' di
 * Lemkin) — che non sono scoperte ne' invenzioni.
 */
const NON_SCOPERTE = [
  'Q6999', // oggetto celeste
  'Q17334923', // luogo
  'Q2221906', // posizione geografica
  'Q618123', // elemento geografico
  'Q82794', // regione geografica
  'Q1620908', // regione storica
  'Q56061', // entità territoriale amministrativa
  'Q15642541', // entità territoriale umana
  'Q839954', // sito archeologico
  'Q11344', // elemento chimico
  'Q16521', // taxon
  'Q7946', // minerale
  'Q5', // persona
  'Q7257', // ideologia
  'Q12909644', // ideologia politica
  'Q49773', // movimento
  'Q2738074', // movimento politico
  'Q1387659', // scuola di pensiero
  'Q28108', // sistema politico
  'Q968159', // movimento artistico
  'Q1792644', // stile artistico
  'Q11514315', // periodo storico
  'Q15401633', // periodo archeologico
  'Q130583773', // tipo di reato
]

/**
 * Le grandezze fisiche come idea: Wikidata da' a Varignon la velocità e
 * l'accelerazione, che ha definito, ma non le ha scoperte nessuno. Si guarda
 * solo la sottoclasse: la velocità della luce e' una grandezza anche lei, e
 * l'ha misurata davvero Rømer.
 */
const GRANDEZZA_FISICA = 'Q107715'

/**
 * Le scoperte che non fanno una domanda giusta. "A chi si deve…" vuole una
 * risposta sola e sicura: fuori quelle che Wikidata da' allo scopritore
 * sbagliato, quelle che si contendono in tanti, quelle per cui la domanda non
 * ha senso (una malattia, un posto, una civiltà), e le troppo difficili.
 */
const SCOPERTE_SBAGLIATE = new Set([
  // Lo scopritore sbagliato.
  'Q134465', // la legge di gravitazione universale: a Hooke, e non a Newton
  'Q228036', // il taglio cesareo: a Chanakya, per una leggenda
  'Q179380', // il primo principio della termodinamica: a Carnot, che ha scritto il secondo
  'Q177045', // il secondo principio: Carnot ne pose le basi, lo enunciarono Clausius e Kelvin
  'Q11656', // il diodo: a Bose, e non a Fleming
  'Q7155', // l'etologia: a chi ne invento' il nome, non a Lorenz e Tinbergen
  'Q101667', // l'adrone: a chi ne invento' il nome
  'Q6203', // la costante di Avogadro: a Loschmidt e Perrin, con il nome di un altro
  'Q23118', // l'LSD, con l'anno sbagliato (Hofmann lo sintetizzo' nel 1938)
  'Q2409', // l'acido cloridrico: a Basilio Valentino e Maria la Giudea, per tradizione
  'Q652297', // il catetere: c'era gia' nell'antichità
  'Q166849', // la lente d'ingrandimento: ad Alhazen
  'Q184190', // il cemento armato: Monier lo brevetto' nel 1867, e prima c'era Lambot
  'Q782543', // l'interfaccia grafica: a Sutherland, e nel 1973
  // Contese fra piu' inventori, o attribuite a uno solo di loro.
  'Q47528', // il radar
  'Q133220', // il sonar
  'Q11658', // il trasformatore
  'Q5325', // l'induttore
  'Q570', // l'altoparlante
  'Q12969754', // la radiazione elettromagnetica: la previde Maxwell, la mostro' Hertz
  'Q81182', // lo zero assoluto
  'Q14674', // la matita
  'Q11425', // l'animazione
  'Q128015', // la ghigliottina: di Antoine Louis, col nome di Guillotin
  'Q15003', // la scala mobile
  'Q163829', // il sintetizzatore
  'Q197536', // l'apprendimento profondo
  'Q229345', // il karaoke
  'Q165800', // il sistema geocentrico: Aristotele, o Tolomeo
  'Q21204', // l'alfabeto fonetico internazionale
  'Q18225', // la vitamina A: a Marguerite Davis senza McCollum
  // "A chi si deve…" non ha senso: una malattia, un posto, un popolo, una misura.
  'Q12156', // la malaria
  'Q8277', // la sclerosi multipla
  'Q42523', // l'atollo
  'Q181264', // la civiltà micenea
  'Q179234', // il Cro-Magnon
  'Q19860', // le lingue indoeuropee
  'Q2111', // la velocità della luce: Rømer la misuro'
  // Troppo difficili, o non da quiz.
  'Q35850', // l'interlingue
  'Q8183', // il fonema
  'Q2545446', // il grafema
  'Q188566', // la difesa siciliana
  'Q69488', // l'MDMA
])

/** Nomi che Wikidata scrive con la maiuscola, e che nelle domande vanno minuscoli: "a chi si deve l'aikido?". */
const CON_LA_MINUSCOLA = new Set(['Q988780', 'Q173412', 'Q43114'])

const Q_SCOPERTE = `SELECT DISTINCT ?q ?voci WHERE {
  ?q wdt:P61 ?chi .
  ?chi wdt:P31 wd:Q5 .
  ?q wikibase:sitelinks ?voci .
}
ORDER BY DESC(?voci)
LIMIT 3000`

/* ───────────────────────────────  Le specie  ─────────────────────────────── */

const ANIMALI = 'Q729'
const PIANTE = 'Q756'

const Q_SPECIE = `SELECT DISTINCT ?q ?voci WHERE {
  ?q wdt:P105 wd:Q7432 ; wdt:P225 ?nome .
  ?q wikibase:sitelinks ?voci .
}
ORDER BY DESC(?voci)
LIMIT 2500`

/* ────────────────────────────────────────────────────────────────────────── */

/** I nomi delle persone di un elenco, e solo delle persone: "Isaac Newton", non "Regno Unito". */
function nomiDi(ids: readonly string[], gente: Map<string, Persona>): string[] {
  return ids.map((id) => gente.get(id)).filter((p): p is Persona => !!p?.umano).map((p) => p.n)
}

/** Un nome comune va minuscolo, come nello schema: "Leone" → "leone", ma "tigre del Bengala" resta com'e'. */
function minuscolo(n: string): string {
  return n.charAt(0).toLocaleLowerCase('it') + n.slice(1)
}

/** Le lettere di una formula che sono simboli: "H₂SO₄" → H, S, O. */
function simboliDi(formula: string): string[] {
  return formula.match(/[A-Z][a-z]?/g) ?? []
}

export async function scienza(): Promise<Omit<DatiScienza, 'versione'>> {
  console.log('Scienza')

  /* ── Gli elementi ── */
  const righeElementi = await interroga('scienza-elementi', Q_ELEMENTI)
  const perNumero = new Map<number, { id: string; s: string }>()
  for (const r of righeElementi) {
    const z = numero(r.z)
    // Un simbolo vero: una maiuscola e al piu' due minuscole (non "Uue", i nomi provvisori, che partono dal 119).
    if (!r.q || !Number.isInteger(z) || z < 1 || z > 118 || !/^[A-Z][a-z]?$/.test(r.simbolo ?? '')) continue
    if (!perNumero.has(z)) perNumero.set(z, { id: r.q, s: r.simbolo! })
  }
  const idElementi = [...perNumero.values()].map((e) => e.id)
  const sElementi = await schede('scienza-elementi-schede', idElementi)
  const scopritoriElementi = await valoriCerti('scienza-elementi-scopritori', idElementi, 'P61')
  const dateElementi = await anni('scienza-elementi-anni', idElementi, ['P575'])

  /* ── I composti ── */
  const simboliElementi = new Set([...perNumero.values()].map((e) => e.s))
  const candidatiComposti = await interroga(
    'scienza-composti',
    `SELECT DISTINCT ?q ?voci WHERE {
  ?q wdt:P274 ?formula .
  ?q wikibase:sitelinks ?voci .
}
ORDER BY DESC(?voci)
LIMIT 1500`,
  )
  const vociComposti = new Map(candidatiComposti.map((r) => [r.q!, numero(r.voci)]))
  const idComposti = [...vociComposti.keys()]
  const sComposti = await schede('scienza-composti-schede', idComposti)
  const vComposti = await valori('scienza-composti-valori', idComposti, ['P31', 'P274'])

  /* ── Le unità ── */
  const idUnita = UNITA.map(([q]) => q)
  const sUnita = await schede('scienza-unita-schede', idUnita)
  const righeSimboli = await aPezzi(
    'scienza-unita-simboli',
    idUnita,
    `SELECT ?q ?simbolo ?lingua WHERE {
  VALUES ?q { #VOCI# }
  ?q wdt:P5061 ?simbolo .
  BIND(LANG(?simbolo) AS ?lingua)
}`,
  )
  const vUnita = await valori('scienza-unita-valori', idUnita, ['P138'])

  /* ── Gli astri ── */
  const righeSatelliti = await interroga('scienza-satelliti', Q_SATELLITI)
  const idAstri = [...PIANETI.map(([q]) => q), ...PIANETI_NANI.map(([q]) => q), ...righeSatelliti.map((r) => r.q!)]
  const sAstri = await schede('scienza-astri-schede', idAstri)
  const scopritoriAstri = await valoriCerti('scienza-astri-scopritori', idAstri, 'P61')
  const dateAstri = await anni('scienza-astri-anni', idAstri, ['P575'])

  /* ── Le scoperte ── */
  const candidatiScoperte = await interroga('scienza-scoperte', Q_SCOPERTE)
  const vociScoperte = new Map(candidatiScoperte.map((r) => [r.q!, numero(r.voci)]))
  const idScoperte = [...vociScoperte.keys()]
  const sScoperte = await schede('scienza-scoperte-schede', idScoperte)
  const conNomeScoperte = idScoperte.filter((id) => nomeItaliano(sScoperte.get(id)))
  const righeNon = await aPezzi(
    'scienza-scoperte-classi',
    conNomeScoperte,
    `SELECT DISTINCT ?q WHERE {
  VALUES ?q { #VOCI# }
  { VALUES ?radice { ${valoriSparql(NON_SCOPERTE)} } ?q wdt:P31/wdt:P279* ?radice . }
  UNION { ?q wdt:P279+ wd:${GRANDEZZA_FISICA} . }
}`,
  )
  const nonScoperte = new Set(righeNon.map((r) => r.q))
  const scopritori = await valoriCerti('scienza-scoperte-chi', conNomeScoperte, 'P61')
  const dateScoperte = await anni('scienza-scoperte-anni', conNomeScoperte, ['P575'])

  /* ── Le specie ── */
  const candidatiSpecie = await interroga('scienza-specie', Q_SPECIE)
  const vociSpecie = new Map(candidatiSpecie.map((r) => [r.q!, numero(r.voci)]))
  const idSpecie = [...vociSpecie.keys()]
  const sSpecie = await schede('scienza-specie-schede', idSpecie)
  const vSpecie = await valori('scienza-specie-valori', idSpecie, ['P225'])
  const righeRegni = await aPezzi(
    'scienza-specie-regni',
    idSpecie,
    `SELECT DISTINCT ?q ?regno WHERE {
  VALUES ?q { #VOCI# }
  VALUES ?regno { wd:${ANIMALI} wd:${PIANTE} }
  ?q wdt:P171+ ?regno .
}`,
  )
  const regnoDi = new Map(righeRegni.map((r) => [r.q!, r.regno!]))
  /*
   * I nomi comuni. Per molte specie l'etichetta italiana e' il nome
   * scientifico — il lupo e' "Canis lupus", con "lupo" fra gli alias — e allora
   * il nome si cerca fra gli alias e i nomi comuni (P1843) in italiano.
   */
  const righeNomi = await aPezzi(
    'scienza-specie-nomi',
    idSpecie,
    // Il prefisso di skos si scrive qui: il servizio di Wikidata lo conosce da sé, QLever no.
    `PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT ?q ?alias ?comune WHERE {
  VALUES ?q { #VOCI# }
  OPTIONAL { ?q skos:altLabel ?alias . FILTER(LANG(?alias) = "it") }
  OPTIONAL { ?q wdt:P1843 ?comune . FILTER(LANG(?comune) = "it") }
}`,
  )
  const altriNomi = new Map<string, Set<string>>()
  for (const r of righeNomi) {
    for (const n of [r.alias, r.comune]) {
      if (r.q && n) altriNomi.set(r.q, (altriNomi.get(r.q) ?? new Set()).add(n.trim()))
    }
  }

  /* ── Le persone di tutte le liste insieme: gli scopritori, e chi ha dato il nome alle unità ── */
  const gente = await persone('scienza-persone', [
    ...new Set([
      ...[...scopritoriElementi.values()].flat(),
      ...[...scopritoriAstri.values()].flat(),
      ...[...scopritori.values()].flat(),
      ...idUnita.flatMap((u) => primi(vUnita, u, 'P138')),
    ]),
  ])

  /* ── Gli elementi, finiti ── */
  const elementi: ElementoQuiz[] = []
  for (const [z, { id, s }] of perNumero) {
    const sc = sElementi.get(id)
    const n = nomeItaliano(sc)
    if (!sc || !n) continue
    const chi = nomiDi(scopritoriElementi.get(id) ?? [], gente)
    // L'anno della scoperta, se e' un anno vero: non l'"antichità" con la precisione del millennio.
    const anno = annoSicuro(dateElementi.get(id)?.get('P575'))
    const g = famiglia(z)
    elementi.push({
      id,
      n: n.toLocaleLowerCase('it'),
      s,
      z,
      ...(g ? { g } : {}),
      ...(chi.length > 0 ? { chi } : {}),
      ...(anno !== undefined && anno >= 1200 && anno <= new Date().getFullYear() ? { anno } : {}),
      ...(sc.voce ? { w: sc.voce } : {}),
      f: 0,
    })
  }
  const famaElementi = perNotorieta(elementi, (e) => sElementi.get(e.id)?.voci ?? 0)
  for (const e of elementi) e.f = famaElementi.get(e.id) ?? 0

  /* ── I composti, finiti ── */
  const perFormula = new Map<string, CompostoQuiz>()
  const ordineComposti = [...idComposti].sort(
    (a, b) => (vociComposti.get(b) ?? 0) - (vociComposti.get(a) ?? 0) || a.localeCompare(b),
  )
  for (const id of ordineComposti) {
    if (primi(vComposti, id, 'P31').includes('Q11344')) continue
    const n = nomeItaliano(sComposti.get(id))
    // Il nome deve essere un nome: "acqua", non "H2O".
    if (!n || !/[a-zà-ù]{3,}/.test(n) || /[0-9₀-₉]/.test(n)) continue
    const formule = [...primi(vComposti, id, 'P274')].sort((a, b) => a.length - b.length || a.localeCompare(b))
    const formula = formule[0]
    if (!formula) continue
    const simboli = simboliDi(formula)
    // Due elementi almeno, tutti veri, e niente cariche: l'ozono e gli ioni non sono composti.
    if (new Set(simboli).size < 2 || !simboli.every((x) => simboliElementi.has(x)) || /[⁺⁻+−]/.test(formula)) continue
    // Una formula, un nome: fra il quarzo e il diossido di silicio resta il piu' noto.
    if (perFormula.has(formula)) continue
    const sc = sComposti.get(id)!
    perFormula.set(formula, { id, n: minuscolo(n), formula, ...(sc.voce ? { w: sc.voce } : {}), f: 0 })
    if (perFormula.size >= COMPOSTI) break
  }
  const composti = [...perFormula.values()]
  const famaComposti = perNotorieta(composti, (c) => vociComposti.get(c.id) ?? 0)
  for (const c of composti) c.f = famaComposti.get(c.id) ?? 0

  /* ── Le unità, finite ── */
  const simboliUnita = new Map<string, string>()
  for (const lingua of ['mul', 'en', 'it', '']) {
    for (const r of righeSimboli) {
      if (r.q && !simboliUnita.has(r.q) && (r.lingua ?? '') === lingua && SIMBOLO.test(r.simbolo ?? '')) {
        simboliUnita.set(r.q, r.simbolo!)
      }
    }
  }
  const unita: UnitaQuiz[] = []
  for (const [id, g] of UNITA) {
    const sc = sUnita.get(id)
    const n = nomeItaliano(sc)
    const s = simboliUnita.get(id)
    if (!sc || !n || !s) continue
    const [da, altro] = nomiDi(primi(vUnita, id, 'P138'), gente)
    unita.push({
      id,
      n: n.toLocaleLowerCase('it'),
      s,
      g,
      // Una persona sola: il nome da' la risposta, e due sarebbero un'altra domanda.
      ...(da && !altro ? { da } : {}),
      ...(sc.voce ? { w: sc.voce } : {}),
      f: 0,
    })
  }
  const famaUnita = perNotorieta(unita, (u) => sUnita.get(u.id)?.voci ?? 0)
  for (const u of unita) u.f = famaUnita.get(u.id) ?? 0

  /* ── Gli astri, finiti ── */
  const nomeAstro = (id: string) => nomeItaliano(sAstri.get(id)) ?? PIANETI_NANI.find(([q]) => q === id)?.[1]
  const scopertaAstro = (id: string) => {
    if (A_OCCHIO_NUDO.has(id) || id === LUNA) return {}
    const chi = nomiDi(scopritoriAstri.get(id) ?? [], gente)
    const anno = annoSicuro(dateAstri.get(id)?.get('P575'))
    return { ...(chi.length > 0 ? { chi } : {}), ...(anno !== undefined && chi.length > 0 ? { anno } : {}) }
  }
  const astri: AstroQuiz[] = []
  for (const [id, ordine] of PIANETI) {
    const n = nomeAstro(id)
    if (n) astri.push({ id, n, tipo: 'pianeta', ordine, ...scopertaAstro(id), ...voce(sAstri.get(id)), f: 0 })
  }
  for (const [id] of PIANETI_NANI) {
    const n = nomeAstro(id)
    if (n) astri.push({ id, n, tipo: 'pianeta nano', ...scopertaAstro(id), ...voce(sAstri.get(id)), f: 0 })
  }
  const satelliti = righeSatelliti
    .filter((r) => r.q && nomeItaliano(sAstri.get(r.q)) && nomeAstro(r.pianeta!))
    .sort((a, b) => numero(b.voci) - numero(a.voci) || a.q!.localeCompare(b.q!))
    .slice(0, SATELLITI)
  for (const r of satelliti) {
    const id = r.q!
    astri.push({
      id,
      n: nomeAstro(id)!,
      tipo: 'satellite',
      di: nomeAstro(r.pianeta!)!,
      ...scopertaAstro(id),
      ...voce(sAstri.get(id)),
      f: 0,
    })
  }
  const famaAstri = perNotorieta(astri, (a) => sAstri.get(a.id)?.voci ?? 0)
  for (const a of astri) a.f = famaAstri.get(a.id) ?? 0

  /* ── Le scoperte, finite ── */
  const buone = conNomeScoperte.filter((id) => {
    if (nonScoperte.has(id) || SCOPERTE_SBAGLIATE.has(id)) return false
    const chi = (scopritori.get(id) ?? []).filter((p) => gente.get(p)?.umano)
    if (chi.length < 1 || chi.length > 2 || chi.length !== (scopritori.get(id) ?? []).length) return false
    // Il nome non deve dire la risposta: chi ha scoperto l'effetto Doppler lo dice il nome.
    const nomi = [nomeItaliano(sScoperte.get(id))!, sScoperte.get(id)?.voce ?? '']
    if (chi.some((p) => cognomeIn(gente.get(p)!.n, nomi))) return false
    const vite = chi.map((p) => ({ na: gente.get(p)?.na, mo: gente.get(p)?.mo }))
    // Due che non sono vissuti insieme sono due storie diverse: il termometro di Erone e quello di Fahrenheit.
    const mortoPrima = (x: (typeof vite)[number], y: (typeof vite)[number]) =>
      x.mo !== undefined && y.na !== undefined && x.mo < y.na
    const [a, b] = vite
    if (b && (mortoPrima(a, b) || mortoPrima(b, a))) return false
    /*
     * Un anno che non torna con la vita di chi l'ha fatta vuol dire dati
     * sbagliati: il computer di Babbage nel 1945, l'automobile di Verbiest nel
     * 1884. Meglio lasciarla fuori.
     */
    const anno = annoSicuro(dateScoperte.get(id)?.get('P575'))
    if (anno === undefined) return true
    return (
      anno <= new Date().getFullYear() &&
      vite.every(({ na, mo }) => (na === undefined || anno > na + 5) && (mo === undefined || anno <= mo + 2))
    )
  })
  const italianaScoperta = (id: string) => (scopritori.get(id) ?? []).some((p) => gente.get(p)?.it)
  const pesoScoperta = (id: string) => conSpinta(vociScoperte.get(id) ?? 0, italianaScoperta(id))
  const sceltaScoperte = titoliUnici(
    buone,
    (id) => nomeItaliano(sScoperte.get(id))!,
    (id) => vociScoperte.get(id) ?? 0,
    () => '',
  )
    .sort((a, b) => pesoScoperta(b) - pesoScoperta(a) || a.localeCompare(b))
    .slice(0, SCOPERTE)
  const famaScoperte = perNotorieta(
    sceltaScoperte.map((id) => ({ id })),
    (x) => pesoScoperta(x.id),
  )
  const scoperte: ScopertaQuiz[] = sceltaScoperte.map((id) => {
    const anno = annoSicuro(dateScoperte.get(id)?.get('P575'))
    const nome = nomeItaliano(sScoperte.get(id))!
    return {
      id,
      n: CON_LA_MINUSCOLA.has(id) ? nome.charAt(0).toLowerCase() + nome.slice(1) : nome,
      chi: nomiDi(scopritori.get(id) ?? [], gente),
      ...(anno !== undefined ? { anno } : {}),
      ...voce(sScoperte.get(id)),
      f: famaScoperte.get(id) ?? 0,
    }
  })

  /* ── Le specie, finite ── */
  const binomio = /^[A-Z][a-z]+ [a-z]+$/
  const scientificoDi = (id: string) => {
    const sci = primi(vSpecie, id, 'P225').filter((x) => binomio.test(x))
    return sci.length === 1 ? sci[0] : undefined
  }
  /**
   * Il nome comune: diverso dal nome scientifico (uguale al genere va bene: il
   * puma e' Puma concolor), minuscolo, di poche parole. L'etichetta se lo e',
   * altrimenti il nome piu' breve fra gli altri: "lupo" prima di "lupo grigio",
   * "gatto" prima di "gatto domestico".
   */
  const nomeComune = (id: string): string | undefined => {
    const sci = scientificoDi(id)
    if (!sci) return undefined
    const buono = (n: string) =>
      titoloNormale(n) !== titoloNormale(sci) &&
      !/^[A-Z][a-z]+ [a-z]/.test(n) &&
      !/[()0-9]/.test(n) &&
      n.split(' ').length <= 4
    const parole = (n: string) => n.split(' ').length
    const etichetta = nomeItaliano(sSpecie.get(id))
    const altri = [...(altriNomi.get(id) ?? [])]
      .map((n) => n.replace(/'/g, '’'))
      .filter(buono)
      .sort((a, b) => parole(a) - parole(b) || a.length - b.length || a.localeCompare(b))
    if (etichetta && buono(etichetta) && (!altri[0] || parole(etichetta) <= parole(altri[0]))) return etichetta
    return altri[0]
  }
  const specieBuone = idSpecie.filter((id) => nomeComune(id))
  const sceltaSpecie = titoliUnici(
    specieBuone,
    (id) => nomeComune(id)!,
    (id) => vociSpecie.get(id) ?? 0,
    () => '',
  )
    .sort((a, b) => (vociSpecie.get(b) ?? 0) - (vociSpecie.get(a) ?? 0) || a.localeCompare(b))
    .slice(0, SPECIE)
  const famaSpecie = perNotorieta(
    sceltaSpecie.map((id) => ({ id })),
    (x) => vociSpecie.get(x.id) ?? 0,
  )
  const specie: SpecieQuiz[] = sceltaSpecie.map((id) => ({
    id,
    n: minuscolo(nomeComune(id)!),
    sci: scientificoDi(id)!,
    regno: regnoDi.get(id) === ANIMALI ? 'animale' : regnoDi.get(id) === PIANTE ? 'pianta' : 'altro',
    ...voce(sSpecie.get(id)),
    f: famaSpecie.get(id) ?? 0,
  }))

  console.log(
    `  ${elementi.length} elementi, ${composti.length} composti, ${unita.length} unità, ${astri.length} astri, ` +
      `${scoperte.length} scoperte, ${specie.length} specie`,
  )
  return {
    elementi: perFama(elementi),
    composti: perFama(composti),
    unita: perFama(unita),
    astri: perFama(astri),
    scoperte: perFama(scoperte),
    specie: perFama(specie),
  }
}

const voce = (s: Scheda | undefined) => (s?.voce ? { w: s.voce } : {})

/**
 * Il cognome di una persona dentro uno dei nomi di una voce, anche all'inizio
 * di una parola: "Isaac Newton" in "leggi di Newton", "Charles Darwin" in
 * "darwinismo", Abraham Maslow nella "Piramide di Maslow".
 */
function cognomeIn(persona: string, nomi: readonly string[]): boolean {
  const parti = titoloNormale(persona).split(' ').filter((p) => p.length > 2)
  const cognome = parti[parti.length - 1]
  return !!cognome && nomi.some((n) => titoloNormale(n).split(' ').some((p) => p.startsWith(cognome)))
}

/**
 * La scienza: gli elementi, i composti, le unità di misura, i corpi del sistema
 * solare, le scoperte e le invenzioni, gli animali con il loro gruppo.
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
  GruppoAnimale,
  ScopertaQuiz,
  SpecieQuiz,
  UnitaQuiz,
} from '../../shared/quiz-cultura'
import { persone, type Persona } from './persone'
import { interroga, letture } from './rete'
import {
  anni,
  annoSicuro,
  aPezzi,
  nomeItaliano,
  notorietaItaliana,
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
 * l'elenco e' quello: tolte quelle che non vanno, e quelle che non sono ne'
 * scoperte ne' invenzioni ne' teorie (`SCOPERTI`, `INVENTATI`, `FORMULATI`).
 * Per allungarlo si rilegge quel che entra.
 */
const SCOPERTE = 130
const SPECIE = 200

/**
 * Quante specie per gruppo, al piu': per notorietà i mammiferi e gli uccelli
 * erano tre su quattro, e "a quale gruppo appartiene?" si indovinava dicendo
 * "mammiferi". Quel che un gruppo non riempie va agli altri.
 */
const SPECIE_PER_GRUPPO: Record<GruppoAnimale, number> = {
  mammiferi: 50,
  uccelli: 40,
  pesci: 30,
  rettili: 20,
  insetti: 25,
  anfibi: 10,
  aracnidi: 8,
  crostacei: 10,
  molluschi: 12,
}

/**
 * Le specie con un nome italiano sbagliato o che non e' un nome: per Wikidata
 * il moscerino della frutta e' "acciughina", e l'iguana "lacerta igvana". E la
 * megalania, che e' estinta da quarantamila anni.
 */
const SPECIE_SBAGLIATE = new Set([
  'Q26842', // acciughina
  'Q756200', // alza
  'Q215376', // lacerta igvana
  'Q27765', // granat
  'Q157609', // vaness dell'ortica
  'Q500869', // acari della scabbia
  'Q1059580', // locuste
  'Q733150', // megalania
  // Le specie umane: "a quale gruppo di animali appartiene l'uomo?" e' una domanda strana, non facile.
  'Q15978631', // uomo
  'Q40171', // neanderthal
  'Q151055', // denisovano
])

/**
 * I nomi che Wikidata sbaglia: un nome di un dialetto ("bisata" per
 * l'anguilla, "capoverde" per il germano reale), uno da manuale
 * ("carcarodonte" per lo squalo bianco), un plurale ("ghiri"), uno straniero
 * ("wisent"). Il nome piu' breve fra quelli di Wikidata e' di solito quello
 * comune, e questi sono i casi in cui non lo e'.
 */
const NOMI_SPECIE: Record<string, string> = {
  Q26387: 'anguilla',
  Q129026: 'squalo bianco',
  Q190469: 'squalo leuca',
  Q25348: 'germano reale',
  Q466194: 'blatta germanica',
  Q147128: 'ghiro',
  Q209067: 'talpa europea',
  Q76280: 'tinca',
  Q82738: 'volpe artica',
  Q81091: 'bisonte europeo',
  Q168903: 'uro',
  Q134747: 'baco da seta',
  Q187036: 'testuggine palustre europea',
  Q131564: 'fennec',
}
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
  // Le cose da mangiare e da bere, i giochi e gli sport, le marche: invenzioni, ma non della scienza.
  'Q2095', // alimento
  'Q40050', // bevanda
  'Q746549', // piatto
  'Q134768', // cocktail
  'Q349', // sport
  'Q11410', // gioco
  'Q11417', // arte marziale
  'Q11422', // giocattolo
  'Q33215', // lingua artificiale
  'Q431289', // marca
  'Q196600', // media franchise
  'Q188504', // medicina alternativa
  // Le voci che sono classi di classi: lo sport e' "tipo di sport", e da lì "sport" non si raggiunge.
  'Q31629', // tipo di sport
  'Q2312410', // disciplina sportiva
  'Q31338769', // medicina alternativa, come classe
  'Q269829', // placebo
  'Q10855061', // reperto archeologico
  'Q841154', // espediente narrativo
  'Q15169167', // metodo di esecuzione
  'Q124078422', // tipo di arma
  'Q1437361', // forma artistica
  'Q3516833', // tecnica di animazione
  'Q11862829', // disciplina accademica
  'Q100912473', // tipo di pregiudizio
  'Q10354783', // pratica
  'Q24238543', // paradigma di sviluppo personale
  'Q121144069', // tipo di metodo statistico
]

/**
 * Le stesse esclusioni per le voci che sono sottoclassi e non istanze: la
 * margarina non e' "un alimento", e' un tipo di alimento, e il napalm un tipo
 * di arma.
 */
const NON_SCOPERTE_SOTTOCLASSI = [
  'Q2095', // alimento
  'Q40050', // bevanda
  'Q746549', // piatto
  'Q349', // sport
  'Q11410', // gioco
  'Q728', // arma
  'Q11460', // indumento
  'Q188504', // medicina alternativa
]

/**
 * Che cosa e' una scoperta, e come si dice che l'ha fatta: una sostanza, una
 * particella, un fenomeno si scoprono; un oggetto, una macchina, un programma,
 * uno strumento, una tecnica si inventano; una teoria e una legge si
 * formulano. Una voce che non e' nessuna delle tre resta fuori: Wikidata da'
 * uno "scopritore" anche al judo, al camembert e al deus ex machina, e
 * scartare quel che non e' una scoperta non bastava, perché molte voci sono
 * classi di classi — "tipo di sport", "tipo di entità chimica" — e da lì le
 * esclusioni non si raggiungevano. Le radici si cercano risalendo l'istanza o
 * la sottoclasse: la dinamite non e' istanza di niente, ma e' un esplosivo.
 * Una teoria vince su tutto, un'invenzione su una scoperta (la bachelite e'
 * una sostanza, ma qualcuno l'ha fatta).
 */
const SCOPERTI = [
  'Q113145171', // tipo di entità chimica
  'Q47154513', // classe di composti chimici
  'Q119896085', // tipo di polimero
  'Q79529', // sostanza chimica
  'Q11173', // composto chimico
  'Q22675015', // tipo di particella subatomica
  'Q1293220', // fenomeno fisico
  'Q751989', // fenomeno astronomico
  'Q11386', // onda elettromagnetica
  'Q12969754', // radiazione elettromagnetica
  'Q104934', // interazione fondamentale
  'Q17444909', // tipo di oggetto astronomico
  'Q5058355', // componente cellulare
  'Q84467700', // gruppo o classe di proteine
  'Q13582682', // classificazione: i gruppi sanguigni
]
const INVENTATI = [
  'Q12579633', // invenzione
  'Q11016', // tecnologia
  'Q110295396', // tipo di strumento musicale
  'Q34379', // strumento musicale
  'Q7397', // software
  'Q17155032', // tipo di software
  'Q1183543', // apparecchiatura
  'Q11019', // macchina
  'Q123035442', // tipo di oggetto fisico in base all'uso
  'Q140424281', // tipo di dispositivo
  'Q123588392', // tipo di attrezzo
  'Q12492106', // componente elettronico attivo
  'Q6867168', // dispositivo passivo
  'Q57583712', // elettrodomestico da cucina
  'Q12870', // esplosivo
  'Q11474', // materie plastiche
  'Q15836568', // protocollo di rete
  'Q132364', // protocollo di comunicazione
  'Q317623', // norma tecnica
  'Q1668024', // servizio di internet
  'Q1439691', // tecnica fotografica
  'Q214753', // datazione radiometrica
  'Q1595418', // rimedio: il vaccino
  'Q1936384', // branca della matematica: il calcolo infinitesimale
  'Q47279819', // tipo di funzione matematica: il logaritmo
  'Q732744', // classificazione chimica: la tavola periodica
]
const FORMULATI = [
  'Q17737', // teoria
  'Q3239681', // teoria scientifica
  'Q408891', // legge scientifica
  'Q214070', // legge fisica
  'Q36382', // leggi fondamentali ponderali
  'Q33104303', // concetto della fisica: l'equivalenza fra massa ed energia
]

/**
 * Le radici che si cercano anche risalendo le sottoclassi, perché molte
 * invenzioni sono classi: il barometro e' un tipo di strumento di misura, non
 * un'istanza di qualcosa. Per le altre radici la strada delle sottoclassi porta
 * troppo in alto: dal "fenomeno fisico" ci si arriva dalla pallavolo, dalla
 * "sostanza chimica" dalla margarina.
 */
const PER_SOTTOCLASSE = new Set([
  'Q12969754', // radiazione elettromagnetica
  'Q104934', // interazione fondamentale
  'Q12579633', // invenzione
  'Q34379', // strumento musicale
  'Q7397', // software
  'Q1183543', // apparecchiatura
  'Q11019', // macchina
  'Q12492106', // componente elettronico attivo
  'Q6867168', // dispositivo passivo
  'Q12870', // esplosivo
  'Q11474', // materie plastiche
])

/** Le voci che Wikidata mette nella famiglia sbagliata: la radiazione infrarossa per lei e' una teoria. */
const VERBI_A_MANO: Record<string, 'i' | 'f' | 's'> = {
  Q11388: 's', // la radiazione infrarossa, che Herschel ha scoperto
  Q190009: 's', // la nutazione, che Bradley ha osservato
  Q73: 'i', // l'Internet Relay Chat, che e' un protocollo
}

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
  'Q507', // il googol
  'Q304726', // la stanza cinese: un esperimento mentale
  'Q188215', // lo gnomo: a Paracelso, come nome
  'Q131303', // "Hello, world!": un esempio, non un'invenzione
  'Q178263', // la generazione spontanea: ad Anassimandro, per una teoria antica
  'Q221513', // la teoria kurganica: un'ipotesi dell'archeologia
  'Q525642', // la sindrome da delezione 22q11
  'Q190557', // la regola di de l'Hôpital: a Johann Bernoulli, ed e' la sua storia, non la domanda
  'Q182667', // il principio di Pareto: a Juran, che gli diede il nome di Pareto
  // I farmaci di sintesi: chi li ha fatti non lo sa nessuno, e "scoperto" non e' il verbo.
  'Q407541', // il fentanyl
  'Q407535', // l'ossicodone
  'Q203174', // la talidomide
  'Q186969', // l'ibuprofene
  'Q422244', // la fluoxetina
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

const Q_SPECIE = `SELECT DISTINCT ?q ?voci WHERE {
  ?q wdt:P105 wd:Q7432 ; wdt:P225 ?nome ; wdt:P171+ wd:${ANIMALI} .
  ?q wikibase:sitelinks ?voci .
}
ORDER BY DESC(?voci)
LIMIT 2500`

/**
 * I gruppi degli animali, con le voci di Wikidata da cui discendono, in ordine:
 * per Wikidata gli uccelli sono rettili (discendono dai dinosauri) e gli
 * insetti crostacei, e vince il primo gruppo che torna. I pesci non sono una
 * voce sola: le ossa e le cartilagini.
 */
const GRUPPI: ReadonlyArray<readonly [GruppoAnimale, readonly string[]]> = [
  ['mammiferi', ['Q7377']],
  ['uccelli', ['Q5113']],
  ['rettili', ['Q10811']],
  ['anfibi', ['Q10908']],
  ['pesci', ['Q127282', 'Q25371']],
  ['insetti', ['Q1390']],
  ['aracnidi', ['Q1358']],
  ['crostacei', ['Q25364']],
  ['molluschi', ['Q25326']],
]

/* ────────────────────────────────────────────────────────────────────────── */

/** I nomi delle persone di un elenco, e solo delle persone: "Isaac Newton", non "Regno Unito". */
function nomiDi(ids: readonly string[], gente: Map<string, Persona>): string[] {
  return ids.map((id) => gente.get(id)).filter((p): p is Persona => !!p?.umano).map((p) => p.n)
}

/** Un nome comune va minuscolo, come nello schema: "Leone" → "leone", ma "tigre del Bengala" resta com'e'. */
function minuscolo(n: string): string {
  return n.charAt(0).toLocaleLowerCase('it') + n.slice(1)
}

/**
 * Il nome di una specie, minuscolo come si scrive: "rana pescatrice", "diavolo
 * tasmaniano". Wikidata scrive spesso la maiuscola anche agli aggettivi; resta
 * solo ai nomi propri, che vengono dopo una preposizione: "drago di Komodo".
 */
function nomeDiSpecie(n: string): string {
  const parole = minuscolo(n).split(' ')
  return parole
    .map((p, i) =>
      i > 0 && !/^(?:di|del|della|dello|dei|degli|delle|d’)$/.test(parole[i - 1]) ? p.toLocaleLowerCase('it') : p,
    )
    .join(' ')
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
  const righeNonSottoclassi = await aPezzi(
    'scienza-scoperte-sottoclassi',
    conNomeScoperte,
    `SELECT DISTINCT ?q WHERE {
  VALUES ?q { #VOCI# }
  VALUES ?radice { ${valoriSparql(NON_SCOPERTE_SOTTOCLASSI)} }
  ?q wdt:P279+ ?radice .
}`,
  )
  const nonScoperte = new Set([...righeNon, ...righeNonSottoclassi].map((r) => r.q))
  const scopritori = await valoriCerti('scienza-scoperte-chi', conNomeScoperte, 'P61')
  // L'anno della scoperta (P575), quello in cui la cosa e' nata (P571), che per un'invenzione e' lo stesso, o la
  // pubblicazione (P577), che per una teoria e' quando l'ha detta.
  const dateScoperte = await anni('scienza-scoperte-anni-3', conNomeScoperte, ['P575', 'P571', 'P577'])
  // Una query per famiglia e per strada: tutte insieme, con le unioni, non le regge nessuno dei due motori.
  const verbi = new Map<string, Set<string>>()
  const famiglie = [
    ['s', SCOPERTI],
    ['i', INVENTATI],
    ['f', FORMULATI],
  ] as const
  for (const [v, tutte] of famiglie) {
    for (const [via, strada, radici] of [
      ['istanza', 'wdt:P31/wdt:P279*', tutte],
      ['classe', 'wdt:P279+', tutte.filter((q) => PER_SOTTOCLASSE.has(q))],
    ] as const) {
      if (radici.length === 0) continue
      const righe = await aPezzi(
        `scienza-scoperte-${v}-${via}`,
        conNomeScoperte,
        `SELECT DISTINCT ?q WHERE {
  VALUES ?q { #VOCI# }
  VALUES ?radice { ${valoriSparql(radici)} }
  ?q ${strada} ?radice .
}`,
      )
      for (const r of righe) if (r.q) verbi.set(r.q, (verbi.get(r.q) ?? new Set()).add(v))
    }
  }
  /** Come si dice che l'ha fatta: null se non e' una scoperta, ne' un'invenzione, ne' una teoria. */
  const verbo = (id: string): 'i' | 'f' | 's' | null => {
    if (VERBI_A_MANO[id]) return VERBI_A_MANO[id]
    const v = verbi.get(id)
    return v?.has('f') ? 'f' : v?.has('i') ? 'i' : v?.has('s') ? 's' : null
  }
  const annoScoperta = (id: string) =>
    annoSicuro(dateScoperte.get(id)?.get('P575')) ??
    annoSicuro(dateScoperte.get(id)?.get('P571')) ??
    annoSicuro(dateScoperte.get(id)?.get('P577'))

  /* ── Le specie ── */
  const candidatiSpecie = await interroga('scienza-specie', Q_SPECIE)
  const vociSpecie = new Map(candidatiSpecie.map((r) => [r.q!, numero(r.voci)]))
  const idSpecie = [...vociSpecie.keys()]
  const sSpecie = await schede('scienza-specie-schede', idSpecie)
  const vSpecie = await valori('scienza-specie-valori', idSpecie, ['P225'])
  const righeGruppi = await aPezzi(
    'scienza-specie-gruppi',
    idSpecie,
    `SELECT DISTINCT ?q ?radice WHERE {
  VALUES ?q { #VOCI# }
  VALUES ?radice { ${valoriSparql(GRUPPI.flatMap(([, radici]) => radici))} }
  ?q wdt:P171+ ?radice .
}`,
  )
  const radiciDi = new Map<string, Set<string>>()
  for (const r of righeGruppi) if (r.q && r.radice) radiciDi.set(r.q, (radiciDi.get(r.q) ?? new Set()).add(r.radice))
  const gruppoDi = (id: string) => GRUPPI.find(([, radici]) => radici.some((x) => radiciDi.get(id)?.has(x)))?.[0]
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

  /* ── Quanto e' nota ogni voce, con le letture di tutte le liste insieme ── */
  const tutte = [sElementi, sComposti, sUnita, sAstri, sScoperte, sSpecie].flatMap((m) => [...m.values()])
  const lette = await letture(tutte.map((sc) => sc.voce).filter((t): t is string => !!t))
  const nota = (sc: Scheda | undefined) => notorietaItaliana(sc?.voci ?? 0, lette.get(sc?.voce ?? '') ?? 0)

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
  const famaElementi = perNotorieta(elementi, (e) => nota(sElementi.get(e.id)))
  for (const e of elementi) e.f = famaElementi.get(e.id) ?? 0

  /* ── I composti, finiti ── */
  const perFormula = new Map<string, CompostoQuiz>()
  const ordineComposti = [...idComposti].sort(
    (a, b) => nota(sComposti.get(b)) - nota(sComposti.get(a)) || a.localeCompare(b),
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
  const famaComposti = perNotorieta(composti, (c) => nota(sComposti.get(c.id)))
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
  const famaUnita = perNotorieta(unita, (u) => nota(sUnita.get(u.id)))
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
  const famaAstri = perNotorieta(astri, (a) => nota(sAstri.get(a.id)))
  for (const a of astri) a.f = famaAstri.get(a.id) ?? 0

  /* ── Le scoperte, finite ── */
  const buone = conNomeScoperte.filter((id) => {
    if (nonScoperte.has(id) || SCOPERTE_SBAGLIATE.has(id) || verbo(id) === null) return false
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
    const anno = annoScoperta(id)
    if (anno === undefined) return true
    return (
      anno <= new Date().getFullYear() &&
      vite.every(({ na, mo }) => (na === undefined || anno > na + 5) && (mo === undefined || anno <= mo + 2))
    )
  })
  const pesoScoperta = (id: string) => nota(sScoperte.get(id))
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
  // Quanto e' noto chi l'ha fatta: le Wikipedia che ne parlano, fra gli scopritori delle scoperte tenute.
  const umani = (id: string) => (scopritori.get(id) ?? []).filter((p) => gente.get(p)?.umano)
  const famaScopritori = perNotorieta(
    [...new Set(sceltaScoperte.flatMap(umani))].map((id) => ({ id })),
    (x) => gente.get(x.id)?.voci ?? 0,
  )
  const scoperte: ScopertaQuiz[] = sceltaScoperte.map((id) => {
    const anno = annoScoperta(id)
    const nome = nomeItaliano(sScoperte.get(id))!
    const v = verbo(id)
    return {
      id,
      n: CON_LA_MINUSCOLA.has(id) ? nome.charAt(0).toLowerCase() + nome.slice(1) : nome,
      chi: nomiDi(scopritori.get(id) ?? [], gente),
      ...(anno !== undefined ? { anno } : {}),
      ...(v === 'i' || v === 'f' ? { v } : {}),
      ...voce(sScoperte.get(id)),
      f: famaScoperte.get(id) ?? 0,
      // Nello stesso ordine di `chi`: nomiDi tiene le persone, e le scoperte buone hanno solo quelle.
      cf: umani(id).map((p) => famaScopritori.get(p) ?? 0),
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
    if (NOMI_SPECIE[id]) return NOMI_SPECIE[id]
    // Niente abbreviazioni ("p. uncia", "t.graeca") ne' famiglie ("ailuridi"), che non sono il nome di un animale;
    // e niente nomi latini scritti male ("macroclemys", "helix pomata"): le lettere che l'italiano non ha, e le
    // desinenze del latino, prima di una preposizione (dopo viene un nome proprio: "drago di Komodo").
    // Il koala e il kiwi si chiamano così anche in italiano: le lettere straniere contano solo in un nome lungo, o di
    // due parole, come i binomi.
    const latino = (n: string) => {
      const prima = n.toLowerCase().split(/ (?:di|del|della|dello|dei|degli|delle|d’) /)[0]
      const straniero = /[ykwxj]/.test(prima) && (prima.includes(' ') || prima.length > 7)
      return straniero || /(?:ensis|us|um|ae|ii|ida|idae)\b/.test(prima)
    }
    const buono = (n: string) =>
      titoloNormale(n) !== titoloNormale(sci) &&
      !/^[A-Z][a-z]+ [a-z]/.test(n) &&
      !/[().0-9]/.test(n) &&
      !/(?:idae|idi)$/.test(n) &&
      !latino(n) &&
      n.split(' ').length <= 4
    const parole = (n: string) => n.split(' ').length
    // Fra due nomi lunghi uguali, il singolare: "struzzo" prima di "struzzi".
    const plurale = (n: string) => (/i$/.test(n) ? 1 : 0)
    const etichetta = nomeItaliano(sSpecie.get(id))
    const altri = [...(altriNomi.get(id) ?? [])]
      .map((n) => n.replace(/'/g, '’'))
      .filter(buono)
      .sort((a, b) => parole(a) - parole(b) || plurale(a) - plurale(b) || a.length - b.length || a.localeCompare(b))
    if (etichetta && buono(etichetta) && (!altri[0] || parole(etichetta) <= parole(altri[0]))) return etichetta
    return altri[0]
  }
  const specieBuone = idSpecie.filter((id) => !SPECIE_SBAGLIATE.has(id) && nomeComune(id) && gruppoDi(id))
  const perNota = titoliUnici(
    specieBuone,
    (id) => nomeComune(id)!,
    (id) => vociSpecie.get(id) ?? 0,
    () => '',
  ).sort((a, b) => nota(sSpecie.get(b)) - nota(sSpecie.get(a)) || a.localeCompare(b))
  // Le piu' note di ogni gruppo fino alla sua quota; poi, se ne mancano, le piu' note che restano.
  const quante = new Map<GruppoAnimale, number>()
  const sceltaSpecie: string[] = []
  for (const id of perNota) {
    const g = gruppoDi(id)!
    if ((quante.get(g) ?? 0) >= SPECIE_PER_GRUPPO[g]) continue
    quante.set(g, (quante.get(g) ?? 0) + 1)
    sceltaSpecie.push(id)
  }
  for (const id of perNota) {
    if (sceltaSpecie.length >= SPECIE) break
    if (!sceltaSpecie.includes(id)) sceltaSpecie.push(id)
  }
  sceltaSpecie.splice(SPECIE)
  const famaSpecie = perNotorieta(
    sceltaSpecie.map((id) => ({ id })),
    (x) => nota(sSpecie.get(x.id)),
  )
  const specie: SpecieQuiz[] = sceltaSpecie.map((id) => ({
    id,
    n: nomeDiSpecie(nomeComune(id)!),
    gr: gruppoDi(id)!,
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

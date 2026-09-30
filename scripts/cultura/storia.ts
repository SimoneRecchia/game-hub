/**
 * La storia: i fatti piu' noti con il loro anno — battaglie, guerre, assedi,
 * trattati, rivoluzioni, rivolte, assassini, disastri e gli altri grandi fatti
 * che Wikidata dice tali.
 *
 * Un fatto entra per la sua classe, o una sottoclasse: la battaglia navale di
 * Lepanto e' una battaglia, l'eruzione pliniana del Vesuvio un'eruzione. Il tipo
 * serve alla frase della domanda, e fra piu' classi vale la prima della tabella:
 * lo sbarco in Normandia e' una battaglia prima che un'operazione militare, la
 * seconda guerra mondiale una guerra e non un "periodo storico". Restano fuori
 * le guerre del mito (la guerra di Troia e' una "guerra mitologica"), la
 * finzione, lo sport, le elezioni, e la cronaca nera: una sparatoria non e' un
 * fatto della storia da quiz.
 *
 * L'anno e' quello d'inizio, o del fatto: prima dell'era volgare negativo — le
 * Termopili sono il -480. Un fatto e' della storia d'Italia se e' successo in
 * Italia, o se l'Italia (o uno stato italiano di prima dell'Unità) c'era.
 */

import type { DatiStoria, EventoQuiz, TipoEvento } from '../../shared/quiz-cultura'
import { ITALIA } from './persone'
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
  titoloItaliano,
  valori,
  valoriSparql,
} from './wikidata'

const EVENTI = 900
const CANDIDATI = 5000

/**
 * Le classi dei fatti, con il loro tipo, nell'ordine in cui si sceglie il tipo.
 * Le stragi vengono prima dei disastri — per Wikidata un genocidio e' anche un
 * disastro, e l'Olocausto non lo e' — e le guerre prima delle operazioni
 * militari. Dei naufragi si prendono i fatti e non le navi: per Wikidata anche
 * il Titanic stesso e' un "naufragio", e la sua data e' quella del varo.
 */
const CLASSI: Array<[string, TipoEvento]> = [
  ['Q188055', 'assedio'],
  ['Q178561', 'battaglia'],
  ['Q10931', 'rivoluzione'],
  ['Q3882219', 'assassinio'], // magnicidio
  ['Q1139665', 'assassinio'], // omicidio politico
  ['Q124734', 'rivolta'], // ribellione
  ['Q6107280', 'rivolta'],
  ['Q1323212', 'rivolta'], // insurrezione
  ['Q13427116', 'rivolta'], // rivolta contadina
  ['Q511866', 'rivolta'], // ammutinamento
  ['Q131569', 'trattato'],
  ['Q625298', 'trattato'], // trattato di pace
  ['Q107706', 'trattato'], // armistizio
  ['Q7157512', 'trattato'], // conferenza di pace
  ['Q41397', 'altro'], // genocidio
  ['Q3199915', 'altro'], // massacro
  ['Q750215', 'altro'], // strage
  ['Q177716', 'altro'], // pogrom
  ['Q2223653', 'altro'], // attentato terroristico
  ['Q88178910', 'altro'], // tentato magnicidio
  ['Q45382', 'altro'], // colpo di Stato
  ['Q4688003', 'altro'], // bombardamento aereo di una città: Hiroshima e Nagasaki
  ['Q198', 'guerra'],
  ['Q104212151', 'guerra'], // serie di guerre
  ['Q645883', 'altro'], // operazione militare
  ['Q467011', 'altro'], // invasione
  ['Q831663', 'altro'], // campagna militare
  ['Q1361229', 'altro'], // conquista
  ['Q7944', 'disastro'], // terremoto
  ['Q7692360', 'disastro'], // eruzione vulcanica
  ['Q2620513', 'disastro'], // disastro marittimo
  ['Q30880545', 'disastro'], // affondamento
  ['Q852190', 'disastro'], // naufragio: per Wikidata anche il relitto, e la nave resta fuori come nave
  ['Q12184', 'disastro'], // pandemia
  ['Q44512', 'disastro'], // epidemia
  ['Q3241045', 'disastro'], // epidemia di malattia
  ['Q168247', 'disastro'], // carestia
  ['Q3839081', 'disastro'],
  ['Q12772819', 'scoperta'],
  ['Q51645', 'altro'], // concilio ecumenico
  // Il conflitto armato e' largo: dentro ci sono anche gli assalti, e la presa della Bastiglia non e' una guerra.
  ['Q350604', 'altro'],
  ['Q18603729', 'altro'], // dissoluzione di uno stato: la caduta dell'Impero romano d'Occidente
  ['Q13418847', 'altro'], // evento storico
]

/**
 * Il tipo che dice il nome, quando comincia con la parola giusta: vale piu'
 * della classe. La guerra del Pacifico per Wikidata e' un teatro di guerra, la
 * guerra russo-turca del 1877 un conflitto armato, la battaglia di Normandia
 * un'operazione militare.
 */
const TIPI_DAL_NOME: Array<[RegExp, TipoEvento]> = [
  [/^(?:(?:prima|seconda|terza|quarta|quinta|sesta|settima|ottava|nona) )?guerr[ae] /i, 'guerra'],
  [/^battaglia /i, 'battaglia'],
  [/^assedio /i, 'assedio'],
  [/^(?:trattato|pace) /i, 'trattato'],
  [/^rivoluzione /i, 'rivoluzione'],
  [/^(?:rivolta|insurrezione|moti) /i, 'rivolta'],
]

/**
 * Le classi che tolgono un fatto dall'elenco anche se ne ha una buona: il mito,
 * la finzione, lo sport, le elezioni, la televisione, la cronaca nera, e le
 * cose che non sono fatti — una nave, una malattia.
 */
const ESCLUSE = [
  'Q24336068', // guerra mitologica
  'Q14897293', // entità immaginaria
  'Q2239243', // entità mitologica
  'Q13406554', // competizione sportiva
  'Q40231', // elezione
  'Q5398426', // serie televisiva
  'Q1259759', // miniserie televisiva
  'Q11424', // film
  'Q7889', // videogioco
  'Q17633526', // articolo di Wikinotizie
  'Q21480300', // sparatoria di massa
  'Q473853', // sparatoria scolastica
  'Q3307578', // omicidio-suicidio
  'Q1371150', // presa di ostaggi
  'Q11446', // nave
  'Q42889', // veicolo
  'Q12136', // malattia
]

/**
 * Da quale data si prende l'anno, per tipo. Un trattato e' l'anno della firma
 * (P585, o la data di fondazione) e non quello dell'entrata in vigore: la pace
 * di Versailles e' del 1919 anche se vale dal 1920. Una guerra e' l'anno in cui
 * comincia: per Wikidata la prima guerra mondiale ha anche un "momento", l'11
 * novembre 1918.
 */
const DATE: Record<TipoEvento, string[]> = {
  trattato: ['P585', 'P571', 'P580'],
  assassinio: ['P585', 'P580'],
  scoperta: ['P585', 'P580', 'P571'],
  battaglia: ['P580', 'P585'],
  assedio: ['P580', 'P585'],
  guerra: ['P580', 'P585'],
  rivoluzione: ['P580', 'P585'],
  rivolta: ['P580', 'P585'],
  disastro: ['P580', 'P585'],
  altro: ['P580', 'P585', 'P571'],
}

/**
 * I tipi di fatti che stanno in un posto: di questi, senza un luogo si scrive il
 * paese. Per le guerre il paese di Wikidata e' spesso uno a caso — la seconda
 * guerra mondiale risultava in Giappone.
 */
const IN_UN_POSTO = new Set<TipoEvento>([
  'battaglia',
  'assedio',
  'assassinio',
  'trattato',
  'rivolta',
  'disastro',
  'scoperta',
])

/** I fatti degli ultimi due anni non sono ancora storia: le voci cambiano ogni settimana. */
const ANNI_DI_CRONACA = 2

/**
 * Gli stati italiani: un fatto a cui hanno partecipato e' della storia d'Italia.
 * Anche Roma antica, che nelle scuole italiane e' storia d'Italia. Gli
 * identificativi sono verificati sulle etichette di Wikidata.
 */
const STATI_ITALIANI: string[] = [
  'Q172579', // Regno d'Italia
  'Q223936', // Regno d'Italia (napoleonico)
  'Q1098499', // Regno d'Italia
  'Q838931', // Regno d'Italia
  'Q153660', // Repubblica Sociale Italiana
  'Q180393', // Regno delle Due Sicilie
  'Q173065', // Regno di Napoli
  'Q188586', // Regno di Sicilia
  'Q165154', // Regno di Sardegna
  'Q426025', // Ducato di Savoia
  'Q153529', // Ducato di Milano
  'Q148540', // Repubblica di Firenze
  'Q154849', // Granducato di Toscana
  'Q4948', // Repubblica di Venezia
  'Q174306', // Repubblica di Genova
  'Q170174', // Stato Pontificio
  'Q736727', // Repubblica di Siena
  'Q1235720', // Repubblica di Lucca
  'Q1365493', // Repubblica di Pisa
  'Q165040', // Ducato di Parma e Piacenza
  'Q766501', // Ducato di Mantova
  'Q693570', // Ducato di Ferrara
  'Q252580', // Ducato di Modena e Reggio
  'Q649202', // Ducato di Urbino
  'Q10985042', // Marchesato del Monferrato
  'Q213353', // Repubblica Cisalpina
  'Q723118', // Repubblica Italiana (1802-1805)
  'Q209857', // Regno Lombardo-Veneto
  'Q2037576', // Repubblica di San Marco
  'Q854415', // Regno longobardo
  'Q583038', // Regno ostrogoto
  'Q1747689', // antica Roma
  'Q17167', // Repubblica romana
  'Q2277', // Impero romano
  'Q42834', // Impero romano d'Occidente
]

const Q_CANDIDATI = `SELECT DISTINCT ?q ?voci WHERE {
  VALUES ?radice { ${valoriSparql(CLASSI.map(([q]) => q))} }
  ?q wdt:P31/wdt:P279* ?radice .
  ?q wdt:P585|wdt:P580 ?data .
  ?q wikibase:sitelinks ?voci .
}
ORDER BY DESC(?voci)
LIMIT ${CANDIDATI}`

export async function storia(): Promise<Omit<DatiStoria, 'versione'>> {
  console.log('Storia')
  const candidati = await interroga('storia-candidati', Q_CANDIDATI)
  const voci = new Map(candidati.map((r) => [r.q!, numero(r.voci)]))
  const ids = [...voci.keys()]
  const s = await schede('storia-schede', ids)
  const conNome = ids.filter((id) => titoloItaliano(s.get(id)))

  /* La classe: il tipo dalla prima classe della tabella a cui il fatto appartiene, e le esclusioni. */
  const righeClassi = await aPezzi(
    'storia-classi',
    conNome,
    `SELECT DISTINCT ?q ?radice WHERE {
  VALUES ?q { #VOCI# }
  VALUES ?radice { ${valoriSparql([...CLASSI.map(([q]) => q), ...ESCLUSE])} }
  ?q wdt:P31/wdt:P279* ?radice .
}`,
  )
  const radici = new Map<string, Set<string>>()
  for (const r of righeClassi) {
    if (!r.q || !r.radice) continue
    radici.set(r.q, (radici.get(r.q) ?? new Set()).add(r.radice))
  }
  const tipoDi = (id: string) => {
    const perClasse = CLASSI.find(([q]) => radici.get(id)?.has(q))?.[1]
    const nome = titoloItaliano(s.get(id)) ?? ''
    return perClasse && (TIPI_DAL_NOME.find(([re]) => re.test(nome))?.[1] ?? perClasse)
  }
  const buoni = conNome.filter((id) => tipoDi(id) && !ESCLUSE.some((q) => radici.get(id)?.has(q)))

  const v = await valori('storia-valori', buoni, ['P276', 'P17', 'P361', 'P710'])
  const date = await anni('storia-anni', buoni, ['P585', 'P580', 'P582', 'P571'])
  const annoDi = (id: string) =>
    DATE[tipoDi(id)!].map((p) => annoSicuro(date.get(id)?.get(p))).find((a) => a !== undefined)
  // Niente fatti del futuro, e niente cronaca: gli ultimi due anni non sono ancora storia.
  const ultimo = new Date().getFullYear() - ANNI_DI_CRONACA
  const conAnno = buoni.filter((id) => {
    const a = annoDi(id)
    return a !== undefined && a <= ultimo
  })

  /* Dove, e se e' storia d'Italia: i paesi dei luoghi. */
  const luoghi = [...new Set(conAnno.flatMap((id) => primi(v, id, 'P276')))]
  const paesiLuoghi = await valori('storia-luoghi-paesi', luoghi, ['P17'])
  const italiani = new Set([ITALIA, ...STATI_ITALIANI])
  const italiano = (id: string) =>
    primi(v, id, 'P17').some((p) => italiani.has(p)) ||
    primi(v, id, 'P276').some((l) => primi(paesiLuoghi, l, 'P17').includes(ITALIA)) ||
    primi(v, id, 'P710').some((p) => italiani.has(p))
  const peso = (id: string) => conSpinta(voci.get(id) ?? 0, italiano(id))
  const unici = titoliUnici(conAnno, (id) => titoloItaliano(s.get(id))!, (id) => voci.get(id) ?? 0, () => '')
  const scelti = unici.sort((a, b) => peso(b) - peso(a) || a.localeCompare(b)).slice(0, EVENTI)
  console.log(
    `  ${ids.length} candidati, ${conNome.length} con il nome in italiano, ${buoni.length} della storia, ` +
      `${conAnno.length} con l'anno, ${unici.length} con un nome solo, ${scelti.length} tenuti`,
  )

  const contorno = await schede('storia-contorno', [
    ...new Set(scelti.flatMap((id) => ['P276', 'P17', 'P361'].flatMap((p) => primi(v, id, p)))),
  ])

  /** Un valore solo, o fra piu' valori il piu' noto: "guerre napoleoniche" piu' che "Cento giorni". */
  const unoSolo = (elenco: readonly string[], piuNoto: boolean) => {
    const conNomi = elenco.filter((x) => nomeItaliano(contorno.get(x)))
    if (conNomi.length === 1) return nomeItaliano(contorno.get(conNomi[0]))
    if (conNomi.length === 0 || !piuNoto) return undefined
    const [primo] = [...conNomi].sort(
      (a, b) => (contorno.get(b)?.voci ?? 0) - (contorno.get(a)?.voci ?? 0) || a.localeCompare(b),
    )
    return nomeItaliano(contorno.get(primo))
  }

  const fama = perNotorieta(
    scelti.map((id) => ({ id })),
    (x) => peso(x.id),
  )
  const eventi: EventoQuiz[] = scelti.map((id) => {
    const tipo = tipoDi(id)!
    const anno = annoDi(id)!
    // La fine di un trattato e' quando smette di valere, non la fine del fatto: non si scrive.
    const fine = tipo === 'trattato' ? undefined : annoSicuro(date.get(id)?.get('P582'), { ultimo: true })
    // Il luogo: uno solo; per i fatti che stanno in un posto, se manca, il paese se e' uno solo.
    const luogo =
      unoSolo(primi(v, id, 'P276'), false) ?? (IN_UN_POSTO.has(tipo) ? unoSolo(primi(v, id, 'P17'), false) : undefined)
    const parte = unoSolo(primi(v, id, 'P361'), true)
    const sc = s.get(id)!
    return {
      id,
      n: titoloItaliano(sc)!,
      anno,
      ...(fine !== undefined && fine > anno ? { fine } : {}),
      tipo,
      ...(luogo ? { luogo } : {}),
      ...(parte ? { parte } : {}),
      ...(italiano(id) ? { it: 1 as const } : {}),
      ...(sc.voce ? { w: sc.voce } : {}),
      f: fama.get(id) ?? 0,
    }
  })
  return { eventi: perFama(eventi) }
}

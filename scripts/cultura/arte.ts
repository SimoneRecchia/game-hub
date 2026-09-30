/**
 * L'arte: i quadri piu' noti con la loro immagine, chi li ha dipinti, le
 * correnti.
 *
 * Un quadro entra se Wikidata ne conosce il pittore — una persona, non una
 * bottega o un "anonimo" — e se ha un'immagine che si puo' mostrare senza
 * attribuzioni: di pubblico dominio o CC0, JPEG o PNG, larga almeno 960 punti
 * (le miniature di Commons si fanno solo a misure fisse, e la piu' grande che
 * chiede il quiz e' 960). Oltre ai dipinti, gli affreschi, i murali, i soffitti
 * e i gruppi di dipinti: l'Ultima Cena e' un "dipinto murale", la Creazione di
 * Adamo un affresco e l'Urlo un gruppo di quattro versioni.
 *
 * I titoli devono dire un quadro solo: "Annunciazione" ne dice decine. Fra i
 * quadri con lo stesso titolo resta il piu' noto se lo e' molto piu' degli altri
 * (una volta e mezzo le Wikipedia del secondo: il Bacio di Klimt, non quello di
 * Hayez), altrimenti nessuno. Le versioni di uno stesso quadro dello stesso
 * pittore sono un quadro solo.
 */

import { createHash } from 'node:crypto'
import {
  PERCORSO_IMMAGINE,
  type DatiArte,
  type ImmagineQuiz,
  type QuadroQuiz,
  type VoceQuiz,
} from '../../shared/quiz-cultura'
import { cittaDi } from './luoghi'
import { elencoPersone, persone } from './persone'
import { infoFile, interroga, introduzioni, type InfoFile } from './rete'
import {
  anni,
  annoSicuro,
  aPezzi,
  conSpinta,
  maiuscolaIniziale,
  nomeItaliano,
  nonDeprecata,
  numero,
  perFama,
  perNotorieta,
  primi,
  schede,
  titoliUnici,
  titoloItaliano,
  titoloNormale,
  valori,
  valoriCerti,
  valoriSparql,
  type Scheda,
} from './wikidata'

/** Quanti quadri tenere, e fra quanti candidati sceglierli. */
const QUADRI = 700
const CANDIDATI = 3000

/** Le classi dei quadri: dipinto, affresco (due voci), dipinto murale, murale, soffitto, ciclo, gruppo di dipinti... */
const CLASSI = [
  'Q3305213', // dipinto
  'Q22669139', // affresco
  'Q134194', // affresco
  'Q99516640', // dipinto murale
  'Q219423', // murale
  'Q56676227', // dipinto a olio
  'Q19573550', // soffitto dipinto
  'Q16905550', // ciclo di affreschi
  'Q18573970', // gruppo di dipinti
  'Q132137', // icona
  'Q18761202', // dipinto ad acquerello
  'Q12043905', // pastello
  'Q21281546', // guazzo
]

/**
 * Le classi che sono affreschi: la tecnica e' "affresco" anche se Wikidata non
 * dice i materiali. Non "affresco" da solo (Q134194) quando e' anche un dipinto
 * murale: l'Ultima Cena ha tutte e due le classi, e non e' un affresco — e'
 * tempera su intonaco, ed e' proprio la domanda che si fa.
 */
const AFFRESCHI = new Set(['Q22669139', 'Q16905550'])
const AFFRESCO_INCERTO = 'Q134194'
const DIPINTO_MURALE = 'Q99516640'

/** I colori, come si scrive la tecnica di un quadro (le etichette verificate su Wikidata). */
const COLORI: Record<string, string> = {
  Q296955: 'olio', // colore a olio
  Q175166: 'tempera',
  Q1321267: 'tempera', // tempera all'uovo
  Q25631150: 'affresco',
  Q204330: 'guazzo',
  Q3374389: 'acquerello',
  Q189085: 'pastello',
  Q207849: 'acrilico', // vernice acrilica
}

/** L'oro in foglia di tanti fondi: "tempera e oro su tavola". */
const ORO = new Set(['Q897', 'Q929186', 'Q208045'])

/** I supporti: la tela, la tavola (di qualunque legno), il rame, la carta. */
const SUPPORTI: Record<string, string> = {
  Q12321255: 'tela',
  Q106857709: 'tavola',
  Q106857865: 'tavola', // tavola di pioppo
  Q106857823: 'tavola', // di quercia
  Q107103505: 'tavola', // di abete
  Q107103548: 'tavola', // di tiglio
  Q107103575: 'tavola', // di noce
  Q291034: 'tavola', // legno di pioppo
  Q2075708: 'tavola', // legno di quercia
  Q575018: 'tavola', // tiglio
  Q252108: 'tavola', // legno di conifera
  Q287: 'tavola', // legno
  Q112259737: 'tela', // trasportato su tela: con la tavola sono due supporti, e la tecnica non si scrive
  Q753: 'rame',
  Q11472: 'carta',
  Q226697: 'pergamena',
  Q378274: 'pergamena', // vellum
  Q37681: 'seta',
  Q82001: 'avorio',
}

/**
 * I generi, con il nome che hanno nei libri di storia dell'arte, e nell'ordine
 * in cui si scelgono quando un quadro ne ha piu' d'uno: dal piu' preciso al piu'
 * largo. Gli altri (il "tronie", lo "schutterstuk") non si scrivono.
 */
const GENERI: Array<[string, string]> = [
  ['Q192110', 'autoritratto'],
  ['Q1551015', 'ritratto di gruppo'],
  ['Q134307', 'ritratto'],
  ['Q170571', 'natura morta'],
  ['Q158607', 'marina'],
  ['Q166030', 'veduta'],
  ['Q1935974', 'veduta'], // paesaggio urbano
  ['Q191163', 'paesaggio'],
  ['Q3374353', 'battaglia'],
  ['Q742333', 'pittura di storia'],
  ['Q2839016', 'allegoria'],
  ['Q3374376', 'soggetto mitologico'],
  ['Q40446', 'nudo'],
  ['Q1047337', 'scena di genere'],
  ['Q2864737', 'soggetto religioso'],
  ['Q2414609', 'soggetto religioso'],
]

/** I musei che Wikidata chiama con il nome dell'edificio. */
const NOMI_MUSEI: Record<string, string> = {
  Q51252: 'Galleria degli Uffizi', // "Palazzo degli Uffizi"
}

/**
 * Che cosa e' una corrente: un movimento, uno stile, una scuola di pittura. Non
 * i movimenti culturali da soli (l'Umanesimo, il "Trecento"), non quelli solo
 * letterari, e non le voci finite fra le correnti per sbaglio (il "Futuro").
 */
const TIPI_CORRENTI = new Set([
  'Q968159', // movimento artistico
  'Q1792644', // stile artistico
  'Q3326867', // movimento pittorico
  'Q17399019', // stile pittorico
  'Q4502119', // gruppo artistico
  'Q2736610', // scuola artistica
  'Q1400264', // collettivo di artisti
  'Q65266274', // stile artistico di un'area ("Pittura rinascimentale italiana")
  'Q1887220', // scuola di pittura ("Scuola senese")
])
const NON_CORRENTI = new Set([
  'Q12737077', // occupazione (la Bohème)
  'Q32090', // stile di vita
  'Q117850', // dottrina
  'Q7311342', // controversia religiosa
])

const Q_CANDIDATI = `SELECT DISTINCT ?q ?voci WHERE {
  VALUES ?classe { ${valoriSparql(CLASSI)} }
  ?q wdt:P31 ?classe ; wdt:P18 ?immagine ; wdt:P170 ?autore .
  ?autore wdt:P31 wd:Q5 .
  ?q wikibase:sitelinks ?voci .
}
ORDER BY DESC(?voci)
LIMIT ${CANDIDATI}`

/** Il nome del file dall'indirizzo di Wikidata: ".../Special:FilePath/Mona%20Lisa.jpg" → "Mona Lisa.jpg". */
export function nomeFile(indirizzo: string): string | undefined {
  const m = /Special:FilePath\/(.+)$/.exec(indirizzo)
  if (!m) return undefined
  try {
    return decodeURIComponent(m[1])
  } catch {
    return undefined
  }
}

/**
 * Il percorso di un file sotto thumb/: le due cartelle dell'MD5 del nome con i
 * trattini bassi, come le fa MediaWiki.
 */
export function percorsoFile(nome: string): string {
  const conTrattini = nome.replace(/ /g, '_')
  const md5 = createHash('md5').update(conTrattini).digest('hex')
  return `${md5[0]}/${md5.slice(0, 2)}/${conTrattini}`
}

/**
 * Un file che si puo' mostrare: di pubblico dominio o CC0, secondo i metadati
 * di Commons, JPEG o PNG e abbastanza largo. Le licenze CC BY chiederebbero di
 * scrivere l'autore della foto accanto all'immagine, e il quiz non lo fa.
 */
export function immagineLibera(info: InfoFile | null | undefined): boolean {
  if (!info) return false
  if (info.mime !== 'image/jpeg' && info.mime !== 'image/png') return false
  if (info.w < 960) return false
  const licenza = (info.licenza ?? '').toLowerCase()
  const breve = (info.nome ?? '').toLowerCase()
  return licenza === 'pd' || licenza === 'cc0' || /^(public domain|pd\b|cc0)/.test(breve)
}

/**
 * Le proporzioni che si vedono in una carta del telefono. Un rotolo cinese
 * ("Abitare nei monti Fuchun", 29 volte piu' largo che alto) o il Cristo morto
 * di Holbein (6,7) sarebbero una striscia, e da una striscia non si riconosce
 * niente.
 */
const PROPORZIONI: readonly [number, number] = [0.3, 3.2]

export function immagineDa(nome: string, info: InfoFile): ImmagineQuiz | undefined {
  const f = percorsoFile(nome)
  if (!PERCORSO_IMMAGINE.test(f) || info.h <= 0) return undefined
  const r = Math.round((info.w / info.h) * 1000) / 1000
  if (r < PROPORZIONI[0] || r > PROPORZIONI[1]) return undefined
  return { f, r }
}

export async function arte(): Promise<Omit<DatiArte, 'versione'>> {
  console.log('Arte')
  const candidati = await interroga('arte-candidati', Q_CANDIDATI)
  const voci = new Map(candidati.map((r) => [r.q!, numero(r.voci)]))
  const ids = [...voci.keys()]
  const s = await schede('arte-schede', ids)
  const conNome = ids.filter((id) => titoloItaliano(s.get(id)))
  const v = await valori('arte-valori', conNome, ['P31', 'P18', 'P135', 'P136'])
  const date = await anni('arte-anni', conNome, ['P571'])

  /*
   * Chi l'ha dipinto: le persone, e non le attribuzioni in dubbio. "Attribuito
   * a" resta — e' come si citano molti quadri famosi — ma non quel che Wikidata
   * dice incerto o contestato.
   */
  const tuttiGliAutori = await valoriCerti('arte-autori', conNome, 'P170')

  /* I materiali, con la parte a cui si riferiscono: il colore, o il supporto. */
  const righeMateriali = (
    await aPezzi(
      'arte-materiali',
      conNome,
      `SELECT ?q ?materiale ?parte ?rango WHERE {
  VALUES ?q { #VOCI# }
  ?q p:P186 ?st . ?st ps:P186 ?materiale ; wikibase:rank ?rango .
  OPTIONAL { ?st pq:P518 ?parte }
}`,
    )
  ).filter(nonDeprecata)
  const materiali = new Map<string, Array<{ materiale: string; parte?: string }>>()
  for (const r of righeMateriali) {
    if (!r.q || !r.materiale) continue
    const elenco = materiali.get(r.q) ?? []
    elenco.push({ materiale: r.materiale, parte: r.parte })
    materiali.set(r.q, elenco)
  }

  /* Dov'e' adesso: le collezioni senza una data di fine. */
  const righeCollezioni = (
    await aPezzi(
      'arte-collezioni',
      conNome,
      `SELECT ?q ?collezione ?rango ?fine WHERE {
  VALUES ?q { #VOCI# }
  ?q p:P195 ?st . ?st ps:P195 ?collezione ; wikibase:rank ?rango .
  OPTIONAL { ?st pq:P582 ?fine }
}`,
    )
  ).filter(nonDeprecata)
  const collezioni = new Map<string, string[]>()
  for (const r of righeCollezioni) {
    if (!r.q || !r.collezione || r.fine) continue
    const elenco = collezioni.get(r.q) ?? []
    if (!elenco.includes(r.collezione)) elenco.push(r.collezione)
    collezioni.set(r.q, elenco)
  }

  /* I pittori: le persone fra gli autori, non le botteghe. */
  const idPittori = [...new Set([...tuttiGliAutori.values()].flat())]
  const pittori = await persone('arte-pittori', idPittori, { correnti: true })
  const autori = new Map(
    [...tuttiGliAutori].map(([q, elenco]) => [q, elenco.filter((a) => pittori.get(a)?.umano)] as const),
  )

  /* I quadri buoni prima delle immagini: nome italiano, un pittore con il suo nome. */
  const buoni = conNome.filter((id) => (autori.get(id) ?? []).some((a) => pittori.has(a)))
  const italiano = (id: string) => (autori.get(id) ?? []).some((a) => pittori.get(a)?.it)
  const peso = (id: string) => conSpinta(voci.get(id) ?? 0, italiano(id))

  /* Titoli doppi. */
  const perPeso = titoliUnici(
    buoni,
    (id) => titoloItaliano(s.get(id))!,
    (id) => voci.get(id) ?? 0,
    (id) => (autori.get(id) ?? []).join(' '),
  ).sort((a, b) => peso(b) - peso(a) || a.localeCompare(b))
  console.log(
    `  ${ids.length} candidati, ${conNome.length} con il titolo in italiano, ${buoni.length} con il pittore, ` +
      `${perPeso.length} senza titoli doppi`,
  )

  /* Le immagini, a gruppi, finche' non ci sono abbastanza quadri. */
  const scelti: Array<{ id: string; img: ImmagineQuiz }> = []
  for (let i = 0; i < perPeso.length && scelti.length < QUADRI; i += 100) {
    const gruppo = perPeso.slice(i, i + 100)
    const file = gruppo.flatMap((id) => primi(v, id, 'P18').map(nomeFile).filter((n): n is string => !!n))
    const info = await infoFile(file)
    for (const id of gruppo) {
      if (scelti.length >= QUADRI) break
      for (const nome of primi(v, id, 'P18').map(nomeFile)) {
        const dati = nome ? info.get(nome) : undefined
        const img = nome && dati && immagineLibera(dati) ? immagineDa(nome, dati) : undefined
        if (img) {
          scelti.push({ id, img })
          break
        }
      }
    }
  }
  console.log(`  ${scelti.length} quadri con un'immagine libera`)

  /* Le voci di contorno: correnti, collezioni e le loro città. */
  const idCorrenti = new Set<string>()
  const idCollezioni = new Set<string>()
  for (const { id } of scelti) {
    for (const c of primi(v, id, 'P135')) idCorrenti.add(c)
    for (const a of autori.get(id) ?? []) for (const c of pittori.get(a)?.c ?? []) idCorrenti.add(c)
    for (const c of collezioni.get(id) ?? []) idCollezioni.add(c)
  }
  // Le collezioni che fanno parte di un museo: il dipartimento dei dipinti del Louvre e' nel Louvre.
  const parti = await valori('arte-collezioni-parti', [...idCollezioni], ['P361'])
  for (const c of [...idCollezioni]) for (const p of primi(parti, c, 'P361')) idCollezioni.add(p)
  const contorno = await schede('arte-contorno', [...idCorrenti, ...idCollezioni])
  const citta = await cittaDi('arte-citta', [...idCollezioni])

  /*
   * Le correnti: quelle che lo sono davvero, con il nome e le prime frasi della
   * voce. Due con lo stesso nome ("Realismo" c'e' due volte) diventano una, la
   * piu' nota, e i quadri e i pittori dell'altra passano a lei.
   */
  const tipiCorrenti = await valori('arte-correnti-tipi', [...idCorrenti], ['P31'])
  const vere = [...idCorrenti]
    .filter((c) => {
      const tipi = primi(tipiCorrenti, c, 'P31')
      const corrente = tipi.some((t) => TIPI_CORRENTI.has(t)) && !tipi.some((t) => NON_CORRENTI.has(t))
      return corrente && !!nomeItaliano(contorno.get(c))
    })
    .sort(
      (a, b) =>
        Number(!!contorno.get(b)?.voce) - Number(!!contorno.get(a)?.voce) ||
        (contorno.get(b)?.voci ?? 0) - (contorno.get(a)?.voci ?? 0) ||
        a.localeCompare(b),
    )
  const perNome = new Map<string, string>()
  const corrente = new Map<string, string>()
  for (const c of vere) {
    const chiave = titoloNormale(nomeItaliano(contorno.get(c))!)
    if (!perNome.has(chiave)) perNome.set(chiave, c)
    corrente.set(c, perNome.get(chiave)!)
  }
  const correntiDi = (ids: readonly string[]) =>
    [...new Set(ids.map((c) => corrente.get(c)).filter((c): c is string => !!c))]
  const tenute = [...perNome.values()]
  const intro = await introduzioni(tenute.map((c) => contorno.get(c)?.voce).filter((t): t is string => !!t))
  const correnti: VoceQuiz[] = tenute
    .map((c) => {
      const sc = contorno.get(c)!
      const d = sc.voce ? primeFrasi(intro.get(sc.voce)) : undefined
      return {
        id: c,
        n: maiuscolaIniziale(nomeItaliano(sc)!),
        ...(d ? { d } : {}),
        ...(sc.voce ? { w: sc.voce } : {}),
      }
    })
    .sort((a, b) => a.n.localeCompare(b.n, 'it') || a.id.localeCompare(b.id))

  /* I quadri. */
  const fama = perNotorieta(
    scelti.map((x) => ({ id: x.id })),
    (x) => peso(x.id),
  )
  const quadri: QuadroQuiz[] = scelti.map(({ id, img }) => {
    const sc = s.get(id)!
    const a = (autori.get(id) ?? []).filter((x) => pittori.has(x))
    const proprie = correntiDi(primi(v, id, 'P135'))
    const c = proprie.length > 0 ? proprie : correntiDi(a.flatMap((x) => pittori.get(x)?.c ?? []))
    const anno = annoSicuro(date.get(id)?.get('P571'), { scarto: 5 })
    const t = tecnica(primi(v, id, 'P31'), materiali.get(id) ?? [])
    const collezione = sceltaCollezione(collezioni.get(id) ?? [], contorno, citta, parti)
    const m = collezione ? (NOMI_MUSEI[collezione] ?? nomeItaliano(contorno.get(collezione))) : undefined
    const l = collezione ? citta.get(collezione) : undefined
    const g = genereDi(primi(v, id, 'P136'))
    return {
      id,
      n: titoloItaliano(sc)!,
      a,
      ...(anno !== undefined ? { anno } : {}),
      ...(c.length > 0 ? { c } : {}),
      ...(t ? { t } : {}),
      ...(m ? { m } : {}),
      ...(m && l ? { l } : {}),
      ...(g ? { g } : {}),
      img,
      ...(sc.voce ? { w: sc.voce } : {}),
      f: fama.get(id) ?? 0,
    }
  })

  /* I pittori dei quadri scelti, con le sole correnti tenute. */
  const usati = [...new Set(quadri.flatMap((q) => q.a))].map((id) => pittori.get(id)!).filter(Boolean)
  const elencoPittori = elencoPersone(usati.map((p) => ({ ...p, c: correntiDi(p.c ?? []) })))
  const correntiUsate = new Set([...quadri.flatMap((q) => q.c ?? []), ...elencoPittori.flatMap((p) => p.c ?? [])])

  return {
    quadri: perFama(quadri),
    pittori: elencoPittori,
    correnti: correnti.filter((c) => correntiUsate.has(c.id)),
  }
}

/**
 * La tecnica: "olio su tela", "tempera su tavola", "affresco". I materiali
 * vengono prima della classe; niente se non la dicono chiara — due colori
 * (olio e tempera), due supporti (tavola trasportata su tela).
 */
function tecnica(
  classi: readonly string[],
  materiali: ReadonlyArray<{ materiale: string; parte?: string }>,
): string | undefined {
  const colori = [...new Set(materiali.map((m) => COLORI[m.materiale]).filter((x): x is string => !!x))]
  const supporti = [...new Set(materiali.map((m) => SUPPORTI[m.materiale]).filter((x): x is string => !!x))]
  if (colori.length === 0) {
    const affresco =
      classi.some((c) => AFFRESCHI.has(c)) || (classi.includes(AFFRESCO_INCERTO) && !classi.includes(DIPINTO_MURALE))
    return affresco && supporti.length === 0 ? 'affresco' : undefined
  }
  if (colori.length !== 1) return undefined
  if (colori[0] === 'affresco') return supporti.length === 0 ? 'affresco' : undefined
  const colore = colori[0] === 'tempera' && materiali.some((m) => ORO.has(m.materiale)) ? 'tempera e oro' : colori[0]
  if (supporti.length === 1) return `${colore} su ${supporti[0]}`
  return supporti.length === 0 ? colore : undefined
}

/** Il genere di un quadro: il primo della tabella fra quelli che ha. */
function genereDi(generi: readonly string[]): string | undefined {
  return GENERI.find(([q]) => generi.includes(q))?.[1]
}

/**
 * Dov'e' il quadro: fra le collezioni di oggi con un nome italiano, la piu' nota
 * che ha una città; se nessuna ce l'ha — il dipartimento dei dipinti del Louvre
 * e' un ufficio, non un indirizzo — il museo di cui fa parte.
 */
function sceltaCollezione(
  elenco: readonly string[],
  contorno: Map<string, Scheda>,
  citta: Map<string, string>,
  parti: Map<string, Map<string, string[]>>,
): string | undefined {
  const perNota = (ids: readonly string[]) =>
    [...ids]
      .filter((c) => nomeItaliano(contorno.get(c)))
      .sort((a, b) => (contorno.get(b)?.voci ?? 0) - (contorno.get(a)?.voci ?? 0) || a.localeCompare(b))
  const proprie = perNota(elenco)
  return (
    proprie.find((c) => citta.has(c)) ??
    perNota(proprie.flatMap((c) => primi(parti, c, 'P361'))).find((c) => citta.has(c)) ??
    proprie[0]
  )
}

/**
 * Un punto che non chiude la frase: dopo un'abbreviazione ("sec.", "ca.", "a.C.")
 * o un'iniziale ("J. S. Bach", "S. Maria").
 */
const ABBREVIAZIONI = [
  ...['sec', 'secc', 'ca', 'cfr', 'ecc', 'pag', 'vol', 'nn?', 'es', 'ss', 'st', 'sig', 'dott', 'prof', 'mons'],
  ...['ing', 'avv', 'gen', 'art', 'lett', 'lat', 'gr', 'ted', 'ingl', 'fr', 'sp'],
  ...[String.raw`a\.\s?c`, String.raw`d\.\s?c`, '[a-z]'],
]
const ABBREVIAZIONE = new RegExp(String.raw`(?:^|[\s(’'])(?:${ABBREVIAZIONI.join('|')})\.$`, 'i')

/** Le parentesi da togliere: la pronuncia (fra barre, o detta), l'etimologia ("dal greco"), la lingua. */
const DENTRO = String.raw`(?:[^()]|\([^()]*\))*`
const INUTILE = String.raw`(?:\/[^()/]+\/|pronuncia|IPA|dal |in (?:lingua )?[a-z]+(?:o|e) )`
const PARENTESI_INUTILI = new RegExp(String.raw`\s*\(` + DENTRO + INUTILE + DENTRO + String.raw`\)`, 'gi')

/** Le frasi di un testo: un punto chiude la frase se dopo viene una maiuscola, e prima non c'e' un'abbreviazione. */
export function frasi(testo: string): string[] {
  const esito: string[] = []
  let inizio = 0
  for (const m of testo.matchAll(/[.!?]+(?=\s+["«“]?[A-ZÀ-ÖØ-Ý])/g)) {
    const fine = m.index + m[0].length
    if (m[0] === '.' && ABBREVIAZIONE.test(testo.slice(Math.max(inizio, m.index - 12), fine))) continue
    esito.push(testo.slice(inizio, fine).trim())
    inizio = fine
  }
  const resto = testo.slice(inizio).trim()
  if (resto) esito.push(resto)
  return esito.filter(Boolean)
}

/**
 * Le prime frasi di una voce di Wikipedia, fino a 280 caratteri: una, o due se
 * ci stanno. Senza le parentesi della pronuncia e dell'etimologia, che in una
 * scheda di due righe sono rumore.
 */
export function primeFrasi(testo: string | null | undefined, massimo = 280): string | undefined {
  if (!testo) return undefined
  const pulito = testo
    .split('\n')[0]
    .replace(PARENTESI_INUTILI, '')
    // La pronuncia anche senza parentesi: "Bohème /bɔˈεm/".
    .replace(/\s*\/[^/\s][^/]{0,40}[ˈˌːɔɛəʁɪʊɑæʃʒŋɲ̃][^/]{0,40}\//g, '')
    .replace(/\s*\[[^\]]*\]/g, '')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
  const elenco = frasi(pulito)
  let esito = ''
  for (const f of elenco) {
    const prova = esito ? `${esito} ${f}` : f
    if (prova.length > massimo) break
    esito = prova
    // Una frase lunga basta: la seconda serve solo quando la prima e' breve.
    if (esito.length > massimo * 0.55) break
  }
  if (!esito && elenco[0]) {
    const taglio = elenco[0].lastIndexOf(' ', massimo - 2)
    esito = `${elenco[0].slice(0, taglio > 0 ? taglio : massimo - 2).replace(/[,;:]$/, '')}…`
  }
  return esito ? esito.replace(/'/g, '’') : undefined
}

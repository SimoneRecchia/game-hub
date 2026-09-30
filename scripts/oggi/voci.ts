/**
 * Quel che serve sapere, da Wikidata, delle voci che i fatti nominano: in
 * quante Wikipedia ci sono, che cosa sono — una persona, un luogo, un fatto,
 * una classe di cose — e le loro date.
 *
 * Le query vanno a pezzi da `BLOCCO` voci: sono migliaia in tutto, e una sola
 * sarebbe troppo lunga anche in POST.
 */

import { sparqlPost, type Riga } from './rete'

const BLOCCO = 1500

/**
 * Che cosa e' una voce, per il punteggio:
 * - `persona`: un essere umano;
 * - `generico`: una classe di cose ("Sonda spaziale", "Musical"), un elenco, un
 *   giorno o un anno, una disambigua: non dicono niente del fatto;
 * - `luogo`: un paese, una città, una regione, uno stato di una volta, un
 *   mare, un monte;
 * - `costruzione`: un edificio, un ponte, un muro;
 * - `fatto`, `opera`, `gruppo` (organizzazioni, squadre, partiti), `altro`.
 *
 * Sopra i luoghi l'ontologia di Wikidata e' larga di manica — uno stato e una
 * città sono anche organizzazioni, una moneta e' un "evento" — e i generi
 * servono solo a quel che il punteggio ne fa: i luoghi e le classi non dicono
 * quanto e' noto un fatto, il resto si'.
 */
export type Genere = 'persona' | 'generico' | 'luogo' | 'costruzione' | 'fatto' | 'opera' | 'gruppo' | 'altro'

type Radice = 'generico' | 'territorio' | 'costruzione' | 'geografia' | 'fatto' | 'opera' | 'gruppo'

/** Le classi da cui si riconosce il genere, risalendo "sottoclasse di". */
const RADICI: Record<string, Radice> = {
  // Elenchi, disambigue, categorie, giorni del calendario, anni, decenni, secoli, millenni.
  Q13406463: 'generico',
  Q4167410: 'generico',
  Q4167836: 'generico',
  Q14795564: 'generico',
  Q3186692: 'generico',
  Q577: 'generico',
  Q39911: 'generico',
  Q578: 'generico',
  Q36507: 'generico',
  /*
   * Insediamenti, paesi, stati di oggi e di una volta, divisioni di primo,
   * secondo e terzo livello, regioni storiche, continenti. Non le "divisioni
   * amministrative" e le "regioni" in generale: da lassu' scende di tutto, anche
   * il muro di Berlino (e' un "cordone").
   */
  Q486972: 'territorio',
  Q6256: 'territorio',
  Q3024240: 'territorio',
  Q7275: 'territorio',
  Q1048835: 'territorio',
  Q10864048: 'territorio',
  Q12357832: 'territorio',
  Q12357920: 'territorio',
  Q1620908: 'territorio',
  Q5107: 'territorio',
  // Costruzioni ed edifici.
  Q811979: 'costruzione',
  Q41176: 'costruzione',
  // Tutto il resto della geografia: mari, monti, isole. Anche le costruzioni ci stanno sotto.
  Q2221906: 'geografia',
  Q1190554: 'fatto',
  Q1656682: 'fatto',
  Q13418847: 'fatto',
  Q17537576: 'opera',
  Q386724: 'opera',
  Q43229: 'gruppo',
}

/**
 * Chi vince fra le radici di una stessa voce. I territori prima di tutto: per
 * Wikidata uno stato e una città sono anche organizzazioni, e la Città del
 * Vaticano un'opera (e' patrimonio dell'umanità). Poi le costruzioni, che
 * stanno anche sotto la geografia.
 */
const ORDINE: readonly Radice[] = ['generico', 'territorio', 'costruzione', 'geografia', 'fatto', 'opera', 'gruppo']

const GENERE_DELLA_RADICE: Record<Radice, Genere> = {
  generico: 'generico',
  territorio: 'luogo',
  costruzione: 'costruzione',
  geografia: 'luogo',
  fatto: 'fatto',
  opera: 'opera',
  gruppo: 'gruppo',
}

/** Le date che dicono quando e' successo qualcosa, o quando e' cominciato o finito. */
export const PROPRIETA_DATE = [
  'P585', // data
  'P580', // inizio
  'P582', // fine
  'P571', // fondazione, nascita di una cosa
  'P576', // scioglimento, demolizione
  'P569', // nascita
  'P570', // morte
  'P577', // pubblicazione
  'P1191', // prima rappresentazione
  'P1619', // inaugurazione
  'P3999', // chiusura
  'P619', // lancio di un veicolo spaziale
  'P620', // atterraggio
  'P606', // primo volo
  'P729', // entrata in servizio
  'P575', // scoperta o invenzione
  'P7588', // entrata in vigore
] as const

/** Una data come la scrive Wikidata, con l'anno come quello del feed: negativo avanti Cristo, senza l'anno zero. */
export interface DataVoce {
  p: string
  anno: number
  mese: number
  giorno: number
  /** 9 l'anno, 10 il mese, 11 il giorno. */
  precisione: number
}

export interface Voce {
  id: string
  /** In quante Wikipedia c'e'. */
  sitelink: number
  /** Quanto contano quelle Wikipedia: 1, o `PESO_DA_PROGRAMMA` (vedi `DA_PROGRAMMA`). */
  peso: number
  genere: Genere
  date: DataVoce[]
  /** E' l'Italia, o e' dell'Italia (P17, P495) o di un italiano (P27): per la spinta alle cose di casa. */
  italiana: boolean
}

/**
 * Le classi le cui voci le scrive quasi tutte un programma, in decine di
 * Wikipedia: un asteroide qualsiasi ("4440 Tchantchès") ne ha venticinque,
 * quanto un fatto che conoscono tutti. Asteroidi, pianeti minori, asteroidi
 * near-Earth e potenzialmente pericolosi; non i pianeti nani (Q2199): Cerere e'
 * Cerere.
 */
const DA_PROGRAMMA = new Set(['Q3863', 'Q1022867', 'Q217526', 'Q59423687'])
const PESO_DA_PROGRAMMA = 1 / 3

/**
 * L'Italia di oggi e quella di prima: il Regno, la RSI e gli stati preunitari
 * (Sardegna, Due Sicilie, Napoli, Sicilia, Stato Pontificio, Toscana, Milano,
 * Venezia, Genova, Firenze).
 */
export const ITALIE = new Set([
  'Q38',
  'Q172579',
  'Q153660',
  'Q165154',
  'Q180393',
  'Q173065',
  'Q188586',
  'Q170174',
  'Q154849',
  'Q153529',
  'Q4948',
  'Q174306',
  'Q148540',
])

export function aPezzi<T>(elenco: readonly T[], quanti: number): T[][] {
  const pezzi: T[][] = []
  for (let i = 0; i < elenco.length; i += quanti) pezzi.push(elenco.slice(i, i + quanti))
  return pezzi
}

export const valori = (id: readonly string[]) => id.map((q) => `wd:${q}`).join(' ')

/**
 * "-0043-03-13T00:00:00Z" → 44 a.C. Nell'RDF di Wikidata gli anni sono
 * astronomici (l'anno zero e' l'1 a.C.) e le date del calendario giuliano
 * sono convertite in gregoriano: il cesaricidio, il 15 marzo del 44 a.C., e'
 * "-0043-03-13".
 */
export function leggiData(p: string, valore: string, precisione: number): DataVoce | null {
  const m = /^(-?)(\d+)-(\d\d)-(\d\d)T/.exec(valore)
  if (!m) return null
  const astronomico = (m[1] ? -1 : 1) * Number(m[2])
  return {
    p,
    anno: astronomico > 0 ? astronomico : astronomico - 1,
    mese: Number(m[3]),
    giorno: Number(m[4]),
    precisione,
  }
}

async function informazioni(id: readonly string[], blocco: number): Promise<Riga[]> {
  return sparqlPost(
    `oggi-voci-${blocco}`,
    `SELECT ?item ?sl (GROUP_CONCAT(DISTINCT STR(?c); separator=" ") AS ?classi) (SAMPLE(?s) AS ?sopra)
    (GROUP_CONCAT(DISTINCT STR(?paese); separator=" ") AS ?paesi) WHERE {
  VALUES ?item { ${valori(id)} }
  OPTIONAL { ?item wikibase:sitelinks ?sl }
  OPTIONAL { ?item wdt:P31 ?c }
  OPTIONAL { ?item wdt:P279 ?s }
  OPTIONAL { { ?item wdt:P17 ?paese } UNION { ?item wdt:P27 ?paese } UNION { ?item wdt:P495 ?paese } }
}
GROUP BY ?item ?sl`,
  )
}

/**
 * Le date con la loro precisione, che `wdt:` non da': una data "1906" e' il
 * primo gennaio del 1906, e senza la precisione farebbe l'anniversario di
 * capodanno. Un'unione per proprieta', e il rango letto a parte: con un
 * `FILTER` sul rango QLever perdeva quasi tutte le righe di un blocco grande.
 */
async function date(id: readonly string[], blocco: number): Promise<Riga[]> {
  const unioni = PROPRIETA_DATE.map((p) => `{ ?item p:${p} ?st . ?st psv:${p} ?nodo . BIND("${p}" AS ?p) }`)
  return sparqlPost(
    `oggi-date-${blocco}`,
    `SELECT ?item ?p ?t ?prec ?rango WHERE {
  VALUES ?item { ${valori(id)} }
  ${unioni.join(' UNION\n  ')}
  ?nodo wikibase:timeValue ?t ; wikibase:timePrecision ?prec .
  OPTIONAL { ?st wikibase:rank ?rango }
}`,
  )
}

async function radici(classi: readonly string[], blocco: number): Promise<Riga[]> {
  return sparqlPost(
    `oggi-classi-${blocco}`,
    `SELECT ?c ?radice WHERE {
  VALUES ?c { ${valori(classi)} }
  VALUES ?radice { ${valori(Object.keys(RADICI))} }
  ?c wdt:P279* ?radice .
}`,
  )
}

/** Le voci di Wikidata, per identificativo. */
export async function leggiVoci(identificativi: Iterable<string>): Promise<Map<string, Voce>> {
  const id = [...new Set(identificativi)]
    .filter((q) => /^Q\d+$/.test(q))
    .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))
  const pezzi = aPezzi(id, BLOCCO)
  console.log(`  ${id.length} voci da Wikidata, in ${pezzi.length} pezzi`)

  const info = new Map<string, Riga>()
  const datePer = new Map<string, DataVoce[]>()
  for (const [i, pezzo] of pezzi.entries()) {
    for (const r of await informazioni(pezzo, i)) if (r.item) info.set(r.item, r)
    for (const r of await date(pezzo, i)) {
      if ((r.rango ?? '').endsWith('DeprecatedRank')) continue
      const d = r.item && r.p && r.t ? leggiData(r.p, r.t, Number(r.prec)) : null
      if (!d || d.precisione < 9) continue
      const elenco = datePer.get(r.item!) ?? []
      elenco.push(d)
      datePer.set(r.item!, elenco)
    }
  }

  const classi = [...new Set([...info.values()].flatMap((r) => (r.classi ?? '').split(' ').filter(Boolean)))].sort()
  const radiciDi = new Map<string, Set<Radice>>()
  for (const [i, pezzo] of aPezzi(classi, BLOCCO).entries()) {
    for (const r of await radici(pezzo, i)) {
      if (!r.c || !r.radice || !RADICI[r.radice]) continue
      const s = radiciDi.get(r.c) ?? new Set<Radice>()
      s.add(RADICI[r.radice])
      radiciDi.set(r.c, s)
    }
  }

  const voci = new Map<string, Voce>()
  for (const q of id) {
    const r = info.get(q)
    const suoi = (r?.classi ?? '').split(' ').filter(Boolean)
    const sue = new Set(suoi.flatMap((c) => [...(radiciDi.get(c) ?? [])]))
    const radice = ORDINE.find((x) => sue.has(x))
    const date = (datePer.get(q) ?? []).sort(
      (a, b) =>
        a.p.localeCompare(b.p) ||
        a.anno - b.anno ||
        a.mese - b.mese ||
        a.giorno - b.giorno ||
        a.precisione - b.precisione,
    )
    let genere: Genere = suoi.includes('Q5') ? 'persona' : radice ? GENERE_DELLA_RADICE[radice] : 'altro'
    /*
     * "Sottoclasse di" da sola non fa una classe: la seconda guerra mondiale e'
     * sottoclasse di "guerra", la nazionale di calcio della Spagna di qualcosa
     * anche lei. Una voce con una sopraclasse e' generica solo se non e' un
     * luogo, un'opera o un gruppo, e se non e' un fatto con le sue date (anche
     * solo una fondazione: il Corpo delle capitanerie di porto): "Galeone",
     * "Alpinismo", "Cambiamento climatico".
     */
    const conDate = date.some((d) => ['P580', 'P582', 'P585', 'P571', 'P576'].includes(d.p))
    if (r?.sopra && (genere === 'altro' || (genere === 'fatto' && !conDate))) genere = 'generico'
    const daProgramma = suoi.some((c) => DA_PROGRAMMA.has(c)) && !suoi.includes('Q2199')
    voci.set(q, {
      id: q,
      sitelink: Number(r?.sl ?? 0) || 0,
      peso: daProgramma ? PESO_DA_PROGRAMMA : 1,
      genere,
      date,
      italiana: ITALIE.has(q) || (r?.paesi ?? '').split(' ').some((p) => ITALIE.has(p)),
    })
  }
  return voci
}

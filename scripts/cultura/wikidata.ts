/**
 * Le domande ricorrenti a Wikidata, uguali per tutte le materie: la scheda di
 * una voce (nome, descrizione, voce di Wikipedia, notorietà), i valori di una
 * proprieta', gli anni con la loro precisione.
 *
 * Gli elenchi di voci vanno nella query come `VALUES`, a pezzi di qualche
 * migliaio: una query per pezzo, e i pezzi uno dopo l'altro.
 */

import { interroga, type Riga } from './rete'

const PEZZO = 2_500

/** Un identificativo di voce: i valori "sconosciuti" di Wikidata arrivano come nodi anonimi, e non lo sono. */
export const eVoce = (id: string | undefined): id is string => !!id && /^Q\d+$/.test(id)

/** Un elenco di voci come `VALUES` di SPARQL. */
export const valoriSparql = (ids: readonly string[]) => ids.filter(eVoce).map((q) => `wd:${q}`).join(' ')

/** La stessa query su un elenco lungo, a pezzi: il segnaposto `#VOCI#` diventa il pezzo. */
export async function aPezzi(nome: string, ids: readonly string[], corpo: string): Promise<Riga[]> {
  const unici = [...new Set(ids.filter(eVoce))].sort()
  const righe: Riga[] = []
  for (let i = 0; i < unici.length; i += PEZZO) {
    const pezzo = unici.slice(i, i + PEZZO)
    righe.push(...(await interroga(`${nome}-${i / PEZZO}`, corpo.replace('#VOCI#', valoriSparql(pezzo)))))
  }
  return righe
}

/**
 * Il rango si filtra qui e non nella query. Verificato: in QLever
 * `FILTER(?rango != wikibase:DeprecatedRank)` insieme a un OPTIONAL, su un
 * `VALUES` di duemila voci, restituisce le righe di una sessantina, senza
 * errori — la stessa query senza il filtro le da' tutte. Per la stessa ragione
 * le query con un elenco non hanno FILTER: si prende tutto e si sceglie dopo.
 */
export const nonDeprecata = (r: Riga) => !(r.rango ?? '').endsWith('DeprecatedRank')

/**
 * Le "circostanze" di un'attribuzione che la rendono incerta: presumibilmente,
 * controverso, possibile (le etichette verificate su Wikidata). "Attribuzione"
 * invece resta: e' come si citano molti quadri famosi.
 */
export const INCERTI = new Set(['Q18122778', 'Q18912752', 'Q30230067'])

export function numero(v: string | undefined): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Quel che serve di ogni voce: il nome, la descrizione, la voce di Wikipedia, quante Wikipedia ne parlano. */
export interface Scheda {
  id: string
  /** L'etichetta in italiano. */
  it?: string
  /** L'etichetta di tutte le lingue: Wikidata ci sta spostando i nomi propri. */
  mul?: string
  descrizione?: string
  voce?: string
  voci: number
}

export async function schede(nome: string, ids: readonly string[]): Promise<Map<string, Scheda>> {
  const righe = await aPezzi(
    nome,
    ids,
    `SELECT ?q ?it ?mul ?descrizione ?voce ?voci WHERE {
  VALUES ?q { #VOCI# }
  OPTIONAL { ?q rdfs:label ?it . FILTER(LANG(?it) = "it") }
  OPTIONAL { ?q rdfs:label ?mul . FILTER(LANG(?mul) = "mul") }
  OPTIONAL { ?q schema:description ?descrizione . FILTER(LANG(?descrizione) = "it") }
  OPTIONAL { ?articolo schema:about ?q ; schema:isPartOf <https://it.wikipedia.org/> ; schema:name ?voce }
  OPTIONAL { ?q wikibase:sitelinks ?voci }
}`,
  )
  const esito = new Map<string, Scheda>()
  for (const r of righe) {
    if (!r.q || esito.has(r.q)) continue
    esito.set(r.q, {
      id: r.q,
      it: r.it?.trim() || undefined,
      mul: r.mul?.trim() || undefined,
      descrizione: r.descrizione?.trim() || undefined,
      voce: r.voce?.trim() || undefined,
      voci: numero(r.voci),
    })
  }
  return esito
}

/**
 * I valori di alcune proprieta', quelli di rango migliore (come `wdt:`): per
 * voce, per proprieta', nell'ordine in cui arrivano.
 */
export async function valori(
  nome: string,
  ids: readonly string[],
  proprieta: readonly string[],
): Promise<Map<string, Map<string, string[]>>> {
  const rami = proprieta.map((p) => `{ ?q wdt:${p} ?v . BIND("${p}" AS ?p) }`).join('\n  UNION ')
  const righe = await aPezzi(nome, ids, `SELECT ?q ?p ?v WHERE {\n  VALUES ?q { #VOCI# }\n  ${rami}\n}`)
  const esito = new Map<string, Map<string, string[]>>()
  for (const r of righe) {
    if (!r.q || !r.p || r.v === undefined) continue
    const perVoce = esito.get(r.q) ?? new Map<string, string[]>()
    const elenco = perVoce.get(r.p) ?? []
    if (!elenco.includes(r.v)) elenco.push(r.v)
    perVoce.set(r.p, elenco)
    esito.set(r.q, perVoce)
  }
  return esito
}

export const primi = (m: Map<string, Map<string, string[]>>, id: string, p: string): string[] => m.get(id)?.get(p) ?? []

/**
 * I valori certi di una proprieta': quelli del rango migliore, come `wdt:`, ma
 * senza quelli che una circostanza dice incerti (P1480, o la natura della
 * dichiarazione, P5102). La prima lettera di Giovanni e' "forse" di Giovanni il
 * Presbitero, e "chi l'ha scritta?" non ha una risposta sicura.
 */
export async function valoriCerti(
  nome: string,
  ids: readonly string[],
  proprieta: string,
): Promise<Map<string, string[]>> {
  const righe = await aPezzi(
    nome,
    ids,
    `SELECT ?q ?v ?rango ?circostanza ?natura WHERE {
  VALUES ?q { #VOCI# }
  ?q p:${proprieta} ?st . ?st ps:${proprieta} ?v ; wikibase:rank ?rango .
  OPTIONAL { ?st pq:P1480 ?circostanza }
  OPTIONAL { ?st pq:P5102 ?natura }
}`,
  )
  const perVoce = new Map<string, Array<{ v: string; preferita: boolean; incerta: boolean }>>()
  for (const r of righe) {
    if (!r.q || !eVoce(r.v) || !nonDeprecata(r)) continue
    const elenco = perVoce.get(r.q) ?? []
    const incerta = INCERTI.has(r.circostanza ?? '') || INCERTI.has(r.natura ?? '')
    const gia = elenco.find((x) => x.v === r.v)
    if (gia) {
      gia.incerta ||= incerta
      gia.preferita ||= (r.rango ?? '').endsWith('PreferredRank')
    } else {
      elenco.push({ v: r.v, preferita: (r.rango ?? '').endsWith('PreferredRank'), incerta })
    }
    perVoce.set(r.q, elenco)
  }
  const esito = new Map<string, string[]>()
  for (const [q, elenco] of perVoce) {
    const migliori = elenco.some((x) => x.preferita) ? elenco.filter((x) => x.preferita) : elenco
    const certi = migliori.filter((x) => !x.incerta).map((x) => x.v)
    if (certi.length > 0) esito.set(q, certi)
  }
  return esito
}

/**
 * L'anno di una data come la scrive Wikidata in RDF. Gli anni prima di Cristo
 * seguono l'XSD 1.1, con l'anno zero: "-0043" e' il 44 a.C., l'anno della morte
 * di Cesare (verificato sulla voce). Qui si torna all'uso comune, senza zero.
 */
export function annoDaData(t: string | undefined): number | undefined {
  const m = /^(-?)(\d{1,6})-/.exec(t ?? '')
  if (!m) return undefined
  const y = Number(m[2]) * (m[1] ? -1 : 1)
  return y <= 0 ? y - 1 : y
}

/** Un anno detto da Wikidata: la precisione e' quella del valore (9 l'anno, 8 il decennio, 7 il secolo). */
export interface AnnoWikidata {
  anno: number
  precisione: number
  preferito: boolean
  /**
   * L'inizio scritto come qualificatore (P580, o "non prima di", P1319), preciso
   * all'anno: la Gioconda ha "anni 1500" con "non prima del 1503", l'Ultima Cena
   * "anni 1490" con "dal 1494".
   */
  inizio?: number
}

/**
 * Gli anni di alcune proprieta' con la loro precisione, senza le dichiarazioni
 * deprecate. Serve la precisione: "1503" con la precisione del decennio vuol
 * dire "gli anni 1500", e come anno esatto sarebbe una risposta sbagliata.
 */
export async function anni(
  nome: string,
  ids: readonly string[],
  proprieta: readonly string[],
): Promise<Map<string, Map<string, AnnoWikidata[]>>> {
  const rami = proprieta
    .map((p) => `{ ?q p:${p} ?st . ?st psv:${p} ?v . BIND("${p}" AS ?p) }`)
    .join('\n  UNION ')
  const righe = await aPezzi(
    nome,
    ids,
    `SELECT ?q ?p ?st ?t ?precisione ?rango ?ti ?pi WHERE {
  VALUES ?q { #VOCI# }
  ${rami}
  ?v wikibase:timeValue ?t ; wikibase:timePrecision ?precisione .
  ?st wikibase:rank ?rango .
  OPTIONAL { ?st pqv:P580|pqv:P1319 ?vi . ?vi wikibase:timeValue ?ti ; wikibase:timePrecision ?pi . }
}`,
  )
  const esito = new Map<string, Map<string, AnnoWikidata[]>>()
  const perDichiarazione = new Map<string, AnnoWikidata>()
  for (const r of righe) {
    const anno = annoDaData(r.t)
    if (!r.q || !r.p || anno === undefined || (r.rango ?? '').endsWith('DeprecatedRank')) continue
    const inizio = numero(r.pi) >= 9 ? annoDaData(r.ti) : undefined
    // Una dichiarazione con due qualificatori torna due volte: si tiene l'inizio piu' presto.
    const chiave = `${r.p} ${r.st ?? `${r.q}-${r.t}`}`
    const gia = perDichiarazione.get(chiave)
    if (gia) {
      if (inizio !== undefined && (gia.inizio === undefined || inizio < gia.inizio)) gia.inizio = inizio
      continue
    }
    const valore: AnnoWikidata = {
      anno,
      precisione: numero(r.precisione),
      preferito: (r.rango ?? '').endsWith('PreferredRank'),
      ...(inizio !== undefined ? { inizio } : {}),
    }
    perDichiarazione.set(chiave, valore)
    const perVoce = esito.get(r.q) ?? new Map<string, AnnoWikidata[]>()
    const elenco = perVoce.get(r.p) ?? []
    elenco.push(valore)
    perVoce.set(r.p, elenco)
    esito.set(r.q, perVoce)
  }
  return esito
}

/**
 * L'anno sicuro fra quelli di una proprieta': fra i valori precisi almeno
 * all'anno, i preferiti se ce ne sono, e di questi il primo in ordine di tempo
 * (una data di pubblicazione e' la prima edizione, un inizio e' l'inizio).
 * Senza valori precisi, l'inizio scritto nei qualificatori. Nessuno se i valori
 * sono troppo lontani fra loro: vorrebbe dire che le fonti non sono d'accordo.
 */
export function annoSicuro(
  valori: readonly AnnoWikidata[] | undefined,
  { scarto = 5, ultimo = false }: { scarto?: number; ultimo?: boolean } = {},
): number | undefined {
  const scegli = (anni: number[]) => {
    if (anni.length === 0) return undefined
    const ordinati = [...anni].sort((a, b) => a - b)
    if (ordinati[ordinati.length - 1] - ordinati[0] > scarto) return undefined
    return ultimo ? ordinati[ordinati.length - 1] : ordinati[0]
  }
  const precisi = (valori ?? []).filter((v) => v.precisione >= 9)
  const scelti = precisi.some((v) => v.preferito) ? precisi.filter((v) => v.preferito) : precisi
  return (
    scegli(scelti.map((v) => v.anno)) ??
    scegli((valori ?? []).map((v) => v.inizio).filter((a): a is number => a !== undefined))
  )
}

/** Il nome di una voce in italiano: l'etichetta italiana, o quella di tutte le lingue se si accetta. */
export function nomeItaliano(s: Scheda | undefined, { mul = false } = {}): string | undefined {
  const nome = s?.it ?? (mul ? s?.mul : undefined)
  if (!nome) return undefined
  // Un'etichetta che e' un identificativo ("Q123") o vuota non e' un nome.
  if (/^Q\d+$/.test(nome)) return undefined
  // Una parentesi in minuscolo in fondo distingue la voce, come in Wikipedia: "Cavalleria leggera (operetta)".
  return nome.replace(/\s+\(\p{Ll}[^()]*\)$/u, '').replace(/'/g, '’')
}

/**
 * Il titolo italiano di un'opera: l'etichetta, o il titolo della voce di
 * Wikipedia in italiano senza la parentesi che la distingue ("Tosca (opera)").
 * Wikidata sta spostando i titoli uguali in tutte le lingue sotto "mul", e La
 * traviata e' rimasta senza etichetta italiana; la sua voce italiana si chiama
 * La traviata. Gli anni fra parentesi in fondo se ne vanno: "sacco di Roma
 * (1527)" darebbe la risposta a "in che anno?".
 */
export function titoloItaliano(s: Scheda | undefined): string | undefined {
  const titolo = nomeItaliano(s) ?? (s?.voce ? s.voce.replace(/\s*\([^()]*\)$/, '').replace(/'/g, '’') : undefined)
  return titolo?.replace(/\s+\(\d{1,4}(?:\s*[-–]\s*\d{1,4})?\)$/, '')
}

export function maiuscolaIniziale(s: string): string {
  return s.charAt(0).toLocaleUpperCase('it') + s.slice(1)
}

/**
 * La notorietà come posizione in classifica, da 1 (il piu' noto) a 0: come in
 * scripts/quiz/riassunto.ts, a pari valore decide l'identificativo, perché due
 * esecuzioni diano lo stesso file.
 */
export function perNotorieta<T extends { id: string }>(
  voci: readonly T[],
  valore: (t: T) => number,
): Map<string, number> {
  const ordinate = [...voci].sort((a, b) => valore(b) - valore(a) || confrontaId(a.id, b.id))
  const n = Math.max(1, ordinate.length - 1)
  return new Map(ordinate.map((t, i) => [t.id, Math.round((1 - i / n) * 1000) / 1000]))
}

/** Gli identificativi di Wikidata in ordine di numero: Q2 prima di Q10. */
export function confrontaId(a: string, b: string): number {
  const na = Number(a.slice(1))
  const nb = Number(b.slice(1))
  return Number.isFinite(na) && Number.isFinite(nb) && na !== nb ? na - nb : a.localeCompare(b)
}

/** Un elenco ordinato per notorietà, dalla piu' nota, e a pari notorietà per identificativo. */
export function perFama<T extends { id: string; f: number }>(voci: readonly T[]): T[] {
  return [...voci].sort((a, b) => b.f - a.f || confrontaId(a.id, b.id))
}

/**
 * Le voci italiane contano un po' di piu': il quiz e' per chi parla italiano, e
 * "Il quarto stato" si studia a scuola anche se ha meno Wikipedia della
 * "Colazione sull'erba".
 */
export const SPINTA_ITALIANA = 1.4

export const conSpinta = (voci: number, italiano: boolean) => voci * (italiano ? SPINTA_ITALIANA : 1)

/** I valori nell'ordine di Wikidata, dove si sa; quelli che l'ordine non ha vanno in fondo, dal piu' noto. */
export function inOrdine(
  elenco: readonly string[],
  ordine: readonly string[] | undefined,
  voci: (id: string) => number,
): string[] {
  const posizione = new Map((ordine ?? []).map((id, i) => [id, i]))
  const dove = (id: string) => posizione.get(id) ?? Number.MAX_SAFE_INTEGER
  return [...new Set(elenco)].sort((a, b) => dove(a) - dove(b) || voci(b) - voci(a) || confrontaId(a, b))
}

/** Un titolo senza accenti, maiuscole e punteggiatura. */
function titoloSemplice(n: string): string {
  return n
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’']/g, ' ')
    .replace(/[^\p{L}\p{N} ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const ARTICOLI_SINGOLARI = new Set(['il', 'lo', 'la', 'l', 'un', 'uno', 'una'])
const ARTICOLI_PLURALI = new Set(['i', 'gli', 'le'])

/** Un titolo senza articolo, accenti e punteggiatura: per riconoscere due opere con lo stesso nome. */
export function titoloNormale(n: string): string {
  const t = titoloSemplice(n)
  const primo = t.split(' ')[0]
  return ARTICOLI_SINGOLARI.has(primo) || ARTICOLI_PLURALI.has(primo) ? t.slice(primo.length + 1) : t
}

function numeroDelTitolo(n: string): 'singolare' | 'plurale' | undefined {
  const primo = titoloSemplice(n).split(' ')[0]
  return ARTICOLI_SINGOLARI.has(primo) ? 'singolare' : ARTICOLI_PLURALI.has(primo) ? 'plurale' : undefined
}

/**
 * Le voci che il titolo non distingue, a gruppi. L'articolo non conta: "La
 * Primavera" e "Primavera" si leggono come lo stesso quadro. Conta solo quando
 * tutte ce l'hanno e il numero e' diverso, perché allora e' l'articolo a dire
 * il titolo: "Le metamorfosi" sono di Ovidio, "La metamorfosi" e' di Kafka.
 */
export function stessiTitoli<T>(elenco: readonly T[], titolo: (x: T) => string): T[][] {
  const perTitolo = new Map<string, T[]>()
  for (const x of elenco) {
    const t = titoloNormale(titolo(x))
    perTitolo.set(t, [...(perTitolo.get(t) ?? []), x])
  }
  return [...perTitolo.values()].flatMap((gruppo) => {
    const numeri = gruppo.map((x) => numeroDelTitolo(titolo(x)))
    if (numeri.includes(undefined)) return [gruppo]
    return (['singolare', 'plurale'] as const)
      .map((n) => gruppo.filter((_, i) => numeri[i] === n))
      .filter((g) => g.length > 0)
  })
}

/**
 * Le voci con un titolo che dice un'opera sola. Fra due con lo stesso titolo
 * resta la piu' nota se ha almeno una volta e mezzo le Wikipedia dell'altra —
 * il Bacio di Klimt, non quello di Hayez — altrimenti nessuna: "Chi ha dipinto
 * l'Annunciazione?" avrebbe dieci risposte giuste. Le versioni della stessa
 * opera dello stesso autore non sono rivali: resta la piu' nota.
 */
export function titoliUnici(
  ids: readonly string[],
  titolo: (id: string) => string,
  voci: (id: string) => number,
  autore: (id: string) => string,
): string[] {
  const scartati = new Set<string>()
  for (const gruppo of stessiTitoli(ids, titolo)) {
    if (gruppo.length < 2) continue
    const [primo, ...altri] = [...gruppo].sort((a, b) => voci(b) - voci(a) || confrontaId(a, b))
    const rivali = altri.filter((id) => autore(id) !== autore(primo))
    for (const id of altri) scartati.add(id)
    if (rivali.length > 0 && voci(primo) < 1.5 * voci(rivali[0])) scartati.add(primo)
  }
  return ids.filter((id) => !scartati.has(id))
}

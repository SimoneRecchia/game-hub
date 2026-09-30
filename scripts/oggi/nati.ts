/**
 * Chi e' nato in ogni giorno dell'anno, da Wikidata: le persone con piu'
 * Wikipedia, con la data di nascita scritta fino al giorno, il nome in
 * italiano, due parole su chi sono ("fisico tedesco") e la voce italiana.
 *
 * Solo dal 1583: nell'RDF di Wikidata le date del calendario giuliano sono
 * convertite in gregoriano, e prima della riforma la conversione sposta il
 * giorno — Dante risulterebbe nato in un giorno che nessun libro dice. Dopo, la
 * data e' quella gregoriana anche per chi e' nato dove si usava ancora il
 * giuliano (Newton il 4 gennaio 1643, non il giorno di Natale del 1642).
 *
 * Due query: le 40.000 persone con piu' Wikipedia, e le 15.000 italiane con
 * piu' Wikipedia, perché la spinta agli italiani (×1,4) valga anche per chi
 * stava appena sotto il taglio.
 */

import type { NatoQuiz } from '../../shared/quiz-cultura'
import { perNotorieta } from './ordine'
import { sparqlPost, type Riga } from './rete'
import { ITALIE, leggiData, valori } from './voci'

export const NATI_PER_GIORNO = 20
export const SPINTA_ITALIANI = 1.4
const PRIMO_ANNO = 1583

/** Donna, anche transgender: la domanda dice "e' nata". */
const FEMMINE = new Set(['Q6581072', 'Q1052281'])

function query(scelta: string): string {
  return `SELECT ?p ?sl ?t ?prec ?rango ?nome ?desc ?titolo
    (GROUP_CONCAT(DISTINCT STR(?sesso); separator=" ") AS ?sessi)
    (GROUP_CONCAT(DISTINCT STR(?paese); separator=" ") AS ?paesi) WHERE {
  ${scelta}
  ?p p:P569 ?st . ?st psv:P569 ?nodo . ?nodo wikibase:timeValue ?t ; wikibase:timePrecision ?prec .
  OPTIONAL { ?st wikibase:rank ?rango }
  ?p rdfs:label ?nome . FILTER(LANG(?nome) = "it")
  OPTIONAL { ?p schema:description ?desc . FILTER(LANG(?desc) = "it") }
  OPTIONAL { ?art schema:about ?p ; schema:isPartOf <https://it.wikipedia.org/> ; schema:name ?titolo }
  OPTIONAL { ?p wdt:P21 ?sesso }
  OPTIONAL { ?p wdt:P27 ?paese }
}
GROUP BY ?p ?sl ?t ?prec ?rango ?nome ?desc ?titolo`
}

const Q_FAMOSI = query(`{ SELECT ?p ?sl WHERE {
      ?p wdt:P31 wd:Q5 ; wikibase:sitelinks ?sl .
    } ORDER BY DESC(?sl) LIMIT 40000 }`)

const Q_ITALIANI = query(`{ SELECT DISTINCT ?p ?sl WHERE {
      ?p wdt:P31 wd:Q5 ; wikibase:sitelinks ?sl ; wdt:P27 ?it .
      VALUES ?it { ${valori([...ITALIE])} }
    } ORDER BY DESC(?sl) LIMIT 15000 }`)

interface Persona {
  id: string
  sitelink: number
  nome: string
  descrizione?: string
  titolo?: string
  donna: boolean
  italiana: boolean
  /** Le date di nascita al giorno, con il rango dell'affermazione. */
  date: Array<{ anno: number; giorno: string; preferita: boolean }>
}

function raccogli(righe: Riga[], persone: Map<string, Persona>): void {
  for (const r of righe) {
    if (!r.p || !r.nome || !r.t) continue
    if ((r.rango ?? '').endsWith('DeprecatedRank')) continue
    const p =
      persone.get(r.p) ??
      ({
        id: r.p,
        sitelink: Number(r.sl ?? 0) || 0,
        nome: r.nome,
        descrizione: r.desc,
        titolo: r.titolo,
        donna: false,
        italiana: false,
        date: [],
      } satisfies Persona)
    // Un campo in piu' da una riga, se la prima non l'aveva: la prima riga non e' sempre la piu' completa.
    p.descrizione ??= r.desc
    p.titolo ??= r.titolo
    if ((r.sessi ?? '').split(' ').some((s) => FEMMINE.has(s))) p.donna = true
    if ((r.paesi ?? '').split(' ').some((s) => ITALIE.has(s))) p.italiana = true
    const d = leggiData('P569', r.t, Number(r.prec))
    if (d && d.precisione >= 11) {
      const giorno = `${String(d.mese).padStart(2, '0')}-${String(d.giorno).padStart(2, '0')}`
      const preferita = (r.rango ?? '').endsWith('PreferredRank')
      if (!p.date.some((x) => x.anno === d.anno && x.giorno === giorno && x.preferita === preferita)) {
        p.date.push({ anno: d.anno, giorno, preferita })
      }
    }
    persone.set(r.p, p)
  }
}

/**
 * Il giorno di nascita di una persona, se e' uno solo: le date "preferite", o
 * tutte se nessuna lo e'. Due date diverse — un giuliano scritto come
 * gregoriano, due fonti in disaccordo — e la persona non compare: nel dubbio,
 * meglio non dire che e' nata in un giorno in cui forse non e' nata.
 */
function nascita(p: Persona): { anno: number; giorno: string } | null {
  const preferite = p.date.filter((d) => d.preferita)
  const valide = preferite.length > 0 ? preferite : p.date
  const diverse = new Set(valide.map((d) => `${d.anno}-${d.giorno}`))
  if (diverse.size !== 1) return null
  return valide[0]
}

export interface NatiDellAnno {
  perGiorno: Map<string, NatoQuiz[]>
  /** Quante persone avevano due date di nascita diverse, e sono rimaste fuori. */
  incerte: number
}

export async function natiDellAnno(giorni: readonly string[]): Promise<NatiDellAnno> {
  const persone = new Map<string, Persona>()
  raccogli(await sparqlPost('oggi-nati-famosi', Q_FAMOSI), persone)
  raccogli(await sparqlPost('oggi-nati-italiani', Q_ITALIANI), persone)

  let incerte = 0
  const candidati = new Map<string, Array<{ p: Persona; anno: number; punteggio: number }>>(giorni.map((g) => [g, []]))
  for (const p of [...persone.values()].sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)))) {
    if (p.date.length === 0) continue
    const n = nascita(p)
    if (!n) {
      incerte += 1
      continue
    }
    if (n.anno < PRIMO_ANNO) continue
    candidati.get(n.giorno)?.push({ p, anno: n.anno, punteggio: p.sitelink * (p.italiana ? SPINTA_ITALIANI : 1) })
  }

  const perGiorno = new Map<string, NatoQuiz[]>()
  for (const [giorno, elenco] of candidati) {
    const scelti = elenco
      .sort(
        (a, b) =>
          b.punteggio - a.punteggio || b.p.sitelink - a.p.sitelink || Number(a.p.id.slice(1)) - Number(b.p.id.slice(1)),
      )
      .slice(0, NATI_PER_GIORNO)
    const fama = perNotorieta(scelti, (c) => c.punteggio)
    perGiorno.set(
      giorno,
      scelti
        .map((c): NatoQuiz => {
          const d = senzaDate(c.p.descrizione)
          return {
            id: c.p.id,
            n: nome(c.p.nome),
            anno: c.anno,
            ...(c.p.donna ? { fem: 1 } : {}),
            ...(d ? { d } : {}),
            ...(c.p.titolo ? { w: c.p.titolo } : {}),
            f: fama.get(c) ?? 0,
          }
        })
        .sort((a, b) => a.anno - b.anno || a.n.localeCompare(b.n)),
    )
  }
  return { perGiorno, incerte }
}

/** I titoli che in italiano si scrivono minuscoli nel discorso, e all'inizio di un nome no: "papa Pio VI". */
const TITOLI = /^(papa|santo|santa|san|beato|beata|re|regina|imperatore|imperatrice|principe|principessa|sultano) /

function nome(n: string): string {
  return TITOLI.test(n) ? n.charAt(0).toUpperCase() + n.slice(1) : n
}

/**
 * La descrizione senza le date: su Wikidata e' spesso "calciatore francese
 * (1993-)" o "papa dal 1775 al 1799", e la domanda "in che anno e' nato?"
 * avrebbe la risposta accanto. Se dopo aver tolto le parentesi con le cifre e
 * i "dal… al…" resta un anno, la descrizione non c'e'.
 */
export function senzaDate(d: string | undefined): string | undefined {
  if (!d) return undefined
  const t = d
    .replace(/\s*\([^()]*\d[^()]*\)/g, '')
    .replace(/,?\s*\b(?:dal|dall['’]|nel|nell['’]|fino al|tra il|fra il)\s*[^,;]*?\d{3,4}[^,;]*/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\s,;:]+$/, '')
  // Un numero di tre o quattro cifre e' un anno, a meno che non sia un ordinale: "250° vescovo di Roma".
  return t && !/(?<![\d°º])\d{3,4}(?![\d°º])/.test(t) ? t : undefined
}

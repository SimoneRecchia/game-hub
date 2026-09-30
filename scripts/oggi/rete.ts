/**
 * La rete di "Accadde oggi": Wikipedia una richiesta alla volta, con la
 * pazienza che Wikimedia chiede, e Wikidata con query in POST.
 *
 * Tutto passa da una cache su disco (scripts/.cache/oggi) che non scade, al
 * contrario di quella del quiz di geografia: le risposte sono 366 giornate
 * scaricate a qualche secondo l'una dall'altra, e un giro interrotto deve
 * poter ripartire da dove si era fermato. Stesse risposte in cache, stessi
 * file: per aggiornare i dati si cancella la cartella.
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const CACHE_OGGI = join(dirname(fileURLToPath(import.meta.url)), '..', '.cache', 'oggi')

/** Chi siamo: Wikimedia vuole un nome e un recapito, e con quelli generici risponde 429 prima. */
export const AGENTE = 'game-hub-quiz/1.0 (accadde oggi; https://github.com/SimoneRecchia/game-hub)'

const attendi = (ms: number) => new Promise<void>((fatto) => setTimeout(fatto, ms))

export function leggiCache(file: string): string | null {
  const percorso = join(CACHE_OGGI, file)
  return existsSync(percorso) ? readFileSync(percorso, 'utf8') : null
}

/** Prima in un file a parte, poi al suo posto: un giro interrotto a meta' non lascia un file tagliato. */
export function scriviCache(file: string, testo: string): void {
  const percorso = join(CACHE_OGGI, file)
  mkdirSync(dirname(percorso), { recursive: true })
  writeFileSync(`${percorso}.parziale`, testo)
  renameSync(`${percorso}.parziale`, percorso)
}

/* ────────────────────────────────  Wikipedia  ─────────────────────────────── */

/**
 * Il ritmo delle richieste a Wikimedia, che da questa macchina risponde 429
 * dopo tre richieste ravvicinate. Si parte da due secondi e mezzo; ogni 429
 * allarga la pausa, e una lunga fila di risposte buone la riporta giu' piano.
 */
const PAUSA_MINIMA_MS = 2_500
const PAUSA_MASSIMA_MS = 20_000
const ATTESA_DOPO_429_MS = 30_000
const ATTESA_MASSIMA_MS = 16 * 60_000
const GIRI_MASSIMI = 12

let pausa = PAUSA_MINIMA_MS
let buoneDiFila = 0
let prossimaRichiesta = 0

async function rispettaIlRitmo(): Promise<void> {
  const adesso = Date.now()
  if (prossimaRichiesta > adesso) await attendi(prossimaRichiesta - adesso)
  prossimaRichiesta = Date.now() + pausa
}

/** Secondi o data HTTP, come li scrive `retry-after`. */
function riprovaDopo(valore: string | null): number {
  if (!valore) return 0
  const secondi = Number(valore)
  if (Number.isFinite(secondi)) return secondi * 1000
  const quando = Date.parse(valore)
  return Number.isFinite(quando) ? Math.max(0, quando - Date.now()) : 0
}

/**
 * Il primo degli indirizzi che risponde con un testo `valido`, o `null` se
 * tutti rispondono 404: la risorsa non c'e'. Un 429 o un 5xx vuol dire che
 * bisogna aspettare: 30 secondi, poi 60, poi 120, fino a un quarto d'ora, o
 * quanto chiede `retry-after` se e' di piu'.
 */
export async function scaricaConPazienza(
  indirizzi: readonly string[],
  valido: (testo: string) => boolean,
): Promise<string | null> {
  let attesa = ATTESA_DOPO_429_MS
  const errori: string[] = []
  for (let giro = 0; giro < GIRI_MASSIMI; giro += 1) {
    let chiesto = 0
    let mancanti = 0
    for (const url of indirizzi) {
      await rispettaIlRitmo()
      try {
        const risposta = await fetch(url, {
          headers: { 'user-agent': AGENTE, 'api-user-agent': AGENTE, accept: 'application/json' },
          signal: AbortSignal.timeout(60_000),
        })
        const testo = await risposta.text()
        if (risposta.ok && valido(testo)) {
          buoneDiFila += 1
          if (buoneDiFila >= 30 && pausa > PAUSA_MINIMA_MS) {
            pausa = Math.max(PAUSA_MINIMA_MS, Math.round(pausa * 0.8))
            buoneDiFila = 0
          }
          return testo
        }
        errori.push(`${risposta.status} da ${url}`)
        if (risposta.status === 404) {
          mancanti += 1
          continue
        }
        if (risposta.status === 429 || risposta.status >= 500) {
          buoneDiFila = 0
          pausa = Math.min(PAUSA_MASSIMA_MS, Math.round(pausa * 1.5))
          chiesto = Math.max(chiesto, riprovaDopo(risposta.headers.get('retry-after')))
        }
      } catch (e) {
        errori.push(`${String(e)} da ${url}`)
      }
    }
    if (mancanti === indirizzi.length) return null
    const dopo = Math.min(ATTESA_MASSIMA_MS, Math.max(attesa, chiesto))
    console.log(`    ${errori[errori.length - 1]}: aspetto ${Math.round(dopo / 1000)} s (pausa ora ${pausa / 1000} s)`)
    await attendi(dopo)
    attesa = Math.min(ATTESA_MASSIMA_MS, attesa * 2)
  }
  throw new Error(`Non riesco a scaricare ${indirizzi[0]}:\n  ${errori.slice(-6).join('\n  ')}`)
}

/* ────────────────────────────────  Wikidata  ──────────────────────────────── */

const MOTORI = [
  { nome: 'QLever', url: 'https://qlever.dev/api/wikidata' },
  { nome: 'Wikidata', url: 'https://query.wikidata.org/sparql' },
]

const PREFISSI = `PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX p: <http://www.wikidata.org/prop/>
PREFIX ps: <http://www.wikidata.org/prop/statement/>
PREFIX psv: <http://www.wikidata.org/prop/statement/value/>
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX schema: <http://schema.org/>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
`

export type Riga = Record<string, string | undefined>

/**
 * Una query SPARQL in POST: con qualche migliaio di voci in un `VALUES`
 * l'indirizzo di una GET sarebbe troppo lungo. Come `sparql` di
 * scripts/quiz/fonti.ts prima QLever, poi il servizio di Wikidata, e le righe
 * ridotte a stringhe con gli identificativi senza prefisso.
 */
export async function sparqlPost(nome: string, corpo: string): Promise<Riga[]> {
  const query = PREFISSI + corpo
  const file = `wikidata/${nome}-${createHash('sha1').update(query).digest('hex').slice(0, 12)}.json`
  let testo = leggiCache(file)
  if (testo === null) {
    const errori: string[] = []
    for (const motore of MOTORI) {
      for (let tentativo = 0; tentativo < 3 && testo === null; tentativo += 1) {
        try {
          const risposta = await fetch(motore.url, {
            method: 'POST',
            headers: {
              'user-agent': AGENTE,
              accept: 'application/sparql-results+json',
              'content-type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({ query }).toString(),
            signal: AbortSignal.timeout(180_000),
          })
          const t = await risposta.text()
          if (!risposta.ok) throw new Error(`${risposta.status} ${t.slice(0, 200)}`)
          JSON.parse(t)
          testo = t
          console.log(`  ${nome}: da ${motore.nome}`)
        } catch (e) {
          errori.push(`${motore.nome}: ${String(e)}`)
          // QLever risponde 429 a chi chiede troppo, e qualche secondo non basta.
          await attendi(String(e).includes('429') ? 20_000 * (tentativo + 1) : 2_000 * 2 ** tentativo)
        }
      }
      if (testo !== null) break
    }
    if (testo === null) throw new Error(`La query "${nome}" non e' andata:\n  ${errori.join('\n  ')}`)
    scriviCache(file, testo)
  }
  const risultato = JSON.parse(testo) as { results: { bindings: Array<Record<string, { value: string }>> } }
  return risultato.results.bindings.map((b) => {
    const riga: Riga = {}
    for (const [k, v] of Object.entries(b)) {
      riga[k] = v.value.replace(/<?http:\/\/www\.wikidata\.org\/entity\/(Q\d+)>?/g, '$1')
    }
    return riga
  })
}

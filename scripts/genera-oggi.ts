/**
 * Prepara "Accadde oggi" del quiz: un file per ogni giorno dell'anno,
 * public/dati/quiz/oggi/MM-DD.json (il 29 febbraio compreso), con i fatti e i
 * nati di quel giorno nella forma di `DatiOggi` (shared/quiz-cultura.ts).
 *
 *   npx vite-node scripts/genera-oggi.ts
 *   npx vite-node scripts/genera-oggi.ts -- --mostra 03-15,07-20    tenuti e scartati di quei giorni
 *
 * I fatti vengono dall'"Accadde oggi" di Wikipedia in italiano (scripts/oggi/
 * eventi.ts), e fra tutti si tengono quelli abbastanza noti: i quattro o sei
 * che la prima pagina sceglie per quel giorno, poi gli altri per notorietà
 * misurata su Wikidata (scripts/oggi/notorieta.ts). I nati vengono da Wikidata
 * (scripts/oggi/nati.ts).
 *
 * Wikimedia risponde 429 a chi chiede troppo in fretta: le 732 pagine del feed
 * si scaricano una alla volta, con qualche secondo fra l'una e l'altra, e il
 * primo giro dura una quarantina di minuti. Tutto resta in scripts/.cache/oggi
 * senza scadenza: un giro interrotto riparte da dove era, e con la cache
 * piena i file escono identici. Per aggiornare le fonti si cancella la cache.
 */

import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { DatiOggi } from '../shared/quiz-cultura'
import { GIORNI, scaricaFeed } from './oggi/eventi'
import { FATTI_MINIMI, SOGLIA, fattiDelGiorno, type Candidato, type FattiDelGiorno } from './oggi/fatti'
import { natiDellAnno } from './oggi/nati'
import { leggiVoci } from './oggi/voci'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
/** Sotto /dati/, che `_headers` tiene in cache per sempre: /quiz/ sono anche le pagine dell'app. */
const USCITA = join(ROOT, 'public', 'dati', 'quiz', 'oggi')

/**
 * Fatti che chiunque sa, e che se mancano vogliono dire che una fonte o il
 * punteggio sono cambiati sotto i piedi: meglio uno script fermo che un
 * "Accadde oggi" senza la presa della Bastiglia.
 */
const DEVONO_ESSERCI: Array<[string, number, RegExp]> = [
  ['03-15', -44, /Cesare/],
  ['07-14', 1789, /Bastiglia/],
  ['07-20', 1969, /Apollo 11/],
  ['09-11', 2001, /11 settembre|Torri/],
  ['10-12', 1492, /Colombo/],
  ['11-09', 1989, /Muro di Berlino/],
  ['04-25', 1945, /liberazione/i],
  ['06-02', 1946, /referendum|repubblica/i],
]

function mediana(valori: number[]): number {
  const o = [...valori].sort((a, b) => a - b)
  return o[Math.floor(o.length / 2)]
}

function descrivi(c: Candidato): string {
  const v = c.valutazione
  const perche = c.motivo ?? (c.lungo ? 'frase lunga' : c.scelto ? 'prima pagina' : '')
  const voce = v.principale ? ` → ${v.principale.pagina.title.replace(/_/g, ' ')}` : ''
  const testo = (c.testo ?? c.evento.text).slice(0, 100)
  const numeri = `${String(v.punteggio).padStart(6)}  ${String(c.evento.year).padStart(5)}`
  return `${numeri}  ${testo}${voce}${perche ? `  [${perche}]` : ''}`
}

async function main(): Promise<void> {
  const argomenti = process.argv.slice(2)
  const i = argomenti.indexOf('--mostra')
  const mostra = i >= 0 ? (argomenti[i + 1] ?? '').split(',').filter(Boolean) : []

  console.log('I fatti, da Wikipedia')
  const eventi = await scaricaFeed('events', GIORNI)
  const scelti = await scaricaFeed('selected', GIORNI)
  const identificativi = [...eventi.values(), ...scelti.values()]
    .flat()
    .flatMap((e) => (e.pages ?? []).map((p) => p.wikibase_item ?? ''))
  const voci = await leggiVoci(identificativi)

  console.log('I nati, da Wikidata')
  const { perGiorno: nati, incerte } = await natiDellAnno(GIORNI)

  const esiti = new Map<string, FattiDelGiorno>()
  const file = new Map<string, string>()
  for (const giorno of GIORNI) {
    const esito = fattiDelGiorno(giorno, eventi.get(giorno) ?? [], scelti.get(giorno) ?? [], voci)
    esiti.set(giorno, esito)
    const dati = { giorno, fatti: esito.fatti, nati: nati.get(giorno) ?? [] }
    const versione = createHash('sha1').update(JSON.stringify(dati)).digest('hex').slice(0, 10)
    const completo: DatiOggi = { versione, ...dati }
    file.set(giorno, JSON.stringify(completo))
  }

  for (const giorno of mostra) {
    const esito = esiti.get(giorno)
    if (!esito) continue
    console.log(`\n${giorno}: tenuti ${esito.tenuti.length}`)
    for (const c of esito.tenuti) console.log(`  + ${descrivi(c)}`)
    console.log('  scartati:')
    for (const c of [...esito.scartati].sort((a, b) => b.valutazione.punteggio - a.valutazione.punteggio)) {
      console.log(`  - ${descrivi(c)}`)
    }
  }

  /* ── I controlli ── */
  const problemi: string[] = []
  for (const [giorno, anno, testo] of DEVONO_ESSERCI) {
    if (!esiti.get(giorno)?.fatti.some((f) => f.anno === anno && testo.test(`${f.t} ${f.w ?? ''}`))) {
      problemi.push(`manca il fatto del ${giorno} ${anno} (${testo})`)
    }
  }
  for (const giorno of GIORNI) {
    const fatti = esiti.get(giorno)!.fatti.length
    // Il 29 febbraio ha otto fatti in tutto: gli altri giorni ne hanno abbastanza per il minimo.
    const possibili = (eventi.get(giorno)?.length ?? 0) + (scelti.get(giorno)?.length ?? 0)
    if (fatti < FATTI_MINIMI && possibili >= FATTI_MINIMI + 6) problemi.push(`${giorno}: solo ${fatti} fatti`)
    const quanti = nati.get(giorno)?.length ?? 0
    if (quanti < FATTI_MINIMI) problemi.push(`${giorno}: solo ${quanti} nati`)
  }
  if (problemi.length > 0) {
    console.error(`\nNon scrivo niente:\n  ${problemi.join('\n  ')}`)
    process.exit(1)
  }

  mkdirSync(USCITA, { recursive: true })
  let byte = 0
  for (const [giorno, testo] of file) {
    writeFileSync(join(USCITA, `${giorno}.json`), testo)
    byte += Buffer.byteLength(testo)
  }

  /* ── Il riassunto ── */
  const tutti = [...esiti.values()]
  const tenuti = tutti.flatMap((e) => e.tenuti)
  const scartati = tutti.flatMap((e) => e.scartati)
  const conta = (f: (c: Candidato) => boolean) => scartati.filter(f).length
  const quantiFatti = tutti.map((e) => e.fatti.length)
  const quantiNati = [...nati.values()].map((n) => n.length)
  const pochi = GIORNI.filter((g) => esiti.get(g)!.fatti.length < FATTI_MINIMI)
  const kB = (n: number) => (n / 1024).toFixed(1)
  const intervallo = (n: number[]) => `min ${Math.min(...n)}, mediana ${mediana(n)}, max ${Math.max(...n)}`
  const sotto = tenuti.filter((c) => !c.scelto && c.valutazione.punteggio < SOGLIA).length
  console.log(`\n${file.size} file in public/dati/quiz/oggi, ${kB(byte)} kB (${kB(byte / file.size)} kB in media)`)
  console.log(`  fatti per giorno: ${intervallo(quantiFatti)}`)
  console.log(`    dalla prima pagina ${tenuti.filter((c) => c.scelto).length}`)
  console.log(`    sotto la soglia, per arrivare al minimo ${sotto}`)
  console.log(`    giorni con meno di ${FATTI_MINIMI}: ${pochi.join(', ') || 'nessuno'}`)
  console.log(`  nati per giorno: ${intervallo(quantiNati)} (${incerte} con due date di nascita, lasciati fuori)`)
  console.log('  frasi scartate:')
  console.log(`    lunghe anche accorciate ${conta((c) => c.lungo)}`)
  console.log(`    con il proprio anno ${conta((c) => c.motivo === 'contiene il suo anno')}`)
  console.log(`    doppie ${conta((c) => c.motivo === 'doppio')}, anno zero ${conta((c) => c.motivo === 'anno zero')}`)
  console.log(`    senza testo ${conta((c) => c.motivo === 'senza testo')}`)
  const accorciate = tutti.reduce((s, e) => s + e.accorciati, 0)
  const senzaAnno = tutti.reduce((s, e) => s + e.senzaAnno, 0)
  console.log(`  frasi tenute: accorciate ${accorciate}, senza il proprio anno ${senzaAnno}`)
}

await main()

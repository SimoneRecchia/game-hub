/**
 * Prepara il quiz di geografia: il riassunto dei dati e le domande dei prossimi
 * giorni, in D1.
 *
 * Il riassunto e' quel che serve per fare domande — paesi, capitali, confini,
 * coste, fiumi, laghi — ridotto da Wikidata e Natural Earth a qualche decina di
 * kB (vedi scripts/quiz). Si riscrive solo se e' cambiato: di solito una notte
 * su molte. Le partite libere lo scaricano nel browser.
 *
 * Le domande della classificata si fanno qui e non nel Worker per la stessa
 * ragione del cruciverba: servono i dati interi, e i dieci millisecondi di CPU
 * di una richiesta non basterebbero a leggerli. Solo le giornate che mancano,
 * con `INSERT OR IGNORE`: le domande di un giorno, una volta scritte, non
 * cambiano piu' — sono la stessa partita per tutti. Il seme e' il numero del
 * giorno, e i soggetti delle ultime cinque settimane della stessa categoria si
 * evitano, così la capitale della Francia non torna ogni sette giorni.
 *
 *   npx vite-node scripts/genera-quiz.ts                 anteprima di oggi, senza scrivere
 *   npx vite-node scripts/genera-quiz.ts -- --local      D1 locale di wrangler
 *   npx vite-node scripts/genera-quiz.ts -- --remote     produzione
 *   … --giorni 60                                        quanti giorni da oggi
 *   … --se-manca                                         niente fonti se e' gia' tutto pronto
 *
 * `--se-manca` e' per il deploy: le fonti sono servizi di altri, e se tutto e'
 * gia' pronto non c'e' ragione di chiederle — né di fermare una pubblicazione
 * perché uno di loro non risponde.
 */

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gameDate, mulberry32, puzzleNumberFor } from '../shared/daily'
import { DOMANDE_PER_PARTITA, NOMI_CATEGORIE, categoriaDelGiorno, type CategoriaQuiz } from '../shared/quiz'
import { SEZIONI_DATI, type DatiQuiz } from '../shared/quiz-dati'
import { domandeDelGiorno, indicizza, type DomandaCompleta } from '../shared/quiz-domande'
import type { Topologia } from '../shared/topojson'
import {
  Q_CAPITALI,
  Q_CITTA,
  Q_CONFINI,
  Q_FIUMI,
  Q_LAGHI,
  Q_PAESI,
  URL_MARI,
  URL_PAESI,
  geometria,
  qAcque,
  sparql,
} from './quiz/fonti'
import { controllaRiassunto, costruisciRiassunto, type Fonti } from './quiz/riassunto'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const DB = 'game-hub-db'

/** Quanti giorni indietro guardare per non ripetere i soggetti. */
const MEMORIA_GIORNI = 35

const argomenti = process.argv.slice(2)
function argomento(nome: string, predefinito: string): string {
  const i = argomenti.indexOf(`--${nome}`)
  return i >= 0 ? argomenti[i + 1] : predefinito
}
const REMOTO = argomenti.includes('--remote')
const LOCALE = argomenti.includes('--local')
const SCRIVE = REMOTO || LOCALE
const GIORNI = Number(argomento('giorni', REMOTO ? '60' : '14'))
const DA = Number(argomento('da', String(puzzleNumberFor(gameDate()))))
const SE_MANCA = argomenti.includes('--se-manca')

function wrangler(parametri: string[]): string {
  return execFileSync('npx', ['wrangler', 'd1', 'execute', DB, REMOTO ? '--remote' : '--local', ...parametri], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'inherit'],
    maxBuffer: 64 * 1024 * 1024,
  }).toString()
}

function interroga<T>(sql: string): T[] {
  const uscita = wrangler(['--json', '--command', sql])
  return JSON.parse(uscita.slice(uscita.indexOf('[')))[0].results as T[]
}

const cita = (s: string) => `'${s.replace(/'/g, "''")}'`

function semeDelGiorno(numero: number): number {
  return (0x7a1c_0de5 ^ Math.imul(numero, 0x9e37_79b1)) >>> 0
}

/* ───────────────────────────────  I dati  ─────────────────────────────── */

if (SCRIVE && SE_MANCA) {
  const [giornate] = interroga<{ n: number }>(
    `SELECT COUNT(*) AS n FROM quiz_giornate WHERE puzzle_number >= ${DA} AND puzzle_number < ${DA + GIORNI}`,
  )
  const [sezioni] = interroga<{ n: number }>('SELECT COUNT(*) AS n FROM quiz_dati')
  if (giornate.n === GIORNI && sezioni.n === SEZIONI_DATI.length) {
    console.log(`Quiz: le ${GIORNI} giornate e il riassunto ci sono già`)
    process.exit(0)
  }
}

console.log('Quiz: le fonti')
const [paesi, capitali, confini, citta, fiumi, laghi, topologia, mari] = await Promise.all([
  sparql('paesi', Q_PAESI),
  sparql('capitali', Q_CAPITALI),
  sparql('confini', Q_CONFINI),
  sparql('citta', Q_CITTA),
  sparql('fiumi', Q_FIUMI),
  sparql('laghi', Q_LAGHI),
  geometria<Topologia>(URL_PAESI),
  geometria<Fonti['mari']>(URL_MARI),
])
const idAcque = [
  ...new Set(mari.features.map((f) => String(f.properties.wikidataid ?? '')).filter((q) => /^Q\d+$/.test(q))),
]
const acque = await sparql('acque', qAcque(idAcque))

const dati: DatiQuiz = costruisciRiassunto(
  { paesi, capitali, confini, citta, fiumi, laghi, acque, topologia, mari },
  gameDate(),
)
const problemi = controllaRiassunto(dati)
if (problemi.length > 0) {
  console.error(`Il riassunto non torna:\n  ${problemi.join('\n  ')}`)
  process.exit(1)
}

/** Ogni sezione in JSON, e una versione che cambia solo se cambia il contenuto. */
const sezioni = Object.fromEntries(
  SEZIONI_DATI.map((s) => [s, JSON.stringify(dati[s])]),
) as Record<(typeof SEZIONI_DATI)[number], string>
const impronta = createHash('sha1')
  .update(SEZIONI_DATI.map((s) => sezioni[s]).join('\n'))
  .digest('hex')
  .slice(0, 10)
const versione = impronta
console.log(
  `  ${dati.paesi.length} paesi, ${dati.acque.length} acque, ${dati.fiumi.length} fiumi, ${dati.laghi.length} laghi` +
    ` — ${SEZIONI_DATI.map((s) => `${s} ${Math.round(sezioni[s].length / 1024)} kB`).join(', ')}`,
)

const istruzioni: string[] = []
const adesso = new Date().toISOString()

if (SCRIVE) {
  const salvata = interroga<{ versione: string }>("SELECT versione FROM quiz_dati WHERE parte = 'paesi'")[0]?.versione
  if (salvata === versione) {
    console.log(`  il riassunto e' lo stesso (${versione}): non lo riscrivo`)
  } else {
    for (const s of SEZIONI_DATI) {
      istruzioni.push(
        `INSERT OR REPLACE INTO quiz_dati (parte, versione, dati, updated_at) VALUES (${cita(s)}, ${cita(versione)}, ${cita(sezioni[s])}, ${cita(adesso)});`,
      )
    }
    console.log(`  riassunto nuovo: ${salvata ?? 'nessuno'} → ${versione}`)
  }
}

/* ─────────────────────────────  Le giornate  ───────────────────────────── */

const ix = indicizza(dati)
const esistenti = new Map<number, { categoria: CategoriaQuiz; domande: DomandaCompleta[] }>()
if (SCRIVE) {
  for (const r of interroga<{ puzzle_number: number; categoria: CategoriaQuiz; domande: string }>(
    `SELECT puzzle_number, categoria, domande FROM quiz_giornate
      WHERE puzzle_number >= ${DA - MEMORIA_GIORNI} AND puzzle_number < ${DA + GIORNI}`,
  )) {
    esistenti.set(r.puzzle_number, { categoria: r.categoria, domande: JSON.parse(r.domande) })
  }
}
const giaFatte = [...esistenti.keys()].filter((n) => n >= DA).length
console.log(`Quiz: le giornate dal ${DA} al ${DA + GIORNI - 1}, ${giaFatte} già pronte`)

for (let numero = DA; numero < DA + GIORNI; numero += 1) {
  if (esistenti.has(numero)) continue
  const categoria = categoriaDelGiorno(numero)
  const evitare = new Set<string>()
  for (let prima = numero - MEMORIA_GIORNI; prima < numero; prima += 1) {
    const g = esistenti.get(prima)
    if (g?.categoria === categoria) for (const d of g.domande) evitare.add(d.soggetto)
  }
  const domande = domandeDelGiorno(ix, categoria, mulberry32(semeDelGiorno(numero)), evitare)
  if (domande.length !== DOMANDE_PER_PARTITA) {
    console.error(`  #${numero} (${categoria}): solo ${domande.length} domande su ${DOMANDE_PER_PARTITA}`)
    process.exit(1)
  }
  esistenti.set(numero, { categoria, domande })
  istruzioni.push(
    'INSERT OR IGNORE INTO quiz_giornate (puzzle_number, categoria, domande, created_at) VALUES (' +
      [numero, cita(categoria), cita(JSON.stringify(domande)), cita(adesso)].join(', ') +
      ');',
  )
  console.log(`  #${numero} ${NOMI_CATEGORIE[categoria]}: ${domande.map((d) => d.risposta).join(', ')}`)
  if (!SCRIVE) {
    for (const d of domande) {
      const opzioni = d.opzioni.map((o) => (o.id === d.giusta ? `[${o.testo}]` : o.testo)).join(' · ')
      console.log(`     ${d.testo}  ${opzioni || `→ ${d.risposta} (${d.cartina?.vista})`}`)
    }
    break
  }
}

if (SCRIVE && istruzioni.length > 0) {
  const cartella = join(HERE, '.cache')
  mkdirSync(cartella, { recursive: true })
  const file = join(cartella, 'quiz.sql')
  writeFileSync(file, istruzioni.join('\n'))
  const parametri = [`--file=${file}`]
  if (REMOTO) parametri.push('--yes')
  console.log(`  scrivo ${istruzioni.length} righe su ${REMOTO ? 'PRODUZIONE' : 'locale'}…`)
  wrangler(parametri)
}

/**
 * Prepara i sudoku classificati dei prossimi giorni, in D1.
 *
 * Si fanno qui e non nel Worker: togliere le caselle controllando che la
 * soluzione resti una sola, e misurare la difficoltà risolvendo ragionando,
 * costa qualche decimo di secondo per schema, e i dieci millisecondi di CPU di
 * una richiesta non basterebbero. Solo le giornate che mancano, con
 * `INSERT OR IGNORE`: uno schema scritto non cambia piu'. E' deterministico
 * dal numero del giorno (shared/sudoku.ts), e il livello viene dal giorno
 * della settimana.
 *
 *   npx vite-node scripts/genera-sudoku.ts                 anteprima di oggi, senza scrivere
 *   npx vite-node scripts/genera-sudoku.ts -- --local      D1 locale di wrangler
 *   npx vite-node scripts/genera-sudoku.ts -- --remote     produzione
 *   … --giorni 60                                          quanti giorni da oggi
 */

import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dateForPuzzleNumber, gameDate, puzzleNumberFor } from '../shared/daily'
import { NOMI_LIVELLI, quanteDate, schemaDelGiorno } from '../shared/sudoku'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const DB = 'game-hub-db'

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

function wrangler(parametri: string[]): string {
  return execFileSync('npx', ['wrangler', 'd1', 'execute', DB, REMOTO ? '--remote' : '--local', ...parametri], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'inherit'],
    maxBuffer: 16 * 1024 * 1024,
  }).toString()
}

function interroga<T>(sql: string): T[] {
  const uscita = wrangler(['--json', '--command', sql])
  return JSON.parse(uscita.slice(uscita.indexOf('[')))[0].results as T[]
}

const cita = (s: string) => `'${s.replace(/'/g, "''")}'`

const numeri = Array.from({ length: GIORNI }, (_, i) => DA + i)
const presenti = SCRIVE
  ? new Set(
      interroga<{ puzzle_number: number }>(
        `SELECT puzzle_number FROM sudoku_schemi WHERE puzzle_number BETWEEN ${DA} AND ${DA + GIORNI - 1}`,
      ).map((r) => r.puzzle_number),
    )
  : new Set<number>()
const mancanti = numeri.filter((n) => !presenti.has(n))
if (SCRIVE && mancanti.length === 0) {
  console.log(`Sudoku: le ${GIORNI} giornate ci sono già`)
  process.exit(0)
}

const adesso = new Date().toISOString()
const righe: string[] = []
for (const numero of SCRIVE ? mancanti : numeri.slice(0, 1)) {
  const data = dateForPuzzleNumber(numero)
  const inizio = performance.now()
  const schema = schemaDelGiorno(numero, data)
  if (!schema) {
    // Non succede con i tentativi di adesso; se succedesse, meglio fermarsi che scrivere uno schema sbagliato.
    console.error(`Sudoku #${numero} (${data}): nessuno schema del livello giusto`)
    process.exit(1)
  }
  console.log(
    `  #${numero} ${data} ${NOMI_LIVELLI[schema.livello]}, ${quanteDate(schema.dati)} date, ` +
      `${Math.round(performance.now() - inizio)} ms  ${schema.dati}`,
  )
  righe.push(
    `INSERT OR IGNORE INTO sudoku_schemi (puzzle_number, livello, dati, soluzione, created_at) VALUES ` +
      `(${numero}, ${cita(schema.livello)}, ${cita(schema.dati)}, ${cita(schema.soluzione)}, ${cita(adesso)});`,
  )
}

if (SCRIVE) {
  console.log(`  scrivo ${righe.length} giornate su ${REMOTO ? 'produzione' : 'locale'}…`)
  wrangler(['--command', righe.join('\n')])
}

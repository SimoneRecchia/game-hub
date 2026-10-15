/**
 * Prepara i sudoku classificati dei prossimi giorni, in D1.
 *
 * Si fanno qui e non nel Worker: togliere le caselle controllando che la
 * soluzione resti una sola, e misurare la difficoltà risolvendo ragionando,
 * costa qualche decimo di secondo per schema, e i dieci millisecondi di CPU di
 * una richiesta non basterebbero. Le giornate che mancano, con
 * `INSERT OR IGNORE`; e quelle dei giorni che devono venire e che nessuno ha
 * aperto, se il generatore adesso le farebbe diverse: e' quel che e' successo
 * quando la classificata e' diventata facile tutti i giorni. Oggi e i giorni
 * passati non cambiano, e l'aggiornamento e' condizionato a nessuna partita,
 * per una giornata aperta nel frattempo. E' deterministico dal numero del
 * giorno (shared/sudoku.ts).
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
import { NOMI_LIVELLI, quanteDate, schemaDelGiorno, type SchemaSudoku } from '../shared/sudoku'

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
const OGGI = puzzleNumberFor(gameDate())
const fine = DA + GIORNI - 1
const scritti = SCRIVE
  ? new Map(
      interroga<{ puzzle_number: number; dati: string }>(
        `SELECT puzzle_number, dati FROM sudoku_schemi WHERE puzzle_number BETWEEN ${DA} AND ${fine}`,
      ).map((r) => [r.puzzle_number, r.dati]),
    )
  : new Map<number, string>()
const aperti = SCRIVE
  ? new Set(
      interroga<{ puzzle_number: number }>(
        `SELECT DISTINCT puzzle_number FROM sudoku_games WHERE puzzle_number BETWEEN ${DA} AND ${fine}`,
      ).map((r) => r.puzzle_number),
    )
  : new Set<number>()
// Da scrivere: quelle che mancano, e quelle future che nessuno ha aperto (si guarda se sono cambiate).
const daGuardare = SCRIVE
  ? numeri.filter((n) => !scritti.has(n) || (n > OGGI && !aperti.has(n)))
  : numeri.slice(0, 1)

function schemaDi(numero: number): SchemaSudoku {
  const data = dateForPuzzleNumber(numero)
  const inizio = performance.now()
  const schema = schemaDelGiorno(numero)
  if (!schema) {
    // Non succede con i tentativi di adesso; se succedesse, meglio fermarsi che scrivere uno schema sbagliato.
    console.error(`Sudoku #${numero} (${data}): nessuno schema del livello giusto`)
    process.exit(1)
  }
  console.log(
    `  #${numero} ${data} ${NOMI_LIVELLI[schema.livello]}, ${quanteDate(schema.dati)} date, ` +
      `${Math.round(performance.now() - inizio)} ms  ${schema.dati}`,
  )
  return schema
}

const adesso = new Date().toISOString()
const righe: string[] = []
let rifatte = 0
for (const numero of daGuardare) {
  const schema = schemaDi(numero)
  const prima = scritti.get(numero)
  if (prima === undefined) {
    righe.push(
      `INSERT OR IGNORE INTO sudoku_schemi (puzzle_number, livello, dati, soluzione, created_at) VALUES ` +
        `(${numero}, ${cita(schema.livello)}, ${cita(schema.dati)}, ${cita(schema.soluzione)}, ${cita(adesso)});`,
    )
  } else if (prima !== schema.dati) {
    rifatte += 1
    righe.push(
      `UPDATE sudoku_schemi SET livello = ${cita(schema.livello)}, dati = ${cita(schema.dati)}, ` +
        `soluzione = ${cita(schema.soluzione)}, created_at = ${cita(adesso)} ` +
        `WHERE puzzle_number = ${numero} AND NOT EXISTS (SELECT 1 FROM sudoku_games WHERE puzzle_number = ${numero});`,
    )
  }
}

if (SCRIVE && righe.length === 0) {
  console.log(`Sudoku: le ${GIORNI} giornate ci sono già`)
  process.exit(0)
}

if (SCRIVE) {
  console.log(
    `  scrivo ${righe.length - rifatte} giornate nuove e ne rifaccio ${rifatte} su ${REMOTO ? 'produzione' : 'locale'}…`,
  )
  wrangler(['--command', righe.join('\n')])
}

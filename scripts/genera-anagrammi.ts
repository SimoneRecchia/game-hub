/**
 * Prepara gli Anagrammi dei prossimi giorni, in D1.
 *
 * Le parole di un giorno vengono dall'elenco delle classificate
 * (scripts/data/anagrammi.tsv.gz, che fa scripts/build-anagrammi.mjs) e dal
 * numero del giorno (`paroleDelGiorno` in shared/anagrammi.ts): stesse parole e
 * stesse lettere mescolate per tutti. Si scrivono con `INSERT OR IGNORE`, come
 * le giornate del quiz: una giornata scritta non cambia piu', anche se
 * l'elenco si rifa'. Nel Worker non si fanno perché vorrebbero l'elenco intero.
 *
 *   npx vite-node scripts/genera-anagrammi.ts                 anteprima di oggi, senza scrivere
 *   npx vite-node scripts/genera-anagrammi.ts -- --local      D1 locale di wrangler
 *   npx vite-node scripts/genera-anagrammi.ts -- --remote     produzione
 *   … --giorni 60                                             quanti giorni da oggi
 */

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { elencoDaTsv, paroleDelGiorno } from '../shared/anagrammi'
import { dateForPuzzleNumber, gameDate, puzzleNumberFor } from '../shared/daily'

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

const elenco = elencoDaTsv(gunzipSync(readFileSync(join(HERE, 'data', 'anagrammi.tsv.gz'))).toString('utf8'))

const numeri = Array.from({ length: GIORNI }, (_, i) => DA + i)
const presenti = SCRIVE
  ? new Set(
      interroga<{ puzzle_number: number }>(
        `SELECT puzzle_number FROM anagrammi_giornate WHERE puzzle_number BETWEEN ${DA} AND ${DA + GIORNI - 1}`,
      ).map((r) => r.puzzle_number),
    )
  : new Set<number>()
const mancanti = numeri.filter((n) => !presenti.has(n))
if (SCRIVE && mancanti.length === 0) {
  console.log(`Anagrammi: le ${GIORNI} giornate ci sono già`)
  process.exit(0)
}

const adesso = new Date().toISOString()
const righe: string[] = []
for (const numero of SCRIVE ? mancanti : numeri.slice(0, 1)) {
  const parole = paroleDelGiorno(numero, elenco)
  const anteprima = parole.map((p) => `${p.lettere}→${p.parola}`).join('  ')
  console.log(`  #${numero} ${dateForPuzzleNumber(numero)}  ${anteprima}`)
  righe.push(
    `INSERT OR IGNORE INTO anagrammi_giornate (puzzle_number, parole, formato, created_at) VALUES ` +
      `(${numero}, ${cita(JSON.stringify(parole))}, 1, ${cita(adesso)});`,
  )
}

if (SCRIVE) {
  console.log(`  scrivo ${righe.length} giornate su ${REMOTO ? 'produzione' : 'locale'}…`)
  wrangler(['--command', righe.join('\n')])
}

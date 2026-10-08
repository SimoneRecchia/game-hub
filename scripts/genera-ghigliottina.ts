/**
 * Prepara le Ghigliottine dei prossimi giorni, in D1.
 *
 * La partita di un giorno viene dall'elenco delle classificate
 * (scripts/data/ghigliottina-classificate.json, che fa
 * scripts/build-ghigliottina.mjs) e dal numero del giorno
 * (`ghigliottinaDelGiorno` in shared/ghigliottina.ts): la stessa parola
 * vincente, le stesse coppie nello stesso ordine per tutti. Si scrivono con
 * `INSERT OR IGNORE`, come le giornate degli Anagrammi: una giornata scritta non
 * cambia piu', anche se l'elenco si rifa'.
 *
 *   npx vite-node scripts/genera-ghigliottina.ts                 anteprima di oggi, senza scrivere
 *   npx vite-node scripts/genera-ghigliottina.ts -- --local      D1 locale di wrangler
 *   npx vite-node scripts/genera-ghigliottina.ts -- --remote     produzione
 *   … --giorni 60                                                quanti giorni da oggi
 */

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ghigliottinaDelGiorno, type GhigliottinaDellElenco } from '../shared/ghigliottina'
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

const elenco = JSON.parse(
  readFileSync(join(HERE, 'data', 'ghigliottina-classificate.json'), 'utf8'),
) as GhigliottinaDellElenco[]

const numeri = Array.from({ length: GIORNI }, (_, i) => DA + i)
const presenti = SCRIVE
  ? new Set(
      interroga<{ puzzle_number: number }>(
        `SELECT puzzle_number FROM ghigliottina_giornate WHERE puzzle_number BETWEEN ${DA} AND ${DA + GIORNI - 1}`,
      ).map((r) => r.puzzle_number),
    )
  : new Set<number>()
const mancanti = numeri.filter((n) => !presenti.has(n))
if (SCRIVE && mancanti.length === 0) {
  console.log(`Ghigliottina: le ${GIORNI} giornate ci sono già`)
  process.exit(0)
}

const adesso = new Date().toISOString()
const righe: string[] = []
for (const numero of SCRIVE ? mancanti : numeri.slice(0, 1)) {
  const giorno = ghigliottinaDelGiorno(numero, elenco)
  const anteprima = giorno.coppie.map((c) => c.parole[c.giusta]).join(', ')
  console.log(`  #${numero} ${dateForPuzzleNumber(numero)}  ${giorno.soluzione.toUpperCase()}: ${anteprima}`)
  righe.push(
    `INSERT OR IGNORE INTO ghigliottina_giornate (puzzle_number, ghigliottina, formato, created_at) VALUES ` +
      `(${numero}, ${cita(JSON.stringify(giorno))}, 1, ${cita(adesso)});`,
  )
}

if (SCRIVE) {
  console.log(`  scrivo ${righe.length} giornate su ${REMOTO ? 'produzione' : 'locale'}…`)
  wrangler(['--command', righe.join('\n')])
}

/**
 * Prepara le griglie del Paroliere dei prossimi giorni, in D1.
 *
 * La griglia di un giorno la tirano i dadi con un seme del numero del giorno
 * (`grigliaDelGiorno` in shared/paroliere.ts), finché non esce una griglia con
 * abbastanza parole comuni: la stessa per tutti. Le parole le cerca il
 * dizionario dello Scarabeo (public/scarabeo/dizionario.dawg), che e'
 * versionato, quindi lo script non va in rete. Si scrivono con
 * `INSERT OR IGNORE`: una giornata scritta non cambia piu', anche se i dadi o il
 * dizionario cambiano. Nel Worker non si fanno perché vorrebbero il dizionario
 * intero e qualche centinaio di griglie da provare.
 *
 *   npx vite-node scripts/genera-paroliere.ts                 anteprima di oggi, senza scrivere
 *   npx vite-node scripts/genera-paroliere.ts -- --local      D1 locale di wrangler
 *   npx vite-node scripts/genera-paroliere.ts -- --remote     produzione
 *   … --giorni 60                                             quanti giorni da oggi
 */

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Dawg } from '../shared/dawg'
import { grigliaDelGiorno } from '../shared/paroliere'
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

const comuni = Dawg.da(readFileSync(join(ROOT, 'public', 'scarabeo', 'dizionario.dawg'))).comuni()

const numeri = Array.from({ length: GIORNI }, (_, i) => DA + i)
const presenti = SCRIVE
  ? new Set(
      interroga<{ puzzle_number: number }>(
        `SELECT puzzle_number FROM paroliere_giornate WHERE puzzle_number BETWEEN ${DA} AND ${DA + GIORNI - 1}`,
      ).map((r) => r.puzzle_number),
    )
  : new Set<number>()
const mancanti = numeri.filter((n) => !presenti.has(n))
if (SCRIVE && mancanti.length === 0) {
  console.log(`Paroliere: le ${GIORNI} giornate ci sono già`)
  process.exit(0)
}

const adesso = new Date().toISOString()
const righe: string[] = []
for (const numero of SCRIVE ? mancanti : numeri.slice(0, 1)) {
  const giorno = grigliaDelGiorno(numero, comuni)
  const lunghe = giorno.comuni.slice(0, 3).join(', ')
  console.log(
    `  #${numero} ${dateForPuzzleNumber(numero)}  ${giorno.griglia.join('').toUpperCase()}  ` +
      `${giorno.comuni.length} parole, traguardo ${giorno.traguardo} (${lunghe}…)`,
  )
  righe.push(
    `INSERT OR IGNORE INTO paroliere_giornate (puzzle_number, griglia, comuni, traguardo, formato, created_at) ` +
      `VALUES (${numero}, ${cita(JSON.stringify(giorno.griglia))}, ${cita(JSON.stringify(giorno.comuni))}, ` +
      `${giorno.traguardo}, 1, ${cita(adesso)});`,
  )
}

if (SCRIVE) {
  console.log(`  scrivo ${righe.length} giornate su ${REMOTO ? 'produzione' : 'locale'}…`)
  // Le parole di una griglia arrivano a qualche kB: a gruppi, perché un'istruzione di D1 non passi i cento kB.
  for (let i = 0; i < righe.length; i += 10) wrangler(['--command', righe.slice(i, i + 10).join('\n')])
}

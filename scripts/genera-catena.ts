/**
 * Prepara le Catene dei prossimi giorni, in D1.
 *
 * La catena di un giorno viene dall'elenco delle classificate
 * (scripts/data/catena-classificate.json, che fa scripts/build-catena.mjs) e
 * dal numero del giorno (`catenaDelGiorno` in shared/catena.ts): la stessa per
 * tutti. Le espressioni della Catena e della Ghigliottina vengono dallo stesso
 * elenco, quindi una catena che ha fra le sue parole la vincente della
 * Ghigliottina dello stesso giorno la direbbe: si salta. La vincente si legge
 * dalla giornata gia' scritta, e si calcola solo se manca — il passo della
 * Ghigliottina viene prima di questo, nella notte e nel deploy. Si scrivono con
 * `INSERT OR IGNORE`: una giornata scritta non cambia piu', anche se l'elenco
 * si rifa'. L'eccezione e' una giornata dopo oggi che nessuno ha aperto e che
 * ha fra le sue parole la vincente della Ghigliottina dello stesso giorno: la
 * Ghigliottina si rifà quando cambia formato, e la catena scritta prima non lo
 * sapeva.
 *
 *   npx vite-node scripts/genera-catena.ts                 anteprima di oggi, senza scrivere
 *   npx vite-node scripts/genera-catena.ts -- --local      D1 locale di wrangler
 *   npx vite-node scripts/genera-catena.ts -- --remote     produzione
 *   … --giorni 60                                          quanti giorni da oggi
 */

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NASCOSTE_CATENA, catenaDelGiorno, normalizzaCatena, type CatenaDellElenco } from '../shared/catena'
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
const A = DA + GIORNI - 1

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

const elenco = JSON.parse(readFileSync(join(HERE, 'data', 'catena-classificate.json'), 'utf8')) as CatenaDellElenco[]
const ghigliottine = JSON.parse(
  readFileSync(join(HERE, 'data', 'ghigliottina-classificate.json'), 'utf8'),
) as GhigliottinaDellElenco[]

const numeri = Array.from({ length: GIORNI }, (_, i) => DA + i)

/** Le vincenti della Ghigliottina gia' scritte; per i giorni che non le hanno, quelle che scriverebbe la notte. */
const vincenti = new Map(
  SCRIVE
    ? interroga<{ puzzle_number: number; soluzione: string }>(
        `SELECT puzzle_number, json_extract(ghigliottina, '$.soluzione') AS soluzione
           FROM ghigliottina_giornate WHERE puzzle_number BETWEEN ${DA} AND ${A}`,
      ).map((r) => [r.puzzle_number, r.soluzione])
    : [],
)
const vincenteDi = (numero: number) =>
  normalizzaCatena(vincenti.get(numero) ?? ghigliottinaDelGiorno(numero, ghigliottine).soluzione)

/** Una giornata che si puo' rifare: dopo oggi, e che nessuno ha aperto. */
const DA_RIFARE = (numero: number) =>
  `puzzle_number = ${numero} AND puzzle_number > ${DA}
   AND NOT EXISTS (SELECT 1 FROM catena_partite p WHERE p.puzzle_number = ${numero})`

const scritte = SCRIVE
  ? interroga<{ puzzle_number: number; catena: string; aperta: number }>(
      `SELECT puzzle_number, catena,
              EXISTS (SELECT 1 FROM catena_partite p WHERE p.puzzle_number = g.puzzle_number) AS aperta
         FROM catena_giornate g WHERE puzzle_number BETWEEN ${DA} AND ${A}`,
    )
  : []
// Una catena scritta resta, tranne quella di un giorno che deve venire, mai aperta, che direbbe la vincente.
const presenti = new Set(
  scritte
    .filter((r) => {
      if (r.puzzle_number <= DA || r.aperta) return true
      const parole = (JSON.parse(r.catena) as { parole: string[] }).parole
      return !parole.some((p) => normalizzaCatena(p) === vincenteDi(r.puzzle_number))
    })
    .map((r) => r.puzzle_number),
)
const mancanti = numeri.filter((n) => !presenti.has(n))
if (SCRIVE && mancanti.length === 0) {
  console.log(`Catena: le ${GIORNI} giornate ci sono già`)
  process.exit(0)
}

const adesso = new Date().toISOString()
const righe: string[] = []
for (const numero of SCRIVE ? mancanti : numeri.slice(0, 1)) {
  const vincente = vincenteDi(numero)
  const catena = catenaDelGiorno(numero, elenco, (c) => c.p.some((p) => normalizzaCatena(p) === vincente))
  const anteprima = catena.parole
    .map((p, i) => ((NASCOSTE_CATENA as readonly number[]).includes(i) ? p.toUpperCase() : p))
    .join(' ')
  console.log(`  #${numero} ${dateForPuzzleNumber(numero)}  ${anteprima}`)
  righe.push(
    `DELETE FROM catena_giornate WHERE ${DA_RIFARE(numero)};`,
    `INSERT OR IGNORE INTO catena_giornate (puzzle_number, catena, formato, created_at) VALUES ` +
      `(${numero}, ${cita(JSON.stringify(catena))}, 1, ${cita(adesso)});`,
  )
}

if (SCRIVE) {
  console.log(`  scrivo ${mancanti.length} giornate su ${REMOTO ? 'produzione' : 'locale'}…`)
  wrangler(['--command', righe.join('\n')])
}

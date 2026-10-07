/**
 * Fa giocare al computer lo Scarabeo dei prossimi giorni e scrive i risultati
 * in D1.
 *
 * Il computer normale gioca ogni giornata come la trova chi gioca: dieci mosse
 * a testa, a turni contro il computer del giorno, sulle tessere che avranno
 * tutti (`giornataATurni`). Il suo punteggio e' il traguardo dei punti in
 * classifica (il tetto a chi lo pareggia, vedi shared/punti.ts), e la sua
 * partita si mostra a chi ha finito la propria. Non si fa nel Worker, che ha
 * dieci millisecondi di CPU per richiesta — una mossa del computer ne costa
 * decine — ma qui, in anticipo, come gli schemi del cruciverba.
 *
 * Solo le giornate che mancano: il traguardo di una giornata non cambia,
 * altrimenti due giocatori dello stesso giorno avrebbero punti su scale
 * diverse. L'eccezione sono i traguardi di un formato vecchio — quelli giocati
 * da solo, di prima dei turni — dei giorni che devono ancora venire e che
 * nessuno ha aperto: si rifanno, come le giornate del quiz di un formato
 * vecchio, e con loro la giornata si gioca a turni. E' deterministico — stesso
 * sacchetto, stesso seme, stesse mosse — quindi rilanciarlo non sposta niente.
 *
 * Gira con vite-node, che capisce il TypeScript di shared/ senza compilarlo:
 *
 *   npx vite-node scripts/genera-computer-scarabeo.ts                anteprima di oggi
 *   npx vite-node scripts/genera-computer-scarabeo.ts -- --local     D1 locale di wrangler
 *   npx vite-node scripts/genera-computer-scarabeo.ts -- --remote    produzione
 *   … --giorni 60                                                    quanti giorni da oggi
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gameDate, puzzleNumberFor } from '../shared/daily'
import { Dawg } from '../shared/dawg'
import { sacchettoDelGiorno } from '../shared/scarabeo'
import { FORMATO_TRAGUARDO, PARTITA_DEL_GIORNO, giornataATurni } from '../shared/scarabeo-computer'
import { statoADue } from '../shared/scarabeo-due'
import { giornateFerme, scriviTraguardo } from './scarabeo/traguardo'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const DB = 'game-hub-db'

/** Sotto questo il traguardo non scende: un computer bloccato non deve regalare il tetto a tutti. */
const RIFERIMENTO_MINIMO = 150

/** Il seme del computer del traguardo: suo, perché le scelte non ricalchino il sacchetto ne' l'avversario. */
function semeDelComputer(numero: number): number {
  return (0x5ca2_c0de ^ Math.imul(numero, 0x9e37_79b1)) >>> 0
}

const argomenti = process.argv.slice(2)
function argomento(nome: string, predefinito: string): string {
  const i = argomenti.indexOf(`--${nome}`)
  return i >= 0 ? argomenti[i + 1] : predefinito
}
const REMOTO = argomenti.includes('--remote')
const LOCALE = argomenti.includes('--local')
const GIORNI = Number(argomento('giorni', REMOTO ? '60' : '14'))
const OGGI = puzzleNumberFor(gameDate())
const DA = Number(argomento('da', String(OGGI)))

function wrangler(parametri: string[]): string {
  return execFileSync('npx', ['wrangler', 'd1', 'execute', DB, REMOTO ? '--remote' : '--local', ...parametri], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'inherit'],
  }).toString()
}

function interroga<T>(sql: string): T[] {
  const uscita = wrangler(['--json', '--command', sql])
  return JSON.parse(uscita.slice(uscita.indexOf('[')))[0].results as T[]
}

const dawg = Dawg.da(readFileSync(join(ROOT, 'public', 'scarabeo', 'dizionario.dawg')))

/**
 * Le giornate da non toccare: quelle con il traguardo del formato di adesso, e
 * quelle di un formato vecchio che non si possono piu' rifare — oggi e i giorni
 * passati, o una giornata che qualcuno ha gia' aperto.
 */
const ferme = new Set<number>()
if (REMOTO || LOCALE) {
  for (const r of interroga<{ puzzle_number: number }>(giornateFerme(DA, GIORNI, OGGI, FORMATO_TRAGUARDO))) {
    ferme.add(r.puzzle_number)
  }
}
console.log(`Scarabeo, il computer: dal ${DA} al ${DA + GIORNI - 1}, ${ferme.size} già giocati`)

const istruzioni: string[] = []
const adesso = new Date().toISOString()
for (let numero = DA; numero < DA + GIORNI; numero += 1) {
  if (ferme.has(numero)) continue
  const inizio = Date.now()
  const { mosse, punti, avversario } = giornataATurni(dawg, numero, semeDelComputer(numero))
  const riferimento = Math.max(RIFERIMENTO_MINIMO, punti)
  istruzioni.push(scriviTraguardo({ numero, punti: riferimento, mosse, formato: FORMATO_TRAGUARDO, adesso }, OGGI))
  const parole = statoADue(sacchettoDelGiorno(numero), mosse, PARTITA_DEL_GIORNO)
    .giocate.filter((g) => g.di === 0)
    .flatMap((g) => g.parole.slice(0, 1))
    .join(' ')
  console.log(`  #${numero}: ${punti} punti contro ${avversario} (${Date.now() - inizio} ms) — ${parole}`)
  if (!REMOTO && !LOCALE) break
}

if ((REMOTO || LOCALE) && istruzioni.length > 0) {
  const cartella = join(HERE, '.cache')
  mkdirSync(cartella, { recursive: true })
  const file = join(cartella, 'scarabeo-computer.sql')
  writeFileSync(file, istruzioni.join('\n'))
  const parametri = [`--file=${file}`]
  if (REMOTO) parametri.push('--yes')
  console.log(`  scrivo ${istruzioni.length} giornate su ${REMOTO ? 'PRODUZIONE' : 'locale'}…`)
  wrangler(parametri)
}

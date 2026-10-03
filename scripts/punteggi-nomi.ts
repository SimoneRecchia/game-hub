/**
 * Conta i punti di Nomi, cose e città delle giornate finite e li scrive in D1.
 *
 * I punti di una partita dipendono dalle risposte di tutti — una risposta vale
 * di piu' quanto meno l'hanno data gli altri — quindi si contano a giornata
 * chiusa, e valgono nella classifica del giorno dopo. Non nel Worker: con
 * molti giocatori il conto passa di molto i suoi dieci millisecondi, e vuole il
 * lessico intero della lettera.
 *
 * Solo le giornate non ancora contate (`giocatori IS NULL`), e solo quando
 * l'ultima partita possibile e' finita: qualche minuto dopo la mezzanotte. Il
 * conto e' deterministico, e le scritture sono condizionate: rilanciarlo non
 * sposta niente. Lo lanciano il workflow `nomi.yml` dopo la mezzanotte
 * italiana, quello notturno e il deploy, per le giornate rimaste indietro.
 *
 *   npx vite-node scripts/punteggi-nomi.ts -- --local     D1 locale di wrangler
 *   npx vite-node scripts/punteggi-nomi.ts -- --remote    produzione
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LETTERE_NOMI, lessicoDa, type FileLessicoNomi, type LetteraNomi } from '../shared/nomi-cose'
import {
  categorieDa,
  contoDellaGiornata,
  primoGiornoAperto,
  type GiornataDaContare,
  type PartitaLetta,
} from './nomi/conto'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const DB = 'game-hub-db'

const argomenti = process.argv.slice(2)
const REMOTO = argomenti.includes('--remote')
const LOCALE = argomenti.includes('--local')
if (!REMOTO && !LOCALE) {
  console.error('Serve --local o --remote.')
  process.exit(1)
}

function wrangler(parametri: string[]): string {
  return execFileSync('npx', ['wrangler', 'd1', 'execute', DB, REMOTO ? '--remote' : '--local', ...parametri], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'inherit'],
    maxBuffer: 256 * 1024 * 1024,
  }).toString()
}

function interroga<T>(sql: string): T[] {
  const uscita = wrangler(['--json', '--command', sql])
  return JSON.parse(uscita.slice(uscita.indexOf('[')))[0].results as T[]
}

function lessicoDelFile(lettera: LetteraNomi, g: GiornataDaContare) {
  const file = JSON.parse(
    readFileSync(join(ROOT, 'public', 'dati', 'nomi-cose', `${lettera}.json`), 'utf8'),
  ) as FileLessicoNomi
  return lessicoDa(file, categorieDa(g.categorie))
}

const adesso = new Date()
const aperto = primoGiornoAperto(adesso)
const giornate = interroga<GiornataDaContare>(
  `SELECT puzzle_number, lettera, categorie FROM nomi_giornate
    WHERE giocatori IS NULL AND puzzle_number < ${aperto} ORDER BY puzzle_number`,
)
console.log(`Nomi, cose e città: ${giornate.length} giornate da contare, prima della ${aperto}`)

const istruzioni: string[] = []
for (const g of giornate) {
  if (!LETTERE_NOMI.includes(g.lettera as LetteraNomi)) {
    console.error(`  #${g.puzzle_number}: lettera sconosciuta "${g.lettera}", la salto`)
    continue
  }
  const partite = interroga<PartitaLetta>(
    `SELECT id, risposte, tempo_ms, forme, iniziata_at, finished_at FROM nomi_partite
      WHERE puzzle_number = ${g.puzzle_number} ORDER BY id`,
  )
  const conto = contoDellaGiornata(g, partite, lessicoDelFile(g.lettera as LetteraNomi, g), adesso)
  istruzioni.push(...conto.istruzioni)
  const punti = conto.punti.length > 0 ? `${Math.min(...conto.punti)}–${Math.max(...conto.punti)} punti` : 'nessuno'
  const chi = `${partite.length} partite, ${conto.giocatori} giocatori`
  console.log(`  #${g.puzzle_number} (${g.lettera.toUpperCase()}): ${chi}, ${punti}`)
}

if (istruzioni.length > 0) {
  const cartella = join(HERE, '.cache')
  mkdirSync(cartella, { recursive: true })
  const file = join(cartella, 'punteggi-nomi.sql')
  writeFileSync(file, istruzioni.join('\n'))
  const parametri = [`--file=${file}`]
  if (REMOTO) parametri.push('--yes')
  console.log(`  scrivo ${istruzioni.length} righe su ${REMOTO ? 'PRODUZIONE' : 'locale'}…`)
  wrangler(parametri)
}

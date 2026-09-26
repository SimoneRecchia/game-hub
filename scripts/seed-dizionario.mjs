#!/usr/bin/env node
/**
 * Carica il dizionario dello Scarabeo nella tabella `dizionario` di D1.
 *
 * Va lanciato **una volta per ambiente**, dopo le migrazioni: il dizionario non
 * cambia da un deploy all'altro, quindi non ha senso rifarlo a ogni
 * pubblicazione. E' idempotente (INSERT OR REPLACE), quindi rilanciarlo non fa
 * danni e si puo' usare per aggiornare l'elenco.
 *
 * Le parole non vanno una per riga: il piano gratuito di D1 concede 100.000
 * scritture al giorno e le parole sono 271.055. Stanno quindi in 2.309 "secchi"
 * per lunghezza e prime due lettere — vedi migrations/0008_scarabeo.sql, che
 * spiega perché quella forma rende anche le verifiche piu' economiche.
 *
 * Uso:
 *   node scripts/seed-dizionario.mjs            # database locale di wrangler
 *   node scripts/seed-dizionario.mjs --remote   # produzione (serve il token)
 */

import { execFileSync } from 'node:child_process'
import { gunzipSync } from 'node:zlib'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const SORGENTE = join(HERE, 'data', 'dizionario-scarabeo.txt.gz')
const CACHE = join(HERE, '.cache')
const DB = 'game-hub-db'

const REMOTO = process.argv.includes('--remote')

/**
 * Quanti byte di SQL per istruzione.
 *
 * Non il numero di righe: i secchi vanno da qualche decina di byte a 34 kB, e
 * contare le righe darebbe istruzioni da mezzo megabyte. Quaranta kB stanno
 * larghi dentro i limiti dell'API di D1 e bastano a chiudere tutto in poche
 * decine di istruzioni.
 */
const BYTE_PER_ISTRUZIONE = 40_000

const parole = gunzipSync(readFileSync(SORGENTE))
  .toString('utf8')
  .split('\n')
  .filter(Boolean)

const secchi = new Map()
for (const parola of parole) {
  const chiave = `${parola.length}:${parola.slice(0, 2)}`
  const dentro = secchi.get(chiave)
  if (dentro) dentro.push(parola)
  else secchi.set(chiave, [parola])
}

console.log(
  `Dizionario: ${parole.length.toLocaleString('it-IT')} parole in ${secchi.size.toLocaleString('it-IT')} secchi`,
)

const cita = (s) => `'${s.replace(/'/g, "''")}'`

const istruzioni = []
let righe = []
let peso = 0

const chiudi = () => {
  if (righe.length === 0) return
  istruzioni.push(
    `INSERT OR REPLACE INTO dizionario (chiave, parole, quante) VALUES\n${righe.join(',\n')};`,
  )
  righe = []
  peso = 0
}

for (const [chiave, elenco] of [...secchi.entries()].sort()) {
  // Un a capo in testa e in coda: cercando "\nparola\n" la corrispondenza e'
  // esatta anche per la prima e l'ultima parola del secchio.
  const blocco = `\n${elenco.join('\n')}\n`
  const riga = `(${cita(chiave)}, ${cita(blocco)}, ${elenco.length})`
  if (peso + riga.length > BYTE_PER_ISTRUZIONE) chiudi()
  righe.push(riga)
  peso += riga.length
}
chiudi()

mkdirSync(CACHE, { recursive: true })
const file = join(CACHE, 'dizionario.sql')
writeFileSync(file, istruzioni.join('\n'))
console.log(
  `  ${istruzioni.length} istruzioni, ${(istruzioni.join('\n').length / 1e6).toFixed(2)} MB di SQL`,
)

const argomenti = ['wrangler', 'd1', 'execute', DB, REMOTO ? '--remote' : '--local', `--file=${file}`]
if (REMOTO) argomenti.push('--yes')

console.log(`  eseguo su ${REMOTO ? 'PRODUZIONE' : 'locale'}…`)
execFileSync('npx', argomenti, { stdio: 'inherit', cwd: join(HERE, '..') })

const conta = execFileSync(
  'npx',
  [
    'wrangler',
    'd1',
    'execute',
    DB,
    REMOTO ? '--remote' : '--local',
    '--command',
    'SELECT COUNT(*) AS secchi, SUM(quante) AS parole FROM dizionario;',
    '--json',
  ],
  { cwd: join(HERE, '..') },
).toString()

// Wrangler stampa anche avvisi prima del JSON: si prende l'ultimo blocco.
const json = conta.slice(conta.indexOf('['))
const riga = JSON.parse(json)[0].results[0]
console.log(`  in tabella: ${riga.parole} parole in ${riga.secchi} secchi`)
if (riga.parole !== parole.length) {
  console.error('  ATTENZIONE: il conteggio non torna con il file di partenza.')
  process.exit(1)
}

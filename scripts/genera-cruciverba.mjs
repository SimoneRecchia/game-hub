#!/usr/bin/env node
/**
 * Genera i cruciverba dei prossimi giorni e li scrive in D1.
 *
 * Gli schemi non si generano nel Worker — riempire una griglia e' una ricerca
 * che non sta nei 10 ms di CPU di una richiesta — ma qui, in anticipo. Lo lancia
 * il workflow programmato (.github/workflows/cruciverba.yml) ogni notte, e il
 * deploy dopo le migrazioni: la scorta resta di due mesi, così anche se il
 * workflow si fermasse per qualche settimana nessuno troverebbe il cruciverba
 * mancante.
 *
 * Solo le giornate che mancano: quelle già scritte non si toccano, e con
 * `INSERT OR IGNORE` non si toccherebbero comunque. Le parole degli ultimi
 * trenta schemi finiscono in fondo all'ordine dei tentativi, perché "sempre
 * diversi" vuol dire anche non ritrovare ORSO tre giorni di fila.
 *
 * Gli schemi **liberi** — quelli della partita libera, senza giornata — li fa lo
 * stesso script con `--liberi`: la scorta cresce di qualche decina a notte fino
 * al totale chiesto, e gli schemi gia' scritti non cambiano.
 *
 * Uso:
 *   node scripts/genera-cruciverba.mjs                 anteprima di oggi, niente database
 *   node scripts/genera-cruciverba.mjs --local         riempie il D1 locale di wrangler
 *   node scripts/genera-cruciverba.mjs --remote        produzione (serve il token Cloudflare)
 *   … --giorni 60                                      quanti giorni tenere pronti (da oggi)
 *   … --liberi 500 [--al-massimo 40]                   la scorta degli schemi liberi
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import {
  generaCruciverba,
  istruzioneSql,
  leggiDefinizioni,
  paroleDellaSoluzione,
  preparaDizionario,
  semeDelGiorno,
  semeLibero,
} from './cruciverba/generatore.mjs'
import { dataDiGioco, numeroDelGiorno } from './cruciverba/giorno.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const DB = 'game-hub-db'

/** Quanti schemi precedenti guardare per non ripetere le parole. */
const FINESTRA = 30

function argomento(nome, predefinito) {
  const i = process.argv.indexOf(`--${nome}`)
  return i >= 0 ? process.argv[i + 1] : predefinito
}

const REMOTO = process.argv.includes('--remote')
const LOCALE = process.argv.includes('--local')
const GIORNI = Number(argomento('giorni', REMOTO ? 60 : 14))
const DA = Number(argomento('da', numeroDelGiorno(dataDiGioco())))
const LIBERI = process.argv.includes('--liberi') ? Number(argomento('liberi', 0)) : null
const AL_MASSIMO = Number(argomento('al-massimo', 40))

function wrangler(argomenti) {
  return execFileSync(
    'npx',
    ['wrangler', 'd1', 'execute', DB, REMOTO ? '--remote' : '--local', ...argomenti],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'] },
  ).toString()
}

function interroga(sql) {
  const uscita = wrangler(['--json', '--command', sql])
  // Wrangler puo' stampare avvisi prima del JSON: si parte dalla prima quadra.
  return JSON.parse(uscita.slice(uscita.indexOf('[')))[0].results
}

const voci = leggiDefinizioni(
  gunzipSync(readFileSync(join(HERE, 'data', 'cruciverba-definizioni.tsv.gz'))).toString('utf8'),
)
const indici = preparaDizionario(voci)

if (LIBERI !== null) {
  generaLiberi()
  process.exit(0)
}

/**
 * La scorta degli schemi liberi: da quello dopo l'ultimo scritto fino a
 * `LIBERI`, al massimo `AL_MASSIMO` per volta — un minuto e mezzo di lavoro —
 * cosi' il workflow della notte non diventa lungo quanto un deploy.
 */
function generaLiberi() {
  if (!REMOTO && !LOCALE) {
    console.error('Gli schemi liberi si scrivono solo con --local o --remote.')
    process.exit(1)
  }
  const [{ ultimo }] = interroga('SELECT COALESCE(MAX(id), 0) AS ultimo FROM cruciverba_schemi_liberi')
  const fino = Math.min(LIBERI, ultimo + AL_MASSIMO)
  console.log(`Cruciverba liberi: ${ultimo} pronti, obiettivo ${LIBERI}, questa volta fino al ${fino}`)
  if (fino <= ultimo) return

  const recenti = new Map()
  for (const r of interroga(
    `SELECT id, righe, colonne, soluzione FROM cruciverba_schemi_liberi WHERE id > ${ultimo - FINESTRA}`,
  )) {
    recenti.set(r.id, paroleDellaSoluzione(r.soluzione, r.righe, r.colonne))
  }

  const istruzioni = []
  const adesso = new Date().toISOString()
  for (let numero = ultimo + 1; numero <= fino; numero += 1) {
    const evita = new Set()
    for (let n = numero - FINESTRA; n < numero; n += 1) for (const p of recenti.get(n) ?? []) evita.add(p)
    const inizio = Date.now()
    const cruciverba = generaCruciverba({ indici, seme: semeLibero(numero), evita })
    if (!cruciverba) {
      console.error(`  libero ${numero}: nessuno schema riempito, mi fermo`)
      process.exit(1)
    }
    recenti.set(numero, cruciverba.parole.filter((p) => p.length >= 4))
    istruzioni.push(istruzioneSql(numero, cruciverba, adesso, true))
    console.log(`  libero ${numero}: ${cruciverba.parole.length} parole, qualità ${cruciverba.voto.punti.toFixed(2)} (${Date.now() - inizio} ms)`)
  }
  scriviIstruzioni(istruzioni, 'cruciverba-liberi.sql')
}

function scriviIstruzioni(istruzioni, nome) {
  const cartella = join(HERE, '.cache')
  mkdirSync(cartella, { recursive: true })
  const file = join(cartella, nome)
  writeFileSync(file, istruzioni.join('\n'))
  const argomenti = [`--file=${file}`]
  if (REMOTO) argomenti.push('--yes')
  console.log(`  scrivo ${istruzioni.length} schemi su ${REMOTO ? 'PRODUZIONE' : 'locale'}…`)
  wrangler(argomenti)
}

/** numero → parole, per gli schemi che ci sono già. */
const esistenti = new Map()
if (REMOTO || LOCALE) {
  const righe = interroga(
    `SELECT puzzle_number, righe, colonne, soluzione FROM cruciverba_schemi
      WHERE puzzle_number >= ${DA - FINESTRA} AND puzzle_number < ${DA + GIORNI}`,
  )
  for (const r of righe) {
    esistenti.set(r.puzzle_number, paroleDellaSoluzione(r.soluzione, r.righe, r.colonne))
  }
}

console.log(
  `Cruciverba: dal ${DA} al ${DA + GIORNI - 1}, ${[...esistenti.keys()].filter((n) => n >= DA).length} già pronti`,
)

const istruzioni = []
const adesso = new Date().toISOString()
for (let numero = DA; numero < DA + GIORNI; numero += 1) {
  if (esistenti.has(numero)) continue

  const evita = new Set()
  for (let n = numero - FINESTRA; n < numero; n += 1) {
    for (const p of esistenti.get(n) ?? []) evita.add(p)
  }

  const inizio = Date.now()
  const cruciverba = generaCruciverba({ indici, seme: semeDelGiorno(numero), evita })
  if (!cruciverba) {
    // Non succede con il dizionario attuale; se succedesse, meglio fermarsi e
    // dirlo che lasciare un buco silenzioso nella scorta.
    console.error(`  #${numero}: nessuno schema riempito, mi fermo`)
    process.exit(1)
  }
  esistenti.set(numero, cruciverba.parole.filter((p) => p.length >= 4))
  istruzioni.push(istruzioneSql(numero, cruciverba, adesso))
  console.log(
    `  #${numero}: ${cruciverba.parole.length} parole, ${cruciverba.voto.sigle} sigle, ` +
      `qualità ${cruciverba.voto.punti.toFixed(2)} (${Date.now() - inizio} ms)`,
  )

  if (!REMOTO && !LOCALE) {
    for (let r = 0; r < cruciverba.righe; r += 1) {
      const riga = cruciverba.griglia.slice(r * cruciverba.colonne, (r + 1) * cruciverba.colonne)
      console.log('     ' + [...riga].map((c) => (c === '#' ? '■' : c.toUpperCase())).join(' '))
    }
    break
  }
}

if ((REMOTO || LOCALE) && istruzioni.length > 0) scriviIstruzioni(istruzioni, 'cruciverba.sql')

if (REMOTO || LOCALE) {
  const [{ pronti }] = interroga(
    `SELECT COUNT(*) AS pronti FROM cruciverba_schemi WHERE puzzle_number >= ${DA}`,
  )
  console.log(`  scorta: ${pronti} giornate da oggi in avanti`)
  if (pronti < GIORNI) {
    console.error('  ATTENZIONE: la scorta è più corta di quella chiesta.')
    process.exit(1)
  }
}

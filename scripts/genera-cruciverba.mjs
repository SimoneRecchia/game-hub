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
 * trenta schemi finiscono in fondo all'ordine dei tentativi, quelle di tre
 * lettere della settimana prima anche, perché "sempre diversi" vuol dire anche
 * non ritrovare ORSO tre giorni di fila; e una parola che torna prende una
 * definizione che non ha avuto negli ultimi trenta (`recenti`).
 *
 * L'eccezione sono le giornate di un formato vecchio (`FORMATO`) **nel futuro e
 * che nessuno ha aperto**: si rifanno, perché nessuno le ha viste, con un
 * `UPDATE` condizionato al formato e all'assenza di partite. Il 2 e' quello con
 * la memoria delle definizioni, i sinonimi e le definizioni da enigmista. Oggi e
 * il passato restano come sono.
 *
 * Gli schemi **liberi** — quelli della partita libera, senza giornata — li fa lo
 * stesso script con `--liberi`: la scorta cresce di qualche decina a notte fino
 * al totale chiesto, e gli schemi gia' scritti non cambiano.
 *
 * Una cosa sola degli schemi scritti si corregge: una definizione che il
 * dizionario non ha piu', perché il filtro l'ha scartata dopo. La griglia resta
 * quella; cambia il testo di quella definizione, da oggi in avanti e nella
 * scorta dei liberi (`correggiSalvati`).
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
  correggiDefinizioni,
  definizioniDellaSoluzione,
  generaCruciverba,
  istruzioneRifai,
  istruzioneSql,
  leggiDefinizioni,
  preparaDizionario,
  semeDelGiorno,
  semeLibero,
} from './cruciverba/generatore.mjs'
import { dataDiGioco, numeroDelGiorno } from './cruciverba/giorno.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const DB = 'game-hub-db'

/** Quanti schemi precedenti guardare per non ripetere le parole e le definizioni. */
const FINESTRA = 30
/** Le parole di tre lettere sono poche: si evitano solo quelle della settimana. */
const FINESTRA_CORTE = 7
/** Il formato degli schemi che scrive questo script (vedi sopra). */
const FORMATO = 2

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
  correggiSalvati('cruciverba_schemi_liberi', 'id', '1 = 1', (id) => `libero ${id}`)
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

  const precedenti = new Map()
  for (const r of interroga(
    `SELECT id, righe, colonne, soluzione, definizioni FROM cruciverba_schemi_liberi WHERE id > ${ultimo - FINESTRA}`,
  )) {
    precedenti.set(r.id, { dette: definizioniDellaSoluzione(r.soluzione, r.righe, r.colonne, JSON.parse(r.definizioni)) })
  }

  const istruzioni = []
  const adesso = new Date().toISOString()
  for (let numero = ultimo + 1; numero <= fino; numero += 1) {
    const { evita, recenti } = memoria(numero, precedenti)
    const inizio = Date.now()
    const cruciverba = generaCruciverba({ indici, seme: semeLibero(numero), evita, recenti })
    if (!cruciverba) {
      console.error(`  libero ${numero}: nessuno schema riempito, mi fermo`)
      process.exit(1)
    }
    precedenti.set(numero, { dette: detteDi(cruciverba) })
    istruzioni.push(istruzioneSql(numero, cruciverba, adesso, true))
    console.log(`  libero ${numero}: ${cruciverba.parole.length} parole, qualità ${cruciverba.voto.punti.toFixed(2)} (${Date.now() - inizio} ms)`)
  }
  scriviIstruzioni(istruzioni, 'cruciverba-liberi.sql')
}

function scriviIstruzioni(istruzioni, nome, cosa = 'schemi') {
  const cartella = join(HERE, '.cache')
  mkdirSync(cartella, { recursive: true })
  const file = join(cartella, nome)
  writeFileSync(file, istruzioni.join('\n'))
  const argomenti = [`--file=${file}`]
  if (REMOTO) argomenti.push('--yes')
  console.log(`  scrivo ${istruzioni.length} ${cosa} su ${REMOTO ? 'PRODUZIONE' : 'locale'}…`)
  wrangler(argomenti)
}

/**
 * Le definizioni degli schemi gia' scritti che il dizionario di adesso non ha
 * piu' (vedi `correggiDefinizioni`). Cinquanta schemi per lettura, e
 * l'`UPDATE` e' condizionato alle definizioni appena lette.
 */
function correggiSalvati(tabella, colonna, dove, nome) {
  const perParola = new Map(voci.map((v) => [v.parola, v]))
  const cita = (s) => `'${String(s).replace(/'/g, "''")}'`
  const istruzioni = []
  let dopo = -1
  for (;;) {
    const righe = interroga(
      `SELECT ${colonna} AS id, righe, colonne, soluzione, definizioni FROM ${tabella}
        WHERE ${dove} AND ${colonna} > ${dopo} ORDER BY ${colonna} LIMIT 50`,
    )
    if (righe.length === 0) break
    for (const r of righe) {
      const corretto = correggiDefinizioni(r.soluzione, r.righe, r.colonne, JSON.parse(r.definizioni), perParola)
      if (!corretto) continue
      for (const c of corretto.cambiate) console.log(`  ${nome(r.id)}, ${c.parola}: «${c.prima}» → «${c.dopo}»`)
      istruzioni.push(
        `UPDATE ${tabella} SET definizioni = ${cita(JSON.stringify(corretto.definizioni))}
          WHERE ${colonna} = ${r.id} AND definizioni = ${cita(r.definizioni)};`,
      )
    }
    dopo = righe.at(-1).id
  }
  if (istruzioni.length > 0) scriviIstruzioni(istruzioni, `correzioni-${tabella}.sql`, 'schemi corretti')
}

/**
 * numero → le parole con le loro definizioni, per gli schemi che ci sono gia', e
 * se lo schema va rifatto: un formato vecchio, nel futuro, che nessuno ha aperto.
 */
const esistenti = new Map()
if (REMOTO || LOCALE) {
  const righe = interroga(
    `SELECT s.puzzle_number, s.righe, s.colonne, s.soluzione, s.definizioni, s.formato,
            EXISTS (SELECT 1 FROM cruciverba_games g WHERE g.puzzle_number = s.puzzle_number) AS aperto
       FROM cruciverba_schemi s
      WHERE s.puzzle_number >= ${DA - FINESTRA} AND s.puzzle_number < ${DA + GIORNI}`,
  )
  for (const r of righe) {
    esistenti.set(r.puzzle_number, {
      dette: definizioniDellaSoluzione(r.soluzione, r.righe, r.colonne, JSON.parse(r.definizioni)),
      rifare: r.puzzle_number > DA && r.formato < FORMATO && !r.aperto,
    })
  }
}

/** Le parole da evitare e le definizioni gia' date negli schemi prima di `numero`. */
function memoria(numero, schemi) {
  const evita = new Set()
  const recenti = new Map()
  for (let n = numero - FINESTRA; n < numero; n += 1) {
    for (const [parola, testo] of schemi.get(n)?.dette ?? []) {
      if (parola.length >= 4 || (parola.length === 3 && n >= numero - FINESTRA_CORTE)) evita.add(parola)
      if (!recenti.has(parola)) recenti.set(parola, new Set())
      recenti.get(parola).add(testo.toLowerCase())
    }
  }
  return { evita, recenti }
}

/** Le parole e le definizioni di uno schema appena fatto, come quelle lette da D1. */
function detteDi(cruciverba) {
  const salvate = Object.fromEntries(Object.entries(cruciverba.definizioni).map(([k, d]) => [k, { t: d.testo }]))
  return definizioniDellaSoluzione(cruciverba.griglia, cruciverba.righe, cruciverba.colonne, salvate)
}

const pronti = [...esistenti].filter(([n, e]) => n >= DA && !e.rifare).length
const daRifare = [...esistenti.values()].filter((e) => e.rifare).length
console.log(`Cruciverba: dal ${DA} al ${DA + GIORNI - 1}, ${pronti} già pronti, ${daRifare} da rifare`)

const istruzioni = []
const adesso = new Date().toISOString()
for (let numero = DA; numero < DA + GIORNI; numero += 1) {
  const gia = esistenti.get(numero)
  if (gia && !gia.rifare) continue

  const { evita, recenti } = memoria(numero, esistenti)
  const inizio = Date.now()
  const cruciverba = generaCruciverba({ indici, seme: semeDelGiorno(numero), evita, recenti })
  if (!cruciverba) {
    // Non succede con il dizionario attuale; se succedesse, meglio fermarsi e
    // dirlo che lasciare un buco silenzioso nella scorta.
    console.error(`  #${numero}: nessuno schema riempito, mi fermo`)
    process.exit(1)
  }
  esistenti.set(numero, { dette: detteDi(cruciverba), rifare: false })
  istruzioni.push(gia ? istruzioneRifai(numero, cruciverba, adesso, FORMATO) : istruzioneSql(numero, cruciverba, adesso, false, FORMATO))
  console.log(
    `  #${numero}${gia ? ' (rifatto)' : ''}: ${cruciverba.parole.length} parole, ${cruciverba.voto.sigle} sigle, ` +
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
if (REMOTO || LOCALE) correggiSalvati('cruciverba_schemi', 'puzzle_number', `puzzle_number >= ${DA}`, (n) => `#${n}`)

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

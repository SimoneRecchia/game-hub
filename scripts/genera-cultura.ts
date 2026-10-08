/**
 * Prepara i dati delle materie di cultura del quiz — arte, libri, cinema,
 * canzoni, musica classica, lirica, premi Nobel, storia, scienza — da
 * Wikidata, Wikimedia Commons e
 * Wikipedia in italiano, in public/dati/quiz/<materia>.json.
 *
 * Sono file statici versionati, come le parole del Wordle: il build non dipende
 * dalla rete, e il browser li scarica solo quando si gioca quella materia. Ogni
 * file ha la sua `versione`, i primi dieci caratteri dello SHA-1 del contenuto
 * senza la versione: cambia solo se cambiano i dati.
 *
 *   npx vite-node scripts/genera-cultura.ts                   tutte le materie
 *   npx vite-node scripts/genera-cultura.ts -- arte libri     solo alcune
 *   … --rinnova                                               richiede le query SPARQL anche se salvate
 *
 * Tutto quel che arriva dalla rete resta in scripts/.cache/cultura: le query
 * SPARQL per una settimana, le licenze delle immagini, le prime frasi delle
 * voci e l'ordine delle dichiarazioni per sempre (vedi scripts/cultura/rete.ts).
 * Rifare lo script subito dopo non chiede niente a nessuno. Prima di scrivere,
 * `controllaCultura` guarda che i fatti che tutti sanno tornino: se no lo
 * script si ferma e non tocca i file.
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { arte } from './cultura/arte'
import { canzoni } from './cultura/canzoni'
import { cinema } from './cultura/cinema'
import { classica } from './cultura/classica'
import { controllaCultura, type DatiDaControllare } from './cultura/controlli'
import { libri } from './cultura/libri'
import { lirica } from './cultura/lirica'
import { nobel } from './cultura/nobel'
import { rinnovaSparql } from './cultura/rete'
import { scienza } from './cultura/scienza'
import { storia } from './cultura/storia'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CARTELLA = join(ROOT, 'public', 'dati', 'quiz')

/**
 * Il peso massimo di un file e di tutti insieme, compressi come li manda la
 * CDN: si scaricano su un telefono, e quel che viaggia e' il file compresso,
 * un quarto di quello scritto.
 */
const MASSIMO_FILE = 300 * 1024
const MASSIMO_TOTALE = 900 * 1024

type Materia = keyof DatiDaControllare

const MATERIE: { [M in Materia]-?: () => Promise<NonNullable<DatiDaControllare[M]>> } = {
  arte: () => arte(),
  libri: () => libri(),
  cinema: () => cinema(),
  canzoni: () => canzoni(),
  // Le opere liriche stanno nella lirica: la musica classica le lascia fuori.
  classica: async () => classica(new Set(((dati.lirica ?? liricaSalvata())?.opere ?? []).map((o) => o.id))),
  lirica: () => lirica(),
  nobel: () => nobel(),
  storia: () => storia(),
  scienza: () => scienza(),
}

/** La lirica scritta l'ultima volta, se oggi non la si rifà. */
function liricaSalvata(): DatiDaControllare['lirica'] | undefined {
  const file = join(CARTELLA, 'lirica.json')
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as DatiDaControllare['lirica']) : undefined
}

const argomenti = process.argv.slice(2)
if (argomenti.includes('--rinnova')) rinnovaSparql()
const chieste = argomenti.filter((a): a is Materia => a in MATERIE)
const daFare = chieste.length > 0 ? chieste : (Object.keys(MATERIE) as Materia[])

const dati: DatiDaControllare = {}
for (const materia of daFare) Object.assign(dati, { [materia]: await MATERIE[materia]() })

const problemi = controllaCultura(dati)

/** Il file: la versione prima, poi i dati, in JSON senza spazi. */
const file = new Map<Materia, { testo: string; versione: string }>()
for (const materia of daFare) {
  const corpo = dati[materia]!
  const versione = createHash('sha1').update(JSON.stringify(corpo)).digest('hex').slice(0, 10)
  file.set(materia, { testo: JSON.stringify({ versione, ...corpo }), versione })
}
const peso = (testo: string) => Buffer.byteLength(testo, 'utf8')
const compresso = (testo: string) => gzipSync(testo, { level: 9 }).length
const kB = (byte: number) => Math.round(byte / 1024)
for (const [materia, { testo }] of file) {
  if (compresso(testo) > MASSIMO_FILE) problemi.push(`${materia}.json pesa ${kB(compresso(testo))} kB compresso`)
}
const totale = [...file.values()].reduce((n, f) => n + compresso(f.testo), 0)
if (daFare.length === Object.keys(MATERIE).length && totale > MASSIMO_TOTALE) {
  problemi.push(`i file pesano ${kB(totale)} kB compressi in tutto`)
}

if (problemi.length > 0) {
  console.error(`I dati di cultura non tornano, non scrivo niente:\n  ${problemi.join('\n  ')}`)
  process.exit(1)
}

mkdirSync(CARTELLA, { recursive: true })
console.log(`Cultura: scrivo in ${CARTELLA}`)
for (const [materia, { testo, versione }] of file) {
  writeFileSync(join(CARTELLA, `${materia}.json`), testo)
  const elenchi = Object.entries(dati[materia]!)
    .filter(([, v]) => Array.isArray(v))
    .map(([k, v]) => `${(v as unknown[]).length} ${k}`)
    .join(', ')
  console.log(`  ${materia}.json ${kB(peso(testo))} kB, ${kB(compresso(testo))} compresso (${versione}): ${elenchi}`)
}
console.log(`  in tutto ${kB(totale)} kB compressi`)
console.log(`  versioni: ${JSON.stringify(Object.fromEntries([...file].map(([m, f]) => [m, f.versione])))}`)

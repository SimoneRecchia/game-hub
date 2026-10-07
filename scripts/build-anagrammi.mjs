#!/usr/bin/env node
/**
 * Prepara le parole degli Anagrammi, dalle stesse fonti del Wordle e dalle
 * definizioni del cruciverba.
 *
 *   scripts/data/anagrammi.tsv.gz        le parole delle classificate, che legge lo script della notte
 *   public/dati/anagrammi/libere.json    quelle delle libere, che scarica il telefono
 *   shared/anagrammi-libere.ts           l'impronta del file delle libere, per l'indirizzo (?v=)
 *
 * Un candidato e' una parola da cinque a nove lettere che:
 *
 *   1. ha una voce sua nel Wikizionario, con una definizione (le definizioni
 *      del cruciverba, gia' accorciate e ripulite): non un nome proprio, non
 *      una sigla, non un plurale. La definizione e' l'aiuto del gioco;
 *   2. compare almeno MIN_FREQUENZA volte nei sottotitoli di OpenSubtitles
 *      (hermitdave/FrequencyWords): una parola che si riconosce, perché un
 *      anagramma di una parola che non si conosce non si risolve;
 *   3. ha la grafia italiana e non e' un accento mancante, con le regole del
 *      Wordle (scripts/build-wordlist.mjs);
 *   4. non e' un nome proprio ne' una volgarita' (gli elenchi di napolux).
 *
 * Le risposte di una parola sono tutte le forme italiane di napolux con le
 * stesse lettere: chi scrive TEATRO per le lettere di ATTORE ha ragione.
 *
 * Classificate e libere si dividono le parole per le loro lettere (`chiave`),
 * un terzo alle libere: una parola delle libere non e' mai l'anagramma di una
 * delle classificate, quindi il file che scarica il telefono non ha le
 * risposte di nessun giorno.
 *
 * Uso:  node scripts/build-anagrammi.mjs            (scarica le fonti che mancano in scripts/.cache/)
 *       node scripts/build-anagrammi.mjs --offline  (solo la cache)
 */

import { createHash } from 'node:crypto'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync, gzipSync } from 'node:zlib'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const CACHE = join(HERE, '.cache')
const OFFLINE = process.argv.includes('--offline')

const FONTI = {
  parole: {
    url: 'https://raw.githubusercontent.com/napolux/paroleitaliane/master/paroleitaliane/280000_parole_italiane.txt',
    file: '280000_parole_italiane.txt',
  },
  nomiPropri: {
    url: 'https://raw.githubusercontent.com/napolux/paroleitaliane/master/paroleitaliane/9000_nomi_propri.txt',
    file: '9000_nomi_propri.txt',
  },
  volgari: {
    url: 'https://raw.githubusercontent.com/napolux/paroleitaliane/master/paroleitaliane/lista_badwords.txt',
    file: 'lista_badwords.txt',
  },
  frequenze: {
    url: 'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/it/it_50k.txt',
    file: 'it_50k.txt',
  },
}

const MIN_LETTERE = 5
const MAX_LETTERE = 9

/**
 * Occorrenze minime nei sottotitoli. 300 tiene dentro "abbraccio" e
 * "accademia" e lascia fuori le parole da dizionario: un anagramma si risolve
 * solo se la parola viene in mente.
 */
const MIN_FREQUENZA = 300

/** Le libere hanno un terzo delle parole, divise per lettere: le classificate ne vogliono di piu'. */
const PARTI = 3

/** Collante grammaticale e riempitivi: parole vere, ma come anagramma non dicono niente. */
const ESCLUSE = new Set([
  'della', 'delle', 'dello', 'degli', 'nella', 'nelle', 'nello', 'negli', 'dalla', 'dalle', 'dallo', 'dagli',
  'sulla', 'sulle', 'sullo', 'sugli', 'quella', 'quelle', 'quello', 'quegli', 'questa', 'queste', 'questo',
  'questi', 'quale', 'quali', 'ancora', 'sempre', 'allora', 'adesso', 'perche', 'quando', 'mentre', 'oppure',
  'siamo', 'siete', 'erano', 'sarei', 'fosse', 'fossi', 'siano', 'avete', 'avevo', 'aveva', 'avrei', 'abbia',
  'hanno', 'avuto', 'avere', 'essere', 'stato', 'stata', 'stati', 'state',
])

const LETTERE_STRANIERE = /[jkwxy]/
const DIGRAMMI_STRANIERI = [/ck/, /sh/, /th/, /ph/, /wh/, /ght/, /oo/, /ee/, /ay$/, /ey$/]

function sembraItaliana(parola) {
  if (LETTERE_STRANIERE.test(parola)) return false
  if (!/[aeiou]$/.test(parola)) return false
  return !DIGRAMMI_STRANIERI.some((re) => re.test(parola))
}

const ACCENTI = { à: 'a', á: 'a', è: 'e', é: 'e', ì: 'i', í: 'i', ò: 'o', ó: 'o', ù: 'u', ú: 'u' }
const senzaAccenti = (p) => p.replace(/[àáèéìíòóùú]/g, (c) => ACCENTI[c])

/** Le lettere di una parola in ordine: due parole sono l'una l'anagramma dell'altra se hanno la stessa chiave. */
const chiave = (p) => [...p].sort().join('')

/** FNV-1a a 32 bit: divide le chiavi fra classificate e libere sempre allo stesso modo. */
function fnv(testo) {
  let h = 0x811c9dc5
  for (let i = 0; i < testo.length; i += 1) {
    h ^= testo.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h
}

async function esiste(percorso) {
  try {
    await access(percorso)
    return true
  } catch {
    return false
  }
}

async function fonte({ url, file }) {
  const percorso = join(CACHE, file)
  if (!(await esiste(percorso))) {
    if (OFFLINE) throw new Error(`Manca ${file} in scripts/.cache/ e --offline non scarica`)
    console.log(`  scarico ${url}`)
    const risposta = await fetch(url)
    if (!risposta.ok) throw new Error(`${url}: ${risposta.status}`)
    await mkdir(CACHE, { recursive: true })
    await writeFile(percorso, Buffer.from(await risposta.arrayBuffer()))
  }
  return readFile(percorso, 'utf8')
}

const righe = (testo) =>
  testo
    .split(/\r?\n/)
    .map((r) => r.trim())
    .filter(Boolean)

/**
 * Le definizioni del cruciverba, per parola: solo i sensi della parola cosi'
 * com'e' (non "Aalborg" per "aalborg"), senza sigle e senza le forme flesse,
 * che portano la nota "plurale".
 */
async function definizioni() {
  const testo = gunzipSync(await readFile(join(HERE, 'data', 'cruciverba-definizioni.tsv.gz'))).toString('utf8')
  const perParola = new Map()
  for (const riga of testo.split('\n')) {
    const [parola, , ...sensi] = riga.split('\t')
    if (!parola) continue
    const buoni = []
    let flessa = false
    for (const s of sensi) {
      const [forma, definizione, nota = ''] = s.split('|')
      if (nota === 'plurale') flessa = true
      if (forma === parola && definizione && nota === '') buoni.push(definizione)
    }
    if (!flessa && buoni.length > 0) perParola.set(parola, buoni[0])
  }
  return perParola
}

async function main() {
  const [parole, nomiPropri, volgari, frequenze] = await Promise.all([
    fonte(FONTI.parole),
    fonte(FONTI.nomiPropri),
    fonte(FONTI.volgari),
    fonte(FONTI.frequenze),
  ])
  const proprie = new Set(righe(nomiPropri).map((r) => r.toLowerCase()))
  const cattive = new Set(righe(volgari).map((r) => r.toLowerCase()))

  const frequenza = new Map()
  const accentate = new Map()
  for (const riga of righe(frequenze)) {
    const [parola, n] = riga.split(/\s+/)
    const quante = Number(n)
    frequenza.set(parola, quante)
    const piana = senzaAccenti(parola)
    if (piana !== parola) accentate.set(piana, Math.max(accentate.get(piana) ?? 0, quante))
  }

  // Tutte le forme italiane per lettere: le risposte che si accettano.
  const perChiave = new Map()
  for (const p of righe(parole)) {
    const w = p.toLowerCase()
    if (!/^[a-z]+$/.test(w) || w.length < MIN_LETTERE || w.length > MAX_LETTERE) continue
    if (proprie.has(w) || cattive.has(w)) continue
    const k = chiave(w)
    if (!perChiave.has(k)) perChiave.set(k, new Set())
    perChiave.get(k).add(w)
  }

  const defs = await definizioni()
  const candidati = []
  for (const [parola, definizione] of defs) {
    if (!/^[a-z]+$/.test(parola) || parola.length < MIN_LETTERE || parola.length > MAX_LETTERE) continue
    if (ESCLUSE.has(parola) || proprie.has(parola) || cattive.has(parola) || !sembraItaliana(parola)) continue
    const quante = frequenza.get(parola) ?? 0
    if (quante < MIN_FREQUENZA) continue
    // "potro" per "potrò": la forma accentata regge il confronto, quella piana e' un errore di battitura.
    if ((accentate.get(parola) ?? 0) * 5 > quante) continue
    const k = chiave(parola)
    // Una parola con tutte le lettere uguali, o quasi, non si mescola: "nonno" ha poche disposizioni.
    if (new Set(parola).size < 3) continue
    const risposte = [...(perChiave.get(k) ?? new Set([parola]))].sort()
    if (!risposte.includes(parola)) risposte.push(parola)
    candidati.push({ parola, risposte: risposte.sort(), definizione, chiave: k })
  }
  candidati.sort((a, b) => a.parola.localeCompare(b.parola))

  // Una chiave sola per parola scelta: di due anagrammi l'uno dell'altro ("attore", "teatro") ne resta uno.
  const viste = new Set()
  const uniche = candidati.filter((c) => (viste.has(c.chiave) ? false : (viste.add(c.chiave), true)))

  const classificate = uniche.filter((c) => fnv(c.chiave) % PARTI !== 0)
  const libere = uniche.filter((c) => fnv(c.chiave) % PARTI === 0)

  const tsv = classificate.map((c) => [c.parola, c.risposte.join(','), c.definizione].join('\t')).join('\n') + '\n'
  await writeFile(join(HERE, 'data', 'anagrammi.tsv.gz'), gzipSync(Buffer.from(tsv, 'utf8'), { level: 9 }))

  const perLunghezza = {}
  for (const c of libere) {
    const n = String(c.parola.length)
    perLunghezza[n] ??= []
    // Le risposte oltre la parola, se ce ne sono: la parola e' sempre la prima.
    perLunghezza[n].push([c.parola, c.risposte.filter((r) => r !== c.parola).join(','), c.definizione])
  }
  const json = JSON.stringify({ parole: perLunghezza })
  await mkdir(join(ROOT, 'public', 'dati', 'anagrammi'), { recursive: true })
  await writeFile(join(ROOT, 'public', 'dati', 'anagrammi', 'libere.json'), json)
  const impronta = createHash('sha256').update(json).digest('hex').slice(0, 10)
  await writeFile(
    join(ROOT, 'shared', 'anagrammi-libere.ts'),
    `/** L'impronta di public/dati/anagrammi/libere.json: la scrive scripts/build-anagrammi.mjs. */\n` +
      `export const VERSIONE_LIBERE_ANAGRAMMI = '${impronta}'\n`,
  )

  const conta = (elenco) =>
    [...Array(MAX_LETTERE - MIN_LETTERE + 1).keys()]
      .map((i) => `${i + MIN_LETTERE}: ${elenco.filter((c) => c.parola.length === i + MIN_LETTERE).length}`)
      .join(', ')
  console.log(`Anagrammi: ${classificate.length} parole per le classificate (${conta(classificate)})`)
  console.log(`           ${libere.length} per le libere (${conta(libere)}), impronta ${impronta}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

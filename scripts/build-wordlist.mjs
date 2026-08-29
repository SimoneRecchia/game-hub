#!/usr/bin/env node
/**
 * Genera gli elenchi di parole italiane da cinque lettere usati dal gioco.
 *
 * Due elenchi con scopi diversi:
 *
 *   guesses.ts    tutte le parole accettate come tentativo (~6.700). Serve solo
 *                 a dire "questa parola esiste": e' permissivo di proposito,
 *                 così non si rifiuta un tentativo legittimo.
 *
 *   solutions.ts  le parole che possono uscire come parola del giorno (~1.900).
 *                 Molto piu' selettivo: solo parole che un madrelingua riconosce
 *                 subito, altrimenti il gioco diventa una lotteria.
 *
 * FONTI (entrambe con licenza MIT, vedi shared/words/SOURCES.md)
 *
 *   1. napolux/paroleitaliane — 280000_parole_italiane.txt
 *      Elenco di forme flesse italiane (nomi comuni, aggettivi, verbi).
 *      Da qui nascono i tentativi ammessi.
 *
 *   2. hermitdave/FrequencyWords — content/2018/it/it_50k.txt
 *      Frequenze d'uso ricavate dal corpus OpenSubtitles 2018.
 *      Serve a tenere fra le soluzioni solo le parole davvero comuni.
 *
 * Uso:  npm run words:build
 *       npm run words:build -- --offline   (usa solo la cache locale)
 *
 * I file scaricati restano in scripts/.cache/ (non versionati) così le
 * riesecuzioni sono veloci e l'output e' riproducibile.
 */

import { mkdir, readFile, writeFile, access } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const CACHE = join(HERE, '.cache')
const OUT_DIR = join(ROOT, 'shared', 'words')

const SOURCES = {
  words: {
    url: 'https://raw.githubusercontent.com/napolux/paroleitaliane/master/paroleitaliane/280000_parole_italiane.txt',
    file: '280000_parole_italiane.txt',
  },
  properNouns: {
    url: 'https://raw.githubusercontent.com/napolux/paroleitaliane/master/paroleitaliane/9000_nomi_propri.txt',
    file: '9000_nomi_propri.txt',
  },
  badWords: {
    url: 'https://raw.githubusercontent.com/napolux/paroleitaliane/master/paroleitaliane/lista_badwords.txt',
    file: 'lista_badwords.txt',
  },
  frequency: {
    url: 'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/it/it_50k.txt',
    file: 'it_50k.txt',
  },
}

const WORD_LENGTH = 5

/**
 * Occorrenze minime nel corpus OpenSubtitles perché una parola possa uscire
 * come parola del giorno. 700 su ~280 milioni di token tiene dentro parole
 * come "vetro" o "scelta" e lascia fuori le forme verbali rarissime.
 */
const MIN_SOLUTION_FREQUENCY = 700

/**
 * Preposizioni articolate e forme ausiliari: sono parole italiane a tutti gli
 * effetti (e restano tentativi validi) ma come soluzione risultano frustranti,
 * perché sono "collante grammaticale" e non parole con un significato proprio.
 * Avverbi e pronomi restano invece ammessi: l'originale inglese usa THOSE,
 * WHICH, ABOUT, quindi sono in tono col gioco.
 */
const SOLUTION_STOPLIST = new Set([
  // preposizioni articolate
  'della', 'delle', 'dello', 'degli',
  'nella', 'nelle', 'nello', 'negli',
  'dalla', 'dalle', 'dallo', 'dagli',
  'sulla', 'sulle', 'sullo', 'sugli',
  'colla', 'cogli', 'colle',
  // essere / avere
  'siamo', 'siete', 'erano', 'sarei', 'fosse', 'fossi', 'siano',
  'avete', 'avevo', 'aveva', 'avrei', 'abbia', 'hanno', 'avuto', 'avrai',
  'avere', 'sarai', 'saran', 'siate', 'stara',
  // riempitivi / interiezioni da sottotitoli
  'ehila', 'oddio', 'aaahh', 'ahahh',
])

/**
 * Parole italiane che finiscono per consonante: sono l'eccezione, quindi vanno
 * elencate a mano perché il filtro fonotattico qui sotto le scarterebbe.
 */
const CONSONANT_FINAL_ALLOWLIST = new Set(['ovest'])

/**
 * Grafie estranee all'italiano. Servono a tenere fuori dalle soluzioni i
 * prestiti e i nomi stranieri che il corpus di sottotitoli porta con sé
 * (black, night, shock, clown…), senza bisogno di un elenco a mano.
 */
const FOREIGN_DIGRAPHS = [/ck/, /sh/, /th/, /ph/, /wh/, /ght/, /oo/, /ee/, /ay$/, /ey$/]

/** Lettere che in italiano compaiono solo nei prestiti. */
const FOREIGN_LETTERS = /[jkwxy]/

/**
 * Una parola "suona" italiana?
 *
 * Regole di ortografia, non un dizionario: le parole italiane native finiscono
 * per vocale, non usano j/k/w/x/y e non hanno digrammi come ck o sh. Basta a
 * scartare la gran parte dei prestiti inglesi e dei cognomi stranieri.
 */
function looksItalian(word) {
  if (FOREIGN_LETTERS.test(word)) return false
  if (!CONSONANT_FINAL_ALLOWLIST.has(word) && !/[aeiou]$/.test(word)) return false
  return !FOREIGN_DIGRAPHS.some((re) => re.test(word))
}

const DIACRITICS = { 'à': 'a', 'á': 'a', 'è': 'e', 'é': 'e', 'ì': 'i', 'í': 'i', 'ò': 'o', 'ó': 'o', 'ù': 'u', 'ú': 'u' }

function stripAccents(word) {
  return word.replace(/[àáèéìíòóùú]/g, (c) => DIACRITICS[c])
}

/**
 * Quante volte la variante accentata di una parola batte quella senza accento.
 *
 * I sottotitoli sono pieni di accenti mancanti: "potro" per "potrò" appare
 * quasi quanto la forma corretta. Se la forma accentata regge il confronto,
 * quella senza accento e' un errore di battitura e non va usata come
 * soluzione: chiederebbe al giocatore una grafia sbagliata. Parole come
 * "porto" o "canto", che esistono di per sé, superano il controllo perché
 * sono molto piu' frequenti di "portò" / "cantò".
 */
const ACCENT_DOMINANCE = 5

function buildAccentedIndex(frequency) {
  const index = new Map()
  for (const [word, stat] of frequency) {
    if (!/[àáèéìíòóùú]/.test(word)) continue
    const bare = stripAccents(word)
    const prev = index.get(bare)
    if (!prev || stat.count > prev) index.set(bare, stat.count)
  }
  return index
}

/**
 * Passata di curatela manuale sulle soluzioni.
 *
 * I filtri automatici arrivano fin dove possono: queste sono le parole che
 * restano ma che come parola del giorno non funzionano. E' lo stesso approccio
 * del New York Times, che l'elenco delle soluzioni lo cura a mano.
 *
 * Restano tutte tentativi validi: qui si decide solo cosa NON puo' uscire
 * come parola del giorno.
 */
const CURATED_EXCLUSIONS = {
  /** Nomi propri e prestiti che il filtro fonotattico non intercetta. */
  foreign: [
    'badge', 'bambi', 'bette', 'corea', 'dance', 'diane', 'drive', 'elise',
    'force', 'maine', 'marie', 'marte', 'praga', 'space', 'suite',
  ],

  /** Volgarita' e termini offensivi: l'hub si usa fra colleghi. */
  crude: [
    'anale', 'cacca', 'fotta', 'fotte', 'negri', 'orgia', 'porca', 'porci',
    'porco', 'porno', 'seghe',
  ],

  /**
   * Verbo + pronome enclitico ("dammi", "farlo"): parole italiane a tutti gli
   * effetti, ma indovinarle non da' soddisfazione perché non hanno un
   * significato proprio. Restano fuori "fatti", "fallo", "falla", "falli" e
   * "falle", che sono anche sostantivi comuni.
   */
  enclitic: [
    'dacci', 'dammi', 'darci', 'darla', 'darle', 'darlo', 'darmi', 'darsi',
    'darti', 'darvi', 'datti', 'dicci', 'digli', 'dille', 'dimmi', 'dirci',
    'dirla', 'dirle', 'dirlo', 'dirmi', 'dirsi', 'dirti', 'dirvi', 'facci',
    'fagli', 'fammi', 'farci', 'farla', 'farle', 'farli', 'farlo', 'farmi',
    'farne', 'farsi', 'farti', 'farvi',
  ],

  /**
   * Forme degli ausiliari essere / avere / stare. Le altre coniugazioni
   * restano: sono la spina dorsale dell'italiano e reggono bene il gioco.
   * "stato" resta perché e' anche un sostantivo.
   */
  auxiliary: [
    'avevi', 'avuta', 'avute', 'avuti', 'foste',
    'stare', 'stata', 'state', 'stati', 'stava', 'stavi', 'stavo',
  ],

  /** Refusi del corpus di sottotitoli e forme arcaiche. */
  noise: ['perte', 'iddio'],
}

const CURATED_SET = new Set(Object.values(CURATED_EXCLUSIONS).flat())

async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function fetchSource({ url, file }, offline) {
  const cached = join(CACHE, file)
  if (await exists(cached)) return readFile(cached, 'utf8')
  if (offline) throw new Error(`--offline ma ${file} non e' in cache. Esegui una volta senza --offline.`)

  process.stdout.write(`  scarico ${file} … `)
  const response = await fetch(url)
  if (!response.ok) throw new Error(`HTTP ${response.status} su ${url}`)
  const text = await response.text()
  await mkdir(CACHE, { recursive: true })
  await writeFile(cached, text, 'utf8')
  console.log(`${(text.length / 1024).toFixed(0)} kB`)
  return text
}

/** Righe non vuote, minuscole, senza spazi ai bordi. */
function lines(text) {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim().toLowerCase())
    .filter(Boolean)
}

/**
 * Tiene solo le parole di esattamente cinque lettere a-z.
 *
 * Le parole con accento o apostrofo ("citta'", "perche'") sono escluse invece
 * di essere normalizzate: farle digitare senza accento sarebbe una grafia
 * sbagliata, e la tastiera del gioco resta un pulito A-Z.
 */
function fiveLetterWords(list) {
  const out = new Set()
  for (const word of list) {
    if (word.length === WORD_LENGTH && /^[a-z]{5}$/.test(word)) out.add(word)
  }
  return out
}

/**
 * Toglie le parole con j, k, w, x, y.
 *
 * L'alfabeto italiano ha 21 lettere: quelle cinque compaiono solo nei prestiti
 * (black, boxer, derby, banjo…). Escludendole, la tastiera del gioco può
 * mostrare 21 tasti invece di 26 — su un telefono sono tasti sensibilmente
 * piu' grandi — e non resta nessun tasto che non possa mai servire.
 */
function withoutForeignLetters(words) {
  const out = new Set()
  for (const word of words) if (!FOREIGN_LETTERS.test(word)) out.add(word)
  return out
}

function parseFrequency(text) {
  const map = new Map()
  let rank = 0
  for (const line of text.split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/)
    if (parts.length !== 2) continue
    const word = parts[0].toLowerCase()
    const count = Number(parts[1])
    if (!Number.isFinite(count)) continue
    rank += 1
    if (!map.has(word)) map.set(word, { rank, count })
  }
  return map
}

function tsHeader(title, extra) {
  return `/**
 * ${title}
 *
 * FILE GENERATO — non modificare a mano.
 * Rigenera con: npm run words:build
 *
${extra
  .split('\n')
  .map((l) => ` * ${l}`.trimEnd())
  .join('\n')}
 */

`
}

/** Righe da 10 parole: il diff resta leggibile e il file non ha righe chilometriche. */
function formatWordArray(words, perLine = 10) {
  const rows = []
  for (let i = 0; i < words.length; i += perLine) {
    rows.push('  ' + words.slice(i, i + perLine).map((w) => `'${w}'`).join(', ') + ',')
  }
  return rows.join('\n')
}

async function main() {
  const offline = process.argv.includes('--offline')
  console.log('Genero gli elenchi di parole italiane da 5 lettere\n')

  const [wordsRaw, properRaw, badRaw, freqRaw] = await Promise.all([
    fetchSource(SOURCES.words, offline),
    fetchSource(SOURCES.properNouns, offline),
    fetchSource(SOURCES.badWords, offline),
    fetchSource(SOURCES.frequency, offline),
  ])

  const allFiveLetter = fiveLetterWords(lines(wordsRaw))
  const guesses = withoutForeignLetters(allFiveLetter)
  const properNouns = fiveLetterWords(lines(properRaw))
  const badWords = fiveLetterWords(lines(badRaw))
  const frequency = parseFrequency(freqRaw)

  console.log(`\n  parole da 5 lettere          ${allFiveLetter.size}`)
  console.log(`  con j/k/w/x/y, escluse       ${allFiveLetter.size - guesses.size}`)
  console.log(`  tentativi ammessi            ${guesses.size}`)
  console.log(`  nomi propri da 5 lettere     ${properNouns.size}`)
  console.log(`  parolacce da 5 lettere       ${badWords.size}`)

  const accented = buildAccentedIndex(frequency)

  const rejected = { rare: 0, absent: 0, proper: 0, bad: 0, stoplist: 0, foreign: 0, accent: 0, curated: 0 }
  const dropped = { foreign: [], accent: [] }
  const solutions = []

  for (const word of guesses) {
    if (SOLUTION_STOPLIST.has(word)) {
      rejected.stoplist += 1
      continue
    }
    if (properNouns.has(word)) {
      rejected.proper += 1
      continue
    }
    if (badWords.has(word)) {
      rejected.bad += 1
      continue
    }
    if (CURATED_SET.has(word)) {
      rejected.curated += 1
      continue
    }
    if (!looksItalian(word)) {
      rejected.foreign += 1
      dropped.foreign.push(word)
      continue
    }
    const stat = frequency.get(word)
    if (!stat) {
      rejected.absent += 1
      continue
    }
    if (stat.count < MIN_SOLUTION_FREQUENCY) {
      rejected.rare += 1
      continue
    }
    const accentedCount = accented.get(word)
    if (accentedCount && stat.count < accentedCount * ACCENT_DOMINANCE) {
      rejected.accent += 1
      dropped.accent.push(word)
      continue
    }
    solutions.push({ word, ...stat })
  }

  // Ordinate per frequenza decrescente: l'ordine e' solo documentale, il gioco
  // pesca tramite la permutazione deterministica di shared/daily.ts.
  solutions.sort((a, b) => b.count - a.count || a.word.localeCompare(b.word, 'it'))

  console.log(`\n  soluzioni                    ${solutions.length}`)
  console.log(`  scartate: assenti dal corpus ${rejected.absent}`)
  console.log(`            troppo rare        ${rejected.rare}`)
  console.log(`            nomi propri        ${rejected.proper}`)
  console.log(`            volgari            ${rejected.bad}`)
  console.log(`            collante gramm.    ${rejected.stoplist}`)
  console.log(`            grafia straniera   ${rejected.foreign}`)
  console.log(`            accento mancante   ${rejected.accent}`)
  console.log(`            curatela manuale   ${rejected.curated}`)

  if (process.argv.includes('--explain')) {
    console.log(`\n  scartate per accento mancante: ${dropped.accent.sort().join(', ')}`)
  }

  if (solutions.length < 365) {
    throw new Error(`Solo ${solutions.length} soluzioni: meno di un anno di gioco, controlla le fonti.`)
  }

  const sortedGuesses = [...guesses].sort((a, b) => a.localeCompare(b, 'it'))
  const solutionWords = solutions.map((s) => s.word)

  // Ogni soluzione deve essere un tentativo valido, altrimenti il gioco
  // rifiuterebbe la parola giusta.
  const orphan = solutionWords.find((w) => !guesses.has(w))
  if (orphan) throw new Error(`La soluzione "${orphan}" non e' fra i tentativi ammessi`)

  await mkdir(OUT_DIR, { recursive: true })

  await writeFile(
    join(OUT_DIR, 'guesses.ts'),
    tsHeader(
      `Parole italiane da ${WORD_LENGTH} lettere accettate come tentativo (${sortedGuesses.length}).`,
      `Fonte: napolux/paroleitaliane, 280000_parole_italiane.txt (MIT).
Filtro: esattamente ${WORD_LENGTH} caratteri, alfabeto italiano di 21 lettere
        (niente j k w x y), senza accenti ne' apostrofi.
Ordine alfabetico.`,
    ) +
      `export const GUESS_WORDS: readonly string[] = [\n${formatWordArray(sortedGuesses)}\n]\n\n` +
      `/** Set per il controllo O(1) di validita' di un tentativo. */\n` +
      `export const GUESS_SET: ReadonlySet<string> = new Set(GUESS_WORDS)\n`,
    'utf8',
  )

  await writeFile(
    join(OUT_DIR, 'solutions.ts'),
    tsHeader(
      `Parole che possono uscire come parola del giorno (${solutionWords.length}).`,
      `Sottoinsieme di GUESS_WORDS ristretto alle parole di uso comune.
Fonti: napolux/paroleitaliane (MIT) per le parole,
       hermitdave/FrequencyWords it_50k, corpus OpenSubtitles 2018 (MIT) per le frequenze.
Criteri: almeno ${MIN_SOLUTION_FREQUENCY} occorrenze nel corpus; esclusi nomi propri,
         termini volgari e preposizioni articolate / forme ausiliari.
Ordine: frequenza d'uso decrescente (${solutionWords.length} parole = oltre ${Math.floor(solutionWords.length / 365)} anni di gioco).`,
    ) + `export const SOLUTION_WORDS: readonly string[] = [\n${formatWordArray(solutionWords)}\n]\n`,
    'utf8',
  )

  console.log('\n  scritto shared/words/guesses.ts')
  console.log('  scritto shared/words/solutions.ts')
  console.log(`\n  prime 20 soluzioni: ${solutionWords.slice(0, 20).join(', ')}`)
  console.log(`  ultime 20:          ${solutionWords.slice(-20).join(', ')}`)
}

main().catch((error) => {
  console.error(`\nErrore: ${error.message}`)
  process.exit(1)
})

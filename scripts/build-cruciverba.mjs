#!/usr/bin/env node
/**
 * Genera le definizioni del cruciverba: per ogni risposta possibile, le
 * definizioni del Wikizionario che la descrivono.
 *
 * FONTE: il Wikizionario italiano (it.wiktionary.org), nell'estrazione
 * strutturata di wiktextract pubblicata da kaikki.org. Licenza CC BY-SA 4.0:
 * le definizioni sono scritte dai volontari del Wikizionario, qui si scelgono e
 * si accorciano ma non si riscrivono. Le regole di scelta stanno in
 * scripts/cruciverba/definizioni.mjs.
 *
 * Il peso di ogni parola e' la sua posizione nell'elenco di frequenza di
 * OpenSubtitles (hermitdave/FrequencyWords, lo stesso del Wordle): il generatore
 * preferisce le parole comuni, così lo schema si risolve con quel che si sa e
 * non con quel che si cerca.
 *
 * L'uscita e' versionata, come il dizionario dello Scarabeo: i cruciverba
 * futuri si generano in CI, e non devono dipendere da un file di 43 MB che
 * kaikki.org rigenera ogni settimana.
 *
 * Uso:  node scripts/build-cruciverba.mjs [--offline]
 */

import { createReadStream } from 'node:fs'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { createGunzip, gzipSync } from 'node:zlib'
import {
  definizioniDellaVoce,
  formeDellaVoce,
  normalizzaRisposta,
  rivelaLaRisposta,
  senzaAccenti,
} from './cruciverba/definizioni.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const CACHE = join(HERE, '.cache')
const OUT = join(HERE, 'data', 'cruciverba-definizioni.tsv.gz')

const FONTI = {
  wikizionario: {
    url: 'https://kaikki.org/itwiktionary/raw-wiktextract-data.jsonl.gz',
    file: 'itwiktionary-wiktextract.jsonl.gz',
  },
  frequenze: {
    url: 'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/it/it_50k.txt',
    file: 'it_50k.txt',
  },
  parolacce: {
    url: 'https://raw.githubusercontent.com/napolux/paroleitaliane/master/paroleitaliane/lista_badwords.txt',
    file: 'lista_badwords.txt',
  },
}

/** Quante definizioni tenere per risposta: bastano a variare fra un giorno e l'altro. */
const PER_RISPOSTA = 3

const OFFLINE = process.argv.includes('--offline')

async function esiste(percorso) {
  try {
    await access(percorso)
    return true
  } catch {
    return false
  }
}

async function scarica({ url, file }) {
  const locale = join(CACHE, file)
  if (await esiste(locale)) return locale
  if (OFFLINE) throw new Error(`Manca ${file} nella cache e sono in --offline`)
  process.stdout.write(`  scarico ${file}… `)
  const risposta = await fetch(url)
  if (!risposta.ok) throw new Error(`${file}: HTTP ${risposta.status}`)
  await mkdir(CACHE, { recursive: true })
  await writeFile(locale, Buffer.from(await risposta.arrayBuffer()))
  console.log('fatto')
  return locale
}

console.log('Definizioni del cruciverba')

const [dump, fileFrequenze, fileParolacce] = await Promise.all([
  scarica(FONTI.wikizionario),
  scarica(FONTI.frequenze),
  scarica(FONTI.parolacce),
])

/** Posizione di ogni forma nell'elenco di frequenza (1 = la piu' comune). */
const rango = new Map()
{
  const righe = (await readFile(fileFrequenze, 'utf8')).split('\n')
  righe.forEach((riga, i) => {
    const forma = senzaAccenti(riga.split(' ')[0]?.toLowerCase() ?? '')
    if (forma && !rango.has(forma)) rango.set(forma, i + 1)
  })
}

const escluse = new Set(
  (await readFile(fileParolacce, 'utf8'))
    .split('\n')
    .map((r) => normalizzaRisposta(r))
    .filter(Boolean),
)

/** risposta → definizioni, nell'ordine in cui compaiono nel Wikizionario. */
const definizioni = new Map()
/** Le forme flesse, da risolvere alla fine: il lemma puo' venire dopo nel dump. */
const forme = []
let voci = 0

function aggiungi(risposta, d) {
  const elenco = definizioni.get(risposta) ?? []
  if (!elenco.some((x) => x.testo.toLowerCase() === d.testo.toLowerCase())) elenco.push(d)
  definizioni.set(risposta, elenco)
}

const righe = createInterface({ input: createReadStream(dump).pipe(createGunzip()), crlfDelay: Infinity })
for await (const riga of righe) {
  if (!riga.includes('"lang_code": "it"')) continue
  const voce = JSON.parse(riga)
  if (voce.lang_code !== 'it') continue
  voci += 1
  const risposta = normalizzaRisposta(voce.word)
  if (!risposta || escluse.has(risposta)) continue
  for (const d of definizioniDellaVoce(voce, risposta)) aggiungi(risposta, d)
  for (const f of formeDellaVoce(voce)) forme.push({ risposta, ...f })
}

/*
 * Le forme flesse prendono la prima definizione del loro lemma, con la nota
 * della forma. Vanno in coda alle definizioni proprie: "rosa" e' anche il
 * femminile plurale di "roso", ma prima e' un fiore.
 */
let flesse = 0
for (const { risposta, lemma, nota, pos } of forme) {
  const chiave = normalizzaRisposta(lemma)
  if (!chiave || chiave === risposta) continue
  const base = definizioni.get(chiave)?.find((d) => !d.nota && d.pos === pos)
  if (!base || rivelaLaRisposta(base.testo, risposta)) continue
  if (!definizioni.has(risposta)) flesse += 1
  aggiungi(risposta, { testo: base.testo, voce: base.voce, nota, pos })
}

/*
 * Una riga per risposta: `risposta, rango, definizioni…`, separate da
 * tabulazioni. Il rango e' 0 per le parole fuori dall'elenco di frequenza.
 * Ogni definizione e' `voce|testo|nota`: la voce e' il lemma del Wikizionario da
 * cui viene, con accenti e maiuscole ("tè", "Milano"), e serve al collegamento
 * alla fonte; la nota e' vuota, oppure "sigla", "plurale", "femminile",
 * "femminile plurale".
 */
const risposte = [...definizioni.keys()].sort()
const testo = risposte
  .map((r) =>
    [
      r,
      rango.get(r) ?? 0,
      ...definizioni
        .get(r)
        .slice(0, PER_RISPOSTA)
        .map((d) => `${d.voce}|${d.testo}|${d.nota}`),
    ].join('\t'),
  )
  .join('\n')
const compresso = gzipSync(Buffer.from(testo, 'utf8'), { level: 9 })
await mkdir(dirname(OUT), { recursive: true })
await writeFile(OUT, compresso)

const perLunghezza = new Map()
let comuni = 0
for (const r of risposte) {
  perLunghezza.set(r.length, (perLunghezza.get(r.length) ?? 0) + 1)
  if (rango.has(r)) comuni += 1
}
console.log(`  voci italiane lette: ${voci.toLocaleString('it-IT')}`)
console.log(`  risposte con almeno una definizione: ${risposte.length.toLocaleString('it-IT')}`)
console.log(`  di cui forme flesse (plurali, femminili): ${flesse.toLocaleString('it-IT')}`)
console.log(`  di cui nell'elenco di frequenza: ${comuni.toLocaleString('it-IT')}`)
console.log(
  '  per lunghezza: ' +
    [...perLunghezza.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([n, q]) => `${n}:${q}`)
      .join(' '),
)
console.log(`  scritto ${OUT.replace(ROOT + '/', '')} — ${(compresso.length / 1024).toFixed(0)} kB`)

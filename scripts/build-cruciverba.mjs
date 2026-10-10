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

/**
 * Quante definizioni tenere per risposta: i primi sensi del Wikizionario, poi i
 * sinonimi, poi gli altri sensi. Il generatore usa la prima che la parola non ha
 * avuto di recente, quindi piu' ce ne sono e meno la stessa parola torna con la
 * stessa definizione.
 */
const PER_RISPOSTA = 7
/** I sensi che vengono prima dei sinonimi: i successivi sono spesso rari o tecnici. */
const SENSI_PRIMA = 3
/** Quanti sinonimi per risposta. */
const SINONIMI = 2
/** Un sinonimo fa da definizione solo se e' comune: "Epoca" per ERA, non "Evo". */
const RANGO_SINONIMO = 30000
/** Sinonimi veri ma da bambini: "Cacca" non e' una definizione da cruciverba. */
const INFANTILI = new Set(['cacca', 'popo', 'pupu', 'pipi', 'bua', 'nanna', 'pappa'])

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
/**
 * risposta → i sinonimi che il Wikizionario le da', normalizzati come le
 * risposte, con la loro grafia nella voce: "età", non "eta".
 */
const sinonimi = new Map()
/** Le parti del discorso di ogni lemma: un sinonimo deve averne una in comune con la risposta. */
const partiDi = new Map()
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
  // Solo i lemmi: una forma flessa ("pensa") non e' un sinonimo di niente.
  if ((voce.senses ?? []).every((senso) => (senso.tags ?? []).includes('form-of'))) continue
  partiDi.set(risposta, (partiDi.get(risposta) ?? new Set()).add(voce.pos))
  for (const { word } of voce.synonyms ?? []) {
    const forma = typeof word === 'string' && /^[\p{L}']+$/u.test(word.trim()) ? normalizzaRisposta(word) : null
    if (!forma || forma === risposta) continue
    const elenco = sinonimi.get(risposta) ?? new Map()
    if (!elenco.has(forma)) elenco.set(forma, word.trim().toLowerCase())
    sinonimi.set(risposta, elenco)
  }
}

/*
 * Le interiezioni in fondo, per le parole da quattro lettere in su. Il dump
 * elenca le voci nell'ordine in cui stanno nella pagina, e per "aria"
 * l'interiezione ("Vattene via") arriva prima del nome: il generatore usa la
 * prima definizione, e ARIA diventava un'esortazione — lo stesso per OCCHIO,
 * CAVOLO, SVEGLIA. Le parole corte restano come sono: per AH e OH l'interiezione
 * e' il senso principale.
 *
 * Fra nomi, aggettivi e verbi invece l'ordine resta quello del Wikizionario:
 * mettere sempre prima il nome dava ad ADEGUATO un termine di contabilita' e ad
 * AGITATO un "malato di mente", sensi veri ma non quelli a cui uno pensa.
 */
for (const [risposta, elenco] of definizioni) {
  if (risposta.length <= 3) continue
  elenco.sort((x, y) => (x.pos === 'intj' ? 1 : 0) - (y.pos === 'intj' ? 1 : 0))
}

/*
 * I sinonimi come definizioni: "Epoca" per ERA, "Micio" per GATTO. Il
 * Wikizionario li elenca per voce e non per senso, e ci mette anche parole solo
 * vicine — per MARE "spiaggia" e "riva" — quindi vale solo un sinonimo
 * reciproco, che a sua volta da' la risposta fra i suoi: "spiaggia" non ha
 * "mare". Poi deve essere un lemma con una parte del discorso della risposta —
 * per IDEA usciva "Pensa" —, comune, non una parolaccia, e non deve rivelare la
 * risposta. Le parole di due e tre lettere no: i loro sinonimi sono preposizioni
 * e pronomi ("Per" per IN), e hanno le definizioni da enigmista del generatore.
 * Vanno dopo i primi sensi, perché il senso principale resta la definizione
 * migliore, e prima degli altri, che sono spesso rari.
 */
let conSinonimi = 0
for (const [risposta, elenco] of definizioni) {
  const propri = definizioni.get(risposta).filter((d) => !d.nota)
  if (propri.length === 0 || risposta.length < 4) continue
  const propriSinonimi = sinonimi.get(risposta) ?? new Map()
  const scelti = [...propriSinonimi.keys()]
    .filter((s) => sinonimi.get(s)?.has(risposta))
    .filter((s) => [...(partiDi.get(s) ?? [])].some((p) => partiDi.get(risposta)?.has(p)))
    .filter((s) => s.length >= 3 && (rango.get(s) ?? Infinity) <= RANGO_SINONIMO)
    .filter((s) => !escluse.has(s) && !INFANTILI.has(s))
    .sort((a, b) => rango.get(a) - rango.get(b))
    .map((s) => propriSinonimi.get(s))
    .map((s) => s[0].toUpperCase() + s.slice(1))
    .filter((t) => !rivelaLaRisposta(t, risposta))
    .slice(0, SINONIMI)
  if (scelti.length === 0) continue
  conSinonimi += 1
  const voce = propri[0].voce
  const nuovi = scelti.map((testo) => ({ testo, voce, nota: '', pos: 'sinonimo' }))
  const testi = new Set(elenco.map((d) => d.testo.toLowerCase()))
  const daAggiungere = nuovi.filter((d) => !testi.has(d.testo.toLowerCase()))
  definizioni.set(risposta, [...elenco.slice(0, SENSI_PRIMA), ...daAggiungere, ...elenco.slice(SENSI_PRIMA)])
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
console.log(`  con almeno un sinonimo reciproco: ${conSinonimi.toLocaleString('it-IT')}`)
console.log(`  di cui nell'elenco di frequenza: ${comuni.toLocaleString('it-IT')}`)
console.log(
  '  per lunghezza: ' +
    [...perLunghezza.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([n, q]) => `${n}:${q}`)
      .join(' '),
)
console.log(`  scritto ${OUT.replace(ROOT + '/', '')} — ${(compresso.length / 1024).toFixed(0)} kB`)

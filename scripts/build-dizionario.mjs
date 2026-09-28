#!/usr/bin/env node
/**
 * Genera il dizionario dello Scarabeo: tutte le parole italiane giocabili.
 *
 * Non e' l'elenco del Wordle. Quello serve a cinque lettere e vuole parole che
 * un madrelingua riconosca subito; questo deve dire "questa parola esiste" per
 * qualunque lunghezza da 2 a 15, ed e' permissivo di proposito: rifiutare una
 * parola legittima in una partita a punti e' molto piu' fastidioso che
 * accettarne una obsoleta.
 *
 * FONTI
 *
 *  - napolux/paroleitaliane (MIT): 280.000 forme dell'italiano. E' la base, ed
 *    e' anche il vocabolario del computer.
 *  - il Wikizionario italiano e le voci italiane del Wiktionary inglese, nelle
 *    estrazioni di kaikki.org (CC BY-SA 4.0): i lemmi e le forme flesse che
 *    napolux non ha, e le coniugazioni da cui si costruiscono le forme con i
 *    pronomi attaccati (vedi scripts/scarabeo/enclitiche.mjs).
 *
 * DUE LIVELLI. Le parole **comuni** sono quelle di napolux: le gioca il
 * computer, ed e' su quelle che sono misurati i suoi livelli. Le **altre** — le
 * forme del Wiktionary che napolux non ha e le enclitiche — valgono quando le
 * gioca una persona, ma il computer non le usa: un computer che fa punti con
 * "portarglielo" o "abbacchiassimo" non gioca, recita un elenco.
 *
 * Quel che si toglie:
 *
 *  - **gli accenti.** Sul tabellone non ci sono tessere accentate: chi gioca
 *    "città" posa C-I-T-T-A, quindi la forma senza accento e' quella valida.
 *  - **j, k, w, x, y**, con le parole che le contengono: non ci sono tessere
 *    per giocarle. E apostrofi e trattini: una voce di due parole non vale.
 *  - **i nomi propri**, che nel gioco da tavolo non valgono. L'elenco dei nomi
 *    di napolux pero' comprende "rosa", "stella", "viola", "gioia", "franco", e
 *    prima li toglieva: una parola che il Wiktionary conosce come nome comune,
 *    aggettivo o verbo adesso resta.
 *  - **le parolacce** e le voci che il Wiktionary da' solo come volgari o
 *    offensive: l'hub lo usano dei colleghi, e il computer non deve giocarle.
 *  - **sigle, abbreviazioni, prefissi e suffissi.**
 *
 * Le uscite sono versionate e compresse: il DAWG si ricostruisce senza rete.
 *
 *   scripts/data/dizionario-scarabeo.txt.gz             le comuni
 *   scripts/data/dizionario-scarabeo-altre.txt.gz       le altre, senza le enclitiche
 *   scripts/data/dizionario-scarabeo-enclitiche.txt.gz  le basi delle enclitiche
 *
 * Poi `npm run dawg:build` ne fa il DAWG che usano il browser e il server.
 *
 * Uso:  node scripts/build-dizionario.mjs [--offline]
 */

import { createReadStream } from 'node:fs'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { createGunzip, gzipSync } from 'node:zlib'
import { formeEnclitiche, scriviBase } from './scarabeo/enclitiche.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const CACHE = join(HERE, '.cache')
const USCITE = {
  comuni: join(HERE, 'data', 'dizionario-scarabeo.txt.gz'),
  altre: join(HERE, 'data', 'dizionario-scarabeo-altre.txt.gz'),
  enclitiche: join(HERE, 'data', 'dizionario-scarabeo-enclitiche.txt.gz'),
}

const NAPOLUX = 'https://raw.githubusercontent.com/napolux/paroleitaliane/master/paroleitaliane'
const FONTI = {
  parole: { url: `${NAPOLUX}/280000_parole_italiane.txt`, file: '280000_parole_italiane.txt' },
  nomi: { url: `${NAPOLUX}/9000_nomi_propri.txt`, file: '9000_nomi_propri.txt' },
  parolacce: { url: `${NAPOLUX}/lista_badwords.txt`, file: 'lista_badwords.txt' },
  // Lo stesso file delle definizioni del cruciverba: la cache e' una sola.
  wikizionario: {
    url: 'https://kaikki.org/itwiktionary/raw-wiktextract-data.jsonl.gz',
    file: 'itwiktionary-wiktextract.jsonl.gz',
  },
  wiktionary: {
    url: 'https://kaikki.org/dictionary/Italian/kaikki.org-dictionary-Italian.jsonl.gz',
    file: 'enwiktionary-italiano.jsonl.gz',
  },
}

const OFFLINE = process.argv.includes('--offline')

/** Le 21 lettere italiane, da 2 a 15: il resto non e' giocabile. */
const GIOCABILE = /^[abcdefghilmnopqrstuvz]{2,15}$/

/** Le parti del discorso che fanno parole: niente nomi propri, sigle, affissi, locuzioni. */
const PARTI_BUONE = new Set([
  'noun',
  'verb',
  'adj',
  'adv',
  'intj',
  'prep',
  'conj',
  'pron',
  'det',
  'article',
  'num',
  'contraction',
  'particle',
  'postp',
])

/**
 * Le sigle. Il Wiktionary inglese chiama "abbreviation" anche le forme tronche
 * ("parlar", "amor", "ciel") e le parole accorciate ("otorino"): quelle sono
 * parole, e restano.
 */
const SIGLE = new Set(['initialism', 'acronym'])
const TRONCHE = new Set(['apocopic', 'clipping', 'contraction', 'ellipsis', 'archaic', 'literary', 'obsolete'])
/** "abbreviation of novembre", "m² abbreviation of metro quadro", "text messaging form of va beh". */
const GLOSSA_SIGLA = /\b(abbreviation|initialism|acronym|text messaging form) of\b/i
/** Una parola accorciata si spiega cosi': "short for autoeterodina", "variante di dottore". */
const GLOSSA_TRONCA = /^(short for|variante di|forma tronca di|troncamento di)\b/i
/** Un senso con una di queste etichette non e' una parola: errori e grafie condannate. */
const ERRORI = new Set(['misspelling', 'proscribed', 'hypercorrect'])

function eSigla(tag) {
  return tag.some((t) => SIGLE.has(t)) || (tag.includes('abbreviation') && !tag.some((t) => TRONCHE.has(t)))
}

/**
 * Una voce che ha solo sensi volgari o offensivi resta fuori. Gli spregiativi no:
 * "poetastro" e "ragazzaglia" sono parole, non insulti.
 */
const VOLGARI = new Set(['vulgar', 'offensive', 'slur', 'volgare', 'offensivo'])
/** Le forme con queste etichette non sono parole: intestazioni delle tabelle, errori. */
const FORME_NO = new Set([
  'table-tags',
  'inflection-template',
  'romanization',
  'misspelling',
  'proscribed',
  'hypercorrect',
  'error-unknown-tag',
  'error-unrecognized-form',
])

/** Minuscole, senza accenti, con l'apostrofo dritto: "Dà’" → "da'". */
function normalizza(testo) {
  return testo
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[’‘`´]/g, "'")
}

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

const righe = (testo) => testo.split('\n').map((r) => r.trim()).filter(Boolean)

/** Le voci italiane di un'estrazione di kaikki.org, una alla volta. */
async function* voci(file, filtro) {
  const lettore = createInterface({ input: createReadStream(file).pipe(createGunzip()), crlfDelay: Infinity })
  for await (const riga of lettore) {
    // Il Wikizionario ha voci di ogni lingua: il filtro evita di leggere le altre.
    if (!riga || (filtro && !riga.includes(filtro))) continue
    let voce
    try {
      voce = JSON.parse(riga)
    } catch {
      continue
    }
    if (voce.lang_code === 'it') yield voce
  }
}

const etichette = (x) => [...(x.tags ?? []), ...(x.raw_tags ?? [])]

/** I sensi dicono tutti la stessa cosa? Una voce senza sensi non dice niente. */
function tuttiI(sensi, vero) {
  return sensi.length > 0 && sensi.every(vero)
}

/** Un senso che non fa una parola: una sigla, un errore, o il rimando a una sigla ("nov" → "nov."). */
function sigla(s) {
  if ((s.glosses ?? []).some((g) => GLOSSA_TRONCA.test(g))) return false
  const tag = etichette(s)
  if (eSigla(tag) || tag.some((t) => ERRORI.has(t))) return true
  if (!tag.some((t) => TRONCHE.has(t)) && (s.glosses ?? []).some((g) => GLOSSA_SIGLA.test(g))) return true
  const verso = s.alt_of ?? []
  return verso.length > 0 && verso.every((x) => (x.word ?? '').endsWith('.'))
}
const volgare = (s) => etichette(s).some((t) => VOLGARI.has(t))

/**
 * Le parole a cui rimanda un senso che e' solo un rimando — "plurale di",
 * "variante di", "composto di fottere con mi" — oppure null.
 */
function rimandiDi(senso) {
  const bersagli = [...(senso.form_of ?? []), ...(senso.alt_of ?? [])].map((x) => normalizza(x.word ?? ''))
  // Per i composti conta il primo collegamento, che e' il verbo: "mi" non dice niente.
  if (senso.compound_of && senso.links?.[0]) bersagli.push(normalizza(senso.links[0][1].split('#')[0]))
  return bersagli.length > 0 ? bersagli : null
}

console.log('Dizionario dello Scarabeo')

const [fileParole, fileNomi, fileParolacce, fileWikizionario, fileWiktionary] = await Promise.all([
  scarica(FONTI.parole),
  scarica(FONTI.nomi),
  scarica(FONTI.parolacce),
  scarica(FONTI.wikizionario),
  scarica(FONTI.wiktionary),
])

const nomi = new Set(righe(await readFile(fileNomi, 'utf8')).map(normalizza))
const parolacce = new Set(righe(await readFile(fileParolacce, 'utf8')).map(normalizza))

/* ───────────────────────────  Il Wiktionary  ─────────────────────────── */

/** Le parole che conosce ciascuno dei due Wiktionary, lemmi e forme, senza le volgari. */
const wiki = { it: new Set(), en: new Set() }
/** Le voci solo volgari, con le loro forme: fuori anche se napolux le ha. */
const volgari = new Set()
/** Le parole con almeno un senso pulito che non e' un rimando: vincono su `volgari`. */
const pulite = new Set()
/** Le voci che sono solo rimandi, con le parole a cui rimandano: "fottermi" → fottere. */
const rimandi = new Map()
/** Quel che il Wiktionary da' solo come sigla, con qualunque iniziale: ONU, ecc., UE. */
const sigle = new Set()

/**
 * I verbi, per le enclitiche: infinito → basi e transitivita'.
 * `transitivo`: true, false, o null se nessuna fonte lo dice.
 */
const verbi = new Map()

function verbo(infinito) {
  let v = verbi.get(infinito)
  if (!v) {
    v = { gerundi: new Set(), imperativi: new Set(), plurali: new Set(), transitivo: null }
    verbi.set(infinito, v)
  }
  return v
}

function segnaTransitivo(v, valore) {
  if (valore === true) v.transitivo = true
  else if (valore === false && v.transitivo === null) v.transitivo = false
}

/** Le forme della tabella di coniugazione che servono alle enclitiche. */
function coniugazione(voce, v, persona) {
  for (const f of voce.forms ?? []) {
    const t = etichette(f)
    if (t.some((x) => FORME_NO.has(x)) || eSigla(t) || t.includes('negative')) continue
    const forma = normalizza(f.form ?? '')
    if (t.includes('gerund')) v.gerundi.add(forma)
    if (!t.includes('imperative') || t.includes('formal') || t.includes('third-person')) continue
    const p = persona(f, t)
    if (p === '2s') v.imperativi.add(forma)
    else if (p === '1p' || p === '2p') v.plurali.add(forma)
  }
}

let quanteVoci = 0
for (const [file, filtro, fonte] of [
  [fileWikizionario, '"lang_code": "it"', 'it'],
  [fileWiktionary, null, 'en'],
]) {
  for await (const voce of voci(file, filtro)) {
    quanteVoci += 1
    const grezza = voce.word ?? ''
    const parola = normalizza(grezza)
    const sensi = voce.senses ?? []
    // Il Wikizionario mette fra le abbreviazioni anche "dottor": quella e' una parola.
    const tronca = voce.pos === 'abbrev' && tuttiI(sensi, (x) => (x.glosses ?? []).some((g) => GLOSSA_TRONCA.test(g)))
    if ((voce.pos === 'abbrev' && !tronca) || tuttiI(sensi, sigla)) {
      sigle.add(parola.replace(/\.$/, ''))
      continue
    }
    if (!PARTI_BUONE.has(voce.pos) && !tronca) continue
    // Un nome proprio ha l'iniziale maiuscola anche quando la voce e' un "nome".
    if (grezza[0] !== grezza[0]?.toLowerCase()) continue

    const sporca = tuttiI(sensi, volgare)
    const bersagli = tuttiI(sensi, (s) => rimandiDi(s) !== null) ? sensi.flatMap(rimandiDi) : null
    const forme = [parola]
    for (const f of voce.forms ?? []) {
      // Una forma con una maiuscola e' una sigla o un nome: "CdA", "RAI".
      const tag = etichette(f)
      if (!f.form || f.form !== f.form.toLowerCase() || tag.some((t) => FORME_NO.has(t)) || eSigla(tag)) continue
      forme.push(normalizza(f.form))
    }
    for (const forma of forme) {
      if (!GIOCABILE.test(forma)) continue
      if (sporca) {
        volgari.add(forma)
        continue
      }
      wiki[fonte].add(forma)
      if (forma === parola && bersagli) rimandi.set(forma, [...(rimandi.get(forma) ?? []), ...bersagli])
      else pulite.add(forma)
    }

    // Solo i lemmi dei verbi, con la loro tabella: le voci delle forme ("parlavo") non ne hanno.
    if (voce.pos !== 'verb' || sporca || bersagli || etichette(voce).includes('form-of')) continue
    if (!/(are|ere|ire|rre|rsi|rsene)$/.test(parola) || !GIOCABILE.test(parola)) continue
    const v = verbo(parola)
    if (fonte === 'it') {
      const t = etichette(voce)
      segnaTransitivo(v, t.includes('transitive') ? true : t.includes('intransitive') ? false : null)
      coniugazione(voce, v, (f) => {
        const chi = f.raw_tags ?? []
        return chi.includes('tu') ? '2s' : chi.includes('noi') ? '1p' : chi.includes('voi') ? '2p' : null
      })
    } else {
      for (const s of sensi) {
        const t = etichette(s)
        segnaTransitivo(
          v,
          t.includes('transitive') || t.includes('ambitransitive') ? true : t.includes('intransitive') ? false : null,
        )
      }
      coniugazione(voce, v, (_, t) =>
        t.includes('second-person') && t.includes('singular')
          ? '2s'
          : t.includes('first-person') && t.includes('plural')
            ? '1p'
            : t.includes('second-person') && t.includes('plural')
              ? '2p'
              : null,
      )
    }
  }
}

// Un rimando a sole voci volgari e' volgare: "fottermi" e' un composto di fottere.
for (const [parola, bersagli] of rimandi) {
  if (!pulite.has(parola) && bersagli.every((b) => volgari.has(b) && !pulite.has(b))) volgari.add(parola)
}
for (const p of pulite) volgari.delete(p)
for (const p of [...parolacce, ...volgari]) {
  wiki.it.delete(p)
  wiki.en.delete(p)
}

/* ─────────────────────────  Le basi delle enclitiche  ───────────────────────── */

/** base → segni: una base di due verbi prende i pronomi di tutti e due. */
const basi = new Map()
function aggiungiBase(base, oggetto, doppia) {
  if (!/^[abcdefghilmnopqrstuvz]+$/.test(base) || base.length < 2) return
  const prima = basi.get(base) ?? { oggetto: false, doppia: false }
  basi.set(base, { oggetto: prima.oggetto || oggetto, doppia: prima.doppia || doppia })
}

for (const [infinito, v] of verbi) {
  if (parolacce.has(infinito) || volgari.has(infinito)) continue
  // Chi non si sa se e' transitivo lo e': meglio una forma in piu' che una giusta rifiutata.
  const oggetto = v.transitivo !== false
  // "pentirsi", "andarsene": la voce ha gia' il pronome, e le sue forme lo portano con se'.
  const pronominale = /(rsi|rsene)$/.test(infinito)
  const radice = pronominale
    ? infinito.replace(/(si|sene)$/, '')
    : infinito.endsWith('rre')
      ? infinito.slice(0, -2)
      : infinito.slice(0, -1)
  aggiungiBase(radice, oggetto, false)
  for (const g of v.gerundi) {
    const base = pronominale ? g.replace(/(si|sene)$/, '') : g
    if (base.endsWith('ndo')) aggiungiBase(base, oggetto, false)
  }
  if (pronominale) continue

  // L'imperativo di una sillaba vuole la consonante doppia (da' → dammi), anche nei
  // composti (rifallo, ridillo), e allora le altre forme del tu ("dai", "da") non
  // prendono pronomi: "dailo" non esiste.
  const composto = /(fare|dare|dire)$/.test(infinito)
  const apostrofate = [...v.imperativi]
    .filter((f) => f.endsWith("'") && (f.length <= 4 || composto))
    .map((f) => f.slice(0, -1))
  for (const f of apostrofate) aggiungiBase(f, oggetto, true)
  for (const f of v.imperativi) {
    if (f.endsWith("'")) continue
    if (apostrofate.some((a) => f === a || f === `${a}i`)) continue
    aggiungiBase(f, oggetto, false)
  }
  for (const f of v.plurali) aggiungiBase(f, oggetto, false)
}
// "Eccomi", "eccolo", "eccotelo": l'unica enclitica che non e' di un verbo (articolo 15).
aggiungiBase('ecco', true, false)

const righeBasi = [...basi].map(([base, segni]) => scriviBase({ base, ...segni })).sort()
const enclitiche = formeEnclitiche(righeBasi)

/* ──────────────────────────────  I due livelli  ────────────────────────────── */

const napolux = new Set(righe(await readFile(fileParole, 'utf8')).map(normalizza).filter((p) => GIOCABILE.test(p)))
const conosciuta = (p) => wiki.it.has(p) || wiki.en.has(p)

const comuni = new Set()
const tornate = []
const nomiFuori = []
let sigleTolte = 0
for (const p of napolux) {
  if (parolacce.has(p) || volgari.has(p)) continue
  // "ecc", "onu": napolux ha anche qualche sigla.
  if (sigle.has(p) && !conosciuta(p)) {
    sigleTolte += 1
    continue
  }
  if (nomi.has(p)) {
    // Un nome torna nel vocabolario del computer solo se il Wikizionario italiano lo
    // conosce come parola. Il Wiktionary inglese ha anche le forme antiche, e con lui
    // "piero" (da piare) e "matteo" (matto) tornerebbero: valgono, ma non le gioca il computer.
    if (!wiki.it.has(p)) {
      nomiFuori.push(p)
      continue
    }
    tornate.push(p)
  }
  comuni.add(p)
}

const altre = new Set()
for (const p of [...wiki.it, ...wiki.en]) {
  if (comuni.has(p) || enclitiche.has(p)) continue
  altre.add(p)
}

/* ──────────────────────────────  Le uscite  ────────────────────────────── */

async function scrivi(file, elenco) {
  const compresso = gzipSync(Buffer.from([...elenco].sort().join('\n'), 'utf8'), { level: 9 })
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, compresso)
  return `${(compresso.length / 1024).toFixed(0)} kB`
}

const pesi = {
  comuni: await scrivi(USCITE.comuni, comuni),
  altre: await scrivi(USCITE.altre, altre),
  enclitiche: await scrivi(USCITE.enclitiche, righeBasi),
}

const it = (n) => n.toLocaleString('it-IT')
const nuoveEnclitiche = [...enclitiche].filter((p) => !comuni.has(p) && !conosciuta(p)).length
const soloInglese = nomiFuori.filter(conosciuta).length
console.log(`  voci italiane lette: ${it(quanteVoci)}`)
console.log(`  comuni (le gioca il computer): ${it(comuni.size)} — ${pesi.comuni}`)
console.log(`  altre dal Wiktionary: ${it(altre.size)} — ${pesi.altre}`)
console.log(
  `  enclitiche: ${it(enclitiche.size)} da ${it(righeBasi.length)} basi di ${it(verbi.size)} verbi ` +
    `(${it(nuoveEnclitiche)} nuove) — ${pesi.enclitiche}`,
)
console.log(
  `  nomi dell'elenco che sono anche parole: ${it(tornate.length)} comuni, ${it(soloInglese)} fra le altre; ` +
    `fuori: ${it(nomiFuori.length - soloInglese)}`,
)
console.log(`  volgari tolte: ${it(volgari.size)}; parolacce dell'elenco: ${it(parolacce.size)}; sigle: ${it(sigleTolte)}`)
for (const [nome, file] of Object.entries(USCITE)) console.log(`  scritto ${nome}: ${file.replace(ROOT + '/', '')}`)

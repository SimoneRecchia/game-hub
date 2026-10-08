#!/usr/bin/env node
/**
 * Prepara le Ghigliottine dall'elenco scritto a mano.
 *
 *   scripts/data/ghigliottina.tsv                 le ghigliottine: la parola vincente e le cinque parole
 *                                                 che la nascondono, con l'espressione che le lega
 *   scripts/data/ghigliottina-classificate.json   le classificate con le esche, che legge lo script della notte
 *   public/dati/ghigliottina/libere.json          le libere, che scarica il telefono
 *   shared/ghigliottina-libere.ts                 l'impronta del file delle libere, per l'indirizzo (?v=)
 *
 * Come alla televisione, ogni parola giusta ha accanto una parola sbagliata,
 * l'esca. Le esche non si scrivono: sono le parole di un'altra ghigliottina,
 * l'esca del giorno, tutte e cinque della stessa, cosi' chi sbaglia strada
 * segue un'idea che sta in piedi. Un'esca non deve legarsi alla soluzione, e
 * per saperlo lo script mette insieme le espressioni del Wiktionary inglese e
 * del Wikizionario (le stesse estrazioni di kaikki.org del dizionario dello
 * Scarabeo), le parole composte di napolux e le espressioni dell'elenco: una
 * parola che ci sta accanto alla soluzione non fa da esca. Fra le esche
 * possibili sceglie quelle che somigliano di piu' alla parola giusta — la
 * stessa parte del discorso, lo stesso genere e numero, una lunghezza e una
 * frequenza vicine — perché la forma non dica qual e' quella giusta.
 *
 * Lo script dice anche quel che non torna: una parola che non sta nella sua
 * espressione, una soluzione che cinque parole indicano meno di un'altra.
 *
 * Classificate e libere si dividono le soluzioni, un terzo alle libere, e
 * ognuna prende le esche dalla sua parte: il file che scarica il telefono non
 * ha nessuna parola delle classificate.
 *
 * Uso:  node scripts/build-ghigliottina.mjs            (scarica le fonti che mancano in scripts/.cache/)
 *       node scripts/build-ghigliottina.mjs --offline  (solo la cache)
 */

import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { createGunzip } from 'node:zlib'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const CACHE = join(HERE, '.cache')
const OFFLINE = process.argv.includes('--offline')

const NAPOLUX = 'https://raw.githubusercontent.com/napolux/paroleitaliane/master/paroleitaliane'
const FONTI = {
  parole: { url: `${NAPOLUX}/280000_parole_italiane.txt`, file: '280000_parole_italiane.txt' },
  frequenze: {
    url: 'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/it/it_50k.txt',
    file: 'it_50k.txt',
  },
  wikizionario: {
    url: 'https://kaikki.org/itwiktionary/raw-wiktextract-data.jsonl.gz',
    file: 'itwiktionary-wiktextract.jsonl.gz',
  },
  wiktionary: {
    url: 'https://kaikki.org/dictionary/Italian/kaikki.org-dictionary-Italian.jsonl.gz',
    file: 'enwiktionary-italiano.jsonl.gz',
  },
}

/** Le libere hanno un terzo delle soluzioni: le classificate ne vogliono di piu'. */
const PARTI = 3

/** Collante grammaticale: in un'espressione non lega niente a niente. */
const VUOTE = new Set(
  `a ad al allo alla ai agli alle all da dal dallo dalla dai dagli dalle dall di del dello della dei degli delle
  dell d in nel nello nella nei negli nelle nell con col coi su sul sullo sulla sui sugli sulle sull per tra fra il
  lo la i gli le l un uno una e ed o od né ne ma se che chi non come più meno mi ti si ci vi me te ce ve lui lei noi
  voi loro suo sua suoi sue mio mia tuo tua essere avere fare è ha sono era qualcuno qualcosa quello quella questo
  questa tutto tutti ogni altro altra cosa sé`.split(/\s+/),
)

const ACCENTI = { à: 'a', á: 'a', è: 'e', é: 'e', ì: 'i', í: 'i', ò: 'o', ó: 'o', ù: 'u', ú: 'u' }
const piana = (p) => p.toLowerCase().replace(/[àáèéìíòóùú]/g, (c) => ACCENTI[c])

/** Le parole di un'espressione, senza gli articoli e le preposizioni elisi ("d'oro" → "oro"). */
function parole(espressione) {
  const testo = espressione.toLowerCase().replace(/’/g, "'").replace(/\b[a-zàèéìíòóùú]+'/g, ' ')
  return (testo.match(/[a-zàèéìíòóùú]+/g) ?? []).filter((p) => p.length >= 3 && !VUOTE.has(p))
}

/** FNV-1a a 32 bit: divide le soluzioni fra classificate e libere sempre allo stesso modo. */
function fnv(testo) {
  let h = 0x811c9dc5
  for (let i = 0; i < testo.length; i += 1) {
    h ^= testo.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h
}

/** Due parole con la stessa radice, o l'una dentro l'altra: "padrone" e "padroni", "casa" e "casale". */
function stessaRadice(a, b) {
  const x = piana(a)
  const y = piana(b)
  const n = Math.max(3, Math.min(x.length, y.length, 5) - 1)
  return x.slice(0, n) === y.slice(0, n) || x.includes(y) || y.includes(x)
}

async function esiste(percorso) {
  try {
    await access(percorso)
    return true
  } catch {
    return false
  }
}

async function percorsoDi({ url, file }) {
  const percorso = join(CACHE, file)
  if (!(await esiste(percorso))) {
    if (OFFLINE) throw new Error(`Manca ${file} in scripts/.cache/ e --offline non scarica`)
    console.log(`  scarico ${url}`)
    const risposta = await fetch(url)
    if (!risposta.ok) throw new Error(`${url}: ${risposta.status}`)
    await mkdir(CACHE, { recursive: true })
    await writeFile(percorso, Buffer.from(await risposta.arrayBuffer()))
  }
  return percorso
}

/** Le voci italiane di un'estrazione di kaikki.org, una alla volta. */
async function* voci(percorso) {
  const lettore = createInterface({ input: createReadStream(percorso).pipe(createGunzip()), crlfDelay: Infinity })
  for await (const riga of lettore) {
    if (!riga.includes('"lang_code": "it"')) continue
    let voce
    try {
      voce = JSON.parse(riga)
    } catch {
      continue
    }
    if (voce.lang_code === 'it') yield voce
  }
}

const righe = (testo) =>
  testo
    .split(/\r?\n/)
    .map((r) => r.trim())
    .filter(Boolean)

/** L'elenco scritto a mano: soluzione e cinque coppie parola=espressione. */
async function elenco() {
  const testo = await readFile(join(HERE, 'data', 'ghigliottina.tsv'), 'utf8')
  const tutte = []
  const vietate = new Map()
  const errori = []
  for (const riga of testo.split('\n')) {
    if (!riga.trim() || riga.startsWith('#')) continue
    if (riga.startsWith('!')) {
      const [soluzione, ...parole] = riga.slice(1).split('\t')
      vietate.set(soluzione, new Set(parole.map((p) => p.trim())))
      continue
    }
    const [soluzione, ...legami] = riga.split('\t')
    const coppie = legami.map((l) => {
      const [parola, espressione] = l.split('=')
      return { parola: parola.trim(), espressione: (espressione ?? '').trim() }
    })
    if (coppie.length !== 5) errori.push(`${soluzione}: ${coppie.length} parole invece di cinque`)
    for (const { parola, espressione } of coppie) {
      if (!piana(espressione).replace(/[^a-z]/g, '').includes(piana(parola))) {
        errori.push(`${soluzione}: «${parola}» non sta in «${espressione}»`)
      }
      if (stessaRadice(parola, soluzione)) errori.push(`${soluzione}: «${parola}» ha la radice della soluzione`)
    }
    const radice = piana(soluzione).slice(0, Math.max(2, soluzione.length - 1))
    for (const { espressione } of coppie) {
      if (!piana(espressione).replace(/[^a-z ]/g, '').includes(radice)) {
        errori.push(`${soluzione}: la soluzione non sta in «${espressione}»`)
      }
    }
    if (new Set(coppie.map((c) => c.parola)).size !== coppie.length) errori.push(`${soluzione}: parole ripetute`)
    tutte.push({ soluzione, coppie })
  }
  const doppie = tutte.map((t) => t.soluzione).filter((s, i, a) => a.indexOf(s) !== i)
  for (const s of doppie) errori.push(`${s}: la soluzione e' due volte nell'elenco`)
  if (errori.length > 0) throw new Error(`L'elenco ha ${errori.length} errori:\n  ${errori.join('\n  ')}`)
  return { tutte, vietate }
}

async function main() {
  const { tutte, vietate } = await elenco()
  const [percorsoParole, percorsoFrequenze, percorsoIt, percorsoEn] = await Promise.all([
    percorsoDi(FONTI.parole),
    percorsoDi(FONTI.frequenze),
    percorsoDi(FONTI.wikizionario),
    percorsoDi(FONTI.wiktionary),
  ])
  const dizionario = new Set(righe(await readFile(percorsoParole, 'utf8')).map((p) => p.toLowerCase()))
  const frequenza = new Map()
  for (const riga of righe(await readFile(percorsoFrequenze, 'utf8'))) {
    const [parola, n] = riga.split(/\s+/)
    frequenza.set(parola, Number(n))
  }

  // Le parti del discorso, il genere e il numero di ogni forma, e il suo lemma.
  const parti = new Map()
  const lemmi = new Map()
  const aggiungi = (mappa, chiave, valore) => {
    if (!mappa.has(chiave)) mappa.set(chiave, new Set())
    mappa.get(chiave).add(valore)
  }
  // Le espressioni: ogni parola di un'espressione e' legata alle altre.
  const espressioni = []
  console.log('  leggo il Wikizionario e il Wiktionary…')
  for (const percorso of [percorsoIt, percorsoEn]) {
    for await (const voce of voci(percorso)) {
      const parola = voce.word
      if (parola.includes(' ')) espressioni.push(parola)
      else {
        aggiungi(parti, parola, voce.pos)
        for (const t of voce.tags ?? []) if (/^(masculine|feminine|singular|plural)$/.test(t)) aggiungi(parti, parola, t)
        for (const s of voce.senses ?? []) {
          for (const t of s.tags ?? []) if (/^(masculine|feminine|singular|plural)$/.test(t)) aggiungi(parti, parola, t)
          for (const f of s.form_of ?? []) if (f.word) aggiungi(lemmi, parola, f.word)
        }
      }
      for (const campo of ['derived', 'related', 'proverbs']) {
        for (const x of voce[campo] ?? []) if (x.word?.includes(' ')) espressioni.push(x.word)
      }
    }
  }
  for (const t of tutte) for (const c of t.coppie) espressioni.push(c.espressione)

  const lemmaDi = (p) => [...(lemmi.get(p) ?? [])]
  // Due mappe: le parole com'erano scritte, per dire se una soluzione e' ambigua, e con i lemmi, per le esche.
  const diretti = new Map()
  const legati = new Map()
  for (const e of espressioni) {
    const ps = [...new Set(parole(e))]
    if (ps.length < 2 || ps.length > 8) continue
    for (const a of ps) {
      for (const b of ps) {
        if (a === b) continue
        aggiungi(diretti, piana(a), piana(b))
        for (const x of [a, ...lemmaDi(a)]) for (const y of [b, ...lemmaDi(b)]) aggiungi(legati, piana(x), piana(y))
      }
    }
  }
  // Una parola composta lega le sue parti: "pesce" e "cane" per "pescecane".
  const composta = (a, b) => dizionario.has(piana(a) + piana(b)) || dizionario.has(piana(b) + piana(a))
  const legate = (a, b) =>
    legati.get(piana(a))?.has(piana(b)) ||
    legati.get(piana(b))?.has(piana(a)) ||
    vietate.get(a)?.has(b) ||
    vietate.get(b)?.has(a) ||
    composta(a, b) ||
    stessaRadice(a, b)

  // Quel che non torna, da guardare: legami che le fonti non conoscono, soluzioni che altre cinque parole indicano.
  const sconosciuti = []
  const ambigue = []
  const soluzioni = new Set(tutte.map((t) => t.soluzione))
  // Una parola che si lega a tutto ("dare", "mettere") indica qualunque cinque parole: non e' un'altra soluzione.
  const candidate = [...diretti.keys()].filter((p) => {
    const n = diretti.get(p).size
    return n >= 5 && n <= 400 && (parti.get(p)?.has('noun') || parti.get(p)?.has('adj') || soluzioni.has(p))
  })
  for (const t of tutte) {
    for (const c of t.coppie) if (!legate(t.soluzione, c.parola)) sconosciuti.push(`${t.soluzione}/${c.parola}`)
    const forme = new Set([piana(t.soluzione), ...lemmaDi(t.soluzione).map(piana)])
    for (const altra of candidate) {
      if (forme.has(altra) || lemmaDi(altra).some((l) => forme.has(piana(l))) || stessaRadice(altra, t.soluzione)) {
        continue
      }
      const quante = t.coppie.filter((c) => diretti.get(altra)?.has(piana(c.parola))).length
      if (quante >= 4) ambigue.push(`${t.soluzione} (anche ${altra}: ${quante} su 5)`)
    }
  }

  const somiglianza = (giusta, esca) => {
    const a = parti.get(giusta) ?? new Set()
    const b = parti.get(esca) ?? new Set()
    let punti = 0
    for (const pos of ['noun', 'adj', 'verb']) if (a.has(pos) && b.has(pos)) punti += 3
    for (const tag of ['masculine', 'feminine', 'singular', 'plural']) if (a.has(tag) && b.has(tag)) punti += 1
    punti -= Math.abs(giusta.length - esca.length) / 3
    const fa = Math.log10(1 + (frequenza.get(giusta) ?? 0))
    const fb = Math.log10(1 + (frequenza.get(esca) ?? 0))
    return punti - Math.abs(fa - fb) / 2
  }

  /** Le esche di una ghigliottina, dalle parole di un'altra della stessa parte. */
  function escheDi(t, parte, usate) {
    const giuste = t.coppie.map((c) => c.parola)
    const buona = (esca) =>
      !legate(t.soluzione, esca) &&
      !giuste.some((g) => g === esca || stessaRadice(g, esca)) &&
      piana(esca) !== piana(t.soluzione)
    let migliore = null
    for (const altra of parte) {
      if (altra === t || legate(altra.soluzione, t.soluzione)) continue
      if (altra.coppie.some((c) => c.parola === t.soluzione) || giuste.includes(altra.soluzione)) continue
      const possibili = altra.coppie.map((c) => c.parola).filter(buona)
      if (possibili.length < 5) continue
      // Le esche alle parole giuste, dalla coppia che si somiglia di piu': cinque parole, cinque esche.
      const libere = new Set(possibili)
      const scelte = []
      let punti = 0
      const coppie = giuste
        .flatMap((g) => possibili.map((e) => ({ g, e, s: somiglianza(g, e) })))
        .sort((x, y) => y.s - x.s || (x.g + x.e < y.g + y.e ? -1 : 1))
      const assegnate = new Map()
      for (const { g, e, s } of coppie) {
        if (assegnate.has(g) || !libere.has(e)) continue
        assegnate.set(g, e)
        libere.delete(e)
        punti += s
      }
      for (const g of giuste) scelte.push(assegnate.get(g))
      // Un'esca usata da troppe ghigliottine si riconoscerebbe: a parita', quella meno usata.
      punti -= 2 * (usate.get(altra.soluzione) ?? 0)
      const spareggio = fnv(t.soluzione + '|' + altra.soluzione)
      if (!migliore || punti > migliore.punti || (punti === migliore.punti && spareggio < migliore.spareggio)) {
        migliore = { punti, spareggio, esche: scelte, da: altra.soluzione }
      }
    }
    if (!migliore) throw new Error(`${t.soluzione}: nessuna ghigliottina da cui prendere le esche`)
    usate.set(migliore.da, (usate.get(migliore.da) ?? 0) + 1)
    return migliore
  }

  const classificate = tutte.filter((t) => fnv(t.soluzione) % PARTI !== 0)
  const libere = tutte.filter((t) => fnv(t.soluzione) % PARTI === 0)
  const conEsche = (parte) => {
    const usate = new Map()
    return parte
      .map((t) => {
        const { esche, da } = escheDi(t, parte, usate)
        return { s: t.soluzione, da, c: t.coppie.map((c, i) => [c.parola, esche[i], c.espressione]) }
      })
      .sort((a, b) => (a.s < b.s ? -1 : 1))
  }
  const giornate = conEsche(classificate)
  const daGiocare = conEsche(libere)

  await writeFile(
    join(HERE, 'data', 'ghigliottina-classificate.json'),
    JSON.stringify(giornate.map(({ s, c }) => ({ s, c })), null, 0).replace(/\},\{/g, '},\n{') + '\n',
  )
  const json = JSON.stringify({ ghigliottine: daGiocare.map(({ s, c }) => [s, c]) })
  await mkdir(join(ROOT, 'public', 'dati', 'ghigliottina'), { recursive: true })
  await writeFile(join(ROOT, 'public', 'dati', 'ghigliottina', 'libere.json'), json)
  const impronta = createHash('sha256').update(json).digest('hex').slice(0, 10)
  await writeFile(
    join(ROOT, 'shared', 'ghigliottina-libere.ts'),
    `/** L'impronta di public/dati/ghigliottina/libere.json: la scrive scripts/build-ghigliottina.mjs. */\n` +
      `export const VERSIONE_LIBERE_GHIGLIOTTINA = '${impronta}'\n`,
  )

  console.log(`Ghigliottina: ${giornate.length} classificate, ${daGiocare.length} libere, impronta ${impronta}`)
  console.log(`  ${sconosciuti.length} legami che il Wiktionary non conosce (scritti a mano)`)
  if (process.argv.includes('--dettagli')) {
    console.log(`  sconosciuti: ${sconosciuti.join(', ')}`)
    for (const g of [...giornate, ...daGiocare]) {
      console.log(`  ${g.s.toUpperCase()} (esche da ${g.da}): ${g.c.map(([p, e]) => `${p}/${e}`).join('  ')}`)
    }
  }
  if (ambigue.length > 0) console.log(`  da guardare, altre soluzioni possibili:\n    ${ambigue.join('\n    ')}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

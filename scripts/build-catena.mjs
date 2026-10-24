/**
 * Le catene della Catena, dalle espressioni scritte a mano per la Ghigliottina.
 *
 *   scripts/data/catena-classificate.json   le classificate, che legge lo script della notte
 *   public/dati/catena/libere.json          le libere, che scarica il telefono
 *   shared/catena-libere.ts                 l'impronta del file delle libere, per l'indirizzo (?v=)
 *
 * Una catena sono undici parole, e ognuna sta con la successiva in
 * un'espressione: spirito LIBERO, tiro libero, TIRO da cavallo... Le
 * espressioni vengono da due posti. Le prime sono quelle di
 * scripts/data/ghigliottina.tsv, scritte e guardate a mano: ognuna lega la
 * parola vincente di una ghigliottina a una delle sue cinque parole, e messe
 * tutte insieme fanno una rete di quasi millecinquecento parole. Le altre sono
 * le voci di due parole del Wikizionario e del Wiktionary ("lampo di genio",
 * "pugno di ferro"), solo i lemmi — non i plurali —, di parole comuni, senza
 * nomi propri e senza le voci rare, antiche o volgari: allargano la rete, ma
 * ogni parola da indovinare ha almeno un legame scritto a mano, quello che
 * basta a trovarla. Le catene sono strade sulla rete, tirate a caso da un seme
 * fisso, e se ne tengono quelle che si giocano bene:
 *
 * - le parole da indovinare (la seconda, la quarta, la sesta, l'ottava e la
 *   decima) sono parole note, di cinque lettere almeno, e non verbi; la
 *   finale di sei;
 * - con le sue prime due lettere, una parola da indovinare e' l'unica della
 *   rete che sta con le due parole accanto; la finale, che si vede con la sola
 *   prima lettera, lo e' con il terzo elemento, e senza puo' non esserlo: e'
 *   quella che deve far pensare, e il terzo elemento si compra per questo;
 * - nessuna parola ha la radice di un'altra della catena, e nessuna
 *   espressione contiene una terza parola della catena, che la direbbe;
 * - un'espressione sta in tre catene al piu', e una parola da indovinare in
 *   quattro: due catene che si somigliano non si riconoscono.
 *
 * Le classificate e le libere si scelgono insieme, a turno, e un'espressione
 * presa da una parte non la usa l'altra: giocare a caso non mostra mai un
 * legame della catena di un giorno.
 *
 * Uso:  node scripts/build-catena.mjs   (vuole in scripts/.cache/ le fonti della Ghigliottina:
 *                                         node scripts/build-ghigliottina.mjs le scarica)
 */

import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { createGunzip } from 'node:zlib'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')

/** Quante strade si tirano per parte: abbastanza da avere molte piu' catene buone di quelle che si tengono. */
const TENTATIVI = 3_000_000
/**
 * Quante volte un'espressione puo' stare nelle catene di una parte, e una parola da indovinare: le parole
 * adatte sono qualche centinaio, e ogni catena ne vuole cinque.
 */
const USI_ESPRESSIONE = 3
const USI_NASCOSTA = 4
/** Quante catene al massimo, per parte. */
const MASSIMO = { classificate: 400, libere: 400 }
/** Una parola da indovinare deve stare nei sottotitoli almeno tante volte; una data, almeno tante. */
const NOTA_NASCOSTA = 1500
const NOTA_DATA = 500
/** Le due parole di un'espressione del Wiktionary, almeno tante volte. */
const NOTA_ESPRESSIONE = 3000
/** I posti delle parole da indovinare, e della finale. */
const NASCOSTE = [1, 3, 5, 7]
const FINALE = 9
const LUNGHEZZA = 11

const ACCENTI = { à: 'a', á: 'a', è: 'e', é: 'e', ì: 'i', í: 'i', ò: 'o', ó: 'o', ù: 'u', ú: 'u' }
const piana = (p) => p.toLowerCase().replace(/[àáèéìíòóùú]/g, (c) => ACCENTI[c])

/** FNV-1a a 32 bit: divide le espressioni fra classificate e libere sempre allo stesso modo. */
function fnv(testo) {
  let h = 0x811c9dc5
  for (let i = 0; i < testo.length; i += 1) {
    h ^= testo.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h
}

/** Il generatore di shared/daily.ts: lo stesso seme, le stesse catene. */
function mulberry32(seme) {
  let a = seme >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Due parole con la stessa radice, o l'una dentro l'altra: "padrone" e "padroni", "casa" e "casale". */
function stessaRadice(a, b) {
  const x = piana(a)
  const y = piana(b)
  const n = Math.max(3, Math.min(x.length, y.length, 5) - 1)
  return x.slice(0, n) === y.slice(0, n) || x.includes(y) || y.includes(x)
}

/**
 * `parola` sta nell'espressione com'e' scritta: una sua parola e' proprio lei, o una parola composta che ha
 * intere lei e l'altra ("pianoforte"). Non "Cuor di Leone" per CUORE, ne' "fuga di cervelli" per CERVELLO.
 */
function esatta(espressione, parola, altra) {
  const parole = (t) => piana(t).split(/[^a-z]+/).filter(Boolean)
  const p = parole(parola).join('')
  const q = parole(altra).join('')
  return parole(espressione).some((t) => t === p || (t.includes(p) && t.includes(q)))
}

/** Un infinito: si lega a tutto ("dare", "mettere"), e da indovinare sarebbe un'altra cosa. */
const verbo = (p) => /(are|ere|ire|rre)$/.test(piana(p))

const chiave = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`)

/** Collante grammaticale: in un'espressione non lega niente a niente. */
const VUOTE = new Set(
  `a ad al allo alla ai agli alle all da dal dallo dalla dai dagli dalle dall di del dello della dei degli delle
  dell d in nel nello nella nei negli nelle nell con col coi su sul sullo sulla sui sugli sulle sull per tra fra il
  lo la i gli le l un uno una e ed o od né ne ma se che chi non come più meno mi ti si ci vi me te ce ve lui lei noi
  voi loro suo sua suoi sue mio mia tuo tua essere avere fare è ha sono era qualcuno qualcosa quello quella questo
  questa tutto tutti ogni altro altra cosa sé`.split(/\s+/),
)

/** Le parole di un'espressione, senza gli articoli e le preposizioni elisi ("d'oro" → "oro"). */
function parole(espressione) {
  const testo = espressione.toLowerCase().replace(/’/g, "'").replace(/\b[a-zàèéìíòóùú]+'/g, ' ')
  return (testo.match(/[a-zàèéìíòóùú]+/g) ?? []).filter((p) => p.length >= 3 && !VUOTE.has(p))
}

/** Le voci rare, antiche, volgari: non si giocano. */
const SCARTATE = new Set([
  'vulgar',
  'offensive',
  'obsolete',
  'archaic',
  'rare',
  'dialectal',
  'regional',
  'slang',
  'derogatory',
  'dated',
  'literary',
  'historical',
])

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

/**
 * Le espressioni di due parole del Wikizionario e del Wiktionary: lemmi, non
 * forme flesse; niente nomi propri, ne' voci che finiscono con una
 * preposizione ("sotto pena di"); niente voci che hanno solo sensi rari.
 */
async function espressioniDelWiktionary(nota) {
  const trovate = new Map()
  for (const file of ['itwiktionary-wiktextract.jsonl.gz', 'enwiktionary-italiano.jsonl.gz']) {
    for await (const voce of voci(join(HERE, '.cache', file))) {
      const testo = voce.word ?? ''
      const pezzi = testo.split(' ')
      if (pezzi.length < 2 || pezzi.length > 4 || /[A-Z0-9]/.test(testo) || VUOTE.has(pezzi.at(-1))) continue
      if (!['noun', 'adj', 'verb', 'adv', 'phrase', 'prep_phrase'].includes(voce.pos)) continue
      const sensi = voce.senses ?? []
      const flessa = (x) => x.form_of || x.alt_of || (x.tags ?? []).some((t) => t === 'form-of' || t === 'plural')
      if (sensi.length > 0 && sensi.every(flessa)) continue
      if (sensi.length > 0 && sensi.every((x) => (x.tags ?? []).some((t) => SCARTATE.has(t)))) continue
      const ps = parole(testo)
      if (ps.length !== 2 || ps[0] === ps[1] || stessaRadice(ps[0], ps[1])) continue
      if (!ps.every((p) => nota(p, NOTA_ESPRESSIONE))) continue
      const k = chiave(ps[0], ps[1])
      if (!trovate.has(k)) trovate.set(k, { testo, fonti: new Set() })
      trovate.get(k).fonti.add(file.startsWith('it') ? 'it' : 'en')
    }
  }
  return trovate
}

async function main() {
  const testo = await readFile(join(HERE, 'data', 'ghigliottina.tsv'), 'utf8')
  const espressioni = new Map()
  for (const riga of testo.split('\n')) {
    if (!riga.trim() || riga.startsWith('#') || riga.startsWith('!')) continue
    const [soluzione, ...legami] = riga.trim().split('\t')
    for (const l of legami) {
      const [parola, espressione] = l.split('=')
      // Le due parole devono stare nell'espressione come si vedono: "fuga di cervelli" non lega FUGA a CERVELLO.
      if (!esatta(espressione, parola.trim(), soluzione) || !esatta(espressione, soluzione, parola.trim())) continue
      espressioni.set(chiave(soluzione, parola.trim()), espressione.trim())
    }
  }
  const frequenza = new Map()
  for (const riga of (await readFile(join(HERE, '.cache', 'it_50k.txt'), 'utf8')).split('\n')) {
    const [parola, n] = riga.trim().split(/\s+/)
    if (parola) frequenza.set(parola, Number(n))
  }
  const nota = (p, soglia) => (frequenza.get(p) ?? 0) >= soglia
  // Le espressioni scritte a mano; poi quelle del Wiktionary, dove la coppia non ce l'ha gia'.
  const amano = new Set(espressioni.keys())
  const fonti = new Map()
  console.log('  leggo il Wikizionario e il Wiktionary…')
  for (const [k, { testo, fonti: da }] of await espressioniDelWiktionary(nota)) {
    // Quelle del solo Wiktionary inglese sono spesso calchi ("coltello per pane") o nomi di specie
    // ("averla piccola"): restano quelle che il Wikizionario conosce.
    if (espressioni.has(k) || !da.has('it')) continue
    espressioni.set(k, testo)
    fonti.set(k, da.size)
  }
  console.log(`  ${amano.size} espressioni scritte a mano, ${fonti.size} del Wiktionary`)

  // La rete intera, per dire se una parola e' ambigua, e le due parti, per tirare le strade.
  const vicini = (insieme) => {
    const v = new Map()
    for (const k of insieme) {
      const [a, b] = k.split('|')
      if (!v.has(a)) v.set(a, new Set())
      if (!v.has(b)) v.set(b, new Set())
      v.get(a).add(b)
      v.get(b).add(a)
    }
    return v
  }
  const tutte = [...espressioni.keys()]
  // Per dire se una parola e' ambigua basta la rete delle espressioni che si conoscono davvero: le scritte a
  // mano e quelle che hanno tutti e due i dizionari. Un'alternativa che sta solo in uno dei due non la pensa
  // nessuno.
  const rete = vicini(tutte.filter((k) => amano.has(k) || fonti.get(k) === 2))
  const accanto = (p) => rete.get(p) ?? new Set()

  /**
   * Un'altra parola della rete che, con le lettere che si vedono, starebbe al posto di quella giusta: le prime
   * due nella catena, la prima sola nella finale, che si cerca con il terzo elemento (vedi shared/catena.ts).
   */
  function altra(c, i) {
    const w = piana(c[i])
    const viste = i === FINALE ? 1 : 2
    const diverse = (x) => x !== c[i] && !c.includes(x)
    return [...accanto(c[i - 1])].find(
      (x) => diverse(x) && accanto(c[i + 1]).has(x) && piana(x).startsWith(w.slice(0, viste)),
    )
  }

  /** Una parola che puo' stare al posto `i`: da indovinare nei posti dispari, data in quelli pari. */
  const adatta = (p, i) =>
    i % 2 === 1 ? p.length >= (i === FINALE ? 6 : 5) && nota(p, NOTA_NASCOSTA) && !verbo(p) : nota(p, NOTA_DATA)

  /** La parola da indovinare al posto `i`, ora che si conoscono le sue due vicine. */
  function trovabile(c, i) {
    const p = c[i]
    // Almeno un legame scritto a mano; per la finale quello con la parola data, perché il terzo elemento si compra.
    const conosciuta =
      i === FINALE ? amano.has(chiave(c[i - 1], p)) : amano.has(chiave(c[i - 1], p)) || amano.has(chiave(p, c[i + 1]))
    return conosciuta && !altra(c, i)
  }

  function buona(c) {
    for (const i of [...NASCOSTE, FINALE]) if (!trovabile(c, i)) return false
    // Un'espressione che contiene un'altra parola della catena la direbbe.
    for (let i = 0; i + 1 < c.length; i += 1) {
      const e = ` ${piana(espressioni.get(chiave(c[i], c[i + 1]))).replace(/[^a-z]+/g, ' ')} `
      if (c.some((p, j) => j !== i && j !== i + 1 && e.includes(` ${piana(p)} `))) return false
    }
    return true
  }

  /** Il punteggio di una catena: parole da indovinare note, parole date che non si legano a tutto. */
  const punteggio = (c) =>
    [...NASCOSTE, FINALE].reduce((s, i) => s + Math.log10(frequenza.get(c[i]) ?? 1), 0) -
    c.filter((p, i) => i % 2 === 0 && verbo(p)).length * 1.5 +
    c.slice(1).reduce((s, p, i) => {
      const k = chiave(c[i], p)
      return s + (amano.has(k) ? 0.6 : fonti.get(k) === 2 ? 0.3 : 0)
    }, 0)

  /** Le catene buone che le strade a caso trovano sulla rete. */
  function candidate() {
    const v = vicini(tutte)
    const nodi = [...v.keys()].filter((n) => adatta(n, 0)).sort()
    const caso = mulberry32(0xca7e)
    const viste = new Set()
    const trovate = []
    // Strade a caso, ma ogni passo sceglie fra le parole che possono stare in quel posto, e una parola da
    // indovinare si controlla appena c'e' la sua vicina dopo: una strada che non va si butta subito.
    for (let t = 0; t < TENTATIVI; t += 1) {
      const c = [nodi[Math.floor(caso() * nodi.length)]]
      while (c.length < LUNGHEZZA) {
        const i = c.length
        const possibili = [...v.get(c[i - 1])]
          .filter((x) => adatta(x, i) && !c.some((y) => y === x || stessaRadice(x, y)))
          .sort()
        if (possibili.length === 0) break
        c.push(possibili[Math.floor(caso() * possibili.length)])
        if (i % 2 === 0 && i - 1 !== FINALE && !trovabile(c, i - 1)) break
      }
      if (c.length < LUNGHEZZA || !buona(c)) continue
      const k = c.join(' ')
      if (viste.has(k)) continue
      viste.add(k)
      trovate.push(c)
    }
    const diverse = new Set(trovate.flatMap((c) => [...NASCOSTE, FINALE].map((i) => c[i])))
    console.log(`  ${trovate.length} catene buone su ${TENTATIVI} strade, ${diverse.size} parole da indovinare`)
    return trovate.sort((a, b) => punteggio(b) - punteggio(a) || fnv(a.join()) - fnv(b.join()))
  }

  const legamiDi = (c) => c.slice(1).map((p, i) => chiave(c[i], p))
  const nascosteDi = (c) => [...NASCOSTE, FINALE].map((i) => c[i])

  /**
   * Le catene delle due parti, scelte a turno, due classificate per ogni libera: ogni volta quella con le
   * parole da indovinare usate meno finora nella sua parte, e a parita' la migliore. Prendere le migliori e
   * basta esaurirebbe subito le parole piu' comuni, e con loro le catene. Un'espressione presa da una parte
   * non la puo' usare l'altra.
   */
  function scegli(trovate) {
    const parti = {
      classificate: { tenute: [], espressioni: new Map(), nascoste: new Map(), finita: false },
      libere: { tenute: [], espressioni: new Map(), nascoste: new Map(), finita: false },
    }
    const prese = new Set()
    const altraDi = (nome) => parti[nome === 'classificate' ? 'libere' : 'classificate']
    const prendi = (nome) => {
      const parte = parti[nome]
      const altra = altraDi(nome)
      let scelta = -1
      let peso = Infinity
      for (let j = 0; j < trovate.length; j += 1) {
        if (prese.has(j)) continue
        const legami = legamiDi(trovate[j])
        if (legami.some((l) => altra.espressioni.has(l) || (parte.espressioni.get(l) ?? 0) >= USI_ESPRESSIONE)) {
          continue
        }
        const usi = nascosteDi(trovate[j]).map((p) => parte.nascoste.get(p) ?? 0)
        if (usi.some((u) => u >= USI_NASCOSTA)) continue
        // Le candidate sono in ordine di punteggio: a parita' di usi vince la prima.
        const somma = usi.reduce((x, y) => x + y, 0)
        if (somma < peso) {
          peso = somma
          scelta = j
          if (somma === 0) break
        }
      }
      if (scelta < 0) {
        parte.finita = true
        return
      }
      prese.add(scelta)
      const c = trovate[scelta]
      for (const l of legamiDi(c)) parte.espressioni.set(l, (parte.espressioni.get(l) ?? 0) + 1)
      for (const p of nascosteDi(c)) parte.nascoste.set(p, (parte.nascoste.get(p) ?? 0) + 1)
      parte.tenute.push({ p: c, e: legamiDi(c).map((l) => espressioni.get(l)) })
    }
    const ancora = (nome) => !parti[nome].finita && parti[nome].tenute.length < MASSIMO[nome]
    while (ancora('classificate') || ancora('libere')) {
      if (ancora('classificate')) prendi('classificate')
      if (ancora('classificate')) prendi('classificate')
      if (ancora('libere')) prendi('libere')
    }
    const ordinate = (nome) => parti[nome].tenute.sort((a, b) => (a.p.join() < b.p.join() ? -1 : 1))
    return { classificate: ordinate('classificate'), libere: ordinate('libere') }
  }

  const { classificate, libere } = scegli(candidate())

  await writeFile(
    join(HERE, 'data', 'catena-classificate.json'),
    JSON.stringify(classificate, null, 0).replace(/\},\{/g, '},\n{') + '\n',
  )
  const json = JSON.stringify({ catene: libere.map(({ p, e }) => [p, e]) })
  await mkdir(join(ROOT, 'public', 'dati', 'catena'), { recursive: true })
  await writeFile(join(ROOT, 'public', 'dati', 'catena', 'libere.json'), json)
  const impronta = createHash('sha256').update(json).digest('hex').slice(0, 10)
  await writeFile(
    join(ROOT, 'shared', 'catena-libere.ts'),
    `/** L'impronta di public/dati/catena/libere.json: la scrive scripts/build-catena.mjs. */\n` +
      `export const VERSIONE_LIBERE_CATENA = '${impronta}'\n`,
  )
  console.log(`Catena: ${classificate.length} classificate, ${libere.length} libere, impronta ${impronta}`)
  if (process.argv.includes('--dettagli')) {
    for (const { p } of [...classificate, ...libere]) {
      console.log(`  ${p.map((w, i) => (i % 2 ? w.toUpperCase() : w)).join(' > ')}`)
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

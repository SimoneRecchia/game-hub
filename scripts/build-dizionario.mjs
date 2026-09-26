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
 * FONTE: napolux/paroleitaliane (MIT) — la stessa del Wordle, vedi
 * shared/words/SOURCES.md.
 *
 * Tre trasformazioni che contano:
 *
 *  - **gli accenti si togliono.** Sul tabellone non esistono tessere
 *    accentate: chi gioca "città" posa C-I-T-T-A, quindi la forma senza
 *    accento deve essere quella valida. Senza questo passaggio "citta",
 *    "perche" e "piu" sarebbero rifiutate.
 *  - **j, k, w, x, y restano fuori**, con le parole che le contengono: non ci
 *    sono tessere per giocarle.
 *  - **nomi propri e parolacce restano fuori.** I primi perché nel gioco da
 *    tavolo non valgono; le seconde perché questo hub lo usano dei colleghi, e
 *    una parola offensiva in mezzo al tabellone la vedono tutti.
 *
 * L'uscita e' un file compresso, versionato: il seeding del database non deve
 * dipendere dalla rete, e 660 kB compressi sono meno di 2,8 MB in chiaro.
 *
 * Uso:  node scripts/build-dizionario.mjs [--offline]
 */

import { gzipSync } from 'node:zlib'
import { mkdir, readFile, writeFile, access } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const CACHE = join(HERE, '.cache')
const OUT = join(HERE, 'data', 'dizionario-scarabeo.txt.gz')

const BASE = 'https://raw.githubusercontent.com/napolux/paroleitaliane/master/paroleitaliane'
const FONTI = {
  parole: '280000_parole_italiane.txt',
  nomiPropri: '9000_nomi_propri.txt',
  parolacce: 'lista_badwords.txt',
}

const OFFLINE = process.argv.includes('--offline')

/** Le 21 lettere italiane, da 2 a 15: il resto non e' giocabile. */
const GIOCABILE = /^[abcdefghilmnopqrstuvz]{2,15}$/

const ACCENTI = {
  à: 'a', á: 'a', â: 'a', ä: 'a',
  è: 'e', é: 'e', ê: 'e', ë: 'e',
  ì: 'i', í: 'i', î: 'i', ï: 'i',
  ò: 'o', ó: 'o', ô: 'o', ö: 'o',
  ù: 'u', ú: 'u', û: 'u', ü: 'u',
}

function normalizza(riga) {
  return riga
    .trim()
    .toLowerCase()
    .replace(/[àáâäèéêëìíîïòóôöùúûü]/g, (c) => ACCENTI[c])
}

async function esiste(percorso) {
  try {
    await access(percorso)
    return true
  } catch {
    return false
  }
}

async function scarica(file) {
  const locale = join(CACHE, file)
  if (await esiste(locale)) return readFile(locale, 'utf8')
  if (OFFLINE) throw new Error(`Manca ${file} nella cache e sono in --offline`)

  process.stdout.write(`  scarico ${file}… `)
  const risposta = await fetch(`${BASE}/${file}`)
  if (!risposta.ok) throw new Error(`${file}: HTTP ${risposta.status}`)
  const testo = await risposta.text()
  await mkdir(CACHE, { recursive: true })
  await writeFile(locale, testo)
  console.log('fatto')
  return testo
}

const righe = (testo) => testo.split('\n').filter(Boolean)

console.log('Dizionario dello Scarabeo')

const [grezzo, nomi, parolacce] = await Promise.all([
  scarica(FONTI.parole),
  scarica(FONTI.nomiPropri),
  scarica(FONTI.parolacce),
])

const fuori = new Set([...righe(nomi), ...righe(parolacce)].map(normalizza))

const parole = new Set()
let scartate = 0
for (const riga of righe(grezzo)) {
  const parola = normalizza(riga)
  if (!GIOCABILE.test(parola)) {
    scartate += 1
    continue
  }
  if (fuori.has(parola)) continue
  parole.add(parola)
}

const elenco = [...parole].sort()
const testo = elenco.join('\n')
const compresso = gzipSync(Buffer.from(testo, 'utf8'), { level: 9 })

await mkdir(dirname(OUT), { recursive: true })
await writeFile(OUT, compresso)

const perLunghezza = new Map()
for (const p of elenco) perLunghezza.set(p.length, (perLunghezza.get(p.length) ?? 0) + 1)

console.log(`  parole giocabili: ${elenco.length.toLocaleString('it-IT')}`)
console.log(`  scartate (accenti impossibili, j/k/w/x/y, apostrofi): ${scartate.toLocaleString('it-IT')}`)
console.log(`  nomi propri e parolacce tolti: ${fuori.size.toLocaleString('it-IT')}`)
console.log(
  '  per lunghezza: ' +
    [...perLunghezza.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([n, q]) => `${n}:${q}`)
      .join(' '),
)
console.log(`  scritto ${OUT.replace(ROOT + '/', '')} — ${(compresso.length / 1024).toFixed(0)} kB`)

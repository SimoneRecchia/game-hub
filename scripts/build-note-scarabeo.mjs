#!/usr/bin/env node
/**
 * Le parole note dello Scarabeo: quelle che gioca il computer.
 *
 * Le comuni (le 272.000 di napolux, vedi scripts/build-dizionario.mjs) sono
 * tutte parole vere, ma tante non le conosce nessuno — "scalvo", "salolo",
 * "apside", "viple" — e chi perdeva contro il computer non sapeva nemmeno se
 * esistessero. Le note sono le comuni che compaiono fra le cinquantamila
 * forme piu' frequenti dei sottotitoli di OpenSubtitles
 * (hermitdave/FrequencyWords): una trentina di migliaia, coniugazioni e
 * plurali compresi, perché nei sottotitoli si parla. Anche la piu' rara,
 * "reflusso" o "bassotto", e' una parola che chi gioca riconosce.
 *
 * Una parola che non finisce per vocale e' quasi sempre inglese o un nome
 * ("boston", "hitler", "allen" sono fra le comuni) o un troncamento da poesia
 * ("aver", "andar"): resta fuori, tranne quelle di `CONSONANTI`, che in
 * italiano si dicono cosi'.
 *
 * L'elenco e' versionato (scripts/data/dizionario-scarabeo-note.txt.gz), come
 * gli altri del dizionario: `npm run dawg:build` lo legge senza andare in rete.
 *
 * Uso:  node scripts/build-note-scarabeo.mjs            (scarica la fonte se manca in scripts/.cache/)
 *       node scripts/build-note-scarabeo.mjs --offline  (solo la cache)
 */

import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync, gzipSync } from 'node:zlib'

const HERE = dirname(fileURLToPath(import.meta.url))
const CACHE = join(HERE, '.cache')
const DATI = join(HERE, 'data')
const OFFLINE = process.argv.includes('--offline')

const FREQUENZE = {
  url: 'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/it/it_50k.txt',
  file: 'it_50k.txt',
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

const comuni = new Set(
  gunzipSync(await readFile(join(DATI, 'dizionario-scarabeo.txt.gz')))
    .toString('utf8')
    .split('\n')
    .filter(Boolean),
)

/** Le note che finiscono per consonante: articoli, preposizioni, troncamenti di tutti i giorni, prestiti entrati nella lingua. */
const CONSONANTI = new Set(
  (
    'il un in con per non del dal nel col sul al ad ed quel bel ben buon gran nessun alcun signor dottor miglior ' +
    'maggior nord sud est ovest bar bus gas film sport club golf hotel motel camion autobus tram computer test ' +
    'tennis virus tunnel robot stop tour stress chef album telefilm standard staff caos boss record laser campus ' +
    'festival clan budget radar bonus monitor clacson reporter poster camper rum gin fan team leader manager ' +
    'partner super gratis alcol tic bancomat ictus sub alias slogan gong status hangar'
  ).split(' '),
)

const note = new Set()
for (const riga of (await fonte(FREQUENZE)).split(/\r?\n/)) {
  const [parola] = riga.split(' ')
  // Le forme dei sottotitoli sono senza accenti come quelle dello Scarabeo: "apparira" e' "apparirà".
  if (!parola || parola.length < 2 || !comuni.has(parola)) continue
  if (/[aeiou]$/.test(parola) || CONSONANTI.has(parola)) note.add(parola)
}

const elenco = [...note].sort()
await writeFile(join(DATI, 'dizionario-scarabeo-note.txt.gz'), gzipSync(elenco.join('\n') + '\n', { level: 9 }))
console.log(`Parole note: ${elenco.length.toLocaleString('it-IT')} delle ${comuni.size.toLocaleString('it-IT')} comuni`)

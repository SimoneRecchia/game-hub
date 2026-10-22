#!/usr/bin/env node
/**
 * Le Ghigliottine del giorno, dall'elenco scritto a mano con le esche.
 *
 *   scripts/data/ghigliottina-difficili.tsv       le ghigliottine: la parola vincente e, per ognuna delle cinque
 *                                                 parole giuste, la sua esca e l'espressione che la lega
 *   scripts/data/ghigliottina-classificate.json   quel che legge lo script della notte
 *
 * Le prime classificate venivano da scripts/data/ghigliottina.tsv, con le
 * esche prese da un'altra ghigliottina (scripts/build-ghigliottina.mjs, che
 * adesso fa solo le libere). Erano quasi ovvie: cinque espressioni come
 * "acqua santa", "acqua alta", "acqua passata", ognuna delle quali porta
 * dritta alla vincente, e esche generiche ("guida", "massima") che non
 * convincevano nessuno. Queste sono fatte come alla televisione: i legami
 * passano da sensi diversi della vincente, da modi di dire, titoli e
 * proverbi, al piu' uno e' quello che la richiama subito, e la vincente esce
 * solo incrociando tre parole. Le esche sono scritte a mano, della stessa
 * forma della parola giusta, e tutte e cinque insieme indicano un'altra
 * vincente, una falsa pista (la riga di commento sopra ogni ghigliottina):
 * chi sbaglia strada segue un'idea che sta in piedi.
 *
 * Lo script controlla la forma — cinque coppie, la parola giusta e la vincente
 * dentro l'espressione, l'esca no, niente parole ripetute — e che nessuna
 * vincente sia anche una delle libere, che il telefono scarica.
 *
 * Uso:  node scripts/build-ghigliottina-classificate.mjs
 */

import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')

const ACCENTI = { à: 'a', á: 'a', è: 'e', é: 'e', ì: 'i', í: 'i', ò: 'o', ó: 'o', ù: 'u', ú: 'u' }
const piana = (p) => p.toLowerCase().replace(/[àáèéìíòóùú]/g, (c) => ACCENTI[c])
const lettere = (p) => piana(p).replace(/[^a-z]/g, '')

async function main() {
  const libere = new Set(
    JSON.parse(await readFile(join(ROOT, 'public', 'dati', 'ghigliottina', 'libere.json'), 'utf8')).ghigliottine.map(
      ([s]) => s,
    ),
  )
  const testo = await readFile(join(HERE, 'data', 'ghigliottina-difficili.tsv'), 'utf8')
  const tutte = []
  const errori = []
  for (const riga of testo.split('\n')) {
    if (!riga.trim() || riga.startsWith('#')) continue
    const [soluzione, ...campi] = riga.split('\t').map((x) => x.trim())
    const sbaglia = (cosa) => errori.push(`${soluzione}: ${cosa}`)
    if (campi.length !== 5) sbaglia(`${campi.length} coppie invece di cinque`)
    if (/[jkwxy]/.test(piana(soluzione))) sbaglia('una lettera che la tastiera del gioco non ha')
    if (libere.has(soluzione)) sbaglia("e' anche fra le libere")
    // La vincente puo' stare nell'espressione flessa ("aghi di pino"): bastano le lettere prima dell'ultima.
    const radice = piana(soluzione).slice(0, Math.max(2, soluzione.length - 1))
    const coppie = []
    for (const campo of campi) {
      const m = campo.match(/^([^|=\s]+)\|([^=\s]+)=(.+)$/)
      if (!m) {
        sbaglia(`«${campo}» non ha la forma giusta|esca=espressione`)
        continue
      }
      const [, giusta, esca, espressione] = m
      if (!lettere(espressione).includes(lettere(giusta))) sbaglia(`«${giusta}» non sta in «${espressione}»`)
      if (!piana(espressione).replace(/[^a-z ]/g, '').includes(radice)) sbaglia(`la vincente non sta in «${espressione}»`)
      if (piana(espressione).split(/[^a-z]+/).includes(piana(esca))) sbaglia(`l'esca «${esca}» sta in «${espressione}»`)
      coppie.push([giusta, esca, espressione])
    }
    const parole = coppie.flatMap(([g, e]) => [g, e])
    if (new Set(parole).size !== parole.length) sbaglia('parole ripetute')
    tutte.push({ s: soluzione, c: coppie })
  }
  const doppie = tutte.map((t) => t.s).filter((s, i, a) => a.indexOf(s) !== i)
  for (const s of doppie) errori.push(`${s}: la vincente e' due volte nell'elenco`)
  if (errori.length > 0) throw new Error(`L'elenco ha ${errori.length} errori:\n  ${errori.join('\n  ')}`)

  tutte.sort((a, b) => (a.s < b.s ? -1 : 1))
  await writeFile(
    join(HERE, 'data', 'ghigliottina-classificate.json'),
    JSON.stringify(tutte, null, 0).replace(/\},\{/g, '},\n{') + '\n',
  )
  console.log(`Ghigliottina: ${tutte.length} classificate`)
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})

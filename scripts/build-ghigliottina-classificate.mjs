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
 * Lo script controlla la forma — cinque coppie, l'esca fuori dall'espressione,
 * niente parole ripetute — e che nessuna vincente sia anche una delle libere,
 * che il telefono scarica. E soprattutto che la vincente e la parola giusta
 * stiano nell'espressione **esattamente come sono scritte** (`esatta`): niente
 * plurali ("canali diplomatici" per CANALE), niente forme tronche ("Canal
 * Grande", "quartier generale"), niente parole vicine ("regolare i conti" per
 * REGOLA). Chi gioca scrive CANALE, e la spiegazione deve dire CANALE. Le
 * parole composte valgono se le hanno intere tutte e due (ALBA e chiara in
 * "Albachiara").
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
const parole = (testo) => piana(testo).split(/[^a-z]+/).filter(Boolean)
const lettere = (p) => parole(p).join('')

/**
 * `parola` sta nell'espressione com'e' scritta: una parola dell'espressione e'
 * proprio lei, o una parola composta che ha intere lei e l'altra della coppia.
 */
function esatta(espressione, parola, altra) {
  const p = lettere(parola)
  const q = lettere(altra)
  return parole(espressione).some((t) => t === p || (t.includes(p) && t.includes(q)))
}

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
    const coppie = []
    for (const campo of campi) {
      const m = campo.match(/^([^|=\s]+)\|([^=\s]+)=(.+)$/)
      if (!m) {
        sbaglia(`«${campo}» non ha la forma giusta|esca=espressione`)
        continue
      }
      const [, giusta, esca, espressione] = m
      if (!esatta(espressione, giusta, soluzione)) sbaglia(`«${giusta}» non sta com'e' in «${espressione}»`)
      if (!esatta(espressione, soluzione, giusta)) sbaglia(`la vincente non sta com'e' in «${espressione}»`)
      if (parole(espressione).includes(lettere(esca))) sbaglia(`l'esca «${esca}» sta in «${espressione}»`)
      coppie.push([giusta, esca, espressione])
    }
    const usate = coppie.flatMap(([g, e]) => [g, e])
    if (new Set(usate).size !== usate.length) sbaglia('parole ripetute')
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

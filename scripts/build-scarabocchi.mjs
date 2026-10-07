#!/usr/bin/env node
/**
 * Prepara le parole da disegnare di Scarabocchi, dal lessico di Nomi, cose e
 * città (public/dati/nomi-cose/<lettera>.json).
 *
 *   shared/scarabocchi-parole.ts   le parole, divise in tre livelli
 *
 * Il lessico ha, per ogni lettera e ogni categoria, le parole note scritte
 * come le scriverebbe una persona (`note`, dalla piu' nota): qui si prendono
 * quelle delle categorie che si disegnano — le cose, gli animali, le piante,
 * la frutta, i cibi, i mestieri, gli sport, gli strumenti, i vestiti e il
 * corpo — e si dividono in tre livelli per quanto sono comuni nei sottotitoli
 * di OpenSubtitles (hermitdave/FrequencyWords): una parola che tutti dicono si
 * indovina prima. Restano fuori le parole che un disegno non dice (i mestieri
 * d'ufficio, le parole con piu' sensi lontani fra loro) e le parti intime del
 * corpo.
 *
 * Uso:  node scripts/build-scarabocchi.mjs   (vuole scripts/.cache/it_50k.txt, che scarica
 *                                            node scripts/build-anagrammi.mjs)
 */

import { readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')

/** Le categorie del lessico che si disegnano. */
const CATEGORIE = ['cose', 'animali', 'piante', 'frutta', 'cibi', 'mestieri', 'sport', 'strumenti', 'vestiti', 'corpo']

/** Le parole che un disegno non dice, o che non si chiedono a un tavolo di colleghi. */
const ESCLUSE = new Set(
  `
  analista arrabbiata bancario broker capo collaboratore commerciante commercialista commesso consulente contabile
  controllore corriere cross diplomatico dirigente domestico editore fattore gestore generale giunto condotto
  industriale informatico intermediario legale magistrato medio mercante militare mina operatore pasticcio pero
  pierre portavoce prefetto presentatore pubblicitario rappresentante residenza responsabile segretario sottotenente
  storico supervisore tutor ufficiale vigilante aggeggio apparecchio custodia reperto scheda indice fisico tecnico
  impiegato tribunale obitorio penitenziario stabilimento ordigno detonatore cercapersone flash montgomery navetta
  seno sedere utero prostata capezzolo inguine grembo vescica viscere colon testicolo ano pene vagina sospensorio
  reggiseno mutande intestino midollo milza rene fegato arteria vena aorta tenia endovena giugulare carotide
  `
    .split(/\s+/)
    .filter(Boolean),
)

/** Le tre fasce, dalla piu' comune: un terzo ciascuna. */
const LIVELLI = ['facile', 'normale', 'difficile']

const righe = (testo) => testo.split(/\r?\n/).map((r) => r.trim()).filter(Boolean)

async function main() {
  const frequenza = new Map()
  for (const riga of righe(await readFile(join(HERE, '.cache', 'it_50k.txt'), 'utf8'))) {
    const [parola, n] = riga.split(/\s+/)
    frequenza.set(parola, Number(n))
  }

  const cartella = join(ROOT, 'public', 'dati', 'nomi-cose')
  const viste = new Map()
  for (const file of (await readdir(cartella)).filter((f) => f.endsWith('.json')).sort()) {
    const lessico = JSON.parse(await readFile(join(cartella, file), 'utf8'))
    for (const categoria of CATEGORIE) {
      for (const voce of lessico.note?.[categoria] ?? []) {
        const parola = voce.toLowerCase().trim()
        // Una parola sola, di lettere: le parole composte si disegnano male e si scrivono in troppi modi.
        if (!/^[a-zàèéìòù]{3,14}$/.test(parola) || ESCLUSE.has(parola)) continue
        if (!viste.has(parola)) viste.set(parola, frequenza.get(parola) ?? 0)
      }
    }
  }

  const ordinate = [...viste.entries()]
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'it'))
    .map(([parola]) => parola)
  const terzo = Math.ceil(ordinate.length / 3)
  const fasce = Object.fromEntries(
    LIVELLI.map((livello, i) => [
      livello,
      ordinate.slice(i * terzo, (i + 1) * terzo).sort((a, b) => a.localeCompare(b, 'it')),
    ]),
  )

  const corpo = LIVELLI.map((livello) => {
    const parole = fasce[livello].map((p) => `'${p}'`)
    const blocchi = []
    let riga = ''
    for (const p of parole) {
      if (riga && riga.length + p.length + 2 > 110) {
        blocchi.push(`    ${riga.trimEnd()}`)
        riga = ''
      }
      riga += `${p}, `
    }
    if (riga) blocchi.push(`    ${riga.trimEnd()}`)
    return `  ${livello}: [\n${blocchi.join('\n')}\n  ],`
  }).join('\n')

  const ts = `/**
 * Le parole da disegnare di Scarabocchi, in tre livelli. Generato da
 * scripts/build-scarabocchi.mjs dal lessico di Nomi, cose e città: non si
 * modifica a mano.
 */

export const PAROLE_SCARABOCCHI = {
${corpo}
} as const satisfies Record<'facile' | 'normale' | 'difficile', readonly string[]>
`
  await writeFile(join(ROOT, 'shared', 'scarabocchi-parole.ts'), ts)
  console.log(
    `${ordinate.length} parole: ${LIVELLI.map((l) => `${l} ${fasce[l].length}`).join(', ')}` +
      ` (piu' comuni: ${ordinate.slice(0, 8).join(', ')})`,
  )
}

await main()

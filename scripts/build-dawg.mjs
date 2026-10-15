#!/usr/bin/env node
/**
 * Scrive il dizionario dello Scarabeo in forma di DAWG, per il browser e per il server.
 *
 * Il computer dello Scarabeo gioca nel telefono di chi lo sfida: il Worker ha
 * dieci millisecondi di CPU per richiesta, e cercare una mossa ne richiede
 * decine. Per farlo gli serve tutto il dizionario, e il DAWG lo porta in 1,3 MB
 * (740 kB compresso) invece dei trenta dell'elenco (vedi scripts/scarabeo/dawg.mjs).
 * Lo stesso file lo legge il server per dire se una parola esiste: e' un asset
 * statico, in public/, che le Functions leggono con env.ASSETS.
 *
 * Il file e' versionato, come gli elenchi del Wordle: il build non deve
 * dipendere da un passaggio in piu'. La sua impronta finisce in
 * shared/scarabeo-dizionario.ts e nell'indirizzo, così una versione nuova non
 * si confonde con quella in cache; un test verifica che i due corrispondano, e
 * che il DAWG abbia esattamente le parole degli elenchi.
 *
 * Uso:  node scripts/build-dawg.mjs
 */

import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { byteDelDawg, costruisciDawg } from './scarabeo/dawg.mjs'
import { formeEnclitiche } from './scarabeo/enclitiche.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const DATI = join(HERE, 'data')
const USCITA = join(ROOT, 'public', 'scarabeo', 'dizionario.dawg')
const VERSIONE = join(ROOT, 'shared', 'scarabeo-dizionario.ts')

const leggi = (file) => gunzipSync(readFileSync(join(DATI, file))).toString('utf8').split('\n').filter(Boolean)

const comuni = leggi('dizionario-scarabeo.txt.gz')
const altre = leggi('dizionario-scarabeo-altre.txt.gz')
const enclitiche = formeEnclitiche(leggi('dizionario-scarabeo-enclitiche.txt.gz'))
const note = leggi('dizionario-scarabeo-note.txt.gz')

const archi = costruisciDawg(comuni, [...altre, ...enclitiche], note)
const byte = byteDelDawg(archi)
const impronta = createHash('sha256').update(byte).digest('hex').slice(0, 16)

mkdirSync(dirname(USCITA), { recursive: true })
writeFileSync(USCITA, byte)
writeFileSync(
  VERSIONE,
  `/**
 * Il dizionario dello Scarabeo: il DAWG in public/scarabeo/dizionario.dawg, e
 * l'impronta del file, che ne cambia l'indirizzo a ogni versione nuova.
 *
 * Scritto da scripts/build-dawg.mjs: non va toccato a mano.
 */
export const IMPRONTA_DIZIONARIO = '${impronta}'

/**
 * Quanto e' lungo, aperto. Le Pages rispondono con la pagina dell'app a un
 * indirizzo che non esiste, e chi legge il file controlla di non avere quella.
 */
export const BYTE_DIZIONARIO = ${byte.length}

/** Il file intero: lo legge il server. */
export const URL_DIZIONARIO = \`/scarabeo/dizionario.dawg?v=\${IMPRONTA_DIZIONARIO}\`

/** Lo stesso compresso, che scrive il build (vite.config.ts): lo scarica il browser. */
export const URL_DIZIONARIO_COMPRESSO = \`/scarabeo/dizionario.dawg.gz?v=\${IMPRONTA_DIZIONARIO}\`
`,
)

const it = (n) => n.toLocaleString('it-IT')
console.log(
  `DAWG: ${it(note.length)} note, ${it(comuni.length)} comuni, ${it(altre.length + enclitiche.size)} altre, ` +
    `${it(archi.length)} archi, ` +
    `${(byte.length / 1024).toFixed(0)} kB → ${USCITA.replace(ROOT + '/', '')} (${impronta})`,
)

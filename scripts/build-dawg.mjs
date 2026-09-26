#!/usr/bin/env node
/**
 * Scrive il dizionario dello Scarabeo in forma di DAWG, per il browser.
 *
 * Il computer dello Scarabeo gioca nel telefono di chi lo sfida: il Worker ha
 * dieci millisecondi di CPU per richiesta, e cercare una mossa ne richiede
 * decine. Per farlo gli serve tutto il dizionario, e il DAWG lo porta in circa
 * 300 kB compressi invece dei 2,8 MB dell'elenco (vedi scripts/scarabeo/dawg.mjs).
 *
 * Il file e' versionato, come gli elenchi del Wordle: il build non deve
 * dipendere da un passaggio in piu', e un test verifica che corrisponda
 * all'elenco da cui nasce.
 *
 * Uso:  node scripts/build-dawg.mjs
 */

import { gunzipSync } from 'node:zlib'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { byteDelDawg, costruisciDawg } from './scarabeo/dawg.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const SORGENTE = join(HERE, 'data', 'dizionario-scarabeo.txt.gz')
const USCITA = join(HERE, '..', 'src', 'games', 'scarabeo', 'dizionario.dawg')

const parole = gunzipSync(readFileSync(SORGENTE)).toString('utf8').split('\n').filter(Boolean)
const archi = costruisciDawg(parole)
writeFileSync(USCITA, byteDelDawg(archi))
console.log(
  `DAWG: ${parole.length.toLocaleString('it-IT')} parole, ${archi.length.toLocaleString('it-IT')} archi, ` +
    `${(archi.length * 4 / 1024).toFixed(0)} kB → ${USCITA}`,
)

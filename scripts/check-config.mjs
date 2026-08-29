#!/usr/bin/env node
/**
 * Controllo di configurazione prima del build.
 *
 * Serve a un errore preciso: se `database_id` in wrangler.toml e' ancora il
 * segnaposto, il deploy su Cloudflare Pages riuscirebbe ma l'API risponderebbe
 * 500 su ogni chiamata, con un messaggio incomprensibile nei log. Meglio
 * fermare il build dicendo esattamente cosa manca.
 *
 * Il controllo scatta solo nei build su Pages (la variabile CF_PAGES esiste
 * solo lì): in locale il segnaposto va benissimo, perché wrangler crea un
 * SQLite dentro .wrangler/state e l'ID non lo guarda nessuno.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PLACEHOLDER = 'SOSTITUISCI_CON_IL_TUO_D1_DATABASE_ID'

if (!process.env.CF_PAGES) process.exit(0)

let config
try {
  config = readFileSync(join(ROOT, 'wrangler.toml'), 'utf8')
} catch {
  console.error('\nwrangler.toml non trovato: il binding D1 non verrebbe applicato.\n')
  process.exit(1)
}

if (config.includes(PLACEHOLDER)) {
  console.error(`
────────────────────────────────────────────────────────────────────────
 Configurazione incompleta: manca l'ID del database D1.
────────────────────────────────────────────────────────────────────────

 In wrangler.toml, database_id e' ancora il segnaposto. Senza l'ID vero
 il sito verrebbe pubblicato ma ogni chiamata all'API fallirebbe.

 Da fare, una volta sola:

   1. npx wrangler d1 create game-hub-db
   2. copia l'ID che stampa dentro wrangler.toml, al posto del segnaposto
   3. npx wrangler d1 migrations apply game-hub-db --remote
   4. commit e push

 I passi completi sono in DEPLOY.md.

────────────────────────────────────────────────────────────────────────
`)
  process.exit(1)
}

console.log('✓ configurazione D1 presente')

#!/usr/bin/env node
/**
 * Controllo di configurazione prima del build.
 *
 * Serve a un errore preciso: se `database_id` in wrangler.toml e' ancora il
 * segnaposto, il deploy su Cloudflare Pages riuscirebbe ma l'API risponderebbe
 * 500 su ogni chiamata, con un messaggio incomprensibile nei log del Worker.
 * Meglio fermare il build dicendo esattamente cosa manca.
 *
 * Il controllo scatta solo nei build su Pages (la variabile CF_PAGES esiste
 * solo lì): in locale il segnaposto va benissimo, perché wrangler crea un
 * SQLite dentro .wrangler/state e l'ID non lo guarda nessuno.
 *
 * La logica sta in una funzione esportata, non nel corpo dello script, così i
 * test possono verificarla senza dover lanciare un processo — e senza che la
 * CI debba mettersi in uno stato che deve fallire per forza.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

export const PLACEHOLDER = 'SOSTITUISCI_CON_IL_TUO_D1_DATABASE_ID'

const ISTRUZIONI = `
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
`

/**
 * Cerca problemi nel contenuto di wrangler.toml.
 * Restituisce il messaggio da mostrare, oppure null se va tutto bene.
 */
export function configProblem(wranglerToml) {
  if (typeof wranglerToml !== 'string' || wranglerToml.trim() === '') {
    return "\nwrangler.toml e' vuoto o illeggibile: il binding D1 non verrebbe applicato.\n"
  }
  if (!wranglerToml.includes('[[d1_databases]]')) {
    return "\nwrangler.toml non dichiara nessun database D1: l'API non avrebbe dove salvare.\n"
  }
  if (wranglerToml.includes(PLACEHOLDER)) {
    return ISTRUZIONI
  }
  return null
}

function main() {
  // Fuori da Cloudflare Pages non c'e' nulla da controllare.
  if (!process.env.CF_PAGES) return

  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  let contenuto = ''
  try {
    contenuto = readFileSync(join(root, 'wrangler.toml'), 'utf8')
  } catch {
    console.error('\nwrangler.toml non trovato: il binding D1 non verrebbe applicato.\n')
    process.exit(1)
  }

  const problema = configProblem(contenuto)
  if (problema) {
    console.error(problema)
    process.exit(1)
  }

  console.log('✓ configurazione D1 presente')
}

// Esegue solo se invocato da riga di comando, non quando importato dai test.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}

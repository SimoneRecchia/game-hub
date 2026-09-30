/**
 * Scrive `shared/quiz-cultura-versioni.ts`: l'impronta di ogni file delle
 * materie del quiz, che l'app mette nell'indirizzo (`?v=`). Con l'impronta i
 * file si tengono in cache per sempre, e un file nuovo ha un indirizzo nuovo.
 *
 * L'impronta di una materia e' la `versione` scritta nel file; quella di
 * "Accadde oggi" e' una sola per i 366 giorni, fatta dalle loro versioni:
 * basta che cambi un giorno perché cambi l'indirizzo di tutti, che e' meno
 * preciso ma tiene l'elenco corto.
 *
 *   npx vite-node scripts/versioni-cultura.ts
 *
 * Lo lanciano `npm run quiz:cultura` e `npm run quiz:oggi` dopo aver scritto i
 * file; un test controlla che l'elenco e i file vadano d'accordo.
 */

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { versioniCultura } from './cultura/versioni'

const RADICE = join(fileURLToPath(new URL('.', import.meta.url)), '..')

const versioni = versioniCultura(join(RADICE, 'public', 'dati', 'quiz'))
const righe = Object.entries(versioni).map(([chiave, v]) => `  ${chiave}: '${v}',`)
writeFileSync(
  join(RADICE, 'shared', 'quiz-cultura-versioni.ts'),
  [
    '// Scritto da `npm run quiz:cultura` e `npm run quiz:oggi` (scripts/versioni-cultura.ts): non a mano.',
    "// L'impronta di ogni file di public/dati/quiz, per l'indirizzo: un file nuovo ha un indirizzo nuovo.",
    'export const VERSIONI_CULTURA: Record<string, string> = {',
    ...righe,
    '}',
    '',
  ].join('\n'),
)
console.log(`Versioni: ${righe.length} (${Object.keys(versioni).join(', ')})`)

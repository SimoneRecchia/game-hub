/**
 * Scrive shared/tris-valori.ts: il valore di ogni posizione del tris per chi
 * ha il tratto, calcolato una volta con il minimax e salvato in due bit per
 * posizione. Il server ha dieci millisecondi per richiesta, e calcolarlo a
 * ogni isolato nuovo ne costava sei.
 *
 *   npx vite-node scripts/genera-tris-valori.ts
 *
 * Le posizioni sono indicizzate in base tre, una cifra per casella (0 vuota,
 * 1 chi ha cominciato, 2 l'altro). In ogni byte stanno quattro posizioni,
 * dalla meno significativa: il valore piu' uno (0 perde, 1 patta, 2 vince), e
 * 3 per le posizioni che non possono esistere. Un test ricalcola tutto.
 */

import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { minimaxTris, POSIZIONI_TRIS } from '../shared/tris-minimax'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const byte = new Uint8Array(Math.ceil(POSIZIONI_TRIS / 4))
for (let i = 0; i < POSIZIONI_TRIS; i += 1) {
  const v = minimaxTris(i)
  const codice = v === null ? 3 : v + 1
  byte[i >> 2] |= codice << ((i & 3) * 2)
}
const testo = Buffer.from(byte).toString('base64')
const righe: string[] = []
for (let i = 0; i < testo.length; i += 100) righe.push(`  '${testo.slice(i, i + 100)}',`)
writeFileSync(
  join(ROOT, 'shared', 'tris-valori.ts'),
  `/**
 * Il valore di ogni posizione del tris per chi ha il tratto, in due bit per
 * posizione: lo scrive scripts/genera-tris-valori.ts, e non si tocca a mano.
 * Un test lo ricalcola con il minimax (shared/tris-minimax.ts).
 */

export const VALORI_TRIS = [
${righe.join('\n')}
].join('')
`,
)
console.log(`${POSIZIONI_TRIS} posizioni, ${byte.length} byte, ${testo.length} caratteri`)

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { Dawg, FOGLIA, LETTERE, RADICE, indiceDi } from '../dawg'
// @ts-expect-error — script in JavaScript, senza dichiarazioni di tipo
import { LETTERE as LETTERE_SCRIPT, byteDelDawg, costruisciDawg } from '../../scripts/scarabeo/dawg.mjs'

const RADICE_PROGETTO = join(__dirname, '..', '..')
const parole = gunzipSync(readFileSync(join(RADICE_PROGETTO, 'scripts', 'data', 'dizionario-scarabeo.txt.gz')))
  .toString('utf8')
  .split('\n')
  .filter(Boolean)
const versionato = readFileSync(join(RADICE_PROGETTO, 'src', 'games', 'scarabeo', 'dizionario.dawg'))
const dawg = Dawg.da(versionato)

describe('DAWG del dizionario dello Scarabeo', () => {
  it('il file versionato e’ quello che si ricostruisce dall’elenco', () => {
    // Se cade, l'elenco e' cambiato senza rigenerare il DAWG: `node scripts/build-dawg.mjs`.
    const ricostruito = byteDelDawg(costruisciDawg(parole))
    expect(Buffer.from(ricostruito).equals(versionato)).toBe(true)
  })

  it('lo script e il lettore usano le stesse lettere, nello stesso ordine', () => {
    expect(LETTERE_SCRIPT).toBe(LETTERE)
    expect(LETTERE).toHaveLength(21)
  })

  it('contiene ogni parola dell’elenco', () => {
    const mancanti = parole.filter((p) => !dawg.contiene(p))
    expect(mancanti).toEqual([])
  })

  it('non contiene quel che non e’ una parola', () => {
    const insieme = new Set(parole)
    // Prefissi e allungamenti di parole vere: sono i casi che un DAWG sbagliato confonde.
    const prove = ['ca', 'cas', 'casaa', 'cantarex', 'zzz', 'a', '', 'jazz', 'kiwi', 'cantav']
    for (const p of prove) expect(dawg.contiene(p)).toBe(insieme.has(p))
    expect(dawg.contiene('casa')).toBe(true)
    expect(dawg.contiene('cantavamo')).toBe(true)
  })

  it('segue le lettere una alla volta', () => {
    const c = dawg.arco(RADICE, indiceDi('c'))
    expect(c).toBeGreaterThanOrEqual(0)
    const dopoC = dawg.destinazione(c)
    expect(dopoC).not.toBe(FOGLIA)
    expect(dawg.arco(dopoC, indiceDi('a'))).toBeGreaterThanOrEqual(0)
    expect(indiceDi('j')).toBe(-1)
    expect(dawg.arco(FOGLIA, 0)).toBe(-1)
  })
})

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { Dawg, FOGLIA, LETTERE, RADICE, indiceDi } from '../dawg'
import { BYTE_DIZIONARIO, IMPRONTA_DIZIONARIO, URL_DIZIONARIO } from '../scarabeo-dizionario'
// @ts-expect-error — script in JavaScript, senza dichiarazioni di tipo
import { LETTERE as LETTERE_SCRIPT, byteDelDawg, costruisciDawg } from '../../scripts/scarabeo/dawg.mjs'
// @ts-expect-error — script in JavaScript, senza dichiarazioni di tipo
import { formeDellaBase, formeEnclitiche, leggiBase } from '../../scripts/scarabeo/enclitiche.mjs'

const RADICE_PROGETTO = join(__dirname, '..', '..')
const elenco = (file: string) =>
  gunzipSync(readFileSync(join(RADICE_PROGETTO, 'scripts', 'data', file)))
    .toString('utf8')
    .split('\n')
    .filter(Boolean)
const comuni = elenco('dizionario-scarabeo.txt.gz')
const altre = elenco('dizionario-scarabeo-altre.txt.gz')
const basi = elenco('dizionario-scarabeo-enclitiche.txt.gz')
const versionato = readFileSync(join(RADICE_PROGETTO, 'public', 'scarabeo', 'dizionario.dawg'))
const dawg = Dawg.da(versionato)

describe('il DAWG del dizionario dello Scarabeo', () => {
  it('e’ quello dell’impronta, con l’impronta nell’indirizzo', () => {
    // Se cade, il DAWG e' cambiato senza rigenerare l'impronta: `npm run dawg:build`.
    expect(createHash('sha256').update(versionato).digest('hex').slice(0, 16)).toBe(IMPRONTA_DIZIONARIO)
    expect(versionato.length).toBe(BYTE_DIZIONARIO)
    expect(URL_DIZIONARIO).toContain(IMPRONTA_DIZIONARIO)
  })

  it(
    'ha esattamente le parole degli elenchi, ognuna al suo livello',
    () => {
      // Se cade, gli elenchi sono cambiati senza rigenerare il DAWG: `npm run dawg:build`.
      const insiemeComuni = new Set(comuni)
      const tutte = new Set([...comuni, ...altre, ...formeEnclitiche(basi)])
      const computer = dawg.comuni()
      for (const p of comuni) {
        if (!computer.contiene(p)) expect.fail(`"${p}" dovrebbe essere comune`)
      }
      for (const p of tutte) {
        if (!dawg.contiene(p)) expect.fail(`"${p}" manca`)
        if (!insiemeComuni.has(p) && computer.contiene(p)) expect.fail(`"${p}" non dovrebbe essere comune`)
      }
      // Con le parole degli elenchi tutte dentro, contarle dice che non ce n'e' una in piu'.
      expect(dawg.quante()).toBe(tutte.size)
      expect(computer.quante()).toBe(insiemeComuni.size)
    },
    60_000,
  )

  it('lo script e il lettore usano le stesse lettere, nello stesso ordine', () => {
    expect(LETTERE_SCRIPT).toBe(LETTERE)
    expect(LETTERE).toHaveLength(21)
  })

  it('riconosce le parole che prima mancavano, e non quel che non e’ una parola', () => {
    // I nomi che sono anche parole, le interiezioni, le forme con i pronomi attaccati.
    for (const p of ['sole', 'luna', 'stella', 're', 'euro', 'felice', 'oh', 'dillo', 'prendetelo', 'alzatevi']) {
      expect(dawg.contiene(p), p).toBe(true)
    }
    // Prefissi e allungamenti di parole vere, sigle, nomi, parolacce, lettere fuori dal gioco.
    for (const p of ['cq', 'csa', 'casaa', 'cantarex', 'qzqz', 'a', '', 'jazz', 'kiwi', 'onu', 'feb', 'giovanni', 'cazzo']) {
      expect(dawg.contiene(p), p).toBe(false)
    }
    expect(dawg.contiene('casa')).toBe(true)
    expect(dawg.contiene('cantavamo')).toBe(true)
  })

  it('il computer conosce solo le comuni', () => {
    const computer = dawg.comuni()
    expect(computer.contiene('casa')).toBe(true)
    expect(computer.contiene('stella')).toBe(true)
    expect(dawg.contiene('portarglielo')).toBe(true)
    expect(computer.contiene('portarglielo')).toBe(false)
    expect(computer.comuni()).toBe(computer)
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

describe('la costruzione del DAWG', () => {
  // Un dizionario piccolo, costruito e riletto: le due meta' devono dire le stesse cose.
  const piccolo = Dawg.da(byteDelDawg(costruisciDawg(['casa', 'case', 'caso', 'rosa'], ['casale', 'rose', 'cas', 'casa'])))

  it('ogni parola al suo livello, e una parola in tutti e due gli elenchi e’ comune', () => {
    for (const p of ['casa', 'case', 'caso', 'rosa', 'casale', 'rose', 'cas']) expect(piccolo.contiene(p), p).toBe(true)
    const computer = piccolo.comuni()
    for (const p of ['casa', 'case', 'caso', 'rosa']) expect(computer.contiene(p), p).toBe(true)
    for (const p of ['casale', 'rose', 'cas']) expect(computer.contiene(p), p).toBe(false)
    expect(piccolo.quante()).toBe(7)
    expect(computer.quante()).toBe(4)
  })

  it('per il computer non esistono gli archi che portano solo ad altre parole', () => {
    const computer = piccolo.comuni()
    const rosa = computer.segui(RADICE, [...'ros'].map(indiceDi))
    // Da "ros" il computer vede la "a" di rosa, non la "e" di rose, che resta un arco valido e basta.
    expect(computer.arco(rosa, indiceDi('a'))).toBeGreaterThanOrEqual(0)
    expect(computer.arco(rosa, indiceDi('e'))).toBe(-1)
    expect(piccolo.arco(rosa, indiceDi('e'))).toBeGreaterThanOrEqual(0)
    // "casal-" esiste solo per casale: per il computer la strada si ferma a "casa".
    const casa = computer.segui(RADICE, [...'casa'].map(indiceDi))
    expect(computer.arco(casa, indiceDi('l'))).toBe(-1)
  })

  it('rifiuta le lettere che non sono del gioco', () => {
    expect(() => costruisciDawg(['jolly'])).toThrow(/fuori dal gioco/)
  })
})

describe('le forme con i pronomi attaccati', () => {
  const forme = (riga: string) => formeDellaBase(leggiBase(riga)) as string[]

  it('un verbo transitivo prende anche i pronomi dell’oggetto', () => {
    const portar = forme('portar o')
    for (const p of ['portarlo', 'portarla', 'portarmi', 'portarne', 'portarglielo', 'portarmelo', 'portarsene']) {
      expect(portar, p).toContain(p)
    }
    const andar = forme('andar')
    expect(andar).toContain('andarsene')
    expect(andar).toContain('andarci')
    expect(andar).not.toContain('andarlo')
  })

  it('l’imperativo di una sillaba raddoppia la consonante, tranne con gli', () => {
    const di = forme('di od')
    for (const p of ['dimmi', 'dillo', 'dimmelo', 'dicci', 'digli', 'diglielo']) expect(di, p).toContain(p)
    expect(di).not.toContain('dimi')
    expect(forme('va d')).toContain('vattene')
  })

  it('niente oltre le quindici lettere', () => {
    expect(forme('precipitevolissimevolmente o')).toEqual([])
  })
})

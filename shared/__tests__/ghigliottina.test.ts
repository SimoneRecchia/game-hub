import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  COPPIE_GHIGLIOTTINA,
  disponiGhigliottina,
  ghigliottinaDelGiorno,
  giornataValida,
  normalizzaGhigliottina,
  rispostaGiusta,
  type GhigliottinaDellElenco,
} from '../ghigliottina'
import { VERSIONE_LIBERE_GHIGLIOTTINA } from '../ghigliottina-libere'
import { mulberry32 } from '../daily'
import { isGameLetter } from '../wordle'

const RADICE = join(__dirname, '..', '..')
const classificate = JSON.parse(
  readFileSync(join(RADICE, 'scripts', 'data', 'ghigliottina-classificate.json'), 'utf8'),
) as GhigliottinaDellElenco[]
const fileLibere = readFileSync(join(RADICE, 'public', 'dati', 'ghigliottina', 'libere.json'), 'utf8')
const libere = (JSON.parse(fileLibere) as { ghigliottine: Array<[string, GhigliottinaDellElenco['c']]> }).ghigliottine.map(
  ([s, c]): GhigliottinaDellElenco => ({ s, c }),
)

describe('la parola vincente', () => {
  it('si confronta senza maiuscole, accenti e spazi', () => {
    expect(rispostaGiusta('casa', ' CASA ')).toBe(true)
    expect(rispostaGiusta('tè', 'te')).toBe(true)
    expect(rispostaGiusta('città', 'Citta')).toBe(true)
    expect(rispostaGiusta('casa', 'case')).toBe(false)
    expect(rispostaGiusta('casa', '')).toBe(false)
  })

  it('si scrive con la tastiera del gioco, in tutte le ghigliottine', () => {
    for (const g of [...classificate, ...libere]) {
      expect([...normalizzaGhigliottina(g.s)].every(isGameLetter), g.s).toBe(true)
    }
  })
})

describe('l’elenco delle ghigliottine', () => {
  it('ha cinque coppie per ghigliottina, e nessuna esca e’ una parola giusta della stessa', () => {
    for (const g of [...classificate, ...libere]) {
      expect(g.c, g.s).toHaveLength(COPPIE_GHIGLIOTTINA)
      const giuste = new Set(g.c.map(([giusta]) => giusta))
      for (const [giusta, esca, spiegazione] of g.c) {
        expect(giuste.has(esca), `${g.s}: ${esca}`).toBe(false)
        expect(esca).not.toBe(giusta)
        expect(normalizzaGhigliottina(spiegazione)).toContain(normalizzaGhigliottina(giusta))
      }
    }
  })

  it('le libere non hanno nessuna soluzione delle classificate: il telefono non ha le risposte di nessun giorno', () => {
    const delGiorno = new Set(classificate.map((g) => g.s))
    expect(libere.some((g) => delGiorno.has(g.s))).toBe(false)
    // Le classificate scritte a mano: piu' di cinque mesi prima che una vincente torni.
    expect(classificate.length).toBeGreaterThanOrEqual(150)
    expect(libere.length).toBeGreaterThan(100)
  })

  it('il file delle libere ha l’impronta che porta il suo indirizzo', () => {
    expect(createHash('sha256').update(fileLibere).digest('hex').slice(0, 10)).toBe(VERSIONE_LIBERE_GHIGLIOTTINA)
  })
})

describe('la ghigliottina del giorno', () => {
  it('e’ la stessa per tutti, e ha la forma che il server si aspetta', () => {
    const una = ghigliottinaDelGiorno(41, classificate)
    expect(ghigliottinaDelGiorno(41, classificate)).toEqual(una)
    expect(giornataValida(una)).toBe(true)
    expect(giornataValida(JSON.parse(JSON.stringify(una)))).toBe(true)
  })

  it('non ripete una soluzione finché l’elenco non e’ finito', () => {
    const viste = new Set<string>()
    for (let n = 1; n <= classificate.length; n += 1) viste.add(ghigliottinaDelGiorno(n, classificate).soluzione)
    expect(viste.size).toBe(classificate.length)
  })

  it('mescola le coppie e mette la parola giusta ora sopra ora sotto', () => {
    const prime = Array.from({ length: 200 }, (_, n) => ghigliottinaDelGiorno(n, classificate).coppie)
    const sopra = prime.flat().filter((c) => c.giusta === 0).length
    expect(sopra / (200 * COPPIE_GHIGLIOTTINA)).toBeGreaterThan(0.4)
    expect(sopra / (200 * COPPIE_GHIGLIOTTINA)).toBeLessThan(0.6)
  })

  it('ogni coppia ha la parola giusta e la sua esca, e l’espressione della giusta', () => {
    const voce = classificate[0]
    const g = disponiGhigliottina(voce, mulberry32(7))
    for (const c of g.coppie) {
      const riga = voce.c.find(([giusta]) => giusta === c.parole[c.giusta])
      expect(riga).toBeDefined()
      expect(c.parole[1 - c.giusta]).toBe(riga![1])
      expect(c.spiegazione).toBe(riga![2])
    }
  })
})

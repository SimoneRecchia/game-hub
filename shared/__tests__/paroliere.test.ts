import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Dawg, LETTERE } from '../dawg'
import { mulberry32 } from '../daily'
import {
  DADI,
  DADI_IN_PIU,
  LETTERE_MINIME,
  PAROLE_MINIME_DEL_GIORNO,
  PAROLE_MINIME_LIBERE,
  TRAGUARDO_MASSIMO,
  TRAGUARDO_MINIMO,
  giornataValida,
  grigliaDelGiorno,
  grigliaLibera,
  lanciaDadi,
  paroleDellaGriglia,
  punteggioDi,
  puntiParola,
  stradaDi,
  traguardoDi,
  vicine,
} from '../paroliere'

const tutte = Dawg.da(readFileSync(join(__dirname, '..', '..', 'public', 'scarabeo', 'dizionario.dawg')))
const comuni = tutte.comuni()

/** Una griglia scritta a mano: GATO / ROSE / ALMA / QUNTI, con la "qu" in basso a sinistra. */
const GRIGLIA = ['g', 'a', 't', 'o', 'r', 'o', 's', 'e', 'a', 'l', 'm', 'a', 'qu', 'n', 't', 'i']

describe('i punti di una parola', () => {
  it('sono quelli del Boggle: 1, 1, 2, 3, 5 e 11 dalle otto lettere', () => {
    expect([2, 3, 4, 5, 6, 7, 8, 12].map(puntiParola)).toEqual([0, 1, 1, 2, 3, 5, 11, 11])
    expect(punteggioDi(['gatto', 'mare', 'quanto'])).toBe(2 + 1 + 3)
  })
})

describe('i dadi', () => {
  it('hanno sei facce delle lettere del gioco, la "q" solo con la sua "u", una volta sola', () => {
    const facce = [...DADI, ...DADI_IN_PIU].flat()
    for (const d of [...DADI, ...DADI_IN_PIU]) expect(d).toHaveLength(6)
    expect(DADI).toHaveLength(16)
    expect(DADI_IN_PIU).toHaveLength(9)
    expect(facce.filter((f) => f === 'qu')).toHaveLength(1)
    for (const f of facce) expect(f === 'qu' || (f.length === 1 && LETTERE.includes(f)), f).toBe(true)
  })

  it('le vocali sono quasi la metà delle facce, e ogni dado ne ha almeno due', () => {
    const vocali = (d: readonly string[]) => d.filter((f) => 'aeiou'.includes(f)).length
    const tutte = DADI.flat()
    expect(tutte.filter((f) => 'aeiou'.includes(f)).length / tutte.length).toBeGreaterThan(0.45)
    expect(tutte.filter((f) => 'aeiou'.includes(f)).length / tutte.length).toBeLessThan(0.52)
    for (const d of DADI) expect(vocali(d)).toBeGreaterThanOrEqual(2)
  })

  it('un tiro usa ogni dado una volta, e lo stesso seme fa la stessa griglia', () => {
    const griglia = lanciaDadi(mulberry32(5))
    expect(griglia).toEqual(lanciaDadi(mulberry32(5)))
    expect(griglia).toHaveLength(16)
    const usati = new Array(16).fill(false)
    // Ogni faccia trova un dado suo, diverso da quello delle altre.
    const assegna = (i: number): boolean => {
      if (i === griglia.length) return true
      for (let d = 0; d < DADI.length; d += 1) {
        if (usati[d] || !DADI[d].includes(griglia[i])) continue
        usati[d] = true
        if (assegna(i + 1)) return true
        usati[d] = false
      }
      return false
    }
    expect(assegna(0)).toBe(true)
    expect(lanciaDadi(mulberry32(5), 5)).toHaveLength(25)
  })
})

describe('la strada di una parola', () => {
  it('passa da un dado a uno vicino, anche di sbieco, senza ripassare', () => {
    expect(vicine(0, 4).sort((a, b) => a - b)).toEqual([1, 4, 5])
    expect(vicine(5, 4)).toHaveLength(8)
    expect(stradaDi(GRIGLIA, 'gatto')).toBeNull()
    expect(stradaDi(GRIGLIA, 'rosa')).toEqual([4, 5, 6, 1])
    expect(stradaDi(GRIGLIA, 'gola')).toEqual([0, 5, 9, 8])
    // La "s" e' una sola: "rosso" dovrebbe ripassarci.
    expect(stradaDi(GRIGLIA, 'rosso')).toBeNull()
  })

  it('una faccia "qu" prende due lettere', () => {
    expect(stradaDi(GRIGLIA, 'quanti')).toEqual([12, 8, 13, 14, 15])
    expect(stradaDi(GRIGLIA, 'qua')).toEqual([12, 8])
    expect(stradaDi(GRIGLIA, 'qa')).toBeNull()
  })
})

describe('le parole di una griglia', () => {
  it('sono tutte parole del dizionario che si scrivono sulla griglia, da tre lettere in su', () => {
    const parole = paroleDellaGriglia(GRIGLIA, tutte)
    expect(parole).toEqual(expect.arrayContaining(['rosa', 'gola', 'quanti']))
    for (const p of parole) {
      expect(p.length).toBeGreaterThanOrEqual(LETTERE_MINIME)
      expect(tutte.contiene(p), p).toBe(true)
      expect(stradaDi(GRIGLIA, p), p).not.toBeNull()
    }
    // Dalla piu' lunga, poi in ordine alfabetico.
    for (let i = 1; i < parole.length; i += 1) expect(parole[i].length).toBeLessThanOrEqual(parole[i - 1].length)
  })

  it('le comuni sono una parte di tutte', () => {
    const tutteLe = new Set(paroleDellaGriglia(GRIGLIA, tutte))
    for (const p of paroleDellaGriglia(GRIGLIA, comuni)) expect(tutteLe.has(p), p).toBe(true)
  })
})

describe('la griglia del giorno', () => {
  const anno = Array.from({ length: 365 }, (_, n) => grigliaDelGiorno(n + 1, comuni))

  it('e’ la stessa per tutti, ha abbastanza parole e la forma che il server si aspetta', () => {
    expect(grigliaDelGiorno(41, comuni)).toEqual(anno[40])
    for (const g of anno) {
      expect(g.comuni.length).toBeGreaterThanOrEqual(PAROLE_MINIME_DEL_GIORNO)
      expect(giornataValida(g)).toBe(true)
      expect(g.traguardo).toBe(traguardoDi(g.comuni))
    }
  })

  it('il traguardo segue la griglia, fra il minimo e il massimo, e in mezzo sta quel che fa chi gioca bene', () => {
    const traguardi = anno.map((g) => g.traguardo).sort((a, b) => a - b)
    expect(traguardi[0]).toBeGreaterThanOrEqual(TRAGUARDO_MINIMO)
    expect(traguardi[traguardi.length - 1]).toBeLessThanOrEqual(TRAGUARDO_MASSIMO)
    // Una trentina di punti in tre minuti: venticinque parole, qualcuna lunga.
    const mediana = traguardi[Math.floor(traguardi.length / 2)]
    expect(mediana).toBeGreaterThanOrEqual(30)
    expect(mediana).toBeLessThanOrEqual(50)
  })
})

describe('la griglia della libera', () => {
  it('ha abbastanza parole comuni, e tutte valgono anche per il dizionario intero', () => {
    for (const lato of [4, 5] as const) {
      for (let seme = 1; seme <= 5; seme += 1) {
        const g = grigliaLibera(tutte, lato, mulberry32(seme * 97 + lato))
        expect(g.griglia).toHaveLength(lato * lato)
        expect(g.comuni.length).toBeGreaterThanOrEqual(PAROLE_MINIME_LIBERE[lato])
        const valide = new Set(g.tutte)
        for (const p of g.comuni) expect(valide.has(p), p).toBe(true)
        expect(g.tutte.length).toBeGreaterThan(g.comuni.length)
      }
    }
  })
})

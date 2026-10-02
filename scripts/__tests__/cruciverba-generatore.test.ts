import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { EPOCH_DATE, GAME_TIMEZONE } from '../../shared/config'
import { NERA, sequenzeDelloSchema } from '../../shared/cruciverba'
import { addDays, mulberry32 as mulberryCondiviso, puzzleNumberFor } from '../../shared/daily'
import {
  TRATTO_MASSIMO,
  correggiDefinizioni,
  disegnaSchema,
  generaCruciverba,
  istruzioneSql,
  leggiDefinizioni,
  mulberry32,
  paroleDellaSoluzione,
  preparaDizionario,
  semeDelGiorno,
  sequenzeDi,
  // @ts-expect-error — script in JavaScript, senza dichiarazioni di tipo
} from '../cruciverba/generatore.mjs'
// @ts-expect-error — script in JavaScript, senza dichiarazioni di tipo
import { EPOCA, FUSO, numeroDelGiorno } from '../cruciverba/giorno.mjs'

const DATI = join(__dirname, '..', 'data', 'cruciverba-definizioni.tsv.gz')
const voci = leggiDefinizioni(gunzipSync(readFileSync(DATI)).toString('utf8'))
const indici = preparaDizionario(voci)

function tratti(nere: boolean[], righe: number, colonne: number): number[] {
  const lunghezze: number[] = []
  const leggi = (celle: boolean[]) => {
    let n = 0
    for (const nera of [...celle, true]) {
      if (nera) {
        if (n > 0) lunghezze.push(n)
        n = 0
      } else n += 1
    }
  }
  for (let r = 0; r < righe; r += 1) leggi(nere.slice(r * colonne, (r + 1) * colonne))
  for (let c = 0; c < colonne; c += 1) leggi(Array.from({ length: righe }, (_, r) => nere[r * colonne + c]))
  return lunghezze
}

describe('il generatore e il gioco parlano la stessa lingua', () => {
  it('lo stesso PRNG di shared/daily.ts', () => {
    const a = mulberry32(12345)
    const b = mulberryCondiviso(12345)
    for (let i = 0; i < 20; i += 1) expect(a()).toBe(b())
  })

  it('lo stesso calendario: lo schema del giorno 40 e\' quello che il Worker serve il giorno 40', () => {
    expect(EPOCA).toBe(EPOCH_DATE)
    expect(FUSO).toBe(GAME_TIMEZONE)
    for (const delta of [0, 1, 28, 200, 800]) {
      const data = addDays(EPOCH_DATE, delta)
      expect(numeroDelGiorno(data)).toBe(puzzleNumberFor(data))
    }
  })

  it('le stesse chiavi delle definizioni', () => {
    const nere = disegnaSchema(mulberry32(7), 10, 10)
    const schema = nere.map((n: boolean) => (n ? NERA : '.')).join('')
    const delGeneratore = sequenzeDi(nere, 10, 10).map((s: { chiave: string }) => s.chiave).sort()
    const delGioco = sequenzeDelloSchema(schema, 10, 10).map((s) => s.chiave).sort()
    expect(delGeneratore).toEqual(delGioco)
  })
})

describe('lo schema delle caselle nere', () => {
  it('rispetta le regole del cruciverba italiano, su molti semi', () => {
    let disegnati = 0
    for (let seme = 1; seme <= 40; seme += 1) {
      // Con qualche seme non viene: il generatore passa al successivo, ed e'
      // previsto. Ma deve venire quasi sempre, altrimenti e' tempo buttato.
      const nere: boolean[] | null = disegnaSchema(mulberry32(seme), 10, 10)
      if (!nere) continue
      disegnati += 1
      const lunghezze = tratti(nere, 10, 10)
      // Nessuna lettera che stia in una parola sola: ogni tratto e' lungo almeno due.
      expect(lunghezze.every((n) => n >= 2)).toBe(true)
      // E nessuna parola cosi' lunga da incrociarsi solo con altre lunghe.
      expect(Math.max(...lunghezze)).toBeLessThanOrEqual(TRATTO_MASSIMO)
      // Mai un quadrato di quattro nere.
      for (let r = 0; r < 9; r += 1) {
        for (let c = 0; c < 9; c += 1) {
          const k = r * 10 + c
          expect(nere[k] && nere[k + 1] && nere[k + 10] && nere[k + 11]).toBe(false)
        }
      }
    }
    expect(disegnati).toBeGreaterThanOrEqual(32)
  })
})

describe('un cruciverba generato', () => {
  const cruciverba = generaCruciverba({ indici, seme: semeDelGiorno(29), schemi: 40 })

  it('viene, ed e\' sempre lo stesso per lo stesso giorno', () => {
    expect(cruciverba).not.toBeNull()
    const ancora = generaCruciverba({ indici, seme: semeDelGiorno(29), schemi: 40 })
    expect(ancora.griglia).toBe(cruciverba.griglia)
  }, 60_000)

  it('ha solo parole vere, tutte diverse, ognuna con la sua definizione', () => {
    const dizionario = new Map(voci.map((v: { parola: string }) => [v.parola, v]))
    const sequenze = sequenzeDelloSchema(cruciverba.griglia, cruciverba.righe, cruciverba.colonne)
    const parole = sequenze.map((s) => s.caselle.map((k) => cruciverba.griglia[k]).join(''))
    expect(new Set(parole).size).toBe(parole.length)
    for (const [i, s] of sequenze.entries()) {
      expect(dizionario.has(parole[i])).toBe(true)
      const d = cruciverba.definizioni[s.chiave]
      expect(d?.testo?.length).toBeGreaterThan(2)
      // Nessuna definizione contiene la sua risposta.
      expect(d.testo.toLowerCase().split(/[^a-zàèéìòù]+/)).not.toContain(parole[i])
    }
  })

  it('si salva con un\'istruzione che non si rompe sugli apostrofi', () => {
    const sql = istruzioneSql(29, cruciverba, '2026-09-26T00:00:00.000Z')
    expect(sql.startsWith('INSERT OR IGNORE INTO cruciverba_schemi')).toBe(true)
    // Ogni apostrofo dentro le stringhe e' raddoppiato: il numero di apici e' pari.
    expect((sql.match(/'/g) ?? []).length % 2).toBe(0)
  })

  it('le parole da non ripetere si ricavano dalla soluzione salvata', () => {
    const parole = paroleDellaSoluzione(cruciverba.griglia, cruciverba.righe, cruciverba.colonne)
    expect(parole.length).toBeGreaterThan(10)
    expect(parole.every((p: string) => p.length >= 4 && cruciverba.parole.includes(p))).toBe(true)
  })
})

describe('gli schemi liberi', () => {
  it('hanno semi loro: lo schema libero n non e’ il cruciverba del giorno n', async () => {
    // @ts-expect-error — script in JavaScript, senza dichiarazioni di tipo
    const { semeLibero } = await import('../cruciverba/generatore.mjs')
    const semi = new Set<number>()
    for (let n = 1; n <= 500; n += 1) {
      expect(semeLibero(n)).not.toBe(semeDelGiorno(n))
      semi.add(semeLibero(n))
    }
    expect(semi.size).toBe(500)
  })

  it('si scrivono nella loro tabella, col loro numero', () => {
    const finto = { righe: 1, colonne: 2, griglia: 'ab', definizioni: {} }
    expect(istruzioneSql(7, finto, 'x', true)).toMatch(/^INSERT OR IGNORE INTO cruciverba_schemi_liberi \(id, /)
    expect(istruzioneSql(7, finto, 'x')).toMatch(/^INSERT OR IGNORE INTO cruciverba_schemi \(puzzle_number, /)
  })
})

describe('gli schemi gia\' scritti', () => {
  const perParola = new Map(voci.map((v: { parola: string }) => [v.parola, v]))
  // Le definizioni come le scrive `istruzioneSql`: testo, voce e nota.
  const salvate = (cruciverba: { definizioni: Record<string, { testo: string; voce: string; nota: string }> }) =>
    Object.fromEntries(
      Object.entries(cruciverba.definizioni).map(([k, d]) => [
        k,
        d.nota ? { t: d.testo, v: d.voce, n: d.nota } : { t: d.testo, v: d.voce },
      ]),
    )

  it('una definizione che il filtro ha scartato dopo lascia il posto alla prima buona', () => {
    // Lo schema #35, quando il filtro non vedeva ancora il buco di "dei,".
    const rotta = "L'universalità dei, ovverosia, senza eccezione alcuna, tutti i diritti ed oneri"
    const corretto = correggiDefinizioni('eredita', 1, 7, { o0: { t: rotta, v: 'eredità' } }, perParola)
    expect(corretto.definizioni.o0).toEqual({
      t: 'Passaggio di proprietà e/o beni, anche pecuniari, per la morte di qualcuno',
      v: 'eredità',
    })
    expect(corretto.cambiate).toEqual([
      { chiave: 'o0', parola: 'eredita', prima: rotta, dopo: corretto.definizioni.o0.t },
    ])
  })

  it('uno schema con le definizioni di adesso resta com\'e\'', () => {
    const cruciverba = generaCruciverba({ indici, seme: semeDelGiorno(29), schemi: 40 })
    const { griglia, righe, colonne } = cruciverba
    expect(correggiDefinizioni(griglia, righe, colonne, salvate(cruciverba), perParola)).toBeNull()
  }, 60_000)

  it('una parola che il dizionario non ha piu\' tiene la sua definizione', () => {
    expect(correggiDefinizioni('zzzz', 1, 4, { o0: { t: 'Il verso di chi dorme', v: 'zzzz' } }, perParola)).toBeNull()
  })
})

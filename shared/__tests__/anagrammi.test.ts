import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import {
  BONUS_ANAGRAMMI,
  COSTO_AIUTO_ANAGRAMMI,
  LUNGHEZZE_ANAGRAMMI,
  MASSIMO_ANAGRAMMI,
  PUNTI_FINITA_ANAGRAMMI,
  PUNTI_PAROLA_ANAGRAMMI,
  TEMPO_PAROLA_MS,
  chiaveAnagramma,
  elencoDaTsv,
  mescolaAnagramma,
  normalizzaAnagramma,
  paroleDelGiorno,
  puntiAnagrammi,
  puntiParola,
  rispostaGiusta,
  subitoMs,
} from '../anagrammi'
import { VERSIONE_LIBERE_ANAGRAMMI } from '../anagrammi-libere'
import { mulberry32 } from '../daily'

const RADICE = join(__dirname, '..', '..')
const tsv = gunzipSync(readFileSync(join(RADICE, 'scripts', 'data', 'anagrammi.tsv.gz'))).toString('utf8')
const elenco = elencoDaTsv(tsv)
const testoLibere = readFileSync(join(RADICE, 'public', 'dati', 'anagrammi', 'libere.json'), 'utf8')
const libere = JSON.parse(testoLibere) as { parole: Record<string, Array<[string, string, string]>> }

describe('i punti di una parola', () => {
  it('trovata subito vale il massimo, allo scadere del tempo il minimo, e scende dritta', () => {
    for (const n of LUNGHEZZE_ANAGRAMMI) {
      expect(puntiParola(n, 1_000, false)).toBe(PUNTI_PAROLA_ANAGRAMMI + BONUS_ANAGRAMMI)
      expect(puntiParola(n, subitoMs(n), false)).toBe(PUNTI_PAROLA_ANAGRAMMI + BONUS_ANAGRAMMI)
      expect(puntiParola(n, TEMPO_PAROLA_MS, false)).toBe(PUNTI_PAROLA_ANAGRAMMI)
      let prima = Infinity
      for (let ms = 0; ms <= TEMPO_PAROLA_MS; ms += 5_000) {
        const p = puntiParola(n, ms, false)
        expect(p).toBeLessThanOrEqual(prima)
        prima = p
      }
    }
  })

  it('le parole lunghe hanno piu’ tempo per valere il massimo', () => {
    expect(puntiParola(9, 25_000, false)).toBeGreaterThan(puntiParola(5, 25_000, false))
  })

  it('la definizione costa i suoi punti, e una parola trovata vale sempre qualcosa', () => {
    expect(puntiParola(5, 0, true)).toBe(PUNTI_PAROLA_ANAGRAMMI + BONUS_ANAGRAMMI - COSTO_AIUTO_ANAGRAMMI)
    expect(puntiParola(5, TEMPO_PAROLA_MS, true)).toBe(1)
  })

  it('una giornata vale dieci per averla giocata, piu’ le parole trovate', () => {
    expect(puntiAnagrammi([])).toBe(PUNTI_FINITA_ANAGRAMMI)
    const tutte = LUNGHEZZE_ANAGRAMMI.map((lettere) => ({ lettere, trovata: true, ms: 0, aiuto: false }))
    expect(puntiAnagrammi(tutte)).toBe(MASSIMO_ANAGRAMMI)
    expect(puntiAnagrammi(tutte.map((p) => ({ ...p, trovata: false })))).toBe(PUNTI_FINITA_ANAGRAMMI)
  })
})

describe('le lettere mescolate', () => {
  it('non sono mai una delle risposte, e hanno le lettere della parola', () => {
    const caso = mulberry32(7)
    for (const [parola, risposte] of [
      ['attore', ['attore', 'teatro']],
      ['amor', ['amor', 'mora', 'orma', 'ramo', 'roma']],
      ['gatto', ['gatto']],
    ] as const) {
      for (let i = 0; i < 200; i += 1) {
        const m = mescolaAnagramma(parola, risposte, caso)
        expect(risposte).not.toContain(m)
        expect(chiaveAnagramma(m)).toBe(chiaveAnagramma(parola))
      }
    }
  })

  it('una risposta si confronta senza maiuscole ne’ accenti', () => {
    expect(normalizzaAnagramma('Perché')).toBe('perche')
    expect(rispostaGiusta({ risposte: ['attore', 'teatro'] }, 'TEATRO')).toBe(true)
    expect(rispostaGiusta({ risposte: ['attore', 'teatro'] }, 'aterot')).toBe(false)
  })
})

describe('le parole delle giornate, dal file vero', () => {
  it('ogni lunghezza ne ha per piu’ di un anno', () => {
    for (const n of LUNGHEZZE_ANAGRAMMI) expect(elenco.get(n)?.length ?? 0, `${n} lettere`).toBeGreaterThan(365)
  })

  it('le parole di un giorno sono sempre le stesse, e ogni parola ha la sua definizione', () => {
    const oggi = paroleDelGiorno(40, elenco)
    expect(paroleDelGiorno(40, elenco)).toEqual(oggi)
    expect(oggi.map((p) => p.parola.length)).toEqual([...LUNGHEZZE_ANAGRAMMI])
    for (let n = 1; n < 400; n += 1) {
      for (const p of paroleDelGiorno(n, elenco)) {
        expect(p.risposte).toContain(p.parola)
        expect(p.risposte).not.toContain(p.lettere)
        expect(chiaveAnagramma(p.lettere)).toBe(chiaveAnagramma(p.parola))
        expect(p.definizione.length).toBeGreaterThan(3)
      }
    }
  })

  it('una parola non torna prima che la sua lunghezza abbia finito l’elenco', () => {
    for (const [i, n] of LUNGHEZZE_ANAGRAMMI.entries()) {
      const quante = elenco.get(n)!.length
      const viste = new Set(Array.from({ length: quante }, (_, k) => paroleDelGiorno(k, elenco)[i].parola))
      expect(viste.size).toBe(quante)
    }
  })
})

describe('le parole delle libere', () => {
  it('non sono mai l’anagramma di una parola delle classificate', () => {
    const delGiorno = new Set([...elenco.values()].flat().map((p) => chiaveAnagramma(p.parola)))
    for (const [n, voci] of Object.entries(libere.parole)) {
      expect(voci.length, `${n} lettere`).toBeGreaterThan(100)
      for (const [parola] of voci) expect(delGiorno.has(chiaveAnagramma(parola)), parola).toBe(false)
    }
  })

  it('il file ha l’impronta che porta il suo indirizzo', () => {
    expect(createHash('sha256').update(testoLibere).digest('hex').slice(0, 10)).toBe(VERSIONE_LIBERE_ANAGRAMMI)
  })
})

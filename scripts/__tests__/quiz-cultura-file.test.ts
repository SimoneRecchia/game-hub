import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../shared/daily'
import { AMBITI } from '../../shared/quiz'
import { PERCORSO_IMMAGINE, type DatiCultura, type DatiOggi, type ImmagineQuiz } from '../../shared/quiz-cultura'
import { VERSIONI_CULTURA } from '../../shared/quiz-cultura-versioni'
import { domandaValida, tipiPossibili, type TipoDomanda } from '../../shared/quiz-domande'
import { generaPartita, type FontiQuiz } from '../../shared/quiz-domande-cultura'
import { FILE_MATERIE, versioniCultura } from '../cultura/versioni'

const CARTELLA = join(__dirname, '..', '..', 'public', 'dati', 'quiz')

const leggi = <T>(file: string): T => JSON.parse(readFileSync(file, 'utf8')) as T
const cultura = Object.fromEntries(
  FILE_MATERIE.map((m) => [m, leggi(join(CARTELLA, `${m}.json`))]),
) as unknown as DatiCultura
const GIORNI = readdirSync(join(CARTELLA, 'oggi'))
  .filter((f) => f.endsWith('.json'))
  .sort()

/**
 * I file veri delle materie del quiz, non quelli finti delle altre prove: che
 * l'app li chieda all'indirizzo giusto, che ci sia quel che i generatori si
 * aspettano, e che ogni categoria, in ogni ambito, faccia partite intere.
 */
describe('i file delle materie del quiz', () => {
  it('le impronte nell’indirizzo sono quelle dei file', () => {
    expect(VERSIONI_CULTURA).toEqual(versioniCultura(CARTELLA))
    for (const m of [...FILE_MATERIE, 'oggi']) expect(VERSIONI_CULTURA[m]).toMatch(/^[0-9a-f]{10}$/)
  })

  it('ci sono tutti i giorni dell’anno, il 29 febbraio compreso', () => {
    expect(GIORNI).toHaveLength(366)
    expect(GIORNI).toContain('02-29.json')
  })

  it('le immagini sono percorsi di Commons, con le proporzioni', () => {
    const immagini: ImmagineQuiz[] = cultura.arte.quadri.map((q) => q.img)
    expect(immagini.length).toBeGreaterThan(300)
    for (const img of immagini) {
      expect(img.f).toMatch(PERCORSO_IMMAGINE)
      // Le proporzioni che si vedono in una carta del telefono (scripts/cultura/arte.ts).
      expect(img.r).toBeGreaterThanOrEqual(0.3)
      expect(img.r).toBeLessThanOrEqual(3.2)
    }
  })

  it('gli identificativi non si ripetono', () => {
    const liste: Array<readonly { id: string }[]> = [
      cultura.arte.quadri,
      cultura.arte.pittori,
      cultura.arte.correnti,
      cultura.libri.libri,
      cultura.libri.autori,
      cultura.cinema.film,
      cultura.cinema.registi,
      cultura.lirica.opere,
      cultura.lirica.compositori,
      cultura.nobel.premiati,
      cultura.storia.eventi,
      cultura.scienza.elementi,
      cultura.scienza.composti,
      cultura.scienza.unita,
      cultura.scienza.astri,
      cultura.scienza.scoperte,
      cultura.scienza.specie,
    ]
    for (const lista of liste) expect(new Set(lista.map((x) => x.id)).size).toBe(lista.length)
  })

  it('ogni persona citata c’e', () => {
    const pittori = new Set(cultura.arte.pittori.map((p) => p.id))
    for (const q of cultura.arte.quadri) for (const a of q.a) expect(pittori.has(a)).toBe(true)
    const premiati = new Set(cultura.nobel.premiati.map((p) => p.id))
    for (const p of cultura.nobel.premi) expect(premiati.has(p.chi)).toBe(true)
  })

  const fonti: FontiQuiz = { cultura }
  for (const categoria of FILE_MATERIE) {
    for (const { id: ambito } of AMBITI[categoria] ?? [{ id: 'tutti' }]) {
      it(`${categoria}, ${ambito}: dieci domande buone, per ogni seme`, () => {
        for (let seme = 1; seme <= 12; seme += 1) {
          const domande = generaPartita(fonti, { categoria, area: 'mondo', quante: 10, ambito }, mulberry32(seme))
          expect(domande).toHaveLength(10)
          for (const d of domande) expect(domandaValida(d, 4)).toBe(true)
          expect(new Set(domande.map((d) => d.soggetto)).size).toBe(10)
        }
      })
    }

    it(`${categoria}: ogni tipo di domanda si fa`, () => {
      const visti = new Set<TipoDomanda>()
      for (let seme = 1; seme <= 30; seme += 1) {
        const domande = generaPartita(fonti, { categoria, area: 'mondo', quante: 10 }, mulberry32(seme))
        for (const d of domande) visti.add(d.tipo)
      }
      expect([...visti].sort()).toEqual([...tipiPossibili(categoria, 'scelta')].sort())
    })
  }

  it('ogni giorno di "Accadde oggi" fa dieci domande', () => {
    for (const file of GIORNI) {
      const oggi = leggi<DatiOggi>(join(CARTELLA, 'oggi', file))
      expect(`${oggi.giorno}.json`).toBe(file)
      const domande = generaPartita(
        { oggi },
        { categoria: 'oggi', area: 'mondo', quante: 10, data: `2026-${oggi.giorno}` },
        mulberry32(7),
      )
      expect(domande, file).toHaveLength(10)
      for (const d of domande) expect(domandaValida(d, 4)).toBe(true)
    }
  })
})

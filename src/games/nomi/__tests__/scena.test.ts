import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LETTERE_NOMI, PUNTI_SFIDA, type CategoriaNomi } from '@shared/nomi-cose'
import type { RisultatoNomi } from '@shared/types'
import { righeAlTavolo, righeDiIeri } from '../racconto'
import {
  PASSO_CORREZIONE_MS,
  RIGA_MS,
  TIMBRO_MS,
  TOTALE_MS,
  fermataDi,
  inizioFrenata,
  sola,
  tempiCorrezione,
  variabiliCorrezione,
} from '../scena'

const CSS = readFileSync(join(__dirname, '..', 'NomiCose.css'), 'utf8')

/** Le animazioni della correzione nel CSS: durata e ritardo oltre il momento (`--t` o `--totale`). */
function animazioniDopo(variabile: '--t' | '--totale'): { durata: number; dopo: number }[] {
  const fuori: { durata: number; dopo: number }[] = []
  const regola = new RegExp(
    `animation: [\\w-]+ (\\d+)ms [^;]*?(?:var\\(${variabile}\\)|calc\\(var\\(${variabile}\\) \\+ (\\d+)ms\\))`,
    'g',
  )
  for (const m of CSS.matchAll(regola)) fuori.push({ durata: Number(m[1]), dopo: Number(m[2] ?? 0) })
  return fuori
}

describe('la correzione del foglio', () => {
  it('segna le righe una dopo l’altra, poi la somma, e l’adesivo viene quando la somma e’ scritta', () => {
    const t = tempiCorrezione(5)
    expect(t.righe).toEqual([0, 1, 2, 3, 4].map((i) => i * PASSO_CORREZIONE_MS))
    expect(t.totale).toBeGreaterThanOrEqual(t.righe[4] + RIGA_MS)
    expect(t.fine).toBeGreaterThanOrEqual(t.totale + TOTALE_MS)
  })

  it('aspetta il timbro dello stop, e dura poco: chi ha giocato vuole sapere com’e’ andata', () => {
    const senza = tempiCorrezione(5)
    const dopo = tempiCorrezione(5, TIMBRO_MS)
    expect(dopo.righe[0]).toBe(TIMBRO_MS)
    expect(dopo.fine - senza.fine).toBe(TIMBRO_MS)
    expect(senza.fine).toBeLessThan(3_000)
  })

  it('senza animazioni tutto e’ gia’ segnato, e l’adesivo arriva appena se ne va il timbro', () => {
    const t = tempiCorrezione(5, TIMBRO_MS, true)
    expect(new Set([...t.righe, t.totale, t.fine])).toEqual(new Set([TIMBRO_MS]))
  })

  it('il CSS disegna la correzione con gli stessi numeri', () => {
    const t = tempiCorrezione(5, 200)
    expect(variabiliCorrezione(t, 200)).toEqual({
      '--attesa': '200ms',
      '--passo-correzione': `${PASSO_CORREZIONE_MS}ms`,
      '--totale': `${t.totale}ms`,
      '--fine': `${t.fine}ms`,
    })
    // Il CSS le usa e non le dichiara: `--passo`, sul foglio, e' l'altezza delle righe, e un passo
    // della correzione con lo stesso nome la cancellava.
    for (const nome of Object.keys(variabiliCorrezione(t))) expect(CSS).not.toMatch(new RegExp(`${nome}\\s*:`))
    // Il lavoro di ogni riga, e quello della somma, finiscono nel tempo che scena.ts gli da'.
    const righe = animazioniDopo('--t')
    const somma = animazioniDopo('--totale')
    expect(righe.length).toBeGreaterThanOrEqual(4)
    expect(somma.length).toBeGreaterThanOrEqual(2)
    for (const a of righe) expect(a.dopo + a.durata).toBeLessThanOrEqual(RIGA_MS)
    for (const a of somma) expect(a.dopo + a.durata).toBeLessThanOrEqual(TOTALE_MS)
  })
})

describe('il rullo delle lettere', () => {
  it('ha le lettere del gioco in ordine d’alfabeto, e trova il posto di ognuna', () => {
    LETTERE_NOMI.forEach((l, i) => {
      expect(fermataDi(l)).toBe(i)
      expect(fermataDi(l.toUpperCase())).toBe(i)
    })
    expect([...LETTERE_NOMI].sort()).toEqual([...LETTERE_NOMI])
  })

  it('frena sempre in avanti, e si ferma sulla lettera giusta', () => {
    const n = LETTERE_NOMI.length
    for (let adesso = 0; adesso < 3 * n; adesso += 0.37) {
      for (let fermata = 0; fermata < n; fermata += 1) {
        const da = inizioFrenata(adesso, fermata, 4)
        expect(da).toBeGreaterThanOrEqual(adesso)
        expect(da - adesso).toBeLessThan(n)
        expect((((da + 4) % n) + n) % n).toBe(fermata)
      }
    }
  })
})

describe('le righe del foglio', () => {
  const ieri: RisultatoNomi = {
    puzzleNumber: 40,
    lettera: 'm',
    categorie: ['nomi', 'cose', 'citta', 'animali'],
    punti: 33,
    tempoMs: 90_000,
    giocatori: 12,
    risposte: {
      nomi: { testo: 'Marco', forma: 'marco', uguali: 9, punti: 4.6 },
      cose: { testo: 'martello', forma: 'martello', uguali: 1, punti: 8.4 },
      citta: { testo: 'mammut', forma: null, uguali: null, punti: 0 },
    },
    piuDate: {},
  }

  it('ieri: si evidenzia la risposta data solo da chi la legge, e una che non vale prende zero', () => {
    const righe = righeDiIeri(ieri)
    expect(righe.map((r) => r.rara ?? false)).toEqual([false, true, false, false])
    expect(righe[1].nota).toBe('Solo tu')
    expect(righe[2]).toMatchObject({ segno: 'sbagliata', punti: '0' })
    expect(righe[3].segno).toBe('vuota')
    expect(righe[3].punti).toBeUndefined()
    // Da solo, ogni risposta e' "solo tu": l'evidenziatore non direbbe niente.
    expect(righeDiIeri({ ...ieri, giocatori: 1 }).some((r) => r.rara)).toBe(false)
  })

  it('al tavolo: i punti di ognuno, la risposta dell’altro sotto, e l’evidenziatore solo sui venti', () => {
    const categorie: CategoriaNomi[] = ['nomi', 'cose', 'citta', 'animali']
    const righe = righeAlTavolo(
      categorie,
      {
        testi: ['Anna', 'armadio', 'Asti', ''],
        valide: [true, true, false, false],
        punti: [PUNTI_SFIDA.sola, PUNTI_SFIDA.uguale, 0, 0],
      },
      {
        nome: 'Computer',
        testi: [null, 'armadio', 'Ancona', 'aquila'],
        valide: [false, true, true, true],
        punti: [0, 5, 20, 20],
      },
    )
    expect(righe.map((r) => r.punti)).toEqual(['+20', '+5', '0', undefined])
    expect(righe.map((r) => r.rara ?? false)).toEqual([true, false, false, false])
    expect(righe.map((r) => r.segno)).toEqual(['giusta', 'giusta', 'sbagliata', 'vuota'])
    expect(righe[0].nota).toBe('Computer: —')
    expect(righe[2].nota).toBe('Computer: Ancona · 20')
    expect(sola(PUNTI_SFIDA.diversa)).toBe(false)
  })
})

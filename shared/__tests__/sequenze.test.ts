import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../daily'
import {
  ALTEZZA_TAVOLA,
  CUBETTI,
  LARGHEZZA_TAVOLA,
  LATO_CUBETTO,
  LIVELLI_SEQUENZE,
  NUMERO_CUBETTI,
  PRIMA_LUNGHEZZA,
  SEQUENZE_PER_TURNO,
  TURNI_SEQUENZE,
  durataSequenza,
  giornataACaso,
  giornataDaTesto,
  giornataInTesto,
  leggiTocchi,
  lunghezzaRaggiunta,
  primoErrore,
  rispostaGiusta,
  sequenzaACaso,
  sequenzaDelLivello,
} from '../sequenze'

/** Mezzo ingombro di un cubetto girato: il quadrato che lo contiene. */
const mezzo = (r: number) => (LATO_CUBETTO / 2) * (Math.abs(Math.cos((r * Math.PI) / 180)) + Math.abs(Math.sin((r * Math.PI) / 180)))

describe('la tavola', () => {
  it('ha nove cubetti, tutti dentro la tavola anche girati', () => {
    expect(NUMERO_CUBETTI).toBe(9)
    for (const c of CUBETTI) {
      expect(c.x - mezzo(c.r)).toBeGreaterThanOrEqual(0)
      expect(c.x + mezzo(c.r)).toBeLessThanOrEqual(LARGHEZZA_TAVOLA)
      expect(c.y - mezzo(c.r)).toBeGreaterThanOrEqual(0)
      expect(c.y + mezzo(c.r)).toBeLessThanOrEqual(ALTEZZA_TAVOLA)
    }
  })

  it('fra due cubetti resta sempre spazio per il dito, anche girati', () => {
    for (let i = 0; i < CUBETTI.length; i += 1) {
      for (let j = i + 1; j < CUBETTI.length; j += 1) {
        const a = CUBETTI[i]
        const b = CUBETTI[j]
        const distanza = Math.hypot(a.x - b.x, a.y - b.y)
        // Due cerchi che contengono i cubetti girati, piu' un margine: non si toccano mai.
        expect(distanza, `${i} e ${j}`).toBeGreaterThan(LATO_CUBETTO * Math.SQRT2 + 2)
      }
    }
  })

  it('non e’ una griglia: tre cubetti non stanno mai sulla stessa riga o colonna', () => {
    for (const asse of ['x', 'y'] as const) {
      const valori = CUBETTI.map((c) => c[asse])
      for (const v of valori) expect(valori.filter((w) => Math.abs(w - v) < 6).length).toBeLessThanOrEqual(2)
    }
  })
})

describe('le sequenze', () => {
  it('fino a nove cubetti nessuno torna, oltre mai due volte di fila', () => {
    const caso = mulberry32(42)
    for (let n = 1; n <= NUMERO_CUBETTI; n += 1) {
      const s = sequenzaACaso(n, caso)
      expect(s).toHaveLength(n)
      expect(new Set(s).size).toBe(n)
    }
    for (let prova = 0; prova < 200; prova += 1) {
      const s = sequenzaACaso(15, caso)
      expect(s).toHaveLength(15)
      for (let i = 1; i < s.length; i += 1) expect(s[i]).not.toBe(s[i - 1])
      for (const c of s) expect(c >= 0 && c < NUMERO_CUBETTI).toBe(true)
    }
  })

  it('oltre i nove ogni cubetto esce: il generatore non ne lascia indietro nessuno', () => {
    const caso = mulberry32(7)
    const visti = new Set<number>()
    for (let prova = 0; prova < 50; prova += 1) for (const c of sequenzaACaso(12, caso)) visti.add(c)
    expect(visti.size).toBe(NUMERO_CUBETTI)
  })

  it('una giornata ha cinque turni, e in ognuno una sequenza per lunghezza, da tre a nove', () => {
    const giornata = giornataACaso(mulberry32(1))
    expect(giornata).toHaveLength(TURNI_SEQUENZE)
    for (const turno of giornata) {
      expect(turno).toHaveLength(SEQUENZE_PER_TURNO)
      turno.forEach((s, k) => expect(s).toHaveLength(PRIMA_LUNGHEZZA + k))
    }
    expect(giornataDaTesto(giornataInTesto(giornata))).toEqual(giornata)
  })

  it('una giornata scritta male non si legge', () => {
    expect(giornataDaTesto('niente')).toBeNull()
    expect(giornataDaTesto('[]')).toBeNull()
    const giusta = JSON.parse(giornataInTesto(giornataACaso(mulberry32(3)))) as string[][]
    giusta[0][0] = '9a1'
    expect(giornataDaTesto(JSON.stringify(giusta))).toBeNull()
  })

  it('nella libera e nella sfida la sequenza viene dal seme e dal livello: due telefoni vedono la stessa', () => {
    expect(sequenzaDelLivello(1234, 6)).toEqual(sequenzaDelLivello(1234, 6))
    expect(sequenzaDelLivello(1234, 6)).not.toEqual(sequenzaDelLivello(1235, 6))
    expect(sequenzaDelLivello(1234, 11)).toHaveLength(11)
  })
})

describe('le risposte', () => {
  it('giusta se tocca tutti i cubetti nell’ordine, o al contrario nel difficile', () => {
    expect(rispostaGiusta([4, 0, 7], [4, 0, 7])).toBe(true)
    expect(rispostaGiusta([4, 0, 7], [4, 0])).toBe(false)
    expect(rispostaGiusta([4, 0, 7], [7, 0, 4])).toBe(false)
    expect(rispostaGiusta([4, 0, 7], [7, 0, 4], true)).toBe(true)
    expect(LIVELLI_SEQUENZE.difficile.indietro).toBe(true)
  })

  it('il primo errore si sa al tocco sbagliato, senza aspettare gli altri', () => {
    expect(primoErrore([4, 0, 7, 2], [4, 0])).toBe(-1)
    expect(primoErrore([4, 0, 7, 2], [4, 1])).toBe(1)
    expect(primoErrore([4, 0, 7, 2], [2, 7], true)).toBe(-1)
  })

  it('i tocchi dal telefono sono cubetti che ci sono, e non piu’ della sequenza', () => {
    expect(leggiTocchi([0, 8, 3], 3)).toEqual([0, 8, 3])
    expect(leggiTocchi([0, 9], 3)).toBeNull()
    expect(leggiTocchi([0, 1.5], 3)).toBeNull()
    expect(leggiTocchi([0, 1, 2, 3], 3)).toBeNull()
    expect(leggiTocchi('012', 3)).toBeNull()
  })

  it('la lunghezza raggiunta è l’ultima ripetuta: due se e’ sbagliata la prima', () => {
    expect(lunghezzaRaggiunta(0)).toBe(2)
    expect(lunghezzaRaggiunta(SEQUENZE_PER_TURNO)).toBe(NUMERO_CUBETTI)
  })

  it('una sequenza di sei dura poco piu’ di cinque secondi', () => {
    expect(durataSequenza(6)).toBe(6 * 600 + 5 * 250)
    expect(durataSequenza(0)).toBe(0)
  })
})

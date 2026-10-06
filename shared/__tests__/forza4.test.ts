import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../daily'
import {
  CASELLE,
  COLONNE,
  casellaDi,
  colonneLibere,
  esito,
  file,
  gioca,
  leggi,
  posizioneIniziale,
  quattro,
  scrivi,
  type PosizioneForza4,
} from '../forza4'
import { LIVELLI_FORZA4, mossaDelComputer } from '../forza4-computer'

/** Colonne riempite a coppie sfalsate: la griglia si riempie senza una fila di quattro. */
const GRIGLIA_PIENA = [
  0, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 2, 3, 2, 3, 2, 3, 3, 2, 3, 2, 3, 2, 4, 5, 4, 5, 4, 5, 5, 4, 5, 4, 5, 4, 6, 6, 6,
  6, 6, 6,
]

/** Una partita dalle colonne giocate, a turno. */
function dopo(...colonne: number[]): PosizioneForza4 {
  let p = posizioneIniziale()
  for (const c of colonne) {
    const q = gioca(p, c)
    if (!q) throw new Error(`Colonna ${c} non giocabile`)
    p = q
  }
  return p
}

describe('le regole di Forza 4', () => {
  it('comincia con la griglia vuota, sette colonne e il primo al tratto', () => {
    const p = posizioneIniziale()
    expect(colonneLibere(p)).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(p.tratto).toBe(0)
    expect(scrivi(p)).toBe('.'.repeat(CASELLE))
  })

  it('il disco cade in fondo, e una colonna piena non si gioca', () => {
    const p = dopo(3, 3)
    expect(p.caselle[casellaDi(0, 3)]).toBe(0)
    expect(p.caselle[casellaDi(1, 3)]).toBe(1)
    const piena = dopo(0, 0, 0, 0, 0, 0)
    expect(colonneLibere(piena)).not.toContain(0)
    expect(gioca(piena, 0)).toBeNull()
    expect(gioca(piena, 7)).toBeNull()
  })

  it('il testo va e torna, e rifiuta le posizioni impossibili', () => {
    const p = dopo(3, 2, 3, 4)
    const q = leggi(scrivi(p))
    expect(q && scrivi(q)).toBe(scrivi(p))
    expect(q?.tratto).toBe(0)
    // Un disco sospeso, due dischi dello stesso di fila, lunghezze sbagliate.
    expect(leggi('.'.repeat(COLONNE) + '0' + '.'.repeat(CASELLE - COLONNE - 1))).toBeNull()
    expect(leggi('00' + '.'.repeat(CASELLE - 2))).toBeNull()
    expect(leggi('0')).toBeNull()
    expect(leggi('x'.repeat(CASELLE))).toBeNull()
  })

  it('quattro in orizzontale, in verticale e nelle due diagonali', () => {
    expect(quattro(dopo(0, 0, 1, 1, 2, 2, 3))?.disco).toBe(0)
    expect(quattro(dopo(0, 1, 0, 1, 0, 1, 0))?.caselle).toEqual([0, 7, 14, 21])
    // Diagonale che sale verso destra: 0 in (0,0), (1,1), (2,2), (3,3).
    const sale = dopo(0, 1, 1, 2, 2, 3, 2, 3, 3, 6, 3)
    expect(quattro(sale)?.disco).toBe(0)
    expect(quattro(sale)?.caselle).toEqual([casellaDi(0, 0), casellaDi(1, 1), casellaDi(2, 2), casellaDi(3, 3)])
    // Diagonale che scende: 1 in (3,0), (2,1), (1,2), (0,3).
    const scende = dopo(6, 3, 2, 2, 1, 6, 1, 1, 0, 0, 0, 0)
    expect(quattro(scende)?.disco).toBe(1)
    expect(esito(scende)).toEqual({ fine: 'forza4', vincitore: 1 })
  })

  it('le file vincenti una per una, dal capo alla coda, e insieme sono le caselle del quattro', () => {
    /** Una posizione scritta riga per riga, dal fondo. */
    const da = (...righe: string[]) => leggi(righe.join('').padEnd(CASELLE, '.'))!
    // Orizzontale e verticale, dal capo: una fila ciascuna.
    expect(file(dopo(0, 0, 1, 1, 2, 2, 3))).toEqual([[0, 1, 2, 3]])
    expect(file(dopo(0, 1, 0, 1, 0, 1, 0))).toEqual([[0, 7, 14, 21]])
    // Le due diagonali, dal fondo.
    const sale = dopo(0, 1, 1, 2, 2, 3, 2, 3, 3, 6, 3)
    expect(file(sale)).toEqual([[casellaDi(0, 0), casellaDi(1, 1), casellaDi(2, 2), casellaDi(3, 3)]])
    const scende = dopo(6, 3, 2, 2, 1, 6, 1, 1, 0, 0, 0, 0)
    expect(file(scende)).toEqual([[casellaDi(0, 3), casellaDi(1, 2), casellaDi(2, 1), casellaDi(3, 0)]])
    // Cinque in fila sono una fila sola, non due di quattro.
    const cinque = da('00000..', '11.11..')
    expect(file(cinque)).toEqual([[0, 1, 2, 3, 4]])
    // Due file chiuse dallo stesso disco, in fondo a sinistra e nella colonna 3: due file.
    const due = da('0000111', '1110...', '...0...', '...0...')
    expect(file(due)).toEqual([
      [0, 1, 2, 3],
      [3, 10, 17, 24],
    ])
    for (const p of [sale, scende, cinque, due]) {
      expect([...new Set(file(p).flat())].sort((a, b) => a - b)).toEqual(quattro(p)!.caselle)
    }
    // Senza quattro, nessuna fila.
    expect(file(dopo(0, 1, 2))).toEqual([])
  })

  it('dopo il quattro non si gioca più', () => {
    const vinta = dopo(0, 0, 1, 1, 2, 2, 3)
    expect(gioca(vinta, 5)).toBeNull()
  })

  it('con la griglia piena e senza quattro è patta', () => {
    const p = dopo(...GRIGLIA_PIENA)
    expect(quattro(p)).toBeNull()
    expect(esito(p)).toEqual({ fine: 'pieno', vincitore: null })
  })
})

describe('il computer di Forza 4', () => {
  it('prende una vittoria subito, a ogni livello', () => {
    // Il primo ha tre dischi in fila in basso, e il secondo non ha chiuso: il primo vince nel 3.
    const q = gioca(dopo(0, 6, 1, 6, 2), 5)!
    for (const livello of LIVELLI_FORZA4) expect(mossaDelComputer(q, livello, mulberry32(1))).toBe(3)
  })

  it('chiude la vittoria dell’altro al normale e al difficile', () => {
    // Il primo ha tre in fila in basso (0, 1, 2): il secondo deve chiudere il 3.
    const p = dopo(0, 6, 1, 6, 2)
    for (const livello of ['normale', 'difficile'] as const) {
      expect(mossaDelComputer(p, livello, mulberry32(2), { tempoMs: 300 })).toBe(3)
    }
  })

  it('gioca sempre una colonna libera, e null a griglia piena', () => {
    const caso = mulberry32(7)
    for (let partita = 0; partita < 20; partita += 1) {
      let p = posizioneIniziale()
      while (!esito(p)) {
        const c = mossaDelComputer(p, partita % 2 ? 'facile' : 'normale', caso)
        expect(c).not.toBeNull()
        expect(colonneLibere(p)).toContain(c)
        p = gioca(p, c!)!
      }
    }
    const piena = dopo(...GRIGLIA_PIENA)
    expect(mossaDelComputer(piena, 'difficile', mulberry32(1))).toBeNull()
  })

  it('i livelli sono in ordine: il difficile non perde contro il normale, il normale batte il facile', () => {
    const caso = mulberry32(11)
    const partita = (primo: 'facile' | 'normale' | 'difficile', secondo: 'facile' | 'normale' | 'difficile') => {
      let p = posizioneIniziale()
      while (!esito(p)) {
        const livello = p.tratto === 0 ? primo : secondo
        // Il difficile a profondita' fissa: a tempo, su una macchina carica, penserebbe meno del normale.
        p = gioca(p, mossaDelComputer(p, livello, caso, { profondita: 10 })!)!
      }
      return esito(p)!.vincitore
    }
    let vinteNormale = 0
    for (let i = 0; i < 6; i += 1) {
      if (partita('normale', 'facile') === 0) vinteNormale += 1
      if (partita('facile', 'normale') === 1) vinteNormale += 1
    }
    expect(vinteNormale).toBeGreaterThanOrEqual(9)
    for (let i = 0; i < 2; i += 1) {
      expect(partita('normale', 'difficile')).not.toBe(0)
      expect(partita('difficile', 'normale')).not.toBe(1)
    }
  }, 60_000)

  it('il facile risponde subito, il difficile entro il suo tempo', () => {
    const p = dopo(3, 3, 2, 4)
    let t = performance.now()
    mossaDelComputer(p, 'facile', mulberry32(3))
    expect(performance.now() - t).toBeLessThan(50)
    t = performance.now()
    mossaDelComputer(p, 'difficile', mulberry32(3))
    expect(performance.now() - t).toBeLessThan(2_500)
  }, 10_000)
})

import { describe, expect, it } from 'vitest'
import { mulberry32 } from '@shared/daily'
import { lessicoDa, type CategoriaNomi, type FileLessicoNomi } from '@shared/nomi-cose'
import { COMPUTER_NOMI, LIVELLI_NOMI, altrePossibili, nuovaPartita, risultato, scritteDalComputer } from '../libera'

const CATEGORIE: CategoriaNomi[] = ['nomi', 'citta', 'animali', 'colori', 'frutta']

const FILE: FileLessicoNomi = {
  versione: 'prova',
  lettera: 'a',
  categorie: {
    nomi: ['anna', 'andrea', 'alessia', 'alberto'],
    citta: ['ancona', 'asti', 'aosta', 'laquila'],
    animali: ['aquila', 'asino', 'alce'],
    colori: ['azzurro', 'arancione'],
    frutta: ['arancia', 'albicocca', 'ananas'],
  },
  note: {
    nomi: ['Anna', 'Andrea', 'Alessia'],
    citta: ['Ancona', 'Asti', 'Aosta'],
    animali: ['aquila', 'asino', 'alce'],
    colori: ['azzurro', 'arancione'],
    frutta: ['arancia', 'albicocca'],
  },
}
const LESSICO = lessicoDa(FILE)

describe('il computer della libera', () => {
  it('scrive parole note della categoria, e dice stop nel tempo del suo livello', () => {
    for (const livello of LIVELLI_NOMI) {
      for (let seme = 1; seme < 60; seme += 1) {
        const p = nuovaPartita(FILE, 'a', CATEGORIE, livello, mulberry32(seme))
        const [da, a] = COMPUTER_NOMI[livello].stop
        expect(p.stopMs).toBeGreaterThanOrEqual(da)
        expect(p.stopMs).toBeLessThanOrEqual(a)
        p.computer.forEach((r, i) => {
          if (r !== null) expect(FILE.note![CATEGORIE[i]]).toContain(r)
        })
        // Scrive prima dello stop, e l'ultima proprio allo stop.
        const scritte = p.tempi.filter((t) => Number.isFinite(t))
        if (scritte.length > 0) expect(Math.max(...scritte)).toBe(p.stopMs)
        expect(scritteDalComputer(p, p.stopMs)).toBe(scritte.length)
      }
    }
  })

  it('piu’ e’ difficile, piu’ scrive e prima finisce', () => {
    const media = (livello: (typeof LIVELLI_NOMI)[number]) => {
      let scritte = 0
      for (let seme = 1; seme <= 200; seme += 1) {
        scritte += nuovaPartita(FILE, 'a', CATEGORIE, livello, mulberry32(seme)).computer.filter(Boolean).length
      }
      return scritte / 200
    }
    expect(media('facile')).toBeLessThan(media('normale'))
    expect(media('normale')).toBeLessThan(media('difficile'))
    expect(COMPUTER_NOMI.difficile.stop[1]).toBeLessThan(COMPUTER_NOMI.facile.stop[0])
  })

  it('con un tempo piu’ corto il computer dice stop prima, in proporzione', () => {
    const tre = nuovaPartita(FILE, 'a', CATEGORIE, 'facile', mulberry32(5))
    const uno = nuovaPartita(FILE, 'a', CATEGORIE, 'facile', mulberry32(5), 60_000)
    expect(uno.tempoMs).toBe(60_000)
    expect(Math.abs(uno.stopMs - tre.stopMs / 3)).toBeLessThanOrEqual(1)
    expect(uno.stopMs).toBeLessThan(60_000)
  })

  it('senza parole note in una categoria, li’ non scrive', () => {
    const senza = { ...FILE, note: { nomi: ['Anna'] } }
    const p = nuovaPartita(senza, 'a', CATEGORIE, 'difficile', mulberry32(3))
    expect(p.computer.slice(1)).toEqual([null, null, null, null])
  })
})

describe('com’e’ finita', () => {
  const p = {
    lettera: 'a' as const,
    categorie: CATEGORIE,
    livello: 'normale' as const,
    computer: ['Anna', 'Ancona', null, 'azzurro', 'arancia'],
    tempi: [10_000, 20_000, Number.POSITIVE_INFINITY, 30_000, 90_000],
    stopMs: 90_000,
    tempoMs: 180_000,
  }

  it('si contano i punti come al tavolo', () => {
    const r = risultato(p, LESSICO, { nomi: 'anna', citta: 'Asti', animali: 'asino', colori: 'blu' }, 90_000)
    // Nomi uguali, citta' diverse, l'animale l'ho scritto solo io, il colore solo lui (il mio non vale).
    expect(r.punti[0]).toEqual([5, 10, 20, 0, 0])
    expect(r.punti[1]).toEqual([5, 10, 0, 20, 20])
    expect(r.totali).toEqual([35, 55])
    expect(r.esito).toBe('persa')
  })

  it('chi dice stop prima ferma anche l’altro: conta solo quel che il computer aveva gia’ scritto', () => {
    const r = risultato(p, LESSICO, { nomi: 'Andrea', frutta: 'albicocca' }, 25_000)
    expect(r.computer).toEqual(['Anna', 'Ancona', null, null, null])
    expect(r.punti[0]).toEqual([10, 0, 0, 0, 20])
    expect(r.esito).toBe('patta')
  })

  it('dopo, qualche parola che nessuno dei due ha scritto', () => {
    expect(altrePossibili(FILE, 'citta', ['ancona', null])).toEqual(['Asti', 'Aosta'])
  })
})

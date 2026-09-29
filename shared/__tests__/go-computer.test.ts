import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../daily'
import {
  PASSO,
  chiaveRipetizione,
  esito,
  gioca,
  legale,
  leggi,
  mosseLegali,
  nomePunto,
  posizioneIniziale,
  punteggio,
  puntoDa,
  type Colore,
  type Mossa,
  type Posizione,
} from '../go'
import { LIVELLI_GO, mossaDelComputer, simulazioniAlSecondo, stimaMorte, type LivelloGo } from '../go-computer'

/** Una posizione da un disegno: righe dall'alto, X il Nero, O il Bianco, un punto per il vuoto. */
function disegno(righe: string[], tratto: Colore = 'nero', passi = 0): Posizione {
  const punti = righe
    .map((r) => r.replace(/\s+/g, ''))
    .join('')
    .replace(/X/g, 'x')
    .replace(/O/g, 'o')
  const testo = `${righe.length}:${tratto === 'nero' ? 'n' : 'b'}:${punti}:k-:p${passi}:c0,0`
  const p = leggi(testo)
  if (!p) throw new Error(`Disegno non valido: ${testo}`)
  return p
}

const testo = (p: Posizione, m: Mossa) => (m.tipo === 'passo' ? 'passo' : nomePunto(m.punto, p.lato))
const nomi = (p: Posizione, punti: number[]) => punti.map((k) => nomePunto(k, p.lato))

/** Il punto e' un occhio di `c`, con la stessa regola del computer: vicini suoi, diagonali non dell'avversario. */
function occhioDi(p: Posizione, k: number, c: Colore): boolean {
  const { lato } = p
  const r = Math.floor(k / lato)
  const col = k % lato
  const dentro = (rr: number, cc: number) => rr >= 0 && cc >= 0 && rr < lato && cc < lato
  for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    if (dentro(r + dr, col + dc) && p.punti[(r + dr) * lato + col + dc] !== c) return false
  }
  let falsi = 0
  let bordo = 0
  for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
    if (!dentro(r + dr, col + dc)) bordo = 1
    else if (p.punti[(r + dr) * lato + col + dc] === (c === 'nero' ? 'bianco' : 'nero')) falsi += 1
  }
  return falsi + bordo < 2
}

/** Una partita fra due livelli, con un tetto di simulazioni al posto del tempo: deterministica. */
function partita(nero: LivelloGo, bianco: LivelloGo, simNero: number, simBianco: number, seme: number) {
  const caso = mulberry32(seme)
  let p = posizioneIniziale(9)
  const storia: string[] = []
  let ultima: number | null = null
  for (let mosse = 0; !esito(p, storia) && mosse < 250; mosse += 1) {
    const nera = p.tratto === 'nero'
    const m = mossaDelComputer(p, nera ? nero : bianco, caso, storia, {
      simulazioni: nera ? simNero : simBianco,
      ultima,
    })
    expect(legale(p, m)).toBe(true)
    storia.push(chiaveRipetizione(p))
    p = gioca(p, m)
    ultima = m.tipo === 'pietra' ? m.punto : null
  }
  if (esito(p, storia) !== 'passi') return null
  return punteggio(p, stimaMorte(p, mulberry32(seme + 1))).vincitore
}

describe('il computer del go', () => {
  it('prende un gruppo grande in atari', () => {
    // Le quattro pietre bianche in C6-F6 hanno un'ultima libertà, in G6.
    const p = disegno([
      '. . . . . . . . .',
      '. . . . . . . . .',
      '. . X X X X . . .',
      '. X O O O O . . .',
      '. . X X X X . . .',
      '. . . . . . . . .',
      '. . . O . . O . .',
      '. . . . . . . . .',
      '. . . . . . . . .',
    ])
    for (const livello of ['normale', 'difficile'] as const) {
      for (const seme of [1, 2, 3]) {
        expect(testo(p, mossaDelComputer(p, livello, mulberry32(seme), [], { simulazioni: 1500 }))).toBe('G6')
      }
    }
  })

  it('salva il proprio gruppo in atari, se allungandosi guadagna libertà', () => {
    // Le tre pietre nere in C6-E6 hanno una libertà sola, F6: allungandosi ne prendono tre.
    const p = disegno([
      '. . . . . . . . .',
      '. . . . . . . . .',
      '. . O O O . . . .',
      '. O X X X . . . .',
      '. . O O O . . . .',
      '. . . . . . . . .',
      '. . X . . . X . .',
      '. . . . . . . . .',
      '. . . . . . . . .',
    ])
    for (const livello of LIVELLI_GO) {
      for (const seme of [1, 2, 3]) {
        expect(testo(p, mossaDelComputer(p, livello, mulberry32(seme), [], { simulazioni: 1500 }))).toBe('F6')
      }
    }
  })

  it('non scappa dentro una scala che non si salva', () => {
    // La pietra bianca in E5 e' in atari: allungandosi in F5 avrebbe due libertà, e l'atari in
    // G5 la porterebbe a zig zag fino al bordo in alto a destra, dove non c'e' nessuno ad aiutarla.
    const p = disegno(
      [
        '. . . . . . . . .',
        '. . . . . . . . .',
        '. . . . . . . . .',
        '. . . . X . . . .',
        '. . . X O . . . .',
        '. . . . X X . . .',
        '. . . . . . . . .',
        '. . . . . . . . .',
        '. . . . . . . . .',
      ],
      'bianco',
    )
    for (const livello of ['normale', 'difficile'] as const) {
      for (const seme of [1, 2, 3]) {
        expect(testo(p, mossaDelComputer(p, livello, mulberry32(seme), [], { simulazioni: 2000 }))).not.toBe('F5')
      }
    }
  })

  it('non riempie i propri occhi: se non resta altro, passa', () => {
    // Al Nero restano solo i suoi tre occhi (A5, B3, A1): giocarci sarebbe legale, ma e' un suicidio lento.
    for (const passi of [0, 1]) {
      const p = disegno(['. X X O .', 'X X X O O', 'X . X O O', 'X X X O .', '. X X O O'], 'nero', passi)
      expect(mosseLegali(p).filter((m) => m.tipo === 'pietra')).toHaveLength(3)
      for (const livello of LIVELLI_GO) expect(mossaDelComputer(p, livello, mulberry32(4))).toEqual(PASSO)
    }
  })

  it('a partita finita, se l’avversario ha passato e chiudere vince, passa', () => {
    // Il Nero ha 45 punti, il Bianco 36 e il komi: 43,5. Il Bianco ha appena passato.
    const p = disegno(Array(9).fill('. . . . X O . . .'), 'nero', 1)
    for (const livello of LIVELLI_GO) {
      for (const seme of [1, 2]) {
        expect(mossaDelComputer(p, livello, mulberry32(seme), [], { simulazioni: 1500 })).toEqual(PASSO)
      }
    }
    // Anche se nessuno ha passato: non c'e' piu' niente da fare, e riempire il proprio territorio non serve.
    const q = disegno(Array(9).fill('. . . . X O . . .'))
    for (const livello of LIVELLI_GO) {
      for (const seme of [1, 2, 5]) {
        expect(mossaDelComputer(q, livello, mulberry32(seme), [], { simulazioni: 1500 })).toEqual(PASSO)
      }
    }
  })

  it('non passa in apertura, nemmeno quando le pietre sono di un colore solo', () => {
    // Con una pietra sola tutto il goban tocca un colore solo: non per questo e' un territorio.
    for (const lato of [9, 13]) {
      let p = posizioneIniziale(lato)
      for (let i = 0; i < 4; i += 1) {
        for (const livello of LIVELLI_GO) {
          expect(mossaDelComputer(p, livello, mulberry32(i + 1), [], { simulazioni: 300 })).not.toEqual(PASSO)
        }
        p = gioca(p, mossaDelComputer(p, 'normale', mulberry32(i), [], { simulazioni: 300 }))
      }
    }
  })

  it('non passa finché c’e’ un confine aperto, e lo chiude', () => {
    // Il muro nero in E ha un buco in E5: passando, il Bianco entrerebbe nel territorio nero.
    const righe = [...Array(4).fill('. . . . X O . . .'), '. . . . . O . . .', ...Array(4).fill('. . . . X O . . .')]
    for (const passi of [0, 1]) {
      const p = disegno(righe, 'nero', passi)
      for (const livello of LIVELLI_GO) {
        for (const seme of [1, 2]) {
          const m = mossaDelComputer(p, livello, mulberry32(seme), [], { simulazioni: 1500 })
          expect(m).not.toEqual(PASSO)
          if (livello !== 'facile') expect(testo(p, m)).toBe('E5')
        }
      }
    }
  })

  it('a parita’ di generatore e di simulazioni sceglie la stessa mossa', () => {
    const p = gioca(gioca(posizioneIniziale(9), { tipo: 'pietra', punto: puntoDa('E5', 9)! }), {
      tipo: 'pietra',
      punto: puntoDa('C3', 9)!,
    })
    for (const livello of LIVELLI_GO) {
      const a = mossaDelComputer(p, livello, mulberry32(9), [], { simulazioni: 400 })
      const b = mossaDelComputer(p, livello, mulberry32(9), [], { simulazioni: 400 })
      expect(a).toEqual(b)
    }
  })

  it('gioca sempre una mossa legale, e mai in un proprio occhio', () => {
    // Partite a caso su tutti i lati, e ogni tanto la mossa la sceglie il computer.
    const caso = mulberry32(21)
    for (const [lato, partite, ogni] of [
      [9, 4, 3],
      [13, 1, 6],
      [19, 1, 25],
    ] as const) {
      for (let n = 0; n < partite; n += 1) {
        let p = posizioneIniziale(lato)
        const storia: string[] = []
        for (let mossa = 0; !esito(p, storia) && mossa < lato * lato * 2; mossa += 1) {
          let m: Mossa
          if (mossa % ogni === ogni - 1) {
            const livello = LIVELLI_GO[(mossa + n) % 3]
            m = mossaDelComputer(p, livello, caso, storia, { simulazioni: lato === 9 ? 200 : 60 })
            expect(legale(p, m), `${lato}x${lato}, mossa ${mossa}: ${testo(p, m)}`).toBe(true)
            if (m.tipo === 'pietra') expect(occhioDi(p, m.punto, p.tratto)).toBe(false)
          } else {
            // Una mossa a caso che non riempie un proprio occhio, altrimenti il passo.
            const buone = mosseLegali(p).filter((x) => x.tipo === 'pietra' && !occhioDi(p, x.punto, p.tratto))
            m = buone.length > 0 && caso() < 0.97 ? buone[Math.floor(caso() * buone.length)] : PASSO
          }
          storia.push(chiaveRipetizione(p))
          p = gioca(p, m)
        }
      }
    }
  }, 120_000)

  it('i livelli sono in ordine: il normale batte il facile, il difficile non perde con il facile', () => {
    let vinteNormale = 0
    for (let i = 0; i < 6; i += 1) {
      const normaleNero = i % 2 === 0
      const vincitore = normaleNero
        ? partita('normale', 'facile', 1200, 300, 100 + i)
        : partita('facile', 'normale', 300, 1200, 100 + i)
      if (vincitore === (normaleNero ? 'nero' : 'bianco')) vinteNormale += 1
    }
    expect(vinteNormale).toBeGreaterThanOrEqual(4)
    expect(partita('difficile', 'facile', 3000, 300, 200)).toBe('nero')
    expect(partita('facile', 'difficile', 300, 3000, 201)).toBe('bianco')
  }, 120_000)

  it('il facile risponde subito sul 9x9', () => {
    // Il suo tetto e' di 140 ms: il margine e' per una macchina carica, come quella della CI con i
    // test in parallelo, non per il motore. Un motore che sforasse il tetto ci metterebbe secondi.
    const caso = mulberry32(8)
    let p = posizioneIniziale(9)
    for (let i = 0; i < 24; i += 1) {
      const t = performance.now()
      const m = mossaDelComputer(p, 'facile', caso)
      expect(performance.now() - t).toBeLessThan(600)
      p = gioca(p, m)
    }
  }, 30_000)

  it('misura le simulazioni al secondo', () => {
    // Non e' una soglia da rispettare, e' un numero da leggere: su un computer da tavolo sono
    // circa diecimila al secondo sul 9x9 e tremila sul 19x19, su un telefono la meta' o un terzo.
    const al9 = simulazioniAlSecondo(posizioneIniziale(9), mulberry32(1), 300)
    const al19 = simulazioniAlSecondo(posizioneIniziale(19), mulberry32(1), 300)
    expect(al9).toBeGreaterThan(al19)
    expect(al19).toBeGreaterThan(0)
  })
})

describe('la stima delle pietre morte', () => {
  it('un gruppo senza due occhi nel territorio dell’avversario e’ morto', () => {
    // La fine di una partita vera: il gruppo bianco a destra ha un solo occhio, di due punti (J5-J6).
    const p = disegno([
      'X X . X . X X X .',
      '. X X . X O O . X',
      'X . X X X O O O O',
      '. X X X X X O O .',
      'X X X . X . X O .',
      '. X X X X X X O O',
      'X . X X X . X O X',
      '. X . X . X X X X',
      'X . X . X X . X X',
    ])
    const morte = stimaMorte(p, mulberry32(1))
    expect(nomi(p, morte).sort()).toEqual(['F7', 'F8', 'G6', 'G7', 'G8', 'H3', 'H4', 'H5', 'H6', 'H7', 'J4', 'J7'])
    expect(punteggio(p, morte)).toMatchObject({ nero: 81, vincitore: 'nero' })
    // Due pietre bianche in mezzo al territorio nero.
    const q = disegno([
      '. . . . . . . . .',
      '. . . . . . . . .',
      '. . . . . . . . .',
      'O O O O O O O O O',
      'X X X X X X X X X',
      '. . . . . . . . .',
      '. . . . . . O . .',
      '. . . . . . O . .',
      '. . . . . . . . .',
    ])
    for (const seme of [1, 2, 3]) expect(nomi(q, stimaMorte(q, mulberry32(seme)))).toEqual(['G3', 'G2'])
  })

  it('un gruppo con due occhi e’ vivo, anche dentro l’area dell’avversario', () => {
    const p = disegno([
      '. X . X O . . . .',
      'X X X X O . . . .',
      'O O O O O . . . .',
      '. . . . . . . . .',
      '. . . . . . . . .',
      '. . . . . . . . .',
      '. . . . . . . . .',
      '. . . . . . . . .',
      '. . . . . . . . .',
    ])
    for (const seme of [1, 2, 3]) expect(stimaMorte(p, mulberry32(seme))).toEqual([])
  })

  it('un seki non si tocca', () => {
    // In basso a sinistra il gruppo nero C2-D2-E2-D1 e quello bianco da B1 a F1 hanno in
    // comune le due sole libertà, C1 ed E1: chi ci gioca per primo si mette in atari.
    const p = disegno([
      '. . . . . . . . .',
      '. . . . . . . . .',
      '. . . . . . . . .',
      'O O O O O O O O O',
      'X X X X X X X X X',
      'X X X X X X X . .',
      'X O O O O O X . .',
      'X O X X X O X . .',
      'X O . X . O X . .',
    ])
    for (const seme of [1, 2, 3, 4, 5]) expect(stimaMorte(p, mulberry32(seme))).toEqual([])
    const c = punteggio(p, [])
    expect(c.proprietario[puntoDa('C1', 9)!]).toBeNull()
    expect(c.vincitore).toBe('bianco')
  })

  it('e’ deterministica a parita’ di generatore, e veloce', () => {
    const p = disegno([
      'X X . X . X X X .',
      '. X X . X O O . X',
      'X . X X X O O O O',
      '. X X X X X O O .',
      'X X X . X . X O .',
      '. X X X X X X O O',
      'X . X X X . X O X',
      '. X . X . X X X X',
      'X . X . X X . X X',
    ])
    expect(stimaMorte(p, mulberry32(7))).toEqual(stimaMorte(p, mulberry32(7)))
    expect(stimaMorte(posizioneIniziale(9), mulberry32(1))).toEqual([])
    // Una posizione piena di un 19x19 a fine partita: pietre dappertutto, due passi.
    let q = posizioneIniziale(19)
    const caso = mulberry32(3)
    for (let i = 0; i < 260; i += 1) {
      const buone = mosseLegali(q).filter((m) => m.tipo === 'pietra' && !occhioDi(q, m.punto, q.tratto))
      q = gioca(q, buone.length > 0 ? buone[Math.floor(caso() * buone.length)] : PASSO)
    }
    // Sul computer da tavolo sono qualche decina di millisecondi: le soglie lasciano posto a una macchina carica.
    let t = performance.now()
    stimaMorte(q, mulberry32(1))
    expect(performance.now() - t).toBeLessThan(2_500)
    t = performance.now()
    stimaMorte(p, mulberry32(1))
    expect(performance.now() - t).toBeLessThan(1_000)
  }, 30_000)
})

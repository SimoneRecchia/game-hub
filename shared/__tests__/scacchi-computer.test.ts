import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../daily'
import {
  chiaveRipetizione,
  daFen,
  esito,
  gioca,
  mossaDaUci,
  mosseLegali,
  posizioneIniziale,
  uci,
  type Mossa,
  type Posizione,
} from '../scacchi'
import {
  DISPREZZO,
  LIVELLI_SCACCHI,
  analizza,
  mossaDelComputer,
  valutazione,
  type LivelloScacchi,
} from '../scacchi-computer'

function pos(fen: string): Posizione {
  const p = daFen(fen)
  if (!p) throw new Error(`FEN non valido: ${fen}`)
  return p
}

/** Una posizione di partita a caso: dall'inizio, un numero a caso di mosse a caso. */
function aCaso(caso: () => number): Posizione {
  for (;;) {
    let p = posizioneIniziale()
    const lunghezza = Math.floor(caso() * 90)
    for (let i = 0; i < lunghezza && !esito(p, []); i += 1) {
      const mosse = mosseLegali(p)
      p = gioca(p, mosse[Math.floor(caso() * mosse.length)])
    }
    if (!esito(p, [])) return p
  }
}

/** La stessa posizione vista dall'altra parte: colori scambiati, scacchiera capovolta. */
function specchio(p: Posizione): Posizione {
  const caselle = p.caselle.map((_, k) => {
    const pezzo = p.caselle[k ^ 56]
    return pezzo && { colore: pezzo.colore === 'w' ? ('b' as const) : ('w' as const), tipo: pezzo.tipo }
  })
  // Il corto del bianco diventa il corto del nero, e cosi' via.
  const dellAltro = (l: string) => (l === l.toUpperCase() ? l.toLowerCase() : l.toUpperCase())
  const arrocchi = [...'KQkq'].filter((l) => p.arrocchi.includes(dellAltro(l)))
  return {
    ...p,
    caselle,
    tratto: p.tratto === 'w' ? 'b' : 'w',
    arrocchi: arrocchi.join(''),
    enPassant: p.enPassant === null ? null : p.enPassant ^ 56,
  }
}

/** La mossa lascia la donna a un pezzo che vale meno, o senza difesa? */
function regalaLaDonna(p: Posizione, m: Mossa): boolean {
  const dopo = gioca(p, m)
  return mosseLegali(dopo).some((r) => {
    if (r.presa !== 'q') return false
    const chi = dopo.caselle[r.da]!.tipo
    if (chi !== 'q') return true
    // Una donna che prende la donna: e' uno scambio solo se l'altra puo' riprendere.
    return !mosseLegali(gioca(dopo, r)).some((x) => x.a === r.a)
  })
}

const LEGALE = (p: Posizione, m: Mossa | null) => {
  expect(m).not.toBeNull()
  expect(mosseLegali(p)).toContainEqual(m)
}

describe('i livelli', () => {
  it('sono tre, dal piu’ facile', () => {
    expect(LIVELLI_SCACCHI).toEqual(['facile', 'normale', 'difficile'])
  })
})

describe('i matti', () => {
  const inUno = [
    '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', // la traversa scoperta
    'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 4 4', // il barbiere
    '6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1', // il matto affogato
    'k7/2P5/1K6/8/8/8/8/8 w - - 0 1', // promuovendo
    '7k/5Q2/5K2/8/8/8/8/8 w - - 0 1', // la donna protetta dal re
    'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq g3 0 2', // il matto dello scemo, per il nero
    '6k1/5ppp/8/8/8/8/1B3PPP/3R2K1 w - - 0 1', // con l'alfiere che guarda
  ]
  for (const livello of ['normale', 'difficile'] as LivelloScacchi[]) {
    it(`il ${livello} trova il matto in uno, e se ne accorge`, () => {
      for (const fen of inUno) {
        const p = pos(fen)
        const m = mossaDelComputer(p, livello, mulberry32(1))!
        expect(esito(gioca(p, m), [])?.fine, fen).toBe('matto')
      }
      expect(analizza(pos(inUno[0]), { profondita: 4 }).matto).toBe(1)
    }, 30_000)
  }

  it('trova il matto in due di Morphy, che comincia con un sacrificio silenzioso', () => {
    // 1.Ta6!! e qualunque cosa faccia il nero, 2.b7#: nessuno scacco, nessuna presa alla prima mossa.
    const morphy = pos('kbK5/pp6/1P6/8/8/8/8/R7 w - - 0 1')
    for (const livello of ['normale', 'difficile'] as LivelloScacchi[]) {
      expect(uci(mossaDelComputer(morphy, livello, mulberry32(2))!), livello).toBe('a1a6')
    }
    const a = analizza(morphy, { profondita: 4, potature: false })
    expect(a.matto).toBe(2)
    // Dopo la risposta il matto e' subito, e sceglie quello.
    const dopoTa6 = gioca(morphy, mossaDaUci(morphy, 'a1a6')!)
    const dopo = gioca(dopoTa6, mossaDaUci(dopoTa6, 'b7a6')!)
    expect(uci(mossaDelComputer(dopo, 'normale', mulberry32(3))!)).toBe('b6b7')
  }, 30_000)

  it('chi prende il matto lo vede arrivare', () => {
    // Il nero puo' muovere il re in h7 o il pedone in a4, e dopo tutte e due arriva il matto.
    const a = analizza(pos('7k/5K2/8/p7/8/8/8/6Q1 b - - 0 1'), { profondita: 4 })
    expect(a.matto).toBe(-1)
  })
})

describe('il computer non regala niente', () => {
  const posizioni = [
    // La donna attaccata da un pedone: deve spostarsi.
    'rnbqkbnr/pppp1ppp/8/4p3/3Q4/8/PPP1PPPP/RNB1KBNR w KQkq - 0 3',
    // Il pedone d5 e' difeso dal pedone e6: prenderlo con la donna la perde.
    'rnbqkbnr/ppp2ppp/4p3/3p4/8/8/PPP1PPPP/RNBQKBNR w KQkq - 0 3',
    // La donna attaccata dal cavallo f6, con Dxf7+ che sembra uno scacco e perde la donna.
    'rnbqkb1r/pppp1ppp/5n2/4p2Q/4P3/8/PPPP1PPP/RNB1KBNR w KQkq - 2 3',
    // Dxf7+ senza l'alfiere in c4: il re riprende.
    'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5Q2/PPPP1PPP/RNB1KBNR w KQkq - 2 3',
  ]
  it('il normale non lascia la donna', () => {
    for (const fen of posizioni) {
      const p = pos(fen)
      for (let seme = 1; seme <= 3; seme += 1) {
        const m = mossaDelComputer(p, 'normale', mulberry32(seme))!
        expect(regalaLaDonna(p, m), `${fen}: ${uci(m)}`).toBe(false)
      }
    }
  }, 30_000)

  it('il normale prende un pezzo lasciato in presa', () => {
    // Il cavallo nero in e4 non e' difeso da niente.
    const p = pos('r1bqkb1r/pppp1ppp/2n5/4p3/4n3/2N2N2/PPPP1PPP/R1BQKB1R w KQkq - 0 4')
    expect(uci(mossaDelComputer(p, 'normale', mulberry32(4))!)).toBe('c3e4')
  })
})

describe('le mosse del computer', () => {
  it('sono sempre legali, a ogni livello, in posizioni a caso', () => {
    const caso = mulberry32(2026)
    for (let i = 0; i < 40; i += 1) {
      const p = aCaso(caso)
      LEGALE(p, mossaDelComputer(p, 'facile', mulberry32(i)))
      LEGALE(p, mossaDelComputer(p, 'normale', mulberry32(i)))
    }
    for (let i = 0; i < 3; i += 1) {
      const p = aCaso(caso)
      LEGALE(p, mossaDelComputer(p, 'difficile', mulberry32(i)))
    }
  }, 60_000)

  it('a partita finita non ce ne sono', () => {
    const matto = pos('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3')
    const stallo = pos('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')
    for (const livello of LIVELLI_SCACCHI) {
      expect(mossaDelComputer(matto, livello, mulberry32(1))).toBeNull()
      expect(mossaDelComputer(stallo, livello, mulberry32(1))).toBeNull()
    }
    expect(analizza(stallo).mossa).toBeNull()
  })

  it('con una mossa sola la gioca subito, anche il difficile', () => {
    // Il re bianco e' sotto scacco dalla donna in g2, e puo' solo prenderla.
    const p = pos('7k/8/8/8/8/8/6q1/7K w - - 0 1')
    const t = performance.now()
    expect(uci(mossaDelComputer(p, 'difficile', mulberry32(1))!)).toBe('h1g2')
    expect(performance.now() - t).toBeLessThan(50)
  })

  it('a parita’ di posizione e di generatore, il facile e il normale giocano la stessa mossa', () => {
    const caso = mulberry32(77)
    for (let i = 0; i < 8; i += 1) {
      const p = aCaso(caso)
      for (const livello of ['facile', 'normale'] as LivelloScacchi[]) {
        expect(mossaDelComputer(p, livello, mulberry32(i))).toEqual(mossaDelComputer(p, livello, mulberry32(i)))
      }
    }
  }, 30_000)

  it('con generatori diversi non gioca sempre la stessa apertura', () => {
    const p = posizioneIniziale()
    const prime = new Set(Array.from({ length: 12 }, (_, i) => uci(mossaDelComputer(p, 'normale', mulberry32(i))!)))
    expect(prime.size).toBeGreaterThan(1)
    const facili = new Set(Array.from({ length: 12 }, (_, i) => uci(mossaDelComputer(p, 'facile', mulberry32(i))!)))
    expect(facili.size).toBeGreaterThan(3)
  })
})

describe('le ripetizioni', () => {
  it('in grave svantaggio si salva con lo scacco perpetuo', () => {
    // Il nero ha la donna contro donna, torre e pedone: Dh4+, De1+, Dh4+...
    let p = pos('7k/QR6/8/8/4q3/8/6PK/8 b - - 0 1')
    const storia: string[] = []
    let fine = null
    for (let i = 0; i < 20 && !fine; i += 1) {
      const m = mossaDelComputer(p, 'normale', mulberry32(i), storia)!
      storia.push(chiaveRipetizione(p))
      p = gioca(p, m)
      fine = esito(p, storia)
    }
    expect(fine).toEqual({ fine: 'ripetizione', vincitore: null })
    // La patta vale per il computer un po' meno di niente: e' quel che si aspetta di prendere.
    expect(analizza(pos('7k/QR6/8/8/4q3/8/6PK/8 b - - 0 1'), { profondita: 4, potature: false }).punteggio).toBe(
      -DISPREZZO,
    )
  }, 30_000)

  it('in vantaggio non completa una ripetizione; in svantaggio la completa', () => {
    const vinta = pos('8/8/8/4k3/8/8/8/KQ6 w - - 10 40')
    const persa = pos('8/8/8/4k3/8/8/8/KQ6 b - - 10 40')
    // Una posizione qualsiasi, fra una ripetizione e l'altra.
    const altra = chiaveRipetizione(pos('8/8/8/8/3k4/8/8/KQ6 b - - 9 39'))
    for (const livello of LIVELLI_SCACCHI) {
      // Due volte gia' vista la posizione dopo la mossa preferita: la terza sarebbe patta.
      const preferita = mossaDelComputer(vinta, livello, mulberry32(1))!
      const vista = chiaveRipetizione(gioca(vinta, preferita))
      const storia = [vista, altra, vista, altra]
      const scelta = mossaDelComputer(vinta, livello, mulberry32(1), storia)!
      expect(uci(scelta), livello).not.toBe(uci(preferita))
      expect(esito(gioca(vinta, scelta), storia), livello).toBeNull()

      // Il re nero in d5 c'e' gia' stato due volte: andarci e' la patta, e chi perde la prende.
      const salvezza = chiaveRipetizione(pos('8/8/8/3k4/8/8/8/KQ6 w - - 11 41'))
      const storiaPersa = [salvezza, altra, salvezza, altra]
      const difesa = mossaDelComputer(persa, livello, mulberry32(1), storiaPersa)!
      expect(esito(gioca(persa, difesa), storiaPersa), livello).toEqual({ fine: 'ripetizione', vincitore: null })
    }
  }, 30_000)
})

describe('la forza e i tempi', () => {
  it('la valutazione e’ la stessa vista dall’una e dall’altra parte', () => {
    const caso = mulberry32(5)
    for (let i = 0; i < 50; i += 1) {
      const p = aCaso(caso)
      expect(valutazione(specchio(p))).toBe(valutazione(p))
    }
    expect(valutazione(posizioneIniziale())).toBe(0)
  })

  it('il facile risponde in pochi millisecondi', () => {
    const posizioni = [
      posizioneIniziale(),
      pos('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1'),
      pos('r1bq1rk1/pp2bppp/2n1pn2/2pp4/3P1B2/2PBPN2/PP1N1PPP/R2QK2R w KQ - 0 8'),
      pos('2bk1b1r/1r1q4/2nP4/pp3pp1/PPR1p2p/BN1BpPP1/2K3P1/1NQ2R2 w - - 6 35'),
    ]
    mossaDelComputer(posizioni[0], 'facile', mulberry32(0))
    for (const p of posizioni) {
      const t = performance.now()
      mossaDelComputer(p, 'facile', mulberry32(1))
      expect(performance.now() - t).toBeLessThan(40)
    }
  })

  it('il normale batte il facile', () => {
    let punti = 0
    for (let g = 0; g < 4; g += 1) {
      const caso = mulberry32(300 + g)
      const normale = g % 2 === 0 ? 'w' : 'b'
      let p = posizioneIniziale()
      const storia: string[] = []
      let fine = esito(p, storia)
      for (let ply = 0; ply < 300 && !fine; ply += 1) {
        const m = mossaDelComputer(p, p.tratto === normale ? 'normale' : 'facile', caso, storia)!
        storia.push(chiaveRipetizione(p))
        p = gioca(p, m)
        fine = esito(p, storia)
      }
      punti += !fine || fine.vincitore === null ? 0.5 : fine.vincitore === normale ? 1 : 0
    }
    expect(punti).toBeGreaterThanOrEqual(3.5)
  }, 60_000)

  it('il difficile pensa al massimo un secondo e mezzo, e va piu’ a fondo del normale', () => {
    const p = pos('r1bq1rk1/pp2bppp/2n1pn2/2pp4/3P1B2/2PBPN2/PP1N1PPP/R2QK2R w KQ - 0 8')
    const t = performance.now()
    LEGALE(p, mossaDelComputer(p, 'difficile', mulberry32(1)))
    expect(performance.now() - t).toBeLessThan(2000)
    const a = analizza(p, { tempoMs: 1500, nodi: 3_000_000 })
    expect(a.profondita).toBeGreaterThan(4)
  }, 30_000)
})

import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../daily'
import {
  FEN_INIZIALE,
  MOSSE_MASSIME,
  Scacchiera,
  casellaDa,
  chiaveRipetizione,
  daFen,
  esito,
  gioca,
  inFen,
  mossaDaUci,
  mosseLegali,
  nomeCasella,
  notazione,
  posizioneIniziale,
  sottoScacco,
  uci,
  type Posizione,
} from '../scacchi'

function pos(fen: string): Posizione {
  const p = daFen(fen)
  if (!p) throw new Error(`FEN non valido: ${fen}`)
  return p
}

/** Gioca le mosse, scritte come i programmi, e tiene la notazione e le chiavi delle posizioni lasciate. */
function partita(mosse: string, da: Posizione = posizioneIniziale()) {
  let p = da
  const chiavi: string[] = []
  const san: string[] = []
  for (const testo of mosse.split(' ').filter(Boolean)) {
    const m = mossaDaUci(p, testo)
    if (!m) throw new Error(`Mossa non legale: ${testo} in ${inFen(p)}`)
    san.push(notazione(p, m))
    chiavi.push(chiaveRipetizione(p))
    p = gioca(p, m)
  }
  return { p, chiavi, san }
}

const mosseUci = (p: Posizione) => mosseLegali(p).map(uci).sort()

/** Il perft con l'interfaccia pubblica, che e' quella del server: mosse legali, e `gioca` per scendere. */
function perft(p: Posizione, profondita: number): number {
  const mosse = mosseLegali(p)
  if (profondita === 1) return mosse.length
  let n = 0
  for (const m of mosse) n += perft(gioca(p, m), profondita - 1)
  return n
}

/** Lo stesso sulla scacchiera interna, che e' quella del computer: si puo' andare piu' a fondo. */
function perftInterno(s: Scacchiera, profondita: number, buf: Int32Array, inizio: number): number {
  const fine = s.genera(buf, inizio, false)
  const scacco = s.sottoScacco()
  let n = 0
  for (let i = inizio; i < fine; i += 1) {
    if (!s.legale(buf[i], scacco)) continue
    if (profondita === 1) n += 1
    else {
      s.fai(buf[i])
      n += perftInterno(s, profondita - 1, buf, fine)
      s.disfai()
    }
  }
  return n
}

const KIWIPETE = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1'

describe('le caselle', () => {
  it('si chiamano come sulla scacchiera: a1 e’ la zero, h8 la sessantatré', () => {
    expect([0, 7, 28, 56, 63].map(nomeCasella)).toEqual(['a1', 'h1', 'e4', 'a8', 'h8'])
    for (let k = 0; k < 64; k += 1) expect(casellaDa(nomeCasella(k))).toBe(k)
    for (const sbagliata of ['i1', 'a9', 'a0', 'e', 'e44', '', 'E4']) expect(casellaDa(sbagliata)).toBeNull()
    expect(() => nomeCasella(64)).toThrow()
  })
})

describe('il perft', () => {
  const casi: [string, string, number[]][] = [
    ['la posizione iniziale', FEN_INIZIALE, [20, 400, 8902, 197281]],
    ['Kiwipete', KIWIPETE, [48, 2039, 97862]],
    ['la posizione 3', '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238]],
    ['la posizione 4', 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467]],
    ['la posizione 4 capovolta', 'r2q1rk1/pP1p2pp/Q4n2/bbp1p3/Np6/1B3NBn/pPPP1PPP/R3K2R b KQ - 0 1', [6, 264, 9467]],
    ['la posizione 5', 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379]],
  ]
  for (const [nome, fen, attesi] of casi) {
    it(`${nome}: ${attesi.join(', ')}`, () => {
      const p = pos(fen)
      attesi.forEach((n, i) => expect(perft(p, i + 1), `profondita' ${i + 1}`).toBe(n))
    }, 60_000)
  }

  it('sulla scacchiera interna, piu’ a fondo e con le posizioni dei casi limite', () => {
    // Le posizioni di Martin Sedlak: ognuna mette alla prova una regola sola.
    const casi: [string, number, number][] = [
      [KIWIPETE, 4, 4085603],
      ['8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', 5, 674624],
      ['rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', 4, 2103487],
      // Un en passant che scoprirebbe il re, e uno che da' scacco.
      ['3k4/3p4/8/K1P4r/8/8/8/8 b - - 0 1', 6, 1134888],
      ['8/8/1k6/2b5/2pP4/8/5K2/8 b - d3 0 1', 6, 1440467],
      // Arrocchi che danno scacco, diritti che si perdono, arrocchi impediti.
      ['5k2/8/8/8/8/8/8/4K2R w K - 0 1', 6, 661072],
      ['3k4/8/8/8/8/8/8/R3K3 w Q - 0 1', 6, 803711],
      ['r3k2r/1b4bq/8/8/8/8/7B/R3K2R w KQkq - 0 1', 4, 1274206],
      ['r3k2r/8/3Q4/8/8/5q2/8/R3K2R b KQkq - 0 1', 4, 1720476],
      // Promozioni per uscire dallo scacco o per darlo, scacchi di scoperta, stalli.
      ['2K2r2/4P3/8/8/8/8/8/3k4 w - - 0 1', 6, 3821001],
      ['8/8/1P2K3/8/2n5/1q6/8/5k2 b - - 0 1', 5, 1004658],
      ['8/P1k5/K7/8/8/8/8/8 w - - 0 1', 6, 92683],
      ['K1k5/8/P7/8/8/8/8/8 w - - 0 1', 6, 2217],
      ['8/k1P5/8/1K6/8/8/8/8 w - - 0 1', 7, 567584],
      ['8/8/2k5/5q2/5n2/8/5K2/8 b - - 0 1', 4, 23527],
    ]
    const buf = new Int32Array(64 * MOSSE_MASSIME)
    for (const [fen, profondita, atteso] of casi) {
      expect(perftInterno(Scacchiera.da(pos(fen), 16), profondita, buf, 0), fen).toBe(atteso)
    }
  }, 60_000)
})

describe('la scacchiera interna', () => {
  it('disfa tutto quel che fa, e l’impronta tenuta a mano e’ quella calcolata da capo', () => {
    const caso = mulberry32(8)
    const buf = new Int32Array(MOSSE_MASSIME)
    for (let partite = 0; partite < 30; partite += 1) {
      const s = Scacchiera.da(posizioneIniziale(), 300)
      const inizio = inFen(s.inPosizione())
      const impronte: [number, number][] = []
      for (let i = 0; i < 200; i += 1) {
        const n = s.genera(buf, 0, false)
        const scacco = s.sottoScacco()
        const legali = Array.from(buf.subarray(0, n)).filter((m) => s.legale(m, scacco))
        if (legali.length === 0 || s.materialeInsufficiente()) break
        impronte.push([s.lo, s.hi])
        s.fai(legali[Math.floor(caso() * legali.length)])
        const { lo, hi } = s
        s.ricalcolaImpronta()
        expect([s.lo, s.hi]).toEqual([lo, hi])
      }
      while (s.ply > 0) {
        s.disfai()
        expect([s.lo, s.hi]).toEqual(impronte[s.ply])
      }
      expect(inFen(s.inPosizione())).toBe(inizio)
    }
  })
})

describe('il FEN', () => {
  it('va e torna uguale', () => {
    const fen = [
      FEN_INIZIALE,
      KIWIPETE,
      '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1',
      'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8',
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
      'rnbqkb1r/ppp1pppp/5n2/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3',
      '8/8/8/8/8/k7/8/K7 b - - 49 120',
    ]
    for (const f of fen) expect(inFen(pos(f))).toBe(f)
    expect(inFen(posizioneIniziale())).toBe(FEN_INIZIALE)
  })

  it('dopo una spinta di due scrive la casella en passant, anche se nessuno puo’ prendere', () => {
    expect(inFen(partita('e2e4').p)).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1')
    expect(inFen(partita('e2e4 e7e5 g1f3').p)).toBe('rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2')
  })

  it('accetta anche i soli primi quattro campi, e gli spazi in piu’', () => {
    expect(inFen(pos('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -'))).toBe(FEN_INIZIALE)
    expect(inFen(pos(`  ${FEN_INIZIALE.replaceAll(' ', '   ')} `))).toBe(FEN_INIZIALE)
  })

  it('rifiuta quelli che non descrivono una posizione possibile', () => {
    const sbagliati = [
      '',
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP w KQkq - 0 1', // sette traverse
      'rnbqkbnr/pppppppp/8/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', // nove
      'rnbqkbnr/ppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', // una traversa di sette caselle
      'rnbqkbnr/pppppppp/9/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', // un nove
      'rnbqkbnr/pppppppp/44/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', // due cifre di fila
      'rnbqkbnr/ppppxppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', // un pezzo che non c'e'
      'rnbqqbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQ - 0 1', // senza il re nero
      'rnbkkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQ - 0 1', // due re neri
      '4k3/8/8/8/8/P7/PPPPPPPP/4K3 w - - 0 1', // nove pedoni
      'Pnbqkbnr/pppppppp/8/8/8/8/1PPPPPPP/RNBQKBNR w KQk - 0 1', // un pedone sull'ottava
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR x KQkq - 0 1', // il tratto
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w QK - 0 1', // gli arrocchi fuori ordine
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkqK - 0 1',
      '4k3/8/8/8/8/8/8/4K3 w K - 0 1', // l'arrocco senza la torre
      'r3k2r/8/8/8/8/8/8/R2K3R w KQkq - 0 1', // l'arrocco con il re fuori posto
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq e6 0 1', // en passant senza il pedone
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e4 0 1', // en passant sulla traversa sbagliata
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 -1 1', // semimosse negative
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 0', // la mossa zero
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0', // cinque campi
      '4r1k1/8/8/8/8/8/8/4K3 b - - 0 1', // il re bianco sotto scacco con il tratto al nero
    ]
    for (const fen of sbagliati) expect(daFen(fen), fen).toBeNull()
  })
})

describe('le mosse', () => {
  it('all’inizio sono venti, e si scrivono come i programmi', () => {
    const p = posizioneIniziale()
    expect(mosseLegali(p)).toHaveLength(20)
    expect(mosseUci(p)).toContain('e2e4')
    expect(mosseUci(p)).toContain('g1f3')
  })

  it('da un testo si ritrova la mossa legale, o niente', () => {
    const p = posizioneIniziale()
    expect(mossaDaUci(p, 'e2e4')).toEqual({ da: 12, a: 28 })
    expect(mossaDaUci(p, 'e2e5')).toBeNull()
    expect(mossaDaUci(p, 'e7e5')).toBeNull()
    expect(mossaDaUci(p, 'e2e4q')).toBeNull()
    expect(mossaDaUci(p, 'E2E4')).toBeNull()
    expect(mossaDaUci(p, 'e1g1')).toBeNull()
    // Una promozione senza il pezzo non e' una mossa: bisogna dire quale.
    const promozione = pos('8/P7/8/8/8/7k/8/K7 w - - 0 1')
    expect(mossaDaUci(promozione, 'a7a8')).toBeNull()
    expect(mossaDaUci(promozione, 'a7a8n')).toEqual({ da: 48, a: 56, promozione: 'n' })
  })

  it('due mosse uguali sono uguali, e dicono cosa succede', () => {
    // Il bianco puo' prendere en passant in d6, prendere il cavallo in c6 e arroccare.
    const { p } = partita('e2e4 b8c6 e4e5 g8h6 g1f3 h6g8 f1b5 d7d5')
    const legali = mosseLegali(p)
    for (const m of legali) expect(mossaDaUci(p, uci(m))).toEqual(m)
    expect(legali).toContainEqual({ da: 36, a: 43, presa: 'p', enPassant: true })
    expect(legali).toContainEqual({ da: 33, a: 42, presa: 'n' })
    expect(legali).toContainEqual({ da: 4, a: 6, arrocco: 'corto' })
    expect(mosseLegali(p)).toEqual(legali)
  })

  it('giocare non tocca la posizione di prima', () => {
    const p = pos(KIWIPETE)
    const prima = JSON.stringify(p)
    for (const m of mosseLegali(p)) gioca(p, m)
    expect(JSON.stringify(p)).toBe(prima)
  })

  it('una mossa illegale non si gioca', () => {
    const p = posizioneIniziale()
    expect(() => gioca(p, { da: 12, a: 36 })).toThrow()
    expect(() => gioca(p, { da: 52, a: 36 })).toThrow()
    expect(() => notazione(p, { da: 4, a: 6 })).toThrow()
  })

  it('i contatori: le semimosse si azzerano con le prese e i pedoni, la mossa cresce dopo il nero', () => {
    const { p } = partita('g1f3 g8f6 f3g1')
    expect(p.semimosse).toBe(3)
    expect(p.mossa).toBe(2)
    expect(partita('g1f3 g8f6 e2e4').p.semimosse).toBe(0)
    expect(partita('e2e4 d7d5 e4d5').p.semimosse).toBe(0)
  })
})

describe('i casi limite', () => {
  it('l’en passant si puo’ solo subito dopo la spinta di due', () => {
    const { p } = partita('e2e4 g8f6 e4e5 d7d5')
    expect(mosseUci(p)).toContain('e5d6')
    const dopo = gioca(p, mossaDaUci(p, 'e5d6')!)
    expect(dopo.caselle[35]).toBeNull()
    expect(dopo.caselle[43]).toEqual({ colore: 'w', tipo: 'p' })
    // Una mossa a testa, e non si puo' piu'.
    expect(mosseUci(partita('b1c3 b8c6', p).p)).not.toContain('e5d6')
  })

  it('l’en passant non si puo’ se lascia il re a una torre sulla stessa traversa', () => {
    // Presi in b5 e c5 i due pedoni se ne vanno insieme, e la torre h5 vede il re a5.
    const inchiodata = pos('8/8/8/KPp4r/8/8/8/7k w - c6 0 1')
    expect(mosseUci(inchiodata)).not.toContain('b5c6')
    expect(mosseUci(pos('8/8/8/KPp5/8/8/8/7k w - c6 0 1'))).toContain('b5c6')
  })

  it('l’arrocco: corto e lungo, e dove non si puo’', () => {
    const libero = pos('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1')
    expect(mosseUci(libero)).toEqual(expect.arrayContaining(['e1g1', 'e1c1']))
    const arroccato = gioca(libero, mossaDaUci(libero, 'e1c1')!)
    expect(arroccato.caselle[2]).toEqual({ colore: 'w', tipo: 'k' })
    expect(arroccato.caselle[3]).toEqual({ colore: 'w', tipo: 'r' })
    expect(arroccato.caselle[0]).toBeNull()
    expect(arroccato.arrocchi).toBe('kq')

    const arrocchi = (fen: string) => mosseUci(pos(fen)).filter((m) => m === 'e1g1' || m === 'e1c1')
    // Sotto scacco no.
    expect(arrocchi('r3k2r/8/8/8/4r3/8/8/R3K2R w KQkq - 0 1')).toEqual([])
    // Non attraverso una casella attaccata (f1, dall'alfiere in g2), ne' per arrivarci (g1, dalla torre in g8).
    expect(arrocchi('r3k2r/8/8/8/8/8/6b1/R3K2R w KQkq - 0 1')).toEqual(['e1c1'])
    expect(arrocchi('r3k1r1/8/8/8/8/8/8/R3K2R w KQq - 0 1')).toEqual(['e1c1'])
    // Nel lungo la torre passa da b1: che sia attaccata non conta.
    expect(arrocchi('1r2k2r/8/8/8/8/8/8/R3K2R w KQk - 0 1')).toEqual(['e1c1', 'e1g1'])
    // Con un pezzo in mezzo no.
    expect(arrocchi('r3k2r/8/8/8/8/8/8/RN2K1NR w KQkq - 0 1')).toEqual([])
  })

  it('l’arrocco si perde muovendo il re o la torre, e quando la torre viene presa sulla sua casella', () => {
    expect(partita('e1f1 a8b8 f1e1', pos('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1')).p.arrocchi).toBe('k')
    // L'alfiere prende la torre h1: il bianco perde l'arrocco corto, e il lungo gli resta.
    const presa = partita('g2h1', pos('r3k2r/8/8/8/8/8/6b1/R3K2R b KQkq - 0 1')).p
    expect(presa.arrocchi).toBe('Qkq')
    expect(mosseUci(presa)).not.toContain('e1g1')
    expect(mosseUci(presa)).toContain('e1c1')
  })

  it('la promozione, in tutti e quattro i pezzi', () => {
    const p = pos('8/P7/8/8/8/7k/8/K7 w - - 0 1')
    expect(mosseUci(p).filter((m) => m.startsWith('a7'))).toEqual(['a7a8b', 'a7a8n', 'a7a8q', 'a7a8r'])
    for (const [lettera, italiana] of [['q', 'D'], ['r', 'T'], ['b', 'A'], ['n', 'C']] as const) {
      const m = mossaDaUci(p, `a7a8${lettera}`)!
      expect(gioca(p, m).caselle[56]).toEqual({ colore: 'w', tipo: lettera })
      expect(notazione(p, m)).toBe(`a8=${italiana}`)
    }
    // Promuovere prendendo, e dando scacco.
    const presa = pos('1r5k/P7/8/8/8/8/8/K7 w - - 0 1')
    expect(partita('a7b8q', presa).san).toEqual(['axb8=D+'])
    expect(partita('a7b8n', presa).san).toEqual(['axb8=C'])
  })
})

describe('la notazione', () => {
  it('pedoni, pezzi, prese, arrocchi ed en passant', () => {
    expect(partita('e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5c6 d7c6 e1g1').san).toEqual([
      'e4',
      'e5',
      'Cf3',
      'Cc6',
      'Ab5',
      'a6',
      'Axc6',
      'dxc6',
      'O-O',
    ])
    expect(partita('e2e4 g8f6 e4e5 d7d5 e5d6').san.at(-1)).toBe('exd6')
    expect(partita('e1c1', pos('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1')).san).toEqual(['O-O-O'])
    expect(partita('e1g1', pos('5k2/8/8/8/8/8/8/4K2R w K - 0 1')).san).toEqual(['O-O+'])
  })

  it('se due pezzi uguali arrivano sulla stessa casella: la colonna, poi la traversa, poi tutte e due', () => {
    const cavalli = pos('4k3/8/8/8/8/8/8/1N2KN2 w - - 0 1')
    expect(partita('b1d2', cavalli).san).toEqual(['Cbd2'])
    expect(partita('f1d2', cavalli).san).toEqual(['Cfd2'])
    const torri = pos('4k3/8/8/R7/8/8/8/R3K3 w - - 0 1')
    expect(partita('a1a3', torri).san).toEqual(['T1a3'])
    expect(partita('a5a3', torri).san).toEqual(['T5a3'])
    const donne = pos('8/8/k7/8/4Q2Q/8/8/K6Q w - - 0 1')
    expect(partita('h4e1', donne).san).toEqual(['Dh4e1'])
    expect(partita('e4e1', donne).san).toEqual(['Dee1'])
    expect(partita('h1e1', donne).san).toEqual(['D1e1'])
    expect(partita('a1d1', pos('3k4/8/8/8/8/8/6K1/R4R2 w - - 0 1')).san).toEqual(['Tad1+'])
  })

  it('un pezzo inchiodato non rende ambigua la mossa dell’altro', () => {
    // Il cavallo d2 e' inchiodato dall'alfiere b4: in f3 ci va solo quello di g1.
    expect(partita('g1f3', pos('4k3/8/8/8/1b6/8/3N4/4K1N1 w - - 0 1')).san).toEqual(['Cf3'])
    expect(partita('g1f3', pos('4k3/8/8/8/8/8/3N4/4K1N1 w - - 0 1')).san).toEqual(['Cgf3'])
  })
})

describe('la fine della partita', () => {
  it('il matto del barbiere', () => {
    const { p, san, chiavi } = partita('e2e4 e7e5 f1c4 b8c6 d1h5 g8f6 h5f7')
    expect(san).toEqual(['e4', 'e5', 'Ac4', 'Cc6', 'Dh5', 'Cf6', 'Dxf7#'])
    expect(sottoScacco(p)).toBe(true)
    expect(mosseLegali(p)).toEqual([])
    expect(esito(p, chiavi)).toEqual({ fine: 'matto', vincitore: 'w' })
    // Il matto del matto: il nero vince in due mosse.
    const scemo = partita('f2f3 e7e5 g2g4 d8h4')
    expect(scemo.san.at(-1)).toBe('Dh4#')
    expect(esito(scemo.p, scemo.chiavi)).toEqual({ fine: 'matto', vincitore: 'b' })
  })

  it('lo stallo', () => {
    const { p, san } = partita('f2f7', pos('7k/8/6K1/8/8/8/5Q2/8 w - - 0 1'))
    expect(san).toEqual(['Df7'])
    expect(sottoScacco(p)).toBe(false)
    expect(esito(p, [])).toEqual({ fine: 'stallo', vincitore: null })
  })

  it('la triplice ripetizione, anche con i cavalli che vanno e tornano', () => {
    const avanti = 'g1f3 g8f6 f3g1 f6g8 g1f3 g8f6 f3g1'
    const quasi = partita(avanti)
    expect(esito(quasi.p, quasi.chiavi)).toBeNull()
    const tre = partita(`${avanti} f6g8`)
    expect(esito(tre.p, tre.chiavi)).toEqual({ fine: 'ripetizione', vincitore: null })
    // Senza le chiavi di prima non c'e' ripetizione da contare.
    expect(esito(tre.p, [])).toBeNull()
  })

  it('una posizione dopo una spinta di due si ripete, se l’en passant non si puo’ fare', () => {
    // Dopo 1.e4 e5 il FEN ha e6, ma nessun pedone bianco puo' prendere: e' la stessa posizione di dopo 3...Cb8.
    const { p, chiavi } = partita('e2e4 e7e5 g1f3 b8c6 f3g1 c6b8 g1f3 b8c6 f3g1 c6b8')
    expect(inFen(partita('e2e4 e7e5').p)).toContain(' e6 ')
    expect(esito(p, chiavi)).toEqual({ fine: 'ripetizione', vincitore: null })
  })

  it('la chiave di ripetizione ha la casella en passant solo se la presa e’ legale', () => {
    expect(chiaveRipetizione(partita('e2e4').p)).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -')
    expect(chiaveRipetizione(partita('e2e4 g8f6 e4e5 d7d5').p)).toBe(
      'rnbqkb1r/ppp1pppp/5n2/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6',
    )
    expect(chiaveRipetizione(pos('8/8/8/KPp4r/8/8/8/7k w - c6 0 1'))).toBe('8/8/8/KPp4r/8/8/8/7k w - -')
    expect(chiaveRipetizione(pos('8/8/8/KPp5/8/8/8/7k w - c6 0 1'))).toBe('8/8/8/KPp5/8/8/8/7k w - c6')
    // I contatori non contano, gli arrocchi si'.
    const conContatori = chiaveRipetizione(pos('8/8/8/8/8/k7/8/K7 b - - 49 120'))
    expect(conContatori).toBe(chiaveRipetizione(pos('8/8/8/8/8/k7/8/K7 b - - 0 1')))
    expect(chiaveRipetizione(pos('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'))).not.toBe(
      chiaveRipetizione(pos('r3k2r/8/8/8/8/8/8/R3K2R w Kkq - 0 1')),
    )
  })

  it('le cinquanta mosse, ma se l’ultima da’ matto vale il matto', () => {
    const p = pos('7k/8/6K1/8/8/8/1n6/Q7 w - - 99 80')
    expect(esito(p, [])).toBeNull()
    expect(esito(partita('a1a2', p).p, [])).toEqual({ fine: 'cinquanta', vincitore: null })
    expect(esito(partita('a1a8', p).p, [])).toEqual({ fine: 'matto', vincitore: 'w' })
    // Una presa azzera il conto.
    expect(esito(partita('a1b2', p).p, [])).toBeNull()
  })

  it('il materiale insufficiente: re contro re, un pezzo minore, alfieri tutti dello stesso colore', () => {
    const fine = (fen: string) => esito(pos(fen), [])?.fine ?? null
    expect(fine('8/8/4k3/8/8/4K3/8/8 w - - 0 1')).toBe('materiale')
    expect(fine('8/8/4k3/8/8/4K3/8/5B2 w - - 0 1')).toBe('materiale')
    expect(fine('8/8/4k3/8/8/4K3/8/6N1 b - - 0 1')).toBe('materiale')
    // Alfieri sulle case chiare (c8 e f1), anche due dalla stessa parte.
    expect(fine('2b5/8/4k3/8/8/4K3/8/5B2 w - - 0 1')).toBe('materiale')
    expect(fine('8/8/4k3/8/8/3BK3/8/5B2 w - - 0 1')).toBe('materiale')
    // Si puo' ancora dare matto, anche solo con l'aiuto dell'altro: si continua.
    expect(fine('5b2/8/4k3/8/8/4K3/8/5B2 w - - 0 1')).toBeNull()
    expect(fine('8/8/4k3/8/8/4K3/8/5NN1 w - - 0 1')).toBeNull()
    expect(fine('6n1/8/4k3/8/8/4K3/8/6N1 w - - 0 1')).toBeNull()
    expect(fine('8/8/4k3/8/8/4K3/4P3/8 w - - 0 1')).toBeNull()
    expect(fine('8/8/4k3/8/8/4K3/8/5BN1 w - - 0 1')).toBeNull()
    expect(fine('8/8/4k3/8/8/4K3/8/7R w - - 0 1')).toBeNull()
    // Il re prende l'ultima torre: restano i due re.
    const { p } = partita('e1e2', pos('8/8/8/8/8/2k5/4r3/4K3 w - - 0 1'))
    expect(esito(p, [])).toEqual({ fine: 'materiale', vincitore: null })
  })
})

describe('i tempi del server', () => {
  it('leggere il FEN, trovare la mossa, giocarla e guardare se e’ finita sta ben sotto il millisecondo', () => {
    // Una partita vera, a meta': quello che il server fa a ogni mossa.
    const fen = 'r1bq1rk1/pp2bppp/2n1pn2/2pp4/3P1B2/2PBPN2/PP1N1PPP/R2QK2R w KQ - 0 8'
    const chiavi = Array.from({ length: 40 }, (_, i) => `chiave ${i}`)
    const giri = 2000
    const t = performance.now()
    for (let i = 0; i < giri; i += 1) {
      const p = daFen(fen)!
      const m = mossaDaUci(p, 'e1g1')!
      const dopo = gioca(p, m)
      esito(dopo, chiavi)
      chiaveRipetizione(dopo)
      inFen(dopo)
    }
    expect((performance.now() - t) / giri).toBeLessThan(0.5)
  })
})

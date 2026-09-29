import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../daily'
import {
  CASELLE,
  chiaveRipetizione,
  contaPezzi,
  esito,
  gioca,
  leggi,
  mossaDaNotazione,
  mosseLegali,
  notazione,
  posizioneIniziale,
  type Colore,
  type Mossa,
  type Pezzo,
  type Posizione,
} from '../dama'
import { LIVELLI_DAMA, analizza, mossaDelComputer, perft, type LivelloDama } from '../dama-computer'

type Simbolo = 'b' | 'B' | 'n' | 'N'

function damiera(pezzi: Partial<Record<Simbolo, number[]>>, tratto: 'b' | 'n' = 'b', senzaProgresso = 0): Posizione {
  const caselle = Array<string>(CASELLE).fill('.')
  for (const [simbolo, dove] of Object.entries(pezzi)) for (const c of dove ?? []) caselle[c - 1] = simbolo
  const p = leggi(`${caselle.join('')} ${tratto} ${senzaProgresso}`)
  if (!p) throw new Error('Posizione di prova non valida')
  return p
}

/** Le posizioni di una partita giocata a caso. */
function partitaACaso(seme: number, massimo = 200): Posizione[] {
  const caso = mulberry32(seme)
  const posizioni = [posizioneIniziale()]
  for (let i = 0; i < massimo; i += 1) {
    const p = posizioni[posizioni.length - 1]
    const legali = mosseLegali(p)
    if (legali.length === 0) break
    posizioni.push(gioca(p, legali[Math.floor(caso() * legali.length)]))
  }
  return posizioni
}

/** Una posizione con i pezzi sparsi a caso, tante dame comprese: e' dove le precedenze fra le prese contano. */
function sparsa(caso: () => number): Posizione {
  const caselle: (Pezzo | null)[] = Array(CASELLE).fill(null)
  const probabilitaDama = caso() * 0.8
  for (const colore of ['bianco', 'nero'] as Colore[]) {
    for (let messi = 0, quanti = 1 + Math.floor(caso() * 10); messi < quanti; ) {
      const k = Math.floor(caso() * CASELLE)
      if (caselle[k]) continue
      // Una pedina sulla base avversaria sarebbe gia' dama.
      const base = colore === 'bianco' ? k < 4 : k >= 28
      caselle[k] = { colore, dama: base || caso() < probabilitaDama }
      messi += 1
    }
  }
  return { caselle, tratto: caso() < 0.5 ? 'bianco' : 'nero', senzaProgresso: 0 }
}

/** Il perft con le regole di shared/dama.ts, contando una volta le prese con stessi estremi e stessi pezzi presi. */
function perftDelleRegole(p: Posizione, profondita: number): number {
  if (profondita === 0) return 1
  const diverse = new Map<string, Mossa>()
  for (const m of mosseLegali(p)) {
    const prese = [...m.prese].sort((a, b) => a - b).join(',')
    diverse.set(`${m.percorso[0]}-${m.percorso[m.percorso.length - 1]}:${prese}`, m)
  }
  if (profondita === 1) return diverse.size
  let totale = 0
  for (const m of diverse.values()) totale += perftDelleRegole(gioca(p, m), profondita - 1)
  return totale
}

/** Il materiale di chi ha il tratto: la pedina 1, la dama 2,5. */
function materiale(p: Posizione): number {
  const conto = contaPezzi(p)
  const [mio, suo] = p.tratto === 'bianco' ? [conto.bianco, conto.nero] : [conto.nero, conto.bianco]
  return mio.pedine + 2.5 * mio.dame - suo.pedine - 2.5 * suo.dame
}

/** Una ricerca sul solo materiale, fatta con le regole e senza il computer: `prof` semimosse, poi le prese. */
function bilancio(p: Posizione, prof: number): number {
  const legali = mosseLegali(p)
  if (legali.length === 0) return -100
  if (prof <= 0 && legali[0].prese.length === 0) return materiale(p)
  return Math.max(...legali.map((m) => -bilancio(gioca(p, m), prof - 1)))
}

const uguali = (a: Mossa, b: Mossa) => notazione(a) === notazione(b)

describe('il generatore del computer', () => {
  it('conta dalla posizione iniziale le stesse posizioni delle regole', () => {
    // Sono anche i numeri di pydraughts, un'altra implementazione della dama italiana.
    const attesi = [7, 49, 302, 1469, 7361, 36473, 177532]
    attesi.forEach((n, i) => expect(perft(posizioneIniziale(), i + 1), `profondita' ${i + 1}`).toBe(n))
    expect(perftDelleRegole(posizioneIniziale(), 5)).toBe(7361)
  })

  it('e’ d’accordo con le regole nelle partite a caso e nelle posizioni piene di dame', () => {
    for (let seme = 1; seme <= 12; seme += 1) {
      partitaACaso(seme).forEach((p, i) => {
        if (i % 5 === 0) expect(perft(p, 3), `partita ${seme}, semimossa ${i}`).toBe(perftDelleRegole(p, 3))
      })
    }
    const caso = mulberry32(77)
    for (let i = 0; i < 400; i += 1) {
      const p = sparsa(caso)
      expect(perft(p, 2), JSON.stringify(p)).toBe(perftDelleRegole(p, 2))
    }
  })

  it('applica le precedenze come le regole, anche nei giri della dama attorno alla casella di partenza', () => {
    // Le posizioni costruite per le precedenze nei test delle regole: fra quelle a caso sono rare.
    for (const p of [
      damiera({ b: [22, 24], n: [18, 10, 20] }),
      damiera({ b: [22], n: [18, 19, 11] }),
      damiera({ b: [22], B: [27], n: [18, 23] }),
      damiera({ B: [26, 27], n: [23], N: [21] }),
      damiera({ B: [25, 29], N: [12, 19, 21], n: [5, 13, 26] }),
      damiera({ B: [29, 32], N: [26, 20], n: [18, 28] }),
      damiera({ B: [22], N: [18, 11, 19], n: [10] }),
      damiera({ B: [22], N: [18, 11], n: [10, 19] }),
      damiera({ B: [22], n: [18, 10, 11, 19] }),
      damiera({ b: [10], n: [6, 7] }),
    ]) {
      for (let prof = 1; prof <= 3; prof += 1) expect(perft(p, prof)).toBe(perftDelleRegole(p, prof))
    }
  })
})

describe('il computer della dama', () => {
  it('ha tre livelli', () => {
    expect(LIVELLI_DAMA).toEqual(['facile', 'normale', 'difficile'])
  })

  it('senza mosse restituisce null, con una sola la gioca subito', () => {
    const bloccato = damiera({ b: [31, 32], n: [28] }, 'n')
    for (const livello of LIVELLI_DAMA) expect(mossaDelComputer(bloccato, livello, mulberry32(1))).toBeNull()
    const senzaPezzi = damiera({ b: [22] }, 'n')
    expect(mossaDelComputer(senzaPezzi, 'difficile', mulberry32(1))).toBeNull()
    // La presa e' obbligatoria e ce n'e' una sola: nessuna ricerca.
    const obbligata = damiera({ b: [22, 30, 31], n: [18, 5] })
    const analisi = analizza(obbligata, 'difficile', mulberry32(1))
    expect(notazione(analisi.mossa!)).toBe('22x13')
    expect(analisi.nodi).toBe(0)
  })

  it('restituisce sempre una mossa legale', () => {
    for (let seme = 1; seme <= 8; seme += 1) {
      partitaACaso(seme * 31, 160).forEach((p, i) => {
        if (i % 16 !== 5) return
        const legali = mosseLegali(p)
        for (const livello of LIVELLI_DAMA) {
          const m = mossaDelComputer(p, livello, mulberry32(seme + i), [], { tempoMs: 20 })
          if (legali.length === 0) expect(m).toBeNull()
          else expect(legali.some((l) => uguali(l, m!)), `${livello}: ${m && notazione(m)}`).toBe(true)
        }
      })
    }
    const caso = mulberry32(5)
    for (let i = 0; i < 40; i += 1) {
      const p = sparsa(caso)
      const m = mossaDelComputer(p, 'normale', caso)
      const legali = mosseLegali(p)
      if (legali.length === 0) expect(m).toBeNull()
      else expect(legali).toContainEqual(m)
    }
  }, 60_000)

  it('coglie un colpo: una mossa che costringe a prendere, e poi una presa multipla', () => {
    // Posizioni trovate in partite a caso: il colpo e' l'unica mossa che guadagna materiale.
    const colpi: [string, string][] = [
      ['nnn.nnnnnn....nn.b..bbbb.bb.bbbb b 0', '23-20'],
      ['nn.n.n.nn..nn.b.....b...b.bbbb.b b 0', '21-17'],
      ['n.n.nnn........nn.bn.b.nb.bb..b. n 0', '20-23'],
      ['nn.n.n.n.nnnn..bn.b.b..bbb.bbbb. n 0', '11-14'],
    ]
    for (const [testo, colpo] of colpi) {
      const p = leggi(testo)!
      for (const livello of ['normale', 'difficile'] as LivelloDama[]) {
        const m = mossaDelComputer(p, livello, mulberry32(3), [], { tempoMs: 300 })!
        expect(notazione(m), `${livello} in ${testo}`).toBe(colpo)
      }
      // L'avversario deve prendere, e il computer risponde con la presa multipla.
      const q = gioca(p, mossaDaNotazione(p, colpo)!)
      const risposte = mosseLegali(q)
      expect(risposte).toHaveLength(1)
      const dopo = gioca(q, risposte[0])
      expect(mossaDelComputer(dopo, 'normale', mulberry32(3))!.prese.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('fra due prese che si possono scegliere prende quella che non restituisce il pezzo', () => {
    // 22x13 prende la 18 ma la 9 riprende; 22x15 prende la 19 e resta al sicuro.
    const p = damiera({ b: [22, 30], n: [18, 19, 9] })
    expect(mosse(p)).toEqual(['22x13', '22x15'])
    for (const livello of ['normale', 'difficile'] as LivelloDama[]) {
      expect(notazione(mossaDelComputer(p, livello, mulberry32(1), [], { tempoMs: 200 })!)).toBe('22x15')
    }
  })

  it('al normale non regala pezzi', () => {
    // Posizioni di mezza partita dove piu' mosse lasciano un pezzo in presa: se ne accorge una ricerca di
    // due semimosse sul solo materiale, fatta con le regole.
    for (const testo of [
      'nn.nnnnn..n....n....bbb.bn.b..bb n 0',
      'nnnnnnn...nn...nnb.b.bbbb..bbbbb b 0',
      'nn..nnnnbnnn....b.bb.b..b..bbb.b n 0',
      'nn.nn..nbn....n..b.n...bbbb.b.bb n 0',
      'nnnnn.nnn..n.....b...nbbb..b.bbb b 0',
    ]) {
      const p = leggi(testo)!
      const legali = mosseLegali(p)
      const valori = legali.map((m) => -bilancio(gioca(p, m), 2))
      const meglio = Math.max(...valori)
      expect(valori.filter((v) => v < meglio).length, testo).toBeGreaterThanOrEqual(2)
      for (let seme = 1; seme <= 3; seme += 1) {
        const m = mossaDelComputer(p, 'normale', mulberry32(seme))!
        expect(valori[legali.findIndex((l) => uguali(l, m))], `${testo}: ${notazione(m)}`).toBe(meglio)
      }
    }
  })

  it('e’ deterministico: stessa posizione e stesso seme, stessa mossa', () => {
    for (const p of partitaACaso(9, 40).filter((_, i) => i % 10 === 3)) {
      for (const livello of ['facile', 'normale'] as LivelloDama[]) {
        expect(mossaDelComputer(p, livello, mulberry32(12))).toEqual(mossaDelComputer(p, livello, mulberry32(12)))
      }
    }
  })
})

/**
 * Una partita che gira in tondo: dalla radice il computer fa `m`, l'avversario `o`, e poi tutti e due tornano
 * indietro, due volte. Alla fine la radice c'e' per la seconda volta, e rifare `m` porterebbe la posizione che
 * ne segue alla terza.
 */
function giroInTondo(r: Posizione, m: string, o: string): { radice: Posizione; storia: string[] } {
  const indietro = (x: string) => x.split('-').reverse().join('-')
  const passi = [m, o, indietro(m), indietro(o)]
  let p = gioca(r, mossaDaNotazione(r, m)!)
  const storia: string[] = []
  for (let i = 1; i <= 7; i += 1) {
    storia.push(chiaveRipetizione(p))
    p = gioca(p, mossaDaNotazione(p, passi[i % 4])!)
  }
  expect(chiaveRipetizione(p)).toBe(chiaveRipetizione(r))
  expect(esito(p, storia)).toBeNull()
  // La premessa: la mossa `m` chiuderebbe la partita per ripetizione.
  const dopo = gioca(p, mossaDaNotazione(p, m)!)
  expect(esito(dopo, [...storia, chiaveRipetizione(p)])).toEqual({ fine: 'ripetizione', vincitore: null })
  return { radice: p, storia }
}

describe('le ripetizioni', () => {
  it('in vantaggio le evita', () => {
    // Tre dame contro una: senza storia il computer gioca 26-21.
    const r = damiera({ B: [22, 26, 27], N: [4] })
    expect(notazione(mossaDelComputer(r, 'normale', mulberry32(1))!)).toBe('26-21')
    const { radice, storia } = giroInTondo(r, '26-21', '4-7')
    for (const livello of ['normale', 'difficile'] as LivelloDama[]) {
      const m = mossaDelComputer(radice, livello, mulberry32(1), storia, { tempoMs: 300 })!
      expect(notazione(m), livello).not.toBe('26-21')
    }
  })

  it('in grave svantaggio le cerca', () => {
    // Una dama contro tre: senza storia il computer scappa con 4-8, con la storia prende la patta con 4-7.
    const r = damiera({ B: [14, 22, 27], N: [4] }, 'n')
    expect(notazione(mossaDelComputer(r, 'normale', mulberry32(1))!)).toBe('4-8')
    const { radice, storia } = giroInTondo(r, '4-7', '14-10')
    for (const livello of ['normale', 'difficile'] as LivelloDama[]) {
      const m = mossaDelComputer(radice, livello, mulberry32(1), storia, { tempoMs: 300 })!
      expect(notazione(m), livello).toBe('4-7')
    }
  })
})

describe('i tempi', () => {
  const posizioni = [1, 2, 3, 4].flatMap((seme) => partitaACaso(seme * 101, 90).filter((_, i) => i % 9 === 4))

  it('il facile risponde in pochi millisecondi', () => {
    const tempi = posizioni.map((p) => {
      const inizio = performance.now()
      mossaDelComputer(p, 'facile', mulberry32(1))
      return performance.now() - inizio
    })
    expect(tempi.reduce((a, b) => a + b, 0) / tempi.length).toBeLessThan(5)
    expect(Math.max(...tempi)).toBeLessThan(50)
  })

  it('il difficile rispetta il limite di tempo', () => {
    const p = posizioni.find((q) => mosseLegali(q).length >= 6)!
    const inizio = performance.now()
    const veloce = analizza(p, 'difficile', mulberry32(1), [], { tempoMs: 100 })
    expect(performance.now() - inizio).toBeLessThan(250)
    expect(veloce.profondita).toBeGreaterThanOrEqual(4)
    // Con il suo tempo, un secondo e mezzo.
    const prima = performance.now()
    const pieno = analizza(p, 'difficile', mulberry32(1))
    expect(performance.now() - prima).toBeLessThan(1_800)
    expect(pieno.profondita).toBeGreaterThan(veloce.profondita)
  }, 10_000)
})

describe('i livelli fra loro', () => {
  /** Una partita fra due livelli, fino alla fine o a trecento semimosse: il vincitore, o null. */
  function partita(bianco: LivelloDama, nero: LivelloDama, seme: number): Colore | null {
    let p = posizioneIniziale()
    const storia: string[] = []
    for (let i = 0; i < 300; i += 1) {
      const fine = esito(p, storia)
      if (fine) return fine.vincitore
      const livello = p.tratto === 'bianco' ? bianco : nero
      // Il difficile a profondita' fissa e senza limite di tempo, perché il test non duri minuti e non
      // dipenda dalla macchina: su una CI carica, a tempo, penserebbe meno di quanto si crede.
      const limiti = livello === 'difficile' ? { profondita: 8, tempoMs: 60_000 } : {}
      const m = mossaDelComputer(p, livello, mulberry32(seme * 1000 + i), storia, limiti)
      storia.push(chiaveRipetizione(p))
      p = gioca(p, m!)
    }
    return null
  }

  it('il difficile batte il facile, con il Bianco e con il Nero', () => {
    let vinte = 0
    for (let i = 0; i < 4; i += 1) {
      const difficile: Colore = i % 2 === 0 ? 'bianco' : 'nero'
      const vincitore = difficile === 'bianco' ? partita('difficile', 'facile', i) : partita('facile', 'difficile', i)
      expect(vincitore, `partita ${i + 1}`).not.toBe(difficile === 'bianco' ? 'nero' : 'bianco')
      if (vincitore === difficile) vinte += 1
    }
    expect(vinte).toBeGreaterThanOrEqual(3)
  }, 120_000)
})

function mosse(p: Posizione): string[] {
  return mosseLegali(p).map(notazione).sort()
}

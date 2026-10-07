import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../daily'
import {
  IMPOSTAZIONI_SCARABOCCHI,
  LIVELLI_PAROLA,
  MARGINE_SCARABOCCHI_MS,
  RIVELA_MS,
  SCELTA_MS,
  SCRIVI_MS,
  assegnazione,
  avanzaIndovina,
  avanzaTelefono,
  catenaDi,
  codificaOps,
  decodificaOps,
  esitoTentativo,
  foglioDellaCatena,
  impostazioniScarabocchiValide,
  indizio,
  nuovaPartitaIndovina,
  nuovaPartitaTelefono,
  pezzoValido,
  puntiDisegnatore,
  puntiIndovino,
  scegliParola,
  tipoDelPasso,
  trattiDa,
  turniDi,
  type ContestoIndovina,
  type OpTratto,
} from '../scarabocchi'
import { PAROLE_SCARABOCCHI } from '../scarabocchi-parole'

const giocatori = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `g${i}`, nome: `G${i}` }))
const tutti = (n: number) => new Set(giocatori(n).map((g) => g.id))

describe('il telefono senza fili: chi lavora a ogni foglio', () => {
  it('ognuno lavora una volta per passo e una volta per catena: nessuno rivede una sua catena', () => {
    for (let n = 3; n <= 10; n += 1) {
      for (let seme = 1; seme <= 40; seme += 1) {
        const q = assegnazione(n, mulberry32(seme))
        for (const riga of q) expect(new Set(riga).size, `n=${n} passo`).toBe(n)
        for (let c = 0; c < n; c += 1) expect(new Set(q.map((riga) => riga[c])).size, `n=${n} catena`).toBe(n)
      }
    }
  })

  it('i fogli non girano sempre allo stesso modo: chi passa a chi cambia da un passo all’altro', () => {
    let diversi = 0
    for (let seme = 1; seme <= 50; seme += 1) {
      const q = assegnazione(6, mulberry32(seme))
      const passaggi = new Set(
        Array.from({ length: 5 }, (_, p) => {
          const da = q[p].indexOf(0)
          return q[p + 1][da]
        }),
      )
      if (passaggi.size > 1) diversi += 1
    }
    expect(diversi).toBeGreaterThan(40)
  })

  it('la partita: ognuno ha la sua catena a ogni passo, scrive, disegna e descrive', () => {
    const p = nuovaPartitaTelefono(giocatori(4), IMPOSTAZIONI_SCARABOCCHI, 7, 0)
    expect(p.passi).toBe(4)
    for (let passo = 0; passo < 4; passo += 1) {
      const catene = giocatori(4).map((g) => catenaDi(p, g.id, passo))
      expect(new Set(catene).size).toBe(4)
    }
    expect([0, 1, 2, 3].map(tipoDelPasso)).toEqual(['scrivi', 'disegna', 'descrivi', 'disegna'])
  })

  it('un passo finisce quando hanno consegnato tutti, o allo scadere con il margine; poi l’album', () => {
    let p = nuovaPartitaTelefono(giocatori(3), IMPOSTAZIONI_SCARABOCCHI, 3, 0)
    expect(avanzaTelefono(p, tutti(3), new Set(['g0', 'g1']), 10_000)).toBe(p)
    p = avanzaTelefono(p, tutti(3), tutti(3), 10_000)
    expect(p).toMatchObject({ passo: 1, inizio: 10_000 })
    // Scaduto: il passo dopo parte dalla scadenza, non da quando lo si guarda.
    const scadenza = p.fine + MARGINE_SCARABOCCHI_MS
    p = avanzaTelefono(p, tutti(3), new Set(), scadenza + 5_000)
    expect(p).toMatchObject({ passo: 2, inizio: scadenza })
    p = avanzaTelefono(p, tutti(3), tutti(3), p.inizio + 1_000)
    expect(p.fase).toBe('album')
  })

  it('chi se n’e’ andato non si aspetta, e in uno solo la partita finisce', () => {
    const p = nuovaPartitaTelefono(giocatori(3), IMPOSTAZIONI_SCARABOCCHI, 3, 0)
    expect(avanzaTelefono(p, new Set(['g0', 'g1']), new Set(['g0', 'g1']), 1_000).passo).toBe(1)
    expect(avanzaTelefono(p, new Set(['g0']), new Set(), 1_000).fase).toBe('album')
    expect(p.fine).toBe(SCRIVI_MS)
  })
})

describe('indovina il disegno: le parole', () => {
  it('giusta senza maiuscole, accenti e articolo; vicina con una lettera di differenza', () => {
    expect(esitoTentativo('gatto', 'GATTO')).toBe('giusta')
    expect(esitoTentativo('gatto', 'un gatto')).toBe('giusta')
    expect(esitoTentativo('tè', 'te')).toBe('giusta')
    expect(esitoTentativo('gatto', 'gatti')).toBe('vicina')
    expect(esitoTentativo('astronauta', 'astronauti')).toBe('vicina')
    expect(esitoTentativo('gatto', 'cane')).toBe('no')
    expect(esitoTentativo('ago', 'aga')).toBe('no')
    expect(esitoTentativo('gatto', '   ')).toBe('no')
  })

  it('l’indizio nasconde le lettere e ne svela qualcuna col tempo, sempre le stesse', () => {
    expect(indizio('elefante', 0.1, 4)).toBe('________')
    const meta = indizio('elefante', 0.6, 4)
    expect(meta.replace(/_/g, '').length).toBe(1)
    expect(indizio('elefante', 0.8, 4).replace(/_/g, '').length).toBe(2)
    expect(indizio('elefante', 0.8, 4)).toContain(meta.replace(/_/g, ''))
    expect(indizio('elefante', 0.6, 4)).toBe(meta)
    expect(indizio('ago', 0.95, 4)).toBe('___')
  })

  it('chi indovina prima prende di piu', () => {
    expect(puntiIndovino(0)).toBe(300)
    expect(puntiIndovino(1)).toBe(50)
    expect(puntiIndovino(0.5)).toBeGreaterThan(puntiIndovino(0.6))
    expect(puntiDisegnatore([300, 100], 4)).toBe(100)
    expect(puntiDisegnatore([], 3)).toBe(0)
  })

  it('le parole da disegnare: tre livelli pieni, senza doppioni, di sole lettere', () => {
    const viste = new Set<string>()
    for (const l of LIVELLI_PAROLA) {
      expect(PAROLE_SCARABOCCHI[l].length).toBeGreaterThan(300)
      for (const p of PAROLE_SCARABOCCHI[l]) {
        expect(p).toMatch(/^[a-zàèéìòù]+$/)
        expect(viste.has(p), p).toBe(false)
        viste.add(p)
      }
    }
  })
})

describe('indovina il disegno: i turni', () => {
  const nessuno: ContestoIndovina['indovinati'] = []
  const ctx = (n: number, indovinati = nessuno): ContestoIndovina => ({ presenti: tutti(n), indovinati })

  it('al via: tre parole per turno, mai la stessa due volte, e disegna il primo dell’ordine', () => {
    const p = nuovaPartitaIndovina(giocatori(4), { ...IMPOSTAZIONI_SCARABOCCHI, giri: 3 }, PAROLE_SCARABOCCHI, 9, 0)
    expect(turniDi(p)).toBe(12)
    expect(p.mazzo).toHaveLength(12)
    expect(new Set(p.mazzo.flat()).size).toBe(36)
    expect(p.disegnatore).toBe(p.ordine[0])
    expect(p).toMatchObject({ fase: 'scelta', fine: SCELTA_MS })
  })

  it('chi disegna sceglie; se non sceglie in tempo, sceglie il gioco la parola di mezzo', () => {
    const p = nuovaPartitaIndovina(giocatori(3), IMPOSTAZIONI_SCARABOCCHI, PAROLE_SCARABOCCHI, 9, 0)
    expect(() => scegliParola(p, p.ordine[1], 0, 1_000)).toThrow()
    const scelta = scegliParola(p, p.ordine[0], 2, 1_000)
    expect(scelta).toMatchObject({ fase: 'disegno', parola: p.mazzo[0][2], livello: 'difficile', inizio: 1_000 })
    const sola = avanzaIndovina(p, ctx(3), SCELTA_MS + 500)
    expect(sola).toMatchObject({ fase: 'disegno', parola: p.mazzo[0][1], inizio: SCELTA_MS })
  })

  it('quando indovinano tutti il turno si chiude subito, con i punti di tutti e di chi disegna', () => {
    const via = nuovaPartitaIndovina(giocatori(3), IMPOSTAZIONI_SCARABOCCHI, PAROLE_SCARABOCCHI, 9, 0)
    const p = scegliParola(via, via.ordine[0], 0, 0)
    const chi = p.disegnatore!
    const altri = [...tutti(3)].filter((id) => id !== chi)
    const uno = avanzaIndovina(p, ctx(3, [{ playerId: altri[0], punti: 250, at: 5_000 }]), 6_000)
    expect(uno).toBe(p)
    const due = avanzaIndovina(
      p,
      ctx(3, [
        { playerId: altri[0], punti: 250, at: 5_000 },
        { playerId: altri[1], punti: 150, at: 9_000 },
      ]),
      9_500,
    )
    expect(due).toMatchObject({ fase: 'rivela', inizio: 9_000, fine: 9_000 + RIVELA_MS })
    expect(due.punti[altri[0]]).toBe(250)
    expect(due.punti[chi]).toBe(200)
    expect(due.chiusi[0]).toMatchObject({ disegnatore: chi, indovinati: 2 })
  })

  it('le scadenze si applicano una dopo l’altra, e chi se n’e’ andato non disegna', () => {
    const p = nuovaPartitaIndovina(giocatori(3), { ...IMPOSTAZIONI_SCARABOCCHI, giri: 1 }, PAROLE_SCARABOCCHI, 5, 0)
    const [primo, secondo, terzo] = p.ordine
    // Il primo disegna e il tempo finisce senza risposte: rivela, poi tocca al secondo.
    const disegna = scegliParola(p, primo, 0, 0)
    const dopo = avanzaIndovina(disegna, ctx(3), disegna.fine + RIVELA_MS + 1)
    expect(dopo).toMatchObject({ turno: 1, disegnatore: secondo, fase: 'scelta', inizio: disegna.fine + RIVELA_MS })
    // Il secondo se n'e' andato: il suo turno salta.
    const senza = avanzaIndovina(dopo, { presenti: new Set([primo, terzo]), indovinati: [] }, dopo.inizio + 1)
    expect(senza).toMatchObject({ turno: 2, disegnatore: terzo, fase: 'scelta' })
    // L'ultimo turno chiuso: la partita e' finita.
    const fine = avanzaIndovina(scegliParola(senza, terzo, 0, 0), ctx(3), 10_000_000)
    expect(fine.fase).toBe('finita')
    expect(fine.chiusi).toHaveLength(2)
  })
})

describe('i tratti', () => {
  it('le mosse vanno in testo e tornano uguali', () => {
    const ops: OpTratto[] = [
      { tipo: 'tratto', colore: 3, spessore: 1, punti: [0, 0, 1599, 1199, 800, 600] },
      { tipo: 'segue', punti: [10, 20] },
      { tipo: 'annulla' },
      { tipo: 'tratto', colore: 0, spessore: 3, punti: [5, 5] },
      { tipo: 'pulisci' },
    ]
    const testo = codificaOps(ops)
    expect(pezzoValido(testo)).toBe(true)
    expect(decodificaOps(testo)).toEqual(ops)
  })

  it('sulla lavagna resta quel che non e’ stato annullato o pulito', () => {
    const t = trattiDa(
      decodificaOps(
        codificaOps([
          { tipo: 'tratto', colore: 1, spessore: 0, punti: [1, 1] },
          { tipo: 'segue', punti: [2, 2] },
          { tipo: 'tratto', colore: 2, spessore: 0, punti: [3, 3] },
          { tipo: 'annulla' },
        ]),
      ),
    )
    expect(t).toEqual([{ colore: 1, spessore: 0, punti: [1, 1, 2, 2] }])
    expect(trattiDa([{ tipo: 'tratto', colore: 1, spessore: 0, punti: [1, 1] }, { tipo: 'pulisci' }])).toEqual([])
  })

  it('il server accetta solo i caratteri delle mosse', () => {
    expect(pezzoValido('sAA<script>')).toBe(false)
    expect(pezzoValido('')).toBe(false)
    expect(pezzoValido(42)).toBe(false)
  })
})

describe('le impostazioni', () => {
  it('quel che non va resta com’era', () => {
    const dopo = impostazioniScarabocchiValide({ modo: 'telefono', giri: 9, secondi: 100 }, IMPOSTAZIONI_SCARABOCCHI)
    expect(dopo).toEqual({ ...IMPOSTAZIONI_SCARABOCCHI, modo: 'telefono', secondi: 100 })
    expect(foglioDellaCatena(2, 3)).toBe('c2p3')
  })
})

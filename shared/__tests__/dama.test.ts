import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../daily'
import {
  CASELLE,
  LIMITE_SENZA_PROGRESSO,
  casellaDi,
  chiaveRipetizione,
  contaPezzi,
  esito,
  gioca,
  leggi,
  mossaDaNotazione,
  mosseLegali,
  notazione,
  posizioneDaChiave,
  posizioneIniziale,
  rigaColonna,
  scrivi,
  type Posizione,
} from '../dama'

/*
 * La damiera vista dal Bianco, con la numerazione della FID:
 *
 *      0  1  2  3  4  5  6  7
 *  0   1     2     3     4
 *  1      5     6     7     8
 *  2   9    10    11    12
 *  3     13    14    15    16
 *  4  17    18    19    20
 *  5     21    22    23    24
 *  6  25    26    27    28
 *  7     29    30    31    32
 */

type Simbolo = 'b' | 'B' | 'n' | 'N'

/** Una posizione con i pezzi dove si dice: b pedina bianca, B dama bianca, n pedina nera, N dama nera. */
function damiera(pezzi: Partial<Record<Simbolo, number[]>>, tratto: 'b' | 'n' = 'b', senzaProgresso = 0): Posizione {
  const caselle = Array<string>(CASELLE).fill('.')
  for (const [simbolo, dove] of Object.entries(pezzi)) for (const c of dove ?? []) caselle[c - 1] = simbolo
  const p = leggi(`${caselle.join('')} ${tratto} ${senzaProgresso}`)
  if (!p) throw new Error('Posizione di prova non valida')
  return p
}

const mosse = (p: Posizione) => mosseLegali(p).map(notazione).sort()

/** Una partita a caso, fino alla fine o a `massimo` semimosse: le posizioni e le mosse. */
function partitaACaso(seme: number, massimo = 300) {
  const caso = mulberry32(seme)
  const posizioni = [posizioneIniziale()]
  const giocate = []
  for (let i = 0; i < massimo; i += 1) {
    const p = posizioni[posizioni.length - 1]
    const legali = mosseLegali(p)
    if (legali.length === 0) break
    const m = legali[Math.floor(caso() * legali.length)]
    giocate.push(m)
    posizioni.push(gioca(p, m))
  }
  return { posizioni, giocate }
}

describe('la damiera', () => {
  it('numera le caselle scure come la FID: la 1 in alto a sinistra, la 32 in basso a destra', () => {
    expect(rigaColonna(1)).toEqual({ riga: 0, colonna: 0 })
    expect(rigaColonna(4)).toEqual({ riga: 0, colonna: 6 })
    expect(rigaColonna(5)).toEqual({ riga: 1, colonna: 1 })
    expect(rigaColonna(29)).toEqual({ riga: 7, colonna: 1 })
    expect(rigaColonna(32)).toEqual({ riga: 7, colonna: 7 })
    // Per ciascun giocatore la casella in basso a destra e' scura (art. 2.3): la 32 per il Bianco, la 1 per il Nero.
    expect(casellaDi(7, 7)).toBe(32)
    expect(casellaDi(0, 0)).toBe(1)
  })

  it('rigaColonna e casellaDi vanno e tornano su tutte le 32, fila per fila da sinistra a destra', () => {
    for (let c = 1; c <= CASELLE; c += 1) {
      const { riga, colonna } = rigaColonna(c)
      expect((riga + colonna) % 2, `casella ${c}`).toBe(0)
      expect(riga).toBe(Math.floor((c - 1) / 4))
      expect(casellaDi(riga, colonna)).toBe(c)
      if (c % 4 !== 1) expect(colonna).toBeGreaterThan(rigaColonna(c - 1).colonna)
    }
    let scure = 0
    for (let riga = 0; riga < 8; riga += 1) {
      for (let colonna = 0; colonna < 8; colonna += 1) if (casellaDi(riga, colonna) !== null) scure += 1
    }
    expect(scure).toBe(32)
    expect(casellaDi(0, 1)).toBeNull()
    expect(casellaDi(7, 6)).toBeNull()
    expect(casellaDi(8, 0)).toBeNull()
    expect(casellaDi(-1, 1)).toBeNull()
    expect(() => rigaColonna(0)).toThrow(RangeError)
    expect(() => rigaColonna(33)).toThrow(RangeError)
  })

  it('le linee del regolamento sono diagonali vere (art. 2.13-2.16)', () => {
    const diagonale = (caselle: number[]) =>
      caselle.every((c, i) => {
        if (i === 0) return true
        const a = rigaColonna(caselle[i - 1])
        const b = rigaColonna(c)
        return b.riga === a.riga + 1 && Math.abs(b.colonna - a.colonna) === 1
      })
    expect(diagonale([1, 5, 10, 14, 19, 23, 28, 32])).toBe(true)
    expect(diagonale([4, 7, 11, 14, 18, 21, 25])).toBe(true)
    expect(diagonale([8, 12, 15, 19, 22, 26, 29])).toBe(true)
    // I biscacchi sono due caselle vicine nell'angolo: 4 e 8 del Nero, 25 e 29 del Bianco.
    expect(diagonale([4, 8])).toBe(true)
    expect(diagonale([25, 29])).toBe(true)
  })
})

describe('la posizione iniziale', () => {
  it('ha il Nero sulle 1-12 e il Bianco sulle 21-32, e muove il Bianco', () => {
    const p = posizioneIniziale()
    expect(p.tratto).toBe('bianco')
    expect(p.senzaProgresso).toBe(0)
    p.caselle.forEach((pezzo, k) => {
      const c = k + 1
      if (c <= 12) expect(pezzo).toEqual({ colore: 'nero', dama: false })
      else if (c >= 21) expect(pezzo).toEqual({ colore: 'bianco', dama: false })
      else expect(pezzo).toBeNull()
    })
    expect(contaPezzi(p)).toEqual({ bianco: { pedine: 12, dame: 0 }, nero: { pedine: 12, dame: 0 } })
  })

  it('il Bianco ha sette mosse, e sono quelle della damiera vera', () => {
    // La 21 sta nella colonna 1 e va sulla 17 o sulla 18; la 24 sta sul bordo destro e ha solo la 20.
    expect(mosse(posizioneIniziale())).toEqual(['21-17', '21-18', '22-18', '22-19', '23-19', '23-20', '24-20'])
  })

  it('va e torna dal testo, che e’ quello documentato', () => {
    const p = posizioneIniziale()
    expect(scrivi(p)).toBe('nnnnnnnnnnnn........bbbbbbbbbbbb b 0')
    expect(leggi(scrivi(p))).toEqual(p)
    expect(chiaveRipetizione(p)).toBe('nnnnnnnnnnnn........bbbbbbbbbbbb b')
    expect(posizioneDaChiave(chiaveRipetizione(p))).toEqual(p)
  })
})

describe('il testo di una posizione', () => {
  it('va e torna su tutte le posizioni di qualche partita a caso', () => {
    for (let seme = 1; seme <= 10; seme += 1) {
      for (const p of partitaACaso(seme).posizioni) {
        expect(leggi(scrivi(p))).toEqual(p)
        expect(scrivi(p).startsWith(chiaveRipetizione(p))).toBe(true)
      }
    }
  })

  it('rifiuta i testi rotti e le posizioni impossibili', () => {
    const buona = 'nnnnnnnnnnnn........bbbbbbbbbbbb b 0'
    expect(leggi(buona)).not.toBeNull()
    for (const rotto of [
      '',
      'nnnnnnnnnnnn........bbbbbbbbbbb b 0', // 31 caselle
      'nnnnnnnnnnnn........bbbbbbbbbbbx b 0',
      'nnnnnnnnnnnn........bbbbbbbbbbbb w 0',
      'nnnnnnnnnnnn........bbbbbbbbbbbb b',
      'nnnnnnnnnnnn........bbbbbbbbbbbb b 81',
      'nnnnnnnnnnnn........bbbbbbbbbbbb b 07',
      'nnnnnnnnnnnn........bbbbbbbbbbbb b 0 ',
      'b...........................n... b 0', // una pedina bianca sulla base del Nero sarebbe dama
      '............................n... n 0', // e una nera sulla base del Bianco
      'nnnnnnnnnnnnn.......bbbbbbbbbbbb b 0', // tredici pezzi neri
    ]) {
      expect(leggi(rotto), rotto).toBeNull()
    }
    expect(leggi(null as unknown as string)).toBeNull()
    expect(leggi('B...........................N... n 80')).not.toBeNull()
    expect(posizioneDaChiave(buona)).toBeNull()
  })
})

describe('i movimenti', () => {
  it('la pedina bianca va verso i numeri bassi, la nera verso gli alti, e sulla base avversaria diventano dame', () => {
    for (let seme = 1; seme <= 30; seme += 1) {
      const { posizioni, giocate } = partitaACaso(seme)
      giocate.forEach((m, i) => {
        const prima = posizioni[i]
        const dopo = posizioni[i + 1]
        const pezzo = prima.caselle[m.percorso[0] - 1]!
        const arrivo = m.percorso[m.percorso.length - 1]
        if (!pezzo.dama) {
          for (let j = 1; j < m.percorso.length; j += 1) {
            if (pezzo.colore === 'bianco') expect(m.percorso[j]).toBeLessThan(m.percorso[j - 1])
            else expect(m.percorso[j]).toBeGreaterThan(m.percorso[j - 1])
          }
          const base = pezzo.colore === 'bianco' ? arrivo <= 4 : arrivo >= 29
          expect(dopo.caselle[arrivo - 1]).toEqual({ colore: pezzo.colore, dama: base })
        } else expect(dopo.caselle[arrivo - 1]).toEqual(pezzo)
      })
    }
  })

  it('la dama va avanti e indietro di una casella sola', () => {
    expect(mosse(damiera({ B: [18], n: [1] }))).toEqual(['18-13', '18-14', '18-21', '18-22'])
    expect(mosse(damiera({ N: [18], b: [32] }, 'n'))).toEqual(['18-13', '18-14', '18-21', '18-22'])
    // Nel cantone ha una mossa sola.
    expect(mosse(damiera({ B: [32], n: [1] }))).toEqual(['32-28'])
  })

  it('gioca non tocca la posizione di prima', () => {
    const p = posizioneIniziale()
    const testo = scrivi(p)
    const dopo = gioca(p, mossaDaNotazione(p, '22-18')!)
    expect(scrivi(p)).toBe(testo)
    expect(dopo.tratto).toBe('nero')
    expect(dopo.caselle[21]).toBeNull()
    expect(dopo.caselle[17]).toEqual({ colore: 'bianco', dama: false })
  })

  it('rifiuta una mossa che non ha senso sulla damiera', () => {
    const p = posizioneIniziale()
    expect(() => gioca(p, { percorso: [9, 13], prese: [] })).toThrow()
    expect(() => gioca(p, { percorso: [18, 14], prese: [] })).toThrow()
    expect(() => gioca(p, { percorso: [26, 22], prese: [] })).toThrow()
  })
})

describe('le prese', () => {
  it('la presa e’ obbligatoria: con una presa non ci sono movimenti', () => {
    const p = damiera({ b: [22, 31], n: [18] })
    expect(mosse(p)).toEqual(['22x13'])
    expect(mosseLegali(p)[0]).toEqual({ percorso: [22, 13], prese: [18] })
    // Senza il pezzo da prendere, il Bianco ha i suoi movimenti.
    expect(mosse(damiera({ b: [22, 31], n: [1] }))).toEqual(['22-18', '22-19', '31-27', '31-28'])
  })

  it('la pedina non prende la dama', () => {
    expect(mosse(damiera({ b: [22], N: [18] }))).toEqual(['22-19'])
  })

  it('la pedina non prende all’indietro, la dama sì', () => {
    expect(mosse(damiera({ b: [18], n: [22] }))).toEqual(['18-13', '18-14'])
    expect(mosse(damiera({ B: [18], n: [22] }))).toEqual(['18x27'])
    // Anche la dama del Nero prende all'indietro, cioe' verso l'alto.
    expect(mosse(damiera({ N: [18], b: [14] }, 'n'))).toEqual(['18x11'])
  })

  it('una presa multipla continua finché c’e’ da prendere', () => {
    const p = damiera({ b: [22], n: [18, 10] })
    expect(mosseLegali(p)).toEqual([{ percorso: [22, 13, 6], prese: [18, 10] }])
    expect(notazione(mosseLegali(p)[0])).toBe('22x13x6')
    const dopo = gioca(p, mosseLegali(p)[0])
    expect(contaPezzi(dopo).nero).toEqual({ pedine: 0, dame: 0 })
    expect(dopo.caselle[5]).toEqual({ colore: 'bianco', dama: false })
  })

  it('la pedina che arriva a dama prendendo si ferma lì', () => {
    // Dalla 3, da dama, prenderebbe la 7 all'indietro: ma diventa dama solo dalla mossa dopo.
    const p = damiera({ b: [10], n: [6, 7] })
    expect(mosseLegali(p)).toEqual([{ percorso: [10, 3], prese: [6] }])
    const dopo = gioca(p, mosseLegali(p)[0])
    expect(dopo.caselle[2]).toEqual({ colore: 'bianco', dama: true })
    expect(dopo.caselle[6]).toEqual({ colore: 'nero', dama: false })
  })

  it('i pezzi presi restano sulla damiera fino alla fine, e la dama ripassa dalla casella di partenza', () => {
    // La dama in 22 gira attorno ai quattro pezzi e torna in 22. Da una parte incontra la dama in 18 per
    // prima, dall'altra la pedina in 19: si deve girare dalla parte della dama.
    const p = damiera({ B: [22], N: [18, 11], n: [10, 19] })
    expect(mosseLegali(p)).toEqual([{ percorso: [22, 13, 6, 15, 22], prese: [18, 10, 11, 19] }])
    const dopo = gioca(p, mosseLegali(p)[0])
    expect(scrivi(dopo)).toBe(scrivi(damiera({ B: [22] }, 'n')))
  })
})

describe('le precedenze fra le prese (art. 6.6-6.10)', () => {
  it('prima di tutto si prendono piu’ pezzi, anche con un altro pezzo', () => {
    // La 22 ne prende due (18 e 10), la 24 uno solo (20).
    expect(mosse(damiera({ b: [22, 24], n: [18, 10, 20] }))).toEqual(['22x13x6'])
    // E lo stesso pezzo va dalla parte dove ce ne sono di piu': dalla 19 e dalla 11, non dalla 18.
    expect(mosse(damiera({ b: [22], n: [18, 19, 11] }))).toEqual(['22x15x6'])
  })

  it('a parita’ di pezzi si prende con la dama e non con la pedina', () => {
    expect(mosse(damiera({ b: [22], B: [27], n: [18, 23] }))).toEqual(['27x20'])
  })

  it('a parita’ di pezzi presi con la dama, si prendono piu’ dame', () => {
    // La dama in 27 prende la pedina in 23, quella in 26 la dama in 21: deve prendere la dama.
    expect(mosse(damiera({ B: [26, 27], n: [23], N: [21] }))).toEqual(['26x17'])
    // Anche se l'altra sequenza incontra una dama prima: la dama in 29 prende pedina, dama, dama; quella in 25
    // dama, pedina, pedina. Il numero delle dame viene prima del loro ordine.
    const p = damiera({ B: [25, 29], N: [12, 19, 21], n: [5, 13, 26] })
    expect(mosseLegali(p)).toEqual([{ percorso: [29, 22, 15, 8], prese: [26, 19, 12] }])
  })

  it('a parita’ di dame prese, si prende dove la dama si presenta prima', () => {
    // La dama in 29 prende prima la dama in 26 e poi la pedina in 18; quella in 32 prima la pedina in 28 e poi
    // la dama in 20. Due pezzi e una dama per tutte e due: vale la prima.
    expect(mosse(damiera({ B: [29, 32], N: [26, 20], n: [18, 28] }))).toEqual(['29x22x13'])
  })

  it('se la prima dama arriva insieme si guarda la seconda: le sequenze si confrontano pezzo per pezzo', () => {
    // Attorno alla dama in 22: da una parte dama, pedina, dama, dama; dall'altra dama, dama, pedina, dama.
    const p = damiera({ B: [22], N: [18, 11, 19], n: [10] })
    expect(mosseLegali(p)).toEqual([{ percorso: [22, 15, 6, 13, 22], prese: [19, 11, 10, 18] }])
  })

  it('quando tutto e’ pari si sceglie: restano tutte e due', () => {
    expect(mosse(damiera({ b: [22], n: [18, 19] }))).toEqual(['22x13', '22x15'])
  })
})

describe('la notazione', () => {
  it('scrive i movimenti con il trattino e le prese con tutte le caselle d’arrivo', () => {
    const p = damiera({ b: [22], n: [18, 10] })
    expect(notazione({ percorso: [22, 18], prese: [] })).toBe('22-18')
    expect(mossaDaNotazione(p, '22x13x6')).toEqual({ percorso: [22, 13, 6], prese: [18, 10] })
    // La forma corta di una presa vale se una sola mossa va da lì a lì.
    expect(mossaDaNotazione(p, '22x6')).toEqual({ percorso: [22, 13, 6], prese: [18, 10] })
    expect(mossaDaNotazione(p, ' 22 X 13 x 6 ')).not.toBeNull()
  })

  it('non trova le mosse che non ci sono, e nemmeno quelle ambigue', () => {
    const p = posizioneIniziale()
    expect(mossaDaNotazione(p, '22-18')).toEqual({ percorso: [22, 18], prese: [] })
    expect(mossaDaNotazione(p, '22-17')).toBeNull()
    expect(mossaDaNotazione(p, '18-22')).toBeNull()
    expect(mossaDaNotazione(p, '9-13')).toBeNull()
    expect(mossaDaNotazione(p, 'e2-e4')).toBeNull()
    expect(mossaDaNotazione(p, '')).toBeNull()
    expect(mossaDaNotazione(p, '22')).toBeNull()
    // Da 22 a 22 la dama gira in due versi diversi, che prendono gli stessi pezzi: la forma corta non basta.
    const giro = damiera({ B: [22], n: [18, 10, 11, 19] })
    expect(mosse(giro)).toEqual(['22x13x6x15x22', '22x15x6x13x22'])
    expect(mossaDaNotazione(giro, '22x22')).toBeNull()
    expect(mossaDaNotazione(giro, '22x15x6x13x22')).toEqual({ percorso: [22, 15, 6, 13, 22], prese: [19, 11, 10, 18] })
  })

  it('ogni mossa legale si ritrova dalla sua notazione', () => {
    for (let seme = 1; seme <= 10; seme += 1) {
      for (const p of partitaACaso(seme).posizioni) {
        for (const m of mosseLegali(p)) expect(mossaDaNotazione(p, notazione(m))).toEqual(m)
      }
    }
  })
})

describe('la fine della partita', () => {
  it('vince chi lascia l’avversario senza pezzi', () => {
    const p = damiera({ b: [22], n: [18] })
    const dopo = gioca(p, mosseLegali(p)[0])
    expect(mosseLegali(dopo)).toEqual([])
    expect(esito(dopo, [chiaveRipetizione(p)])).toEqual({ fine: 'bloccato', vincitore: 'bianco' })
  })

  it('vince chi lascia l’avversario senza mosse', () => {
    // La pedina nera in 28 ha davanti la 31 e la 32, occupate, e non puo' prendere.
    expect(esito(damiera({ b: [31, 32], n: [28] }, 'n'), [])).toEqual({ fine: 'bloccato', vincitore: 'bianco' })
    // Una dama chiusa nel cantone: la 5 e' una dama, e dietro c'e' la 10.
    expect(esito(damiera({ B: [5, 10], N: [1] }, 'n'), [])).toEqual({ fine: 'bloccato', vincitore: 'bianco' })
    // Chi resta bloccato perde anche all'ottantesima semimossa: la vittoria viene prima della patta.
    expect(esito(damiera({ B: [5, 10], N: [1] }, 'n', LIMITE_SENZA_PROGRESSO), [])).toEqual({
      fine: 'bloccato',
      vincitore: 'bianco',
    })
    expect(esito(posizioneIniziale(), [])).toBeNull()
  })

  it('la stessa posizione per la terza volta e’ patta', () => {
    let p = damiera({ B: [29], N: [4] })
    const chiavi: string[] = []
    const giro = ['29-25', '4-8', '25-29', '8-4']
    for (let volta = 0; volta < 2; volta += 1) {
      for (const n of giro) {
        expect(esito(p, chiavi)).toBeNull()
        chiavi.push(chiaveRipetizione(p))
        p = gioca(p, mossaDaNotazione(p, n)!)
      }
    }
    // Dopo due giri la posizione di partenza c'e' per la terza volta, con lo stesso tratto.
    expect(esito(p, chiavi)).toEqual({ fine: 'ripetizione', vincitore: null })
    expect(p.senzaProgresso).toBe(8)
    // Con l'altro giocatore al tratto non sarebbe la stessa posizione.
    expect(esito({ ...p, tratto: 'nero' }, chiavi)).toBeNull()
  })

  it('quaranta mosse per parte di sole dame, senza prese, sono patta', () => {
    const p = damiera({ B: [29], N: [4], b: [23], n: [10] }, 'b', LIMITE_SENZA_PROGRESSO - 1)
    expect(esito(p, [])).toBeNull()
    const dopo = gioca(p, mossaDaNotazione(p, '29-25')!)
    expect(dopo.senzaProgresso).toBe(LIMITE_SENZA_PROGRESSO)
    expect(esito(dopo, [])).toEqual({ fine: 'quaranta', vincitore: null })
    // Una mossa di pedina rimette il conto a zero.
    expect(gioca(p, mossaDaNotazione(p, '23-19')!).senzaProgresso).toBe(0)
  })

  it('il conto delle quaranta mosse riparte a ogni presa, anche di dama', () => {
    const p = damiera({ B: [18], n: [22], N: [1] }, 'b', 50)
    const dopo = gioca(p, mossaDaNotazione(p, '18x27')!)
    expect(dopo.senzaProgresso).toBe(0)
    expect(gioca(dopo, mossaDaNotazione(dopo, '1-5')!).senzaProgresso).toBe(1)
  })

  it('le partite a caso finiscono sempre per una delle regole', () => {
    for (let seme = 1; seme <= 40; seme += 1) {
      const { posizioni } = partitaACaso(seme, 2000)
      const chiavi: string[] = []
      let fine = null
      for (const p of posizioni) {
        fine = esito(p, chiavi)
        if (fine) break
        chiavi.push(chiaveRipetizione(p))
      }
      expect(fine, `partita ${seme}`).not.toBeNull()
    }
  })
})

describe('i tempi del server', () => {
  it('leggere, convalidare, giocare e chiudere una mossa costa molto meno di un millisecondo', () => {
    // Una posizione di mezza partita, con qualche dama e una presa da fare.
    const { posizioni } = partitaACaso(3, 60)
    const testi = posizioni.map(scrivi)
    const chiavi = posizioni.map(chiaveRipetizione)
    const giri = 2000
    const inizio = performance.now()
    for (let i = 0; i < giri; i += 1) {
      const k = i % (testi.length - 1)
      const p = leggi(testi[k])!
      const m = mossaDaNotazione(p, notazione(mosseLegali(posizioni[k])[0]))!
      esito(gioca(p, m), chiavi.slice(0, k + 1))
    }
    const media = (performance.now() - inizio) / giri
    expect(media).toBeLessThan(0.2)
  })
})

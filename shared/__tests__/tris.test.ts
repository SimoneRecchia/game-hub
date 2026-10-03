import { describe, expect, it } from 'vitest'
import {
  PARTITE_TRIS,
  caselleLibere,
  esito,
  gioca,
  leggi,
  posizioneIniziale,
  puntiTris,
  rigioca,
  scrivi,
  segnoDelGiocatore,
  vincentiSubito,
  type PosizioneTris,
} from '../tris'
import {
  DISTRAZIONI,
  computerDellaPartita,
  mossaDelComputer,
  mossaDelGiorno,
  valore,
  valoriDelleMosse,
  vittoriaPossibile,
} from '../tris-computer'
import { POSIZIONI_TRIS, caselleDaIndice, minimaxTris } from '../tris-minimax'
import { VALORI_TRIS } from '../tris-valori'
import { mulberry32 } from '../daily'

/** La posizione dal testo, che deve esistere. */
const pos = (testo: string): PosizioneTris => leggi(testo)!

describe('le regole del tris', () => {
  it('si scrive e si rilegge, e il tratto viene dai segni', () => {
    expect(scrivi(posizioneIniziale())).toBe('.........')
    const p = rigioca([4, 0, 8])!
    expect(scrivi(p)).toBe('1...0...0')
    expect(p.tratto).toBe(1)
    expect(leggi(scrivi(p))).toEqual(p)
  })

  it('non legge le posizioni che non possono esistere', () => {
    expect(leggi('11.......')).toBeNull() // due segni di chi non ha cominciato
    expect(leggi('000......')).toBeNull() // tre di fila senza le risposte
    expect(leggi('00011.1..')).toBeNull() // una mossa dopo il tris
    expect(leggi('000111...')).toBeNull() // due file
    expect(leggi('0........x')).toBeNull()
    expect(leggi('00011....')).not.toBeNull()
  })

  it('tre in fila vincono, la griglia piena senza file e’ patta', () => {
    expect(esito(pos('00011....'))).toEqual({ fine: 'tris', vincitore: 0 })
    expect(esito(pos('011100001'))).toEqual({ fine: 'pieno', vincitore: null })
    expect(esito(pos('0.1......'))).toBeNull()
    // A partita finita non si muove piu'.
    expect(caselleLibere(pos('00011....'))).toEqual([])
    expect(gioca(pos('00011....'), 8)).toBeNull()
  })

  it('una casella presa o fuori dalla griglia non si gioca', () => {
    const p = rigioca([4])!
    expect(gioca(p, 4)).toBeNull()
    expect(gioca(p, 9)).toBeNull()
    expect(gioca(p, 1.5)).toBeNull()
    expect(rigioca([4, 4])).toBeNull()
  })

  it('le caselle che fanno tris subito', () => {
    expect(vincentiSubito(pos('00.11....'))).toEqual([2])
    expect(vincentiSubito(pos('00.11....'), 1)).toEqual([5])
  })
})

describe('i valori', () => {
  it('la tabella e’ il minimax, posizione per posizione', () => {
    const tabella = Uint8Array.from(atob(VALORI_TRIS), (c) => c.charCodeAt(0))
    const memoria = new Map<number, -1 | 0 | 1 | null>()
    for (let i = 0; i < POSIZIONI_TRIS; i += 1) {
      const v = minimaxTris(i, memoria)
      expect((tabella[i >> 2] >> ((i & 3) * 2)) & 3, String(i)).toBe(v === null ? 3 : v + 1)
    }
  })

  it('il tris si pareggia: dall’inizio nessuno vince', () => {
    expect(valore(posizioneIniziale())).toBe(0)
    // Un angolo, e il centro e' l'unica risposta che tiene.
    const dopoAngolo = valoriDelleMosse(rigioca([0])!)
    expect([...dopoAngolo].filter(([, v]) => v === 0).map(([k]) => k)).toEqual([4])
    // Il minimax e la posizione dicono la stessa cosa.
    expect(caselleDaIndice(1 + 2 * 3 ** 4)).toEqual([1, 0, 0, 0, 2, 0, 0, 0, 0])
  })
})

describe('il computer delle libere', () => {
  /** Gioca una partita intera fra un computer a un livello e uno che sceglie a caso. */
  function contro(livello: keyof typeof DISTRAZIONI, seme: number): 'computer' | 'caso' | 'patta' {
    const rng = mulberry32(seme)
    let p = posizioneIniziale()
    const computer = seme % 2 === 0 ? 0 : 1
    for (let fine = esito(p); !fine; fine = esito(p)) {
      const libere = caselleLibere(p)
      const k = p.tratto === computer ? mossaDelComputer(p, livello, rng) : libere[Math.floor(rng() * libere.length)]
      p = gioca(p, k)!
    }
    const fine = esito(p)!
    return fine.vincitore === null ? 'patta' : fine.vincitore === computer ? 'computer' : 'caso'
  }

  it('il difficile non perde mai', () => {
    for (let seme = 0; seme < 300; seme += 1) expect(contro('difficile', seme)).not.toBe('caso')
  })

  it('tutti i livelli fanno tris quando possono, e parano quando devono', () => {
    for (const livello of ['facile', 'normale', 'difficile'] as const) {
      for (let seme = 0; seme < 50; seme += 1) {
        const rng = mulberry32(seme)
        // Il computer ha due in fila e la casella libera: la prende.
        expect(mossaDelComputer(pos('11.00.0..'), livello, rng)).toBe(2)
      }
    }
    // In una posizione persa para almeno la fila che si chiude subito.
    for (let seme = 0; seme < 50; seme += 1) {
      expect(mossaDelComputer(pos('00.1.....'), 'facile', mulberry32(seme))).toBe(2)
    }
  })

  it('il facile sbaglia piu’ del normale', () => {
    const conta = (livello: 'facile' | 'normale') => {
      let vinte = 0
      for (let seme = 0; seme < 400; seme += 1) if (contro(livello, seme) === 'caso') vinte += 1
      return vinte
    }
    expect(conta('facile')).toBeGreaterThan(conta('normale'))
  })
})

describe('il computer della classificata', () => {
  it('e’ lo stesso per tutti: la stessa posizione ha la stessa risposta', () => {
    const c = computerDellaPartita(36, 1)
    const d = computerDellaPartita(36, 1)
    expect(d).toEqual(c)
    expect(computerDellaPartita(36, 2)).not.toEqual(c)
    const p = rigioca([mossaDelGiorno(posizioneIniziale(), c), 4])!
    for (let volta = 0; volta < 5; volta += 1) expect(mossaDelGiorno(p, c)).toBe(mossaDelGiorno(p, c))
  })

  it('il giocatore comincia la prima, la terza e la quinta', () => {
    expect([0, 1, 2, 3, 4].map(segnoDelGiocatore)).toEqual([0, 1, 0, 1, 0])
  })

  it('ogni partita di ogni giorno si puo’ vincere, e il punto debole non e’ la prima risposta', () => {
    for (let giorno = 1; giorno <= 400; giorno += 1) {
      for (let k = 0; k < PARTITE_TRIS; k += 1) {
        const c = computerDellaPartita(giorno, k)
        expect(c.debolezza, `${giorno}:${k}`).toBeGreaterThanOrEqual(0)
        expect(caselleDaIndice(c.debolezza).filter((x) => x !== 0).length).toBeGreaterThanOrEqual(3)
        expect(vittoriaPossibile(posizioneIniziale(), c), `${giorno}:${k}`).toBe(true)
      }
    }
  })

  it('non regala niente: chi gioca a caso perde spesso', () => {
    let perse = 0
    let partite = 0
    for (let giorno = 1; giorno <= 100; giorno += 1) {
      for (let k = 0; k < PARTITE_TRIS; k += 1) {
        const c = computerDellaPartita(giorno, k)
        const rng = mulberry32(giorno * 10 + k)
        let p = posizioneIniziale()
        for (let fine = esito(p); !fine; fine = esito(p)) {
          const libere = caselleLibere(p)
          const m = p.tratto === c.umano ? libere[Math.floor(rng() * libere.length)] : mossaDelGiorno(p, c)
          p = gioca(p, m)!
        }
        partite += 1
        if (esito(p)!.vincitore === 1 - c.umano) perse += 1
      }
    }
    expect(perse / partite).toBeGreaterThan(0.4)
  })
})

describe('i punti', () => {
  it('dieci per finire, otto a vittoria, quattro a patta: al massimo cinquanta', () => {
    expect(puntiTris(0, 0)).toBe(10)
    expect(puntiTris(0, PARTITE_TRIS)).toBe(30)
    expect(puntiTris(PARTITE_TRIS, 0)).toBe(50)
    // Una giornata storta, con una vittoria e due patte, vale piu' della meta' della perfetta.
    expect(puntiTris(1, 2) / puntiTris(PARTITE_TRIS, 0)).toBeGreaterThan(0.5)
  })
})

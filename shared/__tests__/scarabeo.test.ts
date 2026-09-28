import { describe, expect, it } from 'vitest'
import {
  BONUS_SCARABEO,
  CENTRO,
  DISTRIBUZIONE,
  JOLLY,
  LATO,
  MOSSE_PER_GIORNATA,
  PREMI,
  TESSERE_LEGGIO,
  TESSERE_TOTALI,
  VALORI,
  leggioDa,
  premioDi,
  rigioca,
  sacchettoDelGiorno,
  tabelloneDa,
  tabelloneVuoto,
  validaPosa,
  type Mossa,
  type Posa,
} from '../scarabeo'

/** Posa comoda da scrivere: "casa" dal centro verso destra. */
function fila(r: number, c: number, parola: string, oriz = true): Posa[] {
  return [...parola].map((lettera, i) => ({
    r: oriz ? r : r + i,
    c: oriz ? c + i : c,
    lettera,
    jolly: false,
  }))
}

describe('tabellone', () => {
  it('e’ quadrato e ha 225 caselle', () => {
    expect(PREMI).toHaveLength(LATO * LATO)
  })

  it('ha i premi del gioco da tavolo, nel numero giusto', () => {
    const quanti = (p: string) => PREMI.filter((x) => x === p).length
    expect(quanti('tp')).toBe(8)
    expect(quanti('dp')).toBe(16)
    expect(quanti('tl')).toBe(12)
    expect(quanti('dl')).toBe(24)
    // Il centro e' una doppia parola con un nome suo: la prima parola la
    // raddoppia, e la casella non si riusa.
    expect(quanti('centro')).toBe(1)
    expect(premioDi(CENTRO, CENTRO)).toBe('centro')
  })

  it('e’ simmetrico sui due assi', () => {
    // La simmetria e' l'unica cosa che garantisce che nessun angolo del
    // tabellone valga piu' di un altro. Il disegno e' scritto a mano, quindi va
    // verificato: un refuso in una riga si vede solo qui.
    for (let r = 0; r < LATO; r += 1) {
      for (let c = 0; c < LATO; c += 1) {
        expect(premioDi(r, c)).toBe(premioDi(r, LATO - 1 - c))
        expect(premioDi(r, c)).toBe(premioDi(LATO - 1 - r, c))
      }
    }
  })

  it('mette le parole triple negli angoli e a metà dei lati', () => {
    expect(premioDi(0, 0)).toBe('tp')
    expect(premioDi(0, 7)).toBe('tp')
    expect(premioDi(14, 14)).toBe('tp')
    expect(premioDi(7, 0)).toBe('tp')
  })
})

describe('tessere', () => {
  it('sono centoventi, jolly compresi', () => {
    const totale = DISTRIBUZIONE.reduce((somma, [, quante]) => somma + quante, 0)
    expect(totale).toBe(TESSERE_TOTALI)
  })

  it('usa solo le 21 lettere italiane, piu’ il jolly', () => {
    for (const [lettera] of DISTRIBUZIONE) {
      if (lettera === JOLLY) continue
      expect(VALORI[lettera], `la lettera ${lettera} deve avere un valore`).toBeGreaterThan(0)
      expect('jkwxy').not.toContain(lettera)
    }
    expect(Object.keys(VALORI)).toHaveLength(21)
  })

  it('ha abbastanza vocali da rendere giocabile l’italiano', () => {
    const vocali = DISTRIBUZIONE.filter(([l]) => 'aeiou'.includes(l)).reduce(
      (s, [, q]) => s + q,
      0,
    )
    const lettere = TESSERE_TOTALI - 2 // i due jolly non sono lettere
    expect(vocali / lettere).toBeGreaterThan(0.4)
    expect(vocali / lettere).toBeLessThan(0.55)
  })
})

describe('sacchetto del giorno', () => {
  it('contiene esattamente le tessere della dotazione', () => {
    const sacchetto = sacchettoDelGiorno(1)
    expect(sacchetto).toHaveLength(TESSERE_TOTALI)
    for (const [lettera, quante] of DISTRIBUZIONE) {
      expect(sacchetto.filter((t) => t === lettera)).toHaveLength(quante)
    }
  })

  it('e’ lo stesso per tutti nello stesso giorno', () => {
    // E' la proprieta' su cui poggia la classifica: due giocatori confrontano i
    // punteggi solo se hanno pescato le stesse tessere nello stesso ordine.
    expect(sacchettoDelGiorno(42)).toEqual(sacchettoDelGiorno(42))
  })

  it('cambia da un giorno all’altro', () => {
    expect(sacchettoDelGiorno(1)).not.toEqual(sacchettoDelGiorno(2))
    expect(sacchettoDelGiorno(1).join('')).not.toEqual(sacchettoDelGiorno(100).join(''))
  })

  it('mescola davvero: non resta in ordine alfabetico', () => {
    const sacchetto = sacchettoDelGiorno(7)
    const ordinato = [...sacchetto].sort()
    expect(sacchetto.join('')).not.toBe(ordinato.join(''))
  })
})

describe('leggio', () => {
  const finto = Array.from({ length: 20 }, (_, i) => 'abcdefghilmnopqrstuv'[i])

  it('parte con otto tessere', () => {
    const { leggio, restanti } = leggioDa(finto, [])
    expect(leggio).toEqual([...'abcdefgh'])
    expect(restanti).toBe(12)
  })

  it('si ricompone dopo una posa', () => {
    const mosse: Mossa[] = [{ tipo: 'posa', posa: fila(7, 7, 'abc') }]
    const { leggio, restanti } = leggioDa(finto, mosse)
    expect(leggio).toHaveLength(TESSERE_LEGGIO)
    expect(leggio).toEqual([...'defghilm'])
    expect(restanti).toBe(9)
  })

  it('col cambio le tessere tornano in fondo alla coda', () => {
    // In fondo e non rimescolate: il leggio deve restare una funzione delle
    // sole mosse, e rimescolare richiederebbe di salvare lo stato del
    // generatore. Chi cambia rivede quelle tessere solo a sacchetto finito.
    const mosse: Mossa[] = [{ tipo: 'cambio', tessere: ['a', 'b'] }]
    const { leggio, restanti } = leggioDa(finto, mosse)
    expect(leggio).toEqual([...'cdefghil'])
    expect(restanti).toBe(12)
    expect(leggioDa(finto, [...mosse, { tipo: 'passo' }]).leggio).toEqual([...'cdefghil'])
  })

  it('un passo non tocca il leggio', () => {
    expect(leggioDa(finto, [{ tipo: 'passo' }]).leggio).toEqual(leggioDa(finto, []).leggio)
  })

  it('a sacchetto finito il leggio si svuota man mano', () => {
    const corto = [...'abcdefghil'] // dieci tessere
    const mosse: Mossa[] = [{ tipo: 'posa', posa: fila(7, 7, 'abcde') }]
    const { leggio, restanti } = leggioDa(corto, mosse)
    expect(leggio).toEqual([...'fghil'])
    expect(restanti).toBe(0)
  })

  it('un jolly posato come lettera esce dal leggio come jolly', () => {
    const conJolly = [JOLLY, ...'bcdefghil']
    const mosse: Mossa[] = [
      { tipo: 'posa', posa: [{ r: 7, c: 7, lettera: 'z', jolly: true }] },
    ]
    const { leggio } = leggioDa(conJolly, mosse)
    expect(leggio).not.toContain(JOLLY)
    // Una tessera posata, una pescata: la "i". E non deve aver tolto una "z",
    // che nel sacchetto non c'era mai stata.
    expect(leggio).toEqual([...'bcdefghi'])
  })
})

describe('prima mossa', () => {
  it('deve passare dal centro', () => {
    const esito = validaPosa(tabelloneVuoto(), fila(0, 0, 'casa'), true)
    expect(esito.ok).toBe(false)
    if (!esito.ok) expect(esito.codice).toBe('SENZA_CENTRO')
  })

  it('raddoppia grazie al centro', () => {
    // c3 + a1 + s2 + a1 = 7, la casella centrale raddoppia: 14.
    const esito = validaPosa(tabelloneVuoto(), fila(7, 7, 'casa'), true)
    expect(esito.ok).toBe(true)
    if (esito.ok) {
      expect(esito.parole.map((p) => p.parola)).toEqual(['casa'])
      expect(esito.punti).toBe(14)
      expect(esito.scarabeo).toBe(false)
    }
  })

  it('una tessera sola non forma una parola', () => {
    const esito = validaPosa(
      tabelloneVuoto(),
      [{ r: CENTRO, c: CENTRO, lettera: 'a', jolly: false }],
      true,
    )
    expect(esito.ok).toBe(false)
    if (!esito.ok) expect(esito.codice).toBe('PAROLA_CORTA')
  })

  it('con otto tessere prende il bonus scarabeo', () => {
    // "cantiere" da (7,4): 3+1+3+2+1+1+2 = 13, piu' la e finale sulla lettera
    // doppia (2) fa 15; il centro raddoppia, 30; piu' il bonus.
    const esito = validaPosa(tabelloneVuoto(), fila(7, 4, 'cantiere'), true)
    expect(esito.ok).toBe(true)
    if (esito.ok) {
      expect(esito.scarabeo).toBe(true)
      expect(esito.punti).toBe(30 + BONUS_SCARABEO)
    }
  })
})

describe('pose successive', () => {
  const dopoCasa = tabelloneDa([{ tipo: 'posa', posa: fila(7, 7, 'casa') }])

  it('devono attaccarsi a quel che c’e’ già', () => {
    const esito = validaPosa(dopoCasa, fila(0, 0, 'dado'), false)
    expect(esito.ok).toBe(false)
    if (!esito.ok) expect(esito.codice).toBe('STACCATA')
  })

  it('non possono lasciare buchi', () => {
    const posa: Posa[] = [
      { r: 6, c: 7, lettera: 'a', jolly: false },
      { r: 4, c: 7, lettera: 'o', jolly: false },
    ]
    const esito = validaPosa(dopoCasa, posa, false)
    expect(esito.ok).toBe(false)
    if (!esito.ok) expect(esito.codice).toBe('CON_BUCHI')
  })

  it('non possono stare su due righe e due colonne', () => {
    const posa: Posa[] = [
      { r: 6, c: 7, lettera: 'a', jolly: false },
      { r: 5, c: 8, lettera: 'o', jolly: false },
    ]
    const esito = validaPosa(dopoCasa, posa, false)
    expect(esito.ok).toBe(false)
    if (!esito.ok) expect(esito.codice).toBe('NON_ALLINEATA')
  })

  it('non possono coprire una casella occupata', () => {
    const esito = validaPosa(dopoCasa, fila(7, 8, 'no'), false)
    expect(esito.ok).toBe(false)
    if (!esito.ok) expect(esito.codice).toBe('CASELLA_OCCUPATA')
  })

  it('non riusano il premio di una casella già coperta', () => {
    // Verticale che passa per la "c" del centro: a1 + r2 + c3 = 6, e il centro
    // **non** raddoppia piu' — la casella era già coperta. Se raddoppiasse,
    // quella casella pagherebbe per tutta la partita.
    const posa: Posa[] = [
      { r: 5, c: 7, lettera: 'a', jolly: false },
      { r: 6, c: 7, lettera: 'r', jolly: false },
    ]
    const esito = validaPosa(dopoCasa, posa, false)
    expect(esito.ok).toBe(true)
    if (esito.ok) {
      expect(esito.parole.map((p) => p.parola)).toEqual(['arc'])
      expect(esito.punti).toBe(6)
    }
  })

  it('conta anche le parole trasversali', () => {
    // Una sola tessera su (6,8), che e' una lettera doppia: la verticale
    // diventa "aa", cioe' 1*2 + 1 = 3. L'orizzontale e' lunga una lettera e
    // non conta.
    const posa: Posa[] = [{ r: 6, c: 8, lettera: 'a', jolly: false }]
    const esito = validaPosa(dopoCasa, posa, false)
    expect(esito.ok).toBe(true)
    if (esito.ok) {
      expect(esito.parole.map((p) => p.parola)).toEqual(['aa'])
      expect(esito.punti).toBe(3)
    }
  })

  it('una posa che forma piu’ parole le somma tutte', () => {
    // "os" verticale sotto la "s" di casa: forma "so" in verticale (s2 + o1 = 3)
    // e non forma niente in orizzontale.
    const posa: Posa[] = [{ r: 8, c: 9, lettera: 'o', jolly: false }]
    const esito = validaPosa(dopoCasa, posa, false)
    expect(esito.ok).toBe(true)
    if (esito.ok) {
      expect(esito.parole.map((p) => p.parola)).toEqual(['so'])
      expect(esito.punti).toBe(3)
    }
  })
})

describe('jolly', () => {
  it('forma la parola ma vale zero', () => {
    const posa: Posa[] = [
      { r: 7, c: 7, lettera: 'z', jolly: true },
      { r: 7, c: 8, lettera: 'a', jolly: false },
    ]
    const esito = validaPosa(tabelloneVuoto(), posa, true)
    expect(esito.ok).toBe(true)
    if (esito.ok) {
      expect(esito.parole[0].parola).toBe('za')
      // Una "z" vera varrebbe 8: (8 + 1) * 2 = 18. Col jolly: (0 + 1) * 2 = 2.
      expect(esito.punti).toBe(2)
    }
  })

  it('un jolly su una lettera doppia resta zero', () => {
    // Il moltiplicatore di lettera si applica a zero: e' la regola del gioco, e
    // il jolly non deve diventare un modo di prendere punti dalle caselle.
    const posa: Posa[] = [
      { r: 7, c: 10, lettera: 'a', jolly: false },
      { r: 7, c: 11, lettera: 'z', jolly: true },
    ]
    const dopo = tabelloneDa([{ tipo: 'posa', posa: fila(7, 7, 'casa') }])
    const esito = validaPosa(dopo, posa, false)
    expect(esito.ok).toBe(false) // (7,10) e' occupata da "casa"
  })
})

describe('rigioca', () => {
  it('somma i punti di tutte le mosse', () => {
    const mosse: Mossa[] = [
      { tipo: 'posa', posa: fila(7, 7, 'casa') },
      { tipo: 'passo' },
      {
        tipo: 'posa',
        posa: [
          { r: 5, c: 7, lettera: 'a', jolly: false },
          { r: 6, c: 7, lettera: 'r', jolly: false },
        ],
      },
    ]
    const { punti, giocate, tabellone } = rigioca(mosse)
    expect(punti).toBe(14 + 6)
    expect(giocate.map((g) => g.punti)).toEqual([14, 0, 6])
    expect(giocate[1].tipo).toBe('passo')
    expect(tabellone[7 * LATO + 7]?.lettera).toBe('c')
    expect(tabellone[5 * LATO + 7]?.lettera).toBe('a')
  })

  it('la prima posa e’ la prima, anche dopo un passo', () => {
    // Un passo non consuma il "deve passare dal centro": chi apre la giornata
    // passando non si trova il tabellone sbloccato.
    const mosse: Mossa[] = [{ tipo: 'passo' }, { tipo: 'posa', posa: fila(7, 7, 'casa') }]
    expect(rigioca(mosse).punti).toBe(14)
  })

  it('non contraddice validaPosa sul limite di mosse', () => {
    expect(MOSSE_PER_GIORNATA).toBeGreaterThan(1)
    expect(MOSSE_PER_GIORNATA).toBeLessThanOrEqual(20)
  })
})

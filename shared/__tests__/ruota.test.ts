import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../daily'
import type { CategoriaQuiz } from '../quiz'
import {
  CASELLE_CASH_HUNT,
  CATEGORIE_RUOTA,
  CATEGORIE_RUOTA_ALTRE,
  CATEGORIE_RUOTA_GEOGRAFIA,
  FILE_PACHINKO,
  FORTUNATO,
  MOLTIPLICATORE_FISSO,
  MOLTIPLICATORE_SPLIT,
  MOLTIPLICATORI_MONETA,
  MOLTIPLICATORI_MONETA_FORTUNATA,
  MOLTIPLICATORI_PACHINKO,
  MOLTIPLICATORI_PACHINKO_FORTUNATI,
  MOLTIPLICATORI_QUIZ,
  MOLTIPLICATORI_QUIZ_FORTUNATI,
  MURO_CASH_HUNT,
  MURO_CASH_HUNT_FORTUNATO,
  POSTO_FORTUNA,
  PUNTATA_MINIMA,
  SPICCHI_FORTUNATI,
  SPICCHI_QUIZ,
  SPICCHI_RUOTA,
  STRADE_PACHINKO,
  bucaDi,
  categorieDelGiorno,
  categorieDelQuiz,
  deltaDi,
  eSfida,
  etichettaDi,
  improntaDomanda,
  mediaPachinko,
  mescolaMuro,
  moltiplicatoriMoneta,
  moltiplicatoriPachinko,
  moltiplicatoriQuiz,
  muroCashHunt,
  nomeDi,
  pagaSubito,
  percorsoACaso,
  puntataValida,
  resa,
  scriviMoltiplicatore,
  valoreDi,
  vincitaDi,
  type Spicchio,
  type TipoSpicchio,
} from '../ruota'

const N = SPICCHI_RUOTA.length
const conta = (spicchi: readonly Spicchio[], prova: (s: Spicchio) => boolean) => spicchi.filter(prova).length
const diTipo = (tipo: TipoSpicchio) => (s: Spicchio) => s.tipo === tipo
const per = (m: number) => (s: Spicchio) => s.tipo === 'fisso' && s.moltiplicatore === m
const posti = (spicchi: readonly Spicchio[], tipo: TipoSpicchio) =>
  spicchi.flatMap((s, i) => (s.tipo === tipo ? [i] : []))
const media = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
const quanti = (xs: readonly number[], m: number) => xs.filter((x) => x === m).length
/** Gli spicchi semplici: il banco e lo split. Gli altri sono speciali. */
const semplice = (s: Spicchio) => s.tipo === 'banco' || s.tipo === 'split'

/**
 * Quel che uno spicchio restituisce in media, in punti veri, a una puntata:
 * con le vincite arrotondate per difetto, come le paga il server.
 */
function inPunti(s: Spicchio, fortunata: boolean, puntata: number, giusta: number): number {
  switch (s.tipo) {
    case 'banco':
      return 0
    case 'split':
      return vincitaDi(puntata, MOLTIPLICATORE_SPLIT)
    case 'fisso':
      return vincitaDi(puntata, s.moltiplicatore)
    case 'moneta':
      return media(moltiplicatoriMoneta(fortunata).map((m) => vincitaDi(puntata, m))) / 2
    case 'quiz':
      return giusta * media(moltiplicatoriQuiz(fortunata).map((m) => vincitaDi(puntata, m)))
    case 'pachinko':
      return (
        moltiplicatoriPachinko(fortunata).reduce((a, m, k) => a + vincitaDi(puntata, m) * STRADE_PACHINKO[k], 0) /
        2 ** FILE_PACHINKO
      )
    case 'cashhunt':
      return media(muroCashHunt(fortunata).map((m) => vincitaDi(puntata, m)))
    case 'fortuna':
      return media(SPICCHI_FORTUNATI.map((f) => inPunti(f, true, puntata, giusta)))
  }
}

const restituitoInPunti = (puntata: number, giusta: number) =>
  media(SPICCHI_RUOTA.map((s) => inPunti(s, false, puntata, giusta)))

/** Quanti posti ci sono fra due spicchi, girando dalla parte piu' corta. */
function distanza(a: number, b: number, n = N): number {
  const d = Math.abs(a - b)
  return Math.min(d, n - d)
}

/** Ogni coppia di spicchi vicini, girando tutta la ruota. */
const vicini = (ruota: readonly Spicchio[]) =>
  ruota.map((s, i) => [s, ruota[(i + 1) % ruota.length], i] as const)

/** Un caso fisso per le prove: lo stesso intero di quello del server, da un generatore con il seme. */
const casoDa = (seme: number) => {
  const r = mulberry32(seme)
  return (n: number) => Math.floor(r() * n)
}

/** Tutti i moltiplicatori che una puntata puo' incontrare, sulle due ruote e nei minigiochi. */
const TUTTI = [
  ...new Set([
    ...SPICCHI_RUOTA.flatMap((s) => (pagaSubito(s) === null ? [] : [pagaSubito(s)!])),
    ...SPICCHI_FORTUNATI.flatMap((s) => (pagaSubito(s) === null ? [] : [pagaSubito(s)!])),
    ...MOLTIPLICATORI_QUIZ,
    ...MOLTIPLICATORI_QUIZ_FORTUNATI,
    ...MOLTIPLICATORI_MONETA,
    ...MOLTIPLICATORI_MONETA_FORTUNATA,
    ...MOLTIPLICATORI_PACHINKO,
    ...MOLTIPLICATORI_PACHINKO_FORTUNATI,
    ...MURO_CASH_HUNT,
    ...MURO_CASH_HUNT_FORTUNATO,
  ]),
].sort((a, b) => a - b)

describe('la ruota', () => {
  it('ha venti spicchi: cinque banchi, sei split, tre quiz, due monete, e uno ciascuno degli altri', () => {
    expect(N).toBe(20)
    const quantiDi = (tipo: TipoSpicchio) => conta(SPICCHI_RUOTA, diTipo(tipo))
    const tipi: TipoSpicchio[] = ['banco', 'split', 'quiz', 'moneta', 'fisso', 'fortuna', 'pachinko', 'cashhunt']
    expect(tipi.map(quantiDi)).toEqual([5, 6, 3, 2, 1, 1, 1, 1])
    expect(conta(SPICCHI_RUOTA, per(MOLTIPLICATORE_FISSO))).toBe(1)
    expect(SPICCHI_RUOTA.filter(eSfida)).toHaveLength(8)
    expect(SPICCHI_RUOTA[POSTO_FORTUNA].tipo).toBe('fortuna')
  })

  it('il triplo in cima, dove la ruota sta prima del primo giro, e la fortuna di fronte', () => {
    expect(SPICCHI_RUOTA[0]).toEqual({ tipo: 'fisso', moltiplicatore: 3 })
    expect(POSTO_FORTUNA).toBe(N / 2)
  })

  it('ogni spicchio speciale sta fra due semplici, e mai due banchi o due split vicini', () => {
    for (const [a, b, i] of vicini(SPICCHI_RUOTA)) {
      expect(semplice(a) || semplice(b), `spicchi ${i} e ${i + 1}`).toBe(true)
      expect(a.tipo === b.tipo && semplice(a), `spicchi ${i} e ${i + 1}`).toBe(false)
    }
  })

  it('i quiz ad almeno sei spicchi l’uno dall’altro, e le due monete una di fronte all’altra', () => {
    const quiz = posti(SPICCHI_RUOTA, 'quiz')
    for (const [k, q] of quiz.entries()) expect(distanza(q, quiz[(k + 1) % quiz.length])).toBeGreaterThanOrEqual(6)
    const [m1, m2] = posti(SPICCHI_RUOTA, 'moneta')
    expect(distanza(m1, m2)).toBe(N / 2)
  })

  it('si scrive per esteso per chi non vede', () => {
    expect(etichettaDi(SPICCHI_RUOTA[0])).toBe('×3')
    expect(nomeDi(SPICCHI_RUOTA[0])).toBe('Triplo')
    expect(nomeDi({ tipo: 'banco' })).toBe('Banco')
    expect([etichettaDi({ tipo: 'quiz' }), nomeDi({ tipo: 'quiz' })]).toEqual(['QUIZ', 'Quiz'])
    expect([etichettaDi({ tipo: 'split' }), nomeDi({ tipo: 'split' })]).toEqual(['SPLIT', 'Split'])
    expect([etichettaDi({ tipo: 'pachinko' }), nomeDi({ tipo: 'pachinko' })]).toEqual(['PACHINKO', 'Pachinko'])
    expect([etichettaDi({ tipo: 'cashhunt' }), nomeDi({ tipo: 'cashhunt' })]).toEqual(['CASH HUNT', 'Cash Hunt'])
    expect(nomeDi(SPICCHI_RUOTA[POSTO_FORTUNA])).toBe('Fortuna')
    expect(SPICCHI_FORTUNATI.filter((s) => s.tipo === 'fisso' && s.moltiplicatore >= 3).map(nomeDi).sort()).toEqual([
      'Decuplo',
      'Quintuplo',
      'Triplo',
      'Triplo',
    ])
    expect(etichettaDi(SPICCHI_FORTUNATI[0])).toBe('×10')
    expect(nomeDi({ tipo: 'fisso', moltiplicatore: 1.5 })).toBe('×1,5')
  })

  it('paga subito i premi fissi e lo split, e lascia ai minigiochi il resto', () => {
    expect(pagaSubito({ tipo: 'fisso', moltiplicatore: 3 })).toBe(3)
    expect(pagaSubito({ tipo: 'split' })).toBe(0.5)
    for (const tipo of ['banco', 'quiz', 'moneta', 'pachinko', 'cashhunt', 'fortuna'] as const) {
      expect(pagaSubito({ tipo }), tipo).toBeNull()
    }
    // Uno spicchio o paga subito, o apre un minigioco, o e' il banco.
    for (const s of [...SPICCHI_RUOTA, ...SPICCHI_FORTUNATI]) {
      expect([pagaSubito(s) !== null, eSfida(s), s.tipo === 'banco'].filter(Boolean)).toHaveLength(1)
    }
  })
})

describe('la ruota fortunata', () => {
  it('e’ la ruota con i premi saliti, spicchio per spicchio', () => {
    expect(SPICCHI_FORTUNATI).toHaveLength(N)
    for (let i = 0; i < N; i += 1) {
      const [prima, dopo] = [SPICCHI_RUOTA[i], SPICCHI_FORTUNATI[i]]
      const atteso: readonly string[] =
        prima.tipo === 'fisso'
          ? ['fisso:10']
          : prima.tipo === 'fortuna'
            ? ['fisso:5']
            : prima.tipo === 'banco'
              ? ['banco', 'fisso:3', 'quiz']
              : prima.tipo === 'split'
                ? ['fisso:1.5']
                : [prima.tipo]
      const chiave = dopo.tipo === 'fisso' ? `fisso:${dopo.moltiplicatore}` : dopo.tipo
      expect(atteso, `spicchio ${i}`).toContain(chiave)
    }
  })

  it('ha un ×10, un ×5, due ×3, sei ×1,5, due banchi, quattro quiz, due monete, e niente fortuna né split', () => {
    expect([10, 5, 3, 1.5].map((m) => conta(SPICCHI_FORTUNATI, per(m)))).toEqual([1, 1, 2, 6])
    const tipi: TipoSpicchio[] = ['banco', 'quiz', 'moneta', 'pachinko', 'cashhunt', 'fortuna', 'split']
    expect(tipi.map((t) => conta(SPICCHI_FORTUNATI, diTipo(t)))).toEqual([2, 4, 2, 1, 1, 0, 0])
    // Il ×10 dove era il triplo, il ×5 dove era la fortuna.
    expect(SPICCHI_FORTUNATI[0]).toEqual({ tipo: 'fisso', moltiplicatore: 10 })
    expect(SPICCHI_FORTUNATI[POSTO_FORTUNA]).toEqual({ tipo: 'fisso', moltiplicatore: 5 })
  })

  it('mai due quiz o due banchi vicini', () => {
    for (const [a, b, i] of vicini(SPICCHI_FORTUNATI)) {
      expect(a.tipo === b.tipo && (a.tipo === 'banco' || a.tipo === 'quiz'), `spicchi ${i} e ${i + 1}`).toBe(false)
    }
  })

  it('la sua moneta paga di piu’', () => {
    expect(MOLTIPLICATORI_MONETA_FORTUNATA).toEqual([2, 3, 4, 5])
    expect(Math.min(...MOLTIPLICATORI_MONETA_FORTUNATA)).toBeGreaterThan(Math.min(...MOLTIPLICATORI_MONETA))
  })
})

describe('la ruota del quiz', () => {
  it('ha dodici spicchi: ×1,25 tre, ×1,5 tre, ×1,75 due, ×2 due, ×3 uno, ×4 uno', () => {
    expect(SPICCHI_QUIZ).toBe(12)
    expect([4, 3, 2, 1.75, 1.5, 1.25].map((m) => quanti(MOLTIPLICATORI_QUIZ, m))).toEqual([1, 1, 2, 2, 3, 3])
    expect(MOLTIPLICATORI_QUIZ[0]).toBe(4)
  })

  it('dalla fortuna ogni moltiplicatore sale, il ×4 fino al ×10, e nessuno resta com’era', () => {
    expect(FORTUNATO).toEqual({ '1.25': 1.5, '1.5': 2, '1.75': 2.5, '2': 3, '3': 5, '4': 10 })
    expect(MOLTIPLICATORI_QUIZ_FORTUNATI).toEqual([10, 1.5, 2, 2.5, 1.5, 3, 2, 5, 1.5, 2.5, 2, 3])
    MOLTIPLICATORI_QUIZ.forEach((m, i) => expect(MOLTIPLICATORI_QUIZ_FORTUNATI[i]).toBeGreaterThan(m))
    expect([10, 5].map((m) => quanti(MOLTIPLICATORI_QUIZ_FORTUNATI, m))).toEqual([1, 1])
    expect(MOLTIPLICATORI_QUIZ_FORTUNATI.filter((m) => m < 5).every((m) => m <= 3)).toBe(true)
  })

  it('mai due moltiplicatori uguali vicini, né sulla ruota normale né su quella fortunata', () => {
    for (const ruota of [MOLTIPLICATORI_QUIZ, MOLTIPLICATORI_QUIZ_FORTUNATI]) {
      for (let i = 0; i < ruota.length; i += 1) {
        expect(ruota[i], `spicchi ${i} e ${i + 1}`).not.toBe(ruota[(i + 1) % ruota.length])
      }
    }
  })

  it('pesca dodici categorie fra quelle con domande, tutte diverse quando ce ne sono abbastanza', () => {
    for (let seme = 1; seme <= 200; seme += 1) {
      const c = categorieDelQuiz(CATEGORIE_RUOTA, casoDa(seme))
      expect(c).toHaveLength(12)
      expect(new Set(c).size).toBe(12)
      expect(c.every((x) => CATEGORIE_RUOTA.includes(x))).toBe(true)
    }
    // Le due che restano fuori cambiano: in duecento ruote ci finiscono tutte.
    const viste = new Set<CategoriaQuiz>()
    for (let seme = 1; seme <= 200; seme += 1) {
      for (const x of categorieDelQuiz(CATEGORIE_RUOTA, casoDa(seme))) viste.add(x)
    }
    expect(viste.size).toBe(14)
  })

  it('con meno categorie le ripete quasi alla pari, e due spicchi vicini non sono mai della stessa', () => {
    for (let quante = 1; quante <= 11; quante += 1) {
      for (let seme = 1; seme <= 60; seme += 1) {
        const disponibili = CATEGORIE_RUOTA.slice(seme % 3, (seme % 3) + quante)
        const c = categorieDelQuiz(disponibili, casoDa(seme * 31 + quante))
        expect(c).toHaveLength(12)
        expect(new Set(c)).toEqual(new Set(disponibili))
        const volte = disponibili.map((x) => c.filter((y) => y === x).length)
        expect(Math.max(...volte) - Math.min(...volte), `${quante} categorie`).toBeLessThanOrEqual(1)
        if (quante === 1) continue
        for (let i = 0; i < 12; i += 1) expect(c[i], `${quante}: spicchi ${i} e ${i + 1}`).not.toBe(c[(i + 1) % 12])
      }
    }
    expect(categorieDelQuiz([], casoDa(1))).toEqual([])
  })

  it('il ×4 non va sempre alla categoria piu’ ripetuta', () => {
    const inCima = new Set<CategoriaQuiz>()
    for (let seme = 1; seme <= 40; seme += 1) {
      inCima.add(categorieDelQuiz(['capitali', 'arte', 'libri'], casoDa(seme))[0])
    }
    expect(inCima.size).toBe(3)
  })
})

describe('il Pachinko', () => {
  it('ha nove buche simmetriche, e nessuna ridà la puntata com’era', () => {
    expect(MOLTIPLICATORI_PACHINKO).toEqual([15, 4, 2, 1.5, 0.5, 1.5, 2, 4, 15])
    expect(MOLTIPLICATORI_PACHINKO).toHaveLength(FILE_PACHINKO + 1)
    expect([...MOLTIPLICATORI_PACHINKO].reverse()).toEqual(MOLTIPLICATORI_PACHINKO)
    expect(MOLTIPLICATORI_PACHINKO).not.toContain(1)
  })

  it('dalla fortuna il ×0,5 diventa ×1,5 e ogni altra buca raddoppia', () => {
    expect(MOLTIPLICATORI_PACHINKO_FORTUNATI).toEqual([30, 8, 4, 3, 1.5, 3, 4, 8, 30])
    MOLTIPLICATORI_PACHINKO.forEach((m, k) =>
      expect(MOLTIPLICATORI_PACHINKO_FORTUNATI[k], `buca ${k}`).toBe(m === 0.5 ? 1.5 : m * 2),
    )
    expect(MOLTIPLICATORI_PACHINKO_FORTUNATI).not.toContain(1)
  })

  it('a ogni fila la pallina va a destra una volta su due: le strade sono quelle di Tartaglia', () => {
    expect(STRADE_PACHINKO).toEqual([1, 8, 28, 56, 70, 56, 28, 8, 1])
    // Tutte le strade possibili, una per ogni numero di otto cifre binarie: quante finiscono in ogni buca.
    const finite = new Array<number>(FILE_PACHINKO + 1).fill(0)
    for (let k = 0; k < 2 ** FILE_PACHINKO; k += 1) {
      let fila = 0
      const percorso = percorsoACaso((n) => {
        expect(n).toBe(2)
        return (k >> fila++) & 1
      })
      expect(percorso).toHaveLength(FILE_PACHINKO)
      finite[bucaDi(percorso)] += 1
    }
    expect(finite).toEqual(STRADE_PACHINKO)
    expect(bucaDi([1, 1, 0, 1, 0, 0, 1, 1])).toBe(5)
  })

  it('rende 409/256 della puntata, e dalla fortuna 853/256', () => {
    expect(mediaPachinko(false)).toBe(409 / 256)
    expect(mediaPachinko(true)).toBe(853 / 256)
    expect(valoreDi({ tipo: 'pachinko' }, false, 0)).toBe(409 / 256)
    expect(valoreDi({ tipo: 'pachinko' }, true, 0)).toBe(853 / 256)
  })
})

describe('il Cash Hunt', () => {
  it('ha dodici caselle: ×0,5 cinque, ×1,5 tre, ×2 due, ×3 e ×5 una, dalla piu’ grande', () => {
    expect(CASELLE_CASH_HUNT).toBe(12)
    expect([5, 3, 2, 1.5, 0.5].map((m) => quanti(MURO_CASH_HUNT, m))).toEqual([1, 1, 2, 3, 5])
    expect([...MURO_CASH_HUNT].sort((a, b) => b - a)).toEqual(MURO_CASH_HUNT)
    expect(MURO_CASH_HUNT).not.toContain(1)
  })

  it('dalla fortuna il ×0,5 diventa ×1,5 e ogni altra casella raddoppia, fino al ×10', () => {
    expect(MURO_CASH_HUNT_FORTUNATO).toEqual([10, 6, 4, 4, 3, 3, 3, 1.5, 1.5, 1.5, 1.5, 1.5])
    MURO_CASH_HUNT.forEach((m, k) => expect(MURO_CASH_HUNT_FORTUNATO[k]).toBe(m === 0.5 ? 1.5 : m * 2))
  })

  it('rende 19/12 della puntata, e dalla fortuna 3,375', () => {
    expect(valoreDi({ tipo: 'cashhunt' }, false, 0)).toBe(19 / 12)
    expect(valoreDi({ tipo: 'cashhunt' }, true, 0)).toBe(3.375)
  })

  it('il muro mescolato ha sempre le stesse caselle, e il ×5 puo’ stare dovunque', () => {
    const dove = new Set<number>()
    for (let seme = 1; seme <= 400; seme += 1) {
      for (const fortunata of [false, true]) {
        const muro = mescolaMuro(fortunata, casoDa(seme))
        expect([...muro].sort((a, b) => b - a)).toEqual(muroCashHunt(fortunata))
        if (!fortunata) dove.add(muro.indexOf(5))
      }
    }
    expect(dove.size).toBe(CASELLE_CASH_HUNT)
  })
})

describe('le categorie del giorno della slot', () => {
  const giorni = Array.from({ length: 400 }, (_, i) => i + 1)

  it('sono sei, tre di geografia e tre delle altre materie, alternate', () => {
    for (const n of giorni) {
      const c = categorieDelGiorno(n)
      expect(new Set(c).size, `giorno ${n}`).toBe(6)
      expect(c.filter((_, i) => i % 2 === 0).every((x) => CATEGORIE_RUOTA_GEOGRAFIA.includes(x))).toBe(true)
      expect(c.filter((_, i) => i % 2 === 1).every((x) => CATEGORIE_RUOTA_ALTRE.includes(x))).toBe(true)
    }
  })

  it('cambiano ogni giorno: nessuna e’ quella del giorno prima', () => {
    for (const n of giorni.slice(1)) {
      const ieri = new Set(categorieDelGiorno(n - 1))
      expect(categorieDelGiorno(n).filter((c) => ieri.has(c)), `giorno ${n}`).toEqual([])
    }
  })

  it('passano tutte, e ognuna torna spesso', () => {
    const volte = new Map<string, number>()
    for (const n of giorni.slice(0, 70)) for (const c of categorieDelGiorno(n)) volte.set(c, (volte.get(c) ?? 0) + 1)
    expect([...volte.keys()].sort()).toEqual([...CATEGORIE_RUOTA].sort())
    // In media tre giorni su sette.
    for (const [c, v] of volte) expect(v, c).toBeGreaterThan(18)
  })

  it('non hanno Accadde oggi né le città: non bastano a trenta domande al giorno, o non le sa nessuno', () => {
    expect(CATEGORIE_RUOTA).not.toContain('oggi')
    expect(CATEGORIE_RUOTA).not.toContain('citta')
    expect(CATEGORIE_RUOTA).not.toContain('cartina')
    expect(new Set(CATEGORIE_RUOTA).size).toBe(14)
  })
})

describe('la moneta', () => {
  it('porta uno dei suoi moltiplicatori, a caso, e si scrivono con la virgola', () => {
    expect(MOLTIPLICATORI_MONETA.map(scriviMoltiplicatore)).toEqual(['×1,25', '×1,5', '×2', '×3'])
    expect(scriviMoltiplicatore(1.75)).toBe('×1,75')
    expect(scriviMoltiplicatore(2.5)).toBe('×2,5')
    expect(scriviMoltiplicatore(0.5)).toBe('×0,5')
  })

  it('da sola rende quanto quella del Crazy Time vero, poco meno della puntata', () => {
    const moneta = media(MOLTIPLICATORI_MONETA) / 2
    expect(moneta).toBeGreaterThan(0.95)
    expect(moneta).toBeLessThan(1)
  })
})

describe('la vincita', () => {
  it('e’ la puntata per il moltiplicatore, per difetto, e si conta senza errori di virgola', () => {
    expect(vincitaDi(100, 2)).toBe(200)
    expect(vincitaDi(100, 1.25)).toBe(125)
    expect(vincitaDi(13, 1.25)).toBe(16)
    expect(vincitaDi(7, 1.5)).toBe(10)
    expect(vincitaDi(13, 1.75)).toBe(22)
    expect(vincitaDi(13, 2.5)).toBe(32)
    expect(vincitaDi(11, 0.5)).toBe(5)
    for (let puntata = PUNTATA_MINIMA; puntata <= 3_000; puntata += 1) {
      for (const m of TUTTI) {
        const esatta = (puntata * Math.round(m * 100) - ((puntata * Math.round(m * 100)) % 100)) / 100
        expect(vincitaDi(puntata, m)).toBe(esatta)
      }
    }
  })

  it('un premio vero restituisce piu’ della puntata; lo split e il ×0,5 la meta’, di proposito', () => {
    // Nessun moltiplicatore ridà la puntata com'era: sarebbe il banco con un altro nome.
    expect(TUTTI).not.toContain(1)
    expect(TUTTI.filter((m) => m < 1)).toEqual([MOLTIPLICATORE_SPLIT])
    const premi = TUTTI.filter((m) => m > 1)
    expect(Math.min(...premi)).toBe(1.25)
    for (let puntata = PUNTATA_MINIMA; puntata <= 500; puntata += 1) {
      for (const m of premi) expect(vincitaDi(puntata, m), `puntata ${puntata} ×${m}`).toBeGreaterThan(puntata)
      expect(vincitaDi(puntata, MOLTIPLICATORE_SPLIT)).toBe(Math.floor(puntata / 2))
    }
  })

  it('alla giornata da’ la vincita meno la puntata, o toglie tutta la puntata, con ogni moltiplicatore', () => {
    expect(deltaDi(100, 3)).toBe(200)
    expect(deltaDi(100, 10)).toBe(900)
    expect(deltaDi(100, 1.25)).toBe(25)
    expect(deltaDi(100, null)).toBe(-100)
    expect(deltaDi(100, MOLTIPLICATORE_FISSO)).toBe(200)
    // Lo split si festeggia, e toglie: meta' della puntata, per difetto quello che torna.
    expect(deltaDi(100, MOLTIPLICATORE_SPLIT)).toBe(-50)
    expect(deltaDi(15, MOLTIPLICATORE_SPLIT)).toBe(-8)
  })
})

describe('vince il banco', () => {
  it('la resa si conta dagli spicchi: lo split, il triplo, i minigiochi e la ruota fortunata', () => {
    const quiz = 22.75 / 12
    const quizFortunato = 36.5 / 12
    // La ruota fortunata: i premi fissi, i quattro quiz, le due monete, il Pachinko e il Cash Hunt.
    const fortunata = (s: number) =>
      (10 + 5 + 2 * 3 + 6 * 1.5 + 4 * quizFortunato * s + 2 * 1.75 + 853 / 256 + 3.375) / 20
    // La ruota: il triplo, i sei split, i tre quiz, le due monete, il Pachinko, il Cash Hunt e la fortuna.
    const attesa = (s: number) =>
      (3 + 6 * 0.5 + 3 * quiz * s + 2 * 0.96875 + 409 / 256 + 19 / 12 + fortunata(s)) / 20
    for (const s of [0, 0.25, 0.5, 0.75, 1]) expect(resa(s)).toBeCloseTo(attesa(s), 12)
  })

  it('a chi sa, a chi sta in mezzo e a chi tira a indovinare', () => {
    for (const s of [0, 0.25, 0.5, 0.75, 0.9, 1]) expect(resa(s), `chi risponde giusto ${s * 100}%`).toBeLessThan(1)
    // Chi le sa tutte riceve quanto dalla roulette, il 97%, come alla slot e al blackjack; gli altri meno.
    expect(resa(1)).toBeGreaterThan(0.968)
    expect(resa(1)).toBeLessThan(0.974)
    expect(resa(1)).toBeCloseTo(0.97123, 5)
    expect(resa(0.75)).toBeCloseTo(0.89254, 5)
    expect(resa(0.5)).toBeCloseTo(0.81384, 5)
    expect(resa(0.25)).toBeCloseTo(0.73514, 5)
  })

  it('a ogni puntata, con gli arrotondamenti, a chi sa, a chi sta in mezzo e a chi tira a indovinare', () => {
    // Quattro risposte: chi tira a indovinare ne prende una su quattro.
    for (const s of [1, 0.75, 0.5, 0.25]) {
      for (let puntata = PUNTATA_MINIMA; puntata <= 2_000; puntata += 1) {
        const torna = restituitoInPunti(puntata, s)
        expect(torna, `puntata ${puntata}, giuste ${s}`).toBeLessThan(puntata)
        // Gli arrotondamenti tolgono, e meno di un punto a giro.
        expect(torna).toBeLessThanOrEqual(resa(s) * puntata + 1e-9)
        expect(torna).toBeGreaterThan(resa(s) * puntata - 1)
      }
    }
  })

  it('la ruota fortunata vale due volte e mezzo la puntata, e la fortuna non rende piu’ del triplo', () => {
    const fortuna = SPICCHI_FORTUNATI.map((s) => valoreDi(s, true, 1))
    expect(media(fortuna)).toBeCloseTo(2.6187, 4)
    expect(media(SPICCHI_FORTUNATI.map((s) => inPunti(s, true, 1000, 1) / 1000))).toBeGreaterThan(2.6)
    expect(media(fortuna)).toBeLessThan(MOLTIPLICATORE_FISSO)
  })
})

describe('le domande', () => {
  it('si riconoscono dal testo e dalla risposta, non dal posto', () => {
    const d = { testo: 'Qual è la capitale del Portogallo?', giusta: 'lis' }
    expect(improntaDomanda(d)).toBe(improntaDomanda({ ...d }))
    expect(improntaDomanda(d)).toMatch(/^[0-9a-f]{8}$/)
    expect(improntaDomanda({ ...d, giusta: 'opo' })).not.toBe(improntaDomanda(d))
  })
})

describe('la puntata', () => {
  it('è quanto si vuole, fra la minima e tutto il saldo, in punti interi', () => {
    for (let puntata = PUNTATA_MINIMA; puntata <= 420; puntata += 1) expect(puntataValida(puntata, 420)).toBe(true)
    expect(puntataValida(PUNTATA_MINIMA, PUNTATA_MINIMA)).toBe(true)
    expect(puntataValida(PUNTATA_MINIMA, PUNTATA_MINIMA - 1)).toBe(false)
    expect(puntataValida(421, 420)).toBe(false)
    expect(puntataValida(PUNTATA_MINIMA - 1, 420)).toBe(false)
    expect(puntataValida(100.5, 420)).toBe(false)
    expect(puntataValida('100', 420)).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../daily'
import type { CategoriaQuiz } from '../quiz'
import {
  CATEGORIE_RUOTA,
  CATEGORIE_RUOTA_ALTRE,
  CATEGORIE_RUOTA_GEOGRAFIA,
  FORTUNATO,
  MOLTIPLICATORE_FISSO,
  MOLTIPLICATORI_MONETA,
  MOLTIPLICATORI_MONETA_FORTUNATA,
  MOLTIPLICATORI_QUIZ,
  MOLTIPLICATORI_QUIZ_FORTUNATI,
  POSTO_FORTUNA,
  PUNTATA_MINIMA,
  SPICCHI_FORTUNATI,
  SPICCHI_QUIZ,
  SPICCHI_RUOTA,
  categorieDelGiorno,
  categorieDelQuiz,
  deltaDi,
  eSfida,
  etichettaDi,
  improntaDomanda,
  moltiplicatoriMoneta,
  moltiplicatoriQuiz,
  nomeDi,
  puntataValida,
  resa,
  scriviMoltiplicatore,
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

/**
 * Quel che uno spicchio restituisce in media, in punti veri, a una puntata:
 * con le vincite arrotondate per difetto, come le paga il server.
 */
function inPunti(s: Spicchio, fortunata: boolean, puntata: number, giusta: number): number {
  switch (s.tipo) {
    case 'banco':
      return 0
    case 'fisso':
      return vincitaDi(puntata, s.moltiplicatore)
    case 'moneta':
      return media(moltiplicatoriMoneta(fortunata).map((m) => vincitaDi(puntata, m))) / 2
    case 'quiz':
      return giusta * media(moltiplicatoriQuiz(fortunata).map((m) => vincitaDi(puntata, m)))
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

/** Un caso fisso per le prove: lo stesso intero di quello del server, da un generatore con il seme. */
const casoDa = (seme: number) => {
  const r = mulberry32(seme)
  return (n: number) => Math.floor(r() * n)
}

describe('la ruota', () => {
  it('ha quindici spicchi: sette banchi, tre quiz, tre monete, il triplo e la fortuna', () => {
    expect(N).toBe(15)
    const quantiDi = (tipo: TipoSpicchio) => conta(SPICCHI_RUOTA, diTipo(tipo))
    expect([quantiDi('banco'), quantiDi('quiz'), quantiDi('moneta'), quantiDi('fisso'), quantiDi('fortuna')]).toEqual([
      7, 3, 3, 1, 1,
    ])
    expect(conta(SPICCHI_RUOTA, per(MOLTIPLICATORE_FISSO))).toBe(1)
    expect(SPICCHI_RUOTA.filter(eSfida)).toHaveLength(7)
    expect(SPICCHI_RUOTA[POSTO_FORTUNA].tipo).toBe('fortuna')
  })

  it('il triplo in cima, mai due banchi o due quiz vicini, e un banco ogni due spicchi', () => {
    expect(SPICCHI_RUOTA[0]).toEqual({ tipo: 'fisso', moltiplicatore: 3 })
    for (const ruota of [SPICCHI_RUOTA, SPICCHI_FORTUNATI]) {
      for (let i = 0; i < N; i += 1) {
        const [a, b] = [ruota[i].tipo, ruota[(i + 1) % N].tipo]
        expect(a === b && (a === 'banco' || a === 'quiz'), `spicchi ${i} e ${i + 1}`).toBe(false)
      }
    }
    // Il banco esce ogni due spicchi, girando dovunque, tranne attorno al triplo.
    const banchi = posti(SPICCHI_RUOTA, 'banco')
    for (const [k, b] of banchi.entries()) expect(distanza(b, banchi[(k + 1) % banchi.length])).toBeLessThanOrEqual(3)
  })

  it('la fortuna sta di fronte al triplo, fra i quiz e le monete', () => {
    expect(distanza(POSTO_FORTUNA, 0)).toBe(7)
    const quiz = posti(SPICCHI_RUOTA, 'quiz')
    const monete = posti(SPICCHI_RUOTA, 'moneta')
    expect(Math.max(...quiz)).toBeLessThan(POSTO_FORTUNA)
    expect(Math.min(...monete)).toBeGreaterThan(POSTO_FORTUNA)
  })

  it('si scrive per esteso per chi non vede', () => {
    expect(etichettaDi(SPICCHI_RUOTA[0])).toBe('×3')
    expect(nomeDi(SPICCHI_RUOTA[0])).toBe('Triplo')
    expect(nomeDi(SPICCHI_RUOTA[1])).toBe('Banco')
    expect([etichettaDi({ tipo: 'quiz' }), nomeDi({ tipo: 'quiz' })]).toEqual(['QUIZ', 'Quiz'])
    expect(nomeDi(SPICCHI_RUOTA[POSTO_FORTUNA])).toBe('Fortuna')
    expect(SPICCHI_FORTUNATI.filter((s) => s.tipo === 'fisso').map(nomeDi).sort()).toEqual([
      'Decuplo',
      'Quintuplo',
      'Triplo',
      'Triplo',
    ])
    expect(etichettaDi(SPICCHI_FORTUNATI[0])).toBe('×10')
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
              : [prima.tipo]
      const chiave = dopo.tipo === 'fisso' ? `fisso:${dopo.moltiplicatore}` : dopo.tipo
      expect(atteso, `spicchio ${i}`).toContain(chiave)
    }
  })

  it('ha un ×10, due ×3, un ×5, due banchi, sei quiz e tre monete, e niente fortuna', () => {
    expect(conta(SPICCHI_FORTUNATI, per(10))).toBe(1)
    expect(conta(SPICCHI_FORTUNATI, per(3))).toBe(2)
    expect(conta(SPICCHI_FORTUNATI, per(5))).toBe(1)
    expect(conta(SPICCHI_FORTUNATI, diTipo('banco'))).toBe(2)
    expect(conta(SPICCHI_FORTUNATI, diTipo('quiz'))).toBe(6)
    expect(conta(SPICCHI_FORTUNATI, diTipo('moneta'))).toBe(3)
    expect(conta(SPICCHI_FORTUNATI, diTipo('fortuna'))).toBe(0)
    // Il ×10 dove era il triplo, il ×5 dove era la fortuna.
    expect(SPICCHI_FORTUNATI[0]).toEqual({ tipo: 'fisso', moltiplicatore: 10 })
    expect(SPICCHI_FORTUNATI[POSTO_FORTUNA]).toEqual({ tipo: 'fisso', moltiplicatore: 5 })
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
    const tutti = [...new Set([...MOLTIPLICATORI_QUIZ, ...MOLTIPLICATORI_QUIZ_FORTUNATI, ...MOLTIPLICATORI_MONETA])]
    for (let puntata = PUNTATA_MINIMA; puntata <= 3_000; puntata += 1) {
      for (const m of tutti) {
        const esatta = (puntata * Math.round(m * 100) - ((puntata * Math.round(m * 100)) % 100)) / 100
        expect(vincitaDi(puntata, m)).toBe(esatta)
      }
    }
  })

  it('anche la piu’ piccola restituisce piu’ della puntata', () => {
    const minimo = Math.min(...MOLTIPLICATORI_QUIZ, ...MOLTIPLICATORI_MONETA)
    expect(minimo).toBe(1.25)
    for (let puntata = PUNTATA_MINIMA; puntata <= 500; puntata += 1) {
      expect(vincitaDi(puntata, minimo), `puntata ${puntata}`).toBeGreaterThan(puntata)
    }
  })

  it('alla giornata da’ la vincita meno la puntata, o toglie tutta la puntata, con ogni moltiplicatore', () => {
    expect(deltaDi(100, 3)).toBe(200)
    expect(deltaDi(100, 10)).toBe(900)
    expect(deltaDi(100, 1.25)).toBe(25)
    expect(deltaDi(100, null)).toBe(-100)
    expect(deltaDi(100, MOLTIPLICATORE_FISSO)).toBe(200)
  })
})

describe('vince il banco', () => {
  it('la resa si conta dagli spicchi: il triplo, le monete, i quiz e la ruota fortunata', () => {
    const fortunata = (s: number) => (21 + 6 * (36.5 / 12) * s + 3 * 1.75) / 15
    const attesa = (s: number) => (3 + 3 * 0.96875 + 3 * (22.75 / 12) * s + fortunata(s)) / 15
    for (const s of [0, 0.25, 0.5, 0.75, 1]) expect(resa(s)).toBeCloseTo(attesa(s), 12)
  })

  it('a chi tira a indovinare, a chi sta in mezzo e a chi sa', () => {
    for (const s of [0, 0.25, 0.5, 0.75, 0.9, 1]) expect(resa(s), `chi risponde giusto ${s * 100}%`).toBeLessThan(1)
    // Chi le sa tutte riceve quanto dalla roulette, il 97%, come alla slot e al blackjack; gli altri molto meno.
    expect(resa(1)).toBeGreaterThan(0.97)
    expect(resa(1)).toBeLessThan(0.971)
    expect(resa(0.75)).toBeGreaterThan(0.85)
    expect(resa(0.75)).toBeLessThan(0.86)
    expect(resa(0.25)).toBeGreaterThan(0.62)
    expect(resa(0.25)).toBeLessThan(0.63)
  })

  it('a ogni puntata, con gli arrotondamenti, a chi sa, a chi sta in mezzo e a chi tira a indovinare', () => {
    // Quattro risposte: chi tira a indovinare ne prende una su quattro.
    for (const s of [1, 0.75, 0.25]) {
      for (let puntata = PUNTATA_MINIMA; puntata <= 2_000; puntata += 1) {
        const torna = restituitoInPunti(puntata, s)
        expect(torna, `puntata ${puntata}, giuste ${s}`).toBeLessThan(puntata)
        // Gli arrotondamenti tolgono, e meno di un punto a giro.
        expect(torna).toBeLessThanOrEqual(resa(s) * puntata + 1e-9)
        expect(torna).toBeGreaterThan(resa(s) * puntata - 1)
      }
    }
  })

  it('la ruota fortunata vale quasi tre volte la puntata, e la fortuna non rende piu’ del triplo', () => {
    const fortuna = SPICCHI_FORTUNATI.map((s) => inPunti(s, true, 1000, 1) / 1000)
    expect(media(fortuna)).toBeGreaterThan(2.9)
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

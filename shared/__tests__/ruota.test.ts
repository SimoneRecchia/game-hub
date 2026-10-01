import { describe, expect, it } from 'vitest'
import {
  MATERIE_RUOTA,
  MOLTIPLICATORI,
  MOLTIPLICATORI_MONETA,
  PUNTATA_MINIMA,
  SPICCHI,
  deltaDi,
  eSfida,
  etichettaDi,
  improntaDomanda,
  nomeDi,
  puntataValida,
  resa,
  scriviMoltiplicatore,
  vincitaDi,
  type Spicchio,
} from '../ruota'

const conta = (prova: (s: Spicchio) => boolean) => SPICCHI.filter(prova).length
const media = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

/** Quel che un giro restituisce in media, in punti veri, a una puntata: con le vincite arrotondate per difetto. */
function restituitoInPunti(puntata: number, s: number): number {
  const domanda = s * media(MOLTIPLICATORI.map((m) => vincitaDi(puntata, m)))
  const moneta = media(MOLTIPLICATORI_MONETA.map((m) => vincitaDi(puntata, m))) / 2
  let somma = 0
  for (const sp of SPICCHI) somma += sp.tipo === 'domanda' ? domanda : sp.tipo === 'moneta' ? moneta : 0
  return somma / SPICCHI.length
}

/** Il colore di uno spicchio sulla ruota: arte, libri e cinema hanno quello della cultura, come nel quiz. */
function coloreDi(s: Spicchio): string {
  if (s.tipo !== 'domanda') return s.tipo
  return s.materia === 'arte' || s.materia === 'libri' || s.materia === 'cinema' ? 'cultura' : s.materia
}

/** Quanti posti ci sono fra due spicchi, girando dalla parte piu' corta. */
function distanza(a: number, b: number, n = SPICCHI.length): number {
  const d = Math.abs(a - b)
  return Math.min(d, n - d)
}

const posti = (prova: (s: Spicchio) => boolean) => SPICCHI.flatMap((s, i) => (prova(s) ? [i] : []))

describe('la ruota', () => {
  it('ha dodici spicchi: il banco, le domande e le monete', () => {
    expect(SPICCHI).toHaveLength(12)
    expect(conta((s) => s.tipo === 'banco')).toBe(4)
    expect(conta((s) => s.tipo === 'moneta')).toBe(2)
    for (const m of MATERIE_RUOTA) expect(conta((s) => s.tipo === 'domanda' && s.materia === m), m).toBe(1)
    expect(SPICCHI.filter(eSfida)).toHaveLength(8)
  })

  it('non ha spicchi che lasciano tutto com’è: o si vince, o vince il banco', () => {
    expect(SPICCHI.every((s) => s.tipo === 'banco' || eSfida(s))).toBe(true)
  })

  it('il banco ogni tre spicchi, mai due vicini dello stesso colore, le monete una di fronte all’altra', () => {
    for (let i = 0; i < SPICCHI.length; i += 1) {
      const dopo = SPICCHI[(i + 1) % SPICCHI.length]
      expect(coloreDi(SPICCHI[i]), `spicchi ${i} e ${i + 1}`).not.toBe(coloreDi(dopo))
    }
    expect(posti((s) => s.tipo === 'banco')).toEqual([2, 5, 8, 11])
    const [a, b] = posti((s) => s.tipo === 'moneta')
    expect(distanza(a, b)).toBe(6)
    expect(SPICCHI[0].tipo).toBe('moneta')
  })

  it('si scrive lungo il raggio, e per intero per chi non vede', () => {
    expect(SPICCHI.map(etichettaDi).slice(0, 4)).toEqual(['MONETA', 'GEOGRAFIA', 'BANCO', 'ARTE'])
    expect(nomeDi(SPICCHI[1])).toBe('Domanda di geografia')
    expect(nomeDi(SPICCHI[2])).toBe('Banco')
  })
})

describe('i moltiplicatori', () => {
  it('stanno su una ruota di dodici: ×3 una volta, ×2 due, ×1,5 quattro, ×1,25 cinque', () => {
    expect(MOLTIPLICATORI).toHaveLength(12)
    const quanti = (m: number) => MOLTIPLICATORI.filter((x) => x === m).length
    expect([quanti(3), quanti(2), quanti(1.5), quanti(1.25)]).toEqual([1, 2, 4, 5])
    for (let i = 0; i < MOLTIPLICATORI.length; i += 1) {
      expect(MOLTIPLICATORI[i], `spicchi ${i} e ${i + 1}`).not.toBe(MOLTIPLICATORI[(i + 1) % MOLTIPLICATORI.length])
    }
  })

  it('la moneta porta uno degli stessi, a caso', () => {
    expect([...MOLTIPLICATORI_MONETA].sort()).toEqual([...new Set(MOLTIPLICATORI)].sort())
  })

  it('si scrivono con la virgola', () => {
    expect(MOLTIPLICATORI_MONETA.map(scriviMoltiplicatore)).toEqual(['×1,25', '×1,5', '×2', '×3'])
  })
})

describe('la vincita', () => {
  it('e’ la puntata per il moltiplicatore, per difetto, e si conta senza errori di virgola', () => {
    expect(vincitaDi(100, 2)).toBe(200)
    expect(vincitaDi(100, 1.25)).toBe(125)
    expect(vincitaDi(13, 1.25)).toBe(16)
    expect(vincitaDi(7, 1.5)).toBe(10)
    for (let puntata = PUNTATA_MINIMA; puntata <= 3_000; puntata += 1) {
      for (const m of MOLTIPLICATORI_MONETA) {
        const esatta = (puntata * Math.round(m * 100) - ((puntata * Math.round(m * 100)) % 100)) / 100
        expect(vincitaDi(puntata, m)).toBe(esatta)
      }
    }
  })

  it('anche la piu’ piccola restituisce piu’ della puntata', () => {
    for (let puntata = PUNTATA_MINIMA; puntata <= 500; puntata += 1) {
      expect(vincitaDi(puntata, 1.25), `puntata ${puntata}`).toBeGreaterThan(puntata)
    }
  })

  it('alla giornata da’ la vincita meno la puntata, o toglie la puntata', () => {
    expect(deltaDi(100, 3)).toBe(200)
    expect(deltaDi(100, 1.25)).toBe(25)
    expect(deltaDi(100, null)).toBe(-100)
  })
})

describe('vince il banco', () => {
  it('a chi tira a indovinare, a chi sa e a chi sta in mezzo', () => {
    for (const s of [0, 0.25, 0.5, 0.75, 0.9, 1]) expect(resa(s), `chi risponde giusto ${s * 100}%`).toBeLessThan(1)
    // Chi le sa tutte riceve quanto da un gioco da casinò, dal 95 al 97%; chi ne sbaglia una su quattro meno.
    expect(resa(1)).toBeGreaterThan(0.95)
    expect(resa(1)).toBeLessThan(0.97)
    expect(resa(0.75)).toBeLessThan(0.8)
    expect(resa(0.25)).toBeLessThan(resa(0.75))
  })

  it('a ogni puntata, anche con gli arrotondamenti, e anche a chi le sa tutte', () => {
    for (let puntata = PUNTATA_MINIMA; puntata <= 2_000; puntata += 1) {
      expect(restituitoInPunti(puntata, 1), `puntata ${puntata}`).toBeLessThan(puntata)
    }
  })

  it('la moneta da sola rende quanto quella del Crazy Time vero, poco meno della puntata', () => {
    const moneta = media(MOLTIPLICATORI_MONETA) / 2
    expect(moneta).toBeGreaterThan(0.95)
    expect(moneta).toBeLessThan(1)
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

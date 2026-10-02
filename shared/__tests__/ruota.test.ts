import { describe, expect, it } from 'vitest'
import { NOMI_CATEGORIE } from '../quiz'
import {
  CATEGORIE_RUOTA,
  CATEGORIE_RUOTA_ALTRE,
  CATEGORIE_RUOTA_GEOGRAFIA,
  FORMA_RUOTA,
  MOLTIPLICATORE_FISSO,
  MOLTIPLICATORI,
  MOLTIPLICATORI_MONETA,
  PUNTATA_MINIMA,
  categorieDelGiorno,
  deltaDi,
  eSfida,
  etichettaDi,
  improntaDomanda,
  nomeDi,
  puntataValida,
  resa,
  scriviMoltiplicatore,
  spicchiDelGiorno,
  vincitaDi,
  type Spicchio,
  type TipoSpicchio,
} from '../ruota'

const N = FORMA_RUOTA.length
const conta = (tipo: TipoSpicchio) => FORMA_RUOTA.filter((t) => t === tipo).length
const posti = (tipo: TipoSpicchio) => FORMA_RUOTA.flatMap((t, i) => (t === tipo ? [i] : []))
const media = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

/** Quel che un giro restituisce in media, in punti veri, a una puntata: con le vincite arrotondate per difetto. */
function restituitoInPunti(puntata: number, s: number): number {
  const domanda = s * media(MOLTIPLICATORI.map((m) => vincitaDi(puntata, m)))
  const moneta = media(MOLTIPLICATORI_MONETA.map((m) => vincitaDi(puntata, m))) / 2
  const fisso = vincitaDi(puntata, MOLTIPLICATORE_FISSO)
  let somma = 0
  for (const t of FORMA_RUOTA) somma += t === 'domanda' ? domanda : t === 'moneta' ? moneta : t === 'fisso' ? fisso : 0
  return somma / N
}

/** Quanti posti ci sono fra due spicchi, girando dalla parte piu' corta. */
function distanza(a: number, b: number): number {
  const d = Math.abs(a - b)
  return Math.min(d, N - d)
}

describe('la ruota', () => {
  it('ha quindici spicchi: sei banchi, sei domande, due monete e il triplo', () => {
    expect(N).toBe(15)
    expect([conta('banco'), conta('domanda'), conta('moneta'), conta('fisso')]).toEqual([6, 6, 2, 1])
    expect(MOLTIPLICATORE_FISSO).toBe(3)
    expect(spicchiDelGiorno(35).filter(eSfida)).toHaveLength(8)
  })

  it('non ha spicchi che lasciano tutto com’è: o si vince, o vince il banco', () => {
    expect(spicchiDelGiorno(35).every((s) => s.tipo === 'banco' || s.tipo === 'fisso' || eSfida(s))).toBe(true)
  })

  it('il triplo in cima, mai due banchi o due domande vicini, le monete quasi una di fronte all’altra', () => {
    expect(FORMA_RUOTA[0]).toBe('fisso')
    for (let i = 0; i < N; i += 1) {
      const [a, b] = [FORMA_RUOTA[i], FORMA_RUOTA[(i + 1) % N]]
      expect(a === b && (a === 'banco' || a === 'domanda'), `spicchi ${i} e ${i + 1}`).toBe(false)
    }
    // Il banco esce ogni due o tre spicchi, girando dovunque.
    const banchi = posti('banco')
    for (const [k, b] of banchi.entries()) expect(distanza(b, banchi[(k + 1) % banchi.length])).toBeLessThanOrEqual(3)
    const [a, b] = posti('moneta')
    expect(distanza(a, b)).toBe(7)
  })

  it('si scrive per esteso per chi non vede', () => {
    const spicchi = spicchiDelGiorno(35)
    expect(etichettaDi(spicchi[0])).toBe('×3')
    expect(nomeDi(spicchi[0])).toBe('Triplo')
    expect(nomeDi(spicchi[2])).toBe('Banco')
    const domanda = spicchi[1] as Extract<Spicchio, { tipo: 'domanda' }>
    expect(nomeDi(domanda)).toBe(`Domanda: ${NOMI_CATEGORIE[domanda.categoria]}`)
    expect(etichettaDi({ tipo: 'domanda', categoria: 'nobel' })).toBe('NOBEL')
    expect(etichettaDi({ tipo: 'domanda', categoria: 'capitali' })).toBe('CAPITALI')
  })
})

describe('le categorie del giorno', () => {
  const giorni = Array.from({ length: 400 }, (_, i) => i + 1)

  it('sono sei, tre di geografia e tre delle altre materie, alternate negli spicchi', () => {
    for (const n of giorni) {
      const c = categorieDelGiorno(n)
      expect(new Set(c).size, `giorno ${n}`).toBe(6)
      expect(c.filter((_, i) => i % 2 === 0).every((x) => CATEGORIE_RUOTA_GEOGRAFIA.includes(x))).toBe(true)
      expect(c.filter((_, i) => i % 2 === 1).every((x) => CATEGORIE_RUOTA_ALTRE.includes(x))).toBe(true)
    }
    const domande = spicchiDelGiorno(35).flatMap((s) => (s.tipo === 'domanda' ? [s.categoria] : []))
    expect(domande).toEqual(categorieDelGiorno(35))
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

  it('alla giornata da’ la vincita meno la puntata, o toglie tutta la puntata, con ogni moltiplicatore', () => {
    expect(deltaDi(100, 3)).toBe(200)
    expect(deltaDi(100, 1.25)).toBe(25)
    expect(deltaDi(100, null)).toBe(-100)
    expect(deltaDi(100, MOLTIPLICATORE_FISSO)).toBe(200)
  })
})

describe('vince il banco', () => {
  it('a chi tira a indovinare, a chi sa e a chi sta in mezzo', () => {
    for (const s of [0, 0.25, 0.5, 0.75, 0.9, 1]) expect(resa(s), `chi risponde giusto ${s * 100}%`).toBeLessThan(1)
    // Chi le sa tutte riceve quanto dalla roulette, il 97%; chi ne sbaglia una su quattro molto meno.
    expect(resa(1)).toBeGreaterThan(0.95)
    expect(resa(1)).toBeLessThan(0.975)
    expect(resa(0.75)).toBeLessThan(0.85)
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

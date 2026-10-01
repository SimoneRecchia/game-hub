import { describe, expect, it } from 'vitest'
import {
  MATERIE_RUOTA,
  POSTA_MASSIMA,
  PUNTATA_MINIMA,
  SPICCHI,
  deltaDi,
  eSfida,
  etichettaDi,
  nomeDi,
  puntataValida,
  type Spicchio,
} from '../ruota'

const conta = (prova: (s: Spicchio) => boolean) => SPICCHI.filter(prova).length

/**
 * Il valore atteso di un giro, in punti, per una puntata e per chi risponde
 * giusto a una domanda con probabilita' `s`: la moneta va bene una volta su due.
 */
function atteso(puntata: number, s: number): number {
  let somma = 0
  for (const sp of SPICCHI) {
    if (sp.tipo === 'domanda') somma += s * deltaDi(sp, puntata, true) + (1 - s) * deltaDi(sp, puntata, false)
    else if (sp.tipo === 'moneta') somma += (deltaDi(sp, puntata, true) + deltaDi(sp, puntata, false)) / 2
    else somma += deltaDi(sp, puntata)
  }
  return somma / SPICCHI.length
}

/** Il colore di uno spicchio sulla ruota: arte, libri e cinema hanno quello della cultura, come nel quiz. */
function coloreDi(s: Spicchio): string {
  if (s.tipo !== 'domanda') return s.tipo
  return s.materia === 'arte' || s.materia === 'libri' || s.materia === 'cinema' ? 'cultura' : s.materia
}

/** Quanti posti ci sono fra due spicchi, girando dalla parte piu' corta. */
function distanza(a: number, b: number): number {
  const d = Math.abs(a - b)
  return Math.min(d, SPICCHI.length - d)
}

describe('la ruota', () => {
  it('ha ventiquattro spicchi: abbastanza larghi da leggerli su un telefono', () => {
    expect(SPICCHI).toHaveLength(24)
  })

  it("ha un solo x2, e il x2 e' il solo spicchio che guarda la puntata", () => {
    expect(conta((s) => s.tipo === 'doppio')).toBe(1)
    for (const puntata of [PUNTATA_MINIMA, 137, 600]) {
      for (const s of SPICCHI) {
        const vinta = deltaDi(s, puntata, true)
        if (s.tipo === 'doppio') expect(vinta).toBe(puntata)
        else expect(vinta, nomeDi(s)).toBe(deltaDi(s, PUNTATA_MINIMA, true))
      }
    }
  })

  it('ha tanti spicchi che non fanno niente, sparsi', () => {
    const niente = SPICCHI.flatMap((s, i) => (s.tipo === 'niente' ? [i] : []))
    expect(niente.length).toBeGreaterThanOrEqual(6)
    for (const i of niente) expect(deltaDi(SPICCHI[i], 300, true)).toBe(0)
    for (let k = 0; k < niente.length; k += 1) {
      expect(distanza(niente[k], niente[(k + 1) % niente.length]), `dopo lo spicchio ${niente[k]}`).toBeGreaterThan(1)
    }
  })

  it('le sfide vanno bene o male di una posta fissa, con poste diverse', () => {
    const sfide = SPICCHI.filter(eSfida)
    for (const s of sfide) {
      expect(deltaDi(s, 300, true)).toBe(s.posta)
      expect(deltaDi(s, 300, false)).toBe(-s.posta)
      expect(s.posta).toBeGreaterThanOrEqual(10)
      expect(s.posta).toBeLessThanOrEqual(50)
    }
    expect(new Set(sfide.map((s) => s.posta)).size).toBeGreaterThanOrEqual(4)
    expect(conta((s) => s.tipo === 'moneta')).toBeGreaterThanOrEqual(2)
    for (const m of MATERIE_RUOTA) {
      const sue = SPICCHI.filter((s) => s.tipo === 'domanda' && s.materia === m)
      expect(sue, m).toHaveLength(2)
      expect(new Set(sue.map((s) => (s.tipo === 'domanda' ? s.posta : 0))).size, m).toBe(2)
    }
  })

  it("si perde al massimo la posta piu' alta, e per girare servono altrettanti punti", () => {
    expect(PUNTATA_MINIMA).toBe(POSTA_MASSIMA)
    for (const puntata of [PUNTATA_MINIMA, 51, 600]) {
      for (const s of SPICCHI) expect(deltaDi(s, puntata, false), nomeDi(s)).toBeGreaterThanOrEqual(-PUNTATA_MINIMA)
    }
  })

  it("raddoppiare la puntata e' raro, e in media un giro vale pochi punti", () => {
    const raddoppi = SPICCHI.filter((s) => deltaDi(s, 400, true) >= 400).length / SPICCHI.length
    expect(raddoppi).toBeLessThanOrEqual(1 / 24)
    // Chi tira a indovinare fra quattro risposte perde un poco, alla puntata minima.
    expect(atteso(PUNTATA_MINIMA, 0.25)).toBeLessThan(0)
    // Chi sa tutto guadagna, ma meno di una partita fatta male: le domande non sono un modo di far punti.
    expect(atteso(PUNTATA_MINIMA, 1)).toBeGreaterThan(0)
    expect(atteso(PUNTATA_MINIMA, 1)).toBeLessThan(20)
    // Il x2 aggiunge un ventiquattresimo della puntata, e niente altro.
    expect(atteso(400, 0.5) - atteso(PUNTATA_MINIMA, 0.5)).toBeCloseTo((400 - PUNTATA_MINIMA) / 24)
  })

  it('due spicchi vicini non hanno mai lo stesso colore, e le due domande di una materia stanno lontane', () => {
    for (let i = 0; i < SPICCHI.length; i += 1) {
      const dopo = SPICCHI[(i + 1) % SPICCHI.length]
      expect(coloreDi(SPICCHI[i]), `spicchi ${i} e ${i + 1}`).not.toBe(coloreDi(dopo))
    }
    for (const m of MATERIE_RUOTA) {
      const posti = SPICCHI.flatMap((s, i) => (s.tipo === 'domanda' && s.materia === m ? [i] : []))
      expect(distanza(posti[0], posti[1]), m).toBeGreaterThanOrEqual(6)
    }
    const monete = SPICCHI.flatMap((s, i) => (s.tipo === 'moneta' ? [i] : []))
    for (let k = 0; k < monete.length; k += 1) {
      expect(distanza(monete[k], monete[(k + 1) % monete.length])).toBeGreaterThanOrEqual(6)
    }
  })

  it('si scrive corto sulla ruota e per intero per chi non vede', () => {
    expect(SPICCHI.map(etichettaDi).slice(0, 4)).toEqual(['x2', '0', '20', '20'])
    expect(nomeDi(SPICCHI[2])).toBe('Domanda di geografia da 20 punti')
    expect(nomeDi(SPICCHI[3])).toBe('Testa o croce da 20 punti')
  })
})

describe('la puntata', () => {
  it('è quanto si vuole, fra la minima e tutti i punti di oggi, in punti interi', () => {
    for (let puntata = PUNTATA_MINIMA; puntata <= 420; puntata += 1) expect(puntataValida(puntata, 420)).toBe(true)
    expect(puntataValida(50, 50)).toBe(true)
    expect(puntataValida(50, 49)).toBe(false)
    expect(puntataValida(421, 420)).toBe(false)
    expect(puntataValida(49, 420)).toBe(false)
    expect(puntataValida(100.5, 420)).toBe(false)
    expect(puntataValida('100', 420)).toBe(false)
  })
})

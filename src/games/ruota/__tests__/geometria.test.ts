import { describe, expect, it } from 'vitest'
import { SPICCHI_FORTUNATI, SPICCHI_RUOTA, etichettaDi, type Spicchio } from '@shared/ruota'
import {
  ALTEZZA_CIFRE,
  FACCE,
  MOZZO,
  PIOLI,
  RAGGIO_PIOLO,
  SPICCHI,
  corda,
  dimensioneNumero,
  estensioneScritta,
  larghezzaStimata,
  misureDi,
  scrittaRadiale,
} from '../geometria'

/** Tutte le facce della ruota grande: quelle di sempre e quelle della fortuna, una volta ciascuna. */
const FACCE_DELLE_RUOTE = [...SPICCHI_RUOTA, ...SPICCHI_FORTUNATI].filter(
  (s, i, tutte) => tutte.findIndex((t) => etichettaDi(t) === etichettaDi(s) && t.tipo === s.tipo) === i,
)

/** Dove finisce, verso il bordo, quel che sta in cima a uno spicchio: l'icona o il numero. */
function cima(s: Spicchio): { sotto: number; sopra: number } | null {
  const { icona, numero } = misureDi(s)
  if (icona) return { sotto: icona.centro - icona.lato / 2, sopra: icona.centro + icona.lato / 2 }
  if (numero) {
    const meta = (numero.dimensione * ALTEZZA_CIFRE) / 2
    return { sotto: numero.centro - meta, sopra: numero.centro + meta }
  }
  return null
}

/** Il bordo dove gli spicchi finiscono: i pioli della lancetta. */
const BORDO = PIOLI - RAGGIO_PIOLO

describe('le facce della ruota', () => {
  it('ci sono tutte: banco, split, quiz, moneta, Pachinko, Cash Hunt, fortuna e i premi fissi', () => {
    const tipi = new Set(FACCE_DELLE_RUOTE.map((s) => s.tipo))
    expect([...tipi].sort()).toEqual(['banco', 'cashhunt', 'fisso', 'fortuna', 'moneta', 'pachinko', 'quiz', 'split'])
    const fissi = FACCE_DELLE_RUOTE.filter((s) => s.tipo === 'fisso').map(etichettaDi)
    expect(fissi.sort()).toEqual(['×1,5', '×10', '×3', '×5'])
  })

  it('l’icona o il numero e la scritta sotto non si toccano: c’e’ uno stacco chiaro', () => {
    for (const s of FACCE_DELLE_RUOTE) {
      const { scritta } = misureDi(s)
      const sopra = cima(s)
      if (!scritta || !sopra) continue
      const lungo = estensioneScritta(scritta)
      expect(sopra.sotto - lungo.da, `${etichettaDi(s)}: lo stacco`).toBeGreaterThanOrEqual(FACCE.stacco)
    }
  })

  it('l’icona sta nella larghezza dello spicchio dove sta, e non arriva ai pioli', () => {
    for (const s of FACCE_DELLE_RUOTE) {
      const { icona } = misureDi(s)
      if (!icona) continue
      const dentro = icona.centro - icona.lato / 2
      expect(icona.lato, etichettaDi(s)).toBeLessThanOrEqual(corda(dentro, SPICCHI) - 2 * FACCE.margine)
      expect(icona.centro + icona.lato / 2, etichettaDi(s)).toBeLessThanOrEqual(BORDO - 1)
    }
  })

  it('il numero di un premio sta dritto nella larghezza dello spicchio, e non arriva ai pioli', () => {
    for (const s of FACCE_DELLE_RUOTE) {
      const { numero } = misureDi(s)
      if (!numero) continue
      const meta = (numero.dimensione * ALTEZZA_CIFRE) / 2
      const largo = larghezzaStimata(numero.testo, numero.dimensione)
      expect(largo, numero.testo).toBeLessThanOrEqual(corda(numero.centro - meta, SPICCHI) - 2 * FACCE.margine)
      expect(numero.centro + meta, numero.testo).toBeLessThanOrEqual(BORDO - 1)
    }
    // I numeri corti grandi, quelli lunghi un po' meno; nessuno troppo piccolo per leggerlo.
    expect(dimensioneNumero('×3')).toBe(FACCE.numero.dimensione)
    expect(dimensioneNumero('×5')).toBe(FACCE.numero.dimensione)
    expect(dimensioneNumero('×10')).toBeGreaterThan(11)
    expect(dimensioneNumero('×1,5')).toBeGreaterThan(9.5)
  })

  it('la scritta sta nella larghezza dello spicchio anche dove finisce, verso il mozzo, e non lo tocca', () => {
    for (const s of FACCE_DELLE_RUOTE) {
      const { scritta } = misureDi(s)
      if (!scritta) continue
      const lungo = estensioneScritta(scritta)
      expect(scritta.dimensione, etichettaDi(s)).toBeLessThanOrEqual(corda(scritta.a, SPICCHI))
      expect(scritta.dimensione, etichettaDi(s)).toBeLessThanOrEqual(corda(lungo.a, SPICCHI))
      expect(lungo.a, etichettaDi(s)).toBeGreaterThan(MOZZO + 2)
      expect(lungo.da, etichettaDi(s)).toBeLessThanOrEqual(scritta.da + 1e-9)
    }
  })

  it('una dimensione per specie di scritta: le parole lunghe si stringono, ma poco', () => {
    const conIcona = FACCE_DELLE_RUOTE.filter((s) => misureDi(s).icona)
    expect(new Set(conIcona.map((s) => misureDi(s).scritta!.dimensione))).toEqual(new Set([FACCE.scritta.dimensione]))
    const nomi = FACCE_DELLE_RUOTE.flatMap((s) => {
      const { scritta } = misureDi(s)
      return s.tipo === 'fisso' && scritta ? [scritta] : []
    })
    expect(nomi.map((n) => n.testo).sort()).toEqual(['DECUPLO', 'QUINTUPLO', 'TRIPLO'])
    expect(new Set(nomi.map((n) => n.dimensione))).toEqual(new Set([FACCE.nome.dimensione]))
    for (const s of FACCE_DELLE_RUOTE) {
      const { scritta } = misureDi(s)
      if (!scritta) continue
      const stretta = larghezzaStimata(scritta.testo, scritta.dimensione, scritta.spaziatura) / (scritta.da - scritta.a)
      expect(stretta, scritta.testo).toBeLessThan(1.2)
    }
    // Il ×1,5 della fortuna e' un numero e basta: niente nome lungo il raggio.
    expect(misureDi({ tipo: 'fisso', moltiplicatore: 1.5 }).scritta).toBeNull()
  })

  it('la fortuna: il quadrifoglio non copre la scritta, che non si allunga oltre il suo spazio', () => {
    const fortuna = misureDi({ tipo: 'fortuna' })
    expect(fortuna.icona).not.toBeNull()
    expect(fortuna.scritta?.testo).toBe('FORTUNA')
    const lungo = estensioneScritta(fortuna.scritta!)
    expect(fortuna.icona!.centro - fortuna.icona!.lato / 2 - lungo.da).toBeGreaterThanOrEqual(FACCE.stacco)
  })
})

describe('le scritte lungo il raggio', () => {
  it('si stringono quando la stima passa lo spazio, e allora non lo passano', () => {
    const lunga = scrittaRadiale(0, 70, 28, 'CASH HUNT', 7.2)
    expect(lunga.textLength).toBe(42)
    const corta = scrittaRadiale(0, 70, 28, 'QUIZ', 7.2)
    expect(corta.textLength).toBeUndefined()
  })

  it('la stima e’ per eccesso: almeno sette decimi di em per maiuscola, meno per le cifre e la virgola', () => {
    expect(larghezzaStimata('FORTUNA', 10)).toBeGreaterThan(7 * 10 * 0.68)
    expect(larghezzaStimata('×1,5', 10)).toBeLessThan(larghezzaStimata('MONE', 10))
    // Con la spaziatura delle lettere ogni carattere si allarga della sua parte.
    expect(larghezzaStimata('SPLIT', 10, 0.1)).toBeCloseTo(larghezzaStimata('SPLIT', 10) + 5 * 10 * 0.1 * 1.04, 9)
  })
})

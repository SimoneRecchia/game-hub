import { describe, expect, it } from 'vitest'
import { DURATA_DIRETTA_MS, PALLINE_MS } from '@shared/superenalotto'
import { inLettere } from '../palline'
import { BOCCA, MISTE, POSTI_X, RAGGIO_PALLINA, ROTAIA, SFERA, SULLA_ROTAIA, TUBO, viaggioDi } from '../studio'
import {
  APERTURA_MS,
  ARRIVO_MS,
  ATTESA_MS,
  RIEPILOGO_MS,
  RISUCCHIO_MS,
  SOFFIO,
  TUBO_MS,
  VETRINA_MS,
  arrivata,
  inEstrazione,
  inVetrina,
  momentoDi,
} from '../tempi'

describe('i tempi della diretta', () => {
  it('ogni pallina ha la sua attesa, il suo viaggio e la sua vetrina, prima che cominci la prossima', () => {
    expect(APERTURA_MS).toBeLessThanOrEqual(PALLINE_MS[0] - ATTESA_MS)
    PALLINE_MS.forEach((t0, i) => {
      if (i === 0) return
      expect(PALLINE_MS[i - 1] + ARRIVO_MS + VETRINA_MS).toBeLessThan(t0 - ATTESA_MS)
    })
    // Il riepilogo arriva prima che la diretta finisca: dopo, il server paga i premi.
    expect(RIEPILOGO_MS).toBeLessThan(DURATA_DIRETTA_MS)
    expect(SOFFIO.a).toBeLessThanOrEqual(RIEPILOGO_MS)
  })

  it('il viaggio va con il suono `estratto`: il colpo alla bocca a 0,65 s, il tubo fino a 2,7, la rotaia', () => {
    // Se cambiano, va rifatto `estratto` in src/lib/suoni.ts, che ha questi numeri scritti.
    expect(RISUCCHIO_MS).toBe(650)
    expect(RISUCCHIO_MS + TUBO_MS).toBe(2700)
    expect(ARRIVO_MS).toBe(3500)
  })

  it('le scritte e lo studio dicono la stessa cosa allo stesso momento', () => {
    const [t0, t1] = PALLINE_MS
    expect(inEstrazione(t0 - ATTESA_MS - 1)).toBe(-1)
    expect(inEstrazione(t0 - ATTESA_MS)).toBe(0)
    expect(inEstrazione(t0 + ARRIVO_MS - 1)).toBe(0)
    expect(arrivata(t0 + ARRIVO_MS - 1, 0)).toBe(false)
    expect(arrivata(t0 + ARRIVO_MS, 0)).toBe(true)
    expect(inEstrazione(t0 + ARRIVO_MS)).toBe(-1)
    expect(inVetrina(t0 + ARRIVO_MS)).toBe(0)
    expect(inVetrina(t0 + ARRIVO_MS + VETRINA_MS)).toBe(-1)

    expect(momentoDi(-60_000)).toEqual({ tipo: 'conto' })
    expect(momentoDi(0)).toEqual({ tipo: 'apertura' })
    expect(momentoDi(APERTURA_MS)).toEqual({ tipo: 'mescola' })
    expect(momentoDi(t0 - ATTESA_MS)).toEqual({ tipo: 'attesa', pallina: 0 })
    expect(momentoDi(t0 + ARRIVO_MS)).toEqual({ tipo: 'annuncio', pallina: 0 })
    // Il sottopancia resta fino all'attesa della prossima, poi tocca a lei.
    expect(momentoDi(t1 - ATTESA_MS - 1)).toEqual({ tipo: 'annuncio', pallina: 0 })
    expect(momentoDi(t1 - ATTESA_MS)).toEqual({ tipo: 'attesa', pallina: 1 })
    expect(momentoDi(RIEPILOGO_MS - 1)).toEqual({ tipo: 'annuncio', pallina: PALLINE_MS.length - 1 })
    expect(momentoDi(RIEPILOGO_MS)).toEqual({ tipo: 'riepilogo' })
    expect(momentoDi(DURATA_DIRETTA_MS + 60_000)).toEqual({ tipo: 'riepilogo' })
  })
})

describe('lo studio', () => {
  it('ogni pallina corre dentro il tubo e si ferma al suo posto, dritta', () => {
    expect(POSTI_X).toHaveLength(PALLINE_MS.length)
    POSTI_X.forEach((x, i) => {
      const tappe = viaggioDi(i)
      for (let k = 1; k < tappe.length; k += 1) expect(tappe[k].offset).toBeGreaterThan(tappe[k - 1].offset)
      expect(tappe[0].offset).toBe(0)
      // Alla fine del risucchio e' alla bocca, alla fine del tubo in fondo al tubo, sopra la rotaia.
      expect(tappe.find((p) => p.offset === RISUCCHIO_MS / ARRIVO_MS)).toMatchObject({ x: BOCCA.x, y: BOCCA.y })
      expect(tappe.find((p) => p.offset === (RISUCCHIO_MS + TUBO_MS) / ARRIVO_MS)).toMatchObject({
        x: TUBO.x,
        y: SULLA_ROTAIA,
      })
      const ultima = tappe[tappe.length - 1]
      expect(ultima).toMatchObject({ offset: 1, x, y: SULLA_ROTAIA, giro: 0, scala: 1, opacita: 1 })
      // Sulla rotaia, e i posti non si toccano; quelle gia' posate non stanno dove cade la prossima.
      expect(x - RAGGIO_PALLINA).toBeGreaterThanOrEqual(ROTAIA.da)
      if (i < POSTI_X.length - 1) expect(x + RAGGIO_PALLINA).toBeLessThanOrEqual(TUBO.x - RAGGIO_PALLINA)
      if (i > 0) expect(x - POSTI_X[i - 1]).toBeGreaterThanOrEqual(2 * RAGGIO_PALLINA)
    })
    expect(SULLA_ROTAIA + RAGGIO_PALLINA).toBe(ROTAIA.y)
  })

  it('la bocca sta sul bordo della sfera, e le palline dentro, anche nel mucchio', () => {
    const c = { x: SFERA.x + SFERA.lato / 2, y: SFERA.y + SFERA.lato / 2 }
    const r = SFERA.lato / 2
    expect(Math.hypot(BOCCA.x - c.x, BOCCA.y - c.y)).toBeGreaterThan(r - BOCCA.lato)
    for (const p of MISTE) {
      for (const [x, y] of [
        [p.x, p.y],
        [p.fermaX, p.fermaY],
      ]) {
        expect(Math.hypot(x - r, y - r)).toBeLessThan(r)
      }
    }
  })
})

describe('i numeri in lettere', () => {
  it('come li dice chi conduce', () => {
    expect(inLettere(1)).toBe('uno')
    expect(inLettere(11)).toBe('undici')
    expect(inLettere(17)).toBe('diciassette')
    expect(inLettere(21)).toBe('ventuno')
    expect(inLettere(23)).toBe('ventitré')
    expect(inLettere(28)).toBe('ventotto')
    expect(inLettere(40)).toBe('quaranta')
    expect(inLettere(47)).toBe('quarantasette')
    expect(inLettere(63)).toBe('sessantatré')
    expect(inLettere(81)).toBe('ottantuno')
    expect(inLettere(88)).toBe('ottantotto')
    expect(inLettere(90)).toBe('novanta')
  })

  it('tutti i novanta, ognuno diverso', () => {
    const tutti = Array.from({ length: 90 }, (_, i) => inLettere(i + 1))
    expect(new Set(tutti).size).toBe(90)
    for (const x of tutti) expect(x).toMatch(/^[a-zé]+$/)
  })
})

import { describe, expect, it } from 'vitest'
import { generateCode } from '../lib/codes'
import { CODE_LENGTH } from '../../shared/config'

describe('generazione del codice', () => {
  it('ha la lunghezza attesa e solo cifre', () => {
    for (let i = 0; i < 200; i += 1) {
      const code = generateCode()
      expect(code).toHaveLength(CODE_LENGTH)
      expect(code).toMatch(/^\d+$/)
    }
  })

  it('non produce sempre lo stesso codice', () => {
    const visti = new Set(Array.from({ length: 200 }, () => generateCode()))
    // Con un milione di possibili valori, 200 estrazioni quasi identiche
    // vorrebbero dire un generatore rotto.
    expect(visti.size).toBeGreaterThan(190)
  })

  it('usa tutte le cifre, senza sbilanciamenti grossolani', () => {
    /*
     * `% 10` su un byte casuale sarebbe sbilanciato, perché 256 non e' multiplo
     * di 10: le cifre da 0 a 5 uscirebbero circa il 3% piu' spesso. La
     * generazione scarta i byte oltre 249, e questo test verifica che nessuna
     * cifra sia troppo lontana dalla media.
     */
    const conteggi = new Array(10).fill(0) as number[]
    const estrazioni = 3000
    for (let i = 0; i < estrazioni; i += 1) {
      for (const c of generateCode()) conteggi[Number(c)] += 1
    }
    const atteso = (estrazioni * CODE_LENGTH) / 10
    for (const [cifra, quante] of conteggi.entries()) {
      // Tolleranza del 15%: ampia per il rumore statistico, stretta abbastanza
      // da bocciare uno sbilanciamento sistematico.
      expect(quante, `cifra ${cifra}`).toBeGreaterThan(atteso * 0.85)
      expect(quante, `cifra ${cifra}`).toBeLessThan(atteso * 1.15)
    }
  })
})

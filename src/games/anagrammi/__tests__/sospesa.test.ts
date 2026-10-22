import { describe, expect, it } from 'vitest'
import { daTestoAnagrammi, dettaglioAnagrammi, inTestoAnagrammi, type PartitaAnagrammiSalvata } from '../sospesa'

const parola = (parola: string) => ({
  parola,
  lettere: [...parola].reverse().join(''),
  risposte: [parola],
  definizione: 'Una definizione',
  aperta: null as number | null,
  esito: null,
  ms: null,
  aiuto: false,
  risposta: null,
})

const PARTITA: PartitaAnagrammiSalvata = {
  livello: 'normale',
  tempoMs: 90_000,
  parole: [
    { ...parola('mare'), aperta: 1_000, esito: 'trovata', ms: 12_000 },
    { ...parola('sole'), aperta: 50_000, aiuto: true },
    parola('vento'),
  ],
}

describe('la libera degli Anagrammi in sospeso', () => {
  it('ritrova la partita, e il tempo della parola aperta riparte da dove era', () => {
    // Salvata trenta secondi dopo aver aperto la seconda parola, ripresa il giorno dopo.
    const testo = inTestoAnagrammi(PARTITA, 80_000)
    const domani = 86_400_000
    const ripresa = daTestoAnagrammi(testo, domani)!
    expect(ripresa.livello).toBe('normale')
    expect(ripresa.tempoMs).toBe(90_000)
    expect(ripresa.parole.map((p) => p.parola)).toEqual(['mare', 'sole', 'vento'])
    expect(domani - ripresa.parole[1].aperta!).toBe(30_000)
    expect(ripresa.parole[1].aiuto).toBe(true)
    expect(ripresa.parole[2].aperta).toBeNull()
    expect(ripresa.parole[0]).toMatchObject({ esito: 'trovata', ms: 12_000 })
  })

  it('una parola aperta da troppo resta al tempo finito', () => {
    const ripresa = daTestoAnagrammi(inTestoAnagrammi(PARTITA, 500_000), 600_000)!
    expect(600_000 - ripresa.parole[1].aperta!).toBe(90_000)
  })

  it('un salvataggio rovinato non e una partita', () => {
    expect(daTestoAnagrammi(null, 0)).toBeNull()
    expect(daTestoAnagrammi('{', 0)).toBeNull()
    expect(daTestoAnagrammi(JSON.stringify({ livello: 'impossibile', tempoMs: 1, parole: [] }), 0)).toBeNull()
  })

  it('il biglietto dice a che parola si e', () => {
    expect(dettaglioAnagrammi(PARTITA)).toBe('Seconda parola di 3')
  })
})

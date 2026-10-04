import { describe, expect, it } from 'vitest'
import { POSTO_FORTUNA, SPICCHI_FORTUNATI, SPICCHI_RUOTA, type TipoSpicchio } from '@shared/ruota'
import type { RuotaSummary } from '@shared/types'
import { statoRuota } from '../stato'

const posto = (tipo: TipoSpicchio) => SPICCHI_RUOTA.findIndex((s) => s.tipo === tipo)
const postoFortunato = (tipo: TipoSpicchio) => SPICCHI_FORTUNATI.findIndex((s) => s.tipo === tipo)
const aperto = (spicchio: number, fortunata: number | null = null): RuotaSummary => ({
  saldo: 120,
  netto: -20,
  giri: 2,
  stato: 'sfida',
  spicchio,
  fortunata,
})

describe('Crazy Time nella scheda della Fortuna', () => {
  it('dice dove aspetta una sfida aperta: anche il Pachinko e il Cash Hunt, normali e della fortuna', () => {
    expect(statoRuota(aperto(posto('pachinko'))).dettaglio).toBe('Pachinko')
    expect(statoRuota(aperto(posto('cashhunt'))).dettaglio).toBe('Cash Hunt')
    expect(statoRuota(aperto(posto('moneta'))).dettaglio).toBe('Moneta')
    expect(statoRuota(aperto(posto('quiz'))).dettaglio).toBe('Quiz')
    expect(statoRuota(aperto(POSTO_FORTUNA)).dettaglio).toBe('Ruota fortunata')
    expect(statoRuota(aperto(POSTO_FORTUNA, postoFortunato('pachinko'))).dettaglio).toBe('Pachinko')
    expect(statoRuota(aperto(POSTO_FORTUNA, postoFortunato('cashhunt'))).dettaglio).toBe('Cash Hunt')
    expect(statoRuota(aperto(posto('pachinko'))).azione).toBe('Continua')
  })
})

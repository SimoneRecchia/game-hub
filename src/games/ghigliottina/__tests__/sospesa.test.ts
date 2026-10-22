import { describe, expect, it } from 'vitest'
import { disponiGhigliottina, type GhigliottinaDellElenco } from '@shared/ghigliottina'
import { mulberry32 } from '@shared/daily'
import {
  PREAMBOLO_RIPRESA_MS,
  daSalvare,
  dettaglioDi,
  leggiSalvata,
  partitaDa,
  type GhigliottinaSalvata,
} from '../sospesa'

const VOCE: GhigliottinaDellElenco = {
  s: 'colpo',
  c: [
    ['fulmine', 'tuono', 'colpo di fulmine'],
    ['testa', 'collo', 'colpo di testa'],
    ['sole', 'luna', 'colpo di sole'],
    ['scena', 'palco', 'colpo di scena'],
    ['grazia', 'pietà', 'colpo di grazia'],
  ],
}

const salvata = (piu: Partial<GhigliottinaSalvata> = {}): GhigliottinaSalvata => ({
  v: 1,
  s: 'colpo',
  seme: 12345,
  tempoSceltaMs: 20_000,
  tempoFinaleMs: 90_000,
  scelte: [0, null],
  finale: false,
  resta: 12_000,
  ...piu,
})

describe('la Ghigliottina libera in sospeso', () => {
  it('si rimette uguale: le stesse coppie, le stesse scelte, il tempo che restava', () => {
    const s = salvata()
    const p = partitaDa(s, VOCE, 50_000)
    expect(p.giorno).toEqual(disponiGhigliottina(VOCE, mulberry32(12345)))
    expect(p.scelte).toEqual([0, null])
    expect(p.orologioCoppia).toEqual({ inizio: 50_000 + PREAMBOLO_RIPRESA_MS, scadenza: 50_000 + PREAMBOLO_RIPRESA_MS + 12_000 })
    expect(p.scadenza).toBeNull()
    expect(dettaglioDi(p)).toBe('Terza coppia')
    // Lasciata di nuovo prima che il tempo riparta, il tempo e' quello di prima: la ripresa non ne regala.
    expect(daSalvare(p, 50_000)).toEqual(s)
    // Quattro secondi dopo che e' ripartito, ne mancano quattro di meno.
    expect(daSalvare(p, 50_000 + PREAMBOLO_RIPRESA_MS + 4_000)?.resta).toBe(8_000)
  })

  it('passa dal telefono e torna com era', () => {
    const s = salvata({ scelte: [0, 1, null, 1, 0], finale: true, resta: 33_000 })
    expect(leggiSalvata(JSON.stringify(s))).toEqual(s)
    const p = partitaDa(s, VOCE, 1_000)
    expect(p.orologioCoppia).toBeNull()
    expect(p.scadenza).toBe(34_000)
    expect(dettaglioDi(p)).toBe('La parola vincente')
    expect(daSalvare(p, 11_000)?.resta).toBe(23_000)
  })

  it('alle cinque parole il tempo della vincente non e partito', () => {
    const p = partitaDa(salvata({ scelte: [0, 1, 0, 1, 0], resta: null }), VOCE, 0)
    expect(p.orologioCoppia).toBeNull()
    expect(p.scadenza).toBeNull()
  })

  it('non salva una sfida, una partita non cominciata o finita', () => {
    const p = partitaDa(salvata(), VOCE, 0)
    expect(daSalvare({ ...p, voce: null }, 0)).toBeNull()
    expect(daSalvare({ ...p, iniziata: false }, 0)).toBeNull()
    expect(daSalvare({ ...p, finita: true }, 0)).toBeNull()
  })

  it('scarta un salvataggio rovinato', () => {
    expect(leggiSalvata(null)).toBeNull()
    expect(leggiSalvata('{')).toBeNull()
    expect(leggiSalvata(JSON.stringify({ ...salvata(), v: 2 }))).toBeNull()
    expect(leggiSalvata(JSON.stringify({ ...salvata(), scelte: [3] }))).toBeNull()
    expect(leggiSalvata(JSON.stringify({ ...salvata(), finale: true }))).toBeNull()
  })
})

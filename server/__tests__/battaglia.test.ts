import { describe, expect, it } from 'vitest'
import { BATTAGLIA_ATTESA_FLOTTA_MS, BATTAGLIA_ATTESA_TURNO_MS } from '../../shared/config'
import type { Nave } from '../../shared/battaglia'
import {
  colpiDelLato,
  diTurno,
  ordinaBattaglia,
  reclamo,
  tiratore,
  type PartitaRow,
} from '../lib/battagliaStore'

const FLOTTA_A: Nave[] = [
  { tipo: 'portaerei', r: 0, c: 0, verticale: false },
  { tipo: 'corazzata', r: 2, c: 0, verticale: true },
  { tipo: 'incrociatore', r: 2, c: 2, verticale: false },
  { tipo: 'sottomarino', r: 2, c: 6, verticale: true },
  { tipo: 'cacciatorpediniere', r: 5, c: 8, verticale: false },
]
const FLOTTA_B: Nave[] = FLOTTA_A.map((n) => ({ ...n, r: 9 - n.r - (n.verticale ? 3 : 0) }))

function partita(colpi: number[], extra: Partial<PartitaRow> = {}): PartitaRow {
  return {
    id: 'bat_1',
    giocatore_a: 'pa',
    giocatore_b: 'pb',
    stato: 'battaglia',
    flotta_a: JSON.stringify(FLOTTA_A),
    flotta_b: JSON.stringify(FLOTTA_B),
    primo: 'b',
    colpi: JSON.stringify(colpi),
    vincitore: null,
    motivo: null,
    versione: colpi.length,
    created_at: '2026-09-26T10:00:00.000Z',
    updated_at: '2026-09-26T10:05:00.000Z',
    finita_at: null,
    ...extra,
  }
}

describe('i turni', () => {
  it('si alternano, cominciando da chi e\' stato sorteggiato', () => {
    expect([0, 1, 2, 3].map((i) => tiratore(i, 'b'))).toEqual(['b', 'a', 'b', 'a'])
    expect(diTurno(partita([]))).toBe('b')
    expect(diTurno(partita([55]))).toBe('a')
  })

  it('in disposizione e a partita finita non tocca a nessuno', () => {
    expect(diTurno(partita([], { stato: 'disposizione', primo: null }))).toBeNull()
    expect(diTurno(partita([1, 2], { stato: 'finita' }))).toBeNull()
  })
})

describe('gli esiti, visti da ciascun lato', () => {
  it('i colpi pari sono di chi ha cominciato, e colpiscono la flotta dell\'altro', () => {
    // b spara in A-1 (portaerei di a), a spara in J-10 (acqua), b spara in B-1.
    const row = partita([0, 99, 1])
    expect(colpiDelLato(row, 'b')).toEqual([
      { casella: 0, esito: 'colpito', nave: null },
      { casella: 1, esito: 'colpito', nave: null },
    ])
    expect(colpiDelLato(row, 'a')).toEqual([{ casella: 99, esito: 'acqua', nave: null }])
  })

  it('il nome della nave si dice solo quando affonda', () => {
    // Il cacciatorpediniere di a sta in I-6 e J-6: caselle 58 e 59.
    const row = partita([58, 0, 59])
    expect(colpiDelLato(row, 'b').map((c) => [c.esito, c.nave])).toEqual([
      ['colpito', null],
      ['affondato', 'cacciatorpediniere'],
    ])
  })
})

describe('la vittoria a tavolino', () => {
  const inizio = Date.parse('2026-09-26T10:05:00.000Z')

  it('si chiede solo quando tocca all\'altro, e dopo il tempo previsto', () => {
    const row = partita([55]) // tocca ad a
    expect(reclamo(row, 'b', inizio + BATTAGLIA_ATTESA_TURNO_MS - 1).puoi).toBe(false)
    expect(reclamo(row, 'b', inizio + BATTAGLIA_ATTESA_TURNO_MS).puoi).toBe(true)
    // Chi deve sparare non puo' reclamare contro se stesso.
    expect(reclamo(row, 'a', inizio + BATTAGLIA_ATTESA_TURNO_MS * 10).puoi).toBe(false)
  })

  it('in disposizione, solo chi e\' pronto contro chi non lo e\'', () => {
    const row = partita([], { stato: 'disposizione', primo: null, flotta_b: null })
    const tardi = inizio + BATTAGLIA_ATTESA_FLOTTA_MS
    expect(reclamo(row, 'a', tardi).puoi).toBe(true)
    expect(reclamo(row, 'b', tardi).puoi).toBe(false)
    expect(reclamo(row, 'a', tardi - 1).puoi).toBe(false)
  })
})

describe('la classifica', () => {
  it('vittorie prima, poi meno sconfitte: non la percentuale', () => {
    const righe = ordinaBattaglia([
      { playerId: '1', nickname: 'poche', displayName: 'poche', avatarColor: '#000', vinte: 2, perse: 0 },
      { playerId: '2', nickname: 'tante', displayName: 'tante', avatarColor: '#000', vinte: 7, perse: 3 },
      { playerId: '3', nickname: 'pari', displayName: 'pari', avatarColor: '#000', vinte: 7, perse: 1 },
    ])
    expect(righe.map((r) => r.nickname)).toEqual(['pari', 'tante', 'poche'])
  })
})

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
    modalita: 'amici',
    giocatore_a: 'pa',
    giocatore_b: 'pb',
    livello: null,
    seme: null,
    puzzle_number: null,
    punti: null,
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
    serie_a: 0,
    serie_b: 0,
    partite_serie: 0,
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
  const riga = (nickname: string, punti: number, vinte: number, colpi: number, giornate = 3) => ({
    playerId: nickname,
    nickname,
    displayName: nickname,
    avatarColor: '#000',
    punti,
    giornate,
    vinte,
    colpi,
    oggi: null,
    inCorso: false,
  })

  it('punti prima, poi le vittorie, poi meno colpi per vincere', () => {
    const righe = ordinaBattaglia([
      riga('poche', 180, 2, 90),
      riga('tante', 240, 3, 160),
      riga('precise', 240, 3, 130),
      riga('fortunate', 240, 2, 60),
    ])
    expect(righe.map((r) => r.nickname)).toEqual(['precise', 'tante', 'fortunate', 'poche'])
    expect(righe.map((r) => r.rank)).toEqual([1, 2, 3, 4])
  })
})

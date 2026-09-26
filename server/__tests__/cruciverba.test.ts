import { describe, expect, it } from 'vitest'
import {
  ordinaCruciverba,
  registraControllo,
  tempoDichiarato,
  type PartitaRow,
  type TotaliCruciverba,
} from '../lib/cruciverbaStore'

function giocatore(nickname: string, punti: number, giornate: number, tempoMs: number): TotaliCruciverba {
  return {
    playerId: nickname,
    nickname,
    displayName: nickname,
    avatarColor: '#000',
    punti,
    giornate,
    tempoMs,
    inCorso: giornate === 0,
  }
}

describe('la classifica del cruciverba', () => {
  it('punti prima, poi il tempo piu\' corto, e chi non ha finito in fondo', () => {
    const righe = ordinaCruciverba([
      giocatore('lento', 100, 1, 900_000),
      giocatore('aperto', 0, 0, 0),
      giocatore('rapido', 100, 1, 300_000),
      giocatore('aiutato', 91, 1, 120_000),
    ])
    expect(righe.map((r) => r.nickname)).toEqual(['rapido', 'lento', 'aiutato', 'aperto'])
    expect(righe.map((r) => r.rank)).toEqual([1, 2, 3, 4])
  })
})

describe('il controllo', () => {
  it('fa pagare solo gli errori nuovi', () => {
    const primo = registraControllo({}, 'ab', [0, 1])
    expect(primo.nuovi).toBe(2)
    // Stesse lettere sbagliate: niente di nuovo.
    const secondo = registraControllo(primo.segnalate, 'ab', [0, 1])
    expect(secondo.nuovi).toBe(0)
    // Una lettera diversa, ancora sbagliata, e' un errore nuovo; tornare a una
    // gia' segnalata no.
    const terzo = registraControllo(secondo.segnalate, 'cb', [0, 1])
    expect(terzo.nuovi).toBe(1)
    expect(registraControllo(terzo.segnalate, 'ab', [0]).nuovi).toBe(0)
  })
})

describe('il tempo dichiarato dal browser', () => {
  const riga = { tempo_ms: 60_000, updated_at: '2026-09-26T10:00:00.000Z' } as PartitaRow
  const adesso = Date.parse('2026-09-26T10:00:30.000Z')

  it('cresce al massimo di quanto e\' passato davvero, con un margine per la rete', () => {
    expect(tempoDichiarato(riga, 75_000, adesso)).toBe(75_000)
    expect(tempoDichiarato(riga, 10_000_000, adesso)).toBe(60_000 + 30_000 + 5_000)
  })

  it('non torna indietro, e ignora quel che non e\' un numero', () => {
    expect(tempoDichiarato(riga, 1_000, adesso)).toBe(60_000)
    expect(tempoDichiarato(riga, 'tanto', adesso)).toBe(60_000)
  })
})

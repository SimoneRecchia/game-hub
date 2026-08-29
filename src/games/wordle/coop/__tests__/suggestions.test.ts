import { describe, expect, it } from 'vitest'
import { ASSIST_PLAYED } from '@shared/scoring'
import { latestPerGuest } from '../suggestions'
import type { CoopSuggestion } from '@shared/types'

/** Costruisce un suggerimento con i soli campi che contano per il test. */
function s(id: string, guestId: string, word: string, usedAt: string | null = null): CoopSuggestion {
  return {
    id,
    guestId,
    word,
    usedAt,
    // I punti seguono `usedAt`: si assegnano quando l'host gioca la parola.
    assistPoints: usedAt === null ? 0 : ASSIST_PLAYED,
    guestName: guestId,
    avatarColor: '#007aff',
    createdAt: `2026-08-29T10:00:${id.padStart(2, '0')}.000Z`,
  }
}

describe('ultimi suggerimenti per invitato', () => {
  it('tiene solo il piu recente di ciascuno', () => {
    // In ingresso arrivano dal piu' recente: la prima occorrenza di un
    // invitato e' la sua proposta attuale.
    const risultato = latestPerGuest([
      s('3', 'luca', 'porta'),
      s('2', 'luca', 'senza'),
      s('1', 'giulia', 'corsa'),
    ])
    expect(risultato.map((x) => x.word)).toEqual(['porta', 'corsa'])
  })

  it('conserva l ordine in cui sono arrivati', () => {
    const risultato = latestPerGuest([
      s('3', 'giulia', 'corsa'),
      s('2', 'luca', 'porta'),
    ])
    expect(risultato.map((x) => x.guestId)).toEqual(['giulia', 'luca'])
  })

  it('si ferma al limite', () => {
    const molti = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((g, i) => s(String(i), g, 'porta'))
    expect(latestPerGuest(molti, 5)).toHaveLength(5)
  })

  it('il limite conta gli invitati, non i suggerimenti', () => {
    // Sei suggerimenti ma due soli invitati: non deve tagliare a caso.
    const risultato = latestPerGuest(
      [
        s('6', 'luca', 'porta'),
        s('5', 'luca', 'senza'),
        s('4', 'luca', 'corsa'),
        s('3', 'giulia', 'tempo'),
        s('2', 'giulia', 'nuovo'),
        s('1', 'giulia', 'primo'),
      ],
      5,
    )
    expect(risultato.map((x) => x.word)).toEqual(['porta', 'tempo'])
  })

  it('regge un elenco vuoto', () => {
    expect(latestPerGuest([])).toEqual([])
  })

  it('non perde l informazione su chi e stato ascoltato', () => {
    const risultato = latestPerGuest([s('1', 'luca', 'porta', '2026-08-29T10:05:00.000Z')])
    expect(risultato[0].usedAt).not.toBeNull()
  })
})

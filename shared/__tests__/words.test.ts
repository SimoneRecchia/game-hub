import { describe, expect, it } from 'vitest'
import { GUESS_SET, GUESS_WORDS } from '../words/guesses'
import { SOLUTION_WORDS } from '../words/solutions'
import { WORD_LENGTH } from '../config'

describe('elenco dei tentativi ammessi', () => {
  it('contiene abbastanza parole da non rifiutare tentativi sensati', () => {
    expect(GUESS_WORDS.length).toBeGreaterThan(5000)
  })

  it('sono tutte di cinque lettere minuscole a-z', () => {
    const invalid = GUESS_WORDS.filter((w) => !/^[a-z]{5}$/.test(w))
    expect(invalid).toEqual([])
    expect(new Set(GUESS_WORDS.map((w) => w.length))).toEqual(new Set([WORD_LENGTH]))
  })

  it('non ha duplicati', () => {
    expect(GUESS_SET.size).toBe(GUESS_WORDS.length)
  })

  it('e in ordine alfabetico', () => {
    const sorted = [...GUESS_WORDS].sort((a, b) => a.localeCompare(b, 'it'))
    expect(GUESS_WORDS).toEqual(sorted)
  })

  it('contiene parole italiane comuni', () => {
    for (const word of ['gatto', 'tempo', 'verde', 'pasta', 'libro', 'donna']) {
      expect(GUESS_SET.has(word)).toBe(true)
    }
  })
})

describe('elenco delle soluzioni', () => {
  it('copre almeno tre anni di parole giornaliere', () => {
    expect(SOLUTION_WORDS.length).toBeGreaterThanOrEqual(365 * 3)
  })

  it('e un sottoinsieme dei tentativi ammessi', () => {
    // Se cadesse questo, il gioco rifiuterebbe la parola giusta.
    const orphans = SOLUTION_WORDS.filter((w) => !GUESS_SET.has(w))
    expect(orphans).toEqual([])
  })

  it('non ha duplicati', () => {
    expect(new Set(SOLUTION_WORDS).size).toBe(SOLUTION_WORDS.length)
  })

  it('non contiene lettere estranee all italiano', () => {
    const foreign = SOLUTION_WORDS.filter((w) => /[jkwxy]/.test(w))
    expect(foreign).toEqual([])
  })

  it('finiscono per vocale, salvo le eccezioni note', () => {
    const consonantFinal = SOLUTION_WORDS.filter((w) => !/[aeiou]$/.test(w))
    expect(consonantFinal).toEqual(['ovest'])
  })

  it('non contiene i refusi senza accento del corpus', () => {
    for (const typo of ['citta', 'potro', 'sapra', 'lassu', 'caffe', 'unita']) {
      expect(SOLUTION_WORDS).not.toContain(typo)
    }
  })

  it('non contiene preposizioni articolate', () => {
    for (const glue of ['della', 'nella', 'dalla', 'sulla', 'degli']) {
      expect(SOLUTION_WORDS).not.toContain(glue)
    }
  })
})

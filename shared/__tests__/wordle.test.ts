import { describe, expect, it } from 'vitest'
import {
  ALFABETO,
  KEYBOARD_ROWS,
  evaluateAll,
  evaluateGuess,
  isGameLetter,
  keyboardStates,
  shareText,
  statusAfter,
} from '../wordle'
import type { TileState } from '../types'

/** "gpa" → ['correct','present','absent'], per test leggibili. */
function p(compact: string): TileState[] {
  const map: Record<string, TileState> = { g: 'correct', p: 'present', a: 'absent' }
  return [...compact].map((c) => {
    const state = map[c]
    if (!state) throw new Error(`carattere non valido: ${c}`)
    return state
  })
}

describe('valutazione di un tentativo', () => {
  it('tutto verde quando indovina', () => {
    expect(evaluateGuess('gatto', 'gatto')).toEqual(p('ggggg'))
  })

  it('tutto grigio quando non condivide lettere', () => {
    expect(evaluateGuess('bunde', 'gatto')).toEqual(p('aaaaa'))
  })

  it('distingue posizione giusta e lettera presente', () => {
    // soluzione g a t t o
    // tentativo t a n t i
    //   T fuori posto (la soluzione ne ha due, una e' libera) → giallo
    //   A al posto giusto                                      → verde
    //   N assente, T al posto giusto, I assente
    expect(evaluateGuess('tanti', 'gatto')).toEqual(p('pgaga'))
  })

  describe('lettere ripetute', () => {
    it('la seconda copia resta grigia se la soluzione ne ha una sola', () => {
      // "tempo" ha una sola E, e il verde in posizione 2 se la prende tutta:
      // la E finale di "serve" non ha piu' nulla da cui pescare.
      expect(evaluateGuess('serve', 'tempo')).toEqual(p('agaaa'))
    })

    it('conta quante lettere restano davvero disponibili', () => {
      // soluzione g a t t o  (una A, due T)
      // tentativo s t a t a  (due A, due T)
      //   la T in posizione 4 e' verde e consuma una delle due T
      //   la T in posizione 2 pesca la T rimasta          → giallo
      //   la prima A pesca l'unica A                       → giallo
      //   la seconda A non trova piu' nulla                → grigio
      expect(evaluateGuess('stata', 'gatto')).toEqual(p('appga'))
    })

    it('i verdi si prendono le lettere prima dei gialli', () => {
      // soluzione a m a r a (tre A)
      // tentativo a r o m a
      //   le A ai bordi sono verdi, R e M ci sono ma spostate, O assente
      expect(evaluateGuess('aroma', 'amara')).toEqual(p('gpapg'))
    })

    it('caso limite: tre copie nel tentativo, una nella soluzione', () => {
      expect(evaluateGuess('aaabb', 'xxxxa')).toEqual(p('paaaa'))
    })
  })

  it('rifiuta lunghezze diverse', () => {
    expect(() => evaluateGuess('gatti', 'sei')).toThrow()
  })
})

describe('stato della partita', () => {
  it('resta in gioco finche ci sono tentativi', () => {
    expect(statusAfter(evaluateAll(['tempo'], 'gatto'), 'gatto')).toBe('playing')
    expect(statusAfter(evaluateAll(['tempo', 'volta', 'senza'], 'gatto'), 'gatto')).toBe('playing')
  })

  it('vinta appena la parola compare', () => {
    expect(statusAfter(evaluateAll(['tempo', 'gatto'], 'gatto'), 'gatto')).toBe('won')
  })

  it('persa al sesto tentativo sbagliato', () => {
    const six = ['tempo', 'volta', 'senza', 'primo', 'corsa', 'nuovo']
    expect(statusAfter(evaluateAll(six, 'gatto'), 'gatto')).toBe('lost')
  })

  it('vinta al sesto tentativo non e persa', () => {
    const six = ['tempo', 'volta', 'senza', 'primo', 'corsa', 'gatto']
    expect(statusAfter(evaluateAll(six, 'gatto'), 'gatto')).toBe('won')
  })
})

describe('colori della tastiera', () => {
  it('tiene l informazione migliore per ogni lettera', () => {
    // La T e' verde nel primo tentativo: non deve tornare gialla nel secondo.
    const guesses = evaluateAll(['tanto', 'testa'], 'tanto')
    expect(keyboardStates(guesses).get('t')).toBe('correct')
  })

  it('promuove da assente a presente', () => {
    const states = keyboardStates(evaluateAll(['senza', 'corsa'], 'corsa'))
    expect(states.get('c')).toBe('correct')
    expect(states.get('n')).toBe('absent')
  })

  it('non inventa lettere mai giocate', () => {
    expect(keyboardStates(evaluateAll(['gatto'], 'gatto')).has('z')).toBe(false)
  })
})

describe('testo da condividere', () => {
  const guesses = evaluateAll(['tempo', 'gatto'], 'gatto')

  it('riporta tentativi, punti e griglia', () => {
    const text = shareText({ puzzleNumber: 7, guesses, status: 'won', score: 105 })
    expect(text).toContain('Wordle #7 2/6')
    expect(text).toContain('105 punti')
    expect(text.split('\n').at(-1)).toBe('🟩🟩🟩🟩🟩')
  })

  it('non rivela mai la parola', () => {
    const text = shareText({ puzzleNumber: 7, guesses, status: 'won', score: 105 })
    expect(text.toLowerCase()).not.toContain('gatto')
    expect(text.toLowerCase()).not.toContain('tempo')
  })

  it('segna la sconfitta con la X', () => {
    const six = evaluateAll(['tempo', 'volta', 'senza', 'primo', 'corsa', 'nuovo'], 'gatto')
    const text = shareText({ puzzleNumber: 7, guesses: six, status: 'lost', score: 5 })
    expect(text).toContain('X/6')
  })
})

describe('lettere del gioco', () => {
  it('sono le 21 dell’alfabeto italiano', () => {
    expect(ALFABETO).toHaveLength(21)
    for (const fuori of 'jkwxy') expect(ALFABETO).not.toContain(fuori)
  })

  it('accetta ogni tasto che c’è sulla tastiera', () => {
    // L'invariante che mancava: il filtro dei tasti fisici usava `[a-hl-vz]`,
    // che salta la i — sulla tastiera a schermo c'era, da computer non si
    // poteva digitare, e "germi" era impossibile da scrivere.
    for (const row of KEYBOARD_ROWS) {
      for (const key of row) {
        if (key === 'ENTER' || key === 'BACK') continue
        expect(isGameLetter(key), `il tasto ${key} deve essere digitabile`).toBe(true)
      }
    }
  })

  it('ha la cancellazione e l’invio a destra, l’invio in basso, come i telefoni', () => {
    const [, seconda, terza] = KEYBOARD_ROWS
    expect(seconda[seconda.length - 1]).toBe('BACK')
    expect(terza[terza.length - 1]).toBe('ENTER')
    expect(KEYBOARD_ROWS.flat().filter((k) => k === 'ENTER' || k === 'BACK')).toHaveLength(2)
  })

  it('mette sulla tastiera ogni lettera giocabile', () => {
    const sulla = new Set<string>(KEYBOARD_ROWS.flat())
    for (const letter of ALFABETO) {
      expect(sulla.has(letter), `la lettera ${letter} deve stare sulla tastiera`).toBe(true)
    }
  })

  it('rifiuta le lettere straniere e tutto quel che non e’ una lettera', () => {
    for (const key of ['j', 'k', 'w', 'x', 'y', 'à', '1', '', 'ab', 'Enter', ' ']) {
      expect(isGameLetter(key)).toBe(false)
    }
  })
})

/**
 * Regole del Wordle, condivise fra client e server.
 *
 * La valutazione di un tentativo gira solo nel Worker (il client non conosce
 * la soluzione finché la partita non e' chiusa), ma sta qui perché i test la
 * usano e perché a partita finita anche il client la riusa per ridisegnare la
 * griglia partendo dalle sole parole giocate.
 */

import { MAX_ATTEMPTS, WORD_LENGTH } from './config'
import type { EvaluatedGuess, TileState, WordleStatus } from './types'

/**
 * Colora un tentativo confrontandolo con la soluzione.
 *
 * Due passaggi, e il motivo e' tutto nelle lettere ripetute. Con soluzione
 * "palla" e tentativo "lalla": la seconda L del tentativo e' al posto giusto,
 * la prima no — ma nella soluzione le L disponibili sono due, non tre. Un
 * passaggio unico da sinistra a destra colorerebbe di giallo una L che non
 * esiste. Quindi: prima si fissano i verdi e si scala il conteggio, poi i
 * gialli pescano solo da quello che resta.
 */
export function evaluateGuess(guess: string, answer: string): TileState[] {
  if (guess.length !== answer.length) {
    throw new Error(`Tentativo di ${guess.length} lettere contro soluzione di ${answer.length}`)
  }

  const pattern: TileState[] = new Array(guess.length).fill('absent')
  const remaining = new Map<string, number>()

  for (let i = 0; i < answer.length; i += 1) {
    if (guess[i] === answer[i]) {
      pattern[i] = 'correct'
    } else {
      remaining.set(answer[i], (remaining.get(answer[i]) ?? 0) + 1)
    }
  }

  for (let i = 0; i < guess.length; i += 1) {
    if (pattern[i] === 'correct') continue
    const left = remaining.get(guess[i]) ?? 0
    if (left > 0) {
      pattern[i] = 'present'
      remaining.set(guess[i], left - 1)
    }
  }

  return pattern
}

/** Ricostruisce i tentativi valutati dalle sole parole giocate. */
export function evaluateAll(words: readonly string[], answer: string): EvaluatedGuess[] {
  return words.map((word) => ({ word, pattern: evaluateGuess(word, answer) }))
}

export function statusAfter(guesses: readonly EvaluatedGuess[], answer: string): WordleStatus {
  if (guesses.some((g) => g.word === answer)) return 'won'
  return guesses.length >= MAX_ATTEMPTS ? 'lost' : 'playing'
}

const STATE_RANK: Record<TileState, number> = { absent: 0, present: 1, correct: 2 }

/**
 * Stato di ogni lettera per colorare la tastiera.
 *
 * Vince sempre l'informazione migliore: una lettera trovata verde resta verde
 * anche se in un tentativo successivo finisce in una posizione sbagliata.
 */
export function keyboardStates(guesses: readonly EvaluatedGuess[]): Map<string, TileState> {
  const states = new Map<string, TileState>()
  for (const { word, pattern } of guesses) {
    for (let i = 0; i < word.length; i += 1) {
      const letter = word[i]
      const current = states.get(letter)
      if (!current || STATE_RANK[pattern[i]] > STATE_RANK[current]) {
        states.set(letter, pattern[i])
      }
    }
  }
  return states
}

const EMOJI: Record<TileState, string> = {
  correct: '🟩',
  present: '🟨',
  absent: '⬜',
}

const EMOJI_DARK: Record<TileState, string> = {
  correct: '🟩',
  present: '🟨',
  absent: '⬛',
}

interface ShareInput {
  puzzleNumber: number
  guesses: readonly EvaluatedGuess[]
  status: WordleStatus
  score: number | null
  dark?: boolean
}

/**
 * Il classico riquadro di quadratini da incollare in chat.
 * Non contiene la parola: si può condividere senza rovinare la giornata a nessuno.
 */
export function shareText({
  puzzleNumber,
  guesses,
  status,
  score,
  dark = false,
}: ShareInput): string {
  const palette = dark ? EMOJI_DARK : EMOJI
  const result = status === 'won' ? `${guesses.length}/${MAX_ATTEMPTS}` : `X/${MAX_ATTEMPTS}`
  const grid = guesses.map((g) => g.pattern.map((s) => palette[s]).join('')).join('\n')
  const points = score === null ? '' : `\n${score} punti`
  return `Game Hub · Wordle #${puzzleNumber} ${result}${points}\n\n${grid}`
}

/** Il tentativo ha la forma giusta? (non dice se la parola esiste) */
export function isWellFormedGuess(guess: string): boolean {
  return new RegExp(`^[a-z]{${WORD_LENGTH}}$`).test(guess)
}

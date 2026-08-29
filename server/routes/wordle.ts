import { Hono } from 'hono'
import { MAX_ATTEMPTS, WORD_LENGTH } from '../../shared/config'
import { msToNextPuzzle } from '../../shared/daily'
import { scoreFor } from '../../shared/scoring'
import type { PlayerStats, WordleState, WordleStatus, WordleSummary } from '../../shared/types'
import { evaluateAll, isWellFormedGuess, statusAfter } from '../../shared/wordle'
import { GUESS_SET } from '../../shared/words/guesses'
import type { AppEnv } from '../types'
import { fail } from '../lib/http'
import { requireAuth } from '../lib/session'
import { findRoom, markSuggestionUsed } from '../lib/coopStore'
import {
  dailyAnswer,
  openGame,
  parseGuesses,
  playerStats,
  streakBefore,
  today,
  type GameRow,
} from '../lib/wordleStore'

/**
 * La soluzione viene rivelata solo a partita chiusa.
 *
 * E' il motivo per cui la valutazione dei tentativi sta qui e non nel browser:
 * finché si gioca, il client non ha modo di sapere qual e' la parola, quindi la
 * classifica misura qualcosa di reale.
 */
function toState(row: GameRow, now = new Date()): WordleState {
  const words = parseGuesses(row)
  const guesses = evaluateAll(words, row.answer)

  return {
    puzzleNumber: row.puzzle_number,
    date: row.date,
    wordLength: WORD_LENGTH,
    maxAttempts: MAX_ATTEMPTS,
    guesses,
    status: row.status,
    answer: row.status === 'playing' ? null : row.answer,
    score: row.score,
    spectated: row.spectated === 1,
    msToNextPuzzle: msToNextPuzzle(now),
  }
}

export const wordleRoutes = new Hono<AppEnv>()

  .use('*', requireAuth)

  /** Stato della partita di oggi. La crea al primo accesso della giornata. */
  .get('/state', async (c) => {
    const when = today()
    const answer = await dailyAnswer(c.env.DB, when)
    const row = await openGame(c.env.DB, c.get('player').id, when, answer)
    return c.json<WordleState>(toState(row))
  })

  .post('/guess', async (c) => {
    const body = (await c.req.json().catch(() => null)) as { guess?: unknown } | null
    const raw = typeof body?.guess === 'string' ? body.guess.trim().toLowerCase() : ''

    if (!isWellFormedGuess(raw)) {
      fail(400, 'BAD_GUESS', `Serve una parola di ${WORD_LENGTH} lettere, senza accenti.`)
    }
    if (!GUESS_SET.has(raw)) {
      fail(400, 'NOT_A_WORD', `"${raw.toUpperCase()}" non è nel dizionario.`)
    }

    const when = today()
    const answer = await dailyAnswer(c.env.DB, when)
    const row = await openGame(c.env.DB, c.get('player').id, when, answer)

    if (row.status !== 'playing') {
      fail(409, 'GAME_OVER', 'La partita di oggi è già chiusa.')
    }

    const words = parseGuesses(row)
    if (words.includes(raw)) {
      // Il Wordle originale accetterebbe il doppione bruciando un tentativo.
      // Rifiutarlo non cambia la difficoltà e evita un errore di distrazione.
      fail(400, 'ALREADY_TRIED', `"${raw.toUpperCase()}" l'hai già provata.`)
    }

    const nextWords = [...words, raw]
    const guesses = evaluateAll(nextWords, row.answer)
    const status = statusAfter(guesses, row.answer)
    const now = new Date()
    const nowText = now.toISOString()
    const firstGuessAt = row.first_guess_at ?? nowText

    let durationMs: number | null = null
    let finishedAt: string | null = null
    let score: number | null = null
    let streak: number | null = null

    if (status !== 'playing') {
      finishedAt = nowText
      durationMs = Math.max(0, now.getTime() - new Date(firstGuessAt).getTime())
      // La streak viene congelata: la classifica di una giornata passata non
      // deve cambiare col passare del tempo.
      streak =
        status === 'won'
          ? (await streakBefore(c.env.DB, c.get('player').id, row.puzzle_number)) + 1
          : 0
      /*
       * Chi ha guardato la partita di un altro prima di giocare conosceva la
       * parola: la giornata resta giocabile ma non fa punti. Senza questo la
       * classifica non misurerebbe piu' nulla.
       */
      score = row.spectated === 1
        ? 0
        : scoreFor({ status, attempts: nextWords.length, durationMs, streak })
    }

    // Aggiornamento condizionato al numero di tentativi che abbiamo letto:
    // se nel frattempo e' arrivato un altro tentativo (due schede aperte,
    // doppio tap), questa scrittura non passa e il client rilegge lo stato.
    const update = await c.env.DB.prepare(
      `UPDATE wordle_games
          SET guesses = ?, attempts = ?, status = ?, first_guess_at = ?,
              finished_at = ?, duration_ms = ?, score = ?, streak_at_end = ?
        WHERE id = ? AND attempts = ?`,
    )
      .bind(
        JSON.stringify(nextWords),
        nextWords.length,
        status,
        firstGuessAt,
        finishedAt,
        durationMs,
        score,
        streak,
        row.id,
        words.length,
      )
      .run()

    if (update.meta.changes !== 1) {
      fail(409, 'CONFLICT', 'Un altro tentativo è arrivato prima. Ricarica la pagina.')
    }

    /*
     * Se qualcuno aveva suggerito questa parola, il suggerimento risulta usato:
     * serve a far vedere all'host, e a chi lo ha aiutato, che il consiglio e'
     * stato seguito.
     */
    const room = await findRoom(c.env.DB, c.get('player').id, row.puzzle_number)
    if (room) await markSuggestionUsed(c.env.DB, room.id, raw)

    return c.json<WordleState>(
      toState(
        {
          ...row,
          guesses: JSON.stringify(nextWords),
          attempts: nextWords.length,
          status,
          first_guess_at: firstGuessAt,
          finished_at: finishedAt,
          duration_ms: durationMs,
          score,
          streak_at_end: streak,
        },
        now,
      ),
    )
  })

  /**
   * Riepilogo per la card dell'hub.
   *
   * Di sola lettura di proposito: aprire l'hub non deve creare la partita del
   * giorno né fissare la parola, altrimenti comparirebbero partite mai giocate.
   */
  .get('/summary', async (c) => {
    const when = today()
    const row = await c.env.DB.prepare(
      `SELECT status, attempts, score FROM wordle_games
        WHERE player_id = ? AND puzzle_number = ?`,
    )
      .bind(c.get('player').id, when.puzzleNumber)
      .first<{ status: WordleStatus; attempts: number; score: number | null }>()

    return c.json<WordleSummary>({
      puzzleNumber: when.puzzleNumber,
      date: when.date,
      status: row?.status ?? 'new',
      attempts: row?.attempts ?? 0,
      score: row?.score ?? null,
      msToNextPuzzle: msToNextPuzzle(),
    })
  })

  /** Statistiche personali: partite, vittorie, streak, distribuzione tentativi. */
  .get('/stats', async (c) => {
    const stats = await playerStats(c.env.DB, c.get('player').id, today().puzzleNumber)
    return c.json<PlayerStats>(stats)
  })

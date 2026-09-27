import { Hono } from 'hono'
import { MAX_ATTEMPTS, WORD_LENGTH } from '../../shared/config'
import { msToNextPuzzle } from '../../shared/daily'
import { scoreFor } from '../../shared/scoring'
import type {
  PlayerStats,
  WordleLiberaRisposta,
  WordleLiberaState,
  WordleState,
  WordleSummary,
} from '../../shared/types'
import { evaluateAll, isWellFormedGuess, statusAfter } from '../../shared/wordle'
import { GUESS_SET } from '../../shared/words/guesses'
import type { AppEnv } from '../types'
import { fail } from '../lib/http'
import { requireVerified } from '../lib/session'
import { findRoom, markSuggestionUsed, payAssists } from '../lib/coopStore'
import { riepilogoWordle } from '../lib/riepiloghi'
import {
  liberaAperta,
  liberaPerId,
  nuovaLibera,
  paroleDi,
  statisticheLibere,
  statoLibero,
} from '../lib/wordleLibera'
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
    score: row.spectated === 1 ? row.assist_score : row.score,
    spectated: row.spectated === 1,
    roomId: row.assist_room_id,
    msToNextPuzzle: msToNextPuzzle(now),
  }
}

/**
 * Il tentativo arrivato dal client: una parola di cinque lettere del gioco,
 * che stia nel dizionario. Vale per la classificata e per la libera.
 */
function leggiTentativo(valore: unknown): string {
  const raw = typeof valore === 'string' ? valore.trim().toLowerCase() : ''
  if (!isWellFormedGuess(raw)) {
    fail(400, 'BAD_GUESS', `Serve una parola di ${WORD_LENGTH} lettere, senza accenti.`)
  }
  if (!GUESS_SET.has(raw)) {
    fail(400, 'NOT_A_WORD', `"${raw.toUpperCase()}" non è nel dizionario.`)
  }
  return raw
}

/**
 * La parola chiesta dal client. Una sola al giorno: un client di prima che
 * chiede la seconda, o un indirizzo vecchio, riceve un errore che lo dice
 * invece di una partita che non esiste piu'.
 */
function readSlot(value: string | undefined): void {
  if (value === undefined || value === '1') return
  fail(400, 'BAD_SLOT', 'C’è una parola sola al giorno.')
}

export const wordleRoutes = new Hono<AppEnv>()

  .use('*', requireVerified)

  /** La parola di oggi. La partita nasce al primo accesso: da qui parte il cronometro. */
  .get('/state', async (c) => {
    const when = today()
    readSlot(c.req.query('slot'))
    const answer = await dailyAnswer(c.env.DB, when)
    const row = await openGame(c.env.DB, c.get('player').id, when, answer)
    return c.json<WordleState>(toState(row))
  })

  .post('/guess', async (c) => {
    const body = (await c.req.json().catch(() => null)) as
      | { guess?: unknown; slot?: unknown }
      | null
    const raw = leggiTentativo(body?.guess)
    readSlot(body?.slot === undefined ? undefined : String(body.slot))

    const when = today()
    const answer = await dailyAnswer(c.env.DB, when)
    const row = await openGame(c.env.DB, c.get('player').id, when, answer)

    /*
     * La parola di oggi l'ha già giocata nella stanza di un altro: e' la stessa
     * parola per tutti, quindi non c'e' niente da giocare qui. Il punteggio
     * della giornata e' quello di quella partita.
     */
    if (row.spectated === 1) {
      fail(409, 'GIOCATA_INSIEME', 'La parola di oggi l’hai già giocata in compagnia.')
    }

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
        status === 'won' ? (await streakBefore(c.env.DB, c.get('player').id, row.puzzle_number)) + 1 : 0
      // Congelato anche il punteggio: una giornata passata non deve cambiare se
      // un domani si ritocca la scala.
      score = scoreFor({ status, attempts: nextWords.length, durationMs, streak })
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
      fail(409, 'CONFLICT', 'Un altro tentativo è arrivato prima.')
    }

    const room = await findRoom(c.env.DB, c.get('player').id, row.puzzle_number)
    if (room) {
      /*
       * Se qualcuno aveva suggerito questa parola, il suggerimento risulta
       * usato: serve a far vedere quali consigli sono stati seguiti.
       */
      await markSuggestionUsed(c.env.DB, room.id, raw)

      /*
       * A partita chiusa, chi ha giocato la giornata in questa stanza prende lo
       * stesso punteggio. E' quel che rende identico giocare da soli e giocare
       * in compagnia: sei persone su una parola indovinata al terzo tentativo
       * fanno ottanta punti a testa, come chi la indovina da solo.
       */
      if (status !== 'playing' && score !== null) {
        await payAssists(c.env.DB, room.id, row.puzzle_number, score, status)
      }
    }

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
  .get('/summary', async (c) => c.json<WordleSummary>(await riepilogoWordle(c.env.DB, c.get('player').id)))

  /** Statistiche personali: partite, vittorie, streak, distribuzione tentativi. */
  .get('/stats', async (c) => {
    const stats = await playerStats(c.env.DB, c.get('player').id, today().puzzleNumber)
    return c.json<PlayerStats>(stats)
  })

  /* ─────────────────────────  La partita libera  ───────────────────────── */

  /** La partita libera aperta, se c'e', e le statistiche delle libere. */
  .get('/libera', async (c) => {
    const io = c.get('player').id
    const [aperta, statistiche] = await Promise.all([
      liberaAperta(c.env.DB, io),
      statisticheLibere(c.env.DB, io),
    ])
    return c.json<WordleLiberaRisposta>({
      partita: aperta ? statoLibero(aperta) : null,
      statistiche,
    })
  })

  /** Una parola nuova. Quella aperta, se era gia' cominciata, conta come persa. */
  .post('/libera', async (c) => {
    const row = await nuovaLibera(c.env.DB, c.get('player').id, today().puzzleNumber)
    return c.json<WordleLiberaState>(statoLibero(row), 201)
  })

  .get('/libera/:id', async (c) => {
    const row = await liberaPerId(c.env.DB, c.req.param('id'), c.get('player').id)
    if (!row) fail(404, 'PARTITA_NON_TROVATA', 'Partita non trovata.')
    return c.json<WordleLiberaState>(statoLibero(row))
  })

  .post('/libera/:id/guess', async (c) => {
    const body = (await c.req.json().catch(() => null)) as { guess?: unknown } | null
    const raw = leggiTentativo(body?.guess)
    const row = await liberaPerId(c.env.DB, c.req.param('id'), c.get('player').id)
    if (!row) fail(404, 'PARTITA_NON_TROVATA', 'Partita non trovata.')
    if (row.status !== 'playing') fail(409, 'GAME_OVER', 'Questa partita è già chiusa.')

    const parole = paroleDi(row)
    if (parole.includes(raw)) fail(400, 'ALREADY_TRIED', `"${raw.toUpperCase()}" l'hai già provata.`)

    const dopo = [...parole, raw]
    const status = statusAfter(evaluateAll(dopo, row.answer), row.answer)
    const finita = status !== 'playing' ? new Date().toISOString() : null
    // Come nella classificata: condizionato ai tentativi letti, contro i doppi invii.
    const esito = await c.env.DB.prepare(
      `UPDATE wordle_libere SET guesses = ?, attempts = ?, status = ?, finished_at = ?
        WHERE id = ? AND attempts = ?`,
    )
      .bind(JSON.stringify(dopo), dopo.length, status, finita, row.id, parole.length)
      .run()
    if (esito.meta.changes !== 1) {
      fail(409, 'CONFLICT', 'Un altro tentativo è arrivato prima.')
    }
    return c.json<WordleLiberaState>(
      statoLibero({ ...row, guesses: JSON.stringify(dopo), attempts: dopo.length, status, finished_at: finita }),
    )
  })

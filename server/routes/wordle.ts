import { Hono } from 'hono'
import { MAX_ATTEMPTS, WORD_LENGTH, WORDS_PER_DAY } from '../../shared/config'
import { msToNextPuzzle } from '../../shared/daily'
import { scoreForWord } from '../../shared/scoring'
import type {
  DaySlot,
  PlayerStats,
  WordleState,
  WordleStatus,
  WordleSummary,
} from '../../shared/types'
import { evaluateAll, isWellFormedGuess, statusAfter } from '../../shared/wordle'
import { GUESS_SET } from '../../shared/words/guesses'
import type { AppEnv } from '../types'
import { fail } from '../lib/http'
import { requireVerified } from '../lib/session'
import { findRoom, markSuggestionUsed, payAssists } from '../lib/coopStore'
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
function toState(row: GameRow, day: DaySlot[], now = new Date()): WordleState {
  const words = parseGuesses(row)
  const guesses = evaluateAll(words, row.answer)

  return {
    puzzleNumber: row.puzzle_number,
    date: row.date,
    slot: row.slot,
    day,
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
 * Lo stato delle cinque parole della giornata.
 *
 * Viaggia insieme alla griglia, in una risposta sola: se il selettore lo
 * chiedesse a parte, le due cose potrebbero divergere per mezzo secondo — e si
 * vedrebbe, perché il selettore e' proprio quello che dice se una parola e' già
 * chiusa.
 */
async function dayOf(db: D1Database, playerId: string, puzzleNumber: number): Promise<DaySlot[]> {
  const { results } = await db
    .prepare(
      `SELECT slot, status, attempts, score, spectated, assist_score, assist_status
         FROM wordle_games
        WHERE player_id = ? AND puzzle_number = ?`,
    )
    .bind(playerId, puzzleNumber)
    .all<{
      slot: number
      status: WordleStatus
      attempts: number
      score: number | null
      spectated: number
      assist_score: number | null
      assist_status: WordleStatus | null
    }>()

  /*
   * `locked` si propaga in avanti: la prima parola e' sempre aperta, e ognuna
   * delle altre lo e' solo se quella prima e' chiusa. Una giornata giocata in
   * compagnia conta come chiusa quando l'host ha finito, non quando si accetta
   * l'invito — altrimenti si potrebbe aprire la seconda mentre la prima e'
   * ancora in corso da un'altra parte.
   */
  let precedenteChiusa = true
  return Array.from({ length: WORDS_PER_DAY }, (_, i) => {
    const slot = i + 1
    const row = results.find((r) => r.slot === slot)
    const locked = !precedenteChiusa

    if (!row) {
      precedenteChiusa = false
      return { slot, status: 'new' as const, attempts: 0, score: null, locked, shared: false }
    }

    const insieme = row.spectated === 1
    // In compagnia i tentativi sono dell'host, e l'esito e' il suo.
    const status = insieme ? (row.assist_status ?? 'playing') : row.status
    precedenteChiusa = status !== 'playing'

    return {
      slot,
      status,
      attempts: insieme ? 0 : row.attempts,
      score: insieme ? row.assist_score : row.score,
      locked,
      shared: insieme,
    }
  })
}

/**
 * Rifiuta la parola se quella prima non e' chiusa.
 *
 * Il controllo sta sul server e non solo nel selettore: nascondere una parola in
 * facciata lascerebbe la rotta aperta a chiunque passi `?slot=5`, e i punti
 * delle parole in piu' sarebbero regalati a chi conosce l'indirizzo.
 */
function requireUnlocked(day: DaySlot[], slot: number): void {
  const scelta = day.find((d) => d.slot === slot)
  if (scelta?.locked) {
    fail(
      409,
      'PAROLA_BLOCCATA',
      slot === 2
        ? 'Prima finisci la parola del giorno.'
        : `Prima finisci la ${slot - 1}ª parola.`,
    )
  }
}

/** La posizione chiesta dal client, dentro i limiti. */
function readSlot(value: string | undefined): number {
  if (value === undefined) return 1
  const n = Number(value)
  if (!Number.isInteger(n) || n < 1 || n > WORDS_PER_DAY) {
    fail(400, 'BAD_SLOT', `La parola deve essere fra 1 e ${WORDS_PER_DAY}.`)
  }
  return n
}

export const wordleRoutes = new Hono<AppEnv>()

  .use('*', requireVerified)

  /**
   * Stato di una delle parole di oggi. La crea al primo accesso.
   *
   * Senza `slot` si intende la parola del giorno, così i link vecchi e la
   * scorciatoia sul sottodominio del gioco continuano a funzionare.
   */
  .get('/state', async (c) => {
    const when = today()
    const slot = readSlot(c.req.query('slot'))

    /*
     * Il quadro si legge **prima** di aprire la partita: `openGame` creerebbe la
     * riga, e quella riga renderebbe la parola successiva sbloccata al prossimo
     * giro anche se questa non e' stata giocata.
     */
    const day = await dayOf(c.env.DB, c.get('player').id, when.puzzleNumber)
    requireUnlocked(day, slot)

    const answer = await dailyAnswer(c.env.DB, when, slot)
    const row = await openGame(c.env.DB, c.get('player').id, when, answer, slot)
    return c.json<WordleState>(
      toState(row, await dayOf(c.env.DB, c.get('player').id, when.puzzleNumber)),
    )
  })

  .post('/guess', async (c) => {
    const body = (await c.req.json().catch(() => null)) as
      | { guess?: unknown; slot?: unknown }
      | null
    const raw = typeof body?.guess === 'string' ? body.guess.trim().toLowerCase() : ''
    const slot = readSlot(body?.slot === undefined ? undefined : String(body.slot))

    if (!isWellFormedGuess(raw)) {
      fail(400, 'BAD_GUESS', `Serve una parola di ${WORD_LENGTH} lettere, senza accenti.`)
    }
    if (!GUESS_SET.has(raw)) {
      fail(400, 'NOT_A_WORD', `"${raw.toUpperCase()}" non è nel dizionario.`)
    }

    const when = today()
    requireUnlocked(await dayOf(c.env.DB, c.get('player').id, when.puzzleNumber), slot)

    const answer = await dailyAnswer(c.env.DB, when, slot)
    const row = await openGame(c.env.DB, c.get('player').id, when, answer, slot)

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
      /*
       * La streak vale per la parola del giorno. Sulle altre il bonus costanza
       * non si applica: sono un extra, e farle non deve poter cambiare la serie
       * né guadagnare due volte sullo stesso giorno di fila.
       */
      streak =
        status === 'won' && slot === 1
          ? (await streakBefore(c.env.DB, c.get('player').id, row.puzzle_number)) + 1
          : 0
      /*
       * Pesato per la posizione — e con i bonus solo sulla principale, vedi
       * `scoreForWord`. Congelato così: il punteggio di una giornata passata non
       * deve cambiare se un domani si ritocca un peso.
       */
      score = scoreForWord({ status, attempts: nextWords.length, durationMs, streak }, slot)
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
     * Il gioco in compagnia sta sulla parola del giorno: le altre quattro sono
     * un extra personale, e una stanza per ciascuna non servirebbe a nessuno.
     */
    const room = slot === 1
      ? await findRoom(c.env.DB, c.get('player').id, row.puzzle_number)
      : null
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
        await dayOf(c.env.DB, c.get('player').id, row.puzzle_number),
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
    const { results } = await c.env.DB.prepare(
      `SELECT slot, status, attempts, score, spectated,
              assist_score, assist_status, assist_room_id
         FROM wordle_games
        WHERE player_id = ? AND puzzle_number = ?`,
    )
      .bind(c.get('player').id, when.puzzleNumber)
      .all<{
        slot: number
        status: WordleStatus
        attempts: number
        score: number | null
        spectated: number
        assist_score: number | null
        assist_status: WordleStatus | null
        assist_room_id: string | null
      }>()

    const principale = results.find((r) => r.slot === 1)
    /*
     * Per chi gioca la giornata in compagnia la card racconta quella partita,
     * non la propria: la propria e' chiusa e mostrarla "da giocare" manderebbe
     * su una board che rifiuta i tentativi.
     */
    const insieme = principale?.spectated === 1

    const esito = (r: (typeof results)[number]) =>
      r.spectated === 1 ? (r.assist_status ?? 'playing') : r.status
    const punti = (r: (typeof results)[number]) =>
      r.spectated === 1 ? r.assist_score : r.score

    // Il punteggio della card e' quello di tutta la giornata: cinque parole.
    const totale = results.reduce((sum, r) => sum + (punti(r) ?? 0), 0)
    const chiuse = results.filter((r) => esito(r) !== 'playing').length

    return c.json<WordleSummary>({
      puzzleNumber: when.puzzleNumber,
      date: when.date,
      status: principale ? esito(principale) : 'new',
      attempts: insieme ? 0 : (principale?.attempts ?? 0),
      score: results.length === 0 ? null : totale,
      msToNextPuzzle: msToNextPuzzle(),
      roomId: insieme ? (principale?.assist_room_id ?? null) : null,
      done: chiuse,
      words: WORDS_PER_DAY,
    })
  })

  /** Statistiche personali: partite, vittorie, streak, distribuzione tentativi. */
  .get('/stats', async (c) => {
    const stats = await playerStats(c.env.DB, c.get('player').id, today().puzzleNumber)
    return c.json<PlayerStats>(stats)
  })

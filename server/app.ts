import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { AppEnv } from './types'
import { authRoutes } from './routes/auth'
import { wordleRoutes } from './routes/wordle'
import { scarabeoRoutes } from './routes/scarabeo'
import { cruciverbaRoutes } from './routes/cruciverba'
import { sudokuRoutes } from './routes/sudoku'
import { trisRoutes } from './routes/tris'
import { anagrammiRoutes } from './routes/anagrammi'
import { sequenzeRoutes } from './routes/sequenze'
import { nomiRoutes } from './routes/nomi'
import { battagliaRoutes, invitiPubblici } from './routes/battaglia'
import { quizRoutes } from './routes/quiz'
import { indovinaRoutes } from './routes/indovina'
import { tavoloRoutes } from './routes/tavolo'
import { presenzaRoutes } from './routes/presenza'
import { leaderboardRoutes } from './routes/leaderboard'
import { coopRoutes } from './routes/coop'
import { compagniaRoutes } from './routes/compagnia'
import { oggiRoutes } from './routes/oggi'
import { ruotaRoutes } from './routes/ruota'
import { slotRoutes } from './routes/slot'
import { fortunaRoutes } from './routes/fortuna'
import { blackjackRoutes } from './routes/blackjack'
import { amiciRoutes } from './routes/amici'
import { lupusRoutes } from './routes/lupus'
import { scarabocchiRoutes } from './routes/scarabocchi'
import { gameDate, msToNextPuzzle, puzzleNumberFor } from '../shared/daily'

/**
 * L'API dell'hub, servita dalle Cloudflare Pages Functions su /api/*.
 *
 * Tutte le rotte tornano JSON. Gli errori applicativi hanno un `code` stabile
 * (vedi server/lib/http.ts) su cui la UI può ragionare.
 */
export function createApp() {
  const app = new Hono<AppEnv>().basePath('/api')

  app.use('*', async (c, next) => {
    await next()
    // Nessuna risposta dell'API va messa in cache: contiene sessioni e punteggi.
    // L'eccezione la dichiara la rotta stessa: le geometrie e le città del quiz,
    // che a una versione data non cambiano mai, e il browser tiene per sempre.
    if (!c.res.headers.has('Cache-Control')) c.header('Cache-Control', 'no-store')
  })

  app.get('/health', (c) =>
    c.json({
      ok: true,
      date: gameDate(),
      puzzleNumber: puzzleNumberFor(gameDate()),
      msToNextPuzzle: msToNextPuzzle(),
    }),
  )

  app.route('/auth', authRoutes)
  app.route('/wordle', wordleRoutes)
  app.route('/scarabeo', scarabeoRoutes)
  app.route('/cruciverba', cruciverbaRoutes)
  app.route('/sudoku', sudokuRoutes)
  app.route('/tris', trisRoutes)
  app.route('/anagrammi', anagrammiRoutes)
  app.route('/sequenze', sequenzeRoutes)
  app.route('/nomi', nomiRoutes)
  app.route('/battaglia', battagliaRoutes)
  app.route('/quiz', quizRoutes)
  app.route('/indovina', indovinaRoutes)
  app.route('/tavolo', tavoloRoutes)
  // Senza sessione: chi apre un invito col link puo' non avere ancora un account.
  app.route('/inviti', invitiPubblici)
  app.route('/presenza', presenzaRoutes)
  app.route('/leaderboard', leaderboardRoutes)
  app.route('/coop', coopRoutes)
  app.route('/compagnia', compagniaRoutes)
  app.route('/oggi', oggiRoutes)
  app.route('/ruota', ruotaRoutes)
  app.route('/slot', slotRoutes)
  app.route('/fortuna', fortunaRoutes)
  app.route('/blackjack', blackjackRoutes)
  app.route('/amici', amiciRoutes)
  app.route('/lupus', lupusRoutes)
  app.route('/scarabocchi', scarabocchiRoutes)

  app.notFound((c) => c.json({ error: 'Endpoint non trovato.', code: 'NOT_FOUND' }, 404))

  app.onError((error, c) => {
    if (error instanceof HTTPException) {
      const response = error.getResponse()
      if (response) return response
    }
    // Il dettaglio resta nei log di Cloudflare; al client va un messaggio neutro.
    console.error('Errore non gestito:', error)
    return c.json({ error: 'Errore interno del server.', code: 'INTERNAL' }, 500)
  })

  return app
}

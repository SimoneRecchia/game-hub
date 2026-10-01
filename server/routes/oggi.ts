import { Hono } from 'hono'
import { msToNextPuzzle } from '../../shared/daily'
import { periodoDi } from '../../shared/periodi'
import type { OggiRisposta } from '../../shared/types'
import type { AppEnv } from '../types'
import { requireVerified } from '../lib/session'
import { classificaGenerale } from '../lib/generale'
import {
  riepilogoBattaglia,
  riepilogoCruciverba,
  riepilogoQuiz,
  riepilogoScarabeo,
  riepilogoSudoku,
  riepilogoWordle,
} from '../lib/riepiloghi'
import { riepilogoRuota } from '../lib/ruotaStore'
import { today } from '../lib/wordleStore'

/**
 * La schermata iniziale in una richiesta: le classificate di oggi, la ruota e
 * la posizione nella classifica generale del giorno.
 *
 * Una e non sei perché il piano gratuito delle Pages Functions conta le
 * richieste, e la schermata iniziale e' quella che si apre di piu'. Come i
 * riepiloghi che la compongono, non apre niente: e' di sola lettura.
 */
export const oggiRoutes = new Hono<AppEnv>().use('*', requireVerified).get('/', async (c) => {
  const db = c.env.DB
  const io = c.get('player').id
  const quando = today()
  const [wordle, scarabeo, cruciverba, sudoku, battaglia, quiz, generale] = await Promise.all([
    riepilogoWordle(db, io),
    riepilogoScarabeo(db, io),
    riepilogoCruciverba(db, io),
    riepilogoSudoku(db, io),
    riepilogoBattaglia(db, io),
    riepilogoQuiz(db, io),
    classificaGenerale(db, periodoDi('today', quando.puzzleNumber), io),
  ])
  // I punti che si possono puntare sulla ruota sono quelli delle classificate: la generale del giorno li ha gia'.
  const ruota = await riepilogoRuota(db, io, generale.me ? generale.me.punti - generale.me.ruota : 0)
  return c.json<OggiRisposta>({
    date: quando.date,
    puzzleNumber: quando.puzzleNumber,
    msToNextPuzzle: msToNextPuzzle(),
    wordle,
    scarabeo,
    cruciverba,
    sudoku,
    battaglia,
    quiz,
    ruota,
    generale: {
      posizione: generale.me?.rank ?? null,
      punti: generale.me?.punti ?? 0,
      giocatori: generale.rows.length,
    },
  })
})

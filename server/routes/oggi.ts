import { Hono } from 'hono'
import { msToNextPuzzle } from '../../shared/daily'
import type { OggiRisposta } from '../../shared/types'
import type { AppEnv } from '../types'
import { requireVerified } from '../lib/session'
import { classificaGenerale } from '../lib/generale'
import { riepilogoBattaglia, riepilogoCruciverba, riepilogoScarabeo, riepilogoWordle } from '../lib/riepiloghi'
import { today } from '../lib/wordleStore'

/**
 * La schermata iniziale in una richiesta: le quattro classificate di oggi e la
 * posizione nella classifica generale del giorno.
 *
 * Una e non cinque perché il piano gratuito delle Pages Functions conta le
 * richieste, e la schermata iniziale e' quella che si apre di piu'. Come i
 * riepiloghi che la compongono, non apre niente: e' di sola lettura.
 */
export const oggiRoutes = new Hono<AppEnv>().use('*', requireVerified).get('/', async (c) => {
  const db = c.env.DB
  const io = c.get('player').id
  const quando = today()
  const [wordle, scarabeo, cruciverba, battaglia, generale] = await Promise.all([
    riepilogoWordle(db, io),
    riepilogoScarabeo(db, io),
    riepilogoCruciverba(db, io),
    riepilogoBattaglia(db, io),
    classificaGenerale(db, 'today', quando.puzzleNumber, io),
  ])
  return c.json<OggiRisposta>({
    date: quando.date,
    puzzleNumber: quando.puzzleNumber,
    msToNextPuzzle: msToNextPuzzle(),
    wordle,
    scarabeo,
    cruciverba,
    battaglia,
    generale: {
      posizione: generale.me?.rank ?? null,
      punti: generale.me?.punti ?? 0,
      giocatori: generale.rows.length,
    },
  })
})

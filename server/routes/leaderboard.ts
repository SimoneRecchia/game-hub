import { Hono, type Context } from 'hono'
import { PERIODI, periodoDi } from '../../shared/periodi'
import type {
  BattagliaLeaderboard,
  GeneraleLeaderboard,
  CruciverbaLeaderboard,
  LeaderboardResponse,
  PanoramicaClassifiche,
  PeriodoClassifica,
  QuizLeaderboard,
  ScarabeoLeaderboard,
  SudokuLeaderboard,
} from '../../shared/types'
import type { AppEnv } from '../types'
import { fail } from '../lib/http'
import { requireVerified } from '../lib/session'
import { leaderboard } from '../lib/leaderboard'
import { classificaScarabeo } from '../lib/scarabeoStore'
import { classificaCruciverba } from '../lib/cruciverbaStore'
import { classificaSudoku } from '../lib/sudokuStore'
import { classificaBattaglia } from '../lib/battagliaStore'
import { classificaQuiz } from '../lib/quizStore'
import { classificaGenerale } from '../lib/generale'
import { panoramica } from '../lib/panoramica'
import { today } from '../lib/wordleStore'

/**
 * Il periodo chiesto: `scope` (today, week, month, all) e `indietro`, quanti
 * periodi prima di quello in corso. Un `indietro` oltre il primo giorno di
 * gioco si ferma li', e la risposta dice quale periodo e' (`periodo`).
 */
function leggiPeriodo(c: Context<AppEnv>): PeriodoClassifica {
  const scope = c.req.query('scope') ?? 'today'
  const trovato = PERIODI.find((s) => s === scope)
  if (!trovato) fail(400, 'BAD_SCOPE', `Periodo non valido. Ammessi: ${PERIODI.join(', ')}.`)
  const indietro = c.req.query('indietro') ?? '0'
  if (!/^\d{1,5}$/.test(indietro)) fail(400, 'BAD_PERIOD', 'Periodo non valido.')
  return periodoDi(trovato, today().puzzleNumber, Number(indietro))
}

export const leaderboardRoutes = new Hono<AppEnv>()
  .use('*', requireVerified)
  .get('/', async (c) => {
    const result = await leaderboard(c.env.DB, leggiPeriodo(c), today().puzzleNumber, c.get('player').id)
    return c.json<LeaderboardResponse>(result)
  })

  /** Tutte le classifiche del periodo, i primi tre di ognuna: la schermata che le mette insieme. */
  .get('/panoramica', async (c) => {
    const result = await panoramica(c.env.DB, leggiPeriodo(c), today().puzzleNumber, c.get('player').id)
    return c.json<PanoramicaClassifiche>(result)
  })

  /**
   * La classifica generale: la somma delle classificate di tutti i giochi.
   * Ha senso perché ognuna vale al massimo cento punti (shared/punti.ts).
   */
  .get('/generale', async (c) => {
    const result = await classificaGenerale(c.env.DB, leggiPeriodo(c), c.get('player').id)
    return c.json<GeneraleLeaderboard>(result)
  })

  /** La classifica dello Scarabeo: punti in rapporto al computer, poi il tabellone. */
  .get('/scarabeo', async (c) => {
    const result = await classificaScarabeo(c.env.DB, leggiPeriodo(c), today().puzzleNumber, c.get('player').id)
    return c.json<ScarabeoLeaderboard>(result)
  })

  /** La classifica del cruciverba: punti dei completati, poi il tempo. */
  .get('/cruciverba', async (c) => {
    const result = await classificaCruciverba(c.env.DB, leggiPeriodo(c), today().puzzleNumber, c.get('player').id)
    return c.json<CruciverbaLeaderboard>(result)
  })

  /** Il sudoku: punti dei completati, poi il tempo. */
  .get('/sudoku', async (c) => {
    const result = await classificaSudoku(c.env.DB, leggiPeriodo(c), today().puzzleNumber, c.get('player').id)
    return c.json<SudokuLeaderboard>(result)
  })

  /** La battaglia navale: le classificate contro il computer, a punti. */
  .get('/battaglia', async (c) => {
    const result = await classificaBattaglia(c.env.DB, leggiPeriodo(c), today().puzzleNumber, c.get('player').id)
    return c.json<BattagliaLeaderboard>(result)
  })

  /** Il quiz: le risposte giuste, poi il tempo. */
  .get('/quiz', async (c) => {
    const result = await classificaQuiz(c.env.DB, leggiPeriodo(c), today().puzzleNumber, c.get('player').id)
    return c.json<QuizLeaderboard>(result)
  })

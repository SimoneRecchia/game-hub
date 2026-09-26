import { Hono } from 'hono'
import type {
  BattagliaLeaderboard,
  CruciverbaLeaderboard,
  LeaderboardResponse,
  LeaderboardScope,
  ScarabeoLeaderboard,
} from '../../shared/types'
import type { AppEnv } from '../types'
import { fail } from '../lib/http'
import { requireVerified } from '../lib/session'
import { leaderboard } from '../lib/leaderboard'
import { classificaScarabeo } from '../lib/scarabeoStore'
import { classificaCruciverba } from '../lib/cruciverbaStore'
import { classificaBattaglia } from '../lib/battagliaStore'
import { msToNextPuzzle } from '../../shared/daily'
import { today } from '../lib/wordleStore'

const SCOPES: LeaderboardScope[] = ['today', 'week', 'month', 'all']

function readScope(value: string | undefined): LeaderboardScope {
  if (value === undefined) return 'today'
  const found = SCOPES.find((s) => s === value)
  if (!found) fail(400, 'BAD_SCOPE', `Periodo non valido. Ammessi: ${SCOPES.join(', ')}.`)
  return found
}

export const leaderboardRoutes = new Hono<AppEnv>()
  .use('*', requireVerified)
  .get('/', async (c) => {
    const scope = readScope(c.req.query('scope'))
    const result = await leaderboard(
      c.env.DB,
      scope,
      today().puzzleNumber,
      c.get('player').id,
    )
    return c.json<LeaderboardResponse>(result)
  })

  /**
   * La classifica dello Scarabeo, separata da quella del Wordle.
   *
   * Non e' pigrizia: i due punteggi non sono commensurabili. Una giornata di
   * Wordle vale al massimo 209 punti per costruzione, una di Scarabeo qualche
   * centinaio, e sommarli richiederebbe un tasso di cambio inventato; mentre
   * normalizzare per giornata ("il migliore prende cento") cambierebbe le
   * classifiche di ieri ogni volta che qualcuno gioca. Due classifiche dicono
   * la verita' e non chiedono di crederci.
   */
  .get('/scarabeo', async (c) => {
    const scope = readScope(c.req.query('scope'))
    const result = await classificaScarabeo(
      c.env.DB,
      scope,
      today().puzzleNumber,
      c.get('player').id,
    )
    return c.json<ScarabeoLeaderboard>(result)
  })

  /** La classifica del cruciverba: punti dei completati, poi il tempo. */
  .get('/cruciverba', async (c) => {
    const scope = readScope(c.req.query('scope'))
    const result = await classificaCruciverba(
      c.env.DB,
      scope,
      today().puzzleNumber,
      c.get('player').id,
    )
    return c.json<CruciverbaLeaderboard>(result)
  })

  /** La battaglia navale: vittorie, poi meno sconfitte. */
  .get('/battaglia', async (c) => {
    const scope = readScope(c.req.query('scope'))
    const result = await classificaBattaglia(
      c.env.DB,
      scope,
      msToNextPuzzle(),
      c.get('player').id,
      Date.now(),
    )
    return c.json<BattagliaLeaderboard>(result)
  })

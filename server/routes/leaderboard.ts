import { Hono } from 'hono'
import type {
  BattagliaLeaderboard,
  GeneraleLeaderboard,
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
import { classificaGenerale } from '../lib/generale'
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
   * La classifica generale: la somma delle classificate di tutti i giochi.
   * Ha senso perché ognuna vale al massimo cento punti (shared/punti.ts).
   */
  .get('/generale', async (c) => {
    const scope = readScope(c.req.query('scope'))
    const result = await classificaGenerale(c.env.DB, scope, today().puzzleNumber, c.get('player').id)
    return c.json<GeneraleLeaderboard>(result)
  })

  /** La classifica dello Scarabeo: punti in rapporto al computer, poi il tabellone. */
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

  /** La battaglia navale: le classificate contro il computer, a punti. */
  .get('/battaglia', async (c) => {
    const scope = readScope(c.req.query('scope'))
    const result = await classificaBattaglia(c.env.DB, scope, today().puzzleNumber, c.get('player').id)
    return c.json<BattagliaLeaderboard>(result)
  })

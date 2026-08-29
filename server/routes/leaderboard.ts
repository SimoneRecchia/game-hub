import { Hono } from 'hono'
import type { LeaderboardResponse, LeaderboardScope } from '../../shared/types'
import type { AppEnv } from '../types'
import { fail } from '../lib/http'
import { requireVerified } from '../lib/session'
import { leaderboard } from '../lib/leaderboard'
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

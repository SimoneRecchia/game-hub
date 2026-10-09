import { Hono } from 'hono'
import type { VistaEnalotto } from '../../shared/types'
import type { AppEnv } from '../types'
import { requireVerified } from '../lib/session'
import { giocaSchede, statoEnalotto } from '../lib/enalottoStore'

/**
 * Il SuperEnalotto. La lettura fa anche quel che l'ora richiede — l'estrazione
 * alle 21, i premi finita la diretta — e la giocata risponde con lo stato intero.
 */
export const superenalottoRoutes = new Hono<AppEnv>()
  .use('*', requireVerified)

  .get('/', async (c) => c.json<VistaEnalotto>(await statoEnalotto(c.env.DB, c.get('player').id)))

  /** Una o piu' schede per il concorso aperto, ognuna con i suoi quattro numeri. */
  .post('/schede', async (c) => {
    const corpo = (await c.req.json().catch(() => ({}))) as { schede?: unknown }
    const io = c.get('player').id
    await giocaSchede(c.env.DB, io, corpo.schede)
    return c.json<VistaEnalotto>(await statoEnalotto(c.env.DB, io))
  })

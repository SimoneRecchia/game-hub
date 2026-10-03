import { Hono } from 'hono'
import type { AmiciRisposta, ProfiloAmico } from '../../shared/types'
import type { AppEnv } from '../types'
import { amiciOnline, profiloAmico } from '../lib/amici'
import { fail } from '../lib/http'
import { requireVerified } from '../lib/session'

/**
 * Gli amici online, per il profilo e le Libere, e il profilo di uno, da cui
 * lo si invita a giocare. Non stanno nel giro della presenza, che parte ogni
 * otto secondi da ogni schermata: la lista serve solo dove la si guarda.
 */
export const amiciRoutes = new Hono<AppEnv>()
  .use('*', requireVerified)
  .get('/', async (c) => {
    const online = await amiciOnline(c.env.DB, c.get('player').id, Date.now())
    return c.json<AmiciRisposta>({ online })
  })
  .get('/:nickname', async (c) => {
    const profilo = await profiloAmico(c.env.DB, c.req.param('nickname'), Date.now())
    if (!profilo) fail(404, 'GIOCATORE_NON_TROVATO', 'Questo giocatore non esiste.')
    return c.json<ProfiloAmico>(profilo)
  })

import { Hono } from 'hono'
import type { SalaRoulette, VistaTavoloRL } from '../../shared/types'
import type { AppEnv } from '../types'
import {
  apriTavoloRL,
  lasciaTavoloRL,
  puntaAlTavoloRL,
  salaRoulette,
  siediAlTavoloRL,
  vistaTavoloRL,
} from '../lib/rouletteStore'
import { requireVerified } from '../lib/session'

/**
 * La roulette: la sala e i tavoli, come quelli del blackjack. Ogni rotta che
 * cambia un tavolo risponde con il tavolo intero, e la lettura lo fa andare
 * avanti — le puntate che si chiudono con il lancio, il giro che finisce — per
 * tutti quelli che ci sono seduti.
 */
export const rouletteRoutes = new Hono<AppEnv>()
  .use('*', requireVerified)

  .get('/', async (c) => c.json<SalaRoulette>(await salaRoulette(c.env.DB, c.get('player').id)))

  /** Un tavolo nuovo, con chi lo apre seduto: da soli, finché non si siede qualcun altro. */
  .post('/tavoli', async (c) => {
    const io = c.get('player').id
    const id = await apriTavoloRL(c.env.DB, io)
    return c.json<VistaTavoloRL>(await vistaTavoloRL(c.env.DB, id, io))
  })

  .get('/tavolo/:id', async (c) =>
    c.json<VistaTavoloRL>(await vistaTavoloRL(c.env.DB, c.req.param('id'), c.get('player').id)),
  )

  .post('/tavolo/:id/siedi', async (c) => {
    const io = c.get('player').id
    const id = c.req.param('id')
    return c.json<VistaTavoloRL>(await vistaTavoloRL(c.env.DB, id, io, await siediAlTavoloRL(c.env.DB, io, id)))
  })

  /** Alzarsi: le puntate di un giro non ancora lanciato tornano. */
  .post('/tavolo/:id/lascia', async (c) => {
    await lasciaTavoloRL(c.env.DB, c.get('player').id, c.req.param('id'))
    return c.json({ ok: true })
  })

  /**
   * Le puntate del giro, tutte insieme, per il giro che il telefono vuole
   * giocare: prendono il posto di quelle mandate prima, e vuote le ritirano.
   */
  .post('/tavolo/:id/punta', async (c) => {
    const corpo = (await c.req.json().catch(() => ({}))) as { giro?: unknown; puntate?: unknown }
    const io = c.get('player').id
    const id = c.req.param('id')
    const letto = await puntaAlTavoloRL(c.env.DB, io, id, corpo.giro, corpo.puntate)
    return c.json<VistaTavoloRL>(await vistaTavoloRL(c.env.DB, id, io, letto))
  })

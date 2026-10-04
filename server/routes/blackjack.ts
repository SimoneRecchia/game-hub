import { Hono } from 'hono'
import type { SalaBlackjack, VistaTavoloBJ } from '../../shared/types'
import type { AppEnv } from '../types'
import {
  apriTavolo,
  lasciaTavolo,
  muoviAlTavolo,
  puntaAlTavolo,
  salaBlackjack,
  siediAlTavolo,
  vistaTavolo,
} from '../lib/blackjackStore'
import { requireVerified } from '../lib/session'

/**
 * Il blackjack: la sala e i tavoli. Ogni rotta che cambia un tavolo risponde
 * con il tavolo intero, come la lettura: il telefono ha sempre una cosa sola
 * da mostrare. La lettura fa andare avanti il tavolo — le puntate che si
 * chiudono, i turni scaduti — per tutti quelli che ci sono seduti.
 */
export const blackjackRoutes = new Hono<AppEnv>()
  .use('*', requireVerified)

  /** La sala: il saldo, il tavolo a cui si e' seduti e quelli degli amici online. Non scrive niente. */
  .get('/', async (c) => c.json<SalaBlackjack>(await salaBlackjack(c.env.DB, c.get('player').id)))

  /** Un tavolo nuovo, con chi lo apre seduto: da soli, finché non si siede qualcun altro. */
  .post('/tavoli', async (c) => {
    const io = c.get('player').id
    const id = await apriTavolo(c.env.DB, io)
    return c.json<VistaTavoloBJ>(await vistaTavolo(c.env.DB, id, io))
  })

  .get('/tavolo/:id', async (c) =>
    c.json<VistaTavoloBJ>(await vistaTavolo(c.env.DB, c.req.param('id'), c.get('player').id)),
  )

  /** Sedersi: al primo posto libero dal centro, lasciando il tavolo a cui si era seduti. */
  .post('/tavolo/:id/siedi', async (c) => {
    const io = c.get('player').id
    const id = c.req.param('id')
    return c.json<VistaTavoloBJ>(await vistaTavolo(c.env.DB, id, io, await siediAlTavolo(c.env.DB, io, id)))
  })

  /** Alzarsi: la puntata non ancora giocata torna, le mani in corso stanno e si pagano alla fine. */
  .post('/tavolo/:id/lascia', async (c) => {
    await lasciaTavolo(c.env.DB, c.get('player').id, c.req.param('id'))
    return c.json({ ok: true })
  })

  /** La puntata del giro che il telefono ha visto. */
  .post('/tavolo/:id/punta', async (c) => {
    const corpo = (await c.req.json().catch(() => ({}))) as { giro?: unknown; puntata?: unknown }
    const io = c.get('player').id
    const id = c.req.param('id')
    const letto = await puntaAlTavolo(c.env.DB, io, id, corpo.giro, corpo.puntata)
    return c.json<VistaTavoloBJ>(await vistaTavolo(c.env.DB, id, io, letto))
  })

  /**
   * Una mossa sulla mano di turno, assicurazione compresa: il giro, la mano e
   * quante carte ha, perché un doppio tocco non conti due volte.
   */
  .post('/tavolo/:id/mossa', async (c) => {
    const corpo = (await c.req.json().catch(() => ({}))) as {
      giro?: unknown
      mano?: unknown
      carte?: unknown
      azione?: unknown
    }
    const io = c.get('player').id
    const id = c.req.param('id')
    const letto = await muoviAlTavolo(c.env.DB, io, id, corpo)
    return c.json<VistaTavoloBJ>(await vistaTavolo(c.env.DB, id, io, letto))
  })

import { Hono } from 'hono'
import { sceltaValida } from '../../shared/quiz'
import type { SlotStato } from '../../shared/types'
import type { AppEnv } from '../types'
import { fail } from '../lib/http'
import { requireVerified } from '../lib/session'
import { apriDomandaSlot, giraSlot, rispondiSlot, statoSlot } from '../lib/slotStore'

/** Una scelta e' l'id di un'opzione (`sceltaValida`). Null e' il tempo finito. */
function leggiScelta(valore: unknown): string | null {
  if (valore === null || valore === undefined) return null
  if (!sceltaValida(valore)) fail(400, 'SCELTA', 'La risposta non è valida.')
  return valore
}

/**
 * La slot. Ogni rotta che scrive risponde con lo stato intero, come la lettura:
 * il telefono ha sempre una cosa sola da mostrare.
 */
export const slotRoutes = new Hono<AppEnv>()
  .use('*', requireVerified)

  /** La slot di oggi: il saldo, il conto della slot e l'ultimo giro. Non gira niente. */
  .get('/', async (c) => c.json<SlotStato>(await statoSlot(c.env.DB, c.get('player').id)))

  /** Un giro, con la puntata: le fermate dei rulli le sceglie il server. */
  .post('/gira', async (c) => {
    const corpo = (await c.req.json().catch(() => ({}))) as { puntata?: unknown }
    const io = c.get('player').id
    await giraSlot(c.env.DB, io, corpo.puntata)
    return c.json<SlotStato>(await statoSlot(c.env.DB, io))
  })

  /** La domanda della tripla: si apre adesso, e il tempo parte da qui. */
  .post('/domanda', async (c) => {
    const io = c.get('player').id
    await apriDomandaSlot(c.env.DB, io)
    return c.json<SlotStato>(await statoSlot(c.env.DB, io))
  })

  /** La risposta alla domanda aperta, o null se il tempo e' finito. */
  .post('/risposta', async (c) => {
    const corpo = (await c.req.json().catch(() => ({}))) as { scelta?: unknown }
    const scelta = leggiScelta(corpo.scelta)
    const io = c.get('player').id
    await rispondiSlot(c.env.DB, io, scelta)
    return c.json<SlotStato>(await statoSlot(c.env.DB, io))
  })

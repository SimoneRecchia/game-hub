import { Hono } from 'hono'
import { sceltaValida } from '../../shared/quiz'
import type { RuotaStato } from '../../shared/types'
import type { AppEnv } from '../types'
import { fail } from '../lib/http'
import { apriDomanda, gira, giraMoltiplicatore, lanciaMoneta, rispondi, statoRuota } from '../lib/ruotaStore'
import { requireVerified } from '../lib/session'

/** Una scelta e' l'id di un'opzione (`sceltaValida`). Null e' il tempo finito. */
function leggiScelta(valore: unknown): string | null {
  if (valore === null || valore === undefined) return null
  if (!sceltaValida(valore)) fail(400, 'SCELTA', 'La risposta non è valida.')
  return valore
}

/**
 * Crazy Time. Ogni rotta che scrive risponde con lo stato intero, come la
 * lettura: il telefono ha sempre una cosa sola da mostrare.
 */
export const ruotaRoutes = new Hono<AppEnv>()
  .use('*', requireVerified)

  /** Crazy Time di oggi: il saldo, il conto della giornata e l'ultimo giro. Non gira niente. */
  .get('/', async (c) => c.json<RuotaStato>(await statoRuota(c.env.DB, c.get('player').id)))

  /** Un giro, con la puntata: lo spicchio lo sceglie il server. */
  .post('/gira', async (c) => {
    const corpo = (await c.req.json().catch(() => ({}))) as { puntata?: unknown }
    const io = c.get('player').id
    await gira(c.env.DB, io, corpo.puntata)
    return c.json<RuotaStato>(await statoRuota(c.env.DB, io))
  })

  /** La ruota dei moltiplicatori della domanda: il moltiplicatore lo sceglie il server. */
  .post('/moltiplicatore', async (c) => {
    const io = c.get('player').id
    await giraMoltiplicatore(c.env.DB, io)
    return c.json<RuotaStato>(await statoRuota(c.env.DB, io))
  })

  /** La moneta: si lancia adesso, e il lato lo sceglie il server. */
  .post('/moneta', async (c) => {
    const io = c.get('player').id
    await lanciaMoneta(c.env.DB, io)
    return c.json<RuotaStato>(await statoRuota(c.env.DB, io))
  })

  /** La domanda: si apre adesso, e il tempo parte da qui. */
  .post('/domanda', async (c) => {
    const io = c.get('player').id
    await apriDomanda(c.env.DB, io)
    return c.json<RuotaStato>(await statoRuota(c.env.DB, io))
  })

  /** La risposta alla domanda aperta, o null se il tempo e' finito. */
  .post('/risposta', async (c) => {
    const corpo = (await c.req.json().catch(() => ({}))) as { scelta?: unknown }
    const scelta = leggiScelta(corpo.scelta)
    const io = c.get('player').id
    await rispondi(c.env.DB, io, scelta)
    return c.json<RuotaStato>(await statoRuota(c.env.DB, io))
  })

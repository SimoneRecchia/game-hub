import { Hono } from 'hono'
import type { LatoMoneta } from '../../shared/ruota'
import type { RuotaStato } from '../../shared/types'
import type { AppEnv } from '../types'
import { fail } from '../lib/http'
import { apriDomanda, gira, lanciaMoneta, rispondi, statoRuota } from '../lib/ruotaStore'
import { requireVerified } from '../lib/session'

/** Una scelta e' l'id di un'opzione: corto, e di caratteri semplici. Null e' il tempo finito. */
function leggiScelta(valore: unknown): string | null {
  if (valore === null || valore === undefined) return null
  if (typeof valore !== 'string' || !/^[A-Za-z0-9:_-]{1,40}$/.test(valore)) {
    fail(400, 'SCELTA', 'La risposta non è valida.')
  }
  return valore
}

/**
 * La ruota del giorno. Ogni rotta che scrive risponde con lo stato intero,
 * come la lettura: il telefono ha sempre una cosa sola da mostrare.
 */
export const ruotaRoutes = new Hono<AppEnv>()
  .use('*', requireVerified)

  /** La ruota di oggi: i punti che si possono puntare e il giro, se c'e'. Non gira niente. */
  .get('/', async (c) => c.json<RuotaStato>(await statoRuota(c.env.DB, c.get('player').id)))

  /** Il giro di oggi, con la puntata: lo spicchio lo sceglie il server. */
  .post('/gira', async (c) => {
    const corpo = (await c.req.json().catch(() => ({}))) as { puntata?: unknown }
    const io = c.get('player').id
    await gira(c.env.DB, io, corpo.puntata)
    return c.json<RuotaStato>(await statoRuota(c.env.DB, io))
  })

  /** Testa o croce: si sceglie il lato, e la moneta si lancia adesso. */
  .post('/moneta', async (c) => {
    const corpo = (await c.req.json().catch(() => ({}))) as { lato?: unknown }
    if (corpo.lato !== 'testa' && corpo.lato !== 'croce') fail(400, 'LATO', 'Scegli testa o croce.')
    const io = c.get('player').id
    await lanciaMoneta(c.env.DB, io, corpo.lato as LatoMoneta)
    return c.json<RuotaStato>(await statoRuota(c.env.DB, io))
  })

  /** La domanda della sfida: si apre adesso, e il tempo parte da qui. */
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

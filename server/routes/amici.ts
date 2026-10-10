import { Hono } from 'hono'
import type { AmiciRisposta, ProfiloAmico, PuntiGiocatore } from '../../shared/types'
import type { AppEnv } from '../types'
import { amiciOnline, idDi, profiloAmico, puntiDi, tuttiGliAltri } from '../lib/amici'
import { fail } from '../lib/http'
import { requireVerified } from '../lib/session'
import { today } from '../lib/wordleStore'

/**
 * Gli amici online, per il profilo e le Libere, e il profilo di uno, da cui
 * lo si invita a giocare. Non stanno nel giro della presenza, che parte ogni
 * otto secondi da ogni schermata: la lista serve solo dove la si guarda.
 * `?tutti=1` aggiunge tutti gli altri, per cercarne uno; i punti di un
 * giocatore stanno a parte (`/:nickname/punti`), perché il profilo rilegge
 * spesso se e' online e i punti non cambiano mentre lo si guarda.
 */
export const amiciRoutes = new Hono<AppEnv>()
  .use('*', requireVerified)
  .get('/', async (c) => {
    const io = c.get('player').id
    const adesso = Date.now()
    if (c.req.query('tutti') === '1') {
      const tutti = await tuttiGliAltri(c.env.DB, io, adesso)
      return c.json<AmiciRisposta>({
        online: tutti.filter((p) => p.online).map((p) => ({ ...p, attivita: p.attivita ?? 'altro' })),
        tutti,
      })
    }
    const online = await amiciOnline(c.env.DB, io, adesso)
    return c.json<AmiciRisposta>({ online })
  })
  .get('/:nickname/punti', async (c) => {
    const id = await idDi(c.env.DB, c.req.param('nickname'))
    if (!id) fail(404, 'GIOCATORE_NON_TROVATO', 'Questo giocatore non esiste.')
    return c.json<PuntiGiocatore>(await puntiDi(c.env.DB, id, today().puzzleNumber))
  })
  .get('/:nickname', async (c) => {
    const profilo = await profiloAmico(c.env.DB, c.req.param('nickname'), Date.now())
    if (!profilo) fail(404, 'GIOCATORE_NON_TROVATO', 'Questo giocatore non esiste.')
    return c.json<ProfiloAmico>(profilo)
  })

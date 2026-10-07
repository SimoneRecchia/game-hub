import { Hono } from 'hono'
import { codiceLupusValido, type VistaStanzaLupus } from '../../shared/lupus-stanza'
import type { AppEnv } from '../types'
import {
  azioneLupus,
  cambiaImpostazioni,
  creaStanza,
  entraNellaStanza,
  esciDallaStanza,
  espelli,
  infoStanza,
  iniziaPartita,
  invitaNellaStanza,
  rifiutaInvito,
  unAltraPartita,
  vistaStanza,
} from '../lib/lupusStore'
import { fail } from '../lib/http'
import { requireVerified } from '../lib/session'

/** Il codice dell'indirizzo, se e' un codice: quattro lettere. */
function codiceDi(c: { req: { param: (k: string) => string } }): string {
  const codice = c.req.param('codice')
  if (!codiceLupusValido(codice)) fail(404, 'STANZA_ASSENTE', 'Questa stanza non c’è.')
  return codice
}

const corpoDi = async (c: { req: { json: () => Promise<unknown> } }) =>
  ((await c.req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>

/**
 * Lupus in fabula online: le stanze. Ogni rotta che cambia una stanza risponde
 * con la stanza come la vede chi ha chiesto, come la lettura: il telefono ha
 * sempre una cosa sola da mostrare. La lettura fa andare avanti la partita
 * quando il tempo della discussione o delle arringhe e' finito.
 */
export const lupusRoutes = new Hono<AppEnv>()
  .use('*', requireVerified)

  /** Una stanza nuova, con chi la apre a condurre. */
  .post('/stanze', async (c) =>
    c.json<VistaStanzaLupus>(await creaStanza(c.env.DB, c.get('player').id, Date.now()), 201),
  )

  /** Chi conduce e quanti sono, prima di entrare: per l'invito con il codice. */
  .get('/stanze/:codice/info', async (c) => c.json(await infoStanza(c.env.DB, codiceDi(c))))

  .get('/stanze/:codice', async (c) =>
    c.json<VistaStanzaLupus>(await vistaStanza(c.env.DB, c.get('player').id, codiceDi(c), Date.now())),
  )

  /** Entrare, prima della partita; chi c'e' gia' rientra. */
  .post('/stanze/:codice/entra', async (c) =>
    c.json<VistaStanzaLupus>(await entraNellaStanza(c.env.DB, c.get('player').id, codiceDi(c), Date.now())),
  )

  /** Uscire. Da una partita in corso il posto resta vuoto, e la partita va avanti. */
  .post('/stanze/:codice/esci', async (c) => {
    await esciDallaStanza(c.env.DB, c.get('player').id, codiceDi(c), Date.now())
    return c.json({ ok: true })
  })

  /** Il mazzo e le regole: chi conduce, prima della partita. */
  .post('/stanze/:codice/impostazioni', async (c) => {
    const corpo = await corpoDi(c)
    return c.json<VistaStanzaLupus>(
      await cambiaImpostazioni(c.env.DB, c.get('player').id, codiceDi(c), corpo.impostazioni, Date.now()),
    )
  })

  .post('/stanze/:codice/espelli', async (c) => {
    const corpo = await corpoDi(c)
    const v = await espelli(c.env.DB, c.get('player').id, codiceDi(c), corpo.playerId, Date.now())
    return c.json<VistaStanzaLupus>(v)
  })

  .post('/stanze/:codice/via', async (c) =>
    c.json<VistaStanzaLupus>(await iniziaPartita(c.env.DB, c.get('player').id, codiceDi(c), Date.now())),
  )

  /** Un'azione della partita: vedere il ruolo, la scelta della notte, un voto, il benvenuto, avanti. */
  .post('/stanze/:codice/azione', async (c) => {
    const corpo = await corpoDi(c)
    return c.json<VistaStanzaLupus>(await azioneLupus(c.env.DB, c.get('player').id, codiceDi(c), corpo, Date.now()))
  })

  /** Un'altra partita con chi c'e', a partita finita. */
  .post('/stanze/:codice/ancora', async (c) =>
    c.json<VistaStanzaLupus>(await unAltraPartita(c.env.DB, c.get('player').id, codiceDi(c), Date.now())),
  )

  /** Invitare un amico: gli arriva con la presenza. */
  .post('/stanze/:codice/invita', async (c) => {
    const corpo = await corpoDi(c)
    await invitaNellaStanza(c.env.DB, c.get('player').id, codiceDi(c), corpo.playerId, Date.now())
    return c.json({ ok: true })
  })

  .post('/inviti/:id/rifiuta', async (c) => {
    await rifiutaInvito(c.env.DB, c.get('player').id, c.req.param('id'))
    return c.json({ ok: true })
  })

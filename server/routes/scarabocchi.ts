import { Hono } from 'hono'
import { codiceScarabocchiValido, type VistaStanzaScarabocchi } from '../../shared/scarabocchi'
import type { AppEnv } from '../types'
import {
  aggiungiTratti,
  album,
  cambiaImpostazioni,
  creaStanza,
  entraNellaStanza,
  esciDallaStanza,
  espelli,
  foglioIntero,
  infoStanza,
  iniziaPartita,
  invitaNellaStanza,
  rifiutaInvito,
  scegli,
  scriviFoglio,
  tentativo,
  unAltraPartita,
  vistaStanza,
  type RichiestaVista,
} from '../lib/scarabocchiStore'
import { fail } from '../lib/http'
import { requireVerified } from '../lib/session'

/** Il codice dell'indirizzo, se e' un codice: cinque lettere. */
function codiceDi(c: { req: { param: (k: string) => string } }): string {
  const codice = c.req.param('codice')
  if (!codiceScarabocchiValido(codice)) fail(404, 'STANZA_ASSENTE', 'Questa stanza non c’è.')
  return codice
}

const corpoDi = async (c: { req: { json: () => Promise<unknown> } }) =>
  ((await c.req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>

const intero = (x: string | undefined) => (x !== undefined && /^\d{1,9}$/.test(x) ? Number(x) : undefined)

/** Quel che il telefono chiede con la stanza: da quale pezzo del foglio che guarda, e dopo quale risposta. */
function richiestaDi(c: { req: { query: (k: string) => string | undefined } }): RichiestaVista {
  const foglio = c.req.query('foglio')
  return {
    foglio: foglio && /^(?:t\d{1,3}|c\d{1,2}p\d{1,2})$/.test(foglio) ? foglio : undefined,
    da: intero(c.req.query('da')),
    dopo: intero(c.req.query('dopo')),
  }
}

/**
 * Scarabocchi: le stanze. Ogni rotta che cambia una stanza risponde con la
 * stanza come la vede chi ha chiesto, come la lettura. La lettura porta la
 * partita ad adesso, e insieme da' i tratti nuovi del disegno che si guarda e
 * le risposte nuove: una richiesta sola a ogni giro.
 */
export const scarabocchiRoutes = new Hono<AppEnv>()
  .use('*', requireVerified)

  .post('/stanze', async (c) =>
    c.json<VistaStanzaScarabocchi>(await creaStanza(c.env.DB, c.get('player').id, Date.now()), 201),
  )

  .get('/stanze/:codice/info', async (c) => c.json(await infoStanza(c.env.DB, codiceDi(c))))

  .get('/stanze/:codice', async (c) =>
    c.json<VistaStanzaScarabocchi>(
      await vistaStanza(c.env.DB, c.get('player').id, codiceDi(c), Date.now(), richiestaDi(c)),
    ),
  )

  .post('/stanze/:codice/entra', async (c) =>
    c.json<VistaStanzaScarabocchi>(await entraNellaStanza(c.env.DB, c.get('player').id, codiceDi(c), Date.now())),
  )

  .post('/stanze/:codice/esci', async (c) => {
    await esciDallaStanza(c.env.DB, c.get('player').id, codiceDi(c), Date.now())
    return c.json({ ok: true })
  })

  .post('/stanze/:codice/impostazioni', async (c) => {
    const corpo = await corpoDi(c)
    return c.json<VistaStanzaScarabocchi>(
      await cambiaImpostazioni(c.env.DB, c.get('player').id, codiceDi(c), corpo.impostazioni, Date.now()),
    )
  })

  .post('/stanze/:codice/espelli', async (c) => {
    const corpo = await corpoDi(c)
    return c.json<VistaStanzaScarabocchi>(
      await espelli(c.env.DB, c.get('player').id, codiceDi(c), corpo.playerId, Date.now()),
    )
  })

  .post('/stanze/:codice/via', async (c) =>
    c.json<VistaStanzaScarabocchi>(await iniziaPartita(c.env.DB, c.get('player').id, codiceDi(c), Date.now())),
  )

  .post('/stanze/:codice/ancora', async (c) =>
    c.json<VistaStanzaScarabocchi>(await unAltraPartita(c.env.DB, c.get('player').id, codiceDi(c), Date.now())),
  )

  /** Chi disegna sceglie la parola. */
  .post('/stanze/:codice/scegli', async (c) => {
    const corpo = await corpoDi(c)
    return c.json<VistaStanzaScarabocchi>(
      await scegli(c.env.DB, c.get('player').id, codiceDi(c), corpo.indice, Date.now()),
    )
  })

  /** Una risposta di chi indovina. */
  .post('/stanze/:codice/tentativo', async (c) => {
    const corpo = await corpoDi(c)
    return c.json<VistaStanzaScarabocchi>(
      await tentativo(c.env.DB, c.get('player').id, codiceDi(c), corpo.testo, Date.now(), richiestaDi(c)),
    )
  })

  /** Un pezzo di tratti: di chi disegna il turno, o di un foglio del telefono senza fili. */
  .post('/stanze/:codice/tratti', async (c) => {
    const corpo = await corpoDi(c)
    return c.json(await aggiungiTratti(c.env.DB, c.get('player').id, codiceDi(c), corpo, Date.now()))
  })

  /** Un foglio intero: il proprio disegno da riprendere, quello da descrivere, o uno dell'album. */
  .get('/stanze/:codice/fogli/:foglio', async (c) => {
    const foglio = c.req.param('foglio')
    if (!/^(?:t\d{1,3}|c\d{1,2}p\d{1,2})$/.test(foglio)) fail(404, 'FOGLIO', 'Foglio sconosciuto.')
    return c.json(await foglioIntero(c.env.DB, c.get('player').id, codiceDi(c), foglio))
  })

  /** La frase del telefono senza fili, mentre si scrive e quando si consegna; o la consegna di un disegno. */
  .post('/stanze/:codice/foglio', async (c) => {
    const corpo = await corpoDi(c)
    return c.json<VistaStanzaScarabocchi>(
      await scriviFoglio(c.env.DB, c.get('player').id, codiceDi(c), corpo, Date.now()),
    )
  })

  /** L'album a partita finita: una catena alla volta, o i disegni dei turni. */
  .get('/stanze/:codice/album', async (c) => {
    const catena = intero(c.req.query('catena'))
    return c.json(await album(c.env.DB, c.get('player').id, codiceDi(c), catena ?? null))
  })

  .post('/stanze/:codice/invita', async (c) => {
    const corpo = await corpoDi(c)
    await invitaNellaStanza(c.env.DB, c.get('player').id, codiceDi(c), corpo.playerId, Date.now())
    return c.json({ ok: true })
  })

  .post('/inviti/:id/rifiuta', async (c) => {
    await rifiutaInvito(c.env.DB, c.get('player').id, c.req.param('id'))
    return c.json({ ok: true })
  })

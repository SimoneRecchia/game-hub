import { Hono } from 'hono'
import { PRESENZA_ONLINE_MS } from '../../shared/config'
import {
  CATEGORIE_NOTIFICHE,
  CHIAMATA_MS,
  eGiocoChiamata,
  preferenzeDa,
  type StatoNotifiche,
} from '../../shared/notifiche'
import type { GiocatoreBreve } from '../../shared/types'
import { chiavePubblicaValida, endpointValido, segretoValido } from '../../shared/webpush'
import type { AppEnv } from '../types'
import { fail, newId } from '../lib/http'
import { avvisa, chiaviVapid, dopoLaRisposta, messaggioChiamata, riceveInviti } from '../lib/notifiche'
import { requireVerified } from '../lib/session'

async function corpoDi(c: { req: { json: () => Promise<unknown> } }): Promise<Record<string, unknown>> {
  const corpo = await c.req.json().catch(() => null)
  return corpo && typeof corpo === 'object' ? (corpo as Record<string, unknown>) : {}
}

/**
 * Le notifiche di un giocatore: la chiave per iscriversi, le preferenze, e i
 * dispositivi. Le preferenze valgono per tutti i suoi dispositivi, perché le
 * guarda chi manda.
 */
export const notificheRoutes = new Hono<AppEnv>()
  .use('*', requireVerified)
  .get('/', async (c) => {
    const db = c.env.DB
    const io = c.get('player').id
    const [chiavi, riga] = await Promise.all([
      chiaviVapid(db),
      db
        .prepare(
          `SELECT p.notifiche, (SELECT COUNT(*) FROM push_iscrizioni s WHERE s.player_id = p.id) AS dispositivi
             FROM players p WHERE p.id = ?`,
        )
        .bind(io)
        .first<{ notifiche: string | null; dispositivi: number }>(),
    ])
    return c.json<StatoNotifiche>({
      chiave: chiavi.pubblica,
      preferenze: preferenzeDa(riga?.notifiche),
      dispositivi: riga?.dispositivi ?? 0,
    })
  })

  /** Un dispositivo che si iscrive. Lo stesso indirizzo con un altro giocatore passa a lui: e' il suo telefono adesso. */
  .post('/iscrizione', async (c) => {
    const corpo = await corpoDi(c)
    const chiavi = (corpo.keys ?? {}) as Record<string, unknown>
    if (!endpointValido(corpo.endpoint) || !chiavePubblicaValida(chiavi.p256dh) || !segretoValido(chiavi.auth)) {
      fail(400, 'ISCRIZIONE', 'Iscrizione non valida.')
    }
    await c.env.DB.prepare(
      `INSERT INTO push_iscrizioni (endpoint, player_id, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (endpoint) DO UPDATE SET player_id = excluded.player_id, p256dh = excluded.p256dh,
         auth = excluded.auth, created_at = excluded.created_at`,
    )
      .bind(corpo.endpoint, c.get('player').id, chiavi.p256dh, chiavi.auth, new Date().toISOString())
      .run()
    return c.json({ ok: true })
  })

  .post('/disiscrizione', async (c) => {
    const corpo = await corpoDi(c)
    if (!endpointValido(corpo.endpoint)) fail(400, 'ISCRIZIONE', 'Iscrizione non valida.')
    await c.env.DB.prepare('DELETE FROM push_iscrizioni WHERE endpoint = ? AND player_id = ?')
      .bind(corpo.endpoint, c.get('player').id)
      .run()
    return c.json({ ok: true })
  })

  /** Le preferenze: si scrivono solo quelle che si conoscono, e il resto resta com'era. */
  .post('/preferenze', async (c) => {
    const corpo = await corpoDi(c)
    const db = c.env.DB
    const io = c.get('player').id
    const riga = await db.prepare('SELECT notifiche FROM players WHERE id = ?').bind(io).first<{ notifiche: string | null }>()
    const preferenze = preferenzeDa(riga?.notifiche)
    for (const { id } of CATEGORIE_NOTIFICHE) if (typeof corpo[id] === 'boolean') preferenze[id] = corpo[id] as boolean
    await db.prepare('UPDATE players SET notifiche = ? WHERE id = ?').bind(JSON.stringify(preferenze), io).run()
    return c.json({ preferenze })
  })

  /** Una notifica di prova sui propri dispositivi, appena accese: si vede subito che arrivano. */
  .post('/prova', async (c) => {
    const inviate = await avvisa(c.env, c.get('player').id, 'inviti', {
      titolo: 'Le notifiche sono accese',
      testo: 'Ti avviseremo così quando qualcuno ti invita a giocare.',
      url: '/profilo',
      tag: 'prova',
    }).catch(() => 0)
    return c.json({ inviate })
  })

/**
 * Gli inviti a chi non e' online: gli arriva la notifica, e aprendo l'app trova
 * l'invito. Chi risponde manda lui l'invito vero del gioco, a chi l'ha chiamato
 * — che intanto e' rimasto nell'app — o lo richiama, se se n'e' andato.
 */
export const chiamateRoutes = new Hono<AppEnv>()
  .use('*', requireVerified)
  .post('/', async (c) => {
    const corpo = await corpoDi(c)
    const db = c.env.DB
    const io = c.get('player')
    const a = typeof corpo.playerId === 'string' ? corpo.playerId : ''
    if (!eGiocoChiamata(corpo.gioco)) fail(400, 'GIOCO', 'Gioco sconosciuto.')
    if (!a || a === io.id) fail(400, 'INVITO_A_SE', 'Non puoi invitare te stesso.')
    const esiste = await db.prepare('SELECT 1 AS si FROM players WHERE id = ?').bind(a).first()
    if (!esiste) fail(404, 'GIOCATORE_NON_TROVATO', 'Giocatore non trovato.')
    const id = newId('ch')
    const adesso = new Date().toISOString()
    await db
      .prepare(
        `INSERT INTO chiamate (id, da, a, gioco, stato, created_at) VALUES (?, ?, ?, ?, 'attesa', ?)
         ON CONFLICT (da, a) DO UPDATE SET id = excluded.id, gioco = excluded.gioco, stato = 'attesa',
           created_at = excluded.created_at`,
      )
      .bind(id, io.id, a, corpo.gioco, adesso)
      .run()
    const avvisato = await riceveInviti(db, a)
    if (avvisato) {
      const messaggio = messaggioChiamata({ id: io.id, nome: io.displayName || io.nickname }, corpo.gioco, id)
      await dopoLaRisposta(c, avvisa(c.env, a, 'inviti', messaggio, { ttl: CHIAMATA_MS / 1000, urgente: true }))
    }
    return c.json({ id, avvisato }, 201)
  })

  /** Chi e' stato chiamato risponde: si', e allora dice se chi l'ha chiamato e' ancora online, o no grazie. */
  .post('/:id/:risposta', async (c) => {
    const risposta = c.req.param('risposta')
    if (risposta !== 'rispondi' && risposta !== 'rifiuta') fail(404, 'NON_TROVATO', 'Non trovato.')
    const db = c.env.DB
    const io = c.get('player').id
    const adesso = Date.now()
    const riga = await db
      .prepare(
        `SELECT c.gioco, c.da, p.nickname, p.display_name, p.avatar_color,
                EXISTS (SELECT 1 FROM presenza pr WHERE pr.player_id = c.da AND pr.visto_at >= ?) AS online
           FROM chiamate c JOIN players p ON p.id = c.da
          WHERE c.id = ? AND c.a = ?`,
      )
      .bind(new Date(adesso - PRESENZA_ONLINE_MS).toISOString(), c.req.param('id'), io)
      .first<{ gioco: string; da: string; nickname: string; display_name: string; avatar_color: string; online: number }>()
    if (!riga) fail(404, 'CHIAMATA_NON_TROVATA', 'Questo invito non c’è più.')
    await db
      .prepare("UPDATE chiamate SET stato = ? WHERE id = ? AND stato = 'attesa'")
      .bind(risposta === 'rispondi' ? 'risposta' : 'rifiutata', c.req.param('id'))
      .run()
    const da: GiocatoreBreve = {
      playerId: riga.da,
      nickname: riga.nickname,
      displayName: riga.display_name || riga.nickname,
      avatarColor: riga.avatar_color,
    }
    return c.json({ gioco: riga.gioco, da, online: riga.online === 1 })
  })

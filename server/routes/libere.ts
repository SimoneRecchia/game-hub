import { Hono } from 'hono'
import { eEventoSospesa, eGiocoSospeso, eIdSospesa, type EventoSospesa } from '../../shared/sospese'
import type { AppEnv } from '../types'
import { fail, nowIso } from '../lib/http'
import { requireAuth } from '../lib/session'

/** Lo stato della riga dopo ogni evento: la ripresa la tiene aperta, gli altri la chiudono. */
const STATO: Record<EventoSospesa, string> = {
  inizio: 'aperta',
  ripresa: 'aperta',
  finita: 'finita',
  annullata: 'annullata',
  scaduta: 'scaduta',
}

/**
 * Le libere in sospeso stanno nel telefono (src/games/sospese.ts): qui arriva
 * solo quel che succede loro, per i conti del pannello di amministrazione.
 * Una richiesta per evento — l'inizio, una ripresa, la fine —, mai una per
 * mossa. Un evento su una partita gia' chiusa non la riapre.
 */
export const libereRoutes = new Hono<AppEnv>().use('*', requireAuth).post('/sospese', async (c) => {
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
  const { id, gioco, evento } = body ?? {}
  if (!eIdSospesa(id) || !eGiocoSospeso(gioco) || !eEventoSospesa(evento)) {
    fail(400, 'SOSPESA_NON_VALIDA', 'Evento non valido.')
  }
  const io = c.get('player').id
  const adesso = nowIso()
  await c.env.DB.batch([
    // Prima l'evento, finché la riga dice ancora se la partita era aperta: quel che arriva dopo la fine non conta.
    c.env.DB.prepare(
      `INSERT INTO libere_sospese_eventi (sospesa_id, evento, at)
       SELECT ?1, ?2, ?3 WHERE NOT EXISTS (SELECT 1 FROM libere_sospese WHERE id = ?1 AND stato <> 'aperta')`,
    ).bind(id, evento, adesso),
    c.env.DB.prepare(
      `INSERT INTO libere_sospese (id, player_id, gioco, stato, riprese, creata_at, toccata_at, chiusa_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6, ?7)
       ON CONFLICT (id) DO UPDATE SET
         stato = CASE WHEN libere_sospese.stato = 'aperta' THEN excluded.stato ELSE libere_sospese.stato END,
         riprese = libere_sospese.riprese
           + CASE WHEN libere_sospese.stato = 'aperta' THEN excluded.riprese ELSE 0 END,
         toccata_at = CASE WHEN libere_sospese.stato = 'aperta' THEN excluded.toccata_at
                           ELSE libere_sospese.toccata_at END,
         chiusa_at = CASE WHEN libere_sospese.stato = 'aperta' THEN excluded.chiusa_at ELSE libere_sospese.chiusa_at END
       WHERE libere_sospese.player_id = excluded.player_id`,
    ).bind(
      id,
      io,
      gioco,
      STATO[evento],
      evento === 'ripresa' ? 1 : 0,
      adesso,
      STATO[evento] === 'aperta' ? null : adesso,
    ),
  ])
  return c.body(null, 204)
})

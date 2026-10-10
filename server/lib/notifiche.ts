import type { Context } from 'hono'
import { PRESENZA_ONLINE_MS } from '../../shared/config'
import {
  CHIAMATA_MS,
  NOMI_CHIAMATA,
  preferenzeDa,
  type CategoriaNotifica,
  type ChiamataRicevuta,
  type GiocoChiamata,
} from '../../shared/notifiche'
import { mandaPush, nuoveChiaviVapid, type ChiaviVapid, type MessaggioPush } from '../../shared/webpush'
import type { AppEnv, Bindings } from '../types'

/**
 * Le notifiche che manda il Worker: quelle che nascono da una richiesta, come
 * un invito a chi non e' online o una mossa a chi ha chiuso l'app. Partono
 * dopo la risposta (`dopoLaRisposta`), cosi' chi muove non aspetta il servizio
 * di notifiche dell'altro; cifrarne una costa meno di un millisecondo.
 */

let chiaviInMemoria: ChiaviVapid | null = null

/**
 * Le chiavi VAPID, una volta per isolato. Le crea il primo che ne ha bisogno,
 * con `INSERT OR IGNORE` e poi la rilettura: due richieste insieme non ne
 * fanno due, come la parola del giorno.
 */
export async function chiaviVapid(db: D1Database): Promise<ChiaviVapid> {
  if (chiaviInMemoria) return chiaviInMemoria
  const leggi = () => db.prepare("SELECT valore FROM segreti WHERE nome = 'vapid'").first<{ valore: string }>()
  let riga = await leggi()
  if (!riga) {
    const nuove = await nuoveChiaviVapid()
    await db
      .prepare("INSERT OR IGNORE INTO segreti (nome, valore, created_at) VALUES ('vapid', ?, ?)")
      .bind(JSON.stringify(nuove), new Date().toISOString())
      .run()
    riga = await leggi()
  }
  chiaviInMemoria = JSON.parse(riga!.valore) as ChiaviVapid
  return chiaviInMemoria
}

/** Chi manda, come lo vuole VAPID: l'indirizzo dell'app. */
export function mittente(env: Pick<Bindings, 'COOKIE_DOMAIN'>): string {
  return env.COOKIE_DOMAIN ? `https://giochi.${env.COOKIE_DOMAIN}` : 'https://game-hub-43l.pages.dev'
}

/** Quanti dispositivi di un giocatore si avvisano al piu': gli ultimi iscritti. */
const DISPOSITIVI_MASSIMI = 4

/**
 * Manda una notifica a un giocatore, se ha la categoria accesa e almeno un
 * dispositivo iscritto; con `soloSeAssente`, solo se la presenza non lo vede.
 * Le iscrizioni che il servizio dice morte si cancellano. Restituisce quanti
 * dispositivi l'hanno ricevuta.
 */
export async function avvisa(
  env: Bindings,
  playerId: string,
  categoria: CategoriaNotifica,
  messaggio: MessaggioPush,
  { soloSeAssente = false, ttl = 3600, urgente = false }: { soloSeAssente?: boolean; ttl?: number; urgente?: boolean } = {},
): Promise<number> {
  const db = env.DB
  const { results } = await db
    .prepare(
      `SELECT p.notifiche, s.endpoint, s.p256dh, s.auth,
              EXISTS (SELECT 1 FROM presenza pr WHERE pr.player_id = p.id AND pr.visto_at >= ?2) AS online
         FROM players p
         JOIN push_iscrizioni s ON s.player_id = p.id
        WHERE p.id = ?1
        ORDER BY s.created_at DESC
        LIMIT ${DISPOSITIVI_MASSIMI}`,
    )
    .bind(playerId, new Date(Date.now() - PRESENZA_ONLINE_MS).toISOString())
    .all<{ notifiche: string | null; endpoint: string; p256dh: string; auth: string; online: number }>()
  if (results.length === 0) return 0
  if (!preferenzeDa(results[0].notifiche)[categoria]) return 0
  if (soloSeAssente && results[0].online) return 0
  const chiavi = await chiaviVapid(db)
  const esiti = await Promise.all(
    results.map((r) => mandaPush(r, messaggio, chiavi, { sub: mittente(env), ttl, urgente })),
  )
  const morte = results.filter((_, i) => esiti[i].morta)
  if (morte.length > 0) {
    await db.batch(morte.map((r) => db.prepare('DELETE FROM push_iscrizioni WHERE endpoint = ?').bind(r.endpoint)))
  }
  return esiti.filter((e) => e.stato >= 200 && e.stato < 300).length
}

/**
 * Quel che puo' finire dopo la risposta. Senza un contesto, come nei test,
 * si aspetta; un errore del servizio di notifiche non tocca la richiesta.
 */
export async function dopoLaRisposta(c: Context<AppEnv>, lavoro: Promise<unknown>): Promise<void> {
  const sicuro = lavoro.catch(() => {})
  try {
    c.executionCtx.waitUntil(sicuro)
  } catch {
    await sicuro
  }
}

/** Ha almeno un dispositivo che riceve gli inviti: per dire a chi invita se la notifica arriva. */
export async function riceveInviti(db: D1Database, playerId: string): Promise<boolean> {
  const r = await db
    .prepare(
      `SELECT p.notifiche, (SELECT COUNT(*) FROM push_iscrizioni s WHERE s.player_id = p.id) AS dispositivi
         FROM players p WHERE p.id = ?`,
    )
    .bind(playerId)
    .first<{ notifiche: string | null; dispositivi: number }>()
  return !!r && r.dispositivi > 0 && preferenzeDa(r.notifiche).inviti
}

/** Gli inviti a giocare arrivati quando non si era online, di chi c'e' ancora: per la presenza. */
export async function chiamateRicevute(db: D1Database, io: string, adesso: number): Promise<ChiamataRicevuta[]> {
  const { results } = await db
    .prepare(
      `SELECT c.id, c.gioco, c.created_at, p.id AS pid, p.nickname, p.display_name, p.avatar_color
         FROM chiamate c
         JOIN players p ON p.id = c.da
        WHERE c.a = ? AND c.stato = 'attesa' AND c.created_at >= ?
        ORDER BY c.created_at DESC`,
    )
    .bind(io, new Date(adesso - CHIAMATA_MS).toISOString())
    .all<{ id: string; gioco: GiocoChiamata; created_at: string; pid: string; nickname: string; display_name: string; avatar_color: string }>()
  return results.map((r) => ({
    id: r.id,
    gioco: r.gioco,
    createdAt: r.created_at,
    da: { playerId: r.pid, nickname: r.nickname, displayName: r.display_name || r.nickname, avatarColor: r.avatar_color },
  }))
}

/** Il messaggio di un invito a chi non era online: un altro invito della stessa persona prende il suo posto. */
export function messaggioChiamata(da: { id: string; nome: string }, gioco: GiocoChiamata, chiamata: string): MessaggioPush {
  return {
    titolo: `${da.nome} ti invita a giocare`,
    testo: `${NOMI_CHIAMATA[gioco]}: apri per rispondere`,
    url: `/?chiamata=${chiamata}`,
    tag: `chiamata-${da.id}`,
  }
}

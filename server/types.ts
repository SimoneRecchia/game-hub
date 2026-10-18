import { NICKNAME_OGNI_GIORNI } from '../shared/config'
import type { RuoloAdmin } from '../shared/admin'
import type { Player } from '../shared/types'

/** Binding e variabili disponibili nelle Pages Functions (vedi wrangler.toml). */
export interface Bindings {
  DB: D1Database
  /**
   * Gli asset statici del sito, che le Pages danno a ogni Function. Il server
   * ci legge il dizionario dello Scarabeo (vedi server/lib/dizionario.ts).
   */
  ASSETS: Fetcher
  /**
   * Dominio su cui vale il cookie di sessione, per esempio `esempio.it`.
   *
   * Va impostata quando hub e giochi stanno su sottodomini diversi: senza,
   * il cookie resta legato al singolo host e chi accede su `giochi.esempio.it`
   * risulterebbe sconosciuto su `wordle.esempio.it`.
   *
   * Se non c'e' (sviluppo locale, *.pages.dev) il cookie e' del solo host.
   */
  COOKIE_DOMAIN?: string

  /**
   * Chiave API di Resend, per l'invio delle email. Va impostata come *secret*
   * (`wrangler pages secret put RESEND_API_KEY`), non come variabile in
   * chiaro in wrangler.toml.
   */
  RESEND_API_KEY?: string

  /** Mittente delle email, per esempio `Game Hub <giochi@esempio.it>`. */
  EMAIL_FROM?: string

  /**
   * Endpoint dell'API di invio. Vuoto significa Resend.
   *
   * Serve per puntare a un servizio compatibile diverso, e in sviluppo a un
   * finto servizio locale da cui leggere il codice senza mandare email vere.
   */
  EMAIL_ENDPOINT?: string

  /**
   * `'on'` per pretendere l'email verificata prima di giocare.
   *
   * Resta spenta finché non c'e' una chiave Resend: attivarla senza il modo di
   * spedire i codici bloccherebbe le registrazioni.
   */
  EMAIL_VERIFICATION?: 'on' | 'off'

  /**
   * Le email dei proprietari del pannello di amministrazione, separate da
   * virgole: chi ha una di queste email, confermata, e' amministratore e puo'
   * nominarne altri. Vedi server/lib/admin.ts.
   */
  ADMIN_EMAILS?: string

  /**
   * L'account Cloudflare e un token in sola lettura, per le statistiche del
   * pannello (richieste, D1, deploy). Il token e' un *secret*
   * (`wrangler pages secret put CF_API_TOKEN`): vedi DEPLOY.md.
   */
  CF_ACCOUNT_ID?: string
  CF_API_TOKEN?: string
  /** La zona del dominio, per il traffico di tutto il sito: facoltativa. */
  CF_ZONE_ID?: string
  /** Il sito delle Web Analytics, per le visite: facoltativo. */
  CF_WEB_ANALYTICS_TAG?: string
}

/** Variabili aggiunte al contesto Hono dai middleware. */
export interface Variables {
  player: Player
  /** Messo da `requireAdmin`: il ruolo nel pannello e la sessione da cui si lavora. */
  admin: { ruolo: RuoloAdmin; tokenHash: string }
}

export interface AppEnv {
  Bindings: Bindings
  Variables: Variables
}

/** Riga della tabella players come arriva da D1. */
export interface PlayerRow {
  id: string
  nickname: string
  nickname_lower: string
  display_name: string
  /** Vuote dalla migrazione 0032: si entra con il codice, e nessuno le legge. */
  password_hash: string
  password_salt: string
  password_iterations: number
  avatar_color: string
  created_at: string
  last_seen_at: string
  email: string | null
  email_lower: string | null
  email_verified_at: string | null
  /** L'ultimo cambio di nickname, dalla 0046: NULL per chi non l'ha mai cambiato. */
  nickname_changed_at?: string | null
  /** 'admin' per chi il proprietario ha nominato amministratore, dalla 0053. */
  ruolo?: string | null
  /** Quando l'account e' stato sospeso, dalla 0053: NULL se non lo e'. */
  sospeso_at?: string | null
}

/** Da quando si puo' cambiare di nuovo il nickname: null se si puo' adesso. */
export function nicknameCambiabileDal(row: Pick<PlayerRow, 'nickname_changed_at'>, adesso = Date.now()): string | null {
  if (!row.nickname_changed_at) return null
  const dal = new Date(row.nickname_changed_at).getTime() + NICKNAME_OGNI_GIORNI * 86_400_000
  return dal > adesso ? new Date(dal).toISOString() : null
}

export function toPlayer(row: PlayerRow): Player {
  return {
    id: row.id,
    nickname: row.nickname,
    displayName: row.display_name,
    avatarColor: row.avatar_color,
    createdAt: row.created_at,
    email: row.email,
    emailVerified: row.email_verified_at !== null,
    nicknameCambiabileDal: nicknameCambiabileDal(row),
  }
}

import type { Player } from '../shared/types'

/** Binding e variabili disponibili nelle Pages Functions (vedi wrangler.toml). */
export interface Bindings {
  DB: D1Database
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
}

/** Variabili aggiunte al contesto Hono dai middleware. */
export interface Variables {
  player: Player
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
  password_hash: string
  password_salt: string
  password_iterations: number
  avatar_color: string
  created_at: string
  last_seen_at: string
}

export function toPlayer(row: PlayerRow): Player {
  return {
    id: row.id,
    nickname: row.nickname,
    displayName: row.display_name,
    avatarColor: row.avatar_color,
    createdAt: row.created_at,
  }
}

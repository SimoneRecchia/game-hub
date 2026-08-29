import type { Player } from '../shared/types'

/** Binding disponibili nelle Pages Functions (vedi wrangler.toml). */
export interface Bindings {
  DB: D1Database
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

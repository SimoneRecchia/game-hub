import { PRESENZA_ONLINE_MS } from '../../shared/config'
import type { AmicoOnline, Attivita, GiocatoreBreve, ProfiloAmico } from '../../shared/types'

/**
 * Gli amici: tutti gli altri del gruppo. L'app e' fra colleghi, e una lista
 * di amici da tenere non servirebbe: chi c'e' si vede dalla presenza, la
 * stessa che usano le sale dei giochi per dire chi si puo' sfidare.
 */

interface RigaGiocatore {
  id: string
  nickname: string
  display_name: string
  avatar_color: string
}

function breve(r: RigaGiocatore): GiocatoreBreve {
  return {
    playerId: r.id,
    nickname: r.nickname,
    displayName: r.display_name || r.nickname,
    avatarColor: r.avatar_color,
  }
}

const daQuando = (adesso: number) => new Date(adesso - PRESENZA_ONLINE_MS).toISOString()

/** Chi e' online adesso, tranne chi guarda, in ordine di nome. */
export async function amiciOnline(db: D1Database, io: string, adesso: number): Promise<AmicoOnline[]> {
  const { results } = await db
    .prepare(
      `SELECT p.id, p.nickname, p.display_name, p.avatar_color, pr.attivita
         FROM presenza pr
         JOIN players p ON p.id = pr.player_id
        WHERE pr.visto_at >= ? AND p.id != ?
        ORDER BY p.display_name COLLATE NOCASE`,
    )
    .bind(daQuando(adesso), io)
    .all<RigaGiocatore & { attivita: Attivita }>()
  return results.map((r) => ({ ...breve(r), attivita: r.attivita }))
}

/** Il profilo di un giocatore dal suo nickname, maiuscole o no; `null` se non c'e'. */
export async function profiloAmico(db: D1Database, nickname: string, adesso: number): Promise<ProfiloAmico | null> {
  const r = await db
    .prepare(
      `SELECT p.id, p.nickname, p.display_name, p.avatar_color, p.created_at, pr.visto_at, pr.attivita
         FROM players p
         LEFT JOIN presenza pr ON pr.player_id = p.id
        WHERE p.nickname_lower = ?`,
    )
    .bind(nickname.toLowerCase())
    .first<RigaGiocatore & { created_at: string; visto_at: string | null; attivita: Attivita | null }>()
  if (!r) return null
  const online = r.visto_at !== null && r.visto_at >= daQuando(adesso)
  return { ...breve(r), createdAt: r.created_at, online, attivita: online ? r.attivita : null }
}

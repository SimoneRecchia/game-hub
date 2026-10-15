import { PRESENZA_ONLINE_MS } from '../../shared/config'
import { periodoDi } from '../../shared/periodi'
import type {
  AmicoOnline,
  Attivita,
  GeneraleRow,
  GiocatoreBreve,
  GiocoClassificato,
  Persona,
  PeriodoClassifica,
  ProfiloAmico,
  PuntiDelPeriodo,
  PuntiGiocatore,
} from '../../shared/types'
import { classificaGenerale } from './generale'

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

/**
 * Tutti gli altri del gruppo, per cercarne uno anche quando non e' online e
 * invitarlo lo stesso (gli arriva una notifica): chi e' online per primo, poi
 * in ordine di nome. Il gruppo e' fra colleghi, e l'elenco intero sta in una
 * risposta; il tetto e' per un gruppo che crescesse oltre.
 */
export async function tuttiGliAltri(db: D1Database, io: string, adesso: number): Promise<Persona[]> {
  const { results } = await db
    .prepare(
      `SELECT p.id, p.nickname, p.display_name, p.avatar_color, pr.attivita,
              (pr.visto_at IS NOT NULL AND pr.visto_at >= ?) AS online
         FROM players p
         LEFT JOIN presenza pr ON pr.player_id = p.id
        WHERE p.id != ?
        ORDER BY online DESC, p.display_name COLLATE NOCASE
        LIMIT 500`,
    )
    .bind(daQuando(adesso), io)
    .all<RigaGiocatore & { attivita: Attivita | null; online: number }>()
  return results.map((r) => ({ ...breve(r), online: r.online === 1, attivita: r.online === 1 ? r.attivita : null }))
}

/** I punti di una riga della generale, per il profilo: quel che serve, senza il resto della classifica. */
function delPeriodo(riga: GeneraleRow | null, giocatori: number): PuntiDelPeriodo {
  return {
    rank: riga?.rank ?? null,
    giocatori,
    punti: riga?.punti ?? 0,
    partite: riga?.partite ?? 0,
    perGioco: riga?.perGioco ?? {
      wordle: 0,
      scarabeo: 0,
      cruciverba: 0,
      sudoku: 0,
      quiz: 0,
      nomi: 0,
      anagrammi: 0,
      ghigliottina: 0,
      paroliere: 0,
      catena: 0,
    },
    storici: (riga?.battaglia ?? 0) + (riga?.tris ?? 0) + (riga?.sequenze ?? 0),
    fortuna: riga
      ? riga.ruota + riga.slot + riga.blackjack + riga.roulette + riga.superenalotto
      : 0,
  }
}

/** Il gioco con piu' punti, se ce n'e' uno con dei punti; a pari punti il primo dell'elenco. */
function preferitoDi(perGioco: Record<GiocoClassificato, number> | undefined): GiocoClassificato | null {
  if (!perGioco) return null
  let meglio: GiocoClassificato | null = null
  for (const g of Object.keys(perGioco) as GiocoClassificato[]) {
    if (perGioco[g] > 0 && (meglio === null || perGioco[g] > perGioco[meglio])) meglio = g
  }
  return meglio
}

/**
 * I punti di un giocatore per il suo profilo, con le stesse regole della
 * generale: e' la generale del mese e di sempre, da cui si prende la sua riga,
 * cosi' il posto e' quello che si vede in classifica. Il gioco preferito si
 * misura sugli ultimi trenta giorni, e non sul mese del calendario: il primo
 * del mese direbbe quello giocato quel giorno.
 */
export async function puntiDi(db: D1Database, playerId: string, oggi: number): Promise<PuntiGiocatore> {
  const sempre = periodoDi('all', oggi)
  const trenta: PeriodoClassifica = { ...sempre, da: Math.max(1, oggi - 29) }
  const [m, s, t] = await Promise.all([
    classificaGenerale(db, periodoDi('month', oggi), playerId),
    classificaGenerale(db, sempre, playerId),
    classificaGenerale(db, trenta, playerId),
  ])
  return {
    preferito: preferitoDi(t.me?.perGioco) ?? preferitoDi(s.me?.perGioco),
    mese: delPeriodo(m.me, m.rows.length),
    sempre: delPeriodo(s.me, s.rows.length),
  }
}

/** L'id di un giocatore dal suo nickname, maiuscole o no. */
export async function idDi(db: D1Database, nickname: string): Promise<string | null> {
  const r = await db
    .prepare('SELECT id FROM players WHERE nickname_lower = ?')
    .bind(nickname.toLowerCase())
    .first<{ id: string }>()
  return r?.id ?? null
}

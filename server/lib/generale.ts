/**
 * La classifica generale: la somma delle classificate di tutti i giochi.
 *
 * Si puo' fare adesso e non si poteva prima: ogni classificata vale al massimo
 * cento punti, qualunque sia il gioco (vedi shared/punti.ts), quindi sommarle
 * non richiede un tasso di cambio inventato. Chi gioca a tutto ogni giorno puo'
 * fare fino a cinquecento punti; chi gioca solo al Wordle fino a cento, e
 * nella classifica del Wordle compete alla pari con tutti.
 *
 * Un aggregato per gioco, uniti qui. Non una query sola: le tabelle non hanno
 * niente in comune se non il giocatore, e una UNION con
 * colonne diverse per ogni gioco sarebbe piu' difficile da leggere che da
 * unire in memoria — le righe sono una per giocatore per gioco.
 */

import type { GeneraleLeaderboard, GeneraleRow, GiocoClassificato, PeriodoClassifica } from '../../shared/types'
import { nowIso } from './http'

export interface TotaliGenerale {
  playerId: string
  nickname: string
  displayName: string
  avatarColor: string
  perGioco: Record<GiocoClassificato, number>
  assist: number
  partite: number
}

/**
 * Mette in fila i giocatori della classifica generale.
 *
 * L'ordine: **punti**, poi **meno punti assist** — la stessa regola del
 * Wordle: a pari punti passa avanti chi li ha fatti con le proprie partite —
 * poi **meno partite**, perché lo stesso totale con meno classificate e' un
 * gioco migliore, e infine il nickname, così due righe identiche non si
 * scambiano di posto.
 */
export function ordinaGenerale(giocatori: TotaliGenerale[]): GeneraleRow[] {
  const conPunti = giocatori.map((g) => ({
    ...g,
    punti: g.perGioco.wordle + g.perGioco.scarabeo + g.perGioco.cruciverba + g.perGioco.battaglia + g.perGioco.quiz,
  }))
  return conPunti
    .sort((a, b) => {
      if (a.punti !== b.punti) return b.punti - a.punti
      if (a.assist !== b.assist) return a.assist - b.assist
      if (a.partite !== b.partite) return a.partite - b.partite
      return a.nickname.localeCompare(b.nickname, 'it', { sensitivity: 'base' })
    })
    .map((g, i) => ({ rank: i + 1, ...g }))
}

interface Parziale {
  player_id: string
  punti: number
  partite: number
  assist?: number
}

export async function classificaGenerale(
  db: D1Database,
  periodo: PeriodoClassifica,
  viewerId: string,
): Promise<GeneraleLeaderboard> {
  const { da, a } = periodo

  const [wordle, scarabeo, cruciverba, battaglia, quiz] = await Promise.all([
    /*
     * Il Wordle come nella sua classifica: i punti delle proprie parole piu'
     * quelli delle giornate giocate in compagnia. Una giornata conta come una
     * partita, qualunque sia il numero di parole chiuse.
     */
    db
      .prepare(
        `SELECT player_id,
                COALESCE(SUM(CASE WHEN spectated = 1 THEN COALESCE(assist_score, 0)
                                  ELSE COALESCE(score, 0) END), 0)                 AS punti,
                COALESCE(SUM(CASE WHEN spectated = 1 THEN COALESCE(assist_score, 0) END), 0) AS assist,
                COUNT(DISTINCT CASE WHEN slot = 1 AND (
                        (spectated != 1 AND status != 'playing')
                     OR (spectated = 1 AND assist_status IS NOT NULL))
                      THEN puzzle_number END)                                    AS partite
           FROM wordle_games WHERE puzzle_number BETWEEN ? AND ? GROUP BY player_id`,
      )
      .bind(da, a)
      .all<Parziale>(),
    db
      .prepare(
        `SELECT player_id, COALESCE(SUM(punti), 0) AS punti,
                SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS partite
           FROM scarabeo_games WHERE puzzle_number BETWEEN ? AND ? GROUP BY player_id`,
      )
      .bind(da, a)
      .all<Parziale>(),
    db
      .prepare(
        `SELECT player_id,
                COALESCE(SUM(CASE WHEN status = 'done' THEN score ELSE 0 END), 0) AS punti,
                SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END)               AS partite
           FROM cruciverba_games WHERE puzzle_number BETWEEN ? AND ? GROUP BY player_id`,
      )
      .bind(da, a)
      .all<Parziale>(),
    db
      .prepare(
        `SELECT giocatore_a AS player_id,
                COALESCE(SUM(CASE WHEN stato = 'finita' THEN punti ELSE 0 END), 0) AS punti,
                SUM(CASE WHEN stato = 'finita' THEN 1 ELSE 0 END)                 AS partite
           FROM battaglia_partite
          WHERE modalita = 'classificata' AND puzzle_number BETWEEN ? AND ?
          GROUP BY giocatore_a`,
      )
      .bind(da, a)
      .all<Parziale>(),
    db
      .prepare(
        `SELECT player_id,
                COALESCE(SUM(CASE WHEN status = 'done' THEN score ELSE 0 END), 0) AS punti,
                SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END)               AS partite
           FROM quiz_partite WHERE puzzle_number BETWEEN ? AND ? GROUP BY player_id`,
      )
      .bind(da, a)
      .all<Parziale>(),
  ])

  const totali = new Map<string, TotaliGenerale>()
  const di = (id: string): TotaliGenerale => {
    let t = totali.get(id)
    if (!t) {
      t = {
        playerId: id,
        nickname: '',
        displayName: '',
        avatarColor: '',
        perGioco: { wordle: 0, scarabeo: 0, cruciverba: 0, battaglia: 0, quiz: 0 },
        assist: 0,
        partite: 0,
      }
      totali.set(id, t)
    }
    return t
  }
  const somma = (gioco: GiocoClassificato, righe: Parziale[]) => {
    for (const r of righe) {
      const t = di(r.player_id)
      t.perGioco[gioco] += r.punti
      t.partite += r.partite
      t.assist += r.assist ?? 0
    }
  }
  somma('wordle', wordle.results)
  somma('scarabeo', scarabeo.results)
  somma('cruciverba', cruciverba.results)
  somma('battaglia', battaglia.results)
  somma('quiz', quiz.results)

  if (totali.size > 0) {
    // Gli id in un parametro solo, come JSON: D1 accetta al massimo cento parametri per istruzione, e con
    // un segnaposto per giocatore la classifica si romperebbe al centunesimo.
    const { results } = await db
      .prepare(
        `SELECT id, nickname, display_name, avatar_color FROM players
          WHERE id IN (SELECT value FROM json_each(?))`,
      )
      .bind(JSON.stringify([...totali.keys()]))
      .all<{ id: string; nickname: string; display_name: string; avatar_color: string }>()
    for (const p of results) {
      const t = totali.get(p.id)!
      t.nickname = p.nickname
      t.displayName = p.display_name || p.nickname
      t.avatarColor = p.avatar_color
    }
    // Un giocatore cancellato nel frattempo non ha nome: resta fuori.
    for (const [chiave, t] of totali) if (!t.nickname) totali.delete(chiave)
  }

  const rows = ordinaGenerale([...totali.values()])
  return {
    scope: periodo.scope,
    periodo,
    updatedAt: nowIso(),
    rows,
    me: rows.find((r) => r.playerId === viewerId) ?? null,
  }
}

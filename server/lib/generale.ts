/**
 * La classifica generale: la somma delle classificate di tutti i giochi.
 *
 * Si puo' fare adesso e non si poteva prima: ogni classificata ha un tetto
 * deciso, secondo il tempo che chiede (`TETTI` in shared/punti.ts), quindi
 * sommarle non richiede un tasso di cambio inventato. Chi gioca a tutto ogni
 * giorno puo' fare la somma dei tetti; chi gioca solo al Wordle fino al suo, e
 * nella classifica del Wordle compete alla pari con tutti. I giochi della
 * Fortuna — Crazy Time, la slot, il blackjack, la roulette, il SuperEnalotto — si
 * sommano a parte (`ruota`, `slot`, `blackjack`, `roulette`, `superenalotto`): non
 * sono classificate, ma quel che danno o tolgono e'
 * fatto con i punti delle classificate, e va dove vanno loro.
 *
 * La battaglia navale ha avuto una classificata fino al 6 ottobre 2026: le sue
 * partite di allora restano nella generale dei periodi che le comprendono, in
 * una colonna a parte (`battaglia`), perché una giornata vale quel che valeva.
 * Dopo non ce ne sono, e la colonna resta a zero. Lo stesso per il tris, che
 * ha avuto la sua fino all'8 ottobre 2026 (`tris`): contro il computer del
 * giorno la serie non era una partita uguale per tutti come le altre.
 *
 * Un aggregato per gioco (`AGGREGATI`), tutti con le stesse colonne, uniti
 * in un'istruzione sola (`UNION ALL`) e sommati qui. Erano quindici
 * istruzioni, una per gioco, piu' leggibili ma care: la generale sta nella
 * schermata iniziale (`/api/oggi`), che con i riepiloghi dei giochi arrivava a
 * trentasette istruzioni, e il piano gratuito ne accetta cinquanta per
 * richiesta. Ogni gioco nuovo ne avrebbe aggiunta una.
 */

import { unisci } from '../../shared/sql'
import type {
  FortunaLeaderboard,
  FortunaRow,
  GeneraleLeaderboard,
  GeneraleRow,
  GiocoClassificato,
  GiocoFortuna,
  PeriodoClassifica,
} from '../../shared/types'
import { nowIso } from './http'

/**
 * I punti di una giornata di Scarabeo e di cruciverba: i propri, o quelli
 * dell'host per chi l'ha giocata in sua compagnia. Nello Scarabeo contano
 * anche le partite in corso, nel cruciverba solo le completate.
 */
const PUNTI_SCARABEO = 'CASE WHEN in_compagnia IS NULL THEN punti ELSE COALESCE(assist_score, 0) END'
const PUNTI_CRUCIVERBA = "CASE WHEN status = 'done' THEN COALESCE(assist_score, score) ELSE 0 END"

export interface TotaliGenerale {
  playerId: string
  nickname: string
  displayName: string
  avatarColor: string
  perGioco: Record<GiocoClassificato, number>
  /** La battaglia classificata, nei giorni in cui c'era. */
  battaglia: number
  /** Il tris classificato, nei giorni in cui c'era. */
  tris: number
  /** Quel che hanno dato o tolto i giochi della Fortuna: si sommano ai punti, e non sono partite. */
  ruota: number
  slot: number
  blackjack: number
  roulette: number
  superenalotto: number
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
    punti:
      g.perGioco.wordle +
      g.perGioco.scarabeo +
      g.perGioco.cruciverba +
      g.perGioco.sudoku +
      g.perGioco.quiz +
      g.perGioco.nomi +
      g.perGioco.anagrammi +
      g.perGioco.sequenze +
      g.perGioco.ghigliottina +
      g.perGioco.paroliere +
      g.perGioco.catena +
      g.battaglia +
      g.tris +
      g.ruota +
      g.slot +
      g.blackjack +
      g.roulette +
      g.superenalotto,
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

/**
 * I totali di ogni gioco in un periodo, uno per giocatore, con le stesse
 * colonne: da dove vengono (`fonte`: un gioco classificato, la battaglia o il
 * tris dei giorni in cui avevano la classificata, o un gioco della Fortuna),
 * i punti, gli assist e le partite. `?1` e `?2` sono il primo e l'ultimo giorno
 * del periodo, `?3` e `?4` gli stessi un giorno prima, per Nomi, cose e città.
 */
const AGGREGATI: readonly string[] = [
  /*
   * Il Wordle come nella sua classifica: i punti delle proprie parole piu'
   * quelli delle giornate giocate in compagnia. Una giornata conta come una
   * partita, qualunque sia il numero di parole chiuse.
   */
  `SELECT 'wordle' AS fonte, player_id,
          COALESCE(SUM(CASE WHEN spectated = 1 THEN COALESCE(assist_score, 0)
                            ELSE COALESCE(score, 0) END), 0)                       AS punti,
          COALESCE(SUM(CASE WHEN spectated = 1 THEN COALESCE(assist_score, 0) END), 0) AS assist,
          COUNT(DISTINCT CASE WHEN slot = 1 AND (
                  (spectated != 1 AND status != 'playing')
               OR (spectated = 1 AND assist_status IS NOT NULL))
                THEN puzzle_number END)                                          AS partite
     FROM wordle_games WHERE puzzle_number BETWEEN ?1 AND ?2 GROUP BY player_id`,
  /*
   * Lo Scarabeo e il cruciverba come nelle loro classifiche: la giornata
   * giocata in compagnia vale i punti dell'host, e sono punti assist.
   */
  `SELECT 'scarabeo', player_id,
          COALESCE(SUM(${PUNTI_SCARABEO}), 0),
          COALESCE(SUM(CASE WHEN in_compagnia IS NOT NULL THEN COALESCE(assist_score, 0) END), 0),
          SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END)
     FROM scarabeo_games WHERE puzzle_number BETWEEN ?1 AND ?2 GROUP BY player_id`,
  `SELECT 'cruciverba', player_id,
          COALESCE(SUM(${PUNTI_CRUCIVERBA}), 0),
          COALESCE(SUM(CASE WHEN status = 'done' AND in_compagnia IS NOT NULL
                            THEN COALESCE(assist_score, 0) END), 0),
          SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END)
     FROM cruciverba_games WHERE puzzle_number BETWEEN ?1 AND ?2 GROUP BY player_id`,
  // La battaglia, nei giorni in cui aveva una classificata.
  `SELECT 'battaglia', giocatore_a,
          COALESCE(SUM(CASE WHEN stato = 'finita' THEN punti ELSE 0 END), 0), 0,
          SUM(CASE WHEN stato = 'finita' THEN 1 ELSE 0 END)
     FROM battaglia_partite
    WHERE modalita = 'classificata' AND puzzle_number BETWEEN ?1 AND ?2
    GROUP BY giocatore_a`,
  /*
   * Nomi, cose e città: le partite si contano la notte e valgono il giorno
   * dopo, quindi un periodo prende quelle del giorno prima di ogni suo
   * giorno. Una partita contata e' una partita, anche a zero punti.
   */
  `SELECT 'nomi', player_id, COALESCE(SUM(score), 0), 0, COUNT(*)
     FROM nomi_partite WHERE puzzle_number BETWEEN ?3 AND ?4 AND score IS NOT NULL GROUP BY player_id`,
  // Gli altri, il tris compreso nei giorni in cui aveva una classificata: la giornata conta una partita.
  ...(
    [
      ['sudoku', 'sudoku_games'],
      ['quiz', 'quiz_partite'],
      ['tris', 'tris_partite'],
      ['anagrammi', 'anagrammi_partite'],
      ['sequenze', 'sequenze_partite'],
      ['ghigliottina', 'ghigliottina_partite'],
      ['paroliere', 'paroliere_partite'],
      ['catena', 'catena_partite'],
    ] as const
  ).map(
    ([fonte, tabella]) =>
      `SELECT '${fonte}', player_id,
              COALESCE(SUM(CASE WHEN status = 'done' THEN score ELSE 0 END), 0), 0,
              SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END)
         FROM ${tabella} WHERE puzzle_number BETWEEN ?1 AND ?2 GROUP BY player_id`,
  ),
  // Crazy Time: il conto di ogni giornata, non i giri uno per uno. Non e' una partita.
  `SELECT 'ruota', player_id, COALESCE(SUM(netto), 0), 0, 0
     FROM ruota_giornate WHERE puzzle_number BETWEEN ?1 AND ?2 GROUP BY player_id`,
  // La slot, il blackjack, la roulette e il SuperEnalotto: lo stesso conto per giornata, un gioco per riga.
  `SELECT gioco, player_id, COALESCE(SUM(netto), 0), 0, 0
     FROM fortuna_giornate WHERE puzzle_number BETWEEN ?1 AND ?2 GROUP BY player_id, gioco`,
]

/** Tutti gli aggregati in un'istruzione sola: vedi in testa. */
const GENERALE_SQL = unisci(AGGREGATI)

interface Aggregato {
  fonte: string
  player_id: string
  punti: number
  assist: number
  partite: number
}

const GIOCHI_DELLA_FORTUNA = new Set<string>(['slot', 'blackjack', 'roulette', 'superenalotto'])

export async function classificaGenerale(
  db: D1Database,
  periodo: PeriodoClassifica,
  viewerId: string,
): Promise<GeneraleLeaderboard> {
  const { da, a } = periodo
  const { results: aggregati } = await db.prepare(GENERALE_SQL).bind(da, a, da - 1, a - 1).all<Aggregato>()

  const totali = new Map<string, TotaliGenerale>()
  const di = (id: string): TotaliGenerale => {
    let t = totali.get(id)
    if (!t) {
      t = {
        playerId: id,
        nickname: '',
        displayName: '',
        avatarColor: '',
        perGioco: {
          wordle: 0,
          scarabeo: 0,
          cruciverba: 0,
          sudoku: 0,
          quiz: 0,
          nomi: 0,
          anagrammi: 0,
          sequenze: 0,
          ghigliottina: 0,
          paroliere: 0,
          catena: 0,
        },
        battaglia: 0,
        tris: 0,
        ruota: 0,
        slot: 0,
        blackjack: 0,
        roulette: 0,
        superenalotto: 0,
        assist: 0,
        partite: 0,
      }
      totali.set(id, t)
    }
    return t
  }
  for (const r of aggregati) {
    const t = di(r.player_id)
    if (r.fonte === 'ruota') t.ruota += r.punti
    else if (GIOCHI_DELLA_FORTUNA.has(r.fonte)) t[r.fonte as Exclude<GiocoFortuna, 'ruota'>] += r.punti
    else {
      if (r.fonte === 'battaglia') t.battaglia += r.punti
      else if (r.fonte === 'tris') t.tris += r.punti
      else t.perGioco[r.fonte as GiocoClassificato] += r.punti
      t.partite += r.partite
      t.assist += r.assist
    }
  }

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

/**
 * La classifica della Fortuna: quel che Crazy Time, la slot, il blackjack, la
 * roulette e il SuperEnalotto hanno dato o tolto nel periodo, tutti insieme. E' gia' dentro la generale;
 * qui si vede da solo, chi ha vinto di piu' e chi ha perso. Ci sta chi ha
 * giocato almeno una volta; a pari conto passa avanti chi ha giocato meno,
 * perché ha rischiato meno per lo stesso risultato.
 */
export async function classificaFortuna(
  db: D1Database,
  periodo: PeriodoClassifica,
  viewerId: string,
): Promise<FortunaLeaderboard> {
  const { da, a } = periodo
  const { results } = await db
    .prepare(
      `SELECT g.player_id, g.gioco, SUM(g.netto) AS netto, SUM(g.giocate) AS giocate,
              p.nickname, p.display_name, p.avatar_color
         FROM (SELECT player_id, 'ruota' AS gioco, netto, giri AS giocate FROM ruota_giornate
                WHERE puzzle_number BETWEEN ?1 AND ?2
               UNION ALL
               SELECT player_id, gioco, netto, giocate FROM fortuna_giornate
                WHERE puzzle_number BETWEEN ?1 AND ?2) g
         JOIN players p ON p.id = g.player_id
        GROUP BY g.player_id, g.gioco`,
    )
    .bind(da, a)
    .all<{
      player_id: string
      gioco: GiocoFortuna
      netto: number
      giocate: number
      nickname: string
      display_name: string
      avatar_color: string
    }>()
  const righe = new Map<string, Omit<FortunaRow, 'rank'>>()
  for (const r of results) {
    let riga = righe.get(r.player_id)
    if (!riga) {
      riga = {
        playerId: r.player_id,
        nickname: r.nickname,
        displayName: r.display_name || r.nickname,
        avatarColor: r.avatar_color,
        punti: 0,
        netti: { ruota: 0, slot: 0, blackjack: 0, roulette: 0, superenalotto: 0 },
        giocate: 0,
      }
      righe.set(r.player_id, riga)
    }
    riga.netti[r.gioco] += r.netto
    riga.punti += r.netto
    riga.giocate += r.giocate
  }
  const rows = [...righe.values()]
    // Ci sta anche chi quel giorno non ha giocato e ha vinto: le schede del SuperEnalotto si pagano il giorno
    // dell'estrazione, e si possono comprare prima.
    .filter((r) => r.giocate > 0 || r.punti !== 0)
    .sort((x, y) => {
      if (x.punti !== y.punti) return y.punti - x.punti
      if (x.giocate !== y.giocate) return x.giocate - y.giocate
      return x.nickname.localeCompare(y.nickname, 'it', { sensitivity: 'base' })
    })
    .map((r, i) => ({ rank: i + 1, ...r }))
  return {
    scope: periodo.scope,
    periodo,
    updatedAt: nowIso(),
    rows,
    me: rows.find((r) => r.playerId === viewerId) ?? null,
  }
}

/**
 * I punti delle classificate di un giocatore in una giornata: quelli della
 * generale di quel giorno senza i giochi della Fortuna, ma di lui solo. Il
 * saldo della Fortuna li legge a ogni giocata, e la generale intera leggerebbe
 * le partite di tutti. Le somme sono
 * quelle di `classificaGenerale`, gioco per gioco: un test le tiene d'accordo.
 * Nomi, cose e città conta la partita di ieri, che la notte ha contato, e la
 * battaglia c'e' ancora perché la generale la conta nei giorni in cui c'era.
 */
export async function puntiClassificateDi(db: D1Database, playerId: string, numero: number): Promise<number> {
  const riga = await db
    .prepare(
      `SELECT
         (SELECT COALESCE(SUM(CASE WHEN spectated = 1 THEN COALESCE(assist_score, 0)
                                   ELSE COALESCE(score, 0) END), 0)
            FROM wordle_games WHERE player_id = ?1 AND puzzle_number = ?2)
       + (SELECT COALESCE(SUM(${PUNTI_SCARABEO}), 0) FROM scarabeo_games WHERE player_id = ?1 AND puzzle_number = ?2)
       + (SELECT COALESCE(SUM(${PUNTI_CRUCIVERBA}), 0)
            FROM cruciverba_games WHERE player_id = ?1 AND puzzle_number = ?2)
       + (SELECT COALESCE(SUM(CASE WHEN status = 'done' THEN score ELSE 0 END), 0)
            FROM sudoku_games WHERE player_id = ?1 AND puzzle_number = ?2)
       + (SELECT COALESCE(SUM(CASE WHEN stato = 'finita' THEN punti ELSE 0 END), 0)
            FROM battaglia_partite
           WHERE modalita = 'classificata' AND giocatore_a = ?1 AND puzzle_number = ?2)
       + (SELECT COALESCE(SUM(CASE WHEN status = 'done' THEN score ELSE 0 END), 0)
            FROM quiz_partite WHERE player_id = ?1 AND puzzle_number = ?2)
       + (SELECT COALESCE(SUM(CASE WHEN status = 'done' THEN score ELSE 0 END), 0)
            FROM tris_partite WHERE player_id = ?1 AND puzzle_number = ?2)
       + (SELECT COALESCE(SUM(score), 0)
            FROM nomi_partite WHERE player_id = ?1 AND puzzle_number = ?2 - 1)
       + (SELECT COALESCE(SUM(CASE WHEN status = 'done' THEN score ELSE 0 END), 0)
            FROM anagrammi_partite WHERE player_id = ?1 AND puzzle_number = ?2)
       + (SELECT COALESCE(SUM(CASE WHEN status = 'done' THEN score ELSE 0 END), 0)
            FROM sequenze_partite WHERE player_id = ?1 AND puzzle_number = ?2)
       + (SELECT COALESCE(SUM(CASE WHEN status = 'done' THEN score ELSE 0 END), 0)
            FROM ghigliottina_partite WHERE player_id = ?1 AND puzzle_number = ?2)
       + (SELECT COALESCE(SUM(CASE WHEN status = 'done' THEN score ELSE 0 END), 0)
            FROM paroliere_partite WHERE player_id = ?1 AND puzzle_number = ?2)
       + (SELECT COALESCE(SUM(CASE WHEN status = 'done' THEN score ELSE 0 END), 0)
            FROM catena_partite WHERE player_id = ?1 AND puzzle_number = ?2) AS punti`,
    )
    .bind(playerId, numero)
    .first<{ punti: number }>()
  return riga?.punti ?? 0
}

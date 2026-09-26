/**
 * Accesso ai dati dello Scarabeo: la partita di una giornata e la classifica.
 *
 * La riga di una partita salva **solo le mosse**. Tabellone, leggio e punti di
 * ogni mossa si ricalcolano rigiocandole sul sacchetto della giornata, che e'
 * deterministico dal numero del puzzle: cosi' non esiste il caso in cui la riga
 * dice una cosa e le mosse ne implicano un'altra. L'unica eccezione e' il
 * totale, che sta in colonna perché la classifica lo somma in SQL senza
 * rigiocare le partite di tutti.
 */

import { gameDate, puzzleNumberFor } from '../../shared/daily'
import {
  MOSSE_PER_GIORNATA,
  chiaveDizionario,
  leggioDa,
  rigioca,
  sacchettoDelGiorno,
  type Mossa,
} from '../../shared/scarabeo'
import type {
  CellaPiena,
  LeaderboardScope,
  ScarabeoLeaderboard,
  ScarabeoRow,
  ScarabeoState,
  ScarabeoStatus,
} from '../../shared/types'
import { LATO } from '../../shared/scarabeo'
import { fail, newId, nowIso } from './http'

export interface PartitaRow {
  id: string
  player_id: string
  puzzle_number: number
  date: string
  status: ScarabeoStatus
  mosse: string
  turns: number
  score: number
  started_at: string
  finished_at: string | null
}

export interface Giornata {
  date: string
  puzzleNumber: number
}

export function giornata(): Giornata {
  const date = gameDate()
  return { date, puzzleNumber: puzzleNumberFor(date) }
}

/** Le mosse salvate, con un ripiego se il JSON non si legge. */
export function mosseDi(row: PartitaRow): Mossa[] {
  try {
    const parsed = JSON.parse(row.mosse) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed as Mossa[]
  } catch {
    return []
  }
}

/** La partita di oggi, creata al primo accesso. */
export async function apriPartita(
  db: D1Database,
  playerId: string,
  quando: Giornata,
): Promise<PartitaRow> {
  await db
    .prepare(
      `INSERT OR IGNORE INTO scarabeo_games
         (id, player_id, puzzle_number, date, status, mosse, turns, score, started_at)
       VALUES (?, ?, ?, ?, 'playing', '[]', 0, 0, ?)`,
    )
    .bind(newId('scr'), playerId, quando.puzzleNumber, quando.date, nowIso())
    .run()

  const row = await db
    .prepare('SELECT * FROM scarabeo_games WHERE player_id = ? AND puzzle_number = ?')
    .bind(playerId, quando.puzzleNumber)
    .first<PartitaRow>()

  if (!row) throw new Error('Partita di Scarabeo non trovata subito dopo la creazione')
  return row
}

/** Lo stato completo che va al client. */
export function statoDa(row: PartitaRow, msToNextPuzzle: number): ScarabeoState {
  const mosse = mosseDi(row)
  const { tabellone, giocate, punti } = rigioca(mosse)
  const { leggio, restanti } = leggioDa(sacchettoDelGiorno(row.puzzle_number), mosse)

  const celle: CellaPiena[] = []
  tabellone.forEach((casella, i) => {
    if (casella) {
      celle.push({
        r: Math.floor(i / LATO),
        c: i % LATO,
        lettera: casella.lettera,
        jolly: casella.jolly,
      })
    }
  })

  return {
    puzzleNumber: row.puzzle_number,
    date: row.date,
    celle,
    leggio,
    restanti,
    mosse: giocate,
    mosseUsate: row.turns,
    mosseTotali: MOSSE_PER_GIORNATA,
    /*
     * Il totale e' quello rigiocato, non quello in colonna. I due coincidono,
     * ma se un domani divergessero — un cambio nelle costanti dei punti — la
     * schermata deve mostrare la somma delle mosse che elenca, altrimenti si
     * vede un totale che non torna con i suoi addendi.
     */
    punti,
    status: row.status,
    msToNextPuzzle,
  }
}

/**
 * Quali fra queste parole non stanno nel dizionario.
 *
 * Una query sola: le parole di una mossa sono al massimo otto e cadono in
 * pochi secchi (vedi `chiaveDizionario`). Il confronto e' una ricerca di
 * sottostringa sul blocco del secchio, con gli a capo come sentinelle, così
 * "casa" non risulta trovata dentro "casale".
 */
export async function paroleSconosciute(db: D1Database, parole: string[]): Promise<string[]> {
  if (parole.length === 0) return []

  const chiavi = [...new Set(parole.map(chiaveDizionario))]
  const { results } = await db
    .prepare(
      `SELECT chiave, parole FROM dizionario WHERE chiave IN (${chiavi.map(() => '?').join(',')})`,
    )
    .bind(...chiavi)
    .all<{ chiave: string; parole: string }>()

  const blocchi = new Map(results.map((r) => [r.chiave, r.parole]))
  return parole.filter((parola) => {
    const blocco = blocchi.get(chiaveDizionario(parola))
    return !blocco || !blocco.includes(`\n${parola}\n`)
  })
}

/**
 * Aggiunge una mossa alla partita.
 *
 * `WHERE turns = ?` col valore appena letto: D1 non ha transazioni
 * interattive, e due invii ravvicinati dallo stesso telefono non devono poter
 * scrivere due mosse sullo stesso numero. Se la condizione non regge, chi
 * chiama risponde 409 e il client rilegge lo stato.
 */
export async function aggiungiMossa(
  db: D1Database,
  row: PartitaRow,
  mossa: Mossa,
  puntiMossa: number,
): Promise<PartitaRow> {
  const mosse = [...mosseDi(row), mossa]
  const turns = row.turns + 1
  const punti = row.score + puntiMossa
  const finita = turns >= MOSSE_PER_GIORNATA
  const adesso = nowIso()

  const esito = await db
    .prepare(
      `UPDATE scarabeo_games
          SET mosse = ?, turns = ?, score = ?, status = ?, finished_at = ?
        WHERE id = ? AND turns = ?`,
    )
    .bind(
      JSON.stringify(mosse),
      turns,
      punti,
      finita ? 'done' : 'playing',
      finita ? adesso : null,
      row.id,
      row.turns,
    )
    .run()

  if (esito.meta.changes !== 1) {
    fail(409, 'CONFLITTO', 'La partita è cambiata nel frattempo: ricarico.')
  }

  return {
    ...row,
    mosse: JSON.stringify(mosse),
    turns,
    score: punti,
    status: finita ? 'done' : 'playing',
    finished_at: finita ? adesso : null,
  }
}

/* ────────────────────────────  La classifica  ─────────────────────────── */

/** Finestra di puzzle coperta da ogni vista, in giorni. null = tutto. */
const FINESTRA: Record<LeaderboardScope, number | null> = {
  today: 1,
  week: 7,
  month: 30,
  all: null,
}

export interface TotaliScarabeo {
  playerId: string
  nickname: string
  displayName: string
  avatarColor: string
  punti: number
  giornate: number
  migliore: number
  oggi: number | null
  inCorso: boolean
}

/**
 * Mette in fila i giocatori di Scarabeo.
 *
 * L'ordine: **punti** del periodo, poi la **giornata migliore** — fra due
 * totali uguali passa avanti chi ha fatto il colpo piu' grosso — poi **meno
 * giornate**, perché lo stesso totale in meno partite e' un gioco migliore, e
 * infine il nickname, così due righe identiche non si scambiano di posto a ogni
 * ricarica.
 *
 * Funzione pura e fuori da SQL per la stessa ragione della classifica del
 * Wordle: le righe sono poche e una catena di spareggi in SQL non si legge.
 */
export function ordinaScarabeo(giocatori: TotaliScarabeo[]): ScarabeoRow[] {
  const inFila = [...giocatori].sort((a, b) => {
    if (a.punti !== b.punti) return b.punti - a.punti
    if (a.migliore !== b.migliore) return b.migliore - a.migliore
    if (a.giornate !== b.giornate) return a.giornate - b.giornate
    return a.nickname.localeCompare(b.nickname, 'it', { sensitivity: 'base' })
  })

  return inFila.map((g, i) => ({
    rank: i + 1,
    playerId: g.playerId,
    nickname: g.nickname,
    displayName: g.displayName,
    avatarColor: g.avatarColor,
    punti: g.punti,
    giornate: g.giornate,
    migliore: g.migliore,
    oggi: g.oggi,
    inCorso: g.inCorso,
  }))
}

interface AggregatoRow {
  player_id: string
  nickname: string
  display_name: string
  avatar_color: string
  punti: number
  giornate: number
  migliore: number
  oggi: number | null
  in_corso: number
}

export async function classificaScarabeo(
  db: D1Database,
  scope: LeaderboardScope,
  numeroDiOggi: number,
  viewerId: string,
): Promise<ScarabeoLeaderboard> {
  const finestra = FINESTRA[scope]
  const da = finestra === null ? Number.MIN_SAFE_INTEGER : numeroDiOggi - finestra + 1

  /*
   * Una query sola. Le partite ancora in corso entrano col punteggio che hanno
   * già fatto, e `in_corso` lo dice: nella vista di oggi si vede anche chi sta
   * giocando, come nel Wordle.
   */
  const { results } = await db
    .prepare(
      `SELECT p.id           AS player_id,
              p.nickname     AS nickname,
              p.display_name AS display_name,
              p.avatar_color AS avatar_color,
              COALESCE(SUM(g.score), 0)                                     AS punti,
              COUNT(g.id)                                                   AS giornate,
              COALESCE(MAX(g.score), 0)                                     AS migliore,
              MAX(CASE WHEN g.puzzle_number = ? THEN g.score END)           AS oggi,
              MAX(CASE WHEN g.puzzle_number = ? AND g.status = 'playing'
                       THEN 1 ELSE 0 END)                                   AS in_corso
         FROM players p
         JOIN scarabeo_games g ON g.player_id = p.id AND g.puzzle_number >= ?
        GROUP BY p.id`,
    )
    .bind(numeroDiOggi, numeroDiOggi, da)
    .all<AggregatoRow>()

  const rows = ordinaScarabeo(
    results.map((r) => ({
      playerId: r.player_id,
      nickname: r.nickname,
      displayName: r.display_name || r.nickname,
      avatarColor: r.avatar_color,
      punti: r.punti,
      giornate: r.giornate,
      migliore: r.migliore,
      oggi: r.oggi,
      inCorso: r.in_corso === 1,
    })),
  )

  return {
    scope,
    updatedAt: nowIso(),
    rows,
    me: rows.find((r) => r.playerId === viewerId) ?? null,
  }
}

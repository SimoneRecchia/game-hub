/**
 * Accesso ai dati del Paroliere: la partita di ognuno e la classifica.
 *
 * La griglia del giorno la scrive la notte in `paroliere_giornate`, con le
 * parole comuni che ci stanno e il traguardo; la griglia esce solo quando si
 * comincia, perché guardarla prima darebbe tempo in piu', e le parole solo a
 * partita finita. I tre minuti li tiene il server: `iniziata_at` e' quando la
 * clessidra si e' girata, e una parola vale entro TEMPO_PAROLIERE_MS piu' il
 * margine della rete. Il tempo finito non si scrive da solo: lo applica la
 * prima richiesta che arriva dopo (`chiudiScaduta`).
 */

import { gameDate, puzzleNumberFor } from '../../shared/daily'
import {
  LATO_PAROLIERE,
  MARGINE_PAROLIERE_MS,
  TEMPO_PAROLIERE_MS,
  giornataValida,
  punteggioDi,
  puntiParoliere,
  type ParoliereDelGiorno,
} from '../../shared/paroliere'
import type {
  ParoliereLeaderboard,
  ParoliereRow,
  ParoliereStato,
  ParoliereStatus,
  PeriodoClassifica,
} from '../../shared/types'
import { fail, newId, nowIso } from './http'

export interface PartitaRow {
  id: string
  player_id: string
  puzzle_number: number
  date: string
  status: ParoliereStatus
  iniziata_at: string
  parole: string
  punteggio: number
  trovate: number
  score: number
  versione: number
  updated_at: string
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

/** La griglia di un giorno, o null se la notte non l'ha ancora scritta. */
export async function paroliereDelGiorno(db: D1Database, numero: number): Promise<ParoliereDelGiorno | null> {
  const riga = await db
    .prepare('SELECT griglia, comuni, traguardo FROM paroliere_giornate WHERE puzzle_number = ?')
    .bind(numero)
    .first<{ griglia: string; comuni: string; traguardo: number }>()
  if (!riga) return null
  try {
    const valore: unknown = { griglia: JSON.parse(riga.griglia), comuni: JSON.parse(riga.comuni), traguardo: riga.traguardo }
    return giornataValida(valore) ? valore : null
  } catch {
    return null
  }
}

export async function partitaDi(db: D1Database, playerId: string, numero: number): Promise<PartitaRow | null> {
  return db
    .prepare('SELECT * FROM paroliere_partite WHERE player_id = ? AND puzzle_number = ?')
    .bind(playerId, numero)
    .first<PartitaRow>()
}

/** Gira la clessidra: la partita nasce adesso, e una gia' cominciata resta com'era. */
export async function cominciaPartita(db: D1Database, playerId: string, quando: Giornata): Promise<PartitaRow> {
  const adesso = nowIso()
  await db
    .prepare(
      `INSERT OR IGNORE INTO paroliere_partite (id, player_id, puzzle_number, date, status, iniziata_at, updated_at)
       VALUES (?, ?, ?, ?, 'playing', ?, ?)`,
    )
    .bind(newId('par'), playerId, quando.puzzleNumber, quando.date, adesso, adesso)
    .run()
  const row = await partitaDi(db, playerId, quando.puzzleNumber)
  if (!row) throw new Error('Partita del Paroliere non trovata subito dopo la creazione')
  return row
}

/** Le parole trovate, nell'ordine in cui sono arrivate. */
export function paroleDi(row: Pick<PartitaRow, 'parole'>): string[] {
  let valore: unknown
  try {
    valore = JSON.parse(row.parole)
  } catch {
    return []
  }
  return Array.isArray(valore) ? valore.filter((p): p is string => typeof p === 'string') : []
}

/** Quando finisce la clessidra di una partita, in millisecondi. */
export function fineDi(row: Pick<PartitaRow, 'iniziata_at'>): number {
  return Date.parse(row.iniziata_at) + TEMPO_PAROLIERE_MS
}

/** Il tempo e' finito, margine della rete compreso. */
export function scaduta(row: Pick<PartitaRow, 'iniziata_at' | 'status'>, adesso: number): boolean {
  return row.status === 'playing' && adesso > fineDi(row) + MARGINE_PAROLIERE_MS
}

/** Lo stato che va al client: la griglia solo da quando si e' cominciato, le parole comuni solo alla fine. */
export function statoDa(
  row: PartitaRow | null,
  giorno: ParoliereDelGiorno,
  quando: Giornata,
  adesso: number,
  msToNextPuzzle: number,
): ParoliereStato {
  const trovate = row ? paroleDi(row) : []
  const finita = row?.status === 'done'
  return {
    puzzleNumber: quando.puzzleNumber,
    date: quando.date,
    status: row ? row.status : 'new',
    griglia: row ? giorno.griglia : null,
    lato: LATO_PAROLIERE,
    restanteMs: row && !finita ? Math.max(0, fineDi(row) - adesso) : null,
    tempoMs: TEMPO_PAROLIERE_MS,
    trovate,
    punteggio: row?.punteggio ?? 0,
    traguardo: giorno.traguardo,
    punti: finita ? row.score : row ? puntiParoliere(row.punteggio, giorno.traguardo) : 0,
    comuni: finita ? giorno.comuni : null,
    versione: row?.versione ?? 0,
    msToNextPuzzle,
  }
}

/**
 * Scrive la partita, condizionata alla versione letta. Due parole mandate
 * insieme si contendono la riga: chi perde rilegge e riprova (`aggiungiParola`),
 * cosi' nessuna delle due si perde.
 */
export async function salvaPartita(
  db: D1Database,
  row: PartitaRow,
  parole: string[],
  giorno: ParoliereDelGiorno,
  chiudi: boolean,
): Promise<PartitaRow | null> {
  const punteggio = punteggioDi(parole)
  const quando = nowIso()
  const score = chiudi ? puntiParoliere(punteggio, giorno.traguardo) : 0
  const testo = JSON.stringify(parole)
  const scritta = await db
    .prepare(
      `UPDATE paroliere_partite
          SET parole = ?, punteggio = ?, trovate = ?, status = ?, score = ?, versione = versione + 1,
              updated_at = ?, finished_at = COALESCE(finished_at, ?)
        WHERE id = ? AND versione = ?`,
    )
    .bind(
      testo,
      punteggio,
      parole.length,
      chiudi ? 'done' : 'playing',
      score,
      quando,
      chiudi ? quando : null,
      row.id,
      row.versione,
    )
    .run()
  if (scritta.meta.changes !== 1) return null
  return {
    ...row,
    parole: testo,
    punteggio,
    trovate: parole.length,
    status: chiudi ? 'done' : 'playing',
    score,
    versione: row.versione + 1,
    updated_at: quando,
    finished_at: row.finished_at ?? (chiudi ? quando : null),
  }
}

/** Chiude la partita: per il tempo finito, o perché chi gioca ha detto basta. */
export async function chiudiPartita(db: D1Database, row: PartitaRow, giorno: ParoliereDelGiorno): Promise<PartitaRow> {
  if (row.status === 'done') return row
  const chiusa = await salvaPartita(db, row, paroleDi(row), giorno, true)
  return chiusa ?? (await partitaDi(db, row.player_id, row.puzzle_number)) ?? row
}

/** Chiude la partita il cui tempo e' finito: le parole trovate restano, con i loro punti. */
export async function chiudiScaduta(
  db: D1Database,
  row: PartitaRow,
  giorno: ParoliereDelGiorno,
  adesso: number,
): Promise<PartitaRow> {
  return scaduta(row, adesso) ? chiudiPartita(db, row, giorno) : row
}

/**
 * Aggiunge una parola gia' controllata, rileggendo la riga se un'altra
 * scrittura e' arrivata prima. Torna la riga scritta, o null se nel frattempo
 * la parola c'era gia' o la partita si e' chiusa.
 */
export async function aggiungiParola(
  db: D1Database,
  letta: PartitaRow,
  parola: string,
  giorno: ParoliereDelGiorno,
): Promise<PartitaRow | null> {
  let row: PartitaRow | null = letta
  for (let tentativo = 0; tentativo < 4 && row; tentativo += 1) {
    const parole = paroleDi(row)
    if (row.status === 'done' || parole.includes(parola)) return null
    const scritta = await salvaPartita(db, row, [...parole, parola], giorno, false)
    if (scritta) return scritta
    row = await partitaDi(db, letta.player_id, letta.puzzle_number)
  }
  fail(409, 'CONFLITTO', 'Troppe parole insieme: riprova.')
}

/* ────────────────────────────  La classifica  ─────────────────────────── */

export interface TotaliParoliere {
  playerId: string
  nickname: string
  displayName: string
  avatarColor: string
  punti: number
  giornate: number
  punteggio: number
  trovate: number
  inCorso: boolean
}

/**
 * Mette in fila i giocatori del Paroliere: **punti** delle partite finite,
 * chi ha solo una partita aperta in fondo, poi il **punteggio della griglia**
 * — che oltre il traguardo continua a contare —, poi **piu' parole**, e il
 * nickname, perché due righe identiche non si scambino di posto.
 */
export function ordinaParoliere(giocatori: TotaliParoliere[]): ParoliereRow[] {
  return [...giocatori]
    .sort((a, b) => {
      if (a.punti !== b.punti) return b.punti - a.punti
      if (a.giornate > 0 !== b.giornate > 0) return a.giornate > 0 ? -1 : 1
      if (a.punteggio !== b.punteggio) return b.punteggio - a.punteggio
      if (a.trovate !== b.trovate) return b.trovate - a.trovate
      return a.nickname.localeCompare(b.nickname, 'it', { sensitivity: 'base' })
    })
    .map((g, i) => ({ rank: i + 1, ...g }))
}

export async function classificaParoliere(
  db: D1Database,
  periodo: PeriodoClassifica,
  numeroDiOggi: number,
  viewerId: string,
): Promise<ParoliereLeaderboard> {
  const { results } = await db
    .prepare(
      `SELECT p.id AS player_id, p.nickname, p.display_name, p.avatar_color,
              COALESCE(SUM(CASE WHEN g.status = 'done' THEN g.score END), 0)     AS punti,
              SUM(CASE WHEN g.status = 'done' THEN 1 ELSE 0 END)                AS giornate,
              COALESCE(SUM(CASE WHEN g.status = 'done' THEN g.punteggio END), 0) AS punteggio,
              COALESCE(SUM(CASE WHEN g.status = 'done' THEN g.trovate END), 0)   AS trovate,
              MAX(CASE WHEN g.puzzle_number = ? AND g.status = 'playing' THEN 1 ELSE 0 END) AS in_corso
         FROM players p
         JOIN paroliere_partite g ON g.player_id = p.id AND g.puzzle_number BETWEEN ? AND ?
        GROUP BY p.id
       HAVING giornate > 0 OR in_corso = 1`,
    )
    .bind(numeroDiOggi, periodo.da, periodo.a)
    .all<{
      player_id: string
      nickname: string
      display_name: string
      avatar_color: string
      punti: number
      giornate: number
      punteggio: number
      trovate: number
      in_corso: number
    }>()
  const rows = ordinaParoliere(
    results.map((r) => ({
      playerId: r.player_id,
      nickname: r.nickname,
      displayName: r.display_name || r.nickname,
      avatarColor: r.avatar_color,
      punti: r.punti,
      giornate: r.giornate,
      punteggio: r.punteggio,
      trovate: r.trovate,
      inCorso: r.in_corso === 1,
    })),
  )
  return {
    scope: periodo.scope,
    periodo,
    updatedAt: nowIso(),
    rows,
    me: rows.find((r) => r.playerId === viewerId) ?? null,
  }
}

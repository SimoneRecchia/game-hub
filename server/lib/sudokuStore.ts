/**
 * Accesso ai dati del sudoku: lo schema del giorno, la partita, la classifica.
 *
 * Come il cruciverba: lo schema lo scrive lo script della notte
 * (scripts/genera-sudoku.ts) e qui si legge e basta; la partita salva la
 * griglia scritta, le note e gli aiuti chiesti, che decidono i punti; la
 * soluzione non esce dal server finché la partita non e' chiusa. Il controllo
 * delle cifre sbagliate e il tempo dichiarato funzionano come quelli del
 * cruciverba, e ne usano le stesse funzioni.
 */

import { gameDate, puzzleNumberFor } from '../../shared/daily'
import { NOTE_VUOTE, VUOTA, costiSudoku, puntiSudoku, type LivelloSudoku } from '../../shared/sudoku'
import type {
  PeriodoClassifica,
  SudokuLeaderboard,
  SudokuRow,
  SudokuState,
  SudokuStatus,
} from '../../shared/types'
import { fail, newId, nowIso } from './http'

export { registraControllo, tempoDichiarato } from './cruciverbaStore'

export interface SchemaRow {
  puzzle_number: number
  livello: LivelloSudoku
  dati: string
  soluzione: string
  created_at: string
}

export interface PartitaRow {
  id: string
  player_id: string
  puzzle_number: number
  date: string
  status: SudokuStatus
  cifre: string
  note: string
  svelate: string
  segnalate: string
  errori: number
  tempo_ms: number
  score: number
  versione: number
  started_at: string
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

export async function schemaDelGiorno(db: D1Database, numero: number): Promise<SchemaRow | null> {
  return db.prepare('SELECT * FROM sudoku_schemi WHERE puzzle_number = ?').bind(numero).first<SchemaRow>()
}

/** Lo schema di oggi, o un 503 che lo dice: la risposta giusta e' "non ancora pronto". */
export async function schemaObbligatorio(db: D1Database, numero: number): Promise<SchemaRow> {
  const schema = await schemaDelGiorno(db, numero)
  if (!schema) fail(503, 'SCHEMA_ASSENTE', 'Il sudoku di oggi non è ancora pronto. Riprova più tardi.')
  return schema
}

/** La partita di oggi, creata al primo accesso con le sole cifre date. */
export async function apriPartita(
  db: D1Database,
  playerId: string,
  quando: Giornata,
  schema: SchemaRow,
): Promise<PartitaRow> {
  const adesso = nowIso()
  await db
    .prepare(
      `INSERT OR IGNORE INTO sudoku_games
         (id, player_id, puzzle_number, date, status, cifre, note, started_at, updated_at)
       VALUES (?, ?, ?, ?, 'playing', ?, ?, ?, ?)`,
    )
    .bind(newId('sud'), playerId, quando.puzzleNumber, quando.date, schema.dati, NOTE_VUOTE, adesso, adesso)
    .run()
  const row = await partitaDi(db, playerId, quando.puzzleNumber)
  if (!row) throw new Error('Partita di sudoku non trovata subito dopo la creazione')
  return row
}

export async function partitaDi(db: D1Database, playerId: string, numero: number): Promise<PartitaRow | null> {
  return db
    .prepare('SELECT * FROM sudoku_games WHERE player_id = ? AND puzzle_number = ?')
    .bind(playerId, numero)
    .first<PartitaRow>()
}

function leggiJson<T>(testo: string, ripiego: T): T {
  try {
    return JSON.parse(testo) as T
  } catch {
    return ripiego
  }
}

export function svelateDi(row: Pick<PartitaRow, 'svelate'>): number[] {
  const valore = leggiJson<unknown>(row.svelate, [])
  return Array.isArray(valore) ? valore.filter((k): k is number => Number.isInteger(k)) : []
}

/** Le cifre segnalate come sbagliate, casella per casella: tutte quelle che vi sono state segnalate. */
export function segnalateDi(row: Pick<PartitaRow, 'segnalate'>): Record<string, string> {
  const valore = leggiJson<unknown>(row.segnalate, {})
  return valore && typeof valore === 'object' && !Array.isArray(valore) ? (valore as Record<string, string>) : {}
}

/** Lo stato completo che va al client. */
export function statoDa(row: PartitaRow, schema: SchemaRow, msToNextPuzzle: number): SudokuState {
  const finita = row.status === 'done'
  const svelate = svelateDi(row)
  const segnalate = segnalateDi(row)
  return {
    partitaId: row.id,
    puzzleNumber: row.puzzle_number,
    date: row.date,
    livello: schema.livello,
    dati: schema.dati,
    cifre: row.cifre,
    note: row.note || NOTE_VUOTE,
    svelate,
    // Solo quelle che hanno ancora la cifra segnalata: una casella corretta non resta rossa.
    segnalate: Object.entries(segnalate)
      .filter(([k, cifre]) => row.cifre[Number(k)] !== VUOTA && cifre.includes(row.cifre[Number(k)]))
      .map(([k]) => Number(k))
      .sort((a, b) => a - b),
    errori: row.errori,
    tempoMs: row.tempo_ms,
    versione: row.versione,
    status: row.status,
    punti: finita ? row.score : puntiSudoku(svelate.length, row.errori, costiSudoku(schema.dati)),
    soluzione: finita ? schema.soluzione : null,
    msToNextPuzzle,
  }
}

export interface Cambi {
  cifre: string
  note: string
  svelate: number[]
  segnalate: Record<string, string>
  errori: number
  tempoMs: number
  status: SudokuStatus
  score: number
}

/**
 * Scrive la partita, condizionata alla versione letta: due dispositivi aperti
 * sulla stessa partita non si sovrascrivono un aiuto pagato. Se la versione non
 * regge risponde 409, e il client rilegge lo stato.
 */
export async function salvaPartita(db: D1Database, row: PartitaRow, cambi: Cambi): Promise<PartitaRow> {
  const adesso = nowIso()
  const finita = cambi.status === 'done'
  const esito = await db
    .prepare(
      `UPDATE sudoku_games
          SET cifre = ?, note = ?, svelate = ?, segnalate = ?, errori = ?, tempo_ms = ?,
              status = ?, score = ?, versione = versione + 1, updated_at = ?,
              finished_at = COALESCE(finished_at, ?)
        WHERE id = ? AND versione = ?`,
    )
    .bind(
      cambi.cifre,
      cambi.note,
      JSON.stringify(cambi.svelate),
      JSON.stringify(cambi.segnalate),
      cambi.errori,
      cambi.tempoMs,
      cambi.status,
      cambi.score,
      adesso,
      finita ? adesso : null,
      row.id,
      row.versione,
    )
    .run()
  if (esito.meta.changes !== 1) fail(409, 'CONFLITTO', 'Il sudoku è cambiato su un altro dispositivo: ricarico.')
  return {
    ...row,
    cifre: cambi.cifre,
    note: cambi.note,
    svelate: JSON.stringify(cambi.svelate),
    segnalate: JSON.stringify(cambi.segnalate),
    errori: cambi.errori,
    tempo_ms: cambi.tempoMs,
    status: cambi.status,
    score: cambi.score,
    versione: row.versione + 1,
    updated_at: adesso,
    finished_at: row.finished_at ?? (finita ? adesso : null),
  }
}

/* ────────────────────────────  La classifica  ─────────────────────────── */

export interface TotaliSudoku {
  playerId: string
  nickname: string
  displayName: string
  avatarColor: string
  punti: number
  giornate: number
  tempoMs: number
  inCorso: boolean
}

/**
 * Mette in fila i giocatori del sudoku, come il cruciverba: **punti** dei
 * completati, poi il **tempo** piu' corto — quasi tutti ne fanno cento, e fra
 * due sudoku perfetti passa avanti chi ci ha messo meno — chi ha solo una
 * partita aperta in fondo, e il nickname perché due righe identiche non si
 * scambino di posto.
 */
export function ordinaSudoku(giocatori: TotaliSudoku[]): SudokuRow[] {
  return [...giocatori]
    .sort((a, b) => {
      if (a.punti !== b.punti) return b.punti - a.punti
      if (a.giornate > 0 !== b.giornate > 0) return a.giornate > 0 ? -1 : 1
      if (a.tempoMs !== b.tempoMs) return a.tempoMs - b.tempoMs
      return a.nickname.localeCompare(b.nickname, 'it', { sensitivity: 'base' })
    })
    .map((g, i) => ({ rank: i + 1, ...g }))
}

export async function classificaSudoku(
  db: D1Database,
  periodo: PeriodoClassifica,
  numeroDiOggi: number,
  viewerId: string,
): Promise<SudokuLeaderboard> {
  const { results } = await db
    .prepare(
      `SELECT p.id AS player_id, p.nickname, p.display_name, p.avatar_color,
              COALESCE(SUM(CASE WHEN g.status = 'done' THEN g.score END), 0)    AS punti,
              SUM(CASE WHEN g.status = 'done' THEN 1 ELSE 0 END)               AS giornate,
              COALESCE(SUM(CASE WHEN g.status = 'done' THEN g.tempo_ms END), 0) AS tempo,
              MAX(CASE WHEN g.puzzle_number = ? AND g.status = 'playing' THEN 1 ELSE 0 END) AS in_corso
         FROM players p
         JOIN sudoku_games g ON g.player_id = p.id AND g.puzzle_number BETWEEN ? AND ?
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
      tempo: number
      in_corso: number
    }>()
  const rows = ordinaSudoku(
    results.map((r) => ({
      playerId: r.player_id,
      nickname: r.nickname,
      displayName: r.display_name || r.nickname,
      avatarColor: r.avatar_color,
      punti: r.punti,
      giornate: r.giornate,
      tempoMs: r.tempo,
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

/**
 * Accesso ai dati delle Sequenze: la giornata di ognuno e la classifica.
 *
 * Le sequenze del giorno si pescano a caso la prima volta che qualcuno ne
 * apre una, e da li' sono le stesse per tutti (`sequenzeDelGiorno`). Escono
 * una alla volta: la prima di un turno quando lo si comincia, le altre nella
 * risposta alla precedente, se era giusta. Lo stato non le porta mai, perché
 * una sequenza si vede una volta: una pagina riaperta con una sequenza aperta
 * la trova chiusa, come sbagliata (`chiudiAperta`), invece di rivederla.
 */

import { gameDate, puzzleNumberFor } from '../../shared/daily'
import {
  SEQUENZE_PER_TURNO,
  TURNI_SEQUENZE,
  giornataACaso,
  giornataDaTesto,
  giornataInTesto,
  lunghezzaRaggiunta,
  puntiSequenze,
} from '../../shared/sequenze'
import type {
  PeriodoClassifica,
  SequenzeLeaderboard,
  SequenzeRow,
  SequenzeStato,
  SequenzeStatus,
  TurnoSequenze,
} from '../../shared/types'
import { fail, newId, nowIso } from './http'

export interface PartitaRow {
  id: string
  player_id: string
  puzzle_number: number
  date: string
  status: SequenzeStatus
  turni: string
  aperta_at: string | null
  giuste: number
  migliore: number
  tempo_ms: number
  score: number
  versione: number
  started_at: string
  updated_at: string
  finished_at: string | null
}

/** Un turno come sta nel database: le giuste, il tempo per ripeterle, se e' chiuso, e se lo ha chiuso una riapertura. */
export interface TurnoSalvato {
  g: number
  ms: number
  c: 0 | 1
  r?: 1
}

export interface Giornata {
  date: string
  puzzleNumber: number
}

export function giornata(): Giornata {
  const date = gameDate()
  return { date, puzzleNumber: puzzleNumberFor(date) }
}

/** Un numero a caso fra zero e uno, dal generatore del sistema: le sequenze non si indovinano. */
function aCaso(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32
}

async function leggiGiornata(db: D1Database, numero: number): Promise<number[][][] | null> {
  const riga = await db
    .prepare('SELECT sequenze FROM sequenze_giornate WHERE puzzle_number = ?')
    .bind(numero)
    .first<{ sequenze: string }>()
  return riga ? giornataDaTesto(riga.sequenze) : null
}

/**
 * Le sequenze di una giornata: le pesca chi ne apre una per primo, e gli altri
 * leggono quelle. `caso` e' per i test.
 */
export async function sequenzeDelGiorno(
  db: D1Database,
  numero: number,
  caso: () => number = aCaso,
): Promise<number[][][]> {
  const lette = await leggiGiornata(db, numero)
  if (lette) return lette
  await db
    .prepare('INSERT OR IGNORE INTO sequenze_giornate (puzzle_number, sequenze, created_at) VALUES (?, ?, ?)')
    .bind(numero, giornataInTesto(giornataACaso(caso)), nowIso())
    .run()
  const scritte = await leggiGiornata(db, numero)
  if (!scritte) throw new Error(`Sequenze del giorno ${numero} illeggibili`)
  return scritte
}

export async function partitaDi(db: D1Database, playerId: string, numero: number): Promise<PartitaRow | null> {
  return db
    .prepare('SELECT * FROM sequenze_partite WHERE player_id = ? AND puzzle_number = ?')
    .bind(playerId, numero)
    .first<PartitaRow>()
}

/** La giornata di oggi, creata vuota se non c'e': nessun turno comincia finché non lo si chiede. */
export async function apriPartita(db: D1Database, playerId: string, quando: Giornata): Promise<PartitaRow> {
  const adesso = nowIso()
  await db
    .prepare(
      `INSERT OR IGNORE INTO sequenze_partite (id, player_id, puzzle_number, date, status, started_at, updated_at)
       VALUES (?, ?, ?, ?, 'playing', ?, ?)`,
    )
    .bind(newId('seq'), playerId, quando.puzzleNumber, quando.date, adesso, adesso)
    .run()
  const row = await partitaDi(db, playerId, quando.puzzleNumber)
  if (!row) throw new Error('Partita di Sequenze non trovata subito dopo la creazione')
  return row
}

export function turniDi(row: Pick<PartitaRow, 'turni'>): TurnoSalvato[] {
  let valore: unknown
  try {
    valore = JSON.parse(row.turni)
  } catch {
    return []
  }
  if (!Array.isArray(valore)) return []
  return valore.slice(0, TURNI_SEQUENZE).flatMap((t): TurnoSalvato[] => {
    if (!t || typeof t !== 'object' || !Number.isInteger(t.g)) return []
    return [
      {
        g: Math.max(0, Math.min(SEQUENZE_PER_TURNO, t.g)),
        ms: Number.isFinite(t.ms) ? Math.max(0, t.ms) : 0,
        c: t.c === 1 ? 1 : 0,
        ...(t.r === 1 ? { r: 1 as const } : {}),
      },
    ]
  })
}

/** Il turno in corso: l'ultimo, se non e' chiuso. */
export function inCorso(turni: readonly TurnoSalvato[]): number | null {
  const ultimo = turni[turni.length - 1]
  return ultimo && ultimo.c === 0 ? turni.length - 1 : null
}

/** La sequenza aperta di un turno in corso: quella dopo le giuste. */
export function sequenzaAperta(giorno: readonly (readonly number[][])[], turni: readonly TurnoSalvato[]) {
  const t = inCorso(turni)
  if (t === null) return null
  return { turno: t, sequenza: giorno[t][turni[t].g] }
}

const chiusi = (turni: readonly TurnoSalvato[]) => turni.filter((t) => t.c === 1)

/** I punti fatti finora: quelli dei turni chiusi, senza i quindici della giornata finita. */
function puntiFinora(turni: readonly TurnoSalvato[]): number {
  return turni.reduce((s, t) => s + t.g, 0)
}

export function statoDa(row: PartitaRow, msToNextPuzzle: number): SequenzeStato {
  const turni = turniDi(row)
  return {
    puzzleNumber: row.puzzle_number,
    date: row.date,
    status: row.status,
    turni: turni.map(
      (t): TurnoSequenze => ({ giuste: t.g, raggiunta: lunghezzaRaggiunta(t.g), chiuso: t.c === 1, riaperto: t.r === 1 }),
    ),
    totaleTurni: TURNI_SEQUENZE,
    corrente: row.status === 'playing' && row.aperta_at ? inCorso(turni) : null,
    punti: row.status === 'done' ? row.score : puntiFinora(turni),
    versione: row.versione,
    msToNextPuzzle,
  }
}

/** Lo stato di chi non ha ancora cominciato. */
export function statoVuoto(quando: Giornata, msToNextPuzzle: number): SequenzeStato {
  return {
    puzzleNumber: quando.puzzleNumber,
    date: quando.date,
    status: 'playing',
    turni: [],
    totaleTurni: TURNI_SEQUENZE,
    corrente: null,
    punti: 0,
    versione: 0,
    msToNextPuzzle,
  }
}

/**
 * Scrive i turni, condizionata alla versione letta: un doppio tocco non apre
 * due turni e non conta due volte la stessa risposta. La fine della giornata,
 * i punti, le giuste, la lunghezza migliore e il tempo si ricavano da soli.
 * `aperta` e' quando e' uscita la sequenza aperta, o null se non ce n'e' una.
 */
export async function salvaPartita(
  db: D1Database,
  row: PartitaRow,
  turni: TurnoSalvato[],
  aperta: number | null,
  adesso: number,
): Promise<PartitaRow> {
  const fatta = turni.length === TURNI_SEQUENZE && chiusi(turni).length === TURNI_SEQUENZE
  const status: SequenzeStatus = fatta ? 'done' : 'playing'
  const score = fatta ? puntiSequenze(turni.map((t) => t.g)) : 0
  const giuste = turni.reduce((s, t) => s + t.g, 0)
  const migliore = turni.length ? Math.max(...turni.map((t) => lunghezzaRaggiunta(t.g))) : 0
  const tempo = turni.reduce((s, t) => s + t.ms, 0)
  const quando = new Date(adesso).toISOString()
  const apertaAt = !fatta && aperta !== null ? new Date(aperta).toISOString() : null
  const testo = JSON.stringify(turni)
  const scritta = await db
    .prepare(
      `UPDATE sequenze_partite
          SET turni = ?, aperta_at = ?, giuste = ?, migliore = ?, tempo_ms = ?, status = ?, score = ?,
              versione = versione + 1, updated_at = ?, finished_at = COALESCE(finished_at, ?)
        WHERE id = ? AND versione = ?`,
    )
    .bind(testo, apertaAt, giuste, migliore, tempo, status, score, quando, fatta ? quando : null, row.id, row.versione)
    .run()
  if (scritta.meta.changes !== 1) fail(409, 'CONFLITTO', 'La partita è cambiata su un altro dispositivo: ricarico.')
  return {
    ...row,
    turni: testo,
    aperta_at: apertaAt,
    giuste,
    migliore,
    tempo_ms: tempo,
    status,
    score,
    versione: row.versione + 1,
    updated_at: quando,
    finished_at: row.finished_at ?? (fatta ? quando : null),
  }
}

/**
 * Chiude il turno con una sequenza aperta, come se fosse sbagliata: la pagina
 * si e' riaperta (o si e' aperta su un altro telefono) dopo che la sequenza e'
 * uscita, e rivederla sarebbe un aiuto. Una richiesta che arriva insieme a
 * un'altra la puo' trovare gia' chiusa: la scrittura e' condizionata, e chi
 * perde rilegge.
 */
export async function chiudiAperta(db: D1Database, row: PartitaRow, adesso: number): Promise<PartitaRow> {
  if (row.status !== 'playing' || row.aperta_at === null) return row
  const turni = turniDi(row)
  const t = inCorso(turni)
  if (t === null) return row
  const chiusi = turni.map((x, i) => (i === t ? { ...x, c: 1 as const, r: 1 as const } : x))
  try {
    return await salvaPartita(db, row, chiusi, null, adesso)
  } catch {
    return (await partitaDi(db, row.player_id, row.puzzle_number)) ?? row
  }
}

/* ────────────────────────────  La classifica  ─────────────────────────── */

export interface TotaliSequenze {
  playerId: string
  nickname: string
  displayName: string
  avatarColor: string
  punti: number
  giornate: number
  migliore: number
  tempoMs: number
  inCorso: boolean
}

/**
 * Mette in fila i giocatori delle Sequenze: **punti** delle giornate finite,
 * chi ha solo una giornata aperta in fondo, poi **la sequenza piu' lunga**,
 * poi **meno tempo** per ripetere le giuste, e il nickname, perché due righe
 * identiche non si scambino di posto.
 */
export function ordinaSequenze(giocatori: TotaliSequenze[]): SequenzeRow[] {
  return [...giocatori]
    .sort((a, b) => {
      if (a.punti !== b.punti) return b.punti - a.punti
      if (a.giornate > 0 !== b.giornate > 0) return a.giornate > 0 ? -1 : 1
      if (a.migliore !== b.migliore) return b.migliore - a.migliore
      if (a.tempoMs !== b.tempoMs) return a.tempoMs - b.tempoMs
      return a.nickname.localeCompare(b.nickname, 'it', { sensitivity: 'base' })
    })
    .map((g, i) => ({ rank: i + 1, ...g }))
}

export async function classificaSequenze(
  db: D1Database,
  periodo: PeriodoClassifica,
  numeroDiOggi: number,
  viewerId: string,
): Promise<SequenzeLeaderboard> {
  const { results } = await db
    .prepare(
      `SELECT p.id AS player_id, p.nickname, p.display_name, p.avatar_color,
              COALESCE(SUM(CASE WHEN g.status = 'done' THEN g.score END), 0)    AS punti,
              SUM(CASE WHEN g.status = 'done' THEN 1 ELSE 0 END)               AS giornate,
              COALESCE(MAX(CASE WHEN g.status = 'done' THEN g.migliore END), 0) AS migliore,
              COALESCE(SUM(CASE WHEN g.status = 'done' THEN g.tempo_ms END), 0) AS tempo_ms,
              MAX(CASE WHEN g.puzzle_number = ? AND g.status = 'playing' THEN 1 ELSE 0 END) AS in_corso
         FROM players p
         JOIN sequenze_partite g ON g.player_id = p.id AND g.puzzle_number BETWEEN ? AND ?
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
      migliore: number
      tempo_ms: number
      in_corso: number
    }>()
  const rows = ordinaSequenze(
    results.map((r) => ({
      playerId: r.player_id,
      nickname: r.nickname,
      displayName: r.display_name || r.nickname,
      avatarColor: r.avatar_color,
      punti: r.punti,
      giornate: r.giornate,
      migliore: r.migliore,
      tempoMs: r.tempo_ms,
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

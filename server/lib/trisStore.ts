/**
 * Accesso ai dati del tris: la serie del giorno contro il computer, e la
 * classifica.
 *
 * La serie e' di cinque partite contro il computer del giorno
 * (shared/tris-computer.ts), lo stesso per tutti: le sue risposte sono una
 * funzione della posizione, quindi la verita' sono le mosse, e da quelle si
 * rigioca tutto (sono al piu' nove per partita). Ogni mossa ha il suo tempo:
 * `mossa_at` e' quando e' partito quello della mossa da fare, e una mossa che
 * arriva dopo — o nessuna mossa — perde la partita. Il tempo scaduto non si
 * scrive da solo: lo applica la prima richiesta che arriva dopo
 * (`chiudiScaduta`), come le domande del quiz.
 */

import { gameDate, puzzleNumberFor } from '../../shared/daily'
import {
  MARGINE_MOSSA_TRIS_MS,
  PARTITE_TRIS,
  TEMPO_MOSSA_TRIS_MS,
  cominciaIlGiocatore,
  esito,
  gioca,
  posizioneIniziale,
  puntiTris,
  rigioca,
  segnoDelGiocatore,
} from '../../shared/tris'
import { computerDellaPartita, mossaDelGiorno } from '../../shared/tris-computer'
import type {
  EsitoPartitaTris,
  PartitaTris,
  PeriodoClassifica,
  TrisLeaderboard,
  TrisRow,
  TrisStato,
  TrisStatus,
} from '../../shared/types'
import { fail, newId, nowIso } from './http'

export interface SerieRow {
  id: string
  player_id: string
  puzzle_number: number
  date: string
  status: TrisStatus
  partite: string
  mossa_at: string | null
  vinte: number
  patte: number
  score: number
  versione: number
  started_at: string
  updated_at: string
  finished_at: string | null
}

/** Una partita come sta nel database: le mosse, l'esito per chi gioca, e se e' scaduto il tempo. */
export interface PartitaSalvata {
  m: number[]
  e: EsitoPartitaTris | null
  t?: 1
}

export interface Giornata {
  date: string
  puzzleNumber: number
}

export function giornata(): Giornata {
  const date = gameDate()
  return { date, puzzleNumber: puzzleNumberFor(date) }
}

export async function serieDi(db: D1Database, playerId: string, numero: number): Promise<SerieRow | null> {
  return db
    .prepare('SELECT * FROM tris_partite WHERE player_id = ? AND puzzle_number = ?')
    .bind(playerId, numero)
    .first<SerieRow>()
}

/** La serie di oggi, creata vuota se non c'e': nessuna partita comincia finché non la si chiede. */
export async function apriSerie(db: D1Database, playerId: string, quando: Giornata): Promise<SerieRow> {
  const adesso = nowIso()
  await db
    .prepare(
      `INSERT OR IGNORE INTO tris_partite (id, player_id, puzzle_number, date, status, started_at, updated_at)
       VALUES (?, ?, ?, ?, 'playing', ?, ?)`,
    )
    .bind(newId('tri'), playerId, quando.puzzleNumber, quando.date, adesso, adesso)
    .run()
  const row = await serieDi(db, playerId, quando.puzzleNumber)
  if (!row) throw new Error('Serie di tris non trovata subito dopo la creazione')
  return row
}

const ESITI: readonly EsitoPartitaTris[] = ['vinta', 'patta', 'persa']

export function partiteDi(row: Pick<SerieRow, 'partite'>): PartitaSalvata[] {
  let valore: unknown
  try {
    valore = JSON.parse(row.partite)
  } catch {
    return []
  }
  if (!Array.isArray(valore)) return []
  return valore.flatMap((p): PartitaSalvata[] => {
    if (!p || typeof p !== 'object' || !Array.isArray(p.m)) return []
    const m = (p.m as unknown[]).filter((k): k is number => Number.isInteger(k))
    const e = ESITI.includes(p.e) ? (p.e as EsitoPartitaTris) : null
    return [{ m, e, ...(p.t === 1 ? { t: 1 as const } : {}) }]
  })
}

/** La partita in corso: l'ultima, se non e' finita. */
export function inCorso(partite: readonly PartitaSalvata[]): PartitaSalvata | null {
  const ultima = partite[partite.length - 1]
  return ultima && ultima.e === null ? ultima : null
}

/** Il tempo della mossa e' scaduto, margine della rete compreso: la partita in corso e' persa. */
export function scaduta(row: Pick<SerieRow, 'mossa_at' | 'status'>, adesso: number): boolean {
  return (
    row.status === 'playing' &&
    row.mossa_at !== null &&
    adesso > Date.parse(row.mossa_at) + TEMPO_MOSSA_TRIS_MS + MARGINE_MOSSA_TRIS_MS
  )
}

/** Com'e' finita per chi gioca la partita `k`, dalla posizione finale; null se si gioca ancora. */
export function esitoPerChiGioca(mosse: readonly number[], k: number): EsitoPartitaTris | null {
  const p = rigioca(mosse)
  const fine = p ? esito(p) : null
  if (!fine) return null
  if (fine.vincitore === null) return 'patta'
  return fine.vincitore === segnoDelGiocatore(k) ? 'vinta' : 'persa'
}

/** La prima mossa di una partita nuova: quella del computer, se comincia lui. */
export function mosseIniziali(numero: number, k: number): number[] {
  if (cominciaIlGiocatore(k)) return []
  return [mossaDelGiorno(posizioneIniziale(), computerDellaPartita(numero, k))]
}

/**
 * La mossa di chi gioca nella partita in corso, e la risposta del computer se
 * la partita non e' finita. null se la mossa non vale: casella presa o fuori,
 * o non e' il suo turno.
 */
export function conLaMossa(numero: number, k: number, mosse: readonly number[], casella: number): number[] | null {
  const p = rigioca(mosse)
  if (!p || esito(p) || p.tratto !== segnoDelGiocatore(k)) return null
  const dopo = gioca(p, casella)
  if (!dopo) return null
  if (esito(dopo)) return [...mosse, casella]
  return [...mosse, casella, mossaDelGiorno(dopo, computerDellaPartita(numero, k))]
}

function contiDi(partite: readonly PartitaSalvata[]): { vinte: number; patte: number; finite: number } {
  let vinte = 0
  let patte = 0
  let finite = 0
  for (const p of partite) {
    if (p.e === null) continue
    finite += 1
    if (p.e === 'vinta') vinte += 1
    else if (p.e === 'patta') patte += 1
  }
  return { vinte, patte, finite }
}

/** Lo stato completo che va al client. */
export function statoDa(row: SerieRow, adesso: number, msToNextPuzzle: number): TrisStato {
  const partite = partiteDi(row)
  const { vinte, patte } = contiDi(partite)
  const aperta = row.status === 'playing' && inCorso(partite) !== null && row.mossa_at !== null
  return {
    puzzleNumber: row.puzzle_number,
    date: row.date,
    status: row.status,
    partite: partite.map(
      (p, k): PartitaTris => ({ mosse: p.m, segno: segnoDelGiocatore(k), esito: p.e, tempo: p.t === 1 }),
    ),
    totale: PARTITE_TRIS,
    restanteMs: aperta ? Math.max(0, Date.parse(row.mossa_at!) + TEMPO_MOSSA_TRIS_MS - adesso) : null,
    tempoMossaMs: TEMPO_MOSSA_TRIS_MS,
    punti: row.status === 'done' ? row.score : puntiTris(vinte, patte),
    versione: row.versione,
    msToNextPuzzle,
  }
}

/** Lo stato di chi non ha ancora cominciato: nessuna riga, nessuna partita. */
export function statoVuoto(quando: Giornata, msToNextPuzzle: number): TrisStato {
  return {
    puzzleNumber: quando.puzzleNumber,
    date: quando.date,
    status: 'playing',
    partite: [],
    totale: PARTITE_TRIS,
    restanteMs: null,
    tempoMossaMs: TEMPO_MOSSA_TRIS_MS,
    punti: puntiTris(0, 0),
    versione: 0,
    msToNextPuzzle,
  }
}

/**
 * Scrive le partite, condizionata alla versione letta: un doppio tocco non
 * gioca due mosse, e due telefoni aperti sulla stessa serie non si
 * sovrascrivono. Si ricavano da sole la fine della serie, i punti e il tempo:
 * l'orologio riparte se c'e' una partita in corso, si ferma fra una partita e
 * l'altra.
 */
export async function salvaSerie(
  db: D1Database,
  row: SerieRow,
  partite: PartitaSalvata[],
  adesso: number,
): Promise<SerieRow> {
  const { vinte, patte, finite } = contiDi(partite)
  const fatta = finite === PARTITE_TRIS
  const status: TrisStatus = fatta ? 'done' : 'playing'
  const score = fatta ? puntiTris(vinte, patte) : 0
  const quando = new Date(adesso).toISOString()
  const mossaAt = !fatta && inCorso(partite) ? quando : null
  const testo = JSON.stringify(partite)
  const scritta = await db
    .prepare(
      `UPDATE tris_partite
          SET partite = ?, mossa_at = ?, vinte = ?, patte = ?, status = ?, score = ?,
              versione = versione + 1, updated_at = ?, finished_at = COALESCE(finished_at, ?)
        WHERE id = ? AND versione = ?`,
    )
    .bind(testo, mossaAt, vinte, patte, status, score, quando, fatta ? quando : null, row.id, row.versione)
    .run()
  if (scritta.meta.changes !== 1) fail(409, 'CONFLITTO', 'La partita è cambiata su un altro dispositivo: ricarico.')
  return {
    ...row,
    partite: testo,
    mossa_at: mossaAt,
    vinte,
    patte,
    status,
    score,
    versione: row.versione + 1,
    updated_at: quando,
    finished_at: row.finished_at ?? (fatta ? quando : null),
  }
}

/**
 * Chiude come persa la partita in corso se il tempo della mossa e' scaduto.
 * Una richiesta che arriva insieme a un'altra puo' trovarla gia' chiusa: la
 * scrittura e' condizionata, e chi perde rilegge.
 */
export async function chiudiScaduta(db: D1Database, row: SerieRow, adesso: number): Promise<SerieRow> {
  if (!scaduta(row, adesso)) return row
  const partite = partiteDi(row)
  const corrente = inCorso(partite)
  if (!corrente) return row
  const chiuse = partite.map((p) => (p === corrente ? { m: p.m, e: 'persa' as const, t: 1 as const } : p))
  try {
    return await salvaSerie(db, row, chiuse, adesso)
  } catch {
    return (await serieDi(db, row.player_id, row.puzzle_number)) ?? row
  }
}

/* ────────────────────────────  La classifica  ─────────────────────────── */

export interface TotaliTris {
  playerId: string
  nickname: string
  displayName: string
  avatarColor: string
  punti: number
  giornate: number
  vinte: number
  patte: number
  inCorso: boolean
}

/**
 * Mette in fila i giocatori del tris: **punti** delle serie finite, chi ha
 * solo una serie aperta in fondo, poi **piu' vittorie** — a pari punti chi ha
 * vinto di piu' ha rischiato di piu' — e il nickname, perché due righe
 * identiche non si scambino di posto.
 */
export function ordinaTris(giocatori: TotaliTris[]): TrisRow[] {
  return [...giocatori]
    .sort((a, b) => {
      if (a.punti !== b.punti) return b.punti - a.punti
      if (a.giornate > 0 !== b.giornate > 0) return a.giornate > 0 ? -1 : 1
      if (a.vinte !== b.vinte) return b.vinte - a.vinte
      return a.nickname.localeCompare(b.nickname, 'it', { sensitivity: 'base' })
    })
    .map((g, i) => ({ rank: i + 1, ...g }))
}

export async function classificaTris(
  db: D1Database,
  periodo: PeriodoClassifica,
  numeroDiOggi: number,
  viewerId: string,
): Promise<TrisLeaderboard> {
  const { results } = await db
    .prepare(
      `SELECT p.id AS player_id, p.nickname, p.display_name, p.avatar_color,
              COALESCE(SUM(CASE WHEN g.status = 'done' THEN g.score END), 0) AS punti,
              SUM(CASE WHEN g.status = 'done' THEN 1 ELSE 0 END)            AS giornate,
              COALESCE(SUM(CASE WHEN g.status = 'done' THEN g.vinte END), 0) AS vinte,
              COALESCE(SUM(CASE WHEN g.status = 'done' THEN g.patte END), 0) AS patte,
              MAX(CASE WHEN g.puzzle_number = ? AND g.status = 'playing' THEN 1 ELSE 0 END) AS in_corso
         FROM players p
         JOIN tris_partite g ON g.player_id = p.id AND g.puzzle_number BETWEEN ? AND ?
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
      vinte: number
      patte: number
      in_corso: number
    }>()
  const rows = ordinaTris(
    results.map((r) => ({
      playerId: r.player_id,
      nickname: r.nickname,
      displayName: r.display_name || r.nickname,
      avatarColor: r.avatar_color,
      punti: r.punti,
      giornate: r.giornate,
      vinte: r.vinte,
      patte: r.patte,
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

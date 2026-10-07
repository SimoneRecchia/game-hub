/**
 * Accesso ai dati degli Anagrammi: la giornata di ognuno e la classifica.
 *
 * Le parole del giorno le scrive la notte in `anagrammi_giornate`, con le
 * lettere mescolate e le risposte che si accettano; da qui escono una parola
 * alla volta, quando la si apre, e senza le risposte. Il tempo lo tiene il
 * server: `aperta_at` e' quando e' partito quello della parola aperta, e una
 * risposta vale entro TEMPO_PAROLA_MS piu' il margine della rete. Il tempo
 * scaduto non si scrive da solo: lo applica la prima richiesta che arriva
 * dopo (`chiudiScaduta`), come nel quiz e nel tris.
 */

import { gameDate, puzzleNumberFor } from '../../shared/daily'
import {
  MARGINE_ANAGRAMMI_MS,
  PAROLE_ANAGRAMMI,
  PUNTI_FINITA_ANAGRAMMI,
  TEMPO_PAROLA_MS,
  normalizzaAnagramma,
  puntiAnagrammi,
  puntiParola,
  type ParolaDelGiorno,
} from '../../shared/anagrammi'
import type {
  AnagrammiLeaderboard,
  AnagrammiRow,
  AnagrammiStato,
  AnagrammiStatus,
  EsitoAnagramma,
  ParolaAnagrammi,
  PeriodoClassifica,
} from '../../shared/types'
import { fail, newId, nowIso } from './http'

export interface PartitaRow {
  id: string
  player_id: string
  puzzle_number: number
  date: string
  status: AnagrammiStatus
  parole: string
  aperta_at: string | null
  trovate: number
  tempo_ms: number
  score: number
  versione: number
  started_at: string
  updated_at: string
  finished_at: string | null
}

/** Una parola giocata come sta nel database: aperta e chiusa (in ms), com'e' finita, l'aiuto, la risposta. */
export interface ParolaSalvata {
  a: number
  f: number | null
  e: EsitoAnagramma | null
  h?: 1
  r?: string
}

export interface Giornata {
  date: string
  puzzleNumber: number
}

export function giornata(): Giornata {
  const date = gameDate()
  return { date, puzzleNumber: puzzleNumberFor(date) }
}

/** Le parole di una giornata, o null se la notte non le ha ancora scritte. */
export async function paroleDelGiorno(db: D1Database, numero: number): Promise<ParolaDelGiorno[] | null> {
  const riga = await db
    .prepare('SELECT parole FROM anagrammi_giornate WHERE puzzle_number = ?')
    .bind(numero)
    .first<{ parole: string }>()
  if (!riga) return null
  try {
    const parole = JSON.parse(riga.parole) as ParolaDelGiorno[]
    return Array.isArray(parole) && parole.length === PAROLE_ANAGRAMMI ? parole : null
  } catch {
    return null
  }
}

export async function partitaDi(db: D1Database, playerId: string, numero: number): Promise<PartitaRow | null> {
  return db
    .prepare('SELECT * FROM anagrammi_partite WHERE player_id = ? AND puzzle_number = ?')
    .bind(playerId, numero)
    .first<PartitaRow>()
}

/** La giornata di oggi, creata vuota se non c'e': nessuna parola si apre finché non la si chiede. */
export async function apriPartita(db: D1Database, playerId: string, quando: Giornata): Promise<PartitaRow> {
  const adesso = nowIso()
  await db
    .prepare(
      `INSERT OR IGNORE INTO anagrammi_partite (id, player_id, puzzle_number, date, status, started_at, updated_at)
       VALUES (?, ?, ?, ?, 'playing', ?, ?)`,
    )
    .bind(newId('ana'), playerId, quando.puzzleNumber, quando.date, adesso, adesso)
    .run()
  const row = await partitaDi(db, playerId, quando.puzzleNumber)
  if (!row) throw new Error('Partita di Anagrammi non trovata subito dopo la creazione')
  return row
}

const ESITI: readonly EsitoAnagramma[] = ['trovata', 'persa', 'passata']

export function paroleDi(row: Pick<PartitaRow, 'parole'>): ParolaSalvata[] {
  let valore: unknown
  try {
    valore = JSON.parse(row.parole)
  } catch {
    return []
  }
  if (!Array.isArray(valore)) return []
  return valore.flatMap((p): ParolaSalvata[] => {
    if (!p || typeof p !== 'object' || !Number.isFinite(p.a)) return []
    return [
      {
        a: p.a,
        f: Number.isFinite(p.f) ? p.f : null,
        e: ESITI.includes(p.e) ? (p.e as EsitoAnagramma) : null,
        ...(p.h === 1 ? { h: 1 as const } : {}),
        ...(typeof p.r === 'string' ? { r: p.r } : {}),
      },
    ]
  })
}

/** La parola aperta: l'ultima, se non e' chiusa. */
export function inCorso(parole: readonly ParolaSalvata[]): ParolaSalvata | null {
  const ultima = parole[parole.length - 1]
  return ultima && ultima.e === null ? ultima : null
}

/** Il tempo della parola aperta e' scaduto, margine della rete compreso. */
export function scaduta(row: Pick<PartitaRow, 'aperta_at' | 'status'>, adesso: number): boolean {
  return (
    row.status === 'playing' &&
    row.aperta_at !== null &&
    adesso > Date.parse(row.aperta_at) + TEMPO_PAROLA_MS + MARGINE_ANAGRAMMI_MS
  )
}

/** In quanto si e' trovata una parola: il tempo fra l'apertura e la risposta, non oltre il tempo della parola. */
function msDi(p: ParolaSalvata): number {
  return Math.min(TEMPO_PAROLA_MS, Math.max(0, (p.f ?? p.a) - p.a))
}

/** Le parole chiuse, per i conti dei punti. */
function giocate(parole: readonly ParolaSalvata[], giorno: readonly ParolaDelGiorno[]) {
  return parole.flatMap((p, i) =>
    p.e === null
      ? []
      : [{ lettere: giorno[i].parola.length, trovata: p.e === 'trovata', ms: msDi(p), aiuto: p.h === 1 }],
  )
}

/** Lo stato che va al client: di ogni parola, le lettere solo se aperta, la parola solo se chiusa. */
export function statoDa(
  row: PartitaRow,
  giorno: readonly ParolaDelGiorno[],
  adesso: number,
  msToNextPuzzle: number,
): AnagrammiStato {
  const parole = paroleDi(row)
  const corrente = row.status === 'playing' && inCorso(parole) ? parole.length - 1 : null
  const conti = giocate(parole, giorno)
  return {
    puzzleNumber: row.puzzle_number,
    date: row.date,
    status: row.status,
    parole: giorno.map((g, i): ParolaAnagrammi => {
      const p = parole[i]
      const chiusa = p !== undefined && p.e !== null
      const trovata = p?.e === 'trovata'
      return {
        lunghezza: g.parola.length,
        lettere: p ? g.lettere : null,
        esito: p?.e ?? null,
        ms: trovata ? msDi(p) : null,
        punti: trovata ? puntiParola(g.parola.length, msDi(p), p.h === 1) : 0,
        aiuto: p?.h === 1,
        definizione: p && (chiusa || p.h === 1) ? g.definizione : null,
        parola: chiusa ? g.parola : null,
        risposta: trovata && p.r && p.r !== g.parola ? p.r : null,
      }
    }),
    corrente,
    restanteMs:
      corrente !== null && row.aperta_at ? Math.max(0, Date.parse(row.aperta_at) + TEMPO_PAROLA_MS - adesso) : null,
    tempoParolaMs: TEMPO_PAROLA_MS,
    punti: row.status === 'done' ? row.score : puntiAnagrammi(conti) - PUNTI_FINITA_ANAGRAMMI,
    versione: row.versione,
    msToNextPuzzle,
  }
}

/** Lo stato di chi non ha ancora cominciato: si sa solo quante lettere ha ogni parola. */
export function statoVuoto(
  quando: Giornata,
  giorno: readonly ParolaDelGiorno[],
  msToNextPuzzle: number,
): AnagrammiStato {
  return {
    puzzleNumber: quando.puzzleNumber,
    date: quando.date,
    status: 'playing',
    parole: giorno.map((g) => ({
      lunghezza: g.parola.length,
      lettere: null,
      esito: null,
      ms: null,
      punti: 0,
      aiuto: false,
      definizione: null,
      parola: null,
      risposta: null,
    })),
    corrente: null,
    restanteMs: null,
    tempoParolaMs: TEMPO_PAROLA_MS,
    punti: 0,
    versione: 0,
    msToNextPuzzle,
  }
}

/**
 * Scrive le parole, condizionata alla versione letta: un doppio tocco non apre
 * due parole e non conta due volte la stessa risposta. Si ricavano da sole la
 * fine della giornata, i punti, le parole trovate e il tempo: l'orologio parte
 * con la parola aperta e si ferma fra una parola e l'altra.
 */
export async function salvaPartita(
  db: D1Database,
  row: PartitaRow,
  parole: ParolaSalvata[],
  giorno: readonly ParolaDelGiorno[],
  adesso: number,
): Promise<PartitaRow> {
  const conti = giocate(parole, giorno)
  const fatta = conti.length === PAROLE_ANAGRAMMI
  const status: AnagrammiStatus = fatta ? 'done' : 'playing'
  const score = fatta ? puntiAnagrammi(conti) : 0
  const trovate = conti.filter((p) => p.trovata).length
  const tempo = conti.reduce((s, p) => s + (p.trovata ? p.ms : 0), 0)
  const quando = new Date(adesso).toISOString()
  const aperta = !fatta && inCorso(parole) ? new Date(inCorso(parole)!.a).toISOString() : null
  const testo = JSON.stringify(parole)
  const scritta = await db
    .prepare(
      `UPDATE anagrammi_partite
          SET parole = ?, aperta_at = ?, trovate = ?, tempo_ms = ?, status = ?, score = ?,
              versione = versione + 1, updated_at = ?, finished_at = COALESCE(finished_at, ?)
        WHERE id = ? AND versione = ?`,
    )
    .bind(testo, aperta, trovate, tempo, status, score, quando, fatta ? quando : null, row.id, row.versione)
    .run()
  if (scritta.meta.changes !== 1) fail(409, 'CONFLITTO', 'La partita è cambiata su un altro dispositivo: ricarico.')
  return {
    ...row,
    parole: testo,
    aperta_at: aperta,
    trovate,
    tempo_ms: tempo,
    status,
    score,
    versione: row.versione + 1,
    updated_at: quando,
    finished_at: row.finished_at ?? (fatta ? quando : null),
  }
}

/**
 * Chiude come persa la parola aperta se il suo tempo e' scaduto. Una richiesta
 * che arriva insieme a un'altra puo' trovarla gia' chiusa: la scrittura e'
 * condizionata, e chi perde rilegge.
 */
export async function chiudiScaduta(
  db: D1Database,
  row: PartitaRow,
  giorno: readonly ParolaDelGiorno[],
  adesso: number,
): Promise<PartitaRow> {
  if (!scaduta(row, adesso)) return row
  const parole = paroleDi(row)
  const corrente = inCorso(parole)
  if (!corrente) return row
  const chiuse = parole.map((p) => (p === corrente ? { ...p, e: 'persa' as const, f: p.a + TEMPO_PAROLA_MS } : p))
  try {
    return await salvaPartita(db, row, chiuse, giorno, adesso)
  } catch {
    return (await partitaDi(db, row.player_id, row.puzzle_number)) ?? row
  }
}

/** Una risposta come la salva la partita: normalizzata, e solo se ha la misura di una parola. */
export function rispostaDaSalvare(testo: string): string {
  return normalizzaAnagramma(testo).slice(0, 12)
}

/* ────────────────────────────  La classifica  ─────────────────────────── */

export interface TotaliAnagrammi {
  playerId: string
  nickname: string
  displayName: string
  avatarColor: string
  punti: number
  giornate: number
  trovate: number
  tempoMs: number
  inCorso: boolean
}

/**
 * Mette in fila i giocatori degli Anagrammi: **punti** delle giornate finite,
 * chi ha solo una giornata aperta in fondo, poi **piu' parole trovate**, poi
 * **meno tempo** per trovarle, e il nickname, perché due righe identiche non
 * si scambino di posto.
 */
export function ordinaAnagrammi(giocatori: TotaliAnagrammi[]): AnagrammiRow[] {
  return [...giocatori]
    .sort((a, b) => {
      if (a.punti !== b.punti) return b.punti - a.punti
      if (a.giornate > 0 !== b.giornate > 0) return a.giornate > 0 ? -1 : 1
      if (a.trovate !== b.trovate) return b.trovate - a.trovate
      if (a.tempoMs !== b.tempoMs) return a.tempoMs - b.tempoMs
      return a.nickname.localeCompare(b.nickname, 'it', { sensitivity: 'base' })
    })
    .map((g, i) => ({ rank: i + 1, ...g }))
}

export async function classificaAnagrammi(
  db: D1Database,
  periodo: PeriodoClassifica,
  numeroDiOggi: number,
  viewerId: string,
): Promise<AnagrammiLeaderboard> {
  const { results } = await db
    .prepare(
      `SELECT p.id AS player_id, p.nickname, p.display_name, p.avatar_color,
              COALESCE(SUM(CASE WHEN g.status = 'done' THEN g.score END), 0)    AS punti,
              SUM(CASE WHEN g.status = 'done' THEN 1 ELSE 0 END)               AS giornate,
              COALESCE(SUM(CASE WHEN g.status = 'done' THEN g.trovate END), 0)  AS trovate,
              COALESCE(SUM(CASE WHEN g.status = 'done' THEN g.tempo_ms END), 0) AS tempo_ms,
              MAX(CASE WHEN g.puzzle_number = ? AND g.status = 'playing' THEN 1 ELSE 0 END) AS in_corso
         FROM players p
         JOIN anagrammi_partite g ON g.player_id = p.id AND g.puzzle_number BETWEEN ? AND ?
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
      trovate: number
      tempo_ms: number
      in_corso: number
    }>()
  const rows = ordinaAnagrammi(
    results.map((r) => ({
      playerId: r.player_id,
      nickname: r.nickname,
      displayName: r.display_name || r.nickname,
      avatarColor: r.avatar_color,
      punti: r.punti,
      giornate: r.giornate,
      trovate: r.trovate,
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

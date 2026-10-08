/**
 * Accesso ai dati della Ghigliottina: la partita di ognuno e la classifica.
 *
 * La partita del giorno la scrive la notte in `ghigliottina_giornate`, con la
 * parola vincente e quale parola di ogni coppia e' giusta; da qui esce una
 * coppia alla volta, e quale fosse quella giusta si dice solo dopo la scelta.
 * Il minuto della parola vincente lo tiene il server: `finale_at` e' quando e'
 * partito, e una risposta vale entro TEMPO_FINALE_MS piu' il margine della
 * rete. Il minuto finito non si scrive da solo: lo applica la prima richiesta
 * che arriva dopo (`chiudiScaduta`), come negli Anagrammi.
 */

import { gameDate, puzzleNumberFor } from '../../shared/daily'
import {
  COPPIE_GHIGLIOTTINA,
  MARGINE_GHIGLIOTTINA_MS,
  MONTEPREMI_GHIGLIOTTINA,
  TEMPO_FINALE_MS,
  giornataValida,
  montepremi,
  normalizzaGhigliottina,
  type GhigliottinaDelGiorno,
} from '../../shared/ghigliottina'
import type {
  CoppiaGhigliottinaVista,
  GhigliottinaLeaderboard,
  GhigliottinaRow,
  GhigliottinaStato,
  GhigliottinaStatus,
  PeriodoClassifica,
} from '../../shared/types'
import { fail, newId, nowIso } from './http'

export interface PartitaRow {
  id: string
  player_id: string
  puzzle_number: number
  date: string
  status: GhigliottinaStatus
  scelte: string
  sbagliate: number
  finale_at: string | null
  risposta: string | null
  indovinata: number | null
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

/** La partita di un giorno, o null se la notte non l'ha ancora scritta. */
export async function ghigliottinaDelGiorno(db: D1Database, numero: number): Promise<GhigliottinaDelGiorno | null> {
  const riga = await db
    .prepare('SELECT ghigliottina FROM ghigliottina_giornate WHERE puzzle_number = ?')
    .bind(numero)
    .first<{ ghigliottina: string }>()
  if (!riga) return null
  try {
    const valore: unknown = JSON.parse(riga.ghigliottina)
    return giornataValida(valore) ? valore : null
  } catch {
    return null
  }
}

export async function partitaDi(db: D1Database, playerId: string, numero: number): Promise<PartitaRow | null> {
  return db
    .prepare('SELECT * FROM ghigliottina_partite WHERE player_id = ? AND puzzle_number = ?')
    .bind(playerId, numero)
    .first<PartitaRow>()
}

/** La partita di oggi, creata vuota se non c'e': nasce con la prima scelta. */
export async function apriPartita(db: D1Database, playerId: string, quando: Giornata): Promise<PartitaRow> {
  const adesso = nowIso()
  await db
    .prepare(
      `INSERT OR IGNORE INTO ghigliottina_partite (id, player_id, puzzle_number, date, status, started_at, updated_at)
       VALUES (?, ?, ?, ?, 'playing', ?, ?)`,
    )
    .bind(newId('ghi'), playerId, quando.puzzleNumber, quando.date, adesso, adesso)
    .run()
  const row = await partitaDi(db, playerId, quando.puzzleNumber)
  if (!row) throw new Error('Partita della Ghigliottina non trovata subito dopo la creazione')
  return row
}

/** Le scelte fatte, una per coppia: 0 o 1. */
export function scelteDi(row: Pick<PartitaRow, 'scelte'>): Array<0 | 1> {
  let valore: unknown
  try {
    valore = JSON.parse(row.scelte)
  } catch {
    return []
  }
  if (!Array.isArray(valore)) return []
  return valore.filter((s): s is 0 | 1 => s === 0 || s === 1).slice(0, COPPIE_GHIGLIOTTINA)
}

/** Il minuto della parola vincente e' finito, margine della rete compreso. */
export function scaduta(row: Pick<PartitaRow, 'finale_at' | 'status'>, adesso: number): boolean {
  return (
    row.status === 'playing' &&
    row.finale_at !== null &&
    adesso > Date.parse(row.finale_at) + TEMPO_FINALE_MS + MARGINE_GHIGLIOTTINA_MS
  )
}

/**
 * Lo stato che va al client. Delle coppie, quelle scelte con la parola giusta,
 * e quella da scegliere senza; le altre non escono. La parola vincente e le
 * espressioni solo a partita finita.
 */
export function statoDa(
  row: PartitaRow | null,
  giorno: GhigliottinaDelGiorno,
  quando: Giornata,
  adesso: number,
  msToNextPuzzle: number,
): GhigliottinaStato {
  const scelte = row ? scelteDi(row) : []
  const finita = row?.status === 'done'
  const corrente = !finita && scelte.length < COPPIE_GHIGLIOTTINA ? scelte.length : null
  const viste = finita ? COPPIE_GHIGLIOTTINA : Math.min(COPPIE_GHIGLIOTTINA, scelte.length + 1)
  const coppie = giorno.coppie.slice(0, viste).map(
    (c, i): CoppiaGhigliottinaVista => ({
      parole: c.parole,
      scelta: scelte[i] ?? null,
      giusta: scelte[i] !== undefined || finita ? c.giusta : null,
      spiegazione: finita ? c.spiegazione : null,
    }),
  )
  const sbagliate = row?.sbagliate ?? 0
  const aperto = !finita && row?.finale_at != null
  return {
    puzzleNumber: quando.puzzleNumber,
    date: quando.date,
    status: row?.status ?? 'playing',
    coppie,
    totaleCoppie: COPPIE_GHIGLIOTTINA,
    corrente,
    montepremiIniziale: MONTEPREMI_GHIGLIOTTINA,
    montepremi: montepremi(sbagliate),
    finale: {
      aperto,
      restanteMs:
        aperto && row?.finale_at ? Math.max(0, Date.parse(row.finale_at) + TEMPO_FINALE_MS - adesso) : null,
      tempoMs: TEMPO_FINALE_MS,
    },
    soluzione: finita ? giorno.soluzione : null,
    risposta: finita ? row.risposta : null,
    indovinata: finita ? row.indovinata === 1 : null,
    tempoMs: finita && row.indovinata === 1 ? row.tempo_ms : null,
    punti: finita ? row.score : 0,
    versione: row?.versione ?? 0,
    msToNextPuzzle,
  }
}

export interface Modifica {
  scelte?: Array<0 | 1>
  sbagliate?: number
  finale_at?: string | null
  fine?: { risposta: string | null; indovinata: boolean; tempoMs: number; score: number }
}

/**
 * Scrive la partita, condizionata alla versione letta: un doppio tocco non
 * sceglie due volte e non risponde due volte.
 */
export async function salvaPartita(db: D1Database, row: PartitaRow, modifica: Modifica): Promise<PartitaRow> {
  const scelte = JSON.stringify(modifica.scelte ?? scelteDi(row))
  const sbagliate = modifica.sbagliate ?? row.sbagliate
  const finale = modifica.finale_at !== undefined ? modifica.finale_at : row.finale_at
  const fine = modifica.fine
  const quando = nowIso()
  const dopo: PartitaRow = {
    ...row,
    scelte,
    sbagliate,
    finale_at: finale,
    status: fine ? 'done' : row.status,
    risposta: fine ? fine.risposta : row.risposta,
    indovinata: fine ? (fine.indovinata ? 1 : 0) : row.indovinata,
    tempo_ms: fine ? fine.tempoMs : row.tempo_ms,
    score: fine ? fine.score : row.score,
    versione: row.versione + 1,
    updated_at: quando,
    finished_at: fine ? quando : row.finished_at,
  }
  const scritta = await db
    .prepare(
      `UPDATE ghigliottina_partite
          SET scelte = ?, sbagliate = ?, finale_at = ?, status = ?, risposta = ?, indovinata = ?, tempo_ms = ?,
              score = ?, versione = versione + 1, updated_at = ?, finished_at = ?
        WHERE id = ? AND versione = ?`,
    )
    .bind(
      dopo.scelte,
      dopo.sbagliate,
      dopo.finale_at,
      dopo.status,
      dopo.risposta,
      dopo.indovinata,
      dopo.tempo_ms,
      dopo.score,
      quando,
      dopo.finished_at,
      row.id,
      row.versione,
    )
    .run()
  if (scritta.meta.changes !== 1) fail(409, 'CONFLITTO', 'La partita è cambiata su un altro dispositivo: ricarico.')
  return dopo
}

/**
 * Chiude senza risposta la partita il cui minuto e' finito: niente punti. Una
 * richiesta che arriva insieme a un'altra puo' trovarla gia' chiusa: la
 * scrittura e' condizionata, e chi perde rilegge.
 */
export async function chiudiScaduta(db: D1Database, row: PartitaRow, adesso: number): Promise<PartitaRow> {
  if (!scaduta(row, adesso)) return row
  try {
    return await salvaPartita(db, row, {
      fine: { risposta: null, indovinata: false, tempoMs: TEMPO_FINALE_MS, score: 0 },
    })
  } catch {
    return (await partitaDi(db, row.player_id, row.puzzle_number)) ?? row
  }
}

/** Una risposta come la salva la partita: normalizzata, e solo se ha la misura di una parola. */
export function rispostaDaSalvare(testo: string): string {
  return normalizzaGhigliottina(testo).slice(0, 20)
}

/* ────────────────────────────  La classifica  ─────────────────────────── */

export interface TotaliGhigliottina {
  playerId: string
  nickname: string
  displayName: string
  avatarColor: string
  punti: number
  giornate: number
  indovinate: number
  tempoMs: number
  inCorso: boolean
}

/**
 * Mette in fila i giocatori della Ghigliottina: **punti** delle partite
 * finite, chi ha solo una partita aperta in fondo, poi **piu' parole
 * indovinate**, poi **meno tempo** per scriverle, e il nickname, perché due
 * righe identiche non si scambino di posto.
 */
export function ordinaGhigliottina(giocatori: TotaliGhigliottina[]): GhigliottinaRow[] {
  return [...giocatori]
    .sort((a, b) => {
      if (a.punti !== b.punti) return b.punti - a.punti
      if (a.giornate > 0 !== b.giornate > 0) return a.giornate > 0 ? -1 : 1
      if (a.indovinate !== b.indovinate) return b.indovinate - a.indovinate
      if (a.tempoMs !== b.tempoMs) return a.tempoMs - b.tempoMs
      return a.nickname.localeCompare(b.nickname, 'it', { sensitivity: 'base' })
    })
    .map((g, i) => ({ rank: i + 1, ...g }))
}

export async function classificaGhigliottina(
  db: D1Database,
  periodo: PeriodoClassifica,
  numeroDiOggi: number,
  viewerId: string,
): Promise<GhigliottinaLeaderboard> {
  const { results } = await db
    .prepare(
      `SELECT p.id AS player_id, p.nickname, p.display_name, p.avatar_color,
              COALESCE(SUM(CASE WHEN g.status = 'done' THEN g.score END), 0) AS punti,
              SUM(CASE WHEN g.status = 'done' THEN 1 ELSE 0 END)            AS giornate,
              SUM(CASE WHEN g.status = 'done' AND g.indovinata = 1 THEN 1 ELSE 0 END) AS indovinate,
              COALESCE(SUM(CASE WHEN g.status = 'done' AND g.indovinata = 1 THEN g.tempo_ms END), 0) AS tempo_ms,
              MAX(CASE WHEN g.puzzle_number = ? AND g.status = 'playing' THEN 1 ELSE 0 END) AS in_corso
         FROM players p
         JOIN ghigliottina_partite g ON g.player_id = p.id AND g.puzzle_number BETWEEN ? AND ?
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
      indovinate: number
      tempo_ms: number
      in_corso: number
    }>()
  const rows = ordinaGhigliottina(
    results.map((r) => ({
      playerId: r.player_id,
      nickname: r.nickname,
      displayName: r.display_name || r.nickname,
      avatarColor: r.avatar_color,
      punti: r.punti,
      giornate: r.giornate,
      indovinate: r.indovinate,
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

/**
 * Accesso ai dati della Catena: la partita di ognuno e la classifica.
 *
 * La catena del giorno la scrive la notte in `catena_giornate`, con tutte le
 * parole; da qui escono solo quelle viste e le lettere di quella da indovinare
 * (`vistaCatena`). La partita salva le mosse, e il resto si ricava rigiocandole
 * (`svolgiCatena`): come nello Scarabeo, la riga non puo' dire una cosa e le
 * mosse un'altra. Il minuto della parola finale lo tiene il server: `finale_at`
 * e' quando parte, scritto con la mossa che ci arriva, e una risposta vale entro
 * il minuto piu' il margine della rete. Il minuto finito non si scrive da solo:
 * lo applica la prima richiesta che arriva dopo (`chiudiScaduta`).
 */

import { gameDate, puzzleNumberFor } from '../../shared/daily'
import {
  DA_INDOVINARE_CATENA,
  JOLLY_CATENA,
  MARGINE_CATENA_MS,
  MONTEPREMI_CATENA,
  TEMPO_FINALE_CATENA_MS,
  compraUsabile,
  giornataValida,
  jollyUsabile,
  mosseValide,
  normalizzaCatena,
  svolgiCatena,
  vistaCatena,
  type CatenaDelGiorno,
  type EsitoMossaCatena,
  type MossaCatena,
} from '../../shared/catena'
import type {
  CatenaLeaderboard,
  CatenaRow,
  CatenaStato,
  CatenaStatus,
  PeriodoClassifica,
} from '../../shared/types'
import { fail, newId, nowIso } from './http'

export interface PartitaRow {
  id: string
  player_id: string
  puzzle_number: number
  date: string
  status: CatenaStatus
  mosse: string
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

/** La catena di un giorno, o null se la notte non l'ha ancora scritta. */
export async function catenaDelGiornoDa(db: D1Database, numero: number): Promise<CatenaDelGiorno | null> {
  const riga = await db
    .prepare('SELECT catena FROM catena_giornate WHERE puzzle_number = ?')
    .bind(numero)
    .first<{ catena: string }>()
  if (!riga) return null
  try {
    const valore: unknown = JSON.parse(riga.catena)
    return giornataValida(valore) ? valore : null
  } catch {
    return null
  }
}

export async function partitaDi(db: D1Database, playerId: string, numero: number): Promise<PartitaRow | null> {
  return db
    .prepare('SELECT * FROM catena_partite WHERE player_id = ? AND puzzle_number = ?')
    .bind(playerId, numero)
    .first<PartitaRow>()
}

/** La partita di oggi, creata vuota se non c'e': nasce con la prima mossa. */
export async function apriPartita(db: D1Database, playerId: string, quando: Giornata): Promise<PartitaRow> {
  const adesso = nowIso()
  await db
    .prepare(
      `INSERT OR IGNORE INTO catena_partite (id, player_id, puzzle_number, date, status, started_at, updated_at)
       VALUES (?, ?, ?, ?, 'playing', ?, ?)`,
    )
    .bind(newId('cat'), playerId, quando.puzzleNumber, quando.date, adesso, adesso)
    .run()
  const row = await partitaDi(db, playerId, quando.puzzleNumber)
  if (!row) throw new Error('Partita della Catena non trovata subito dopo la creazione')
  return row
}

export function mosseDi(row: Pick<PartitaRow, 'mosse'>): MossaCatena[] {
  try {
    return mosseValide(JSON.parse(row.mosse))
  } catch {
    return []
  }
}

/** Il minuto della parola finale e' finito, margine della rete compreso. */
export function scaduta(row: Pick<PartitaRow, 'finale_at' | 'status'>, adesso: number): boolean {
  return (
    row.status === 'playing' &&
    row.finale_at !== null &&
    adesso > Date.parse(row.finale_at) + TEMPO_FINALE_CATENA_MS + MARGINE_CATENA_MS
  )
}

/**
 * Lo stato che va al client: le parole viste e le lettere di quella da
 * indovinare, mai le parole dopo. La catena intera, con le espressioni, solo a
 * partita finita.
 */
export function statoDa(
  row: PartitaRow | null,
  catena: CatenaDelGiorno,
  quando: Giornata,
  adesso: number,
  msToNextPuzzle: number,
  esito: EsitoMossaCatena | null = null,
): CatenaStato {
  const s = svolgiCatena(catena, row ? mosseDi(row) : [])
  const finita = row?.status === 'done'
  const indovinata = finita ? row.indovinata === 1 : null
  const inizio = row?.finale_at ? Date.parse(row.finale_at) : null
  return {
    puzzleNumber: quando.puzzleNumber,
    date: quando.date,
    status: row?.status ?? 'playing',
    voci: vistaCatena(catena, s, { finita, indovinata }),
    passo: s.passo,
    totaleParole: DA_INDOVINARE_CATENA,
    jollyRestanti: JOLLY_CATENA - s.jollyUsati,
    jollyUsabile: !finita && jollyUsabile(catena, s),
    terzo: s.terzo,
    compraUsabile: !finita && compraUsabile(s),
    montepremiIniziale: MONTEPREMI_CATENA,
    montepremi: s.montepremi,
    finale:
      !finita && inizio !== null
        ? {
            inizioMs: Math.max(0, inizio - adesso),
            restanteMs: Math.max(0, Math.min(TEMPO_FINALE_CATENA_MS, inizio + TEMPO_FINALE_CATENA_MS - adesso)),
            tempoMs: TEMPO_FINALE_CATENA_MS,
          }
        : null,
    risposta: finita ? row.risposta : null,
    indovinata,
    tempoMs: finita && row.indovinata === 1 ? row.tempo_ms : null,
    punti: finita ? row.score : 0,
    esito,
    versione: row?.versione ?? 0,
    msToNextPuzzle,
  }
}

export interface Modifica {
  mosse?: MossaCatena[]
  finale_at?: string | null
  fine?: { risposta: string | null; indovinata: boolean; tempoMs: number; score: number }
}

/** Scrive la partita, condizionata alla versione letta: un doppio tocco non prova due volte la stessa parola. */
export async function salvaPartita(db: D1Database, row: PartitaRow, modifica: Modifica): Promise<PartitaRow> {
  const fine = modifica.fine
  const quando = nowIso()
  const dopo: PartitaRow = {
    ...row,
    mosse: modifica.mosse ? JSON.stringify(modifica.mosse) : row.mosse,
    finale_at: modifica.finale_at !== undefined ? modifica.finale_at : row.finale_at,
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
      `UPDATE catena_partite
          SET mosse = ?, finale_at = ?, status = ?, risposta = ?, indovinata = ?, tempo_ms = ?, score = ?,
              versione = versione + 1, updated_at = ?, finished_at = ?
        WHERE id = ? AND versione = ?`,
    )
    .bind(
      dopo.mosse,
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
      fine: { risposta: null, indovinata: false, tempoMs: TEMPO_FINALE_CATENA_MS, score: 0 },
    })
  } catch {
    return (await partitaDi(db, row.player_id, row.puzzle_number)) ?? row
  }
}

/** Una parola come la salva la partita: normalizzata, e solo se ha la misura di una parola. */
export function parolaDaSalvare(testo: string): string {
  return normalizzaCatena(testo).slice(0, 24)
}

/* ────────────────────────────  La classifica  ─────────────────────────── */

export interface TotaliCatena {
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
 * Mette in fila i giocatori della Catena: **punti** delle partite finite, chi
 * ha solo una partita aperta in fondo, poi **piu' parole finali indovinate**,
 * poi **meno tempo** per scriverle, e il nickname, perché due righe identiche
 * non si scambino di posto. Le stesse regole della Ghigliottina.
 */
export function ordinaCatena(giocatori: TotaliCatena[]): CatenaRow[] {
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

export async function classificaCatena(
  db: D1Database,
  periodo: PeriodoClassifica,
  numeroDiOggi: number,
  viewerId: string,
): Promise<CatenaLeaderboard> {
  const { results } = await db
    .prepare(
      `SELECT p.id AS player_id, p.nickname, p.display_name, p.avatar_color,
              COALESCE(SUM(CASE WHEN g.status = 'done' THEN g.score END), 0) AS punti,
              SUM(CASE WHEN g.status = 'done' THEN 1 ELSE 0 END)            AS giornate,
              SUM(CASE WHEN g.status = 'done' AND g.indovinata = 1 THEN 1 ELSE 0 END) AS indovinate,
              COALESCE(SUM(CASE WHEN g.status = 'done' AND g.indovinata = 1 THEN g.tempo_ms END), 0) AS tempo_ms,
              MAX(CASE WHEN g.puzzle_number = ? AND g.status = 'playing' THEN 1 ELSE 0 END) AS in_corso
         FROM players p
         JOIN catena_partite g ON g.player_id = p.id AND g.puzzle_number BETWEEN ? AND ?
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
  const rows = ordinaCatena(
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

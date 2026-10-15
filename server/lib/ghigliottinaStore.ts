/**
 * Accesso ai dati della Ghigliottina: la partita di ognuno e la classifica.
 *
 * La partita del giorno la scrive la notte in `ghigliottina_giornate`, con la
 * parola vincente e quale parola di ogni coppia e' giusta; da qui esce una
 * coppia alla volta, e quale fosse quella giusta si dice solo dopo la scelta.
 * I tempi li tiene il server: `coppia_at` e' quando parte quello della coppia
 * di adesso, `finale_at` quello della parola vincente, e una scelta o una
 * risposta valgono entro il tempo piu' il margine della rete. Un tempo finito
 * non si scrive da solo: lo applica la prima richiesta che arriva dopo
 * (`chiudiScadute`), dalla scadenza e non da adesso.
 */

import { gameDate, puzzleNumberFor } from '../../shared/daily'
import {
  COPPIE_GHIGLIOTTINA,
  MARGINE_GHIGLIOTTINA_MS,
  MONTEPREMI_GHIGLIOTTINA,
  PREAMBOLO_FINALE_MS,
  TEMPO_FINALE_MS,
  TEMPO_SCELTA_MS,
  giornataValida,
  montepremi,
  normalizzaGhigliottina,
  preamboloCoppia,
  puntiGhigliottina,
  type GhigliottinaDelGiorno,
  type SceltaGhigliottina,
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
  /** Quando parte il tempo della coppia di adesso; NULL dopo le cinque, e nelle partite di prima dei tempi. */
  coppia_at: string | null
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

/**
 * La partita di oggi, creata se non c'e': nasce con Comincia, e il tempo della
 * prima coppia parte da `coppiaAt`. Se c'e' gia' resta com'era.
 */
export async function apriPartita(
  db: D1Database,
  playerId: string,
  quando: Giornata,
  coppiaAt: string,
): Promise<PartitaRow> {
  const adesso = nowIso()
  await db
    .prepare(
      `INSERT OR IGNORE INTO ghigliottina_partite
         (id, player_id, puzzle_number, date, status, coppia_at, started_at, updated_at)
       VALUES (?, ?, ?, ?, 'playing', ?, ?, ?)`,
    )
    .bind(newId('ghi'), playerId, quando.puzzleNumber, quando.date, coppiaAt, adesso, adesso)
    .run()
  const row = await partitaDi(db, playerId, quando.puzzleNumber)
  if (!row) throw new Error('Partita della Ghigliottina non trovata subito dopo la creazione')
  return row
}

/** Le scelte fatte, una per coppia: 0 o 1, o null dove il tempo e' finito. */
export function scelteDi(row: Pick<PartitaRow, 'scelte'>): SceltaGhigliottina[] {
  let valore: unknown
  try {
    valore = JSON.parse(row.scelte)
  } catch {
    return []
  }
  if (!Array.isArray(valore)) return []
  return valore
    .filter((s): s is SceltaGhigliottina => s === 0 || s === 1 || s === null)
    .slice(0, COPPIE_GHIGLIOTTINA)
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
  // Prima di Comincia non si vede niente: la prima coppia, vista prima del tempo, sarebbe tempo regalato.
  const viste = !row ? 0 : finita ? COPPIE_GHIGLIOTTINA : Math.min(COPPIE_GHIGLIOTTINA, scelte.length + 1)
  const coppie = giorno.coppie.slice(0, viste).map(
    (c, i): CoppiaGhigliottinaVista => ({
      parole: c.parole,
      scelta: scelte[i] ?? null,
      scaduta: scelte[i] === null,
      giusta: scelte[i] !== undefined || finita ? c.giusta : null,
      spiegazione: finita ? c.spiegazione : null,
    }),
  )
  const sbagliate = row?.sbagliate ?? 0
  const aperto = !finita && row?.finale_at != null
  const coppiaAt = corrente !== null && row?.coppia_at ? Date.parse(row.coppia_at) : null
  return {
    puzzleNumber: quando.puzzleNumber,
    date: quando.date,
    status: row?.status ?? 'playing',
    iniziata: row !== null,
    coppie,
    totaleCoppie: COPPIE_GHIGLIOTTINA,
    corrente,
    montepremiIniziale: MONTEPREMI_GHIGLIOTTINA,
    montepremi: montepremi(sbagliate),
    coppia:
      coppiaAt !== null
        ? {
            inizioMs: Math.max(0, coppiaAt - adesso),
            restanteMs: Math.max(0, Math.min(TEMPO_SCELTA_MS, coppiaAt + TEMPO_SCELTA_MS - adesso)),
            tempoMs: TEMPO_SCELTA_MS,
          }
        : null,
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
  scelte?: SceltaGhigliottina[]
  sbagliate?: number
  coppia_at?: string | null
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
  const coppiaAt = modifica.coppia_at !== undefined ? modifica.coppia_at : row.coppia_at
  const fine = modifica.fine
  const quando = nowIso()
  const dopo: PartitaRow = {
    ...row,
    scelte,
    sbagliate,
    coppia_at: coppiaAt,
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
          SET scelte = ?, sbagliate = ?, coppia_at = ?, finale_at = ?, status = ?, risposta = ?, indovinata = ?,
              tempo_ms = ?, score = ?, versione = versione + 1, updated_at = ?, finished_at = ?
        WHERE id = ? AND versione = ?`,
    )
    .bind(
      dopo.scelte,
      dopo.sbagliate,
      dopo.coppia_at,
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
 * La scelta di una coppia, o il suo tempo finito (`null`): la partita dopo,
 * con il montepremi e i tempi che ne vengono. La prossima coppia parte dopo la
 * scena che la porta in vista, da `da`; dopo la quinta il tempo delle coppie
 * finisce, e quello della finale lo fa partire chi gioca (`/finale`).
 */
export function dopoLaScelta(
  row: Pick<PartitaRow, 'sbagliate'>,
  scelte: SceltaGhigliottina[],
  giorno: GhigliottinaDelGiorno,
  scelta: SceltaGhigliottina,
  da: number,
): Required<Pick<Modifica, 'scelte' | 'sbagliate' | 'coppia_at'>> {
  const giusta = scelta !== null && giorno.coppie[scelte.length].giusta === scelta
  const dopo = [...scelte, scelta]
  return {
    scelte: dopo,
    sbagliate: row.sbagliate + (giusta ? 0 : 1),
    coppia_at: dopo.length < COPPIE_GHIGLIOTTINA ? new Date(da + preamboloCoppia(giusta)).toISOString() : null,
  }
}

/**
 * I tempi finiti, applicati dalla loro scadenza: ogni coppia il cui tempo e'
 * passato, margine compreso, conta come sbagliata, e la dopo parte da quella
 * scadenza, non da adesso. Se le coppie finiscono cosi' — chi gioca ha chiuso
 * la pagina — parte anche il tempo della finale, dopo le cinque parole; e se e'
 * finito anche quello la partita si chiude senza risposta e senza punti. Una
 * scrittura sola, condizionata: chi perde rilegge.
 */
export async function chiudiScadute(
  db: D1Database,
  row: PartitaRow,
  giorno: GhigliottinaDelGiorno,
  adesso: number,
): Promise<PartitaRow> {
  if (row.status !== 'playing') return row
  let modifica: Modifica = {}
  let scelte = scelteDi(row)
  let sbagliate = row.sbagliate
  let coppiaAt = row.coppia_at
  let finaleAt = row.finale_at
  while (scelte.length < COPPIE_GHIGLIOTTINA && coppiaAt !== null) {
    const scadenza = Date.parse(coppiaAt) + TEMPO_SCELTA_MS
    if (adesso <= scadenza + MARGINE_GHIGLIOTTINA_MS) break
    const dopo = dopoLaScelta({ sbagliate }, scelte, giorno, null, scadenza)
    ;({ scelte, sbagliate } = dopo)
    coppiaAt = dopo.coppia_at
    if (scelte.length === COPPIE_GHIGLIOTTINA && finaleAt === null) {
      finaleAt = new Date(scadenza + PREAMBOLO_FINALE_MS).toISOString()
    }
    modifica = { scelte, sbagliate, coppia_at: coppiaAt, finale_at: finaleAt }
  }
  const finita = scaduta({ status: row.status, finale_at: finaleAt }, adesso)
  if (modifica.scelte === undefined && !finita) return row
  try {
    return await salvaPartita(db, row, {
      ...modifica,
      fine: finita
        ? { risposta: null, indovinata: false, tempoMs: TEMPO_FINALE_MS, score: puntiGhigliottina(sbagliate, false) }
        : undefined,
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

/**
 * Accesso ai dati del cruciverba: lo schema del giorno, la partita, la
 * classifica.
 *
 * Lo schema lo scrive il workflow programmato (scripts/genera-cruciverba.mjs):
 * qui si legge e basta. La partita salva la griglia scritta e gli aiuti chiesti,
 * che sono quel che decide i punti; la soluzione non esce dal server finché la
 * partita non e' chiusa, come nel Wordle.
 */

import {
  grigliaIniziale,
  punteggio,
  schemaVuoto,
  sequenzeDelloSchema,
} from '../../shared/cruciverba'
import { gameDate, puzzleNumberFor } from '../../shared/daily'
import type {
  CruciverbaLeaderboard,
  CruciverbaRow,
  CruciverbaState,
  CruciverbaStatus,
  DefinizioneCruciverba,
  PeriodoClassifica,
} from '../../shared/types'
import { fail, newId, nowIso } from './http'

/** Quel che serve di uno schema, del giorno o libero. */
export interface Schema {
  righe: number
  colonne: number
  soluzione: string
  definizioni: string
}

export interface SchemaRow extends Schema {
  puzzle_number: number
  created_at: string
}

export interface SchemaLiberoRow extends Schema {
  id: number
  created_at: string
}

/** Le colonne comuni alle due partite: quelle che la scrittura legge e cambia. */
export interface Partita {
  id: string
  player_id: string
  status: CruciverbaStatus
  lettere: string
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

export interface PartitaRow extends Partita {
  puzzle_number: number
  date: string
}

export interface PartitaLiberaRow extends Partita {
  schema_id: number
}

/** Le due tabelle delle partite: la scrittura e' la stessa, cambia dove. */
export type TabellaPartite = 'cruciverba_games' | 'cruciverba_partite_libere'

/** Chi e' la partita, per lo stato che va al client. */
export interface Identita {
  modalita: 'classificata' | 'libera'
  /** Il numero del puzzle, o quello dello schema libero. */
  numero: number
  date: string
}

/** Una definizione come sta in D1: chiavi corte, perché sono quaranta per schema. */
interface DefinizioneSalvata {
  t: string
  v: string
  n?: string
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
  return db
    .prepare('SELECT * FROM cruciverba_schemi WHERE puzzle_number = ?')
    .bind(numero)
    .first<SchemaRow>()
}

/**
 * Lo schema di oggi, o un 503 che lo dice.
 *
 * Non dovrebbe mancare mai — il workflow ne tiene pronti per due mesi — ma se
 * mancasse la risposta giusta e' "non ancora pronto", non un errore generico.
 */
export async function schemaObbligatorio(db: D1Database, numero: number): Promise<SchemaRow> {
  const schema = await schemaDelGiorno(db, numero)
  if (!schema) {
    fail(503, 'SCHEMA_ASSENTE', 'Il cruciverba di oggi non è ancora pronto. Riprova più tardi.')
  }
  return schema
}

/** La partita di oggi, creata al primo accesso con la griglia vuota. */
export async function apriPartita(
  db: D1Database,
  playerId: string,
  quando: Giornata,
  schema: SchemaRow,
): Promise<PartitaRow> {
  const adesso = nowIso()
  await db
    .prepare(
      `INSERT OR IGNORE INTO cruciverba_games
         (id, player_id, puzzle_number, date, status, lettere, started_at, updated_at)
       VALUES (?, ?, ?, ?, 'playing', ?, ?, ?)`,
    )
    .bind(
      newId('cru'),
      playerId,
      quando.puzzleNumber,
      quando.date,
      grigliaIniziale(schema.soluzione),
      adesso,
      adesso,
    )
    .run()

  const row = await db
    .prepare('SELECT * FROM cruciverba_games WHERE player_id = ? AND puzzle_number = ?')
    .bind(playerId, quando.puzzleNumber)
    .first<PartitaRow>()
  if (!row) throw new Error('Partita di cruciverba non trovata subito dopo la creazione')
  return row
}

function leggiJson<T>(testo: string, ripiego: T): T {
  try {
    return JSON.parse(testo) as T
  } catch {
    return ripiego
  }
}

export function svelateDi(row: Pick<Partita, 'svelate'>): number[] {
  const valore = leggiJson<unknown>(row.svelate, [])
  return Array.isArray(valore) ? valore.filter((k): k is number => Number.isInteger(k)) : []
}

/**
 * Le lettere segnalate come sbagliate, casella per casella.
 *
 * Una casella tiene **tutte** le lettere sbagliate che vi sono state
 * segnalate: chi scrive A, la vede segnalata, scrive B, poi torna ad A e
 * ricontrolla, sa gia' che A e' sbagliata — e non la paga di nuovo.
 */
export function segnalateDi(row: Pick<Partita, 'segnalate'>): Record<string, string> {
  const valore = leggiJson<unknown>(row.segnalate, {})
  return valore && typeof valore === 'object' && !Array.isArray(valore)
    ? (valore as Record<string, string>)
    : {}
}

/**
 * Registra un controllo: segna le caselle sbagliate e dice quanti errori sono
 * nuovi, cioe' quanti punti costa.
 */
export function registraControllo(
  segnalate: Record<string, string>,
  lettere: string,
  sbagliate: readonly number[],
): { segnalate: Record<string, string>; nuovi: number } {
  const dopo = { ...segnalate }
  let nuovi = 0
  for (const k of sbagliate) {
    const gia = dopo[k] ?? ''
    if (!gia.includes(lettere[k])) {
      dopo[k] = gia + lettere[k]
      nuovi += 1
    }
  }
  return { segnalate: dopo, nuovi }
}

/**
 * Il tempo di gioco dichiarato dal browser, limitato a quel che e' possibile.
 *
 * Il browser conta il tempo a pagina visibile — un cruciverba si fa a pezzi, e
 * un cronometro che corre mentre il telefono e' in tasca direbbe una cosa falsa.
 * Il server non puo' saperlo, ma sa quanto tempo e' passato dall'ultima
 * scrittura: il tempo dichiarato non puo' crescere piu' di così (con qualche
 * secondo di margine per la rete), né tornare indietro.
 */
export function tempoDichiarato(row: Pick<Partita, 'tempo_ms' | 'updated_at'>, dichiarato: unknown, adesso: number): number {
  const precedente = row.tempo_ms
  const valore = Number(dichiarato)
  if (!Number.isFinite(valore)) return precedente
  const trascorso = Math.max(0, adesso - Date.parse(row.updated_at))
  const massimo = precedente + trascorso + 5_000
  return Math.round(Math.min(Math.max(valore, precedente), massimo))
}

/** Lo stato completo che va al client. */
export function statoDa(
  row: Partita,
  schema: Schema,
  identita: Identita,
  msToNextPuzzle: number,
): CruciverbaState {
  const finita = row.status === 'done'
  const salvate = leggiJson<Record<string, DefinizioneSalvata>>(schema.definizioni, {})
  const definizioni: DefinizioneCruciverba[] = sequenzeDelloSchema(
    schema.soluzione,
    schema.righe,
    schema.colonne,
  ).map((s) => {
    const d = salvate[s.chiave]
    return {
      ...s,
      testo: d?.t ?? '—',
      nota: d?.n ?? '',
      voce: finita ? (d?.v ?? null) : null,
    }
  })

  const svelate = svelateDi(row)
  const segnalate = segnalateDi(row)

  return {
    partitaId: row.id,
    modalita: identita.modalita,
    puzzleNumber: identita.numero,
    date: identita.date,
    righe: schema.righe,
    colonne: schema.colonne,
    schema: schemaVuoto(schema.soluzione),
    definizioni,
    lettere: row.lettere,
    svelate,
    // Solo quelle che hanno ancora la lettera segnalata: una casella corretta
    // dopo il controllo non resta rossa.
    segnalate: Object.entries(segnalate)
      .filter(([k, lettere]) => lettere.includes(row.lettere[Number(k)]))
      .map(([k]) => Number(k))
      .sort((a, b) => a - b),
    errori: row.errori,
    tempoMs: row.tempo_ms,
    versione: row.versione,
    status: row.status,
    punti: finita ? row.score : punteggio(svelate.length, row.errori),
    soluzione: finita ? schema.soluzione : null,
    msToNextPuzzle,
  }
}

export function identitaDelGiorno(row: PartitaRow): Identita {
  return { modalita: 'classificata', numero: row.puzzle_number, date: row.date }
}

export function identitaLibera(row: PartitaLiberaRow): Identita {
  return { modalita: 'libera', numero: row.schema_id, date: row.started_at.slice(0, 10) }
}

export interface Cambi {
  lettere: string
  svelate: number[]
  segnalate: Record<string, string>
  errori: number
  tempoMs: number
  status: CruciverbaStatus
  score: number
}

/**
 * Scrive la partita, condizionata alla versione letta.
 *
 * D1 non ha transazioni interattive: due scritture ravvicinate — un telefono e
 * un computer aperti sulla stessa partita — non devono potersi sovrascrivere a
 * vicenda, soprattutto quando una delle due e' un aiuto che costa punti. Se la
 * versione non regge, chi chiama risponde 409 e il client rilegge lo stato.
 */
export async function salvaPartita<T extends Partita>(
  db: D1Database,
  tabella: TabellaPartite,
  row: T,
  cambi: Cambi,
): Promise<T> {
  const adesso = nowIso()
  const finita = cambi.status === 'done'
  const esito = await db
    .prepare(
      // La tabella viene da un tipo chiuso, non dal client: interpolarla e' sicuro.
      `UPDATE ${tabella}
          SET lettere = ?, svelate = ?, segnalate = ?, errori = ?, tempo_ms = ?,
              status = ?, score = ?, versione = versione + 1, updated_at = ?,
              finished_at = COALESCE(finished_at, ?)
        WHERE id = ? AND versione = ?`,
    )
    .bind(
      cambi.lettere,
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

  if (esito.meta.changes !== 1) {
    fail(409, 'CONFLITTO', 'Il cruciverba è cambiato su un altro dispositivo: ricarico.')
  }

  return {
    ...row,
    lettere: cambi.lettere,
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

/* ────────────────────────────  Gli schemi liberi  ─────────────────────────── */

export async function schemaLibero(db: D1Database, id: number): Promise<SchemaLiberoRow | null> {
  return db.prepare('SELECT * FROM cruciverba_schemi_liberi WHERE id = ?').bind(id).first<SchemaLiberoRow>()
}

export async function partitaLiberaPerId(
  db: D1Database,
  id: string,
  playerId: string,
): Promise<PartitaLiberaRow | null> {
  return db
    .prepare('SELECT * FROM cruciverba_partite_libere WHERE id = ? AND player_id = ?')
    .bind(id, playerId)
    .first<PartitaLiberaRow>()
}

/** Il cruciverba libero ancora aperto piu' recente, se c'e'. */
export async function liberaAperta(db: D1Database, playerId: string): Promise<PartitaLiberaRow | null> {
  return db
    .prepare(
      `SELECT * FROM cruciverba_partite_libere WHERE player_id = ? AND status = 'playing'
        ORDER BY started_at DESC LIMIT 1`,
    )
    .bind(playerId)
    .first<PartitaLiberaRow>()
}

/**
 * Un cruciverba libero nuovo: uno schema a caso fra quelli che il giocatore non
 * ha ancora aperto. Null se li ha fatti tutti — la scorta cresce ogni notte, e
 * la schermata lo dice invece di riproporne uno vecchio.
 */
export async function nuovaLibera(
  db: D1Database,
  playerId: string,
  caso: () => number,
): Promise<{ row: PartitaLiberaRow; schema: SchemaLiberoRow } | null> {
  const conta = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM cruciverba_schemi_liberi
        WHERE id NOT IN (SELECT schema_id FROM cruciverba_partite_libere WHERE player_id = ?)`,
    )
    .bind(playerId)
    .first<{ n: number }>()
  const quanti = conta?.n ?? 0
  if (quanti === 0) return null

  const schema = await db
    .prepare(
      `SELECT * FROM cruciverba_schemi_liberi
        WHERE id NOT IN (SELECT schema_id FROM cruciverba_partite_libere WHERE player_id = ?)
        ORDER BY id LIMIT 1 OFFSET ?`,
    )
    .bind(playerId, Math.floor(caso() * quanti))
    .first<SchemaLiberoRow>()
  if (!schema) return null

  const adesso = nowIso()
  const row: PartitaLiberaRow = {
    id: newId('crl'),
    player_id: playerId,
    schema_id: schema.id,
    status: 'playing',
    lettere: grigliaIniziale(schema.soluzione),
    svelate: '[]',
    segnalate: '{}',
    errori: 0,
    tempo_ms: 0,
    score: 0,
    versione: 0,
    started_at: adesso,
    updated_at: adesso,
    finished_at: null,
  }
  // OR IGNORE: due richieste ravvicinate sullo stesso schema non fanno due righe.
  await db
    .prepare(
      `INSERT OR IGNORE INTO cruciverba_partite_libere
         (id, player_id, schema_id, status, lettere, started_at, updated_at)
       VALUES (?, ?, ?, 'playing', ?, ?, ?)`,
    )
    .bind(row.id, playerId, schema.id, row.lettere, adesso, adesso)
    .run()
  const salvata = await db
    .prepare('SELECT * FROM cruciverba_partite_libere WHERE player_id = ? AND schema_id = ?')
    .bind(playerId, schema.id)
    .first<PartitaLiberaRow>()
  return { row: salvata ?? row, schema }
}

export async function statisticheLibere(
  db: D1Database,
  playerId: string,
): Promise<{ giocate: number; completate: number; senzaAiuti: number; disponibili: number }> {
  const [mie, scorta] = await Promise.all([
    db
      .prepare(
        `SELECT COUNT(*) AS giocate,
                SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS completate,
                SUM(CASE WHEN status = 'done' AND svelate = '[]' AND errori = 0 THEN 1 ELSE 0 END) AS perfetti
           FROM cruciverba_partite_libere WHERE player_id = ?`,
      )
      .bind(playerId)
      .first<{ giocate: number; completate: number | null; perfetti: number | null }>(),
    db.prepare('SELECT COUNT(*) AS n FROM cruciverba_schemi_liberi').first<{ n: number }>(),
  ])
  const giocate = mie?.giocate ?? 0
  return {
    giocate,
    completate: mie?.completate ?? 0,
    senzaAiuti: mie?.perfetti ?? 0,
    disponibili: Math.max(0, (scorta?.n ?? 0) - giocate),
  }
}

/* ────────────────────────────  La classifica  ─────────────────────────── */

export interface TotaliCruciverba {
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
 * Mette in fila i giocatori del cruciverba.
 *
 * L'ordine: **punti** del periodo — contano solo i cruciverba completati —
 * poi il **tempo**, piu' corto prima: due cruciverba completati senza aiuti
 * valgono il tetto a testa, e fra i due passa avanti chi ci ha messo meno.
 * Chi ha una partita aperta e nessuna chiusa sta in fondo, con la sua etichetta.
 * Infine il nickname, perché due righe identiche non si scambino di posto.
 */
export function ordinaCruciverba(giocatori: TotaliCruciverba[]): CruciverbaRow[] {
  const inFila = [...giocatori].sort((a, b) => {
    if (a.punti !== b.punti) return b.punti - a.punti
    if ((a.giornate > 0) !== (b.giornate > 0)) return a.giornate > 0 ? -1 : 1
    if (a.tempoMs !== b.tempoMs) return a.tempoMs - b.tempoMs
    return a.nickname.localeCompare(b.nickname, 'it', { sensitivity: 'base' })
  })
  return inFila.map((g, i) => ({ rank: i + 1, ...g }))
}

interface AggregatoRow {
  player_id: string
  nickname: string
  display_name: string
  avatar_color: string
  punti: number
  giornate: number
  tempo: number
  in_corso: number
}

export async function classificaCruciverba(
  db: D1Database,
  periodo: PeriodoClassifica,
  numeroDiOggi: number,
  viewerId: string,
): Promise<CruciverbaLeaderboard> {
  /*
   * Contano i completati. Una partita aperta ieri e mai finita non e' niente —
   * ne' punti ne' giornate — mentre quella aperta oggi fa comparire il
   * giocatore con l'etichetta "in corso", come nelle altre classifiche.
   */
  const { results } = await db
    .prepare(
      `SELECT p.id           AS player_id,
              p.nickname     AS nickname,
              p.display_name AS display_name,
              p.avatar_color AS avatar_color,
              COALESCE(SUM(CASE WHEN g.status = 'done' THEN g.score END), 0)    AS punti,
              SUM(CASE WHEN g.status = 'done' THEN 1 ELSE 0 END)               AS giornate,
              COALESCE(SUM(CASE WHEN g.status = 'done' THEN g.tempo_ms END), 0) AS tempo,
              MAX(CASE WHEN g.puzzle_number = ? AND g.status = 'playing'
                       THEN 1 ELSE 0 END)                                      AS in_corso
         FROM players p
         JOIN cruciverba_games g ON g.player_id = p.id AND g.puzzle_number BETWEEN ? AND ?
        GROUP BY p.id
       HAVING giornate > 0 OR in_corso = 1`,
    )
    .bind(numeroDiOggi, periodo.da, periodo.a)
    .all<AggregatoRow>()

  const rows = ordinaCruciverba(
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

/**
 * Accesso ai dati della battaglia navale: chi e' online, le sfide, le partite.
 *
 * La partita salva le flotte e i colpi, e nient'altro: di chi e' il turno, com'e'
 * andato ogni colpo, quali navi sono a fondo si ricalcolano da li'. La flotta
 * dell'avversario non esce da qui finché la partita non e' finita — `vistaPer`
 * manda solo le navi gia' affondate, che ormai sono sotto gli occhi di tutti.
 */

import {
  BATTAGLIA_ABBANDONATA_MS,
  BATTAGLIA_ATTESA_FLOTTA_MS,
  BATTAGLIA_ATTESA_TURNO_MS,
  PRESENZA_ONLINE_MS,
  PRESENZA_SCRITTURA_MS,
  SFIDA_SCADENZA_MS,
} from '../../shared/config'
import { esitoDelColpo, naviAffondate, type Nave } from '../../shared/battaglia'
import type {
  Attivita,
  BattagliaLeaderboard,
  BattagliaRow,
  ColpoVisto,
  GiocatoreBreve,
  GiocatoreOnline,
  InvitoBattaglia,
  InvitoInviato,
  LeaderboardScope,
  PartitaBreve,
  StatoBattaglia,
  VistaBattaglia,
} from '../../shared/types'
import { fail, newId, nowIso } from './http'

export type Lato = 'a' | 'b'

export const ATTIVITA: readonly Attivita[] = [
  'hub',
  'wordle',
  'scarabeo',
  'cruciverba',
  'battaglia',
  'classifica',
  'profilo',
  'altro',
]

export interface PartitaRow {
  id: string
  giocatore_a: string
  giocatore_b: string
  stato: StatoBattaglia
  flotta_a: string | null
  flotta_b: string | null
  primo: Lato | null
  colpi: string
  vincitore: Lato | null
  motivo: 'flotta' | 'resa' | 'assenza' | null
  versione: number
  created_at: string
  updated_at: string
  finita_at: string | null
}

interface GiocatoreRow {
  id: string
  nickname: string
  display_name: string
  avatar_color: string
}

function breve(r: GiocatoreRow): GiocatoreBreve {
  return {
    playerId: r.id,
    nickname: r.nickname,
    displayName: r.display_name || r.nickname,
    avatarColor: r.avatar_color,
  }
}

function prima(adesso: number, ms: number): string {
  return new Date(adesso - ms).toISOString()
}

export function altro(lato: Lato): Lato {
  return lato === 'a' ? 'b' : 'a'
}

/* ─────────────────────────────  La presenza  ───────────────────────────── */

/**
 * Segna il giocatore come presente, e dove.
 *
 * Non a ogni giro: il giro di controllo parte ogni otto secondi da ogni
 * schermata aperta, e una scrittura per giro sarebbero decine di migliaia al
 * giorno. La condizione nel `DO UPDATE` lascia passare la scrittura solo se
 * l'ultima e' vecchia di venti secondi o se l'attivita' e' cambiata.
 */
export async function segnaPresenza(
  db: D1Database,
  playerId: string,
  attivita: Attivita,
  adesso: number,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO presenza (player_id, visto_at, attivita) VALUES (?, ?, ?)
       ON CONFLICT (player_id) DO UPDATE
          SET visto_at = excluded.visto_at, attivita = excluded.attivita
        WHERE presenza.visto_at < ? OR presenza.attivita != excluded.attivita`,
    )
    .bind(playerId, new Date(adesso).toISOString(), attivita, prima(adesso, PRESENZA_SCRITTURA_MS))
    .run()
}

export async function eOnline(db: D1Database, playerId: string, adesso: number): Promise<boolean> {
  const riga = await db
    .prepare('SELECT 1 AS si FROM presenza WHERE player_id = ? AND visto_at >= ?')
    .bind(playerId, prima(adesso, PRESENZA_ONLINE_MS))
    .first<{ si: number }>()
  return riga !== null
}

/**
 * Chi e' in una partita aperta, cioe' non finita e mossa di recente: serve a
 * dire chi e' occupato. `soglia` e' il segnaposto del parametro con l'istante
 * oltre il quale una partita ferma non conta piu' (vedi BATTAGLIA_ABBANDONATA_MS).
 */
function aperte(soglia: string): string {
  return `SELECT giocatore_a AS g FROM battaglia_partite WHERE stato != 'finita' AND updated_at >= ${soglia}
          UNION SELECT giocatore_b FROM battaglia_partite WHERE stato != 'finita' AND updated_at >= ${soglia}`
}

function sogliaAbbandono(adesso: number): string {
  return prima(adesso, BATTAGLIA_ABBANDONATA_MS)
}

/**
 * Chi e' online adesso, tranne chi guarda.
 *
 * Con due informazioni per ciascuno: se e' gia' in una battaglia (e allora non
 * si puo' sfidare) e se ha gia' una sfida tua che aspetta risposta.
 */
export async function giocatoriOnline(
  db: D1Database,
  ioId: string,
  adesso: number,
): Promise<GiocatoreOnline[]> {
  const { results } = await db
    .prepare(
      `SELECT p.id, p.nickname, p.display_name, p.avatar_color, pr.attivita,
              p.id IN (${aperte('?4')}) AS occupato,
              EXISTS (SELECT 1 FROM battaglia_inviti i
                       WHERE i.da_id = ?1 AND i.a_id = p.id AND i.stato = 'attesa'
                         AND i.created_at >= ?3) AS invitato
         FROM presenza pr
         JOIN players p ON p.id = pr.player_id
        WHERE pr.visto_at >= ?2 AND p.id != ?1
        ORDER BY occupato, p.display_name COLLATE NOCASE`,
    )
    .bind(ioId, prima(adesso, PRESENZA_ONLINE_MS), prima(adesso, SFIDA_SCADENZA_MS), sogliaAbbandono(adesso))
    .all<GiocatoreRow & { attivita: Attivita; occupato: number; invitato: number }>()

  return results.map((r) => ({
    ...breve(r),
    attivita: r.attivita,
    occupato: r.occupato === 1,
    invitato: r.invitato === 1,
  }))
}

export async function quantiOnline(db: D1Database, ioId: string, adesso: number): Promise<number> {
  const riga = await db
    .prepare('SELECT COUNT(*) AS n FROM presenza WHERE visto_at >= ? AND player_id != ?')
    .bind(prima(adesso, PRESENZA_ONLINE_MS), ioId)
    .first<{ n: number }>()
  return riga?.n ?? 0
}

/* ──────────────────────────────  Le sfide  ─────────────────────────────── */

interface InvitoRow {
  id: string
  da_id: string
  a_id: string
  stato: 'attesa' | 'accettato' | 'rifiutato' | 'annullato'
  partita_id: string | null
  created_at: string
  risposto_at: string | null
}

export async function invitoPerId(db: D1Database, id: string): Promise<InvitoRow | null> {
  return db.prepare('SELECT * FROM battaglia_inviti WHERE id = ?').bind(id).first<InvitoRow>()
}

function scadeTra(createdAt: string, adesso: number): number {
  return Math.max(0, Date.parse(createdAt) + SFIDA_SCADENZA_MS - adesso)
}

/** Le sfide arrivate e ancora valide: non scadute, e da chi non e' finito in un'altra partita. */
export async function sfideRicevute(
  db: D1Database,
  ioId: string,
  adesso: number,
): Promise<InvitoBattaglia[]> {
  const { results } = await db
    .prepare(
      `SELECT i.id AS invito_id, i.created_at, p.id, p.nickname, p.display_name, p.avatar_color
         FROM battaglia_inviti i
         JOIN players p ON p.id = i.da_id
        WHERE i.a_id = ?1 AND i.stato = 'attesa' AND i.created_at >= ?2
          AND i.da_id NOT IN (${aperte('?3')})
        ORDER BY i.created_at`,
    )
    .bind(ioId, prima(adesso, SFIDA_SCADENZA_MS), sogliaAbbandono(adesso))
    .all<GiocatoreRow & { invito_id: string; created_at: string }>()

  return results.map((r) => ({
    id: r.invito_id,
    da: breve(r),
    createdAt: r.created_at,
    scadeTraMs: scadeTra(r.created_at, adesso),
  }))
}

/** Le sfide mandate negli ultimi minuti, con com'e' andata: la sala d'attesa le mostra. */
export async function sfideMandate(
  db: D1Database,
  ioId: string,
  adesso: number,
): Promise<InvitoInviato[]> {
  const { results } = await db
    .prepare(
      `SELECT i.id AS invito_id, i.stato, i.partita_id, i.created_at,
              p.id, p.nickname, p.display_name, p.avatar_color
         FROM battaglia_inviti i
         JOIN players p ON p.id = i.a_id
        WHERE i.da_id = ? AND i.created_at >= ?
        ORDER BY i.created_at DESC
        LIMIT 5`,
    )
    .bind(ioId, prima(adesso, SFIDA_SCADENZA_MS * 3))
    .all<GiocatoreRow & { invito_id: string; stato: InvitoRow['stato']; partita_id: string | null; created_at: string }>()

  return results.map((r) => {
    const scaduto = r.stato === 'attesa' && scadeTra(r.created_at, adesso) === 0
    return {
      id: r.invito_id,
      a: breve(r),
      stato: scaduto ? 'scaduto' : r.stato,
      partitaId: r.partita_id,
      scadeTraMs: r.stato === 'attesa' ? scadeTra(r.created_at, adesso) : 0,
    }
  })
}

/**
 * Manda una sfida. Una sola alla volta: la nuova annulla quella che aspettava
 * ancora, altrimenti due accettazioni ravvicinate aprirebbero due partite.
 */
export async function mandaSfida(
  db: D1Database,
  daId: string,
  aId: string,
  adesso: number,
): Promise<string> {
  const id = newId('sfi')
  const quando = new Date(adesso).toISOString()
  await db.batch([
    db
      .prepare(
        `UPDATE battaglia_inviti SET stato = 'annullato', risposto_at = ?
          WHERE da_id = ? AND stato = 'attesa'`,
      )
      .bind(quando, daId),
    db
      .prepare(
        `INSERT INTO battaglia_inviti (id, da_id, a_id, stato, created_at)
         VALUES (?, ?, ?, 'attesa', ?)`,
      )
      .bind(id, daId, aId, quando),
  ])
  return id
}

/**
 * Accetta una sfida e apre la partita, in un colpo solo.
 *
 * D1 non ha transazioni interattive, ma un `batch` e' atomico: la partita si
 * crea solo se la sfida e' ancora in attesa, non e' scaduta e nessuno dei due
 * e' gia' in un'altra partita — tutto dentro la stessa istruzione. Poi, nello
 * stesso batch, la sfida passa ad accettata e le altre sfide dei due si
 * annullano. Due accettazioni ravvicinate non aprono due partite.
 */
export async function accettaSfida(
  db: D1Database,
  invito: InvitoRow,
  adesso: number,
): Promise<string> {
  const partitaId = newId('bat')
  const quando = new Date(adesso).toISOString()
  const [creata] = await db.batch([
    db
      .prepare(
        `INSERT INTO battaglia_partite
           (id, giocatore_a, giocatore_b, stato, colpi, versione, created_at, updated_at)
         SELECT ?1, i.da_id, i.a_id, 'disposizione', '[]', 0, ?2, ?2
           FROM battaglia_inviti i
          WHERE i.id = ?3 AND i.stato = 'attesa' AND i.created_at >= ?4
            AND i.da_id NOT IN (${aperte('?5')}) AND i.a_id NOT IN (${aperte('?5')})`,
      )
      .bind(partitaId, quando, invito.id, prima(adesso, SFIDA_SCADENZA_MS), sogliaAbbandono(adesso)),
    db
      .prepare(
        `UPDATE battaglia_inviti SET stato = 'accettato', partita_id = ?1, risposto_at = ?2
          WHERE id = ?3 AND stato = 'attesa'
            AND EXISTS (SELECT 1 FROM battaglia_partite WHERE id = ?1)`,
      )
      .bind(partitaId, quando, invito.id),
    db
      .prepare(
        `UPDATE battaglia_inviti SET stato = 'annullato', risposto_at = ?1
          WHERE stato = 'attesa' AND id != ?2
            AND (da_id IN (?3, ?4) OR a_id IN (?3, ?4))
            AND EXISTS (SELECT 1 FROM battaglia_partite WHERE id = ?5)`,
      )
      .bind(quando, invito.id, invito.da_id, invito.a_id, partitaId),
  ])

  if (creata.meta.changes !== 1) {
    if (invito.stato !== 'attesa') fail(409, 'SFIDA_CHIUSA', 'Questa sfida non è più valida.')
    if (scadeTra(invito.created_at, adesso) === 0) {
      fail(409, 'SFIDA_SCADUTA', 'La sfida è scaduta: chiedi di mandartene un’altra.')
    }
    fail(409, 'OCCUPATO', 'Uno dei due sta già giocando un’altra battaglia.')
  }
  return partitaId
}

/* ─────────────────────────────  Le partite  ────────────────────────────── */

export async function partitaPerId(db: D1Database, id: string): Promise<PartitaRow | null> {
  return db.prepare('SELECT * FROM battaglia_partite WHERE id = ?').bind(id).first<PartitaRow>()
}

/** La partita aperta di un giocatore, se ne ha una: non finita, e mossa di recente. */
export async function partitaAperta(
  db: D1Database,
  playerId: string,
  adesso: number = Date.now(),
): Promise<PartitaRow | null> {
  return db
    .prepare(
      `SELECT * FROM battaglia_partite
        WHERE stato != 'finita' AND (giocatore_a = ?1 OR giocatore_b = ?1) AND updated_at >= ?2
        ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(playerId, sogliaAbbandono(adesso))
    .first<PartitaRow>()
}

export function latoDi(row: PartitaRow, playerId: string): Lato | null {
  if (row.giocatore_a === playerId) return 'a'
  if (row.giocatore_b === playerId) return 'b'
  return null
}

export function flottaDi(row: PartitaRow, lato: Lato): Nave[] | null {
  const testo = lato === 'a' ? row.flotta_a : row.flotta_b
  if (!testo) return null
  try {
    return JSON.parse(testo) as Nave[]
  } catch {
    return null
  }
}

export function colpiDi(row: PartitaRow): number[] {
  try {
    const valore = JSON.parse(row.colpi) as unknown
    return Array.isArray(valore) ? valore.filter((k): k is number => Number.isInteger(k)) : []
  } catch {
    return []
  }
}

/** Chi spara il colpo numero `i`: i pari sono di chi ha cominciato. */
export function tiratore(i: number, primo: Lato): Lato {
  return i % 2 === 0 ? primo : altro(primo)
}

export function diTurno(row: PartitaRow): Lato | null {
  if (row.stato !== 'battaglia' || !row.primo) return null
  return tiratore(colpiDi(row).length, row.primo)
}

/** I colpi sparati da un lato, nell'ordine, con il loro esito sulla flotta dell'altro. */
export function colpiDelLato(row: PartitaRow, lato: Lato): ColpoVisto[] {
  if (!row.primo) return []
  const bersaglio = flottaDi(row, altro(lato)) ?? []
  const presi = new Set<number>()
  const visti: ColpoVisto[] = []
  colpiDi(row).forEach((k, i) => {
    if (tiratore(i, row.primo!) !== lato) return
    const { esito, nave } = esitoDelColpo(bersaglio, presi, k)
    presi.add(k)
    visti.push({ casella: k, esito, nave: esito === 'affondato' ? nave : null })
  })
  return visti
}

/** Quanto aspettare, e se si puo' gia' chiedere la vittoria a tavolino. */
export function reclamo(row: PartitaRow, io: Lato, adesso: number): { attesaMs: number; puoi: boolean } {
  const attesaMs = Math.max(0, adesso - Date.parse(row.updated_at))
  if (row.stato === 'battaglia') {
    return { attesaMs, puoi: diTurno(row) === altro(io) && attesaMs >= BATTAGLIA_ATTESA_TURNO_MS }
  }
  if (row.stato === 'disposizione') {
    const pronto = flottaDi(row, io) !== null
    const avversarioPronto = flottaDi(row, altro(io)) !== null
    return { attesaMs, puoi: pronto && !avversarioPronto && attesaMs >= BATTAGLIA_ATTESA_FLOTTA_MS }
  }
  return { attesaMs, puoi: false }
}

async function giocatore(db: D1Database, id: string): Promise<GiocatoreBreve> {
  const r = await db
    .prepare('SELECT id, nickname, display_name, avatar_color FROM players WHERE id = ?')
    .bind(id)
    .first<GiocatoreRow>()
  if (!r) throw new Error(`Giocatore ${id} sparito da una partita`)
  return breve(r)
}

/** La partita vista da uno dei due: la propria flotta intera, dell'altra solo quel che si e' scoperto. */
export async function vistaPer(
  db: D1Database,
  row: PartitaRow,
  io: Lato,
  adesso: number,
): Promise<VistaBattaglia> {
  const idAvversario = io === 'a' ? row.giocatore_b : row.giocatore_a
  const [avversario, online] = await Promise.all([
    giocatore(db, idAvversario),
    eOnline(db, idAvversario, adesso),
  ])

  const mia = flottaDi(row, io)
  const sua = flottaDi(row, altro(io))
  const colpiMiei = colpiDelLato(row, io)
  const colpiSubiti = colpiDelLato(row, altro(io))
  const colpi = colpiDi(row)
  const finita = row.stato === 'finita'

  let ultimo: VistaBattaglia['ultimo'] = null
  if (colpi.length > 0 && row.primo) {
    const mio = tiratore(colpi.length - 1, row.primo) === io
    const elenco = mio ? colpiMiei : colpiSubiti
    ultimo = { ...elenco[elenco.length - 1], mio }
  }

  const { attesaMs, puoi } = reclamo(row, io, adesso)
  return {
    id: row.id,
    stato: row.stato,
    avversario: { ...avversario, online },
    miaFlotta: mia,
    avversarioPronto: sua !== null,
    tuoTurno: diTurno(row) === io,
    colpiMiei,
    colpiSubiti,
    affondateNemiche: sua ? naviAffondate(sua, new Set(colpiMiei.map((c) => c.casella))) : [],
    flottaNemica: finita ? sua : null,
    ultimo,
    vincitore: row.vincitore ? (row.vincitore === io ? 'io' : 'avversario') : null,
    motivo: row.motivo,
    attesaMs,
    puoiReclamare: puoi,
    versione: row.versione,
  }
}

/** La partita in breve, per l'hub e per il giro di controllo. */
export async function partitaBreve(db: D1Database, row: PartitaRow, io: Lato): Promise<PartitaBreve> {
  return {
    id: row.id,
    stato: row.stato,
    avversario: await giocatore(db, io === 'a' ? row.giocatore_b : row.giocatore_a),
    tuoTurno: diTurno(row) === io,
  }
}

export interface CambiPartita {
  stato?: StatoBattaglia
  flotta_a?: string | null
  flotta_b?: string | null
  primo?: Lato | null
  colpi?: string
  vincitore?: Lato | null
  motivo?: PartitaRow['motivo']
}

/**
 * Scrive la partita, condizionata alla versione letta: due colpi ravvicinati —
 * un doppio tocco, o due schede aperte — non devono poter sparare due volte
 * nello stesso turno. Se la versione non regge, 409 e il client rilegge.
 */
export async function salvaPartita(
  db: D1Database,
  row: PartitaRow,
  cambi: CambiPartita,
  adesso: number,
): Promise<PartitaRow> {
  const dopo: PartitaRow = { ...row, ...cambi, versione: row.versione + 1, updated_at: new Date(adesso).toISOString() }
  if (dopo.stato === 'finita' && !row.finita_at) dopo.finita_at = dopo.updated_at

  const esito = await db
    .prepare(
      `UPDATE battaglia_partite
          SET stato = ?, flotta_a = ?, flotta_b = ?, primo = ?, colpi = ?, vincitore = ?,
              motivo = ?, versione = ?, updated_at = ?, finita_at = ?
        WHERE id = ? AND versione = ?`,
    )
    .bind(
      dopo.stato,
      dopo.flotta_a,
      dopo.flotta_b,
      dopo.primo,
      dopo.colpi,
      dopo.vincitore,
      dopo.motivo,
      dopo.versione,
      dopo.updated_at,
      dopo.finita_at,
      row.id,
      row.versione,
    )
    .run()

  if (esito.meta.changes !== 1) {
    fail(409, 'CONFLITTO', 'La partita è cambiata nel frattempo: ricarico.')
  }
  return dopo
}

/* ───────────────────────  Il record e la classifica  ───────────────────── */

export async function recordDi(db: D1Database, playerId: string): Promise<{ vinte: number; perse: number }> {
  const riga = await db
    .prepare(
      `SELECT
         SUM(CASE WHEN (giocatore_a = ?1 AND vincitore = 'a') OR (giocatore_b = ?1 AND vincitore = 'b')
                  THEN 1 ELSE 0 END) AS vinte,
         SUM(CASE WHEN (giocatore_a = ?1 AND vincitore = 'b') OR (giocatore_b = ?1 AND vincitore = 'a')
                  THEN 1 ELSE 0 END) AS perse
         FROM battaglia_partite
        WHERE stato = 'finita' AND (giocatore_a = ?1 OR giocatore_b = ?1)`,
    )
    .bind(playerId)
    .first<{ vinte: number | null; perse: number | null }>()
  return { vinte: riga?.vinte ?? 0, perse: riga?.perse ?? 0 }
}

/** Da quando conta ogni vista della classifica. `today` e' da mezzanotte italiana. */
function inizioFinestra(scope: LeaderboardScope, msAllaMezzanotte: number, adesso: number): string {
  const giorno = 86_400_000
  const oggi = adesso + msAllaMezzanotte - giorno
  const giorni = { today: 1, week: 7, month: 30, all: null }[scope]
  if (giorni === null) return '0000'
  return new Date(oggi - (giorni - 1) * giorno).toISOString()
}

/**
 * La classifica della battaglia navale: vittorie, poi meno sconfitte, poi il
 * nickname. Le vittorie e non la percentuale: con due partite in tutto, un
 * cento per cento vale meno di sette vittorie su dieci.
 */
export function ordinaBattaglia(righe: Omit<BattagliaRow, 'rank'>[]): BattagliaRow[] {
  return [...righe]
    .sort((x, y) => {
      if (x.vinte !== y.vinte) return y.vinte - x.vinte
      if (x.perse !== y.perse) return x.perse - y.perse
      return x.nickname.localeCompare(y.nickname, 'it', { sensitivity: 'base' })
    })
    .map((r, i) => ({ rank: i + 1, ...r }))
}

export async function classificaBattaglia(
  db: D1Database,
  scope: LeaderboardScope,
  msAllaMezzanotte: number,
  viewerId: string,
  adesso: number,
): Promise<BattagliaLeaderboard> {
  const { results } = await db
    .prepare(
      `WITH esiti AS (
         SELECT giocatore_a AS player_id, CASE WHEN vincitore = 'a' THEN 1 ELSE 0 END AS vinta
           FROM battaglia_partite WHERE stato = 'finita' AND finita_at >= ?1
         UNION ALL
         SELECT giocatore_b, CASE WHEN vincitore = 'b' THEN 1 ELSE 0 END
           FROM battaglia_partite WHERE stato = 'finita' AND finita_at >= ?1
       )
       SELECT p.id, p.nickname, p.display_name, p.avatar_color,
              SUM(e.vinta) AS vinte, SUM(1 - e.vinta) AS perse
         FROM esiti e JOIN players p ON p.id = e.player_id
        GROUP BY p.id`,
    )
    .bind(inizioFinestra(scope, msAllaMezzanotte, adesso))
    .all<GiocatoreRow & { vinte: number; perse: number }>()

  const rows = ordinaBattaglia(results.map((r) => ({ ...breve(r), vinte: r.vinte, perse: r.perse })))
  return { scope, updatedAt: nowIso(), rows, me: rows.find((r) => r.playerId === viewerId) ?? null }
}

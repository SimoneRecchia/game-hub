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
  LINK_SCADENZA_MS,
  PRESENZA_ONLINE_MS,
  PRESENZA_SCRITTURA_MS,
  SFIDA_SCADENZA_MS,
} from '../../shared/config'
import { disponiACaso, esitoDelColpo, naviAffondate, type Nave } from '../../shared/battaglia'
import { casoDelColpo, colpoDelComputer, type LivelloBattaglia } from '../../shared/battaglia-computer'
import { mulberry32 } from '../../shared/daily'
import type {
  Attivita,
  ColpoVisto,
  GiocatoreBreve,
  GiocatoreOnline,
  InvitoBattaglia,
  InvitoConLink,
  InvitoInviato,
  LinkBattaglia,
  ModalitaBattaglia,
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
  'sudoku',
  'battaglia',
  'quiz',
  'tris',
  'nomi',
  'indovina',
  'scacchi',
  'dama',
  'forza4',
  'go',
  'ruota',
  'fortuna',
  'slot',
  'blackjack',
  'lupus',
  'classifica',
  'profilo',
  'altro',
]

export interface PartitaRow {
  id: string
  modalita: ModalitaBattaglia
  giocatore_a: string
  /** NULL contro il computer: il lato `b` e' lui. */
  giocatore_b: string | null
  livello: LivelloBattaglia | null
  seme: number | null
  puzzle_number: number | null
  punti: number | null
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
  /** Fra amici: le vittorie di ciascuno nelle partite di prima della serie, e quante erano. */
  serie_a: number
  serie_b: number
  partite_serie: number
}

interface GiocatoreRow {
  id: string
  nickname: string
  display_name: string
  avatar_color: string
}

/** Il computer, quando e' l'avversario: non e' un giocatore, ma si mostra come uno. */
export const COMPUTER: GiocatoreBreve = {
  playerId: 'computer',
  nickname: 'computer',
  displayName: 'Il computer',
  avatarColor: '#5b6475',
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
  // Solo fra amici: chi gioca contro il computer puo' essere sfidato, e la
  // partita col computer resta li' ad aspettarlo.
  return `SELECT giocatore_a AS g FROM battaglia_partite
           WHERE modalita = 'amici' AND stato != 'finita' AND updated_at >= ${soglia}
          UNION SELECT giocatore_b FROM battaglia_partite
           WHERE modalita = 'amici' AND stato != 'finita' AND updated_at >= ${soglia}`
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

/* ──────────────────────────────  Le sfide  ─────────────────────────────── */

interface InvitoRow {
  id: string
  da_id: string
  a_id: string
  stato: 'attesa' | 'accettato' | 'rifiutato' | 'annullato'
  partita_id: string | null
  created_at: string
  risposto_at: string | null
  /** La partita di cui e' la rivincita. */
  rivincita_di: string | null
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
      `SELECT i.id AS invito_id, i.created_at, i.rivincita_di, p.id, p.nickname, p.display_name, p.avatar_color
         FROM battaglia_inviti i
         JOIN players p ON p.id = i.da_id
        WHERE i.a_id = ?1 AND i.stato = 'attesa' AND i.created_at >= ?2
          AND i.da_id NOT IN (${aperte('?3')})
        ORDER BY i.created_at`,
    )
    .bind(ioId, prima(adesso, SFIDA_SCADENZA_MS), sogliaAbbandono(adesso))
    .all<GiocatoreRow & { invito_id: string; created_at: string; rivincita_di: string | null }>()

  return results.map((r) => ({
    id: r.invito_id,
    da: breve(r),
    createdAt: r.created_at,
    scadeTraMs: scadeTra(r.created_at, adesso),
    rivincita: r.rivincita_di !== null,
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
  rivincitaDi: string | null = null,
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
        `INSERT INTO battaglia_inviti (id, da_id, a_id, stato, created_at, rivincita_di)
         VALUES (?, ?, ?, 'attesa', ?, ?)`,
      )
      .bind(id, daId, aId, quando, rivincitaDi),
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
  const serie = invito.rivincita_di ? await serieDopo(db, invito.rivincita_di, invito.da_id, invito.a_id) : null
  const [creata] = await db.batch([
    db
      .prepare(
        `INSERT INTO battaglia_partite
           (id, modalita, giocatore_a, giocatore_b, stato, colpi, versione, created_at, updated_at,
            serie_a, serie_b, partite_serie)
         SELECT ?1, 'amici', i.da_id, i.a_id, 'disposizione', '[]', 0, ?2, ?2, ?6, ?7, ?8
           FROM battaglia_inviti i
          WHERE i.id = ?3 AND i.stato = 'attesa' AND i.created_at >= ?4
            AND i.da_id NOT IN (${aperte('?5')}) AND i.a_id NOT IN (${aperte('?5')})`,
      )
      .bind(
        partitaId,
        quando,
        invito.id,
        prima(adesso, SFIDA_SCADENZA_MS),
        sogliaAbbandono(adesso),
        serie?.a ?? 0,
        serie?.b ?? 0,
        serie?.partite ?? 0,
      ),
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
      fail(409, 'SFIDA_SCADUTA', 'La sfida è scaduta.')
    }
    fail(409, 'OCCUPATO', 'Uno dei due sta già giocando un’altra battaglia.')
  }
  return partitaId
}

/**
 * La serie dopo una partita, per quella che viene: le vittorie di ciascuno
 * contate per giocatore, perché nella rivincita chi sfida e' 'a' e puo' essere
 * stato 'b' nella partita di prima.
 */
async function serieDopo(
  db: D1Database,
  partitaId: string,
  nuovoA: string,
  nuovoB: string,
): Promise<{ a: number; b: number; partite: number } | null> {
  const prima = await partitaPerId(db, partitaId)
  if (!prima || prima.modalita !== 'amici' || prima.stato !== 'finita') return null
  const vinte = (id: string) => {
    const lato: Lato | null = prima.giocatore_a === id ? 'a' : prima.giocatore_b === id ? 'b' : null
    if (!lato) return 0
    return (lato === 'a' ? prima.serie_a : prima.serie_b) + (prima.vincitore === lato ? 1 : 0)
  }
  return { a: vinte(nuovoA), b: vinte(nuovoB), partite: prima.partite_serie + 1 }
}

/** L'ultima rivincita chiesta per una partita, se c'e'. */
export async function rivincitaDi(db: D1Database, partitaId: string): Promise<InvitoRow | null> {
  return db
    .prepare('SELECT * FROM battaglia_inviti WHERE rivincita_di = ? ORDER BY created_at DESC LIMIT 1')
    .bind(partitaId)
    .first<InvitoRow>()
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
        WHERE modalita = 'amici' AND stato != 'finita'
          AND (giocatore_a = ?1 OR giocatore_b = ?1) AND updated_at >= ?2
        ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(playerId, sogliaAbbandono(adesso))
    .first<PartitaRow>()
}

export function latoDi(row: PartitaRow, playerId: string): Lato | null {
  if (row.giocatore_a === playerId) return 'a'
  if (row.giocatore_b !== null && row.giocatore_b === playerId) return 'b'
  return null
}

/** Contro il computer? Allora il lato `b` e' suo, e risponde da solo. */
export function controComputer(row: PartitaRow): boolean {
  return row.modalita !== 'amici'
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
  // Il computer risponde nella stessa richiesta: non c'e' mai da aspettarlo.
  if (controComputer(row)) return { attesaMs: 0, puoi: false }
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
  const [avversario, online] = idAvversario
    ? await Promise.all([giocatore(db, idAvversario), eOnline(db, idAvversario, adesso)])
    : [COMPUTER, true]
  const fraAmici = row.modalita === 'amici'
  const rivincita = fraAmici && row.stato === 'finita' ? await rivincitaDi(db, row.id) : null

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
    modalita: row.modalita,
    livello: row.livello,
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
    serie: fraAmici
      ? {
          io: io === 'a' ? row.serie_a : row.serie_b,
          avversario: io === 'a' ? row.serie_b : row.serie_a,
          partite: row.partite_serie,
        }
      : null,
    rivincita: rivincita
      ? {
          id: rivincita.id,
          da: rivincita.da_id === (io === 'a' ? row.giocatore_a : row.giocatore_b) ? 'io' : 'avversario',
          stato:
            rivincita.stato === 'attesa' && scadeTra(rivincita.created_at, adesso) === 0 ? 'scaduto' : rivincita.stato,
          partitaId: rivincita.partita_id,
        }
      : null,
  }
}

/** La partita in breve, per l'hub e per il giro di controllo. */
export async function partitaBreve(db: D1Database, row: PartitaRow, io: Lato): Promise<PartitaBreve> {
  const idAvversario = io === 'a' ? row.giocatore_b : row.giocatore_a
  return {
    id: row.id,
    modalita: row.modalita,
    stato: row.stato,
    avversario: idAvversario ? await giocatore(db, idAvversario) : COMPUTER,
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
  punti?: number | null
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
              motivo = ?, punti = ?, versione = ?, updated_at = ?, finita_at = ?
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
      dopo.punti,
      dopo.versione,
      dopo.updated_at,
      dopo.finita_at,
      row.id,
      row.versione,
    )
    .run()

  if (esito.meta.changes !== 1) {
    fail(409, 'CONFLITTO', 'La partita è cambiata: la ricarico.')
  }
  return dopo
}

/* ──────────────────────────  Il computer  ─────────────────────────── */

/**
 * Il prossimo colpo del computer, dati i colpi che ha gia' sparato: sa quel che
 * saprebbe un giocatore — gli esiti, e il nome delle navi che ha affondato.
 */
export function colpoDelComputerIn(row: PartitaRow): number {
  const suoi = colpiDelLato(row, 'b')
  return colpoDelComputer(
    suoi,
    row.livello ?? 'facile',
    casoDelColpo(row.seme ?? 0, suoi.length),
  )
}

/** La partita libera aperta contro il computer, se c'e'. */
export async function partitaComputerAperta(db: D1Database, playerId: string): Promise<PartitaRow | null> {
  return db
    .prepare(
      `SELECT * FROM battaglia_partite
        WHERE modalita = 'computer' AND giocatore_a = ? AND stato != 'finita'
        ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(playerId)
    .first<PartitaRow>()
}

/**
 * Una partita libera contro il computer, al livello scelto.
 *
 * Quella aperta, se c'e', si riusa quando non e' ancora cominciata — basta
 * cambiarle il livello — e conta come persa se era gia' in battaglia:
 * ricominciare non deve essere un modo di cancellare una sconfitta.
 */
export async function nuovaControComputer(
  db: D1Database,
  playerId: string,
  livello: LivelloBattaglia,
): Promise<PartitaRow> {
  const aperta = await partitaComputerAperta(db, playerId)
  const adesso = nowIso()
  if (aperta && aperta.stato === 'disposizione') {
    await db
      .prepare('UPDATE battaglia_partite SET livello = ?, updated_at = ? WHERE id = ?')
      .bind(livello, adesso, aperta.id)
      .run()
    return { ...aperta, livello, updated_at: adesso }
  }
  if (aperta) {
    await db
      .prepare(
        `UPDATE battaglia_partite SET stato = 'finita', vincitore = 'b', motivo = 'resa',
                versione = versione + 1, updated_at = ?, finita_at = ?
          WHERE id = ? AND stato != 'finita'`,
      )
      .bind(adesso, adesso, aperta.id)
      .run()
  }

  const seme = crypto.getRandomValues(new Uint32Array(1))[0]
  const row: PartitaRow = {
    id: newId('bat'),
    modalita: 'computer',
    giocatore_a: playerId,
    giocatore_b: null,
    livello,
    seme,
    puzzle_number: null,
    punti: null,
    stato: 'disposizione',
    flotta_a: null,
    flotta_b: JSON.stringify(disponiACaso(mulberry32(seme ^ 0x5eed))),
    primo: null,
    colpi: '[]',
    vincitore: null,
    motivo: null,
    versione: 0,
    created_at: adesso,
    updated_at: adesso,
    finita_at: null,
    serie_a: 0,
    serie_b: 0,
    partite_serie: 0,
  }
  await db
    .prepare(
      `INSERT INTO battaglia_partite
         (id, modalita, giocatore_a, giocatore_b, livello, seme, stato, flotta_b, colpi, versione,
          created_at, updated_at)
       VALUES (?, 'computer', ?, NULL, ?, ?, 'disposizione', ?, '[]', 0, ?, ?)`,
    )
    .bind(row.id, playerId, livello, seme, row.flotta_b, adesso, adesso)
    .run()
  return row
}

/* ─────────────────────────────────  I record  ─────────────────────────────── */

/** Contro gli amici: le partite contro il computer non entrano qui. */
export async function recordDi(db: D1Database, playerId: string): Promise<{ vinte: number; perse: number }> {
  const riga = await db
    .prepare(
      `SELECT
         SUM(CASE WHEN (giocatore_a = ?1 AND vincitore = 'a') OR (giocatore_b = ?1 AND vincitore = 'b')
                  THEN 1 ELSE 0 END) AS vinte,
         SUM(CASE WHEN (giocatore_a = ?1 AND vincitore = 'b') OR (giocatore_b = ?1 AND vincitore = 'a')
                  THEN 1 ELSE 0 END) AS perse
         FROM battaglia_partite
        WHERE modalita = 'amici' AND stato = 'finita' AND (giocatore_a = ?1 OR giocatore_b = ?1)`,
    )
    .bind(playerId)
    .first<{ vinte: number | null; perse: number | null }>()
  return { vinte: riga?.vinte ?? 0, perse: riga?.perse ?? 0 }
}

/** Contro il computer, nelle partite libere, per livello. */
export async function recordControComputer(
  db: D1Database,
  playerId: string,
): Promise<Record<LivelloBattaglia, { vinte: number; perse: number }>> {
  const { results } = await db
    .prepare(
      `SELECT livello,
              SUM(CASE WHEN vincitore = 'a' THEN 1 ELSE 0 END) AS vinte,
              SUM(CASE WHEN vincitore = 'b' THEN 1 ELSE 0 END) AS perse
         FROM battaglia_partite
        WHERE modalita = 'computer' AND giocatore_a = ? AND stato = 'finita'
        GROUP BY livello`,
    )
    .bind(playerId)
    .all<{ livello: LivelloBattaglia; vinte: number; perse: number }>()
  const record = {
    facile: { vinte: 0, perse: 0 },
    normale: { vinte: 0, perse: 0 },
    difficile: { vinte: 0, perse: 0 },
  }
  for (const r of results) if (r.livello in record) record[r.livello] = { vinte: r.vinte, perse: r.perse }
  return record
}

/* ───────────────────────────  Gli inviti col link  ─────────────────────── */

interface LinkRow {
  codice: string
  da_id: string
  stato: 'attesa' | 'usato' | 'annullato'
  partita_id: string | null
  usato_da: string | null
  created_at: string
  usato_at: string | null
}

/** Senza lettere che si confondono (0/O, 1/I/L): il codice a volte si detta. */
const ALFABETO_LINK = 'abcdefghjkmnpqrstuvwxyz23456789'
const LUNGHEZZA_LINK = 10

export function nuovoCodice(): string {
  const casuali = crypto.getRandomValues(new Uint8Array(LUNGHEZZA_LINK))
  return [...casuali].map((b) => ALFABETO_LINK[b % ALFABETO_LINK.length]).join('')
}

function scadenzaLink(row: Pick<LinkRow, 'created_at'>, adesso: number): number {
  return Math.max(0, Date.parse(row.created_at) + LINK_SCADENZA_MS - adesso)
}

/** L'invito col link ancora valido di un giocatore, se ne ha uno. */
export async function linkAttivo(db: D1Database, playerId: string, adesso: number): Promise<LinkBattaglia | null> {
  const row = await db
    .prepare(
      `SELECT * FROM battaglia_link WHERE da_id = ? AND stato = 'attesa' AND created_at >= ?
        ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(playerId, prima(adesso, LINK_SCADENZA_MS))
    .first<LinkRow>()
  return row ? { codice: row.codice, createdAt: row.created_at, scadeTraMs: scadenzaLink(row, adesso) } : null
}

/** Un invito nuovo: uno alla volta, quello vecchio si annulla. */
export async function creaLink(db: D1Database, playerId: string, adesso: number): Promise<LinkBattaglia> {
  const codice = nuovoCodice()
  const quando = new Date(adesso).toISOString()
  await db.batch([
    db
      .prepare(`UPDATE battaglia_link SET stato = 'annullato' WHERE da_id = ? AND stato = 'attesa'`)
      .bind(playerId),
    db
      .prepare(`INSERT INTO battaglia_link (codice, da_id, stato, created_at) VALUES (?, ?, 'attesa', ?)`)
      .bind(codice, playerId, quando),
  ])
  return { codice, createdAt: quando, scadeTraMs: LINK_SCADENZA_MS }
}

export async function annullaLink(db: D1Database, playerId: string): Promise<void> {
  await db
    .prepare(`UPDATE battaglia_link SET stato = 'annullato' WHERE da_id = ? AND stato = 'attesa'`)
    .bind(playerId)
    .run()
}

async function linkPerCodice(db: D1Database, codice: string): Promise<LinkRow | null> {
  return db.prepare('SELECT * FROM battaglia_link WHERE codice = ?').bind(codice).first<LinkRow>()
}

/** L'invito come lo vede chi apre il link: chi invita e se vale ancora. Anche senza account. */
export async function invitoConLink(db: D1Database, codice: string, adesso: number): Promise<InvitoConLink | null> {
  const row = await linkPerCodice(db, codice)
  if (!row) return null
  const da = await giocatore(db, row.da_id)
  const scaduto = row.stato === 'attesa' && scadenzaLink(row, adesso) === 0
  return { codice: row.codice, da, stato: scaduto ? 'scaduto' : row.stato }
}

/**
 * Accetta un invito col link e apre la partita, in un colpo solo.
 *
 * Come per le sfide: un `batch` atomico che crea la partita solo se il link e'
 * ancora in attesa e valido e nessuno dei due e' in un'altra battaglia fra
 * amici, poi segna il link come usato e annulla le sfide in sospeso dei due.
 * Chi riapre un link che ha gia' usato ritrova la sua partita.
 */
export async function accettaLink(
  db: D1Database,
  codice: string,
  ospiteId: string,
  adesso: number,
): Promise<string> {
  const link = await linkPerCodice(db, codice)
  if (!link) fail(404, 'LINK_NON_TROVATO', 'Questo invito non esiste.')
  if (link.stato === 'usato' && link.usato_da === ospiteId && link.partita_id) return link.partita_id
  if (link.da_id === ospiteId) fail(409, 'LINK_TUO', 'È il tuo invito: mandalo a chi vuoi sfidare.')
  if (link.stato === 'usato') fail(409, 'LINK_USATO', 'Questo invito l’ha già accettato qualcun altro.')
  if (link.stato === 'annullato') fail(409, 'LINK_ANNULLATO', 'Questo invito è stato ritirato.')
  if (scadenzaLink(link, adesso) === 0) fail(409, 'LINK_SCADUTO', 'Questo invito è scaduto: chiedine uno nuovo.')

  const partitaId = newId('bat')
  const quando = new Date(adesso).toISOString()
  const [creata] = await db.batch([
    db
      .prepare(
        `INSERT INTO battaglia_partite
           (id, modalita, giocatore_a, giocatore_b, stato, colpi, versione, created_at, updated_at)
         SELECT ?1, 'amici', l.da_id, ?2, 'disposizione', '[]', 0, ?3, ?3
           FROM battaglia_link l
          WHERE l.codice = ?4 AND l.stato = 'attesa' AND l.created_at >= ?5
            AND l.da_id NOT IN (${aperte('?6')}) AND ?2 NOT IN (${aperte('?6')})`,
      )
      .bind(partitaId, ospiteId, quando, codice, prima(adesso, LINK_SCADENZA_MS), sogliaAbbandono(adesso)),
    db
      .prepare(
        `UPDATE battaglia_link SET stato = 'usato', usato_da = ?1, partita_id = ?2, usato_at = ?3
          WHERE codice = ?4 AND stato = 'attesa'
            AND EXISTS (SELECT 1 FROM battaglia_partite WHERE id = ?2)`,
      )
      .bind(ospiteId, partitaId, quando, codice),
    db
      .prepare(
        `UPDATE battaglia_inviti SET stato = 'annullato', risposto_at = ?1
          WHERE stato = 'attesa' AND (da_id IN (?2, ?3) OR a_id IN (?2, ?3))
            AND EXISTS (SELECT 1 FROM battaglia_partite WHERE id = ?4)`,
      )
      .bind(quando, link.da_id, ospiteId, partitaId),
  ])

  if (creata.meta.changes !== 1) {
    fail(409, 'OCCUPATO', 'Uno dei due sta già giocando un’altra battaglia: riprova fra poco.')
  }
  return partitaId
}

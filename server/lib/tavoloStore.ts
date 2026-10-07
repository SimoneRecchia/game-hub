/**
 * Accesso ai dati delle partite fra amici a scacchi, dama, Forza 4, go, tris e
 * Scarabeo: gli inviti, che sono gia' la partita, e la partita vista da
 * ciascuno dei due. Lo Scarabeo ha le tessere nascoste: la posizione salvata ha
 * il sacchetto, e ognuno ne vede solo la sua parte (`vistaDi` delle regole).
 *
 * E' lo stesso disegno di Indovina chi (server/lib/indovinaStore.ts): una riga
 * nasce invito e diventa partita quando l'altro accetta, con un `UPDATE`
 * condizionato allo stato; nello stesso momento si pesca chi muove per primo.
 * Poi ogni scrittura — una mossa, la resa, la patta — e' condizionata alla
 * versione letta, così un doppio tocco non muove due volte.
 *
 * Il server non sa giocare: controlla le mosse con le regole di ciascun gioco
 * (shared/tavolo-regole.ts) sulla posizione salvata, e basta. Nei giochi con il
 * tempo per mossa (il tris) controlla anche l'orologio: una mossa che non arriva
 * in tempo perde la partita, e lo applica la prima richiesta che arriva dopo
 * (`chiudiSeScaduta`), come il tempo delle domande del quiz.
 */

import {
  PRESENZA_ONLINE_MS,
  SFIDA_SCADENZA_MS,
  TAVOLO_ABBANDONATA_MS,
  TAVOLO_ATTESA_MASSIMA_MS,
  TAVOLO_ATTESA_MS,
  TAVOLO_CONSERVA_MS,
  TAVOLO_LINK_MS,
  TAVOLO_MARGINE_TEMPO_MS,
} from '../../shared/config'
import { inizialeDi, regoleDi } from '../../shared/tavolo-regole'
import type { GiocoAlTavolo, MotivoTavoliere, Parte } from '../../shared/tavolo'
import type {
  Attivita,
  GiocatoreBreve,
  GiocatoreOnline,
  InvitoConLink,
  InvitoTavolo,
  InvitoTavoloMandato,
  PartitaTavoloBreve,
  SalaTavolo,
  StatoTavolo,
  VistaTavolo,
} from '../../shared/types'
import { eOnline, nuovoCodice } from './battagliaStore'
import { fail, newId } from './http'

export type Lato = 'a' | 'b'

export interface PartitaRow {
  id: string
  gioco: GiocoAlTavolo
  giocatore_a: string
  giocatore_b: string | null
  invitato: string | null
  codice: string | null
  stato: StatoTavolo
  primo: Lato | null
  posizione: string
  mosse: string
  chiavi: string
  vincitore: Lato | null
  motivo: MotivoTavoliere | null
  patta: Lato | null
  patta_n: number
  rivincita_di: string | null
  serie_a: number
  serie_b: number
  partite_serie: number
  versione: number
  created_at: string
  iniziata_at: string | null
  mossa_at: string | null
  updated_at: string
  finita_at: string | null
  /** Nel go, a gioco fermo: le pietre segnate morte (JSON), e chi ha accettato quella proposta. */
  morte: string | null
  morte_ok: Lato | null
  /** Nel go, a partita finita ai punti: `{"a": 45, "b": 38.5}`. */
  punti: string | null
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

export function altroLato(lato: Lato): Lato {
  return lato === 'a' ? 'b' : 'a'
}

const sogliaAbbandono = (adesso: number) => prima(adesso, TAVOLO_ABBANDONATA_MS)

/**
 * Chi e' in una partita aperta: in corso e mossa di recente. `soglia` e' il
 * segnaposto dell'istante oltre il quale una partita ferma non conta piu'.
 */
function aperte(soglia: string): string {
  return `SELECT giocatore_a AS g FROM tavolo_partite WHERE stato = 'in_corso' AND updated_at >= ${soglia}
          UNION SELECT giocatore_b FROM tavolo_partite WHERE stato = 'in_corso' AND updated_at >= ${soglia}`
}

async function giocatore(db: D1Database, id: string): Promise<GiocatoreBreve> {
  const r = await db
    .prepare('SELECT id, nickname, display_name, avatar_color FROM players WHERE id = ?')
    .bind(id)
    .first<GiocatoreRow>()
  if (!r) throw new Error(`Giocatore ${id} sparito da una partita`)
  return breve(r)
}

export function latoDi(row: PartitaRow, playerId: string): Lato | null {
  if (row.giocatore_a === playerId) return 'a'
  if (row.giocatore_b !== null && row.giocatore_b === playerId) return 'b'
  return null
}

/** Con che parte gioca un lato: 0 se muove per primo. */
export function parteDi(row: PartitaRow, lato: Lato): Parte | null {
  if (!row.primo) return null
  return row.primo === lato ? 0 : 1
}

export function latoDellaParte(row: PartitaRow, parte: Parte): Lato {
  return parte === 0 ? row.primo! : altroLato(row.primo!)
}

export function mosseDi(row: PartitaRow): string[] {
  try {
    const mosse = JSON.parse(row.mosse) as unknown
    return Array.isArray(mosse) ? mosse.filter((m): m is string => typeof m === 'string') : []
  } catch {
    return []
  }
}

export function chiaviDi(row: PartitaRow): string[] {
  try {
    const chiavi = JSON.parse(row.chiavi) as unknown
    return Array.isArray(chiavi) ? chiavi.filter((m): m is string => typeof m === 'string') : []
  } catch {
    return []
  }
}

/** Il gioco e' fermo per contare: nel go, dopo due passi. */
export function inConteggio(row: PartitaRow): boolean {
  return row.stato === 'in_corso' && (regoleDi(row.gioco).conteggio?.(row.posizione) ?? false)
}

/** Chi deve muovere, dalla posizione: null se la partita non e' in corso, o se si sta contando. */
export function diTurno(row: PartitaRow): Lato | null {
  if (row.stato !== 'in_corso' || !row.primo || inConteggio(row)) return null
  const tratto = regoleDi(row.gioco).tratto(row.posizione)
  return tratto === null ? null : latoDellaParte(row, tratto)
}

/** La variante di una partita: nel go, il lato del goban. */
function varianteDi(row: Pick<PartitaRow, 'gioco' | 'posizione'>): string | null {
  return regoleDi(row.gioco).varianteDi?.(row.posizione) ?? null
}

export function morteDi(row: PartitaRow): number[] | null {
  if (row.morte === null) return null
  try {
    const morte = JSON.parse(row.morte) as unknown
    return Array.isArray(morte) ? morte.filter((k): k is number => Number.isInteger(k)) : null
  } catch {
    return null
  }
}

function puntiDi(row: PartitaRow, io: Lato): { io: number; avversario: number } | null {
  if (row.punti === null) return null
  try {
    const punti = JSON.parse(row.punti) as { a?: unknown; b?: unknown }
    const a = Number(punti.a)
    const b = Number(punti.b)
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null
    return io === 'a' ? { io: a, avversario: b } : { io: b, avversario: a }
  } catch {
    return null
  }
}

/** Fino a quando vale un invito: due minuti a un amico online, un'ora con il link. */
function scadenza(row: PartitaRow): number {
  return Date.parse(row.created_at) + (row.codice ? TAVOLO_LINK_MS : SFIDA_SCADENZA_MS)
}

function scadeTra(row: PartitaRow, adesso: number): number {
  return Math.max(0, scadenza(row) - adesso)
}

export async function partitaPerId(db: D1Database, id: string): Promise<PartitaRow | null> {
  return db.prepare('SELECT * FROM tavolo_partite WHERE id = ?').bind(id).first<PartitaRow>()
}

/* ─────────────────────────────  Chi c'e'  ───────────────────────────── */

/** Chi e' online, con due cose in piu': se e' gia' in una partita, e se ha un mio invito in attesa. */
export async function giocatoriOnline(db: D1Database, io: string, adesso: number): Promise<GiocatoreOnline[]> {
  const { results } = await db
    .prepare(
      `SELECT p.id, p.nickname, p.display_name, p.avatar_color, pr.attivita,
              p.id IN (${aperte('?4')}) AS occupato,
              EXISTS (SELECT 1 FROM tavolo_partite t
                       WHERE t.giocatore_a = ?1 AND t.invitato = p.id AND t.stato = 'invito'
                         AND t.created_at >= ?3) AS invitato
         FROM presenza pr
         JOIN players p ON p.id = pr.player_id
        WHERE pr.visto_at >= ?2 AND p.id != ?1
        ORDER BY occupato, p.display_name COLLATE NOCASE`,
    )
    .bind(io, prima(adesso, PRESENZA_ONLINE_MS), prima(adesso, SFIDA_SCADENZA_MS), sogliaAbbandono(adesso))
    .all<GiocatoreRow & { attivita: Attivita; occupato: number; invitato: number }>()
  return results.map((r) => ({
    ...breve(r),
    attivita: r.attivita,
    occupato: r.occupato === 1,
    invitato: r.invitato === 1,
  }))
}

export async function inPartita(db: D1Database, playerId: string, adesso: number): Promise<boolean> {
  const riga = await db
    .prepare(`SELECT 1 AS si WHERE ?1 IN (${aperte('?2')})`)
    .bind(playerId, sogliaAbbandono(adesso))
    .first<{ si: number }>()
  return riga !== null
}

/** La partita aperta di un giocatore, se ne ha una: in corso, e mossa di recente. */
export async function partitaAperta(db: D1Database, playerId: string, adesso: number): Promise<PartitaRow | null> {
  return db
    .prepare(
      `SELECT * FROM tavolo_partite
        WHERE stato = 'in_corso' AND (giocatore_a = ?1 OR giocatore_b = ?1) AND updated_at >= ?2
        ORDER BY updated_at DESC LIMIT 1`,
    )
    .bind(playerId, sogliaAbbandono(adesso))
    .first<PartitaRow>()
}

export async function partitaBreve(db: D1Database, row: PartitaRow, io: Lato): Promise<PartitaTavoloBreve> {
  const idAvversario = io === 'a' ? row.giocatore_b : row.giocatore_a
  return {
    id: row.id,
    gioco: row.gioco,
    variante: varianteDi(row),
    avversario: await giocatore(db, idAvversario!),
    tuoTurno: diTurno(row) === io,
  }
}

/** Le partite in corso di un gioco, anche ferme da un po': dalla sala si riprendono. */
export async function partiteInCorso(
  db: D1Database,
  playerId: string,
  gioco: GiocoAlTavolo,
): Promise<PartitaTavoloBreve[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM tavolo_partite
        WHERE stato = 'in_corso' AND gioco = ?2 AND (giocatore_a = ?1 OR giocatore_b = ?1)
        ORDER BY updated_at DESC LIMIT 10`,
    )
    .bind(playerId, gioco)
    .all<PartitaRow>()
  return Promise.all(results.map((row) => partitaBreve(db, row, latoDi(row, playerId)!)))
}

/** Vinte, perse e patte contro gli amici, a un gioco. */
export async function recordTavolo(
  db: D1Database,
  playerId: string,
  gioco: GiocoAlTavolo,
): Promise<SalaTavolo['record']> {
  const riga = await db
    .prepare(
      `SELECT
         SUM(CASE WHEN (giocatore_a = ?1 AND vincitore = 'a') OR (giocatore_b = ?1 AND vincitore = 'b')
                  THEN 1 ELSE 0 END) AS vinte,
         SUM(CASE WHEN (giocatore_a = ?1 AND vincitore = 'b') OR (giocatore_b = ?1 AND vincitore = 'a')
                  THEN 1 ELSE 0 END) AS perse,
         SUM(CASE WHEN vincitore IS NULL THEN 1 ELSE 0 END) AS patte
         FROM tavolo_partite
        WHERE stato = 'finita' AND gioco = ?2 AND (giocatore_a = ?1 OR giocatore_b = ?1)`,
    )
    .bind(playerId, gioco)
    .first<{ vinte: number | null; perse: number | null; patte: number | null }>()
  return { vinte: riga?.vinte ?? 0, perse: riga?.perse ?? 0, patte: riga?.patte ?? 0 }
}

/* ─────────────────────────────  Gli inviti  ───────────────────────────── */

/**
 * Un invito nuovo, a un amico o con un link. Uno solo alla volta: il nuovo
 * annulla quello che aspettava ancora, e nello stesso batch se ne vanno le
 * partite ferme da una settimana. La posizione di partenza e' gia' nella riga:
 * accettare non deve sapere a cosa si gioca.
 */
export async function mandaInvito(
  db: D1Database,
  {
    da,
    a,
    gioco,
    rivincitaDi = null,
    serie = null,
    primo = null,
    posizione = inizialeDi(regoleDi(gioco), null),
  }: {
    da: string
    /** null per un invito con il link. */
    a: string | null
    gioco: GiocoAlTavolo
    rivincitaDi?: string | null
    serie?: { a: number; b: number; partite: number } | null
    /** Nella rivincita chi muove per primo e' gia' deciso: l'altro di prima. */
    primo?: Lato | null
    /** La posizione di partenza, se il gioco ha varianti: il goban da 13. */
    posizione?: string
  },
  adesso: number,
): Promise<PartitaRow> {
  const id = newId('tav')
  const quando = new Date(adesso).toISOString()
  const codice = a ? null : nuovoCodice()
  await db.batch([
    db
      .prepare(
        `UPDATE tavolo_partite SET stato = 'annullata', updated_at = ? WHERE giocatore_a = ? AND stato = 'invito'`,
      )
      .bind(quando, da),
    db.prepare('DELETE FROM tavolo_partite WHERE updated_at < ?').bind(prima(adesso, TAVOLO_CONSERVA_MS)),
    db
      .prepare(
        `INSERT INTO tavolo_partite
           (id, gioco, giocatore_a, invitato, codice, stato, primo, posizione, rivincita_di, serie_a, serie_b,
            partite_serie, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'invito', ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        gioco,
        da,
        a,
        codice,
        primo,
        posizione,
        rivincitaDi,
        serie?.a ?? 0,
        serie?.b ?? 0,
        serie?.partite ?? 0,
        quando,
        quando,
      ),
  ])
  return (await partitaPerId(db, id))!
}

/** Gli inviti arrivati e ancora validi: non scaduti, e da chi non e' finito in un'altra partita. */
export async function invitiRicevuti(db: D1Database, io: string, adesso: number): Promise<InvitoTavolo[]> {
  const { results } = await db
    .prepare(
      `SELECT t.id AS invito_id, t.gioco, t.posizione, t.created_at, t.rivincita_di,
              p.id, p.nickname, p.display_name, p.avatar_color
         FROM tavolo_partite t
         JOIN players p ON p.id = t.giocatore_a
        WHERE t.invitato = ?1 AND t.stato = 'invito' AND t.created_at >= ?2
          AND t.giocatore_a NOT IN (${aperte('?3')})
        ORDER BY t.created_at`,
    )
    .bind(io, prima(adesso, SFIDA_SCADENZA_MS), sogliaAbbandono(adesso))
    .all<
      GiocatoreRow & {
        invito_id: string
        gioco: GiocoAlTavolo
        posizione: string
        created_at: string
        rivincita_di: string | null
      }
    >()
  return results.map((r) => ({
    id: r.invito_id,
    gioco: r.gioco,
    variante: varianteDi(r),
    da: breve(r),
    scadeTraMs: Math.max(0, Date.parse(r.created_at) + SFIDA_SCADENZA_MS - adesso),
    rivincita: r.rivincita_di !== null,
  }))
}

function statoInvito(row: PartitaRow, adesso: number): InvitoTavoloMandato['stato'] {
  if (row.stato === 'invito') return scadeTra(row, adesso) === 0 ? 'scaduto' : 'attesa'
  if (row.stato === 'rifiutata') return 'rifiutato'
  if (row.stato === 'annullata') return 'annullato'
  return 'accettato'
}

/** L'ultimo invito mandato dalla sala di un gioco, se e' recente: la sala dice com'e' andato. */
export async function ultimoInvito(
  db: D1Database,
  io: string,
  gioco: GiocoAlTavolo,
  adesso: number,
): Promise<InvitoTavoloMandato | null> {
  const row = await db
    .prepare(
      `SELECT * FROM tavolo_partite
        WHERE giocatore_a = ? AND gioco = ? AND rivincita_di IS NULL AND created_at >= ?
        ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(io, gioco, prima(adesso, TAVOLO_LINK_MS))
    .first<PartitaRow>()
  if (!row) return null
  const stato = statoInvito(row, adesso)
  // Un invito ritirato da chi l'ha mandato non ha niente da dire; uno a un amico
  // conta per qualche minuto, poi la sala torna pulita.
  if (stato === 'annullato') return null
  if (!row.codice && adesso - Date.parse(row.created_at) > SFIDA_SCADENZA_MS * 3 && stato !== 'attesa') return null
  return {
    id: row.id,
    gioco: row.gioco,
    variante: varianteDi(row),
    a: row.invitato ? await giocatore(db, row.invitato) : null,
    codice: row.codice,
    stato,
    scadeTraMs: row.stato === 'invito' ? scadeTra(row, adesso) : 0,
    partitaId: stato === 'accettato' ? row.id : null,
  }
}

/** Uno dei due a caso, dal generatore del sistema: chi muove per primo. */
function latoACaso(): Lato {
  return crypto.getRandomValues(new Uint8Array(1))[0] % 2 === 0 ? 'a' : 'b'
}

/**
 * Accetta un invito e apre la partita, in un batch: la riga passa in corso
 * solo se e' ancora un invito valido e nessuno dei due e' in un'altra partita,
 * e nello stesso colpo si pesca chi muove per primo (se non e' una rivincita,
 * dove e' gia' deciso). Poi gli altri inviti dei due si annullano: due
 * accettazioni ravvicinate non aprono due partite.
 */
export async function accettaInvito(db: D1Database, row: PartitaRow, io: string, adesso: number): Promise<void> {
  if (row.giocatore_a === io) fail(409, 'INVITO_TUO', 'Questo invito l’hai mandato tu.')
  if (row.stato !== 'invito') {
    if (row.giocatore_b === io) return
    fail(409, 'INVITO_CHIUSO', 'Questo invito non è più valido.')
  }
  if (row.invitato && row.invitato !== io) fail(404, 'INVITO_NON_TROVATO', 'Questo invito non esiste.')
  if (scadeTra(row, adesso) === 0) fail(409, 'INVITO_SCADUTO', 'L’invito è scaduto.')

  const quando = new Date(adesso).toISOString()
  const [aperta] = await db.batch([
    db
      .prepare(
        `UPDATE tavolo_partite
            SET stato = 'in_corso', giocatore_b = ?1, invitato = ?1, primo = COALESCE(primo, ?2),
                versione = versione + 1, iniziata_at = ?3, mossa_at = ?3, updated_at = ?3
          WHERE id = ?4 AND stato = 'invito' AND (invitato = ?1 OR invitato IS NULL) AND giocatore_a != ?1
            AND ?1 NOT IN (${aperte('?5')}) AND giocatore_a NOT IN (${aperte('?5')})`,
      )
      .bind(io, latoACaso(), quando, row.id, sogliaAbbandono(adesso)),
    db
      .prepare(
        `UPDATE tavolo_partite SET stato = 'annullata', updated_at = ?1
          WHERE stato = 'invito' AND id != ?2
            AND (giocatore_a IN (?3, ?4) OR invitato IN (?3, ?4))
            AND EXISTS (SELECT 1 FROM tavolo_partite WHERE id = ?2 AND stato = 'in_corso' AND giocatore_b = ?4)`,
      )
      .bind(quando, row.id, row.giocatore_a, io),
  ])
  if (aperta.meta.changes !== 1) {
    const dopo = await partitaPerId(db, row.id)
    if (dopo?.stato === 'in_corso' && dopo.giocatore_b === io) return
    if (dopo?.stato !== 'invito') fail(409, 'INVITO_CHIUSO', 'Questo invito non è più valido.')
    fail(409, 'OCCUPATO', 'Uno dei due sta già giocando un’altra partita.')
  }
}

/** Rifiuta un invito arrivato, o lo ritira chi l'ha mandato. */
export async function chiudiInvito(
  db: D1Database,
  row: PartitaRow,
  io: string,
  come: 'rifiutata' | 'annullata',
  adesso: number,
): Promise<void> {
  const mio = come === 'annullata' ? row.giocatore_a === io : row.invitato === io
  if (!mio) fail(404, 'INVITO_NON_TROVATO', 'Questo invito non esiste.')
  await db
    .prepare(`UPDATE tavolo_partite SET stato = ?, updated_at = ? WHERE id = ? AND stato = 'invito'`)
    .bind(come, new Date(adesso).toISOString(), row.id)
    .run()
}

export async function invitoConCodice(db: D1Database, codice: string): Promise<PartitaRow | null> {
  return db.prepare('SELECT * FROM tavolo_partite WHERE codice = ?').bind(codice).first<PartitaRow>()
}

/** Un invito con il link, come lo vede chi lo apre: anche senza account. */
export async function invitoTavoloConLink(
  db: D1Database,
  codice: string,
  adesso: number,
): Promise<InvitoConLink | null> {
  const row = await invitoConCodice(db, codice)
  if (!row) return null
  const stato =
    row.stato === 'invito'
      ? scadeTra(row, adesso) === 0
        ? 'scaduto'
        : 'attesa'
      : row.stato === 'annullata'
        ? 'annullato'
        : 'usato'
  return { codice, da: await giocatore(db, row.giocatore_a), stato, gioco: row.gioco, variante: varianteDi(row) }
}

/* ─────────────────────────────  La rivincita  ───────────────────────────── */

/** L'ultima rivincita chiesta per una partita, se c'e'. */
export async function rivincitaDi(db: D1Database, partitaId: string): Promise<PartitaRow | null> {
  return db
    .prepare('SELECT * FROM tavolo_partite WHERE rivincita_di = ? ORDER BY created_at DESC LIMIT 1')
    .bind(partitaId)
    .first<PartitaRow>()
}

/**
 * La serie dopo una partita, per quella che viene: le vittorie contate per
 * giocatore, perché nella rivincita chi la chiede e' 'a', anche se prima era 'b'.
 * Le patte contano nelle partite e non nelle vittorie.
 */
export function serieDopo(row: PartitaRow, nuovoA: string, nuovoB: string): { a: number; b: number; partite: number } {
  const vinte = (id: string) => {
    const lato = latoDi(row, id)
    if (!lato) return 0
    return (lato === 'a' ? row.serie_a : row.serie_b) + (row.vincitore === lato ? 1 : 0)
  }
  return { a: vinte(nuovoA), b: vinte(nuovoB), partite: row.partite_serie + 1 }
}

/** Nella rivincita muove per primo chi prima muoveva per secondo: come si cambia colore ai tavoli. */
export function primoDellaRivincita(row: PartitaRow, nuovoA: string): Lato {
  const eraPrimo = row.primo !== null && latoDi(row, nuovoA) === row.primo
  return eraPrimo ? 'b' : 'a'
}

/* ─────────────────────────────  La partita  ───────────────────────────── */

/**
 * Fino a quando ha tempo chi ha la mossa, nei giochi con il tempo per mossa;
 * null negli altri, e finché ognuno dei due non ha mosso una volta: la prima
 * mossa di ciascuno e' senza tempo, perché chi ha mandato l'invito arriva al
 * tavoliere un momento dopo chi l'ha accettato.
 */
export function scadenzaMossa(row: PartitaRow): number | null {
  const ms = regoleDi(row.gioco).tempoMossaMs
  if (!ms || row.stato !== 'in_corso' || !row.mossa_at || mosseDi(row).length < 2) return null
  return Date.parse(row.mossa_at) + ms
}

/**
 * Chiude la partita se chi ha la mossa ha lasciato passare il tempo, margine
 * della rete compreso: vince l'altro. La scrittura e' condizionata come le
 * altre, e se un'altra richiesta l'ha gia' chiusa si rilegge.
 */
export async function chiudiSeScaduta(db: D1Database, row: PartitaRow, adesso: number): Promise<PartitaRow> {
  const scade = scadenzaMossa(row)
  const turno = diTurno(row)
  if (scade === null || !turno || adesso <= scade + TAVOLO_MARGINE_TEMPO_MS) return row
  try {
    return await salvaPartita(
      db,
      row,
      { stato: 'finita', vincitore: altroLato(turno), motivo: 'tempo', patta: null },
      adesso,
    )
  } catch {
    return (await partitaPerId(db, row.id)) ?? row
  }
}

/**
 * Da quanto l'altro ha la mossa senza farla, e se si puo' chiudere la partita a
 * proprio favore: dopo cinque minuti se l'altro ha chiuso l'app, dopo mezz'ora
 * comunque. Nel conteggio del go si aspetta l'altro quando io ho accettato e
 * lui no: allora chiudere vuol dire contare con la proposta che ho accettato.
 */
function attesa(row: PartitaRow, io: Lato, altroOnline: boolean, adesso: number): { attesaMs: number; puoi: boolean } {
  const conteggio = inConteggio(row)
  const turno = diTurno(row)
  if (conteggio ? row.morte_ok !== io : !turno || turno === io) return { attesaMs: 0, puoi: false }
  const ultima = conteggio ? row.updated_at : (row.mossa_at ?? row.iniziata_at ?? row.updated_at)
  const attesaMs = Math.max(0, adesso - Date.parse(ultima))
  const puoi = attesaMs >= TAVOLO_ATTESA_MASSIMA_MS || (attesaMs >= TAVOLO_ATTESA_MS && !altroOnline)
  return { attesaMs, puoi }
}

/** La partita vista da uno dei due. */
export async function vistaTavolo(db: D1Database, row: PartitaRow, io: Lato, adesso: number): Promise<VistaTavolo> {
  const idAvversario = io === 'a' ? row.giocatore_b ?? row.invitato : row.giocatore_a
  const [avversario, online, rivincita] = await Promise.all([
    idAvversario ? giocatore(db, idAvversario) : Promise.resolve(null),
    idAvversario ? eOnline(db, idAvversario, adesso) : Promise.resolve(false),
    row.stato === 'finita' ? rivincitaDi(db, row.id) : Promise.resolve(null),
  ])
  const mosse = mosseDi(row)
  const { attesaMs, puoi } = attesa(row, io, online, adesso)
  const idMio = io === 'a' ? row.giocatore_a : row.giocatore_b
  const inCorso = row.stato === 'in_corso'
  // Nello Scarabeo la posizione ha il sacchetto, e le mosse i cambi dell'altro: si manda solo la mia vista.
  const vistaDi = regoleDi(row.gioco).vistaDi

  return {
    id: row.id,
    gioco: row.gioco,
    stato: row.stato,
    io,
    parte: parteDi(row, io),
    avversario: avversario ? { ...avversario, online } : null,
    posizione: vistaDi ? vistaDi(row.posizione, parteDi(row, io)) : row.posizione,
    mosse: vistaDi ? [] : mosse,
    tuoTurno: diTurno(row) === io,
    vincitore: row.vincitore ? (row.vincitore === io ? 'io' : 'avversario') : null,
    motivo: row.motivo,
    patta: inCorso && row.patta ? (row.patta === io ? 'io' : 'avversario') : null,
    puoiProporre: inCorso && regoleDi(row.gioco).patta && !row.patta && row.patta_n !== mosse.length,
    conteggio: inConteggio(row)
      ? { morte: morteDi(row), accettato: row.morte_ok ? (row.morte_ok === io ? 'io' : 'avversario') : null }
      : null,
    punti: puntiDi(row, io),
    morte: row.stato === 'finita' && row.motivo === 'punti' ? morteDi(row) : null,
    serie: {
      io: io === 'a' ? row.serie_a : row.serie_b,
      avversario: io === 'a' ? row.serie_b : row.serie_a,
      partite: row.partite_serie,
    },
    rivincita: rivincita
      ? {
          id: rivincita.id,
          da: rivincita.giocatore_a === idMio ? 'io' : 'avversario',
          stato: statoInvito(rivincita, adesso),
          partitaId: rivincita.stato === 'in_corso' || rivincita.stato === 'finita' ? rivincita.id : null,
        }
      : null,
    attesaMs,
    puoiReclamare: inCorso && puoi,
    tempo: tempoDellaMossa(row, adesso),
    versione: row.versione,
  }
}

/** Il tempo della mossa per la vista: quanto dura, e quanto ne resta a chi ha il tratto. */
function tempoDellaMossa(row: PartitaRow, adesso: number): VistaTavolo['tempo'] {
  const scade = scadenzaMossa(row)
  const ms = regoleDi(row.gioco).tempoMossaMs
  if (scade === null || !ms) return null
  return { mossaMs: ms, restanteMs: Math.max(0, scade - adesso) }
}

export interface CambiPartita {
  stato?: StatoTavolo
  posizione?: string
  mosse?: string[]
  chiavi?: string[]
  vincitore?: Lato | null
  motivo?: MotivoTavoliere | null
  patta?: Lato | null
  patta_n?: number
  morte?: number[] | null
  morte_ok?: Lato | null
  punti?: { a: number; b: number } | null
  /** Una mossa vera: fa ripartire l'attesa per la vittoria a tavolino. */
  mossa?: boolean
}

/**
 * Scrive la partita, condizionata alla versione letta: un doppio tocco, o due
 * schede aperte, non devono poter muovere due volte, e una mossa arrivata
 * mentre l'altro accettava la patta non deve passare.
 */
export async function salvaPartita(
  db: D1Database,
  row: PartitaRow,
  cambi: CambiPartita,
  adesso: number,
): Promise<PartitaRow> {
  const quando = new Date(adesso).toISOString()
  const stato = cambi.stato ?? row.stato
  const dopo: PartitaRow = {
    ...row,
    stato,
    posizione: cambi.posizione ?? row.posizione,
    mosse: cambi.mosse ? JSON.stringify(cambi.mosse) : row.mosse,
    chiavi: cambi.chiavi ? JSON.stringify(cambi.chiavi) : row.chiavi,
    vincitore: cambi.vincitore !== undefined ? cambi.vincitore : row.vincitore,
    motivo: cambi.motivo !== undefined ? cambi.motivo : row.motivo,
    patta: cambi.patta !== undefined ? cambi.patta : row.patta,
    patta_n: cambi.patta_n ?? row.patta_n,
    morte: cambi.morte !== undefined ? (cambi.morte === null ? null : JSON.stringify(cambi.morte)) : row.morte,
    morte_ok: cambi.morte_ok !== undefined ? cambi.morte_ok : row.morte_ok,
    punti: cambi.punti !== undefined ? (cambi.punti === null ? null : JSON.stringify(cambi.punti)) : row.punti,
    versione: row.versione + 1,
    mossa_at: cambi.mossa ? quando : row.mossa_at,
    updated_at: quando,
    finita_at: stato === 'finita' && row.stato !== 'finita' ? quando : row.finita_at,
  }
  const esito = await db
    .prepare(
      `UPDATE tavolo_partite
          SET stato = ?, posizione = ?, mosse = ?, chiavi = ?, vincitore = ?, motivo = ?, patta = ?, patta_n = ?,
              morte = ?, morte_ok = ?, punti = ?, versione = ?, mossa_at = ?, updated_at = ?, finita_at = ?
        WHERE id = ? AND versione = ?`,
    )
    .bind(
      dopo.stato,
      dopo.posizione,
      dopo.mosse,
      dopo.chiavi,
      dopo.vincitore,
      dopo.motivo,
      dopo.patta,
      dopo.patta_n,
      dopo.morte,
      dopo.morte_ok,
      dopo.punti,
      dopo.versione,
      dopo.mossa_at,
      quando,
      dopo.finita_at,
      row.id,
      row.versione,
    )
    .run()
  if (esito.meta.changes !== 1) fail(409, 'CONFLITTO', 'La partita è cambiata: la ricarico.')
  return dopo
}

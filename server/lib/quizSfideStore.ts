/**
 * Le sfide a quiz fra due giocatori: gli inviti, i duelli, le rivincite.
 *
 * Il duello salva le domande con le risposte e le risposte date, nell'ordine
 * di arrivo e con l'ora del server; il resto — la domanda aperta, il rallenty,
 * i punti — lo ricava `statoSfida`. Le domande le ha fatte il browser di chi
 * sfida (il Worker non ha il tempo di farle) e vanno a chi gioca una alla
 * volta, senza la risposta, come nella classificata.
 *
 * Niente resta: e' un'amichevole. Sfide e duelli piu' vecchi di un giorno si
 * cancellano quando se ne crea uno nuovo.
 */

import { PRESENZA_ONLINE_MS, SFIDA_SCADENZA_MS } from '../../shared/config'
import { VISTE, type VistaCartina } from '../../shared/quiz'
import { PERCORSO_IMMAGINE, type ImmagineQuiz } from '../../shared/quiz-cultura'
import {
  domandaValida,
  rispostaGiusta,
  senzaRisposta,
  type DomandaCompleta,
  type SpiegazioneQuiz,
  type StratoCartina,
} from '../../shared/quiz-domande'
import {
  DUELLO_CONSERVA_MS,
  DUELLO_FERMO_MS,
  PRONTI_ENTRO_MS,
  SFIDA_QUIZ_LINK_MS,
  VIA_SFIDA_MS,
  avversarioDi,
  impostazioniSfida,
  limiteMs,
  puoRispondere,
  statoSfida,
  type ImpostazioniSfida,
  type LatoSfida,
  type RispostaSfida,
  type StatoSfida,
} from '../../shared/quiz-sfida'
import type {
  DuelloBreve,
  GiocatoreBreve,
  GiocatoreOnline,
  GiroQuizVisto,
  InvitoConLink,
  InvitoQuiz,
  RiassuntoSfida,
  RivincitaVista,
  SfidaQuizInviata,
  VistaDuello,
  Attivita,
} from '../../shared/types'
import { nuovoCodice } from './battagliaStore'
import { fail, newId } from './http'

export interface SfidaRow {
  id: string
  da_id: string
  a_id: string | null
  codice: string | null
  stato: 'attesa' | 'accettata' | 'rifiutata' | 'annullata'
  impostazioni: string
  domande: string
  rivincita_di: string | null
  duello_id: string | null
  created_at: string
  risposto_at: string | null
}

export interface DuelloRow {
  id: string
  giocatore_a: string
  giocatore_b: string
  impostazioni: string
  domande: string
  risposte: string
  pronto_a: number
  pronto_b: number
  inizio_at: number | null
  stato: 'attesa' | 'in_corso' | 'finito' | 'abbandonato'
  resa: LatoSfida | null
  serie_a: number
  serie_b: number
  partite: number
  created_at: string
  updated_at: string
}

interface GiocatoreRow {
  id: string
  nickname: string
  display_name: string | null
  avatar_color: string
}

function breve(r: GiocatoreRow): GiocatoreBreve {
  return { playerId: r.id, nickname: r.nickname, displayName: r.display_name || r.nickname, avatarColor: r.avatar_color }
}

const prima = (adesso: number, ms: number) => new Date(adesso - ms).toISOString()

async function giocatore(db: D1Database, id: string): Promise<GiocatoreBreve> {
  const r = await db
    .prepare('SELECT id, nickname, display_name, avatar_color FROM players WHERE id = ?')
    .bind(id)
    .first<GiocatoreRow>()
  if (!r) fail(404, 'PLAYER_NOT_FOUND', 'Giocatore non trovato.')
  return breve(r)
}

/* ─────────────────────────────  Le domande  ───────────────────────────── */

const STRATI: readonly StratoCartina[] = ['paesi', 'acque', 'fiumi', 'laghi', 'capitali', 'citta']

/** Il peso massimo delle domande di una sfida: venti domande sulla cartina ne pesano una ventina di kB. */
const PESO_MASSIMO_DOMANDE = 160_000

const testo = (v: unknown, massimo: number): string | null =>
  typeof v === 'string' && v.length > 0 && v.length <= massimo ? v : null

const testi = (v: unknown, quanti: number, massimo: number): string[] | null =>
  Array.isArray(v) && v.length <= quanti && v.every((x) => testo(x, massimo) !== null) ? (v as string[]) : null

/** Un quadro di Commons: solo un percorso di miniatura, mai un indirizzo qualunque. */
function immagineDi(v: unknown): ImmagineQuiz | null {
  const x = (v ?? null) as Record<string, unknown> | null
  if (!x || typeof x.f !== 'string' || !PERCORSO_IMMAGINE.test(x.f)) return null
  const r = Number(x.r)
  return { f: x.f, r: Number.isFinite(r) && r > 0.1 && r < 10 ? Math.round(r * 1000) / 1000 : 1 }
}

/** La scheda che insegna, con le misure di una scheda vera. */
function spiegazioneDi(v: unknown): SpiegazioneQuiz | null {
  const x = (v ?? null) as Record<string, unknown> | null
  const titolo = x ? testo(x.titolo, 200) : null
  if (!x || !titolo) return null
  const righe = Array.isArray(x.righe)
    ? x.righe
        .filter((r): r is [string, string] => Array.isArray(r) && r.length === 2 && !!testo(r[0], 60) && !!testo(r[1], 400))
        .slice(0, 8)
    : []
  const sotto = testo(x.sotto, 300)
  const corpo = testo(x.testo, 800)
  const voce = testo(x.voce, 200)
  const immagine = immagineDi(x.immagine)
  return {
    titolo,
    ...(sotto ? { sotto } : {}),
    ...(righe.length ? { righe } : {}),
    ...(corpo ? { testo: corpo } : {}),
    ...(voce ? { voce } : {}),
    ...(immagine ? { immagine } : {}),
  }
}

/**
 * Le domande arrivate dal browser di chi sfida, ripulite: solo i campi che
 * servono, con i tipi giusti e le misure di una domanda vera. Sono sue, e chi
 * sfida potrebbe barare guardandole: e' un'amichevole, e il server controlla
 * almeno che siano domande.
 */
export function leggiDomande(valore: unknown, imp: ImpostazioniSfida): DomandaCompleta[] {
  if (!Array.isArray(valore) || valore.length < 3 || valore.length > imp.quante) {
    fail(400, 'DOMANDE', 'Le domande della sfida non sono valide.')
  }
  if (JSON.stringify(valore).length > PESO_MASSIMO_DOMANDE) fail(400, 'DOMANDE', 'Le domande sono troppe.')
  return valore.map((grezza): DomandaCompleta => {
    const x = (grezza ?? {}) as Record<string, unknown>
    const opzioni = Array.isArray(x.opzioni)
      ? x.opzioni.map((o) => {
          const y = (o ?? {}) as Record<string, unknown>
          const bandiera = testo(y.bandiera, 12)
          const immagine = immagineDi(y.immagine)
          return {
            id: testo(y.id, 80) ?? '',
            testo: testo(y.testo, 240) ?? '',
            ...(bandiera ? { bandiera } : {}),
            ...(immagine ? { immagine } : {}),
          }
        })
      : []
    const c = (x.cartina ?? null) as Record<string, unknown> | null
    const mostra = c ? testi(c.mostra, 20, 80) : null
    const cartina =
      c && typeof c === 'object'
        ? {
            vista: (c.vista as string) in VISTE ? (c.vista as VistaCartina) : 'mondo',
            strato: STRATI.includes(c.strato as StratoCartina) ? (c.strato as StratoCartina) : 'paesi',
            ...(mostra ? { mostra } : {}),
          }
        : null
    const l = (x.luogo ?? null) as Record<string, unknown> | null
    const giusti = l ? testi(l.giusti, 80, 80) : null
    const altri = l ? testi(l.altri, 80, 80) : null
    const bandiera = testo(x.bandiera, 12)
    const immagine = immagineDi(x.immagine)
    const spiegazione = spiegazioneDi(x.spiegazione)
    const accettate = testi(x.accettate, 600, 80)
    const d = {
      tipo: (testo(x.tipo, 40) ?? '') as DomandaCompleta['tipo'],
      testo: testo(x.testo, 400) ?? '',
      ...(bandiera ? { bandiera } : {}),
      ...(immagine ? { immagine } : {}),
      ...(x.lunga === 1 ? { lunga: 1 as const } : {}),
      opzioni,
      ...(cartina ? { cartina: cartina as DomandaCompleta['cartina'] } : {}),
      giusta: testo(x.giusta, 80) ?? '',
      ...(accettate ? { accettate } : {}),
      risposta: testo(x.risposta, 200) ?? '',
      soggetto: testo(x.soggetto, 120) ?? '',
      ...(giusti ? { luogo: { giusti, ...(altri ? { altri } : {}) } } : {}),
      ...(spiegazione ? { spiegazione } : {}),
    } as DomandaCompleta
    const sceltaBuona = cartina || (opzioni.length >= 2 && opzioni.length <= 6)
    if (!d.testo || !d.risposta || !sceltaBuona || !domandaValida(d, d.opzioni.length || undefined)) {
      fail(400, 'DOMANDE', 'Una delle domande della sfida non è valida.')
    }
    return d
  })
}

function riassunto(imp: ImpostazioniSfida): RiassuntoSfida {
  return { categoria: imp.categoria, modo: imp.modo, area: imp.area, quante: imp.quante, secondi: imp.secondi }
}

function impostazioniDi(row: { impostazioni: string }): ImpostazioniSfida {
  const imp = impostazioniSfida(JSON.parse(row.impostazioni))
  if (!imp) throw new Error('Impostazioni della sfida illeggibili')
  return imp
}

/* ─────────────────────────────  Chi e' occupato  ──────────────────────── */

/** Chi e' in un duello vivo: in attesa dell'altro o in corso, e toccato di recente. */
function nelDuello(soglia: string): string {
  return `SELECT giocatore_a AS g FROM quiz_duelli WHERE stato IN ('attesa', 'in_corso') AND updated_at >= ${soglia}
          UNION SELECT giocatore_b FROM quiz_duelli WHERE stato IN ('attesa', 'in_corso') AND updated_at >= ${soglia}`
}

const sogliaFermo = (adesso: number) => prima(adesso, DUELLO_FERMO_MS)

/** Chi e' online adesso, tranne chi guarda: chi e' in un duello non si sfida, e chi ha gia' una sfida mia lo si vede. */
export async function giocatoriPerSfida(db: D1Database, io: string, adesso: number): Promise<GiocatoreOnline[]> {
  const { results } = await db
    .prepare(
      `SELECT p.id, p.nickname, p.display_name, p.avatar_color, pr.attivita,
              p.id IN (${nelDuello('?4')}) AS occupato,
              EXISTS (SELECT 1 FROM quiz_sfide s
                       WHERE s.da_id = ?1 AND s.a_id = p.id AND s.stato = 'attesa' AND s.codice IS NULL
                         AND s.created_at >= ?3) AS invitato
         FROM presenza pr
         JOIN players p ON p.id = pr.player_id
        WHERE pr.visto_at >= ?2 AND p.id != ?1
        ORDER BY occupato, p.display_name COLLATE NOCASE`,
    )
    .bind(io, prima(adesso, PRESENZA_ONLINE_MS), prima(adesso, SFIDA_SCADENZA_MS), sogliaFermo(adesso))
    .all<GiocatoreRow & { attivita: Attivita; occupato: number; invitato: number }>()
  return results.map((r) => ({ ...breve(r), attivita: r.attivita, occupato: r.occupato === 1, invitato: r.invitato === 1 }))
}

export async function inDuello(db: D1Database, playerId: string, adesso: number): Promise<boolean> {
  const r = await db
    .prepare(`SELECT 1 AS si FROM (${nelDuello('?2')}) WHERE g = ?1`)
    .bind(playerId, sogliaFermo(adesso))
    .first<{ si: number }>()
  return r !== null
}

/* ───────────────────────────────  Le sfide  ───────────────────────────── */

function scadenzaSfida(row: Pick<SfidaRow, 'created_at' | 'codice'>): number {
  return Date.parse(row.created_at) + (row.codice ? SFIDA_QUIZ_LINK_MS : SFIDA_SCADENZA_MS)
}

export async function sfidaPerId(db: D1Database, id: string): Promise<SfidaRow | null> {
  return db.prepare('SELECT * FROM quiz_sfide WHERE id = ?').bind(id).first<SfidaRow>()
}

async function sfidaPerCodice(db: D1Database, codice: string): Promise<SfidaRow | null> {
  return db.prepare('SELECT * FROM quiz_sfide WHERE codice = ?').bind(codice).first<SfidaRow>()
}

/** Via quel che ha piu' di un giorno: sfide e duelli non restano. Va nello stesso batch di una scrittura nuova. */
function pulizia(db: D1Database, adesso: number): D1PreparedStatement[] {
  const soglia = prima(adesso, DUELLO_CONSERVA_MS)
  return [
    db.prepare('DELETE FROM quiz_duelli WHERE updated_at < ?').bind(soglia),
    db.prepare('DELETE FROM quiz_sfide WHERE created_at < ?').bind(soglia),
  ]
}

/**
 * Manda una sfida a un giocatore, o una rivincita. Una sola alla volta: la
 * nuova annulla quelle di prima che aspettavano ancora, altrimenti due
 * accettazioni ravvicinate aprirebbero due duelli.
 */
export async function mandaSfidaQuiz(
  db: D1Database,
  daId: string,
  aId: string | null,
  imp: ImpostazioniSfida,
  domande: DomandaCompleta[],
  adesso: number,
  rivincitaDi: string | null = null,
): Promise<SfidaRow> {
  const id = newId('sfq')
  const codice = aId ? null : nuovoCodice()
  const quando = new Date(adesso).toISOString()
  await db.batch([
    ...pulizia(db, adesso),
    db
      .prepare(`UPDATE quiz_sfide SET stato = 'annullata', risposto_at = ? WHERE da_id = ? AND stato = 'attesa'`)
      .bind(quando, daId),
    db
      .prepare(
        `INSERT INTO quiz_sfide (id, da_id, a_id, codice, stato, impostazioni, domande, rivincita_di, created_at)
         VALUES (?, ?, ?, ?, 'attesa', ?, ?, ?, ?)`,
      )
      .bind(id, daId, aId, codice, JSON.stringify(imp), JSON.stringify(domande), rivincitaDi, quando),
  ])
  return {
    id,
    da_id: daId,
    a_id: aId,
    codice,
    stato: 'attesa',
    impostazioni: JSON.stringify(imp),
    domande: '[]',
    rivincita_di: rivincitaDi,
    duello_id: null,
    created_at: quando,
    risposto_at: null,
  }
}

export async function chiudiSfida(db: D1Database, id: string, stato: 'rifiutata' | 'annullata', adesso: number) {
  await db
    .prepare(`UPDATE quiz_sfide SET stato = ?, risposto_at = ? WHERE id = ? AND stato = 'attesa'`)
    .bind(stato, new Date(adesso).toISOString(), id)
    .run()
}

/** La sfida mandata vista da chi aspetta: a chi, com'e' andata, e il duello se e' cominciato. */
export async function sfidaInviata(db: D1Database, row: SfidaRow, adesso: number): Promise<SfidaQuizInviata> {
  const scaduta = row.stato === 'attesa' && adesso >= scadenzaSfida(row)
  return {
    id: row.id,
    a: row.a_id ? await giocatore(db, row.a_id) : null,
    codice: row.codice,
    stato: scaduta ? 'scaduta' : row.stato,
    duelloId: row.duello_id,
    scadeTraMs: row.stato === 'attesa' ? Math.max(0, scadenzaSfida(row) - adesso) : 0,
  }
}

/** L'ultima sfida mandata, per la sala: quella che aspetta ancora, o appena accettata. */
export async function ultimaSfidaMandata(db: D1Database, io: string, adesso: number): Promise<SfidaQuizInviata | null> {
  const row = await db
    .prepare(
      `SELECT * FROM quiz_sfide WHERE da_id = ? AND rivincita_di IS NULL AND created_at >= ?
        ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(io, prima(adesso, SFIDA_QUIZ_LINK_MS))
    .first<SfidaRow>()
  if (!row || row.stato === 'annullata') return null
  // Un no si fa vedere per un paio di minuti; un si' finche' il duello e' vivo, poi la sala torna libera.
  if (row.stato === 'rifiutata' && adesso - Date.parse(row.risposto_at ?? row.created_at) > SFIDA_SCADENZA_MS) return null
  if (row.stato === 'accettata') {
    const duello = row.duello_id ? await duelloPerId(db, row.duello_id) : null
    if (!duello || (duello.stato !== 'attesa' && duello.stato !== 'in_corso')) return null
  }
  const vista = await sfidaInviata(db, row, adesso)
  return vista.stato === 'scaduta' ? null : vista
}

/** Le sfide arrivate e ancora valide, rivincite comprese; non da chi e' finito in un altro duello. */
export async function sfideQuizRicevute(db: D1Database, io: string, adesso: number): Promise<InvitoQuiz[]> {
  const { results } = await db
    .prepare(
      `SELECT s.id AS sfida_id, s.created_at, s.impostazioni, s.rivincita_di,
              p.id, p.nickname, p.display_name, p.avatar_color
         FROM quiz_sfide s
         JOIN players p ON p.id = s.da_id
        WHERE s.a_id = ?1 AND s.stato = 'attesa' AND s.codice IS NULL AND s.created_at >= ?2
          AND (s.rivincita_di IS NOT NULL OR s.da_id NOT IN (${nelDuello('?3')}))
        ORDER BY s.created_at`,
    )
    .bind(io, prima(adesso, SFIDA_SCADENZA_MS), sogliaFermo(adesso))
    .all<GiocatoreRow & { sfida_id: string; created_at: string; impostazioni: string; rivincita_di: string | null }>()
  return results.map((r) => ({
    id: r.sfida_id,
    da: breve(r),
    sfida: riassunto(impostazioniDi(r)),
    rivincita: r.rivincita_di !== null,
    scadeTraMs: Math.max(0, Date.parse(r.created_at) + SFIDA_SCADENZA_MS - adesso),
  }))
}

/** Un invito col link a quiz, come lo vede chi lo apre: anche senza account. */
export async function invitoQuizConLink(db: D1Database, codice: string, adesso: number): Promise<InvitoConLink | null> {
  const row = await sfidaPerCodice(db, codice)
  if (!row) return null
  const scaduta = row.stato === 'attesa' && adesso >= scadenzaSfida(row)
  const stato = scaduta
    ? 'scaduto'
    : row.stato === 'accettata'
      ? 'usato'
      : row.stato === 'attesa'
        ? 'attesa'
        : 'annullato'
  return { codice, da: await giocatore(db, row.da_id), stato, gioco: 'quiz', sfida: riassunto(impostazioniDi(row)) }
}

/**
 * Accetta una sfida e apre il duello, in un colpo solo: un `batch` atomico,
 * come per la battaglia. Il duello nasce solo se la sfida aspetta ancora, non
 * e' scaduta e nessuno dei due e' in un altro duello; nello stesso batch la
 * sfida passa ad accettata e le altre dei due si annullano. Per una rivincita
 * i due restano ai loro posti e la serie va avanti con i punti del duello di
 * prima.
 */
export async function accettaSfidaQuiz(db: D1Database, sfida: SfidaRow, io: string, adesso: number): Promise<string> {
  if (sfida.stato === 'accettata' && sfida.duello_id && (sfida.a_id === io || sfida.da_id === io)) return sfida.duello_id
  if (sfida.da_id === io) fail(409, 'SFIDA_TUA', 'È la tua sfida: mandala a chi vuoi sfidare.')
  if (sfida.stato === 'accettata') fail(409, 'SFIDA_USATA', 'Questa sfida l’ha già accettata qualcun altro.')
  if (sfida.stato !== 'attesa') fail(409, 'SFIDA_CHIUSA', 'Questa sfida non è più valida.')
  if (sfida.a_id && sfida.a_id !== io) fail(404, 'SFIDA_NON_TROVATA', 'Sfida non trovata.')
  if (adesso >= scadenzaSfida(sfida)) fail(409, 'SFIDA_SCADUTA', 'La sfida è scaduta: chiedine un’altra.')

  // La serie: chi era 'a' resta 'a', e i punti di prima si sommano.
  let [a, b] = [sfida.da_id, io]
  let serie = { a: 0, b: 0, partite: 0 }
  if (sfida.rivincita_di) {
    const trovato = await duelloPerId(db, sfida.rivincita_di)
    // Finito per il tempo e mai scritto: lo si scrive prima, o sembrerebbero ancora in sfida.
    const primaDuello = trovato ? await aggiornaDuello(db, trovato, adesso) : null
    if (primaDuello) {
      const s = statoDiDuello(primaDuello, adesso)
      a = primaDuello.giocatore_a
      b = primaDuello.giocatore_b
      serie = {
        a: primaDuello.serie_a + s.punti.a,
        b: primaDuello.serie_b + s.punti.b,
        partite: primaDuello.partite + 1,
      }
    }
  }

  const duelloId = newId('duq')
  const quando = new Date(adesso).toISOString()
  const limite = prima(adesso, sfida.codice ? SFIDA_QUIZ_LINK_MS : SFIDA_SCADENZA_MS)
  const soglia = sogliaFermo(adesso)
  const [creato] = await db.batch([
    db
      .prepare(
        `INSERT INTO quiz_duelli
           (id, giocatore_a, giocatore_b, impostazioni, domande, stato, serie_a, serie_b, partite, created_at, updated_at)
         SELECT ?1, ?2, ?3, s.impostazioni, s.domande, 'attesa', ?4, ?5, ?6, ?7, ?7
           FROM quiz_sfide s
          WHERE s.id = ?8 AND s.stato = 'attesa' AND s.created_at >= ?9
            AND ?10 NOT IN (${nelDuello('?11')}) AND ?12 NOT IN (${nelDuello('?11')})`,
      )
      .bind(duelloId, a, b, serie.a, serie.b, serie.partite, quando, sfida.id, limite, sfida.da_id, soglia, io),
    db
      .prepare(
        `UPDATE quiz_sfide SET stato = 'accettata', a_id = ?1, duello_id = ?2, risposto_at = ?3
          WHERE id = ?4 AND stato = 'attesa' AND EXISTS (SELECT 1 FROM quiz_duelli WHERE id = ?2)`,
      )
      .bind(io, duelloId, quando, sfida.id),
    db
      .prepare(
        `UPDATE quiz_sfide SET stato = 'annullata', risposto_at = ?1
          WHERE stato = 'attesa' AND id != ?2 AND (da_id IN (?3, ?4) OR a_id IN (?3, ?4))
            AND EXISTS (SELECT 1 FROM quiz_duelli WHERE id = ?5)`,
      )
      .bind(quando, sfida.id, sfida.da_id, io, duelloId),
  ])
  if (creato.meta.changes !== 1) fail(409, 'OCCUPATO', 'Uno dei due è già in un’altra sfida: riprova fra poco.')
  return duelloId
}

export async function accettaLinkQuiz(db: D1Database, codice: string, io: string, adesso: number): Promise<string> {
  const sfida = await sfidaPerCodice(db, codice)
  if (!sfida) fail(404, 'LINK_NON_TROVATO', 'Questo invito non esiste.')
  return accettaSfidaQuiz(db, sfida, io, adesso)
}

/* ──────────────────────────────  I duelli  ────────────────────────────── */

export async function duelloPerId(db: D1Database, id: string): Promise<DuelloRow | null> {
  return db.prepare('SELECT * FROM quiz_duelli WHERE id = ?').bind(id).first<DuelloRow>()
}

export function latoNelDuello(row: DuelloRow, playerId: string): LatoSfida | null {
  if (row.giocatore_a === playerId) return 'a'
  if (row.giocatore_b === playerId) return 'b'
  return null
}

function domandeDi(row: DuelloRow): DomandaCompleta[] {
  return JSON.parse(row.domande) as DomandaCompleta[]
}

function risposteDi(row: DuelloRow): RispostaSfida[] {
  return JSON.parse(row.risposte) as RispostaSfida[]
}

function limitiDi(row: DuelloRow, domande = domandeDi(row)): number[] {
  const imp = impostazioniDi(row)
  return domande.map((d) => limiteMs(imp, !!d.cartina, !!d.lunga))
}

/** Lo stato del duello adesso; prima del via, un duello senza domande aperte. */
export function statoDiDuello(row: DuelloRow, adesso: number): StatoSfida {
  if (row.inizio_at === null) return { giri: [], corrente: 0, prossimaAt: null, finito: false, punti: { a: 0, b: 0 } }
  return statoSfida(row.inizio_at, limitiDi(row), risposteDi(row), adesso)
}

/**
 * Chi e' arrivato nella pagina del duello. Quando ci sono tutti e due si fissa
 * l'ora della prima domanda, fra il tempo del tre-due-uno: in una istruzione
 * sola, cosi' due "pronto" ravvicinati non la fissano due volte.
 */
export async function segnaPronto(db: D1Database, row: DuelloRow, lato: LatoSfida, adesso: number): Promise<DuelloRow> {
  if (row.stato !== 'attesa') return row
  const mio = lato === 'a' ? 'pronto_a' : 'pronto_b'
  const suo = lato === 'a' ? 'pronto_b' : 'pronto_a'
  await db
    .prepare(
      `UPDATE quiz_duelli
          SET ${mio} = 1, updated_at = ?1,
              inizio_at = CASE WHEN ${suo} = 1 AND inizio_at IS NULL THEN ?2 ELSE inizio_at END,
              stato = CASE WHEN ${suo} = 1 THEN 'in_corso' ELSE stato END
        WHERE id = ?3 AND stato = 'attesa'`,
    )
    .bind(new Date(adesso).toISOString(), adesso + VIA_SFIDA_MS, row.id)
    .run()
  return (await duelloPerId(db, row.id)) ?? row
}

/**
 * Le chiusure che non ha scritto nessuno: un duello finito per il tempo, o
 * uno in cui l'altro non e' mai arrivato. Si scrivono alla prima lettura che
 * se ne accorge, condizionate allo stato letto.
 */
export async function aggiornaDuello(db: D1Database, row: DuelloRow, adesso: number): Promise<DuelloRow> {
  const quando = new Date(adesso).toISOString()
  if (row.stato === 'attesa' && adesso - Date.parse(row.created_at) > PRONTI_ENTRO_MS) {
    await db
      .prepare(`UPDATE quiz_duelli SET stato = 'abbandonato', updated_at = ? WHERE id = ? AND stato = 'attesa'`)
      .bind(quando, row.id)
      .run()
    return { ...row, stato: 'abbandonato', updated_at: quando }
  }
  if (row.stato === 'in_corso' && statoDiDuello(row, adesso).finito) {
    await db
      .prepare(`UPDATE quiz_duelli SET stato = 'finito', updated_at = ? WHERE id = ? AND stato = 'in_corso'`)
      .bind(quando, row.id)
      .run()
    return { ...row, stato: 'finito', updated_at: quando }
  }
  return row
}

/**
 * Una risposta: se la domanda e' aperta e chi risponde ha ancora tempo, si
 * aggiunge in fondo alle risposte, condizionata a quante ce n'erano. Se nel
 * frattempo ne e' arrivata un'altra — l'avversario, nello stesso istante — si
 * rilegge e si riprova una volta: l'altra risposta puo' aver chiuso la domanda.
 */
export async function rispondiNelDuello(
  db: D1Database,
  row: DuelloRow,
  lato: LatoSfida,
  indice: number,
  scelta: string,
  adesso: number,
  tentativo = 0,
): Promise<DuelloRow> {
  if (row.stato !== 'in_corso') fail(409, 'DUELLO_CHIUSO', 'La sfida non è in corso.')
  const domande = domandeDi(row)
  const risposte = risposteDi(row)
  const stato = statoSfida(row.inizio_at ?? 0, limitiDi(row, domande), risposte, adesso)
  const giro = stato.giri[indice]
  if (indice !== stato.corrente || !puoRispondere(giro, lato, adesso)) {
    fail(409, 'FUORI_TEMPO', 'Troppo tardi per questa domanda.')
  }
  const nuova: RispostaSfida = { i: indice, lato, scelta, t: adesso, giusta: rispostaGiusta(domande[indice], scelta) }
  const esito = await db
    .prepare(
      `UPDATE quiz_duelli SET risposte = ?1, updated_at = ?2
        WHERE id = ?3 AND stato = 'in_corso' AND json_array_length(risposte) = ?4`,
    )
    .bind(JSON.stringify([...risposte, nuova]), new Date(adesso).toISOString(), row.id, risposte.length)
    .run()
  if (esito.meta.changes !== 1) {
    const riletta = await duelloPerId(db, row.id)
    if (!riletta || tentativo > 0) fail(409, 'CONFLITTO', 'La sfida è cambiata nel frattempo.')
    return rispondiNelDuello(db, riletta, lato, indice, scelta, adesso, 1)
  }
  return (await duelloPerId(db, row.id)) ?? row
}

/** Chi se ne va: il duello finisce li', con i punti fatti fin li'. */
export async function esciDalDuello(db: D1Database, row: DuelloRow, lato: LatoSfida, adesso: number): Promise<void> {
  await db
    .prepare(
      `UPDATE quiz_duelli SET stato = 'abbandonato', resa = ?, updated_at = ?
        WHERE id = ? AND stato IN ('attesa', 'in_corso')`,
    )
    .bind(lato, new Date(adesso).toISOString(), row.id)
    .run()
}

/** La rivincita chiesta alla fine di un duello, se c'e': l'ultima. */
async function rivincitaDel(db: D1Database, duelloId: string): Promise<SfidaRow | null> {
  return db
    .prepare('SELECT * FROM quiz_sfide WHERE rivincita_di = ? ORDER BY created_at DESC LIMIT 1')
    .bind(duelloId)
    .first<SfidaRow>()
}

export async function rivincitaInAttesa(db: D1Database, duelloId: string, daId: string, adesso: number) {
  const r = await rivincitaDel(db, duelloId)
  return r && r.da_id === daId && r.stato === 'attesa' && adesso < scadenzaSfida(r) ? r : null
}

/** Il duello aperto di un giocatore, per il giro di controllo: in attesa che arrivi, o in corso. */
export async function duelloAperto(db: D1Database, io: string, adesso: number): Promise<DuelloBreve | null> {
  const row = await db
    .prepare(
      `SELECT * FROM quiz_duelli
        WHERE (giocatore_a = ?1 OR giocatore_b = ?1) AND stato IN ('attesa', 'in_corso') AND updated_at >= ?2
        ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(io, sogliaFermo(adesso))
    .first<DuelloRow>()
  if (!row) return null
  const lato = latoNelDuello(row, io)!
  return {
    id: row.id,
    avversario: await giocatore(db, lato === 'a' ? row.giocatore_b : row.giocatore_a),
    stato: row.stato === 'attesa' ? 'attesa' : 'in_corso',
  }
}

/**
 * Il duello visto da uno dei due. Le domande chiuse con tutto — la risposta
 * giusta, le risposte dei due — da `daGiro` in poi, cosi' il telefono chiede
 * solo quelle che non ha; quella aperta senza la risposta; e il rallenty.
 */
export async function vistaDuello(
  db: D1Database,
  row: DuelloRow,
  lato: LatoSfida,
  adesso: number,
  daGiro: number,
): Promise<VistaDuello> {
  const altro = avversarioDi(lato)
  const idAvversario = lato === 'a' ? row.giocatore_b : row.giocatore_a
  const [avversario, online, rivincita] = await Promise.all([
    giocatore(db, idAvversario),
    db
      .prepare('SELECT 1 AS si FROM presenza WHERE player_id = ? AND visto_at >= ?')
      .bind(idAvversario, prima(adesso, PRESENZA_ONLINE_MS))
      .first<{ si: number }>(),
    rivincitaDel(db, row.id),
  ])
  const imp = impostazioniDi(row)
  const domande = domandeDi(row)
  const stato = row.inizio_at === null ? null : statoSfida(row.inizio_at, limitiDi(row, domande), risposteDi(row), adesso)
  const chiusi = (stato?.giri ?? []).filter((g) => g.chiusaAt !== null)
  const aperto = stato?.giri.find((g) => g.chiusaAt === null) ?? null
  // A duello abbandonato la domanda aperta resta com'e': non si gioca piu'.
  const inGioco = row.stato === 'in_corso'

  const giri: GiroQuizVisto[] = chiusi.slice(Math.max(0, daGiro)).map((g) => {
    const d = domande[g.indice]
    const di = (l: LatoSfida) => {
      const r = g.risposte.find((x) => x.lato === l)
      return r ? { scelta: r.scelta, giusta: r.giusta } : null
    }
    return {
      indice: g.indice,
      domanda: senzaRisposta(d),
      corretta: d.giusta,
      risposta: d.risposta,
      ...(d.accettate ? { accettate: d.accettate } : {}),
      ...(d.luogo ? { luogo: d.luogo } : {}),
      ...(d.spiegazione ? { spiegazione: d.spiegazione } : {}),
      punto: g.punto === null ? null : g.punto === lato ? 'io' : 'avversario',
      mia: di(lato),
      sua: di(altro),
      chiusaAt: g.chiusaAt!,
    }
  })

  let rivista: RivincitaVista | null = null
  if (rivincita) {
    const scaduta = rivincita.stato === 'attesa' && adesso >= scadenzaSfida(rivincita)
    rivista = {
      id: rivincita.id,
      da: rivincita.da_id === (lato === 'a' ? row.giocatore_a : row.giocatore_b) ? 'io' : 'avversario',
      stato: scaduta ? 'scaduta' : rivincita.stato,
      duelloId: rivincita.duello_id,
    }
  }

  const punti = stato?.punti ?? { a: 0, b: 0 }
  return {
    id: row.id,
    stato: row.stato,
    impostazioni: imp,
    totale: domande.length,
    avversario: { ...avversario, online: online !== null },
    pronti: {
      io: (lato === 'a' ? row.pronto_a : row.pronto_b) === 1,
      avversario: (lato === 'a' ? row.pronto_b : row.pronto_a) === 1,
    },
    adesso,
    inizioAt: row.inizio_at,
    prossimaAt: inGioco ? (stato?.prossimaAt ?? null) : null,
    punti: { io: punti[lato], avversario: punti[altro] },
    serie: {
      io: lato === 'a' ? row.serie_a : row.serie_b,
      avversario: lato === 'a' ? row.serie_b : row.serie_a,
      partite: row.partite,
    },
    giri,
    domanda:
      aperto && inGioco
        ? {
            indice: aperto.indice,
            domanda: senzaRisposta(domande[aperto.indice]),
            apertaAt: aperto.apertaAt,
            limiteMs: limiteMs(imp, !!domande[aperto.indice].cartina, !!domande[aperto.indice].lunga),
            scadeIo: aperto.scade[lato],
            lentoIo: aperto.lentoDa[lato],
            scadeAvversario: aperto.scade[altro],
            lentoAvversario: aperto.lentoDa[altro],
            mia: aperto.risposte.find((r) => r.lato === lato)?.scelta ?? null,
            avversarioFuori: aperto.risposte.some((r) => r.lato === altro),
          }
        : null,
    uscito: row.resa === null ? null : row.resa === lato ? 'io' : 'avversario',
    rivincita: rivista,
  }
}

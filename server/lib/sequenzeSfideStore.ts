/**
 * Sequenze fra amici: gli inviti, che sono gia' la partita, e la partita vista
 * da ciascuno dei due. Inviti, sala e rivincita sono quelli di Nomi, cose e
 * città (`nomiSfideStore.ts`); cambia la partita.
 *
 * Quando l'altro accetta si pesca il seme e parte il tre-due-uno. Poi ognuno
 * ripete le stesse sequenze, dalla prima di tre cubetti, una in piu' a ogni
 * giusta e senza fine, finché non sbaglia. Il seme non esce dal server: la
 * prima sequenza la manda `apri`, ognuna delle altre arriva con la risposta
 * alla precedente, e la risposta la controlla il server. Ognuno scrive nelle
 * sue colonne, quindi due risposte insieme non si pestano.
 *
 * Una sequenza si vede una volta, come nella classificata: chiederla di nuovo
 * conta come sbagliata. Chi resta fermo per `SEQUENZE_SFIDA_FERMA_MS` con una
 * sequenza da ripetere — ha chiuso l'app — ha finito li'. La partita si chiude
 * quando hanno finito tutti e due, o prima, quando chi gioca ancora ha gia'
 * superato chi ha finito: vince chi e' arrivato piu' lontano.
 */

import {
  PRESENZA_ONLINE_MS,
  SEQUENZE_SFIDA_CONSERVA_MS,
  SEQUENZE_SFIDA_FERMA_MS,
  SEQUENZE_SFIDA_LINK_MS,
  SEQUENZE_SFIDA_VIA_MS,
  SFIDA_SCADENZA_MS,
} from '../../shared/config'
import {
  LIVELLI_SEQUENZE,
  leggiTocchi,
  livelloSequenzeValido,
  rispostaGiusta,
  sequenzaDelLivello,
  type LivelloSequenze,
} from '../../shared/sequenze'
import type {
  Attivita,
  GiocatoreBreve,
  GiocatoreOnline,
  InvitoConLink,
  InvitoSequenze,
  InvitoSequenzeMandato,
  LatoSfidaSequenze,
  SfidaSequenzeBreve,
  StatoSfidaSequenze,
  VistaSfidaSequenze,
} from '../../shared/types'
import { eOnline, nuovoCodice } from './battagliaStore'
import { fail, newId } from './http'

export type LatoSequenze = 'a' | 'b'

export interface SfidaRow {
  id: string
  giocatore_a: string
  giocatore_b: string | null
  invitato: string | null
  codice: string | null
  stato: StatoSfidaSequenze
  /** La difficolta': NULL nelle sfide di prima della migrazione 0043, che erano al normale. */
  livello: string | null
  seme: number | null
  inizio_at: string | null
  livello_a: number
  livello_b: number
  aperta_a: string | null
  aperta_b: string | null
  fine_a: string | null
  fine_b: string | null
  vincitore: LatoSequenze | 'pari' | null
  rivincita_di: string | null
  serie_a: number
  serie_b: number
  partite_serie: number
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

/**
 * Una partita toccata da meno di cosi' e' ancora aperta: ogni risposta la
 * riscrive, e chi resta fermo oltre `SEQUENZE_SFIDA_FERMA_MS` ha finito.
 */
const FERMA_DEL_TUTTO_MS = SEQUENZE_SFIDA_VIA_MS + SEQUENZE_SFIDA_FERMA_MS + 30_000

/** Chi e' in una sfida aperta: in corso, e toccata da poco. `soglia` e' il segnaposto dell'istante. */
function aperte(soglia: string): string {
  return `SELECT giocatore_a AS g FROM sequenze_sfide WHERE stato = 'in_corso' AND updated_at >= ${soglia}
          UNION SELECT giocatore_b FROM sequenze_sfide WHERE stato = 'in_corso' AND updated_at >= ${soglia}`
}

const sogliaAperte = (adesso: number) => prima(adesso, FERMA_DEL_TUTTO_MS)

async function giocatore(db: D1Database, id: string): Promise<GiocatoreBreve> {
  const r = await db
    .prepare('SELECT id, nickname, display_name, avatar_color FROM players WHERE id = ?')
    .bind(id)
    .first<GiocatoreRow>()
  if (!r) throw new Error(`Giocatore ${id} sparito da una sfida`)
  return breve(r)
}

export function latoDi(row: SfidaRow, playerId: string): LatoSequenze | null {
  if (row.giocatore_a === playerId) return 'a'
  if (row.giocatore_b !== null && row.giocatore_b === playerId) return 'b'
  return null
}

const altro = (lato: LatoSequenze): LatoSequenze => (lato === 'a' ? 'b' : 'a')

export async function sfidaPerId(db: D1Database, id: string): Promise<SfidaRow | null> {
  return db.prepare('SELECT * FROM sequenze_sfide WHERE id = ?').bind(id).first<SfidaRow>()
}

function scadeTra(row: SfidaRow, adesso: number): number {
  const durata = row.codice ? SEQUENZE_SFIDA_LINK_MS : SFIDA_SCADENZA_MS
  return Math.max(0, Date.parse(row.created_at) + durata - adesso)
}

/* ─────────────────────────────  Chi c'e'  ───────────────────────────── */

/** Chi e' online, con due cose in piu': se e' gia' in una sfida, e se ha un mio invito in attesa. */
export async function giocatoriOnline(db: D1Database, io: string, adesso: number): Promise<GiocatoreOnline[]> {
  const { results } = await db
    .prepare(
      `SELECT p.id, p.nickname, p.display_name, p.avatar_color, pr.attivita,
              p.id IN (${aperte('?4')}) AS occupato,
              EXISTS (SELECT 1 FROM sequenze_sfide s
                       WHERE s.giocatore_a = ?1 AND s.invitato = p.id AND s.stato = 'invito'
                         AND s.created_at >= ?3) AS invitato
         FROM presenza pr
         JOIN players p ON p.id = pr.player_id
        WHERE pr.visto_at >= ?2 AND p.id != ?1
        ORDER BY occupato, p.display_name COLLATE NOCASE`,
    )
    .bind(io, prima(adesso, PRESENZA_ONLINE_MS), prima(adesso, SFIDA_SCADENZA_MS), sogliaAperte(adesso))
    .all<GiocatoreRow & { attivita: Attivita; occupato: number; invitato: number }>()
  return results.map((r) => ({
    ...breve(r),
    attivita: r.attivita,
    occupato: r.occupato === 1,
    invitato: r.invitato === 1,
  }))
}

export async function inSfida(db: D1Database, playerId: string, adesso: number): Promise<boolean> {
  const riga = await db
    .prepare(`SELECT 1 AS si WHERE ?1 IN (${aperte('?2')})`)
    .bind(playerId, sogliaAperte(adesso))
    .first<{ si: number }>()
  return riga !== null
}

/** La sfida aperta di un giocatore, se ne ha una. */
export async function sfidaAperta(db: D1Database, playerId: string, adesso: number): Promise<SfidaRow | null> {
  return db
    .prepare(
      `SELECT * FROM sequenze_sfide
        WHERE stato = 'in_corso' AND (giocatore_a = ?1 OR giocatore_b = ?1) AND updated_at >= ?2
        ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(playerId, sogliaAperte(adesso))
    .first<SfidaRow>()
}

export async function sfidaBreve(db: D1Database, row: SfidaRow, io: LatoSequenze): Promise<SfidaSequenzeBreve> {
  const idAvversario = io === 'a' ? row.giocatore_b : row.giocatore_a
  return { id: row.id, avversario: await giocatore(db, idAvversario!) }
}

/* ─────────────────────────────  Gli inviti  ───────────────────────────── */

/**
 * Un invito nuovo, a un amico o con un link. Uno solo alla volta: il nuovo
 * annulla quello che aspettava ancora, e nello stesso batch se ne vanno le
 * sfide ferme da due giorni.
 */
export async function mandaInvito(
  db: D1Database,
  {
    da,
    a,
    livello = 'normale',
    rivincitaDi = null,
    serie = null,
  }: {
    da: string
    /** null per un invito con il link. */
    a: string | null
    livello?: LivelloSequenze
    rivincitaDi?: string | null
    serie?: { a: number; b: number; partite: number } | null
  },
  adesso: number,
): Promise<SfidaRow> {
  const id = newId('ssf')
  const quando = new Date(adesso).toISOString()
  const codice = a ? null : nuovoCodice()
  await db.batch([
    db
      .prepare(
        `UPDATE sequenze_sfide SET stato = 'annullata', updated_at = ? WHERE giocatore_a = ? AND stato = 'invito'`,
      )
      .bind(quando, da),
    db.prepare('DELETE FROM sequenze_sfide WHERE updated_at < ?').bind(prima(adesso, SEQUENZE_SFIDA_CONSERVA_MS)),
    db
      .prepare(
        `INSERT INTO sequenze_sfide
           (id, giocatore_a, invitato, codice, stato, livello, rivincita_di, serie_a, serie_b, partite_serie,
            created_at, updated_at)
         VALUES (?, ?, ?, ?, 'invito', ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        da,
        a,
        codice,
        livello,
        rivincitaDi,
        serie?.a ?? 0,
        serie?.b ?? 0,
        serie?.partite ?? 0,
        quando,
        quando,
      ),
  ])
  return (await sfidaPerId(db, id))!
}

/** Gli inviti arrivati e ancora validi: non scaduti, e da chi non e' finito in un'altra sfida. */
export async function invitiRicevuti(db: D1Database, io: string, adesso: number): Promise<InvitoSequenze[]> {
  const { results } = await db
    .prepare(
      `SELECT s.id AS invito_id, s.created_at, s.rivincita_di,
              p.id, p.nickname, p.display_name, p.avatar_color
         FROM sequenze_sfide s
         JOIN players p ON p.id = s.giocatore_a
        WHERE s.invitato = ?1 AND s.stato = 'invito' AND s.created_at >= ?2
          AND s.giocatore_a NOT IN (${aperte('?3')})
        ORDER BY s.created_at`,
    )
    .bind(io, prima(adesso, SFIDA_SCADENZA_MS), sogliaAperte(adesso))
    .all<GiocatoreRow & { invito_id: string; created_at: string; rivincita_di: string | null }>()
  return results.map((r) => ({
    id: r.invito_id,
    da: breve(r),
    scadeTraMs: Math.max(0, Date.parse(r.created_at) + SFIDA_SCADENZA_MS - adesso),
    rivincita: r.rivincita_di !== null,
  }))
}

function statoInvito(row: SfidaRow, adesso: number): InvitoSequenzeMandato['stato'] {
  if (row.stato === 'invito') return scadeTra(row, adesso) === 0 ? 'scaduto' : 'attesa'
  if (row.stato === 'rifiutata') return 'rifiutato'
  if (row.stato === 'annullata') return 'annullato'
  return 'accettato'
}

/** L'ultimo invito mandato dalla sala, se e' recente: la sala dice com'e' andato. */
export async function ultimoInvito(
  db: D1Database,
  io: string,
  adesso: number,
): Promise<InvitoSequenzeMandato | null> {
  const row = await db
    .prepare(
      `SELECT * FROM sequenze_sfide
        WHERE giocatore_a = ? AND rivincita_di IS NULL AND created_at >= ?
        ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(io, prima(adesso, SEQUENZE_SFIDA_LINK_MS))
    .first<SfidaRow>()
  if (!row) return null
  const stato = statoInvito(row, adesso)
  // Un invito ritirato non ha niente da dire; uno a un amico conta per qualche minuto, poi la sala torna pulita.
  if (stato === 'annullato') return null
  if (!row.codice && adesso - Date.parse(row.created_at) > SFIDA_SCADENZA_MS * 3 && stato !== 'attesa') return null
  return {
    id: row.id,
    a: row.invitato ? await giocatore(db, row.invitato) : null,
    codice: row.codice,
    stato,
    scadeTraMs: row.stato === 'invito' ? scadeTra(row, adesso) : 0,
    partitaId: stato === 'accettato' ? row.id : null,
  }
}

/**
 * Accetta un invito e apre la partita, in un batch: la riga passa in corso
 * solo se e' ancora un invito valido e nessuno dei due e' in un'altra sfida,
 * e nello stesso colpo si pescano il seme e il via fra un attimo. Poi gli
 * altri inviti dei due si annullano: due accettazioni ravvicinate non aprono
 * due partite.
 */
export async function accettaInvito(db: D1Database, row: SfidaRow, io: string, adesso: number): Promise<void> {
  if (row.giocatore_a === io) fail(409, 'INVITO_TUO', 'Questo invito l’hai mandato tu.')
  if (row.stato !== 'invito') {
    if (row.giocatore_b === io) return
    fail(409, 'INVITO_CHIUSO', 'Questo invito non è più valido.')
  }
  if (row.invitato && row.invitato !== io) fail(404, 'INVITO_NON_TROVATO', 'Questo invito non esiste.')
  if (scadeTra(row, adesso) === 0) fail(409, 'INVITO_SCADUTO', 'L’invito è scaduto.')

  // Un intero positivo a caso: il seme delle sequenze, che nessuno dei due deve poter indovinare.
  const seme = crypto.getRandomValues(new Uint32Array(1))[0] >>> 1
  const quando = new Date(adesso).toISOString()
  const via = new Date(adesso + SEQUENZE_SFIDA_VIA_MS).toISOString()
  const [aperta] = await db.batch([
    db
      .prepare(
        `UPDATE sequenze_sfide
            SET stato = 'in_corso', giocatore_b = ?1, invitato = ?1, seme = ?2, inizio_at = ?3,
                versione = versione + 1, updated_at = ?4
          WHERE id = ?5 AND stato = 'invito' AND (invitato = ?1 OR invitato IS NULL) AND giocatore_a != ?1
            AND ?1 NOT IN (${aperte('?6')}) AND giocatore_a NOT IN (${aperte('?6')})`,
      )
      .bind(io, seme, via, quando, row.id, sogliaAperte(adesso)),
    db
      .prepare(
        `UPDATE sequenze_sfide SET stato = 'annullata', updated_at = ?1
          WHERE stato = 'invito' AND id != ?2
            AND (giocatore_a IN (?3, ?4) OR invitato IN (?3, ?4))
            AND EXISTS (SELECT 1 FROM sequenze_sfide WHERE id = ?2 AND stato = 'in_corso' AND giocatore_b = ?4)`,
      )
      .bind(quando, row.id, row.giocatore_a, io),
  ])
  if (aperta.meta.changes !== 1) {
    const dopo = await sfidaPerId(db, row.id)
    if (dopo?.stato === 'in_corso' && dopo.giocatore_b === io) return
    if (dopo?.stato !== 'invito') fail(409, 'INVITO_CHIUSO', 'Questo invito non è più valido.')
    fail(409, 'OCCUPATO', 'Uno dei due sta già giocando un’altra sfida.')
  }
}

/** Rifiuta un invito arrivato, o lo ritira chi l'ha mandato. */
export async function chiudiInvito(
  db: D1Database,
  row: SfidaRow,
  io: string,
  come: 'rifiutata' | 'annullata',
  adesso: number,
): Promise<void> {
  const mio = come === 'annullata' ? row.giocatore_a === io : row.invitato === io
  if (!mio) fail(404, 'INVITO_NON_TROVATO', 'Questo invito non esiste.')
  await db
    .prepare(`UPDATE sequenze_sfide SET stato = ?, updated_at = ? WHERE id = ? AND stato = 'invito'`)
    .bind(come, new Date(adesso).toISOString(), row.id)
    .run()
}

export async function invitoConCodice(db: D1Database, codice: string): Promise<SfidaRow | null> {
  return db.prepare('SELECT * FROM sequenze_sfide WHERE codice = ?').bind(codice).first<SfidaRow>()
}

/** Un invito con il link, come lo vede chi lo apre: anche senza account. */
export async function invitoSequenzeConLink(
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
  return { codice, da: await giocatore(db, row.giocatore_a), stato, gioco: 'sequenze' }
}

/* ─────────────────────────────  La rivincita  ───────────────────────────── */

/** L'ultima rivincita chiesta per una partita, se c'e'. */
export async function rivincitaDi(db: D1Database, partitaId: string): Promise<SfidaRow | null> {
  return db
    .prepare('SELECT * FROM sequenze_sfide WHERE rivincita_di = ? ORDER BY created_at DESC LIMIT 1')
    .bind(partitaId)
    .first<SfidaRow>()
}

/**
 * La serie dopo una partita, per quella che viene: le vittorie contate per
 * giocatore, perché nella rivincita chi la chiede e' 'a', anche se prima era 'b'.
 */
export function serieDopo(row: SfidaRow, nuovoA: string, nuovoB: string): { a: number; b: number; partite: number } {
  const vinte = (id: string) => {
    const lato = latoDi(row, id)
    if (!lato) return 0
    return (lato === 'a' ? row.serie_a : row.serie_b) + (row.vincitore === lato ? 1 : 0)
  }
  return { a: vinte(nuovoA), b: vinte(nuovoB), partite: row.partite_serie + 1 }
}

/* ─────────────────────────────  La partita  ───────────────────────────── */

const giusteDi = (row: SfidaRow, lato: LatoSequenze) => (lato === 'a' ? row.livello_a : row.livello_b)
const apertaDi = (row: SfidaRow, lato: LatoSequenze) => (lato === 'a' ? row.aperta_a : row.aperta_b)
const finitaDi = (row: SfidaRow, lato: LatoSequenze) => (lato === 'a' ? row.fine_a : row.fine_b)

/** Il via e' passato: si gioca. */
export function cominciata(row: SfidaRow, adesso: number): boolean {
  return row.stato === 'in_corso' && row.inizio_at !== null && adesso >= Date.parse(row.inizio_at)
}

/**
 * Quando ha finito uno dei due: quando ha sbagliato, o quando e' rimasto fermo
 * troppo a lungo con una sequenza da ripetere, o senza aver mai cominciato.
 * null se gioca ancora.
 */
export function fineDi(row: SfidaRow, lato: LatoSequenze, adesso: number): number | null {
  const fine = finitaDi(row, lato)
  if (fine) return Date.parse(fine)
  const aperta = apertaDi(row, lato)
  const da = aperta ? Date.parse(aperta) : row.inizio_at ? Date.parse(row.inizio_at) : null
  if (da === null) return null
  return adesso > da + SEQUENZE_SFIDA_FERMA_MS ? da + SEQUENZE_SFIDA_FERMA_MS : null
}

/**
 * Chi ha vinto, se si sa gia': hanno finito tutti e due, o chi gioca ancora ha
 * gia' ripetuto piu' sequenze di chi ha finito, e non puo' piu' perdere.
 */
export function vincitoreDi(row: SfidaRow, adesso: number): SfidaRow['vincitore'] {
  const finitoA = fineDi(row, 'a', adesso) !== null
  const finitoB = fineDi(row, 'b', adesso) !== null
  const a = row.livello_a
  const b = row.livello_b
  if (finitoA && finitoB) return a > b ? 'a' : a < b ? 'b' : 'pari'
  if (finitoA && b > a) return 'b'
  if (finitoB && a > b) return 'a'
  return null
}

/**
 * Chiude la partita se si sa chi ha vinto, con le fine di chi e' rimasto fermo.
 * Condizionata alla versione, che ogni risposta fa salire: una risposta
 * arrivata nel frattempo la fa rileggere invece di chiuderla con un conto vecchio.
 */
export async function chiudiSeFinita(db: D1Database, row: SfidaRow, adesso: number): Promise<SfidaRow> {
  if (row.stato !== 'in_corso') return row
  const vincitore = vincitoreDi(row, adesso)
  if (vincitore === null) return row
  const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString())
  const quando = new Date(adesso).toISOString()
  await db
    .prepare(
      `UPDATE sequenze_sfide
          SET stato = 'finita', vincitore = ?, fine_a = COALESCE(fine_a, ?, ?), fine_b = COALESCE(fine_b, ?, ?),
              aperta_a = NULL, aperta_b = NULL, versione = versione + 1, updated_at = ?, finita_at = ?
        WHERE id = ? AND stato = 'in_corso' AND versione = ?`,
    )
    .bind(
      vincitore,
      iso(fineDi(row, 'a', adesso)),
      quando,
      iso(fineDi(row, 'b', adesso)),
      quando,
      quando,
      quando,
      row.id,
      row.versione,
    )
    .run()
  return (await sfidaPerId(db, row.id)) ?? row
}

/** La difficolta' della sfida, con il normale per le sfide di prima. */
export const livelloDi = (row: SfidaRow): LivelloSequenze => livelloSequenzeValido(row.livello)

/** La sequenza da ripetere a un livello, dal seme della partita: la prima ha i cubetti della difficolta'. */
function sequenzaDi(row: SfidaRow, giuste: number): number[] {
  return sequenzaDelLivello(row.seme ?? 0, LIVELLI_SEQUENZE[livelloDi(row)].prima + giuste)
}

/** Si puo' giocare: la partita e' cominciata, e chi chiede non ha finito. */
function controllaInGioco(row: SfidaRow, lato: LatoSequenze, adesso: number): void {
  if (!cominciata(row, adesso)) fail(409, 'NON_COMINCIATA', 'La sfida non è ancora cominciata.')
  if (fineDi(row, lato, adesso) !== null) fail(409, 'HAI_FINITO', 'Hai già finito.')
}

/**
 * La prima sequenza, dopo il via. Se era gia' uscita — la pagina si e'
 * riaperta — conta sbagliata: si vede una volta. Il risultato e' la sequenza,
 * o null se la chiesta e' costata la partita.
 */
export async function apri(
  db: D1Database,
  row: SfidaRow,
  lato: LatoSequenze,
  livello: number,
  adesso: number,
): Promise<number[] | null> {
  controllaInGioco(row, lato, adesso)
  const giuste = giusteDi(row, lato)
  if (livello !== giuste) fail(409, 'MOSSA_VECCHIA', 'La sfida è andata avanti: ricarico.')
  const colonna = lato === 'a' ? 'a' : 'b'
  const quando = new Date(adesso).toISOString()
  if (apertaDi(row, lato) !== null) {
    await db
      .prepare(
        `UPDATE sequenze_sfide SET fine_${colonna} = ?1, aperta_${colonna} = NULL, versione = versione + 1,
                updated_at = ?1
          WHERE id = ?2 AND stato = 'in_corso' AND livello_${colonna} = ?3 AND fine_${colonna} IS NULL`,
      )
      .bind(quando, row.id, giuste)
      .run()
    return null
  }
  const scritta = await db
    .prepare(
      `UPDATE sequenze_sfide SET aperta_${colonna} = ?1, versione = versione + 1, updated_at = ?1
        WHERE id = ?2 AND stato = 'in_corso' AND livello_${colonna} = ?3 AND aperta_${colonna} IS NULL
          AND fine_${colonna} IS NULL`,
    )
    .bind(quando, row.id, giuste)
    .run()
  if (scritta.meta.changes !== 1) fail(409, 'MOSSA_VECCHIA', 'La sfida è andata avanti: ricarico.')
  return sequenzaDi(row, giuste)
}

/**
 * La risposta alla sequenza aperta. Giusta, sale di uno e la risposta porta la
 * sequenza dopo, gia' aperta; sbagliata, ha finito. La scrittura e'
 * condizionata al livello letto: un doppio tocco non risponde due volte.
 */
export async function rispondi(
  db: D1Database,
  row: SfidaRow,
  lato: LatoSequenze,
  livello: number,
  valore: unknown,
  adesso: number,
): Promise<{ giusta: boolean; sequenza: number[] | null }> {
  controllaInGioco(row, lato, adesso)
  const giuste = giusteDi(row, lato)
  if (livello !== giuste || apertaDi(row, lato) === null) {
    fail(409, 'MOSSA_VECCHIA', 'La sfida è andata avanti: ricarico.')
  }
  const sequenza = sequenzaDi(row, giuste)
  const tocchi = leggiTocchi(valore, sequenza.length)
  if (!tocchi) fail(400, 'TOCCHI', 'Risposta non valida.')
  const giusta = rispostaGiusta(sequenza, tocchi, LIVELLI_SEQUENZE[livelloDi(row)].indietro)
  const colonna = lato === 'a' ? 'a' : 'b'
  const quando = new Date(adesso).toISOString()
  const scritta = await db
    .prepare(
      giusta
        ? `UPDATE sequenze_sfide SET livello_${colonna} = livello_${colonna} + 1, aperta_${colonna} = ?1,
                  versione = versione + 1, updated_at = ?1
            WHERE id = ?2 AND stato = 'in_corso' AND livello_${colonna} = ?3 AND aperta_${colonna} IS NOT NULL
              AND fine_${colonna} IS NULL`
        : `UPDATE sequenze_sfide SET fine_${colonna} = ?1, aperta_${colonna} = NULL,
                  versione = versione + 1, updated_at = ?1
            WHERE id = ?2 AND stato = 'in_corso' AND livello_${colonna} = ?3 AND aperta_${colonna} IS NOT NULL
              AND fine_${colonna} IS NULL`,
    )
    .bind(quando, row.id, giuste)
    .run()
  if (scritta.meta.changes !== 1) fail(409, 'MOSSA_VECCHIA', 'La sfida è andata avanti: ricarico.')
  return { giusta, sequenza: giusta ? sequenzaDi(row, giuste + 1) : null }
}

/** La partita vista da uno dei due: dove sono arrivati, e chi ha vinto. */
export async function vistaSfida(
  db: D1Database,
  row: SfidaRow,
  io: LatoSequenze,
  adesso: number,
): Promise<VistaSfidaSequenze> {
  const lui = altro(io)
  const idAvversario = io === 'a' ? (row.giocatore_b ?? row.invitato) : row.giocatore_a
  const [avversario, online, rivincita] = await Promise.all([
    idAvversario ? giocatore(db, idAvversario) : Promise.resolve(null),
    idAvversario ? eOnline(db, idAvversario, adesso) : Promise.resolve(false),
    row.stato === 'finita' ? rivincitaDi(db, row.id) : Promise.resolve(null),
  ])
  const finita = row.stato === 'finita'
  const inizio = row.inizio_at ? Date.parse(row.inizio_at) : null
  const lato = (l: LatoSequenze): LatoSfidaSequenze => ({
    giuste: giusteDi(row, l),
    finito: finita || fineDi(row, l, adesso) !== null,
  })
  const mie = lato(io)
  const mioId = io === 'a' ? row.giocatore_a : row.giocatore_b
  const serieMie = (io === 'a' ? row.serie_a : row.serie_b) + (finita && row.vincitore === io ? 1 : 0)
  const serieSue = (io === 'a' ? row.serie_b : row.serie_a) + (finita && row.vincitore === lui ? 1 : 0)
  return {
    id: row.id,
    stato: row.stato,
    livello: livelloDi(row),
    avversario,
    online,
    inizioTraMs: row.stato === 'in_corso' && inizio !== null && adesso < inizio ? inizio - adesso : null,
    mie: { ...mie, aperta: !mie.finito && apertaDi(row, io) !== null },
    sue: lato(lui),
    vincitore:
      row.vincitore === null ? null : row.vincitore === 'pari' ? 'pari' : row.vincitore === io ? 'io' : 'avversario',
    serie: { mie: serieMie, sue: serieSue, partite: row.partite_serie + (finita ? 1 : 0) },
    rivincita: rivincita
      ? { id: rivincita.id, mia: rivincita.giocatore_a === mioId, stato: rivincita.stato }
      : null,
  }
}

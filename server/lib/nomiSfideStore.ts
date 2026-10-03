/**
 * Nomi, cose e città fra amici: gli inviti, che sono gia' la partita, e la
 * partita vista da ciascuno dei due. Il modello e' quello di Indovina chi.
 *
 * Una riga nasce invito e diventa partita quando l'altro accetta, con un
 * `UPDATE` condizionato allo stato: nello stesso momento si pescano la lettera
 * e le categorie, e parte il tre-due-uno. Poi si scrive insieme, e le risposte
 * di ognuno si salvano nella sua colonna. Chi finisce per primo dice stop: da
 * li' si smette di scrivere tutti, come al tavolo, con il margine della rete.
 * Il tempo che finisce non si scrive: la partita la chiude la prima richiesta
 * che arriva dopo, che conta i punti con il lessico (`chiudiSeFinita`).
 *
 * Il foglio dell'altro non esce da qui finché la partita non e' finita: mentre
 * si gioca si sa solo quante risposte ha scritto.
 */

import {
  NOMI_SFIDA_CONSERVA_MS,
  NOMI_SFIDA_LINK_MS,
  NOMI_SFIDA_VIA_MS,
  PRESENZA_ONLINE_MS,
  SFIDA_SCADENZA_MS,
} from '../../shared/config'
import {
  LETTERE_NOMI,
  MARGINE_NOMI_MS,
  TEMPO_NOMI_MS,
  categorieIdonee,
  pescaCategorie,
  puntiSfida,
  riconosci,
  type CategoriaNomi,
  type LessicoNomi,
  type LetteraNomi,
} from '../../shared/nomi-cose'
import { CONTI_LESSICO_NOMI } from '../../shared/nomi-cose-lessico'
import type {
  Attivita,
  FoglioSfidaNomi,
  GiocatoreBreve,
  GiocatoreOnline,
  InvitoConLink,
  InvitoNomi,
  InvitoNomiMandato,
  SfidaNomiBreve,
  StatoSfidaNomi,
  VistaSfidaNomi,
} from '../../shared/types'
import { eOnline, nuovoCodice } from './battagliaStore'
import { fail, newId } from './http'
import { categorieDi, leggiRisposte, risposteDi, type RisposteNomi } from './nomiStore'

export type LatoNomi = 'a' | 'b'

export interface SfidaRow {
  id: string
  giocatore_a: string
  giocatore_b: string | null
  invitato: string | null
  codice: string | null
  stato: StatoSfidaNomi
  lettera: string | null
  categorie: string | null
  inizio_at: string | null
  stop_at: string | null
  stop_di: LatoNomi | 'tempo' | null
  risposte_a: string
  risposte_b: string
  esito: string | null
  vincitore: LatoNomi | 'pari' | null
  rivincita_di: string | null
  serie_a: number
  serie_b: number
  partite_serie: number
  versione: number
  created_at: string
  updated_at: string
  finita_at: string | null
}

/** Com'e' finita, come la salva la chiusura: per lato, le forme riconosciute e i punti di ogni categoria. */
interface Esito {
  forme: [(string | null)[], (string | null)[]]
  punti: [number[], number[]]
  totali: [number, number]
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

/** Una partita cominciata da meno di cosi' e' ancora aperta: il via, il tempo, il margine e un respiro. */
const DURATA_MASSIMA_MS = NOMI_SFIDA_VIA_MS + TEMPO_NOMI_MS + MARGINE_NOMI_MS + 60_000

/** Chi e' in una sfida aperta: in corso, e cominciata da poco. `soglia` e' il segnaposto dell'istante. */
function aperte(soglia: string): string {
  return `SELECT giocatore_a AS g FROM nomi_sfide WHERE stato = 'in_corso' AND inizio_at >= ${soglia}
          UNION SELECT giocatore_b FROM nomi_sfide WHERE stato = 'in_corso' AND inizio_at >= ${soglia}`
}

const sogliaAperte = (adesso: number) => prima(adesso, DURATA_MASSIMA_MS)

async function giocatore(db: D1Database, id: string): Promise<GiocatoreBreve> {
  const r = await db
    .prepare('SELECT id, nickname, display_name, avatar_color FROM players WHERE id = ?')
    .bind(id)
    .first<GiocatoreRow>()
  if (!r) throw new Error(`Giocatore ${id} sparito da una sfida`)
  return breve(r)
}

export function latoDi(row: SfidaRow, playerId: string): LatoNomi | null {
  if (row.giocatore_a === playerId) return 'a'
  if (row.giocatore_b !== null && row.giocatore_b === playerId) return 'b'
  return null
}

const altro = (lato: LatoNomi): LatoNomi => (lato === 'a' ? 'b' : 'a')

export async function sfidaPerId(db: D1Database, id: string): Promise<SfidaRow | null> {
  return db.prepare('SELECT * FROM nomi_sfide WHERE id = ?').bind(id).first<SfidaRow>()
}

/** Un numero a caso fra zero e uno, dal generatore del sistema: la lettera e le categorie non si indovinano. */
function aCaso(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32
}

function scadeTra(row: SfidaRow, adesso: number): number {
  const durata = row.codice ? NOMI_SFIDA_LINK_MS : SFIDA_SCADENZA_MS
  return Math.max(0, Date.parse(row.created_at) + durata - adesso)
}

/* ─────────────────────────────  Il tempo  ───────────────────────────── */

/** Quando non si scrive piu': allo stop, o alla fine del tempo. null prima del via. */
export function chiusuraDi(row: Pick<SfidaRow, 'inizio_at' | 'stop_at'>): number | null {
  if (!row.inizio_at) return null
  const fine = Date.parse(row.inizio_at) + TEMPO_NOMI_MS
  return row.stop_at ? Math.min(fine, Date.parse(row.stop_at)) : fine
}

/** Si scrive ancora: la partita e' cominciata, e lo stop o la fine del tempo non sono passati, col margine. */
export function siScrive(row: SfidaRow, adesso: number): boolean {
  const chiusura = chiusuraDi(row)
  return (
    row.stato === 'in_corso' &&
    chiusura !== null &&
    adesso >= Date.parse(row.inizio_at!) &&
    adesso <= chiusura + MARGINE_NOMI_MS
  )
}

/** La partita e' da chiudere: in corso, e oltre lo stop o la fine del tempo, margine compreso. */
export function daChiudere(row: SfidaRow, adesso: number): boolean {
  const chiusura = chiusuraDi(row)
  return row.stato === 'in_corso' && chiusura !== null && adesso > chiusura + MARGINE_NOMI_MS
}

/* ─────────────────────────────  Chi c'e'  ───────────────────────────── */

/** Chi e' online, con due cose in piu': se e' gia' in una sfida, e se ha un mio invito in attesa. */
export async function giocatoriOnline(db: D1Database, io: string, adesso: number): Promise<GiocatoreOnline[]> {
  const { results } = await db
    .prepare(
      `SELECT p.id, p.nickname, p.display_name, p.avatar_color, pr.attivita,
              p.id IN (${aperte('?4')}) AS occupato,
              EXISTS (SELECT 1 FROM nomi_sfide s
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
      `SELECT * FROM nomi_sfide
        WHERE stato = 'in_corso' AND (giocatore_a = ?1 OR giocatore_b = ?1) AND inizio_at >= ?2
        ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(playerId, sogliaAperte(adesso))
    .first<SfidaRow>()
}

export async function sfidaBreve(db: D1Database, row: SfidaRow, io: LatoNomi): Promise<SfidaNomiBreve> {
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
    rivincitaDi = null,
    serie = null,
  }: {
    da: string
    /** null per un invito con il link. */
    a: string | null
    rivincitaDi?: string | null
    serie?: { a: number; b: number; partite: number } | null
  },
  adesso: number,
): Promise<SfidaRow> {
  const id = newId('nsf')
  const quando = new Date(adesso).toISOString()
  const codice = a ? null : nuovoCodice()
  await db.batch([
    db
      .prepare(`UPDATE nomi_sfide SET stato = 'annullata', updated_at = ? WHERE giocatore_a = ? AND stato = 'invito'`)
      .bind(quando, da),
    db.prepare('DELETE FROM nomi_sfide WHERE updated_at < ?').bind(prima(adesso, NOMI_SFIDA_CONSERVA_MS)),
    db
      .prepare(
        `INSERT INTO nomi_sfide
           (id, giocatore_a, invitato, codice, stato, rivincita_di, serie_a, serie_b, partite_serie,
            created_at, updated_at)
         VALUES (?, ?, ?, ?, 'invito', ?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, da, a, codice, rivincitaDi, serie?.a ?? 0, serie?.b ?? 0, serie?.partite ?? 0, quando, quando),
  ])
  return (await sfidaPerId(db, id))!
}

/** Gli inviti arrivati e ancora validi: non scaduti, e da chi non e' finito in un'altra sfida. */
export async function invitiRicevuti(db: D1Database, io: string, adesso: number): Promise<InvitoNomi[]> {
  const { results } = await db
    .prepare(
      `SELECT s.id AS invito_id, s.created_at, s.rivincita_di,
              p.id, p.nickname, p.display_name, p.avatar_color
         FROM nomi_sfide s
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

function statoInvito(row: SfidaRow, adesso: number): InvitoNomiMandato['stato'] {
  if (row.stato === 'invito') return scadeTra(row, adesso) === 0 ? 'scaduto' : 'attesa'
  if (row.stato === 'rifiutata') return 'rifiutato'
  if (row.stato === 'annullata') return 'annullato'
  return 'accettato'
}

/** L'ultimo invito mandato dalla sala, se e' recente: la sala dice com'e' andato. */
export async function ultimoInvito(db: D1Database, io: string, adesso: number): Promise<InvitoNomiMandato | null> {
  const row = await db
    .prepare(
      `SELECT * FROM nomi_sfide
        WHERE giocatore_a = ? AND rivincita_di IS NULL AND created_at >= ?
        ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(io, prima(adesso, NOMI_SFIDA_LINK_MS))
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
 * e nello stesso colpo si pescano la lettera e le categorie, e il via fra un
 * attimo. Poi gli altri inviti dei due si annullano: due accettazioni
 * ravvicinate non aprono due partite.
 */
export async function accettaInvito(db: D1Database, row: SfidaRow, io: string, adesso: number): Promise<void> {
  if (row.giocatore_a === io) fail(409, 'INVITO_TUO', 'Questo invito l’hai mandato tu.')
  if (row.stato !== 'invito') {
    if (row.giocatore_b === io) return
    fail(409, 'INVITO_CHIUSO', 'Questo invito non è più valido.')
  }
  if (row.invitato && row.invitato !== io) fail(404, 'INVITO_NON_TROVATO', 'Questo invito non esiste.')
  if (scadeTra(row, adesso) === 0) fail(409, 'INVITO_SCADUTO', 'L’invito è scaduto.')

  const lettera: LetteraNomi = LETTERE_NOMI[Math.floor(aCaso() * LETTERE_NOMI.length)]
  const categorie = pescaCategorie(categorieIdonee(lettera, CONTI_LESSICO_NOMI), aCaso)
  const quando = new Date(adesso).toISOString()
  const via = new Date(adesso + NOMI_SFIDA_VIA_MS).toISOString()
  const [aperta] = await db.batch([
    db
      .prepare(
        `UPDATE nomi_sfide
            SET stato = 'in_corso', giocatore_b = ?1, invitato = ?1, lettera = ?2, categorie = ?3, inizio_at = ?4,
                versione = versione + 1, updated_at = ?5
          WHERE id = ?6 AND stato = 'invito' AND (invitato = ?1 OR invitato IS NULL) AND giocatore_a != ?1
            AND ?1 NOT IN (${aperte('?7')}) AND giocatore_a NOT IN (${aperte('?7')})`,
      )
      .bind(io, lettera, JSON.stringify(categorie), via, quando, row.id, sogliaAperte(adesso)),
    db
      .prepare(
        `UPDATE nomi_sfide SET stato = 'annullata', updated_at = ?1
          WHERE stato = 'invito' AND id != ?2
            AND (giocatore_a IN (?3, ?4) OR invitato IN (?3, ?4))
            AND EXISTS (SELECT 1 FROM nomi_sfide WHERE id = ?2 AND stato = 'in_corso' AND giocatore_b = ?4)`,
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
    .prepare(`UPDATE nomi_sfide SET stato = ?, updated_at = ? WHERE id = ? AND stato = 'invito'`)
    .bind(come, new Date(adesso).toISOString(), row.id)
    .run()
}

export async function invitoConCodice(db: D1Database, codice: string): Promise<SfidaRow | null> {
  return db.prepare('SELECT * FROM nomi_sfide WHERE codice = ?').bind(codice).first<SfidaRow>()
}

/** Un invito con il link, come lo vede chi lo apre: anche senza account. */
export async function invitoNomiConLink(db: D1Database, codice: string, adesso: number): Promise<InvitoConLink | null> {
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
  return { codice, da: await giocatore(db, row.giocatore_a), stato, gioco: 'nomi' }
}

/* ─────────────────────────────  La rivincita  ───────────────────────────── */

/** L'ultima rivincita chiesta per una partita, se c'e'. */
export async function rivincitaDi(db: D1Database, partitaId: string): Promise<SfidaRow | null> {
  return db
    .prepare('SELECT * FROM nomi_sfide WHERE rivincita_di = ? ORDER BY created_at DESC LIMIT 1')
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

function risposteDelLato(row: SfidaRow, lato: LatoNomi): RisposteNomi {
  return risposteDi({ risposte: lato === 'a' ? row.risposte_a : row.risposte_b })
}

function esitoDi(row: SfidaRow): Esito | null {
  if (!row.esito) return null
  try {
    return JSON.parse(row.esito) as Esito
  } catch {
    return null
  }
}

/** Le risposte mandate dal telefono, se sono un foglio valido per le categorie della partita. */
export function leggiFoglio(row: SfidaRow, valore: unknown): RisposteNomi {
  const risposte = leggiRisposte(valore, categorieDi({ categorie: row.categorie ?? '[]' }))
  if (!risposte) fail(400, 'RISPOSTE', 'Risposte non valide.')
  return risposte
}

/**
 * Salva le risposte di uno dei due, finché si scrive. Le colonne sono una per
 * lato, quindi due scritture insieme non si pestano: vale l'ultima di ognuno.
 */
export async function salvaRisposte(
  db: D1Database,
  row: SfidaRow,
  lato: LatoNomi,
  risposte: RisposteNomi,
  adesso: number,
): Promise<void> {
  if (!siScrive(row, adesso)) return
  const colonna = lato === 'a' ? 'risposte_a' : 'risposte_b'
  await db
    .prepare(`UPDATE nomi_sfide SET ${colonna} = ?, updated_at = ? WHERE id = ? AND stato = 'in_corso'`)
    .bind(JSON.stringify(risposte), new Date(adesso).toISOString(), row.id)
    .run()
}

/**
 * Stop: chi lo dice consegna il suo foglio, e da li' si smette di scrivere
 * tutti. Se l'altro l'aveva gia' detto, vale il suo, e questo foglio arriva
 * nel margine.
 */
export async function diciStop(
  db: D1Database,
  row: SfidaRow,
  lato: LatoNomi,
  risposte: RisposteNomi,
  adesso: number,
): Promise<void> {
  if (!siScrive(row, adesso)) return
  const colonna = lato === 'a' ? 'risposte_a' : 'risposte_b'
  const quando = new Date(adesso).toISOString()
  const stop = new Date(Math.min(adesso, Date.parse(row.inizio_at!) + TEMPO_NOMI_MS)).toISOString()
  await db
    .prepare(
      `UPDATE nomi_sfide
          SET ${colonna} = ?1, stop_at = COALESCE(stop_at, ?2), stop_di = COALESCE(stop_di, ?3),
              versione = versione + 1, updated_at = ?4
        WHERE id = ?5 AND stato = 'in_corso'`,
    )
    .bind(JSON.stringify(risposte), stop, lato, quando, row.id)
    .run()
}

/** Le forme riconosciute di un foglio, nell'ordine delle categorie. */
function formeDelFoglio(
  lessico: LessicoNomi,
  lettera: string,
  categorie: readonly CategoriaNomi[],
  risposte: RisposteNomi,
): (string | null)[] {
  return categorie.map((c) => {
    const testo = risposte[c]?.trim()
    return testo ? riconosci(lessico, c, lettera, testo) : null
  })
}

/**
 * Chiude la partita se lo stop o il tempo sono passati: riconosce i due fogli
 * con il lessico e conta i punti come al tavolo. Condizionata alla versione:
 * due richieste insieme non la chiudono due volte, e chi perde rilegge.
 */
export async function chiudiSeFinita(
  db: D1Database,
  row: SfidaRow,
  adesso: number,
  lessicoDi: (lettera: LetteraNomi, categorie: CategoriaNomi[]) => Promise<LessicoNomi>,
): Promise<SfidaRow> {
  if (!daChiudere(row, adesso)) return row
  const categorie = categorieDi({ categorie: row.categorie ?? '[]' })
  const lettera = row.lettera as LetteraNomi
  const lessico = await lessicoDi(lettera, categorie)
  const forme: Esito['forme'] = [
    formeDelFoglio(lessico, lettera, categorie, risposteDelLato(row, 'a')),
    formeDelFoglio(lessico, lettera, categorie, risposteDelLato(row, 'b')),
  ]
  const [puntiA, puntiB] = puntiSfida(forme)
  const totali: [number, number] = [puntiA.reduce((s, p) => s + p, 0), puntiB.reduce((s, p) => s + p, 0)]
  const vincitore: SfidaRow['vincitore'] = totali[0] > totali[1] ? 'a' : totali[0] < totali[1] ? 'b' : 'pari'
  const esito: Esito = { forme, punti: [puntiA, puntiB], totali }
  const quando = new Date(adesso).toISOString()
  const scritta = await db
    .prepare(
      `UPDATE nomi_sfide
          SET stato = 'finita', esito = ?, vincitore = ?, stop_di = COALESCE(stop_di, 'tempo'),
              versione = versione + 1, updated_at = ?, finita_at = ?
        WHERE id = ? AND stato = 'in_corso' AND versione = ?`,
    )
    .bind(JSON.stringify(esito), vincitore, quando, quando, row.id, row.versione)
    .run()
  if (scritta.meta.changes !== 1) return (await sfidaPerId(db, row.id)) ?? row
  return (await sfidaPerId(db, row.id)) ?? row
}

/** Un foglio come lo vede chi lo guarda: le risposte, e a partita finita forme e punti. */
function foglio(row: SfidaRow, lato: LatoNomi, esito: Esito | null): FoglioSfidaNomi {
  const i = lato === 'a' ? 0 : 1
  return {
    risposte: risposteDelLato(row, lato),
    forme: esito ? esito.forme[i] : null,
    punti: esito ? esito.punti[i] : null,
    totale: esito ? esito.totali[i] : null,
  }
}

/** La partita vista da uno dei due: il foglio dell'altro solo alla fine, e la lettera solo dal via. */
export async function vistaSfida(db: D1Database, row: SfidaRow, io: LatoNomi, adesso: number): Promise<VistaSfidaNomi> {
  const lui = altro(io)
  const idAvversario = io === 'a' ? (row.giocatore_b ?? row.invitato) : row.giocatore_a
  const [avversario, online, rivincita] = await Promise.all([
    idAvversario ? giocatore(db, idAvversario) : Promise.resolve(null),
    idAvversario ? eOnline(db, idAvversario, adesso) : Promise.resolve(false),
    row.stato === 'finita' ? rivincitaDi(db, row.id) : Promise.resolve(null),
  ])
  const esito = esitoDi(row)
  const inizio = row.inizio_at ? Date.parse(row.inizio_at) : null
  const cominciata = inizio !== null && adesso >= inizio
  const chiusura = chiusuraDi(row)
  const finita = row.stato === 'finita'
  const mioId = io === 'a' ? row.giocatore_a : row.giocatore_b
  const serieMie = (io === 'a' ? row.serie_a : row.serie_b) + (finita && row.vincitore === io ? 1 : 0)
  const serieSue = (io === 'a' ? row.serie_b : row.serie_a) + (finita && row.vincitore === lui ? 1 : 0)
  return {
    id: row.id,
    stato: row.stato,
    avversario,
    online,
    lettera: cominciata || finita ? row.lettera : null,
    categorie: cominciata || finita ? categorieDi({ categorie: row.categorie ?? '[]' }) : null,
    inizioTraMs: row.stato === 'in_corso' && inizio !== null && !cominciata ? inizio - adesso : null,
    restanteMs:
      row.stato === 'in_corso' && cominciata && chiusura !== null && !row.stop_at
        ? Math.max(0, chiusura - adesso)
        : null,
    tempoTotaleMs: TEMPO_NOMI_MS,
    stop:
      row.stop_at || row.stop_di
        ? {
            di: row.stop_di === io ? 'io' : row.stop_di === lui ? 'avversario' : 'tempo',
            chiudeTraMs: chiusura !== null ? Math.max(0, chiusura + MARGINE_NOMI_MS - adesso) : 0,
          }
        : null,
    mie: foglio(row, io, esito),
    sue: finita ? foglio(row, lui, esito) : null,
    scritteAvversario: Object.values(risposteDelLato(row, lui)).filter((t) => t.trim() !== '').length,
    vincitore:
      row.vincitore === null ? null : row.vincitore === 'pari' ? 'pari' : row.vincitore === io ? 'io' : 'avversario',
    serie: { mie: serieMie, sue: serieSue, partite: row.partite_serie + (finita ? 1 : 0) },
    rivincita: rivincita
      ? { id: rivincita.id, mia: rivincita.giocatore_a === mioId, stato: rivincita.stato }
      : null,
  }
}

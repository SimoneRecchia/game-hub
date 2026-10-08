/**
 * Le sfide fra amici delle libere che si giocano da soli — il sudoku, gli
 * Anagrammi, il Paroliere, la Ghigliottina e la Catena — in una tabella sola
 * (`sfide_libere`). Inviti, sala e rivincita sono quelli delle Sequenze
 * (`sequenzeSfideStore.ts`), con il gioco e le opzioni in piu'; cambia la
 * partita, che qui non sta sul server.
 *
 * Quando l'altro accetta si pescano il seme e il via fra un attimo, e da li'
 * ognuno gioca sul suo telefono la partita che il seme da' a tutti e due. Il
 * telefono dice che e' partito (`parti`), poi mentre gioca fin dove e' arrivato
 * (`avanza`), e alla fine com'e' andata (`finisci`): ognuno scrive nelle sue
 * colonne, quindi due scritture insieme non si pestano. Il seme esce solo dal
 * via.
 *
 * Una partita si gioca una volta: chi riapre la pagina dopo essere partito —
 * l'ha ricaricata, o e' andato altrove — ha finito li', con quel che aveva
 * detto. Rigiocarla dall'inizio, sapendo gia' le parole, sarebbe un aiuto. La
 * sfida si chiude quando hanno finito tutti e due, o comunque a `scade_at`, con
 * quel che ognuno ha detto: chi ha chiuso l'app non fa aspettare l'altro.
 */

import {
  PRESENZA_ONLINE_MS,
  SFIDA_SCADENZA_MS,
  SFIDE_LIBERE_CONSERVA_MS,
  SFIDE_LIBERE_LINK_MS,
  SFIDE_LIBERE_VIA_MS,
} from '../../shared/config'
import {
  MARGINE_SFIDA_LIBERA_MS,
  durataMassimaMs,
  impostazioniValide,
  vincitoreSfida,
  type AvanzamentoSfida,
  type GiocoSfidaLibera,
  type ImpostazioniSfidaLibera,
} from '../../shared/sfide-libere'
import type {
  Attivita,
  GiocatoreBreve,
  GiocatoreOnline,
  InvitoConLink,
  InvitoSfidaLibera,
  InvitoSfidaLiberaMandato,
  LatoSfidaLibera,
  SfidaLiberaBreve,
  StatoSfidaLibera,
  VistaSfidaLibera,
} from '../../shared/types'
import { eOnline, nuovoCodice } from './battagliaStore'
import { fail, newId } from './http'

export type LatoLibera = 'a' | 'b'

export interface SfidaRow {
  id: string
  gioco: GiocoSfidaLibera
  impostazioni: string
  giocatore_a: string
  giocatore_b: string | null
  invitato: string | null
  codice: string | null
  stato: StatoSfidaLibera
  seme: number | null
  inizio_at: string | null
  scade_at: string | null
  punti_a: number
  punti_b: number
  passo_a: number
  passo_b: number
  tempo_a: number
  tempo_b: number
  partito_a: string | null
  partito_b: string | null
  fine_a: string | null
  fine_b: string | null
  vincitore: LatoLibera | 'pari' | null
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

const iso = (ms: number) => new Date(ms).toISOString()

/** Chi e' in una sfida aperta: in corso, e non ancora oltre la sua chiusura. `soglia` e' il segnaposto dell'istante. */
function aperte(soglia: string): string {
  return `SELECT giocatore_a AS g FROM sfide_libere WHERE stato = 'in_corso' AND scade_at >= ${soglia}
          UNION SELECT giocatore_b FROM sfide_libere WHERE stato = 'in_corso' AND scade_at >= ${soglia}`
}

async function giocatore(db: D1Database, id: string): Promise<GiocatoreBreve> {
  const r = await db
    .prepare('SELECT id, nickname, display_name, avatar_color FROM players WHERE id = ?')
    .bind(id)
    .first<GiocatoreRow>()
  if (!r) throw new Error(`Giocatore ${id} sparito da una sfida`)
  return breve(r)
}

export function latoDi(row: SfidaRow, playerId: string): LatoLibera | null {
  if (row.giocatore_a === playerId) return 'a'
  if (row.giocatore_b !== null && row.giocatore_b === playerId) return 'b'
  return null
}

const altro = (lato: LatoLibera): LatoLibera => (lato === 'a' ? 'b' : 'a')

/** Le opzioni salvate, rilette: una riga scritta a mano o di un'altra versione torna nella misura del gioco. */
export function impostazioniDi(row: Pick<SfidaRow, 'gioco' | 'impostazioni'>): ImpostazioniSfidaLibera {
  let valore: unknown = null
  try {
    valore = JSON.parse(row.impostazioni)
  } catch {
    /* le opzioni di sempre */
  }
  return impostazioniValide(row.gioco, valore)
}

export async function sfidaPerId(db: D1Database, id: string): Promise<SfidaRow | null> {
  return db.prepare('SELECT * FROM sfide_libere WHERE id = ?').bind(id).first<SfidaRow>()
}

function scadeTra(row: SfidaRow, adesso: number): number {
  const durata = row.codice ? SFIDE_LIBERE_LINK_MS : SFIDA_SCADENZA_MS
  return Math.max(0, Date.parse(row.created_at) + durata - adesso)
}

/* ─────────────────────────────  Chi c'e'  ───────────────────────────── */

/** Chi e' online, con due cose in piu': se e' gia' in una sfida, e se ha un mio invito in attesa. */
export async function giocatoriOnline(db: D1Database, io: string, adesso: number): Promise<GiocatoreOnline[]> {
  const { results } = await db
    .prepare(
      `SELECT p.id, p.nickname, p.display_name, p.avatar_color, pr.attivita,
              p.id IN (${aperte('?4')}) AS occupato,
              EXISTS (SELECT 1 FROM sfide_libere s
                       WHERE s.giocatore_a = ?1 AND s.invitato = p.id AND s.stato = 'invito'
                         AND s.created_at >= ?3) AS invitato
         FROM presenza pr
         JOIN players p ON p.id = pr.player_id
        WHERE pr.visto_at >= ?2 AND p.id != ?1
        ORDER BY occupato, p.display_name COLLATE NOCASE`,
    )
    .bind(io, prima(adesso, PRESENZA_ONLINE_MS), prima(adesso, SFIDA_SCADENZA_MS), iso(adesso))
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
    .bind(playerId, iso(adesso))
    .first<{ si: number }>()
  return riga !== null
}

/** La sfida aperta di un giocatore, a qualunque dei giochi, se ne ha una. */
export async function sfidaAperta(db: D1Database, playerId: string, adesso: number): Promise<SfidaRow | null> {
  return db
    .prepare(
      `SELECT * FROM sfide_libere
        WHERE stato = 'in_corso' AND (giocatore_a = ?1 OR giocatore_b = ?1) AND scade_at >= ?2
        ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(playerId, iso(adesso))
    .first<SfidaRow>()
}

export async function sfidaBreve(db: D1Database, row: SfidaRow, io: LatoLibera): Promise<SfidaLiberaBreve> {
  const idAvversario = io === 'a' ? row.giocatore_b : row.giocatore_a
  return { id: row.id, gioco: row.gioco, avversario: await giocatore(db, idAvversario!) }
}

/* ─────────────────────────────  Gli inviti  ───────────────────────────── */

/**
 * Un invito nuovo, a un amico o con un link, al gioco e con le opzioni scelte.
 * Uno solo alla volta, a tutti i giochi insieme: il nuovo annulla quello che
 * aspettava ancora, e nello stesso batch se ne vanno le sfide ferme da due
 * giorni.
 */
export async function mandaInvito(
  db: D1Database,
  {
    da,
    a,
    gioco,
    impostazioni,
    rivincitaDi = null,
    serie = null,
  }: {
    da: string
    /** null per un invito con il link. */
    a: string | null
    gioco: GiocoSfidaLibera
    impostazioni: ImpostazioniSfidaLibera
    rivincitaDi?: string | null
    serie?: { a: number; b: number; partite: number } | null
  },
  adesso: number,
): Promise<SfidaRow> {
  const id = newId('slb')
  const quando = iso(adesso)
  const codice = a ? null : nuovoCodice()
  await db.batch([
    db
      .prepare(`UPDATE sfide_libere SET stato = 'annullata', updated_at = ? WHERE giocatore_a = ? AND stato = 'invito'`)
      .bind(quando, da),
    db.prepare('DELETE FROM sfide_libere WHERE updated_at < ?').bind(prima(adesso, SFIDE_LIBERE_CONSERVA_MS)),
    db
      .prepare(
        `INSERT INTO sfide_libere
           (id, gioco, impostazioni, giocatore_a, invitato, codice, stato, rivincita_di, serie_a, serie_b,
            partite_serie, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'invito', ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        gioco,
        JSON.stringify(impostazioni),
        da,
        a,
        codice,
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
export async function invitiRicevuti(db: D1Database, io: string, adesso: number): Promise<InvitoSfidaLibera[]> {
  const { results } = await db
    .prepare(
      `SELECT s.id AS invito_id, s.gioco, s.impostazioni, s.created_at, s.rivincita_di,
              p.id, p.nickname, p.display_name, p.avatar_color
         FROM sfide_libere s
         JOIN players p ON p.id = s.giocatore_a
        WHERE s.invitato = ?1 AND s.stato = 'invito' AND s.created_at >= ?2
          AND s.giocatore_a NOT IN (${aperte('?3')})
        ORDER BY s.created_at`,
    )
    .bind(io, prima(adesso, SFIDA_SCADENZA_MS), iso(adesso))
    .all<
      GiocatoreRow & {
        invito_id: string
        gioco: GiocoSfidaLibera
        impostazioni: string
        created_at: string
        rivincita_di: string | null
      }
    >()
  return results.map((r) => ({
    id: r.invito_id,
    gioco: r.gioco,
    impostazioni: impostazioniDi(r),
    da: breve(r),
    scadeTraMs: Math.max(0, Date.parse(r.created_at) + SFIDA_SCADENZA_MS - adesso),
    rivincita: r.rivincita_di !== null,
  }))
}

function statoInvito(row: SfidaRow, adesso: number): InvitoSfidaLiberaMandato['stato'] {
  if (row.stato === 'invito') return scadeTra(row, adesso) === 0 ? 'scaduto' : 'attesa'
  if (row.stato === 'rifiutata') return 'rifiutato'
  if (row.stato === 'annullata') return 'annullato'
  return 'accettato'
}

/** L'ultimo invito mandato dalla sala di un gioco, se e' recente: la sala dice com'e' andato. */
export async function ultimoInvito(
  db: D1Database,
  io: string,
  gioco: GiocoSfidaLibera,
  adesso: number,
): Promise<InvitoSfidaLiberaMandato | null> {
  const row = await db
    .prepare(
      `SELECT * FROM sfide_libere
        WHERE giocatore_a = ? AND gioco = ? AND rivincita_di IS NULL AND created_at >= ?
        ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(io, gioco, prima(adesso, SFIDE_LIBERE_LINK_MS))
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
 * solo se e' ancora un invito valido e nessuno dei due e' in un'altra sfida, e
 * nello stesso colpo si pescano il seme, il via fra un attimo e la chiusura.
 * Poi gli altri inviti dei due si annullano: due accettazioni ravvicinate non
 * aprono due partite.
 */
export async function accettaInvito(db: D1Database, row: SfidaRow, io: string, adesso: number): Promise<void> {
  if (row.giocatore_a === io) fail(409, 'INVITO_TUO', 'Questo invito l’hai mandato tu.')
  if (row.stato !== 'invito') {
    if (row.giocatore_b === io) return
    fail(409, 'INVITO_CHIUSO', 'Questo invito non è più valido.')
  }
  if (row.invitato && row.invitato !== io) fail(404, 'INVITO_NON_TROVATO', 'Questo invito non esiste.')
  if (scadeTra(row, adesso) === 0) fail(409, 'INVITO_SCADUTO', 'L’invito è scaduto.')

  // Un intero positivo a caso: il seme della partita, che nessuno dei due deve poter indovinare.
  const seme = crypto.getRandomValues(new Uint32Array(1))[0] >>> 1
  const via = adesso + SFIDE_LIBERE_VIA_MS
  const scade = via + durataMassimaMs(row.gioco, impostazioniDi(row)) + MARGINE_SFIDA_LIBERA_MS
  const quando = iso(adesso)
  const [aperta] = await db.batch([
    db
      .prepare(
        `UPDATE sfide_libere
            SET stato = 'in_corso', giocatore_b = ?1, invitato = ?1, seme = ?2, inizio_at = ?3, scade_at = ?4,
                versione = versione + 1, updated_at = ?5
          WHERE id = ?6 AND stato = 'invito' AND (invitato = ?1 OR invitato IS NULL) AND giocatore_a != ?1
            AND ?1 NOT IN (${aperte('?5')}) AND giocatore_a NOT IN (${aperte('?5')})`,
      )
      .bind(io, seme, iso(via), iso(scade), quando, row.id),
    db
      .prepare(
        `UPDATE sfide_libere SET stato = 'annullata', updated_at = ?1
          WHERE stato = 'invito' AND id != ?2
            AND (giocatore_a IN (?3, ?4) OR invitato IN (?3, ?4))
            AND EXISTS (SELECT 1 FROM sfide_libere WHERE id = ?2 AND stato = 'in_corso' AND giocatore_b = ?4)`,
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
    .prepare(`UPDATE sfide_libere SET stato = ?, updated_at = ? WHERE id = ? AND stato = 'invito'`)
    .bind(come, iso(adesso), row.id)
    .run()
}

export async function invitoConCodice(db: D1Database, codice: string): Promise<SfidaRow | null> {
  return db.prepare('SELECT * FROM sfide_libere WHERE codice = ?').bind(codice).first<SfidaRow>()
}

/** Un invito con il link, come lo vede chi lo apre: anche senza account. */
export async function invitoSfidaLiberaConLink(
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
  return { codice, da: await giocatore(db, row.giocatore_a), stato, gioco: row.gioco }
}

/* ─────────────────────────────  La rivincita  ───────────────────────────── */

/** L'ultima rivincita chiesta per una partita, se c'e'. */
export async function rivincitaDi(db: D1Database, partitaId: string): Promise<SfidaRow | null> {
  return db
    .prepare('SELECT * FROM sfide_libere WHERE rivincita_di = ? ORDER BY created_at DESC LIMIT 1')
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

const avanzamentoDi = (row: SfidaRow, lato: LatoLibera): AvanzamentoSfida =>
  lato === 'a'
    ? { punti: row.punti_a, passo: row.passo_a, tempoMs: row.tempo_a }
    : { punti: row.punti_b, passo: row.passo_b, tempoMs: row.tempo_b }
const partitoDi = (row: SfidaRow, lato: LatoLibera) => (lato === 'a' ? row.partito_a : row.partito_b)
const finitoDi = (row: SfidaRow, lato: LatoLibera) => (lato === 'a' ? row.fine_a : row.fine_b)

/** Il via e' passato: si gioca. */
export function cominciata(row: SfidaRow, adesso: number): boolean {
  return row.stato === 'in_corso' && row.inizio_at !== null && adesso >= Date.parse(row.inizio_at)
}

/** Oltre la chiusura: la sfida si chiude con quel che c'e'. */
export function scaduta(row: SfidaRow, adesso: number): boolean {
  return row.scade_at !== null && adesso > Date.parse(row.scade_at)
}

/** Chi ha vinto, se si sa gia': hanno finito tutti e due, o la sfida e' oltre la sua chiusura. */
export function vincitoreDi(row: SfidaRow, adesso: number): SfidaRow['vincitore'] {
  if (row.stato !== 'in_corso') return row.vincitore
  if (!(row.fine_a && row.fine_b) && !scaduta(row, adesso)) return null
  return vincitoreSfida(avanzamentoDi(row, 'a'), avanzamentoDi(row, 'b'))
}

/**
 * Chiude la sfida se si sa chi ha vinto. Condizionata alla versione, che ogni
 * scrittura fa salire: un avanzamento arrivato nel frattempo la fa rileggere
 * invece di chiuderla con un conto vecchio.
 */
export async function chiudiSeFinita(db: D1Database, row: SfidaRow, adesso: number): Promise<SfidaRow> {
  if (row.stato !== 'in_corso') return row
  const vincitore = vincitoreDi(row, adesso)
  if (vincitore === null) return row
  const quando = iso(adesso)
  await db
    .prepare(
      `UPDATE sfide_libere
          SET stato = 'finita', vincitore = ?1, fine_a = COALESCE(fine_a, ?2), fine_b = COALESCE(fine_b, ?2),
              versione = versione + 1, updated_at = ?2, finita_at = ?2
        WHERE id = ?3 AND stato = 'in_corso' AND versione = ?4`,
    )
    .bind(vincitore, quando, row.id, row.versione)
    .run()
  return (await sfidaPerId(db, row.id)) ?? row
}

/** Si puo' giocare: la sfida e' cominciata, non e' oltre la chiusura, e chi scrive non ha finito. */
function controllaInGioco(row: SfidaRow, lato: LatoLibera, adesso: number): void {
  if (row.stato === 'finita') fail(409, 'FINITA', 'La sfida è finita.')
  if (!cominciata(row, adesso)) fail(409, 'NON_COMINCIATA', 'La sfida non è ancora cominciata.')
  if (scaduta(row, adesso)) fail(409, 'FINITA', 'Il tempo della sfida è finito.')
  if (finitoDi(row, lato) !== null) fail(409, 'HAI_FINITO', 'Hai già finito.')
}

/**
 * Il telefono comincia a giocare. La seconda volta — la pagina si e' riaperta
 * dopo il via — la partita di chi chiede finisce li', con quel che aveva detto:
 * la risposta lo dice con `riaperta`.
 */
export async function parti(
  db: D1Database,
  row: SfidaRow,
  lato: LatoLibera,
  adesso: number,
): Promise<{ riaperta: boolean }> {
  controllaInGioco(row, lato, adesso)
  const colonna = lato
  const quando = iso(adesso)
  if (partitoDi(row, lato) !== null) {
    await db
      .prepare(
        `UPDATE sfide_libere SET fine_${colonna} = ?1, versione = versione + 1, updated_at = ?1
          WHERE id = ?2 AND stato = 'in_corso' AND fine_${colonna} IS NULL`,
      )
      .bind(quando, row.id)
      .run()
    return { riaperta: true }
  }
  await db
    .prepare(
      `UPDATE sfide_libere SET partito_${colonna} = ?1, versione = versione + 1, updated_at = ?1
        WHERE id = ?2 AND stato = 'in_corso' AND partito_${colonna} IS NULL AND fine_${colonna} IS NULL`,
    )
    .bind(quando, row.id)
    .run()
  return { riaperta: false }
}

/**
 * Fin dove e' arrivato chi scrive, e con `fine` com'e' finita la sua partita.
 * Solo nelle sue colonne, e solo se non ha gia' finito: un avanzamento in
 * ritardo non riapre una partita chiusa.
 */
export async function avanza(
  db: D1Database,
  row: SfidaRow,
  lato: LatoLibera,
  avanzamento: AvanzamentoSfida,
  fine: boolean,
  adesso: number,
): Promise<void> {
  controllaInGioco(row, lato, adesso)
  if (partitoDi(row, lato) === null) fail(409, 'NON_PARTITO', 'La partita non è cominciata su questo telefono.')
  const colonna = lato
  const quando = iso(adesso)
  await db
    .prepare(
      `UPDATE sfide_libere
          SET punti_${colonna} = ?1, passo_${colonna} = ?2, tempo_${colonna} = ?3,
              fine_${colonna} = CASE WHEN ?4 = 1 THEN ?5 ELSE NULL END,
              versione = versione + 1, updated_at = ?5
        WHERE id = ?6 AND stato = 'in_corso' AND fine_${colonna} IS NULL`,
    )
    .bind(avanzamento.punti, avanzamento.passo, avanzamento.tempoMs, fine ? 1 : 0, quando, row.id)
    .run()
}

/** La sfida vista da uno dei due: le opzioni, il seme dal via, fin dove sono arrivati, e chi ha vinto. */
export async function vistaSfida(
  db: D1Database,
  row: SfidaRow,
  io: LatoLibera,
  adesso: number,
  riaperta = false,
): Promise<VistaSfidaLibera> {
  const lui = altro(io)
  const idAvversario = io === 'a' ? (row.giocatore_b ?? row.invitato) : row.giocatore_a
  const [avversario, online, rivincita] = await Promise.all([
    idAvversario ? giocatore(db, idAvversario) : Promise.resolve(null),
    idAvversario ? eOnline(db, idAvversario, adesso) : Promise.resolve(false),
    row.stato === 'finita' ? rivincitaDi(db, row.id) : Promise.resolve(null),
  ])
  const finita = row.stato === 'finita'
  const inizio = row.inizio_at ? Date.parse(row.inizio_at) : null
  const lato = (l: LatoLibera): LatoSfidaLibera => ({
    ...avanzamentoDi(row, l),
    partito: partitoDi(row, l) !== null,
    finito: finita || finitoDi(row, l) !== null,
  })
  const mioId = io === 'a' ? row.giocatore_a : row.giocatore_b
  const serieMie = (io === 'a' ? row.serie_a : row.serie_b) + (finita && row.vincitore === io ? 1 : 0)
  const serieSue = (io === 'a' ? row.serie_b : row.serie_a) + (finita && row.vincitore === lui ? 1 : 0)
  return {
    id: row.id,
    gioco: row.gioco,
    impostazioni: impostazioniDi(row),
    stato: row.stato,
    avversario,
    online,
    inizioTraMs: row.stato === 'in_corso' && inizio !== null && adesso < inizio ? inizio - adesso : null,
    // Il seme solo dal via: prima, chi lo leggesse potrebbe prepararsi la partita.
    seme: row.seme !== null && (finita || cominciata(row, adesso)) ? row.seme : null,
    chiudeTraMs: row.stato === 'in_corso' && row.scade_at ? Math.max(0, Date.parse(row.scade_at) - adesso) : null,
    mie: lato(io),
    sue: lato(lui),
    riaperta,
    vincitore:
      row.vincitore === null ? null : row.vincitore === 'pari' ? 'pari' : row.vincitore === io ? 'io' : 'avversario',
    serie: { mie: serieMie, sue: serieSue, partite: row.partite_serie + (finita ? 1 : 0) },
    rivincita: rivincita ? { id: rivincita.id, mia: rivincita.giocatore_a === mioId, stato: rivincita.stato } : null,
  }
}

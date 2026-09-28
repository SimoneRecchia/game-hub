/**
 * Accesso ai dati di Indovina chi: gli inviti, che sono gia' la partita, e la
 * partita vista da ciascuno dei due.
 *
 * Una riga nasce invito e diventa partita quando l'altro accetta, con un
 * `UPDATE` condizionato allo stato: nello stesso momento si pescano i due
 * personaggi segreti e chi comincia. Poi le mosse — domande, risposte,
 * tentativi — si aggiungono condizionate alla versione letta, come i colpi
 * della battaglia. Le facce abbassate e i messaggi per il canale delle foto no:
 * li scrive uno solo dei due, e non devono far fallire una domanda arrivata
 * nello stesso istante.
 *
 * Il personaggio dell'altro non esce da qui finché la partita non e' finita.
 */

import {
  INDOVINA_ABBANDONATA_MS,
  INDOVINA_ATTESA_MS,
  INDOVINA_CONSERVA_MS,
  INDOVINA_LINK_MS,
  PRESENZA_ONLINE_MS,
  SFIDA_SCADENZA_MS,
} from '../../shared/config'
import {
  altroLato,
  domandaInSospeso,
  leggiAbbassate,
  type Lato,
  type Mossa,
  type Personaggi,
} from '../../shared/indovina'
import type {
  Attivita,
  GiocatoreBreve,
  GiocatoreOnline,
  InvitoConLink,
  InvitoIndovina,
  InvitoIndovinaMandato,
  PartitaIndovinaBreve,
  SegnaleIndovina,
  StatoIndovina,
  VistaIndovina,
} from '../../shared/types'
import { eOnline, nuovoCodice } from './battagliaStore'
import { fail, newId } from './http'

export interface PartitaRow {
  id: string
  giocatore_a: string
  giocatore_b: string | null
  invitato: string | null
  codice: string | null
  stato: StatoIndovina
  personaggi: string
  segreto_a: number | null
  segreto_b: number | null
  abbassate_a: string
  abbassate_b: string
  turno: Lato | null
  mosse: string
  vincitore: Lato | null
  motivo: VistaIndovina['motivo']
  segnale: string
  rivincita_di: string | null
  serie_a: number
  serie_b: number
  partite_serie: number
  versione: number
  created_at: string
  iniziata_at: string | null
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

const sogliaAbbandono = (adesso: number) => prima(adesso, INDOVINA_ABBANDONATA_MS)

/**
 * Chi e' in una partita aperta: in corso e mossa di recente. `soglia` e' il
 * segnaposto dell'istante oltre il quale una partita ferma non conta piu'.
 */
function aperte(soglia: string): string {
  return `SELECT giocatore_a AS g FROM indovina_partite WHERE stato = 'in_corso' AND updated_at >= ${soglia}
          UNION SELECT giocatore_b FROM indovina_partite WHERE stato = 'in_corso' AND updated_at >= ${soglia}`
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

export function personaggiDi(row: PartitaRow): Personaggi {
  return JSON.parse(row.personaggi) as Personaggi
}

export function mosseDi(row: PartitaRow): Mossa[] {
  return JSON.parse(row.mosse) as Mossa[]
}

export function abbassateDi(row: PartitaRow, lato: Lato): number[] {
  const quante = personaggiDi(row).voci.length
  return leggiAbbassate(JSON.parse(lato === 'a' ? row.abbassate_a : row.abbassate_b), quante) ?? []
}

function segnaleDi(row: PartitaRow): VistaIndovina['segnale'] {
  try {
    const s = JSON.parse(row.segnale) as Partial<VistaIndovina['segnale']>
    return { offerta: s.offerta ?? null, risposta: s.risposta ?? null }
  } catch {
    return { offerta: null, risposta: null }
  }
}

/** Fino a quando vale un invito: due minuti a un amico online, un'ora con il link. */
function scadenza(row: PartitaRow): number {
  return Date.parse(row.created_at) + (row.codice ? INDOVINA_LINK_MS : SFIDA_SCADENZA_MS)
}

function scadeTra(row: PartitaRow, adesso: number): number {
  return Math.max(0, scadenza(row) - adesso)
}

export async function partitaPerId(db: D1Database, id: string): Promise<PartitaRow | null> {
  return db.prepare('SELECT * FROM indovina_partite WHERE id = ?').bind(id).first<PartitaRow>()
}

/** Un numero a caso fra zero e `quanti`, dal generatore del sistema: e' il personaggio segreto. */
function aCaso(quanti: number): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] % quanti
}

/* ─────────────────────────────  Chi c'e'  ───────────────────────────── */

/** Chi e' online, con due cose in piu': se e' gia' in una partita, e se ha un mio invito in attesa. */
export async function giocatoriOnline(db: D1Database, io: string, adesso: number): Promise<GiocatoreOnline[]> {
  const { results } = await db
    .prepare(
      `SELECT p.id, p.nickname, p.display_name, p.avatar_color, pr.attivita,
              p.id IN (${aperte('?4')}) AS occupato,
              EXISTS (SELECT 1 FROM indovina_partite i
                       WHERE i.giocatore_a = ?1 AND i.invitato = p.id AND i.stato = 'invito'
                         AND i.created_at >= ?3) AS invitato
         FROM presenza pr
         JOIN players p ON p.id = pr.player_id
        WHERE pr.visto_at >= ?2 AND p.id != ?1
        ORDER BY occupato, p.display_name COLLATE NOCASE`,
    )
    .bind(io, prima(adesso, PRESENZA_ONLINE_MS), prima(adesso, SFIDA_SCADENZA_MS), sogliaAbbandono(adesso))
    .all<GiocatoreRow & { attivita: Attivita; occupato: number; invitato: number }>()
  return results.map((r) => ({ ...breve(r), attivita: r.attivita, occupato: r.occupato === 1, invitato: r.invitato === 1 }))
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
      `SELECT * FROM indovina_partite
        WHERE stato = 'in_corso' AND (giocatore_a = ?1 OR giocatore_b = ?1) AND updated_at >= ?2
        ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(playerId, sogliaAbbandono(adesso))
    .first<PartitaRow>()
}

/** Chi deve fare la prossima mossa: rispondere a una domanda, o farne una. */
export function chiDeveMuovere(row: PartitaRow): { lato: Lato; cosa: 'domanda' | 'risposta' } | null {
  if (row.stato !== 'in_corso' || !row.turno) return null
  const sospesa = domandaInSospeso(mosseDi(row))
  if (sospesa) return { lato: altroLato(sospesa.da), cosa: 'risposta' }
  return { lato: row.turno, cosa: 'domanda' }
}

export async function partitaBreve(db: D1Database, row: PartitaRow, io: Lato): Promise<PartitaIndovinaBreve> {
  const idAvversario = io === 'a' ? row.giocatore_b : row.giocatore_a
  const mossa = chiDeveMuovere(row)
  return {
    id: row.id,
    avversario: await giocatore(db, idAvversario!),
    tocca: mossa && mossa.lato === io ? mossa.cosa : null,
  }
}

/* ─────────────────────────────  Gli inviti  ───────────────────────────── */

/**
 * Un invito nuovo, a un amico o con un link. Uno solo alla volta: il nuovo
 * annulla quello che aspettava ancora, e nello stesso batch se ne vanno le
 * partite ferme da due giorni.
 */
export async function mandaInvito(
  db: D1Database,
  {
    da,
    a,
    personaggi,
    rivincitaDi = null,
    serie = null,
  }: {
    da: string
    /** null per un invito con il link. */
    a: string | null
    personaggi: Personaggi
    rivincitaDi?: string | null
    serie?: { a: number; b: number; partite: number } | null
  },
  adesso: number,
): Promise<PartitaRow> {
  const id = newId('ind')
  const quando = new Date(adesso).toISOString()
  const codice = a ? null : nuovoCodice()
  await db.batch([
    db
      .prepare(`UPDATE indovina_partite SET stato = 'annullata', updated_at = ? WHERE giocatore_a = ? AND stato = 'invito'`)
      .bind(quando, da),
    db.prepare('DELETE FROM indovina_partite WHERE updated_at < ?').bind(prima(adesso, INDOVINA_CONSERVA_MS)),
    db
      .prepare(
        `INSERT INTO indovina_partite
           (id, giocatore_a, invitato, codice, stato, personaggi, rivincita_di, serie_a, serie_b, partite_serie,
            created_at, updated_at)
         VALUES (?, ?, ?, ?, 'invito', ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        da,
        a,
        codice,
        JSON.stringify(personaggi),
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
export async function invitiRicevuti(db: D1Database, io: string, adesso: number): Promise<InvitoIndovina[]> {
  const { results } = await db
    .prepare(
      `SELECT i.id AS invito_id, i.personaggi, i.created_at, i.codice, i.rivincita_di,
              p.id, p.nickname, p.display_name, p.avatar_color
         FROM indovina_partite i
         JOIN players p ON p.id = i.giocatore_a
        WHERE i.invitato = ?1 AND i.stato = 'invito' AND i.created_at >= ?2
          AND i.giocatore_a NOT IN (${aperte('?3')})
        ORDER BY i.created_at`,
    )
    .bind(io, prima(adesso, SFIDA_SCADENZA_MS), sogliaAbbandono(adesso))
    .all<
      GiocatoreRow & {
        invito_id: string
        personaggi: string
        created_at: string
        codice: string | null
        rivincita_di: string | null
      }
    >()
  return results.map((r) => {
    const personaggi = JSON.parse(r.personaggi) as Personaggi
    return {
      id: r.invito_id,
      da: breve(r),
      set: personaggi.nome,
      quanti: personaggi.voci.length,
      scadeTraMs: Math.max(0, Date.parse(r.created_at) + SFIDA_SCADENZA_MS - adesso),
      rivincita: r.rivincita_di !== null,
    }
  })
}

function statoInvito(row: PartitaRow, adesso: number): InvitoIndovinaMandato['stato'] {
  if (row.stato === 'invito') return scadeTra(row, adesso) === 0 ? 'scaduto' : 'attesa'
  if (row.stato === 'rifiutata') return 'rifiutato'
  if (row.stato === 'annullata') return 'annullato'
  return 'accettato'
}

/** L'ultimo invito mandato dalla sala, se e' recente: la sala dice com'e' andato. */
export async function ultimoInvito(db: D1Database, io: string, adesso: number): Promise<InvitoIndovinaMandato | null> {
  const row = await db
    .prepare(
      `SELECT * FROM indovina_partite
        WHERE giocatore_a = ? AND rivincita_di IS NULL AND created_at >= ?
        ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(io, prima(adesso, INDOVINA_LINK_MS))
    .first<PartitaRow>()
  if (!row) return null
  const stato = statoInvito(row, adesso)
  // Un invito ritirato da chi l'ha mandato non ha niente da dire; uno a un amico
  // conta per qualche minuto, poi la sala torna pulita.
  if (stato === 'annullato') return null
  if (!row.codice && adesso - Date.parse(row.created_at) > SFIDA_SCADENZA_MS * 3 && stato !== 'attesa') return null
  return {
    id: row.id,
    a: row.invitato ? await giocatore(db, row.invitato) : null,
    codice: row.codice,
    stato,
    set: personaggiDi(row).nome,
    scadeTraMs: row.stato === 'invito' ? scadeTra(row, adesso) : 0,
    partitaId: stato === 'accettato' ? row.id : null,
  }
}

/**
 * Accetta un invito e apre la partita, in un batch: la riga passa in corso
 * solo se e' ancora un invito valido e nessuno dei due e' in un'altra partita,
 * e nello stesso colpo si pescano i segreti e chi comincia. Poi gli altri
 * inviti dei due si annullano: due accettazioni ravvicinate non aprono due
 * partite.
 */
export async function accettaInvito(db: D1Database, row: PartitaRow, io: string, adesso: number): Promise<void> {
  if (row.giocatore_a === io) fail(409, 'INVITO_TUO', 'Questo invito l’hai mandato tu.')
  if (row.stato !== 'invito') {
    if (row.giocatore_b === io) return
    fail(409, 'INVITO_CHIUSO', 'Questo invito non è più valido.')
  }
  if (row.invitato && row.invitato !== io) fail(404, 'INVITO_NON_TROVATO', 'Questo invito non esiste.')
  if (scadeTra(row, adesso) === 0) fail(409, 'INVITO_SCADUTO', 'L’invito è scaduto.')

  const quanti = personaggiDi(row).voci.length
  const quando = new Date(adesso).toISOString()
  const turno: Lato = aCaso(2) === 0 ? 'a' : 'b'
  const [aperta] = await db.batch([
    db
      .prepare(
        `UPDATE indovina_partite
            SET stato = 'in_corso', giocatore_b = ?1, invitato = ?1, segreto_a = ?2, segreto_b = ?3, turno = ?4,
                versione = versione + 1, iniziata_at = ?5, updated_at = ?5
          WHERE id = ?6 AND stato = 'invito' AND (invitato = ?1 OR invitato IS NULL) AND giocatore_a != ?1
            AND ?1 NOT IN (${aperte('?7')}) AND giocatore_a NOT IN (${aperte('?7')})`,
      )
      .bind(io, aCaso(quanti), aCaso(quanti), turno, quando, row.id, sogliaAbbandono(adesso)),
    db
      .prepare(
        `UPDATE indovina_partite SET stato = 'annullata', updated_at = ?1
          WHERE stato = 'invito' AND id != ?2
            AND (giocatore_a IN (?3, ?4) OR invitato IN (?3, ?4))
            AND EXISTS (SELECT 1 FROM indovina_partite WHERE id = ?2 AND stato = 'in_corso' AND giocatore_b = ?4)`,
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
    .prepare(`UPDATE indovina_partite SET stato = ?, updated_at = ? WHERE id = ? AND stato = 'invito'`)
    .bind(come, new Date(adesso).toISOString(), row.id)
    .run()
}

export async function invitoConCodice(db: D1Database, codice: string): Promise<PartitaRow | null> {
  return db.prepare('SELECT * FROM indovina_partite WHERE codice = ?').bind(codice).first<PartitaRow>()
}

/** Un invito con il link, come lo vede chi lo apre: anche senza account. */
export async function invitoIndovinaConLink(db: D1Database, codice: string, adesso: number): Promise<InvitoConLink | null> {
  const row = await invitoConCodice(db, codice)
  if (!row) return null
  const stato =
    row.stato === 'invito' ? (scadeTra(row, adesso) === 0 ? 'scaduto' : 'attesa') : row.stato === 'annullata' ? 'annullato' : 'usato'
  return { codice, da: await giocatore(db, row.giocatore_a), stato, gioco: 'indovina', set: personaggiDi(row).nome }
}

/* ─────────────────────────────  La rivincita  ───────────────────────────── */

/** L'ultima rivincita chiesta per una partita, se c'e'. */
export async function rivincitaDi(db: D1Database, partitaId: string): Promise<PartitaRow | null> {
  return db
    .prepare('SELECT * FROM indovina_partite WHERE rivincita_di = ? ORDER BY created_at DESC LIMIT 1')
    .bind(partitaId)
    .first<PartitaRow>()
}

/**
 * La serie dopo una partita, per quella che viene: le vittorie contate per
 * giocatore, perché nella rivincita chi la chiede e' 'a', anche se prima era 'b'.
 */
export function serieDopo(row: PartitaRow, nuovoA: string, nuovoB: string): { a: number; b: number; partite: number } {
  const vinte = (id: string) => {
    const lato = latoDi(row, id)
    if (!lato) return 0
    return (lato === 'a' ? row.serie_a : row.serie_b) + (row.vincitore === lato ? 1 : 0)
  }
  return { a: vinte(nuovoA), b: vinte(nuovoB), partite: row.partite_serie + 1 }
}

/* ─────────────────────────────  La partita  ───────────────────────────── */

/** Da quanto l'altro ha la mossa senza farla, e se si puo' chiudere la partita a proprio favore. */
function attesa(row: PartitaRow, io: Lato, adesso: number): { attesaMs: number; puoi: boolean } {
  const mossa = chiDeveMuovere(row)
  if (!mossa || mossa.lato === io) return { attesaMs: 0, puoi: false }
  const ultima = mosseDi(row).at(-1)?.at ?? row.iniziata_at ?? row.updated_at
  const attesaMs = Math.max(0, adesso - Date.parse(ultima))
  return { attesaMs, puoi: attesaMs >= INDOVINA_ATTESA_MS }
}

/** La partita vista da uno dei due: il suo segreto si', quello dell'altro solo alla fine. */
export async function vistaIndovina(db: D1Database, row: PartitaRow, io: Lato, adesso: number): Promise<VistaIndovina> {
  const lui = altroLato(io)
  const idAvversario = io === 'a' ? row.giocatore_b ?? row.invitato : row.giocatore_a
  const [avversario, online, rivincita] = await Promise.all([
    idAvversario ? giocatore(db, idAvversario) : Promise.resolve(null),
    idAvversario ? eOnline(db, idAvversario, adesso) : Promise.resolve(false),
    row.stato === 'finita' ? rivincitaDi(db, row.id) : Promise.resolve(null),
  ])
  const personaggi = personaggiDi(row)
  const mosse = mosseDi(row)
  const sospesa = domandaInSospeso(mosse)
  const finita = row.stato === 'finita'
  const mio = io === 'a' ? row.segreto_a : row.segreto_b
  const suo = io === 'a' ? row.segreto_b : row.segreto_a
  const { attesaMs, puoi } = attesa(row, io, adesso)
  const idMio = io === 'a' ? row.giocatore_a : row.giocatore_b

  return {
    id: row.id,
    stato: row.stato,
    io,
    avversario: avversario ? { ...avversario, online } : null,
    personaggi,
    mioSegreto: mio,
    suoSegreto: finita ? suo : null,
    abbassate: abbassateDi(row, io),
    sueInPiedi: personaggi.voci.length - abbassateDi(row, lui).length,
    tuoTurno: row.stato === 'in_corso' && row.turno === io && !sospesa,
    domanda: sospesa ? { mia: sospesa.da === io, testo: sospesa.testo } : null,
    mosse: mosse.map((m) => {
      const { da, ...resto } = m
      return { ...resto, mia: da === io } as VistaIndovina['mosse'][number]
    }),
    vincitore: row.vincitore ? (row.vincitore === io ? 'io' : 'avversario') : null,
    motivo: row.motivo,
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
    segnale: segnaleDi(row),
    attesaMs,
    puoiReclamare: puoi,
    versione: row.versione,
  }
}

export interface CambiPartita {
  stato?: StatoIndovina
  turno?: Lato | null
  mosse?: Mossa[]
  vincitore?: Lato | null
  motivo?: VistaIndovina['motivo']
}

/**
 * Scrive una mossa, condizionata alla versione letta: un doppio tocco, o due
 * schede aperte, non devono poter fare due domande nello stesso turno. Scrive
 * solo le colonne delle mosse: le facce abbassate e il canale delle foto, che
 * si scrivono a parte, non si toccano.
 */
export async function salvaMossa(db: D1Database, row: PartitaRow, cambi: CambiPartita, adesso: number): Promise<PartitaRow> {
  const quando = new Date(adesso).toISOString()
  const stato = cambi.stato ?? row.stato
  const dopo: PartitaRow = {
    ...row,
    stato,
    turno: cambi.turno !== undefined ? cambi.turno : row.turno,
    mosse: cambi.mosse ? JSON.stringify(cambi.mosse) : row.mosse,
    vincitore: cambi.vincitore !== undefined ? cambi.vincitore : row.vincitore,
    motivo: cambi.motivo !== undefined ? cambi.motivo : row.motivo,
    versione: row.versione + 1,
    updated_at: quando,
    finita_at: stato === 'finita' && row.stato !== 'finita' ? quando : row.finita_at,
  }
  const esito = await db
    .prepare(
      `UPDATE indovina_partite
          SET stato = ?, turno = ?, mosse = ?, vincitore = ?, motivo = ?, versione = ?, updated_at = ?, finita_at = ?
        WHERE id = ? AND versione = ?`,
    )
    .bind(dopo.stato, dopo.turno, dopo.mosse, dopo.vincitore, dopo.motivo, dopo.versione, quando, dopo.finita_at, row.id, row.versione)
    .run()
  if (esito.meta.changes !== 1) fail(409, 'CONFLITTO', 'La partita è cambiata: la ricarico.')
  return (await partitaPerId(db, row.id)) ?? dopo
}

/** Le facce abbassate di uno dei due: le scrive solo lui, e non passano dalla versione. */
export async function salvaAbbassate(db: D1Database, row: PartitaRow, lato: Lato, abbassate: number[], adesso: number): Promise<void> {
  await db
    .prepare(`UPDATE indovina_partite SET ${lato === 'a' ? 'abbassate_a' : 'abbassate_b'} = ?, updated_at = ? WHERE id = ?`)
    .bind(JSON.stringify(abbassate), new Date(adesso).toISOString(), row.id)
    .run()
}

/**
 * Un messaggio per il canale delle foto: l'offerta di chi le chiede, o la
 * risposta di chi le ha. Un'offerta nuova — un nuovo tentativo — cancella la
 * risposta di prima; una risposta vale solo per l'offerta a cui risponde, e se
 * nel frattempo ne e' arrivata un'altra non la sovrascrive. Senza la
 * condizione, un tentativo nuovo e la risposta al vecchio che si incrociano
 * lascerebbero in tavola la coppia sbagliata.
 */
export async function salvaSegnale(
  db: D1Database,
  row: PartitaRow,
  tipo: 'offerta' | 'risposta',
  segnale: SegnaleIndovina,
): Promise<boolean> {
  const esito =
    tipo === 'offerta'
      ? await db
          .prepare(`UPDATE indovina_partite SET segnale = json_object('offerta', json(?), 'risposta', NULL) WHERE id = ?`)
          .bind(JSON.stringify(segnale), row.id)
          .run()
      : await db
          .prepare(
            `UPDATE indovina_partite SET segnale = json_set(segnale, '$.risposta', json(?))
              WHERE id = ? AND json_extract(segnale, '$.offerta.n') = ?`,
          )
          .bind(JSON.stringify(segnale), row.id, segnale.n)
          .run()
  return esito.meta.changes === 1
}

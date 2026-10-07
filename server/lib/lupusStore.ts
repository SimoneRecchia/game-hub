/**
 * Le stanze di Lupus in fabula online: chi c'e', come si gioca, e la partita.
 *
 * La partita sta intera in `lupus_stanze.partita`, con i segreti, e avanza con
 * il motore (shared/lupus.ts) che usa anche il telefono che passa di mano: le
 * regole sono le stesse per costruzione. A ognuno esce solo la sua vista
 * (`vistaPer`). Ogni scrittura rilegge la stanza e la riscrive condizionata
 * alla `versione` letta: due voti nello stesso istante non si cancellano, il
 * secondo rilegge e riprova.
 *
 * Non c'e' un orologio sul server. La discussione e le arringhe hanno un tempo
 * (`fineFase`), e quando e' passato la prima richiesta che arriva, da chiunque,
 * manda avanti la partita come avrebbe fatto chi conduce (`scadute`).
 *
 * Chi conduce manda avanti le fasi; se non si fa vedere da un po'
 * (`LUPUS_CONDUTTORE_ASSENTE_MS`) lo puo' fare chiunque sia dentro, e se esce
 * dalla stanza conduce il primo entrato dopo di lui.
 */

import { PRESENZA_ONLINE_MS } from '../../shared/config'
import { applica, ErroreLupus, nuovaPartita, type PartitaLupus } from '../../shared/lupus'
import { semeACaso } from '../../shared/lupus-caso'
import {
  composizioneAutomatica,
  controllaComposizione,
  GIOCATORI_MASSIMI,
  GIOCATORI_MINIMI,
} from '../../shared/lupus-composizione'
import {
  ALFABETO_CODICE_LUPUS,
  AzioneNonValida,
  IMPOSTAZIONI_STANZA_LUPUS,
  LUNGHEZZA_CODICE_LUPUS,
  LUPUS_CONDUTTORE_ASSENTE_MS,
  LUPUS_INVITO_MS,
  LUPUS_STANZA_FERMA_MS,
  azioneDelGiocatore,
  impostazioniStanzaValide,
  type ImpostazioniStanzaLupus,
  type InvitoLupus,
  type IscrittoStanzaLupus,
  type StanzaLupusBreve,
  type StatoStanzaLupus,
  type VistaStanzaLupus,
} from '../../shared/lupus-stanza'
import { vistaPer } from '../../shared/lupus-vista'
import type { GiocatoreBreve } from '../../shared/types'
import { fail, newId } from './http'

interface StanzaRow {
  id: string
  codice: string
  conduttore: string
  stato: StatoStanzaLupus
  impostazioni: string
  partita: string | null
  versione: number
  created_at: string
  updated_at: string
}

interface IscrittoRow {
  player_id: string
  entrato_at: string
  nickname: string
  display_name: string
  avatar_color: string
  visto_at: string | null
}

/** Una stanza letta: la riga, e quel che c'e' dentro gia' aperto. */
interface Letta {
  row: StanzaRow
  impostazioni: ImpostazioniStanzaLupus
  partita: PartitaLupus | null
  iscritti: IscrittoRow[]
}

const iso = (ms: number) => new Date(ms).toISOString()

function breve(r: Pick<IscrittoRow, 'player_id' | 'nickname' | 'display_name' | 'avatar_color'>): GiocatoreBreve {
  return {
    playerId: r.player_id,
    nickname: r.nickname,
    displayName: r.display_name || r.nickname,
    avatarColor: r.avatar_color,
  }
}

function impostazioniDi(testo: string): ImpostazioniStanzaLupus {
  try {
    return impostazioniStanzaValide(JSON.parse(testo), IMPOSTAZIONI_STANZA_LUPUS)
  } catch {
    return IMPOSTAZIONI_STANZA_LUPUS
  }
}

async function iscrittiDi(db: D1Database, stanzaId: string): Promise<IscrittoRow[]> {
  const { results } = await db
    .prepare(
      `SELECT i.player_id, i.entrato_at, p.nickname, p.display_name, p.avatar_color, pr.visto_at
         FROM lupus_iscritti i
         JOIN players p ON p.id = i.player_id
         LEFT JOIN presenza pr ON pr.player_id = i.player_id
        WHERE i.stanza_id = ?
        ORDER BY i.entrato_at, i.player_id`,
    )
    .bind(stanzaId)
    .all<IscrittoRow>()
  return results
}

async function leggi(db: D1Database, codice: string): Promise<Letta | null> {
  const row = await db.prepare('SELECT * FROM lupus_stanze WHERE codice = ?').bind(codice).first<StanzaRow>()
  if (!row) return null
  return {
    row,
    impostazioni: impostazioniDi(row.impostazioni),
    partita: row.partita ? (JSON.parse(row.partita) as PartitaLupus) : null,
    iscritti: await iscrittiDi(db, row.id),
  }
}

async function leggiOFallisci(db: D1Database, codice: string): Promise<Letta> {
  const l = await leggi(db, codice)
  if (!l) fail(404, 'STANZA_ASSENTE', 'Questa stanza non c’è più.')
  return l
}

const dentro = (l: Letta, io: string) => l.iscritti.some((i) => i.player_id === io)

function visto(i: IscrittoRow | undefined): number {
  return i?.visto_at ? Date.parse(i.visto_at) : 0
}

/** Chi conduce non si fa vedere da un po': la partita la puo' mandare avanti chiunque. */
function conduttoreAssente(l: Letta, adesso: number): boolean {
  const c = l.iscritti.find((i) => i.player_id === l.row.conduttore)
  return !c || adesso - visto(c) > LUPUS_CONDUTTORE_ASSENTE_MS
}

function vista(l: Letta, io: string, adesso: number): VistaStanzaLupus {
  const iscritti: IscrittoStanzaLupus[] = l.iscritti.map((i) => ({
    ...breve(i),
    conduce: i.player_id === l.row.conduttore,
    online: adesso - visto(i) <= PRESENZA_ONLINE_MS,
  }))
  const gioca = l.partita?.giocatori.some((g) => g.id === io) ?? false
  return {
    codice: l.row.codice,
    stato: l.row.stato,
    io,
    conduco: l.row.conduttore === io,
    conduttoreAssente: l.row.stato === 'partita' && conduttoreAssente(l, adesso),
    iscritti,
    impostazioni: l.impostazioni,
    partita: l.partita && gioca ? vistaPer(l.partita, io) : null,
    versione: l.row.versione,
    adesso,
  }
}

/** La discussione e le arringhe finite da sole: si va avanti come se l'avesse detto chi conduce. */
function scadute(partita: PartitaLupus, adesso: number): PartitaLupus {
  let p = partita
  for (let i = 0; i < 4; i += 1) {
    const aTempo = p.fase === 'discussione' || p.fase === 'arringhe'
    if (!aTempo || p.fineFase === null || adesso < p.fineFase) break
    p = applica(p, { tipo: 'avanti' }, p.fineFase)
  }
  return p
}

interface Cambio {
  stato?: StatoStanzaLupus
  partita?: PartitaLupus | null
  impostazioni?: ImpostazioniStanzaLupus
}

/** Riscrive la stanza se nessuno l'ha cambiata da quando la si e' letta. */
async function scrivi(db: D1Database, l: Letta, c: Cambio, adesso: number): Promise<boolean> {
  const partita = 'partita' in c ? (c.partita ? JSON.stringify(c.partita) : null) : l.row.partita
  const r = await db
    .prepare(
      `UPDATE lupus_stanze SET stato = ?, partita = ?, impostazioni = ?, versione = versione + 1, updated_at = ?
        WHERE id = ? AND versione = ?`,
    )
    .bind(
      c.stato ?? l.row.stato,
      partita,
      c.impostazioni ? JSON.stringify(c.impostazioni) : l.row.impostazioni,
      iso(adesso),
      l.row.id,
      l.row.versione,
    )
    .run()
  return r.meta.changes === 1
}

/**
 * Leggi, cambia e riscrivi, finché la scrittura non passa: `cambia` riceve la
 * stanza appena letta e dice che cosa scrivere, o null se non c'e' niente da
 * scrivere. Un errore delle regole diventa un 409 con il suo messaggio.
 */
async function suStanza(
  db: D1Database,
  codice: string,
  io: string,
  adesso: number,
  cambia: (l: Letta) => Cambio | null,
): Promise<VistaStanzaLupus> {
  for (let tentativo = 0; tentativo < 4; tentativo += 1) {
    const l = await leggiOFallisci(db, codice)
    if (!dentro(l, io)) fail(403, 'NON_ISCRITTO', 'Non sei in questa stanza.')
    let c: Cambio | null
    try {
      c = cambia(l)
    } catch (e) {
      if (e instanceof ErroreLupus) fail(409, 'REGOLA', e.message)
      if (e instanceof AzioneNonValida) fail(400, 'AZIONE', e.message)
      throw e
    }
    if (!c) return vista(l, io, adesso)
    if (await scrivi(db, l, c, adesso)) {
      return vista(
        {
          ...l,
          row: {
            ...l.row,
            stato: c.stato ?? l.row.stato,
            versione: l.row.versione + 1,
            updated_at: iso(adesso),
          },
          partita: 'partita' in c ? (c.partita ?? null) : l.partita,
          impostazioni: c.impostazioni ?? l.impostazioni,
        },
        io,
        adesso,
      )
    }
  }
  fail(409, 'CONFLITTO', 'La stanza è cambiata mentre scrivevi: riprova.')
}

/* ───────────────────────────  La stanza  ─────────────────────────── */

function nuovoCodice(): string {
  const casuali = crypto.getRandomValues(new Uint8Array(LUNGHEZZA_CODICE_LUPUS))
  return [...casuali].map((b) => ALFABETO_CODICE_LUPUS[b % ALFABETO_CODICE_LUPUS.length]).join('')
}

/** La stanza in cui sono, se ci sono. */
async function miaStanza(db: D1Database, io: string): Promise<StanzaRow | null> {
  return db
    .prepare(
      `SELECT s.* FROM lupus_iscritti i JOIN lupus_stanze s ON s.id = i.stanza_id WHERE i.player_id = ?`,
    )
    .bind(io)
    .first<StanzaRow>()
}

/**
 * Esce dalla stanza in cui si e', se ci si puo': da una partita in corso no,
 * a meno che sia ferma da tanto, perché lascerebbe il suo posto vuoto.
 */
async function lasciaLaStanzaDiPrima(db: D1Database, io: string, tranne: string | null, adesso: number) {
  const prima = await miaStanza(db, io)
  if (!prima || prima.id === tranne) return
  const ferma = adesso - Date.parse(prima.updated_at) > LUPUS_STANZA_FERMA_MS
  if (prima.stato === 'partita' && !ferma) {
    fail(409, 'IN_PARTITA', `Sei in una partita in corso, nella stanza ${prima.codice}.`)
  }
  await esci(db, io, prima, adesso)
}

/** Esce: chi conduceva lascia il posto al primo entrato dopo di lui, e l'ultimo che esce chiude la stanza. */
async function esci(db: D1Database, io: string, stanza: StanzaRow, adesso: number): Promise<void> {
  const quando = iso(adesso)
  await db.batch([
    db.prepare('DELETE FROM lupus_iscritti WHERE player_id = ? AND stanza_id = ?').bind(io, stanza.id),
    db
      .prepare(
        `UPDATE lupus_stanze
            SET conduttore = COALESCE(
                  (SELECT player_id FROM lupus_iscritti WHERE stanza_id = lupus_stanze.id
                    ORDER BY entrato_at, player_id LIMIT 1),
                  conduttore),
                versione = versione + 1, updated_at = ?
          WHERE id = ? AND conduttore = ?`,
      )
      .bind(quando, stanza.id, io),
    db
      .prepare(
        `UPDATE lupus_stanze SET versione = versione + 1, updated_at = ? WHERE id = ? AND conduttore != ?`,
      )
      .bind(quando, stanza.id, io),
    db
      .prepare(
        `DELETE FROM lupus_inviti
          WHERE stanza_id = ? AND NOT EXISTS (SELECT 1 FROM lupus_iscritti WHERE stanza_id = ?)`,
      )
      .bind(stanza.id, stanza.id),
    db
      .prepare(
        `DELETE FROM lupus_stanze WHERE id = ? AND NOT EXISTS (SELECT 1 FROM lupus_iscritti WHERE stanza_id = ?)`,
      )
      .bind(stanza.id, stanza.id),
  ])
}

/** Una stanza nuova, con chi la apre dentro e a condurre. Le stanze ferme da tanto se ne vanno. */
export async function creaStanza(db: D1Database, io: string, adesso: number): Promise<VistaStanzaLupus> {
  await lasciaLaStanzaDiPrima(db, io, null, adesso)
  const vecchie = iso(adesso - LUPUS_STANZA_FERMA_MS)
  const quando = iso(adesso)
  await db.batch([
    db
      .prepare('DELETE FROM lupus_inviti WHERE stanza_id IN (SELECT id FROM lupus_stanze WHERE updated_at < ?)')
      .bind(vecchie),
    db
      .prepare('DELETE FROM lupus_iscritti WHERE stanza_id IN (SELECT id FROM lupus_stanze WHERE updated_at < ?)')
      .bind(vecchie),
    db.prepare('DELETE FROM lupus_stanze WHERE updated_at < ?').bind(vecchie),
  ])
  for (let tentativo = 0; tentativo < 6; tentativo += 1) {
    const id = newId('lp')
    const codice = nuovoCodice()
    try {
      await db.batch([
        db
          .prepare(
            `INSERT INTO lupus_stanze
               (id, codice, conduttore, stato, impostazioni, partita, versione, created_at, updated_at)
             VALUES (?, ?, ?, 'attesa', ?, NULL, 1, ?, ?)`,
          )
          .bind(id, codice, io, JSON.stringify(IMPOSTAZIONI_STANZA_LUPUS), quando, quando),
        db
          .prepare('INSERT INTO lupus_iscritti (player_id, stanza_id, entrato_at) VALUES (?, ?, ?)')
          .bind(io, id, quando),
      ])
    } catch (e) {
      // Un codice gia' preso: se ne pesca un altro.
      if (/UNIQUE/i.test(String(e)) && tentativo < 5) continue
      throw e
    }
    return vistaStanza(db, io, codice, adesso)
  }
  fail(503, 'CODICI_FINITI', 'Non trovo un codice libero: riprova.')
}

/** La stanza come la vedo io. Se una discussione o le arringhe sono finite, la partita va avanti adesso. */
export async function vistaStanza(db: D1Database, io: string, codice: string, adesso: number) {
  return suStanza(db, codice, io, adesso, (l) => {
    if (l.row.stato !== 'partita' || !l.partita) return null
    const dopo = scadute(l.partita, adesso)
    if (dopo === l.partita) return null
    return { partita: dopo, ...(dopo.fase === 'finita' ? { stato: 'finita' as const } : {}) }
  })
}

/** Quel che si sa di una stanza prima di entrarci: chi la conduce e quanti sono. */
export async function infoStanza(
  db: D1Database,
  codice: string,
): Promise<{ codice: string; stato: StatoStanzaLupus; iscritti: number; conduttore: GiocatoreBreve }> {
  const l = await leggiOFallisci(db, codice)
  const c = l.iscritti.find((i) => i.player_id === l.row.conduttore) ?? l.iscritti[0]
  return { codice: l.row.codice, stato: l.row.stato, iscritti: l.iscritti.length, conduttore: breve(c) }
}

/** Entrare: solo prima della partita, e finché c'e' posto. Chi c'e' gia' rientra e basta. */
export async function entraNellaStanza(db: D1Database, io: string, codice: string, adesso: number) {
  const l = await leggiOFallisci(db, codice)
  if (dentro(l, io)) return vistaStanza(db, io, codice, adesso)
  if (l.row.stato !== 'attesa') fail(409, 'PARTITA_INIZIATA', 'La partita in questa stanza è già cominciata.')
  await lasciaLaStanzaDiPrima(db, io, l.row.id, adesso)
  const quando = iso(adesso)
  const [entrato] = await db.batch([
    db
      .prepare(
        `INSERT INTO lupus_iscritti (player_id, stanza_id, entrato_at)
         SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM lupus_stanze WHERE id = ? AND stato = 'attesa')
            AND (SELECT COUNT(*) FROM lupus_iscritti WHERE stanza_id = ?) < ?`,
      )
      .bind(io, l.row.id, quando, l.row.id, l.row.id, GIOCATORI_MASSIMI),
    db.prepare('UPDATE lupus_stanze SET versione = versione + 1, updated_at = ? WHERE id = ?').bind(quando, l.row.id),
    db
      .prepare(`UPDATE lupus_inviti SET stato = 'accettato' WHERE stanza_id = ? AND a_id = ?`)
      .bind(l.row.id, io),
  ])
  if (entrato.meta.changes !== 1) {
    const ora = await leggiOFallisci(db, codice)
    if (ora.row.stato !== 'attesa') fail(409, 'PARTITA_INIZIATA', 'La partita in questa stanza è già cominciata.')
    fail(409, 'PIENA', 'La stanza è piena.')
  }
  return vistaStanza(db, io, codice, adesso)
}

/** Uscire dalla stanza. Da una partita in corso si puo': il posto resta vuoto, e la partita va avanti. */
export async function esciDallaStanza(db: D1Database, io: string, codice: string, adesso: number): Promise<void> {
  const l = await leggi(db, codice)
  if (!l || !dentro(l, io)) return
  await esci(db, io, l.row, adesso)
}

function soloChiConduce(l: Letta, io: string) {
  if (l.row.conduttore !== io) fail(403, 'NON_CONDUCI', 'Lo può fare solo chi conduce la stanza.')
}

function soloPrima(l: Letta) {
  if (l.row.stato !== 'attesa') fail(409, 'PARTITA_INIZIATA', 'La partita è già cominciata.')
}

/** Come si gioca: il mazzo e le regole. Solo chi conduce, e solo prima della partita. */
export async function cambiaImpostazioni(db: D1Database, io: string, codice: string, corpo: unknown, adesso: number) {
  return suStanza(db, codice, io, adesso, (l) => {
    soloChiConduce(l, io)
    soloPrima(l)
    return { impostazioni: impostazioniStanzaValide(corpo, l.impostazioni) }
  })
}

/** Mandare via qualcuno, prima della partita. */
export async function espelli(db: D1Database, io: string, codice: string, chi: unknown, adesso: number) {
  const l = await leggiOFallisci(db, codice)
  if (!dentro(l, io)) fail(403, 'NON_ISCRITTO', 'Non sei in questa stanza.')
  soloChiConduce(l, io)
  soloPrima(l)
  if (typeof chi !== 'string' || chi === io) fail(400, 'CHI', 'Scegli chi mandare via.')
  const quando = iso(adesso)
  await db.batch([
    db
      .prepare(
        `DELETE FROM lupus_iscritti WHERE player_id = ? AND stanza_id = ?
            AND EXISTS (SELECT 1 FROM lupus_stanze WHERE id = ? AND stato = 'attesa')`,
      )
      .bind(chi, l.row.id, l.row.id),
    db.prepare(`UPDATE lupus_inviti SET stato = 'rifiutato' WHERE stanza_id = ? AND a_id = ?`).bind(l.row.id, chi),
    db.prepare('UPDATE lupus_stanze SET versione = versione + 1, updated_at = ? WHERE id = ?').bind(quando, l.row.id),
  ])
  return vistaStanza(db, io, codice, adesso)
}

/** Il via: i ruoli si mescolano, i posti sono l'ordine in cui si e' entrati. */
export async function iniziaPartita(db: D1Database, io: string, codice: string, adesso: number) {
  return suStanza(db, codice, io, adesso, (l) => {
    soloChiConduce(l, io)
    soloPrima(l)
    const n = l.iscritti.length
    if (n < GIOCATORI_MINIMI) fail(409, 'POCHI', `Servono almeno ${GIOCATORI_MINIMI} giocatori.`)
    const composizione = l.impostazioni.composizione ?? composizioneAutomatica(n)
    const errore = controllaComposizione(composizione, n).find((p) => p.livello === 'errore')
    if (errore) fail(409, 'MAZZO', errore.messaggio)
    const iscritti = l.iscritti.map((i) => ({ id: i.player_id, nome: i.display_name || i.nickname }))
    const partita = nuovaPartita(iscritti, composizione, l.impostazioni.regole, semeACaso(), adesso)
    return { stato: 'partita', partita }
  })
}

/**
 * Un'azione della partita: il giocatore e' sempre chi la manda. "Avanti" lo
 * dice chi conduce, o chiunque se chi conduce non si fa vedere.
 */
export async function azioneLupus(db: D1Database, io: string, codice: string, corpo: unknown, adesso: number) {
  return suStanza(db, codice, io, adesso, (l) => {
    if (l.row.stato !== 'partita' || !l.partita) fail(409, 'NESSUNA_PARTITA', 'Non c’è una partita in corso.')
    if (!l.partita.giocatori.some((g) => g.id === io)) fail(403, 'NON_GIOCHI', 'Non giochi questa partita.')
    const puo = l.row.conduttore === io || conduttoreAssente(l, adesso)
    const azione = azioneDelGiocatore((corpo as { azione?: unknown } | null)?.azione, io, puo)
    const dopo = applica(scadute(l.partita, adesso), azione, adesso)
    return { partita: dopo, ...(dopo.fase === 'finita' ? { stato: 'finita' as const } : {}) }
  })
}

/** Un'altra partita, con chi c'e': si torna alla stanza, con le stesse impostazioni. */
export async function unAltraPartita(db: D1Database, io: string, codice: string, adesso: number) {
  return suStanza(db, codice, io, adesso, (l) => {
    soloChiConduce(l, io)
    if (l.row.stato === 'partita') fail(409, 'IN_CORSO', 'La partita è ancora in corso.')
    if (l.row.stato === 'attesa') return null
    return { stato: 'attesa', partita: null }
  })
}

/* ───────────────────────────  Gli inviti  ─────────────────────────── */

/** Invitare un amico nella stanza: chiunque sia dentro, prima della partita. */
export async function invitaNellaStanza(db: D1Database, io: string, codice: string, chi: unknown, adesso: number) {
  const l = await leggiOFallisci(db, codice)
  if (!dentro(l, io)) fail(403, 'NON_ISCRITTO', 'Non sei in questa stanza.')
  soloPrima(l)
  if (typeof chi !== 'string' || chi === io) fail(400, 'CHI', 'Scegli chi invitare.')
  if (dentro(l, chi)) return
  const esiste = await db.prepare('SELECT 1 AS si FROM players WHERE id = ?').bind(chi).first<{ si: number }>()
  if (!esiste) fail(404, 'GIOCATORE', 'Questo giocatore non c’è.')
  await db
    .prepare(
      `INSERT INTO lupus_inviti (id, stanza_id, da_id, a_id, stato, created_at) VALUES (?, ?, ?, ?, 'attesa', ?)
       ON CONFLICT (stanza_id, a_id) DO UPDATE
          SET stato = 'attesa', da_id = excluded.da_id, created_at = excluded.created_at`,
    )
    .bind(newId('li'), l.row.id, io, chi, iso(adesso))
    .run()
}

export async function rifiutaInvito(db: D1Database, io: string, id: string): Promise<void> {
  await db.prepare(`UPDATE lupus_inviti SET stato = 'rifiutato' WHERE id = ? AND a_id = ?`).bind(id, io).run()
}

interface InvitoRow {
  id: string
  codice: string
  created_at: string
  da_id: string
  nickname: string
  display_name: string
  avatar_color: string
  iscritti: number
}

/**
 * Gli inviti arrivati e ancora buoni: recenti, a una stanza che aspetta, in cui
 * non sono gia'. Chi e' in una partita in corso non ne riceve: li vedrebbe e
 * non potrebbe entrare.
 */
export async function invitiRicevuti(db: D1Database, io: string, adesso: number): Promise<InvitoLupus[]> {
  const { results } = await db
    .prepare(
      `SELECT v.id, s.codice, v.created_at, v.da_id, p.nickname, p.display_name, p.avatar_color,
              (SELECT COUNT(*) FROM lupus_iscritti WHERE stanza_id = s.id) AS iscritti
         FROM lupus_inviti v
         JOIN lupus_stanze s ON s.id = v.stanza_id
         JOIN players p ON p.id = v.da_id
        WHERE v.a_id = ? AND v.stato = 'attesa' AND v.created_at >= ? AND s.stato = 'attesa'
          AND NOT EXISTS (SELECT 1 FROM lupus_iscritti WHERE player_id = ? AND stanza_id = s.id)
          AND NOT EXISTS (
            SELECT 1 FROM lupus_iscritti i JOIN lupus_stanze m ON m.id = i.stanza_id
             WHERE i.player_id = ? AND m.stato = 'partita' AND m.updated_at >= ?)
        ORDER BY v.created_at DESC
        LIMIT 5`,
    )
    .bind(io, iso(adesso - LUPUS_INVITO_MS), io, io, iso(adesso - LUPUS_STANZA_FERMA_MS))
    .all<InvitoRow>()
  return results.map((r) => ({
    id: r.id,
    codice: r.codice,
    da: breve({ player_id: r.da_id, nickname: r.nickname, display_name: r.display_name, avatar_color: r.avatar_color }),
    iscritti: r.iscritti,
    createdAt: r.created_at,
  }))
}

/** La stanza in cui sono, in breve: per tornarci dalle Libere. Una stanza ferma da tanto non conta. */
export async function stanzaBreve(db: D1Database, io: string, adesso: number): Promise<StanzaLupusBreve | null> {
  const s = await miaStanza(db, io)
  if (!s || adesso - Date.parse(s.updated_at) > LUPUS_STANZA_FERMA_MS) return null
  const n = await db
    .prepare('SELECT COUNT(*) AS n FROM lupus_iscritti WHERE stanza_id = ?')
    .bind(s.id)
    .first<{ n: number }>()
  return { codice: s.codice, stato: s.stato, iscritti: n?.n ?? 0 }
}

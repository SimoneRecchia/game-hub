/**
 * Il blackjack sul server: i tavoli, chi ci siede, le puntate e le mosse.
 *
 * Le regole stanno in shared/blackjack-tavolo.ts e lavorano su una copia dello
 * stato (`BozzaBJ`); qui si legge il tavolo, si applica quel che chiede chi
 * gioca — dopo le scadenze passate, che applica la prima richiesta che arriva —
 * e si scrive tutto in un batch: il tavolo, condizionato alla versione letta, e
 * le righe che il cambio chiede. Le mani (`bj_mani`) e i posti (`bj_seduti`) si
 * scrivono solo se il tavolo ha preso la scrittura: lo dice `scrittura`, che
 * l'`UPDATE` del tavolo cambia in un'impronta nuova. Un conflitto — due
 * giocatori che scrivono insieme — rilegge e riprova.
 *
 * Il saldo si controlla due volte: prima, con quel che si e' letto, per dire
 * di no con il motivo giusto; e nell'`UPDATE` del tavolo, sui conti gia'
 * scritti di tutti i giochi della Fortuna, perché una puntata partita nello
 * stesso istante, anche alla slot, non lo ha visto.
 *
 * Le carte le pesca il server con `crypto.getRandomValues`, una alla volta
 * fra le cinquantadue: il sabot si rimescola a ogni carta.
 */

import { cartaACaso } from '../../shared/blackjack'
import {
  BozzaBJ,
  POSTI_BJ,
  RegolaBJ,
  postoDi,
  seduti,
  tavoloNuovo,
  type ContestoBJ,
  type MovimentoBJ,
  type TavoloBJ,
} from '../../shared/blackjack-tavolo'
import { PRESENZA_ONLINE_MS } from '../../shared/config'
import { msToNextPuzzle } from '../../shared/daily'
import type { GiocatoreBreve, SalaBlackjack, TavoloInSala, VistaTavoloBJ } from '../../shared/types'
import { nettoFortunaSql, saldoDi, type SaldoFortuna } from './fortuna'
import { fail, newId, nowIso } from './http'
import { aCaso } from './ruotaStore'
import { today } from './wordleStore'

/** Un tavolo fermo da un giorno si cancella, quando se ne apre uno nuovo. */
const TAVOLO_ABBANDONATO_MS = 24 * 60 * 60_000

interface TavoloRow {
  id: string
  stato: string
  versione: number
  scrittura: string
  created_by: string
  created_at: string
  updated_at: string
}

interface GiocatoreRow {
  id: string
  nickname: string
  display_name: string
  avatar_color: string
}

const breve = (r: GiocatoreRow): GiocatoreBreve => ({
  playerId: r.id,
  nickname: r.nickname,
  displayName: r.display_name || r.nickname,
  avatarColor: r.avatar_color,
})

async function tavoloRow(db: D1Database, id: string): Promise<TavoloRow | null> {
  return db.prepare('SELECT * FROM bj_tavoli WHERE id = ?').bind(id).first<TavoloRow>()
}

/** Il tavolo a cui e' seduto un giocatore, se c'e' ancora. */
export async function mioTavolo(db: D1Database, playerId: string): Promise<string | null> {
  const riga = await db
    .prepare(
      `SELECT s.tavolo, t.id AS esiste FROM bj_seduti s LEFT JOIN bj_tavoli t ON t.id = s.tavolo
        WHERE s.player_id = ?`,
    )
    .bind(playerId)
    .first<{ tavolo: string; esiste: string | null }>()
  if (!riga) return null
  if (riga.esiste) return riga.tavolo
  // Il tavolo non c'e' piu': il posto non tiene piu' nessuno.
  await db.prepare('DELETE FROM bj_seduti WHERE player_id = ? AND tavolo = ?').bind(playerId, riga.tavolo).run()
  return null
}

/** Dove sono, fra questi, quelli online: lo dice la presenza, che il telefono scrive da solo. */
interface Presenze {
  /** Hanno la pagina del blackjack aperta. */
  qui: Set<string>
  /** Sono online in un'altra schermata, da quando: chi e' andato altrove dopo l'ultima mossa non si aspetta. */
  altrove: Map<string, number>
}

async function presentiFra(db: D1Database, ids: readonly string[], adesso: number): Promise<Presenze> {
  const presenze: Presenze = { qui: new Set(), altrove: new Map() }
  if (ids.length === 0) return presenze
  const { results } = await db
    .prepare(
      `SELECT player_id, visto_at, attivita FROM presenza
        WHERE player_id IN (SELECT value FROM json_each(?1)) AND visto_at >= ?2`,
    )
    .bind(JSON.stringify(ids), new Date(adesso - PRESENZA_ONLINE_MS).toISOString())
    .all<{ player_id: string; visto_at: string; attivita: string }>()
  for (const r of results) {
    if (r.attivita === 'blackjack') presenze.qui.add(r.player_id)
    else presenze.altrove.set(r.player_id, Date.parse(r.visto_at))
  }
  return presenze
}

/** Il contesto delle regole per chi scrive: lui c'e' di sicuro, gli altri come dice la presenza. */
function contestoPer(io: string, presenze: Presenze, adesso: number, pesca: () => string): ContestoBJ {
  return {
    adesso,
    pesca,
    presente: (x) => x === io || presenze.qui.has(x),
    altrove: (x, visto) => x !== io && (presenze.altrove.get(x) ?? 0) > visto,
  }
}

async function giocatoriDi(db: D1Database, ids: readonly string[]): Promise<Map<string, GiocatoreBreve>> {
  if (ids.length === 0) return new Map()
  const { results } = await db
    .prepare(
      `SELECT id, nickname, display_name, avatar_color FROM players
        WHERE id IN (SELECT value FROM json_each(?))`,
    )
    .bind(JSON.stringify(ids))
    .all<GiocatoreRow>()
  return new Map(results.map((r) => [r.id, breve(r)]))
}

/** Il conto del blackjack di un giorno, rifatto dalle mani: va nello stesso batch di ogni scrittura delle mani. */
function ricontaBlackjack(db: D1Database, playerId: string, numero: number): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO fortuna_giornate (player_id, puzzle_number, gioco, netto, giocate)
       SELECT ?1, ?2, 'blackjack', COALESCE(SUM(delta), 0), COUNT(*)
         FROM bj_mani WHERE player_id = ?1 AND puzzle_number = ?2
       ON CONFLICT (player_id, puzzle_number, gioco) DO UPDATE SET netto = excluded.netto, giocate = excluded.giocate`,
    )
    .bind(playerId, numero)
}

/**
 * Le righe che un movimento chiede, scritte solo se il tavolo ha preso la
 * scrittura `impronta`. `?1` e `?2` sono il tavolo e l'impronta.
 */
function righeDel(db: D1Database, tavolo: string, impronta: string, m: MovimentoBJ, adesso: string) {
  const preso = 'EXISTS (SELECT 1 FROM bj_tavoli WHERE id = ?1 AND scrittura = ?2)'
  switch (m.tipo) {
    case 'siede':
      // Un tavolo alla volta: se il giocatore e' gia' seduto altrove la chiave lo rifiuta, e il batch con lei.
      return db
        .prepare(`INSERT INTO bj_seduti (player_id, tavolo, created_at) SELECT ?3, ?1, ?4 WHERE ${preso}`)
        .bind(tavolo, impronta, m.id, adesso)
    case 'alza':
      return db
        .prepare(`DELETE FROM bj_seduti WHERE player_id = ?3 AND tavolo = ?1 AND ${preso}`)
        .bind(tavolo, impronta, m.id)
    case 'punta':
      return db
        .prepare(
          `INSERT INTO bj_mani (tavolo, giro, player_id, puzzle_number, puntata, delta, stato, created_at, updated_at)
           SELECT ?1, ?3, ?4, ?5, ?6, -?6, 'gioco', ?7, ?7 WHERE ${preso}`,
        )
        .bind(tavolo, impronta, m.giro, m.id, m.giorno, m.puntata, adesso)
    case 'aggiunge':
      return db
        .prepare(
          `UPDATE bj_mani SET puntata = puntata + ?5, delta = delta - ?5, updated_at = ?6
            WHERE tavolo = ?1 AND giro = ?3 AND player_id = ?4 AND stato = 'gioco' AND ${preso}`,
        )
        .bind(tavolo, impronta, m.giro, m.id, m.quanto, adesso)
    case 'chiude': {
      // L'esito tiene le mani, le carte del banco e l'assicurazione: il delta e' la loro somma.
      const esito = JSON.stringify({ mani: m.mani, banco: m.banco, assicurazione: m.assicurazione })
      return db
        .prepare(
          `UPDATE bj_mani SET delta = ?5, stato = 'fatto', esito = ?6, updated_at = ?7
            WHERE tavolo = ?1 AND giro = ?3 AND player_id = ?4 AND stato = 'gioco' AND ${preso}`,
        )
        .bind(tavolo, impronta, m.giro, m.id, m.delta, esito, adesso)
    }
    case 'rimborsa':
      return db
        .prepare(
          `DELETE FROM bj_mani WHERE tavolo = ?1 AND giro = ?3 AND player_id = ?4 AND stato = 'gioco' AND ${preso}`,
        )
        .bind(tavolo, impronta, m.giro, m.id)
  }
}

/** Quel che chi scrive mette sul tavolo con questo cambio: va coperto dal saldo. */
function richiestaDi(movimenti: readonly MovimentoBJ[], io: string): number {
  let r = 0
  for (const m of movimenti) {
    if (m.id !== io) continue
    if (m.tipo === 'punta') r += m.puntata
    if (m.tipo === 'aggiunge') r += m.quanto
  }
  return r
}

/** Il batch di un cambio. Restituisce false se il tavolo era gia' cambiato: allora si rilegge. */
async function scrivi(
  db: D1Database,
  row: TavoloRow,
  b: BozzaBJ,
  io: string,
  saldo: { fortuna: SaldoFortuna; giorno: number } | null,
): Promise<boolean> {
  const adesso = nowIso()
  const impronta = crypto.randomUUID()
  const richiesta = richiestaDi(b.movimenti, io)
  const coperta = richiesta > 0 && saldo ? ` AND ?6 + ${nettoFortunaSql('?7', '?8')} >= ?9` : ''
  const tavolo = db
    .prepare(
      `UPDATE bj_tavoli SET stato = ?1, versione = versione + 1, scrittura = ?2, updated_at = ?3
        WHERE id = ?4 AND versione = ?5${coperta}`,
    )
    .bind(
      JSON.stringify(b.t),
      impronta,
      adesso,
      row.id,
      row.versione,
      ...(coperta ? [saldo!.fortuna.classificate, io, saldo!.giorno, richiesta] : []),
    )
  const scritture: D1PreparedStatement[] = [
    tavolo,
    ...b.movimenti.map((m) => righeDel(db, row.id, impronta, m, adesso)),
  ]
  const giornate = new Map<string, [string, number]>()
  for (const m of b.movimenti) {
    if (m.tipo !== 'siede' && m.tipo !== 'alza') giornate.set(`${m.id}:${m.giorno}`, [m.id, m.giorno])
  }
  for (const [id, giorno] of giornate.values()) scritture.push(ricontaBlackjack(db, id, giorno))
  // Un tavolo rimasto senza nessuno, a giro chiuso, se ne va; le mani restano.
  if (b.vuoto() && b.t.fase !== 'gioco') {
    scritture.push(db.prepare('DELETE FROM bj_tavoli WHERE id = ? AND scrittura = ?').bind(row.id, impronta))
  }
  try {
    const [esito] = await db.batch(scritture)
    return esito.meta.changes === 1
  } catch (e) {
    if (String(e).includes('UNIQUE') || String(e).includes('PRIMARY KEY')) {
      fail(409, 'ALTRO_TAVOLO', 'Sei già seduto a un altro tavolo.')
    }
    throw e
  }
}

const STATO_ERRORE: Record<string, 400 | 409> = { PUNTATA: 400, MOSSA: 400 }

/** Il tavolo dopo un cambio: lo stato scritto, la sua versione, e chi ha la pagina aperta. */
interface Letto {
  id: string
  versione: number
  t: TavoloBJ
  presenti: Presenze
}

/**
 * Legge il tavolo, applica le scadenze passate e il cambio chiesto, e scrive.
 * Se il cambio non si puo' fare, si scrivono comunque le scadenze, e poi si
 * dice perché no. `conSaldo` legge il saldo di chi scrive, per le puntate.
 * Restituisce il tavolo com'e' dopo, o null se e' rimasto vuoto e se n'e' andato.
 */
async function suTavolo(
  db: D1Database,
  id: string,
  io: string,
  cambia: ((b: BozzaBJ, saldo: number, giorno: number) => void) | null,
  conSaldo = false,
): Promise<Letto | null> {
  for (let tentativo = 0; tentativo < 4; tentativo += 1) {
    const row = await tavoloRow(db, id)
    if (!row) fail(404, 'TAVOLO', 'Questo tavolo non c’è più.')
    const stato = JSON.parse(row.stato) as TavoloBJ
    const adesso = Date.now()
    const presenti = await presentiFra(
      db,
      seduti(stato).map((p) => p.id),
      adesso,
    )
    const contesto = contestoPer(io, presenti, adesso, () => cartaACaso(aCaso))
    const base = new BozzaBJ(stato, contesto)
    base.avanza()
    // Il saldo e' quello della giornata della puntata: un raddoppio dopo mezzanotte paga sul giro di ieri.
    const mio = postoDi(base.t, io)
    const giorno = mio !== null && base.t.posti[mio]!.puntata > 0 ? base.t.posti[mio]!.giorno : today().puzzleNumber
    const fortuna = conSaldo ? await saldoDi(db, io, giorno) : null
    let finale = base
    let errore: RegolaBJ | null = null
    if (cambia) {
      const prova = new BozzaBJ(base.t, contesto)
      prova.movimenti.push(...base.movimenti)
      try {
        cambia(prova, fortuna?.saldo ?? 0, giorno)
        prova.avanza()
        finale = prova
      } catch (e) {
        if (!(e instanceof RegolaBJ)) throw e
        errore = e
      }
    }
    const cambiato = finale.movimenti.length > 0 || JSON.stringify(finale.t) !== row.stato
    if (cambiato && !(await scrivi(db, row, finale, io, fortuna ? { fortuna, giorno } : null))) continue
    if (errore) fail(STATO_ERRORE[errore.codice] ?? 409, errore.codice, errore.message)
    if (cambiato && finale.vuoto() && finale.t.fase !== 'gioco') return null
    return { id, versione: row.versione + (cambiato ? 1 : 0), t: finale.t, presenti }
  }
  fail(409, 'CONFLITTO', 'Il tavolo è cambiato mentre giocavi: riprova.')
}

/** Il tavolo per chi lo guarda: dopo le scadenze passate, che chi guarda per primo scrive per tutti. */
export async function vistaTavolo(
  db: D1Database,
  id: string,
  io: string,
  letto?: Letto | null,
): Promise<VistaTavoloBJ> {
  const l = letto === undefined ? await suTavolo(db, id, io, null) : letto
  if (!l) fail(404, 'TAVOLO', 'Questo tavolo non c’è più.')
  const { t, presenti } = l
  const adesso = Date.now()
  const ids = seduti(t).map((p) => p.id)
  const [giocatori, fortuna] = await Promise.all([giocatoriDi(db, ids), saldoDi(db, io, today().puzzleNumber)])
  const lettura = new BozzaBJ(t, contestoPer(io, presenti, adesso, () => 'Ac'))
  const aTempo =
    (t.fase === 'gioco' && t.turno !== null && lettura.aspettano(t.turno.posto)) ||
    (t.fase === 'puntate' && t.scadenza !== null)
  return {
    id: l.id,
    versione: l.versione,
    giro: t.giro,
    fase: t.fase,
    scadenzaMs: t.scadenza === null ? null : Math.max(0, t.scadenza - adesso),
    aTempo,
    banco: t.banco,
    turno: t.turno,
    posti: t.posti.map((p) =>
      p
        ? {
            giocatore: giocatori.get(p.id) ?? {
              playerId: p.id,
              nickname: '?',
              displayName: 'Giocatore',
              avatarColor: '#8e8e93',
            },
            puntata: p.puntata,
            mani: p.mani,
            assicurazione: p.assicurazione ?? 0,
            delta: p.delta,
            via: p.via === true,
            presente: lettura.attivo(p),
          }
        : null,
    ),
    mio: postoDi(t, io),
    classificate: fortuna.classificate,
    saldo: fortuna.saldo,
    netto: fortuna.netti.blackjack,
    giri: fortuna.giocate.blackjack,
    msToNextPuzzle: msToNextPuzzle(),
  }
}

/** I tavoli degli amici: quelli con qualcuno seduto che ha la pagina aperta adesso. */
async function tavoliInSala(db: D1Database, io: string, adesso: number): Promise<TavoloInSala[]> {
  const { results } = await db
    .prepare(
      `SELECT s.tavolo, p.id, p.nickname, p.display_name, p.avatar_color
         FROM bj_seduti s JOIN players p ON p.id = s.player_id
        WHERE s.tavolo IN (SELECT s2.tavolo FROM bj_seduti s2 JOIN presenza pr ON pr.player_id = s2.player_id
                            WHERE pr.visto_at >= ?1 AND pr.attivita = 'blackjack' AND s2.player_id != ?2)
          AND s.tavolo NOT IN (SELECT tavolo FROM bj_seduti WHERE player_id = ?2)
        ORDER BY s.created_at`,
    )
    .bind(new Date(adesso - PRESENZA_ONLINE_MS).toISOString(), io)
    .all<GiocatoreRow & { tavolo: string }>()
  const tavoli = new Map<string, GiocatoreBreve[]>()
  for (const r of results) tavoli.set(r.tavolo, [...(tavoli.get(r.tavolo) ?? []), breve(r)])
  return [...tavoli.entries()]
    .map(([id, giocatori]) => ({ id, giocatori, liberi: Math.max(0, POSTI_BJ - giocatori.length) }))
    .sort((a, b) => b.giocatori.length - a.giocatori.length)
}

/** La sala: il saldo, il conto di oggi, il tavolo a cui si e' seduti e quelli degli amici. Non scrive niente. */
export async function salaBlackjack(db: D1Database, io: string): Promise<SalaBlackjack> {
  const quando = today()
  const [fortuna, mio, tavoli] = await Promise.all([
    saldoDi(db, io, quando.puzzleNumber),
    mioTavolo(db, io),
    tavoliInSala(db, io, Date.now()),
  ])
  return {
    puzzleNumber: quando.puzzleNumber,
    date: quando.date,
    msToNextPuzzle: msToNextPuzzle(),
    classificate: fortuna.classificate,
    saldo: fortuna.saldo,
    netto: fortuna.netti.blackjack,
    giri: fortuna.giocate.blackjack,
    mioTavolo: mio,
    tavoli,
  }
}

/** Il blackjack nella scheda della Fortuna. */
export async function riepilogoBlackjack(
  db: D1Database,
  io: string,
): Promise<{ mioTavolo: string | null; tavoli: TavoloInSala[] }> {
  const [mio, tavoli] = await Promise.all([mioTavolo(db, io), tavoliInSala(db, io, Date.now())])
  return { mioTavolo: mio, tavoli }
}

/** Alzarsi da un tavolo: le puntate non ancora giocate tornano, le mani in corso stanno. */
export async function lasciaTavolo(db: D1Database, io: string, id: string): Promise<void> {
  const row = await tavoloRow(db, id)
  if (!row) {
    await db.prepare('DELETE FROM bj_seduti WHERE player_id = ? AND tavolo = ?').bind(io, id).run()
    return
  }
  await suTavolo(db, id, io, (b) => b.alzati(io))
}

/** Sedersi a un tavolo, lasciando quello a cui si era seduti. */
export async function siediAlTavolo(db: D1Database, io: string, id: string): Promise<Letto | null> {
  const attuale = await mioTavolo(db, io)
  if (attuale && attuale !== id) await lasciaTavolo(db, io, attuale)
  return suTavolo(db, id, io, (b) => b.siedi(io))
}

/**
 * Un tavolo nuovo, con chi lo apre seduto al centro. Lascia quello a cui si
 * era seduti, e cancella i tavoli fermi da un giorno, con i loro posti.
 */
export async function apriTavolo(db: D1Database, io: string): Promise<string> {
  const attuale = await mioTavolo(db, io)
  if (attuale) await lasciaTavolo(db, io, attuale)
  const id = newId('bj')
  const adesso = Date.now()
  const quando = new Date(adesso).toISOString()
  const vecchi = new Date(adesso - TAVOLO_ABBANDONATO_MS).toISOString()
  const b = new BozzaBJ(tavoloNuovo(), { adesso, pesca: () => 'Ac', presente: () => true })
  b.siedi(io)
  const impronta = crypto.randomUUID()
  await db.batch([
    db.prepare('DELETE FROM bj_seduti WHERE tavolo IN (SELECT id FROM bj_tavoli WHERE updated_at < ?)').bind(vecchi),
    db.prepare('DELETE FROM bj_tavoli WHERE updated_at < ?').bind(vecchi),
    db
      .prepare(
        `INSERT INTO bj_tavoli (id, stato, versione, scrittura, created_by, created_at, updated_at)
         VALUES (?, ?, 1, ?, ?, ?, ?)`,
      )
      .bind(id, JSON.stringify(b.t), impronta, io, quando, quando),
    db.prepare('INSERT INTO bj_seduti (player_id, tavolo, created_at) VALUES (?, ?, ?)').bind(io, id, quando),
  ])
  return id
}

/** Una puntata per il giro `giro`: da soli, o quando hanno puntato tutti, arrivano subito le carte. */
export async function puntaAlTavolo(db: D1Database, io: string, id: string, giro: unknown, puntata: unknown) {
  return suTavolo(db, id, io, (b, saldo, giorno) => b.punta(io, giro, puntata, saldo, giorno), true)
}

/**
 * Una mossa sulla mano di turno, che il telefono indica con il numero della
 * mano e quante carte ha: anche l'assicurazione, che si paga come un raddoppio.
 */
export async function muoviAlTavolo(
  db: D1Database,
  io: string,
  id: string,
  mossa: { giro?: unknown; mano?: unknown; carte?: unknown; azione?: unknown },
) {
  return suTavolo(db, id, io, (b, saldo) => b.muovi(io, mossa.giro, mossa.mano, mossa.carte, mossa.azione, saldo), true)
}

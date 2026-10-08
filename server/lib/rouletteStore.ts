/**
 * La roulette sul server: i tavoli, chi ci siede, le puntate e i lanci.
 *
 * E' fatta come il blackjack (server/lib/blackjackStore.ts): le regole stanno
 * in shared/roulette-tavolo.ts e lavorano su una copia dello stato
 * (`BozzaRL`); qui si legge il tavolo, si applicano le scadenze passate e
 * quel che chiede chi gioca, e si scrive tutto in un batch — il tavolo,
 * condizionato alla versione letta, e le righe che il cambio chiede, solo se il
 * tavolo ha preso la scrittura (`scrittura`). Un conflitto rilegge e riprova.
 *
 * Il saldo si guarda nell'`UPDATE` del tavolo, sui conti gia' scritti di tutti
 * i giochi della Fortuna, e `fortuna_giornate` si riconta nello stesso batch.
 * Il numero lo pesca il server, con `crypto.getRandomValues`, quando la biglia
 * parte: le puntate sono gia' chiuse, e il giro si paga subito.
 */

import { PRESENZA_ONLINE_MS } from '../../shared/config'
import { msToNextPuzzle } from '../../shared/daily'
import { numeroACaso, totaleDi } from '../../shared/roulette'
import {
  BozzaRL,
  POSTI_RL,
  RegolaRL,
  postoRLDi,
  sedutiRL,
  tavoloRLNuovo,
  type ContestoRL,
  type MovimentoRL,
  type TavoloRL,
} from '../../shared/roulette-tavolo'
import type { GiocatoreBreve, SalaRoulette, TavoloInSala, VistaTavoloRL } from '../../shared/types'
import { breve, giocatoriDi, presentiFra, type GiocatoreRow, type Presenze } from './blackjackStore'
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
}

async function tavoloRow(db: D1Database, id: string): Promise<TavoloRow | null> {
  return db.prepare('SELECT id, stato, versione, scrittura FROM rl_tavoli WHERE id = ?').bind(id).first<TavoloRow>()
}

/** Il tavolo a cui e' seduto un giocatore, se c'e' ancora. */
export async function mioTavoloRL(db: D1Database, playerId: string): Promise<string | null> {
  const riga = await db
    .prepare(
      `SELECT s.tavolo, t.id AS esiste FROM rl_seduti s LEFT JOIN rl_tavoli t ON t.id = s.tavolo
        WHERE s.player_id = ?`,
    )
    .bind(playerId)
    .first<{ tavolo: string; esiste: string | null }>()
  if (!riga) return null
  if (riga.esiste) return riga.tavolo
  await db.prepare('DELETE FROM rl_seduti WHERE player_id = ? AND tavolo = ?').bind(playerId, riga.tavolo).run()
  return null
}

function contestoPer(io: string, presenze: Presenze, adesso: number, estrai: () => number): ContestoRL {
  return {
    adesso,
    estrai,
    presente: (x) => x === io || presenze.qui.has(x),
    altrove: (x, visto) => x !== io && (presenze.altrove.get(x) ?? 0) > visto,
  }
}

/** Il conto della roulette di un giorno, rifatto dai giri: va nello stesso batch di ogni scrittura dei giri. */
function ricontaRoulette(db: D1Database, playerId: string, numero: number): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO fortuna_giornate (player_id, puzzle_number, gioco, netto, giocate)
       SELECT ?1, ?2, 'roulette', COALESCE(SUM(delta), 0), COUNT(*)
         FROM rl_giocate WHERE player_id = ?1 AND puzzle_number = ?2
       ON CONFLICT (player_id, puzzle_number, gioco) DO UPDATE SET netto = excluded.netto, giocate = excluded.giocate`,
    )
    .bind(playerId, numero)
}

/** Le righe che un movimento chiede, scritte solo se il tavolo ha preso la scrittura `impronta` (?1, ?2). */
function righeDel(db: D1Database, tavolo: string, impronta: string, m: MovimentoRL, adesso: string) {
  const preso = 'EXISTS (SELECT 1 FROM rl_tavoli WHERE id = ?1 AND scrittura = ?2)'
  switch (m.tipo) {
    case 'siede':
      // Un tavolo alla volta: se il giocatore e' gia' seduto altrove la chiave lo rifiuta, e il batch con lei.
      return db
        .prepare(`INSERT INTO rl_seduti (player_id, tavolo, created_at) SELECT ?3, ?1, ?4 WHERE ${preso}`)
        .bind(tavolo, impronta, m.id, adesso)
    case 'alza':
      return db
        .prepare(`DELETE FROM rl_seduti WHERE player_id = ?3 AND tavolo = ?1 AND ${preso}`)
        .bind(tavolo, impronta, m.id)
    case 'punta': {
      // Come a Crazy Time la puntata si paga quando la si mette: `delta` vale meno quel che c'e' sul panno.
      const totale = totaleDi(m.puntate)
      return db
        .prepare(
          `INSERT INTO rl_giocate (tavolo, giro, player_id, puzzle_number, puntata, delta, puntate, stato,
                                   created_at, updated_at)
           SELECT ?1, ?3, ?4, ?5, ?6, -?6, ?7, 'gioco', ?8, ?8 WHERE ${preso}
           ON CONFLICT (tavolo, giro, player_id) DO UPDATE
              SET puntata = excluded.puntata, delta = excluded.delta, puntate = excluded.puntate,
                  updated_at = excluded.updated_at
            WHERE rl_giocate.stato = 'gioco'`,
        )
        .bind(tavolo, impronta, m.giro, m.id, m.giorno, totale, JSON.stringify(m.puntate), adesso)
    }
    case 'chiude':
      return db
        .prepare(
          `UPDATE rl_giocate SET delta = ?5, numero = ?6, stato = 'fatto', updated_at = ?7
            WHERE tavolo = ?1 AND giro = ?3 AND player_id = ?4 AND stato = 'gioco' AND ${preso}`,
        )
        .bind(tavolo, impronta, m.giro, m.id, m.delta, m.numero, adesso)
    case 'rimborsa':
      return db
        .prepare(
          `DELETE FROM rl_giocate WHERE tavolo = ?1 AND giro = ?3 AND player_id = ?4 AND stato = 'gioco' AND ${preso}`,
        )
        .bind(tavolo, impronta, m.giro, m.id)
  }
}

/** Quel che chi scrive aggiunge sul panno con questo cambio: va coperto dal saldo. */
function richiestaDi(movimenti: readonly MovimentoRL[], io: string): number {
  let r = 0
  for (const m of movimenti) if (m.id === io && m.tipo === 'punta') r += totaleDi(m.puntate) - m.prima
  return r
}

/** Il batch di un cambio. Restituisce false se il tavolo era gia' cambiato: allora si rilegge. */
async function scrivi(
  db: D1Database,
  row: TavoloRow,
  b: BozzaRL,
  io: string,
  saldo: { fortuna: SaldoFortuna; giorno: number } | null,
): Promise<boolean> {
  const adesso = nowIso()
  const impronta = crypto.randomUUID()
  const richiesta = richiestaDi(b.movimenti, io)
  const coperta = richiesta > 0 && saldo ? ` AND ?6 + ${nettoFortunaSql('?7', '?8')} >= ?9` : ''
  const tavolo = db
    .prepare(
      `UPDATE rl_tavoli SET stato = ?1, versione = versione + 1, scrittura = ?2, updated_at = ?3
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
  for (const [id, giorno] of giornate.values()) scritture.push(ricontaRoulette(db, id, giorno))
  // Un tavolo rimasto senza nessuno se ne va; i giri restano.
  if (b.vuoto()) {
    scritture.push(db.prepare('DELETE FROM rl_tavoli WHERE id = ? AND scrittura = ?').bind(row.id, impronta))
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

const STATO_ERRORE: Record<string, 400 | 409> = { PUNTATA: 400 }

interface Letto {
  id: string
  versione: number
  t: TavoloRL
  presenti: Presenze
}

/**
 * Legge il tavolo, applica le scadenze passate e il cambio chiesto, e scrive.
 * Se il cambio non si puo' fare si scrivono comunque le scadenze, e poi si
 * dice perché no. Restituisce il tavolo com'e' dopo, o null se e' rimasto vuoto.
 */
async function suTavolo(
  db: D1Database,
  id: string,
  io: string,
  cambia: ((b: BozzaRL, saldo: number, giorno: number) => void) | null,
  conSaldo = false,
): Promise<Letto | null> {
  for (let tentativo = 0; tentativo < 4; tentativo += 1) {
    const row = await tavoloRow(db, id)
    if (!row) fail(404, 'TAVOLO', 'Questo tavolo non c’è più.')
    const stato = JSON.parse(row.stato) as TavoloRL
    const adesso = Date.now()
    const presenti = await presentiFra(
      db,
      sedutiRL(stato).map((p) => p.id),
      adesso,
      'roulette',
    )
    const contesto = contestoPer(io, presenti, adesso, () => numeroACaso(aCaso))
    const base = new BozzaRL(stato, contesto)
    base.avanza()
    // Il saldo e' quello della giornata delle puntate gia' sul panno: dopo mezzanotte si cambiano su ieri.
    const mio = postoRLDi(base.t, io)
    const p = mio === null ? null : base.t.posti[mio]!
    const giorno = p && base.t.fase === 'puntate' && totaleDi(p.puntate) > 0 ? p.giorno : today().puzzleNumber
    const fortuna = conSaldo ? await saldoDi(db, io, giorno) : null
    let finale = base
    let errore: RegolaRL | null = null
    if (cambia) {
      const prova = new BozzaRL(base.t, contesto)
      prova.movimenti.push(...base.movimenti)
      try {
        cambia(prova, fortuna?.saldo ?? 0, giorno)
        prova.avanza()
        finale = prova
      } catch (e) {
        if (!(e instanceof RegolaRL)) throw e
        errore = e
      }
    }
    const cambiato = finale.movimenti.length > 0 || JSON.stringify(finale.t) !== row.stato
    if (cambiato && !(await scrivi(db, row, finale, io, fortuna ? { fortuna, giorno } : null))) continue
    if (errore) fail(STATO_ERRORE[errore.codice] ?? 409, errore.codice, errore.message)
    if (cambiato && finale.vuoto()) return null
    return { id, versione: row.versione + (cambiato ? 1 : 0), t: finale.t, presenti }
  }
  fail(409, 'CONFLITTO', 'Il tavolo è cambiato mentre giocavi: riprova.')
}

/** Il tavolo per chi lo guarda: dopo le scadenze passate, che chi guarda per primo scrive per tutti. */
export async function vistaTavoloRL(
  db: D1Database,
  id: string,
  io: string,
  letto?: Letto | null,
): Promise<VistaTavoloRL> {
  const l = letto === undefined ? await suTavolo(db, id, io, null) : letto
  if (!l) fail(404, 'TAVOLO', 'Questo tavolo non c’è più.')
  const { t, presenti } = l
  const adesso = Date.now()
  const ids = sedutiRL(t).map((p) => p.id)
  const [giocatori, fortuna] = await Promise.all([giocatoriDi(db, ids), saldoDi(db, io, today().puzzleNumber)])
  const lettura = new BozzaRL(t, contestoPer(io, presenti, adesso, () => 0))
  return {
    id: l.id,
    versione: l.versione,
    giro: t.giro,
    fase: t.fase,
    scadenzaMs: t.scadenza === null ? null : Math.max(0, t.scadenza - adesso),
    lancio: t.lancio ? { faMs: Math.max(0, adesso - t.lancio.quando), numero: t.lancio.numero } : null,
    storia: t.storia,
    posti: t.posti.map((p) =>
      p
        ? {
            giocatore: giocatori.get(p.id) ?? {
              playerId: p.id,
              nickname: '?',
              displayName: 'Giocatore',
              avatarColor: '#8e8e93',
            },
            puntate: p.puntate,
            delta: p.delta,
            presente: lettura.attivo(p),
          }
        : null,
    ),
    mio: postoRLDi(t, io),
    classificate: fortuna.classificate,
    saldo: fortuna.saldo,
    netto: fortuna.netti.roulette,
    giri: fortuna.giocate.roulette,
    msToNextPuzzle: msToNextPuzzle(),
  }
}

/** I tavoli degli amici: quelli con qualcuno seduto che ha la pagina aperta adesso. */
async function tavoliInSala(db: D1Database, io: string, adesso: number): Promise<TavoloInSala[]> {
  const { results } = await db
    .prepare(
      `SELECT s.tavolo, p.id, p.nickname, p.display_name, p.avatar_color
         FROM rl_seduti s JOIN players p ON p.id = s.player_id
        WHERE s.tavolo IN (SELECT s2.tavolo FROM rl_seduti s2 JOIN presenza pr ON pr.player_id = s2.player_id
                            WHERE pr.visto_at >= ?1 AND pr.attivita = 'roulette' AND s2.player_id != ?2)
          AND s.tavolo NOT IN (SELECT tavolo FROM rl_seduti WHERE player_id = ?2)
        ORDER BY s.created_at`,
    )
    .bind(new Date(adesso - PRESENZA_ONLINE_MS).toISOString(), io)
    .all<GiocatoreRow & { tavolo: string }>()
  const tavoli = new Map<string, GiocatoreBreve[]>()
  for (const r of results) tavoli.set(r.tavolo, [...(tavoli.get(r.tavolo) ?? []), breve(r)])
  return [...tavoli.entries()]
    .map(([id, giocatori]) => ({ id, giocatori, liberi: Math.max(0, POSTI_RL - giocatori.length) }))
    .sort((a, b) => b.giocatori.length - a.giocatori.length)
}

/** La sala: il saldo, il conto di oggi, il tavolo a cui si e' seduti e quelli degli amici. Non scrive niente. */
export async function salaRoulette(db: D1Database, io: string): Promise<SalaRoulette> {
  const quando = today()
  const [fortuna, mio, tavoli] = await Promise.all([
    saldoDi(db, io, quando.puzzleNumber),
    mioTavoloRL(db, io),
    tavoliInSala(db, io, Date.now()),
  ])
  return {
    puzzleNumber: quando.puzzleNumber,
    date: quando.date,
    msToNextPuzzle: msToNextPuzzle(),
    classificate: fortuna.classificate,
    saldo: fortuna.saldo,
    netto: fortuna.netti.roulette,
    giri: fortuna.giocate.roulette,
    mioTavolo: mio,
    tavoli,
  }
}

/** La roulette nella scheda della Fortuna. */
export async function riepilogoRoulette(
  db: D1Database,
  io: string,
): Promise<{ mioTavolo: string | null; tavoli: TavoloInSala[] }> {
  const [mio, tavoli] = await Promise.all([mioTavoloRL(db, io), tavoliInSala(db, io, Date.now())])
  return { mioTavolo: mio, tavoli }
}

/** Alzarsi da un tavolo: le puntate non ancora giocate tornano. */
export async function lasciaTavoloRL(db: D1Database, io: string, id: string): Promise<void> {
  const row = await tavoloRow(db, id)
  if (!row) {
    await db.prepare('DELETE FROM rl_seduti WHERE player_id = ? AND tavolo = ?').bind(io, id).run()
    return
  }
  await suTavolo(db, id, io, (b) => b.alzati(io))
}

/** Sedersi a un tavolo, lasciando quello a cui si era seduti. */
export async function siediAlTavoloRL(db: D1Database, io: string, id: string): Promise<Letto | null> {
  const attuale = await mioTavoloRL(db, io)
  if (attuale && attuale !== id) await lasciaTavoloRL(db, io, attuale)
  return suTavolo(db, id, io, (b) => b.siedi(io))
}

/** Un tavolo nuovo, con chi lo apre seduto. Lascia quello a cui si era seduti, e cancella i tavoli fermi da un giorno. */
export async function apriTavoloRL(db: D1Database, io: string): Promise<string> {
  const attuale = await mioTavoloRL(db, io)
  if (attuale) await lasciaTavoloRL(db, io, attuale)
  const id = newId('rl')
  const adesso = Date.now()
  const quando = new Date(adesso).toISOString()
  const vecchi = new Date(adesso - TAVOLO_ABBANDONATO_MS).toISOString()
  const b = new BozzaRL(tavoloRLNuovo(), { adesso, estrai: () => 0, presente: () => true })
  b.siedi(io)
  await db.batch([
    db.prepare('DELETE FROM rl_seduti WHERE tavolo IN (SELECT id FROM rl_tavoli WHERE updated_at < ?)').bind(vecchi),
    db.prepare('DELETE FROM rl_tavoli WHERE updated_at < ?').bind(vecchi),
    db
      .prepare(
        `INSERT INTO rl_tavoli (id, stato, versione, scrittura, created_by, created_at, updated_at)
         VALUES (?, ?, 1, ?, ?, ?, ?)`,
      )
      .bind(id, JSON.stringify(b.t), crypto.randomUUID(), io, quando, quando),
    db.prepare('INSERT INTO rl_seduti (player_id, tavolo, created_at) VALUES (?, ?, ?)').bind(io, id, quando),
  ])
  return id
}

/** Le puntate del giro `giro`: da soli, o quando hanno puntato tutti, la biglia parte subito. */
export async function puntaAlTavoloRL(db: D1Database, io: string, id: string, giro: unknown, puntate: unknown) {
  return suTavolo(db, id, io, (b, saldo, giorno) => b.punta(io, giro, puntate, saldo, giorno), true)
}

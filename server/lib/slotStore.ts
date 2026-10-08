/**
 * La slot sul server: quanti giri si vuole, ognuno con la sua puntata, presa
 * dal saldo della Fortuna (server/lib/fortuna.ts).
 *
 * Come a Crazy Time la puntata si paga al giro: ogni giro nasce con `delta`
 * uguale alla vincita della linea meno la puntata, e solo una domanda vinta lo
 * cambia. Una domanda lasciata a meta' conta persa, e il giro dopo la chiude.
 *
 * Le fermate dei rulli le sceglie il server, con `crypto.getRandomValues`: il
 * browser riceve solo dove fermarli. Tre punti di domanda in vista aprono una
 * domanda di una categoria del giorno pescata fra quelle che hanno ancora
 * domande da dare a quel giocatore, come lo spicchio alla ruota; se non ce n'e'
 * nessuna, le fermate si ripescano. La domanda si apre quando la si chiede,
 * con il suo tempo che parte li', come nel quiz.
 *
 * Il saldo si controlla dentro l'`INSERT` del giro, sui conti gia' scritti di
 * tutti i giochi della Fortuna; ogni scrittura riscrive nello stesso batch il
 * conto della slot in `fortuna_giornate`, che e' quel che legge la generale.
 */

import { msToNextPuzzle } from '../../shared/daily'
import type { CategoriaQuiz } from '../../shared/quiz'
import { rispostaGiusta, senzaRisposta, type DomandaCompleta } from '../../shared/quiz-domande'
import { categorieDelGiorno } from '../../shared/ruota'
import {
  DISPOSIZIONE_SLOT,
  INTERVALLO_SLOT_MS,
  PUNTATA_MINIMA_SLOT,
  RULLI,
  VINCITA_DOMANDA,
  apreDomanda,
  deltaSlot,
  lineaDi,
  premioDellaLinea,
  puntataSlotValida,
} from '../../shared/slot'
import type { GiroSlot, RispostaQuiz, SlotStato } from '../../shared/types'
import { categorieDisponibili, domandaNuova, domandaScaduta, nettoFortunaSql, saldoDi } from './fortuna'
import { fail, nowIso } from './http'
import { limiteMs } from './quizStore'
import { aCaso } from './ruotaStore'
import { today } from './wordleStore'

export interface GiroSlotRow {
  player_id: string
  puzzle_number: number
  n: number
  puntata: number
  fermate: string
  disposizione: number
  premio: number
  categoria: string | null
  stato: 'sfida' | 'domanda' | 'fatto'
  delta: number
  sfida: string | null
  domanda: string | null
  aperta_at: string | null
  created_at: string
  updated_at: string
}

/** La domanda come sta nel database: intera, con la risposta, la scelta e l'esito. */
interface DomandaSalvata {
  domanda: DomandaCompleta
  scelta?: string | null
  giusta?: boolean
  ms?: number
}

export async function ultimoGiroSlot(db: D1Database, playerId: string, numero: number): Promise<GiroSlotRow | null> {
  return db
    .prepare('SELECT * FROM slot_giri WHERE player_id = ? AND puzzle_number = ? ORDER BY n DESC LIMIT 1')
    .bind(playerId, numero)
    .first<GiroSlotRow>()
}

/** Il conto della slot nella giornata rifatto dai giri: va nello stesso batch di ogni scrittura. */
function ricontaSlot(db: D1Database, playerId: string, numero: number): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO fortuna_giornate (player_id, puzzle_number, gioco, netto, giocate)
       SELECT ?1, ?2, 'slot', COALESCE(SUM(delta), 0), COUNT(*)
         FROM slot_giri WHERE player_id = ?1 AND puzzle_number = ?2
       ON CONFLICT (player_id, puzzle_number, gioco) DO UPDATE SET netto = excluded.netto, giocate = excluded.giocate`,
    )
    .bind(playerId, numero)
}

function leggiDomanda(row: GiroSlotRow): DomandaSalvata | null {
  if (!row.sfida) return null
  try {
    return JSON.parse(row.sfida) as DomandaSalvata
  } catch {
    return null
  }
}

function rispostaVista(s: DomandaSalvata): RispostaQuiz {
  const d = s.domanda
  return {
    scelta: s.scelta ?? null,
    giusta: s.giusta === true,
    corretta: d.giusta,
    risposta: d.risposta,
    ms: s.ms ?? 0,
    ...(d.spiegazione ? { spiegazione: d.spiegazione } : {}),
  }
}

/** Il giro come lo vede chi gioca: la domanda senza la risposta finché non si risponde. */
export function vistaGiroSlot(row: GiroSlotRow, adesso: number): GiroSlot {
  const fermate = JSON.parse(row.fermate) as number[]
  const salvata = leggiDomanda(row)
  const d = salvata?.domanda
  const aperta = row.stato === 'domanda' && d && row.aperta_at
  return {
    n: row.n,
    puntata: row.puntata,
    fermate,
    premio: row.premio,
    tripla: row.categoria ? { categoria: row.categoria as CategoriaQuiz } : null,
    stato: row.stato,
    delta: row.delta,
    vincitaDomanda: row.categoria ? row.puntata * VINCITA_DOMANDA : null,
    domanda: d ? senzaRisposta(d) : null,
    limiteMs: d ? limiteMs(d) : null,
    restanteMs: aperta ? Math.max(0, limiteMs(d) - (adesso - Date.parse(row.aperta_at!))) : null,
    risposta: row.stato === 'fatto' && salvata && d ? rispostaVista(salvata) : null,
  }
}

/** Una domanda rimasta aperta oltre il tempo e' una risposta non data: la si chiude alla prima lettura. */
async function chiudiScaduta(db: D1Database, row: GiroSlotRow | null, adesso: number): Promise<GiroSlotRow | null> {
  if (!row || row.stato !== 'domanda') return row
  const salvata = leggiDomanda(row)
  if (!salvata || !domandaScaduta(row.aperta_at, salvata.domanda, adesso)) return row
  const chiusa: DomandaSalvata = { ...salvata, scelta: null, giusta: false, ms: limiteMs(salvata.domanda) }
  await db
    .prepare(
      `UPDATE slot_giri SET stato = 'fatto', sfida = ?, updated_at = ?
        WHERE player_id = ? AND puzzle_number = ? AND n = ? AND stato = 'domanda'`,
    )
    .bind(JSON.stringify(chiusa), new Date(adesso).toISOString(), row.player_id, row.puzzle_number, row.n)
    .run()
  return ultimoGiroSlot(db, row.player_id, row.puzzle_number)
}

/** Un giro dei rulli di adesso: con altri rulli le stesse fermate sarebbero altri simboli. */
const diQuestiRulli = (row: GiroSlotRow | null): row is GiroSlotRow =>
  row !== null && row.disposizione === DISPOSIZIONE_SLOT

/** La slot di oggi per chi la guarda: il saldo, il conto della slot, e l'ultimo giro. */
export async function statoSlot(db: D1Database, playerId: string): Promise<SlotStato> {
  const quando = today()
  const adesso = Date.now()
  const [fortuna, row] = await Promise.all([
    saldoDi(db, playerId, quando.puzzleNumber),
    ultimoGiroSlot(db, playerId, quando.puzzleNumber).then((r) => chiudiScaduta(db, r, adesso)),
  ])
  return {
    puzzleNumber: quando.puzzleNumber,
    date: quando.date,
    classificate: fortuna.classificate,
    saldo: fortuna.saldo,
    netto: fortuna.netti.slot,
    giri: fortuna.giocate.slot,
    categorie: categorieDelGiorno(quando.puzzleNumber),
    giro: diQuestiRulli(row) ? vistaGiroSlot(row, adesso) : null,
    msToNextPuzzle: msToNextPuzzle(),
  }
}

/**
 * Le fermate di un giro: a caso, una per rullo. Con tre punti di domanda in
 * vista si pesca anche la categoria, fra quelle del giorno che hanno ancora
 * domande da dare; se non ce n'e' nessuna si ripesca tutto, ed e' come se
 * quelle fermate non ci fossero, come lo spicchio senza domande alla ruota.
 */
export function fermateACaso(
  categorie: readonly CategoriaQuiz[],
  disponibili: ReadonlySet<string>,
  caso: (n: number) => number = aCaso,
): { fermate: number[]; categoria: CategoriaQuiz | null } {
  for (;;) {
    const fermate = RULLI.map((r) => caso(r.length))
    if (!apreDomanda(fermate)) return { fermate, categoria: null }
    const possibili = categorie.filter((c) => disponibili.has(c))
    if (possibili.length > 0) return { fermate, categoria: possibili[caso(possibili.length)] }
  }
}

/**
 * Un giro. Le fermate escono qui, e la puntata e' gia' pagata: la linea la
 * restituisce moltiplicata subito, tre punti di domanda aprono una domanda.
 * Una domanda dell'ultimo giro lasciata a meta' si chiude: vale gia' persa.
 */
export async function giraSlot(db: D1Database, playerId: string, puntata: unknown): Promise<void> {
  const numero = today().puzzleNumber
  const [ultimo, fortuna, disponibili] = await Promise.all([
    ultimoGiroSlot(db, playerId, numero),
    saldoDi(db, playerId, numero),
    categorieDisponibili(db, playerId, numero),
  ])
  const { classificate, saldo } = fortuna
  if (saldo < PUNTATA_MINIMA_SLOT) {
    fail(409, 'POCHI_PUNTI', `Per giocare serve almeno ${PUNTATA_MINIMA_SLOT} punto di oggi.`)
  }
  if (!puntataSlotValida(puntata, saldo)) {
    fail(400, 'PUNTATA', `Si puntano da ${PUNTATA_MINIMA_SLOT} a ${saldo} punti.`)
  }
  if (ultimo && Date.now() - Date.parse(ultimo.created_at) < INTERVALLO_SLOT_MS) {
    fail(429, 'TROPPO_PRESTO', 'I rulli stanno ancora girando.')
  }
  const categorie = categorieDelGiorno(numero)
  const { fermate, categoria } = fermateACaso(categorie, disponibili)
  const premio = premioDellaLinea(lineaDi(fermate))
  const n = (ultimo?.n ?? 0) + 1
  const adesso = nowIso()
  const scritture: D1PreparedStatement[] = []
  if (ultimo && ultimo.stato !== 'fatto') {
    scritture.push(
      db
        .prepare(
          `UPDATE slot_giri SET stato = 'fatto', updated_at = ?
            WHERE player_id = ? AND puzzle_number = ? AND n = ? AND stato != 'fatto'`,
        )
        .bind(adesso, playerId, numero, ultimo.n),
    )
  }
  // Il saldo si guarda qui, sui conti gia' scritti: una puntata partita nello stesso istante, anche a un
  // altro gioco della Fortuna, non lo ha visto.
  scritture.push(
    db
      .prepare(
        `INSERT OR IGNORE INTO slot_giri
           (player_id, puzzle_number, n, puntata, fermate, disposizione, premio, categoria, stato, delta,
            created_at, updated_at)
         SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11
          WHERE ?12 + ${nettoFortunaSql('?1', '?2')} >= ?4`,
      )
      .bind(
        playerId,
        numero,
        n,
        puntata,
        JSON.stringify(fermate),
        DISPOSIZIONE_SLOT,
        premio,
        categoria,
        categoria ? 'sfida' : 'fatto',
        deltaSlot(puntata, premio),
        adesso,
        classificate,
      ),
    ricontaSlot(db, playerId, numero),
  )
  const esiti = await db.batch(scritture)
  if (esiti[esiti.length - 2].meta.changes !== 1) {
    fail(409, 'CONFLITTO', 'Un altro giro è partito insieme a questo: ricarico.')
  }
}

/** L'ultimo giro di oggi con i tre punti di domanda, o un errore che dice perché non c'e'. */
async function giroConTripla(db: D1Database, playerId: string): Promise<GiroSlotRow & { categoria: string }> {
  const row = await ultimoGiroSlot(db, playerId, today().puzzleNumber)
  if (!diQuestiRulli(row)) fail(409, 'NESSUN_GIRO', 'Non hai ancora tirato la leva.')
  if (!row.categoria) fail(409, 'NESSUNA_DOMANDA', 'I rulli non hanno fatto tre punti di domanda.')
  return row as GiroSlotRow & { categoria: string }
}

/**
 * Apre la domanda: una a caso fra quelle della categoria del giro che il
 * giocatore non ha ancora avuto, alla slot o alla ruota, e il tempo parte
 * adesso. Se e' gia' aperta resta com'e', con il tempo che le resta.
 */
export async function apriDomandaSlot(db: D1Database, playerId: string): Promise<void> {
  const row = await giroConTripla(db, playerId)
  if (row.stato !== 'sfida') return
  const scelta = await domandaNuova(db, playerId, row.puzzle_number, row.categoria, aCaso)
  const adesso = nowIso()
  await db
    .prepare(
      `UPDATE slot_giri SET stato = 'domanda', sfida = ?, domanda = ?, aperta_at = ?, updated_at = ?
        WHERE player_id = ? AND puzzle_number = ? AND n = ? AND stato = 'sfida'`,
    )
    .bind(
      JSON.stringify({ domanda: scelta.domanda } satisfies DomandaSalvata),
      scelta.chiave,
      adesso,
      adesso,
      playerId,
      row.puzzle_number,
      row.n,
    )
    .run()
}

/**
 * La risposta alla domanda. Giusta, paga `VINCITA_DOMANDA` volte la puntata,
 * oltre a quel che ha pagato la linea; sbagliata, o oltre il tempo e il
 * margine della rete, resta quel che c'era.
 */
export async function rispondiSlot(db: D1Database, playerId: string, scelta: string | null): Promise<void> {
  const row = await giroConTripla(db, playerId)
  const salvata = leggiDomanda(row)
  if (row.stato !== 'domanda' || !salvata || !row.aperta_at) {
    fail(409, 'NESSUNA_DOMANDA', 'Non c’è una domanda aperta.')
  }
  const d = salvata.domanda
  const adesso = Date.now()
  const valida = domandaScaduta(row.aperta_at, d, adesso) ? null : scelta
  const giusta = rispostaGiusta(d, valida)
  const ms = Math.round(Math.min(limiteMs(d), Math.max(0, adesso - Date.parse(row.aperta_at))))
  const [esito] = await db.batch([
    db
      .prepare(
        `UPDATE slot_giri SET stato = 'fatto', delta = ?, sfida = ?, updated_at = ?
          WHERE player_id = ? AND puzzle_number = ? AND n = ? AND stato = 'domanda'`,
      )
      .bind(
        deltaSlot(row.puntata, row.premio + (giusta ? VINCITA_DOMANDA : 0)),
        JSON.stringify({ ...salvata, scelta: valida, giusta, ms } satisfies DomandaSalvata),
        new Date(adesso).toISOString(),
        playerId,
        row.puzzle_number,
        row.n,
      ),
    ricontaSlot(db, playerId, row.puzzle_number),
  ])
  if (esito.meta.changes !== 1) fail(409, 'CONFLITTO', 'Questa domanda ha già una risposta: ricarico.')
}

/** La slot nella scheda della Fortuna: di sola lettura. */
export async function riepilogoSlot(db: D1Database, playerId: string): Promise<{ stato: 'gioca' | 'sfida' }> {
  const row = await ultimoGiroSlot(db, playerId, today().puzzleNumber)
  return { stato: diQuestiRulli(row) && row.stato !== 'fatto' ? 'sfida' : 'gioca' }
}

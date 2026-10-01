/**
 * La ruota del giorno sul server: un giro per giocatore per giornata, con la
 * puntata presa dai punti delle classificate di oggi.
 *
 * Lo spicchio lo sceglie il server, con `crypto.getRandomValues`: il browser
 * riceve solo dove fermare la ruota. Le sfide — testa o croce e le domande —
 * si giocano dopo, con una richiesta loro, e fino ad allora il giro vale gia'
 * quel che toglie se vanno male (`delta`): una sfida lasciata a meta' conta
 * persa. La moneta si lancia quando si sceglie il lato, e la domanda si apre
 * quando la si chiede, con il suo tempo che parte li', come nel quiz.
 *
 * Ogni scrittura e' condizionata allo stato letto — D1 non ha transazioni
 * interattive — e il secondo giro lo rifiuta la chiave della tabella.
 */

import { msToNextPuzzle } from '../../shared/daily'
import { periodoDi } from '../../shared/periodi'
import { MARGINE_RETE_MS, type CategoriaQuiz } from '../../shared/quiz'
import { rispostaGiusta, senzaRisposta, type DomandaCompleta } from '../../shared/quiz-domande'
import {
  PUNTATA_MINIMA,
  SPICCHI,
  deltaDi,
  eSfida,
  puntataValida,
  type DomandaRuota,
  type LatoMoneta,
  type MateriaRuota,
  type Spicchio,
} from '../../shared/ruota'
import type { GiroRuota, RispostaQuiz, RuotaStato, RuotaSummary, SfidaRuotaVista } from '../../shared/types'
import { classificaGenerale } from './generale'
import { fail, nowIso } from './http'
import { limiteMs } from './quizStore'
import { today } from './wordleStore'

export interface GiroRow {
  player_id: string
  puzzle_number: number
  puntata: number
  spicchio: number
  stato: 'sfida' | 'domanda' | 'fatto'
  delta: number
  sfida: string | null
  aperta_at: string | null
  created_at: string
  updated_at: string
}

/** La sfida come sta nel database: la domanda intera, con la risposta. */
type SfidaSalvata =
  | { tipo: 'moneta'; scelto?: LatoMoneta; uscito?: LatoMoneta }
  | {
      tipo: 'domanda'
      materia: MateriaRuota
      categoria?: CategoriaQuiz
      domanda?: DomandaCompleta
      scelta?: string | null
      giusta?: boolean
      ms?: number
    }

/** Un intero a caso fra zero e `n` escluso, senza la distorsione del modulo. */
export function aCaso(n: number): number {
  const limite = Math.floor(0x1_0000_0000 / n) * n
  const valori = new Uint32Array(1)
  for (;;) {
    crypto.getRandomValues(valori)
    if (valori[0] < limite) return valori[0] % n
  }
}

/** Uno spicchio a caso fra quelli che si possono giocare: tutti, tranne le domande di una materia senza domande. */
export function spicchioACaso(possibile: (s: Spicchio) => boolean, caso: (n: number) => number = aCaso): number {
  const buoni = SPICCHI.flatMap((s, i) => (possibile(s) ? [i] : []))
  return buoni[caso(buoni.length)]
}

export async function giroDi(db: D1Database, playerId: string, numero: number): Promise<GiroRow | null> {
  return db
    .prepare('SELECT * FROM ruota_giri WHERE player_id = ? AND puzzle_number = ?')
    .bind(playerId, numero)
    .first<GiroRow>()
}

/**
 * I punti delle classificate di oggi, quelli che si possono puntare: gli
 * stessi della classifica generale del giorno, ruota esclusa.
 */
export async function puntiDelleClassificate(db: D1Database, playerId: string, numero: number): Promise<number> {
  const generale = await classificaGenerale(db, periodoDi('today', numero), playerId)
  return generale.me ? generale.me.punti - generale.me.ruota : 0
}

function leggiSfida(row: GiroRow): SfidaSalvata | null {
  if (!row.sfida) return null
  try {
    return JSON.parse(row.sfida) as SfidaSalvata
  } catch {
    return null
  }
}

/** Le materie che oggi hanno le domande: uno spicchio di una materia senza domande non esce. */
async function materieDisponibili(db: D1Database, numero: number): Promise<Set<MateriaRuota>> {
  const { results } = await db
    .prepare('SELECT materia FROM ruota_domande WHERE puzzle_number = ?')
    .bind(numero)
    .all<{ materia: MateriaRuota }>()
  return new Set(results.map((r) => r.materia))
}

function scaduta(row: GiroRow, d: DomandaCompleta, adesso: number): boolean {
  return row.aperta_at !== null && adesso > Date.parse(row.aperta_at) + limiteMs(d) + MARGINE_RETE_MS
}

function rispostaVista(d: DomandaCompleta, s: Extract<SfidaSalvata, { tipo: 'domanda' }>): RispostaQuiz {
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
export function vistaGiro(row: GiroRow, adesso: number): GiroRuota {
  const salvata = leggiSfida(row)
  const s = SPICCHI[row.spicchio]
  const posta = s && eSfida(s) ? s.posta : 0
  let sfida: SfidaRuotaVista | null = null
  if (salvata?.tipo === 'moneta') {
    sfida = { tipo: 'moneta', posta, scelto: salvata.scelto ?? null, uscito: salvata.uscito ?? null }
  } else if (salvata?.tipo === 'domanda') {
    const d = salvata.domanda
    const aperta = row.stato === 'domanda' && d && row.aperta_at
    sfida = {
      tipo: 'domanda',
      posta,
      materia: salvata.materia,
      categoria: salvata.categoria ?? null,
      domanda: d ? senzaRisposta(d) : null,
      limiteMs: d ? limiteMs(d) : null,
      restanteMs: aperta ? Math.max(0, limiteMs(d) - (adesso - Date.parse(row.aperta_at!))) : null,
      risposta: row.stato === 'fatto' && d ? rispostaVista(d, salvata) : null,
    }
  }
  return { puntata: row.puntata, spicchio: row.spicchio, stato: row.stato, delta: row.delta, sfida }
}

/**
 * Una domanda rimasta aperta oltre il tempo e' una risposta non data: la si
 * chiude alla prima lettura, come nel quiz. Il `delta` era gia' quello di una
 * sfida persa.
 */
async function chiudiScaduta(db: D1Database, row: GiroRow | null, adesso: number): Promise<GiroRow | null> {
  if (!row || row.stato !== 'domanda') return row
  const salvata = leggiSfida(row)
  const d = salvata?.tipo === 'domanda' ? salvata.domanda : undefined
  if (!d || !scaduta(row, d, adesso)) return row
  const chiusa = { ...salvata, scelta: null, giusta: false, ms: limiteMs(d) }
  const ora = new Date(adesso).toISOString()
  await db
    .prepare(
      `UPDATE ruota_giri SET stato = 'fatto', sfida = ?, updated_at = ?
        WHERE player_id = ? AND puzzle_number = ? AND stato = 'domanda'`,
    )
    .bind(JSON.stringify(chiusa), ora, row.player_id, row.puzzle_number)
    .run()
  return giroDi(db, row.player_id, row.puzzle_number)
}

/** La ruota di oggi per chi la guarda: i punti che si possono puntare, e il giro se c'e'. */
export async function statoRuota(db: D1Database, playerId: string): Promise<RuotaStato> {
  const quando = today()
  const adesso = Date.now()
  const [punti, row] = await Promise.all([
    puntiDelleClassificate(db, playerId, quando.puzzleNumber),
    giroDi(db, playerId, quando.puzzleNumber).then((r) => chiudiScaduta(db, r, adesso)),
  ])
  return {
    puzzleNumber: quando.puzzleNumber,
    date: quando.date,
    puntiDiOggi: punti,
    giro: row ? vistaGiro(row, adesso) : null,
    msToNextPuzzle: msToNextPuzzle(),
  }
}

/**
 * Il giro di oggi. Lo spicchio esce qui, a caso; uno che non e' una sfida ha
 * subito il suo esito, una sfida vale intanto quel che toglie se va male.
 */
export async function gira(db: D1Database, playerId: string, puntata: unknown): Promise<void> {
  const quando = today()
  if (await giroDi(db, playerId, quando.puzzleNumber)) fail(409, 'GIA_GIRATA', 'La ruota di oggi l’hai già girata.')
  const punti = await puntiDelleClassificate(db, playerId, quando.puzzleNumber)
  if (punti < PUNTATA_MINIMA) {
    fail(409, 'POCHI_PUNTI', `Per girare servono almeno ${PUNTATA_MINIMA} punti delle classificate di oggi.`)
  }
  if (!puntataValida(puntata, punti)) fail(400, 'PUNTATA', `Si puntano da ${PUNTATA_MINIMA} a ${punti} punti.`)
  const materie = await materieDisponibili(db, quando.puzzleNumber)
  const indice = spicchioACaso((s) => s.tipo !== 'domanda' || materie.has(s.materia))
  const s = SPICCHI[indice]
  const sfida: SfidaSalvata | null = !eSfida(s)
    ? null
    : s.tipo === 'moneta'
      ? { tipo: 'moneta' }
      : { tipo: 'domanda', materia: s.materia }
  const adesso = nowIso()
  const scritto = await db
    .prepare(
      `INSERT OR IGNORE INTO ruota_giri
         (player_id, puzzle_number, puntata, spicchio, stato, delta, sfida, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      playerId,
      quando.puzzleNumber,
      puntata,
      indice,
      sfida ? 'sfida' : 'fatto',
      deltaDi(s, puntata, false),
      sfida ? JSON.stringify(sfida) : null,
      adesso,
      adesso,
    )
    .run()
  if (scritto.meta.changes !== 1) fail(409, 'GIA_GIRATA', 'La ruota di oggi l’hai già girata.')
}

/** Il giro di oggi con una sfida da giocare, o un errore che dice perché non c'e'. */
async function giroConSfida(db: D1Database, playerId: string): Promise<{ row: GiroRow; sfida: SfidaSalvata }> {
  const row = await giroDi(db, playerId, today().puzzleNumber)
  if (!row) fail(409, 'NESSUN_GIRO', 'La ruota di oggi non l’hai ancora girata.')
  const sfida = leggiSfida(row)
  if (!sfida) fail(409, 'NESSUNA_SFIDA', 'La ruota non si è fermata su una sfida.')
  return { row, sfida }
}

/**
 * Apre la domanda della sfida: una a caso fra quelle della materia di oggi, e
 * il tempo parte adesso. Se e' gia' aperta la ridà com'e', con il tempo che le
 * resta.
 */
export async function apriDomanda(db: D1Database, playerId: string): Promise<void> {
  const { row, sfida } = await giroConSfida(db, playerId)
  if (sfida.tipo !== 'domanda') fail(409, 'NESSUNA_DOMANDA', 'Questa sfida non è una domanda.')
  if (row.stato !== 'sfida') return
  const voce = await db
    .prepare('SELECT domande FROM ruota_domande WHERE puzzle_number = ? AND materia = ?')
    .bind(row.puzzle_number, sfida.materia)
    .first<{ domande: string }>()
  const domande = voce ? (JSON.parse(voce.domande) as DomandaRuota[]) : []
  if (domande.length === 0) fail(503, 'DOMANDE_ASSENTI', 'Le domande di oggi non sono ancora pronte.')
  const scelta = domande[aCaso(domande.length)]
  const adesso = nowIso()
  await db
    .prepare(
      `UPDATE ruota_giri SET stato = 'domanda', sfida = ?, aperta_at = ?, updated_at = ?
        WHERE player_id = ? AND puzzle_number = ? AND stato = 'sfida'`,
    )
    .bind(
      JSON.stringify({ ...sfida, categoria: scelta.categoria, domanda: scelta.domanda }),
      adesso,
      adesso,
      playerId,
      row.puzzle_number,
    )
    .run()
}

/**
 * La risposta alla domanda della sfida. Oltre il tempo e il margine della rete
 * vale come non data, e la sfida e' persa.
 */
export async function rispondi(db: D1Database, playerId: string, scelta: string | null): Promise<void> {
  const { row, sfida } = await giroConSfida(db, playerId)
  if (sfida.tipo !== 'domanda' || row.stato !== 'domanda' || !sfida.domanda || !row.aperta_at) {
    fail(409, 'NESSUNA_DOMANDA', 'Non c’è una domanda aperta.')
  }
  const d = sfida.domanda
  const adesso = Date.now()
  const valida = scaduta(row, d, adesso) ? null : scelta
  const giusta = rispostaGiusta(d, valida)
  const ms = Math.round(Math.min(limiteMs(d), Math.max(0, adesso - Date.parse(row.aperta_at))))
  const esito = await db
    .prepare(
      `UPDATE ruota_giri SET stato = 'fatto', delta = ?, sfida = ?, updated_at = ?
        WHERE player_id = ? AND puzzle_number = ? AND stato = 'domanda'`,
    )
    .bind(
      deltaDi(SPICCHI[row.spicchio], row.puntata, giusta),
      JSON.stringify({ ...sfida, scelta: valida, giusta, ms }),
      new Date(adesso).toISOString(),
      playerId,
      row.puzzle_number,
    )
    .run()
  if (esito.meta.changes !== 1) fail(409, 'CONFLITTO', 'Questa domanda ha già una risposta: ricarico.')
}

/** Testa o croce: la moneta si lancia adesso, sul lato scelto. */
export async function lanciaMoneta(db: D1Database, playerId: string, lato: LatoMoneta): Promise<void> {
  const { row, sfida } = await giroConSfida(db, playerId)
  if (sfida.tipo !== 'moneta') fail(409, 'NESSUNA_MONETA', 'Questa sfida non è testa o croce.')
  if (row.stato !== 'sfida') fail(409, 'CONFLITTO', 'La moneta è già stata lanciata: ricarico.')
  const uscito: LatoMoneta = aCaso(2) === 0 ? 'testa' : 'croce'
  const esito = await db
    .prepare(
      `UPDATE ruota_giri SET stato = 'fatto', delta = ?, sfida = ?, updated_at = ?
        WHERE player_id = ? AND puzzle_number = ? AND stato = 'sfida'`,
    )
    .bind(
      deltaDi(SPICCHI[row.spicchio], row.puntata, uscito === lato),
      JSON.stringify({ tipo: 'moneta', scelto: lato, uscito }),
      nowIso(),
      playerId,
      row.puzzle_number,
    )
    .run()
  if (esito.meta.changes !== 1) fail(409, 'CONFLITTO', 'La moneta è già stata lanciata: ricarico.')
}

/** La ruota nella schermata iniziale: di sola lettura, e i punti di oggi li sa gia' chi chiama. */
export async function riepilogoRuota(db: D1Database, playerId: string, puntiDiOggi: number): Promise<RuotaSummary> {
  const row = await giroDi(db, playerId, today().puzzleNumber)
  return {
    puntiDiOggi,
    stato: !row ? 'da-girare' : row.stato === 'fatto' ? 'fatto' : 'sfida',
    spicchio: row?.spicchio ?? null,
    delta: row?.stato === 'fatto' ? row.delta : null,
  }
}

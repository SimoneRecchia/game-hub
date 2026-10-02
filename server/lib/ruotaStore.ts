/**
 * Crazy Time sul server: quanti giri si vuole, ognuno con la sua puntata, presa
 * dal saldo di oggi — i punti delle classificate piu' quel che i giochi della
 * Fortuna, questo compreso, hanno gia' dato o tolto (server/lib/fortuna.ts).
 *
 * Come al casinò la puntata si paga subito: ogni giro nasce con `delta` uguale
 * alla puntata persa, e solo un minigioco vinto lo cambia nella vincita meno la
 * puntata. Un minigioco lasciato a meta' quindi conta perso, e il giro dopo lo
 * chiude com'e'.
 *
 * Tutto quel che e' a caso lo decide il server, con `crypto.getRandomValues`:
 * lo spicchio della ruota — fra quelli del giorno, con le sue categorie — e il
 * moltiplicatore della moneta quando si gira, il
 * moltiplicatore della domanda quando si gira la sua ruota, il lato della
 * moneta quando la si lancia. Il browser riceve solo dove fermare le ruote, e
 * la moneta. La domanda si apre quando la si chiede, con il suo tempo che parte
 * li', come nel quiz.
 *
 * D1 non ha transazioni interattive: il saldo si controlla dentro l'`INSERT`
 * del giro, sui conti gia' scritti di tutti i giochi della Fortuna, così due
 * puntate partite insieme non vanno oltre quel che c'e'; la chiave (giocatore,
 * giorno, numero) fa il resto.
 * Ogni scrittura riscrive nello stesso batch il conto della giornata
 * (`ruota_giornate`), che e' quel che legge la classifica generale.
 */

import { msToNextPuzzle } from '../../shared/daily'
import type { CategoriaQuiz } from '../../shared/quiz'
import { rispostaGiusta, senzaRisposta, type DomandaCompleta } from '../../shared/quiz-domande'
import {
  DISPOSIZIONE_RUOTA,
  INTERVALLO_GIRI_MS,
  MOLTIPLICATORI,
  MOLTIPLICATORI_MONETA,
  PUNTATA_MINIMA,
  deltaDi,
  puntataValida,
  spicchiDelGiorno,
  vincitaDi,
  type LatoMoneta,
  type Spicchio,
} from '../../shared/ruota'
import type { GiroRuota, RispostaQuiz, RuotaStato, RuotaSummary, SfidaRuotaVista } from '../../shared/types'
import {
  categorieDisponibili,
  domandaNuova,
  domandaScaduta,
  nettoFortunaSql,
  saldoDi,
  type SaldoFortuna,
} from './fortuna'
import { fail, nowIso } from './http'
import { limiteMs } from './quizStore'
import { today } from './wordleStore'

export interface GiroRow {
  player_id: string
  puzzle_number: number
  n: number
  puntata: number
  /** NULL per i giri della ruota di una volta al giorno. */
  spicchio: number | null
  stato: 'sfida' | 'domanda' | 'fatto'
  delta: number
  sfida: string | null
  domanda: string | null
  aperta_at: string | null
  /** La ruota del giro (shared/ruota.ts, DISPOSIZIONE_RUOTA): l'indice di una ruota vecchia e' un altro spicchio. */
  disposizione: number
  created_at: string
  updated_at: string
}

/** Il minigioco come sta nel database: la domanda intera, con la risposta. */
type SfidaSalvata =
  | { tipo: 'moneta'; moltiplicatore: number; uscito?: LatoMoneta }
  | {
      tipo: 'domanda'
      categoria: CategoriaQuiz
      moltiplicatore?: number
      spicchioMoltiplicatore?: number
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

/** Uno spicchio a caso fra quelli che si possono giocare: tutti, tranne le domande di una categoria senza domande. */
export function spicchioACaso(
  spicchi: readonly Spicchio[],
  possibile: (s: Spicchio) => boolean,
  caso: (n: number) => number = aCaso,
): number {
  const buoni = spicchi.flatMap((s, i) => (possibile(s) ? [i] : []))
  return buoni[caso(buoni.length)]
}

/** L'ultimo giro di oggi: e' quello che si vede, e l'unico che puo' avere un minigioco aperto. */
export async function ultimoGiro(db: D1Database, playerId: string, numero: number): Promise<GiroRow | null> {
  return db
    .prepare('SELECT * FROM ruota_giocate WHERE player_id = ? AND puzzle_number = ? ORDER BY n DESC LIMIT 1')
    .bind(playerId, numero)
    .first<GiroRow>()
}

/** Un giro della ruota di adesso: gli altri hanno l'indice di uno spicchio che oggi e' un altro. */
function diQuestaRuota(row: GiroRow | null): row is GiroRow & { spicchio: number } {
  return row !== null && row.spicchio !== null && row.disposizione === DISPOSIZIONE_RUOTA
}

/** Il conto della giornata rifatto dai giri: va nello stesso batch di ogni scrittura, ed e' sempre giusto. */
function riconta(db: D1Database, playerId: string, numero: number): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO ruota_giornate (player_id, puzzle_number, netto, giri)
       SELECT ?1, ?2, COALESCE(SUM(delta), 0), COUNT(*)
         FROM ruota_giocate WHERE player_id = ?1 AND puzzle_number = ?2
       ON CONFLICT (player_id, puzzle_number) DO UPDATE SET netto = excluded.netto, giri = excluded.giri`,
    )
    .bind(playerId, numero)
}

function leggiSfida(row: GiroRow): SfidaSalvata | null {
  if (!row.sfida) return null
  try {
    return JSON.parse(row.sfida) as SfidaSalvata
  } catch {
    return null
  }
}

function scaduta(row: GiroRow, d: DomandaCompleta, adesso: number): boolean {
  return domandaScaduta(row.aperta_at, d, adesso)
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
export function vistaGiro(row: GiroRow & { spicchio: number }, adesso: number): GiroRuota {
  const salvata = leggiSfida(row)
  let sfida: SfidaRuotaVista | null = null
  if (salvata?.tipo === 'moneta') {
    sfida = {
      tipo: 'moneta',
      moltiplicatore: salvata.moltiplicatore,
      vincita: vincitaDi(row.puntata, salvata.moltiplicatore),
      uscito: salvata.uscito ?? null,
    }
  } else if (salvata?.tipo === 'domanda') {
    const d = salvata.domanda
    const aperta = row.stato === 'domanda' && d && row.aperta_at
    const m = salvata.moltiplicatore ?? null
    sfida = {
      tipo: 'domanda',
      categoria: salvata.categoria,
      moltiplicatore: m,
      spicchioMoltiplicatore: salvata.spicchioMoltiplicatore ?? null,
      vincita: m === null ? null : vincitaDi(row.puntata, m),
      domanda: d ? senzaRisposta(d) : null,
      limiteMs: d ? limiteMs(d) : null,
      restanteMs: aperta ? Math.max(0, limiteMs(d) - (adesso - Date.parse(row.aperta_at!))) : null,
      risposta: row.stato === 'fatto' && d ? rispostaVista(d, salvata) : null,
    }
  }
  return { n: row.n, puntata: row.puntata, spicchio: row.spicchio, stato: row.stato, delta: row.delta, sfida }
}

/**
 * Una domanda rimasta aperta oltre il tempo e' una risposta non data: la si
 * chiude alla prima lettura, come nel quiz. Il `delta` era gia' la puntata persa.
 */
async function chiudiScaduta(db: D1Database, row: GiroRow | null, adesso: number): Promise<GiroRow | null> {
  if (!row || row.stato !== 'domanda') return row
  const salvata = leggiSfida(row)
  const d = salvata?.tipo === 'domanda' ? salvata.domanda : undefined
  if (!d || !scaduta(row, d, adesso)) return row
  const chiusa = { ...salvata, scelta: null, giusta: false, ms: limiteMs(d) }
  await db
    .prepare(
      `UPDATE ruota_giocate SET stato = 'fatto', sfida = ?, updated_at = ?
        WHERE player_id = ? AND puzzle_number = ? AND n = ? AND stato = 'domanda'`,
    )
    .bind(JSON.stringify(chiusa), new Date(adesso).toISOString(), row.player_id, row.puzzle_number, row.n)
    .run()
  return ultimoGiro(db, row.player_id, row.puzzle_number)
}

/** Crazy Time di oggi per chi lo guarda: il saldo, il conto della giornata, e l'ultimo giro. */
export async function statoRuota(db: D1Database, playerId: string): Promise<RuotaStato> {
  const quando = today()
  const adesso = Date.now()
  const [fortuna, row] = await Promise.all([
    saldoDi(db, playerId, quando.puzzleNumber),
    ultimoGiro(db, playerId, quando.puzzleNumber).then((r) => chiudiScaduta(db, r, adesso)),
  ])
  return {
    puzzleNumber: quando.puzzleNumber,
    date: quando.date,
    classificate: fortuna.classificate,
    netto: fortuna.netti.ruota,
    giri: fortuna.giocate.ruota,
    saldo: fortuna.saldo,
    // Un giro di una ruota di prima non si mostra: i suoi spicchi non sono questi.
    giro: diQuestaRuota(row) ? vistaGiro(row, adesso) : null,
    msToNextPuzzle: msToNextPuzzle(),
  }
}

/**
 * Un giro. Lo spicchio esce qui, a caso fra quelli del giorno, e la puntata e'
 * gia' pagata: il banco la tiene, il triplo la restituisce per tre subito, un
 * minigioco la puo' restituire moltiplicata. La moneta ha subito il suo
 * moltiplicatore, che si vede prima di lanciarla. Un minigioco dell'ultimo
 * giro lasciato a meta' si chiude: vale gia' perso.
 */
export async function gira(db: D1Database, playerId: string, puntata: unknown): Promise<void> {
  const numero = today().puzzleNumber
  const [ultimo, fortuna] = await Promise.all([ultimoGiro(db, playerId, numero), saldoDi(db, playerId, numero)])
  const { classificate, saldo } = fortuna
  if (saldo < PUNTATA_MINIMA) fail(409, 'POCHI_PUNTI', `Per girare servono almeno ${PUNTATA_MINIMA} punti di oggi.`)
  if (!puntataValida(puntata, saldo)) fail(400, 'PUNTATA', `Si puntano da ${PUNTATA_MINIMA} a ${saldo} punti.`)
  if (ultimo && Date.now() - Date.parse(ultimo.created_at) < INTERVALLO_GIRI_MS) {
    fail(429, 'TROPPO_PRESTO', 'La ruota sta ancora girando.')
  }
  const spicchi = spicchiDelGiorno(numero)
  const categorie = await categorieDisponibili(db, playerId, numero)
  const indice = spicchioACaso(spicchi, (s) => s.tipo !== 'domanda' || categorie.has(s.categoria))
  const s = spicchi[indice]
  const sfida: SfidaSalvata | null =
    s.tipo === 'moneta'
      ? { tipo: 'moneta', moltiplicatore: MOLTIPLICATORI_MONETA[aCaso(MOLTIPLICATORI_MONETA.length)] }
      : s.tipo === 'domanda'
        ? { tipo: 'domanda', categoria: s.categoria }
        : null
  const n = (ultimo?.n ?? 0) + 1
  const adesso = nowIso()
  const scritture: D1PreparedStatement[] = []
  if (ultimo && ultimo.stato !== 'fatto') {
    scritture.push(
      db
        .prepare(
          `UPDATE ruota_giocate SET stato = 'fatto', updated_at = ?
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
        `INSERT OR IGNORE INTO ruota_giocate
           (player_id, puzzle_number, n, puntata, spicchio, stato, delta, sfida, disposizione, created_at, updated_at)
         SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10
          WHERE ?11 + ${nettoFortunaSql('?1', '?2')} >= ?4`,
      )
      .bind(
        playerId,
        numero,
        n,
        puntata,
        indice,
        sfida ? 'sfida' : 'fatto',
        deltaDi(puntata, s.tipo === 'fisso' ? s.moltiplicatore : null),
        sfida ? JSON.stringify(sfida) : null,
        DISPOSIZIONE_RUOTA,
        adesso,
        classificate,
      ),
    riconta(db, playerId, numero),
  )
  const esiti = await db.batch(scritture)
  if (esiti[esiti.length - 2].meta.changes !== 1) {
    fail(409, 'CONFLITTO', 'Un altro giro è partito insieme a questo: ricarico.')
  }
}

/** L'ultimo giro di oggi con un minigioco, o un errore che dice perché non c'e'. */
async function giroConSfida(db: D1Database, playerId: string): Promise<{ row: GiroRow; sfida: SfidaSalvata }> {
  const row = await ultimoGiro(db, playerId, today().puzzleNumber)
  if (!diQuestaRuota(row)) fail(409, 'NESSUN_GIRO', 'Non hai ancora girato la ruota.')
  const sfida = leggiSfida(row)
  if (!sfida) fail(409, 'NESSUNA_SFIDA', 'La ruota non si è fermata su un minigioco.')
  return { row, sfida }
}

/**
 * La ruota dei moltiplicatori della domanda: si gira una volta, prima di
 * aprire la domanda. Lo spicchio esce qui; l'`UPDATE` e' condizionato alla
 * sfida appena letta, così due tocchi insieme non la girano due volte.
 */
export async function giraMoltiplicatore(db: D1Database, playerId: string): Promise<void> {
  const { row, sfida } = await giroConSfida(db, playerId)
  if (sfida.tipo !== 'domanda') fail(409, 'NESSUNA_DOMANDA', 'Questo minigioco non è una domanda.')
  if (row.stato !== 'sfida') fail(409, 'CONFLITTO', 'La domanda è già aperta: ricarico.')
  if (sfida.moltiplicatore !== undefined) return
  const spicchioMoltiplicatore = aCaso(MOLTIPLICATORI.length)
  const nuova = { ...sfida, moltiplicatore: MOLTIPLICATORI[spicchioMoltiplicatore], spicchioMoltiplicatore }
  const esito = await db
    .prepare(
      `UPDATE ruota_giocate SET sfida = ?, updated_at = ?
        WHERE player_id = ? AND puzzle_number = ? AND n = ? AND stato = 'sfida' AND sfida = ?`,
    )
    .bind(JSON.stringify(nuova), nowIso(), playerId, row.puzzle_number, row.n, row.sfida)
    .run()
  if (esito.meta.changes !== 1) fail(409, 'CONFLITTO', 'La ruota dei moltiplicatori è già girata: ricarico.')
}

/**
 * Apre la domanda: una a caso fra quelle della categoria di oggi che il
 * giocatore non ha ancora avuto, e il tempo parte adesso. Prima va girata la ruota dei
 * moltiplicatori; se e' gia' aperta la ridà com'e', con il tempo che le resta.
 */
export async function apriDomanda(db: D1Database, playerId: string): Promise<void> {
  const { row, sfida } = await giroConSfida(db, playerId)
  if (sfida.tipo !== 'domanda') fail(409, 'NESSUNA_DOMANDA', 'Questo minigioco non è una domanda.')
  if (row.stato !== 'sfida') return
  if (sfida.moltiplicatore === undefined) {
    fail(409, 'MOLTIPLICATORE', 'Prima gira la ruota dei moltiplicatori.')
  }
  const scelta = await domandaNuova(db, playerId, row.puzzle_number, sfida.categoria, aCaso)
  const adesso = nowIso()
  await db
    .prepare(
      `UPDATE ruota_giocate SET stato = 'domanda', sfida = ?, domanda = ?, aperta_at = ?, updated_at = ?
        WHERE player_id = ? AND puzzle_number = ? AND n = ? AND stato = 'sfida'`,
    )
    .bind(
      JSON.stringify({ ...sfida, domanda: scelta.domanda }),
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
 * La risposta alla domanda. Giusta, la puntata torna moltiplicata; sbagliata,
 * o oltre il tempo e il margine della rete, vince il banco.
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
  const [esito] = await db.batch([
    db
      .prepare(
        `UPDATE ruota_giocate SET stato = 'fatto', delta = ?, sfida = ?, updated_at = ?
          WHERE player_id = ? AND puzzle_number = ? AND n = ? AND stato = 'domanda'`,
      )
      .bind(
        deltaDi(row.puntata, giusta ? (sfida.moltiplicatore ?? null) : null),
        JSON.stringify({ ...sfida, scelta: valida, giusta, ms }),
        new Date(adesso).toISOString(),
        playerId,
        row.puzzle_number,
        row.n,
      ),
    riconta(db, playerId, row.puzzle_number),
  ])
  if (esito.meta.changes !== 1) fail(409, 'CONFLITTO', 'Questa domanda ha già una risposta: ricarico.')
}

/** La moneta: si lancia adesso. Blu, la puntata torna per il suo moltiplicatore; rosso, vince il banco. */
export async function lanciaMoneta(db: D1Database, playerId: string): Promise<void> {
  const { row, sfida } = await giroConSfida(db, playerId)
  if (sfida.tipo !== 'moneta') fail(409, 'NESSUNA_MONETA', 'Questo minigioco non è la moneta.')
  if (row.stato !== 'sfida') fail(409, 'CONFLITTO', 'La moneta è già stata lanciata: ricarico.')
  const uscito: LatoMoneta = aCaso(2) === 0 ? 'blu' : 'rosso'
  const [esito] = await db.batch([
    db
      .prepare(
        `UPDATE ruota_giocate SET stato = 'fatto', delta = ?, sfida = ?, updated_at = ?
          WHERE player_id = ? AND puzzle_number = ? AND n = ? AND stato = 'sfida'`,
      )
      .bind(
        deltaDi(row.puntata, uscito === 'blu' ? sfida.moltiplicatore : null),
        JSON.stringify({ ...sfida, uscito }),
        nowIso(),
        playerId,
        row.puzzle_number,
        row.n,
      ),
    riconta(db, playerId, row.puzzle_number),
  ])
  if (esito.meta.changes !== 1) fail(409, 'CONFLITTO', 'La moneta è già stata lanciata: ricarico.')
}

/** Crazy Time nella scheda della Fortuna: di sola lettura. Il saldo lo sa gia' chi chiama. */
export async function riepilogoRuota(db: D1Database, playerId: string, fortuna: SaldoFortuna): Promise<RuotaSummary> {
  const row = await ultimoGiro(db, playerId, today().puzzleNumber)
  const nostro = diQuestaRuota(row)
  const aperta = nostro && row.stato !== 'fatto'
  return {
    saldo: fortuna.saldo,
    netto: fortuna.netti.ruota,
    giri: fortuna.giocate.ruota,
    stato: aperta ? 'sfida' : 'gioca',
    spicchio: nostro ? row.spicchio : null,
  }
}

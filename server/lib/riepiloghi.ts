/**
 * I riepiloghi della giornata, uno per gioco: quel che serve alla schermata
 * iniziale e alle pagine dei giochi per dire "da giocare", "a che punto sei",
 * "com'e' andata".
 *
 * Tutti **di sola lettura**, ed e' la loro regola piu' importante: aprire
 * l'app non deve aprire nessuna partita. Una partita aperta per sbaglio fa
 * partire cronometri (il bonus velocità del Wordle), fissa riferimenti (quello
 * del computer dello Scarabeo) e compare in classifica come "in corso".
 *
 * Stanno qui e non nelle rotte perché li usa anche `GET /api/oggi`, che li
 * manda tutti insieme: una richiesta per la schermata iniziale invece di
 * quattro, e il piano gratuito le conta.
 */

import { WORDS_PER_DAY } from '../../shared/config'
import { caselleBianche, caselleScritte, punteggio } from '../../shared/cruciverba'
import { msToNextPuzzle } from '../../shared/daily'
import { MOSSE_PER_GIORNATA } from '../../shared/scarabeo'
import { RIFERIMENTO_SCARABEO } from '../../shared/punti'
import type {
  BattagliaSummary,
  CruciverbaSummary,
  ScarabeoSummary,
  WordleStatus,
  WordleSummary,
} from '../../shared/types'
import { today } from './wordleStore'
import { giornata as giornataScarabeo } from './scarabeoStore'
import { giornata as giornataCruciverba, schemaDelGiorno, svelateDi, type PartitaRow } from './cruciverbaStore'
import { latoDi, partitaAperta, partitaBreve, quantiOnline, recordDi, statoClassificata } from './battagliaStore'

export async function riepilogoWordle(db: D1Database, playerId: string): Promise<WordleSummary> {
  const when = today()
  const { results } = await db
    .prepare(
      `SELECT slot, status, attempts, score, spectated,
              assist_score, assist_status, assist_room_id
         FROM wordle_games
        WHERE player_id = ? AND puzzle_number = ?`,
    )
    .bind(playerId, when.puzzleNumber)
    .all<{
      slot: number
      status: WordleStatus
      attempts: number
      score: number | null
      spectated: number
      assist_score: number | null
      assist_status: WordleStatus | null
      assist_room_id: string | null
    }>()

  const principale = results.find((r) => r.slot === 1)
  /*
   * Per chi gioca la giornata in compagnia la card racconta quella partita,
   * non la propria: la propria e' chiusa e mostrarla "da giocare" manderebbe
   * su una board che rifiuta i tentativi.
   */
  const insieme = principale?.spectated === 1

  const esito = (r: (typeof results)[number]) =>
    r.spectated === 1 ? (r.assist_status ?? 'playing') : r.status
  const punti = (r: (typeof results)[number]) => (r.spectated === 1 ? r.assist_score : r.score)

  // Il punteggio della card e' quello di tutta la giornata: cinque parole.
  const totale = results.reduce((sum, r) => sum + (punti(r) ?? 0), 0)
  const chiuse = results.filter((r) => esito(r) !== 'playing').length

  return {
    puzzleNumber: when.puzzleNumber,
    date: when.date,
    status: principale ? esito(principale) : 'new',
    attempts: insieme ? 0 : (principale?.attempts ?? 0),
    score: results.length === 0 ? null : totale,
    msToNextPuzzle: msToNextPuzzle(),
    roomId: insieme ? (principale?.assist_room_id ?? null) : null,
    done: chiuse,
    words: WORDS_PER_DAY,
  }
}

export async function riepilogoScarabeo(db: D1Database, playerId: string): Promise<ScarabeoSummary> {
  const quando = giornataScarabeo()
  const [row, computer] = await Promise.all([
    db
      .prepare(
        `SELECT status, turns, score, punti FROM scarabeo_games
          WHERE player_id = ? AND puzzle_number = ?`,
      )
      .bind(playerId, quando.puzzleNumber)
      .first<{ status: 'playing' | 'done'; turns: number; score: number; punti: number }>(),
    // Sola lettura anche qui: il riferimento di ripiego lo scrive la partita, non l'hub.
    db
      .prepare('SELECT punti FROM scarabeo_computer WHERE puzzle_number = ?')
      .bind(quando.puzzleNumber)
      .first<{ punti: number }>(),
  ])

  return {
    puzzleNumber: quando.puzzleNumber,
    date: quando.date,
    status: row ? row.status : 'new',
    punti: row?.score ?? 0,
    puntiClassifica: row?.punti ?? 0,
    computer: computer?.punti ?? RIFERIMENTO_SCARABEO,
    mosseUsate: row?.turns ?? 0,
    mosseTotali: MOSSE_PER_GIORNATA,
    msToNextPuzzle: msToNextPuzzle(),
  }
}

export async function riepilogoCruciverba(db: D1Database, playerId: string): Promise<CruciverbaSummary> {
  const quando = giornataCruciverba()
  const schema = await schemaDelGiorno(db, quando.puzzleNumber)
  const row = schema
    ? await db
        .prepare(
          `SELECT status, lettere, score, svelate, errori, tempo_ms FROM cruciverba_games
            WHERE player_id = ? AND puzzle_number = ?`,
        )
        .bind(playerId, quando.puzzleNumber)
        .first<Pick<PartitaRow, 'status' | 'lettere' | 'score' | 'svelate' | 'errori' | 'tempo_ms'>>()
    : null

  return {
    puzzleNumber: quando.puzzleNumber,
    date: quando.date,
    status: !schema ? 'assente' : row ? row.status : 'new',
    scritte: row ? caselleScritte(row.lettere) : 0,
    bianche: schema ? caselleBianche(schema.soluzione) : 0,
    punti: row ? (row.status === 'done' ? row.score : punteggio(svelateDi(row).length, row.errori)) : 100,
    tempoMs: row?.tempo_ms ?? 0,
    msToNextPuzzle: msToNextPuzzle(),
  }
}

export async function riepilogoBattaglia(db: D1Database, playerId: string): Promise<BattagliaSummary> {
  const adesso = Date.now()
  const [online, aperta, classificata, record] = await Promise.all([
    quantiOnline(db, playerId, adesso),
    partitaAperta(db, playerId),
    statoClassificata(db, playerId, today().puzzleNumber, msToNextPuzzle()),
    recordDi(db, playerId),
  ])
  const lato = aperta ? latoDi(aperta, playerId) : null
  return {
    online,
    partita: aperta && lato ? await partitaBreve(db, aperta, lato) : null,
    classificata,
    ...record,
  }
}

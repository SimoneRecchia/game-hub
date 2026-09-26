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
 * manda tutti insieme: una richiesta per la schermata iniziale invece di una
 * per gioco, e il piano gratuito le conta.
 */

import { caselleBianche, caselleScritte, punteggio } from '../../shared/cruciverba'
import { msToNextPuzzle } from '../../shared/daily'
import { MOSSE_PER_GIORNATA } from '../../shared/scarabeo'
import { RIFERIMENTO_SCARABEO } from '../../shared/punti'
import type {
  BattagliaSummary,
  CruciverbaSummary,
  QuizSummary,
  ScarabeoSummary,
  WordleStatus,
  WordleSummary,
} from '../../shared/types'
import { today } from './wordleStore'
import { giornata as giornataScarabeo } from './scarabeoStore'
import { giornata as giornataCruciverba, schemaDelGiorno, svelateDi, type PartitaRow } from './cruciverbaStore'
import { latoDi, partitaAperta, partitaBreve, quantiOnline, recordDi, statoClassificata } from './battagliaStore'
import { giornata as giornataQuiz, giornataQuiz as domandeDelGiorno, partitaDi as partitaQuiz, risposteDi } from './quizStore'
import { puntiQuiz } from '../../shared/quiz'

export async function riepilogoWordle(db: D1Database, playerId: string): Promise<WordleSummary> {
  const when = today()
  const row = await db
    .prepare(
      `SELECT status, attempts, score, spectated, assist_score, assist_status, assist_room_id
         FROM wordle_games
        WHERE player_id = ? AND puzzle_number = ? AND slot = 1`,
    )
    .bind(playerId, when.puzzleNumber)
    .first<{
      status: WordleStatus
      attempts: number
      score: number | null
      spectated: number
      assist_score: number | null
      assist_status: WordleStatus | null
      assist_room_id: string | null
    }>()

  /*
   * Per chi gioca la giornata in compagnia la card racconta quella partita,
   * non la propria: la propria e' chiusa e mostrarla "da giocare" manderebbe
   * su una board che rifiuta i tentativi.
   */
  const insieme = row?.spectated === 1
  return {
    puzzleNumber: when.puzzleNumber,
    date: when.date,
    status: !row ? 'new' : insieme ? (row.assist_status ?? 'playing') : row.status,
    attempts: insieme ? 0 : (row?.attempts ?? 0),
    score: !row ? null : insieme ? row.assist_score : row.score,
    msToNextPuzzle: msToNextPuzzle(),
    roomId: insieme ? (row?.assist_room_id ?? null) : null,
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

/**
 * Il quiz di oggi: la categoria, e a che punto si e'. Non apre niente e non
 * chiude le domande scadute: e' di sola lettura, e una domanda lasciata aperta
 * la chiude la pagina del quiz quando la si riapre.
 */
export async function riepilogoQuiz(db: D1Database, playerId: string): Promise<QuizSummary> {
  const quando = giornataQuiz()
  const [g, row] = await Promise.all([
    domandeDelGiorno(db, quando.puzzleNumber),
    partitaQuiz(db, playerId, quando.puzzleNumber),
  ])
  const totale = g?.domande.length ?? 0
  const giuste = row?.giuste ?? 0
  return {
    puzzleNumber: quando.puzzleNumber,
    date: quando.date,
    status: !g ? 'assente' : !row ? 'nuova' : row.status,
    categoria: g?.categoria ?? null,
    fatte: risposteDi(row).length,
    giuste,
    totale,
    punti: row?.status === 'done' ? row.score : puntiQuiz(giuste, totale),
    msToNextPuzzle: msToNextPuzzle(),
  }
}

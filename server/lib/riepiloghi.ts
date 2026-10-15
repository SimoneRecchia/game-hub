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

import { PUNTI_COMPLETO, caselleBianche, caselleScritte, costiCruciverba, punteggio } from '../../shared/cruciverba'
import { msToNextPuzzle } from '../../shared/daily'
import { MOSSE_PER_GIORNATA } from '../../shared/scarabeo'
import { FORMATO_TRAGUARDO } from '../../shared/scarabeo-computer'
import { RIFERIMENTO_SCARABEO } from '../../shared/punti'
import { PUNTI_COMPLETO as PUNTI_SUDOKU, VUOTA, costiSudoku, puntiSudoku } from '../../shared/sudoku'
import type {
  AnagrammiSummary,
  CatenaSummary,
  GhigliottinaSummary,
  ParoliereSummary,
  CruciverbaSummary,
  NomiSummary,
  QuizSummary,
  ScarabeoSummary,
  SudokuSummary,
  WordleStatus,
  WordleSummary,
} from '../../shared/types'
import { today } from './wordleStore'
import { giornata as giornataScarabeo } from './scarabeoStore'
import { compagniaBreve } from './compagniaStore'
import { aiutiDi, giornata as giornataCruciverba, schemaDelGiorno, type PartitaRow } from './cruciverbaStore'
import { giornata as giornataQuiz, giornataQuiz as domandeDelGiorno, partitaDi as partitaQuiz, risposteDi } from './quizStore'
import { puntiQuiz } from '../../shared/quiz'
import { CATEGORIE_PER_PARTITA } from '../../shared/nomi-cose'
import {
  giornata as giornataSudoku,
  partitaDi as partitaSudoku,
  schemaDelGiorno as schemaSudoku,
} from './sudokuStore'
import { giornata as giornataNomi, partitaDi as partitaNomi, risposteDi as risposteNomi, scaduta } from './nomiStore'
import {
  giornata as giornataAnagrammi,
  paroleDelGiorno as paroleAnagrammi,
  paroleDi as paroleGiocate,
  partitaDi as partitaAnagrammi,
} from './anagrammiStore'
import { PAROLE_ANAGRAMMI } from '../../shared/anagrammi'
import {
  ghigliottinaDelGiorno,
  giornata as giornataGhigliottina,
  partitaDi as partitaGhigliottina,
  scaduta as finaleScaduto,
  scelteDi,
} from './ghigliottinaStore'
import { COPPIE_GHIGLIOTTINA, montepremi } from '../../shared/ghigliottina'
import {
  giornata as giornataParoliere,
  paroliereDelGiorno,
  partitaDi as partitaParoliere,
  scaduta as tempoFinito,
} from './paroliereStore'
import { puntiParoliere } from '../../shared/paroliere'
import {
  catenaDelGiornoDa,
  giornata as giornataCatena,
  mosseDi as mosseCatena,
  partitaDi as partitaCatena,
  scaduta as minutoFinito,
} from './catenaStore'
import { DA_INDOVINARE_CATENA, MONTEPREMI_CATENA, svolgiCatena } from '../../shared/catena'

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
        `SELECT status, turns, score, punti, in_compagnia, assist_score, contro_computer, punti_computer
           FROM scarabeo_games
          WHERE player_id = ? AND puzzle_number = ?`,
      )
      .bind(playerId, quando.puzzleNumber)
      .first<{
        status: 'playing' | 'done'
        turns: number
        score: number
        punti: number
        in_compagnia: string | null
        assist_score: number | null
        contro_computer: number
        punti_computer: number
      }>(),
    // Sola lettura anche qui: il riferimento di ripiego lo scrive la partita, non l'hub.
    db
      .prepare('SELECT punti, formato FROM scarabeo_computer WHERE puzzle_number = ?')
      .bind(quando.puzzleNumber)
      .first<{ punti: number; formato: number }>(),
  ])
  // La giornata si gioca come il suo traguardo: a turni, se non e' uno di prima (come in `apriPartita`).
  const aTurni = row ? row.contro_computer === 1 : (computer?.formato ?? FORMATO_TRAGUARDO) >= FORMATO_TRAGUARDO

  // In compagnia la giornata e' quella dell'host: i suoi punti, man mano che li fa.
  const insieme = row?.in_compagnia ? await compagniaBreve(db, row.in_compagnia, row.assist_score) : null
  return {
    puzzleNumber: quando.puzzleNumber,
    date: quando.date,
    status: row ? row.status : 'new',
    punti: insieme ? 0 : (row?.score ?? 0),
    puntiClassifica: insieme ? (row?.assist_score ?? 0) : (row?.punti ?? 0),
    computer: computer?.punti ?? RIFERIMENTO_SCARABEO,
    avversario: aTurni && !insieme ? (row?.punti_computer ?? 0) : null,
    mosseUsate: insieme ? 0 : (row?.turns ?? 0),
    mosseTotali: MOSSE_PER_GIORNATA,
    msToNextPuzzle: msToNextPuzzle(),
    inCompagnia: insieme,
  }
}

export async function riepilogoCruciverba(db: D1Database, playerId: string): Promise<CruciverbaSummary> {
  const quando = giornataCruciverba()
  const schema = await schemaDelGiorno(db, quando.puzzleNumber)
  const row = schema
    ? await db
        .prepare(
          `SELECT status, lettere, score, svelate, errori, controlli, controlli_schema, tempo_ms, in_compagnia,
                  assist_score
             FROM cruciverba_games
            WHERE player_id = ? AND puzzle_number = ?`,
        )
        .bind(playerId, quando.puzzleNumber)
        .first<
          Pick<
            PartitaRow,
            | 'status'
            | 'lettere'
            | 'score'
            | 'svelate'
            | 'errori'
            | 'controlli'
            | 'controlli_schema'
            | 'tempo_ms'
            | 'in_compagnia'
            | 'assist_score'
          >
        >()
    : null

  // In compagnia la giornata e' quella dell'host: i punti arrivano quando la completa.
  if (row?.in_compagnia) {
    return {
      puzzleNumber: quando.puzzleNumber,
      date: quando.date,
      status: row.status,
      scritte: 0,
      bianche: schema ? caselleBianche(schema.soluzione) : 0,
      punti: row.assist_score ?? 0,
      tempoMs: 0,
      msToNextPuzzle: msToNextPuzzle(),
      inCompagnia: await compagniaBreve(db, row.in_compagnia, row.assist_score),
    }
  }

  return {
    puzzleNumber: quando.puzzleNumber,
    date: quando.date,
    status: !schema ? 'assente' : row ? row.status : 'new',
    scritte: row ? caselleScritte(row.lettere) : 0,
    bianche: schema ? caselleBianche(schema.soluzione) : 0,
    punti:
      schema && row
        ? row.status === 'done'
          ? row.score
          : punteggio(aiutiDi(row), costiCruciverba(schema.soluzione))
        : PUNTI_COMPLETO,
    tempoMs: row?.tempo_ms ?? 0,
    msToNextPuzzle: msToNextPuzzle(),
  }
}

/** Il sudoku di oggi: il livello, quante caselle sono scritte, i punti. Non apre la partita. */
export async function riepilogoSudoku(db: D1Database, playerId: string): Promise<SudokuSummary> {
  const quando = giornataSudoku()
  const schema = await schemaSudoku(db, quando.puzzleNumber)
  const row = schema ? await partitaSudoku(db, playerId, quando.puzzleNumber) : null
  const vuote = schema ? [...schema.dati].filter((d) => d === VUOTA).length : 0
  const scritte = schema && row ? [...row.cifre].filter((d, k) => d !== VUOTA && schema.dati[k] === VUOTA).length : 0
  return {
    puzzleNumber: quando.puzzleNumber,
    date: quando.date,
    status: !schema ? 'assente' : row ? row.status : 'new',
    livello: schema?.livello ?? null,
    vuote,
    scritte,
    punti: !schema || !row
      ? PUNTI_SUDOKU
      : row.status === 'done'
        ? row.score
        : puntiSudoku(aiutiDi(row), costiSudoku(schema.dati), row.tempo_ms),
    tempoMs: row?.tempo_ms ?? 0,
    msToNextPuzzle: msToNextPuzzle(),
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
    modo: g?.modo ?? null,
    fatte: risposteDi(row).length,
    giuste,
    totale,
    punti: row?.status === 'done' ? row.score : puntiQuiz(giuste, totale),
    msToNextPuzzle: msToNextPuzzle(),
  }
}

/**
 * Nomi, cose e città: a che punto e' la partita di oggi, e i punti di ieri,
 * contati stanotte, che valgono oggi. Non chiude le partite scadute, ma le
 * dice finite: il tempo e' passato, e la pagina le chiudera' quando la si
 * riapre.
 */
export async function riepilogoNomi(db: D1Database, playerId: string): Promise<NomiSummary> {
  const quando = giornataNomi()
  const [row, ieri] = await Promise.all([
    partitaNomi(db, playerId, quando.puzzleNumber),
    db
      .prepare('SELECT score FROM nomi_partite WHERE player_id = ? AND puzzle_number = ? AND score IS NOT NULL')
      .bind(playerId, quando.puzzleNumber - 1)
      .first<{ score: number }>(),
  ])
  return {
    puzzleNumber: quando.puzzleNumber,
    date: quando.date,
    status: !row ? 'nuova' : scaduta(row, Date.now()) ? 'done' : row.status,
    scritte: row ? Object.keys(risposteNomi(row)).length : 0,
    valide: row?.status === 'done' ? row.valide : null,
    totale: CATEGORIE_PER_PARTITA,
    ieri: ieri?.score ?? null,
    msToNextPuzzle: msToNextPuzzle(),
  }
}

/**
 * Gli Anagrammi: a che punto e' la giornata, e se le parole di oggi ci sono.
 * Non chiude una parola scaduta: la chiudera' la pagina, quando la si riapre.
 */
export async function riepilogoAnagrammi(db: D1Database, playerId: string): Promise<AnagrammiSummary> {
  const quando = giornataAnagrammi()
  const [row, giorno] = await Promise.all([
    partitaAnagrammi(db, playerId, quando.puzzleNumber),
    paroleAnagrammi(db, quando.puzzleNumber),
  ])
  const parole = row ? paroleGiocate(row) : []
  return {
    puzzleNumber: quando.puzzleNumber,
    date: quando.date,
    status: row ? row.status : 'new',
    pronta: giorno !== null,
    trovate: parole.filter((p) => p.e === 'trovata').length,
    giocate: parole.filter((p) => p.e !== null).length,
    totale: PAROLE_ANAGRAMMI,
    punti: row?.status === 'done' ? row.score : 0,
    msToNextPuzzle: msToNextPuzzle(),
  }
}

/**
 * La Ghigliottina: quante coppie sono scelte, il montepremi e com'e' finita.
 * Non chiude un minuto finito: lo dice finito, senza punti, come lo chiudera'
 * la pagina.
 */
export async function riepilogoGhigliottina(db: D1Database, playerId: string): Promise<GhigliottinaSummary> {
  const quando = giornataGhigliottina()
  const [row, giorno] = await Promise.all([
    partitaGhigliottina(db, playerId, quando.puzzleNumber),
    ghigliottinaDelGiorno(db, quando.puzzleNumber),
  ])
  const scaduto = row ? finaleScaduto(row, Date.now()) : false
  const finita = row?.status === 'done' || scaduto
  return {
    puzzleNumber: quando.puzzleNumber,
    date: quando.date,
    status: row ? (finita ? 'done' : 'playing') : 'new',
    pronta: giorno !== null,
    scelte: row ? scelteDi(row).length : 0,
    totale: COPPIE_GHIGLIOTTINA,
    montepremi: montepremi(row?.sbagliate ?? 0),
    indovinata: finita ? row?.indovinata === 1 : null,
    punti: row?.status === 'done' ? row.score : 0,
    msToNextPuzzle: msToNextPuzzle(),
  }
}

/**
 * Il Paroliere: le parole trovate e i punti. Una partita il cui tempo e'
 * finito si dice finita, con i punti che avra': li scrivera' la pagina.
 */
export async function riepilogoParoliere(db: D1Database, playerId: string): Promise<ParoliereSummary> {
  const quando = giornataParoliere()
  const [row, giorno] = await Promise.all([
    partitaParoliere(db, playerId, quando.puzzleNumber),
    paroliereDelGiorno(db, quando.puzzleNumber),
  ])
  const finita = row?.status === 'done' || (row ? tempoFinito(row, Date.now()) : false)
  const traguardo = giorno?.traguardo ?? 0
  return {
    puzzleNumber: quando.puzzleNumber,
    date: quando.date,
    status: row ? (finita ? 'done' : 'playing') : 'new',
    pronta: giorno !== null,
    trovate: row?.trovate ?? 0,
    punteggio: row?.punteggio ?? 0,
    traguardo,
    punti: row?.status === 'done' ? row.score : finita && row ? puntiParoliere(row.punteggio, traguardo) : 0,
    msToNextPuzzle: msToNextPuzzle(),
  }
}

/**
 * La Catena: a che parola si e', il montepremi e com'e' finita. Come la
 * Ghigliottina, non chiude un minuto finito: lo dice finito, senza punti.
 */
export async function riepilogoCatena(db: D1Database, playerId: string): Promise<CatenaSummary> {
  const quando = giornataCatena()
  const [row, catena] = await Promise.all([
    partitaCatena(db, playerId, quando.puzzleNumber),
    catenaDelGiornoDa(db, quando.puzzleNumber),
  ])
  const scaduto = row ? minutoFinito(row, Date.now()) : false
  const finita = row?.status === 'done' || scaduto
  const svolta = row && catena ? svolgiCatena(catena, mosseCatena(row)) : null
  return {
    puzzleNumber: quando.puzzleNumber,
    date: quando.date,
    status: row ? (finita ? 'done' : 'playing') : 'new',
    pronta: catena !== null,
    passo: row?.status === 'done' ? DA_INDOVINARE_CATENA : (svolta?.passo ?? 0),
    totale: DA_INDOVINARE_CATENA,
    montepremi: svolta?.montepremi ?? MONTEPREMI_CATENA,
    indovinata: finita ? row?.indovinata === 1 : null,
    punti: row?.status === 'done' ? row.score : 0,
    msToNextPuzzle: msToNextPuzzle(),
  }
}

/**
 * Accesso ai dati del quiz: le domande del giorno, la partita, la classifica,
 * il riassunto per le libere.
 *
 * Le domande le scrive lo script della notte (scripts/genera-quiz.ts): qui si
 * leggono e basta. La partita salva le risposte in ordine; la domanda aperta ha
 * il suo orologio, `aperta_at`, e la risposta vale solo se arriva in tempo. Le
 * risposte giuste non escono dal server prima che si sia risposto, come la
 * parola del Wordle.
 */

import { gameDate, puzzleNumberFor } from '../../shared/daily'
import { MARGINE_RETE_MS, SECONDI_CARTINA, SECONDI_SCELTA, puntiQuiz, type CategoriaQuiz, type ModoQuiz } from '../../shared/quiz'
import { PARTE_REGIONI, PREFISSO_CITTA, PREFISSO_GEOMETRIE, SEZIONI_DATI } from '../../shared/quiz-dati'
import { rispostaGiusta, senzaRisposta, type DomandaCompleta } from '../../shared/quiz-domande'
import type {
  LeaderboardScope,
  QuizLeaderboard,
  QuizRow,
  QuizState,
  RispostaQuiz,
} from '../../shared/types'
import { fail, newId, nowIso } from './http'

export interface Giornata {
  date: string
  puzzleNumber: number
}

export function giornata(): Giornata {
  const date = gameDate()
  return { date, puzzleNumber: puzzleNumberFor(date) }
}

export interface GiornataQuiz {
  puzzleNumber: number
  categoria: CategoriaQuiz
  /** Sulla cartina, se le domande si rispondono toccandola: lo dicono loro. */
  modo: ModoQuiz
  domande: DomandaCompleta[]
}

/** Una risposta come sta in D1: chiavi corte, dieci per partita. */
interface RispostaSalvata {
  s: string | null
  g: 0 | 1
  ms: number
}

export interface PartitaRow {
  id: string
  player_id: string
  puzzle_number: number
  date: string
  status: 'playing' | 'done'
  risposte: string
  aperta_at: string | null
  giuste: number
  tempo_ms: number
  score: number
  started_at: string
  updated_at: string
  finished_at: string | null
}

export async function giornataQuiz(db: D1Database, numero: number): Promise<GiornataQuiz | null> {
  const row = await db
    .prepare('SELECT puzzle_number, categoria, domande FROM quiz_giornate WHERE puzzle_number = ?')
    .bind(numero)
    .first<{ puzzle_number: number; categoria: CategoriaQuiz; domande: string }>()
  if (!row) return null
  const domande = JSON.parse(row.domande) as DomandaCompleta[]
  return {
    puzzleNumber: row.puzzle_number,
    categoria: row.categoria,
    modo: domande[0]?.cartina ? 'cartina' : 'scelta',
    domande,
  }
}

/**
 * Le domande di oggi, o un 503 che lo dice. Non dovrebbero mancare mai — lo
 * script della notte ne tiene pronte per due mesi — ma se mancassero la
 * risposta giusta e' "non ancora pronto", non un errore generico.
 */
export async function giornataObbligatoria(db: D1Database, numero: number): Promise<GiornataQuiz> {
  const g = await giornataQuiz(db, numero)
  if (!g) fail(503, 'QUIZ_ASSENTE', 'Il quiz di oggi non è ancora pronto. Riprova più tardi.')
  return g
}

export async function partitaDi(db: D1Database, playerId: string, numero: number): Promise<PartitaRow | null> {
  return db
    .prepare('SELECT * FROM quiz_partite WHERE player_id = ? AND puzzle_number = ?')
    .bind(playerId, numero)
    .first<PartitaRow>()
}

export function risposteDi(row: Pick<PartitaRow, 'risposte'> | null): RispostaSalvata[] {
  if (!row) return []
  try {
    const valore = JSON.parse(row.risposte) as unknown
    return Array.isArray(valore) ? (valore as RispostaSalvata[]) : []
  } catch {
    return []
  }
}

/** Il tempo di una domanda: quindici secondi per scegliere, trenta per trovare un posto sulla cartina. */
export function limiteMs(d: DomandaCompleta): number {
  return (d.cartina ? SECONDI_CARTINA : SECONDI_SCELTA) * 1000
}

/** Se la domanda aperta ha finito il tempo, margine della rete compreso. */
export function scaduta(row: Pick<PartitaRow, 'aperta_at'>, d: DomandaCompleta, adesso: number): boolean {
  return row.aperta_at !== null && adesso > Date.parse(row.aperta_at) + limiteMs(d) + MARGINE_RETE_MS
}

/**
 * Una risposta data, con quel che serve alla cartina che insegna: dove guardare
 * e, sulla cartina, i posti che valevano. Prima di rispondere non esce niente.
 */
function rispostaVista(d: DomandaCompleta, salvata: RispostaSalvata): RispostaQuiz {
  return {
    scelta: salvata.s,
    giusta: salvata.g === 1,
    corretta: d.giusta,
    risposta: d.risposta,
    ms: salvata.ms,
    ...(d.luogo ? { luogo: d.luogo } : {}),
    ...(d.cartina && d.accettate ? { accettate: d.accettate } : {}),
  }
}

/** Lo stato che va al client: le domande fatte con le risposte, quella aperta senza. */
export function statoDa(
  row: PartitaRow | null,
  g: GiornataQuiz,
  quando: Giornata,
  adesso: number,
  msToNextPuzzle: number,
): QuizState {
  const risposte = risposteDi(row)
  const totale = g.domande.length
  const indice = risposte.length
  const corrente = g.domande[indice]
  const aperta =
    row && row.status === 'playing' && row.aperta_at && corrente
      ? {
          indice,
          domanda: senzaRisposta(corrente),
          limiteMs: limiteMs(corrente),
          restanteMs: Math.max(0, limiteMs(corrente) - (adesso - Date.parse(row.aperta_at))),
        }
      : null
  const giuste = row?.giuste ?? 0
  return {
    puzzleNumber: g.puzzleNumber,
    date: quando.date,
    categoria: g.categoria,
    modo: g.modo,
    totale,
    status: !row ? 'nuova' : row.status,
    fatte: risposte.map((r, i) => ({ domanda: senzaRisposta(g.domande[i]), risposta: rispostaVista(g.domande[i], r) })),
    aperta,
    giuste,
    punti: row?.status === 'done' ? row.score : puntiQuiz(giuste, totale),
    tempoMs: row?.tempo_ms ?? 0,
    msToNextPuzzle,
  }
}

/**
 * Apre la domanda corrente: crea la partita alla prima, e fa partire il tempo
 * se non corre gia'. Chiedere di nuovo la stessa domanda non riavvia niente —
 * una ricarica della pagina non regala secondi.
 */
export async function apriDomanda(db: D1Database, playerId: string, quando: Giornata, g: GiornataQuiz): Promise<PartitaRow> {
  const adesso = nowIso()
  await db
    .prepare(
      `INSERT OR IGNORE INTO quiz_partite (id, player_id, puzzle_number, date, status, started_at, updated_at)
       VALUES (?, ?, ?, ?, 'playing', ?, ?)`,
    )
    .bind(newId('qz'), playerId, quando.puzzleNumber, quando.date, adesso, adesso)
    .run()
  await db
    .prepare(
      `UPDATE quiz_partite SET aperta_at = ?, updated_at = ?
        WHERE player_id = ? AND puzzle_number = ? AND status = 'playing' AND aperta_at IS NULL
          AND json_array_length(risposte) < ?`,
    )
    .bind(adesso, adesso, playerId, quando.puzzleNumber, g.domande.length)
    .run()
  const row = await partitaDi(db, playerId, quando.puzzleNumber)
  if (!row) throw new Error('Partita del quiz non trovata subito dopo la creazione')
  return row
}

/**
 * Registra la risposta alla domanda aperta.
 *
 * `scelta` null e' il tempo finito, e lo e' anche una risposta arrivata oltre
 * il tempo e il margine della rete: conta come non data. La scrittura e'
 * condizionata al numero di risposte letto — D1 non ha transazioni interattive,
 * e due tocchi ravvicinati non devono contare due volte — e chiude la domanda:
 * la prossima si apre quando il telefono la chiede.
 */
export async function registraRisposta(
  db: D1Database,
  row: PartitaRow,
  g: GiornataQuiz,
  scelta: string | null,
  adesso: number,
): Promise<{ row: PartitaRow; risposta: RispostaQuiz }> {
  const risposte = risposteDi(row)
  const d = g.domande[risposte.length]
  if (!d || row.aperta_at === null) fail(409, 'NESSUNA_DOMANDA', 'Non c’è una domanda aperta.')
  const limite = limiteMs(d)
  const fuoriTempo = scaduta(row, d, adesso)
  const valida = fuoriTempo ? null : scelta
  const giusta = rispostaGiusta(d, valida)
  const ms = Math.round(Math.min(limite, Math.max(0, adesso - Date.parse(row.aperta_at))))
  const salvata: RispostaSalvata = { s: valida, g: giusta ? 1 : 0, ms }
  const dopo = [...risposte, salvata]
  const finita = dopo.length >= g.domande.length
  const giuste = row.giuste + (giusta ? 1 : 0)
  const score = finita ? puntiQuiz(giuste, g.domande.length) : 0
  const ora = new Date(adesso).toISOString()

  const esito = await db
    .prepare(
      `UPDATE quiz_partite
          SET risposte = ?, aperta_at = NULL, giuste = ?, tempo_ms = tempo_ms + ?, score = ?, status = ?,
              updated_at = ?, finished_at = COALESCE(finished_at, ?)
        WHERE id = ? AND status = 'playing' AND json_array_length(risposte) = ?`,
    )
    .bind(
      JSON.stringify(dopo),
      giuste,
      ms,
      score,
      finita ? 'done' : 'playing',
      ora,
      finita ? ora : null,
      row.id,
      risposte.length,
    )
    .run()
  if (esito.meta.changes !== 1) fail(409, 'CONFLITTO', 'Questa domanda ha già una risposta: ricarico.')

  return {
    row: {
      ...row,
      risposte: JSON.stringify(dopo),
      aperta_at: null,
      giuste,
      tempo_ms: row.tempo_ms + ms,
      score,
      status: finita ? 'done' : 'playing',
      updated_at: ora,
      finished_at: row.finished_at ?? (finita ? ora : null),
    },
    risposta: rispostaVista(d, salvata),
  }
}

/**
 * Una domanda lasciata aperta oltre il tempo — il telefono in tasca, una
 * chiamata — si chiude come non risposta alla prima occasione. La prossima non
 * si apre da sola: parte quando si torna a giocare.
 */
export async function chiudiScaduta(db: D1Database, row: PartitaRow | null, g: GiornataQuiz, adesso: number): Promise<PartitaRow | null> {
  if (!row || row.status !== 'playing') return row
  const d = g.domande[risposteDi(row).length]
  if (!d || !scaduta(row, d, adesso)) return row
  try {
    return (await registraRisposta(db, row, g, null, adesso)).row
  } catch {
    // Un'altra richiesta l'ha chiusa nel frattempo: vale la sua.
    return partitaDi(db, row.player_id, row.puzzle_number)
  }
}

/* ────────────────────────────  La classifica  ─────────────────────────── */

const FINESTRA: Record<LeaderboardScope, number | null> = { today: 1, week: 7, month: 30, all: null }

export interface TotaliQuiz {
  playerId: string
  nickname: string
  displayName: string
  avatarColor: string
  punti: number
  giornate: number
  giuste: number
  tempoMs: number
  inCorso: boolean
}

/**
 * Mette in fila i giocatori del quiz: **punti**, poi il **tempo** piu' corto —
 * a pari risposte giuste passa avanti chi ha risposto prima — e chi ha solo una
 * partita aperta in fondo. Infine il nickname, perché due righe identiche non
 * si scambino di posto.
 */
export function ordinaQuiz(giocatori: TotaliQuiz[]): QuizRow[] {
  return [...giocatori]
    .sort((a, b) => {
      if (a.punti !== b.punti) return b.punti - a.punti
      if ((a.giornate > 0) !== (b.giornate > 0)) return a.giornate > 0 ? -1 : 1
      if (a.tempoMs !== b.tempoMs) return a.tempoMs - b.tempoMs
      return a.nickname.localeCompare(b.nickname, 'it', { sensitivity: 'base' })
    })
    .map((g, i) => ({ rank: i + 1, ...g }))
}

export async function classificaQuiz(
  db: D1Database,
  scope: LeaderboardScope,
  numeroDiOggi: number,
  viewerId: string,
): Promise<QuizLeaderboard> {
  const finestra = FINESTRA[scope]
  const da = finestra === null ? Number.MIN_SAFE_INTEGER : numeroDiOggi - finestra + 1
  const { results } = await db
    .prepare(
      `SELECT p.id AS player_id, p.nickname, p.display_name, p.avatar_color,
              COALESCE(SUM(CASE WHEN g.status = 'done' THEN g.score END), 0)    AS punti,
              SUM(CASE WHEN g.status = 'done' THEN 1 ELSE 0 END)               AS giornate,
              COALESCE(SUM(CASE WHEN g.status = 'done' THEN g.giuste END), 0)   AS giuste,
              COALESCE(SUM(CASE WHEN g.status = 'done' THEN g.tempo_ms END), 0) AS tempo,
              MAX(CASE WHEN g.puzzle_number = ? AND g.status = 'playing' THEN 1 ELSE 0 END) AS in_corso
         FROM players p
         JOIN quiz_partite g ON g.player_id = p.id AND g.puzzle_number >= ?
        GROUP BY p.id
       HAVING giornate > 0 OR in_corso = 1`,
    )
    .bind(numeroDiOggi, da)
    .all<{
      player_id: string
      nickname: string
      display_name: string
      avatar_color: string
      punti: number
      giornate: number
      giuste: number
      tempo: number
      in_corso: number
    }>()
  const rows = ordinaQuiz(
    results.map((r) => ({
      playerId: r.player_id,
      nickname: r.nickname,
      displayName: r.display_name || r.nickname,
      avatarColor: r.avatar_color,
      punti: r.punti,
      giornate: r.giornate,
      giuste: r.giuste,
      tempoMs: r.tempo,
      inCorso: r.in_corso === 1,
    })),
  )
  return { scope, updatedAt: nowIso(), rows, me: rows.find((r) => r.playerId === viewerId) ?? null }
}

/* ─────────────────────────  Il riassunto dei dati  ────────────────────── */

/**
 * Il riassunto per le libere, senza leggerlo: le sezioni sono gia' JSON, e si
 * incollano. Rileggerle e riscriverle costerebbe CPU per niente — sono cento
 * kB — e i dieci millisecondi di una richiesta non sono tanti. Delle geometrie
 * serve solo la versione: il browser le chiede a parte, se gli servono.
 */
export async function riassuntoDati(db: D1Database): Promise<{ versione: string; json: string } | null> {
  const { results } = await db
    .prepare(
      `SELECT parte, versione,
              CASE WHEN parte LIKE '${PREFISSO_GEOMETRIE}%' OR parte LIKE '${PREFISSO_CITTA}%' THEN '' ELSE dati END AS dati
         FROM quiz_dati`,
    )
    .all<{ parte: string; versione: string; dati: string }>()
  const perParte = new Map(results.map((r) => [r.parte, r]))
  if (SEZIONI_DATI.some((s) => !perParte.has(s))) return null
  const versione = perParte.get('paesi')!.versione
  const corpo = SEZIONI_DATI.map((s) => `"${s}":${perParte.get(s)!.dati}`).join(',')
  // Le versioni delle parti che si chiedono a parte: il browser le chiede solo se gli servono.
  const aParte = (['geo', 'citta'] as const)
    .map((chiave) => {
      const prefisso = chiave === 'geo' ? PREFISSO_GEOMETRIE : PREFISSO_CITTA
      const v = results.find((r) => r.parte.startsWith(prefisso))?.versione
      return v ? `,"${chiave}":${JSON.stringify(v)}` : ''
    })
    .join('')
  return { versione, json: `{"versione":${JSON.stringify(versione)},${corpo}${aParte}}` }
}

interface Pezzo {
  parte: string
  versione: string
  dati: string
}

/** Le righe a pezzi di un prefisso, in ordine. */
async function aPezzi(db: D1Database, prefisso: string): Promise<Pezzo[]> {
  const { results } = await db
    .prepare('SELECT parte, versione, dati FROM quiz_dati WHERE parte LIKE ? ORDER BY parte')
    .bind(`${prefisso}%`)
    .all<Pezzo>()
  return results
}

/** Piu' oggetti JSON in uno solo, senza leggerli: togliere le graffe e mettere una virgola. */
function unisci(pezzi: readonly Pezzo[], vale: (parte: string) => boolean): string {
  const corpi = pezzi.filter((p) => vale(p.parte)).map((p) => p.dati.slice(1, -1))
  return `{${corpi.filter(Boolean).join(',')}}`
}

/** Le città, come le geometrie: un oggetto dall'identificativo alla città scritta in breve. */
export async function cittaDati(db: D1Database): Promise<{ versione: string; json: string } | null> {
  const pezzi = await aPezzi(db, PREFISSO_CITTA)
  if (pezzi.length === 0) return null
  const versione = pezzi[0].versione
  const regioni = unisci(pezzi, (p) => p === PARTE_REGIONI)
  const citta = unisci(pezzi, (p) => p !== PARTE_REGIONI)
  return { versione, json: `{"versione":${JSON.stringify(versione)},"regioni":${regioni},"citta":${citta}}` }
}

/**
 * Le linee dei fiumi e le forme dei laghi, incollate dai loro pezzi: ogni riga
 * e' un oggetto JSON, e l'unione di due oggetti e' togliere le graffe e mettere
 * una virgola. Niente da leggere, come per il riassunto.
 */
export async function geometrieDati(db: D1Database): Promise<{ versione: string; json: string } | null> {
  const pezzi = await aPezzi(db, PREFISSO_GEOMETRIE)
  if (pezzi.length === 0) return null
  const versione = pezzi[0].versione
  const fiumi = unisci(pezzi, (p) => p.startsWith(`${PREFISSO_GEOMETRIE}fiumi:`))
  const laghi = unisci(pezzi, (p) => p.startsWith(`${PREFISSO_GEOMETRIE}laghi:`))
  return { versione, json: `{"versione":${JSON.stringify(versione)},"fiumi":${fiumi},"laghi":${laghi}}` }
}

export async function versioneDati(db: D1Database): Promise<string | null> {
  const row = await db.prepare("SELECT versione FROM quiz_dati WHERE parte = 'paesi'").first<{ versione: string }>()
  return row?.versione ?? null
}

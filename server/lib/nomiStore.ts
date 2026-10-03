/**
 * Accesso ai dati di Nomi, cose e città: la giornata, la partita di ognuno e
 * la classifica.
 *
 * La giornata — la lettera e le cinque categorie — si fissa con la prima
 * partita del giorno (`fissaGiornata`), e da li' non cambia. La partita nasce
 * quando si comincia, e da li' corre il tempo; le risposte si salvano mentre si
 * scrive, e la consegna la chiude. Il tempo scaduto non si scrive da solo: lo
 * applica la prima richiesta che arriva dopo (`chiudiScaduta`), come nel quiz,
 * e consegna le risposte salvate fino ad allora.
 *
 * I punti non li fa il Worker: li fa la notte scripts/punteggi-nomi.ts, quando
 * la giornata e' finita e si conoscono le risposte di tutti, e valgono nella
 * classifica del giorno dopo. Per questo le classifiche leggono le partite del
 * giorno prima di ogni giorno del periodo.
 */

import { gameDate, puzzleNumberFor } from '../../shared/daily'
import {
  LUNGHEZZA_MASSIMA_RISPOSTA,
  MARGINE_NOMI_MS,
  TEMPO_NOMI_MS,
  TUTTE_LE_CATEGORIE,
  categorieDelGiorno,
  letteraDelGiorno,
  riconosci,
  type CategoriaNomi,
  type LessicoNomi,
  type PiuDate,
  type RispostaContata,
} from '../../shared/nomi-cose'
import { CONTI_LESSICO_NOMI } from '../../shared/nomi-cose-lessico'
import type {
  NomiLeaderboard,
  NomiRow,
  NomiStato,
  NomiStatus,
  PeriodoClassifica,
  RisultatoNomi,
} from '../../shared/types'
import { newId, nowIso } from './http'

export interface GiornataNomiRow {
  puzzle_number: number
  lettera: string
  categorie: string
  giocatori: number | null
  piu_date: string | null
  created_at: string
}

export interface PartitaNomiRow {
  id: string
  player_id: string
  puzzle_number: number
  date: string
  status: NomiStatus
  risposte: string
  iniziata_at: string
  tempo_ms: number | null
  forme: string | null
  score: number | null
  valide: number | null
  dettagli: string | null
  versione: number
  updated_at: string
  finished_at: string | null
}

export type RisposteNomi = Partial<Record<CategoriaNomi, string>>
/** Le forme che il lessico riconosce, per categoria: null per una risposta che non conosce. */
export type FormeNomi = Partial<Record<CategoriaNomi, string | null>>

export interface Giornata {
  date: string
  puzzleNumber: number
}

export function giornata(): Giornata {
  const date = gameDate()
  return { date, puzzleNumber: puzzleNumberFor(date) }
}

/* ─────────────────────────────  La giornata  ─────────────────────────────── */

export async function giornataDi(db: D1Database, numero: number): Promise<GiornataNomiRow | null> {
  return db.prepare('SELECT * FROM nomi_giornate WHERE puzzle_number = ?').bind(numero).first<GiornataNomiRow>()
}

/**
 * La giornata, fissata da chi comincia per primo: la lettera e le categorie si
 * ricavano dal numero del giorno, ma le categorie dipendono da quante parole ha
 * il lessico, e un lessico rifatto non deve cambiare la giornata di chi l'ha
 * gia' giocata.
 */
export async function fissaGiornata(db: D1Database, numero: number): Promise<GiornataNomiRow> {
  await db
    .prepare(
      `INSERT OR IGNORE INTO nomi_giornate (puzzle_number, lettera, categorie, created_at)
       VALUES (?, ?, ?, ?)`,
    )
    .bind(numero, letteraDelGiorno(numero), JSON.stringify(categorieDelGiorno(numero, CONTI_LESSICO_NOMI)), nowIso())
    .run()
  const row = await giornataDi(db, numero)
  if (!row) throw new Error('Giornata di Nomi, cose e città non trovata subito dopo la creazione')
  return row
}

function json(testo: string | null): unknown {
  if (!testo) return null
  try {
    return JSON.parse(testo)
  } catch {
    return null
  }
}

const categoria = (c: unknown): c is CategoriaNomi => TUTTE_LE_CATEGORIE.includes(c as CategoriaNomi)

export function categorieDi(g: Pick<GiornataNomiRow, 'categorie'>): CategoriaNomi[] {
  const valore = json(g.categorie)
  return Array.isArray(valore) ? valore.filter(categoria) : []
}

/* ─────────────────────────────  La partita  ─────────────────────────────── */

export async function partitaDi(db: D1Database, playerId: string, numero: number): Promise<PartitaNomiRow | null> {
  return db
    .prepare('SELECT * FROM nomi_partite WHERE player_id = ? AND puzzle_number = ?')
    .bind(playerId, numero)
    .first<PartitaNomiRow>()
}

/** La partita di oggi, creata adesso se non c'e': da qui parte il tempo. */
export async function apriPartita(db: D1Database, playerId: string, quando: Giornata): Promise<PartitaNomiRow> {
  const adesso = nowIso()
  await db
    .prepare(
      `INSERT OR IGNORE INTO nomi_partite (id, player_id, puzzle_number, date, status, iniziata_at, updated_at)
       VALUES (?, ?, ?, ?, 'playing', ?, ?)`,
    )
    .bind(newId('nom'), playerId, quando.puzzleNumber, quando.date, adesso, adesso)
    .run()
  const row = await partitaDi(db, playerId, quando.puzzleNumber)
  if (!row) throw new Error('Partita di Nomi, cose e città non trovata subito dopo la creazione')
  return row
}

export function risposteDi(row: Pick<PartitaNomiRow, 'risposte'>): RisposteNomi {
  const valore = json(row.risposte)
  if (!valore || typeof valore !== 'object' || Array.isArray(valore)) return {}
  const risposte: RisposteNomi = {}
  for (const [c, testo] of Object.entries(valore)) if (categoria(c) && typeof testo === 'string') risposte[c] = testo
  return risposte
}

export function formeDi(row: Pick<PartitaNomiRow, 'forme'>): FormeNomi | null {
  const valore = json(row.forme)
  if (!valore || typeof valore !== 'object' || Array.isArray(valore)) return null
  const forme: FormeNomi = {}
  for (const [c, forma] of Object.entries(valore)) {
    if (categoria(c) && (forma === null || typeof forma === 'string')) forme[c] = forma
  }
  return forme
}

/** Una risposta come la si salva: senza caratteri di controllo, senza spazi in piu', e non troppo lunga. */
export function pulisci(testo: string): string {
  return testo
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, LUNGHEZZA_MASSIMA_RISPOSTA)
}

/**
 * Le risposte mandate dal telefono, se sono un oggetto categoria → testo con le
 * sole categorie del giorno; null altrimenti. Le risposte vuote non si
 * tengono.
 */
export function leggiRisposte(valore: unknown, categorie: readonly CategoriaNomi[]): RisposteNomi | null {
  if (!valore || typeof valore !== 'object' || Array.isArray(valore)) return null
  const risposte: RisposteNomi = {}
  for (const [c, testo] of Object.entries(valore)) {
    if (!categorie.includes(c as CategoriaNomi) || typeof testo !== 'string') return null
    const pulita = pulisci(testo)
    if (pulita) risposte[c as CategoriaNomi] = pulita
  }
  return risposte
}

/** Il tempo e' finito, margine della rete compreso: una risposta che arriva adesso non vale. */
export function fuoriTempo(row: Pick<PartitaNomiRow, 'iniziata_at'>, adesso: number): boolean {
  return adesso > Date.parse(row.iniziata_at) + TEMPO_NOMI_MS + MARGINE_NOMI_MS
}

/** Una partita ancora aperta il cui tempo e' finito: la si chiude con le risposte salvate. */
export function scaduta(row: Pick<PartitaNomiRow, 'iniziata_at' | 'status'>, adesso: number): boolean {
  return row.status === 'playing' && fuoriTempo(row, adesso)
}

/** Le forme che il lessico riconosce nelle risposte, una per categoria del giorno. */
export function formeRiconosciute(
  lessico: LessicoNomi,
  lettera: string,
  categorie: readonly CategoriaNomi[],
  risposte: RisposteNomi,
): FormeNomi {
  const forme: FormeNomi = {}
  for (const c of categorie) {
    const testo = risposte[c]
    if (testo) forme[c] = riconosci(lessico, c, lettera, testo)
  }
  return forme
}

/**
 * Salva le risposte mentre si scrive. Vale l'ultima scrittura: le risposte
 * sono sempre tutte, e il telefono le manda una richiesta alla volta. Una
 * partita chiusa nel frattempo non cambia piu'.
 */
export async function salvaRisposte(
  db: D1Database,
  row: PartitaNomiRow,
  risposte: RisposteNomi,
  adesso: number,
): Promise<PartitaNomiRow> {
  const testo = JSON.stringify(risposte)
  const quando = new Date(adesso).toISOString()
  const scritta = await db
    .prepare(
      `UPDATE nomi_partite SET risposte = ?, versione = versione + 1, updated_at = ?
        WHERE id = ? AND status = 'playing'`,
    )
    .bind(testo, quando, row.id)
    .run()
  if (scritta.meta.changes !== 1) return (await partitaDi(db, row.player_id, row.puzzle_number)) ?? row
  return { ...row, risposte: testo, versione: row.versione + 1, updated_at: quando }
}

/**
 * Chiude la partita con queste risposte e questo tempo: la consegna, o il tempo
 * scaduto. Condizionata allo stato: una partita gia' chiusa — un doppio tocco,
 * l'altro telefono — resta com'era, e si rilegge.
 */
export async function chiudi(
  db: D1Database,
  row: PartitaNomiRow,
  risposte: RisposteNomi,
  tempoMs: number,
  forme: FormeNomi | null,
  adesso: number,
): Promise<PartitaNomiRow> {
  const testo = JSON.stringify(risposte)
  const quando = new Date(adesso).toISOString()
  const fine = new Date(Math.min(adesso, Date.parse(row.iniziata_at) + TEMPO_NOMI_MS)).toISOString()
  const tempo = Math.max(0, Math.min(TEMPO_NOMI_MS, Math.round(tempoMs)))
  const valide = forme ? Object.values(forme).filter(Boolean).length : null
  const testoForme = forme ? JSON.stringify(forme) : null
  const scritta = await db
    .prepare(
      `UPDATE nomi_partite
          SET risposte = ?, status = 'done', tempo_ms = ?, forme = ?, valide = ?,
              versione = versione + 1, updated_at = ?, finished_at = ?
        WHERE id = ? AND status = 'playing'`,
    )
    .bind(testo, tempo, testoForme, valide, quando, fine, row.id)
    .run()
  if (scritta.meta.changes !== 1) return (await partitaDi(db, row.player_id, row.puzzle_number)) ?? row
  return {
    ...row,
    risposte: testo,
    status: 'done',
    tempo_ms: tempo,
    forme: testoForme,
    valide,
    versione: row.versione + 1,
    updated_at: quando,
    finished_at: fine,
  }
}

/* ─────────────────────────────  Lo stato  ─────────────────────────────── */

/** Lo stato che va al telefono. Senza partita, la lettera e le categorie non ci sono. */
export function statoDa(
  quando: Giornata,
  row: PartitaNomiRow | null,
  g: GiornataNomiRow | null,
  ieri: RisultatoNomi | null,
  adesso: number,
  msToNextPuzzle: number,
): NomiStato {
  const forme = row?.status === 'done' ? formeDi(row) : null
  const categorie = row && g ? categorieDi(g) : null
  return {
    puzzleNumber: quando.puzzleNumber,
    date: quando.date,
    status: row ? row.status : 'nuova',
    lettera: row && g ? g.lettera : null,
    categorie,
    risposte: row ? risposteDi(row) : {},
    tempoTotaleMs: TEMPO_NOMI_MS,
    restanteMs:
      row?.status === 'playing' ? Math.max(0, Date.parse(row.iniziata_at) + TEMPO_NOMI_MS - adesso) : null,
    tempoMs: row?.status === 'done' ? row.tempo_ms : null,
    riconosciute:
      forme && categorie
        ? Object.fromEntries(categorie.filter((c) => c in forme).map((c) => [c, forme[c] !== null]))
        : null,
    ieri,
    msToNextPuzzle,
  }
}

/** La partita contata di un giorno, con quel che la notte ha scritto della giornata; null se non c'e'. */
export async function risultatoDi(db: D1Database, playerId: string, numero: number): Promise<RisultatoNomi | null> {
  const r = await db
    .prepare(
      `SELECT p.score, p.tempo_ms, p.dettagli, g.lettera, g.categorie, g.giocatori, g.piu_date
         FROM nomi_partite p JOIN nomi_giornate g ON g.puzzle_number = p.puzzle_number
        WHERE p.player_id = ? AND p.puzzle_number = ? AND p.score IS NOT NULL`,
    )
    .bind(playerId, numero)
    .first<{
      score: number
      tempo_ms: number | null
      dettagli: string | null
      lettera: string
      categorie: string
      giocatori: number | null
      piu_date: string | null
    }>()
  if (!r) return null
  const dettagli = json(r.dettagli)
  const piuDate = json(r.piu_date)
  return {
    puzzleNumber: numero,
    lettera: r.lettera,
    categorie: categorieDi(r),
    punti: r.score,
    tempoMs: r.tempo_ms ?? TEMPO_NOMI_MS,
    giocatori: r.giocatori ?? 0,
    risposte: (dettagli && typeof dettagli === 'object' ? dettagli : {}) as Partial<
      Record<CategoriaNomi, RispostaContata>
    >,
    piuDate: (piuDate && typeof piuDate === 'object' ? piuDate : {}) as PiuDate,
  }
}

/* ────────────────────────────  La classifica  ─────────────────────────── */

export interface TotaliNomi {
  playerId: string
  nickname: string
  displayName: string
  avatarColor: string
  punti: number
  giornate: number
  valide: number
  inAttesa: boolean
}

/**
 * Mette in fila i giocatori: **punti** delle partite contate, chi aspetta solo
 * i punti di stanotte in fondo, poi **piu' risposte valide**, e il nickname,
 * perché due righe identiche non si scambino di posto.
 */
export function ordinaNomi(giocatori: TotaliNomi[]): NomiRow[] {
  return [...giocatori]
    .sort((a, b) => {
      if (a.punti !== b.punti) return b.punti - a.punti
      if (a.giornate > 0 !== b.giornate > 0) return a.giornate > 0 ? -1 : 1
      if (a.valide !== b.valide) return b.valide - a.valide
      return a.nickname.localeCompare(b.nickname, 'it', { sensitivity: 'base' })
    })
    .map((g, i) => ({ rank: i + 1, ...g }))
}

/**
 * La classifica di un periodo. Le partite di un giorno si contano la notte e
 * valgono il giorno dopo, quindi un periodo prende le partite dal giorno prima
 * del suo primo al giorno prima del suo ultimo: oggi vale la partita di ieri.
 * In attesa c'e' chi ha una partita non ancora contata: quella di oggi, o
 * quella di ieri se la notte non e' ancora passata.
 */
export async function classificaNomi(
  db: D1Database,
  periodo: PeriodoClassifica,
  numeroDiOggi: number,
  viewerId: string,
): Promise<NomiLeaderboard> {
  const { results } = await db
    .prepare(
      `SELECT p.id AS player_id, p.nickname, p.display_name, p.avatar_color,
              COALESCE(SUM(CASE WHEN g.puzzle_number < ?2 AND g.score IS NOT NULL THEN g.score END), 0)  AS punti,
              SUM(CASE WHEN g.puzzle_number < ?2 AND g.score IS NOT NULL THEN 1 ELSE 0 END)            AS giornate,
              COALESCE(SUM(CASE WHEN g.puzzle_number < ?2 AND g.score IS NOT NULL THEN g.valide END), 0) AS valide,
              MAX(CASE WHEN g.score IS NULL AND (g.puzzle_number < ?2 OR g.puzzle_number = ?3)
                       THEN 1 ELSE 0 END)                                                              AS in_attesa
         FROM players p
         JOIN nomi_partite g ON g.player_id = p.id AND g.puzzle_number BETWEEN ?1 AND ?2
        GROUP BY p.id
       HAVING giornate > 0 OR in_attesa = 1`,
    )
    .bind(periodo.da - 1, periodo.a, numeroDiOggi)
    .all<{
      player_id: string
      nickname: string
      display_name: string
      avatar_color: string
      punti: number
      giornate: number
      valide: number
      in_attesa: number
    }>()
  const rows = ordinaNomi(
    results.map((r) => ({
      playerId: r.player_id,
      nickname: r.nickname,
      displayName: r.display_name || r.nickname,
      avatarColor: r.avatar_color,
      punti: r.punti,
      giornate: r.giornate,
      valide: r.valide,
      inAttesa: r.in_attesa === 1,
    })),
  )
  return {
    scope: periodo.scope,
    periodo,
    updatedAt: nowIso(),
    rows,
    me: rows.find((r) => r.playerId === viewerId) ?? null,
  }
}

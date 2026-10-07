/**
 * Accesso ai dati dello Scarabeo: la partita di una giornata e la classifica.
 *
 * La riga di una partita salva **solo le mosse**. Tabellone, leggio e punti di
 * ogni mossa si ricalcolano rigiocandole sul sacchetto della giornata, che e'
 * deterministico dal numero del puzzle: cosi' non esiste il caso in cui la riga
 * dice una cosa e le mosse ne implicano un'altra. L'unica eccezione e' il
 * totale, che sta in colonna perché la classifica lo somma in SQL senza
 * rigiocare le partite di tutti.
 *
 * Le giornate nuove si giocano a turni contro il computer del giorno
 * (`contro_computer`): le mosse si alternano, le pari di chi gioca e le dispari
 * del computer, e i leggii sono due (`leggiiDa`). Quelle di prima restano da
 * sole, come le si e' giocate.
 */

import { gameDate, puzzleNumberFor } from '../../shared/daily'
import {
  JOLLY,
  MOSSE_PER_GIORNATA,
  TESSERE_LEGGIO,
  leggiiDa,
  leggioDa,
  rigioca,
  sacchettoDelGiorno,
  tabelloneDa,
  validaPosa,
  type Mossa,
  type MossaGiocata,
  type Posa,
} from '../../shared/scarabeo'
import { FORMATO_TRAGUARDO, PARTITA_DEL_GIORNO } from '../../shared/scarabeo-computer'
import { statoADue } from '../../shared/scarabeo-due'
import type {
  CellaPiena,
  PeriodoClassifica,
  ScarabeoLeaderboard,
  ScarabeoRow,
  ScarabeoState,
  ScarabeoStatus,
  StatisticheScarabeoLibero,
} from '../../shared/types'
import { LATO } from '../../shared/scarabeo'
import { RIFERIMENTO_SCARABEO, puntiScarabeo } from '../../shared/punti'
import { fail, newId, nowIso } from './http'

export interface PartitaRow {
  id: string
  player_id: string
  puzzle_number: number
  date: string
  status: ScarabeoStatus
  mosse: string
  turns: number
  /** Il punteggio del tabellone. */
  score: number
  /** I punti in classifica: il punteggio in rapporto a quello del computer. */
  punti: number
  started_at: string
  finished_at: string | null
  /** La compagnia in cui si gioca la giornata: la partita e' dell'host, e questa resta chiusa. */
  in_compagnia: string | null
  /** I punti dell'host, per chi gioca la giornata con lui. */
  assist_score: number | null
  /** 1 se la giornata si gioca a turni contro il computer del giorno; 0 per quelle di prima, da soli. */
  contro_computer: number
  /** Il punteggio del computer nella stessa partita. */
  punti_computer: number
}

/** La partita del computer sulle tessere del giorno: il traguardo della classificata. */
export interface ComputerRow {
  puzzle_number: number
  punti: number
  mosse: string | null
  /** 1 se il computer ha giocato da solo, come le giornate di prima; 2 a turni contro il computer del giorno. */
  formato: number
  created_at: string
}

/**
 * Il computer del giorno, scritto dallo script della notte.
 *
 * Se non c'e', la prima richiesta scrive il riferimento di ripiego e da lì vale
 * quello per tutti: `INSERT OR IGNORE` fa sì che il riferimento di una giornata
 * sia uno solo, anche se lo script arrivasse dopo.
 */
export async function computerDelGiorno(db: D1Database, puzzleNumber: number): Promise<ComputerRow> {
  const trovato = await db
    .prepare('SELECT * FROM scarabeo_computer WHERE puzzle_number = ?')
    .bind(puzzleNumber)
    .first<ComputerRow>()
  if (trovato) return trovato
  await db
    .prepare(
      `INSERT OR IGNORE INTO scarabeo_computer (puzzle_number, punti, mosse, formato, created_at)
       VALUES (?, ?, NULL, ?, ?)`,
    )
    .bind(puzzleNumber, RIFERIMENTO_SCARABEO, FORMATO_TRAGUARDO, nowIso())
    .run()
  const scritto = await db
    .prepare('SELECT * FROM scarabeo_computer WHERE puzzle_number = ?')
    .bind(puzzleNumber)
    .first<ComputerRow>()
  return (
    scritto ?? {
      puzzle_number: puzzleNumber,
      punti: RIFERIMENTO_SCARABEO,
      mosse: null,
      formato: FORMATO_TRAGUARDO,
      created_at: nowIso(),
    }
  )
}

export function mosseDelComputer(computer: ComputerRow): Mossa[] | null {
  if (!computer.mosse) return null
  try {
    const valore = JSON.parse(computer.mosse) as unknown
    return Array.isArray(valore) ? (valore as Mossa[]) : null
  } catch {
    return null
  }
}

/**
 * Le mosse del traguardo, da mostrare a giornata chiusa: quelle del computer
 * che ha giocato al posto di chi gioca. In un traguardo a turni le altre sono
 * del computer del giorno, e non fanno il suo punteggio.
 */
export function giocateDelTraguardo(computer: ComputerRow): MossaGiocata[] | null {
  const mosse = mosseDelComputer(computer)
  if (!mosse) return null
  if (computer.formato < FORMATO_TRAGUARDO) return rigioca(mosse).giocate
  return statoADue(sacchettoDelGiorno(computer.puzzle_number), mosse, PARTITA_DEL_GIORNO)
    .giocate.filter((g) => g.di === 0)
    .map((g, i) => ({ numero: i + 1, tipo: g.tipo, parole: g.parole, punti: g.punti, scarabeo: g.scarabeo }))
}

export interface Giornata {
  date: string
  puzzleNumber: number
}

export function giornata(): Giornata {
  const date = gameDate()
  return { date, puzzleNumber: puzzleNumberFor(date) }
}

/** Le mosse salvate, con un ripiego se il JSON non si legge. */
export function mosseDi(row: PartitaRow): Mossa[] {
  try {
    const parsed = JSON.parse(row.mosse) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed as Mossa[]
  } catch {
    return []
  }
}

/**
 * Le posizioni arrivate dal client, ripulite.
 *
 * Tutto quel che viene da fuori e' da trattare come sospetto: una posa con
 * coordinate finte o con una lettera che non e' sul leggio sarebbe un modo di
 * fabbricarsi un punteggio. La forma la controlla questa funzione, la legalita'
 * della mossa `validaPosa`, e il possesso delle tessere `verificaLeggio`.
 */
export function leggiPosa(body: unknown): Posa[] {
  const posa = (body as { posa?: unknown })?.posa
  if (!Array.isArray(posa) || posa.length === 0) {
    fail(400, 'POSA_VUOTA', 'Non hai posato nessuna tessera.')
  }
  if (posa.length > TESSERE_LEGGIO) {
    fail(400, 'TROPPE_TESSERE', `Non puoi posare più di ${TESSERE_LEGGIO} tessere.`)
  }

  return posa.map((raw) => {
    const p = raw as { r?: unknown; c?: unknown; lettera?: unknown; jolly?: unknown }
    const r = Number(p.r)
    const c = Number(p.c)
    const lettera = String(p.lettera ?? '').toLowerCase()
    if (!Number.isInteger(r) || !Number.isInteger(c) || lettera.length !== 1) {
      fail(400, 'POSA_MALFORMATA', 'Una tessera posata non è valida.')
    }
    return { r, c, lettera, jolly: p.jolly === true }
  })
}

/**
 * Le tessere posate devono essere quelle in mano.
 *
 * Un jolly conta come jolly, non come la lettera che rappresenta: altrimenti
 * chiunque potrebbe dichiarare jolly una tessera che non ha e giocarla per la
 * lettera che gli serve.
 */
export function verificaLeggio(leggio: readonly string[], posa: readonly Posa[]): void {
  const mano = [...leggio]
  for (const p of posa) {
    const serve = p.jolly ? JOLLY : p.lettera
    const i = mano.indexOf(serve)
    if (i < 0) {
      fail(
        409,
        'LEGGIO',
        p.jolly
          ? 'Non hai un jolly da giocare.'
          : `Non hai la tessera "${p.lettera.toUpperCase()}".`,
      )
    }
    mano.splice(i, 1)
  }
}

/**
 * La partita di oggi, creata al primo accesso.
 *
 * Si gioca come il suo traguardo: a turni contro il computer del giorno, se il
 * traguardo e' stato giocato cosi', o da sola, se e' uno di prima. Un traguardo
 * che non c'e' ancora lo scrive di ripiego `computerDelGiorno`, a turni.
 */
export async function apriPartita(
  db: D1Database,
  playerId: string,
  quando: Giornata,
): Promise<PartitaRow> {
  await db
    .prepare(
      `INSERT OR IGNORE INTO scarabeo_games
         (id, player_id, puzzle_number, date, status, mosse, turns, score, started_at, contro_computer)
       VALUES (?, ?, ?, ?, 'playing', '[]', 0, 0, ?,
               COALESCE((SELECT formato FROM scarabeo_computer WHERE puzzle_number = ?), ?) >= ?)`,
    )
    .bind(
      newId('scr'),
      playerId,
      quando.puzzleNumber,
      quando.date,
      nowIso(),
      quando.puzzleNumber,
      FORMATO_TRAGUARDO,
      FORMATO_TRAGUARDO,
    )
    .run()

  const row = await db
    .prepare('SELECT * FROM scarabeo_games WHERE player_id = ? AND puzzle_number = ?')
    .bind(playerId, quando.puzzleNumber)
    .first<PartitaRow>()

  if (!row) throw new Error('Partita di Scarabeo non trovata subito dopo la creazione')
  return row
}

/**
 * La partita rigiocata: da soli, come le giornate di prima, o a turni contro il
 * computer del giorno. I punti sono sempre quelli di chi gioca; `avversario`
 * quelli del computer, se c'e'.
 */
export function partitaDi(row: Pick<PartitaRow, 'puzzle_number' | 'contro_computer'>, mosse: readonly Mossa[]) {
  const sacchetto = sacchettoDelGiorno(row.puzzle_number)
  if (row.contro_computer === 1) {
    const s = statoADue(sacchetto, mosse, PARTITA_DEL_GIORNO)
    return {
      tabellone: s.tabellone,
      giocate: s.giocate.map(({ di, ...g }) => ({ ...g, mia: di === 0 })),
      punti: s.punti[0],
      leggio: s.leggii[0],
      leggioComputer: s.leggii[1] as string[] | null,
      restanti: s.restanti,
      avversario: s.punti[1] as number | null,
      tocca: s.turno,
    }
  }
  const { tabellone, giocate, punti } = rigioca(mosse)
  const { leggio, restanti } = leggioDa(sacchetto, mosse)
  return {
    tabellone,
    giocate: giocate.map((g) => ({ ...g, mia: true })),
    punti,
    leggio,
    leggioComputer: null,
    restanti,
    avversario: null,
    tocca: 0 as const,
  }
}

/**
 * Una posa controllata come la controlla il server: le tessere sono sul leggio
 * di chi la fa, sta in piedi sul tabellone. Le parole le controlla chi chiama,
 * con il dizionario. Vale per le mie mosse e per quelle del computer del
 * giorno, che pensa nel telefono: la sua mossa arriva con la mia, e passa dagli
 * stessi controlli.
 */
export function controllaPosa(
  sacchetto: readonly string[],
  mosse: readonly Mossa[],
  giocatori: 1 | 2,
  posa: readonly Posa[],
) {
  const { leggii } = leggiiDa(sacchetto, mosse, giocatori)
  verificaLeggio(leggii[mosse.length % giocatori], posa)
  const esito = validaPosa(tabelloneDa(mosse), posa, !mosse.some((m) => m.tipo === 'posa'))
  if (!esito.ok) fail(422, esito.codice, esito.errore)
  return esito
}

/**
 * Lo stato completo che va al client.
 *
 * Del computer si dice sempre il punteggio — e' il traguardo della giornata —
 * ma la sua partita solo a giornata chiusa: la sua prima mossa e' fatta con lo
 * stesso leggio, e mostrarla prima sarebbe un suggerimento.
 */
export function statoDa(row: PartitaRow, computer: ComputerRow, msToNextPuzzle: number): ScarabeoState {
  const mosse = mosseDi(row)
  const { tabellone, giocate, punti, leggio, restanti, avversario } = partitaDi(row, mosse)

  const celle: CellaPiena[] = []
  tabellone.forEach((casella, i) => {
    if (casella) {
      celle.push({
        r: Math.floor(i / LATO),
        c: i % LATO,
        lettera: casella.lettera,
        jolly: casella.jolly,
      })
    }
  })

  return {
    puzzleNumber: row.puzzle_number,
    date: row.date,
    celle,
    leggio,
    restanti,
    mosse: giocate,
    partita: mosse,
    controComputer: row.contro_computer === 1,
    avversario,
    mosseUsate: row.turns,
    mosseTotali: MOSSE_PER_GIORNATA,
    /*
     * Il totale e' quello rigiocato, non quello in colonna. I due coincidono,
     * ma se un domani divergessero — un cambio nelle costanti dei punti — la
     * schermata deve mostrare la somma delle mosse che elenca, altrimenti si
     * vede un totale che non torna con i suoi addendi.
     */
    punti,
    puntiClassifica: puntiScarabeo(punti, computer.punti),
    computer: {
      punti: computer.punti,
      mosse: row.status === 'done' ? giocateDelTraguardo(computer) : null,
    },
    status: row.status,
    msToNextPuzzle,
  }
}

/**
 * Aggiunge una mossa alla partita.
 *
 * `WHERE turns = ?` col valore appena letto: D1 non ha transazioni
 * interattive, e due invii ravvicinati dallo stesso telefono non devono poter
 * scrivere due mosse sullo stesso numero. Se la condizione non regge, chi
 * chiama risponde 409 e il client rilegge lo stato.
 */
export async function aggiungiMossa(
  db: D1Database,
  row: PartitaRow,
  computer: ComputerRow,
  mossa: Mossa,
  puntiMossa: number,
  risposta: { mossa: Mossa; punti: number } | null = null,
): Promise<PartitaRow> {
  // La risposta del computer del giorno entra con la mia mossa: un turno, una scrittura.
  const mosse = [...mosseDi(row), mossa, ...(risposta ? [risposta.mossa] : [])]
  const turns = row.turns + 1
  const punteggio = row.score + puntiMossa
  const puntiComputer = row.punti_computer + (risposta?.punti ?? 0)
  const classifica = puntiScarabeo(punteggio, computer.punti)
  // A turni la partita finisce anche prima, se chi deve muovere resta senza tessere a sacchetto vuoto.
  const finita = turns >= MOSSE_PER_GIORNATA || (row.contro_computer === 1 && partitaDi(row, mosse).tocca === null)
  const adesso = nowIso()

  const esito = await db
    .prepare(
      `UPDATE scarabeo_games
          SET mosse = ?, turns = ?, score = ?, punti = ?, punti_computer = ?, status = ?, finished_at = ?
        WHERE id = ? AND turns = ?`,
    )
    .bind(
      JSON.stringify(mosse),
      turns,
      punteggio,
      classifica,
      puntiComputer,
      finita ? 'done' : 'playing',
      finita ? adesso : null,
      row.id,
      row.turns,
    )
    .run()

  if (esito.meta.changes !== 1) {
    fail(409, 'CONFLITTO', 'La partita è cambiata nel frattempo: ricarico.')
  }

  return {
    ...row,
    mosse: JSON.stringify(mosse),
    turns,
    score: punteggio,
    punti: classifica,
    punti_computer: puntiComputer,
    status: finita ? 'done' : 'playing',
    finished_at: finita ? adesso : null,
  }
}

/* ────────────────────────────  La classifica  ─────────────────────────── */

/**
 * I punti in classifica di una giornata: i propri, o quelli dell'host per chi
 * l'ha giocata in sua compagnia. La generale e il saldo della Fortuna usano la
 * stessa espressione (`server/lib/generale.ts`).
 */
const PUNTI_DELLA_GIORNATA = 'CASE WHEN g.in_compagnia IS NULL THEN g.punti ELSE COALESCE(g.assist_score, 0) END'

export interface TotaliScarabeo {
  playerId: string
  nickname: string
  displayName: string
  avatarColor: string
  punti: number
  punteggio: number
  giornate: number
  migliore: number
  oggi: number | null
  inCorso: boolean
  /** I punti delle giornate giocate in compagnia di qualcun altro. */
  assist: number
}

/**
 * Mette in fila i giocatori di Scarabeo.
 *
 * L'ordine: **punti in classifica** del periodo, poi **meno punti fatti in
 * compagnia** — la regola del Wordle: a pari punti passa avanti chi li ha
 * fatti con le proprie partite — poi il **punteggio del tabellone** — a pari
 * punti ha giocato meglio chi ha fatto di piu' sul tabellone, che conta anche
 * le giornate in cui si e' battuto il computer — poi **meno giornate**, perché
 * lo stesso totale in meno partite e' un gioco migliore, e infine il nickname,
 * così due righe identiche non si scambiano di posto a ogni ricarica.
 *
 * Funzione pura e fuori da SQL per la stessa ragione della classifica del
 * Wordle: le righe sono poche e una catena di spareggi in SQL non si legge.
 */
export function ordinaScarabeo(giocatori: TotaliScarabeo[]): ScarabeoRow[] {
  const inFila = [...giocatori].sort((a, b) => {
    if (a.punti !== b.punti) return b.punti - a.punti
    if (a.assist !== b.assist) return a.assist - b.assist
    if (a.punteggio !== b.punteggio) return b.punteggio - a.punteggio
    if (a.giornate !== b.giornate) return a.giornate - b.giornate
    return a.nickname.localeCompare(b.nickname, 'it', { sensitivity: 'base' })
  })

  return inFila.map((g, i) => ({ rank: i + 1, ...g }))
}

interface AggregatoRow {
  player_id: string
  nickname: string
  display_name: string
  avatar_color: string
  punti: number
  punteggio: number
  giornate: number
  migliore: number
  oggi: number | null
  in_corso: number
  assist: number
}

export async function classificaScarabeo(
  db: D1Database,
  periodo: PeriodoClassifica,
  numeroDiOggi: number,
  viewerId: string,
): Promise<ScarabeoLeaderboard> {
  /*
   * Una query sola. Le partite ancora in corso entrano coi punti che hanno
   * già fatto, e `in_corso` lo dice: nella vista di oggi si vede anche chi sta
   * giocando, come nel Wordle.
   */
  const { results } = await db
    .prepare(
      `SELECT p.id           AS player_id,
              p.nickname     AS nickname,
              p.display_name AS display_name,
              p.avatar_color AS avatar_color,
              COALESCE(SUM(${PUNTI_DELLA_GIORNATA}), 0)                     AS punti,
              COALESCE(SUM(CASE WHEN g.in_compagnia IS NULL THEN g.score ELSE 0 END), 0) AS punteggio,
              COUNT(g.id)                                                   AS giornate,
              COALESCE(MAX(CASE WHEN g.in_compagnia IS NULL THEN g.score END), 0) AS migliore,
              MAX(CASE WHEN g.puzzle_number = ? THEN ${PUNTI_DELLA_GIORNATA} END) AS oggi,
              MAX(CASE WHEN g.puzzle_number = ? AND g.status = 'playing'
                       THEN 1 ELSE 0 END)                                   AS in_corso,
              COALESCE(SUM(CASE WHEN g.in_compagnia IS NOT NULL
                                THEN COALESCE(g.assist_score, 0) ELSE 0 END), 0) AS assist
         FROM players p
         JOIN scarabeo_games g ON g.player_id = p.id AND g.puzzle_number BETWEEN ? AND ?
        GROUP BY p.id`,
    )
    .bind(numeroDiOggi, numeroDiOggi, periodo.da, periodo.a)
    .all<AggregatoRow>()

  const rows = ordinaScarabeo(
    results.map((r) => ({
      playerId: r.player_id,
      nickname: r.nickname,
      displayName: r.display_name || r.nickname,
      avatarColor: r.avatar_color,
      punti: r.punti,
      punteggio: r.punteggio,
      giornate: r.giornate,
      migliore: r.migliore,
      oggi: r.oggi,
      inCorso: r.in_corso === 1,
      assist: r.assist,
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

/* ──────────────────────────  Le partite libere  ────────────────────────── */

export interface LiberaRow {
  livello: 'facile' | 'normale' | 'difficile'
  punti: number
  punti_computer: number
  esito: 'vinta' | 'persa' | 'pari'
}

export async function statisticheLibere(db: D1Database, playerId: string): Promise<StatisticheScarabeoLibero> {
  const { results } = await db
    .prepare(
      `SELECT livello, punti, punti_computer, esito FROM scarabeo_partite_libere
        WHERE player_id = ? ORDER BY created_at DESC LIMIT 2000`,
    )
    .bind(playerId)
    .all<LiberaRow>()

  const perLivello: StatisticheScarabeoLibero['perLivello'] = {
    facile: { giocate: 0, vinte: 0 },
    normale: { giocate: 0, vinte: 0 },
    difficile: { giocate: 0, vinte: 0 },
  }
  let vinte = 0
  let perse = 0
  let migliore = 0
  for (const r of results) {
    perLivello[r.livello].giocate += 1
    if (r.esito === 'vinta') {
      vinte += 1
      perLivello[r.livello].vinte += 1
    }
    if (r.esito === 'persa') perse += 1
    migliore = Math.max(migliore, r.punti)
  }
  return { giocate: results.length, vinte, perse, pari: results.length - vinte - perse, migliore, perLivello }
}

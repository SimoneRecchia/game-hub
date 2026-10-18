/**
 * I numeri del pannello di amministrazione: i giocatori, le partite, i
 * contenuti della notte, la Fortuna e il database.
 *
 * Ogni richiesta del pannello fa le sue letture in un `batch` solo, un giro
 * verso il database: sono molte istruzioni — una per gioco, a volte tre — e D1
 * ne accetta cinquanta per richiesta, quindi ogni schermata ne usa al piu' una
 * trentina. I conti sono tutti in SQL: il Worker ha dieci millisecondi, e qui
 * mette solo in fila le righe.
 */

import type {
  AdminContenuti,
  AdminContenuto,
  AdminDatabase,
  AdminFortuna,
  AdminFortunaGioco,
  AdminGiocatore,
  AdminGiocatoreRiga,
  AdminGiocatori,
  AdminGiochi,
  AdminPanoramica,
  AdminStatisticheGioco,
  ContenutoDelGiorno,
  FiltroGiocatori,
  GiocoAzzerabile,
  OrdineGiocatori,
  SerieGiorno,
} from '../../shared/admin'
import { LIMITI_GRATUITI } from '../../shared/admin'
import { PRESENZA_ONLINE_MS } from '../../shared/config'
import { addDays, dateForPuzzleNumber, gameDate, istanteItaliano, puzzleNumberFor, solutionIndexFor } from '../../shared/daily'
import type { GiocoClassificato } from '../../shared/types'
import { SOLUTION_WORDS } from '../../shared/words/solutions'
import type { Bindings, PlayerRow } from '../types'
import { emailProprietari, ruoloDi } from './admin'

/* ─────────────────────────────  I giochi  ───────────────────────────── */

/**
 * Le partite delle classificate, gioco per gioco: la tabella, quando una
 * partita e' finita e quanti punti vale. Una giornata in compagnia vale i punti
 * dell'host (`assist_score`), e del Wordle conta la parola del giorno (`slot`).
 */
interface TabellaGioco {
  gioco: GiocoClassificato
  tabella: string
  finita: string
  punti: string
  filtro: string
}

export const TABELLE_GIOCHI: readonly TabellaGioco[] = [
  { gioco: 'wordle', tabella: 'wordle_games', finita: "status != 'playing'", punti: 'COALESCE(assist_score, score)', filtro: 'slot = 1' },
  { gioco: 'scarabeo', tabella: 'scarabeo_games', finita: "status = 'done'", punti: 'COALESCE(assist_score, score)', filtro: '1' },
  { gioco: 'cruciverba', tabella: 'cruciverba_games', finita: "status = 'done'", punti: 'COALESCE(assist_score, score)', filtro: '1' },
  { gioco: 'sudoku', tabella: 'sudoku_games', finita: "status = 'done'", punti: 'score', filtro: '1' },
  { gioco: 'quiz', tabella: 'quiz_partite', finita: "status = 'done'", punti: 'score', filtro: '1' },
  { gioco: 'nomi', tabella: 'nomi_partite', finita: "status = 'done'", punti: 'COALESCE(score, 0)', filtro: '1' },
  { gioco: 'anagrammi', tabella: 'anagrammi_partite', finita: "status = 'done'", punti: 'score', filtro: '1' },
  { gioco: 'ghigliottina', tabella: 'ghigliottina_partite', finita: "status = 'done'", punti: 'score', filtro: '1' },
  { gioco: 'paroliere', tabella: 'paroliere_partite', finita: "status = 'done'", punti: 'score', filtro: '1' },
  { gioco: 'catena', tabella: 'catena_partite', finita: "status = 'done'", punti: 'score', filtro: '1' },
]

/**
 * Le giornate che il pannello azzera: si cancella la riga della partita, e chi
 * la giocava la ricomincia. Nomi, cose e citta' no: la notte l'ha gia' contata
 * insieme a quelle degli altri, e ricominciarla cambierebbe la rarita' di tutti.
 */
export const AZZERABILI: Record<GiocoAzzerabile, TabellaGioco> = Object.fromEntries(
  TABELLE_GIOCHI.filter((t) => t.gioco !== 'nomi').map((t) => [t.gioco, t]),
) as Record<GiocoAzzerabile, TabellaGioco>

/** La giornata di oggi, e l'istante in cui e' cominciata: le date di iscrizione sono istanti. */
function oggi(adesso: number) {
  const data = gameDate(new Date(adesso))
  return { data, numero: puzzleNumberFor(data) }
}

const inizioDelGiorno = (data: string) => new Date(istanteItaliano(data, 0)).toISOString()

/** I giorni da `da` a `a` compresi, con zero dove la serie non ha valore. */
function serieCompleta(da: string, a: string, valori: Map<string, number>): SerieGiorno[] {
  const serie: SerieGiorno[] = []
  for (let d = da; d <= a; d = addDays(d, 1)) serie.push({ data: d, valore: valori.get(d) ?? 0 })
  return serie
}

/** Le tabelle dell'app: senza quelle di SQLite, di D1 e delle migrazioni. */
const TABELLE_APP = `type = 'table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\'
  AND name != 'd1_migrations'`

/** La dimensione del database dopo una lettura: D1 la dice in ogni risposta, il banco dei test no. */
function dimensioneDa(meta: unknown): number {
  const m = meta as { size_after?: number } | undefined
  return typeof m?.size_after === 'number' ? m.size_after : 0
}

/* ─────────────────────────────  La panoramica  ───────────────────────────── */

export async function panoramica(db: D1Database, env: Bindings, adesso = Date.now()): Promise<AdminPanoramica> {
  const { data, numero } = oggi(adesso)
  const da30 = addDays(data, -29)
  const da7 = addDays(data, -6)
  const istante = (d: string) => inizioDelGiorno(d)
  const proprietari = JSON.stringify(emailProprietari(env))
  const [giocatori, attivi, serie, iscritti, tabelle, sessioni, notifiche, errori, ...partite] = await db.batch([
    db
      .prepare(
        `SELECT COUNT(*) AS totali,
                COALESCE(SUM(email_verified_at IS NOT NULL), 0) AS verificati,
                COALESCE(SUM(created_at >= ?), 0) AS nuovi_oggi,
                COALESCE(SUM(created_at >= ?), 0) AS nuovi7,
                COALESCE(SUM(created_at >= ?), 0) AS nuovi30,
                COALESCE(SUM(sospeso_at IS NOT NULL), 0) AS sospesi,
                COALESCE(SUM(ruolo = 'admin' OR email_lower IN (SELECT value FROM json_each(?))), 0) AS amministratori
           FROM players`,
      )
      .bind(istante(data), istante(da7), istante(da30), proprietari),
    db
      .prepare(
        `SELECT (SELECT COUNT(*) FROM presenza WHERE visto_at >= ?) AS online,
                COUNT(DISTINCT CASE WHEN data = ? THEN player_id END) AS oggi,
                COUNT(DISTINCT CASE WHEN data >= ? THEN player_id END) AS settimana,
                COUNT(DISTINCT player_id) AS mese
           FROM attivita_giorni WHERE data >= ?`,
      )
      .bind(new Date(adesso - PRESENZA_ONLINE_MS).toISOString(), data, da7, da30),
    db.prepare('SELECT data, COUNT(*) AS n FROM attivita_giorni WHERE data >= ? GROUP BY data').bind(da30),
    db.prepare('SELECT created_at FROM players WHERE created_at >= ?').bind(istante(da30)),
    db.prepare(`SELECT COUNT(*) AS n FROM sqlite_master WHERE ${TABELLE_APP}`),
    db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE expires_at > ?').bind(new Date(adesso).toISOString()),
    db.prepare('SELECT COUNT(*) AS n FROM push_iscrizioni'),
    db.prepare('SELECT COUNT(*) AS n FROM errori_server WHERE at >= ?').bind(new Date(adesso - 86_400_000).toISOString()),
    ...TABELLE_GIOCHI.map((t) =>
      db
        .prepare(
          `SELECT COUNT(*) AS iniziate, COALESCE(SUM(${t.finita}), 0) AS finite,
                  AVG(CASE WHEN ${t.finita} THEN ${t.punti} END) AS media
             FROM ${t.tabella} WHERE puzzle_number = ? AND ${t.filtro}`,
        )
        .bind(numero),
    ),
  ])
  const g = giocatori.results[0] as Record<string, number>
  const a = attivi.results[0] as Record<string, number>
  const perGiorno = new Map((serie.results as Array<{ data: string; n: number }>).map((r) => [r.data, r.n]))
  const nuovi = new Map<string, number>()
  for (const r of iscritti.results as Array<{ created_at: string }>) {
    const giorno = gameDate(new Date(r.created_at))
    nuovi.set(giorno, (nuovi.get(giorno) ?? 0) + 1)
  }
  const n = (r: D1Result) => (r.results[0] as { n: number } | undefined)?.n ?? 0
  return {
    adesso: new Date(adesso).toISOString(),
    giornata: { data, numero },
    giocatori: {
      totali: g.totali,
      verificati: g.verificati,
      nuoviOggi: g.nuovi_oggi,
      nuovi7: g.nuovi7,
      nuovi30: g.nuovi30,
      sospesi: g.sospesi,
      amministratori: g.amministratori,
    },
    attivi: { online: a.online, oggi: a.oggi, settimana: a.settimana, mese: a.mese },
    serieAttivi: serieCompleta(da30, data, perGiorno),
    serieIscrizioni: serieCompleta(da30, data, nuovi),
    partiteOggi: TABELLE_GIOCHI.map((t, i) => {
      const r = partite[i].results[0] as { iniziate: number; finite: number; media: number | null }
      return { gioco: t.gioco, iniziate: r.iniziate, finite: r.finite, mediaPunti: arrotonda(r.media) }
    }),
    database: { dimensione: dimensioneDa(tabelle.meta), limite: LIMITI_GRATUITI.d1Dimensione, tabelle: n(tabelle) },
    sessioni: n(sessioni),
    dispositiviNotifiche: n(notifiche),
    errori24h: n(errori),
    cloudflare: Boolean(env.CF_ACCOUNT_ID && env.CF_API_TOKEN),
  }
}

const arrotonda = (x: number | null | undefined) => (x === null || x === undefined ? null : Math.round(x * 10) / 10)

/* ─────────────────────────────  I giocatori  ───────────────────────────── */

export const GIOCATORI_PER_PAGINA = 30

const ORDINI: Record<OrdineGiocatori, string> = {
  recenti: 'pr.visto_at IS NULL, pr.visto_at DESC, p.created_at DESC',
  iscritti: 'p.created_at DESC',
  nome: 'p.nickname_lower ASC',
  attivi: 'giorni30 DESC, pr.visto_at IS NULL, pr.visto_at DESC',
}

/** I filtri della lista, con i loro parametri: `?` in ordine, perché D1 non lega i parametri con il nome. */
function filtroDi(filtro: FiltroGiocatori, env: Bindings, adesso: number): { sql: string; valori: unknown[] } {
  switch (filtro) {
    case 'online':
      return { sql: 'pr.visto_at >= ?', valori: [new Date(adesso - PRESENZA_ONLINE_MS).toISOString()] }
    case 'non-verificati':
      return { sql: 'p.email_verified_at IS NULL', valori: [] }
    case 'sospesi':
      return { sql: 'p.sospeso_at IS NOT NULL', valori: [] }
    case 'amministratori':
      return {
        sql: "(p.ruolo = 'admin' OR p.email_lower IN (SELECT value FROM json_each(?)))",
        valori: [JSON.stringify(emailProprietari(env))],
      }
    default:
      return { sql: '1', valori: [] }
  }
}

interface RigaGiocatore extends PlayerRow {
  visto_at: string | null
  attivita: string | null
  giorni30: number
}

function rigaDa(env: Bindings, r: RigaGiocatore, adesso: number): AdminGiocatoreRiga {
  const online = r.visto_at !== null && Date.parse(r.visto_at) >= adesso - PRESENZA_ONLINE_MS
  return {
    id: r.id,
    nickname: r.nickname,
    displayName: r.display_name || r.nickname,
    avatarColor: r.avatar_color,
    email: r.email,
    emailVerificata: r.email_verified_at !== null,
    creatoIl: r.created_at,
    vistoIl: r.visto_at,
    online,
    attivita: online ? r.attivita : null,
    ruolo: ruoloDi(env, r),
    sospeso: r.sospeso_at !== null && r.sospeso_at !== undefined,
    giorniAttivi30: r.giorni30 ?? 0,
  }
}

/** Le colonne di una riga di giocatore, con la presenza e i giorni attivi del mese (`?`: il primo giorno). */
const COLONNE_GIOCATORE = `p.*, pr.visto_at, pr.attivita,
  (SELECT COUNT(*) FROM attivita_giorni a WHERE a.player_id = p.id AND a.data >= ?) AS giorni30`

/** I giocatori, cercati per nickname, nome o email. */
export async function giocatori(
  db: D1Database,
  env: Bindings,
  { q, ordine, filtro, pagina }: { q: string; ordine: OrdineGiocatori; filtro: FiltroGiocatori; pagina: number },
  adesso = Date.now(),
): Promise<AdminGiocatori> {
  const cerca = q.trim().toLowerCase()
  const like = `%${cerca.replace(/[%_\\]/g, (c) => `\\${c}`)}%`
  const ricerca = cerca
    ? {
        sql: `(p.nickname_lower LIKE ? ESCAPE '\\' OR p.email_lower LIKE ? ESCAPE '\\'
               OR lower(p.display_name) LIKE ? ESCAPE '\\')`,
        valori: [like, like, like],
      }
    : { sql: '1', valori: [] }
  const filtrati = filtroDi(filtro, env, adesso)
  const dove = `${ricerca.sql} AND ${filtrati.sql}`
  const valori = [...ricerca.valori, ...filtrati.valori]
  const da30 = addDays(gameDate(new Date(adesso)), -29)
  const [righe, conto] = await db.batch([
    db
      .prepare(
        `SELECT ${COLONNE_GIOCATORE} FROM players p LEFT JOIN presenza pr ON pr.player_id = p.id
          WHERE ${dove} ORDER BY ${ORDINI[ordine]} LIMIT ? OFFSET ?`,
      )
      .bind(da30, ...valori, GIOCATORI_PER_PAGINA, (pagina - 1) * GIOCATORI_PER_PAGINA),
    db
      .prepare(`SELECT COUNT(*) AS n FROM players p LEFT JOIN presenza pr ON pr.player_id = p.id WHERE ${dove}`)
      .bind(...valori),
  ])
  return {
    righe: (righe.results as RigaGiocatore[]).map((r) => rigaDa(env, r, adesso)),
    totale: (conto.results[0] as { n: number }).n,
    pagina,
    perPagina: GIOCATORI_PER_PAGINA,
  }
}

export async function giocatore(
  db: D1Database,
  env: Bindings,
  id: string,
  adesso = Date.now(),
): Promise<AdminGiocatore | null> {
  const { data, numero } = oggi(adesso)
  const da30 = addDays(data, -29)
  const [riga, sessioni, attivita, fortuna, ruota, notifiche, ...giochi] = await db.batch([
    db
      .prepare(
        `SELECT p.*, pr.visto_at, pr.attivita,
                (SELECT COUNT(*) FROM attivita_giorni a WHERE a.player_id = p.id AND a.data >= ?) AS giorni30
           FROM players p LEFT JOIN presenza pr ON pr.player_id = p.id WHERE p.id = ?`,
      )
      .bind(da30, id),
    db
      .prepare(
        `SELECT token_hash, created_at, last_used_at, expires_at, user_agent, admin_fino
           FROM sessions WHERE player_id = ? AND expires_at > ? ORDER BY last_used_at DESC`,
      )
      .bind(id, new Date(adesso).toISOString()),
    db.prepare('SELECT data FROM attivita_giorni WHERE player_id = ? AND data >= ?').bind(id, da30),
    db
      .prepare(
        `SELECT COALESCE(SUM(netto), 0) AS sempre, COALESCE(SUM(giocate), 0) AS giocate,
                COALESCE(SUM(CASE WHEN puzzle_number = ? THEN netto END), 0) AS oggi
           FROM fortuna_giornate WHERE player_id = ?`,
      )
      .bind(numero, id),
    db
      .prepare(
        `SELECT COALESCE(SUM(netto), 0) AS sempre, COALESCE(SUM(giri), 0) AS giocate,
                COALESCE(SUM(CASE WHEN puzzle_number = ? THEN netto END), 0) AS oggi
           FROM ruota_giornate WHERE player_id = ?`,
      )
      .bind(numero, id),
    db.prepare('SELECT COUNT(*) AS n FROM push_iscrizioni WHERE player_id = ?').bind(id),
    ...TABELLE_GIOCHI.map((t) =>
      db
        .prepare(
          `SELECT COALESCE(SUM(${t.finita}), 0) AS giornate,
                  COALESCE(SUM(CASE WHEN ${t.finita} THEN ${t.punti} END), 0) AS punti,
                  MAX(date) AS ultima,
                  MAX(CASE WHEN puzzle_number = ? THEN (${t.finita}) END) AS finita_oggi,
                  MAX(CASE WHEN puzzle_number = ? THEN ${t.punti} END) AS punti_oggi,
                  MAX(puzzle_number = ?) AS aperta_oggi
             FROM ${t.tabella} WHERE player_id = ? AND ${t.filtro}`,
        )
        .bind(numero, numero, numero, id),
    ),
  ])
  const r = riga.results[0] as RigaGiocatore | undefined
  if (!r) return null
  const giorni = new Set((attivita.results as Array<{ data: string }>).map((x) => x.data))
  const f = fortuna.results[0] as { sempre: number; giocate: number; oggi: number }
  const c = ruota.results[0] as { sempre: number; giocate: number; oggi: number }
  let notificheScelte: Record<string, boolean> | null = null
  try {
    notificheScelte = (r as unknown as { notifiche: string | null }).notifiche
      ? (JSON.parse((r as unknown as { notifiche: string }).notifiche) as Record<string, boolean>)
      : null
  } catch {
    notificheScelte = null
  }
  return {
    giocatore: {
      ...rigaDa(env, r, adesso),
      nicknameCambiatoIl: r.nickname_changed_at ?? null,
      notifiche: notificheScelte,
    },
    sessioni: (
      sessioni.results as Array<{
        token_hash: string
        created_at: string
        last_used_at: string
        expires_at: string
        user_agent: string | null
        admin_fino: string | null
      }>
    ).map((s) => ({
      id: s.token_hash,
      creataIl: s.created_at,
      usataIl: s.last_used_at,
      scadeIl: s.expires_at,
      dispositivo: s.user_agent,
      adminFino: s.admin_fino && Date.parse(s.admin_fino) > adesso ? s.admin_fino : null,
    })),
    attivita: serieCompleta(da30, data, new Map([...giorni].map((d) => [d, 1]))),
    giochi: TABELLE_GIOCHI.map((t, i) => {
      const x = giochi[i].results[0] as {
        giornate: number
        punti: number
        ultima: string | null
        finita_oggi: number | null
        punti_oggi: number | null
        aperta_oggi: number | null
      }
      return {
        gioco: t.gioco,
        giornate: x.giornate,
        punti: x.punti,
        ultima: x.ultima,
        oggi: x.aperta_oggi
          ? { stato: x.finita_oggi ? ('finita' as const) : ('in corso' as const), punti: x.punti_oggi ?? 0 }
          : null,
      }
    }),
    fortuna: { oggi: f.oggi + c.oggi, sempre: f.sempre + c.sempre, giocate: f.giocate + c.giocate },
    dispositiviNotifiche: (notifiche.results[0] as { n: number }).n,
  }
}

/* ─────────────────────────────  Le partite  ───────────────────────────── */

export const GIORNI_STATISTICHE = 14

export async function statisticheGiochi(db: D1Database, adesso = Date.now()): Promise<AdminGiochi> {
  const { numero } = oggi(adesso)
  const da = numero - GIORNI_STATISTICHE + 1
  const istruzioni = TABELLE_GIOCHI.flatMap((t) => [
    db
      .prepare(
        `SELECT puzzle_number AS numero, COUNT(*) AS giocate, COALESCE(SUM(${t.finita}), 0) AS finite,
                AVG(CASE WHEN ${t.finita} THEN ${t.punti} END) AS media
           FROM ${t.tabella} WHERE puzzle_number BETWEEN ? AND ? AND ${t.filtro} GROUP BY puzzle_number`,
      )
      .bind(da, numero),
    db
      .prepare(
        `SELECT COUNT(*) AS giocate, COUNT(DISTINCT player_id) AS giocatori,
                AVG(CASE WHEN ${t.finita} THEN ${t.punti} END) AS media
           FROM ${t.tabella} WHERE ${t.filtro}`,
      ),
    db
      .prepare(
        `SELECT p.id, p.nickname, ${t.punti.replace(/\b(assist_score|score)\b/g, 'g.$1')} AS punti
           FROM ${t.tabella} g JOIN players p ON p.id = g.player_id
          WHERE g.puzzle_number = ? AND ${t.finita.replace('status', 'g.status')} AND ${t.filtro.replace('slot', 'g.slot')}
          ORDER BY punti DESC LIMIT 3`,
      )
      .bind(numero),
  ])
  const risultati = await db.batch(istruzioni)
  const giochi: AdminStatisticheGioco[] = TABELLE_GIOCHI.map((t, i) => {
    const [serie, totale, migliori] = risultati.slice(i * 3, i * 3 + 3)
    const perNumero = new Map(
      (serie.results as Array<{ numero: number; giocate: number; finite: number; media: number | null }>).map((r) => [
        r.numero,
        r,
      ]),
    )
    const tot = totale.results[0] as { giocate: number; giocatori: number; media: number | null }
    return {
      gioco: t.gioco,
      giorni: Array.from({ length: GIORNI_STATISTICHE }, (_, k) => {
        const n = da + k
        const r = perNumero.get(n)
        return {
          numero: n,
          data: dateForPuzzleNumber(n),
          giocate: r?.giocate ?? 0,
          finite: r?.finite ?? 0,
          mediaPunti: arrotonda(r?.media),
        }
      }),
      migliori: migliori.results as Array<{ id: string; nickname: string; punti: number }>,
      totale: { giocate: tot.giocate, giocatori: tot.giocatori, mediaPunti: arrotonda(tot.media) },
    }
  })
  return { oggi: numero, giochi }
}

/* ─────────────────────────────  I contenuti  ───────────────────────────── */

/**
 * Dove sta il contenuto di ogni giorno. Il Wordle non ha una tabella da
 * riempire: la parola viene dal numero del giorno, e la riga la scrive chi
 * apre il gioco per primo.
 */
const CONTENUTI: Record<Exclude<ContenutoDelGiorno, 'wordle'>, { tabella: string; colonne: string }> = {
  cruciverba: { tabella: 'cruciverba_schemi', colonne: 'righe, colonne, soluzione, definizioni, formato' },
  sudoku: { tabella: 'sudoku_schemi', colonne: 'livello, dati, soluzione' },
  quiz: { tabella: 'quiz_giornate', colonne: 'categoria, domande, formato' },
  ghigliottina: { tabella: 'ghigliottina_giornate', colonne: 'ghigliottina, formato' },
  catena: { tabella: 'catena_giornate', colonne: 'catena, formato' },
  anagrammi: { tabella: 'anagrammi_giornate', colonne: 'parole, formato' },
  paroliere: { tabella: 'paroliere_giornate', colonne: 'griglia, comuni, traguardo, formato' },
  scarabeo: { tabella: 'scarabeo_computer', colonne: 'punti, mosse, formato' },
  'crazy-time': { tabella: 'ruota_domande', colonne: 'materia, domande, formato' },
}

export const CONTENUTI_DEL_GIORNO: readonly ContenutoDelGiorno[] = ['wordle', ...(Object.keys(CONTENUTI) as ContenutoDelGiorno[])]

/** Dai tre giorni passati ai quattordici che vengono. */
const GIORNI_PRIMA = 3
const GIORNI_DOPO = 14

export async function contenuti(db: D1Database, adesso = Date.now()): Promise<AdminContenuti> {
  const { numero } = oggi(adesso)
  const da = numero - GIORNI_PRIMA
  const a = numero + GIORNI_DOPO
  const voci = Object.entries(CONTENUTI) as Array<[Exclude<ContenutoDelGiorno, 'wordle'>, { tabella: string }]>
  const [liberi, ...pronti] = await db.batch([
    db.prepare('SELECT livello, COUNT(*) AS n FROM cruciverba_schemi_liberi GROUP BY livello'),
    ...voci.map(([, { tabella }]) =>
      db.prepare(`SELECT DISTINCT puzzle_number AS n FROM ${tabella} WHERE puzzle_number BETWEEN ? AND ?`).bind(da, a),
    ),
  ])
  const giorni = Array.from({ length: a - da + 1 }, (_, k) => ({ numero: da + k, data: dateForPuzzleNumber(da + k) }))
  return {
    oggi: numero,
    giorni,
    contenuti: [
      { contenuto: 'wordle', pronti: giorni.map(() => true) },
      ...voci.map(([contenuto], i) => {
        const presenti = new Set((pronti[i].results as Array<{ n: number }>).map((r) => r.n))
        return { contenuto, pronti: giorni.map((g) => presenti.has(g.numero)) }
      }),
    ],
    scorte: (liberi.results as Array<{ livello: string | null; n: number }>).map((r) => ({
      nome: `Cruciverba libero, ${r.livello ?? 'difficile'}`,
      quanti: r.n,
    })),
  }
}

/**
 * Una stringa JSON della tabella, aperta; se non lo e', com'e'. Solo oggetti e
 * liste: la soluzione del sudoku sono ottantuno cifre, e aperta sarebbe un numero.
 */
function apri(valore: unknown): unknown {
  if (typeof valore !== 'string' || !/^\s*[[{]/.test(valore)) return valore
  try {
    return JSON.parse(valore)
  } catch {
    return valore
  }
}

export async function contenuto(
  db: D1Database,
  quale: ContenutoDelGiorno,
  numero: number,
): Promise<AdminContenuto | null> {
  const data = dateForPuzzleNumber(numero)
  if (quale === 'wordle') {
    const riga = await db
      .prepare('SELECT answer FROM daily_puzzles WHERE puzzle_number = ? AND slot = 1')
      .bind(numero)
      .first<{ answer: string }>()
    const parola = riga?.answer ?? SOLUTION_WORDS[solutionIndexFor(numero, SOLUTION_WORDS.length)]
    return { contenuto: quale, numero, data, dati: { parola, fissata: riga !== null } }
  }
  const { tabella, colonne } = CONTENUTI[quale]
  const { results } = await db.prepare(`SELECT ${colonne} FROM ${tabella} WHERE puzzle_number = ?`).bind(numero).all()
  if (results.length === 0) return null
  const righe = results.map((r) => Object.fromEntries(Object.entries(r as object).map(([k, v]) => [k, apri(v)])))
  return { contenuto: quale, numero, data, dati: righe.length === 1 ? righe[0] : righe }
}

/* ─────────────────────────────  La Fortuna  ───────────────────────────── */

export async function fortuna(db: D1Database, adesso = Date.now()): Promise<AdminFortuna> {
  const { numero } = oggi(adesso)
  const da = numero - 29
  const [oggiF, oggiR, sempreF, sempreR, serieF, serieR, concorsi] = await db.batch([
    db
      .prepare(
        `SELECT gioco, COUNT(DISTINCT player_id) AS giocatori, SUM(giocate) AS giocate, SUM(netto) AS netto
           FROM fortuna_giornate WHERE puzzle_number = ? GROUP BY gioco`,
      )
      .bind(numero),
    db
      .prepare(
        `SELECT COUNT(DISTINCT player_id) AS giocatori, COALESCE(SUM(giri), 0) AS giocate, COALESCE(SUM(netto), 0) AS netto
           FROM ruota_giornate WHERE puzzle_number = ?`,
      )
      .bind(numero),
    db.prepare(
      `SELECT gioco, COUNT(DISTINCT player_id) AS giocatori, SUM(giocate) AS giocate, SUM(netto) AS netto
         FROM fortuna_giornate GROUP BY gioco`,
    ),
    db.prepare(
      `SELECT COUNT(DISTINCT player_id) AS giocatori, COALESCE(SUM(giri), 0) AS giocate, COALESCE(SUM(netto), 0) AS netto
         FROM ruota_giornate`,
    ),
    db
      .prepare('SELECT puzzle_number AS numero, SUM(netto) AS netto FROM fortuna_giornate WHERE puzzle_number >= ? GROUP BY puzzle_number')
      .bind(da),
    db
      .prepare('SELECT puzzle_number AS numero, SUM(netto) AS netto FROM ruota_giornate WHERE puzzle_number >= ? GROUP BY puzzle_number')
      .bind(da),
    db.prepare(
      `SELECT c.data, c.numero, c.estratti, c.raccolta, c.jackpot, c.pagato_at,
              (SELECT COUNT(*) FROM enalotto_schede s WHERE s.concorso = c.data) AS schede,
              (SELECT COUNT(*) FROM enalotto_schede s WHERE s.concorso = c.data AND s.vincita > 0) AS vincitori
         FROM enalotto_concorsi c ORDER BY c.data DESC LIMIT 10`,
    ),
  ])
  type Riga = { gioco?: string; giocatori: number; giocate: number; netto: number }
  const unisci = (perGioco: D1Result, ruota: D1Result): AdminFortunaGioco[] => [
    { gioco: 'crazy-time', ...soloNumeri(ruota.results[0] as Riga) },
    ...(perGioco.results as Riga[]).map((r) => ({ gioco: r.gioco ?? '', ...soloNumeri(r) })),
  ]
  const netti = new Map<number, number>()
  for (const r of [...serieF.results, ...serieR.results] as Array<{ numero: number; netto: number }>) {
    netti.set(r.numero, (netti.get(r.numero) ?? 0) + r.netto)
  }
  const righe = concorsi.results as Array<{
    data: string
    numero: number
    estratti: string
    raccolta: number | null
    jackpot: number | null
    pagato_at: string | null
    schede: number
    vincitori: number
  }>
  const ultimoPagato = righe.find((r) => r.pagato_at !== null)
  return {
    oggi: unisci(oggiF, oggiR),
    sempre: unisci(sempreF, sempreR),
    serie: Array.from({ length: 30 }, (_, k) => ({
      data: dateForPuzzleNumber(da + k),
      valore: netti.get(da + k) ?? 0,
    })),
    enalotto: {
      jackpot: ultimoPagato?.jackpot ?? 0,
      concorsi: righe.map((r) => ({
        data: r.data,
        numero: r.numero,
        estratti: (apri(r.estratti) as number[] | null) ?? null,
        raccolta: r.raccolta ?? 0,
        schede: r.schede,
        vincitori: r.vincitori,
        pagato: r.pagato_at !== null,
      })),
    },
  }
}

function soloNumeri(r: { giocatori: number; giocate: number; netto: number } | undefined) {
  return { giocatori: r?.giocatori ?? 0, giocate: r?.giocate ?? 0, netto: r?.netto ?? 0 }
}

/* ─────────────────────────────  Il database  ───────────────────────────── */

export async function database(db: D1Database): Promise<AdminDatabase> {
  const [tabelle, indici] = await db.batch([
    db.prepare(`SELECT name, sql FROM sqlite_master WHERE ${TABELLE_APP} ORDER BY name`),
    db.prepare("SELECT tbl_name AS tabella, COUNT(*) AS n FROM sqlite_master WHERE type = 'index' GROUP BY tbl_name"),
  ])
  // Le migrazioni le tiene wrangler in d1_migrations; nel banco dei test la tabella non c'e'.
  let migrazioni: Array<{ nome: string; applicataIl: string | null }> = []
  try {
    const { results } = await db
      .prepare('SELECT name, applied_at FROM d1_migrations ORDER BY id DESC')
      .all<{ name: string; applied_at: string | null }>()
    migrazioni = results.map((r) => ({ nome: r.name, applicataIl: r.applied_at }))
  } catch {
    migrazioni = []
  }
  const perTabella = new Map((indici.results as Array<{ tabella: string; n: number }>).map((r) => [r.tabella, r.n]))
  return {
    dimensione: dimensioneDa(tabelle.meta),
    limite: LIMITI_GRATUITI.d1Dimensione,
    tabelle: (tabelle.results as Array<{ name: string; sql: string }>).map((t) => ({
      nome: t.name,
      colonne: colonneDi(t.sql),
      indici: perTabella.get(t.name) ?? 0,
      sql: t.sql,
    })),
    migrazioni,
  }
}

/**
 * Le colonne di una tabella, lette dal suo CREATE TABLE: PRAGMA table_info
 * vorrebbe un'istruzione per tabella, e sono una settantina. Le righe dei
 * vincoli (PRIMARY KEY, UNIQUE, CHECK, FOREIGN KEY) non sono colonne; le
 * colonne aggiunte con ALTER TABLE SQLite le scrive nel CREATE.
 */
export function colonneDi(sql: string): string[] {
  const corpo = sql.slice(sql.indexOf('(') + 1, sql.lastIndexOf(')'))
  const parti: string[] = []
  let livello = 0
  let pezzo = ''
  for (const ch of corpo.replace(/--[^\n]*/g, '')) {
    if (ch === '(') livello += 1
    if (ch === ')') livello -= 1
    if (ch === ',' && livello === 0) {
      parti.push(pezzo)
      pezzo = ''
    } else pezzo += ch
  }
  parti.push(pezzo)
  return parti
    .map((p) => p.trim())
    .filter((p) => p && !/^(PRIMARY|UNIQUE|CHECK|FOREIGN|CONSTRAINT)\b/i.test(p))
    .map((p) => p.split(/\s+/)[0].replace(/^["`[]|["`\]]$/g, ''))
}

/** I nomi delle tabelle dell'app: per controllare quelli che arrivano dal pannello prima di metterli in una query. */
export async function nomiTabelle(db: D1Database): Promise<Set<string>> {
  const { results } = await db.prepare(`SELECT name FROM sqlite_master WHERE ${TABELLE_APP}`).all<{ name: string }>()
  return new Set(results.map((r) => r.name))
}

/** Le righe delle tabelle chieste, contate: costano una lettura per riga, quindi solo su richiesta. */
export async function conteggi(db: D1Database, tabelle: string[]): Promise<Record<string, number>> {
  const valide = await nomiTabelle(db)
  const scelte = tabelle.filter((t) => valide.has(t)).slice(0, 40)
  if (scelte.length === 0) return {}
  const risultati = await db.batch(scelte.map((t) => db.prepare(`SELECT COUNT(*) AS n FROM "${t}"`)))
  return Object.fromEntries(scelte.map((t, i) => [t, (risultati[i].results[0] as { n: number }).n]))
}

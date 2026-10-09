/**
 * Il SuperEnalotto sul server: le schede, l'estrazione e i premi.
 *
 * Non c'e' un orologio: ogni richiesta al gioco o alla scheda della Fortuna fa
 * quel che l'ora richiede (`assicura`). La prima dopo le 21 di un giorno di
 * estrazione pesca i quattro numeri con `crypto.getRandomValues` e li fissa
 * (`INSERT OR IGNORE`, poi la rilettura: il primo li sceglie, gli altri li
 * leggono); nessuno li vede prima delle 21:05, quando comincia la diretta. La
 * prima dopo la fine della diretta paga i premi: tutto in un batch, con
 * l'impronta del pagamento in `scrittura`, come il tavolo del blackjack, cosi'
 * due richieste insieme non pagano due volte. Un concorso rimasto indietro —
 * nessuno ha aperto il gioco quella sera — lo paga la prima richiesta dopo, nel
 * giorno dell'estrazione, e i concorsi si pagano in ordine, perché il jackpot
 * passa dall'uno all'altro.
 *
 * Una scheda costa un punto al saldo del giorno in cui la si compra, e i premi
 * vanno al saldo del giorno dell'estrazione: `fortuna_giornate` ha una riga per
 * giocatore e giorno, ricontata dalle schede (`ricontaSql`).
 */

import {
  COSTO_SCHEDA,
  SCHEDE_MASSIME,
  categoriaDi,
  concorsoAperto,
  estrai,
  jackpotDi,
  liquida,
  momentiDi,
  presiDi,
  quotaDi,
  schedaValida,
  ultimoConcorso,
  type CategoriaEnalotto,
  type PremioEnalotto,
} from '../../shared/superenalotto'
import { msToNextPuzzle, puzzleNumberFor } from '../../shared/daily'
import type { ConcorsoEnalottoVista, RiepilogoEnalotto, SchedaEnalotto, VistaEnalotto } from '../../shared/types'
import { nettoFortunaSql, saldoDi } from './fortuna'
import { fail, newId, nowIso } from './http'
import { aCaso } from './ruotaStore'
import { today } from './wordleStore'

interface ConcorsoRow {
  data: string
  numero: number
  estratti: string
  raccolta: number | null
  riporto: number | null
  premi: string | null
  jackpot: number | null
  pagato_at: string | null
}

interface SchedaRow {
  id: string
  concorso: string
  numeri: string
  presi: number | null
  vincita: number | null
}

/**
 * Il conto del SuperEnalotto di un giocatore in una giornata, in SQL: i premi
 * dei concorsi estratti quel giorno, meno le schede comprate quel giorno.
 * `giocatore` e `giorno` sono espressioni dell'istruzione che lo usa.
 */
function ricontaSql(giocatore: string, giorno: string): string {
  const comprate = `(SELECT COUNT(*) FROM enalotto_schede WHERE player_id = ${giocatore} AND giorno = ${giorno})`
  return `${giocatore}, ${giorno}, 'superenalotto',
          COALESCE((SELECT SUM(s.vincita) FROM enalotto_schede s JOIN enalotto_concorsi c ON c.data = s.concorso
                     WHERE s.player_id = ${giocatore} AND c.numero = ${giorno} AND s.vincita IS NOT NULL), 0)
          - ${comprate} * ${COSTO_SCHEDA},
          ${comprate}`
}

const RISCRIVI = `ON CONFLICT (player_id, puzzle_number, gioco) DO UPDATE SET netto = excluded.netto, giocate = excluded.giocate`

function riconta(db: D1Database, playerId: string, giorno: number): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO fortuna_giornate (player_id, puzzle_number, gioco, netto, giocate)
       SELECT ${ricontaSql('?1', '?2')} WHERE 1 ${RISCRIVI}`,
    )
    .bind(playerId, giorno)
}

/** Il jackpot che l'ultimo concorso pagato prima di `data` ha passato avanti, in centesimi. */
async function jackpotArrivato(db: D1Database, data: string): Promise<number> {
  const riga = await db
    .prepare('SELECT jackpot FROM enalotto_concorsi WHERE data < ? AND pagato_at IS NOT NULL ORDER BY data DESC LIMIT 1')
    .bind(data)
    .first<{ jackpot: number }>()
  return riga?.jackpot ?? 0
}

/** Il concorso di una data con i suoi numeri: se non sono ancora stati pescati, li pesca adesso. */
async function estrazioneDi(db: D1Database, data: string): Promise<ConcorsoRow> {
  const leggi = () => db.prepare('SELECT * FROM enalotto_concorsi WHERE data = ?').bind(data).first<ConcorsoRow>()
  const c = await leggi()
  if (c) return c
  await db
    .prepare('INSERT OR IGNORE INTO enalotto_concorsi (data, numero, estratti, created_at) VALUES (?, ?, ?, ?)')
    .bind(data, puzzleNumberFor(data), JSON.stringify(estrai(aCaso)), nowIso())
    .run()
  return (await leggi())!
}

/** Paga i premi di un concorso estratto: le schede, le loro vincite, e il conto della giornata di chi ha giocato. */
async function paga(db: D1Database, c: ConcorsoRow): Promise<void> {
  const estratti = JSON.parse(c.estratti) as number[]
  const [{ results }, riporto] = await Promise.all([
    db.prepare('SELECT numeri FROM enalotto_schede WHERE concorso = ?').bind(c.data).all<{ numeri: string }>(),
    jackpotArrivato(db, c.data),
  ])
  const vincitori: Record<CategoriaEnalotto, number> = { 4: 0, 3: 0, 2: 0 }
  for (const r of results) {
    const categoria = categoriaDi(presiDi(JSON.parse(r.numeri) as number[], estratti))
    if (categoria) vincitori[categoria] += 1
  }
  const { premi, jackpot } = liquida(results.length, riporto, vincitori)
  const premio = (k: CategoriaEnalotto) => premi.find((p) => p.categoria === k)!.premio
  const impronta = newId('pag')
  // Le istruzioni dopo la prima valgono solo se la prima ha preso il pagamento: e' lei che scrive l'impronta.
  const preso = `EXISTS (SELECT 1 FROM enalotto_concorsi WHERE data = ?2 AND scrittura = ?1)`
  await db.batch([
    db
      .prepare(
        `UPDATE enalotto_concorsi SET raccolta = ?, riporto = ?, premi = ?, jackpot = ?, pagato_at = ?, scrittura = ?
          WHERE data = ? AND pagato_at IS NULL`,
      )
      .bind(results.length, riporto, JSON.stringify(premi), jackpot, nowIso(), impronta, c.data),
    db
      .prepare(
        `UPDATE enalotto_schede
            SET presi = (SELECT COUNT(*) FROM json_each(enalotto_schede.numeri) AS n
                          WHERE n.value IN (SELECT value FROM json_each(?3)))
          WHERE concorso = ?2 AND ${preso}`,
      )
      .bind(impronta, c.data, c.estratti),
    db
      .prepare(
        `UPDATE enalotto_schede
            SET vincita = CASE WHEN presi >= 4 THEN ?3 WHEN presi = 3 THEN ?4 WHEN presi = 2 THEN ?5 ELSE 0 END
          WHERE concorso = ?2 AND ${preso}`,
      )
      .bind(impronta, c.data, premio(4), premio(3), premio(2)),
    db
      .prepare(
        `INSERT INTO fortuna_giornate (player_id, puzzle_number, gioco, netto, giocate)
         SELECT ${ricontaSql('p.player_id', '?3')}
           FROM (SELECT DISTINCT player_id FROM enalotto_schede WHERE concorso = ?2) AS p
          WHERE ${preso}
         ${RISCRIVI}`,
      )
      .bind(impronta, c.data, c.numero),
  ])
}

/**
 * Quel che l'ora richiede: i numeri dell'ultimo concorso chiuso, e i premi dei
 * concorsi la cui diretta e' finita. Di solito sono gia' fatti, e costa due letture.
 */
export async function assicura(db: D1Database, adesso = Date.now()): Promise<void> {
  const ultima = ultimoConcorso(adesso)
  if (!ultima) return
  const { results } = await db
    .prepare(
      `SELECT DISTINCT s.concorso FROM enalotto_schede s
         LEFT JOIN enalotto_concorsi c ON c.data = s.concorso
        WHERE s.concorso <= ? AND c.pagato_at IS NULL`,
    )
    .bind(ultima)
    .all<{ concorso: string }>()
  const date = [...new Set([...results.map((r) => r.concorso), ultima])].sort()
  for (const data of date) {
    const c = await estrazioneDi(db, data)
    if (c.pagato_at === null && adesso >= momentiDi(data).fine) await paga(db, c)
  }
}

const scheda = (r: SchedaRow): SchedaEnalotto => ({
  id: r.id,
  numeri: JSON.parse(r.numeri) as number[],
  presi: r.presi,
  vincita: r.vincita,
})

/** Lo stato del gioco per chi lo guarda: il concorso aperto, e l'ultimo estratto. */
export async function statoEnalotto(
  db: D1Database,
  playerId: string,
  adesso = Date.now(),
  assicurato = false,
): Promise<VistaEnalotto> {
  if (!assicurato) await assicura(db, adesso)
  const oggi = today(new Date(adesso))
  const aperto = concorsoAperto(adesso)
  const ultimo = ultimoConcorso(adesso)
  const date = [aperto, ultimo].filter((d): d is string => d !== null)
  const lista = JSON.stringify(date)
  const [fortuna, mie, conti, riga, arrivato] = await Promise.all([
    saldoDi(db, playerId, oggi.puzzleNumber),
    db
      .prepare(
        `SELECT id, concorso, numeri, presi, vincita FROM enalotto_schede
          WHERE player_id = ? AND concorso IN (SELECT value FROM json_each(?)) ORDER BY created_at`,
      )
      .bind(playerId, lista)
      .all<SchedaRow>(),
    db
      .prepare(
        `SELECT concorso, COUNT(*) AS n FROM enalotto_schede
          WHERE concorso IN (SELECT value FROM json_each(?)) GROUP BY concorso`,
      )
      .bind(lista)
      .all<{ concorso: string; n: number }>(),
    ultimo ? db.prepare('SELECT * FROM enalotto_concorsi WHERE data = ?').bind(ultimo).first<ConcorsoRow>() : null,
    jackpotArrivato(db, aperto ?? ultimo ?? '9999-12-31'),
  ])
  const quante = (d: string) => conti.results.find((r) => r.concorso === d)?.n ?? 0
  const vista = (data: string, jackpot: number): ConcorsoEnalottoVista => {
    const m = momentiDi(data)
    return {
      data,
      chiusuraFra: m.chiusura - adesso,
      inizioFra: m.inizio - adesso,
      fineFra: m.fine - adesso,
      jackpot,
      schede: quante(data),
      mie: mie.results.filter((r) => r.concorso === data).map(scheda),
    }
  }

  let fatto: VistaEnalotto['ultimo'] = null
  if (ultimo && riga) {
    const pagato = riga.pagato_at !== null
    const inDiretta = adesso >= momentiDi(ultimo).inizio
    // Il jackpot di quel concorso: dai conti del pagamento, o com'era alla chiusura.
    const jackpot = pagato
      ? Math.floor(((riga.riporto ?? 0) + quotaDi(4, riga.raccolta ?? 0)) / 100)
      : jackpotDi(await jackpotArrivato(db, ultimo), quante(ultimo))
    const base = vista(ultimo, jackpot)
    fatto = {
      ...base,
      // Prima della fine della diretta, quanti numeri ha preso una scheda lo dice la diretta.
      mie: pagato ? base.mie : base.mie.map((s) => ({ ...s, presi: null, vincita: null })),
      estratti: inDiretta ? (JSON.parse(riga.estratti) as number[]) : null,
      premi: pagato ? (JSON.parse(riga.premi!) as PremioEnalotto[]) : null,
      prossimoJackpot: pagato ? Math.floor((riga.jackpot ?? 0) / 100) : null,
    }
  }
  return {
    puzzleNumber: oggi.puzzleNumber,
    date: oggi.date,
    msToNextPuzzle: msToNextPuzzle(new Date(adesso)),
    classificate: fortuna.classificate,
    saldo: fortuna.saldo,
    netto: fortuna.netti.superenalotto,
    aperto: aperto ? vista(aperto, jackpotDi(arrivato, quante(aperto))) : null,
    ultimo: fatto,
  }
}

/** Il SuperEnalotto nella scheda della Fortuna, a estrazioni e premi gia' fatti (`assicura`). */
export async function riepilogoEnalotto(
  db: D1Database,
  playerId: string,
  adesso = Date.now(),
): Promise<RiepilogoEnalotto> {
  const v = await statoEnalotto(db, playerId, adesso, true)
  const diretta = v.ultimo && v.ultimo.fineFra > 0 ? { inizioFra: v.ultimo.inizioFra, fineFra: v.ultimo.fineFra } : null
  return {
    aperto: v.aperto?.data ?? null,
    jackpot: v.aperto?.jackpot ?? v.ultimo?.jackpot ?? 0,
    mie: v.aperto?.mie.length ?? 0,
    diretta,
  }
}

/**
 * Gioca delle schede per il concorso aperto. Il numero di schede e il saldo si
 * guardano dentro ogni `INSERT`, sulle righe gia' scritte: due telefoni che
 * giocano insieme non vanno oltre le cinque schede ne' oltre il saldo.
 */
export async function giocaSchede(db: D1Database, playerId: string, schede: unknown, adesso = Date.now()): Promise<void> {
  const concorso = concorsoAperto(adesso)
  if (!concorso) fail(409, 'CHIUSO', 'Il gioco è chiuso fino alla fine dell’estrazione.')
  if (!Array.isArray(schede) || schede.length === 0 || !schede.every(schedaValida)) {
    fail(400, 'SCHEDA', 'Ogni scheda ha quattro numeri diversi, da 1 a 20.')
  }
  const oggi = today(new Date(adesso))
  const [fortuna, gia] = await Promise.all([
    saldoDi(db, playerId, oggi.puzzleNumber),
    db
      .prepare('SELECT COUNT(*) AS n FROM enalotto_schede WHERE concorso = ? AND player_id = ?')
      .bind(concorso, playerId)
      .first<{ n: number }>(),
  ])
  if ((gia?.n ?? 0) + schede.length > SCHEDE_MASSIME) {
    fail(409, 'TROPPE_SCHEDE', `Si giocano al massimo ${SCHEDE_MASSIME} schede per estrazione.`)
  }
  if (fortuna.saldo < schede.length * COSTO_SCHEDA) {
    fail(409, 'POCHI_PUNTI', 'Il saldo non basta per queste schede.')
  }
  const adessoIso = new Date(adesso).toISOString()
  const scritture = schede.flatMap((numeri) => [
    db
      .prepare(
        `INSERT INTO enalotto_schede (id, concorso, player_id, numeri, giorno, created_at)
         SELECT ?3, ?4, ?1, ?5, ?2, ?6
          WHERE (SELECT COUNT(*) FROM enalotto_schede WHERE concorso = ?4 AND player_id = ?1) < ?7
            AND ?8 + ${nettoFortunaSql('?1', '?2')} >= ?9`,
      )
      .bind(
        playerId,
        oggi.puzzleNumber,
        newId('sch'),
        concorso,
        JSON.stringify([...numeri].sort((a, b) => a - b)),
        adessoIso,
        SCHEDE_MASSIME,
        fortuna.classificate,
        COSTO_SCHEDA,
      ),
    riconta(db, playerId, oggi.puzzleNumber),
  ])
  const esiti = await db.batch(scritture)
  if (esiti.some((e, i) => i % 2 === 0 && e.meta.changes !== 1)) {
    fail(409, 'CONFLITTO', 'Un’altra giocata è arrivata insieme a questa: ricarico.')
  }
}

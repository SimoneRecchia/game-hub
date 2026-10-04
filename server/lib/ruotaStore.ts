/**
 * Crazy Time sul server: quanti giri si vuole, ognuno con la sua puntata, presa
 * dal saldo di oggi — i punti delle classificate piu' quel che i giochi della
 * Fortuna, questo compreso, hanno gia' dato o tolto (server/lib/fortuna.ts).
 *
 * Come al casinò la puntata si paga subito: ogni giro nasce con `delta` uguale
 * alla puntata persa — o a quel che il triplo e lo split restituiscono subito,
 * meno la puntata — e solo un minigioco giocato lo cambia nella vincita meno la
 * puntata. Un minigioco lasciato a meta' quindi conta perso, e il giro dopo lo
 * chiude com'e'. La ruota fortunata non e' un giro nuovo: e' lo stesso giro,
 * con la stessa puntata, che continua.
 *
 * Tutto quel che e' a caso lo decide il server, con `crypto.getRandomValues`:
 * lo spicchio della ruota quando si gira, e con lui il moltiplicatore della
 * moneta, le dodici categorie della ruota del quiz e il muro mescolato del Cash
 * Hunt; lo spicchio della ruota fortunata quando la si gira; lo spicchio della
 * ruota del quiz quando si gira lei; il lato della moneta quando la si lancia;
 * la strada della pallina del Pachinko quando la si lascia cadere. Il browser
 * riceve solo dove fermare le ruote, la moneta e la pallina, e del muro solo
 * quali moltiplicatori ci sono, finché non si sceglie: chi sapesse dove sta il
 * ×5 non sceglierebbe a caso. La domanda si apre quando la si chiede, con il
 * suo tempo che parte li', come nel quiz.
 *
 * Il minigioco sta nel giro, in JSON (`sfida`): `fortunata` e' lo spicchio
 * della ruota fortunata, quando ci si e' arrivati da li', e i moltiplicatori
 * sono quelli della fortuna.
 *
 * D1 non ha transazioni interattive: il saldo si controlla dentro l'`INSERT`
 * del giro, sui conti gia' scritti di tutti i giochi della Fortuna, così due
 * puntate partite insieme non vanno oltre quel che c'e'; la chiave (giocatore,
 * giorno, numero) fa il resto. Ogni altra scrittura e' condizionata al giro
 * appena letto, e riscrive nello stesso batch il conto della giornata
 * (`ruota_giornate`), che e' quel che legge la classifica generale.
 */

import { msToNextPuzzle } from '../../shared/daily'
import type { CategoriaQuiz } from '../../shared/quiz'
import { rispostaGiusta, senzaRisposta, type DomandaCompleta } from '../../shared/quiz-domande'
import {
  CATEGORIE_RUOTA,
  DISPOSIZIONE_RUOTA,
  INTERVALLO_GIRI_MS,
  PUNTATA_MINIMA,
  SPICCHI_FORTUNATI,
  SPICCHI_QUIZ,
  SPICCHI_RUOTA,
  bucaDi,
  categorieDelQuiz,
  deltaDi,
  eSfida,
  mescolaMuro,
  moltiplicatoriMoneta,
  moltiplicatoriPachinko,
  moltiplicatoriQuiz,
  muroCashHunt,
  pagaSubito,
  percorsoACaso,
  puntataValida,
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

/**
 * Il minigioco come sta nel database: la domanda intera, con la risposta, e il
 * muro del Cash Hunt con ogni casella al suo posto. `fortunata` e' lo spicchio
 * della ruota fortunata da cui si e' arrivati; la fortuna lo ha anche quando la
 * ruota fortunata si e' fermata su un premio o sul banco, e il giro e' chiuso.
 */
type SfidaSalvata =
  | { tipo: 'fortuna'; fortunata?: number }
  | { tipo: 'moneta'; moltiplicatore: number; uscito?: LatoMoneta; fortunata?: number }
  | {
      tipo: 'domanda'
      categorie: CategoriaQuiz[]
      fortunata?: number
      spicchioQuiz?: number
      domanda?: DomandaCompleta
      scelta?: string | null
      giusta?: boolean
      ms?: number
    }
  | { tipo: 'pachinko'; fortunata?: number; percorso?: number[] }
  | { tipo: 'cashhunt'; fortunata?: number; muro: number[]; scelta?: number }

/** Un intero a caso fra zero e `n` escluso, senza la distorsione del modulo. */
export function aCaso(n: number): number {
  const limite = Math.floor(0x1_0000_0000 / n) * n
  const valori = new Uint32Array(1)
  for (;;) {
    crypto.getRandomValues(valori)
    if (valori[0] < limite) return valori[0] % n
  }
}

/** Uno spicchio a caso fra quelli che si possono giocare: tutti, tranne il quiz quando non ci sono domande. */
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

/**
 * Le categorie che oggi hanno ancora domande da dare al giocatore, fra quelle
 * della ruota: senza nessuna, il quiz non esce. Le righe di un formato vecchio
 * possono portare il nome di una materia invece che di una categoria, e qui non
 * passano.
 */
async function quizDisponibili(db: D1Database, playerId: string, numero: number): Promise<CategoriaQuiz[]> {
  const disponibili = await categorieDisponibili(db, playerId, numero)
  return CATEGORIE_RUOTA.filter((c) => disponibili.has(c))
}

/** Il moltiplicatore dello spicchio della ruota del quiz, quando la si e' girata. */
function moltiplicatoreDelQuiz(s: Extract<SfidaSalvata, { tipo: 'domanda' }>): number | null {
  if (s.spicchioQuiz === undefined) return null
  return moltiplicatoriQuiz(s.fortunata !== undefined)[s.spicchioQuiz] ?? null
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

/**
 * Il giro come lo vede chi gioca: la domanda senza la risposta finché non si
 * risponde, e il muro del Cash Hunt senza i posti finché non si sceglie.
 */
export function vistaGiro(row: GiroRow & { spicchio: number }, adesso: number): GiroRuota {
  const salvata = leggiSfida(row)
  const fortunata = salvata?.fortunata ?? null
  let sfida: SfidaRuotaVista | null = null
  if (salvata?.tipo === 'fortuna') {
    // Ferma su un premio o sul banco, la ruota fortunata ha chiuso il giro: non resta niente da giocare.
    sfida = row.stato === 'sfida' ? { tipo: 'fortuna' } : null
  } else if (salvata?.tipo === 'pachinko') {
    const moltiplicatori = moltiplicatoriPachinko(fortunata !== null)
    const percorso = salvata.percorso ?? null
    const buca = percorso ? bucaDi(percorso) : null
    const m = buca === null ? null : moltiplicatori[buca]
    sfida = {
      tipo: 'pachinko',
      fortunata: fortunata !== null,
      moltiplicatori: [...moltiplicatori],
      percorso,
      buca,
      moltiplicatore: m,
      vincita: m === null ? null : vincitaDi(row.puntata, m),
    }
  } else if (salvata?.tipo === 'cashhunt') {
    // Il muro intero esce solo a scelta fatta: prima si dice quali moltiplicatori ci sono, non dove.
    const scelta = salvata.scelta ?? null
    const m = scelta === null ? null : salvata.muro[scelta]
    sfida = {
      tipo: 'cashhunt',
      fortunata: fortunata !== null,
      valori: [...muroCashHunt(fortunata !== null)],
      muro: scelta === null ? null : [...salvata.muro],
      scelta,
      moltiplicatore: m,
      vincita: m === null ? null : vincitaDi(row.puntata, m),
    }
  } else if (salvata?.tipo === 'moneta') {
    sfida = {
      tipo: 'moneta',
      fortunata: fortunata !== null,
      moltiplicatore: salvata.moltiplicatore,
      vincita: vincitaDi(row.puntata, salvata.moltiplicatore),
      uscito: salvata.uscito ?? null,
    }
  } else if (salvata?.tipo === 'domanda') {
    const d = salvata.domanda
    const aperta = row.stato === 'domanda' && d && row.aperta_at
    const m = moltiplicatoreDelQuiz(salvata)
    sfida = {
      tipo: 'domanda',
      fortunata: fortunata !== null,
      categorie: salvata.categorie,
      spicchioQuiz: salvata.spicchioQuiz ?? null,
      categoria: salvata.spicchioQuiz === undefined ? null : (salvata.categorie[salvata.spicchioQuiz] ?? null),
      moltiplicatore: m,
      vincita: m === null ? null : vincitaDi(row.puntata, m),
      domanda: d ? senzaRisposta(d) : null,
      limiteMs: d ? limiteMs(d) : null,
      restanteMs: aperta ? Math.max(0, limiteMs(d) - (adesso - Date.parse(row.aperta_at!))) : null,
      risposta: row.stato === 'fatto' && d ? rispostaVista(d, salvata) : null,
    }
  }
  return {
    n: row.n,
    puntata: row.puntata,
    spicchio: row.spicchio,
    fortunata,
    stato: row.stato,
    delta: row.delta,
    sfida,
  }
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
 * Il minigioco di uno spicchio, deciso quando la ruota ci si ferma: la moneta
 * con il suo moltiplicatore, il quiz con le dodici categorie della sua ruota, il
 * Pachinko da lanciare, il Cash Hunt con il muro gia' mescolato, la fortuna da
 * girare. Il banco, lo split e i premi non ne hanno.
 */
function sfidaDi(s: Spicchio, fortunata: number | null, categorie: readonly CategoriaQuiz[]): SfidaSalvata | null {
  const daFortuna = fortunata === null ? {} : { fortunata }
  switch (s.tipo) {
    case 'moneta': {
      const moltiplicatori = moltiplicatoriMoneta(fortunata !== null)
      return { tipo: 'moneta', moltiplicatore: moltiplicatori[aCaso(moltiplicatori.length)], ...daFortuna }
    }
    case 'quiz':
      return { tipo: 'domanda', categorie: categorieDelQuiz(categorie, aCaso), ...daFortuna }
    case 'pachinko':
      return { tipo: 'pachinko', ...daFortuna }
    case 'cashhunt':
      return { tipo: 'cashhunt', muro: mescolaMuro(fortunata !== null, aCaso), ...daFortuna }
    case 'fortuna':
      return { tipo: 'fortuna' }
    default:
      return null
  }
}

/**
 * Un giro. Lo spicchio esce qui, e la puntata e' gia' pagata: il banco la
 * tiene, il triplo la restituisce per tre subito e lo split a meta', un
 * minigioco la puo' restituire moltiplicata. La moneta ha subito il suo
 * moltiplicatore, che si vede prima di lanciarla, il quiz le sue categorie, che
 * si vedono sulla sua ruota prima di girarla, e il Cash Hunt il suo muro, che
 * non si vede. Senza categorie con domande da dare il quiz non esce. Un
 * minigioco dell'ultimo giro lasciato a meta' si chiude: vale gia' perso.
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
  const categorie = await quizDisponibili(db, playerId, numero)
  const indice = spicchioACaso(SPICCHI_RUOTA, (s) => s.tipo !== 'quiz' || categorie.length > 0)
  const s = SPICCHI_RUOTA[indice]
  const sfida = sfidaDi(s, null, categorie)
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
        deltaDi(puntata, pagaSubito(s)),
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
 * La ruota fortunata: la ruota si e' fermata sulla fortuna, e si rigira con i
 * premi saliti. E' lo stesso giro, con la stessa puntata: un premio o il banco
 * lo chiudono, i minigiochi della fortuna lo portano avanti. Si gira una
 * volta: richiederla ridà quel che e' uscito. L'`UPDATE` e' condizionato alla
 * sfida appena letta, così due tocchi insieme non la girano due volte.
 */
export async function giraFortuna(db: D1Database, playerId: string): Promise<void> {
  const { row, sfida } = await giroConSfida(db, playerId)
  if (sfida.fortunata !== undefined) return
  if (sfida.tipo !== 'fortuna' || row.stato !== 'sfida') {
    fail(409, 'NESSUNA_FORTUNA', 'La ruota non si è fermata sulla fortuna.')
  }
  const categorie = await quizDisponibili(db, playerId, row.puzzle_number)
  const fortunata = spicchioACaso(SPICCHI_FORTUNATI, (s) => s.tipo !== 'quiz' || categorie.length > 0)
  const s = SPICCHI_FORTUNATI[fortunata]
  const nuova: SfidaSalvata = sfidaDi(s, fortunata, categorie) ?? { tipo: 'fortuna', fortunata }
  const chiude = !eSfida(s)
  const [esito] = await db.batch([
    db
      .prepare(
        `UPDATE ruota_giocate SET stato = ?, delta = ?, sfida = ?, updated_at = ?
          WHERE player_id = ? AND puzzle_number = ? AND n = ? AND stato = 'sfida' AND sfida = ?`,
      )
      .bind(
        chiude ? 'fatto' : 'sfida',
        deltaDi(row.puntata, pagaSubito(s)),
        JSON.stringify(nuova),
        nowIso(),
        playerId,
        row.puzzle_number,
        row.n,
        row.sfida,
      ),
    riconta(db, playerId, row.puzzle_number),
  ])
  if (esito.meta.changes !== 1) fail(409, 'CONFLITTO', 'La ruota fortunata è già girata: ricarico.')
}

/**
 * La ruota del quiz: si gira una volta, prima di aprire la domanda, e si ferma
 * su una categoria con il suo moltiplicatore. Lo spicchio esce qui; l'`UPDATE`
 * e' condizionato alla sfida appena letta, così due tocchi insieme non la
 * girano due volte, e una seconda richiesta ridà lo stesso spicchio.
 */
export async function giraQuiz(db: D1Database, playerId: string): Promise<void> {
  const { row, sfida } = await giroConSfida(db, playerId)
  if (sfida.tipo !== 'domanda') fail(409, 'NESSUN_QUIZ', 'La ruota non si è fermata sul quiz.')
  if (row.stato !== 'sfida') fail(409, 'CONFLITTO', 'La domanda è già aperta: ricarico.')
  if (sfida.spicchioQuiz !== undefined) return
  const nuova = { ...sfida, spicchioQuiz: aCaso(SPICCHI_QUIZ) }
  const esito = await db
    .prepare(
      `UPDATE ruota_giocate SET sfida = ?, updated_at = ?
        WHERE player_id = ? AND puzzle_number = ? AND n = ? AND stato = 'sfida' AND sfida = ?`,
    )
    .bind(JSON.stringify(nuova), nowIso(), playerId, row.puzzle_number, row.n, row.sfida)
    .run()
  if (esito.meta.changes !== 1) fail(409, 'CONFLITTO', 'La ruota del quiz è già girata: ricarico.')
}

/**
 * Apre la domanda: una a caso fra quelle della categoria uscita alla ruota del
 * quiz che il giocatore oggi non ha ancora avuto, e il tempo parte adesso.
 * Prima va girata la ruota del quiz; se e' gia' aperta la ridà com'e', con il
 * tempo che le resta.
 */
export async function apriDomanda(db: D1Database, playerId: string): Promise<void> {
  const { row, sfida } = await giroConSfida(db, playerId)
  if (sfida.tipo !== 'domanda') fail(409, 'NESSUNA_DOMANDA', 'Questo minigioco non è una domanda.')
  if (row.stato !== 'sfida') return
  const categoria = sfida.spicchioQuiz === undefined ? undefined : sfida.categorie[sfida.spicchioQuiz]
  if (!categoria) fail(409, 'RUOTA_QUIZ', 'Prima gira la ruota del quiz.')
  const scelta = await domandaNuova(db, playerId, row.puzzle_number, categoria, aCaso)
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
        deltaDi(row.puntata, giusta ? moltiplicatoreDelQuiz(sfida) : null),
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

/**
 * Il Pachinko: la pallina si lascia cadere adesso, e la sua strada esce qui, una
 * fila alla volta, a sinistra o a destra una volta su due. La buca dove finisce
 * da' il moltiplicatore, e il giro si chiude. Si lancia una volta: chiederlo
 * ancora ridà la strada di prima.
 */
export async function lanciaPachinko(db: D1Database, playerId: string): Promise<void> {
  const { row, sfida } = await giroConSfida(db, playerId)
  if (sfida.tipo !== 'pachinko') fail(409, 'NESSUN_PACHINKO', 'La ruota non si è fermata sul Pachinko.')
  if (sfida.percorso) return
  if (row.stato !== 'sfida') fail(409, 'CONFLITTO', 'La pallina è già caduta: ricarico.')
  const percorso = percorsoACaso(aCaso)
  const m = moltiplicatoriPachinko(sfida.fortunata !== undefined)[bucaDi(percorso)]
  const [esito] = await db.batch([
    db
      .prepare(
        `UPDATE ruota_giocate SET stato = 'fatto', delta = ?, sfida = ?, updated_at = ?
          WHERE player_id = ? AND puzzle_number = ? AND n = ? AND stato = 'sfida' AND sfida = ?`,
      )
      .bind(
        deltaDi(row.puntata, m),
        JSON.stringify({ ...sfida, percorso }),
        nowIso(),
        playerId,
        row.puzzle_number,
        row.n,
        row.sfida,
      ),
    riconta(db, playerId, row.puzzle_number),
  ])
  if (esito.meta.changes !== 1) fail(409, 'CONFLITTO', 'La pallina è già caduta: ricarico.')
}

/**
 * Il Cash Hunt: si sceglie una casella del muro, che il server ha mescolato
 * quando la ruota si e' fermata, e il suo moltiplicatore chiude il giro. Da
 * adesso il muro intero si vede. Si sceglie una volta: un'altra scelta ridà la
 * prima.
 */
export async function scegliCashHunt(db: D1Database, playerId: string, casella: number): Promise<void> {
  const { row, sfida } = await giroConSfida(db, playerId)
  if (sfida.tipo !== 'cashhunt') fail(409, 'NESSUN_CASH_HUNT', 'La ruota non si è fermata sul Cash Hunt.')
  if (sfida.scelta !== undefined) return
  if (row.stato !== 'sfida') fail(409, 'CONFLITTO', 'La casella è già scelta: ricarico.')
  const [esito] = await db.batch([
    db
      .prepare(
        `UPDATE ruota_giocate SET stato = 'fatto', delta = ?, sfida = ?, updated_at = ?
          WHERE player_id = ? AND puzzle_number = ? AND n = ? AND stato = 'sfida' AND sfida = ?`,
      )
      .bind(
        deltaDi(row.puntata, sfida.muro[casella]),
        JSON.stringify({ ...sfida, scelta: casella }),
        nowIso(),
        playerId,
        row.puzzle_number,
        row.n,
        row.sfida,
      ),
    riconta(db, playerId, row.puzzle_number),
  ])
  if (esito.meta.changes !== 1) fail(409, 'CONFLITTO', 'La casella è già scelta: ricarico.')
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
    fortunata: nostro ? (leggiSfida(row)?.fortunata ?? null) : null,
  }
}

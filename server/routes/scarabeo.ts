import { Hono } from 'hono'
import { msToNextPuzzle } from '../../shared/daily'
import { MOSSE_PER_GIORNATA, TESSERE_LEGGIO, leggiiDa, sacchettoDelGiorno, type Mossa } from '../../shared/scarabeo'
import type { ScarabeoState, ScarabeoSummary, StatisticheScarabeoLibero } from '../../shared/types'
import { LIVELLI, statoLibera, type Livello } from '../../shared/scarabeo-computer'
import { MOSSE_MASSIME_LIBERA } from '../../shared/scarabeo-due'
import { sacchettoDaSeme } from '../../shared/scarabeo'
import { puntiScarabeo } from '../../shared/punti'
import type { AppEnv } from '../types'
import { fail, newId, nowIso } from '../lib/http'
import { requireVerified } from '../lib/session'
import {
  aggiungiMossa,
  apriPartita,
  computerDelGiorno,
  controllaPosa,
  giornata,
  leggiPosa,
  mosseDi,
  partitaDi,
  statisticheLibere,
  statoDa,
  type ComputerRow,
  type PartitaRow,
} from '../lib/scarabeoStore'
import { compagniaBreve, pagaOspiti } from '../lib/compagniaStore'
import { controllaNelDizionario } from '../lib/dizionario'
import { riepilogoScarabeo } from '../lib/riepiloghi'

/**
 * La partita di oggi di chi muove, con il riferimento del computer.
 *
 * Chi gioca la giornata in compagnia non muove: la partita e' dell'host, e la
 * sua resta chiusa — sono le stesse tessere, e le ha viste giocare.
 */
async function perMuovere(db: D1Database, playerId: string): Promise<{ row: PartitaRow; computer: ComputerRow }> {
  const quando = giornata()
  const [row, computer] = await Promise.all([
    apriPartita(db, playerId, quando),
    computerDelGiorno(db, quando.puzzleNumber),
  ])
  if (row.in_compagnia) {
    fail(409, 'GIOCATA_INSIEME', 'Oggi lo Scarabeo lo giochi in compagnia: le mosse sono di chi ti ha invitato.')
  }
  return { row, computer }
}

/** Dopo ogni mossa dell'host, chi gioca con lui ha i suoi punti; alla fine la giornata si chiude per tutti. */
function aggiornaOspiti(db: D1Database, row: PartitaRow) {
  return pagaOspiti(db, 'scarabeo', row.player_id, row.puzzle_number, row.punti, row.status === 'done')
}

/** Quanti giocano: chi gioca e, nelle giornate a turni, il computer del giorno. */
function giocatoriDi(row: PartitaRow): 1 | 2 {
  return row.contro_computer === 1 ? 2 : 1
}

/**
 * La risposta del computer del giorno, arrivata con la mia mossa: controllata
 * come una mia. Il computer pensa nel telefono — cercare una mossa costa
 * decine di millisecondi, e qui se ne hanno dieci — e il server non puo'
 * rifarla, ma puo' controllare che sia una mossa vera: le tessere del suo
 * leggio, una posa che sta in piedi, parole che esistono, un cambio con il
 * sacchetto che ne ha. Che sia proprio quella del computer non lo sa: chi
 * volesse barare allo Scarabeo ha gia' il motore nel telefono, e non serve
 * che scelga anche le mosse dell'avversario.
 *
 * Le giornate di prima, da soli, non hanno risposta.
 */
async function rispostaControllata(
  env: AppEnv['Bindings'],
  url: string,
  row: PartitaRow,
  sacchetto: readonly string[],
  mosse: readonly Mossa[],
  body: unknown,
): Promise<{ mossa: Mossa; punti: number } | null> {
  if (row.contro_computer !== 1) return null
  // Risponde anche alla mia decima mossa, ma non a una partita finita prima, con un leggio vuoto a sacchetto vuoto.
  if (partitaDi(row, mosse).tocca !== 1) return null
  const r = (body as { risposta?: unknown } | null)?.risposta as
    | { tipo?: unknown; posa?: unknown; tessere?: unknown }
    | undefined
  if (!r) fail(422, 'RISPOSTA_MANCANTE', 'Manca la mossa del computer: riprova.')
  if (r.tipo === 'passo') return { mossa: { tipo: 'passo' }, punti: 0 }
  if (r.tipo === 'cambio') {
    const { leggii, restanti } = leggiiDa(sacchetto, mosse, 2)
    const tessere = Array.isArray(r.tessere) ? r.tessere.map((t) => String(t)) : []
    const mano = [...leggii[1]]
    const sue = tessere.every((t) => {
      const i = mano.indexOf(t)
      if (i >= 0) mano.splice(i, 1)
      return i >= 0
    })
    if (tessere.length === 0 || restanti === 0 || !sue) fail(422, 'RISPOSTA', 'La mossa del computer non è valida.')
    return { mossa: { tipo: 'cambio', tessere }, punti: 0 }
  }
  // Una posa che non sta in piedi: i messaggi di `leggiPosa` e `controllaPosa` parlerebbero a chi gioca.
  const controllata = (() => {
    try {
      const posa = leggiPosa({ posa: r.posa })
      return { posa, esito: controllaPosa(sacchetto, mosse, 2, posa) }
    } catch {
      return null
    }
  })()
  if (r.tipo !== 'posa' || !controllata) fail(422, 'RISPOSTA', 'La mossa del computer non è valida.')
  const { posa, esito } = controllata
  await controllaNelDizionario(env, url, esito.parole.map((p) => p.parola), {
    chi: 'La mossa del computer non va: ',
    codice: 'RISPOSTA',
  })
  return { mossa: { tipo: 'posa', posa }, punti: esito.punti }
}

export const scarabeoRoutes = new Hono<AppEnv>()

  .use('*', requireVerified)

  /** La partita di oggi, creata al primo accesso. */
  .get('/state', async (c) => {
    const quando = giornata()
    const [row, computer] = await Promise.all([
      apriPartita(c.env.DB, c.get('player').id, quando),
      computerDelGiorno(c.env.DB, quando.puzzleNumber),
    ])
    const stato = statoDa(row, computer, msToNextPuzzle())
    // Chi gioca in compagnia lo deve sapere qui: la schermata lo porta alla partita dell'host.
    if (row.in_compagnia) stato.inCompagnia = await compagniaBreve(c.env.DB, row.in_compagnia, row.assist_score)
    return c.json<ScarabeoState>(stato)
  })

  /**
   * Riepilogo per la card dell'hub.
   *
   * Di sola lettura: aprire l'hub non deve creare la partita del giorno,
   * altrimenti comparirebbero giornate iniziate e mai giocate — la stessa
   * regola di `/wordle/summary`.
   */
  .get('/summary', async (c) =>
    c.json<ScarabeoSummary>(await riepilogoScarabeo(c.env.DB, c.get('player').id)),
  )

  /** Gioca una posa: nelle giornate a turni, con la risposta del computer del giorno. */
  .post('/mossa', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const posa = leggiPosa(body)
    const { row, computer } = await perMuovere(c.env.DB, c.get('player').id)
    if (row.status === 'done' || row.turns >= MOSSE_PER_GIORNATA) {
      fail(409, 'MOSSE_FINITE', 'Le mosse di oggi sono finite.')
    }

    const mosse = mosseDi(row)
    const sacchetto = sacchettoDelGiorno(row.puzzle_number)
    const esito = controllaPosa(sacchetto, mosse, giocatoriDi(row), posa)
    /*
     * Il dizionario si interroga **dopo** la validazione geometrica: se la posa
     * non sta in piedi non c'e' motivo di leggerlo, e la risposta piu' utile e'
     * quella sulla forma della mossa.
     */
    await controllaNelDizionario(c.env, c.req.url, esito.parole.map((p) => p.parola))

    const mossa: Mossa = { tipo: 'posa', posa }
    const risposta = await rispostaControllata(c.env, c.req.url, row, sacchetto, [...mosse, mossa], body)
    const aggiornata = await aggiungiMossa(c.env.DB, row, computer, mossa, esito.punti, risposta)
    await aggiornaOspiti(c.env.DB, aggiornata)
    return c.json<ScarabeoState>(statoDa(aggiornata, computer, msToNextPuzzle()))
  })

  /**
   * Passa la mossa.
   *
   * Costa una mossa come una posa. Senza quel costo, passare sarebbe gratis e
   * il limite di dieci mosse non vorrebbe dire niente.
   */
  .post('/passo', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const { row, computer } = await perMuovere(c.env.DB, c.get('player').id)
    if (row.status === 'done' || row.turns >= MOSSE_PER_GIORNATA) {
      fail(409, 'MOSSE_FINITE', 'Le mosse di oggi sono finite.')
    }

    const mossa: Mossa = { tipo: 'passo' }
    const sacchetto = sacchettoDelGiorno(row.puzzle_number)
    const risposta = await rispostaControllata(c.env, c.req.url, row, sacchetto, [...mosseDi(row), mossa], body)
    const aggiornata = await aggiungiMossa(c.env.DB, row, computer, mossa, 0, risposta)
    await aggiornaOspiti(c.env.DB, aggiornata)
    return c.json<ScarabeoState>(statoDa(aggiornata, computer, msToNextPuzzle()))
  })

  /**
   * Cambia delle tessere: tornano in fondo al sacchetto e se ne pescano altre.
   *
   * Costa una mossa, e serve il sacchetto non vuoto: a sacchetto finito non ci
   * sarebbe niente da pescare e il cambio sarebbe solo un modo di bruciare una
   * mossa per niente.
   */
  .post('/cambio', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { tessere?: unknown }
    const chieste = Array.isArray(body.tessere) ? body.tessere.map((t) => String(t)) : []
    if (chieste.length === 0) fail(400, 'CAMBIO_VUOTO', 'Scegli almeno una tessera da cambiare.')

    const { row, computer } = await perMuovere(c.env.DB, c.get('player').id)
    if (row.status === 'done' || row.turns >= MOSSE_PER_GIORNATA) {
      fail(409, 'MOSSE_FINITE', 'Le mosse di oggi sono finite.')
    }

    const mosse = mosseDi(row)
    const sacchetto = sacchettoDelGiorno(row.puzzle_number)
    const { leggio, restanti } = partitaDi(row, mosse)
    if (restanti === 0) fail(409, 'SACCHETTO_VUOTO', 'Il sacchetto è vuoto: non puoi cambiare.')

    const mano = [...leggio]
    for (const t of chieste) {
      const i = mano.indexOf(t)
      if (i < 0) fail(409, 'LEGGIO', 'Stai cambiando una tessera che non hai.')
      mano.splice(i, 1)
    }

    const mossa: Mossa = { tipo: 'cambio', tessere: chieste }
    const risposta = await rispostaControllata(c.env, c.req.url, row, sacchetto, [...mosse, mossa], body)
    const aggiornata = await aggiungiMossa(c.env.DB, row, computer, mossa, 0, risposta)
    await aggiornaOspiti(c.env.DB, aggiornata)
    return c.json<ScarabeoState>(statoDa(aggiornata, computer, msToNextPuzzle()))
  })

  /**
   * Chiude la giornata prima di aver usato tutte le mosse.
   *
   * Non regala e non toglie punti: serve a chi ha finito le idee e vuole che il
   * suo punteggio entri in classifica come definitivo invece di restare "in
   * corso" fino a mezzanotte.
   */
  .post('/chiudi', async (c) => {
    const { row, computer } = await perMuovere(c.env.DB, c.get('player').id)
    if (row.status === 'done') {
      return c.json<ScarabeoState>(statoDa(row, computer, msToNextPuzzle()))
    }

    const esito = await c.env.DB
      .prepare(
        `UPDATE scarabeo_games SET status = 'done', finished_at = ?
          WHERE id = ? AND turns = ?`,
      )
      .bind(new Date().toISOString(), row.id, row.turns)
      .run()
    if (esito.meta.changes !== 1) {
      fail(409, 'CONFLITTO', 'La partita è cambiata nel frattempo: ricarico.')
    }

    // I punti sono solo i miei: nelle giornate a turni le mosse del computer sono nella stessa lista.
    const { punti } = partitaDi(row, mosseDi(row))
    const chiusa: PartitaRow = { ...row, status: 'done', score: punti, punti: puntiScarabeo(punti, computer.punti) }
    await aggiornaOspiti(c.env.DB, chiusa)
    return c.json<ScarabeoState>(statoDa(chiusa, computer, msToNextPuzzle()))
  })

  /* ─────────────────────────  Le partite libere  ───────────────────────── */

  /** Le statistiche delle partite libere contro il computer. */
  .get('/libera', async (c) => {
    return c.json<StatisticheScarabeoLibero>(await statisticheLibere(c.env.DB, c.get('player').id))
  })

  /**
   * Una partita libera finita, per le statistiche.
   *
   * Si gioca nel browser — il computer gira lì, perché cercare una mossa costa
   * decine di millisecondi e il Worker ne ha dieci — e qui arriva a partita
   * chiusa. Il server non si fida dei numeri: la rigioca dalle mosse sul
   * sacchetto del suo seme, e conta lui chi ha vinto. Non la confronta col
   * dizionario, perché non ci sono punti in classifica da proteggere.
   */
  .post('/libera', async (c) => {
    const corpo = ((await c.req.json().catch(() => ({}))) ?? {}) as {
      seme?: unknown
      livello?: unknown
      mosse?: unknown
    }
    const seme = Number(corpo.seme)
    if (!Number.isInteger(seme) || seme < 0 || seme > 0xffff_ffff) fail(400, 'SEME', 'La partita non è valida.')
    if (!LIVELLI.includes(corpo.livello as Livello)) fail(400, 'LIVELLO', 'Livello sconosciuto.')
    const mosse = leggiMosse(corpo.mosse)

    const stato = statoLibera({ seme, livello: corpo.livello as Livello, mosse }, sacchettoDaSeme(seme))
    if (!stato.finita || !stato.esito) fail(422, 'NON_FINITA', 'La partita non è finita.')
    const illegale = stato.giocate.some((g) => g.tipo === 'posa' && g.parole.length === 0)
    if (illegale) fail(422, 'MOSSA', 'Una delle mosse non è valida.')

    await c.env.DB.prepare(
      `INSERT OR IGNORE INTO scarabeo_partite_libere
         (id, player_id, livello, seme, mosse, punti, punti_computer, esito, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        newId('slib'),
        c.get('player').id,
        corpo.livello as Livello,
        seme,
        JSON.stringify(mosse),
        stato.mieiPunti,
        stato.puntiComputer,
        stato.esito,
        nowIso(),
      )
      .run()
    return c.json<StatisticheScarabeoLibero>(await statisticheLibere(c.env.DB, c.get('player').id), 201)
  })

/**
 * Le mosse di una partita libera, ripulite come quelle della classificata: solo
 * i campi che servono, con i tipi giusti. La libera va fino in fondo al
 * sacchetto: ogni parola posa almeno una delle centoventi tessere, e fra due
 * parole ci stanno al piu' cinque turni senza, quindi `MOSSE_MASSIME_LIBERA`
 * basta e avanza.
 */
function leggiMosse(valore: unknown): Mossa[] {
  if (!Array.isArray(valore) || valore.length > MOSSE_MASSIME_LIBERA) fail(400, 'MOSSE', 'La partita non è valida.')
  return valore.map((m) => {
    const x = (m ?? {}) as { tipo?: unknown; posa?: unknown; tessere?: unknown }
    if (x.tipo === 'passo') return { tipo: 'passo' }
    if (x.tipo === 'cambio') {
      if (!Array.isArray(x.tessere)) fail(400, 'MOSSE', 'La partita non è valida.')
      return { tipo: 'cambio', tessere: x.tessere.map((t) => String(t)).slice(0, TESSERE_LEGGIO) }
    }
    if (x.tipo === 'posa') return { tipo: 'posa', posa: leggiPosa({ posa: x.posa }) }
    return fail(400, 'MOSSE', 'La partita non è valida.')
  })
}

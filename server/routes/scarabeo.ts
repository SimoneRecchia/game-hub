import { Hono } from 'hono'
import { msToNextPuzzle } from '../../shared/daily'
import {
  JOLLY,
  MOSSE_PER_GIORNATA,
  TESSERE_LEGGIO,
  leggioDa,
  rigioca,
  sacchettoDelGiorno,
  tabelloneDa,
  validaPosa,
  type Mossa,
  type Posa,
} from '../../shared/scarabeo'
import type { ScarabeoState, ScarabeoSummary } from '../../shared/types'
import type { AppEnv } from '../types'
import { fail } from '../lib/http'
import { requireVerified } from '../lib/session'
import {
  aggiungiMossa,
  apriPartita,
  giornata,
  mosseDi,
  paroleSconosciute,
  statoDa,
} from '../lib/scarabeoStore'

/**
 * Le posizioni arrivate dal client, ripulite.
 *
 * Tutto quel che viene da fuori e' da trattare come sospetto: una posa con
 * coordinate finte o con una lettera che non e' sul leggio sarebbe un modo di
 * fabbricarsi un punteggio. La forma la controlla questa funzione, la legalita'
 * della mossa `validaPosa`, e il possesso delle tessere `verificaLeggio`.
 */
function leggiPosa(body: unknown): Posa[] {
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
function verificaLeggio(leggio: readonly string[], posa: readonly Posa[]): void {
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

export const scarabeoRoutes = new Hono<AppEnv>()

  .use('*', requireVerified)

  /** La partita di oggi, creata al primo accesso. */
  .get('/state', async (c) => {
    const quando = giornata()
    const row = await apriPartita(c.env.DB, c.get('player').id, quando)
    return c.json<ScarabeoState>(statoDa(row, msToNextPuzzle()))
  })

  /**
   * Riepilogo per la card dell'hub.
   *
   * Di sola lettura: aprire l'hub non deve creare la partita del giorno,
   * altrimenti comparirebbero giornate iniziate e mai giocate — la stessa
   * regola di `/wordle/summary`.
   */
  .get('/summary', async (c) => {
    const quando = giornata()
    const row = await c.env.DB
      .prepare(
        `SELECT status, turns, score, mosse FROM scarabeo_games
          WHERE player_id = ? AND puzzle_number = ?`,
      )
      .bind(c.get('player').id, quando.puzzleNumber)
      .first<{ status: 'playing' | 'done'; turns: number; score: number; mosse: string }>()

    return c.json<ScarabeoSummary>({
      puzzleNumber: quando.puzzleNumber,
      date: quando.date,
      status: row ? row.status : 'new',
      punti: row?.score ?? 0,
      mosseUsate: row?.turns ?? 0,
      mosseTotali: MOSSE_PER_GIORNATA,
      msToNextPuzzle: msToNextPuzzle(),
    })
  })

  /** Gioca una posa. */
  .post('/mossa', async (c) => {
    const posa = leggiPosa(await c.req.json().catch(() => ({})))
    const quando = giornata()
    const row = await apriPartita(c.env.DB, c.get('player').id, quando)

    if (row.status === 'done' || row.turns >= MOSSE_PER_GIORNATA) {
      fail(409, 'MOSSE_FINITE', 'Le mosse di oggi sono finite.')
    }

    const mosse = mosseDi(row)
    const { leggio } = leggioDa(sacchettoDelGiorno(row.puzzle_number), mosse)
    verificaLeggio(leggio, posa)

    const tabellone = tabelloneDa(mosse)
    const primaMossa = !mosse.some((m) => m.tipo === 'posa')
    const esito = validaPosa(tabellone, posa, primaMossa)
    if (!esito.ok) fail(422, esito.codice, esito.errore)

    /*
     * Il dizionario si interroga **dopo** la validazione geometrica: se la posa
     * non sta in piedi non c'e' motivo di chiedere al database, e la risposta
     * piu' utile e' quella sulla forma della mossa.
     */
    const sconosciute = await paroleSconosciute(
      c.env.DB,
      esito.parole.map((p) => p.parola),
    )
    if (sconosciute.length > 0) {
      const elenco = sconosciute.map((p) => `"${p.toUpperCase()}"`).join(', ')
      fail(
        422,
        'PAROLA_SCONOSCIUTA',
        sconosciute.length === 1
          ? `${elenco} non è nel dizionario.`
          : `${elenco} non sono nel dizionario.`,
      )
    }

    const mossa: Mossa = { tipo: 'posa', posa }
    const aggiornata = await aggiungiMossa(c.env.DB, row, mossa, esito.punti)
    return c.json<ScarabeoState>(statoDa(aggiornata, msToNextPuzzle()))
  })

  /**
   * Passa la mossa.
   *
   * Costa una mossa come una posa. Senza quel costo, passare sarebbe gratis e
   * il limite di dieci mosse non vorrebbe dire niente.
   */
  .post('/passo', async (c) => {
    const quando = giornata()
    const row = await apriPartita(c.env.DB, c.get('player').id, quando)
    if (row.status === 'done' || row.turns >= MOSSE_PER_GIORNATA) {
      fail(409, 'MOSSE_FINITE', 'Le mosse di oggi sono finite.')
    }

    const aggiornata = await aggiungiMossa(c.env.DB, row, { tipo: 'passo' }, 0)
    return c.json<ScarabeoState>(statoDa(aggiornata, msToNextPuzzle()))
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

    const quando = giornata()
    const row = await apriPartita(c.env.DB, c.get('player').id, quando)
    if (row.status === 'done' || row.turns >= MOSSE_PER_GIORNATA) {
      fail(409, 'MOSSE_FINITE', 'Le mosse di oggi sono finite.')
    }

    const mosse = mosseDi(row)
    const { leggio, restanti } = leggioDa(sacchettoDelGiorno(row.puzzle_number), mosse)
    if (restanti === 0) fail(409, 'SACCHETTO_VUOTO', 'Il sacchetto è vuoto: non puoi cambiare.')

    const mano = [...leggio]
    for (const t of chieste) {
      const i = mano.indexOf(t)
      if (i < 0) fail(409, 'LEGGIO', 'Stai cambiando una tessera che non hai.')
      mano.splice(i, 1)
    }

    const aggiornata = await aggiungiMossa(c.env.DB, row, { tipo: 'cambio', tessere: chieste }, 0)
    return c.json<ScarabeoState>(statoDa(aggiornata, msToNextPuzzle()))
  })

  /**
   * Chiude la giornata prima di aver usato tutte le mosse.
   *
   * Non regala e non toglie punti: serve a chi ha finito le idee e vuole che il
   * suo punteggio entri in classifica come definitivo invece di restare "in
   * corso" fino a mezzanotte.
   */
  .post('/chiudi', async (c) => {
    const quando = giornata()
    const row = await apriPartita(c.env.DB, c.get('player').id, quando)
    if (row.status === 'done') {
      return c.json<ScarabeoState>(statoDa(row, msToNextPuzzle()))
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

    const { punti } = rigioca(mosseDi(row))
    return c.json<ScarabeoState>(
      statoDa({ ...row, status: 'done', score: punti }, msToNextPuzzle()),
    )
  })

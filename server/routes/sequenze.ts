import { Hono, type Context } from 'hono'
import { msToNextPuzzle } from '../../shared/daily'
import { SEQUENZE_PER_TURNO, TURNI_SEQUENZE, leggiTocchi, rispostaGiusta } from '../../shared/sequenze'
import type { SequenzeMossa, SequenzeStato, SequenzeSummary } from '../../shared/types'
import type { AppEnv } from '../types'
import { fail } from '../lib/http'
import { requireVerified } from '../lib/session'
import { riepilogoSequenze } from '../lib/riepiloghi'
import {
  apriPartita,
  chiudiAperta,
  giornata,
  inCorso,
  partitaDi,
  salvaPartita,
  sequenzaAperta,
  sequenzeDelGiorno,
  statoDa,
  statoVuoto,
  turniDi,
  type PartitaRow,
} from '../lib/sequenzeStore'
import { sfideSequenze } from './sequenzeSfide'

interface Corpo {
  versione?: unknown
  tocchi?: unknown
}

async function corpoDi(c: Context<AppEnv>): Promise<Corpo> {
  return (await c.req.json().catch(() => ({}))) as Corpo
}

/** La versione mandata dal client deve essere quella letta: altrimenti ha uno stato vecchio, e rilegge. */
function controllaVersione(corpo: Corpo, row: PartitaRow): void {
  if (Number(corpo.versione) !== row.versione) {
    fail(409, 'CONFLITTO', 'La partita è cambiata su un altro dispositivo: ricarico.')
  }
}

function mossa(row: PartitaRow, giusta: boolean | null, sequenza: number[] | null): SequenzeMossa {
  return { ...statoDa(row, msToNextPuzzle()), giusta, sequenza }
}

export const sequenzeRoutes = new Hono<AppEnv>()

  .use('*', requireVerified)

  /** La sfida fra amici, che ha le sue rotte. */
  .route('/sfide', sfideSequenze)

  /**
   * La giornata di oggi. Non apre niente: la riga nasce con il primo turno, e
   * guardare la pagina non fa comparire nessuno "in corso" in classifica. Una
   * sequenza rimasta aperta si chiude come sbagliata: la pagina si e'
   * riaperta, e la sequenza si vede una volta.
   */
  .get('/state', async (c) => {
    const quando = giornata()
    const letta = await partitaDi(c.env.DB, c.get('player').id, quando.puzzleNumber)
    if (!letta) return c.json<SequenzeStato>(statoVuoto(quando, msToNextPuzzle()))
    const row = await chiudiAperta(c.env.DB, letta, Date.now())
    return c.json<SequenzeStato>(statoDa(row, msToNextPuzzle()))
  })

  /** Riepilogo per la card dell'hub: di sola lettura. */
  .get('/summary', async (c) => c.json<SequenzeSummary>(await riepilogoSequenze(c.env.DB, c.get('player').id)))

  /**
   * Comincia il turno dopo, e manda la sua prima sequenza, di tre cubetti. Fra
   * un turno e l'altro ci si ferma quanto si vuole. Un turno con una sequenza
   * gia' uscita non si ricomincia: un doppio tocco non la fa rivedere.
   */
  .post('/turno', async (c) => {
    const corpo = await corpoDi(c)
    const adesso = Date.now()
    const quando = giornata()
    const row = await apriPartita(c.env.DB, c.get('player').id, quando)
    const turni = turniDi(row)
    if (row.status === 'done' || (turni.length >= TURNI_SEQUENZE && inCorso(turni) === null)) {
      fail(409, 'GIORNATA_FINITA', 'Le sequenze di oggi sono finite.')
    }
    if (inCorso(turni) !== null) fail(409, 'TURNO_APERTO', 'Questo turno è già cominciato.')
    controllaVersione(corpo, row)
    const giorno = await sequenzeDelGiorno(c.env.DB, quando.puzzleNumber)
    const dopo = await salvaPartita(c.env.DB, row, [...turni, { g: 0, ms: 0, c: 0 }], adesso, adesso)
    return c.json<SequenzeMossa>(mossa(dopo, null, giorno[turni.length][0]))
  })

  /**
   * La risposta alla sequenza aperta: i cubetti toccati, tutti, o fino al
   * primo sbagliato. Giusta, il turno va avanti e la risposta porta la
   * sequenza dopo, con un cubetto in piu'; sbagliata, o giusta all'ultima di
   * nove, il turno si chiude.
   */
  .post('/risposta', async (c) => {
    const corpo = await corpoDi(c)
    const adesso = Date.now()
    const quando = giornata()
    const row = await partitaDi(c.env.DB, c.get('player').id, quando.puzzleNumber)
    if (!row || row.status === 'done' || row.aperta_at === null) {
      fail(409, 'NESSUNA_SEQUENZA', 'Non c’è una sequenza aperta.')
    }
    controllaVersione(corpo, row)
    const turni = turniDi(row)
    const giorno = await sequenzeDelGiorno(c.env.DB, quando.puzzleNumber)
    const aperta = sequenzaAperta(giorno, turni)
    if (!aperta) fail(409, 'NESSUNA_SEQUENZA', 'Non c’è una sequenza aperta.')
    const tocchi = leggiTocchi(corpo.tocchi, aperta.sequenza.length)
    if (!tocchi) fail(400, 'TOCCHI', 'Risposta non valida.')
    const giusta = rispostaGiusta(aperta.sequenza, tocchi)
    const turno = turni[aperta.turno]
    const giuste = turno.g + (giusta ? 1 : 0)
    const ultima = giuste >= SEQUENZE_PER_TURNO
    const ms = giusta ? Math.max(0, adesso - Date.parse(row.aperta_at)) : 0
    const nuovo = { ...turno, g: giuste, ms: turno.ms + ms, c: giusta && !ultima ? (0 as const) : (1 as const) }
    const continua = giusta && !ultima
    const dopo = await salvaPartita(
      c.env.DB,
      row,
      turni.map((t, i) => (i === aperta.turno ? nuovo : t)),
      continua ? adesso : null,
      adesso,
    )
    return c.json<SequenzeMossa>(mossa(dopo, giusta, continua ? giorno[aperta.turno][giuste] : null))
  })

import { Hono, type Context } from 'hono'
import { msToNextPuzzle } from '../../shared/daily'
import { PARTITE_TRIS } from '../../shared/tris'
import type { TrisStato, TrisSummary } from '../../shared/types'
import type { AppEnv } from '../types'
import { fail } from '../lib/http'
import { requireVerified } from '../lib/session'
import { riepilogoTris } from '../lib/riepiloghi'
import {
  apriSerie,
  chiudiScaduta,
  conLaMossa,
  esitoPerChiGioca,
  giornata,
  inCorso,
  mosseIniziali,
  partiteDi,
  salvaSerie,
  serieDi,
  statoDa,
  statoVuoto,
  type SerieRow,
} from '../lib/trisStore'

interface Corpo {
  versione?: unknown
  casella?: unknown
}

async function corpoDi(c: Context<AppEnv>): Promise<Corpo> {
  return (await c.req.json().catch(() => ({}))) as Corpo
}

/** La versione mandata dal client deve essere quella letta: altrimenti ha uno stato vecchio, e rilegge. */
function controllaVersione(corpo: Corpo, row: SerieRow): void {
  if (Number(corpo.versione) !== row.versione) {
    fail(409, 'CONFLITTO', 'La partita è cambiata su un altro dispositivo: ricarico.')
  }
}

/** La serie di oggi con il tempo scaduto gia' applicato, o null se non e' cominciata. */
async function serieDiOggi(c: Context<AppEnv>, adesso: number): Promise<SerieRow | null> {
  const quando = giornata()
  const row = await serieDi(c.env.DB, c.get('player').id, quando.puzzleNumber)
  return row ? chiudiScaduta(c.env.DB, row, adesso) : null
}

function stato(c: Context<AppEnv>, row: SerieRow, adesso: number) {
  return c.json<TrisStato>(statoDa(row, adesso, msToNextPuzzle()))
}

export const trisRoutes = new Hono<AppEnv>()

  .use('*', requireVerified)

  /**
   * La serie di oggi. Non apre niente: la riga nasce con la prima partita, e
   * guardare la pagina non fa comparire nessuno "in corso" in classifica. Una
   * mossa il cui tempo e' scaduto la chiude come persa.
   */
  .get('/state', async (c) => {
    const adesso = Date.now()
    const row = await serieDiOggi(c, adesso)
    if (!row) return c.json<TrisStato>(statoVuoto(giornata(), msToNextPuzzle()))
    return stato(c, row, adesso)
  })

  /** Riepilogo per la card dell'hub: di sola lettura. */
  .get('/summary', async (c) => c.json<TrisSummary>(await riepilogoTris(c.env.DB, c.get('player').id)))

  /**
   * Comincia la partita dopo: la prima, o quella dopo una finita. Se comincia
   * il computer la sua prima mossa e' gia' nella risposta, e da li' parte il
   * tempo della mossa di chi gioca.
   */
  .post('/partita', async (c) => {
    const corpo = await corpoDi(c)
    const adesso = Date.now()
    const quando = giornata()
    const aperta = await apriSerie(c.env.DB, c.get('player').id, quando)
    controllaVersione(corpo, aperta)
    const row = await chiudiScaduta(c.env.DB, aperta, adesso)
    const partite = partiteDi(row)
    if (row.status === 'done' || partite.length >= PARTITE_TRIS) fail(409, 'SERIE_FINITA', 'La serie di oggi è finita.')
    // Una partita gia' in corso (un doppio tocco, un altro telefono) si riprende, non se ne apre un'altra.
    if (inCorso(partite)) return stato(c, row, adesso)
    const k = partite.length
    const nuova = { m: mosseIniziali(row.puzzle_number, k), e: null }
    const dopo = await salvaSerie(c.env.DB, row, [...partite, nuova], adesso)
    return stato(c, dopo, adesso)
  })

  /**
   * Una mossa nella partita in corso, e la risposta del computer nella stessa
   * richiesta. Se il tempo era scaduto la mossa non vale: la partita e' persa,
   * e la risposta lo dice (`tempo`).
   */
  .post('/mossa', async (c) => {
    const corpo = await corpoDi(c)
    const adesso = Date.now()
    const quando = giornata()
    const letta = await serieDi(c.env.DB, c.get('player').id, quando.puzzleNumber)
    if (!letta) fail(409, 'NESSUNA_PARTITA', 'Non c’è una partita in corso.')
    controllaVersione(corpo, letta)
    const row = await chiudiScaduta(c.env.DB, letta, adesso)
    if (row !== letta) return stato(c, row, adesso)

    const partite = partiteDi(row)
    const corrente = inCorso(partite)
    if (!corrente || row.status === 'done') fail(409, 'NESSUNA_PARTITA', 'Non c’è una partita in corso.')
    const k = partite.length - 1
    const casella = typeof corpo.casella === 'number' ? corpo.casella : Number.NaN
    const mosse = conLaMossa(row.puzzle_number, k, corrente.m, casella)
    if (!mosse) fail(400, 'MOSSA', 'Mossa non valida.')
    const dopo = await salvaSerie(
      c.env.DB,
      row,
      partite.map((p) => (p === corrente ? { m: mosse, e: esitoPerChiGioca(mosse, k) } : p)),
      adesso,
    )
    return stato(c, dopo, adesso)
  })

  /**
   * Il tempo della mossa e' finito sul telefono: la partita in corso e' persa.
   * Lo dice chi gioca, quindi non si aspetta il margine della rete: e' una
   * resa, e non puo' che costargli.
   */
  .post('/tempo', async (c) => {
    const corpo = await corpoDi(c)
    const adesso = Date.now()
    const quando = giornata()
    const row = await serieDi(c.env.DB, c.get('player').id, quando.puzzleNumber)
    if (!row) fail(409, 'NESSUNA_PARTITA', 'Non c’è una partita in corso.')
    const partite = partiteDi(row)
    const corrente = inCorso(partite)
    // Gia' chiusa (dal server, o dall'altra richiesta di un doppio tocco): basta lo stato.
    if (!corrente || row.status === 'done' || Number(corpo.versione) !== row.versione) {
      return stato(c, await chiudiScaduta(c.env.DB, row, adesso), adesso)
    }
    const dopo = await salvaSerie(
      c.env.DB,
      row,
      partite.map((p) => (p === corrente ? { m: p.m, e: 'persa' as const, t: 1 as const } : p)),
      adesso,
    )
    return stato(c, dopo, adesso)
  })

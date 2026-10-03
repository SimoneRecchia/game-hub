import { Hono, type Context } from 'hono'
import { msToNextPuzzle } from '../../shared/daily'
import { LETTERE_NOMI, TEMPO_NOMI_MS, type LetteraNomi } from '../../shared/nomi-cose'
import type { NomiStato, NomiSummary } from '../../shared/types'
import type { AppEnv } from '../types'
import { fail } from '../lib/http'
import { requireVerified } from '../lib/session'
import { riepilogoNomi } from '../lib/riepiloghi'
import { lessicoPer } from '../lib/lessicoNomi'
import {
  apriPartita,
  categorieDi,
  chiudi,
  fissaGiornata,
  formeRiconosciute,
  fuoriTempo,
  giornata,
  giornataDi,
  leggiRisposte,
  partitaDi,
  risposteDi,
  risultatoDi,
  salvaRisposte,
  scaduta,
  statoDa,
  type FormeNomi,
  type GiornataNomiRow,
  type PartitaNomiRow,
  type RisposteNomi,
} from '../lib/nomiStore'

/**
 * Le forme che il lessico riconosce, per dire subito quali risposte valgono.
 * Il lessico e' un file statico: se non si legge, la consegna va avanti lo
 * stesso, e lo dira' la notte.
 */
async function formeDelleRisposte(
  c: Context<AppEnv>,
  g: GiornataNomiRow,
  risposte: RisposteNomi,
): Promise<FormeNomi | null> {
  if (!LETTERE_NOMI.includes(g.lettera as LetteraNomi)) return null
  const categorie = categorieDi(g)
  try {
    const lessico = await lessicoPer(c.env, c.req.url, g.lettera as LetteraNomi, categorie)
    return formeRiconosciute(lessico, g.lettera, categorie, risposte)
  } catch (errore) {
    console.error('Nomi, cose e città: lessico non letto', errore)
    return null
  }
}

/** Chiude la partita aperta il cui tempo e' finito, con le risposte salvate. */
async function chiudiScaduta(c: Context<AppEnv>, row: PartitaNomiRow, adesso: number): Promise<PartitaNomiRow> {
  if (!scaduta(row, adesso)) return row
  const g = await giornataDi(c.env.DB, row.puzzle_number)
  const risposte = risposteDi(row)
  const forme = g ? await formeDelleRisposte(c, g, risposte) : null
  return chiudi(c.env.DB, row, risposte, TEMPO_NOMI_MS, forme, adesso)
}

async function stato(c: Context<AppEnv>, row: PartitaNomiRow | null, adesso: number) {
  const quando = giornata()
  const [g, ieri] = await Promise.all([
    row ? giornataDi(c.env.DB, quando.puzzleNumber) : null,
    risultatoDi(c.env.DB, c.get('player').id, quando.puzzleNumber - 1),
  ])
  return c.json<NomiStato>(statoDa(quando, row, g, ieri, adesso, msToNextPuzzle()))
}

/** La partita aperta di oggi, per scriverci: c'e', ed e' del giorno; il tempo scaduto la chiude. */
async function partitaPerScrivere(c: Context<AppEnv>, adesso: number) {
  const quando = giornata()
  const letta = await partitaDi(c.env.DB, c.get('player').id, quando.puzzleNumber)
  if (!letta) fail(409, 'NESSUNA_PARTITA', 'Non c’è una partita in corso.')
  const row = await chiudiScaduta(c, letta, adesso)
  const g = await giornataDi(c.env.DB, row.puzzle_number)
  if (!g) fail(409, 'NESSUNA_PARTITA', 'Non c’è una partita in corso.')
  return { row, g }
}

export const nomiRoutes = new Hono<AppEnv>()

  .use('*', requireVerified)

  /**
   * La partita di oggi, e il risultato di ieri contato stanotte. Non apre
   * niente: guardare la pagina non fa partire il tempo e non mostra la
   * lettera. Una partita il cui tempo e' finito si chiude qui, con le risposte
   * salvate.
   */
  .get('/state', async (c) => {
    const adesso = Date.now()
    const letta = await partitaDi(c.env.DB, c.get('player').id, giornata().puzzleNumber)
    return stato(c, letta ? await chiudiScaduta(c, letta, adesso) : null, adesso)
  })

  /** Riepilogo per la card dell'hub: di sola lettura. */
  .get('/summary', async (c) => c.json<NomiSummary>(await riepilogoNomi(c.env.DB, c.get('player').id)))

  /**
   * Comincia: si fissa la giornata, nasce la partita e parte il tempo. La
   * risposta ha la lettera e le categorie. Chi ha gia' cominciato riprende la
   * sua: il tempo non riparte.
   */
  .post('/inizia', async (c) => {
    const adesso = Date.now()
    const quando = giornata()
    await fissaGiornata(c.env.DB, quando.puzzleNumber)
    const row = await apriPartita(c.env.DB, c.get('player').id, quando)
    return stato(c, await chiudiScaduta(c, row, adesso), adesso)
  })

  /**
   * Le risposte mentre si scrive, tutte insieme: se il telefono si spegne a
   * meta', quel che c'era scritto vale lo stesso. Fuori tempo non si salvano
   * piu'.
   */
  .post('/risposte', async (c) => {
    const corpo = (await c.req.json().catch(() => ({}))) as { risposte?: unknown }
    const adesso = Date.now()
    const { row, g } = await partitaPerScrivere(c, adesso)
    if (row.status !== 'playing') return stato(c, row, adesso)
    const risposte = leggiRisposte(corpo.risposte, categorieDi(g))
    if (!risposte) fail(400, 'RISPOSTE', 'Risposte non valide.')
    return stato(c, await salvaRisposte(c.env.DB, row, risposte, adesso), adesso)
  })

  /**
   * La consegna: le risposte finali, e il tempo da quando si e' cominciato. La
   * risposta dice subito quali risposte il gioco conosce; i punti arrivano la
   * notte. Arrivata dopo il tempo, valgono le risposte salvate fino ad allora.
   */
  .post('/consegna', async (c) => {
    const corpo = (await c.req.json().catch(() => ({}))) as { risposte?: unknown }
    const adesso = Date.now()
    const { row, g } = await partitaPerScrivere(c, adesso)
    if (row.status !== 'playing' || fuoriTempo(row, adesso)) return stato(c, row, adesso)
    const risposte = leggiRisposte(corpo.risposte, categorieDi(g))
    if (!risposte) fail(400, 'RISPOSTE', 'Risposte non valide.')
    const forme = await formeDelleRisposte(c, g, risposte)
    const tempo = adesso - Date.parse(row.iniziata_at)
    return stato(c, await chiudi(c.env.DB, row, risposte, tempo, forme, adesso), adesso)
  })

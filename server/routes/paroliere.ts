import { Hono, type Context } from 'hono'
import { msToNextPuzzle } from '../../shared/daily'
import {
  LETTERE_MASSIME,
  LETTERE_MINIME,
  MARGINE_PAROLIERE_MS,
  normalizzaParoliere,
  puntiParola,
  stradaDi,
  type ParoliereDelGiorno,
} from '../../shared/paroliere'
import type { EsitoParolaParoliere, ParoliereParola, ParoliereStato, ParoliereSummary } from '../../shared/types'
import type { AppEnv } from '../types'
import { fail } from '../lib/http'
import { requireVerified } from '../lib/session'
import { riepilogoParoliere } from '../lib/riepiloghi'
import { paroleSconosciute } from '../lib/dizionario'
import {
  aggiungiParola,
  chiudiPartita,
  chiudiScaduta,
  cominciaPartita,
  fineDi,
  giornata,
  paroleDi,
  paroliereDelGiorno,
  partitaDi,
  statoDa,
  type PartitaRow,
} from '../lib/paroliereStore'

/** La griglia di oggi, o un 503 se la notte non l'ha ancora scritta. */
async function giornoDiOggi(c: Context<AppEnv>): Promise<ParoliereDelGiorno> {
  const giorno = await paroliereDelGiorno(c.env.DB, giornata().puzzleNumber)
  if (!giorno) fail(503, 'PAROLIERE_ASSENTE', 'Il Paroliere di oggi non è ancora pronto. Riprova più tardi.')
  return giorno
}

function stato(row: PartitaRow | null, giorno: ParoliereDelGiorno, adesso: number): ParoliereStato {
  return statoDa(row, giorno, giornata(), adesso, msToNextPuzzle())
}

export const paroliereRoutes = new Hono<AppEnv>()

  .use('*', requireVerified)

  /**
   * La partita di oggi. Non apre niente, e senza partita la griglia non esce:
   * si vede quando si gira la clessidra. Una partita il cui tempo e' finito
   * si chiude con le parole che aveva.
   */
  .get('/state', async (c) => {
    const adesso = Date.now()
    const giorno = await giornoDiOggi(c)
    const letta = await partitaDi(c.env.DB, c.get('player').id, giornata().puzzleNumber)
    const row = letta ? await chiudiScaduta(c.env.DB, letta, giorno, adesso) : null
    return c.json<ParoliereStato>(stato(row, giorno, adesso))
  })

  /** Riepilogo per la card dell'hub: di sola lettura. */
  .get('/summary', async (c) => c.json<ParoliereSummary>(await riepilogoParoliere(c.env.DB, c.get('player').id)))

  /** Gira la clessidra: da qui partono i tre minuti, e la griglia si vede. Una partita gia' cominciata si riprende. */
  .post('/inizia', async (c) => {
    const adesso = Date.now()
    const giorno = await giornoDiOggi(c)
    const letta = await cominciaPartita(c.env.DB, c.get('player').id, giornata())
    const row = await chiudiScaduta(c.env.DB, letta, giorno, adesso)
    return c.json<ParoliereStato>(stato(row, giorno, adesso))
  })

  /**
   * Una parola. Vale se e' di tre lettere almeno, se si scrive sulla griglia
   * passando da un dado a uno vicino, se il dizionario la conosce e se non
   * c'era gia'; arrivata dopo il tempo (e il margine della rete) non vale. La
   * risposta dice com'e' andata, con lo stato: una parola che non vale non si
   * scrive, e il tempo corre.
   */
  .post('/parola', async (c) => {
    const corpo = (await c.req.json().catch(() => ({}))) as { parola?: unknown }
    const adesso = Date.now()
    const giorno = await giornoDiOggi(c)
    const letta = await partitaDi(c.env.DB, c.get('player').id, giornata().puzzleNumber)
    if (!letta) fail(409, 'NON_COMINCIATA', 'La partita non è ancora cominciata.')
    const testo = typeof corpo.parola === 'string' ? corpo.parola : ''
    if (testo.length > 40) fail(400, 'PAROLA', 'Parola non valida.')
    const parola = normalizzaParoliere(testo)
    const rispondi = (row: PartitaRow, esito: EsitoParolaParoliere) =>
      c.json<ParoliereParola>({
        ...stato(row, giorno, adesso),
        esito,
        parola,
        valore: esito === 'nuova' ? puntiParola(parola.length) : 0,
      })
    if (letta.status === 'done' || adesso > fineDi(letta) + MARGINE_PAROLIERE_MS) {
      return rispondi(await chiudiScaduta(c.env.DB, letta, giorno, adesso), 'tempo')
    }
    if (parola.length < LETTERE_MINIME) return rispondi(letta, 'corta')
    if (parola.length > LETTERE_MASSIME || !stradaDi(giorno.griglia, parola)) return rispondi(letta, 'griglia')
    if (paroleDi(letta).includes(parola)) return rispondi(letta, 'gia')
    const sconosciute = await paroleSconosciute(c.env, c.req.url, [parola]).catch(() =>
      fail(503, 'DIZIONARIO_ASSENTE', 'Il dizionario non risponde: riprova tra poco.'),
    )
    if (sconosciute.length > 0) return rispondi(letta, 'sconosciuta')
    const scritta = await aggiungiParola(c.env.DB, letta, parola, giorno)
    if (!scritta) {
      const riletta = (await partitaDi(c.env.DB, letta.player_id, letta.puzzle_number)) ?? letta
      return rispondi(riletta, riletta.status === 'done' ? 'tempo' : 'gia')
    }
    return rispondi(scritta, 'nuova')
  })

  /** "Basta": la partita si chiude prima del tempo, con le parole trovate. A tempo finito fa lo stesso. */
  .post('/fine', async (c) => {
    const adesso = Date.now()
    const giorno = await giornoDiOggi(c)
    const letta = await partitaDi(c.env.DB, c.get('player').id, giornata().puzzleNumber)
    if (!letta) fail(409, 'NON_COMINCIATA', 'La partita non è ancora cominciata.')
    const row = await chiudiPartita(c.env.DB, letta, giorno)
    return c.json<ParoliereStato>(stato(row, giorno, adesso))
  })

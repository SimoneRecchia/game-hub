import { Hono } from 'hono'
import { msToNextPuzzle } from '../../shared/daily'
import type { QuizDatiRisposta, QuizEsito, QuizState, QuizSummary } from '../../shared/types'
import type { AppEnv } from '../types'
import { fail } from '../lib/http'
import { requireVerified } from '../lib/session'
import {
  apriDomanda,
  chiudiScaduta,
  giornata,
  cittaDati,
  geometrieDati,
  giornataObbligatoria,
  partitaDi,
  registraRisposta,
  riassuntoDati,
  risposteDi,
  statoDa,
  versioneDati,
} from '../lib/quizStore'
import { riepilogoQuiz } from '../lib/riepiloghi'

/** Una scelta e' un id di opzione o di un posto sulla cartina: corto, e di caratteri semplici. */
function leggiScelta(valore: unknown): string | null {
  if (valore === null || valore === undefined) return null
  if (typeof valore !== 'string' || !/^[A-Za-z0-9:_-]{1,40}$/.test(valore)) {
    fail(400, 'SCELTA', 'La risposta non è valida.')
  }
  return valore
}

/**
 * Una risposta che a quell'indirizzo non cambia piu': il browser la tiene per
 * sempre. Se la versione chiesta e' vecchia arriva la nuova, ma senza cache,
 * perché quell'indirizzo non e' suo.
 */
function perSempre(versioneGiusta: boolean): Record<string, string> {
  return {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': versioneGiusta ? 'private, max-age=31536000, immutable' : 'no-store',
  }
}

export const quizRoutes = new Hono<AppEnv>()
  .use('*', requireVerified)

  /**
   * Il quiz di oggi, per come e' andato finora. Non apre la partita — guardare
   * la pagina non fa partire niente — ma chiude la domanda rimasta aperta oltre
   * il tempo, che e' una risposta non data.
   */
  .get('/state', async (c) => {
    const db = c.env.DB
    const quando = giornata()
    const g = await giornataObbligatoria(db, quando.puzzleNumber)
    const adesso = Date.now()
    const row = await chiudiScaduta(db, await partitaDi(db, c.get('player').id, quando.puzzleNumber), g, adesso)
    return c.json<QuizState>(statoDa(row, g, quando, adesso, msToNextPuzzle()))
  })

  /** Riepilogo per la card dell'hub: di sola lettura, come quello degli altri giochi. */
  .get('/summary', async (c) => c.json<QuizSummary>(await riepilogoQuiz(c.env.DB, c.get('player').id)))

  /**
   * La prossima domanda: la apre, e il suo tempo parte adesso. Alla prima crea
   * la partita. Se una domanda e' gia' aperta la ridà com'e', con il tempo che
   * le resta.
   */
  .post('/domanda', async (c) => {
    const db = c.env.DB
    const quando = giornata()
    const g = await giornataObbligatoria(db, quando.puzzleNumber)
    const io = c.get('player').id
    const adesso = Date.now()
    // Una domanda scaduta mentre si era via si chiude prima di aprire la prossima.
    await chiudiScaduta(db, await partitaDi(db, io, quando.puzzleNumber), g, adesso)
    const row = await apriDomanda(db, io, quando, g)
    return c.json<QuizState>(statoDa(row, g, quando, Date.now(), msToNextPuzzle()))
  })

  /**
   * La risposta alla domanda aperta: un'opzione, un posto della cartina, o null
   * se il tempo e' finito. `indice` e' il numero della domanda, perché una
   * risposta arrivata in ritardo non finisca sulla domanda dopo.
   */
  .post('/risposta', async (c) => {
    const corpo = (await c.req.json().catch(() => ({}))) as { indice?: unknown; scelta?: unknown }
    const scelta = leggiScelta(corpo.scelta)
    const db = c.env.DB
    const quando = giornata()
    const g = await giornataObbligatoria(db, quando.puzzleNumber)
    const row = await partitaDi(db, c.get('player').id, quando.puzzleNumber)
    if (!row) fail(409, 'NESSUNA_DOMANDA', 'Il quiz di oggi non è ancora cominciato.')
    if (row.status === 'done') fail(409, 'FINITA', 'Il quiz di oggi è già finito.')
    if (Number(corpo.indice) !== risposteDi(row).length) {
      fail(409, 'CONFLITTO', 'Questa domanda ha già una risposta: ricarico.')
    }
    const adesso = Date.now()
    const { row: dopo, risposta } = await registraRisposta(db, row, g, scelta, adesso)
    return c.json<QuizEsito>({ risposta, stato: statoDa(dopo, g, quando, adesso, msToNextPuzzle()) })
  })

  /**
   * Il riassunto dei dati per le partite libere. Il browser manda la versione
   * che ha: se e' quella, la risposta e' due parole, altrimenti arrivano i
   * cento kB — di solito una volta ogni molte settimane.
   */
  .get('/dati', async (c) => {
    const db = c.env.DB
    const sua = c.req.query('versione') ?? ''
    const versione = await versioneDati(db)
    if (!versione) fail(503, 'DATI_ASSENTI', 'I dati del quiz non sono ancora pronti. Riprova più tardi.')
    if (sua === versione) return c.json<QuizDatiRisposta>({ versione, dati: null })
    const riassunto = await riassuntoDati(db)
    if (!riassunto) fail(503, 'DATI_ASSENTI', 'I dati del quiz non sono ancora pronti. Riprova più tardi.')
    return c.body(`{"versione":${JSON.stringify(riassunto.versione)},"dati":${riassunto.json}}`, 200, {
      'content-type': 'application/json; charset=utf-8',
    })
  })

  /** Le geometrie di fiumi e laghi, per la cartina, della versione che dice il riassunto. */
  .get('/geometrie', async (c) => {
    const geo = await geometrieDati(c.env.DB)
    if (!geo) fail(503, 'DATI_ASSENTI', 'Le geometrie del quiz non sono ancora pronte. Riprova più tardi.')
    return c.body(geo.json, 200, perSempre(c.req.query('v') === geo.versione))
  })

  /** Le città della categoria delle città: come le geometrie, a parte e per versione. */
  .get('/citta', async (c) => {
    const citta = await cittaDati(c.env.DB)
    if (!citta) fail(503, 'DATI_ASSENTI', 'Le città del quiz non sono ancora pronte. Riprova più tardi.')
    return c.body(citta.json, 200, perSempre(c.req.query('v') === citta.versione))
  })

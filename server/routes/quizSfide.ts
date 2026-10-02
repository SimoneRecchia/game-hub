import { Hono, type Context } from 'hono'
import { sceltaValida } from '../../shared/quiz'
import { impostazioniSfida, type LatoSfida } from '../../shared/quiz-sfida'
import type { SalaQuiz, SfidaQuizInviata, VistaDuello } from '../../shared/types'
import type { AppEnv } from '../types'
import { eOnline } from '../lib/battagliaStore'
import { fail } from '../lib/http'
import {
  accettaLinkQuiz,
  accettaSfidaQuiz,
  aggiornaDuello,
  chiudiSfida,
  duelloPerId,
  esciDalDuello,
  giocatoriPerSfida,
  inDuello,
  latoNelDuello,
  leggiDomande,
  mandaSfidaQuiz,
  rispondiNelDuello,
  rivincitaInAttesa,
  segnaPronto,
  sfidaInviata,
  sfidaPerId,
  ultimaSfidaMandata,
  vistaDuello,
  type DuelloRow,
} from '../lib/quizSfideStore'

/**
 * Le sfide a quiz: si montano dentro le rotte del quiz (`/quiz/sfide`,
 * `/quiz/duelli`), che controllano la sessione per tutte. Da sole non ne
 * hanno una.
 */

async function corpoDi(c: Context<AppEnv>): Promise<Record<string, unknown>> {
  return ((await c.req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>
}

/** Le impostazioni e le domande di una sfida nuova, dal corpo della richiesta. */
function leggiSfida(corpo: Record<string, unknown>) {
  const imp = impostazioniSfida(corpo.impostazioni)
  if (!imp) fail(400, 'IMPOSTAZIONI', 'Scelte non valide per una sfida.')
  return { imp, domande: leggiDomande(corpo.domande, imp) }
}

export const sfideQuiz = new Hono<AppEnv>()

  /** Chi si puo' sfidare adesso, e la sfida mandata che aspetta ancora. */
  .get('/sala', async (c) => {
    const db = c.env.DB
    const io = c.get('player').id
    const adesso = Date.now()
    const [giocatori, sfida] = await Promise.all([giocatoriPerSfida(db, io, adesso), ultimaSfidaMandata(db, io, adesso)])
    return c.json<SalaQuiz>({ giocatori, sfida })
  })

  /** Sfida un giocatore online, con le domande fatte dal proprio browser. */
  .post('/', async (c) => {
    const db = c.env.DB
    const io = c.get('player').id
    const corpo = await corpoDi(c)
    const altro = typeof corpo.playerId === 'string' ? corpo.playerId : ''
    if (!altro) fail(400, 'BAD_REQUEST', 'Manca il giocatore da sfidare.')
    if (altro === io) fail(400, 'SFIDA_A_SE', 'Non puoi sfidare te stesso.')
    const { imp, domande } = leggiSfida(corpo)
    const adesso = Date.now()
    const [online, mio, suo] = await Promise.all([
      eOnline(db, altro, adesso),
      inDuello(db, io, adesso),
      inDuello(db, altro, adesso),
    ])
    if (mio) fail(409, 'IN_SFIDA', 'Hai già una sfida in corso: finiscila prima.')
    if (!online) fail(409, 'NON_ONLINE', 'Non è più online.')
    if (suo) fail(409, 'OCCUPATO', 'Sta già giocando un’altra sfida.')
    const row = await mandaSfidaQuiz(db, io, altro, imp, domande, adesso)
    return c.json<SfidaQuizInviata>(await sfidaInviata(db, row, adesso), 201)
  })

  /** Un invito con un link: vale un'ora, e lo usa chi lo apre per primo. */
  .post('/link', async (c) => {
    const db = c.env.DB
    const { imp, domande } = leggiSfida(await corpoDi(c))
    const adesso = Date.now()
    const row = await mandaSfidaQuiz(db, c.get('player').id, null, imp, domande, adesso)
    return c.json<SfidaQuizInviata>(await sfidaInviata(db, row, adesso), 201)
  })

  /** Accetta l'invito del link: e' la rotta che chiama la pagina dell'invito appena c'e' un giocatore. */
  .post('/link/:codice/accetta', async (c) => {
    const duelloId = await accettaLinkQuiz(c.env.DB, c.req.param('codice'), c.get('player').id, Date.now())
    return c.json({ duelloId })
  })

  /** La sfida mandata, per chi aspetta: e' accettata quando ha un duello. */
  .get('/:id', async (c) => {
    const db = c.env.DB
    const row = await sfidaPerId(db, c.req.param('id'))
    if (!row || row.da_id !== c.get('player').id) fail(404, 'SFIDA_NON_TROVATA', 'Sfida non trovata.')
    return c.json<SfidaQuizInviata>(await sfidaInviata(db, row, Date.now()))
  })

  .post('/:id/annulla', async (c) => {
    const db = c.env.DB
    const row = await sfidaPerId(db, c.req.param('id'))
    if (!row || row.da_id !== c.get('player').id) fail(404, 'SFIDA_NON_TROVATA', 'Sfida non trovata.')
    await chiudiSfida(db, row.id, 'annullata', Date.now())
    return c.json({ ok: true })
  })

  .post('/:id/rifiuta', async (c) => {
    const db = c.env.DB
    const row = await sfidaPerId(db, c.req.param('id'))
    if (!row || row.a_id !== c.get('player').id) fail(404, 'SFIDA_NON_TROVATA', 'Sfida non trovata.')
    await chiudiSfida(db, row.id, 'rifiutata', Date.now())
    return c.json({ ok: true })
  })

  .post('/:id/accetta', async (c) => {
    const db = c.env.DB
    const row = await sfidaPerId(db, c.req.param('id'))
    const io = c.get('player').id
    if (!row || (row.a_id !== io && row.da_id !== io)) fail(404, 'SFIDA_NON_TROVATA', 'Sfida non trovata.')
    const duelloId = await accettaSfidaQuiz(db, row, io, Date.now())
    return c.json({ duelloId })
  })

/** Il duello richiesto e il lato di chi chiede: chi non ci gioca non lo vede. */
async function duelloMio(c: Context<AppEnv>): Promise<{ row: DuelloRow; lato: LatoSfida }> {
  const row = await duelloPerId(c.env.DB, c.req.param('id') ?? '')
  const lato = row ? latoNelDuello(row, c.get('player').id) : null
  if (!row || !lato) fail(404, 'DUELLO_NON_TROVATO', 'Sfida non trovata.')
  return { row, lato }
}

async function vista(c: Context<AppEnv>, row: DuelloRow, lato: LatoSfida, adesso = Date.now()) {
  const daGiro = Math.max(0, Math.floor(Number(c.req.query('giri') ?? 0)) || 0)
  return c.json<VistaDuello>(await vistaDuello(c.env.DB, row, lato, adesso, daGiro))
}

export const duelliQuiz = new Hono<AppEnv>()

  /**
   * Il duello come lo vede uno dei due. `?giri=` e' quante domande chiuse ha
   * gia' il telefono: arrivano solo le altre. Scrive le chiusure che nessuno
   * ha scritto — il duello finito per il tempo, l'altro che non e' arrivato.
   */
  .get('/:id', async (c) => {
    const { row, lato } = await duelloMio(c)
    const adesso = Date.now()
    return vista(c, await aggiornaDuello(c.env.DB, row, adesso), lato, adesso)
  })

  /** Sono arrivato nella pagina, con i dati caricati: quando ci siamo tutti e due, si comincia. */
  .post('/:id/pronto', async (c) => {
    const { row, lato } = await duelloMio(c)
    const adesso = Date.now()
    const dopo = await segnaPronto(c.env.DB, await aggiornaDuello(c.env.DB, row, adesso), lato, adesso)
    return vista(c, dopo, lato, adesso)
  })

  /** La risposta alla domanda aperta. `indice` perché una risposta in ritardo non finisca sulla domanda dopo. */
  .post('/:id/risposta', async (c) => {
    const { row, lato } = await duelloMio(c)
    const corpo = await corpoDi(c)
    const scelta = sceltaValida(corpo.scelta) ? corpo.scelta : null
    if (!scelta) fail(400, 'SCELTA', 'La risposta non è valida.')
    const adesso = Date.now()
    const dopo = await rispondiNelDuello(c.env.DB, row, lato, Number(corpo.indice), scelta, adesso)
    return vista(c, await aggiornaDuello(c.env.DB, dopo, adesso), lato, adesso)
  })

  /** Me ne vado: il duello finisce con i punti fatti fin qui. */
  .post('/:id/esci', async (c) => {
    const { row, lato } = await duelloMio(c)
    const adesso = Date.now()
    await esciDalDuello(c.env.DB, row, lato, adesso)
    return vista(c, (await duelloPerId(c.env.DB, row.id)) ?? row, lato, adesso)
  })

  /**
   * Gioca ancora: una rivincita con le stesse impostazioni e domande nuove,
   * fatte dal browser di chi la chiede. Se l'altro l'aveva gia' chiesta, e'
   * un si': il duello nuovo comincia subito.
   */
  .post('/:id/rivincita', async (c) => {
    const db = c.env.DB
    const { row, lato } = await duelloMio(c)
    const io = c.get('player').id
    const altro = lato === 'a' ? row.giocatore_b : row.giocatore_a
    const adesso = Date.now()
    const aggiornato = await aggiornaDuello(db, row, adesso)
    if (aggiornato.stato !== 'finito') fail(409, 'NON_FINITO', 'La rivincita si chiede a sfida finita.')
    const sua = await rivincitaInAttesa(db, row.id, altro, adesso)
    if (sua) return c.json({ duelloId: await accettaSfidaQuiz(db, sua, io, adesso) })
    const imp = impostazioniSfida(JSON.parse(row.impostazioni))
    if (!imp) fail(409, 'IMPOSTAZIONI', 'Questa sfida non si può rigiocare.')
    const domande = leggiDomande((await corpoDi(c)).domande, imp)
    const sfida = await mandaSfidaQuiz(db, io, altro, imp, domande, adesso, row.id)
    return c.json({ sfidaId: sfida.id }, 201)
  })

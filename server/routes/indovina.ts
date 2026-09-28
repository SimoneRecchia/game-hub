import { Hono, type Context } from 'hono'
import {
  RISPOSTE,
  altroLato,
  domandaInSospeso,
  leggiAbbassate,
  leggiPersonaggi,
  pulisciDomanda,
  type Lato,
  type Mossa,
  type Risposta,
} from '../../shared/indovina'
import type { SalaIndovina, SegnaleIndovina, VistaIndovina } from '../../shared/types'
import type { AppEnv } from '../types'
import { fail } from '../lib/http'
import { requireVerified } from '../lib/session'
import { eOnline } from '../lib/battagliaStore'
import {
  accettaInvito,
  chiudiInvito,
  giocatoriOnline,
  inPartita,
  invitoConCodice,
  latoDi,
  mandaInvito,
  mosseDi,
  partitaAperta,
  partitaBreve,
  partitaPerId,
  personaggiDi,
  rivincitaDi,
  salvaAbbassate,
  salvaMossa,
  salvaSegnale,
  serieDopo,
  ultimoInvito,
  vistaIndovina,
  type PartitaRow,
} from '../lib/indovinaStore'

/** Quanto puo' essere lungo un messaggio per aprire il canale fra i telefoni: una descrizione SDP con i suoi candidati. */
const SEGNALE_MASSIMO = 16_000

/** La partita richiesta, e il lato di chi chiede: chi non ci gioca non la vede. */
async function partitaMia(c: Context<AppEnv>): Promise<{ row: PartitaRow; io: Lato }> {
  const row = await partitaPerId(c.env.DB, c.req.param('id') ?? '')
  const io = row ? latoDi(row, c.get('player').id) : null
  if (!row || !io) fail(404, 'PARTITA_NON_TROVATA', 'Partita non trovata.')
  return { row, io }
}

async function corpoDi(c: Context<AppEnv>): Promise<Record<string, unknown>> {
  return ((await c.req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>
}

/** Una mossa si fa sulla partita che si e' vista: con la versione di un'altra, 409 e il client rilegge. */
function controllaVersione(row: PartitaRow, corpo: Record<string, unknown>) {
  if (Number(corpo.versione) !== row.versione) fail(409, 'CONFLITTO', 'La partita è cambiata: la ricarico.')
}

function inCorso(row: PartitaRow) {
  if (row.stato !== 'in_corso') fail(409, 'NON_IN_CORSO', 'La partita non è in corso.')
}

async function rispondi(c: Context<AppEnv>, row: PartitaRow, io: Lato) {
  return c.json<VistaIndovina>(await vistaIndovina(c.env.DB, row, io, Date.now()))
}

function adesso(): { ms: number; iso: string } {
  const ms = Date.now()
  return { ms, iso: new Date(ms).toISOString() }
}

export const indovinaRoutes = new Hono<AppEnv>()

  .use('*', requireVerified)

  /** La sala: chi e' online, l'ultimo invito mandato e com'e' andato, la partita aperta. */
  .get('/sala', async (c) => {
    const db = c.env.DB
    const io = c.get('player').id
    const ora = Date.now()
    const [giocatori, invito, aperta] = await Promise.all([
      giocatoriOnline(db, io, ora),
      ultimoInvito(db, io, ora),
      partitaAperta(db, io, ora),
    ])
    const lato = aperta ? latoDi(aperta, io) : null
    return c.json<SalaIndovina>({
      giocatori,
      invito,
      partita: aperta && lato ? await partitaBreve(db, aperta, lato) : null,
    })
  })

  /**
   * Un invito, con i personaggi scelti: a un amico online, o — senza
   * `playerId` — con un link da mandare. Chi invita e chi e' invitato non
   * devono essere gia' in una partita.
   */
  .post('/inviti', async (c) => {
    const db = c.env.DB
    const io = c.get('player').id
    const corpo = await corpoDi(c)
    const personaggi = leggiPersonaggi(corpo.personaggi)
    if (!personaggi) fail(400, 'PERSONAGGI', 'I personaggi non sono validi.')
    const ora = Date.now()
    if (await inPartita(db, io, ora)) fail(409, 'IN_PARTITA', 'Hai già una partita in corso: finiscila prima.')

    const a = typeof corpo.playerId === 'string' ? corpo.playerId : null
    if (a) {
      if (a === io) fail(400, 'INVITO_A_SE', 'Non puoi invitare te stesso.')
      const esiste = await db.prepare('SELECT 1 AS si FROM players WHERE id = ?').bind(a).first()
      if (!esiste) fail(404, 'GIOCATORE_NON_TROVATO', 'Giocatore non trovato.')
      if (!(await eOnline(db, a, ora))) fail(409, 'NON_ONLINE', 'Non è più online.')
      if (await inPartita(db, a, ora)) fail(409, 'OCCUPATO', 'Sta già giocando un’altra partita.')
    }
    const row = await mandaInvito(db, { da: io, a, personaggi }, ora)
    return c.json({ id: row.id, codice: row.codice }, 201)
  })

  .post('/inviti/:id/annulla', async (c) => {
    const row = await partitaPerId(c.env.DB, c.req.param('id'))
    if (!row) fail(404, 'INVITO_NON_TROVATO', 'Questo invito non esiste.')
    await chiudiInvito(c.env.DB, row, c.get('player').id, 'annullata', Date.now())
    return c.json({ ok: true })
  })

  .post('/inviti/:id/rifiuta', async (c) => {
    const row = await partitaPerId(c.env.DB, c.req.param('id'))
    if (!row) fail(404, 'INVITO_NON_TROVATO', 'Questo invito non esiste.')
    await chiudiInvito(c.env.DB, row, c.get('player').id, 'rifiutata', Date.now())
    return c.json({ ok: true })
  })

  .post('/inviti/:id/accetta', async (c) => {
    const row = await partitaPerId(c.env.DB, c.req.param('id'))
    if (!row || row.codice) fail(404, 'INVITO_NON_TROVATO', 'Questo invito non esiste.')
    await accettaInvito(c.env.DB, row, c.get('player').id, Date.now())
    return c.json({ partitaId: row.id })
  })

  /** Un invito arrivato con il link: aprirlo e' gia' accettarlo. */
  .post('/link/:codice/accetta', async (c) => {
    const row = await invitoConCodice(c.env.DB, c.req.param('codice'))
    if (!row) fail(404, 'LINK_NON_TROVATO', 'Questo invito non esiste.')
    await accettaInvito(c.env.DB, row, c.get('player').id, Date.now())
    return c.json({ partitaId: row.id })
  })

  .get('/partite/:id', async (c) => {
    const { row, io } = await partitaMia(c)
    return rispondi(c, row, io)
  })

  /** Una domanda all'altro, quando tocca a te e non ce n'e' una in sospeso. */
  .post('/partite/:id/domanda', async (c) => {
    const { row, io } = await partitaMia(c)
    const corpo = await corpoDi(c)
    inCorso(row)
    controllaVersione(row, corpo)
    const mosse = mosseDi(row)
    if (row.turno !== io || domandaInSospeso(mosse)) fail(409, 'NON_TOCCA', 'Non è il tuo turno.')
    const testo = pulisciDomanda(corpo.testo)
    if (!testo) fail(400, 'DOMANDA', 'Scrivi una domanda.')
    const ora = adesso()
    const dopo = await salvaMossa(c.env.DB, row, { mosse: [...mosse, { t: 'd', da: io, testo, at: ora.iso }] }, ora.ms)
    return rispondi(c, dopo, io)
  })

  /** La risposta alla domanda dell'altro: poi tocca a chi ha risposto. */
  .post('/partite/:id/risposta', async (c) => {
    const { row, io } = await partitaMia(c)
    const corpo = await corpoDi(c)
    inCorso(row)
    controllaVersione(row, corpo)
    const mosse = mosseDi(row)
    const sospesa = domandaInSospeso(mosse)
    if (!sospesa || sospesa.da === io) fail(409, 'NESSUNA_DOMANDA', 'Non c’è una domanda a cui rispondere.')
    const r = corpo.risposta as Risposta
    if (!RISPOSTE.includes(r)) fail(400, 'RISPOSTA', 'Rispondi sì, no o non so.')
    const ora = adesso()
    const dopo = await salvaMossa(
      c.env.DB,
      row,
      { mosse: [...mosse, { t: 'r', da: io, r, at: ora.iso }], turno: io },
      ora.ms,
    )
    return rispondi(c, dopo, io)
  })

  /**
   * Il tentativo, al posto di una domanda: chi indovina vince, chi sbaglia
   * perde, come nel gioco da tavolo.
   */
  .post('/partite/:id/ipotesi', async (c) => {
    const { row, io } = await partitaMia(c)
    const corpo = await corpoDi(c)
    inCorso(row)
    controllaVersione(row, corpo)
    const mosse = mosseDi(row)
    if (row.turno !== io || domandaInSospeso(mosse)) fail(409, 'NON_TOCCA', 'Non è il tuo turno.')
    const k = Number(corpo.k)
    if (!Number.isInteger(k) || k < 0 || k >= personaggiDi(row).voci.length) fail(400, 'PERSONAGGIO', 'Personaggio sconosciuto.')
    const segreto = io === 'a' ? row.segreto_b : row.segreto_a
    const ok = k === segreto
    const ora = adesso()
    const mossa: Mossa = { t: 'i', da: io, k, ok, at: ora.iso }
    const dopo = await salvaMossa(
      c.env.DB,
      row,
      {
        mosse: [...mosse, mossa],
        stato: 'finita',
        turno: null,
        vincitore: ok ? io : altroLato(io),
        motivo: ok ? 'indovinato' : 'sbagliato',
      },
      ora.ms,
    )
    return rispondi(c, dopo, io)
  })

  /** Le facce abbassate sul proprio tabellone: le scrive solo il padrone, e non passano dalla versione. */
  .put('/partite/:id/abbassate', async (c) => {
    const { row, io } = await partitaMia(c)
    const corpo = await corpoDi(c)
    if (row.stato !== 'in_corso') return c.json({ ok: false })
    const abbassate = leggiAbbassate(corpo.abbassate, personaggiDi(row).voci.length)
    if (!abbassate) fail(400, 'ABBASSATE', 'Le facce abbassate non sono valide.')
    await salvaAbbassate(c.env.DB, row, io, abbassate, Date.now())
    return c.json({ ok: true })
  })

  /**
   * Un messaggio per aprire il canale fra i due telefoni, quando i personaggi
   * sono foto che uno dei due non ha: l'offerta la scrive chi le chiede, la
   * risposta chi le ha. Le foto poi passano da li', non da qui.
   */
  .post('/partite/:id/segnale', async (c) => {
    const { row, io } = await partitaMia(c)
    const corpo = await corpoDi(c)
    if (row.stato !== 'in_corso' && row.stato !== 'finita') fail(409, 'NON_IN_CORSO', 'La partita non è in corso.')
    const tipo = corpo.tipo === 'offerta' || corpo.tipo === 'risposta' ? corpo.tipo : null
    const sdp = typeof corpo.sdp === 'string' ? corpo.sdp : ''
    const n = Number(corpo.n)
    if (!tipo || !sdp || sdp.length > SEGNALE_MASSIMO || !Number.isInteger(n) || n < 1) {
      fail(400, 'SEGNALE', 'Messaggio non valido.')
    }
    const segnale: SegnaleIndovina = { da: io, sdp, n }
    const scritto = await salvaSegnale(c.env.DB, row, tipo, segnale)
    return c.json({ ok: scritto })
  })

  /** Abbandona: vince l'altro. */
  .post('/partite/:id/resa', async (c) => {
    const { row, io } = await partitaMia(c)
    if (row.stato !== 'in_corso') return rispondi(c, row, io)
    const dopo = await salvaMossa(
      c.env.DB,
      row,
      { stato: 'finita', turno: null, vincitore: altroLato(io), motivo: 'resa' },
      Date.now(),
    )
    return rispondi(c, dopo, io)
  })

  /** La vittoria a tavolino: l'altro ha la mossa da tre minuti e non la fa. */
  .post('/partite/:id/reclama', async (c) => {
    const { row, io } = await partitaMia(c)
    const vista = await vistaIndovina(c.env.DB, row, io, Date.now())
    if (!vista.puoiReclamare) fail(409, 'ANCORA_PRESTO', 'L’altro ha ancora tempo.')
    const dopo = await salvaMossa(
      c.env.DB,
      row,
      { stato: 'finita', turno: null, vincitore: io, motivo: 'assenza' },
      Date.now(),
    )
    return rispondi(c, dopo, io)
  })

  /**
   * Gioca ancora, a partita finita: con gli stessi personaggi e il conto della
   * serie. Se l'altro l'aveva gia' chiesta, chiederla e' accettarla.
   */
  .post('/partite/:id/rivincita', async (c) => {
    const db = c.env.DB
    const { row, io } = await partitaMia(c)
    if (row.stato !== 'finita') fail(409, 'NON_FINITA', 'La rivincita si chiede a partita finita.')
    const mioId = c.get('player').id
    const altroId = (io === 'a' ? row.giocatore_b : row.giocatore_a)!
    const ora = Date.now()
    const esistente = await rivincitaDi(db, row.id)
    if (esistente?.stato === 'invito' && esistente.giocatore_a === altroId && esistente.invitato === mioId) {
      await accettaInvito(db, esistente, mioId, ora)
      return c.json({ partitaId: esistente.id })
    }
    if (esistente?.stato === 'invito' && esistente.giocatore_a === mioId) return c.json({ invitoId: esistente.id })
    if (await inPartita(db, mioId, ora)) fail(409, 'IN_PARTITA', 'Hai già una partita in corso: finiscila prima.')
    if (!(await eOnline(db, altroId, ora))) fail(409, 'NON_ONLINE', 'Non è più online.')
    if (await inPartita(db, altroId, ora)) fail(409, 'OCCUPATO', 'Sta già giocando un’altra partita.')
    const nuova = await mandaInvito(
      db,
      { da: mioId, a: altroId, personaggi: personaggiDi(row), rivincitaDi: row.id, serie: serieDopo(row, mioId, altroId) },
      ora,
    )
    return c.json({ invitoId: nuova.id }, 201)
  })

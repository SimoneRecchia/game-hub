import { Hono, type Context } from 'hono'
import { livelloSequenzeValido } from '../../shared/sequenze'
import type { MossaSfidaSequenze, SalaSequenze, VistaSfidaSequenze } from '../../shared/types'
import type { AppEnv } from '../types'
import { eOnline } from '../lib/battagliaStore'
import { fail } from '../lib/http'
import {
  accettaInvito,
  apri,
  chiudiInvito,
  chiudiSeFinita,
  giocatoriOnline,
  inSfida,
  invitoConCodice,
  latoDi,
  livelloDi as difficoltaDi,
  mandaInvito,
  rispondi,
  rivincitaDi,
  serieDopo,
  sfidaAperta,
  sfidaBreve,
  sfidaPerId,
  ultimoInvito,
  vistaSfida,
  type LatoSequenze,
  type SfidaRow,
} from '../lib/sequenzeSfideStore'

/**
 * Sequenze fra amici: si montano dentro le rotte del gioco
 * (`/sequenze/sfide`), che controllano la sessione per tutte.
 */

async function corpoDi(c: Context<AppEnv>): Promise<Record<string, unknown>> {
  return ((await c.req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>
}

/** La sfida e il lato di chi chiede: solo i due giocatori la vedono. */
async function sfidaMia(c: Context<AppEnv>): Promise<{ row: SfidaRow; io: LatoSequenze }> {
  const row = await sfidaPerId(c.env.DB, c.req.param('id') ?? '')
  const io = row ? latoDi(row, c.get('player').id) : null
  if (!row || !io) fail(404, 'SFIDA_NON_TROVATA', 'Questa sfida non esiste.')
  return { row, io }
}

/** Il livello a cui risponde il telefono: quante sequenze aveva ripetuto giuste. */
function livelloDi(corpo: Record<string, unknown>): number {
  const livello = corpo.livello
  if (typeof livello !== 'number' || !Number.isInteger(livello) || livello < 0) {
    fail(400, 'LIVELLO', 'Livello non valido.')
  }
  return livello
}

/** La sfida dopo una mossa, chiusa se si sa gia' chi ha vinto: a partita chiusa la sequenza dopo non serve. */
async function dopoLaMossa(
  c: Context<AppEnv>,
  row: SfidaRow,
  io: LatoSequenze,
  adesso: number,
  giusta: boolean | null,
  sequenza: number[] | null,
) {
  const letta = (await sfidaPerId(c.env.DB, row.id)) ?? row
  const dopo = await chiudiSeFinita(c.env.DB, letta, adesso)
  const vista = await vistaSfida(c.env.DB, dopo, io, adesso)
  return c.json<MossaSfidaSequenze>({ ...vista, giusta, sequenza: dopo.stato === 'in_corso' ? sequenza : null })
}

export const sfideSequenze = new Hono<AppEnv>()

  /** La sala: chi e' online, l'ultimo invito mandato e com'e' andato, la sfida aperta. */
  .get('/sala', async (c) => {
    const db = c.env.DB
    const io = c.get('player').id
    const adesso = Date.now()
    const [giocatori, invito, aperta] = await Promise.all([
      giocatoriOnline(db, io, adesso),
      ultimoInvito(db, io, adesso),
      sfidaAperta(db, io, adesso),
    ])
    const lato = aperta ? latoDi(aperta, io) : null
    return c.json<SalaSequenze>({
      giocatori,
      invito,
      partita: aperta && lato ? await sfidaBreve(db, aperta, lato) : null,
    })
  })

  /** Un invito a un amico online, o — senza `playerId` — con un link da mandare. */
  .post('/', async (c) => {
    const db = c.env.DB
    const io = c.get('player').id
    const corpo = await corpoDi(c)
    const adesso = Date.now()
    if (await inSfida(db, io, adesso)) fail(409, 'IN_PARTITA', 'Hai già una sfida in corso: finiscila prima.')
    const a = typeof corpo.playerId === 'string' ? corpo.playerId : null
    if (a) {
      if (a === io) fail(400, 'INVITO_A_SE', 'Non puoi sfidare te stesso.')
      const esiste = await db.prepare('SELECT 1 AS si FROM players WHERE id = ?').bind(a).first()
      if (!esiste) fail(404, 'GIOCATORE_NON_TROVATO', 'Giocatore non trovato.')
      if (!(await eOnline(db, a, adesso))) fail(409, 'NON_ONLINE', 'Non è più online.')
      if (await inSfida(db, a, adesso)) fail(409, 'OCCUPATO', 'Sta già giocando un’altra sfida.')
    }
    const impostazioni = (corpo.impostazioni ?? {}) as Record<string, unknown>
    const row = await mandaInvito(db, { da: io, a, livello: livelloSequenzeValido(impostazioni.livello) }, adesso)
    return c.json({ id: row.id, codice: row.codice }, 201)
  })

  .post('/:id/annulla', async (c) => {
    const row = await sfidaPerId(c.env.DB, c.req.param('id'))
    if (!row) fail(404, 'INVITO_NON_TROVATO', 'Questo invito non esiste.')
    await chiudiInvito(c.env.DB, row, c.get('player').id, 'annullata', Date.now())
    return c.json({ ok: true })
  })

  .post('/:id/rifiuta', async (c) => {
    const row = await sfidaPerId(c.env.DB, c.req.param('id'))
    if (!row) fail(404, 'INVITO_NON_TROVATO', 'Questo invito non esiste.')
    await chiudiInvito(c.env.DB, row, c.get('player').id, 'rifiutata', Date.now())
    return c.json({ ok: true })
  })

  .post('/:id/accetta', async (c) => {
    const row = await sfidaPerId(c.env.DB, c.req.param('id'))
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

  /** La sfida vista da chi chiede. Se si sa gia' chi ha vinto, si chiude. */
  .get('/:id', async (c) => {
    const { row, io } = await sfidaMia(c)
    const adesso = Date.now()
    const dopo = await chiudiSeFinita(c.env.DB, row, adesso)
    return c.json<VistaSfidaSequenze>(await vistaSfida(c.env.DB, dopo, io, adesso))
  })

  /** La prima sequenza, dopo il via. Chiesta una seconda volta conta sbagliata: si vede una volta. */
  .post('/:id/apri', async (c) => {
    const { row, io } = await sfidaMia(c)
    const livello = livelloDi(await corpoDi(c))
    const adesso = Date.now()
    const sequenza = await apri(c.env.DB, row, io, livello, adesso)
    return dopoLaMossa(c, row, io, adesso, sequenza ? null : false, sequenza)
  })

  /** La risposta alla sequenza aperta: giusta, porta la sequenza dopo. */
  .post('/:id/risposta', async (c) => {
    const { row, io } = await sfidaMia(c)
    const corpo = await corpoDi(c)
    const livello = livelloDi(corpo)
    const adesso = Date.now()
    const { giusta, sequenza } = await rispondi(c.env.DB, row, io, livello, corpo.tocchi, adesso)
    return dopoLaMossa(c, row, io, adesso, giusta, sequenza)
  })

  /**
   * Gioca ancora, a partita finita, con il conto della serie. Se l'altro
   * l'aveva gia' chiesta, chiederla e' accettarla.
   */
  .post('/:id/rivincita', async (c) => {
    const db = c.env.DB
    const { row, io } = await sfidaMia(c)
    if (row.stato !== 'finita') fail(409, 'NON_FINITA', 'La rivincita si chiede a sfida finita.')
    const mioId = c.get('player').id
    const altroId = (io === 'a' ? row.giocatore_b : row.giocatore_a)!
    const adesso = Date.now()
    const esistente = await rivincitaDi(db, row.id)
    if (esistente?.stato === 'invito' && esistente.giocatore_a === altroId && esistente.invitato === mioId) {
      await accettaInvito(db, esistente, mioId, adesso)
      return c.json({ partitaId: esistente.id })
    }
    if (esistente?.stato === 'invito' && esistente.giocatore_a === mioId) return c.json({ invitoId: esistente.id })
    if (await inSfida(db, mioId, adesso)) fail(409, 'IN_PARTITA', 'Hai già una sfida in corso: finiscila prima.')
    if (!(await eOnline(db, altroId, adesso))) fail(409, 'NON_ONLINE', 'Non è più online.')
    if (await inSfida(db, altroId, adesso)) fail(409, 'OCCUPATO', 'Sta già giocando un’altra sfida.')
    const nuova = await mandaInvito(
      db,
      { da: mioId, a: altroId, livello: difficoltaDi(row), rivincitaDi: row.id, serie: serieDopo(row, mioId, altroId) },
      adesso,
    )
    return c.json({ invitoId: nuova.id }, 201)
  })

import { Hono, type Context } from 'hono'
import { avanzamentoValido, eGiocoSfidaLibera, impostazioniValide, type GiocoSfidaLibera } from '../../shared/sfide-libere'
import type { SalaSfidaLibera, VistaSfidaLibera } from '../../shared/types'
import type { AppEnv } from '../types'
import { eOnline } from '../lib/battagliaStore'
import { fail } from '../lib/http'
import { requireVerified } from '../lib/session'
import {
  accettaInvito,
  avanza,
  chiudiInvito,
  chiudiSeFinita,
  giocatoriOnline,
  impostazioniDi,
  inSfida,
  invitoConCodice,
  latoDi,
  mandaInvito,
  parti,
  rivincitaDi,
  serieDopo,
  sfidaAperta,
  sfidaBreve,
  sfidaPerId,
  ultimoInvito,
  vistaSfida,
  type LatoLibera,
  type SfidaRow,
} from '../lib/sfideLibereStore'

/**
 * Le sfide fra amici del sudoku, degli Anagrammi, del Paroliere, della
 * Ghigliottina e della Catena (`/sfide`): la sala e gli inviti per gioco, la
 * partita per id.
 */

async function corpoDi(c: Context<AppEnv>): Promise<Record<string, unknown>> {
  return ((await c.req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>
}

function giocoDi(c: Context<AppEnv>): GiocoSfidaLibera {
  const gioco = c.req.param('gioco')
  if (!eGiocoSfidaLibera(gioco)) fail(404, 'GIOCO_NON_TROVATO', 'Questo gioco non ha le sfide.')
  return gioco
}

/** La sfida e il lato di chi chiede: solo i due giocatori la vedono. */
async function sfidaMia(c: Context<AppEnv>): Promise<{ row: SfidaRow; io: LatoLibera }> {
  const row = await sfidaPerId(c.env.DB, c.req.param('id') ?? '')
  const io = row ? latoDi(row, c.get('player').id) : null
  if (!row || !io) fail(404, 'SFIDA_NON_TROVATA', 'Questa sfida non esiste.')
  return { row, io }
}

/** La sfida dopo una scrittura, chiusa se si sa gia' chi ha vinto. */
async function vistaDopo(c: Context<AppEnv>, id: string, io: LatoLibera, adesso: number, riaperta = false) {
  const letta = await sfidaPerId(c.env.DB, id)
  if (!letta) fail(404, 'SFIDA_NON_TROVATA', 'Questa sfida non esiste.')
  const dopo = await chiudiSeFinita(c.env.DB, letta, adesso)
  return c.json<VistaSfidaLibera>(await vistaSfida(c.env.DB, dopo, io, adesso, riaperta))
}

export const sfideLibereRoutes = new Hono<AppEnv>()
  .use('*', requireVerified)

  /** La sala di un gioco: chi e' online, l'ultimo invito mandato e com'e' andato, la sfida aperta. */
  .get('/:gioco/sala', async (c) => {
    const db = c.env.DB
    const gioco = giocoDi(c)
    const io = c.get('player').id
    const adesso = Date.now()
    const [giocatori, invito, aperta] = await Promise.all([
      giocatoriOnline(db, io, adesso),
      ultimoInvito(db, io, gioco, adesso),
      sfidaAperta(db, io, adesso),
    ])
    const lato = aperta ? latoDi(aperta, io) : null
    return c.json<SalaSfidaLibera>({
      giocatori,
      invito,
      partita: aperta && lato ? await sfidaBreve(db, aperta, lato) : null,
    })
  })

  /** Un invito a un amico online, o — senza `playerId` — con un link da mandare, con le opzioni scelte. */
  .post('/:gioco', async (c) => {
    const db = c.env.DB
    const gioco = giocoDi(c)
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
    const impostazioni = impostazioniValide(gioco, corpo.impostazioni)
    const row = await mandaInvito(db, { da: io, a, gioco, impostazioni }, adesso)
    return c.json({ id: row.id, codice: row.codice }, 201)
  })

  /** Un invito arrivato con il link: aprirlo e' gia' accettarlo. */
  .post('/link/:codice/accetta', async (c) => {
    const row = await invitoConCodice(c.env.DB, c.req.param('codice'))
    if (!row) fail(404, 'LINK_NON_TROVATO', 'Questo invito non esiste.')
    await accettaInvito(c.env.DB, row, c.get('player').id, Date.now())
    return c.json({ partitaId: row.id, gioco: row.gioco })
  })

  .post('/partita/:id/annulla', async (c) => {
    const row = await sfidaPerId(c.env.DB, c.req.param('id'))
    if (!row) fail(404, 'INVITO_NON_TROVATO', 'Questo invito non esiste.')
    await chiudiInvito(c.env.DB, row, c.get('player').id, 'annullata', Date.now())
    return c.json({ ok: true })
  })

  .post('/partita/:id/rifiuta', async (c) => {
    const row = await sfidaPerId(c.env.DB, c.req.param('id'))
    if (!row) fail(404, 'INVITO_NON_TROVATO', 'Questo invito non esiste.')
    await chiudiInvito(c.env.DB, row, c.get('player').id, 'rifiutata', Date.now())
    return c.json({ ok: true })
  })

  .post('/partita/:id/accetta', async (c) => {
    const row = await sfidaPerId(c.env.DB, c.req.param('id'))
    if (!row || row.codice) fail(404, 'INVITO_NON_TROVATO', 'Questo invito non esiste.')
    await accettaInvito(c.env.DB, row, c.get('player').id, Date.now())
    return c.json({ partitaId: row.id, gioco: row.gioco })
  })

  /** La sfida vista da chi chiede. Se si sa gia' chi ha vinto, si chiude. */
  .get('/partita/:id', async (c) => {
    const { row, io } = await sfidaMia(c)
    const adesso = Date.now()
    const dopo = await chiudiSeFinita(c.env.DB, row, adesso)
    return c.json<VistaSfidaLibera>(await vistaSfida(c.env.DB, dopo, io, adesso))
  })

  /** Il telefono comincia a giocare; la seconda volta la partita di chi chiede finisce li'. */
  .post('/partita/:id/parti', async (c) => {
    const { row, io } = await sfidaMia(c)
    const adesso = Date.now()
    const { riaperta } = await parti(c.env.DB, row, io, adesso)
    return vistaDopo(c, row.id, io, adesso, riaperta)
  })

  /** Fin dove e' arrivato chi scrive; con `fine`, com'e' finita la sua partita. */
  .post('/partita/:id/avanza', async (c) => {
    const { row, io } = await sfidaMia(c)
    const corpo = await corpoDi(c)
    const avanzamento = avanzamentoValido(row.gioco, impostazioniDi(row), corpo)
    if (!avanzamento) fail(400, 'AVANZAMENTO', 'Avanzamento non valido.')
    const adesso = Date.now()
    await avanza(c.env.DB, row, io, avanzamento, corpo.fine === true, adesso)
    return vistaDopo(c, row.id, io, adesso)
  })

  /**
   * Gioca ancora, a sfida finita, allo stesso gioco con le stesse opzioni e con
   * il conto della serie. Se l'altro l'aveva gia' chiesta, chiederla e' accettarla.
   */
  .post('/partita/:id/rivincita', async (c) => {
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
      {
        da: mioId,
        a: altroId,
        gioco: row.gioco,
        impostazioni: impostazioniDi(row),
        rivincitaDi: row.id,
        serie: serieDopo(row, mioId, altroId),
      },
      adesso,
    )
    return c.json({ invitoId: nuova.id }, 201)
  })

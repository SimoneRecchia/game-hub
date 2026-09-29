import { Hono, type Context } from 'hono'
import { GIOCHI_TAVOLIERE, type GiocoTavoliere } from '../../shared/tavolo'
import { giocaMossa, regoleDi } from '../../shared/tavolo-regole'
import type { SalaTavolo, VistaTavolo } from '../../shared/types'
import type { AppEnv } from '../types'
import { fail } from '../lib/http'
import { requireVerified } from '../lib/session'
import { eOnline } from '../lib/battagliaStore'
import {
  accettaInvito,
  altroLato,
  chiaviDi,
  chiudiInvito,
  diTurno,
  giocatoriOnline,
  inPartita,
  invitoConCodice,
  latoDellaParte,
  latoDi,
  mandaInvito,
  mosseDi,
  parteDi,
  partiteInCorso,
  partitaPerId,
  primoDellaRivincita,
  recordTavolo,
  rivincitaDi,
  salvaPartita,
  serieDopo,
  ultimoInvito,
  vistaTavolo,
  type Lato,
  type PartitaRow,
} from '../lib/tavoloStore'

/** La notazione piu' lunga che si accetta: una presa di dama con tutte le sue caselle ci sta largamente. */
const MOSSA_MASSIMA = 40

function leggiGioco(valore: unknown): GiocoTavoliere {
  if (!GIOCHI_TAVOLIERE.includes(valore as GiocoTavoliere)) fail(400, 'GIOCO', 'Gioco sconosciuto.')
  return valore as GiocoTavoliere
}

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

function inCorso(row: PartitaRow) {
  if (row.stato !== 'in_corso') fail(409, 'NON_IN_CORSO', 'La partita non è in corso.')
}

async function rispondi(c: Context<AppEnv>, row: PartitaRow, io: Lato) {
  return c.json<VistaTavolo>(await vistaTavolo(c.env.DB, row, io, Date.now()))
}

export const tavoloRoutes = new Hono<AppEnv>()

  .use('*', requireVerified)

  /** La sala di un gioco: chi e' online, l'ultimo invito mandato, le partite in corso, il conto con gli amici. */
  .get('/sala', async (c) => {
    const db = c.env.DB
    const io = c.get('player').id
    const gioco = leggiGioco(c.req.query('gioco'))
    const ora = Date.now()
    const [giocatori, invito, partite, record] = await Promise.all([
      giocatoriOnline(db, io, ora),
      ultimoInvito(db, io, gioco, ora),
      partiteInCorso(db, io, gioco),
      recordTavolo(db, io, gioco),
    ])
    return c.json<SalaTavolo>({ giocatori, invito, partite, record })
  })

  /**
   * Un invito: a un amico online, o — senza `playerId` — con un link da
   * mandare. Chi invita e chi e' invitato non devono essere gia' in una partita.
   */
  .post('/inviti', async (c) => {
    const db = c.env.DB
    const io = c.get('player').id
    const corpo = await corpoDi(c)
    const gioco = leggiGioco(corpo.gioco)
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
    const row = await mandaInvito(db, { da: io, a, gioco }, ora)
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
    return c.json({ partitaId: row.id, gioco: row.gioco })
  })

  /** Un invito arrivato con il link: aprirlo e' gia' accettarlo. */
  .post('/link/:codice/accetta', async (c) => {
    const row = await invitoConCodice(c.env.DB, c.req.param('codice'))
    if (!row) fail(404, 'LINK_NON_TROVATO', 'Questo invito non esiste.')
    await accettaInvito(c.env.DB, row, c.get('player').id, Date.now())
    return c.json({ partitaId: row.id, gioco: row.gioco })
  })

  .get('/partite/:id', async (c) => {
    const { row, io } = await partitaMia(c)
    return rispondi(c, row, io)
  })

  /**
   * Una mossa, quando tocca a te: il server la controlla con le regole del
   * gioco sulla posizione salvata, e se chiude la partita scrive chi ha vinto.
   */
  .post('/partite/:id/mossa', async (c) => {
    const { row, io } = await partitaMia(c)
    const corpo = await corpoDi(c)
    inCorso(row)
    if (Number(corpo.versione) !== row.versione) fail(409, 'CONFLITTO', 'La partita è cambiata: la ricarico.')
    if (diTurno(row) !== io) fail(409, 'NON_TOCCA', 'Non è il tuo turno.')
    const mossa = typeof corpo.mossa === 'string' ? corpo.mossa.slice(0, MOSSA_MASSIMA) : ''
    const giocata = giocaMossa(regoleDi(row.gioco), row.posizione, chiaviDi(row), mossa, parteDi(row, io)!)
    if (!giocata) fail(422, 'MOSSA', 'Questa mossa non si può fare.')
    const fine = giocata.esito
    const dopo = await salvaPartita(
      c.env.DB,
      row,
      {
        posizione: giocata.posizione,
        chiavi: giocata.chiavi,
        mosse: [...mosseDi(row), giocata.mossa],
        mossa: true,
        // Muovere lascia cadere la patta proposta dall'altro: e' il modo di dire di no.
        patta: null,
        ...(fine
          ? {
              stato: 'finita' as const,
              vincitore: fine.vincitore === null ? null : latoDellaParte(row, fine.vincitore),
              motivo: fine.motivo,
            }
          : {}),
      },
      Date.now(),
    )
    return rispondi(c, dopo, io)
  })

  /**
   * La patta d'accordo, negli scacchi e nella dama: una proposta per mossa, che
   * l'altro accetta o rifiuta — o lascia cadere muovendo.
   */
  .post('/partite/:id/patta', async (c) => {
    const { row, io } = await partitaMia(c)
    const corpo = await corpoDi(c)
    inCorso(row)
    if (!regoleDi(row.gioco).patta) fail(409, 'SENZA_PATTA', 'In questo gioco non si propone la patta.')
    const mosse = mosseDi(row).length
    const ora = Date.now()
    if (corpo.azione === 'proponi') {
      if (row.patta || row.patta_n === mosse) fail(409, 'PATTA_GIA', 'Hai già proposto la patta a questa mossa.')
      return rispondi(c, await salvaPartita(c.env.DB, row, { patta: io, patta_n: mosse }, ora), io)
    }
    if (row.patta !== altroLato(io)) fail(409, 'NESSUNA_PATTA', 'Non c’è una patta da accettare.')
    if (corpo.azione === 'accetta') {
      const dopo = await salvaPartita(
        c.env.DB,
        row,
        { stato: 'finita', vincitore: null, motivo: 'patta', patta: null },
        ora,
      )
      return rispondi(c, dopo, io)
    }
    if (corpo.azione === 'rifiuta') return rispondi(c, await salvaPartita(c.env.DB, row, { patta: null }, ora), io)
    fail(400, 'AZIONE', 'Azione sconosciuta.')
  })

  /** Abbandona: vince l'altro. */
  .post('/partite/:id/resa', async (c) => {
    const { row, io } = await partitaMia(c)
    if (row.stato !== 'in_corso') return rispondi(c, row, io)
    const dopo = await salvaPartita(
      c.env.DB,
      row,
      { stato: 'finita', vincitore: altroLato(io), motivo: 'resa', patta: null },
      Date.now(),
    )
    return rispondi(c, dopo, io)
  })

  /** La vittoria a tavolino: l'altro ha la mossa da un pezzo, e non la fa. */
  .post('/partite/:id/reclama', async (c) => {
    const { row, io } = await partitaMia(c)
    const vista = await vistaTavolo(c.env.DB, row, io, Date.now())
    if (!vista.puoiReclamare) fail(409, 'ANCORA_PRESTO', 'L’altro ha ancora tempo.')
    const dopo = await salvaPartita(
      c.env.DB,
      row,
      { stato: 'finita', vincitore: io, motivo: 'assenza', patta: null },
      Date.now(),
    )
    return rispondi(c, dopo, io)
  })

  /**
   * Gioca ancora, a partita finita: allo stesso gioco, con il conto della serie,
   * e con i colori scambiati. Se l'altro l'aveva gia' chiesta, chiederla e'
   * accettarla.
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
      {
        da: mioId,
        a: altroId,
        gioco: row.gioco,
        rivincitaDi: row.id,
        serie: serieDopo(row, mioId, altroId),
        primo: primoDellaRivincita(row, mioId),
      },
      ora,
    )
    return c.json({ invitoId: nuova.id }, 201)
  })

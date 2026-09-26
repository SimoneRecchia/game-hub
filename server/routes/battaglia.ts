import { Hono, type Context } from 'hono'
import {
  CASELLE,
  FLOTTA,
  flottaAffondata,
  flottaValida,
  type Nave,
} from '../../shared/battaglia'
import type { BattagliaSummary, LobbyBattaglia, VistaBattaglia } from '../../shared/types'
import type { AppEnv } from '../types'
import { fail } from '../lib/http'
import { requireVerified } from '../lib/session'
import {
  accettaSfida,
  altro,
  colpiDelLato,
  colpiDi,
  diTurno,
  eOnline,
  flottaDi,
  giocatoriOnline,
  invitoPerId,
  latoDi,
  mandaSfida,
  partitaAperta,
  partitaBreve,
  partitaPerId,
  quantiOnline,
  reclamo,
  recordDi,
  salvaPartita,
  sfideMandate,
  vistaPer,
  type Lato,
  type PartitaRow,
} from '../lib/battagliaStore'

/** La partita richiesta, e il lato di chi chiede: chi non ci gioca non la vede. */
async function partitaMia(c: Context<AppEnv>): Promise<{ row: PartitaRow; io: Lato }> {
  const row = await partitaPerId(c.env.DB, c.req.param('id') ?? '')
  const io = row ? latoDi(row, c.get('player').id) : null
  if (!row || !io) fail(404, 'PARTITA_NON_TROVATA', 'Partita non trovata.')
  return { row, io }
}

async function versioneDal(c: Context<AppEnv>): Promise<{ versione: number; corpo: Record<string, unknown> }> {
  const corpo = ((await c.req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>
  return { versione: Number(corpo.versione), corpo }
}

function controllaVersione(row: PartitaRow, versione: number) {
  if (versione !== row.versione) fail(409, 'CONFLITTO', 'La partita è cambiata nel frattempo: ricarico.')
}

/**
 * La flotta arrivata dal client, ripulita: solo i campi che servono, con i
 * tipi giusti. La legalita' la controlla `flottaValida`.
 */
function leggiFlotta(valore: unknown): Nave[] {
  if (!Array.isArray(valore)) fail(400, 'FLOTTA', 'La flotta non è valida.')
  const navi = valore.map((n) => {
    const x = (n ?? {}) as Record<string, unknown>
    return {
      tipo: x.tipo as Nave['tipo'],
      r: Number(x.r),
      c: Number(x.c),
      verticale: x.verticale === true,
    }
  })
  const verifica = flottaValida(navi)
  if (!verifica.ok) fail(422, 'FLOTTA', verifica.errore)
  // Nell'ordine canonico: la riga in D1 non deve dipendere dall'ordine del client.
  return FLOTTA.map((t) => navi.find((n) => n.tipo === t.id)!)
}

async function rispondi(c: Context<AppEnv>, row: PartitaRow, io: Lato, stato = 200) {
  return c.json<VistaBattaglia>(await vistaPer(c.env.DB, row, io, Date.now()), stato as 200)
}

export const battagliaRoutes = new Hono<AppEnv>()

  .use('*', requireVerified)

  /** La sala d'attesa: chi e' online, le sfide mandate, la partita aperta, il record. */
  .get('/lobby', async (c) => {
    const db = c.env.DB
    const io = c.get('player').id
    const adesso = Date.now()
    const [giocatori, inviti, aperta, record] = await Promise.all([
      giocatoriOnline(db, io, adesso),
      sfideMandate(db, io, adesso),
      partitaAperta(db, io),
      recordDi(db, io),
    ])
    const lato = aperta ? latoDi(aperta, io) : null
    return c.json<LobbyBattaglia>({
      giocatori,
      inviti,
      partita: aperta && lato ? await partitaBreve(db, aperta, lato) : null,
      ...record,
    })
  })

  /** Per la card dell'hub: di sola lettura, come gli altri riepiloghi. */
  .get('/summary', async (c) => {
    const db = c.env.DB
    const io = c.get('player').id
    const adesso = Date.now()
    const [online, aperta, record] = await Promise.all([
      quantiOnline(db, io, adesso),
      partitaAperta(db, io),
      recordDi(db, io),
    ])
    const lato = aperta ? latoDi(aperta, io) : null
    return c.json<BattagliaSummary>({
      online,
      partita: aperta && lato ? await partitaBreve(db, aperta, lato) : null,
      ...record,
    })
  })

  /** Sfida un giocatore online. */
  .post('/sfida', async (c) => {
    const db = c.env.DB
    const io = c.get('player').id
    const corpo = (await c.req.json().catch(() => ({}))) as { playerId?: unknown }
    const altroId = typeof corpo.playerId === 'string' ? corpo.playerId : ''
    if (!altroId) fail(400, 'BAD_REQUEST', 'Manca il giocatore da sfidare.')
    if (altroId === io) fail(400, 'SFIDA_A_SE', 'Non puoi sfidare te stesso.')

    const adesso = Date.now()
    const [esiste, online, mia, sua] = await Promise.all([
      db.prepare('SELECT id FROM players WHERE id = ?').bind(altroId).first<{ id: string }>(),
      eOnline(db, altroId, adesso),
      partitaAperta(db, io),
      partitaAperta(db, altroId),
    ])
    if (!esiste) fail(404, 'PLAYER_NOT_FOUND', 'Giocatore non trovato.')
    if (mia) fail(409, 'IN_PARTITA', 'Hai già una battaglia in corso: finiscila prima.')
    if (!online) fail(409, 'NON_ONLINE', 'Non è più online.')
    if (sua) fail(409, 'OCCUPATO', 'Sta già giocando un’altra battaglia.')

    const id = await mandaSfida(db, io, altroId, adesso)
    return c.json({ id }, 201)
  })

  .post('/sfide/:id/annulla', async (c) => {
    const db = c.env.DB
    const invito = await invitoPerId(db, c.req.param('id'))
    if (!invito || invito.da_id !== c.get('player').id) fail(404, 'SFIDA_NON_TROVATA', 'Sfida non trovata.')
    await db
      .prepare(`UPDATE battaglia_inviti SET stato = 'annullato', risposto_at = ? WHERE id = ? AND stato = 'attesa'`)
      .bind(new Date().toISOString(), invito.id)
      .run()
    return c.json({ ok: true })
  })

  .post('/sfide/:id/rifiuta', async (c) => {
    const db = c.env.DB
    const invito = await invitoPerId(db, c.req.param('id'))
    if (!invito || invito.a_id !== c.get('player').id) fail(404, 'SFIDA_NON_TROVATA', 'Sfida non trovata.')
    await db
      .prepare(`UPDATE battaglia_inviti SET stato = 'rifiutato', risposto_at = ? WHERE id = ? AND stato = 'attesa'`)
      .bind(new Date().toISOString(), invito.id)
      .run()
    return c.json({ ok: true })
  })

  .post('/sfide/:id/accetta', async (c) => {
    const db = c.env.DB
    const invito = await invitoPerId(db, c.req.param('id'))
    if (!invito || invito.a_id !== c.get('player').id) fail(404, 'SFIDA_NON_TROVATA', 'Sfida non trovata.')
    const partitaId = await accettaSfida(db, invito, Date.now())
    return c.json({ partitaId })
  })

  /** La partita vista da chi la gioca. */
  .get('/partite/:id', async (c) => {
    const { row, io } = await partitaMia(c)
    return rispondi(c, row, io)
  })

  /**
   * Mette in mare la flotta. Quando ci sono tutte e due, comincia la battaglia
   * e si sorteggia chi spara per primo.
   */
  .post('/partite/:id/flotta', async (c) => {
    const { row, io } = await partitaMia(c)
    const { versione, corpo } = await versioneDal(c)
    if (row.stato !== 'disposizione') fail(409, 'GIA_IN_BATTAGLIA', 'La flotta è già in mare.')
    controllaVersione(row, versione)

    const flotta = JSON.stringify(leggiFlotta(corpo.navi))
    const cambi = io === 'a' ? { flotta_a: flotta } : { flotta_b: flotta }
    const altraPronta = flottaDi(row, altro(io)) !== null
    const dopo = await salvaPartita(
      c.env.DB,
      row,
      altraPronta
        ? {
            ...cambi,
            stato: 'battaglia',
            // A testa o croce, come al tavolo: un byte casuale del Worker.
            primo: crypto.getRandomValues(new Uint8Array(1))[0] % 2 === 0 ? 'a' : 'b',
          }
        : cambi,
      Date.now(),
    )
    return rispondi(c, dopo, io)
  })

  /** Spara. */
  .post('/partite/:id/colpo', async (c) => {
    const { row, io } = await partitaMia(c)
    const { versione, corpo } = await versioneDal(c)
    if (row.stato !== 'battaglia') fail(409, 'NON_IN_BATTAGLIA', 'Non si spara adesso.')
    if (diTurno(row) !== io) fail(409, 'NON_TOCCA_A_TE', 'Non è il tuo turno.')
    controllaVersione(row, versione)

    const casella = Number(corpo.casella)
    if (!Number.isInteger(casella) || casella < 0 || casella >= CASELLE) {
      fail(400, 'CASELLA', 'Casella non valida.')
    }
    if (colpiDelLato(row, io).some((colpo) => colpo.casella === casella)) {
      fail(409, 'GIA_SPARATO', 'Hai già sparato in quella casella.')
    }

    const colpi = [...colpiDi(row), casella]
    const provvisoria = { ...row, colpi: JSON.stringify(colpi) }
    const bersaglio = flottaDi(row, altro(io)) ?? []
    const presi = new Set(colpiDelLato(provvisoria, io).map((colpo) => colpo.casella))
    const vinta = flottaAffondata(bersaglio, presi)

    const dopo = await salvaPartita(
      c.env.DB,
      row,
      vinta
        ? { colpi: JSON.stringify(colpi), stato: 'finita', vincitore: io, motivo: 'flotta' }
        : { colpi: JSON.stringify(colpi) },
      Date.now(),
    )
    return rispondi(c, dopo, io)
  })

  /** Abbandona: vince l'altro. */
  .post('/partite/:id/resa', async (c) => {
    const { row, io } = await partitaMia(c)
    if (row.stato === 'finita') return rispondi(c, row, io)
    const dopo = await salvaPartita(
      c.env.DB,
      row,
      { stato: 'finita', vincitore: altro(io), motivo: 'resa' },
      Date.now(),
    )
    return rispondi(c, dopo, io)
  })

  /**
   * La vittoria a tavolino: l'avversario non muove da tre minuti quando tocca a
   * lui, o non ha disposto la flotta in cinque. Senza, chi sta perdendo
   * potrebbe chiudere l'app e lasciare l'altro ad aspettare per sempre.
   */
  .post('/partite/:id/reclama', async (c) => {
    const { row, io } = await partitaMia(c)
    if (!reclamo(row, io, Date.now()).puoi) {
      fail(409, 'ANCORA_PRESTO', 'L’avversario ha ancora tempo per muovere.')
    }
    const dopo = await salvaPartita(
      c.env.DB,
      row,
      { stato: 'finita', vincitore: io, motivo: 'assenza' },
      Date.now(),
    )
    return rispondi(c, dopo, io)
  })

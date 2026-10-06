import { Hono, type Context } from 'hono'
import {
  CASELLE,
  FLOTTA,
  flottaAffondata,
  flottaValida,
  type Nave,
} from '../../shared/battaglia'
import { LIVELLI_BATTAGLIA, type LivelloBattaglia } from '../../shared/battaglia-computer'
import type {
  InvitoConLink,
  LinkBattaglia,
  LobbyBattaglia,
  VistaBattaglia,
} from '../../shared/types'
import type { AppEnv } from '../types'
import { fail } from '../lib/http'
import { requireVerified } from '../lib/session'
import {
  accettaLink,
  accettaSfida,
  altro,
  annullaLink,
  colpiDelLato,
  colpiDi,
  colpoDelComputerIn,
  controComputer,
  creaLink,
  diTurno,
  eOnline,
  flottaDi,
  giocatoriOnline,
  invitoConLink,
  invitoPerId,
  latoDi,
  linkAttivo,
  mandaSfida,
  nuovaControComputer,
  partitaAperta,
  partitaBreve,
  partitaComputerAperta,
  partitaPerId,
  reclamo,
  recordControComputer,
  rivincitaDi,
  recordDi,
  salvaPartita,
  sfideMandate,
  vistaPer,
  type CambiPartita,
  type Lato,
  type PartitaRow,
} from '../lib/battagliaStore'
import { invitoQuizConLink } from '../lib/quizSfideStore'
import { invitoIndovinaConLink } from '../lib/indovinaStore'
import { invitoNomiConLink } from '../lib/nomiSfideStore'
import { invitoTavoloConLink } from '../lib/tavoloStore'

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
  if (versione !== row.versione) fail(409, 'CONFLITTO', 'La partita è cambiata: la ricarico.')
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

function leggiLivello(valore: unknown): LivelloBattaglia {
  if (!LIVELLI_BATTAGLIA.includes(valore as LivelloBattaglia)) {
    fail(400, 'LIVELLO', 'Livello sconosciuto: facile, normale o difficile.')
  }
  return valore as LivelloBattaglia
}

async function rispondi(c: Context<AppEnv>, row: PartitaRow, io: Lato, stato = 200) {
  return c.json<VistaBattaglia>(await vistaPer(c.env.DB, row, io, Date.now()), stato as 200)
}

/** I cambi di una partita che finisce: chi vince, e perché. */
function fine(cambi: CambiPartita, vincitore: Lato, motivo: 'flotta' | 'resa' | 'assenza'): CambiPartita {
  return { ...cambi, stato: 'finita', vincitore, motivo }
}

export const battagliaRoutes = new Hono<AppEnv>()

  .use('*', requireVerified)

  /**
   * La sala: chi e' online, le sfide mandate, la partita aperta con un amico e
   * quella col computer, l'invito col link, i record.
   */
  .get('/lobby', async (c) => {
    const db = c.env.DB
    const io = c.get('player').id
    const adesso = Date.now()
    const [giocatori, inviti, aperta, computer, link, record, controComputer] = await Promise.all([
      giocatoriOnline(db, io, adesso),
      sfideMandate(db, io, adesso),
      partitaAperta(db, io),
      partitaComputerAperta(db, io),
      linkAttivo(db, io, adesso),
      recordDi(db, io),
      recordControComputer(db, io),
    ])
    const lato = aperta ? latoDi(aperta, io) : null
    return c.json<LobbyBattaglia>({
      giocatori,
      inviti,
      partita: aperta && lato ? await partitaBreve(db, aperta, lato) : null,
      computer: computer ? await partitaBreve(db, computer, 'a') : null,
      link,
      ...record,
      controComputer,
    })
  })

  /** Una partita libera contro il computer, al livello scelto. */
  .post('/computer', async (c) => {
    const corpo = ((await c.req.json().catch(() => ({}))) ?? {}) as { livello?: unknown }
    const row = await nuovaControComputer(c.env.DB, c.get('player').id, leggiLivello(corpo.livello))
    return rispondi(c, row, 'a', 201)
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

  /* ──────────────────────  Gli inviti con un link  ────────────────────── */

  /** Un invito nuovo da mandare a chi si vuole. Quello vecchio, se c'era, si annulla. */
  .post('/link', async (c) => {
    const link = await creaLink(c.env.DB, c.get('player').id, Date.now())
    return c.json<LinkBattaglia>(link, 201)
  })

  .post('/link/annulla', async (c) => {
    await annullaLink(c.env.DB, c.get('player').id)
    return c.json({ ok: true })
  })

  /**
   * Accetta l'invito del link: apre la partita con chi l'ha mandato. E' la rotta
   * che chiama la pagina dell'invito appena c'e' un giocatore — anche uno che si
   * e' appena registrato apposta.
   */
  .post('/link/:codice/accetta', async (c) => {
    const partitaId = await accettaLink(c.env.DB, c.req.param('codice'), c.get('player').id, Date.now())
    return c.json({ partitaId })
  })

  /* ────────────────────────────  La partita  ─────────────────────────── */

  /** La partita vista da chi la gioca. */
  .get('/partite/:id', async (c) => {
    const { row, io } = await partitaMia(c)
    return rispondi(c, row, io)
  })

  /**
   * Mette in mare la flotta. Fra amici, quando ci sono tutte e due comincia la
   * battaglia e si sorteggia chi spara per primo; contro il computer — che ha la
   * sua flotta dal principio — si comincia subito, e il primo colpo e' tuo.
   */
  .post('/partite/:id/flotta', async (c) => {
    const { row, io } = await partitaMia(c)
    const { versione, corpo } = await versioneDal(c)
    if (row.stato !== 'disposizione') fail(409, 'GIA_IN_BATTAGLIA', 'La flotta è già in mare.')
    controllaVersione(row, versione)

    const flotta = JSON.stringify(leggiFlotta(corpo.navi))
    const cambi = io === 'a' ? { flotta_a: flotta } : { flotta_b: flotta }
    const altraPronta = flottaDi(row, altro(io)) !== null
    const primo: Lato = controComputer(row)
      ? 'a'
      : // A testa o croce, come al tavolo: un byte casuale del Worker.
        crypto.getRandomValues(new Uint8Array(1))[0] % 2 === 0
        ? 'a'
        : 'b'
    const dopo = await salvaPartita(
      c.env.DB,
      row,
      altraPronta ? { ...cambi, stato: 'battaglia', primo } : cambi,
      Date.now(),
    )
    return rispondi(c, dopo, io)
  })

  /**
   * Spara. Contro il computer, nella stessa richiesta risponde lui: il suo
   * colpo costa qualche centesimo di millisecondo, e cosi' la partita e' una
   * scrittura sola per turno invece di due.
   */
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
    let provvisoria: PartitaRow = { ...row, colpi: JSON.stringify(colpi) }
    const affondata = (partita: PartitaRow, chi: Lato) =>
      flottaAffondata(
        flottaDi(partita, altro(chi)) ?? [],
        new Set(colpiDelLato(partita, chi).map((colpo) => colpo.casella)),
      )

    let cambi: CambiPartita = { colpi: JSON.stringify(colpi) }
    if (affondata(provvisoria, io)) {
      cambi = fine(cambi, io, 'flotta')
    } else if (controComputer(row)) {
      colpi.push(colpoDelComputerIn(provvisoria))
      provvisoria = { ...row, colpi: JSON.stringify(colpi) }
      cambi = { colpi: JSON.stringify(colpi) }
      if (affondata(provvisoria, 'b')) cambi = fine(cambi, 'b', 'flotta')
    }

    const dopo = await salvaPartita(c.env.DB, row, cambi, Date.now())
    return rispondi(c, dopo, io)
  })

  /**
   * Gioca ancora, fra amici, a partita finita: una rivincita all'altro. Se
   * l'aveva gia' chiesta lui, e' un si': la partita nuova comincia subito, con
   * il conto della serie.
   */
  .post('/partite/:id/rivincita', async (c) => {
    const db = c.env.DB
    const { row, io } = await partitaMia(c)
    if (row.modalita !== 'amici') fail(409, 'NON_FRA_AMICI', 'La rivincita è per le partite fra amici.')
    if (row.stato !== 'finita') fail(409, 'NON_FINITA', 'La rivincita si chiede a partita finita.')
    const mioId = c.get('player').id
    const altroId = (io === 'a' ? row.giocatore_b : row.giocatore_a)!
    const adesso = Date.now()
    const esistente = await rivincitaDi(db, row.id)
    if (esistente && esistente.stato === 'attesa' && esistente.da_id === altroId && esistente.a_id === mioId) {
      const partitaId = await accettaSfida(db, esistente, adesso)
      return c.json({ partitaId })
    }
    const [online, mia, sua] = await Promise.all([
      eOnline(db, altroId, adesso),
      partitaAperta(db, mioId),
      partitaAperta(db, altroId),
    ])
    if (mia) fail(409, 'IN_PARTITA', 'Hai già una battaglia in corso: finiscila prima.')
    if (!online) fail(409, 'NON_ONLINE', 'Non è più online.')
    if (sua) fail(409, 'OCCUPATO', 'Sta già giocando un’altra battaglia.')
    const invitoId = await mandaSfida(db, mioId, altroId, adesso, row.id)
    return c.json({ invitoId }, 201)
  })

  /** Abbandona: vince l'altro. */
  .post('/partite/:id/resa', async (c) => {
    const { row, io } = await partitaMia(c)
    if (row.stato === 'finita') return rispondi(c, row, io)
    const dopo = await salvaPartita(c.env.DB, row, fine({}, altro(io), 'resa'), Date.now())
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
      fail(409, 'ANCORA_PRESTO', 'L’avversario ha ancora tempo.')
    }
    const dopo = await salvaPartita(c.env.DB, row, fine({}, io, 'assenza'), Date.now())
    return rispondi(c, dopo, io)
  })

/**
 * Gli inviti con un link, visti da fuori: chi apre il link non ha ancora un
 * account, e la pagina deve potergli dire chi lo sta sfidando prima di
 * chiedergli di registrarsi. Solo il nome di chi invita e se l'invito vale
 * ancora: niente che non si potrebbe leggere nel messaggio con cui e' arrivato.
 */
export const invitiPubblici = new Hono<AppEnv>().get('/:codice', async (c) => {
  const codice = c.req.param('codice')
  const adesso = Date.now()
  // I codici sono della battaglia, delle sfide a quiz, di Indovina chi o dei giochi da tavoliere: lunghi e a
  // caso, non si incontrano.
  const invito =
    (await invitoConLink(c.env.DB, codice, adesso)) ??
    (await invitoQuizConLink(c.env.DB, codice, adesso)) ??
    (await invitoIndovinaConLink(c.env.DB, codice, adesso)) ??
    (await invitoTavoloConLink(c.env.DB, codice, adesso)) ??
    (await invitoNomiConLink(c.env.DB, codice, adesso))
  if (!invito) fail(404, 'LINK_NON_TROVATO', 'Questo invito non esiste.')
  return c.json<InvitoConLink>(invito)
})

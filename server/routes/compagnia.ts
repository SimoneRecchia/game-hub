import { Hono, type Context } from 'hono'
import { MAX_COOP_GUESTS } from '../../shared/config'
import { gameDate, msToNextPuzzle, puzzleNumberFor } from '../../shared/daily'
import { LATO, tabelloneDa, validaPosa } from '../../shared/scarabeo'
import { ALFABETO } from '../../shared/wordle'
import type {
  CompagniaHost,
  CruciverbaState,
  InvitabileCompagnia,
  PropostaCompagnia,
  ScarabeoState,
  VistaCompagnia,
} from '../../shared/types'
import type { AppEnv } from '../types'
import { fail } from '../lib/http'
import { requireVerified } from '../lib/session'
import * as cruciverba from '../lib/cruciverbaStore'
import * as scarabeo from '../lib/scarabeoStore'
import { paroleSconosciute } from '../lib/dizionario'
import {
  apriCompagnia,
  compagniaDelGiorno,
  compagniaPerId,
  entraNellaGiornata,
  giocatoreBreve,
  giornataDi,
  invita,
  invitabili,
  leggiGioco,
  ospitiDi,
  pagaOspiti,
  postiOccupati,
  rispondi,
  ritira,
  statoOspite,
  suggerimentiDi,
  suggerisci,
  vistaHost,
  type CompagniaRow,
} from '../lib/compagniaStore'

const oggi = () => puzzleNumberFor(gameDate())

/** La partita dell'host com'e' adesso, e come si leggono i suggerimenti su di lei. */
type PartitaHost = (
  | { gioco: 'cruciverba'; row: cruciverba.PartitaRow; stato: CruciverbaState }
  | { gioco: 'scarabeo'; row: scarabeo.PartitaRow; stato: ScarabeoState }
) & {
  /** I punti che vale adesso: quelli che prende chi gioca con l'host. */
  punti: number
  /** La proposta e' gia' nella partita: la parola nella griglia, la posa sul tabellone. */
  usato: (p: PropostaCompagnia) => boolean
  /** Quelle che servono ancora: nello Scarabeo le pose del turno di adesso, e quelle giocate. */
  visibile: (p: PropostaCompagnia, usato: boolean) => boolean
}

async function partitaHost(db: D1Database, compagnia: CompagniaRow): Promise<PartitaHost | null> {
  const numero = compagnia.puzzle_number
  if (compagnia.gioco === 'cruciverba') {
    const [schema, row] = await Promise.all([
      cruciverba.schemaDelGiorno(db, numero),
      db
        .prepare('SELECT * FROM cruciverba_games WHERE player_id = ? AND puzzle_number = ?')
        .bind(compagnia.host_id, numero)
        .first<cruciverba.PartitaRow>(),
    ])
    if (!schema || !row) return null
    const stato = cruciverba.statoDa(row, schema, cruciverba.identitaDelGiorno(row), msToNextPuzzle())
    return {
      gioco: 'cruciverba',
      row,
      stato,
      punti: row.score,
      usato: (p) => {
        if (p.gioco !== 'cruciverba') return false
        const d = stato.definizioni.find((x) => x.chiave === p.definizione)
        return !!d && d.caselle.every((k, i) => row.lettere[k] === p.parola[i])
      },
      visibile: () => true,
    }
  }
  const [row, computer] = await Promise.all([
    db
      .prepare('SELECT * FROM scarabeo_games WHERE player_id = ? AND puzzle_number = ?')
      .bind(compagnia.host_id, numero)
      .first<scarabeo.PartitaRow>(),
    scarabeo.computerDelGiorno(db, numero),
  ])
  if (!row) return null
  const stato = scarabeo.statoDa(row, computer, msToNextPuzzle())
  const occupate = new Map(stato.celle.map((cella) => [cella.r * LATO + cella.c, cella]))
  return {
    gioco: 'scarabeo',
    row,
    stato,
    punti: row.punti,
    usato: (p) =>
      p.gioco === 'scarabeo' &&
      p.posa.every((t) => {
        const cella = occupate.get(t.r * LATO + t.c)
        return !!cella && cella.lettera === t.lettera && cella.jolly === t.jolly
      }),
    visibile: (p, usato) => p.gioco === 'scarabeo' && (usato || p.turno === row.turns),
  }
}

/**
 * Una proposta arrivata da un invitato, controllata sulla partita dell'host.
 *
 * Nel cruciverba si guarda solo la forma — una definizione che c'e', una
 * parola lunga quanto lei — e mai se e' giusta: un server che rifiutasse le
 * parole sbagliate direbbe la soluzione a chi prova. Nello Scarabeo la posa
 * passa dagli stessi controlli di una mossa, cosi' l'host vede solo pose che
 * puo' giocare, con i loro punti.
 */
async function leggiProposta(
  c: Context<AppEnv>,
  partita: PartitaHost,
  corpo: unknown,
): Promise<{ chiave: string; proposta: PropostaCompagnia }> {
  if (partita.gioco === 'cruciverba') {
    const { definizione, parola } = (corpo ?? {}) as { definizione?: unknown; parola?: unknown }
    const d = partita.stato.definizioni.find((x) => x.chiave === definizione)
    if (!d) fail(400, 'DEFINIZIONE', 'Questa definizione non c’è.')
    const testo = typeof parola === 'string' ? parola.trim().toLowerCase() : ''
    if (testo.length !== d.caselle.length || ![...testo].every((l) => ALFABETO.includes(l))) {
      fail(400, 'PAROLA', `Servono ${d.caselle.length} lettere.`)
    }
    return { chiave: d.chiave, proposta: { gioco: 'cruciverba', definizione: d.chiave, parola: testo } }
  }

  const posa = scarabeo.leggiPosa(corpo)
  scarabeo.verificaLeggio(partita.stato.leggio, posa)
  const mosse = scarabeo.mosseDi(partita.row)
  const esito = validaPosa(tabelloneDa(mosse), posa, !mosse.some((m) => m.tipo === 'posa'))
  if (!esito.ok) fail(422, esito.codice, esito.errore)
  const parole = esito.parole.map((p) => p.parola)
  const sconosciute = await paroleSconosciute(c.env, c.req.url, parole).catch(() =>
    fail(503, 'DIZIONARIO_ASSENTE', 'Il dizionario non risponde: riprova tra poco.'),
  )
  if (sconosciute.length > 0) {
    const elenco = sconosciute.map((p) => `"${p.toUpperCase()}"`).join(', ')
    fail(
      422,
      'PAROLA_SCONOSCIUTA',
      sconosciute.length === 1 ? `${elenco} non è nel dizionario.` : `${elenco} non sono nel dizionario.`,
    )
  }
  const turno = partita.row.turns
  return { chiave: `t${turno}`, proposta: { gioco: 'scarabeo', turno, posa, parole, punti: esito.punti } }
}

/** La partita di oggi di chi accetta senza averla ancora aperta: serve una riga a cui legare la giornata. */
async function apriPerOspite(db: D1Database, compagnia: CompagniaRow, playerId: string): Promise<void> {
  if (compagnia.gioco === 'cruciverba') {
    const quando = cruciverba.giornata()
    const schema = await cruciverba.schemaObbligatorio(db, quando.puzzleNumber)
    await cruciverba.apriPartita(db, playerId, quando, schema)
  } else {
    await scarabeo.apriPartita(db, playerId, scarabeo.giornata())
  }
}

async function perHost(db: D1Database, compagnia: CompagniaRow): Promise<CompagniaHost> {
  const partita = await partitaHost(db, compagnia)
  const suggerimenti = partita ? await suggerimentiDi(db, compagnia.id, partita.usato, partita.visibile) : []
  return vistaHost(db, compagnia, suggerimenti)
}

/** La compagnia di un indirizzo, con chi la guarda: l'host, o un invitato che e' dentro. */
async function perChiGuarda(c: Context<AppEnv>) {
  const db = c.env.DB
  const io = c.get('player').id
  const compagnia = await compagniaPerId(db, c.req.param('id') ?? '')
  if (!compagnia) fail(404, 'COMPAGNIA_NON_TROVATA', 'Partita non trovata.')
  const [stato, mia] = await Promise.all([
    statoOspite(db, compagnia.id, io),
    giornataDi(db, compagnia.gioco, io, compagnia.puzzle_number),
  ])
  const dentro = stato === 'dentro' || mia?.in_compagnia === compagnia.id
  // Solo chi ha accettato guarda: altrimenti basterebbe l'indirizzo per vedere lo schema riempito.
  if (compagnia.host_id !== io && !dentro) fail(403, 'NON_INVITATO', 'Questa partita non è condivisa con te.')
  return { db, io, compagnia, mia }
}

async function vista(c: Context<AppEnv>): Promise<VistaCompagnia> {
  const { db, io, compagnia, mia: letta } = await perChiGuarda(c)
  let mia = letta
  const partita = await partitaHost(db, compagnia)
  if (!partita) fail(404, 'PARTITA_NON_TROVATA', 'Partita non trovata.')

  // L'host ha finito ma chi gioca con lui non ha ancora i punti: una richiesta caduta a meta'. Si paga qui.
  if (partita.row.status === 'done' && mia?.in_compagnia === compagnia.id && mia.status !== 'done') {
    await pagaOspiti(db, compagnia.gioco, compagnia.host_id, compagnia.puzzle_number, partita.punti, true)
    mia = await giornataDi(db, compagnia.gioco, io, compagnia.puzzle_number)
  }

  const conta = mia?.in_compagnia === compagnia.id
  const comune = {
    compagniaId: compagnia.id,
    host: await giocatoreBreve(db, compagnia.host_id),
    conta,
    mioPunteggio: conta ? (mia?.assist_score ?? null) : null,
    suggerimenti: await suggerimentiDi(db, compagnia.id, partita.usato, partita.visibile),
  }
  return partita.gioco === 'cruciverba'
    ? { ...comune, gioco: 'cruciverba', partita: partita.stato }
    : { ...comune, gioco: 'scarabeo', partita: partita.stato }
}

function leggiInvitato(corpo: unknown): string {
  const playerId = (corpo as { playerId?: unknown } | null)?.playerId
  if (typeof playerId !== 'string' || !playerId) fail(400, 'BAD_REQUEST', 'Manca il giocatore da invitare.')
  return playerId
}

/**
 * La compagnia del cruciverba e dello Scarabeo: l'host invita, gli invitati
 * accettano, guardano la sua partita e suggeriscono. Le regole stanno in
 * `server/lib/compagniaStore.ts`.
 */
export const compagniaRoutes = new Hono<AppEnv>()
  .use('*', requireVerified)

  /* ───────────────────────────────  L'host  ─────────────────────────────── */

  /** La compagnia dell'host per oggi, se c'e'. Di sola lettura: la crea il primo invito. */
  .get('/:gioco', async (c) => {
    const gioco = leggiGioco(c.req.param('gioco'))
    const compagnia = await compagniaDelGiorno(c.env.DB, gioco, c.get('player').id, oggi())
    return c.json<CompagniaHost | null>(compagnia ? await perHost(c.env.DB, compagnia) : null)
  })

  /** Chi si puo' invitare: chi ha l'app aperta per primo. */
  .get('/:gioco/giocatori', async (c) => {
    const gioco = leggiGioco(c.req.param('gioco'))
    const io = c.get('player').id
    const numero = oggi()
    const compagnia = await compagniaDelGiorno(c.env.DB, gioco, io, numero)
    const giocatori = await invitabili(c.env.DB, gioco, io, numero, compagnia?.id ?? null, Date.now())
    return c.json<{ giocatori: InvitabileCompagnia[] }>({ giocatori })
  })

  .post('/:gioco/invita', async (c) => {
    const gioco = leggiGioco(c.req.param('gioco'))
    const guestId = leggiInvitato(await c.req.json().catch(() => null))
    const db = c.env.DB
    const io = c.get('player').id
    if (guestId === io) fail(400, 'SELF_INVITE', 'Non puoi invitare te stesso.')
    if (!(await db.prepare('SELECT id FROM players WHERE id = ?').bind(guestId).first())) {
      fail(404, 'PLAYER_NOT_FOUND', 'Giocatore non trovato.')
    }

    const numero = oggi()
    const mia = await giornataDi(db, gioco, io, numero)
    if (!mia) fail(409, 'NON_APERTA', 'Apri prima la partita di oggi.')
    if (mia.in_compagnia) fail(409, 'GIOCHI_IN_COMPAGNIA', 'Oggi giochi già in compagnia di qualcun altro.')
    if (mia.status === 'done') fail(409, 'PARTITA_FINITA', 'Hai già finito: in compagnia si gioca mentre si gioca.')

    const compagnia = await apriCompagnia(db, gioco, io, numero, mia.id)
    const sua = await giornataDi(db, gioco, guestId, numero)
    if (sua?.in_compagnia && sua.in_compagnia !== compagnia.id) {
      fail(409, 'OCCUPATO', 'Oggi gioca già in compagnia di qualcun altro.')
    }
    if ((await postiOccupati(db, compagnia.id)) >= MAX_COOP_GUESTS) {
      fail(409, 'AL_COMPLETO', `Puoi invitare al massimo ${MAX_COOP_GUESTS} persone.`)
    }
    if (!(await invita(db, compagnia.id, guestId))) fail(409, 'GIA_INVITATO', 'Questa persona è già stata invitata.')
    return c.json<CompagniaHost>(await perHost(db, compagnia), 201)
  })

  /** Ritira un invito non ancora accettato. */
  .post('/:gioco/ritira', async (c) => {
    const gioco = leggiGioco(c.req.param('gioco'))
    const guestId = leggiInvitato(await c.req.json().catch(() => null))
    const db = c.env.DB
    const compagnia = await compagniaDelGiorno(db, gioco, c.get('player').id, oggi())
    if (!compagnia) fail(404, 'COMPAGNIA_NON_TROVATA', 'Non hai invitato nessuno.')
    if (!(await ritira(db, compagnia.id, guestId))) {
      fail(409, 'GIA_DENTRO', 'Ha già accettato: oggi gioca con te.')
    }
    return c.json<CompagniaHost>(await perHost(db, compagnia))
  })

  /* ─────────────────────────────  Chi e' invitato  ───────────────────────────── */

  /** La partita dell'host, come la vede chi gioca con lui. La schermata la rilegge a polling. */
  .get('/partita/:id', async (c) => c.json<VistaCompagnia>(await vista(c)))

  .post('/partita/:id/accetta', async (c) => {
    const db = c.env.DB
    const io = c.get('player').id
    const compagnia = await compagniaPerId(db, c.req.param('id'))
    const stato = compagnia ? await statoOspite(db, compagnia.id, io) : null
    if (!compagnia || !stato) fail(404, 'INVITO_NON_TROVATO', 'Invito non trovato.')
    if (stato === 'rifiutato') fail(409, 'INVITO_RIFIUTATO', 'Hai già rifiutato questo invito.')
    if (compagnia.puzzle_number !== oggi()) fail(409, 'INVITO_SCADUTO', 'Questo invito è scaduto.')

    const numero = compagnia.puzzle_number
    const mia = await giornataDi(db, compagnia.gioco, io, numero)
    if (mia?.in_compagnia && mia.in_compagnia !== compagnia.id) {
      fail(409, 'GIOCHI_IN_COMPAGNIA', 'Oggi giochi già in compagnia di qualcun altro.')
    }
    // Chi ha gia' qualcuno nella propria partita non va in quella di un altro: chi gioca con lui resterebbe senza.
    const propria = await compagniaDelGiorno(db, compagnia.gioco, io, numero)
    if (propria && (await ospitiDi(db, propria.id)).some((o) => o.stato === 'dentro')) {
      fail(409, 'HAI_COMPAGNIA', 'Hai già qualcuno nella tua partita di oggi.')
    }

    let conta = mia?.in_compagnia === compagnia.id
    if (!conta && mia?.status !== 'done') {
      // La giornata non e' finita: diventa questa. Se la partita non e' mai stata aperta, si apre adesso.
      if (!mia) await apriPerOspite(db, compagnia, io)
      conta = await entraNellaGiornata(db, compagnia, io)
      if (!conta) fail(409, 'PARTITA_FINITA', 'La partita è già finita.')
    } else if (!conta) {
      // Chi l'aveva gia' giocata guarda e suggerisce: la partita dell'host deve essere ancora aperta.
      const host = await giornataDi(db, compagnia.gioco, compagnia.host_id, numero)
      if (host?.status !== 'playing') fail(409, 'PARTITA_FINITA', 'La partita è già finita.')
    }
    await rispondi(db, compagnia.id, io, 'dentro')
    return c.json({ ok: true, compagniaId: compagnia.id, gioco: compagnia.gioco, conta })
  })

  .post('/partita/:id/rifiuta', async (c) => {
    const db = c.env.DB
    const io = c.get('player').id
    const compagnia = await compagniaPerId(db, c.req.param('id'))
    if (!compagnia || !(await statoOspite(db, compagnia.id, io))) {
      fail(404, 'INVITO_NON_TROVATO', 'Invito non trovato.')
    }
    await rispondi(db, compagnia.id, io, 'rifiutato')
    return c.json({ ok: true })
  })

  /**
   * Un suggerimento: una parola per una definizione, o una posa. L'host lo
   * vede e lo prende o no; quel che si gioca lo decide sempre lui.
   */
  .post('/partita/:id/suggerisci', async (c) => {
    const { db, io, compagnia } = await perChiGuarda(c)
    if (compagnia.host_id === io) fail(409, 'SEI_HOST', 'È la tua partita: gioca tu.')
    const partita = await partitaHost(db, compagnia)
    if (!partita) fail(404, 'PARTITA_NON_TROVATA', 'Partita non trovata.')
    if (partita.row.status !== 'playing') fail(409, 'PARTITA_FINITA', 'La partita è già finita.')
    const { chiave, proposta } = await leggiProposta(c, partita, await c.req.json().catch(() => null))
    await suggerisci(db, compagnia.id, io, chiave, proposta)
    return c.json<VistaCompagnia>(await vista(c), 201)
  })

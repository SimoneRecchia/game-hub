import { Hono, type Context } from 'hono'
import { MAX_COOP_GUESTS, WORD_LENGTH } from '../../shared/config'
import { gameDate, msToNextPuzzle, puzzleNumberFor } from '../../shared/daily'
import { LATO, sacchettoDaSeme, tabelloneDa, validaPosa, type Casella, type Mossa } from '../../shared/scarabeo'
import { LIVELLI, statoLibera, type Livello } from '../../shared/scarabeo-computer'
import { ALFABETO, isWellFormedGuess } from '../../shared/wordle'
import { GUESS_SET } from '../../shared/words/guesses'
import type {
  CompagniaHost,
  CruciverbaState,
  GiocoLiberoInCompagnia,
  InvitabileCompagnia,
  PropostaCompagnia,
  ScarabeoLiberoCondiviso,
  ScarabeoState,
  VistaCompagnia,
  WordleLiberaState,
} from '../../shared/types'
import type { AppEnv } from '../types'
import { fail } from '../lib/http'
import { requireVerified } from '../lib/session'
import * as cruciverba from '../lib/cruciverbaStore'
import * as scarabeo from '../lib/scarabeoStore'
import { liberaPerId as wordleLiberaPerId, paroleDi, statoLibero as statoWordleLibero } from '../lib/wordleLibera'
import { controllaNelDizionario } from '../lib/dizionario'
import {
  aggiornaLibera,
  apriCompagnia,
  apriCompagniaLibera,
  chiudiCompagnia,
  compagniaDelGiorno,
  compagniaLibera,
  compagniaPerId,
  delGiorno,
  entraNellaGiornata,
  giocatoreBreve,
  giornataDi,
  invita,
  invitabili,
  invitabiliLiberi,
  leggiGioco,
  leggiGiocoLibero,
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

/** Il tabellone e il leggio dell'host di uno Scarabeo, per controllare una posa e dire se una posa e' gia' giocata. */
interface TavolaScarabeo {
  tabellone: (Casella | null)[]
  leggio: string[]
  primaMossa: boolean
  /** Il numero della mossa che l'host sta per fare: la chiave dei suggerimenti. */
  turno: number
  /** Tocca all'host: nella libera puo' toccare al computer, e allora non si suggerisce. */
  tocca: boolean
}

/** La partita dell'host com'e' adesso, e come si leggono i suggerimenti su di lei. */
type PartitaHost = (
  | { gioco: 'cruciverba'; stato: CruciverbaState | null }
  | { gioco: 'scarabeo'; modalita: 'classificata'; stato: ScarabeoState }
  | { gioco: 'scarabeo'; modalita: 'libera'; stato: ScarabeoLiberoCondiviso | null }
  | { gioco: 'wordle'; stato: WordleLiberaState | null }
) & {
  /** Si gioca ancora: a partita chiusa non si suggerisce. */
  inCorso: boolean
  /** I punti che vale adesso, nella classificata: quelli che prende chi gioca con l'host. */
  punti: number
  /** Lo Scarabeo: quel che serve a controllare una posa. */
  tavola: TavolaScarabeo | null
  /** La proposta e' gia' nella partita: la parola provata o nella griglia, la posa sul tabellone. */
  usato: (p: PropostaCompagnia) => boolean
  /** Quelle che servono ancora: nello Scarabeo le pose del turno di adesso, e quelle giocate. */
  visibile: (p: PropostaCompagnia, usato: boolean) => boolean
}

const sempre = () => true
const mai = () => false

/** Una parola del cruciverba e' gia' nella griglia dell'host? */
function nellaGriglia(stato: CruciverbaState, lettere: string) {
  return (p: PropostaCompagnia) => {
    if (p.gioco !== 'cruciverba') return false
    const d = stato.definizioni.find((x) => x.chiave === p.definizione)
    return !!d && d.caselle.every((k, i) => lettere[k] === p.parola[i])
  }
}

/** Una posa dello Scarabeo e' gia' sul tabellone, lettera per lettera? */
function sulTabellone(tabellone: readonly (Casella | null)[]) {
  return (p: PropostaCompagnia) =>
    p.gioco === 'scarabeo' &&
    p.posa.every((t) => {
      const casella = tabellone[t.r * LATO + t.c]
      return !!casella && casella.lettera === t.lettera && casella.jolly === t.jolly
    })
}

/** Lo Scarabeo libero scritto dall'host nella compagnia, ripulito: null se non si legge. */
function leggiScarabeoLibero(testo: string | null): ScarabeoLiberoCondiviso | null {
  if (!testo) return null
  try {
    const valore = JSON.parse(testo) as Partial<ScarabeoLiberoCondiviso>
    if (!Number.isInteger(valore.seme) || !LIVELLI.includes(valore.livello as Livello)) return null
    if (!Array.isArray(valore.mosse)) return null
    return { seme: valore.seme!, livello: valore.livello!, mosse: valore.mosse as Mossa[] }
  } catch {
    return null
  }
}

async function partitaHost(db: D1Database, compagnia: CompagniaRow): Promise<PartitaHost | null> {
  if (delGiorno(compagnia)) {
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
        stato,
        inCorso: row.status === 'playing',
        punti: row.score,
        tavola: null,
        usato: nellaGriglia(stato, row.lettere),
        visibile: sempre,
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
    const mosse = scarabeo.mosseDi(row)
    const tabellone = tabelloneDa(mosse)
    return {
      gioco: 'scarabeo',
      modalita: 'classificata',
      stato,
      inCorso: row.status === 'playing',
      punti: row.punti,
      tavola: {
        tabellone,
        leggio: stato.leggio,
        primaMossa: !mosse.some((m) => m.tipo === 'posa'),
        turno: row.turns,
        tocca: row.status === 'playing',
      },
      usato: sulTabellone(tabellone),
      visibile: (p, usato) => p.gioco === 'scarabeo' && (usato || p.turno === row.turns),
    }
  }

  // Le libere: la partita che l'host sta giocando adesso.
  if (compagnia.gioco === 'wordle') {
    const row = compagnia.partita_id ? await wordleLiberaPerId(db, compagnia.partita_id, compagnia.host_id) : null
    const parole = row ? paroleDi(row) : []
    return {
      gioco: 'wordle',
      stato: row ? statoWordleLibero(row) : null,
      inCorso: row?.status === 'playing',
      punti: 0,
      tavola: null,
      usato: (p) => p.gioco === 'wordle' && parole.includes(p.parola),
      visibile: sempre,
    }
  }
  if (compagnia.gioco === 'cruciverba') {
    const row = compagnia.partita_id
      ? await cruciverba.partitaLiberaPerId(db, compagnia.partita_id, compagnia.host_id)
      : null
    const schema = row ? await cruciverba.schemaLibero(db, row.schema_id) : null
    if (!row || !schema) {
      return { gioco: 'cruciverba', stato: null, inCorso: false, punti: 0, tavola: null, usato: mai, visibile: sempre }
    }
    const stato = cruciverba.statoDa(row, schema, cruciverba.identitaLibera(row), msToNextPuzzle())
    return {
      gioco: 'cruciverba',
      stato,
      inCorso: row.status === 'playing',
      punti: 0,
      tavola: null,
      usato: nellaGriglia(stato, row.lettere),
      visibile: sempre,
    }
  }
  const partita = leggiScarabeoLibero(compagnia.stato)
  if (!partita) {
    return {
      gioco: 'scarabeo',
      modalita: 'libera',
      stato: null,
      inCorso: false,
      punti: 0,
      tavola: null,
      usato: mai,
      visibile: sempre,
    }
  }
  const libera = statoLibera(partita, sacchettoDaSeme(partita.seme))
  const turno = partita.mosse.length
  return {
    gioco: 'scarabeo',
    modalita: 'libera',
    stato: partita,
    inCorso: !libera.finita,
    punti: 0,
    tavola: {
      tabellone: libera.tabellone,
      leggio: libera.mioLeggio,
      primaMossa: !partita.mosse.some((m) => m.tipo === 'posa'),
      turno,
      tocca: libera.turno === 'io',
    },
    usato: sulTabellone(libera.tabellone),
    visibile: (p, usato) => p.gioco === 'scarabeo' && (usato || p.turno === turno),
  }
}

/**
 * Una proposta arrivata da un invitato, controllata sulla partita dell'host.
 *
 * Nel cruciverba si guarda solo la forma — una definizione che c'e', una
 * parola lunga quanto lei — e mai se e' giusta: un server che rifiutasse le
 * parole sbagliate direbbe la soluzione a chi prova. Nel Wordle la parola deve
 * essere fra quelle ammesse, come un tentativo. Nello Scarabeo la posa passa
 * dagli stessi controlli di una mossa, cosi' l'host vede solo pose che puo'
 * giocare, con i loro punti.
 */
async function leggiProposta(
  c: Context<AppEnv>,
  partita: PartitaHost,
  corpo: unknown,
): Promise<{ chiave: string; proposta: PropostaCompagnia }> {
  if (partita.gioco === 'wordle') {
    const parola = String((corpo as { parola?: unknown } | null)?.parola ?? '')
      .trim()
      .toLowerCase()
    if (!isWellFormedGuess(parola)) fail(400, 'PAROLA', `Serve una parola di ${WORD_LENGTH} lettere, senza accenti.`)
    if (!GUESS_SET.has(parola)) fail(400, 'NOT_A_WORD', `"${parola.toUpperCase()}" non è nel dizionario.`)
    return { chiave: parola, proposta: { gioco: 'wordle', parola } }
  }

  if (partita.gioco === 'cruciverba') {
    const { definizione, parola } = (corpo ?? {}) as { definizione?: unknown; parola?: unknown }
    const d = partita.stato?.definizioni.find((x) => x.chiave === definizione)
    if (!d) fail(400, 'DEFINIZIONE', 'Questa definizione non c’è.')
    const testo = typeof parola === 'string' ? parola.trim().toLowerCase() : ''
    if (testo.length !== d.caselle.length || ![...testo].every((l) => ALFABETO.includes(l))) {
      fail(400, 'PAROLA', `Servono ${d.caselle.length} lettere.`)
    }
    return { chiave: d.chiave, proposta: { gioco: 'cruciverba', definizione: d.chiave, parola: testo } }
  }

  const tavola = partita.tavola
  if (!tavola) fail(409, 'PARTITA_FINITA', 'La partita è già finita.')
  if (!tavola.tocca) fail(409, 'TOCCA_AL_COMPUTER', 'Tocca al computer: aspetta la sua mossa.')
  const posa = scarabeo.leggiPosa(corpo)
  scarabeo.verificaLeggio(tavola.leggio, posa)
  const esito = validaPosa(tavola.tabellone, posa, tavola.primaMossa)
  if (!esito.ok) fail(422, esito.codice, esito.errore)
  const parole = esito.parole.map((p) => p.parola)
  await controllaNelDizionario(c.env, c.req.url, parole)
  return {
    chiave: `t${tavola.turno}`,
    proposta: { gioco: 'scarabeo', turno: tavola.turno, posa, parole, punti: esito.punti },
  }
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
    delGiorno(compagnia) ? giornataDi(db, compagnia.gioco, io, compagnia.puzzle_number) : null,
  ])
  const dentro = stato === 'dentro' || (mia !== null && mia.in_compagnia === compagnia.id)
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
  if (delGiorno(compagnia) && !partita.inCorso && mia?.in_compagnia === compagnia.id && mia.status !== 'done') {
    await pagaOspiti(db, compagnia.gioco, compagnia.host_id, compagnia.puzzle_number, partita.punti, true)
    mia = await giornataDi(db, compagnia.gioco, io, compagnia.puzzle_number)
  }

  const conta = mia !== null && mia.in_compagnia === compagnia.id
  const comune = {
    compagniaId: compagnia.id,
    modalita: compagnia.modalita,
    host: await giocatoreBreve(db, compagnia.host_id),
    aperta: compagnia.chiusa_at === null,
    conta,
    mioPunteggio: conta ? (mia?.assist_score ?? null) : null,
    suggerimenti: await suggerimentiDi(db, compagnia.id, partita.usato, partita.visibile),
  }
  switch (partita.gioco) {
    case 'wordle':
      return { ...comune, gioco: 'wordle', partita: partita.stato }
    case 'cruciverba':
      return { ...comune, gioco: 'cruciverba', partita: partita.stato }
    default:
      return partita.modalita === 'classificata'
        ? { ...comune, gioco: 'scarabeo', modalita: 'classificata', partita: partita.stato }
        : { ...comune, gioco: 'scarabeo', modalita: 'libera', partita: partita.stato }
  }
}

function leggiInvitato(corpo: unknown): string {
  const playerId = (corpo as { playerId?: unknown } | null)?.playerId
  if (typeof playerId !== 'string' || !playerId) fail(400, 'BAD_REQUEST', 'Manca il giocatore da invitare.')
  return playerId
}

async function esisteGiocatore(db: D1Database, id: string) {
  if (!(await db.prepare('SELECT id FROM players WHERE id = ?').bind(id).first())) {
    fail(404, 'PLAYER_NOT_FOUND', 'Giocatore non trovato.')
  }
}

/**
 * La partita libera che l'host sta giocando, arrivata dal suo telefono: il suo
 * indirizzo sul server per il Wordle e il cruciverba, che devono essere sue,
 * o le mosse dello Scarabeo, che sta tutto nel telefono.
 */
async function leggiPartitaLibera(
  db: D1Database,
  gioco: GiocoLiberoInCompagnia,
  hostId: string,
  corpo: unknown,
): Promise<{ partitaId: string | null; stato: string | null } | null> {
  const { partitaId, stato } = (corpo ?? {}) as { partitaId?: unknown; stato?: unknown }
  if (gioco === 'scarabeo') {
    if (stato === undefined) return null
    const partita = leggiScarabeoLibero(JSON.stringify(stato ?? null))
    if (stato !== null && !partita) fail(400, 'PARTITA', 'La partita non è valida.')
    return { partitaId: null, stato: partita ? JSON.stringify(partita) : null }
  }
  if (partitaId === undefined) return null
  if (partitaId === null) return { partitaId: null, stato: null }
  const id = String(partitaId)
  const sua =
    gioco === 'wordle'
      ? await wordleLiberaPerId(db, id, hostId)
      : await cruciverba.partitaLiberaPerId(db, id, hostId)
  if (!sua) fail(404, 'PARTITA_NON_TROVATA', 'Partita non trovata.')
  return { partitaId: id, stato: null }
}

/**
 * La compagnia: l'host invita, gli invitati accettano, guardano la sua partita
 * e suggeriscono. Quella della classificata del cruciverba e dello Scarabeo
 * (le regole stanno in `server/lib/compagniaStore.ts`), e quella delle libere
 * del Wordle, del cruciverba e dello Scarabeo, dove si guarda e basta.
 */
export const compagniaRoutes = new Hono<AppEnv>()
  .use('*', requireVerified)

  /* ───────────────────────────  Le libere: l'host  ─────────────────────────── */

  /** La compagnia delle libere dell'host per un gioco, se e' aperta. */
  .get('/libera/:gioco', async (c) => {
    const gioco = leggiGiocoLibero(c.req.param('gioco'))
    const compagnia = await compagniaLibera(c.env.DB, gioco, c.get('player').id)
    return c.json<CompagniaHost | null>(compagnia ? await perHost(c.env.DB, compagnia) : null)
  })

  .get('/libera/:gioco/giocatori', async (c) => {
    const gioco = leggiGiocoLibero(c.req.param('gioco'))
    const io = c.get('player').id
    const compagnia = await compagniaLibera(c.env.DB, gioco, io)
    const giocatori = await invitabiliLiberi(c.env.DB, io, compagnia?.id ?? null, Date.now())
    return c.json<{ giocatori: InvitabileCompagnia[] }>({ giocatori })
  })

  /** Un invito a guardare: apre la compagnia, se serve, sulla partita che l'host sta giocando. */
  .post('/libera/:gioco/invita', async (c) => {
    const gioco = leggiGiocoLibero(c.req.param('gioco'))
    const corpo = await c.req.json().catch(() => null)
    const guestId = leggiInvitato(corpo)
    const db = c.env.DB
    const io = c.get('player').id
    if (guestId === io) fail(400, 'SELF_INVITE', 'Non puoi invitare te stesso.')
    await esisteGiocatore(db, guestId)

    const partita = await leggiPartitaLibera(db, gioco, io, corpo)
    const compagnia = await apriCompagniaLibera(db, gioco, io)
    if (partita) await aggiornaLibera(db, compagnia.id, partita)
    if ((await postiOccupati(db, compagnia.id)) >= MAX_COOP_GUESTS) {
      fail(409, 'AL_COMPLETO', `Puoi invitare al massimo ${MAX_COOP_GUESTS} persone.`)
    }
    if (!(await invita(db, compagnia.id, guestId))) fail(409, 'GIA_INVITATO', 'Questa persona è già stata invitata.')
    return c.json<CompagniaHost>(await perHost(db, (await compagniaPerId(db, compagnia.id)) ?? compagnia), 201)
  })

  .post('/libera/:gioco/ritira', async (c) => {
    const gioco = leggiGiocoLibero(c.req.param('gioco'))
    const guestId = leggiInvitato(await c.req.json().catch(() => null))
    const db = c.env.DB
    const compagnia = await compagniaLibera(db, gioco, c.get('player').id)
    if (!compagnia) fail(404, 'COMPAGNIA_NON_TROVATA', 'Non hai invitato nessuno.')
    // Nelle libere si puo' mandare via anche chi e' dentro: non c'e' una giornata da proteggere.
    await db
      .prepare('DELETE FROM compagnie_ospiti WHERE compagnia_id = ? AND guest_id = ?')
      .bind(compagnia.id, guestId)
      .run()
    return c.json<CompagniaHost>(await perHost(db, compagnia))
  })

  /** La partita nuova dell'host, o la mossa nuova dello Scarabeo: chi guarda la segue. */
  .post('/libera/:gioco/partita', async (c) => {
    const gioco = leggiGiocoLibero(c.req.param('gioco'))
    const db = c.env.DB
    const io = c.get('player').id
    const compagnia = await compagniaLibera(db, gioco, io)
    if (!compagnia) return c.json<CompagniaHost | null>(null)
    const partita = await leggiPartitaLibera(db, gioco, io, await c.req.json().catch(() => null))
    if (partita) await aggiornaLibera(db, compagnia.id, partita)
    return c.json<CompagniaHost | null>(await perHost(db, (await compagniaPerId(db, compagnia.id)) ?? compagnia))
  })

  /** Basta compagnia: chi guardava smette, e gli inviti decadono. */
  .post('/libera/:gioco/chiudi', async (c) => {
    const gioco = leggiGiocoLibero(c.req.param('gioco'))
    const compagnia = await compagniaLibera(c.env.DB, gioco, c.get('player').id)
    if (compagnia) await chiudiCompagnia(c.env.DB, compagnia.id)
    return c.json({ ok: true })
  })

  /* ─────────────────────────  La classificata: l'host  ───────────────────────── */

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
    await esisteGiocatore(db, guestId)

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
    if (compagnia.chiusa_at !== null) fail(409, 'COMPAGNIA_CHIUSA', 'La partita non è più condivisa.')

    // Nelle libere si guarda e basta: niente giornata da legare.
    if (!delGiorno(compagnia)) {
      await rispondi(db, compagnia.id, io, 'dentro')
      return c.json({ ok: true, compagniaId: compagnia.id, gioco: compagnia.gioco, modalita: 'libera', conta: false })
    }

    const numero = compagnia.puzzle_number
    if (numero !== oggi()) fail(409, 'INVITO_SCADUTO', 'Questo invito è scaduto.')
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
    return c.json({ ok: true, compagniaId: compagnia.id, gioco: compagnia.gioco, modalita: 'classificata', conta })
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
   * Un suggerimento: una parola, una parola per una definizione, o una posa.
   * L'host lo vede e lo prende o no; quel che si gioca lo decide sempre lui.
   */
  .post('/partita/:id/suggerisci', async (c) => {
    const { db, io, compagnia } = await perChiGuarda(c)
    if (compagnia.host_id === io) fail(409, 'SEI_HOST', 'È la tua partita: gioca tu.')
    if (compagnia.chiusa_at !== null) fail(409, 'COMPAGNIA_CHIUSA', 'La partita non è più condivisa.')
    const partita = await partitaHost(db, compagnia)
    if (!partita) fail(404, 'PARTITA_NON_TROVATA', 'Partita non trovata.')
    if (!partita.inCorso) fail(409, 'PARTITA_FINITA', 'La partita è già finita.')
    const { chiave, proposta } = await leggiProposta(c, partita, await c.req.json().catch(() => null))
    await suggerisci(db, compagnia.id, io, chiave, proposta)
    return c.json<VistaCompagnia>(await vista(c), 201)
  })

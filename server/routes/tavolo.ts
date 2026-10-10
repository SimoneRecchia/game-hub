import { Hono, type Context } from 'hono'
import * as go from '../../shared/go'
import { GIOCHI_AL_TAVOLO, type GiocoAlTavolo } from '../../shared/tavolo'
import { giocaMossa, inizialeDi, regoleDi } from '../../shared/tavolo-regole'
import { tempoMossaValido } from '../../shared/tavolo-tempi'
import type { SalaTavolo, VistaTavolo } from '../../shared/types'
import type { AppEnv } from '../types'
import { controllaNelDizionario } from '../lib/dizionario'
import { fail } from '../lib/http'
import { requireVerified } from '../lib/session'
import { eOnline } from '../lib/battagliaStore'
import { avvisa, dopoLaRisposta } from '../lib/notifiche'
import { NOMI_CHIAMATA, SLUG_PARTITA_TAVOLO } from '../../shared/notifiche'
import {
  accettaInvito,
  altroLato,
  chiaviDi,
  chiudiInvito,
  chiudiSeScaduta,
  diTurno,
  giocatoriOnline,
  inConteggio,
  inPartita,
  invitoConCodice,
  latoDellaParte,
  latoDi,
  mandaInvito,
  morteDi,
  mosseDi,
  parteDi,
  partiteInCorso,
  partitaPerId,
  primoDellaRivincita,
  recordTavolo,
  rivincitaDi,
  salvaPartita,
  scadenzaMossa,
  serieDopo,
  ultimoInvito,
  vistaTavolo,
  type Lato,
  type PartitaRow,
} from '../lib/tavoloStore'

/**
 * La notazione piu' lunga che si accetta, se il gioco non ne dice un'altra: una
 * presa di dama con tutte le sue caselle ci sta largamente.
 */
const MOSSA_MASSIMA = 40

function leggiGioco(valore: unknown): GiocoAlTavolo {
  if (!GIOCHI_AL_TAVOLO.includes(valore as GiocoAlTavolo)) fail(400, 'GIOCO', 'Gioco sconosciuto.')
  return valore as GiocoAlTavolo
}

/** La variante chiesta per una partita nuova (il lato del goban), se il gioco ne ha e questa c'e'. */
function leggiVariante(gioco: GiocoAlTavolo, valore: unknown): string | null {
  const varianti = regoleDi(gioco).varianti
  if (!varianti || valore === undefined || valore === null) return null
  if (!varianti.includes(String(valore))) fail(400, 'VARIANTE', 'Questa variante non c’è.')
  return String(valore)
}

/**
 * Il conteggio del go, dalla proposta: i punti di ciascun lato e chi ha vinto.
 * Il Nero e' chi muove per primo, quindi il lato con la parte 0.
 */
function contaGo(row: PartitaRow, morte: readonly number[]): { punti: { a: number; b: number }; vincitore: Lato } {
  const p = go.leggi(row.posizione)!
  const conto = go.punteggio(p, morte)
  const latoNero = latoDellaParte(row, 0)
  const nero = conto.nero
  const bianco = conto.bianco
  return {
    punti: latoNero === 'a' ? { a: nero, b: bianco } : { a: bianco, b: nero },
    vincitore: conto.vincitore === 'nero' ? latoNero : altroLato(latoNero),
  }
}

/**
 * La partita richiesta, e il lato di chi chiede: chi non ci gioca non la vede.
 * Se chi aveva la mossa ha lasciato passare il suo tempo, la partita e' gia'
 * chiusa.
 */
async function partitaMia(c: Context<AppEnv>): Promise<{ row: PartitaRow; io: Lato }> {
  const letta = await partitaPerId(c.env.DB, c.req.param('id') ?? '')
  const io = letta ? latoDi(letta, c.get('player').id) : null
  if (!letta || !io) fail(404, 'PARTITA_NON_TROVATA', 'Partita non trovata.')
  return { row: await chiudiSeScaduta(c.env.DB, letta, Date.now()), io }
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
    const variante = leggiVariante(gioco, corpo.variante)
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
    const posizione = inizialeDi(regoleDi(gioco), variante)
    const tempo = tempoMossaValido(gioco, corpo.tempoMossa)
    const row = await mandaInvito(db, { da: io, a, gioco, posizione, tempoMossaMs: (tempo ?? 0) * 1_000 }, ora)
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
    // Arrivata dopo il tempo: la partita e' gia' chiusa, e la vista lo dice.
    if (row.stato === 'finita' && row.motivo === 'tempo') return rispondi(c, row, io)
    inCorso(row)
    if (Number(corpo.versione) !== row.versione) fail(409, 'CONFLITTO', 'La partita è cambiata: la ricarico.')
    if (diTurno(row) !== io) fail(409, 'NON_TOCCA', 'Non è il tuo turno.')
    const regole = regoleDi(row.gioco)
    const mossa = typeof corpo.mossa === 'string' ? corpo.mossa.slice(0, regole.mossaMassima ?? MOSSA_MASSIMA) : ''
    const giocata = giocaMossa(regole, row.posizione, chiaviDi(row), mossa, parteDi(row, io)!)
    if (!giocata) fail(422, 'MOSSA', 'Questa mossa non si può fare.')
    // Nello Scarabeo le parole della posa devono esserci tutte: si guarda dopo le regole, che costano meno.
    await controllaNelDizionario(c.env, c.req.url, regole.parole?.(row.posizione, giocata.mossa) ?? [])
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
    // Tocca all'altro: se ha chiuso l'app, glielo dice una notifica. Dopo la risposta, e solo se la presenza non lo vede.
    const altro = io === 'a' ? row.giocatore_b : row.giocatore_a
    if (!fine && altro) {
      const nome = c.get('player').displayName || c.get('player').nickname
      await dopoLaRisposta(
        c,
        avvisa(
          c.env,
          altro,
          'turno',
          {
            titolo: 'Tocca a te',
            testo: `${NOMI_CHIAMATA[row.gioco]} con ${nome}`,
            url: `/${SLUG_PARTITA_TAVOLO[row.gioco]}/partita/${row.id}`,
            tag: `turno-${row.id}`,
          },
          { soloSeAssente: true, ttl: 600 },
        ),
      )
    }
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

  /**
   * Il tempo della mossa e' finito sul mio telefono: la partita e' persa. Lo
   * dico io, quindi non si aspetta il margine della rete: e' una resa.
   */
  .post('/partite/:id/tempo', async (c) => {
    const { row, io } = await partitaMia(c)
    if (row.stato !== 'in_corso' || scadenzaMossa(row) === null || diTurno(row) !== io) return rispondi(c, row, io)
    const dopo = await salvaPartita(
      c.env.DB,
      row,
      { stato: 'finita', vincitore: altroLato(io), motivo: 'tempo', patta: null },
      Date.now(),
    )
    return rispondi(c, dopo, io)
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

  /**
   * La vittoria a tavolino: l'altro ha la mossa da un pezzo, e non la fa. Nel
   * conteggio del go l'altro non accetta la proposta che ho accettato io: si
   * chiude contando con quella.
   */
  .post('/partite/:id/reclama', async (c) => {
    const { row, io } = await partitaMia(c)
    const vista = await vistaTavolo(c.env.DB, row, io, Date.now())
    if (!vista.puoiReclamare) fail(409, 'ANCORA_PRESTO', 'L’altro ha ancora tempo.')
    const morte = morteDi(row)
    if (inConteggio(row) && morte) {
      const { punti, vincitore } = contaGo(row, morte)
      const contata = await salvaPartita(
        c.env.DB,
        row,
        { stato: 'finita', vincitore, motivo: 'punti', punti, patta: null },
        Date.now(),
      )
      return rispondi(c, contata, io)
    }
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
    const regole = regoleDi(row.gioco)
    const nuova = await mandaInvito(
      db,
      {
        da: mioId,
        a: altroId,
        gioco: row.gioco,
        rivincitaDi: row.id,
        serie: serieDopo(row, mioId, altroId),
        primo: primoDellaRivincita(row, mioId),
        // La rivincita si gioca sullo stesso goban, e con lo stesso tempo per mossa.
        posizione: inizialeDi(regole, regole.varianteDi?.(row.posizione)),
        tempoMossaMs: row.tempo_mossa_ms,
      },
      ora,
    )
    return c.json({ invitoId: nuova.id }, 201)
  })

  /**
   * Il conteggio del go, a gioco fermo dopo due passi. Uno dei due propone le
   * pietre morte — la prima proposta e' la stima del telefono, poi si toccano i
   * gruppi — e quando tutti e due hanno accettato la stessa proposta si contano
   * i punti, e la partita e' finita. Proporre non e' accettare: la prima
   * proposta la manda il telefono da solo, prima che chi gioca l'abbia vista,
   * e ogni proposta nuova cancella le accettazioni di quella di prima. Chi non
   * e' d'accordo riprende a giocare: si cattura sul goban quel che per lui e'
   * morto.
   */
  .post('/partite/:id/conteggio', async (c) => {
    const { row, io } = await partitaMia(c)
    const corpo = await corpoDi(c)
    if (!inConteggio(row)) fail(409, 'NON_SI_CONTA', 'Non si sta contando.')
    if (Number(corpo.versione) !== row.versione) fail(409, 'CONFLITTO', 'La partita è cambiata: la ricarico.')
    const ora = Date.now()
    const p = go.leggi(row.posizione)!

    if (corpo.azione === 'proponi') {
      const lista = Array.isArray(corpo.morte) ? corpo.morte : null
      if (!lista || lista.length > p.punti.length) fail(400, 'MORTE', 'Le pietre morte non si leggono.')
      const morte = [...new Set(lista.map(Number))].sort((x, y) => x - y)
      if (morte.some((k) => !Number.isInteger(k) || k < 0 || k >= p.punti.length || p.punti[k] === null)) {
        fail(400, 'MORTE', 'Si segnano morte solo le pietre sul goban.')
      }
      return rispondi(c, await salvaPartita(c.env.DB, row, { morte, morte_ok: null }, ora), io)
    }

    if (corpo.azione === 'accetta') {
      const morte = morteDi(row)
      if (!morte) fail(409, 'NESSUNA_PROPOSTA', 'Non c’è ancora un conteggio da accettare.')
      if (row.morte_ok === altroLato(io)) {
        const { punti, vincitore } = contaGo(row, morte)
        const dopo = await salvaPartita(
          c.env.DB,
          row,
          { stato: 'finita', vincitore, motivo: 'punti', punti, patta: null },
          ora,
        )
        return rispondi(c, dopo, io)
      }
      return rispondi(c, await salvaPartita(c.env.DB, row, { morte_ok: io }, ora), io)
    }

    if (corpo.azione === 'riprendi') {
      // Si torna a giocare da dove ci si era fermati: i due passi non contano piu', e nemmeno le
      // posizioni di prima. Il goban e' quello di prima dei passi, con lo stesso tratto: a
      // ricordarle, alla seconda ripresa sarebbe gia' una ripetizione, e nessuno potrebbe muovere.
      const posizione = go.scrivi({ ...p, passi: 0 })
      const dopo = await salvaPartita(
        c.env.DB,
        row,
        { posizione, chiavi: [], morte: null, morte_ok: null, mossa: true },
        ora,
      )
      return rispondi(c, dopo, io)
    }
    fail(400, 'AZIONE', 'Azione sconosciuta.')
  })

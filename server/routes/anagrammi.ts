import { Hono, type Context } from 'hono'
import { msToNextPuzzle } from '../../shared/daily'
import { PAROLE_ANAGRAMMI, rispostaGiusta, type ParolaDelGiorno } from '../../shared/anagrammi'
import type { AnagrammiProva, AnagrammiStato, AnagrammiSummary } from '../../shared/types'
import type { AppEnv } from '../types'
import { fail } from '../lib/http'
import { requireVerified } from '../lib/session'
import { riepilogoAnagrammi } from '../lib/riepiloghi'
import {
  apriPartita,
  chiudiScaduta,
  giornata,
  inCorso,
  paroleDelGiorno,
  paroleDi,
  partitaDi,
  rispostaDaSalvare,
  salvaPartita,
  statoDa,
  statoVuoto,
  type PartitaRow,
} from '../lib/anagrammiStore'

interface Corpo {
  versione?: unknown
  parola?: unknown
}

async function corpoDi(c: Context<AppEnv>): Promise<Corpo> {
  return (await c.req.json().catch(() => ({}))) as Corpo
}

/** La versione mandata dal client deve essere quella letta: altrimenti ha uno stato vecchio, e rilegge. */
function controllaVersione(corpo: Corpo, row: PartitaRow): void {
  if (Number(corpo.versione) !== row.versione) {
    fail(409, 'CONFLITTO', 'La partita è cambiata su un altro dispositivo: ricarico.')
  }
}

/** Le parole di oggi, o un 503 se la notte non le ha ancora scritte. */
async function giornoDiOggi(c: Context<AppEnv>): Promise<ParolaDelGiorno[]> {
  const giorno = await paroleDelGiorno(c.env.DB, giornata().puzzleNumber)
  if (!giorno) fail(503, 'ANAGRAMMI_ASSENTI', 'Gli anagrammi di oggi non sono ancora pronti. Riprova più tardi.')
  return giorno
}

/** La partita di oggi con il tempo scaduto gia' applicato, o null se non e' cominciata. */
async function partitaDiOggi(c: Context<AppEnv>, giorno: ParolaDelGiorno[], adesso: number) {
  const row = await partitaDi(c.env.DB, c.get('player').id, giornata().puzzleNumber)
  return row ? chiudiScaduta(c.env.DB, row, giorno, adesso) : null
}

/** La parola aperta, o un 409: fra una parola e l'altra non c'e' niente a cui rispondere. */
function aperta(row: PartitaRow) {
  const parole = paroleDi(row)
  const corrente = inCorso(parole)
  if (!corrente || row.status === 'done') fail(409, 'NESSUNA_PAROLA', 'Non c’è una parola aperta.')
  return { parole, corrente }
}

export const anagrammiRoutes = new Hono<AppEnv>()

  .use('*', requireVerified)

  /**
   * La giornata di oggi. Non apre niente: la riga nasce con la prima parola, e
   * guardare la pagina non fa comparire nessuno "in corso" in classifica. Una
   * parola il cui tempo e' scaduto la chiude come persa.
   */
  .get('/state', async (c) => {
    const adesso = Date.now()
    const giorno = await giornoDiOggi(c)
    const row = await partitaDiOggi(c, giorno, adesso)
    if (!row) return c.json<AnagrammiStato>(statoVuoto(giornata(), giorno, msToNextPuzzle()))
    return c.json<AnagrammiStato>(statoDa(row, giorno, adesso, msToNextPuzzle()))
  })

  /** Riepilogo per la card dell'hub: di sola lettura. */
  .get('/summary', async (c) => c.json<AnagrammiSummary>(await riepilogoAnagrammi(c.env.DB, c.get('player').id)))

  /**
   * Apre la parola dopo: la prima, o quella dopo una chiusa. Da qui parte il suo
   * tempo, e la risposta ha le sue lettere. Una parola gia' aperta (un doppio
   * tocco, un altro telefono) si riprende, non se ne apre un'altra.
   */
  .post('/apri', async (c) => {
    const corpo = await corpoDi(c)
    const adesso = Date.now()
    const giorno = await giornoDiOggi(c)
    const letta = await apriPartita(c.env.DB, c.get('player').id, giornata())
    controllaVersione(corpo, letta)
    const row = await chiudiScaduta(c.env.DB, letta, giorno, adesso)
    const parole = paroleDi(row)
    if (row.status === 'done' || parole.length >= PAROLE_ANAGRAMMI) {
      fail(409, 'GIORNATA_FINITA', 'Gli anagrammi di oggi sono finiti.')
    }
    if (inCorso(parole)) return c.json<AnagrammiStato>(statoDa(row, giorno, adesso, msToNextPuzzle()))
    const dopo = await salvaPartita(c.env.DB, row, [...parole, { a: adesso, f: null, e: null }], giorno, adesso)
    return c.json<AnagrammiStato>(statoDa(dopo, giorno, adesso, msToNextPuzzle()))
  })

  /**
   * Una risposta alla parola aperta. Una risposta sbagliata non si scrive: la
   * pagina rimette le lettere a posto, e il tempo corre. Se il tempo era
   * scaduto la risposta non vale, e lo stato dice che la parola e' persa.
   */
  .post('/prova', async (c) => {
    const corpo = await corpoDi(c)
    const adesso = Date.now()
    const giorno = await giornoDiOggi(c)
    const letta = await partitaDi(c.env.DB, c.get('player').id, giornata().puzzleNumber)
    if (!letta) fail(409, 'NESSUNA_PAROLA', 'Non c’è una parola aperta.')
    const row = await chiudiScaduta(c.env.DB, letta, giorno, adesso)
    if (row !== letta) {
      return c.json<AnagrammiProva>({ ...statoDa(row, giorno, adesso, msToNextPuzzle()), giusta: false })
    }
    const { parole, corrente } = aperta(row)
    const k = parole.length - 1
    const testo = typeof corpo.parola === 'string' ? corpo.parola : ''
    if (testo.length > 20) fail(400, 'PAROLA', 'Parola non valida.')
    if (!rispostaGiusta(giorno[k], testo)) {
      return c.json<AnagrammiProva>({ ...statoDa(row, giorno, adesso, msToNextPuzzle()), giusta: false })
    }
    controllaVersione(corpo, row)
    const chiuse = parole.map((p) =>
      p === corrente ? { ...p, e: 'trovata' as const, f: adesso, r: rispostaDaSalvare(testo) } : p,
    )
    const dopo = await salvaPartita(c.env.DB, row, chiuse, giorno, adesso)
    return c.json<AnagrammiProva>({ ...statoDa(dopo, giorno, adesso, msToNextPuzzle()), giusta: true })
  })

  /** L'aiuto: la definizione della parola aperta, che costa i suoi punti. Chiederlo due volte non costa di piu'. */
  .post('/aiuto', async (c) => {
    const corpo = await corpoDi(c)
    const adesso = Date.now()
    const giorno = await giornoDiOggi(c)
    const letta = await partitaDi(c.env.DB, c.get('player').id, giornata().puzzleNumber)
    if (!letta) fail(409, 'NESSUNA_PAROLA', 'Non c’è una parola aperta.')
    const row = await chiudiScaduta(c.env.DB, letta, giorno, adesso)
    if (row !== letta) return c.json<AnagrammiStato>(statoDa(row, giorno, adesso, msToNextPuzzle()))
    const { parole, corrente } = aperta(row)
    if (corrente.h === 1) return c.json<AnagrammiStato>(statoDa(row, giorno, adesso, msToNextPuzzle()))
    controllaVersione(corpo, row)
    const dopo = await salvaPartita(
      c.env.DB,
      row,
      parole.map((p) => (p === corrente ? { ...p, h: 1 as const } : p)),
      giorno,
      adesso,
    )
    return c.json<AnagrammiStato>(statoDa(dopo, giorno, adesso, msToNextPuzzle()))
  })

  /** "Passo": la parola aperta si lascia, non vale niente, e si vede qual era. */
  .post('/passo', async (c) => {
    const corpo = await corpoDi(c)
    const adesso = Date.now()
    const giorno = await giornoDiOggi(c)
    const letta = await partitaDi(c.env.DB, c.get('player').id, giornata().puzzleNumber)
    if (!letta) fail(409, 'NESSUNA_PAROLA', 'Non c’è una parola aperta.')
    const row = await chiudiScaduta(c.env.DB, letta, giorno, adesso)
    if (row !== letta) return c.json<AnagrammiStato>(statoDa(row, giorno, adesso, msToNextPuzzle()))
    const { parole, corrente } = aperta(row)
    controllaVersione(corpo, row)
    const dopo = await salvaPartita(
      c.env.DB,
      row,
      parole.map((p) => (p === corrente ? { ...p, e: 'passata' as const, f: adesso } : p)),
      giorno,
      adesso,
    )
    return c.json<AnagrammiStato>(statoDa(dopo, giorno, adesso, msToNextPuzzle()))
  })

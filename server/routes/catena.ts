import { Hono, type Context } from 'hono'
import { msToNextPuzzle } from '../../shared/daily'
import {
  NASCOSTE_CATENA,
  PASSO_FINALE,
  PREAMBOLO_PAROLA_CATENA_MS,
  TEMPO_FINALE_CATENA_MS,
  applicaCatena,
  puntiCatena,
  stessaParola,
  svolgiCatena,
  type CatenaDelGiorno,
  type EsitoMossaCatena,
  type MossaCatena,
} from '../../shared/catena'
import type { CatenaStato, CatenaSummary } from '../../shared/types'
import type { AppEnv } from '../types'
import { fail } from '../lib/http'
import { requireVerified } from '../lib/session'
import { riepilogoCatena } from '../lib/riepiloghi'
import {
  apriPartita,
  catenaDelGiornoDa,
  chiudiScadute,
  giornata,
  mosseDi,
  parolaDaSalvare,
  partitaDi,
  salvaPartita,
  statoDa,
  tempiDopo,
  type PartitaRow,
} from '../lib/catenaStore'

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

/** La catena di oggi, o un 503 se la notte non l'ha ancora scritta. */
async function catenaDiOggi(c: Context<AppEnv>): Promise<CatenaDelGiorno> {
  const catena = await catenaDelGiornoDa(c.env.DB, giornata().puzzleNumber)
  if (!catena) fail(503, 'CATENA_ASSENTE', 'La Catena di oggi non è ancora pronta. Riprova più tardi.')
  return catena
}

function stato(
  row: PartitaRow | null,
  catena: CatenaDelGiorno,
  adesso: number,
  esito: EsitoMossaCatena | null = null,
): CatenaStato {
  return statoDa(row, catena, giornata(), adesso, msToNextPuzzle(), esito)
}

/** Una parola scritta da chi gioca: una stringa corta, con almeno una lettera. */
function parolaDi(corpo: Corpo, vuotaVale: boolean): string {
  const testo = typeof corpo.parola === 'string' ? corpo.parola : ''
  if (testo.length > 40) fail(400, 'PAROLA', 'Parola non valida.')
  const parola = parolaDaSalvare(testo)
  if (!parola && !vuotaVale) fail(400, 'PAROLA', 'Scrivi una parola.')
  return parola
}

/** La partita di oggi con i tempi finiti gia' applicati, o null se non e' cominciata. */
async function partitaLetta(c: Context<AppEnv>, catena: CatenaDelGiorno, adesso: number): Promise<PartitaRow | null> {
  const letta = await partitaDi(c.env.DB, c.get('player').id, giornata().puzzleNumber)
  return letta ? chiudiScadute(c.env.DB, letta, catena, adesso) : null
}

/**
 * Una mossa della catena: la rigioca sulle mosse salvate e la scrive dopo di
 * loro. Se porta a un'altra parola, nella stessa scrittura parte il suo minuto,
 * o quello della finale, dopo il tempo della scena. Una mossa arrivata dopo un
 * tempo finito trova la versione cambiata, e il telefono rilegge: la parola era
 * gia' stata mostrata. Una mossa che non si puo' fare (un jolly finito, il terzo
 * elemento gia' in vista) e' un 409.
 */
async function giocaMossa(c: Context<AppEnv>, corpo: Corpo, mossa: MossaCatena): Promise<CatenaStato> {
  const adesso = Date.now()
  const catena = await catenaDiOggi(c)
  // Senza Comincia — un telefono con la pagina di prima — la partita nasce qui, con il minuto da adesso.
  const row =
    (await partitaLetta(c, catena, adesso)) ??
    (await apriPartita(c.env.DB, c.get('player').id, giornata(), new Date(adesso).toISOString()))
  if (row.status === 'done') return stato(row, catena, adesso)
  controllaVersione(corpo, row)
  const mosse = mosseDi(row)
  const prima = svolgiCatena(catena, mosse)
  const fatta = applicaCatena(catena, prima, mossa)
  if (!fatta) fail(409, 'MOSSA', 'Questa mossa adesso non si può fare.')
  const dopo = await salvaPartita(c.env.DB, row, {
    mosse: [...mosse, mossa],
    ...tempiDopo(row, prima.passo, fatta.dopo.passo, adesso, fatta.esito),
  })
  return stato(dopo, catena, adesso, fatta.esito)
}

export const catenaRoutes = new Hono<AppEnv>()

  .use('*', requireVerified)

  /**
   * La partita di oggi. Non apre niente: la riga nasce con Comincia, e guardare
   * la pagina non fa comparire nessuno "in corso" in classifica. I tempi finiti
   * si applicano qui: le parole si mostrano, e la finale senza risposta chiude
   * la partita, senza punti.
   */
  .get('/state', async (c) => {
    const adesso = Date.now()
    const catena = await catenaDiOggi(c)
    return c.json<CatenaStato>(stato(await partitaLetta(c, catena, adesso), catena, adesso))
  })

  /**
   * Comincia: la partita nasce, e il minuto della prima parola parte dopo il
   * tempo della scena che la porta in vista. Chiederlo di nuovo ridà la partita
   * com'e', con il minuto che corre gia'.
   */
  .post('/inizia', async (c) => {
    const adesso = Date.now()
    const catena = await catenaDiOggi(c)
    const parolaAt = new Date(adesso + PREAMBOLO_PAROLA_CATENA_MS).toISOString()
    const aperta = await apriPartita(c.env.DB, c.get('player').id, giornata(), parolaAt)
    return c.json<CatenaStato>(stato(await chiudiScadute(c.env.DB, aperta, catena, adesso), catena, adesso))
  })

  /** Riepilogo per la card dell'hub: di sola lettura. */
  .get('/summary', async (c) => c.json<CatenaSummary>(await riepilogoCatena(c.env.DB, c.get('player').id)))

  /**
   * Una parola della catena. Giusta si scende alla coppia dopo; sbagliata
   * costa un errore, mostra un'altra lettera e fa ripartire il minuto, e alla
   * seconda volta mostra la parola e si scende lo stesso.
   */
  .post('/prova', async (c) => {
    const corpo = await corpoDi(c)
    return c.json<CatenaStato>(await giocaMossa(c, corpo, { k: 'p', w: parolaDi(corpo, false) }))
  })

  /**
   * Il minuto della parola e' finito sul telefono: la parola si mostra, e costa
   * come i due errori che l'avrebbero mostrata, senza aspettare il margine della
   * rete. E' una resa, e il server la prende quando arriva.
   */
  .post('/tempo', async (c) => {
    const corpo = await corpoDi(c)
    return c.json<CatenaStato>(await giocaMossa(c, corpo, { k: 't' }))
  })

  /** Un jolly: la lettera dopo, gratis, e il minuto che riparte. L'ultima lettera resta da trovare, e nella finale non si usa. */
  .post('/jolly', async (c) => {
    const corpo = await corpoDi(c)
    return c.json<CatenaStato>(await giocaMossa(c, corpo, { k: 'j' }))
  })

  /** Il terzo elemento della finale, che costa quanto un errore: chi ha ancora tutti e due i jolly lo ha gia'. */
  .post('/compra', async (c) => {
    const corpo = await corpoDi(c)
    return c.json<CatenaStato>(await giocaMossa(c, corpo, { k: 'c' }))
  })

  /**
   * La parola finale. Una sola risposta: giusta vale il montepremi rimasto,
   * sbagliata venti. Arrivata dopo il tempo (e il margine della rete) non
   * vale, e la partita si chiude senza risposta. Una risposta vuota e' un "non
   * lo so".
   */
  .post('/rispondi', async (c) => {
    const corpo = await corpoDi(c)
    const adesso = Date.now()
    const catena = await catenaDiOggi(c)
    const row = await partitaLetta(c, catena, adesso)
    if (!row) fail(409, 'FINALE', 'La parola finale non è ancora arrivata.')
    if (row.status === 'done') return c.json<CatenaStato>(stato(row, catena, adesso))
    const s = svolgiCatena(catena, mosseDi(row))
    if (s.passo !== PASSO_FINALE || !row.finale_at) fail(409, 'FINALE', 'La parola finale non è ancora arrivata.')
    const parola = parolaDi(corpo, true)
    controllaVersione(corpo, row)
    const indovinata = stessaParola(catena.parole[NASCOSTE_CATENA[PASSO_FINALE]], parola)
    const dopo = await salvaPartita(c.env.DB, row, {
      fine: {
        risposta: parola || null,
        indovinata,
        tempoMs: Math.min(TEMPO_FINALE_CATENA_MS, Math.max(0, adesso - Date.parse(row.finale_at))),
        score: puntiCatena(s, indovinata),
      },
    })
    return c.json<CatenaStato>(stato(dopo, catena, adesso, indovinata ? 'giusta' : 'sbagliata'))
  })

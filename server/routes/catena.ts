import { Hono, type Context } from 'hono'
import { msToNextPuzzle } from '../../shared/daily'
import {
  NASCOSTE_CATENA,
  PASSO_FINALE,
  PREAMBOLO_FINALE_CATENA_MS,
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
  chiudiScaduta,
  giornata,
  mosseDi,
  parolaDaSalvare,
  partitaDi,
  salvaPartita,
  statoDa,
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

/**
 * Una mossa della catena: la rigioca sulle mosse salvate e la scrive dopo di
 * loro. Arrivati alla finale, nella stessa scrittura parte il minuto, dopo il
 * tempo della scena. Una mossa che non si puo' fare (un jolly finito, il terzo
 * elemento gia' in vista) e' un 409: il telefono rilegge.
 */
async function giocaMossa(c: Context<AppEnv>, corpo: Corpo, mossa: MossaCatena): Promise<CatenaStato> {
  const adesso = Date.now()
  const catena = await catenaDiOggi(c)
  const letta = await apriPartita(c.env.DB, c.get('player').id, giornata())
  const row = await chiudiScaduta(c.env.DB, letta, adesso)
  if (row.status === 'done') return stato(row, catena, adesso)
  controllaVersione(corpo, row)
  const mosse = mosseDi(row)
  const prima = svolgiCatena(catena, mosse)
  const fatta = applicaCatena(catena, prima, mossa)
  if (!fatta) fail(409, 'MOSSA', 'Questa mossa adesso non si può fare.')
  const arriva = prima.passo < PASSO_FINALE && fatta.dopo.passo === PASSO_FINALE
  const dopo = await salvaPartita(c.env.DB, row, {
    mosse: [...mosse, mossa],
    finale_at: arriva ? new Date(adesso + PREAMBOLO_FINALE_CATENA_MS).toISOString() : undefined,
  })
  return stato(dopo, catena, adesso, fatta.esito)
}

export const catenaRoutes = new Hono<AppEnv>()

  .use('*', requireVerified)

  /**
   * La partita di oggi. Non apre niente: la riga nasce con la prima mossa, e
   * guardare la pagina non fa comparire nessuno "in corso" in classifica. Un
   * minuto finito senza risposta chiude la partita, senza punti.
   */
  .get('/state', async (c) => {
    const adesso = Date.now()
    const catena = await catenaDiOggi(c)
    const letta = await partitaDi(c.env.DB, c.get('player').id, giornata().puzzleNumber)
    const row = letta ? await chiudiScaduta(c.env.DB, letta, adesso) : null
    return c.json<CatenaStato>(stato(row, catena, adesso))
  })

  /** Riepilogo per la card dell'hub: di sola lettura. */
  .get('/summary', async (c) => c.json<CatenaSummary>(await riepilogoCatena(c.env.DB, c.get('player').id)))

  /**
   * Una parola della catena. Giusta si scende alla coppia dopo; sbagliata
   * dimezza il montepremi e mostra un'altra lettera, e alla seconda volta mostra
   * la parola e si scende lo stesso.
   */
  .post('/prova', async (c) => {
    const corpo = await corpoDi(c)
    return c.json<CatenaStato>(await giocaMossa(c, corpo, { k: 'p', w: parolaDi(corpo, false) }))
  })

  /** Un jolly: la lettera dopo, senza dimezzare. L'ultima lettera resta da trovare. */
  .post('/jolly', async (c) => {
    const corpo = await corpoDi(c)
    return c.json<CatenaStato>(await giocaMossa(c, corpo, { k: 'j' }))
  })

  /** Il terzo elemento della finale, che dimezza il montepremi: chi ha ancora tutti e due i jolly lo ha gia'. */
  .post('/compra', async (c) => {
    const corpo = await corpoDi(c)
    return c.json<CatenaStato>(await giocaMossa(c, corpo, { k: 'c' }))
  })

  /**
   * La parola finale. Una sola risposta: giusta vale il montepremi rimasto,
   * sbagliata niente. Arrivata dopo il minuto (e il margine della rete) non
   * vale, e la partita si chiude senza risposta. Una risposta vuota e' un "non
   * lo so".
   */
  .post('/rispondi', async (c) => {
    const corpo = await corpoDi(c)
    const adesso = Date.now()
    const catena = await catenaDiOggi(c)
    const letta = await partitaDi(c.env.DB, c.get('player').id, giornata().puzzleNumber)
    if (!letta) fail(409, 'FINALE', 'La parola finale non è ancora arrivata.')
    const row = await chiudiScaduta(c.env.DB, letta, adesso)
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

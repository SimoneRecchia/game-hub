import { Hono, type Context } from 'hono'
import { msToNextPuzzle } from '../../shared/daily'
import {
  COPPIE_GHIGLIOTTINA,
  TEMPO_FINALE_MS,
  puntiGhigliottina,
  rispostaGiusta,
  type GhigliottinaDelGiorno,
} from '../../shared/ghigliottina'
import type { GhigliottinaStato, GhigliottinaSummary } from '../../shared/types'
import type { AppEnv } from '../types'
import { fail } from '../lib/http'
import { requireVerified } from '../lib/session'
import { riepilogoGhigliottina } from '../lib/riepiloghi'
import {
  apriPartita,
  chiudiScaduta,
  ghigliottinaDelGiorno,
  giornata,
  partitaDi,
  rispostaDaSalvare,
  salvaPartita,
  scelteDi,
  statoDa,
  type PartitaRow,
} from '../lib/ghigliottinaStore'

interface Corpo {
  versione?: unknown
  coppia?: unknown
  scelta?: unknown
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

/** La partita di oggi, o un 503 se la notte non l'ha ancora scritta. */
async function giornoDiOggi(c: Context<AppEnv>): Promise<GhigliottinaDelGiorno> {
  const giorno = await ghigliottinaDelGiorno(c.env.DB, giornata().puzzleNumber)
  if (!giorno) fail(503, 'GHIGLIOTTINA_ASSENTE', 'La Ghigliottina di oggi non è ancora pronta. Riprova più tardi.')
  return giorno
}

function stato(row: PartitaRow | null, giorno: GhigliottinaDelGiorno, adesso: number): GhigliottinaStato {
  return statoDa(row, giorno, giornata(), adesso, msToNextPuzzle())
}

export const ghigliottinaRoutes = new Hono<AppEnv>()

  .use('*', requireVerified)

  /**
   * La partita di oggi. Non apre niente: la riga nasce con la prima scelta, e
   * guardare la pagina non fa comparire nessuno "in corso" in classifica. Un
   * minuto finito senza risposta chiude la partita, senza punti.
   */
  .get('/state', async (c) => {
    const adesso = Date.now()
    const giorno = await giornoDiOggi(c)
    const letta = await partitaDi(c.env.DB, c.get('player').id, giornata().puzzleNumber)
    const row = letta ? await chiudiScaduta(c.env.DB, letta, adesso) : null
    return c.json<GhigliottinaStato>(stato(row, giorno, adesso))
  })

  /** Riepilogo per la card dell'hub: di sola lettura. */
  .get('/summary', async (c) => c.json<GhigliottinaSummary>(await riepilogoGhigliottina(c.env.DB, c.get('player').id)))

  /**
   * Una scelta: la parola della coppia di adesso. Una scelta sbagliata dimezza
   * il montepremi, e la risposta dice comunque qual era quella giusta. Una
   * coppia gia' scelta (un doppio tocco, un altro telefono) non si sceglie di
   * nuovo: si risponde con lo stato com'e'.
   */
  .post('/scegli', async (c) => {
    const corpo = await corpoDi(c)
    const adesso = Date.now()
    const giorno = await giornoDiOggi(c)
    const coppia = Number(corpo.coppia)
    const scelta = corpo.scelta
    if (!Number.isInteger(coppia) || coppia < 0 || coppia >= COPPIE_GHIGLIOTTINA || (scelta !== 0 && scelta !== 1)) {
      fail(400, 'SCELTA', 'Scelta non valida.')
    }
    const row = await apriPartita(c.env.DB, c.get('player').id, giornata())
    const scelte = scelteDi(row)
    if (row.status === 'done' || coppia < scelte.length) return c.json<GhigliottinaStato>(stato(row, giorno, adesso))
    if (coppia > scelte.length) fail(409, 'COPPIA', 'Questa coppia non è ancora uscita.')
    controllaVersione(corpo, row)
    const sbagliata = giorno.coppie[coppia].giusta !== scelta
    const dopo = await salvaPartita(c.env.DB, row, {
      scelte: [...scelte, scelta],
      sbagliate: row.sbagliate + (sbagliata ? 1 : 0),
    })
    return c.json<GhigliottinaStato>(stato(dopo, giorno, adesso))
  })

  /**
   * Parte il minuto della parola vincente: dopo le cinque scelte, quando la
   * pagina ha finito di mostrarle. Gia' partito, si riprende da dov'era.
   */
  .post('/finale', async (c) => {
    const corpo = await corpoDi(c)
    const adesso = Date.now()
    const giorno = await giornoDiOggi(c)
    const letta = await partitaDi(c.env.DB, c.get('player').id, giornata().puzzleNumber)
    if (!letta || scelteDi(letta).length < COPPIE_GHIGLIOTTINA) {
      fail(409, 'SCELTE', 'Prima si scelgono le cinque parole.')
    }
    const row = await chiudiScaduta(c.env.DB, letta, adesso)
    if (row.status === 'done' || row.finale_at) return c.json<GhigliottinaStato>(stato(row, giorno, adesso))
    controllaVersione(corpo, row)
    const dopo = await salvaPartita(c.env.DB, row, { finale_at: new Date(adesso).toISOString() })
    return c.json<GhigliottinaStato>(stato(dopo, giorno, adesso))
  })

  /**
   * La parola vincente. Una sola risposta, come in studio: giusta vale il
   * montepremi rimasto, sbagliata niente. Arrivata dopo il minuto (e il margine
   * della rete) non vale, e la partita si chiude senza risposta. Una risposta
   * vuota e' un "non lo so".
   */
  .post('/rispondi', async (c) => {
    const corpo = await corpoDi(c)
    const adesso = Date.now()
    const giorno = await giornoDiOggi(c)
    const letta = await partitaDi(c.env.DB, c.get('player').id, giornata().puzzleNumber)
    if (!letta || !letta.finale_at) fail(409, 'FINALE', 'Il minuto della parola vincente non è partito.')
    const row = await chiudiScaduta(c.env.DB, letta, adesso)
    if (row.status === 'done') return c.json<GhigliottinaStato>(stato(row, giorno, adesso))
    const testo = typeof corpo.parola === 'string' ? corpo.parola : ''
    if (testo.length > 40) fail(400, 'PAROLA', 'Parola non valida.')
    controllaVersione(corpo, row)
    const indovinata = rispostaGiusta(giorno.soluzione, testo)
    const risposta = rispostaDaSalvare(testo)
    const dopo = await salvaPartita(c.env.DB, row, {
      fine: {
        risposta: risposta || null,
        indovinata,
        tempoMs: Math.min(TEMPO_FINALE_MS, Math.max(0, adesso - Date.parse(row.finale_at!))),
        score: puntiGhigliottina(row.sbagliate, indovinata),
      },
    })
    return c.json<GhigliottinaStato>(stato(dopo, giorno, adesso))
  })

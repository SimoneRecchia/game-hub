import { Hono, type Context } from 'hono'
import {
  NERA,
  caselleSbagliate,
  grigliaPiena,
  grigliaValida,
  punteggio,
} from '../../shared/cruciverba'
import { msToNextPuzzle } from '../../shared/daily'
import type {
  CruciverbaEsito,
  CruciverbaLiberaRisposta,
  CruciverbaState,
  CruciverbaSummary,
} from '../../shared/types'
import type { AppEnv } from '../types'
import { fail } from '../lib/http'
import { requireVerified } from '../lib/session'
import { casoCrittografico } from '../lib/wordleLibera'
import {
  apriPartita,
  giornata,
  identitaDelGiorno,
  identitaLibera,
  liberaAperta,
  nuovaLibera,
  partitaLiberaPerId,
  registraControllo,
  salvaPartita,
  schemaLibero,
  schemaObbligatorio,
  segnalateDi,
  statisticheLibere,
  statoDa,
  svelateDi,
  tempoDichiarato,
  type Identita,
  type Partita,
  type Schema,
  type TabellaPartite,
} from '../lib/cruciverbaStore'
import { riepilogoCruciverba } from '../lib/riepiloghi'

/** Una richiesta di aiuto riguarda al massimo una parola: la piu' lunga ne ha dieci. */
const CASELLE_PER_RICHIESTA = 12

type Azione =
  | { tipo: 'salva' }
  | { tipo: 'controlla'; caselle: number[] | null }
  | { tipo: 'svela'; caselle: number[] }

interface Corpo {
  lettere?: unknown
  tempoMs?: unknown
  versione?: unknown
  caselle?: unknown
}

/** La partita su cui scrivere, con il suo schema: del giorno o libera. */
interface Bersaglio {
  row: Partita
  schema: Schema
  tabella: TabellaPartite
  identita: Identita
}

/**
 * Le caselle di una richiesta di aiuto, ripulite: interi, dentro lo schema,
 * bianche, senza doppioni. Tutto quel che arriva dal client e' da controllare.
 */
function leggiCaselle(valore: unknown, soluzione: string, obbligatorie: boolean): number[] | null {
  if (valore === undefined || valore === null) {
    if (obbligatorie) fail(400, 'CASELLE', 'Non hai scelto nessuna casella.')
    return null
  }
  if (!Array.isArray(valore) || valore.length === 0 || valore.length > CASELLE_PER_RICHIESTA) {
    fail(400, 'CASELLE', 'Le caselle richieste non sono valide.')
  }
  const caselle = [...new Set(valore.map(Number))]
  for (const k of caselle) {
    if (!Number.isInteger(k) || k < 0 || k >= soluzione.length || soluzione[k] === NERA) {
      fail(400, 'CASELLE', 'Le caselle richieste non sono valide.')
    }
  }
  return caselle
}

function conLettere(lettere: string, cambi: Iterable<[number, string]>): string {
  const celle = [...lettere]
  for (const [k, l] of cambi) celle[k] = l
  return celle.join('')
}

/** A partita chiusa ogni scrittura risponde con lo stato finale e non tocca niente. */
function esitoFinito({ row, schema, identita }: Bersaglio): CruciverbaEsito {
  return {
    versione: row.versione,
    status: 'done',
    punti: row.score,
    tempoMs: row.tempo_ms,
    pienaConErrori: false,
    stato: statoDa(row, schema, identita, msToNextPuzzle()),
  }
}

/** La partita del giorno, aperta al primo accesso. */
async function delGiorno(c: Context<AppEnv>): Promise<Bersaglio> {
  const quando = giornata()
  const schema = await schemaObbligatorio(c.env.DB, quando.puzzleNumber)
  const row = await apriPartita(c.env.DB, c.get('player').id, quando, schema)
  return { row, schema, tabella: 'cruciverba_games', identita: identitaDelGiorno(row) }
}

/** Una partita libera del giocatore, dal suo indirizzo. */
async function libera(c: Context<AppEnv>): Promise<Bersaglio> {
  const row = await partitaLiberaPerId(c.env.DB, c.req.param('id') ?? '', c.get('player').id)
  if (!row) fail(404, 'PARTITA_NON_TROVATA', 'Cruciverba non trovato.')
  const schema = await schemaLibero(c.env.DB, row.schema_id)
  if (!schema) fail(404, 'PARTITA_NON_TROVATA', 'Cruciverba non trovato.')
  return { row, schema, tabella: 'cruciverba_partite_libere', identita: identitaLibera(row) }
}

/**
 * Salvare, controllare e svelare sono la stessa scrittura con un passo in
 * mezzo: si legge la partita, si applica la griglia arrivata dal client, si
 * aggiunge l'aiuto, si guarda se e' completa, si scrive condizionati alla
 * versione letta. Vale uguale per la classificata e per le libere: cambia solo
 * da dove vengono la partita e lo schema.
 */
async function scrivi(
  c: Context<AppEnv>,
  carica: (c: Context<AppEnv>) => Promise<Bersaglio>,
  leggiAzione: (corpo: Corpo, soluzione: string) => Azione,
) {
  const corpo = (await c.req.json().catch(() => ({}))) as Corpo
  const bersaglio = await carica(c)
  const { row, schema, tabella, identita } = bersaglio
  const azione = leggiAzione(corpo, schema.soluzione)

  if (row.status === 'done') return c.json<CruciverbaEsito>(esitoFinito(bersaglio))
  if (Number(corpo.versione) !== row.versione) {
    fail(409, 'CONFLITTO', 'Il cruciverba è cambiato su un altro dispositivo: ricarico.')
  }

  const soluzione = schema.soluzione
  let lettere = String(corpo.lettere ?? '')
  if (!grigliaValida(lettere, soluzione)) {
    fail(400, 'GRIGLIA', 'La griglia non corrisponde allo schema.')
  }

  const svelate = svelateDi(row)
  // Le caselle svelate restano giuste: il client non puo' riscriverle.
  lettere = conLettere(
    lettere,
    svelate.map((k) => [k, soluzione[k]]),
  )

  let segnalate = segnalateDi(row)
  let errori = row.errori
  let errate: number[] | undefined
  let rivelate: Record<number, string> | undefined

  if (azione.tipo === 'controlla') {
    const dove = azione.caselle ? new Set(azione.caselle) : null
    errate = caselleSbagliate(lettere, soluzione).filter((k) => !dove || dove.has(k))
    const controllo = registraControllo(segnalate, lettere, errate)
    segnalate = controllo.segnalate
    // `errori` conta gli errori; quanto costano lo decide `punteggio`.
    errori += controllo.nuovi
  }

  if (azione.tipo === 'svela') {
    rivelate = {}
    for (const k of azione.caselle) {
      rivelate[k] = soluzione[k]
      // Si paga solo quel che non era gia' giusto: svelare una parola scritta a
      // meta' costa le lettere mancanti, non quelle che si sapevano.
      if (lettere[k] !== soluzione[k] && !svelate.includes(k)) svelate.push(k)
    }
    lettere = conLettere(
      lettere,
      Object.entries(rivelate).map(([k, l]) => [Number(k), l] as [number, string]),
    )
  }

  const piena = grigliaPiena(lettere)
  const completa = piena && caselleSbagliate(lettere, soluzione).length === 0
  const punti = punteggio(svelate.length, errori)
  const dopo = await salvaPartita(c.env.DB, tabella, row, {
    lettere,
    svelate,
    segnalate,
    errori,
    tempoMs: tempoDichiarato(row, corpo.tempoMs, Date.now()),
    status: completa ? 'done' : 'playing',
    score: completa ? punti : 0,
  })

  return c.json<CruciverbaEsito>({
    versione: dopo.versione,
    status: dopo.status,
    punti,
    tempoMs: dopo.tempo_ms,
    pienaConErrori: piena && !completa,
    ...(errate ? { errate } : {}),
    ...(rivelate ? { rivelate, svelate } : {}),
    ...(completa ? { stato: statoDa(dopo, schema, identita, msToNextPuzzle()) } : {}),
  })
}

const salva = () => ({ tipo: 'salva' }) as const
const controlla = (corpo: Corpo, soluzione: string): Azione => ({
  tipo: 'controlla',
  caselle: leggiCaselle(corpo.caselle, soluzione, false),
})
const svela = (corpo: Corpo, soluzione: string): Azione => ({
  tipo: 'svela',
  caselle: leggiCaselle(corpo.caselle, soluzione, true) ?? [],
})

export const cruciverbaRoutes = new Hono<AppEnv>()

  .use('*', requireVerified)

  /** Il cruciverba di oggi, aperto al primo accesso. */
  .get('/state', async (c) => {
    const { row, schema, identita } = await delGiorno(c)
    return c.json<CruciverbaState>(statoDa(row, schema, identita, msToNextPuzzle()))
  })

  /**
   * Riepilogo per la card dell'hub. Di sola lettura, come quello degli altri
   * giochi: aprire l'hub non deve aprire la partita.
   */
  .get('/summary', async (c) =>
    c.json<CruciverbaSummary>(await riepilogoCruciverba(c.env.DB, c.get('player').id)),
  )

  /** Salva la griglia. Se e' completa e giusta, la partita si chiude. */
  .put('/lettere', (c) => scrivi(c, delGiorno, salva))

  /**
   * Controlla la griglia, o solo le caselle indicate (una parola). Dice dove
   * sono gli errori e ne fa pagare uno per lettera sbagliata nuova.
   */
  .post('/controlla', (c) => scrivi(c, delGiorno, controlla))

  /** Svela le caselle indicate: una lettera o una parola. */
  .post('/svela', (c) => scrivi(c, delGiorno, svela))

  /* ─────────────────────────  I cruciverba liberi  ───────────────────────── */

  /** Il cruciverba libero aperto, se c'e', e i numeri delle libere. */
  .get('/libera', async (c) => {
    const db = c.env.DB
    const io = c.get('player').id
    const [aperta, numeri] = await Promise.all([liberaAperta(db, io), statisticheLibere(db, io)])
    const schema = aperta ? await schemaLibero(db, aperta.schema_id) : null
    return c.json<CruciverbaLiberaRisposta>({
      partita:
        aperta && schema
          ? statoDa(aperta, schema, identitaLibera(aperta), msToNextPuzzle())
          : null,
      ...numeri,
    })
  })

  /** Uno schema libero nuovo, fra quelli mai aperti. */
  .post('/libera', async (c) => {
    const nuova = await nuovaLibera(c.env.DB, c.get('player').id, casoCrittografico)
    if (!nuova) {
      fail(503, 'SCHEMI_FINITI', 'Hai già aperto tutti gli schemi liberi. Riprova domani.')
    }
    return c.json<CruciverbaState>(
      statoDa(nuova.row, nuova.schema, identitaLibera(nuova.row), msToNextPuzzle()),
      201,
    )
  })

  .get('/libera/:id', async (c) => {
    const { row, schema, identita } = await libera(c)
    return c.json<CruciverbaState>(statoDa(row, schema, identita, msToNextPuzzle()))
  })

  .put('/libera/:id/lettere', (c) => scrivi(c, libera, salva))
  .post('/libera/:id/controlla', (c) => scrivi(c, libera, controlla))
  .post('/libera/:id/svela', (c) => scrivi(c, libera, svela))

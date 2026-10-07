import { Hono, type Context } from 'hono'
import { caselleDaPagare } from '../../shared/aiuti'
import {
  NERA,
  VUOTA,
  caselleSbagliate,
  costiCruciverba,
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
  type PartitaRow,
  type Schema,
  type TabellaPartite,
} from '../lib/cruciverbaStore'
import { riepilogoCruciverba } from '../lib/riepiloghi'
import { compagniaBreve, pagaOspiti } from '../lib/compagniaStore'

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

/**
 * Quante caselle guarda davvero un controllo: quelle scritte da chi gioca, fra
 * le indicate o in tutto lo schema. Un controllo che non guarda niente non si
 * paga; le svelate non contano, perché sono giuste per forza.
 */
function guardate(lettere: string, soluzione: string, svelate: readonly number[], dove: ReadonlySet<number> | null) {
  let n = 0
  for (let k = 0; k < soluzione.length; k += 1) {
    if (soluzione[k] === NERA || lettere[k] === VUOTA || svelate.includes(k)) continue
    if (!dove || dove.has(k)) n += 1
  }
  return n
}

/** La partita su cui scrivere, con il suo schema: del giorno o libera. */
interface Bersaglio {
  row: Partita
  schema: Schema
  tabella: TabellaPartite
  identita: Identita
  /** La compagnia in cui si gioca la giornata, per chi e' stato invitato: la partita e' dell'host. */
  inCompagnia?: string | null
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
  return { row, schema, tabella: 'cruciverba_games', identita: identitaDelGiorno(row), inCompagnia: row.in_compagnia }
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

  // Chi gioca la giornata in compagnia non scrive: lo schema e' quello dell'host, e l'ha visto riempire.
  if (bersaglio.inCompagnia) {
    fail(409, 'GIOCATA_INSIEME', 'Oggi il cruciverba lo giochi in compagnia: la griglia è di chi ti ha invitato.')
  }
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
  let controlli = row.controlli ?? 0
  let controlliSchema = row.controlli_schema ?? 0
  let errate: number[] | undefined
  let rivelate: Record<number, string> | undefined

  if (azione.tipo === 'controlla') {
    const dove = azione.caselle ? new Set(azione.caselle) : null
    errate = caselleSbagliate(lettere, soluzione).filter((k) => !dove || dove.has(k))
    const controllo = registraControllo(segnalate, lettere, errate)
    segnalate = controllo.segnalate
    // Le partite contano gli aiuti; quanto costano lo decide `punteggio`. Un
    // controllo si paga anche quando trova tutto giusto, e di piu' se e' di
    // tutto lo schema; ogni errore nuovo a parte.
    errori += controllo.nuovi
    if (guardate(lettere, soluzione, svelate, dove) > 0) {
      if (dove) controlli += 1
      else controlliSchema += 1
    }
  }

  if (azione.tipo === 'svela') {
    rivelate = {}
    for (const k of azione.caselle) rivelate[k] = soluzione[k]
    // Si paga ogni lettera svelata, anche se era gia' giusta: dire che lo era e'
    // un aiuto, e gratis farebbe da controllo senza costo (vedi shared/aiuti.ts).
    svelate.push(...caselleDaPagare(azione.caselle, svelate))
    lettere = conLettere(
      lettere,
      Object.entries(rivelate).map(([k, l]) => [Number(k), l] as [number, string]),
    )
  }

  const piena = grigliaPiena(lettere)
  const completa = piena && caselleSbagliate(lettere, soluzione).length === 0
  const punti = punteggio({ svelate: svelate.length, errori, controlli, controlliSchema }, costiCruciverba(soluzione))
  const dopo = await salvaPartita(c.env.DB, tabella, row, {
    lettere,
    svelate,
    segnalate,
    errori,
    controlli,
    controlliSchema,
    tempoMs: tempoDichiarato(row, corpo.tempoMs, Date.now()),
    status: completa ? 'done' : 'playing',
    score: completa ? punti : 0,
  })
  // Il cruciverba del giorno completato: chi lo giocava in compagnia prende gli stessi punti.
  if (completa && tabella === 'cruciverba_games') {
    await pagaOspiti(c.env.DB, 'cruciverba', row.player_id, identita.numero, punti, true)
  }

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
    const { row, schema, identita, inCompagnia } = await delGiorno(c)
    const stato = statoDa(row, schema, identita, msToNextPuzzle())
    // Chi gioca in compagnia lo deve sapere qui: la schermata lo porta alla partita dell'host.
    if (inCompagnia) {
      stato.inCompagnia = await compagniaBreve(c.env.DB, inCompagnia, (row as PartitaRow).assist_score)
    }
    return c.json<CruciverbaState>(stato)
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
   * sono gli errori; si paga il controllo, piu' caro per tutta la griglia, e
   * ogni lettera sbagliata nuova.
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

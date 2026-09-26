import { Hono, type Context } from 'hono'
import {
  NERA,
  caselleBianche,
  caselleSbagliate,
  caselleScritte,
  grigliaPiena,
  grigliaValida,
  punteggio,
} from '../../shared/cruciverba'
import { msToNextPuzzle } from '../../shared/daily'
import type { CruciverbaEsito, CruciverbaState, CruciverbaSummary } from '../../shared/types'
import type { AppEnv } from '../types'
import { fail } from '../lib/http'
import { requireVerified } from '../lib/session'
import {
  apriPartita,
  costoErrori,
  giornata,
  registraControllo,
  salvaPartita,
  schemaDelGiorno,
  schemaObbligatorio,
  segnalateDi,
  statoDa,
  svelateDi,
  tempoDichiarato,
  type PartitaRow,
  type SchemaRow,
} from '../lib/cruciverbaStore'

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
function esitoFinito(row: PartitaRow, schema: SchemaRow): CruciverbaEsito {
  return {
    versione: row.versione,
    status: 'done',
    punti: row.score,
    tempoMs: row.tempo_ms,
    pienaConErrori: false,
    stato: statoDa(row, schema, msToNextPuzzle()),
  }
}

/**
 * Salvare, controllare e svelare sono la stessa scrittura con un passo in
 * mezzo: si legge la partita, si applica la griglia arrivata dal client, si
 * aggiunge l'aiuto, si guarda se e' completa, si scrive condizionati alla
 * versione letta.
 */
async function scrivi(c: Context<AppEnv>, leggiAzione: (corpo: Corpo, soluzione: string) => Azione) {
  const corpo = (await c.req.json().catch(() => ({}))) as Corpo
  const db = c.env.DB
  const quando = giornata()
  const schema = await schemaObbligatorio(db, quando.puzzleNumber)
  const azione = leggiAzione(corpo, schema.soluzione)
  const row = await apriPartita(db, c.get('player').id, quando, schema)

  if (row.status === 'done') return c.json<CruciverbaEsito>(esitoFinito(row, schema))
  if (Number(corpo.versione) !== row.versione) {
    fail(409, 'CONFLITTO', 'Il cruciverba è cambiato su un altro dispositivo: ricarico.')
  }

  const soluzione = schema.soluzione
  let lettere = String(corpo.lettere ?? '')
  if (!grigliaValida(lettere, soluzione)) {
    fail(400, 'GRIGLIA', 'La griglia non corrisponde allo schema di oggi.')
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
    errori += costoErrori(controllo.nuovi)
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
  const dopo = await salvaPartita(db, row, {
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
    ...(completa ? { stato: statoDa(dopo, schema, msToNextPuzzle()) } : {}),
  })
}

export const cruciverbaRoutes = new Hono<AppEnv>()

  .use('*', requireVerified)

  /** Il cruciverba di oggi, aperto al primo accesso. */
  .get('/state', async (c) => {
    const quando = giornata()
    const schema = await schemaObbligatorio(c.env.DB, quando.puzzleNumber)
    const row = await apriPartita(c.env.DB, c.get('player').id, quando, schema)
    return c.json<CruciverbaState>(statoDa(row, schema, msToNextPuzzle()))
  })

  /**
   * Riepilogo per la card dell'hub. Di sola lettura, come quello degli altri
   * giochi: aprire l'hub non deve aprire la partita.
   */
  .get('/summary', async (c) => {
    const quando = giornata()
    const schema = await schemaDelGiorno(c.env.DB, quando.puzzleNumber)
    const row = schema
      ? await c.env.DB
          .prepare(
            `SELECT status, lettere, score, svelate, errori, tempo_ms FROM cruciverba_games
              WHERE player_id = ? AND puzzle_number = ?`,
          )
          .bind(c.get('player').id, quando.puzzleNumber)
          .first<Pick<PartitaRow, 'status' | 'lettere' | 'score' | 'svelate' | 'errori' | 'tempo_ms'>>()
      : null

    return c.json<CruciverbaSummary>({
      puzzleNumber: quando.puzzleNumber,
      date: quando.date,
      status: !schema ? 'assente' : row ? row.status : 'new',
      scritte: row ? caselleScritte(row.lettere) : 0,
      bianche: schema ? caselleBianche(schema.soluzione) : 0,
      punti: row
        ? row.status === 'done'
          ? row.score
          : punteggio(svelateDi(row as PartitaRow).length, row.errori)
        : 100,
      tempoMs: row?.tempo_ms ?? 0,
      msToNextPuzzle: msToNextPuzzle(),
    })
  })

  /** Salva la griglia. Se e' completa e giusta, la partita si chiude. */
  .put('/lettere', (c) => scrivi(c, () => ({ tipo: 'salva' })))

  /**
   * Controlla la griglia, o solo le caselle indicate (una parola). Dice dove
   * sono gli errori e ne fa pagare uno per lettera sbagliata nuova.
   */
  .post('/controlla', (c) =>
    scrivi(c, (corpo, soluzione) => ({
      tipo: 'controlla',
      caselle: leggiCaselle(corpo.caselle, soluzione, false),
    })),
  )

  /** Svela le caselle indicate: una lettera o una parola. */
  .post('/svela', (c) =>
    scrivi(c, (corpo, soluzione) => ({
      tipo: 'svela',
      caselle: leggiCaselle(corpo.caselle, soluzione, true) ?? [],
    })),
  )

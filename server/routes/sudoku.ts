import { Hono, type Context } from 'hono'
import { msToNextPuzzle } from '../../shared/daily'
import {
  CASELLE,
  VUOTA,
  caselleSbagliate,
  costiSudoku,
  grigliaPiena,
  puntiSudoku,
  rispettaLeDate,
} from '../../shared/sudoku'
import type { SudokuEsito, SudokuState, SudokuSummary } from '../../shared/types'
import type { AppEnv } from '../types'
import { fail } from '../lib/http'
import { requireVerified } from '../lib/session'
import { riepilogoSudoku } from '../lib/riepiloghi'
import {
  apriPartita,
  giornata,
  registraControllo,
  salvaPartita,
  schemaObbligatorio,
  segnalateDi,
  statoDa,
  svelateDi,
  tempoDichiarato,
  type PartitaRow,
  type SchemaRow,
} from '../lib/sudokuStore'

/** Un aiuto riguarda al massimo un'unità: nove caselle. */
const CASELLE_PER_RICHIESTA = 9

type Azione = { tipo: 'salva' } | { tipo: 'controlla'; caselle: number[] | null } | { tipo: 'svela'; caselle: number[] }

interface Corpo {
  cifre?: unknown
  note?: unknown
  tempoMs?: unknown
  versione?: unknown
  caselle?: unknown
}

/**
 * Le caselle di una richiesta di aiuto, ripulite: interi dentro la griglia,
 * fra quelle da scrivere, senza doppioni. Tutto quel che arriva dal client e'
 * da controllare.
 */
function leggiCaselle(valore: unknown, dati: string, obbligatorie: boolean): number[] | null {
  if (valore === undefined || valore === null) {
    if (obbligatorie) fail(400, 'CASELLE', 'Non hai scelto nessuna casella.')
    return null
  }
  if (!Array.isArray(valore) || valore.length === 0 || valore.length > CASELLE_PER_RICHIESTA) {
    fail(400, 'CASELLE', 'Le caselle richieste non sono valide.')
  }
  const caselle = [...new Set(valore.map(Number))]
  for (const k of caselle) {
    if (!Number.isInteger(k) || k < 0 || k >= CASELLE || dati[k] !== VUOTA) {
      fail(400, 'CASELLE', 'Le caselle richieste non sono valide.')
    }
  }
  return caselle
}

function conCifre(cifre: string, cambi: Iterable<[number, string]>): string {
  const celle = [...cifre]
  for (const [k, d] of cambi) celle[k] = d
  return celle.join('')
}

/** La partita di oggi con il suo schema, aperta al primo accesso. */
async function delGiorno(c: Context<AppEnv>): Promise<{ row: PartitaRow; schema: SchemaRow }> {
  const quando = giornata()
  const schema = await schemaObbligatorio(c.env.DB, quando.puzzleNumber)
  const row = await apriPartita(c.env.DB, c.get('player').id, quando, schema)
  return { row, schema }
}

/**
 * Salvare, controllare e svelare sono la stessa scrittura con un passo in
 * mezzo, come nel cruciverba: si legge la partita, si applica la griglia
 * arrivata dal client, si aggiunge l'aiuto, si guarda se e' completa, e si
 * scrive condizionati alla versione letta.
 */
async function scrivi(c: Context<AppEnv>, leggiAzione: (corpo: Corpo, dati: string) => Azione) {
  const corpo = (await c.req.json().catch(() => ({}))) as Corpo
  const { row, schema } = await delGiorno(c)
  const azione = leggiAzione(corpo, schema.dati)

  if (row.status === 'done') {
    return c.json<SudokuEsito>({
      versione: row.versione,
      status: 'done',
      punti: row.score,
      tempoMs: row.tempo_ms,
      pienaConErrori: false,
      stato: statoDa(row, schema, msToNextPuzzle()),
    })
  }
  if (Number(corpo.versione) !== row.versione) {
    fail(409, 'CONFLITTO', 'Il sudoku è cambiato su un altro dispositivo: ricarico.')
  }

  const { soluzione } = schema
  let cifre = String(corpo.cifre ?? '')
  if (!rispettaLeDate(cifre, schema.dati)) fail(400, 'GRIGLIA', 'La griglia non corrisponde allo schema.')
  const note = typeof corpo.note === 'string' && /^[0-7]{243}$/.test(corpo.note) ? corpo.note : row.note

  const svelate = svelateDi(row)
  // Le caselle svelate restano giuste: il client non puo' riscriverle.
  cifre = conCifre(
    cifre,
    svelate.map((k) => [k, soluzione[k]]),
  )

  let segnalate = segnalateDi(row)
  let errori = row.errori
  let errate: number[] | undefined
  let rivelate: Record<number, string> | undefined

  if (azione.tipo === 'controlla') {
    const dove = azione.caselle ? new Set(azione.caselle) : null
    errate = caselleSbagliate(cifre, soluzione).filter((k) => !dove || dove.has(k))
    const controllo = registraControllo(segnalate, cifre, errate)
    segnalate = controllo.segnalate
    errori += controllo.nuovi
  }

  if (azione.tipo === 'svela') {
    rivelate = {}
    for (const k of azione.caselle) {
      rivelate[k] = soluzione[k]
      // Si paga solo quel che non era gia' giusto.
      if (cifre[k] !== soluzione[k] && !svelate.includes(k)) svelate.push(k)
    }
    cifre = conCifre(
      cifre,
      Object.entries(rivelate).map(([k, d]) => [Number(k), d] as [number, string]),
    )
  }

  const piena = grigliaPiena(cifre)
  const completa = piena && caselleSbagliate(cifre, soluzione).length === 0
  const punti = puntiSudoku(svelate.length, errori, costiSudoku(schema.dati))
  const dopo = await salvaPartita(c.env.DB, row, {
    cifre,
    note,
    svelate,
    segnalate,
    errori,
    tempoMs: tempoDichiarato(row, corpo.tempoMs, Date.now()),
    status: completa ? 'done' : 'playing',
    score: completa ? punti : 0,
  })

  return c.json<SudokuEsito>({
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

export const sudokuRoutes = new Hono<AppEnv>()

  .use('*', requireVerified)

  /** Il sudoku di oggi, aperto al primo accesso: da qui parte il tempo. */
  .get('/state', async (c) => {
    const { row, schema } = await delGiorno(c)
    return c.json<SudokuState>(statoDa(row, schema, msToNextPuzzle()))
  })

  /** Riepilogo per la card dell'hub: di sola lettura, non apre la partita. */
  .get('/summary', async (c) => c.json<SudokuSummary>(await riepilogoSudoku(c.env.DB, c.get('player').id)))

  /** Salva la griglia e le note. Se e' completa e giusta, la partita si chiude. */
  .put('/cifre', (c) => scrivi(c, () => ({ tipo: 'salva' })))

  /** Controlla la griglia, o le caselle indicate: dice dove sono gli errori e ne fa pagare uno per cifra nuova. */
  .post('/controlla', (c) =>
    scrivi(c, (corpo, dati) => ({ tipo: 'controlla', caselle: leggiCaselle(corpo.caselle, dati, false) })),
  )

  /** Svela le caselle indicate: tre punti ciascuna. */
  .post('/svela', (c) =>
    scrivi(c, (corpo, dati) => ({ tipo: 'svela', caselle: leggiCaselle(corpo.caselle, dati, true) ?? [] })),
  )

/**
 * Il sudoku libero sta tutto nel telefono: lo schema si genera nel browser, la
 * partita e i conti si salvano nel `localStorage` e non vanno al server. Una
 * partita alla volta: quella in corso si riprende da dove la si e' lasciata.
 */

import { mulberry32 } from '@shared/daily'
import { LIVELLI, eGriglia, generaSchema, type LivelloSudoku, type SchemaSudoku } from '@shared/sudoku'

const CHIAVE = 'giochi.sudoku.libera'
const CHIAVE_CONTI = 'giochi.sudoku.libera.conti'

export interface PartitaSudokuLibera {
  /** Quando e' cominciata: dice all'editor che lo schema e' un altro. */
  iniziata: number
  livello: LivelloSudoku
  dati: string
  soluzione: string
  cifre: string
  /** Le note, come le salva il server per la classificata (noteInTesto). */
  note: string
  svelate: number[]
  /** Controllata o con una cifra svelata: non fa record. */
  aiutata: boolean
  tempoMs: number
  finita: boolean
}

export interface ContiLivello {
  giocati: number
  risolti: number
  /** Il tempo migliore senza aiuti. */
  record: number | null
}

export type ContiSudokuLibero = Record<LivelloSudoku, ContiLivello>

function contiVuoti(): ContiSudokuLibero {
  return Object.fromEntries(LIVELLI.map((l) => [l, { giocati: 0, risolti: 0, record: null }])) as ContiSudokuLibero
}

export function leggiPartitaSudoku(): PartitaSudokuLibera | null {
  try {
    const grezza = localStorage.getItem(CHIAVE)
    if (!grezza) return null
    const p = JSON.parse(grezza) as PartitaSudokuLibera
    const valida =
      Number.isFinite(p?.iniziata) &&
      LIVELLI.includes(p.livello) &&
      eGriglia(p.dati) &&
      eGriglia(p.soluzione) &&
      eGriglia(p.cifre) &&
      typeof p.note === 'string' &&
      /^[0-7]{243}$/.test(p.note) &&
      Array.isArray(p.svelate) &&
      Number.isFinite(p.tempoMs)
    return valida ? p : null
  } catch {
    return null
  }
}

export function salvaPartitaSudoku(partita: PartitaSudokuLibera | null): void {
  try {
    if (partita) localStorage.setItem(CHIAVE, JSON.stringify(partita))
    else localStorage.removeItem(CHIAVE)
  } catch {
    /* Safari privato nega lo storage: la partita resta in memoria finché la pagina e' aperta */
  }
}

export function leggiContiSudoku(): ContiSudokuLibero {
  const conti = contiVuoti()
  try {
    const salvati = JSON.parse(localStorage.getItem(CHIAVE_CONTI) ?? '{}') as Partial<ContiSudokuLibero>
    for (const l of LIVELLI) {
      const c = salvati[l]
      if (!c) continue
      conti[l] = {
        giocati: Number.isInteger(c.giocati) ? c.giocati : 0,
        risolti: Number.isInteger(c.risolti) ? c.risolti : 0,
        record: typeof c.record === 'number' && c.record > 0 ? c.record : null,
      }
    }
  } catch {
    /* conti illeggibili: si riparte da zero */
  }
  return conti
}

function salvaConti(conti: ContiSudokuLibero): void {
  try {
    localStorage.setItem(CHIAVE_CONTI, JSON.stringify(conti))
  } catch {
    /* vedi salvaPartitaSudoku */
  }
}

/** Una partita cominciata: conta fra le giocate, anche se poi la si lascia. */
export function contaCominciata(livello: LivelloSudoku): ContiSudokuLibero {
  const conti = leggiContiSudoku()
  conti[livello].giocati += 1
  salvaConti(conti)
  return conti
}

/** Uno schema risolto; dice se e' il record del livello. */
export function contaRisolta(partita: PartitaSudokuLibera): { conti: ContiSudokuLibero; record: boolean } {
  const conti = leggiContiSudoku()
  const c = conti[partita.livello]
  c.risolti += 1
  const record = !partita.aiutata && (c.record === null || partita.tempoMs < c.record)
  if (record) c.record = partita.tempoMs
  salvaConti(conti)
  return { conti, record }
}

/**
 * Uno schema nuovo, generato in un Web Worker; se il Worker non parte, sul filo
 * principale. Con il seme di una sfida e' lo stesso sui due telefoni.
 */
export async function generaSchemaLibero(
  livello: LivelloSudoku,
  seme = crypto.getRandomValues(new Uint32Array(1))[0],
): Promise<SchemaSudoku> {
  let lavoratore: Worker
  try {
    lavoratore = new Worker(new URL('./generatore.worker.ts', import.meta.url), { type: 'module' })
  } catch {
    const schema = generaSchema(livello, mulberry32(seme))
    if (!schema) throw new Error('Non riesco a preparare lo schema.')
    return schema
  }
  return new Promise((risolvi, rifiuta) => {
    lavoratore.onmessage = (e: MessageEvent<{ ok: boolean; schema?: SchemaSudoku }>) => {
      lavoratore.terminate()
      if (e.data.ok && e.data.schema) risolvi(e.data.schema)
      else rifiuta(new Error('Non riesco a preparare lo schema.'))
    }
    lavoratore.onerror = () => {
      lavoratore.terminate()
      rifiuta(new Error('Non riesco a preparare lo schema.'))
    }
    lavoratore.postMessage({ livello, seme })
  })
}

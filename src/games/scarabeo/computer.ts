/**
 * Il filo che porta al computer dello Scarabeo, che vive in un Web Worker
 * (vedi computer.worker.ts). Un lavoratore solo per tutta l'app, creato alla
 * prima richiesta: il dizionario si scarica una volta e resta.
 */

import type { Mossa } from '@shared/scarabeo'
import type { PartitaLibera } from '@shared/scarabeo-computer'

interface Attesa {
  risolvi: (valore: unknown) => void
  rifiuta: (errore: Error) => void
}

let lavoratore: Worker | null = null
let prossimo = 1
const inAttesa = new Map<number, Attesa>()

function worker(): Worker {
  if (lavoratore) return lavoratore
  lavoratore = new Worker(new URL('./computer.worker.ts', import.meta.url), { type: 'module' })
  lavoratore.onmessage = (e: MessageEvent<{ id: number; ok: boolean; errore?: string } & Record<string, unknown>>) => {
    const attesa = inAttesa.get(e.data.id)
    if (!attesa) return
    inAttesa.delete(e.data.id)
    if (e.data.ok) attesa.risolvi(e.data)
    else attesa.rifiuta(new Error(e.data.errore ?? 'Il computer non risponde.'))
  }
  lavoratore.onerror = () => {
    for (const attesa of inAttesa.values()) attesa.rifiuta(new Error('Il computer non risponde.'))
    inAttesa.clear()
    lavoratore?.terminate()
    lavoratore = null
  }
  return lavoratore
}

function chiedi<T>(richiesta: Record<string, unknown>): Promise<T> {
  const id = prossimo
  prossimo += 1
  return new Promise<T>((risolvi, rifiuta) => {
    inAttesa.set(id, { risolvi: risolvi as (v: unknown) => void, rifiuta })
    worker().postMessage({ ...richiesta, id })
  })
}

/** Scarica il dizionario in anticipo, perché la prima domanda non aspetti. */
export function preparaComputer(): Promise<void> {
  return chiedi<void>({ tipo: 'prepara' })
}

/** Le parole che non sono nel dizionario. */
export async function paroleSconosciute(parole: string[]): Promise<string[]> {
  const { sconosciute } = await chiedi<{ sconosciute: string[] }>({ tipo: 'parole', parole })
  return sconosciute
}

/** La mossa del computer, se tocca a lui. */
export async function mossaDelComputer(partita: PartitaLibera): Promise<Mossa | null> {
  const { mossa } = await chiedi<{ mossa: Mossa | null }>({ tipo: 'mossa', partita })
  return mossa
}

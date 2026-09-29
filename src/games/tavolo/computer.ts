/**
 * Il filo che porta al computer dei giochi da tavoliere, che pensa in un Web
 * Worker: al livello difficile ci mette fino a un secondo e mezzo, e sul filo
 * principale fermerebbe la pagina proprio mentre dice che il computer pensa.
 *
 * Un lavoratore per gioco, creato alla prima mossa e tenuto: ognuno porta con
 * se' solo il suo motore, e chi gioca a Forza 4 non scarica quello degli
 * scacchi.
 */

import type { GiocoTavoliere, LivelloTavoliere } from '@shared/tavolo'

export interface DomandaAlComputer {
  posizione: string
  livello: LivelloTavoliere
  /** Le chiavi delle posizioni passate dall'ultima mossa irreversibile, per le ripetizioni. */
  storia: readonly string[]
  seme: number
}

interface Attesa {
  gioco: GiocoTavoliere
  risolvi: (mossa: string | null) => void
  rifiuta: (errore: Error) => void
}

const lavoratori = new Map<GiocoTavoliere, Worker>()
const inAttesa = new Map<number, Attesa>()
let prossimo = 1

function crea(gioco: GiocoTavoliere): Worker {
  // Tre costruttori scritti per intero: Vite trova i Worker solo se l'indirizzo e' scritto li'.
  if (gioco === 'scacchi') {
    return new Worker(new URL('../scacchi/computer.worker.ts', import.meta.url), { type: 'module' })
  }
  if (gioco === 'dama') return new Worker(new URL('../dama/computer.worker.ts', import.meta.url), { type: 'module' })
  return new Worker(new URL('../forza4/computer.worker.ts', import.meta.url), { type: 'module' })
}

function lavoratore(gioco: GiocoTavoliere): Worker {
  const esistente = lavoratori.get(gioco)
  if (esistente) return esistente
  const nuovo = crea(gioco)
  nuovo.onmessage = (e: MessageEvent<{ id: number; ok: boolean; mossa?: string | null }>) => {
    const attesa = inAttesa.get(e.data.id)
    if (!attesa) return
    inAttesa.delete(e.data.id)
    if (e.data.ok) attesa.risolvi(e.data.mossa ?? null)
    else attesa.rifiuta(new Error('Il computer non risponde.'))
  }
  nuovo.onerror = () => {
    for (const [id, attesa] of inAttesa) {
      if (attesa.gioco !== gioco) continue
      inAttesa.delete(id)
      attesa.rifiuta(new Error('Il computer non risponde.'))
    }
    nuovo.terminate()
    lavoratori.delete(gioco)
  }
  lavoratori.set(gioco, nuovo)
  return nuovo
}

/** La mossa del computer, nella notazione del server; null se non ne ha. */
export function mossaDelComputer(gioco: GiocoTavoliere, domanda: DomandaAlComputer): Promise<string | null> {
  const id = prossimo
  prossimo += 1
  return new Promise((risolvi, rifiuta) => {
    inAttesa.set(id, { gioco, risolvi, rifiuta })
    try {
      lavoratore(gioco).postMessage({ ...domanda, storia: [...domanda.storia], id })
    } catch {
      inAttesa.delete(id)
      rifiuta(new Error('Il computer non risponde.'))
    }
  })
}

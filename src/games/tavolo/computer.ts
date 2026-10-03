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
  /** L'ultima mossa dell'avversario, come la scrive il gioco: nel go le risposte vicine partono avvantaggiate. */
  ultima?: string | null
}

interface Attesa {
  gioco: GiocoTavoliere
  risolvi: (risposta: Record<string, unknown>) => void
  rifiuta: (errore: Error) => void
}

const lavoratori = new Map<GiocoTavoliere, Worker>()
const inAttesa = new Map<number, Attesa>()
let prossimo = 1

function crea(gioco: GiocoTavoliere): Worker {
  // I costruttori scritti per intero: Vite trova i Worker solo se l'indirizzo e' scritto li'.
  if (gioco === 'scacchi') {
    return new Worker(new URL('../scacchi/computer.worker.ts', import.meta.url), { type: 'module' })
  }
  if (gioco === 'dama') return new Worker(new URL('../dama/computer.worker.ts', import.meta.url), { type: 'module' })
  if (gioco === 'go') return new Worker(new URL('../go/computer.worker.ts', import.meta.url), { type: 'module' })
  if (gioco === 'tris') return new Worker(new URL('../tris/computer.worker.ts', import.meta.url), { type: 'module' })
  return new Worker(new URL('../forza4/computer.worker.ts', import.meta.url), { type: 'module' })
}

function lavoratore(gioco: GiocoTavoliere): Worker {
  const esistente = lavoratori.get(gioco)
  if (esistente) return esistente
  const nuovo = crea(gioco)
  nuovo.onmessage = (e: MessageEvent<{ id: number; ok: boolean } & Record<string, unknown>>) => {
    const attesa = inAttesa.get(e.data.id)
    if (!attesa) return
    inAttesa.delete(e.data.id)
    if (e.data.ok) attesa.risolvi(e.data)
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

function chiedi(gioco: GiocoTavoliere, richiesta: Record<string, unknown>): Promise<Record<string, unknown>> {
  const id = prossimo
  prossimo += 1
  return new Promise((risolvi, rifiuta) => {
    inAttesa.set(id, { gioco, risolvi, rifiuta })
    try {
      lavoratore(gioco).postMessage({ ...richiesta, id })
    } catch {
      inAttesa.delete(id)
      rifiuta(new Error('Il computer non risponde.'))
    }
  })
}

/** La mossa del computer, nella notazione del server; null se non ne ha. */
export async function mossaDelComputer(gioco: GiocoTavoliere, domanda: DomandaAlComputer): Promise<string | null> {
  const risposta = await chiedi(gioco, { tipo: 'mossa', ...domanda, storia: [...domanda.storia] })
  return typeof risposta.mossa === 'string' ? risposta.mossa : null
}

/**
 * Nel go, a gioco fermo: le pietre che il computer stima morte. La stima e'
 * qualche centinaio di partite giocate a caso dalla posizione, e sul 19 ci
 * mette un paio di secondi: anche lei nel Worker. Lo stesso seme da' la stessa
 * stima, quindi due telefoni che guardano la stessa partita la vedono uguale.
 */
export async function stimaDelleMorte(posizione: string, seme: number): Promise<number[]> {
  const risposta = await chiedi('go', { tipo: 'morte', posizione, seme })
  return Array.isArray(risposta.morte) ? risposta.morte.filter((k): k is number => Number.isInteger(k)) : []
}

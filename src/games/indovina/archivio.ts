/**
 * L'archivio dei personaggi propri, nel telefono: IndexedDB, perché le foto
 * sono file e il `localStorage` tiene solo testo, e poco.
 *
 * Due scomparti. Le **immagini**, per impronta: sia quelle dei propri set sia
 * quelle arrivate da un amico durante una partita, cosi' la seconda partita con
 * gli stessi personaggi non le chiede di nuovo. I **set**, con il nome e, per
 * ogni personaggio, il nome e l'impronta della sua foto, se ce l'ha.
 *
 * Niente di tutto questo va al server: al server arrivano solo i nomi e le
 * impronte, quando si invita qualcuno con un set proprio.
 */

import type { Voce } from '@shared/indovina'

const DATABASE = 'giochi-indovina'
const IMMAGINI = 'immagini'
const SET = 'set'

export interface SetProprio {
  id: string
  nome: string
  voci: Voce[]
  modificato: number
}

interface ImmagineSalvata {
  hash: string
  blob: Blob
  salvata: number
}

let aperto: Promise<IDBDatabase> | null = null

function apri(): Promise<IDBDatabase> {
  aperto ??= new Promise<IDBDatabase>((risolvi, rifiuta) => {
    const richiesta = indexedDB.open(DATABASE, 1)
    richiesta.onupgradeneeded = () => {
      const db = richiesta.result
      if (!db.objectStoreNames.contains(IMMAGINI)) db.createObjectStore(IMMAGINI, { keyPath: 'hash' })
      if (!db.objectStoreNames.contains(SET)) db.createObjectStore(SET, { keyPath: 'id' })
    }
    richiesta.onsuccess = () => risolvi(richiesta.result)
    richiesta.onerror = () => rifiuta(richiesta.error ?? new Error('IndexedDB non disponibile'))
  })
  // Un'apertura fallita non resta in memoria: la prossima riprova.
  aperto.catch(() => {
    aperto = null
  })
  return aperto
}

function attendi<T>(richiesta: IDBRequest<T>): Promise<T> {
  return new Promise((risolvi, rifiuta) => {
    richiesta.onsuccess = () => risolvi(richiesta.result)
    richiesta.onerror = () => rifiuta(richiesta.error ?? new Error('IndexedDB'))
  })
}

async function scomparto(nome: string, modo: IDBTransactionMode): Promise<IDBObjectStore> {
  const db = await apri()
  return db.transaction(nome, modo).objectStore(nome)
}

/* ─────────────────────────────  Le immagini  ───────────────────────────── */

export async function salvaImmagine(hash: string, blob: Blob): Promise<void> {
  const s = await scomparto(IMMAGINI, 'readwrite')
  await attendi(s.put({ hash, blob, salvata: Date.now() } satisfies ImmagineSalvata))
}

export async function leggiImmagine(hash: string): Promise<Blob | null> {
  try {
    const s = await scomparto(IMMAGINI, 'readonly')
    const trovata = (await attendi(s.get(hash))) as ImmagineSalvata | undefined
    return trovata?.blob ?? null
  } catch {
    return null
  }
}

/** Quali di queste impronte ci sono gia' nel telefono. */
export async function immaginiPresenti(hash: readonly string[]): Promise<Set<string>> {
  const presenti = new Set<string>()
  try {
    const s = await scomparto(IMMAGINI, 'readonly')
    await Promise.all(
      hash.map(async (h) => {
        const chiave = await attendi(s.getKey(h))
        if (chiave !== undefined) presenti.add(h)
      }),
    )
  } catch {
    /* senza IndexedDB non c'e' niente */
  }
  return presenti
}

/** Le immagini che nessun set usa piu', tranne quelle arrivate da poco: si tengono per le rivincite. */
async function pulisciImmagini(usate: Set<string>): Promise<void> {
  const s = await scomparto(IMMAGINI, 'readwrite')
  const tutte = (await attendi(s.getAll())) as ImmagineSalvata[]
  const soglia = Date.now() - 30 * 24 * 60 * 60_000
  await Promise.all(tutte.filter((i) => !usate.has(i.hash) && i.salvata < soglia).map((i) => attendi(s.delete(i.hash))))
}

/* ─────────────────────────────  I set  ───────────────────────────── */

export async function elencoSet(): Promise<SetProprio[]> {
  try {
    const s = await scomparto(SET, 'readonly')
    const tutti = (await attendi(s.getAll())) as SetProprio[]
    return tutti.sort((a, b) => b.modificato - a.modificato)
  } catch {
    return []
  }
}

export async function leggiSet(id: string): Promise<SetProprio | null> {
  try {
    const s = await scomparto(SET, 'readonly')
    return ((await attendi(s.get(id))) as SetProprio | undefined) ?? null
  } catch {
    return null
  }
}

export async function salvaSet(set: SetProprio): Promise<void> {
  const s = await scomparto(SET, 'readwrite')
  await attendi(s.put({ ...set, modificato: Date.now() }))
}

export async function eliminaSet(id: string): Promise<void> {
  const s = await scomparto(SET, 'readwrite')
  await attendi(s.delete(id))
  const rimasti = await elencoSet()
  await pulisciImmagini(new Set(rimasti.flatMap((r) => r.voci.flatMap((v) => (v.img ? [v.img] : []))))).catch(() => {})
}

export function nuovoIdSet(): string {
  return `set_${crypto.getRandomValues(new Uint32Array(2)).join('')}`
}

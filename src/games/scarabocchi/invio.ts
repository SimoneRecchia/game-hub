import { useCallback, useEffect, useRef } from 'react'
import { api } from '@/lib/api'
import { INVIO_TRATTI_MS, PEZZO_MASSIMO, codificaOps, type OpTratto } from '@shared/scarabocchi'

/** Un pezzo non arriva al tetto del server: le mosse in coda si dividono prima. */
const PEZZO_SICURO = PEZZO_MASSIMO - 2_000

/** Mette una mossa in coda: i punti che continuano un tratto ancora in coda gli si attaccano. */
export function accoda(coda: OpTratto[], op: OpTratto): void {
  const ultima = coda.at(-1)
  if (op.tipo === 'segue' && ultima && (ultima.tipo === 'tratto' || ultima.tipo === 'segue')) {
    ultima.punti.push(...op.punti)
    return
  }
  coda.push(op.tipo === 'tratto' || op.tipo === 'segue' ? { ...op, punti: [...op.punti] } : op)
}

/** Le mosse in coda in pezzi che il server accetta, nell'ordine. */
export function inPezzi(ops: readonly OpTratto[]): string[] {
  const pezzi: string[] = []
  let corrente: OpTratto[] = []
  let lunghezza = 0
  for (const op of ops) {
    const testo = codificaOps([op])
    if (corrente.length > 0 && lunghezza + testo.length + 1 > PEZZO_SICURO) {
      pezzi.push(codificaOps(corrente))
      corrente = []
      lunghezza = 0
    }
    corrente.push(op)
    lunghezza += testo.length + 1
  }
  if (corrente.length > 0) pezzi.push(codificaOps(corrente))
  return pezzi.filter((p) => p.length > 0 && p.length <= PEZZO_MASSIMO)
}

/**
 * La coda dei tratti di chi disegna: le mosse si mettono in coda mentre si
 * disegna, e ogni `INVIO_TRATTI_MS` quelle nuove partono in un pezzo, con il
 * suo numero nel foglio. Un pezzo che non arriva si rimanda con lo stesso
 * numero, e il server non lo conta due volte. Un pezzo alla volta, in fila:
 * chi guarda li legge nell'ordine.
 */
export function useInvioTratti(codice: string, numero: number, foglio: string | null, giaMandati: number) {
  const coda = useRef<OpTratto[]>([])
  const pronti = useRef<string[]>([])
  const n = useRef(giaMandati)
  const inViaggio = useRef<Promise<void> | null>(null)

  // Un foglio nuovo: si riparte dal numero di pezzi che ha gia'.
  useEffect(() => {
    coda.current = []
    pronti.current = []
    n.current = giaMandati
  }, [foglio, numero, giaMandati])

  const manda = useCallback(async (): Promise<void> => {
    if (inViaggio.current) return inViaggio.current
    if (!foglio) return
    if (coda.current.length > 0) {
      pronti.current.push(...inPezzi(coda.current))
      coda.current = []
    }
    if (pronti.current.length === 0) return
    const giro = (async () => {
      while (pronti.current.length > 0) {
        const dati = pronti.current[0]
        await api(`/scarabocchi/stanze/${codice}/tratti`, {
          method: 'POST',
          body: { numero, foglio, n: n.current, dati },
        })
        pronti.current.shift()
        n.current += 1
      }
    })()
    inViaggio.current = giro
    try {
      await giro
    } finally {
      inViaggio.current = null
    }
  }, [codice, numero, foglio])

  useEffect(() => {
    if (!foglio) return
    const t = window.setInterval(() => void manda().catch(() => {}), INVIO_TRATTI_MS)
    return () => window.clearInterval(t)
  }, [foglio, manda])

  const aggiungi = useCallback((op: OpTratto) => accoda(coda.current, op), [])

  /** Tutto quel che c'e' in coda, adesso: prima di consegnare. */
  const svuota = useCallback(async () => {
    for (let i = 0; i < 3; i += 1) {
      try {
        await manda()
        if (coda.current.length === 0 && pronti.current.length === 0) return true
      } catch {
        /* si riprova */
      }
    }
    return coda.current.length === 0 && pronti.current.length === 0
  }, [manda])

  return { aggiungi, svuota }
}

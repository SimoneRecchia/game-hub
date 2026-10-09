import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiFetchError, api } from './api'

/**
 * I dati delle schermate, con una memoria.
 *
 * Tornando a una schermata gia' vista si mostra subito quel che si aveva, e
 * intanto si chiede la versione nuova: e' quel che fa sembrare un'app una
 * cosa che risponde subito, invece di una pagina che si ricarica. La memoria
 * dura quanto la scheda del browser, e si svuota per prefisso quando una
 * partita cambia (`dimentica`).
 */
const memoria = new Map<string, { dati: unknown; quando: number }>()

export function dimentica(prefisso: string) {
  for (const chiave of [...memoria.keys()]) if (chiave.startsWith(prefisso)) memoria.delete(chiave)
}

export interface Dati<T> {
  dati: T | undefined
  errore: string | null
  /** true solo la prima volta, quando non c'e' ancora niente da mostrare. */
  caricando: boolean
  ricarica: () => Promise<void>
}

/**
 * `fresco`: per quanti millisecondi una risposta in memoria vale senza
 * richiederla, tornando alla schermata. La schermata iniziale si riapre a ogni
 * cambio di scheda, e ogni volta erano una ventina di letture del database; i
 * giochi la dimenticano quando cambia qualcosa (`dimentica('/oggi')`).
 */
export function useDati<T>(percorso: string | null, { fresco = 0 }: { fresco?: number } = {}): Dati<T> {
  const [dati, setDati] = useState<T | undefined>(() =>
    percorso ? (memoria.get(percorso)?.dati as T | undefined) : undefined,
  )
  const [errore, setErrore] = useState<string | null>(null)
  const vivo = useRef(true)

  useEffect(() => {
    vivo.current = true
    return () => {
      vivo.current = false
    }
  }, [])

  const ricarica = useCallback(async () => {
    if (!percorso) return
    try {
      const nuovi = await api<T>(percorso)
      memoria.set(percorso, { dati: nuovi, quando: Date.now() })
      if (vivo.current) {
        setDati(nuovi)
        setErrore(null)
      }
    } catch (e) {
      if (vivo.current) setErrore(e instanceof ApiFetchError ? e.message : 'Non riesco a caricare i dati.')
    }
  }, [percorso])

  useEffect(() => {
    const ricordo = percorso ? memoria.get(percorso) : undefined
    if (percorso) setDati(ricordo?.dati as T | undefined)
    if (ricordo && Date.now() - ricordo.quando < fresco) return
    void ricarica()
  }, [percorso, ricarica, fresco])

  return { dati, errore, caricando: dati === undefined && errore === null, ricarica }
}

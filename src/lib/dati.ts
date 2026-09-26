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
const memoria = new Map<string, unknown>()

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

export function useDati<T>(percorso: string | null): Dati<T> {
  const [dati, setDati] = useState<T | undefined>(() =>
    percorso ? (memoria.get(percorso) as T | undefined) : undefined,
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
      const fresco = await api<T>(percorso)
      memoria.set(percorso, fresco)
      if (vivo.current) {
        setDati(fresco)
        setErrore(null)
      }
    } catch (e) {
      if (vivo.current) setErrore(e instanceof ApiFetchError ? e.message : 'Non riesco a caricare i dati.')
    }
  }, [percorso])

  useEffect(() => {
    if (percorso) setDati(memoria.get(percorso) as T | undefined)
    void ricarica()
  }, [percorso, ricarica])

  return { dati, errore, caricando: dati === undefined && errore === null, ricarica }
}

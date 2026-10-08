import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiFetchError, api } from '@/lib/api'
import { dimentica } from '@/lib/dati'
import { MARGINE_PAROLIERE_MS } from '@shared/paroliere'
import type { ParoliereParola, ParoliereStato } from '@shared/types'
import type { ComandiParoliere, EsitoProva, VistaParoliere } from './Partita'

export interface ParoliereDelGiorno {
  stato: ParoliereStato | null
  vista: VistaParoliere | null
  comandi: ComandiParoliere
  errore: string | null
  /** La griglia di oggi non c'e' ancora: la scrive la notte. */
  assente: boolean
  ricarica: () => void
}

/**
 * Il Paroliere del giorno. La griglia arriva quando si gira la clessidra, e da
 * li' il tempo lo tiene il server; ogni parola va a lui, che la controlla sul
 * dizionario. Le parole vanno una alla volta, in fila: chi traccia veloce non
 * aspetta la risposta per tracciare la prossima, e il server le riceve
 * nell'ordine in cui sono state trovate.
 */
export function useParoliereDelGiorno(): ParoliereDelGiorno {
  const [stato, setStato] = useState<ParoliereStato | null>(null)
  const [scadenza, setScadenza] = useState<number | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [assente, setAssente] = useState(false)
  const statoRef = useRef(stato)
  statoRef.current = stato
  const coda = useRef<Promise<unknown>>(Promise.resolve())
  const timer = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current)
    },
    [],
  )

  const applica = useCallback((s: ParoliereStato) => {
    const prima = statoRef.current
    statoRef.current = s
    setStato(s)
    // La fine sull'orologio del telefono: cambia solo se il server la sposta davvero, non per la rete.
    setScadenza((vecchia) => {
      if (s.restanteMs === null) return null
      const nuova = Date.now() + s.restanteMs
      return vecchia !== null && Math.abs(vecchia - nuova) < 1_500 ? vecchia : nuova
    })
    if (s.status !== prima?.status || s.trovate.length !== prima?.trovate.length) dimentica('/oggi')
    if (s.status === 'done' && prima?.status !== 'done') dimentica('/leaderboard')
  }, [])

  const ricarica = useCallback(() => {
    setErrore(null)
    api<ParoliereStato>('/paroliere/state')
      .then((s) => {
        setAssente(false)
        applica(s)
      })
      .catch((e) => {
        if (e instanceof ApiFetchError && e.code === 'PAROLIERE_ASSENTE') setAssente(true)
        else setErrore(e instanceof ApiFetchError ? e.message : 'Non riesco a caricare il Paroliere di oggi.')
      })
  }, [applica])

  useEffect(() => {
    ricarica()
  }, [ricarica])

  /** In fila dietro alle parole gia' partite. */
  const inFila = useCallback(<T,>(lavoro: () => Promise<T>): Promise<T> => {
    const prossimo = coda.current.then(lavoro, lavoro)
    coda.current = prossimo.catch(() => {})
    return prossimo
  }, [])

  const comandi = useMemo<ComandiParoliere>(
    () => ({
      inizia: async () => {
        try {
          const s = await api<ParoliereStato>('/paroliere/inizia', { method: 'POST', body: {} })
          applica(s)
          return s.griglia !== null
        } catch (e) {
          setErrore(e instanceof ApiFetchError ? e.message : 'La partita non è cominciata. Riprova.')
          return false
        }
      },
      parti: () => {},
      prova: (parola) =>
        inFila(async (): Promise<EsitoProva> => {
          try {
            const r = await api<ParoliereParola>('/paroliere/parola', { method: 'POST', body: { parola } })
            applica(r)
            return { esito: r.esito, valore: r.valore }
          } catch {
            return { esito: 'rete', valore: 0 }
          }
        }),
      basta: () =>
        inFila(async () => {
          try {
            applica(await api<ParoliereStato>('/paroliere/fine', { method: 'POST', body: {} }))
          } catch {
            ricarica()
          }
        }),
      // Allo scadere le parole in volo arrivano entro il margine; dopo, il server ha chiuso la partita.
      scade: () => {
        void inFila(async () => {
          if (timer.current) window.clearTimeout(timer.current)
          timer.current = window.setTimeout(() => {
            timer.current = null
            ricarica()
          }, MARGINE_PAROLIERE_MS + 300)
        })
      },
    }),
    [applica, inFila, ricarica],
  )

  const vista = useMemo<VistaParoliere | null>(
    () =>
      stato
        ? {
            fase: stato.status === 'new' ? 'nuova' : stato.status === 'playing' ? 'gioca' : 'finita',
            griglia: stato.griglia,
            lato: stato.lato,
            scadenza: stato.status === 'playing' ? scadenza : null,
            tempoMs: stato.tempoMs,
            trovate: stato.trovate,
            punteggio: stato.punteggio,
            traguardo: stato.traguardo,
            comuni: stato.comuni,
          }
        : null,
    [stato, scadenza],
  )
  return { stato, vista, comandi, errore, assente, ricarica }
}

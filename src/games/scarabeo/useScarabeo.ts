import { useCallback, useEffect, useState } from 'react'
import type { CellaPiena, ScarabeoState } from '@shared/types'
import type { EsitoPosa } from '@shared/scarabeo'
import { ApiFetchError, api } from '@/lib/api'
import { dimentica } from '@/lib/dati'
import { haptic } from '@/lib/haptics'
import { paroleSconosciute, preparaComputer } from './computer'
import { useComposizione, type Composizione } from './useComposizione'

export type { Cursore } from './useComposizione'

const NESSUNA: readonly CellaPiena[] = []
const NESSUNO: readonly string[] = []

export interface ScarabeoController extends Composizione {
  stato: ScarabeoState | null
  loading: boolean
  loadError: string | null
  inviando: boolean
  /** Le parole della posa in corso che il dizionario non conosce; null se non si sa ancora. */
  sconosciute: string[] | null
  gioca: () => void
  passa: () => void
  cambia: (tessere: string[]) => void
  chiudiGiornata: () => void
  ricarica: () => void
}

/**
 * Le parole della posa in corso che non esistono, chieste al dizionario del
 * browser.
 *
 * Il dizionario vero resta quello del server, che rifiuta comunque una parola
 * sconosciuta. Questo serve a dirlo subito, mentre la si compone, invece che
 * dopo aver premuto "Gioca": la posa diventa rossa e il bottone lo dice. Se il
 * dizionario non si scarica, si torna al comportamento di prima — lo dice il
 * server.
 */
export function useParoleSconosciute(anteprima: EsitoPosa | null): string[] | null {
  const [sconosciute, setSconosciute] = useState<string[] | null>(null)
  const chiave = anteprima?.ok ? anteprima.parole.map((p) => p.parola).join(' ') : ''

  useEffect(() => {
    setSconosciute(null)
    if (!chiave) return
    let valida = true
    paroleSconosciute(chiave.split(' '))
      .then((elenco) => valida && setSconosciute(elenco))
      .catch(() => {
        /* senza dizionario nel browser, decide il server */
      })
    return () => {
      valida = false
    }
  }, [chiave])

  return sconosciute
}

/**
 * La partita di Scarabeo del giorno.
 *
 * Tiene lo **stato del server** (tabellone, leggio, punti), che e' la verita', e
 * affida la posa in corso a `useComposizione`, che vive solo qui finché non la
 * si gioca.
 */
export function useScarabeo(): ScarabeoController {
  const [stato, setStato] = useState<ScarabeoState | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [inviando, setInviando] = useState(false)

  const composizione = useComposizione({
    celle: stato?.celle ?? NESSUNA,
    leggio: stato?.leggio ?? NESSUNO,
    bloccata: !stato || stato.status === 'done' || inviando,
  })
  const { anteprima, sospese, annulla, avvisa } = composizione
  const sconosciute = useParoleSconosciute(anteprima)

  const ricarica = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      setStato(await api<ScarabeoState>('/scarabeo/state'))
    } catch (errore) {
      setLoadError(errore instanceof ApiFetchError ? errore.message : 'Non riesco a caricare la partita.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void ricarica()
    // Il dizionario si scalda mentre si guarda il tabellone.
    void preparaComputer().catch(() => {})
  }, [ricarica])

  /** Invio comune a mossa, passo, cambio e chiusura. */
  const invia = useCallback(
    async (path: string, body?: unknown, successo?: string) => {
      if (inviando) return
      setInviando(true)
      try {
        const fresco = await api<ScarabeoState>(path, { method: 'POST', body })
        setStato(fresco)
        annulla()
        dimentica('/oggi')
        if (successo) avvisa(successo)
      } catch (errore) {
        if (errore instanceof ApiFetchError) {
          haptic('error')
          avvisa(errore.message)
          // Se il server dice che la partita e' cambiata sotto i piedi, la
          // verita' e' la sua: si rilegge invece di insistere.
          if (errore.code === 'CONFLITTO' || errore.code === 'MOSSE_FINITE') void ricarica()
        } else {
          avvisa('Non riesco a inviare la mossa.')
        }
      } finally {
        setInviando(false)
      }
    },
    [annulla, avvisa, inviando, ricarica],
  )

  const gioca = useCallback(() => {
    if (sospese.length === 0) {
      avvisa('Posa almeno una tessera.')
      return
    }
    if (anteprima && !anteprima.ok) {
      haptic('error')
      avvisa(anteprima.errore)
      return
    }
    if (sconosciute && sconosciute.length > 0) {
      haptic('error')
      avvisa(`${sconosciute.map((p) => p.toUpperCase()).join(', ')} non è nel dizionario.`)
      return
    }
    const punti = anteprima?.ok ? anteprima.punti : 0
    const scarabeo = anteprima?.ok ? anteprima.scarabeo : false
    void invia(
      '/scarabeo/mossa',
      { posa: sospese },
      scarabeo ? `Scarabeo! +${punti} punti` : `+${punti} punti`,
    )
  }, [anteprima, avvisa, invia, sconosciute, sospese])

  return {
    ...composizione,
    stato,
    loading,
    loadError,
    inviando,
    sconosciute,
    gioca,
    passa: () => {
      annulla()
      void invia('/scarabeo/passo', undefined, 'Mossa passata.')
    },
    cambia: (tessere) => {
      annulla()
      void invia('/scarabeo/cambio', { tessere }, `${tessere.length} tessere cambiate.`)
    },
    chiudiGiornata: () => {
      annulla()
      void invia('/scarabeo/chiudi', undefined, 'Giornata chiusa.')
    },
    ricarica: () => void ricarica(),
  }
}

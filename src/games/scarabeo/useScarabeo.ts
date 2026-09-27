import { useCallback, useEffect, useRef, useState } from 'react'
import type { MossaAppena } from './adesivi'
import type { CellaPiena, ScarabeoState } from '@shared/types'
import type { EsitoPosa } from '@shared/scarabeo'
import { ApiFetchError, api } from '@/lib/api'
import { dimentica } from '@/lib/dati'
import { haptic } from '@/lib/haptics'
import { suona } from '@/lib/suoni'
import { paroleSconosciute, preparaComputer } from './computer'
import { useComposizione, type Composizione } from './useComposizione'

export type { Cursore } from './useComposizione'

const NESSUNA: readonly CellaPiena[] = []
const NESSUNO: readonly string[] = []

export interface ScarabeoController extends Composizione {
  stato: ScarabeoState | null
  /** L'ultima mossa giocata in questa visita: l'adesivo al centro la racconta. */
  ultimaMossa: MossaAppena | null
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

/** L'avviso per le parole che il dizionario non conosce: una o piu'. */
export function nonNelDizionario(parole: readonly string[]): string {
  const elenco = parole.map((p) => p.toUpperCase()).join(', ')
  return parole.length === 1 ? `${elenco} non è nel dizionario.` : `${elenco} non sono nel dizionario.`
}

/** Quante tessere si sono appena cambiate, detto con il numero giusto. */
export function tessereCambiate(quante: number): string {
  return quante === 1 ? '1 tessera cambiata.' : `${quante} tessere cambiate.`
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
  const [ultimaMossa, setUltimaMossa] = useState<MossaAppena | null>(null)
  const idMossa = useRef(0)

  const composizione = useComposizione({
    celle: stato?.celle ?? NESSUNA,
    leggio: stato?.leggio ?? NESSUNO,
    bloccata: !stato || stato.status === 'done' || inviando,
    ricordo: stato ? `classificata:${stato.puzzleNumber}` : null,
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
    async (path: string, body?: unknown, successo?: string, fatta?: Omit<MossaAppena, 'id'>) => {
      if (inviando) return
      setInviando(true)
      try {
        const fresco = await api<ScarabeoState>(path, { method: 'POST', body })
        setStato(fresco)
        annulla()
        dimentica('/oggi')
        if (successo) avvisa(successo)
        if (fatta) {
          idMossa.current += 1
          setUltimaMossa({ ...fatta, id: idMossa.current })
          haptic('success')
        }
      } catch (errore) {
        if (errore instanceof ApiFetchError) {
          haptic('error')
          suona('sbagliato', { volume: 0.6 })
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
      suona('sbagliato', { volume: 0.6 })
      avvisa(anteprima.errore)
      return
    }
    if (sconosciute && sconosciute.length > 0) {
      haptic('error')
      suona('sbagliato', { volume: 0.6 })
      avvisa(nonNelDizionario(sconosciute))
      return
    }
    const punti = anteprima?.ok ? anteprima.punti : 0
    const scarabeo = anteprima?.ok ? anteprima.scarabeo : false
    // La parola da mostrare e' la piu' lunga fra quelle formate: e' quella che si e' voluta fare.
    const parola = anteprima?.ok
      ? ([...anteprima.parole].sort((a, b) => b.parola.length - a.parola.length)[0]?.parola ?? '')
      : ''
    void invia('/scarabeo/mossa', { posa: sospese }, undefined, { mia: true, parola, punti, scarabeo })
  }, [anteprima, avvisa, invia, sconosciute, sospese])

  return {
    ...composizione,
    stato,
    ultimaMossa,
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
      void invia('/scarabeo/cambio', { tessere }, tessereCambiate(tessere.length))
    },
    chiudiGiornata: () => {
      annulla()
      void invia('/scarabeo/chiudi', undefined, 'Giornata chiusa.')
    },
    ricarica: () => void ricarica(),
  }
}

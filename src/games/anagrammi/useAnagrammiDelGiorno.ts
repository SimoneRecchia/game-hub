import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiFetchError, api } from '@/lib/api'
import { dimentica } from '@/lib/dati'
import { MARGINE_ANAGRAMMI_MS } from '@shared/anagrammi'
import type { AnagrammiProva, AnagrammiStato } from '@shared/types'
import type { EsitoProva } from './Lettere'

export interface AnagrammiDelGiorno {
  stato: AnagrammiStato | null
  errore: string | null
  /** Le parole di oggi non ci sono ancora: le scrive la notte. */
  assente: boolean
  occupato: boolean
  /** Quando finisce il tempo della parola aperta, sull'orologio del telefono. */
  scadenza: number | null
  /** Il tempo e' finito sul telefono: si aspetta che il server chiuda la parola. */
  scaduta: boolean
  apri: () => void
  prova: (parola: string) => Promise<EsitoProva | null>
  aiuto: () => void
  passo: () => void
  scade: () => void
  ricarica: () => void
}

/**
 * La giornata degli Anagrammi. Le parole si aprono una alla volta, quando lo
 * si chiede: e' da li' che parte il loro tempo, che tiene il server. Le
 * risposte vanno al server, che dice se sono giuste; allo scadere del tempo il
 * telefono aspetta il margine della rete e rilegge, e il server ha chiuso la
 * parola come persa.
 */
export function useAnagrammiDelGiorno(): AnagrammiDelGiorno {
  const [stato, setStato] = useState<AnagrammiStato | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [assente, setAssente] = useState(false)
  const [occupato, setOccupato] = useState(false)
  const [scadenza, setScadenza] = useState<number | null>(null)
  const [scaduta, setScaduta] = useState(false)
  const statoRef = useRef(stato)
  statoRef.current = stato
  const occupatoRef = useRef(false)
  const timer = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current)
    },
    [],
  )

  const applica = useCallback((s: AnagrammiStato) => {
    const prima = statoRef.current
    setStato(s)
    setScadenza(s.restanteMs !== null ? Date.now() + s.restanteMs : null)
    setScaduta(false)
    setOccupato(false)
    occupatoRef.current = false
    // Una parola appena chiusa cambia la carta delle Giornaliere, e la giornata finita la classifica.
    const chiuse = (x: AnagrammiStato | null) => x?.parole.filter((p) => p.esito !== null).length ?? 0
    if (chiuse(s) !== chiuse(prima)) dimentica('/oggi')
    if (s.status === 'done' && prima?.status !== 'done') dimentica('/leaderboard')
  }, [])

  const ricarica = useCallback(() => {
    setErrore(null)
    api<AnagrammiStato>('/anagrammi/state')
      .then((s) => {
        setAssente(false)
        applica(s)
      })
      .catch((e) => {
        occupatoRef.current = false
        setOccupato(false)
        if (e instanceof ApiFetchError && e.code === 'ANAGRAMMI_ASSENTI') setAssente(true)
        else setErrore(e instanceof ApiFetchError ? e.message : 'Non riesco a caricare gli anagrammi di oggi.')
      })
  }, [applica])

  useEffect(() => {
    ricarica()
  }, [ricarica])

  /** Una scrittura alla volta, e se va storta si rilegge lo stato. */
  const scrivi = useCallback(
    <T extends AnagrammiStato>(percorso: string, corpo: Record<string, unknown>): Promise<T | null> => {
      if (occupatoRef.current) return Promise.resolve(null)
      occupatoRef.current = true
      setOccupato(true)
      return api<T>(percorso, { method: 'POST', body: corpo })
        .then((s) => {
          applica(s)
          return s
        })
        .catch(() => {
          ricarica()
          return null
        })
    },
    [applica, ricarica],
  )

  const apri = useCallback(() => {
    const s = statoRef.current
    if (!s || s.status === 'done') return
    void scrivi('/anagrammi/apri', { versione: s.versione })
  }, [scrivi])

  const prova = useCallback(
    async (parola: string): Promise<EsitoProva | null> => {
      const s = statoRef.current
      if (!s || s.corrente === null) return null
      const dopo = await scrivi<AnagrammiProva>('/anagrammi/prova', { versione: s.versione, parola })
      if (!dopo) return null
      return dopo.giusta ? 'giusta' : 'sbagliata'
    },
    [scrivi],
  )

  const aiuto = useCallback(() => {
    const s = statoRef.current
    if (!s || s.corrente === null) return
    void scrivi('/anagrammi/aiuto', { versione: s.versione })
  }, [scrivi])

  const passo = useCallback(() => {
    const s = statoRef.current
    if (!s || s.corrente === null) return
    void scrivi('/anagrammi/passo', { versione: s.versione })
  }, [scrivi])

  // Allo scadere: la parola non si scrive piu', e dopo il margine della rete il server l'ha chiusa.
  const scade = useCallback(() => {
    setScaduta(true)
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      timer.current = null
      ricarica()
    }, MARGINE_ANAGRAMMI_MS + 300)
  }, [ricarica])

  return { stato, errore, assente, occupato, scadenza, scaduta, apri, prova, aiuto, passo, scade, ricarica }
}

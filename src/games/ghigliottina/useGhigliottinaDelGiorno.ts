import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiFetchError, api } from '@/lib/api'
import { dimentica } from '@/lib/dati'
import { MARGINE_GHIGLIOTTINA_MS } from '@shared/ghigliottina'
import type { GhigliottinaStato } from '@shared/types'
import type { ComandiGhigliottina, VistaGhigliottina } from './Partita'

export interface GhigliottinaDelGiorno {
  stato: GhigliottinaStato | null
  vista: VistaGhigliottina | null
  comandi: ComandiGhigliottina
  errore: string | null
  /** La partita di oggi non c'e' ancora: la scrive la notte. */
  assente: boolean
  ricarica: () => void
}

/** Lo stato del server come lo vede la scena, con la fine del minuto sull'orologio del telefono. */
function vistaDa(s: GhigliottinaStato): VistaGhigliottina {
  return {
    coppie: s.coppie,
    totaleCoppie: s.totaleCoppie,
    corrente: s.corrente,
    montepremiIniziale: s.montepremiIniziale,
    montepremi: s.montepremi,
    finaleAperto: s.finale.aperto,
    scadenza: s.finale.restanteMs !== null ? Date.now() + s.finale.restanteMs : null,
    tempoFinaleMs: s.finale.tempoMs,
    soluzione: s.soluzione,
    risposta: s.risposta,
    indovinata: s.indovinata,
    finita: s.status === 'done',
    punti: s.punti,
  }
}

/**
 * La Ghigliottina del giorno. Ogni scelta va al server, che dice qual era la
 * parola giusta solo dopo; il minuto lo tiene lui. Allo scadere il telefono
 * aspetta il margine della rete e rilegge: il server ha chiuso la partita.
 */
export function useGhigliottinaDelGiorno(): GhigliottinaDelGiorno {
  const [stato, setStato] = useState<GhigliottinaStato | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [assente, setAssente] = useState(false)
  const statoRef = useRef(stato)
  statoRef.current = stato
  const timer = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current)
    },
    [],
  )

  const applica = useCallback((s: GhigliottinaStato) => {
    const prima = statoRef.current
    statoRef.current = s
    setStato(s)
    // Una scelta cambia la carta delle Giornaliere, e la partita finita la classifica.
    const scelte = (x: GhigliottinaStato | null) => x?.coppie.filter((c) => c.scelta !== null).length ?? 0
    if (scelte(s) !== scelte(prima) || s.status !== prima?.status) dimentica('/oggi')
    if (s.status === 'done' && prima?.status !== 'done') dimentica('/leaderboard')
  }, [])

  const ricarica = useCallback(() => {
    setErrore(null)
    api<GhigliottinaStato>('/ghigliottina/state')
      .then((s) => {
        setAssente(false)
        applica(s)
      })
      .catch((e) => {
        if (e instanceof ApiFetchError && e.code === 'GHIGLIOTTINA_ASSENTE') setAssente(true)
        else setErrore(e instanceof ApiFetchError ? e.message : 'Non riesco a caricare la Ghigliottina di oggi.')
      })
  }, [applica])

  useEffect(() => {
    ricarica()
  }, [ricarica])

  /** Una scrittura: se va storta si rilegge lo stato, e la scena torna dov'era. */
  const scrivi = useCallback(
    async (percorso: string, corpo: Record<string, unknown>): Promise<VistaGhigliottina | null> => {
      try {
        const s = await api<GhigliottinaStato>(percorso, { method: 'POST', body: corpo })
        applica(s)
        return vistaDa(s)
      } catch {
        ricarica()
        return null
      }
    },
    [applica, ricarica],
  )

  const comandi = useMemo<ComandiGhigliottina>(
    () => ({
      scegli: (scelta) => {
        const s = statoRef.current
        if (!s || s.corrente === null) return Promise.resolve(null)
        return scrivi('/ghigliottina/scegli', { versione: s.versione, coppia: s.corrente, scelta })
      },
      apriFinale: () => {
        const s = statoRef.current
        if (!s) return Promise.resolve(null)
        return scrivi('/ghigliottina/finale', { versione: s.versione })
      },
      rispondi: (parola) => {
        const s = statoRef.current
        if (!s) return Promise.resolve(null)
        return scrivi('/ghigliottina/rispondi', { versione: s.versione, parola })
      },
      scade: () => {
        if (timer.current) window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => {
          timer.current = null
          ricarica()
        }, MARGINE_GHIGLIOTTINA_MS + 300)
      },
    }),
    [scrivi, ricarica],
  )

  const vista = useMemo(() => (stato ? vistaDa(stato) : null), [stato])
  return { stato, vista, comandi, errore, assente, ricarica }
}

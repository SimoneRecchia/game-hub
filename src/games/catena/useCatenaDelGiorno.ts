import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiFetchError, api } from '@/lib/api'
import { dimentica } from '@/lib/dati'
import { MARGINE_CATENA_MS, TEMPO_FINALE_CATENA_MS, TEMPO_PAROLA_CATENA_MS } from '@shared/catena'
import type { CatenaStato } from '@shared/types'
import type { ComandiCatena, RispostaCatena, VistaCatena } from './Partita'

export interface CatenaDelGiorno {
  stato: CatenaStato | null
  vista: VistaCatena | null
  comandi: ComandiCatena
  errore: string | null
  /** La catena di oggi non c'e' ancora: la scrive la notte. */
  assente: boolean
  ricarica: () => void
}

/** Un tempo del server sull'orologio del telefono: quando parte, e quando finisce. */
function orologio(t: { inizioMs: number; restanteMs: number; tempoMs: number } | null, adesso: number) {
  if (!t) return null
  return { inizio: adesso + t.inizioMs, scadenza: adesso + (t.inizioMs > 0 ? t.inizioMs + t.tempoMs : t.restanteMs) }
}

/** Lo stato del server come lo vede la scena, con i tempi sull'orologio del telefono. */
function vistaDa(s: CatenaStato): VistaCatena {
  const adesso = Date.now()
  return {
    chiave: (s.versione + (s.iniziata ? 1 : 0)) * 2 + (s.status === 'done' ? 1 : 0),
    nuova: !s.iniziata,
    voci: s.voci,
    passo: s.passo,
    jollyRestanti: s.jollyRestanti,
    jollyUsabile: s.jollyUsabile,
    terzo: s.terzo,
    compraUsabile: s.compraUsabile,
    montepremiIniziale: s.montepremiIniziale,
    montepremi: s.montepremi,
    parola: orologio(s.parola, adesso),
    tempoParolaMs: s.parola?.tempoMs ?? TEMPO_PAROLA_CATENA_MS,
    finale: orologio(s.finale, adesso),
    tempoFinaleMs: s.finale?.tempoMs ?? TEMPO_FINALE_CATENA_MS,
    risposta: s.risposta,
    indovinata: s.indovinata,
    finita: s.status === 'done',
    punti: s.punti,
  }
}

/**
 * La Catena del giorno. Ogni mossa va al server, che dice com'e' andata e
 * manda solo le parole viste; i tempi li tiene lui. Finito il minuto di una
 * parola il telefono lo dice subito (`/tempo`), e la parola si mostra; finito
 * quello della finale aspetta il margine della rete e rilegge: il server ha
 * chiuso la partita.
 */
export function useCatenaDelGiorno(): CatenaDelGiorno {
  const [stato, setStato] = useState<CatenaStato | null>(null)
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

  const applica = useCallback((s: CatenaStato) => {
    const prima = statoRef.current
    statoRef.current = s
    setStato(s)
    // Una mossa cambia la carta delle Giornaliere, e la partita finita la classifica.
    if (s.passo !== prima?.passo || s.status !== prima?.status || s.versione === 1) dimentica('/oggi')
    if (s.status === 'done' && prima?.status !== 'done') dimentica('/leaderboard')
  }, [])

  const ricarica = useCallback(() => {
    setErrore(null)
    api<CatenaStato>('/catena/state')
      .then((s) => {
        setAssente(false)
        applica(s)
      })
      .catch((e) => {
        if (e instanceof ApiFetchError && e.code === 'CATENA_ASSENTE') setAssente(true)
        else setErrore(e instanceof ApiFetchError ? e.message : 'Non riesco a caricare la Catena di oggi.')
      })
  }, [applica])

  useEffect(() => {
    ricarica()
  }, [ricarica])

  /** Una scrittura: se va storta si rilegge lo stato, e la scena torna dov'era. */
  const scrivi = useCallback(
    async (percorso: string, corpo: Record<string, unknown>): Promise<RispostaCatena | null> => {
      try {
        const s = await api<CatenaStato>(percorso, { method: 'POST', body: corpo })
        applica(s)
        return { vista: vistaDa(s), esito: s.esito }
      } catch {
        ricarica()
        return null
      }
    },
    [applica, ricarica],
  )

  const comandi = useMemo<ComandiCatena>(() => {
    const con = (percorso: string, altro: Record<string, unknown> = {}) => {
      const s = statoRef.current
      if (!s) return Promise.resolve(null)
      return scrivi(percorso, { versione: s.versione, ...altro })
    }
    return {
      inizia: () => scrivi('/catena/inizia', {}),
      scadeParola: () => con('/catena/tempo'),
      prova: (parola) => con('/catena/prova', { parola }),
      jolly: () => con('/catena/jolly'),
      compra: () => con('/catena/compra'),
      rispondi: (parola) => con('/catena/rispondi', { parola }),
      scade: () => {
        if (timer.current) window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => {
          timer.current = null
          ricarica()
        }, MARGINE_CATENA_MS + 300)
      },
    }
  }, [scrivi, ricarica])

  const vista = useMemo(() => (stato ? vistaDa(stato) : null), [stato])
  return { stato, vista, comandi, errore, assente, ricarica }
}

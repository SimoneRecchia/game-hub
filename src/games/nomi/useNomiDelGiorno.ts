import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiFetchError, api } from '@/lib/api'
import { dimentica } from '@/lib/dati'
import type { CategoriaNomi } from '@shared/nomi-cose'
import type { NomiStato } from '@shared/types'

/** Quanto si aspetta dall'ultimo tasto prima di salvare le risposte sul server. */
const PAUSA_MS = 1_200

/** La bozza nel telefono: le risposte scritte, se la pagina si ricarica prima che arrivino al server. */
const CHIAVE_BOZZA = 'giochi.nomi.bozza'

export type RisposteNomi = Partial<Record<CategoriaNomi, string>>

function leggiBozza(numero: number): RisposteNomi | null {
  try {
    const bozza = JSON.parse(localStorage.getItem(CHIAVE_BOZZA) ?? 'null') as {
      numero?: number
      risposte?: RisposteNomi
    } | null
    return bozza?.numero === numero && bozza.risposte && typeof bozza.risposte === 'object' ? bozza.risposte : null
  } catch {
    return null
  }
}

function scriviBozza(numero: number, risposte: RisposteNomi | null) {
  try {
    if (risposte) localStorage.setItem(CHIAVE_BOZZA, JSON.stringify({ numero, risposte }))
    else localStorage.removeItem(CHIAVE_BOZZA)
  } catch {
    /* senza localStorage la bozza resta solo sul server */
  }
}

export interface NomiDelGiorno {
  stato: NomiStato | null
  errore: string | null
  /** Le risposte come si vedono: quelle scritte qui, che il server riceve un attimo dopo. */
  risposte: RisposteNomi
  /** Quando finisce il tempo, sull'orologio del telefono. */
  scadenza: number | null
  occupato: boolean
  comincia: () => void
  scrivi: (categoria: CategoriaNomi, testo: string) => void
  consegna: () => void
  ricarica: () => void
}

/**
 * La partita del giorno di Nomi, cose e città. Le risposte si scrivono qui e
 * arrivano al server dopo un attimo di pausa, una richiesta alla volta, e
 * subito quando la pagina si nasconde: se il telefono si spegne a meta', quel
 * che c'era scritto vale lo stesso. Allo scadere del tempo la consegna la fa
 * la pagina, con il tempo intero.
 */
export function useNomiDelGiorno(): NomiDelGiorno {
  const [stato, setStato] = useState<NomiStato | null>(null)
  const [risposte, setRisposte] = useState<RisposteNomi>({})
  const [scadenza, setScadenza] = useState<number | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [occupato, setOccupato] = useState(false)
  const statoRef = useRef(stato)
  statoRef.current = stato
  const risposteRef = useRef(risposte)
  const pausa = useRef<number | null>(null)
  const inViaggio = useRef(false)
  const daSalvare = useRef(false)
  const consegnata = useRef(false)
  const salvaRef = useRef<(prima?: boolean) => void>(() => {})

  const programma = useCallback(() => {
    if (pausa.current) window.clearTimeout(pausa.current)
    pausa.current = window.setTimeout(() => salvaRef.current(), PAUSA_MS)
  }, [])

  const applica = useCallback(
    (s: NomiStato, conBozza = false) => {
      setStato(s)
      statoRef.current = s
      setOccupato(false)
      let visibili = s.risposte
      if (s.status === 'playing') {
        setScadenza(s.restanteMs !== null ? Date.now() + s.restanteMs : null)
        // Riaprendo la pagina valgono le risposte scritte qui, anche quelle che il server non ha ancora.
        const bozza = conBozza ? leggiBozza(s.puzzleNumber) : null
        if (bozza) {
          visibili = { ...s.risposte, ...bozza }
          daSalvare.current = true
          programma()
        }
      } else {
        setScadenza(null)
        if (s.status === 'done') {
          consegnata.current = true
          scriviBozza(s.puzzleNumber, null)
          dimentica('/oggi')
          dimentica('/leaderboard')
        }
      }
      risposteRef.current = visibili
      setRisposte(visibili)
    },
    [programma],
  )

  const ricarica = useCallback(() => {
    setErrore(null)
    api<NomiStato>('/nomi/state')
      .then((s) => applica(s, true))
      .catch((e) => setErrore(e instanceof ApiFetchError ? e.message : 'Non riesco a caricare la partita di oggi.'))
  }, [applica])

  /** Manda le risposte, una richiesta alla volta: quelle scritte nel frattempo partono dopo. */
  const salva = useCallback(
    (prima = false) => {
      if (pausa.current) window.clearTimeout(pausa.current)
      pausa.current = null
      if (consegnata.current || statoRef.current?.status !== 'playing' || !daSalvare.current) return
      if (inViaggio.current && !prima) return
      inViaggio.current = true
      daSalvare.current = false
      api<NomiStato>('/nomi/risposte', { method: 'POST', body: { risposte: risposteRef.current }, keepalive: prima })
        .then((s) => {
          // Il tempo era finito: il server l'ha chiusa con le risposte che aveva.
          if (s.status !== 'playing' && !consegnata.current) applica(s)
        })
        .catch(() => {
          daSalvare.current = true
        })
        .finally(() => {
          inViaggio.current = false
          if (daSalvare.current && !consegnata.current) programma()
        })
    },
    [applica, programma],
  )
  salvaRef.current = salva

  useEffect(() => {
    ricarica()
    // Il telefono in tasca: quel che c'e' da salvare parte subito, e sopravvive alla pagina.
    const nascosta = () => {
      if (document.visibilityState === 'hidden') salvaRef.current(true)
    }
    document.addEventListener('visibilitychange', nascosta)
    return () => {
      document.removeEventListener('visibilitychange', nascosta)
      if (pausa.current) window.clearTimeout(pausa.current)
    }
  }, [ricarica])

  const scrivi = useCallback(
    (categoria: CategoriaNomi, testo: string) => {
      const s = statoRef.current
      if (!s || s.status !== 'playing' || consegnata.current) return
      const nuove = { ...risposteRef.current, [categoria]: testo }
      risposteRef.current = nuove
      setRisposte(nuove)
      scriviBozza(s.puzzleNumber, nuove)
      daSalvare.current = true
      programma()
    },
    [programma],
  )

  const comincia = useCallback(() => {
    const s = statoRef.current
    if (!s || s.status !== 'nuova' || occupato) return
    setOccupato(true)
    // Il suono della partenza e' quello del rullo che si ferma sulla lettera.
    api<NomiStato>('/nomi/inizia', { method: 'POST' })
      .then((dopo) => applica(dopo, true))
      .catch(() => ricarica())
  }, [applica, occupato, ricarica])

  const consegna = useCallback(() => {
    const s = statoRef.current
    if (!s || s.status !== 'playing' || consegnata.current) return
    consegnata.current = true
    if (pausa.current) window.clearTimeout(pausa.current)
    setOccupato(true)
    setScadenza(null)
    api<NomiStato>('/nomi/consegna', { method: 'POST', body: { risposte: risposteRef.current } })
      .then((dopo) => applica(dopo))
      .catch(() => {
        consegnata.current = false
        ricarica()
      })
  }, [applica, ricarica])

  return { stato, errore, risposte, scadenza, occupato, comincia, scrivi, consegna, ricarica }
}

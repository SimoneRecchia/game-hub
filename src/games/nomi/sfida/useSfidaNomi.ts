import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { ApiFetchError, api } from '@/lib/api'
import { suona } from '@/lib/suoni'
import { NOMI_SFIDA_POLL_ATTESA_MS, NOMI_SFIDA_POLL_FINE_MS, NOMI_SFIDA_POLL_MS } from '@shared/config'
import type { CategoriaNomi } from '@shared/nomi-cose'
import type { VistaSfidaNomi } from '@shared/types'
import type { RisposteNomi } from '../useNomiDelGiorno'

/** Quanto si aspetta dall'ultimo tasto prima di salvare le risposte. */
const PAUSA_MS = 1_000

export interface SfidaNomi {
  vista: VistaSfidaNomi | null
  errore: string | null
  risposte: RisposteNomi
  /** Il via e la fine del tempo, sull'orologio del telefono. */
  via: number | null
  scadenza: number | null
  /** Si scrive ancora: la partita e' cominciata e nessuno ha detto stop. */
  scrivibile: boolean
  occupato: boolean
  scrivi: (categoria: CategoriaNomi, testo: string) => void
  stop: () => void
  rivincita: () => void
  tempoFinito: () => void
}

/**
 * Una sfida a Nomi, cose e città con un amico. Il server tiene il tempo e lo
 * stop; il telefono guarda ogni secondo, scrive le risposte dopo una pausa, e
 * quando l'altro dice stop smette di scrivere e manda subito quel che aveva.
 * Quando la rivincita diventa una partita, ci si va tutti e due.
 */
export function useSfidaNomi(id: string): SfidaNomi {
  const { vai } = useNavigazione()
  const [vista, setVista] = useState<VistaSfidaNomi | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [risposte, setRisposte] = useState<RisposteNomi>({})
  const [via, setVia] = useState<number | null>(null)
  const [scadenza, setScadenza] = useState<number | null>(null)
  const [occupato, setOccupato] = useState(false)
  const vistaRef = useRef(vista)
  vistaRef.current = vista
  const risposteRef = useRef(risposte)
  const iniziate = useRef(false)
  const consegnate = useRef(false)
  const pausa = useRef<number | null>(null)
  const giro = useRef<number | null>(null)

  const applica = useCallback(
    (v: VistaSfidaNomi) => {
      const prima = vistaRef.current
      vistaRef.current = v
      setVista(v)
      setErrore(null)
      setVia(v.inizioTraMs !== null ? Date.now() + v.inizioTraMs : null)
      setScadenza(v.restanteMs !== null ? Date.now() + v.restanteMs : null)
      // Le mie risposte salvate, la prima volta: riaprendo la pagina si riprende da li'.
      if (!iniziate.current && v.categorie) {
        iniziate.current = true
        risposteRef.current = { ...v.mie.risposte, ...risposteRef.current }
        setRisposte(risposteRef.current)
      }
      if (v.stato === 'finita') setRisposte(v.mie.risposte)
      if (v.stop && !prima?.stop && v.stop.di === 'avversario') suona('scaduto')
      // La rivincita accettata: si va alla partita nuova, tutti e due.
      if (v.rivincita?.stato === 'in_corso') vai(ROTTE.sfidaNomi(v.rivincita.id), { replace: true })
    },
    [vai],
  )

  const leggi = useCallback(() => {
    api<VistaSfidaNomi>(`/nomi/sfide/${id}`)
      .then(applica)
      .catch((e) => setErrore(e instanceof ApiFetchError ? e.message : 'Non riesco a leggere la sfida.'))
  }, [applica, id])

  // Il giro: stretto a partita in corso, piu' largo prima del via e a partita finita.
  useEffect(() => {
    leggi()
  }, [leggi])
  useEffect(() => {
    if (!vista) return
    const ritmo =
      vista.stato === 'in_corso'
        ? vista.inizioTraMs !== null
          ? Math.min(NOMI_SFIDA_POLL_ATTESA_MS, Math.max(50, vista.inizioTraMs + 50))
          : NOMI_SFIDA_POLL_MS
        : vista.stato === 'finita'
          ? NOMI_SFIDA_POLL_FINE_MS
          : NOMI_SFIDA_POLL_ATTESA_MS
    giro.current = window.setTimeout(leggi, ritmo)
    return () => {
      if (giro.current) window.clearTimeout(giro.current)
    }
  }, [leggi, vista])

  const manda = useCallback(
    (percorso: 'risposte' | 'stop') => {
      if (pausa.current) window.clearTimeout(pausa.current)
      pausa.current = null
      return api<VistaSfidaNomi>(`/nomi/sfide/${id}/${percorso}`, {
        method: 'POST',
        body: { risposte: risposteRef.current },
      })
        .then(applica)
        .catch(() => {})
    },
    [applica, id],
  )

  // Lo stop dell'altro: si smette di scrivere, e quel che c'e' parte subito.
  useEffect(() => {
    if (vista?.stato === 'in_corso' && vista.stop && !consegnate.current) {
      consegnate.current = true
      void manda('risposte')
    }
  }, [manda, vista])

  const scrivibile = Boolean(vista && vista.stato === 'in_corso' && vista.categorie && !vista.stop)

  const scrivi = useCallback(
    (categoria: CategoriaNomi, testo: string) => {
      const v = vistaRef.current
      if (!v || v.stato !== 'in_corso' || !v.categorie || v.stop || consegnate.current) return
      const nuove = { ...risposteRef.current, [categoria]: testo }
      risposteRef.current = nuove
      setRisposte(nuove)
      if (pausa.current) window.clearTimeout(pausa.current)
      pausa.current = window.setTimeout(() => void manda('risposte'), PAUSA_MS)
    },
    [manda],
  )

  const stop = useCallback(() => {
    if (consegnate.current) return
    consegnate.current = true
    setOccupato(true)
    setScadenza(null)
    void manda('stop').finally(() => setOccupato(false))
  }, [manda])

  const tempoFinito = useCallback(() => {
    if (consegnate.current) return
    consegnate.current = true
    setScadenza(null)
    void manda('risposte')
  }, [manda])

  const rivincita = useCallback(() => {
    setOccupato(true)
    api<{ partitaId?: string; invitoId?: string }>(`/nomi/sfide/${id}/rivincita`, { method: 'POST' })
      .then((r) => {
        if (r.partitaId) vai(ROTTE.sfidaNomi(r.partitaId), { replace: true })
        else leggi()
      })
      .catch((e) => setErrore(e instanceof ApiFetchError ? e.message : 'Non riesco a chiedere la rivincita.'))
      .finally(() => setOccupato(false))
  }, [id, leggi, vai])

  useEffect(
    () => () => {
      if (pausa.current) window.clearTimeout(pausa.current)
    },
    [],
  )

  return { vista, errore, risposte, via, scadenza, scrivibile, occupato, scrivi, stop, rivincita, tempoFinito }
}

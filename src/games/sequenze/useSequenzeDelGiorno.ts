import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiFetchError, api } from '@/lib/api'
import { dimentica } from '@/lib/dati'
import type { SequenzeMossa, SequenzeStato } from '@shared/types'

/** Quanto resta in vista com'e' andata una sequenza, il verde o il rosso, prima della prossima. */
export const DOPO_LA_RISPOSTA_MS = 950

export interface SequenzaAperta {
  sequenza: number[]
  /** Cambia a ogni sequenza: fa ripartire i lampi. */
  chiave: number
}

export interface SequenzeDelGiorno {
  stato: SequenzeStato | null
  errore: string | null
  occupato: boolean
  aperta: SequenzaAperta | null
  /** Il turno appena chiuso, finché non se ne comincia un altro: per dire com'e' andato. */
  chiuso: number | null
  comincia: () => void
  rispondi: (tocchi: number[]) => void
  ricarica: () => void
}

/**
 * La giornata delle Sequenze. Le sequenze arrivano dal server una alla volta:
 * la prima con il turno, le altre con la risposta alla precedente. La
 * risposta parte appena si sbaglia o si tocca l'ultimo cubetto, e la sequenza
 * dopo aspetta che si sia visto il verde o il rosso.
 */
export function useSequenzeDelGiorno(): SequenzeDelGiorno {
  const [stato, setStato] = useState<SequenzeStato | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [occupato, setOccupato] = useState(false)
  const [aperta, setAperta] = useState<SequenzaAperta | null>(null)
  const [chiuso, setChiuso] = useState<number | null>(null)
  const statoRef = useRef(stato)
  statoRef.current = stato
  const occupatoRef = useRef(false)
  const chiave = useRef(0)
  const timer = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current)
    },
    [],
  )

  const applica = useCallback((s: SequenzeStato) => {
    const prima = statoRef.current
    statoRef.current = s
    setStato(s)
    // Un turno chiuso cambia la carta delle Giornaliere, e la giornata finita la classifica.
    const chiusi = (x: SequenzeStato | null) => x?.turni.filter((t) => t.chiuso).length ?? 0
    if (chiusi(s) !== chiusi(prima)) dimentica('/oggi')
    if (s.status === 'done' && prima?.status !== 'done') dimentica('/leaderboard')
  }, [])

  const ricarica = useCallback(() => {
    setErrore(null)
    setAperta(null)
    api<SequenzeStato>('/sequenze/state')
      .then(applica)
      .catch((e) => setErrore(e instanceof ApiFetchError ? e.message : 'Non riesco a caricare le sequenze di oggi.'))
      .finally(() => {
        occupatoRef.current = false
        setOccupato(false)
      })
  }, [applica])

  useEffect(() => {
    ricarica()
  }, [ricarica])

  const comincia = useCallback(() => {
    const s = statoRef.current
    if (!s || s.status === 'done' || occupatoRef.current) return
    occupatoRef.current = true
    setOccupato(true)
    api<SequenzeMossa>('/sequenze/turno', { method: 'POST', body: { versione: s.versione } })
      .then((m) => {
        applica(m)
        setChiuso(null)
        chiave.current += 1
        if (m.sequenza) setAperta({ sequenza: m.sequenza, chiave: chiave.current })
        occupatoRef.current = false
        setOccupato(false)
      })
      .catch(() => ricarica())
  }, [applica, ricarica])

  const rispondi = useCallback(
    (tocchi: number[]) => {
      const s = statoRef.current
      if (!s || occupatoRef.current) return
      occupatoRef.current = true
      setOccupato(true)
      const turno = s.corrente
      const visto = new Promise<void>((fatto) => {
        timer.current = window.setTimeout(fatto, DOPO_LA_RISPOSTA_MS)
      })
      const risposta = api<SequenzeMossa>('/sequenze/risposta', {
        method: 'POST',
        body: { versione: s.versione, tocchi },
      })
      Promise.all([risposta, visto])
        .then(([m]) => {
          applica(m)
          occupatoRef.current = false
          setOccupato(false)
          if (m.sequenza) {
            chiave.current += 1
            setAperta({ sequenza: m.sequenza, chiave: chiave.current })
          } else {
            setAperta(null)
            setChiuso(turno)
          }
        })
        .catch(() => ricarica())
    },
    [applica, ricarica],
  )

  return { stato, errore, occupato, aperta, chiuso, comincia, rispondi, ricarica }
}

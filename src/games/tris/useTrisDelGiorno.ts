import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiFetchError, api } from '@/lib/api'
import { dimentica } from '@/lib/dati'
import { rigioca } from '@shared/tris'
import type { PartitaTris, TrisStato } from '@shared/types'

/**
 * Dopo la mia mossa, quanto aspetta la risposta del computer prima di
 * comparire: arriva nella stessa risposta del server, ma la mia deve finire di
 * tracciarsi, e una risposta istantanea sembra un riflesso.
 */
const RISPOSTA_MS = 450

export interface TrisDelGiorno {
  stato: TrisStato | null
  errore: string | null
  /** Le partite come si vedono: la mia mossa c'e' subito, la risposta del computer dopo un respiro. */
  partite: PartitaTris[]
  /** La partita in corso, o null fra una partita e l'altra. */
  corrente: number | null
  /** Tocca a me, e posso muovere. */
  attivo: boolean
  /** Quando finisce il tempo della mia mossa, sull'orologio del telefono. */
  scadenza: number | null
  occupato: boolean
  comincia: () => void
  muovi: (casella: number) => void
  scaduto: () => void
  ricarica: () => void
}

/**
 * La serie del giorno del tris. Le mosse passano dal server, che risponde con
 * quella del computer nella stessa richiesta e tiene il tempo; qui la mia si
 * vede subito, la sua dopo un respiro, e l'orologio della mossa parte quando la
 * sua risposta e' sulla griglia. Allo scadere lo si dice al server, che chiude
 * la partita: e' persa.
 */
export function useTrisDelGiorno(): TrisDelGiorno {
  const [stato, setStato] = useState<TrisStato | null>(null)
  const [mostrate, setMostrate] = useState<PartitaTris[] | null>(null)
  const [scadenza, setScadenza] = useState<number | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [occupato, setOccupato] = useState(false)
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

  /** Mostra lo stato del server, subito o dopo un respiro; l'orologio della mossa parte quando si vede. */
  const applica = useCallback((s: TrisStato, ritardo = 0) => {
    if (timer.current) window.clearTimeout(timer.current)
    const mostra = () => {
      timer.current = null
      setStato(s)
      setMostrate(null)
      setScadenza(s.restanteMs !== null ? Date.now() + s.restanteMs : null)
      setOccupato(false)
      occupatoRef.current = false
      const finita = s.partite.length > 0 && s.partite[s.partite.length - 1].esito !== null
      if (finita) {
        dimentica('/oggi')
        if (s.status === 'done') dimentica('/leaderboard')
      }
    }
    if (ritardo > 0) timer.current = window.setTimeout(mostra, ritardo)
    else mostra()
  }, [])

  const ricarica = useCallback(() => {
    setErrore(null)
    api<TrisStato>('/tris/state')
      .then((s) => applica(s))
      .catch((e) => {
        occupatoRef.current = false
        setOccupato(false)
        setErrore(e instanceof ApiFetchError ? e.message : 'Non riesco a caricare il tris di oggi.')
      })
  }, [applica])

  useEffect(() => {
    ricarica()
  }, [ricarica])

  /** Una scrittura: una alla volta, e se va storta si rilegge lo stato. */
  const scrivi = useCallback(
    (percorso: string, corpo: Record<string, unknown>, poi: (s: TrisStato) => void) => {
      if (occupatoRef.current) return
      occupatoRef.current = true
      setOccupato(true)
      api<TrisStato>(percorso, { method: 'POST', body: corpo })
        .then(poi)
        .catch(() => ricarica())
    },
    [ricarica],
  )

  const comincia = useCallback(() => {
    const s = statoRef.current
    if (!s || s.status === 'done') return
    scrivi('/tris/partita', { versione: s.versione }, (dopo) => {
      const nuova = dopo.partite[dopo.partite.length - 1]
      if (nuova && nuova.esito === null && nuova.mosse.length === 1) {
        // Comincia il computer: prima la griglia vuota, poi il suo segno.
        setMostrate(dopo.partite.map((p) => (p === nuova ? { ...p, mosse: [] } : p)))
        applica(dopo, RISPOSTA_MS)
      } else applica(dopo)
    })
  }, [applica, scrivi])

  const muovi = useCallback(
    (casella: number) => {
      const s = statoRef.current
      const i = s ? s.partite.length - 1 : -1
      const p = s?.partite[i]
      if (!s || !p || p.esito !== null || occupatoRef.current) return
      setScadenza(null)
      setMostrate(s.partite.map((q, j) => (j === i ? { ...q, mosse: [...q.mosse, casella] } : q)))
      scrivi('/tris/mossa', { versione: s.versione, casella }, (dopo) => {
        const q = dopo.partite[i]
        // La risposta del computer, se la partita non e' finita con la mia mossa: dopo un respiro.
        applica(dopo, q && q.mosse.length === p.mosse.length + 2 ? RISPOSTA_MS : 0)
      })
    },
    [applica, scrivi],
  )

  const scaduto = useCallback(() => {
    const s = statoRef.current
    if (!s) return
    setScadenza(null)
    scrivi('/tris/tempo', { versione: s.versione }, (dopo) => applica(dopo))
  }, [applica, scrivi])

  const partite = mostrate ?? stato?.partite ?? []
  const ultima = partite[partite.length - 1]
  const corrente = ultima && ultima.esito === null ? partite.length - 1 : null
  const attivo = useMemo(() => {
    if (corrente === null || occupato || scadenza === null) return false
    const p = partite[corrente]
    const posizione = rigioca(p.mosse)
    return posizione !== null && posizione.tratto === p.segno
  }, [corrente, occupato, partite, scadenza])

  return { stato, errore, partite, corrente, attivo, scadenza, occupato, comincia, muovi, scaduto, ricarica }
}

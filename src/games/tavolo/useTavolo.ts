import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useToast } from '@/components/Toast'
import { semeDi } from '@/games/go/conteggio'
import { ApiFetchError, api } from '@/lib/api'
import { suona } from '@/lib/suoni'
import { TAVOLO_POLL_ATTESA_MS, TAVOLO_POLL_TURNO_MS } from '@shared/config'
import { regoleDi } from '@shared/tavolo-regole'
import type { VistaTavolo } from '@shared/types'
import { stimaDelleMorte } from './computer'

/** A partita finita si guarda piu' piano: serve solo a vedere la risposta alla rivincita. */
const POLL_FINE_MS = 3_000

export type AzionePatta = 'proponi' | 'accetta' | 'rifiuta'

export interface PartitaConAmico {
  /** La vista del server, con la mia ultima mossa gia' applicata mentre viaggia. */
  vista: VistaTavolo | null
  errore: string | null
  inviando: boolean
  muovi: (mossa: string) => void
  patta: (azione: AzionePatta) => void
  arrenditi: () => void
  reclama: () => void
  rivincita: () => Promise<{ partitaId?: string; invitoId?: string } | null>
  /** Nel go, a gioco fermo: le pietre morte che propongo (tocco un gruppo), accetto il conteggio, o riprendo. */
  proponiMorte: (morte: number[]) => void
  accettaConteggio: () => void
  riprendiGioco: () => void
}

/**
 * Una partita a scacchi, a dama, a Forza 4 o a go con un amico: la vista dal
 * server, a polling come le altre partite a due — stretto quando si aspetta
 * l'altro, largo quando tocca a me — e le mosse condizionate alla versione.
 *
 * La mia mossa si vede subito: le regole sono le stesse del server, e la
 * posizione nuova si calcola qui mentre la richiesta viaggia. Se il server la
 * rifiuta, si torna alla sua vista.
 */
export function useTavolo(id: string): PartitaConAmico {
  const [vista, setVista] = useState<VistaTavolo | null>(null)
  const [inVolo, setInVolo] = useState<{ posizione: string; mosse: string[] } | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [inviando, setInviando] = useState(false)
  const vistaRef = useRef(vista)
  vistaRef.current = vista
  const toast = useToast()

  const applica = useCallback((v: VistaTavolo) => {
    const prima = vistaRef.current
    // Una patta proposta dall'altro si sente: e' una domanda che aspetta risposta.
    if (prima && prima.id === v.id && v.patta === 'avversario' && prima.patta !== 'avversario') {
      suona('invito', { volume: 0.6 })
    }
    setVista(v)
  }, [])

  const carica = useCallback(async () => {
    try {
      applica(await api<VistaTavolo>(`/tavolo/partite/${id}`))
      setErrore(null)
    } catch (e) {
      if (!vistaRef.current) setErrore(e instanceof ApiFetchError ? e.message : 'Non riesco ad aprire la partita.')
    }
  }, [applica, id])

  useEffect(() => {
    setVista(null)
    setInVolo(null)
    void carica()
  }, [carica])

  // Il polling: solo a pagina visibile, al ritmo di quel che si aspetta.
  const stato = vista?.stato
  const ritmo =
    stato === 'finita'
      ? POLL_FINE_MS
      : stato === 'in_corso' && vista?.tuoTurno
        ? TAVOLO_POLL_TURNO_MS
        : TAVOLO_POLL_ATTESA_MS
  const aperta = stato === 'in_corso' || stato === 'finita' || stato === 'invito'
  useEffect(() => {
    if (!aperta) return
    const giro = () => {
      if (document.visibilityState === 'visible') void carica()
    }
    const t = setInterval(giro, ritmo)
    document.addEventListener('visibilitychange', giro)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', giro)
    }
  }, [aperta, ritmo, carica])

  const azione = useCallback(
    async (percorso: string, corpo: Record<string, unknown> = {}): Promise<boolean> => {
      const v = vistaRef.current
      if (!v) return false
      setInviando(true)
      try {
        applica(
          await api<VistaTavolo>(`/tavolo/partite/${id}/${percorso}`, {
            method: 'POST',
            body: { ...corpo, versione: v.versione },
          }),
        )
        return true
      } catch (e) {
        if (e instanceof ApiFetchError && e.status === 409) void carica()
        else toast.show(e instanceof ApiFetchError ? e.message : 'Qualcosa è andato storto.', 'error')
        return false
      } finally {
        setInviando(false)
      }
    },
    [applica, carica, id, toast],
  )

  const muovi = useCallback(
    (mossa: string) => {
      const v = vistaRef.current
      if (!v || v.stato !== 'in_corso' || !v.tuoTurno || inVolo) return
      const dopo = regoleDi(v.gioco).gioca(v.posizione, mossa)
      if (!dopo) return
      setInVolo({ posizione: dopo.posizione, mosse: [...v.mosse, mossa] })
      void azione('mossa', { mossa }).finally(() => setInVolo(null))
    },
    [azione, inVolo],
  )

  const rivincita = useCallback(async () => {
    try {
      const esito = await api<{ partitaId?: string; invitoId?: string }>(`/tavolo/partite/${id}/rivincita`, {
        method: 'POST',
      })
      void carica()
      return esito
    } catch (e) {
      toast.show(e instanceof ApiFetchError ? e.message : 'Non riesco a chiedere la rivincita.', 'error')
      return null
    }
  }, [carica, id, toast])

  // Nel go fermo per contare, se nessuno ha ancora proposto le pietre morte, le propone il mio telefono:
  // la stima ha il seme della posizione, quindi anche quella dell'altro telefono sarebbe questa.
  const daStimare = vista?.conteggio && vista.conteggio.morte === null ? vista.posizione : null
  useEffect(() => {
    if (!daStimare) return
    let annullato = false
    void stimaDelleMorte(daStimare, semeDi(daStimare))
      .then((morte) => {
        if (!annullato && vistaRef.current?.posizione === daStimare && vistaRef.current.conteggio?.morte === null) {
          void azione('conteggio', { azione: 'proponi', morte })
        }
      })
      .catch(() => {})
    return () => {
      annullato = true
    }
  }, [azione, daStimare])

  // Mentre la mia mossa viaggia, la posizione e' gia' quella nuova e non tocca piu' a me.
  const mostrata = useMemo(
    () => (vista && inVolo ? { ...vista, posizione: inVolo.posizione, mosse: inVolo.mosse, tuoTurno: false } : vista),
    [vista, inVolo],
  )

  return {
    vista: mostrata,
    errore,
    inviando: inviando || inVolo !== null,
    muovi,
    patta: (a) => void azione('patta', { azione: a }),
    arrenditi: () => void azione('resa'),
    reclama: () => void azione('reclama'),
    rivincita,
    proponiMorte: (morte) => void azione('conteggio', { azione: 'proponi', morte }),
    accettaConteggio: () => void azione('conteggio', { azione: 'accetta' }),
    riprendiGioco: () => void azione('conteggio', { azione: 'riprendi' }),
  }
}

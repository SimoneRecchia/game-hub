import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiFetchError, api } from '@/lib/api'
import { TAVOLO_POLL_ATTESA_MS, TAVOLO_POLL_TURNO_MS } from '@shared/config'
import type { VistaScarabeo } from '@shared/scarabeo-amici'
import type { VistaTavolo } from '@shared/types'

/** A partita finita si guarda piu' piano: serve solo a vedere la risposta alla rivincita (come in useTavolo). */
const POLL_FINE_MS = 3_000

export interface PartitaScarabeoAmico {
  vista: VistaTavolo | null
  /** La mia vista della partita: le mosse, il mio leggio, i punti. Null finché non arriva. */
  scarabeo: VistaScarabeo | null
  errore: string | null
  inviando: boolean
  /** Manda una mossa; risponde null se e' andata, o perché no. */
  muovi: (mossa: string) => Promise<string | null>
  arrenditi: () => void
  reclama: () => void
  /** La rivincita: la partita nuova se l'altro l'aveva gia' chiesta, l'invito se no, o perché non si puo'. */
  rivincita: () => Promise<{ partitaId?: string; invitoId?: string; errore?: string }>
}

/**
 * Una partita a Scarabeo con un amico, sul tavolo del server dei tavolieri: la
 * vista a polling come in useTavolo — stretto quando si aspetta l'altro, largo
 * quando tocca a me — e le mosse condizionate alla versione. Al contrario dei
 * tavolieri la mossa non si mostra prima della risposta: le tessere che si
 * pescano le sa solo il server, e intanto quelle posate restano sul tabellone,
 * in sospeso. Qui non entrano le regole dei tavolieri, che lo Scarabeo non usa.
 */
export function useScarabeoAmico(id: string): PartitaScarabeoAmico {
  const [vista, setVista] = useState<VistaTavolo | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [inviando, setInviando] = useState(false)
  const vistaRef = useRef(vista)
  vistaRef.current = vista

  const carica = useCallback(async () => {
    try {
      setVista(await api<VistaTavolo>(`/tavolo/partite/${id}`))
      setErrore(null)
    } catch (e) {
      if (!vistaRef.current) setErrore(e instanceof ApiFetchError ? e.message : 'Non riesco ad aprire la partita.')
    }
  }, [id])

  useEffect(() => {
    setVista(null)
    void carica()
  }, [carica])

  const stato = vista?.stato
  const ritmo =
    stato === 'finita' ? POLL_FINE_MS : stato === 'in_corso' && vista?.tuoTurno ? TAVOLO_POLL_TURNO_MS : TAVOLO_POLL_ATTESA_MS
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

  /** Un'azione sulla partita, con la versione letta: null se e' andata, il perché se no. */
  const azione = useCallback(
    async (percorso: string, corpo: Record<string, unknown> = {}): Promise<string | null> => {
      const v = vistaRef.current
      if (!v) return 'La partita non si è ancora aperta.'
      setInviando(true)
      try {
        setVista(
          await api<VistaTavolo>(`/tavolo/partite/${id}/${percorso}`, {
            method: 'POST',
            body: { ...corpo, versione: v.versione },
          }),
        )
        return null
      } catch (e) {
        // Una partita cambiata nel frattempo si rilegge: la mossa dell'altro, o la sua resa.
        if (e instanceof ApiFetchError && e.status === 409) void carica()
        return e instanceof ApiFetchError ? e.message : 'Non riesco a inviare la mossa.'
      } finally {
        setInviando(false)
      }
    },
    [carica, id],
  )

  const rivincita = useCallback(async () => {
    try {
      const esito = await api<{ partitaId?: string; invitoId?: string }>(`/tavolo/partite/${id}/rivincita`, {
        method: 'POST',
      })
      void carica()
      return esito
    } catch (e) {
      return { errore: e instanceof ApiFetchError ? e.message : 'Non riesco a chiedere la rivincita.' }
    }
  }, [carica, id])

  const scarabeo = useMemo(() => {
    if (!vista) return null
    try {
      return JSON.parse(vista.posizione) as VistaScarabeo
    } catch {
      return null
    }
  }, [vista])

  return {
    vista,
    scarabeo,
    errore,
    inviando,
    muovi: (mossa) => azione('mossa', { mossa }),
    arrenditi: () => void azione('resa'),
    reclama: () => void azione('reclama'),
    rivincita,
  }
}

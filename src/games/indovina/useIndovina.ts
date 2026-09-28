import { useCallback, useEffect, useRef, useState } from 'react'
import { useToast } from '@/components/Toast'
import { ApiFetchError, api } from '@/lib/api'
import { suona } from '@/lib/suoni'
import { INDOVINA_POLL_ATTESA_MS, INDOVINA_POLL_TURNO_MS } from '@shared/config'
import type { Risposta } from '@shared/indovina'
import type { VistaIndovina } from '@shared/types'
import { useImmagini, type Immagini } from './immagini'
import { useFotoCondivise, type FotoCondivise } from './useFotoCondivise'

/** Dopo quanto dall'ultima faccia abbassata si salva il tabellone: si abbassano a raffica. */
const ATTESA_ABBASSATE_MS = 800
/** Il ritmo a partita finita, per vedere la risposta alla rivincita; e mentre si aprono le foto. */
const POLL_FINE_MS = 3_000
const POLL_FOTO_MS = 1_200

export interface PartitaIndovina {
  vista: VistaIndovina | null
  errore: string | null
  inviando: boolean
  immagini: Immagini
  foto: FotoCondivise
  /** Le facce abbassate sul mio tabellone, come le vedo io: si aggiornano subito. */
  abbassate: ReadonlySet<number>
  abbassa: (k: number) => void
  chiedi: (testo: string) => Promise<boolean>
  rispondi: (r: Risposta) => void
  indovina: (k: number) => void
  arrenditi: () => void
  reclama: () => void
  rivincita: () => Promise<{ partitaId?: string } | null>
  ricarica: () => void
}

/**
 * Una partita di Indovina chi: la vista dal server, a polling come la
 * battaglia — stretto quando si aspetta l'altro, largo quando tocca a me — e
 * le mosse condizionate alla versione. Le facce abbassate sono mie: cambiano
 * subito sullo schermo e si salvano dopo un attimo, senza versione.
 */
export function useIndovina(id: string): PartitaIndovina {
  const [vista, setVista] = useState<VistaIndovina | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [inviando, setInviando] = useState(false)
  const [abbassate, setAbbassate] = useState<ReadonlySet<number>>(new Set())
  const toccate = useRef(false)
  const timerAbbassate = useRef<ReturnType<typeof setTimeout> | null>(null)
  const vistaRef = useRef(vista)
  vistaRef.current = vista
  const toast = useToast()

  const applica = useCallback((v: VistaIndovina) => {
    const prima = vistaRef.current
    // Le cose nuove dall'altro suonano: una domanda per me, la risposta alla mia.
    if (prima && prima.id === v.id) {
      const nuove = v.mosse.slice(prima.mosse.length).filter((m) => !m.mia)
      if (nuove.some((m) => m.t === 'd')) suona('invito', { volume: 0.7 })
      else if (nuove.some((m) => m.t === 'r')) suona('tocco')
    }
    setVista(v)
    if (!toccate.current) setAbbassate(new Set(v.abbassate))
  }, [])

  const carica = useCallback(async () => {
    try {
      applica(await api<VistaIndovina>(`/indovina/partite/${id}`))
      setErrore(null)
    } catch (e) {
      if (!vistaRef.current) setErrore(e instanceof ApiFetchError ? e.message : 'Non riesco ad aprire la partita.')
    }
  }, [applica, id])

  useEffect(() => {
    toccate.current = false
    setVista(null)
    void carica()
  }, [carica])

  const immagini = useImmagini(vista?.personaggi ?? null)
  const foto = useFotoCondivise(vista, immagini, () => void carica())

  // Il polling: solo a pagina visibile, al ritmo di quel che si aspetta.
  const aspetto =
    vista?.stato === 'in_corso' && !(vista.tuoTurno || (vista.domanda !== null && !vista.domanda.mia))
  const ritmo = foto.fretta
    ? POLL_FOTO_MS
    : vista?.stato === 'finita'
      ? POLL_FINE_MS
      : aspetto
        ? INDOVINA_POLL_ATTESA_MS
        : INDOVINA_POLL_TURNO_MS
  // Anche un invito: chi l'ha mandato e apre la partita vede quando l'altro accetta.
  const aperta = vista?.stato === 'in_corso' || vista?.stato === 'finita' || vista?.stato === 'invito'
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
          await api<VistaIndovina>(`/indovina/partite/${id}/${percorso}`, {
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

  const salvaAbbassate = useCallback(
    (insieme: ReadonlySet<number>) => {
      if (timerAbbassate.current) clearTimeout(timerAbbassate.current)
      timerAbbassate.current = setTimeout(() => {
        void api(`/indovina/partite/${id}/abbassate`, { method: 'PUT', body: { abbassate: [...insieme] } }).catch(() => {})
      }, ATTESA_ABBASSATE_MS)
    },
    [id],
  )

  const abbassa = useCallback(
    (k: number) => {
      if (vistaRef.current?.stato !== 'in_corso') return
      toccate.current = true
      suona('tocco', { volume: 0.6 })
      setAbbassate((prima) => {
        const dopo = new Set(prima)
        if (dopo.has(k)) dopo.delete(k)
        else dopo.add(k)
        salvaAbbassate(dopo)
        return dopo
      })
    },
    [salvaAbbassate],
  )

  useEffect(
    () => () => {
      if (timerAbbassate.current) clearTimeout(timerAbbassate.current)
    },
    [],
  )

  const rivincita = useCallback(async () => {
    try {
      const esito = await api<{ partitaId?: string; invitoId?: string }>(`/indovina/partite/${id}/rivincita`, {
        method: 'POST',
      })
      void carica()
      return esito
    } catch (e) {
      toast.show(e instanceof ApiFetchError ? e.message : 'Non riesco a chiedere la rivincita.', 'error')
      return null
    }
  }, [carica, id, toast])

  return {
    vista,
    errore,
    inviando,
    immagini,
    foto,
    abbassate,
    abbassa,
    chiedi: (testo) => azione('domanda', { testo }),
    rispondi: (r) => void azione('risposta', { risposta: r }),
    indovina: (k) => void azione('ipotesi', { k }),
    arrenditi: () => void azione('resa'),
    reclama: () => void azione('reclama'),
    rivincita,
    ricarica: () => void carica(),
  }
}

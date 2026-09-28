import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import type { VistaIndovina } from '@shared/types'
import { leggiImmagine } from './archivio'
import type { Immagini } from './immagini'
import { mandaFoto, riceviFoto, type Invio, type Ricezione } from './trasferimento'

/** Quanto si aspetta che il canale si apra e le foto arrivino, prima di dire che non ce la fa. */
const TENTATIVO_MS = 25_000

export type StatoFoto = 'niente' | 'cerco' | 'ricevo' | 'fallito' | 'fatto'

export interface FotoCondivise {
  stato: StatoFoto
  ricevute: number
  /** Serve un polling stretto: si aspetta un messaggio del canale. */
  fretta: boolean
  riprova: () => void
}

/**
 * Le foto di un set proprio, fra i due telefoni della partita. Chi non le ha
 * apre il canale e le chiede; chi le ha risponde a ogni offerta nuova. Gira
 * finché la partita e' aperta, anche finita: la rivincita riusa le stesse foto.
 */
export function useFotoCondivise(vista: VistaIndovina | null, immagini: Immagini, ricarica: () => void): FotoCondivise {
  const [stato, setStato] = useState<StatoFoto>('niente')
  const [ricevute, setRicevute] = useState(0)
  const [tentativo, setTentativo] = useState(0)
  const ricezione = useRef<{ n: number; r: Ricezione; timer: ReturnType<typeof setTimeout>; risposta: boolean } | null>(null)
  const invio = useRef<Invio | null>(null)
  /** Un tentativo e' partito: resta vero anche mentre si raccolgono i candidati, prima che ci sia la ricezione. */
  const avviato = useRef(false)
  const risposteDate = useRef(new Set<number>())
  const ricaricaRef = useRef(ricarica)
  ricaricaRef.current = ricarica
  const aggiungiRef = useRef(immagini.aggiungi)
  aggiungiRef.current = immagini.aggiungi

  const id = vista?.id
  const io = vista?.io
  const attiva = vista !== null && vista.personaggi.set === 'mio' && (vista.stato === 'in_corso' || vista.stato === 'finita')
  const segnale = vista?.segnale
  const mancanti = immagini.mancanti
  const segnaleRef = useRef(segnale)
  segnaleRef.current = segnale

  // Chi non ha le foto: un tentativo alla volta, e dopo un fallimento solo a richiesta.
  useEffect(() => {
    if (!attiva || !id || !immagini.pronto || mancanti.length === 0) return
    if (avviato.current || stato === 'fallito') return
    avviato.current = true
    const s = segnaleRef.current
    const n = Math.max(s?.offerta?.n ?? 0, s?.risposta?.n ?? 0) + 1
    setStato('cerco')
    let chiuso = false
    riceviFoto({
      mancanti,
      onFoto: (hash, blob) => {
        aggiungiRef.current(hash, blob)
        setRicevute((x) => x + 1)
        setStato('ricevo')
      },
      onFine: (esito) => {
        chiuso = true
        if (ricezione.current) clearTimeout(ricezione.current.timer)
        ricezione.current = null
        avviato.current = false
        setStato(esito === 'fatto' ? 'fatto' : 'fallito')
      },
    })
      .then(async (r) => {
        if (chiuso) return
        ricezione.current = {
          n,
          r,
          risposta: false,
          timer: setTimeout(() => {
            r.chiudi()
            ricezione.current = null
            avviato.current = false
            setStato('fallito')
          }, TENTATIVO_MS),
        }
        await api(`/indovina/partite/${id}/segnale`, { method: 'POST', body: { tipo: 'offerta', sdp: r.offerta, n } })
        ricaricaRef.current()
      })
      .catch(() => {
        ricezione.current = null
        avviato.current = false
        setStato('fallito')
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attiva, id, immagini.pronto, mancanti.length > 0, tentativo, stato])

  // La risposta di chi ha le foto: il canale si apre.
  const rispostaN = segnale?.risposta?.n
  const rispostaDa = segnale?.risposta?.da
  useEffect(() => {
    const r = ricezione.current
    const risposta = segnaleRef.current?.risposta
    if (!r || r.risposta || !risposta || risposta.n !== r.n || risposta.da === io) return
    r.risposta = true
    void r.r.risposta(risposta.sdp).catch(() => setStato('fallito'))
  }, [rispostaN, rispostaDa, io])

  // Chi ha le foto: risponde a ogni offerta nuova dell'altro.
  const offertaN = segnale?.offerta?.n
  const offertaDa = segnale?.offerta?.da
  useEffect(() => {
    const s = segnaleRef.current
    const offerta = s?.offerta
    if (!attiva || !id || !offerta || offerta.da === io) return
    if (s?.risposta?.n === offerta.n || risposteDate.current.has(offerta.n)) return
    risposteDate.current.add(offerta.n)
    invio.current?.chiudi()
    mandaFoto({
      offerta: offerta.sdp,
      leggi: leggiImmagine,
      onFine: () => {
        invio.current = null
      },
    })
      .then(async (i) => {
        invio.current = i
        await api(`/indovina/partite/${id}/segnale`, {
          method: 'POST',
          body: { tipo: 'risposta', sdp: i.risposta, n: offerta.n },
        })
      })
      .catch(() => {})
  }, [attiva, id, io, offertaN, offertaDa])

  // Un'altra partita — la rivincita apre la sua allo stesso indirizzo — ricomincia da capo:
  // i tentativi sono contati per partita, e il numero 1 della nuova non e' quello della vecchia.
  useEffect(
    () => () => {
      if (ricezione.current) {
        clearTimeout(ricezione.current.timer)
        ricezione.current.r.chiudi()
        ricezione.current = null
      }
      invio.current?.chiudi()
      invio.current = null
      avviato.current = false
      risposteDate.current.clear()
      setStato('niente')
      setRicevute(0)
    },
    [id],
  )

  const riprova = useCallback(() => {
    setStato('niente')
    setTentativo((t) => t + 1)
  }, [])

  const offertaPerMe = !!segnale?.offerta && segnale.offerta.da !== io && segnale.risposta?.n !== segnale.offerta.n
  return {
    stato: attiva && mancanti.length === 0 && stato !== 'fatto' ? 'niente' : stato,
    ricevute,
    fretta: attiva && (stato === 'cerco' || offertaPerMe),
    riprova,
  }
}

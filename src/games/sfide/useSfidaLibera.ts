import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { ApiFetchError, api } from '@/lib/api'
import {
  SFIDE_LIBERE_AVANZA_MS,
  SFIDE_LIBERE_POLL_FINE_MS,
  SFIDE_LIBERE_POLL_MS,
  SFIDE_LIBERE_POLL_VIA_MS,
} from '@shared/config'
import type { AvanzamentoSfida } from '@shared/sfide-libere'
import type { VistaSfidaLibera } from '@shared/types'

export interface SfidaLibera {
  vista: VistaSfidaLibera | null
  errore: string | null
  /** Il via, sull'orologio del telefono, durante il tre-due-uno. */
  via: number | null
  /**
   * La mia partita si gioca su questo telefono: dal via, detta al server, e
   * non ancora finita. Una pagina riaperta dopo il via non la gioca piu'.
   */
  inGioco: boolean
  /** Fin dove sono arrivato: va al server dopo una pausa, insieme ai passi che seguono. */
  avanza: (a: AvanzamentoSfida) => void
  /** Com'e' finita la mia partita: va subito. */
  finisci: (a: AvanzamentoSfida) => void
  occupato: boolean
  rivincita: () => void
}

/**
 * Le partenze chieste in questa pagina, per sfida: in sviluppo React monta due
 * volte, e la seconda partenza chiuderebbe la partita appena cominciata. Dopo
 * un attimo l'id se ne va, cosi' una pagina lasciata e ritrovata conta come
 * riaperta.
 */
const partenze = new Map<string, Promise<VistaSfidaLibera>>()
const DOPPIO_MONTAGGIO_MS = 2_000

/**
 * Una sfida con un amico a una delle libere da soli. Prima del via la vista
 * dice quanto manca; dal via il telefono dice al server che parte, e la
 * pagina gioca la partita del seme con il motore della libera, mandando
 * mentre gioca fin dove e' arrivato. Intanto il giro di controllo porta
 * l'altro, e la sfida finita. Quando la rivincita diventa una partita, ci si
 * va tutti e due.
 */
export function useSfidaLibera(id: string): SfidaLibera {
  const { vai } = useNavigazione()
  const [vista, setVista] = useState<VistaSfidaLibera | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [via, setVia] = useState<number | null>(null)
  const [inGioco, setInGioco] = useState(false)
  const [occupato, setOccupato] = useState(false)
  const giro = useRef<number | null>(null)
  /** L'ultimo avanzamento non ancora mandato, e il timer che lo manda. */
  const inAttesa = useRef<AvanzamentoSfida | null>(null)
  const timer = useRef<number | null>(null)
  const finito = useRef(false)

  const applica = useCallback(
    (v: VistaSfidaLibera) => {
      setVista(v)
      setErrore(null)
      setVia(v.inizioTraMs !== null ? Date.now() + v.inizioTraMs : null)
      if (v.mie.finito || v.stato !== 'in_corso') setInGioco(false)
      // La rivincita accettata: si va alla partita nuova, tutti e due.
      if (v.rivincita?.stato === 'in_corso') vai(ROTTE.sfidaLibera(v.gioco, v.rivincita.id), { replace: true })
    },
    [vai],
  )

  const leggi = useCallback(() => {
    api<VistaSfidaLibera>(`/sfide/partita/${id}`)
      .then(applica)
      .catch((e) => setErrore(e instanceof ApiFetchError ? e.message : 'Non riesco a leggere la sfida.'))
  }, [applica, id])

  useEffect(() => {
    leggi()
  }, [leggi])

  // Il giro: al via in punto, poi ogni pochi secondi mentre si gioca, piu' largo a sfida finita.
  useEffect(() => {
    if (!vista) return
    // Con una rivincita chiesta la risposta arriva presto, e ci si va tutti e due insieme.
    const rivincita = vista.rivincita?.stato === 'invito'
    const ritmo =
      vista.stato === 'in_corso'
        ? vista.inizioTraMs !== null
          ? Math.max(50, vista.inizioTraMs + 50)
          : SFIDE_LIBERE_POLL_MS
        : rivincita
          ? SFIDE_LIBERE_POLL_VIA_MS * 1.5
          : SFIDE_LIBERE_POLL_FINE_MS
    const avanti = () => {
      if (document.visibilityState === 'visible') leggi()
      else giro.current = window.setTimeout(avanti, ritmo)
    }
    giro.current = window.setTimeout(avanti, ritmo)
    return () => {
      if (giro.current) window.clearTimeout(giro.current)
    }
  }, [leggi, vista])

  // Dal via, la partenza: una volta per pagina. Se il server dice che la pagina e' riaperta, la partita e' chiusa.
  const cominciata = vista !== null && vista.stato === 'in_corso' && vista.inizioTraMs === null
  const gia = vista?.mie.finito ?? true
  useEffect(() => {
    if (!cominciata || gia) return
    let chiesta = partenze.get(id)
    if (!chiesta) {
      chiesta = api<VistaSfidaLibera>(`/sfide/partita/${id}/parti`, { method: 'POST' })
      partenze.set(id, chiesta)
      window.setTimeout(() => partenze.delete(id), DOPPIO_MONTAGGIO_MS)
    }
    let annullato = false
    chiesta
      .then((v) => {
        if (annullato) return
        applica(v)
        if (!v.riaperta && !v.mie.finito && v.stato === 'in_corso') setInGioco(true)
      })
      .catch((e) => {
        if (!annullato) setErrore(e instanceof ApiFetchError ? e.message : 'Non riesco a cominciare la sfida.')
      })
    return () => {
      annullato = true
    }
  }, [applica, cominciata, gia, id])

  const manda = useCallback(
    (a: AvanzamentoSfida, fine: boolean, tentativi = 2): void => {
      api<VistaSfidaLibera>(`/sfide/partita/${id}/avanza`, { method: 'POST', body: { ...a, fine } })
        .then(applica)
        .catch((e) => {
          // La fine non si perde per una rete che va e viene; un avanzamento si', ne arriva un altro.
          const rete = !(e instanceof ApiFetchError) || e.status === 0 || e.status >= 500
          if (fine && tentativi > 0 && rete) {
            window.setTimeout(() => manda(a, fine, tentativi - 1), 1_500)
          } else leggi()
        })
    },
    [applica, id, leggi],
  )

  const avanza = useCallback(
    (a: AvanzamentoSfida) => {
      if (finito.current) return
      inAttesa.current = a
      if (timer.current !== null) return
      timer.current = window.setTimeout(() => {
        timer.current = null
        const ultimo = inAttesa.current
        inAttesa.current = null
        if (ultimo && !finito.current) manda(ultimo, false)
      }, SFIDE_LIBERE_AVANZA_MS)
    },
    [manda],
  )

  const finisci = useCallback(
    (a: AvanzamentoSfida) => {
      if (finito.current) return
      finito.current = true
      if (timer.current !== null) window.clearTimeout(timer.current)
      timer.current = null
      inAttesa.current = null
      setInGioco(false)
      // Subito anche nella vista, senza aspettare la risposta: la fine si vede adesso.
      setVista((v) => (v ? { ...v, mie: { ...v.mie, ...a, finito: true } } : v))
      manda(a, true)
    },
    [manda],
  )

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
    },
    [],
  )

  const rivincita = useCallback(() => {
    setOccupato(true)
    api<{ partitaId?: string; invitoId?: string }>(`/sfide/partita/${id}/rivincita`, { method: 'POST' })
      .then((r) => {
        if (r.partitaId && vista) vai(ROTTE.sfidaLibera(vista.gioco, r.partitaId), { replace: true })
        else leggi()
      })
      .catch((e) => setErrore(e instanceof ApiFetchError ? e.message : 'Non riesco a chiedere la rivincita.'))
      .finally(() => setOccupato(false))
  }, [id, leggi, vai, vista])

  return { vista, errore, via, inGioco, avanza, finisci, occupato, rivincita }
}

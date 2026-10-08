import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { ApiFetchError, api } from '@/lib/api'
import { SEQUENZE_SFIDA_POLL_FINE_MS, SEQUENZE_SFIDA_POLL_MS } from '@shared/config'
import type { MossaSfidaSequenze, VistaSfidaSequenze } from '@shared/types'
import { DOPO_LA_RISPOSTA_MS, type SequenzaAperta } from './useSequenzeDelGiorno'

export interface SfidaSequenze {
  vista: VistaSfidaSequenze | null
  errore: string | null
  /** Il via, sull'orologio del telefono. */
  via: number | null
  aperta: SequenzaAperta | null
  occupato: boolean
  rispondi: (tocchi: number[]) => void
  rivincita: () => void
}

/**
 * Una sfida a Sequenze con un amico. Dal via ognuno ripete le stesse
 * sequenze: la prima la chiede il telefono da solo, le altre arrivano con la
 * risposta alla precedente. Intanto il giro di controllo dice fin dove e'
 * arrivato l'altro, e quando la sfida si chiude. Quando la rivincita diventa
 * una partita, ci si va tutti e due.
 */
export function useSfidaSequenze(id: string): SfidaSequenze {
  const { vai } = useNavigazione()
  const [vista, setVista] = useState<VistaSfidaSequenze | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [via, setVia] = useState<number | null>(null)
  const [aperta, setAperta] = useState<SequenzaAperta | null>(null)
  const [occupato, setOccupato] = useState(false)
  const vistaRef = useRef(vista)
  const occupatoRef = useRef(false)
  const chiesta = useRef(false)
  /** Le mie giuste come le ha dette l'ultima mossa: un giro di controllo partito prima puo' arrivare dopo. */
  const mieGiuste = useRef(0)
  const chiave = useRef(0)
  const giro = useRef<number | null>(null)
  const timer = useRef<number | null>(null)

  const applica = useCallback(
    (v: VistaSfidaSequenze) => {
      vistaRef.current = v
      setVista(v)
      setErrore(null)
      setVia(v.inizioTraMs !== null ? Date.now() + v.inizioTraMs : null)
      if (v.stato === 'finita') setAperta(null)
      // La rivincita accettata: si va alla partita nuova, tutti e due.
      if (v.rivincita?.stato === 'in_corso') vai(ROTTE.sfidaSequenze(v.rivincita.id), { replace: true })
    },
    [vai],
  )

  const leggi = useCallback(() => {
    api<VistaSfidaSequenze>(`/sequenze/sfide/${id}`)
      .then((v) =>
        applica(
          v.mie.giuste < mieGiuste.current && v.stato === 'in_corso'
            ? { ...v, mie: { ...v.mie, giuste: mieGiuste.current } }
            : v,
        ),
      )
      .catch((e) => setErrore(e instanceof ApiFetchError ? e.message : 'Non riesco a leggere la sfida.'))
  }, [applica, id])

  useEffect(() => {
    leggi()
  }, [leggi])

  // Il giro: al via in punto, poi stretto mentre si gioca, piu' largo a sfida finita.
  useEffect(() => {
    if (!vista) return
    const ritmo =
      vista.stato === 'in_corso'
        ? vista.inizioTraMs !== null
          ? Math.max(50, vista.inizioTraMs + 50)
          : SEQUENZE_SFIDA_POLL_MS
        : SEQUENZE_SFIDA_POLL_FINE_MS
    giro.current = window.setTimeout(leggi, ritmo)
    return () => {
      if (giro.current) window.clearTimeout(giro.current)
    }
  }, [leggi, vista])

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current)
    },
    [],
  )

  const dopoLaMossa = useCallback(
    (m: MossaSfidaSequenze) => {
      mieGiuste.current = m.mie.giuste
      applica(m)
      occupatoRef.current = false
      setOccupato(false)
      if (m.sequenza) {
        chiave.current += 1
        setAperta({ sequenza: m.sequenza, chiave: chiave.current })
      } else setAperta(null)
    },
    [applica],
  )

  // Dal via, la prima sequenza: una volta sola. Se era gia' uscita — la pagina si e' riaperta — il server la
  // conta sbagliata.
  useEffect(() => {
    const v = vista
    if (!v || v.stato !== 'in_corso' || v.inizioTraMs !== null || v.mie.finito || chiesta.current) return
    chiesta.current = true
    mieGiuste.current = v.mie.giuste
    occupatoRef.current = true
    setOccupato(true)
    api<MossaSfidaSequenze>(`/sequenze/sfide/${id}/apri`, { method: 'POST', body: { livello: v.mie.giuste } })
      .then(dopoLaMossa)
      .catch((e) => {
        occupatoRef.current = false
        setOccupato(false)
        setErrore(e instanceof ApiFetchError ? e.message : 'Non riesco ad aprire la sequenza.')
        leggi()
      })
  }, [dopoLaMossa, id, leggi, vista])

  const rispondi = useCallback(
    (tocchi: number[]) => {
      const v = vistaRef.current
      if (!v || occupatoRef.current) return
      occupatoRef.current = true
      setOccupato(true)
      const visto = new Promise<void>((fatto) => {
        timer.current = window.setTimeout(fatto, DOPO_LA_RISPOSTA_MS)
      })
      const risposta = api<MossaSfidaSequenze>(`/sequenze/sfide/${id}/risposta`, {
        method: 'POST',
        body: { livello: mieGiuste.current, tocchi },
      })
      Promise.all([risposta, visto])
        .then(([m]) => dopoLaMossa(m))
        .catch(() => {
          // La risposta si e' persa: la sequenza era uscita, e chiederla di nuovo la conta sbagliata.
          occupatoRef.current = false
          setOccupato(false)
          setAperta(null)
          chiesta.current = false
          leggi()
        })
    },
    [dopoLaMossa, id, leggi],
  )

  const rivincita = useCallback(() => {
    setOccupato(true)
    api<{ partitaId?: string; invitoId?: string }>(`/sequenze/sfide/${id}/rivincita`, { method: 'POST' })
      .then((r) => {
        if (r.partitaId) vai(ROTTE.sfidaSequenze(r.partitaId), { replace: true })
        else leggi()
      })
      .catch((e) => setErrore(e instanceof ApiFetchError ? e.message : 'Non riesco a chiedere la rivincita.'))
      .finally(() => setOccupato(false))
  }, [id, leggi, vai])

  return { vista, errore, via, aperta, occupato, rispondi, rivincita }
}

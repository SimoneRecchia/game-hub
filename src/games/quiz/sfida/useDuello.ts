/**
 * Il duello a quiz come lo vede la schermata: la domanda aperta, il tempo mio
 * e dell'altro, com'e' andata ogni domanda, la rivincita.
 *
 * Tutto viene dal server, a polling (vedi le cadenze in shared/config.ts): la
 * domanda aperta, e fino a quando puo' rispondere ciascuno. L'orologio del
 * telefono si tiene sull'ora del server — dalla risposta con il giro piu'
 * corto — perché la domanda si apre a un'ora che i due telefoni conoscono, e
 * i due orologi devono segnare lo stesso tempo.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { SFIDA_POLL_ATTESA_MS, SFIDA_POLL_DOMANDA_MS, SFIDA_POLL_FINE_MS } from '@shared/config'
import { PAUSA_SFIDA_MS } from '@shared/quiz-sfida'
import type { GiroQuizVisto, VistaDuello } from '@shared/types'
import { ApiFetchError, api } from '@/lib/api'
import { domandePerSfida } from './domande'

/**
 * In che punto e' il duello: si aspetta l'altro, il tre-due-uno, una domanda
 * aperta, la pausa con la risposta, la fine, o l'uscita di uno dei due.
 */
export type FaseDuello = 'caricamento' | 'attesa' | 'via' | 'domanda' | 'pausa' | 'fine' | 'uscito' | 'errore'

export interface Duello {
  fase: FaseDuello
  vista: VistaDuello | null
  /** Le domande chiuse, tutte, con com'e' andata. */
  giri: GiroQuizVisto[]
  /** L'ora del server adesso, per i conti dell'orologio. */
  oraServer: () => number
  /** Da un istante del server a uno di `Date.now()`. */
  inLocale: (t: number) => number
  inviando: boolean
  /** La scelta partita e non ancora tornata: si vede subito. */
  sceltaInViaggio: string | null
  errore: string | null
  pronto: () => void
  rispondi: (scelta: string) => void
  esci: () => Promise<void>
  chiediRivincita: () => Promise<string | null>
  accettaRivincita: () => Promise<string | null>
  rifiutaRivincita: () => Promise<void>
}

export function useDuello(id: string): Duello {
  const [vista, setVista] = useState<VistaDuello | null>(null)
  const [giri, setGiri] = useState<GiroQuizVisto[]>([])
  const [errore, setErrore] = useState<string | null>(null)
  const [inviando, setInviando] = useState(false)
  const [sceltaInViaggio, setSceltaInViaggio] = useState<string | null>(null)
  const [, ridisegna] = useState(0)
  const scarto = useRef(0)
  const giroMigliore = useRef(Infinity)
  const quanti = useRef(0)
  const vivo = useRef(true)
  const inCorso = useRef(false)

  useEffect(() => {
    vivo.current = true
    return () => {
      vivo.current = false
    }
  }, [])

  // Un duello nuovo (la rivincita) riparte da zero.
  useEffect(() => {
    setVista(null)
    setGiri([])
    quanti.current = 0
  }, [id])

  const oraServer = useCallback(() => Date.now() + scarto.current, [])
  const inLocale = useCallback((t: number) => t - scarto.current, [])

  const applica = useCallback((v: VistaDuello, t0: number, t1: number) => {
    if (!vivo.current) return
    // L'ora del server e' a meta' del giro; si tiene quella del giro piu' corto, che sbaglia meno.
    const giro = t1 - t0
    if (giro <= giroMigliore.current + 40) {
      giroMigliore.current = Math.min(giroMigliore.current, giro)
      scarto.current = v.adesso - (t0 + t1) / 2
    }
    setGiri((prima) => {
      if (v.giri.length === 0) return prima
      const perIndice = new Map(prima.map((g) => [g.indice, g]))
      for (const g of v.giri) perIndice.set(g.indice, g)
      const tutti = [...perIndice.values()].sort((a, b) => a.indice - b.indice)
      quanti.current = tutti.length
      return tutti
    })
    setVista(v)
    setErrore(null)
  }, [])

  const chiama = useCallback(
    async (percorso: string, metodo: 'GET' | 'POST' = 'GET', corpo?: unknown) => {
      const t0 = Date.now()
      const giriNoti = quanti.current
      const v = await api<VistaDuello>(`/quiz/duelli/${id}${percorso}?giri=${giriNoti}`, {
        method: metodo,
        ...(corpo === undefined ? {} : { body: corpo }),
      })
      applica(v, t0, Date.now())
      return v
    },
    [id, applica],
  )

  const carica = useCallback(async () => {
    if (inCorso.current) return
    inCorso.current = true
    try {
      await chiama('')
    } catch (e) {
      if (vivo.current) setErrore(e instanceof ApiFetchError ? e.message : 'La sfida non risponde: riprovo.')
    } finally {
      inCorso.current = false
    }
  }, [chiama])

  useEffect(() => {
    void carica()
  }, [carica])

  // Il giro di controllo, con il ritmo della fase. Nella pausa una richiesta sola, quando si apre la prossima.
  useEffect(() => {
    if (!vista) {
      const t = setTimeout(() => void carica(), SFIDA_POLL_ATTESA_MS * 2)
      return () => clearTimeout(t)
    }
    let ms: number | null = null
    if (vista.stato === 'attesa') ms = SFIDA_POLL_ATTESA_MS
    else if (vista.stato === 'in_corso') {
      if (vista.domanda) ms = SFIDA_POLL_DOMANDA_MS
      else if (vista.prossimaAt !== null) ms = Math.min(5_000, Math.max(80, vista.prossimaAt - oraServer() + 60))
      else ms = SFIDA_POLL_DOMANDA_MS
    } else if (vista.stato === 'finito') {
      ms = vista.rivincita?.stato === 'attesa' ? SFIDA_POLL_ATTESA_MS : SFIDA_POLL_FINE_MS
    }
    if (ms === null) return
    const t = setTimeout(() => {
      if (document.visibilityState === 'visible') void carica()
      else ridisegna((n) => n + 1)
    }, ms)
    return () => clearTimeout(t)
  }, [vista, carica, oraServer])

  // Tornando sull'app, subito: nel frattempo la domanda puo' essere cambiata.
  useEffect(() => {
    const visibile = () => document.visibilityState === 'visible' && void carica()
    document.addEventListener('visibilitychange', visibile)
    return () => document.removeEventListener('visibilitychange', visibile)
  }, [carica])

  // A fine duello la risposta dell'ultima domanda resta in vista per la pausa, poi la fine.
  const ultimo = giri[giri.length - 1]
  const inPausaFinale = vista?.stato === 'finito' && ultimo && oraServer() < ultimo.chiusaAt + PAUSA_SFIDA_MS
  useEffect(() => {
    if (!inPausaFinale || !ultimo) return
    const t = setTimeout(() => ridisegna((n) => n + 1), Math.max(0, ultimo.chiusaAt + PAUSA_SFIDA_MS - oraServer()) + 30)
    return () => clearTimeout(t)
  }, [inPausaFinale, ultimo, oraServer])

  // Il tre-due-uno e la pausa finiscono a un'ora nota: allora si ridisegna, anche prima che arrivi la risposta.
  useEffect(() => {
    if (!vista?.prossimaAt) return
    const t = setTimeout(() => ridisegna((n) => n + 1), Math.max(0, vista.prossimaAt - oraServer()) + 20)
    return () => clearTimeout(t)
  }, [vista?.prossimaAt, oraServer])

  let fase: FaseDuello = 'caricamento'
  if (!vista) fase = errore ? 'errore' : 'caricamento'
  else if (vista.stato === 'abbandonato') fase = 'uscito'
  else if (vista.stato === 'attesa') fase = 'attesa'
  else if (vista.stato === 'finito') fase = inPausaFinale ? 'pausa' : 'fine'
  else if (vista.domanda) fase = 'domanda'
  else if (giri.length === 0) fase = 'via'
  else fase = 'pausa'

  const pronto = useCallback(() => {
    void chiama('/pronto', 'POST').catch((e) => {
      if (vivo.current) setErrore(e instanceof ApiFetchError ? e.message : 'Non riesco a entrare nella sfida.')
    })
  }, [chiama])

  const rispondi = useCallback(
    (scelta: string) => {
      const d = vista?.domanda
      if (!d || inviando || d.mia) return
      setInviando(true)
      setSceltaInViaggio(scelta)
      void chiama('/risposta', 'POST', { indice: d.indice, scelta })
        .catch(async (e) => {
          // Troppo tardi, o l'altro ha risposto prima: si rilegge com'e' andata.
          if (e instanceof ApiFetchError && e.status === 409) await carica()
          else if (vivo.current) setErrore(e instanceof ApiFetchError ? e.message : 'La risposta non è partita.')
        })
        .finally(() => {
          if (!vivo.current) return
          setInviando(false)
          setSceltaInViaggio(null)
        })
    },
    [vista?.domanda, inviando, chiama, carica],
  )

  const esci = useCallback(async () => {
    await chiama('/esci', 'POST').catch(() => {})
  }, [chiama])

  /** Gioca ancora: domande nuove con le stesse scelte. Se l'altro l'aveva gia' chiesta, torna il duello nuovo. */
  const chiediRivincita = useCallback(async (): Promise<string | null> => {
    if (!vista) return null
    const domande = await domandePerSfida(vista.impostazioni)
    const r = await api<{ sfidaId?: string; duelloId?: string }>(`/quiz/duelli/${id}/rivincita`, {
      method: 'POST',
      body: { domande },
    })
    await carica()
    return r.duelloId ?? null
  }, [vista, id, carica])

  const accettaRivincita = useCallback(async (): Promise<string | null> => {
    const r = vista?.rivincita
    if (!r || r.da !== 'avversario') return null
    const { duelloId } = await api<{ duelloId: string }>(`/quiz/sfide/${r.id}/accetta`, { method: 'POST' })
    return duelloId
  }, [vista?.rivincita])

  const rifiutaRivincita = useCallback(async () => {
    const r = vista?.rivincita
    if (!r || r.da !== 'avversario') return
    await api(`/quiz/sfide/${r.id}/rifiuta`, { method: 'POST' }).catch(() => {})
    await carica()
  }, [vista?.rivincita, carica])

  return {
    fase,
    vista,
    giri,
    oraServer,
    inLocale,
    inviando,
    sceltaInViaggio,
    errore,
    pronto,
    rispondi,
    esci,
    chiediRivincita,
    accettaRivincita,
    rifiutaRivincita,
  }
}

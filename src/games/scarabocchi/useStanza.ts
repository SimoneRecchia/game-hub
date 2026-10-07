import { useCallback, useEffect, useRef, useState } from 'react'
import { useToast } from '@/components/Toast'
import { ApiFetchError, api } from '@/lib/api'
import {
  PEZZI_MASSIMI,
  SCARABOCCHI_POLL_ATTESA_MS,
  SCARABOCCHI_POLL_GIOCO_MS,
  SCARABOCCHI_POLL_TELEFONO_MS,
  decodificaOps,
  type ImpostazioniScarabocchi,
  type MessaggioScarabocchi,
  type ModoScarabocchi,
  type OpTratto,
  type StatoStanzaScarabocchi,
  type VistaStanzaScarabocchi,
} from '@shared/scarabocchi'
import type { GiocatoreBreve } from '@shared/types'

/** Quel che si sa di una stanza prima di entrarci. */
export interface InfoStanzaScarabocchi {
  codice: string
  stato: StatoStanzaScarabocchi
  iscritti: number
  modo: ModoScarabocchi
  conduttore: GiocatoreBreve
}

export type StanzaVista =
  | { tipo: 'carico' }
  | { tipo: 'dentro'; vista: VistaStanzaScarabocchi }
  | { tipo: 'fuori'; info: InfoStanzaScarabocchi | null; motivo: 'mai' | 'uscito' }
  | { tipo: 'assente' }

/** Il disegno che si guarda: le mosse arrivate a pezzi, e quanti pezzi. */
export interface DisegnoInVista {
  numero: number
  foglio: string
  pezzi: number
  ops: OpTratto[]
}

/**
 * La stanza di Scarabocchi, come la vede chi la apre.
 *
 * Non ci sono connessioni aperte: la stanza si rilegge ogni pochi secondi —
 * piu' spesso mentre si disegna e si indovina — e la lettura porta insieme i
 * pezzi nuovi del disegno del turno e le risposte nuove, che qui si
 * accumulano. Chi disegna non si fa rimandare i suoi tratti: li ha gia'.
 * Ogni azione risponde con la stanza nuova; una lettura arrivata dopo
 * un'azione non torna indietro, perché la stanza ha una versione.
 */
export function useStanzaScarabocchi(codice: string) {
  const toast = useToast()
  const [stanza, setStanza] = useState<StanzaVista>({ tipo: 'carico' })
  const [scarto, setScarto] = useState(0)
  const [occupato, setOccupato] = useState<string | null>(null)
  const [disegno, setDisegno] = useState<DisegnoInVista | null>(null)
  const [messaggi, setMessaggi] = useState<MessaggioScarabocchi[]>([])
  const versione = useRef(-1)
  const eraDentro = useRef(false)
  const inCorso = useRef(false)
  const disegnoRef = useRef(disegno)
  disegnoRef.current = disegno
  const messaggiRef = useRef(messaggi)
  messaggiRef.current = messaggi
  const vistaRef = useRef<VistaStanzaScarabocchi | null>(null)
  /** Il turno di cui si tengono le risposte: un turno nuovo le ricomincia. */
  const turnoMessaggi = useRef<string>('')

  const accetta = useCallback((v: VistaStanzaScarabocchi) => {
    if (v.versione < versione.current) return
    versione.current = v.versione
    eraDentro.current = true
    vistaRef.current = v
    setScarto(v.adesso - Date.now())
    setStanza({ tipo: 'dentro', vista: v })

    const p = v.partita
    const turno = p?.modo === 'indovina' ? `${v.numero}:${p.turno}` : ''
    if (turno !== turnoMessaggi.current) {
      turnoMessaggi.current = turno
      messaggiRef.current = []
    }
    if (v.messaggi.length > 0) {
      const visti = new Set(messaggiRef.current.map((m) => m.id))
      const nuovi = v.messaggi.filter((m) => !visti.has(m.id))
      // Una risposta gia' vista puo' tornare diversa: a turno chiuso le giuste si vedono.
      const aggiornati = messaggiRef.current.map((m) => v.messaggi.find((x) => x.id === m.id) ?? m)
      messaggiRef.current = [...aggiornati, ...nuovi].slice(-120)
    }
    setMessaggi(messaggiRef.current)

    const t = v.tratti
    if (t) {
      const prima = disegnoRef.current
      const stesso = prima && prima.foglio === t.foglio && prima.numero === v.numero
      if (stesso && t.da === prima.pezzi) {
        if (t.pezzi.length > 0) {
          const ops = [...prima.ops, ...decodificaOps(t.pezzi.join('~'))]
          disegnoRef.current = { ...prima, pezzi: prima.pezzi + t.pezzi.length, ops }
          setDisegno(disegnoRef.current)
        }
      } else if (t.da === 0) {
        const ops = decodificaOps(t.pezzi.join('~'))
        disegnoRef.current = { numero: v.numero, foglio: t.foglio, pezzi: t.pezzi.length, ops }
        setDisegno(disegnoRef.current)
      }
    }
  }, [])

  const fuori = useCallback(async () => {
    const info = await api<InfoStanzaScarabocchi>(`/scarabocchi/stanze/${codice}/info`).catch(() => null)
    versione.current = -1
    setStanza(info ? { tipo: 'fuori', info, motivo: eraDentro.current ? 'uscito' : 'mai' } : { tipo: 'assente' })
  }, [codice])

  const sbagliato = useCallback(
    async (e: unknown) => {
      if (e instanceof ApiFetchError && e.code === 'NON_ISCRITTO') return fuori()
      if (e instanceof ApiFetchError && e.code === 'STANZA_ASSENTE') return setStanza({ tipo: 'assente' })
      throw e
    },
    [fuori],
  )

  /** Che cosa chiedere con la stanza: i pezzi dal primo che manca, e le risposte dopo l'ultima. */
  const domanda = useCallback(() => {
    const v = vistaRef.current
    const p = v?.partita
    const q = new URLSearchParams()
    if (p?.modo === 'indovina') {
      const io = v!.io
      const d = disegnoRef.current
      // Chi disegna i suoi tratti li ha: non se li fa rimandare.
      const disegnoIo = p.fase === 'disegno' && p.disegnatore === io
      q.set('foglio', p.foglio)
      const avuti = d && d.foglio === p.foglio && d.numero === v!.numero ? d.pezzi : 0
      q.set('da', String(disegnoIo ? PEZZI_MASSIMI : avuti))
      const ultimo = messaggiRef.current.at(-1)?.id
      if (ultimo) q.set('dopo', String(ultimo))
    }
    const s = q.toString()
    return s ? `?${s}` : ''
  }, [])

  const leggi = useCallback(async () => {
    if (inCorso.current || document.visibilityState !== 'visible') return
    inCorso.current = true
    try {
      accetta(await api<VistaStanzaScarabocchi>(`/scarabocchi/stanze/${codice}${domanda()}`))
    } catch (e) {
      await sbagliato(e).catch(() => {})
    } finally {
      inCorso.current = false
    }
  }, [accetta, codice, domanda, sbagliato])

  useEffect(() => {
    void leggi()
  }, [leggi])

  const vista = stanza.tipo === 'dentro' ? stanza.vista : null
  const p = vista?.partita ?? null
  const ritmo = !vista
    ? null
    : vista.stato !== 'partita' || !p
      ? SCARABOCCHI_POLL_ATTESA_MS
      : p.modo === 'indovina'
        ? SCARABOCCHI_POLL_GIOCO_MS
        : SCARABOCCHI_POLL_TELEFONO_MS
  useEffect(() => {
    if (ritmo === null) return
    const giro = () => {
      if (document.visibilityState === 'visible') void leggi()
    }
    const t = window.setInterval(giro, ritmo)
    document.addEventListener('visibilitychange', giro)
    return () => {
      window.clearInterval(t)
      document.removeEventListener('visibilitychange', giro)
    }
  }, [ritmo, leggi])

  // Una scadenza che arriva prima del giro dopo: la stanza si rilegge appena passata.
  const fine = p && vista?.stato === 'partita' ? p.fine : null
  useEffect(() => {
    if (fine === null) return
    const tra = fine - (Date.now() + scarto) + 250
    if (tra <= 0 || tra > 10 * 60_000) return
    const t = window.setTimeout(() => void leggi(), tra)
    return () => window.clearTimeout(t)
  }, [fine, scarto, leggi])

  const manda = useCallback(
    async (chi: string, percorso: string, body?: unknown, conDomanda = false): Promise<boolean> => {
      setOccupato(chi)
      try {
        accetta(
          await api<VistaStanzaScarabocchi>(
            `/scarabocchi/stanze/${codice}/${percorso}${conDomanda ? domanda() : ''}`,
            { method: 'POST', body },
          ),
        )
        return true
      } catch (e) {
        await sbagliato(e).catch((errore: unknown) => {
          toast.show(errore instanceof ApiFetchError ? errore.message : 'Non è arrivato: riprova.', 'error')
          void leggi()
        })
        return false
      } finally {
        setOccupato(null)
      }
    },
    [accetta, codice, domanda, leggi, sbagliato, toast],
  )

  const entra = useCallback(() => manda('entra', 'entra'), [manda])
  const via = useCallback(() => manda('via', 'via'), [manda])
  const ancora = useCallback(() => manda('ancora', 'ancora'), [manda])
  const impostazioni = useCallback(
    (i: Partial<ImpostazioniScarabocchi>) => manda('impostazioni', 'impostazioni', { impostazioni: i }),
    [manda],
  )
  const espelli = useCallback((playerId: string) => manda(`espelli:${playerId}`, 'espelli', { playerId }), [manda])
  const scegli = useCallback((indice: number) => manda('scegli', 'scegli', { indice }), [manda])
  const tentativo = useCallback((testo: string) => manda('tentativo', 'tentativo', { testo }, true), [manda])
  const foglio = useCallback(
    (corpo: { numero: number; catena: number; passo: number; testo?: string; consegna?: boolean }) =>
      manda(corpo.consegna ? 'consegna' : 'bozza', 'foglio', corpo),
    [manda],
  )

  const invita = useCallback(
    async (playerId: string): Promise<boolean> => {
      setOccupato(`invita:${playerId}`)
      try {
        await api(`/scarabocchi/stanze/${codice}/invita`, { method: 'POST', body: { playerId } })
        return true
      } catch (e) {
        toast.show(e instanceof ApiFetchError ? e.message : 'Invito non mandato.', 'error')
        return false
      } finally {
        setOccupato(null)
      }
    },
    [codice, toast],
  )

  const esci = useCallback(async (): Promise<boolean> => {
    setOccupato('esci')
    try {
      await api(`/scarabocchi/stanze/${codice}/esci`, { method: 'POST' })
      return true
    } catch (e) {
      toast.show(e instanceof ApiFetchError ? e.message : 'Non riesco a uscire: riprova.', 'error')
      return false
    } finally {
      setOccupato(null)
    }
  }, [codice, toast])

  return {
    stanza,
    vista,
    scarto,
    occupato,
    disegno,
    messaggi,
    leggi,
    entra,
    via,
    ancora,
    impostazioni,
    espelli,
    scegli,
    tentativo,
    foglio,
    invita,
    esci,
  }
}

/** Un foglio intero: per riprendere il proprio disegno, per descriverne uno, per l'album. */
export async function foglioIntero(codice: string, foglio: string): Promise<{ ops: OpTratto[]; pezzi: number }> {
  const r = await api<{ foglio: string; pezzi: string[] }>(`/scarabocchi/stanze/${codice}/fogli/${foglio}`)
  return { ops: decodificaOps(r.pezzi.join('~')), pezzi: r.pezzi.length }
}

/** L'ora del server, con lo scarto del telefono: per gli orologi. */
export function useOrologio(scarto: number, attivo: boolean, passo = 250): number {
  const [adesso, setAdesso] = useState(() => Date.now() + scarto)
  useEffect(() => {
    setAdesso(Date.now() + scarto)
    if (!attivo) return
    const t = window.setInterval(() => setAdesso(Date.now() + scarto), passo)
    return () => window.clearInterval(t)
  }, [scarto, attivo, passo])
  return adesso
}

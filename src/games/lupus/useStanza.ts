import { useCallback, useEffect, useRef, useState } from 'react'
import { useToast } from '@/components/Toast'
import { ApiFetchError, api } from '@/lib/api'
import {
  LUPUS_POLL_ATTESA_MS,
  LUPUS_POLL_MS,
  type AzioneLupusDalTelefono,
  type ImpostazioniStanzaLupus,
  type StatoStanzaLupus,
  type VistaStanzaLupus,
} from '@shared/lupus-stanza'
import type { GiocatoreBreve } from '@shared/types'

/** Quel che si sa di una stanza prima di entrarci. */
export interface InfoStanza {
  codice: string
  stato: StatoStanzaLupus
  iscritti: number
  conduttore: GiocatoreBreve
}

export type StanzaVista =
  | { tipo: 'carico' }
  | { tipo: 'dentro'; vista: VistaStanzaLupus }
  /** Fuori: mai entrati (`mai`), o usciti e mandati via mentre la si guardava (`uscito`). */
  | { tipo: 'fuori'; info: InfoStanza | null; motivo: 'mai' | 'uscito' }
  | { tipo: 'assente' }

/**
 * La stanza online di Lupus, come la vede chi la apre.
 *
 * Non ci sono connessioni aperte: la stanza si rilegge ogni `LUPUS_POLL_MS`
 * durante la partita e ogni `LUPUS_POLL_ATTESA_MS` prima e dopo, e a pagina
 * nascosta il giro si ferma. Ogni azione risponde con la stanza nuova, che
 * sostituisce quella di prima; una lettura partita prima di un'azione e
 * arrivata dopo non torna indietro, perché la stanza ha una versione che sale
 * a ogni scrittura (`versione`). L'ora del server arriva con la stanza
 * (`adesso`), e `scarto` e' quanto l'orologio del telefono e' indietro.
 */
export function useStanzaLupus(codice: string) {
  const toast = useToast()
  const [stanza, setStanza] = useState<StanzaVista>({ tipo: 'carico' })
  const [scarto, setScarto] = useState(0)
  const [occupato, setOccupato] = useState<string | null>(null)
  const versione = useRef(-1)
  const eraDentro = useRef(false)
  const inCorso = useRef(false)

  const accetta = useCallback((v: VistaStanzaLupus) => {
    if (v.versione < versione.current) return
    versione.current = v.versione
    eraDentro.current = true
    setScarto(v.adesso - Date.now())
    setStanza({ tipo: 'dentro', vista: v })
  }, [])

  /** Fuori dalla stanza: si legge chi la conduce e quanti sono, per entrare. */
  const fuori = useCallback(async () => {
    const info = await api<InfoStanza>(`/lupus/stanze/${codice}/info`).catch(() => null)
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

  const leggi = useCallback(async () => {
    if (inCorso.current || document.visibilityState !== 'visible') return
    inCorso.current = true
    try {
      accetta(await api<VistaStanzaLupus>(`/lupus/stanze/${codice}`))
    } catch (e) {
      // Senza rete si resta su quel che si vede: il giro dopo riprova.
      await sbagliato(e).catch(() => {})
    } finally {
      inCorso.current = false
    }
  }, [accetta, codice, sbagliato])

  useEffect(() => {
    void leggi()
  }, [leggi])

  const vista = stanza.tipo === 'dentro' ? stanza.vista : null
  const ritmo = vista ? (vista.stato === 'partita' ? LUPUS_POLL_MS : LUPUS_POLL_ATTESA_MS) : null
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

  /** Un'azione che risponde con la stanza: la stanza nuova prende il posto di quella di prima. */
  const manda = useCallback(
    async (chi: string, percorso: string, body?: unknown): Promise<boolean> => {
      setOccupato(chi)
      try {
        accetta(await api<VistaStanzaLupus>(`/lupus/stanze/${codice}/${percorso}`, { method: 'POST', body }))
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
    [accetta, codice, leggi, sbagliato, toast],
  )

  const azione = useCallback((a: AzioneLupusDalTelefono) => manda('azione', 'azione', { azione: a }), [manda])
  const entra = useCallback(() => manda('entra', 'entra'), [manda])
  const via = useCallback(() => manda('via', 'via'), [manda])
  const ancora = useCallback(() => manda('ancora', 'ancora'), [manda])
  const impostazioni = useCallback(
    (i: Partial<ImpostazioniStanzaLupus>) => manda('impostazioni', 'impostazioni', { impostazioni: i }),
    [manda],
  )
  const espelli = useCallback((playerId: string) => manda(`espelli:${playerId}`, 'espelli', { playerId }), [manda])

  /** Invitare un amico: non cambia la stanza, gli arriva con la presenza. */
  const invita = useCallback(
    async (playerId: string): Promise<boolean> => {
      setOccupato(`invita:${playerId}`)
      try {
        await api(`/lupus/stanze/${codice}/invita`, { method: 'POST', body: { playerId } })
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
      await api(`/lupus/stanze/${codice}/esci`, { method: 'POST' })
      return true
    } catch (e) {
      toast.show(e instanceof ApiFetchError ? e.message : 'Non riesco a uscire: riprova.', 'error')
      return false
    } finally {
      setOccupato(null)
    }
  }, [codice, toast])

  return { stanza, vista, scarto, occupato, leggi, azione, entra, via, ancora, impostazioni, espelli, invita, esci }
}

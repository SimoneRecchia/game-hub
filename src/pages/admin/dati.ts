import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { AdminIo } from '@shared/admin'
import { useToast } from '@/components/Toast'
import { ApiFetchError, api } from '@/lib/api'

/**
 * I dati del pannello. Ogni richiesta va a /api/admin, e una risposta puo'
 * dire che il pannello si e' chiuso: `ADMIN_BLOCCATO` quando lo sblocco e'
 * scaduto (dodici ore, o "Blocca" da un altro dispositivo), `NON_ADMIN` quando
 * il ruolo e' stato tolto. In tutti e due i casi la pagina deve tornare alla
 * schermata giusta da qualunque sezione, e per questo le richieste passano da
 * `useChiama`, che lo segnala al guscio del pannello.
 */

type OpzioniApi = NonNullable<Parameters<typeof api>[1]>

/** Perché il pannello si e' chiuso mentre lo si usava. */
export type Chiusura = 'bloccato' | 'negato'

interface ContestoAdmin {
  io: AdminIo
  segnala: (perche: Chiusura) => void
  /** Il pannello e' cambiato da qui: bloccato con il bottone, per esempio. */
  cambiaIo: (io: AdminIo) => void
}

export const AdminContext = createContext<ContestoAdmin | null>(null)

/**
 * Chi sono per il pannello: il ruolo serve a sapere che cosa si puo' cambiare
 * (il ruolo degli altri, solo il proprietario).
 */
export function useIo(): AdminIo {
  const ctx = useContext(AdminContext)
  if (!ctx) throw new Error('useIo richiede il guscio del pannello')
  return ctx.io
}

/** Per bloccare il pannello da una sezione: la risposta di /admin/blocca porta alla schermata dello sblocco. */
export function useCambiaIo(): (io: AdminIo) => void {
  const ctx = useContext(AdminContext)
  if (!ctx) throw new Error('useCambiaIo richiede il guscio del pannello')
  return ctx.cambiaIo
}

/** Il messaggio di un errore, per lo schermo. */
export function messaggioDi(errore: unknown, altrimenti = 'Qualcosa è andato storto. Riprova.'): string {
  return errore instanceof ApiFetchError ? errore.message : altrimenti
}

/** Una chiamata a /api/admin che, se il pannello si e' chiuso, lo dice al guscio. */
export function useChiama() {
  const segnala = useContext(AdminContext)?.segnala
  return useCallback(
    async <T>(percorso: string, opzioni?: OpzioniApi): Promise<T> => {
      try {
        return await api<T>(`/admin${percorso}`, opzioni)
      } catch (e) {
        if (e instanceof ApiFetchError && e.status === 403) {
          if (e.code === 'ADMIN_BLOCCATO') segnala?.('bloccato')
          else if (e.code === 'NON_ADMIN') segnala?.('negato')
        }
        throw e
      }
    },
    [segnala],
  )
}

/**
 * Le risposte gia' viste, per percorso: tornando a una sezione si vede subito
 * quel che c'era, e intanto si chiede la versione nuova. Dura quanto la scheda.
 */
const memoria = new Map<string, { dati: unknown; quando: number }>()

/** Dimentica le risposte che cominciano cosi', dopo una modifica: "/giocatori" dopo aver cambiato un giocatore. */
export function dimenticaAdmin(prefisso: string) {
  for (const chiave of [...memoria.keys()]) if (chiave.startsWith(prefisso)) memoria.delete(chiave)
}

export interface DatiAdmin<T> {
  dati: T | undefined
  errore: string | null
  /** Solo la prima volta, quando non c'e' niente da mostrare. */
  caricando: boolean
  /** Una richiesta e' in corso: i dati che si vedono sono quelli di prima. */
  aggiornando: boolean
  /** Quando sono arrivati i dati che si vedono. */
  quando: number | null
  ricarica: () => Promise<void>
  /** I dati nuovi che una modifica ha gia' restituito, senza richiederli. */
  imposta: (dati: T) => void
}

/**
 * I dati di una sezione. `ogni` li rilegge a intervalli, solo a pagina
 * visibile (la panoramica); `tieni` lascia i dati di prima mentre arrivano
 * quelli di un percorso nuovo — la pagina dopo di un elenco — invece di
 * svuotare la schermata: i numeri restano dove sono, un po' sbiaditi.
 */
export function useAdmin<T>(
  percorso: string | null,
  { ogni, tieni = false }: { ogni?: number; tieni?: boolean } = {},
): DatiAdmin<T> {
  const chiama = useChiama()
  const [dati, setDati] = useState<T | undefined>(() =>
    percorso ? (memoria.get(percorso)?.dati as T | undefined) : undefined,
  )
  const [quando, setQuando] = useState<number | null>(() => (percorso ? (memoria.get(percorso)?.quando ?? null) : null))
  const [errore, setErrore] = useState<string | null>(null)
  const [aggiornando, setAggiornando] = useState(false)
  const ultima = useRef(0)
  const vivo = useRef(true)

  useEffect(() => {
    vivo.current = true
    return () => {
      vivo.current = false
    }
  }, [])

  const ricarica = useCallback(async () => {
    if (!percorso) return
    const n = ++ultima.current
    setAggiornando(true)
    try {
      const nuovi = await chiama<T>(percorso)
      const adesso = Date.now()
      memoria.set(percorso, { dati: nuovi, quando: adesso })
      // Una risposta di un percorso di prima arrivata dopo quella nuova non deve sostituirla.
      if (!vivo.current || n !== ultima.current) return
      setDati(nuovi)
      setQuando(adesso)
      setErrore(null)
    } catch (e) {
      if (vivo.current && n === ultima.current) setErrore(messaggioDi(e, 'Non riesco a caricare i dati.'))
    } finally {
      if (vivo.current && n === ultima.current) setAggiornando(false)
    }
  }, [percorso, chiama])

  useEffect(() => {
    const ricordo = percorso ? memoria.get(percorso) : undefined
    if (ricordo || !tieni) {
      setDati(ricordo?.dati as T | undefined)
      setQuando(ricordo?.quando ?? null)
    }
    setErrore(null)
    void ricarica()
    // `tieni` decide solo il primo disegno di un percorso nuovo: non e' fra le dipendenze, perché non
    // deve far ripartire la richiesta.
  }, [percorso, ricarica])

  useEffect(() => {
    if (!ogni) return
    const visibile = () => document.visibilityState === 'visible'
    const giro = window.setInterval(() => {
      if (visibile()) void ricarica()
    }, ogni)
    // Tornando sulla pagina dopo un po' si rilegge subito, senza aspettare il giro.
    const torna = () => {
      if (visibile()) void ricarica()
    }
    document.addEventListener('visibilitychange', torna)
    return () => {
      window.clearInterval(giro)
      document.removeEventListener('visibilitychange', torna)
    }
  }, [ogni, ricarica])

  const imposta = useCallback(
    (nuovi: T) => {
      const adesso = Date.now()
      if (percorso) memoria.set(percorso, { dati: nuovi, quando: adesso })
      setDati(nuovi)
      setQuando(adesso)
    },
    [percorso],
  )

  return { dati, errore, caricando: dati === undefined && errore === null, aggiornando, quando, ricarica, imposta }
}

/**
 * Un'azione del pannello — salvare, chiudere una sessione, cancellare — con
 * il suo esito in un messaggio. `occupato` dice quale azione sta andando, per
 * lo spinner sul bottone giusto.
 */
export function useAzione() {
  const chiama = useChiama()
  const toast = useToast()
  const [occupato, setOccupato] = useState<string | null>(null)

  const esegui = useCallback(
    async <T>(chiave: string, percorso: string, opzioni: OpzioniApi, fatto?: string): Promise<T | null> => {
      setOccupato(chiave)
      try {
        const risposta = await chiama<T>(percorso, opzioni)
        if (fatto) toast.show(fatto, 'success')
        return risposta
      } catch (e) {
        // Il pannello chiuso lo dice gia' la schermata dello sblocco.
        if (!(e instanceof ApiFetchError && e.code === 'ADMIN_BLOCCATO')) toast.show(messaggioDi(e), 'error', 3200)
        return null
      } finally {
        setOccupato(null)
      }
    },
    [chiama, toast],
  )

  return { esegui, occupato }
}

/** Un valore che arriva dopo una pausa: la ricerca parte quando si smette di scrivere. */
export function useRitardato<T>(valore: T, ms = 250): T {
  const [ritardato, setRitardato] = useState(valore)
  useEffect(() => {
    const t = window.setTimeout(() => setRitardato(valore), ms)
    return () => window.clearTimeout(t)
  }, [valore, ms])
  return ritardato
}

/** Copia negli appunti, e lo dice. */
export function useCopia() {
  const toast = useToast()
  return useCallback(
    async (testo: string, cosa = 'Copiato') => {
      try {
        await navigator.clipboard.writeText(testo)
        toast.show(cosa, 'success')
      } catch {
        toast.show('Non riesco a copiare', 'error')
      }
    },
    [toast],
  )
}

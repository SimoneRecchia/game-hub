/**
 * Le libere in sospeso, nel telefono.
 *
 * Una partita libera lasciata a meta' — tornando indietro, chiudendo l'app —
 * resta li', e si riprende dalla sua pagina o dalle Libere, anche il giorno
 * dopo: le libere non sono le giornaliere. Una per gioco. Se non la si apre per
 * `SOSPESA_MS` se ne va da sola, e con lei il suo salvataggio.
 *
 * La partita sta dove stava gia' — nel `localStorage` del suo gioco, o sul
 * server per il Wordle, il cruciverba e la battaglia —; qui c'e' il registro:
 * che cosa c'e' da riprendere, dove, quando la si e' toccata l'ultima volta, e
 * come la si butta via (le chiavi del suo salvataggio, o la rotta del server
 * che la chiude). Cosi' chi la lascia dalle Libere, o la fa scadere, non deve
 * conoscere il gioco.
 *
 * Al server va solo quel che le succede — l'inizio, una ripresa, la fine, la
 * rinuncia, la scadenza — per i conti del pannello di amministrazione: una
 * richiesta per evento, senza aspettare la risposta.
 */

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { SOSPESA_MS, type EventoSospesa, type GiocoSospeso } from '@shared/sospese'

export type { GiocoSospeso }

export interface Sospesa {
  /** Lo sceglie il telefono, per i conti del server. */
  id: string
  gioco: GiocoSospeso
  /** Dove si riprende. */
  a: string
  /** Una riga sul biglietto: "Difficile · 12:40", "Quarta parola". */
  dettaglio?: string
  creata: number
  toccata: number
  /** Le chiavi del `localStorage` del salvataggio, che se ne vanno con la partita. */
  chiavi?: string[]
  /** La rotta del server che chiude la partita, per quelle che stanno li'. */
  chiudi?: string
}

const CHIAVE = 'giochi.sospese'
/** L'evento che avvisa le pagine aperte che il registro e' cambiato. */
const CAMBIO = 'giochi:sospese'

type Registro = Partial<Record<GiocoSospeso, Sospesa>>

function leggi(): Registro {
  try {
    const r = JSON.parse(localStorage.getItem(CHIAVE) ?? '{}') as Registro
    return r && typeof r === 'object' ? r : {}
  } catch {
    return {}
  }
}

function scrivi(r: Registro): void {
  try {
    localStorage.setItem(CHIAVE, JSON.stringify(r))
  } catch {
    /* Safari privato nega lo storage: le partite restano in memoria finché la pagina e' aperta */
  }
  window.dispatchEvent(new Event(CAMBIO))
}

function segnala(s: Sospesa, evento: EventoSospesa): void {
  void api('/libere/sospese', { method: 'POST', body: { id: s.id, gioco: s.gioco, evento }, keepalive: true }).catch(
    () => {
      /* sono solo i conti del pannello: una richiesta persa non cambia la partita */
    },
  )
}

const nuovoId = () =>
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

/** Butta via il salvataggio di una partita: le sue chiavi, e sul server la sua rotta. */
function butta(s: Sospesa): void {
  try {
    for (const k of s.chiavi ?? []) localStorage.removeItem(k)
  } catch {
    /* vedi scrivi */
  }
  if (s.chiudi) {
    void api(s.chiudi, { method: 'POST', keepalive: true }).catch(() => {
      /* la partita sul server resta aperta: la prossima volta si riprende, ed e' un male minore */
    })
  }
}

const scaduta = (s: Sospesa, adesso = Date.now()) => adesso - s.toccata > SOSPESA_MS

/** Fa scadere quel che non si tocca da troppo. Si chiama a ogni lettura del registro. */
function pulisci(r: Registro): Registro {
  let cambiato = false
  for (const s of Object.values(r)) {
    if (s && scaduta(s)) {
      butta(s)
      segnala(s, 'scaduta')
      delete r[s.gioco]
      cambiato = true
    }
  }
  if (cambiato) scrivi(r)
  return r
}

/** Le partite in sospeso, dalla toccata piu' di recente. Quelle scadute se ne vanno qui. */
export function leggiSospese(): Sospesa[] {
  return Object.values(pulisci(leggi()))
    .filter((s): s is Sospesa => Boolean(s))
    .sort((a, b) => b.toccata - a.toccata)
}

/** La partita in sospeso di un gioco, se c'e' e non e' scaduta. */
export function sospesaDi(gioco: GiocoSospeso): Sospesa | null {
  return pulisci(leggi())[gioco] ?? null
}

/**
 * Una partita comincia, o va avanti: la mette nel registro, o ne aggiorna il
 * biglietto e l'ora. La prima volta lo dice al server.
 */
export function segnaSospesa(
  gioco: GiocoSospeso,
  info: { a: string; dettaglio?: string; chiavi?: string[]; chiudi?: string },
): void {
  const r = leggi()
  const adesso = Date.now()
  const prima = r[gioco]
  const s: Sospesa = prima
    ? { ...prima, ...info, toccata: adesso }
    : { id: nuovoId(), gioco, creata: adesso, toccata: adesso, ...info }
  r[gioco] = s
  scrivi(r)
  if (!prima) segnala(s, 'inizio')
}

/**
 * Una partita lasciata si riapre: la sua ora riparte, e il server lo conta.
 * Si chiama quando una pagina ritrova un salvataggio, non a ogni disegno.
 */
export function riprendiSospesa(gioco: GiocoSospeso): void {
  const r = leggi()
  const s = r[gioco]
  if (!s) return
  r[gioco] = { ...s, toccata: Date.now() }
  scrivi(r)
  segnala(s, 'ripresa')
}

/**
 * La partita e' finita, giocandola o lasciandola dalla sua pagina: esce dal
 * registro. Il salvataggio lo sistema il gioco, che lo sa fare.
 */
export function chiudiSospesa(gioco: GiocoSospeso, esito: 'finita' | 'annullata' = 'finita'): void {
  const r = leggi()
  const s = r[gioco]
  if (!s) return
  delete r[gioco]
  scrivi(r)
  segnala(s, esito)
}

/** Lascia una partita da fuori, dalle Libere: esce dal registro e se ne va il suo salvataggio. */
export function lasciaSospesa(gioco: GiocoSospeso): void {
  const r = leggi()
  const s = r[gioco]
  if (!s) return
  butta(s)
  delete r[gioco]
  scrivi(r)
  segnala(s, 'annullata')
}

/** Le partite in sospeso, che si aggiornano quando cambiano, anche da un'altra scheda del browser. */
export function useSospese(): Sospesa[] {
  // Al primo disegno senza scrivere niente: la pulizia, che avvisa le altre pagine, la fa l'effetto.
  const [sospese, setSospese] = useState(() =>
    Object.values(leggi())
      .filter((s): s is Sospesa => Boolean(s) && !scaduta(s!))
      .sort((a, b) => b.toccata - a.toccata),
  )
  useEffect(() => {
    const aggiorna = () => setSospese(leggiSospese())
    const daUnAltraScheda = (e: StorageEvent) => {
      if (e.key === CHIAVE) aggiorna()
    }
    window.addEventListener(CAMBIO, aggiorna)
    window.addEventListener('storage', daUnAltraScheda)
    document.addEventListener('visibilitychange', aggiorna)
    aggiorna()
    return () => {
      window.removeEventListener(CAMBIO, aggiorna)
      window.removeEventListener('storage', daUnAltraScheda)
      document.removeEventListener('visibilitychange', aggiorna)
    }
  }, [])
  return sospese
}

/** La partita in sospeso di un gioco, viva: per le pagine che offrono di riprenderla. */
export function useSospesa(gioco: GiocoSospeso): Sospesa | null {
  return useSospese().find((s) => s.gioco === gioco) ?? null
}

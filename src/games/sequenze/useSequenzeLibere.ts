import { useCallback, useEffect, useRef, useState } from 'react'
import { ROTTE } from '@/app/rotte'
import { chiudiSospesa, riprendiSospesa, segnaSospesa, sospesaDi } from '@/games/sospese/registro'
import {
  LIVELLI_ORDINATI,
  LIVELLI_SEQUENZE,
  lunghezzaRaggiunta,
  sequenzaDelLivello,
  type LivelloSequenze,
} from '@shared/sequenze'
import { registraLiberaSequenze } from './conti'
import { DOPO_LA_RISPOSTA_MS, type SequenzaAperta } from './useProva'

export const NOMI_LIVELLI_SEQUENZE: Record<LivelloSequenze, string> = {
  facile: 'Facile',
  normale: 'Normale',
  difficile: 'Al contrario',
}

export interface FineLibera {
  /** La sequenza piu' lunga ripetuta giusta, quella prima dell'errore: zero se e' sbagliata la prima. */
  arrivata: number
  record: boolean
}

export interface SequenzeLibere {
  livello: LivelloSequenze | null
  aperta: SequenzaAperta | null
  /** Le sequenze ripetute giuste finora. */
  giuste: number
  fine: FineLibera | null
  comincia: (livello: LivelloSequenze) => void
  rispondi: (tocchi: number[], giusta: boolean) => void
  /** Torna alla scelta della difficoltà. */
  scegli: () => void
  /** Riprende la partita lasciata a meta', se c'e': la sequenza a cui si era arrivati si rivede da capo. */
  riprendi: () => void
  /** Lascia la partita in corso, o quella in sospeso: se ne va, e non si conta. */
  lascia: () => void
}

/**
 * La partita lasciata a meta': il seme e quante se ne sono ripetute bastano a
 * rifare la sequenza a cui si era arrivati, che si rivede da capo — per
 * ripeterla bisogna averla vista. Non c'e' un orologio da fermare.
 */
export const CHIAVE_PARTITA_SEQUENZE = 'giochi.sequenze.libera.partita'

export interface SequenzeSospesa {
  livello: LivelloSequenze
  seme: number
  giuste: number
}

/** Dove si riprende: la sala delle Sequenze, che la riapre da sola. */
export const RIPRENDI_SEQUENZE = `${ROTTE.sequenze}?riprendi=1`

export function salvaSequenzeSospesa(s: SequenzeSospesa | null): void {
  try {
    if (s) localStorage.setItem(CHIAVE_PARTITA_SEQUENZE, JSON.stringify(s))
    else localStorage.removeItem(CHIAVE_PARTITA_SEQUENZE)
  } catch {
    /* senza localStorage la partita vive finché la pagina e' aperta */
  }
}

/** La partita salvata, se ha la forma giusta. */
export function leggiSequenzeSospesa(): SequenzeSospesa | null {
  try {
    const s = JSON.parse(localStorage.getItem(CHIAVE_PARTITA_SEQUENZE) ?? 'null') as Partial<SequenzeSospesa> | null
    if (
      !s ||
      !(LIVELLI_ORDINATI as readonly unknown[]).includes(s.livello) ||
      !Number.isSafeInteger(s.seme) ||
      !Number.isSafeInteger(s.giuste) ||
      s.giuste! < 0
    ) {
      return null
    }
    return { livello: s.livello!, seme: s.seme!, giuste: s.giuste! }
  } catch {
    return null
  }
}

/**
 * La partita salvata, se il registro la tiene ancora: le Libere la possono
 * lasciare, e il registro farla scadere. Un biglietto senza partita se ne va.
 */
function salvata(): SequenzeSospesa | null {
  const s = leggiSequenzeSospesa()
  const nelRegistro = sospesaDi('sequenze')
  if (s && !nelRegistro) {
    salvaSequenzeSospesa(null)
    return null
  }
  if (!s && nelRegistro) chiudiSospesa('sequenze', 'annullata')
  return s
}

function salva(s: SequenzeSospesa): void {
  salvaSequenzeSospesa(s)
  segnaSospesa('sequenze', {
    a: RIPRENDI_SEQUENZE,
    dettaglio: `${NOMI_LIVELLI_SEQUENZE[s.livello]} · ${LIVELLI_SEQUENZE[s.livello].prima + s.giuste} cubetti`,
    chiavi: [CHIAVE_PARTITA_SEQUENZE],
  })
}

/** Un seme a caso, per una partita nuova. */
function semeACaso(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] >>> 1
}

/**
 * Le Sequenze libere: tutto nel telefono, dal seme della partita, e senza un
 * tetto — oltre i nove cubetti uno torna, mai due volte di fila. Si va avanti
 * finché non si sbaglia, e la piu' lunga ripetuta e' il record del livello.
 * La partita si salva a ogni sequenza giusta, e lasciata a meta' resta in
 * sospeso.
 */
export function useSequenzeLibere(): SequenzeLibere {
  const [livello, setLivello] = useState<LivelloSequenze | null>(null)
  const [aperta, setAperta] = useState<SequenzaAperta | null>(null)
  const [giuste, setGiuste] = useState(0)
  const [fine, setFine] = useState<FineLibera | null>(null)
  const seme = useRef(0)
  const chiave = useRef(0)
  const timer = useRef<number | null>(null)
  const giusteRef = useRef(0)

  useEffect(() => {
    // Un biglietto senza partita, o una partita senza biglietto, se ne vanno subito.
    salvata()
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [])

  const apri = useCallback((l: LivelloSequenze, quante: number) => {
    chiave.current += 1
    const sequenza = sequenzaDelLivello(seme.current, LIVELLI_SEQUENZE[l].prima + quante)
    setAperta({ sequenza, chiave: chiave.current })
  }, [])

  const comincia = useCallback(
    (l: LivelloSequenze) => {
      if (timer.current) window.clearTimeout(timer.current)
      seme.current = semeACaso()
      giusteRef.current = 0
      setGiuste(0)
      setFine(null)
      setLivello(l)
      apri(l, 0)
      salva({ livello: l, seme: seme.current, giuste: 0 })
    },
    [apri],
  )

  const riprendi = useCallback(() => {
    const s = salvata()
    if (!s) return
    if (timer.current) window.clearTimeout(timer.current)
    riprendiSospesa('sequenze')
    seme.current = s.seme
    giusteRef.current = s.giuste
    setGiuste(s.giuste)
    setFine(null)
    setLivello(s.livello)
    apri(s.livello, s.giuste)
  }, [apri])

  const rispondi = useCallback(
    (_tocchi: number[], giusta: boolean) => {
      const l = livello
      if (!l) return
      if (timer.current) window.clearTimeout(timer.current)
      // La partita si scrive subito, non dopo la pausa: chi esce nel frattempo ritrova quel che ha fatto.
      if (giusta) {
        giusteRef.current += 1
        salva({ livello: l, seme: seme.current, giuste: giusteRef.current })
      }
      const arrivata = lunghezzaRaggiunta(giusteRef.current, LIVELLI_SEQUENZE[l].prima)
      const conto = giusta ? null : registraLiberaSequenze(l, arrivata)
      if (conto) {
        salvaSequenzeSospesa(null)
        chiudiSospesa('sequenze', 'finita')
      }
      timer.current = window.setTimeout(() => {
        timer.current = null
        if (!conto) {
          setGiuste(giusteRef.current)
          apri(l, giusteRef.current)
          return
        }
        setAperta(null)
        setFine({ arrivata, record: conto.record })
      }, DOPO_LA_RISPOSTA_MS)
    },
    [apri, livello],
  )

  const scegli = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current)
    setLivello(null)
    setAperta(null)
    setFine(null)
  }, [])

  const lascia = useCallback(() => {
    salvaSequenzeSospesa(null)
    chiudiSospesa('sequenze', 'annullata')
    scegli()
  }, [scegli])

  return { livello, aperta, giuste, fine, comincia, rispondi, scegli, riprendi, lascia }
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { LIVELLI_SEQUENZE, lunghezzaRaggiunta, sequenzaDelLivello, type LivelloSequenze } from '@shared/sequenze'
import { registraLiberaSequenze } from './conti'
import { DOPO_LA_RISPOSTA_MS, type SequenzaAperta } from './useSequenzeDelGiorno'

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
}

/** Un seme a caso, per una partita nuova. */
function semeACaso(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] >>> 1
}

/**
 * Le Sequenze libere: tutto nel telefono, dal seme della partita, e senza un
 * tetto — oltre i nove cubetti uno torna, mai due volte di fila. Si va avanti
 * finché non si sbaglia, e la piu' lunga ripetuta e' il record del livello.
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

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current)
    },
    [],
  )

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
    },
    [apri],
  )

  const rispondi = useCallback(
    (_tocchi: number[], giusta: boolean) => {
      const l = livello
      if (!l) return
      if (timer.current) window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => {
        timer.current = null
        if (giusta) {
          giusteRef.current += 1
          setGiuste(giusteRef.current)
          apri(l, giusteRef.current)
          return
        }
        const arrivata = lunghezzaRaggiunta(giusteRef.current, LIVELLI_SEQUENZE[l].prima)
        const { record } = registraLiberaSequenze(l, arrivata)
        setAperta(null)
        setFine({ arrivata, record })
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

  return { livello, aperta, giuste, fine, comincia, rispondi, scegli }
}

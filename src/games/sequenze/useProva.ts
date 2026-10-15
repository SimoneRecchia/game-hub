import { useCallback, useEffect, useRef, useState } from 'react'
import { haptic } from '@/lib/haptics'
import { suona } from '@/lib/suoni'
import { ordineDaToccare, type Ritmo } from '@shared/sequenze'

/**
 * Le note dei nove cubetti: la scala pentatonica di do, su due ottave scarse.
 * Una sequenza si ricorda anche a orecchio, come al Simon, e la pentatonica
 * non stona qualunque sia l'ordine.
 */
export const NOTE_CUBETTI = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2, 9 / 4, 5 / 2, 3] as const

/** Quanto si aspetta, dopo che la sequenza e' arrivata, prima del primo lampo: il tempo di guardare la tavola. */
export const ATTESA_LAMPI_MS = 700

/** Quanto resta in vista com'e' andata una sequenza, il verde o il rosso, prima della prossima. */
export const DOPO_LA_RISPOSTA_MS = 950

/** La sequenza da guardare e ripetere. */
export interface SequenzaAperta {
  sequenza: number[]
  /** Cambia a ogni sequenza: fa ripartire i lampi. */
  chiave: number
}

export type FaseProva = 'ferma' | 'guarda' | 'tocca' | 'giusta' | 'sbagliata'

export interface ErroreProva {
  /** Il cubetto toccato per sbaglio. */
  toccato: number
  /** Quello che andava toccato. */
  atteso: number
}

export interface Prova {
  fase: FaseProva
  /** Il cubetto acceso, mentre si guarda. */
  acceso: number | null
  /** I cubetti toccati, nell'ordine. */
  tocchi: number[]
  errore: ErroreProva | null
  tocca: (cubetto: number) => void
}

interface Opzioni {
  /** La sequenza da mostrare; null, nessuna. */
  sequenza: number[] | null
  /** Cambia a ogni sequenza nuova: e' quel che fa ripartire i lampi, anche per una sequenza uguale. */
  chiave: number
  ritmo: Ritmo
  /** Si tocca al contrario, dall'ultimo cubetto al primo. */
  indietro?: boolean
  /** Alla fine: i cubetti toccati, e se erano tutti giusti. Sbagliati, si ferma al primo errore. */
  onFine: (tocchi: number[], giusta: boolean) => void
}

/**
 * Una sequenza: i lampi, uno dopo l'altro, ognuno con la sua nota, e poi i
 * tocchi. Il primo tocco sbagliato chiude subito, senza aspettare gli altri;
 * l'ultimo giusto chiude come giusta. Si tocca solo a lampi finiti.
 */
export function useProva({ sequenza, chiave, ritmo, indietro = false, onFine }: Opzioni): Prova {
  const [fase, setFase] = useState<FaseProva>('ferma')
  const [acceso, setAcceso] = useState<number | null>(null)
  const [tocchi, setTocchi] = useState<number[]>([])
  const [errore, setErrore] = useState<ErroreProva | null>(null)
  const faseRef = useRef<FaseProva>('ferma')
  const tocchiRef = useRef<number[]>([])
  const daToccare = useRef<number[]>([])
  const fineRef = useRef(onFine)
  fineRef.current = onFine
  const sequenzaRef = useRef(sequenza)
  sequenzaRef.current = sequenza

  const vaiA = useCallback((f: FaseProva) => {
    faseRef.current = f
    setFase(f)
  }, [])

  useEffect(() => {
    const s = sequenzaRef.current
    tocchiRef.current = []
    setTocchi([])
    setErrore(null)
    setAcceso(null)
    if (!s || s.length === 0) {
      vaiA('ferma')
      return
    }
    daToccare.current = ordineDaToccare(s, indietro)
    vaiA('guarda')
    const timer: number[] = []
    const passo = ritmo.lampoMs + ritmo.pausaMs
    s.forEach((cubetto, k) => {
      const inizio = ATTESA_LAMPI_MS + k * passo
      timer.push(
        window.setTimeout(() => {
          setAcceso(cubetto)
          suona('cubetto', { altezza: NOTE_CUBETTI[cubetto] })
        }, inizio),
        window.setTimeout(() => setAcceso(null), inizio + ritmo.lampoMs),
      )
    })
    timer.push(window.setTimeout(() => vaiA('tocca'), ATTESA_LAMPI_MS + s.length * passo - ritmo.pausaMs))
    return () => timer.forEach((t) => window.clearTimeout(t))
    // La chiave dice quando ripartire: la sequenza la si legge dal ref, perché un array nuovo uguale non riparta.
  }, [chiave, indietro, ritmo.lampoMs, ritmo.pausaMs, vaiA])

  const tocca = useCallback(
    (cubetto: number) => {
      if (faseRef.current !== 'tocca') return
      const k = tocchiRef.current.length
      const nuovi = [...tocchiRef.current, cubetto]
      tocchiRef.current = nuovi
      setTocchi(nuovi)
      const atteso = daToccare.current[k]
      if (cubetto !== atteso) {
        setErrore({ toccato: cubetto, atteso })
        vaiA('sbagliata')
        suona('sbagliato')
        haptic('error')
        fineRef.current(nuovi, false)
        return
      }
      suona('cubetto', { altezza: NOTE_CUBETTI[cubetto] })
      haptic('tap')
      if (nuovi.length === daToccare.current.length) {
        vaiA('giusta')
        suona('sequenza', { ritardo: 0.12, altezza: Math.min(2, 1 + (nuovi.length - 3) * 0.06) })
        fineRef.current(nuovi, true)
      }
    },
    [vaiA],
  )

  return { fase, acceso, tocchi, errore, tocca }
}

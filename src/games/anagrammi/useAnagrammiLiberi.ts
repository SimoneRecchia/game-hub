import { useCallback, useEffect, useRef, useState } from 'react'
import {
  TEMPO_PAROLA_MS,
  mescolaAnagramma,
  normalizzaAnagramma,
  puntiAnagrammi,
  puntiParola,
} from '@shared/anagrammi'
import { VERSIONE_LIBERE_ANAGRAMMI } from '@shared/anagrammi-libere'
import type { EsitoAnagramma, ParolaAnagrammi } from '@shared/types'
import { registraLiberaAnagrammi } from './conti'
import type { EsitoProva } from './Lettere'
import type { VistaAnagrammi } from './Partita'

export type LivelloAnagrammi = 'facile' | 'normale' | 'difficile'

export const LIVELLI_ANAGRAMMI: readonly LivelloAnagrammi[] = ['facile', 'normale', 'difficile']

export const NOMI_LIVELLI_ANAGRAMMI: Record<LivelloAnagrammi, string> = {
  facile: 'Facile',
  normale: 'Normale',
  difficile: 'Difficile',
}

/** Le lunghezze delle cinque parole di ogni livello: il normale e' la giornata della classificata. */
export const LUNGHEZZE_LIBERE: Record<LivelloAnagrammi, readonly number[]> = {
  facile: [5, 5, 6, 6, 7],
  normale: [5, 6, 7, 8, 9],
  difficile: [7, 8, 8, 9, 9],
}

/** Il file delle libere: per lunghezza, la parola, le altre risposte separate da virgole, la definizione. */
interface FileLibere {
  parole: Record<string, Array<[string, string, string]>>
}

let caricato: Promise<FileLibere> | null = null

/** Il file delle parole, scaricato una volta: sta sotto /dati/, in cache per sempre con la sua impronta. */
function fileLibere(): Promise<FileLibere> {
  caricato ??= fetch(`/dati/anagrammi/libere.json?v=${VERSIONE_LIBERE_ANAGRAMMI}`).then((r) => {
    if (!r.ok) throw new Error(`Parole degli anagrammi: ${r.status}`)
    return r.json() as Promise<FileLibere>
  })
  caricato.catch(() => {
    caricato = null
  })
  return caricato
}

interface Parola {
  parola: string
  lettere: string
  risposte: string[]
  definizione: string
  /** Quando la si e' aperta, sull'orologio del telefono. */
  aperta: number | null
  esito: EsitoAnagramma | null
  ms: number | null
  aiuto: boolean
  risposta: string | null
}

/** Cinque parole a caso delle lunghezze del livello, tutte diverse. */
function pesca(file: FileLibere, livello: LivelloAnagrammi): Parola[] {
  const prese = new Set<string>()
  return LUNGHEZZE_LIBERE[livello].map((n) => {
    const elenco = file.parole[String(n)] ?? []
    let voce = elenco[Math.floor(Math.random() * elenco.length)]
    for (let i = 0; i < 20 && prese.has(voce[0]); i += 1) voce = elenco[Math.floor(Math.random() * elenco.length)]
    prese.add(voce[0])
    const [parola, altre, definizione] = voce
    const risposte = [parola, ...(altre ? altre.split(',') : [])]
    return {
      parola,
      lettere: mescolaAnagramma(parola, risposte, Math.random),
      risposte,
      definizione,
      aperta: null,
      esito: null,
      ms: null,
      aiuto: false,
      risposta: null,
    }
  })
}

/** Una parola come la vede la schermata: le lettere da aperta, la parola da chiusa. */
function vistaDi(p: Parola): ParolaAnagrammi {
  const chiusa = p.esito !== null
  return {
    lunghezza: p.parola.length,
    lettere: p.aperta !== null ? p.lettere : null,
    esito: p.esito,
    ms: p.ms,
    punti: p.esito === 'trovata' ? puntiParola(p.parola.length, p.ms ?? 0, p.aiuto) : 0,
    aiuto: p.aiuto,
    definizione: chiusa || p.aiuto ? p.definizione : null,
    parola: chiusa ? p.parola : null,
    risposta: p.risposta,
  }
}

export interface AnagrammiLiberi {
  livello: LivelloAnagrammi | null
  vista: VistaAnagrammi | null
  punti: number
  errore: string | null
  comincia: (livello: LivelloAnagrammi) => void
  ricomincia: () => void
  apri: () => void
  prova: (parola: string) => Promise<EsitoProva | null>
  aiuto: () => void
  passo: () => void
  scade: () => void
}

/**
 * Una libera degli Anagrammi: tutta nel telefono, come le libere del quiz. Le
 * parole vengono dal file delle libere, che non ha le parole delle
 * classificate (scripts/build-anagrammi.mjs le divide per lettere), e il tempo
 * lo tiene il telefono.
 */
export function useAnagrammiLiberi(): AnagrammiLiberi {
  const [livello, setLivello] = useState<LivelloAnagrammi | null>(null)
  const [parole, setParole] = useState<Parola[] | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const paroleRef = useRef(parole)
  paroleRef.current = parole

  useEffect(() => {
    // Il file si scarica mentre si sceglie il livello: al tocco su Comincia c'e' gia'.
    void fileLibere().catch(() => undefined)
  }, [])

  const cambia = useCallback((k: number, f: (p: Parola) => Parola) => {
    setParole((prima) => prima && prima.map((p, i) => (i === k ? f(p) : p)))
  }, [])

  const corrente = parole ? parole.findIndex((p) => p.aperta !== null && p.esito === null) : -1

  const comincia = useCallback((l: LivelloAnagrammi) => {
    setErrore(null)
    fileLibere()
      .then((file) => {
        setLivello(l)
        setParole(pesca(file, l))
      })
      .catch(() => setErrore('Non riesco a scaricare le parole. Riprova fra poco.'))
  }, [])

  const ricomincia = useCallback(() => {
    setParole(null)
    setLivello(null)
  }, [])

  const apri = useCallback(() => {
    const p = paroleRef.current
    if (!p) return
    const k = p.findIndex((x) => x.aperta === null)
    if (k >= 0) cambia(k, (x) => ({ ...x, aperta: Date.now() }))
  }, [cambia])

  const prova = useCallback(
    async (testo: string): Promise<EsitoProva | null> => {
      const p = paroleRef.current
      const k = p ? p.findIndex((x) => x.aperta !== null && x.esito === null) : -1
      if (!p || k < 0) return null
      const parola = p[k]
      const t = normalizzaAnagramma(testo)
      if (!parola.risposte.some((r) => normalizzaAnagramma(r) === t)) return 'sbagliata'
      const ms = Math.min(TEMPO_PAROLA_MS, Date.now() - (parola.aperta ?? Date.now()))
      cambia(k, (x) => ({ ...x, esito: 'trovata', ms, risposta: t !== x.parola ? t : null }))
      return 'giusta'
    },
    [cambia],
  )

  const chiudi = useCallback(
    (esito: EsitoAnagramma) => {
      const p = paroleRef.current
      const k = p ? p.findIndex((x) => x.aperta !== null && x.esito === null) : -1
      if (k >= 0) cambia(k, (x) => ({ ...x, esito }))
    },
    [cambia],
  )

  const aiuto = useCallback(() => {
    const p = paroleRef.current
    const k = p ? p.findIndex((x) => x.aperta !== null && x.esito === null) : -1
    if (k >= 0) cambia(k, (x) => ({ ...x, aiuto: true }))
  }, [cambia])

  const passo = useCallback(() => chiudi('passata'), [chiudi])
  const scade = useCallback(() => chiudi('persa'), [chiudi])

  const finita = parole !== null && parole.every((p) => p.esito !== null)

  // Una partita finita si conta una volta: la riconosce l'elenco delle sue parole, che e' suo.
  const contata = useRef<Parola[] | null>(null)
  useEffect(() => {
    if (!finita || !parole || contata.current === parole) return
    contata.current = parole
    const giocate = parole.map((p) => ({
      lettere: p.parola.length,
      trovata: p.esito === 'trovata',
      ms: p.ms ?? 0,
      aiuto: p.aiuto,
    }))
    registraLiberaAnagrammi(giocate.filter((p) => p.trovata).length, puntiAnagrammi(giocate))
  }, [finita, parole])
  const vista: VistaAnagrammi | null = parole
    ? {
        parole: parole.map(vistaDi),
        corrente: corrente >= 0 ? corrente : null,
        scadenza: corrente >= 0 ? parole[corrente].aperta! + TEMPO_PAROLA_MS : null,
        scaduta: false,
        tempoParolaMs: TEMPO_PAROLA_MS,
        occupato: false,
        finita,
      }
    : null
  const punti = parole
    ? puntiAnagrammi(
        parole
          .filter((p) => p.esito !== null)
          .map((p) => ({ lettere: p.parola.length, trovata: p.esito === 'trovata', ms: p.ms ?? 0, aiuto: p.aiuto })),
      )
    : 0

  return { livello, vista, punti, errore, comincia, ricomincia, apri, prova, aiuto, passo, scade }
}

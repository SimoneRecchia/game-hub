/**
 * La partita del quiz come la vede la schermata: in che fase e', la domanda,
 * il tempo, com'e' andata l'ultima risposta.
 *
 * Due sorgenti, un modello solo. La classificata parla col server, che tiene
 * il tempo e le risposte giuste (il telefono non le vede prima di rispondere);
 * la libera fa tutto nel browser, con le stesse domande e le stesse regole. La
 * schermata non sa quale delle due ha davanti.
 *
 * Le fasi: l'**intro** con la categoria, il **via** (tre, due, uno), la
 * **domanda** col suo tempo, l'**esito** — l'adesivo e la risposta giusta, per
 * un attimo — e poi la domanda dopo, o la **fine**.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiFetchError, api } from '@/lib/api'
import { dimentica } from '@/lib/dati'
import { mulberry32 } from '@shared/daily'
import { SECONDI_CARTINA, SECONDI_SCELTA, type CategoriaQuiz } from '@shared/quiz'
import {
  generaDomande,
  rispostaGiusta,
  senzaRisposta,
  type DomandaCompleta,
  type DomandaQuiz,
  type RichiestaQuiz,
} from '@shared/quiz-domande'
import type { QuizEsito, QuizState, RispostaQuiz } from '@shared/types'
import { caricaDatiQuiz } from './dati'

export type Fase = 'caricamento' | 'intro' | 'via' | 'domanda' | 'esito' | 'fine' | 'errore'

export interface Fatta {
  domanda: DomandaQuiz
  risposta: RispostaQuiz
  /** Sulla cartina, i posti che valevano: nella libera si sanno, nella classificata no. */
  accettate?: string[]
}

export interface VistaPartita {
  fase: Fase
  categoria: CategoriaQuiz | null
  totale: number
  indice: number
  domanda: DomandaQuiz | null
  /** Il tempo della domanda; zero se si gioca senza. */
  limiteMs: number
  /** Quando scade la domanda, in `performance.now()`; null se non scade. */
  scade: number | null
  fatte: Fatta[]
  /** L'ultima risposta, durante l'esito. */
  ultima: Fatta | null
  giuste: number
  /** Quante giuste di fila, contando l'ultima. */
  serie: number
  /** I punti in classifica, per la classificata. */
  punti: number | null
  tempoMs: number
  inviando: boolean
  errore: string | null
  msToNextPuzzle: number | null
  comincia: () => void
  rispondi: (scelta: string | null) => void
  riprova: () => void
}

/** Quanto dura il "tre, due, uno" prima della prima domanda. */
export const VIA_MS = 2_400

/** Quanto resta l'esito prima della domanda dopo: sulla cartina di piu', perché si guarda dov'era. */
export function durataEsito(d: DomandaQuiz | null): number {
  return d?.cartina ? 2_600 : 1_800
}

function serieDi(fatte: readonly Fatta[]): number {
  let n = 0
  for (let i = fatte.length - 1; i >= 0 && fatte[i].risposta.giusta; i -= 1) n += 1
  return n
}

/* ─────────────────────────────  La classificata  ───────────────────────── */

export function useQuizDelGiorno(): VistaPartita {
  const [stato, setStato] = useState<QuizState | null>(null)
  const [fase, setFase] = useState<Fase>('caricamento')
  const [ultima, setUltima] = useState<Fatta | null>(null)
  const [scade, setScade] = useState<number | null>(null)
  const [inviando, setInviando] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const vivo = useRef(true)
  const inAttesa = useRef<(() => void) | null>(null)

  useEffect(() => {
    vivo.current = true
    return () => {
      vivo.current = false
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  const dopo = (ms: number, fai: () => void) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => vivo.current && fai(), ms)
  }

  const applica = useCallback((s: QuizState, inizio: boolean) => {
    setStato(s)
    if (s.status === 'done') {
      setFase('fine')
      setScade(null)
    } else if (s.aperta) {
      setFase('domanda')
      setScade(performance.now() + s.aperta.restanteMs)
    } else if (inizio) {
      setFase('intro')
    }
  }, [])

  const carica = useCallback(async () => {
    try {
      applica(await api<QuizState>('/quiz/state'), true)
      setErrore(null)
    } catch (e) {
      setErrore(e instanceof ApiFetchError ? e.message : 'Non riesco a caricare il quiz.')
      setFase('errore')
    }
  }, [applica])

  useEffect(() => {
    void carica()
  }, [carica])

  const apri = useCallback(async () => {
    try {
      const s = await api<QuizState>('/quiz/domanda', { method: 'POST' })
      if (!vivo.current) return
      setUltima(null)
      applica(s, false)
      setErrore(null)
    } catch (e) {
      setErrore(e instanceof ApiFetchError ? e.message : 'La domanda non è arrivata.')
      inAttesa.current = () => void apri()
    }
  }, [applica])

  const comincia = useCallback(() => {
    setFase('via')
    dopo(VIA_MS, () => void apri())
  }, [apri])

  const rispondi = useCallback(
    (scelta: string | null) => {
      if (!stato?.aperta || inviando) return
      const indice = stato.aperta.indice
      const domanda = stato.aperta.domanda
      setInviando(true)
      setScade(null)
      const manda = async () => {
        try {
          const r = await api<QuizEsito>('/quiz/risposta', { method: 'POST', body: { indice, scelta } })
          if (!vivo.current) return
          dimentica('/oggi')
          dimentica('/leaderboard')
          const fatta: Fatta = {
            domanda,
            risposta: r.risposta,
            accettate: r.risposta.giusta && scelta ? [scelta] : [],
          }
          setUltima(fatta)
          setStato(r.stato)
          setFase('esito')
          setErrore(null)
          dopo(durataEsito(domanda), () => {
            if (r.stato.status === 'done') {
              setUltima(null)
              setFase('fine')
            } else {
              void apri()
            }
          })
        } catch (e) {
          if (e instanceof ApiFetchError && e.status === 409) {
            await carica()
          } else {
            setErrore(e instanceof ApiFetchError ? e.message : 'La risposta non è partita.')
            inAttesa.current = () => void manda()
          }
        } finally {
          if (vivo.current) setInviando(false)
        }
      }
      void manda()
    },
    [stato, inviando, apri, carica],
  )

  const riprova = useCallback(() => {
    const fai = inAttesa.current
    inAttesa.current = null
    if (fai) fai()
    else void carica()
  }, [carica])

  const fatte: Fatta[] = (stato?.fatte ?? []).map((f) => ({ ...f, accettate: f.risposta.giusta && f.risposta.scelta ? [f.risposta.scelta] : [] }))
  return {
    fase,
    categoria: stato?.categoria ?? null,
    totale: stato?.totale ?? 0,
    // Durante l'esito la domanda e' quella appena risposta, non la prossima.
    indice: fase === 'esito' ? Math.max(0, fatte.length - 1) : (stato?.aperta?.indice ?? fatte.length),
    domanda: fase === 'esito' ? (ultima?.domanda ?? null) : (stato?.aperta?.domanda ?? null),
    limiteMs: stato?.aperta?.limiteMs ?? (ultima?.domanda.cartina ? SECONDI_CARTINA : SECONDI_SCELTA) * 1000,
    scade,
    fatte,
    ultima,
    giuste: stato?.giuste ?? 0,
    serie: serieDi(fatte),
    punti: stato?.punti ?? null,
    tempoMs: stato?.tempoMs ?? 0,
    inviando,
    errore,
    msToNextPuzzle: stato?.msToNextPuzzle ?? null,
    comincia,
    rispondi,
    riprova,
  }
}

/* ───────────────────────────────  La libera  ──────────────────────────── */

export interface ImpostazioniLibera extends RichiestaQuiz {
  aTempo: boolean
}

export interface StatisticheLibere {
  partite: number
  domande: number
  giuste: number
  /** La miglior percentuale per categoria. */
  migliori: Partial<Record<CategoriaQuiz, number>>
}

const CHIAVE_STATISTICHE = 'quiz-libere-v1'

export function leggiStatistiche(): StatisticheLibere {
  try {
    const s = JSON.parse(localStorage.getItem(CHIAVE_STATISTICHE) ?? 'null') as StatisticheLibere | null
    if (s && typeof s.partite === 'number') return s
  } catch {
    // niente
  }
  return { partite: 0, domande: 0, giuste: 0, migliori: {} }
}

function registraStatistiche(categoria: CategoriaQuiz, domande: number, giuste: number): StatisticheLibere {
  const s = leggiStatistiche()
  const quota = domande > 0 ? Math.round((100 * giuste) / domande) : 0
  const nuove: StatisticheLibere = {
    partite: s.partite + 1,
    domande: s.domande + domande,
    giuste: s.giuste + giuste,
    migliori: { ...s.migliori, [categoria]: Math.max(s.migliori[categoria] ?? 0, quota) },
  }
  try {
    localStorage.setItem(CHIAVE_STATISTICHE, JSON.stringify(nuove))
  } catch {
    // Le statistiche delle libere sono un contorno.
  }
  return nuove
}

/**
 * Una partita libera: le domande si fanno nel browser, con un seme a caso,
 * dagli stessi dati e con le stesse regole della classificata. Non va al server:
 * le statistiche restano nel telefono, perché non contano per niente.
 */
export function useQuizLibero(impostazioni: ImpostazioniLibera | null): VistaPartita & { statistiche: StatisticheLibere } {
  const [domande, setDomande] = useState<DomandaCompleta[]>([])
  const [fase, setFase] = useState<Fase>('caricamento')
  const [indice, setIndice] = useState(0)
  const [fatte, setFatte] = useState<Fatta[]>([])
  const [ultima, setUltima] = useState<Fatta | null>(null)
  const [scade, setScade] = useState<number | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [statistiche, setStatistiche] = useState(leggiStatistiche)
  const aperta = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  const dopo = (ms: number, fai: () => void) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(fai, ms)
  }

  const limite = (d: DomandaCompleta | undefined) =>
    !d || !impostazioni?.aTempo ? 0 : (d.cartina ? SECONDI_CARTINA : SECONDI_SCELTA) * 1000

  const apri = useCallback(
    (i: number, elenco: DomandaCompleta[]) => {
      setIndice(i)
      setUltima(null)
      setFase('domanda')
      aperta.current = performance.now()
      const l = limite(elenco[i])
      setScade(l > 0 ? performance.now() + l : null)
    },
    [impostazioni?.aTempo],
  )

  const prepara = useCallback(async () => {
    if (!impostazioni) return
    setFase('caricamento')
    try {
      const ix = await caricaDatiQuiz()
      const seme = (Math.random() * 2 ** 32) >>> 0
      const nuove = generaDomande(ix, impostazioni, mulberry32(seme))
      if (nuove.length === 0) {
        setErrore('Con queste scelte non ci sono domande: prova un’area più grande.')
        setFase('errore')
        return
      }
      setDomande(nuove)
      setFatte([])
      setIndice(0)
      setErrore(null)
      setFase('intro')
    } catch (e) {
      setErrore(e instanceof ApiFetchError ? e.message : 'Non riesco a caricare i dati del quiz.')
      setFase('errore')
    }
  }, [impostazioni])

  useEffect(() => {
    void prepara()
  }, [prepara])

  const comincia = useCallback(() => {
    setFase('via')
    dopo(VIA_MS, () => apri(0, domande))
  }, [apri, domande])

  const rispondi = useCallback(
    (scelta: string | null) => {
      if (fase !== 'domanda') return
      const d = domande[indice]
      if (!d) return
      setScade(null)
      const ms = Math.round(performance.now() - aperta.current)
      const fatta: Fatta = {
        domanda: senzaRisposta(d),
        risposta: { scelta, giusta: rispostaGiusta(d, scelta), corretta: d.giusta, risposta: d.risposta, ms },
        accettate: d.accettate ?? [],
      }
      const dopoQuesta = [...fatte, fatta]
      setFatte(dopoQuesta)
      setUltima(fatta)
      setFase('esito')
      dopo(durataEsito(d), () => {
        if (indice + 1 >= domande.length) {
          setUltima(null)
          setFase('fine')
          if (impostazioni) {
            setStatistiche(
              registraStatistiche(impostazioni.categoria, domande.length, dopoQuesta.filter((f) => f.risposta.giusta).length),
            )
          }
        } else {
          apri(indice + 1, domande)
        }
      })
    },
    [fase, domande, indice, fatte, apri, impostazioni],
  )

  const d = domande[indice]
  return {
    fase,
    categoria: impostazioni?.categoria ?? null,
    totale: domande.length,
    indice,
    domanda: fase === 'esito' ? (ultima?.domanda ?? null) : d ? senzaRisposta(d) : null,
    limiteMs: limite(d),
    scade,
    fatte,
    ultima,
    giuste: fatte.filter((f) => f.risposta.giusta).length,
    serie: serieDi(fatte),
    punti: null,
    tempoMs: fatte.reduce((n, f) => n + f.risposta.ms, 0),
    inviando: false,
    errore,
    msToNextPuzzle: null,
    comincia,
    rispondi,
    riprova: () => void prepara(),
    statistiche,
  }
}

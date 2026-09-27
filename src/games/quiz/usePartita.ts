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
 * **domanda** col suo tempo, l'**esito** — l'adesivo, la risposta giusta e la
 * cartina che insegna — e poi, con "Avanti", la domanda dopo, o la **fine**.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiFetchError, api } from '@/lib/api'
import { dimentica } from '@/lib/dati'
import { mulberry32 } from '@shared/daily'
import { SECONDI_CARTINA, SECONDI_SCELTA, type CategoriaQuiz, type ModoQuiz } from '@shared/quiz'
import type { CittaQuiz } from '@shared/quiz-dati'
import {
  generaDomande,
  rispostaGiusta,
  senzaRisposta,
  type AreaQuiz,
  type DomandaCompleta,
  type DomandaQuiz,
  type RichiestaQuiz,
} from '@shared/quiz-domande'
import type { QuizEsito, QuizState, RispostaQuiz } from '@shared/types'
import { caricaCitta } from './citta'
import { caricaDatiQuiz } from './dati'

export type Fase = 'caricamento' | 'intro' | 'via' | 'domanda' | 'esito' | 'fine' | 'errore'

export interface Fatta {
  domanda: DomandaQuiz
  risposta: RispostaQuiz
  /** Sulla cartina, i posti che valevano. */
  accettate?: string[]
  /** Una domanda rifatta nel ripasso delle sbagliate. */
  ripasso?: boolean
}

/** Come si gioca una partita, oltre alle domande: il tempo, la cartina, gli aiuti. */
export interface OpzioniPartita {
  /** I secondi per le domande a scelta, il doppio sulla cartina; null senza tempo. */
  secondi: number | null
  /** A risposta data, la cartina con la risposta e i nomi: la parte del quiz che insegna. */
  imparo: boolean
  /** Si passa da soli alla domanda dopo; se no, c'e' "Avanti". */
  avantiDaSolo: boolean
  /** Sulla cartina muta, si accende quel che si puo' toccare. */
  evidenzia: boolean
  /** Fuori dalla zona della partita non si tocca niente. */
  soloZona: boolean
  /** I nomi dei paesi sulla cartina, per orientarsi. */
  nomiPaesi: boolean
  /** Due "50 e 50" per partita. */
  aiuti: boolean
  /** La partita finisce alla prima risposta sbagliata. */
  morteImprovvisa: boolean
  /** Alla fine si rifanno, una volta, le domande sbagliate. */
  ripasso: boolean
}

export const OPZIONI_PREDEFINITE: OpzioniPartita = {
  secondi: SECONDI_SCELTA,
  imparo: true,
  avantiDaSolo: false,
  evidenzia: true,
  soloZona: true,
  nomiPaesi: false,
  aiuti: false,
  morteImprovvisa: false,
  ripasso: false,
}

/** La classificata e' uguale per tutti: le opzioni di sempre, e il tempo lo tiene il server. */
export const OPZIONI_CLASSIFICATA: OpzioniPartita = { ...OPZIONI_PREDEFINITE }

/** Quanti "50 e 50" ha una partita con gli aiuti. */
export const AIUTI_PER_PARTITA = 2

export interface VistaPartita {
  fase: Fase
  categoria: CategoriaQuiz | null
  modo: ModoQuiz | null
  area: AreaQuiz
  opzioni: OpzioniPartita
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
  /** Da quale domanda comincia il ripasso delle sbagliate, se c'e'. */
  ripassoDa: number | null
  /** Se "Avanti" porta alla fine: e' l'ultima domanda, o la partita e' finita prima. */
  finale: boolean
  aiutiRimasti: number
  /** Le risposte tolte dal "50 e 50" nella domanda di adesso. */
  esclusi: ReadonlySet<string>
  /** Le città della partita, per la cartina: le ha chieste il browser a Wikidata. */
  citta: readonly CittaQuiz[] | null
  comincia: () => void
  rispondi: (scelta: string | null) => void
  avanti: () => void
  usaAiuto: () => void
  riprova: () => void
}

/** Quanto dura il "tre, due, uno" prima della prima domanda. */
export const VIA_MS = 2_400

/**
 * Quanto resta l'esito, se si va avanti da soli: sulla cartina di piu', perché
 * si guarda dov'era, e con la cartina che insegna di piu' ancora.
 */
export function durataEsito(d: DomandaQuiz | null, imparo: boolean): number {
  if (imparo) return 3_600
  return d?.cartina ? 2_600 : 1_800
}

function serieDi(fatte: readonly Fatta[]): number {
  let n = 0
  for (let i = fatte.length - 1; i >= 0 && fatte[i].risposta.giusta; i -= 1) n += 1
  return n
}

const NESSUNO: ReadonlySet<string> = new Set()

/* ─────────────────────────────  La classificata  ───────────────────────── */

export function useQuizDelGiorno(): VistaPartita {
  const [stato, setStato] = useState<QuizState | null>(null)
  const [fase, setFase] = useState<Fase>('caricamento')
  const [ultima, setUltima] = useState<Fatta | null>(null)
  const [scade, setScade] = useState<number | null>(null)
  const [inviando, setInviando] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const vivo = useRef(true)
  const inAttesa = useRef<(() => void) | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    vivo.current = true
    return () => {
      vivo.current = false
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

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
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => vivo.current && void apri(), VIA_MS)
  }, [apri])

  const avanti = useCallback(() => {
    if (fase !== 'esito') return
    if (stato?.status === 'done') {
      setUltima(null)
      setFase('fine')
    } else {
      void apri()
    }
  }, [fase, stato?.status, apri])

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
          setUltima({
            domanda,
            risposta: r.risposta,
            accettate: r.risposta.accettate ?? (r.risposta.giusta && scelta ? [scelta] : []),
          })
          setStato(r.stato)
          setFase('esito')
          setErrore(null)
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
    [stato, inviando, carica],
  )

  const riprova = useCallback(() => {
    const fai = inAttesa.current
    inAttesa.current = null
    if (fai) fai()
    else void carica()
  }, [carica])

  const fatte: Fatta[] = (stato?.fatte ?? []).map((f) => ({
    ...f,
    accettate: f.risposta.accettate ?? (f.risposta.giusta && f.risposta.scelta ? [f.risposta.scelta] : []),
  }))
  return {
    fase,
    categoria: stato?.categoria ?? null,
    modo: stato?.modo ?? null,
    area: 'mondo',
    opzioni: OPZIONI_CLASSIFICATA,
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
    ripassoDa: null,
    finale: stato?.status === 'done',
    aiutiRimasti: 0,
    esclusi: NESSUNO,
    citta: null,
    comincia,
    rispondi,
    avanti,
    usaAiuto: () => {},
    riprova,
  }
}

/* ───────────────────────────────  La libera  ──────────────────────────── */

/** Le scelte di una partita libera: le domande e come si gioca. */
export interface ImpostazioniLibera extends Omit<RichiestaQuiz, 'citta'>, OpzioniPartita {}

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

/** Le opzioni di una domanda rimescolate: nel ripasso la risposta giusta non sta dove stava. */
function rimescolata(d: DomandaCompleta, caso: () => number): DomandaCompleta {
  const opzioni = [...d.opzioni]
  for (let i = opzioni.length - 1; i > 0; i -= 1) {
    const j = Math.floor(caso() * (i + 1))
    ;[opzioni[i], opzioni[j]] = [opzioni[j], opzioni[i]]
  }
  return { ...d, opzioni }
}

/**
 * Le risposte da togliere con un "50 e 50": meta' di quelle sbagliate, a caso.
 * Con quattro risposte ne restano due, con sei tre.
 */
function cinquantaCinquanta(d: DomandaCompleta, caso: () => number): Set<string> {
  const sbagliate = d.opzioni.filter((o) => o.id !== d.giusta).map((o) => o.id)
  const via = Math.floor(d.opzioni.length / 2)
  for (let i = sbagliate.length - 1; i > 0; i -= 1) {
    const j = Math.floor(caso() * (i + 1))
    ;[sbagliate[i], sbagliate[j]] = [sbagliate[j], sbagliate[i]]
  }
  return new Set(sbagliate.slice(0, via))
}

/**
 * Una partita libera: le domande si fanno nel browser, con un seme a caso,
 * dagli stessi dati e con le stesse regole della classificata. Non va al server:
 * le statistiche restano nel telefono, perché non contano per niente.
 */
export function useQuizLibero(impostazioni: ImpostazioniLibera | null): VistaPartita & { statistiche: StatisticheLibere } {
  const [domande, setDomande] = useState<DomandaCompleta[]>([])
  const [citta, setCitta] = useState<readonly CittaQuiz[] | null>(null)
  const [fase, setFase] = useState<Fase>('caricamento')
  const [indice, setIndice] = useState(0)
  const [fatte, setFatte] = useState<Fatta[]>([])
  const [ultima, setUltima] = useState<Fatta | null>(null)
  const [scade, setScade] = useState<number | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [statistiche, setStatistiche] = useState(leggiStatistiche)
  const [ripassoDa, setRipassoDa] = useState<number | null>(null)
  const [aiutiRimasti, setAiutiRimasti] = useState(0)
  const [esclusi, setEsclusi] = useState<ReadonlySet<string>>(NESSUNO)
  const [finita, setFinita] = useState(false)
  const aperta = useRef(0)
  const caso = useRef(mulberry32((Math.random() * 2 ** 32) >>> 0))
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  const secondi = impostazioni?.secondi ?? null
  const limite = useCallback(
    (d: DomandaCompleta | undefined) => (!d || secondi === null ? 0 : (d.cartina ? secondi * 2 : secondi) * 1000),
    [secondi],
  )

  const apri = useCallback(
    (i: number, elenco: DomandaCompleta[]) => {
      if (timer.current) clearTimeout(timer.current)
      setIndice(i)
      setUltima(null)
      setEsclusi(NESSUNO)
      setFase('domanda')
      aperta.current = performance.now()
      const l = limite(elenco[i])
      setScade(l > 0 ? performance.now() + l : null)
    },
    [limite],
  )

  const prepara = useCallback(async () => {
    if (!impostazioni) return
    setFase('caricamento')
    try {
      const ix = await caricaDatiQuiz()
      const elenco = impostazioni.categoria === 'citta' ? await caricaCitta(ix, impostazioni.area) : null
      const seme = (Math.random() * 2 ** 32) >>> 0
      caso.current = mulberry32(seme ^ 0x5bd1e995)
      const nuove = generaDomande(ix, { ...impostazioni, citta: elenco ?? undefined }, mulberry32(seme))
      if (nuove.length === 0) {
        setErrore('Con queste scelte non ci sono domande: prova un’area più grande, o altri tipi di domanda.')
        setFase('errore')
        return
      }
      setCitta(elenco)
      setDomande(nuove)
      setFatte([])
      setIndice(0)
      setRipassoDa(null)
      setFinita(false)
      setAiutiRimasti(impostazioni.aiuti ? AIUTI_PER_PARTITA : 0)
      setErrore(null)
      setFase('intro')
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Non riesco a caricare i dati del quiz.')
      setFase('errore')
    }
  }, [impostazioni])

  useEffect(() => {
    void prepara()
  }, [prepara])

  const comincia = useCallback(() => {
    setFase('via')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => apri(0, domande), VIA_MS)
  }, [apri, domande])

  /** La domanda dopo, il ripasso delle sbagliate, o la fine. */
  const avanti = useCallback(() => {
    if (fase !== 'esito' || !impostazioni) return
    const primoGiro = ripassoDa ?? domande.length
    if (!finita && indice + 1 < domande.length) {
      apri(indice + 1, domande)
      return
    }
    const sbagliate = fatte.slice(0, primoGiro).filter((f) => !f.risposta.giusta)
    if (!finita && impostazioni.ripasso && ripassoDa === null && sbagliate.length > 0) {
      // Il ripasso: le sbagliate un'altra volta, con le risposte rimescolate.
      const daRifare = domande
        .slice(0, primoGiro)
        .filter((_, i) => !fatte[i]?.risposta.giusta)
        .map((d) => rimescolata(d, caso.current))
      const tutte = [...domande, ...daRifare]
      setDomande(tutte)
      setRipassoDa(primoGiro)
      apri(primoGiro, tutte)
      return
    }
    setUltima(null)
    setFase('fine')
    const risposte = fatte.slice(0, primoGiro)
    setStatistiche(
      registraStatistiche(impostazioni.categoria, risposte.length, risposte.filter((f) => f.risposta.giusta).length),
    )
  }, [fase, impostazioni, ripassoDa, domande, finita, indice, fatte, apri])

  const rispondi = useCallback(
    (scelta: string | null) => {
      if (fase !== 'domanda' || !impostazioni) return
      const d = domande[indice]
      if (!d) return
      setScade(null)
      const ms = Math.round(performance.now() - aperta.current)
      const giusta = rispostaGiusta(d, scelta)
      const fatta: Fatta = {
        domanda: senzaRisposta(d),
        risposta: {
          scelta,
          giusta,
          corretta: d.giusta,
          risposta: d.risposta,
          ms,
          ...(d.luogo ? { luogo: d.luogo } : {}),
          ...(d.cartina && d.accettate ? { accettate: d.accettate } : {}),
        },
        accettate: d.accettate ?? [],
        ripasso: ripassoDa !== null && indice >= ripassoDa,
      }
      setFatte((prima) => [...prima, fatta])
      setUltima(fatta)
      setFase('esito')
      // Con la morte improvvisa, un errore del primo giro chiude la partita.
      if (impostazioni.morteImprovvisa && !giusta && !fatta.ripasso) setFinita(true)
    },
    [fase, impostazioni, domande, indice, ripassoDa],
  )

  // Avanti da solo: dopo l'esito, la domanda dopo senza toccare niente.
  useEffect(() => {
    if (fase !== 'esito' || !impostazioni?.avantiDaSolo) return
    const t = setTimeout(avanti, durataEsito(ultima?.domanda ?? null, impostazioni.imparo))
    return () => clearTimeout(t)
  }, [fase, impostazioni?.avantiDaSolo, impostazioni?.imparo, ultima, avanti])

  const usaAiuto = useCallback(() => {
    const d = domande[indice]
    if (fase !== 'domanda' || aiutiRimasti <= 0 || !d || d.cartina || esclusi.size > 0 || d.opzioni.length < 3) return
    setEsclusi(cinquantaCinquanta(d, caso.current))
    setAiutiRimasti((n) => n - 1)
  }, [domande, indice, fase, aiutiRimasti, esclusi])

  const d = domande[indice]
  const primoGiro = ripassoDa ?? domande.length
  const restaRipasso =
    !!impostazioni?.ripasso && ripassoDa === null && fatte.slice(0, primoGiro).some((f) => !f.risposta.giusta)
  return {
    fase,
    categoria: impostazioni?.categoria ?? null,
    modo: impostazioni?.modo ?? 'scelta',
    area: impostazioni?.area ?? 'mondo',
    opzioni: impostazioni ?? OPZIONI_PREDEFINITE,
    totale: domande.length,
    indice,
    domanda: fase === 'esito' ? (ultima?.domanda ?? null) : d ? senzaRisposta(d) : null,
    limiteMs: limite(d),
    scade,
    fatte,
    ultima,
    giuste: fatte.slice(0, primoGiro).filter((f) => f.risposta.giusta).length,
    serie: serieDi(fatte),
    punti: null,
    tempoMs: fatte.reduce((n, f) => n + f.risposta.ms, 0),
    inviando: false,
    errore,
    msToNextPuzzle: null,
    ripassoDa,
    finale: finita || (indice + 1 >= domande.length && !restaRipasso),
    aiutiRimasti,
    esclusi,
    citta,
    comincia,
    rispondi,
    avanti,
    usaAiuto,
    riprova: () => void prepara(),
    statistiche,
  }
}

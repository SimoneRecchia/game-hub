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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiFetchError, api } from '@/lib/api'
import { dimentica } from '@/lib/dati'
import { gameDate, mulberry32 } from '@shared/daily'
import { FATTORE_LUNGA, SECONDI_SCELTA, secondiDellaDomanda, type CategoriaQuiz, type ModoQuiz } from '@shared/quiz'
import type { CittaQuiz } from '@shared/quiz-dati'
import {
  rispostaGiusta,
  senzaRisposta,
  type AreaQuiz,
  type DomandaCompleta,
  type DomandaQuiz,
  type RichiestaQuiz,
} from '@shared/quiz-domande'
import { giornoDellAnno } from '@shared/quiz-cultura'
import { generaPartita } from '@shared/quiz-domande-cultura'
import type { QuizEsito, QuizState, RispostaQuiz } from '@shared/types'
import { caricaCitta } from './citta'
import { caricaDatiQuiz } from './dati'
import { fontiDelQuiz, giornoDellaPartita } from './fonti'
import { CHIAVE_PARTITA, buttaPartitaQuiz, lasciaPartitaQuiz, leggiPartitaQuiz, salvaPartitaQuiz } from './sospesa'
import { leggiStatistiche, registraStatistiche, type StatisticheLibere } from './statistiche'
import { chiudiSospesa, riprendiSospesa, segnaSospesa, sospesaDi } from '@/games/sospese/registro'

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
  /** L'ambito delle altre materie, se non sono tutte: "ottocento". */
  ambito: string | null
  /** Il giorno di "Accadde oggi": "03-12". */
  giorno: string | null
  opzioni: OpzioniPartita
  totale: number
  indice: number
  domanda: DomandaQuiz | null
  /** La domanda che viene dopo, se la si sa gia' (la libera): i suoi quadri si scaricano prima. */
  prossima: DomandaQuiz | null
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
 * si guarda dov'era, con la cartina che insegna di piu' ancora, e con la
 * scheda da leggere il doppio.
 */
export function durataEsito(d: DomandaQuiz | null, imparo: boolean, scheda = false): number {
  if (imparo && scheda) return 7_000
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

  // Le città del giorno, se e' il giorno delle città: a risposta data la cartina ha il pallino.
  const [citta, setCitta] = useState<readonly CittaQuiz[] | null>(null)
  const delleCitta = stato?.categoria === 'citta'
  useEffect(() => {
    if (!delleCitta) return
    let qui = true
    caricaDatiQuiz()
      .then((ix) => caricaCitta(ix, 'mondo'))
      .then((c) => qui && setCitta(c))
      .catch(() => {
        // Senza le città la cartina mostra il paese: la partita si gioca lo stesso.
      })
    return () => {
      qui = false
    }
  }, [delleCitta])

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
            setErrore(e instanceof ApiFetchError ? e.message : 'Risposta non inviata.')
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
    ambito: null,
    giorno: stato?.categoria === 'oggi' ? giornoDellAnno(stato.date) : null,
    opzioni: OPZIONI_CLASSIFICATA,
    totale: stato?.totale ?? 0,
    // Durante l'esito la domanda e' quella appena risposta, non la prossima.
    indice: fase === 'esito' ? Math.max(0, fatte.length - 1) : (stato?.aperta?.indice ?? fatte.length),
    domanda: fase === 'esito' ? (ultima?.domanda ?? null) : (stato?.aperta?.domanda ?? null),
    prossima: null,
    limiteMs: stato?.aperta?.limiteMs ?? secondiDellaDomanda(ultima?.domanda ?? {}) * 1000,
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
    citta,
    comincia,
    rispondi,
    avanti,
    usaAiuto: () => {},
    riprova,
  }
}

/* ───────────────────────────────  La libera  ──────────────────────────── */

/** Le categorie di una partita libera: quella sola, o quelle delle sue sezioni. */
export function categorieDi(s: Pick<ImpostazioniLibera, 'categoria' | 'sezioni'>): CategoriaQuiz[] {
  return [...new Set(s.sezioni?.length ? s.sezioni.map((x) => x.categoria) : [s.categoria])]
}

/** Le scelte di una partita libera: le domande e come si gioca. */
export interface ImpostazioniLibera extends Omit<RichiestaQuiz, 'citta' | 'data'>, OpzioniPartita {
  /** "Accadde oggi" di un giorno a caso, invece che di oggi. */
  giorno?: 'caso'
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

/** La risposta a una domanda, come la racconta la partita: la stessa quando si risponde e quando la si riprende. */
function fattaDi(d: DomandaCompleta, scelta: string | null, ms: number, ripasso: boolean): Fatta {
  return {
    domanda: senzaRisposta(d),
    risposta: {
      scelta,
      giusta: rispostaGiusta(d, scelta),
      corretta: d.giusta,
      risposta: d.risposta,
      ms,
      ...(d.luogo ? { luogo: d.luogo } : {}),
      ...(d.cartina && d.accettate ? { accettate: d.accettate } : {}),
      ...(d.spiegazione ? { spiegazione: d.spiegazione } : {}),
    },
    accettate: d.accettate ?? [],
    ripasso,
  }
}

/** Dove si riprende una libera lasciata, e come si chiama sul biglietto delle Libere. */
export interface SospesaLibera {
  /** L'indirizzo della partita, con le sue scelte. */
  a: string
  /** "Bandiere", "Capitali, Bandiere": la prima parte del biglietto. */
  nome: string
}

/** Il tempo di una domanda fermo: quanto ne resta (null senza tempo) e da quando e' fermo. */
interface Pausa {
  restante: number | null
  da: number
}

export interface PartitaLibera extends VistaPartita {
  statistiche: StatisticheLibere
  /** La partita e' cominciata e non e' finita: uscendo resta in sospeso. */
  inSospeso: boolean
  /** Lascia la partita: non resta in sospeso, e non conta nelle statistiche. */
  lascia: () => void
}

/**
 * Una partita libera: le domande si fanno nel browser, con un seme a caso,
 * dagli stessi dati e con le stesse regole della classificata. Non va al server:
 * le statistiche restano nel telefono, perché non contano per niente.
 *
 * Con `sospesa` la partita cominciata resta in sospeso quando si esce, e si
 * riprende dalla domanda a cui si era, con il tempo che le restava: uscendo,
 * o con la pagina nascosta, l'orologio si ferma. Una partita ritrovata riparte
 * dall'intro, e il tempo riprende al tre-due-uno; una lasciata a risposta data
 * riparte dall'esito.
 */
export function useQuizLibero(impostazioni: ImpostazioniLibera | null, sospesa?: SospesaLibera): PartitaLibera {
  const [domande, setDomande] = useState<DomandaCompleta[]>([])
  const [citta, setCitta] = useState<readonly CittaQuiz[] | null>(null)
  const [giorno, setGiorno] = useState<string | null>(null)
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
  const [inSospeso, setInSospeso] = useState(false)
  const aperta = useRef(0)
  const caso = useRef(mulberry32((Math.random() * 2 ** 32) >>> 0))
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const data = useRef(gameDate())
  /** La partita va salvata: e' cominciata, o e' stata ritrovata, e non e' finita. */
  const salvare = useRef(false)
  /** Il tempo della domanda aperta, fermo finché la pagina e' nascosta. */
  const pausa = useRef<Pausa | null>(null)
  /** Il tempo della domanda a cui si era, per una partita ritrovata che non e' ancora ripartita. */
  const daRiprendere = useRef<{ trascorso: number; restante: number | null } | null>(null)
  const ripresaSegnata = useRef(false)
  // Le stringhe e non l'oggetto, che chi chiama puo' rifare a ogni disegno.
  const a = sospesa?.a
  const nome = sospesa?.nome

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  const secondi = impostazioni?.secondi ?? null
  const limite = useCallback(
    (d: DomandaCompleta | undefined) =>
      !d || secondi === null ? 0 : Math.round(secondi * (d.cartina ? 2 : d.lunga ? FATTORE_LUNGA : 1) * 1000),
    [secondi],
  )

  /** Apre una domanda; con `ripresa`, con il tempo che le restava quando la si e' lasciata. */
  const apri = useCallback(
    (i: number, elenco: DomandaCompleta[], ripresa?: { trascorso: number; restante: number | null }) => {
      if (timer.current) clearTimeout(timer.current)
      setIndice(i)
      setUltima(null)
      setEsclusi(NESSUNO)
      setFase('domanda')
      const ora = performance.now()
      aperta.current = ora - (ripresa?.trascorso ?? 0)
      const l = limite(elenco[i])
      const restante = l > 0 ? Math.max(0, ripresa?.restante ?? l) : null
      // Il tre-due-uno finito con la pagina nascosta: la domanda si apre ferma, e parte quando la si guarda.
      if (document.visibilityState === 'hidden') {
        pausa.current = { restante, da: ora }
        setScade(null)
      } else {
        pausa.current = null
        setScade(restante === null ? null : ora + restante)
      }
    },
    [limite],
  )

  const prepara = useCallback(async () => {
    if (!impostazioni) return
    setFase('caricamento')
    pausa.current = null
    daRiprendere.current = null
    try {
      const categorie = categorieDi(impostazioni)
      const salvata = a ? leggiPartitaQuiz(a) : null
      if (salvata) {
        // Le città servono alla cartina, che a risposta data mette il pallino: senza, mostra il paese.
        const elenco = categorie.includes('citta')
          ? await fontiDelQuiz(['citta'], impostazioni.area, salvata.data)
              .then((f) => f.citta)
              .catch(() => null)
          : null
        const giro = salvata.ripassoDa ?? Infinity
        const rifatte = salvata.risposte.map((r, i) => fattaDi(salvata.domande[i], r.scelta, r.ms, i >= giro))
        data.current = salvata.data
        setCitta(elenco)
        setGiorno(salvata.giorno)
        setDomande(salvata.domande)
        setFatte(rifatte)
        setIndice(salvata.indice)
        setRipassoDa(salvata.ripassoDa)
        setFinita(salvata.finita)
        setAiutiRimasti(salvata.aiutiRimasti)
        setErrore(null)
        salvare.current = true
        setInSospeso(true)
        if (!ripresaSegnata.current) {
          ripresaSegnata.current = true
          riprendiSospesa('quiz')
        }
        if (rifatte.length > salvata.indice) {
          // Si era risposto: si ritrova l'esito, con la risposta e "Avanti".
          setUltima(rifatte[salvata.indice])
          setFase('esito')
        } else {
          daRiprendere.current = { trascorso: salvata.trascorsoMs, restante: salvata.restanteMs }
          setFase('intro')
        }
        return
      }
      const oggi = categorie.includes('oggi')
      const quando = oggi ? await giornoDellaPartita(impostazioni.giorno, false) : gameDate()
      const { fonti, citta: elenco } = await fontiDelQuiz(categorie, impostazioni.area, quando)
      const seme = (Math.random() * 2 ** 32) >>> 0
      caso.current = mulberry32(seme ^ 0x5bd1e995)
      const richiesta = { ...impostazioni, citta: elenco ?? undefined, data: quando }
      const nuove = generaPartita(fonti, richiesta, mulberry32(seme))
      if (nuove.length === 0) {
        setErrore('Nessuna domanda con queste scelte: prova una zona più grande.')
        setFase('errore')
        return
      }
      data.current = quando
      setCitta(elenco)
      setGiorno(oggi ? giornoDellAnno(quando) : null)
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
  }, [impostazioni, a])

  useEffect(() => {
    void prepara()
  }, [prepara])

  /** Quel che serve a salvare la partita, sempre l'ultimo: lo leggono l'uscita e la pagina che si nasconde. */
  const ora = useRef({ fase, scade, domande, fatte, indice, ripassoDa, finita, aiutiRimasti, giorno })
  ora.current = { fase, scade, domande, fatte, indice, ripassoDa, finita, aiutiRimasti, giorno }

  const salva = useCallback(() => {
    const s = ora.current
    if (!a || !salvare.current || s.domande.length === 0) return
    let trascorso = 0
    let restante: number | null = null
    if (s.fase === 'domanda') {
      const adesso = performance.now()
      const p = pausa.current
      trascorso = Math.max(0, (p ? p.da : adesso) - aperta.current)
      restante = p ? p.restante : s.scade === null ? null : Math.max(0, s.scade - adesso)
    } else if (daRiprendere.current) {
      ;({ trascorso, restante } = daRiprendere.current)
    }
    salvaPartitaQuiz({
      v: 1,
      a,
      data: data.current,
      giorno: s.giorno,
      domande: s.domande,
      risposte: s.fatte.map((f) => ({ scelta: f.risposta.scelta, ms: f.risposta.ms })),
      indice: s.indice,
      ripassoDa: s.ripassoDa,
      finita: s.finita,
      aiutiRimasti: s.aiutiRimasti,
      trascorsoMs: Math.round(trascorso),
      restanteMs: restante === null ? null : Math.round(restante),
    })
  }, [a])

  // A ogni passo la partita si salva, e il biglietto delle Libere dice a che domanda si e'.
  useEffect(() => {
    if (!a || !salvare.current || fase === 'fine' || fase === 'caricamento' || fase === 'errore') return
    salva()
    segnaSospesa('quiz', {
      a,
      dettaglio: `${nome} · domanda ${Math.min(indice + 1, domande.length)} di ${domande.length}`,
      chiavi: [CHIAVE_PARTITA],
    })
    // Il biglietto cambia con la domanda e con la risposta, non con ogni disegno.
  }, [fase, indice, fatte.length, domande.length, a, nome, salva])

  // Uscendo l'orologio si ferma: la pagina nascosta, chiusa o lasciata salva il tempo che resta.
  useEffect(() => {
    if (!a) return
    const ferma = () => {
      const s = ora.current
      if (s.fase === 'domanda' && !pausa.current) {
        const adesso = performance.now()
        pausa.current = { restante: s.scade === null ? null : Math.max(0, s.scade - adesso), da: adesso }
        setScade(null)
      }
      salva()
    }
    const riparti = () => {
      const p = pausa.current
      if (!p || ora.current.fase !== 'domanda') return
      pausa.current = null
      const adesso = performance.now()
      aperta.current += adesso - p.da
      if (p.restante !== null) setScade(adesso + p.restante)
    }
    const cambia = () => (document.visibilityState === 'hidden' ? ferma() : riparti())
    document.addEventListener('visibilitychange', cambia)
    window.addEventListener('pagehide', salva)
    return () => {
      document.removeEventListener('visibilitychange', cambia)
      window.removeEventListener('pagehide', salva)
      salva()
    }
  }, [a, salva])

  /** Fine della partita, giocandola o lasciandola: non c'e' piu' niente da riprendere. */
  const chiudi = useCallback(
    (esito: 'finita' | 'annullata') => {
      if (!a || !salvare.current) return
      salvare.current = false
      setInSospeso(false)
      buttaPartitaQuiz()
      chiudiSospesa('quiz', esito)
    },
    [a],
  )

  const comincia = useCallback(() => {
    const ripresa = daRiprendere.current
    if (a && !ripresa && !salvare.current) {
      // Una partita nuova: quella di prima, se c'era, l'ha gia' lasciata chi ha scelto di cominciarla.
      if (sospesaDi('quiz')) lasciaPartitaQuiz()
      salvare.current = true
      setInSospeso(true)
    }
    setFase('via')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      if (ripresa) {
        daRiprendere.current = null
        apri(indice, domande, ripresa)
      } else {
        apri(0, domande)
      }
    }, VIA_MS)
  }, [apri, domande, indice, a])

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
    chiudi('finita')
    const risposte = fatte.slice(0, primoGiro)
    // In una partita di piu' sezioni ogni domanda conta per la sua categoria.
    const conti = new Map<CategoriaQuiz, [number, number]>()
    for (const f of risposte) {
      const categoria = f.domanda.categoria ?? impostazioni.categoria
      const [domande, giuste] = conti.get(categoria) ?? [0, 0]
      conti.set(categoria, [domande + 1, giuste + (f.risposta.giusta ? 1 : 0)])
    }
    setStatistiche(registraStatistiche([...conti].map(([categoria, [d, g]]) => [categoria, d, g] as const)))
  }, [fase, impostazioni, ripassoDa, domande, finita, indice, fatte, apri, chiudi])

  const rispondi = useCallback(
    (scelta: string | null) => {
      if (fase !== 'domanda' || !impostazioni) return
      const d = domande[indice]
      if (!d) return
      setScade(null)
      pausa.current = null
      const ms = Math.round(performance.now() - aperta.current)
      const fatta = fattaDi(d, scelta, ms, ripassoDa !== null && indice >= ripassoDa)
      setFatte((prima) => [...prima, fatta])
      setUltima(fatta)
      setFase('esito')
      // Con la morte improvvisa, un errore del primo giro chiude la partita.
      if (impostazioni.morteImprovvisa && !fatta.risposta.giusta && !fatta.ripasso) setFinita(true)
    },
    [fase, impostazioni, domande, indice, ripassoDa],
  )

  // Avanti da solo: dopo l'esito, la domanda dopo senza toccare niente.
  useEffect(() => {
    if (fase !== 'esito' || !impostazioni?.avantiDaSolo) return
    const dura = durataEsito(ultima?.domanda ?? null, impostazioni.imparo, !!ultima?.risposta.spiegazione)
    const t = setTimeout(avanti, dura)
    return () => clearTimeout(t)
  }, [fase, impostazioni?.avantiDaSolo, impostazioni?.imparo, ultima, avanti])

  const usaAiuto = useCallback(() => {
    const d = domande[indice]
    if (fase !== 'domanda' || aiutiRimasti <= 0 || !d || d.cartina || esclusi.size > 0 || d.opzioni.length < 3) return
    setEsclusi(cinquantaCinquanta(d, caso.current))
    setAiutiRimasti((n) => n - 1)
  }, [domande, indice, fase, aiutiRimasti, esclusi])

  const lascia = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    chiudi('annullata')
  }, [chiudi])

  const d = domande[indice]
  const quale = fase === 'intro' || fase === 'via' ? (daRiprendere.current ? indice : 0) : indice + 1
  const prossima = useMemo(() => (domande[quale] ? senzaRisposta(domande[quale]) : null), [domande, quale])
  const primoGiro = ripassoDa ?? domande.length
  const restaRipasso =
    !!impostazioni?.ripasso && ripassoDa === null && fatte.slice(0, primoGiro).some((f) => !f.risposta.giusta)
  return {
    fase,
    categoria: impostazioni?.categoria ?? null,
    modo: impostazioni?.modo ?? 'scelta',
    area: impostazioni?.area ?? 'mondo',
    ambito: impostazioni?.ambito && impostazioni.ambito !== 'tutti' ? impostazioni.ambito : null,
    giorno,
    opzioni: impostazioni ?? OPZIONI_PREDEFINITE,
    totale: domande.length,
    indice,
    domanda: fase === 'esito' ? (ultima?.domanda ?? null) : d ? senzaRisposta(d) : null,
    prossima,
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
    inSospeso,
    lascia,
  }
}

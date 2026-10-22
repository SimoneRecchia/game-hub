import { useCallback, useEffect, useRef, useState } from 'react'
import {
  TEMPO_PAROLA_MS,
  mescolaAnagramma,
  normalizzaAnagramma,
  puntiAnagrammi,
  puntiParola,
} from '@shared/anagrammi'
import { VERSIONE_LIBERE_ANAGRAMMI } from '@shared/anagrammi-libere'
import { mulberry32 } from '@shared/daily'
import type { LivelloAnagrammi } from '@shared/sfide-libere'
import type { EsitoAnagramma, ParolaAnagrammi } from '@shared/types'
import { ROTTE } from '@/app/rotte'
import { chiudiSospesa, riprendiSospesa, segnaSospesa, sospesaDi } from '@/games/sospese/registro'
import { registraLiberaAnagrammi } from './conti'
import type { EsitoProva } from './Lettere'
import type { VistaAnagrammi } from './Partita'
import {
  CHIAVE_PARTITA_ANAGRAMMI,
  dettaglioAnagrammi,
  leggiPartitaAnagrammi,
  salvaPartitaAnagrammi,
  type ParolaLibera,
  type PartitaAnagrammiSalvata,
} from './sospesa'

export { LIVELLI_ANAGRAMMI, type LivelloAnagrammi } from '@shared/sfide-libere'

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

/** Una parola della partita: `aperta` e' quando la si e' aperta, sull'orologio del telefono. */
type Parola = ParolaLibera

/** Ogni quanto si salva il tempo della parola aperta, fra una mossa e l'altra. */
const SALVA_TEMPO_MS = 5_000

/** Dove si riprende una libera lasciata: la pagina la riapre da sola. */
export const RIPRENDI_ANAGRAMMI = `${ROTTE.libera('anagrammi')}?riprendi=1`

/** Cinque parole a caso delle lunghezze del livello, tutte diverse: in una sfida, dal seme. */
function pesca(file: FileLibere, livello: LivelloAnagrammi, caso: () => number): Parola[] {
  const prese = new Set<string>()
  return LUNGHEZZE_LIBERE[livello].map((n) => {
    const elenco = file.parole[String(n)] ?? []
    let voce = elenco[Math.floor(caso() * elenco.length)]
    for (let i = 0; i < 20 && prese.has(voce[0]); i += 1) voce = elenco[Math.floor(caso() * elenco.length)]
    prese.add(voce[0])
    const [parola, altre, definizione] = voce
    const risposte = [parola, ...(altre ? altre.split(',') : [])]
    return {
      parola,
      lettere: mescolaAnagramma(parola, risposte, caso),
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
function vistaDi(p: Parola, tempoMs: number): ParolaAnagrammi {
  const chiusa = p.esito !== null
  return {
    lunghezza: p.parola.length,
    lettere: p.aperta !== null ? p.lettere : null,
    esito: p.esito,
    ms: p.ms,
    punti: p.esito === 'trovata' ? puntiParola(p.parola.length, p.ms ?? 0, p.aiuto, tempoMs) : 0,
    aiuto: p.aiuto,
    definizione: chiusa || p.aiuto ? p.definizione : null,
    parola: chiusa ? p.parola : null,
    risposta: p.risposta,
  }
}

/** Come si gioca una partita: il seme della sfida, se e' una sfida, il tempo di ogni parola, e se va nei conti. */
export interface OpzioniPartita {
  seme?: number
  tempoParolaMs?: number
  conta?: boolean
}

export interface AnagrammiLiberi {
  livello: LivelloAnagrammi | null
  vista: VistaAnagrammi | null
  punti: number
  errore: string | null
  comincia: (livello: LivelloAnagrammi, opzioni?: OpzioniPartita) => void
  ricomincia: () => void
  /** Riprende la partita lasciata a meta', se c'e'. */
  riprendi: () => void
  /** Lascia la partita in corso: se ne va, e non conta. */
  lascia: () => void
  apri: () => void
  prova: (parola: string) => Promise<EsitoProva | null>
  aiuto: () => void
  passo: () => void
  scade: () => void
}

/**
 * La partita lasciata a meta', se il registro delle sospese la conosce ancora.
 * Il registro decide: lasciata dalle Libere, o scaduta, se ne e' andata la sua
 * voce, e il salvataggio rimasto non vale; e una voce senza salvataggio non ha
 * niente da riprendere.
 */
function partitaInSospeso(): PartitaAnagrammiSalvata | null {
  const p = leggiPartitaAnagrammi()
  const voce = sospesaDi('anagrammi')
  if (p && !voce) {
    salvaPartitaAnagrammi(null)
    return null
  }
  if (!p && voce) chiudiSospesa('anagrammi', 'annullata')
  return p
}

/**
 * Una libera degli Anagrammi: tutta nel telefono, come le libere del quiz. Le
 * parole vengono dal file delle libere, che non ha le parole delle
 * classificate (scripts/build-anagrammi.mjs le divide per lettere), e il tempo
 * lo tiene il telefono.
 *
 * Con `salva` la partita resta in sospeso quando la si lascia: si salva a ogni
 * mossa, e a pagina nascosta il tempo della parola aperta si ferma. Con
 * `riprendi` la pagina si apre sulla partita lasciata. La sfida non salva
 * niente: il suo tempo e' quello dei due telefoni insieme.
 */
export function useAnagrammiLiberi({ salva = false, riprendi: subito = false } = {}): AnagrammiLiberi {
  const [iniziale] = useState(() => (salva && subito ? partitaInSospeso() : null))
  const [livello, setLivello] = useState<LivelloAnagrammi | null>(iniziale?.livello ?? null)
  const [parole, setParole] = useState<Parola[] | null>(iniziale?.parole ?? null)
  const [errore, setErrore] = useState<string | null>(null)
  const [tempoMs, setTempoMs] = useState(iniziale?.tempoMs ?? TEMPO_PAROLA_MS)
  /** Da quando la pagina e' nascosta: intanto il tempo della parola aperta non corre. */
  const [ferma, setFerma] = useState<number | null>(null)
  const conta = useRef(true)
  const paroleRef = useRef(parole)
  paroleRef.current = parole
  const tempoRef = useRef(tempoMs)
  tempoRef.current = tempoMs
  const fermaRef = useRef(ferma)
  fermaRef.current = ferma
  const statoRef = useRef<PartitaAnagrammiSalvata | null>(null)
  statoRef.current = parole && livello ? { livello, tempoMs, parole } : null

  useEffect(() => {
    // Il file si scarica mentre si sceglie il livello: al tocco su Comincia c'e' gia'.
    void fileLibere().catch(() => undefined)
  }, [])

  // Ritrovata la partita lasciata, lo si dice al registro una volta sola; senza, ci si mette d'accordo con lui.
  const vistoIniziale = useRef(false)
  useEffect(() => {
    if (!salva || vistoIniziale.current) return
    vistoIniziale.current = true
    if (iniziale) riprendiSospesa('anagrammi')
    else partitaInSospeso()
  }, [salva, iniziale])

  const cambia = useCallback((k: number, f: (p: Parola) => Parola) => {
    setParole((prima) => prima && prima.map((p, i) => (i === k ? f(p) : p)))
  }, [])

  const corrente = parole ? parole.findIndex((p) => p.aperta !== null && p.esito === null) : -1

  const comincia = useCallback(
    (l: LivelloAnagrammi, opzioni: OpzioniPartita = {}) => {
      setErrore(null)
      fileLibere()
        .then((file) => {
          // Una partita nuova prende il posto di quella lasciata: la pagina l'ha chiesto prima.
          if (salva) {
            salvaPartitaAnagrammi(null)
            chiudiSospesa('anagrammi', 'annullata')
          }
          conta.current = opzioni.conta ?? true
          setTempoMs(opzioni.tempoParolaMs ?? TEMPO_PAROLA_MS)
          setLivello(l)
          setFerma(null)
          setParole(pesca(file, l, opzioni.seme !== undefined ? mulberry32(opzioni.seme) : Math.random))
        })
        .catch(() => setErrore('Non riesco a scaricare le parole. Riprova fra poco.'))
    },
    [salva],
  )

  const ricomincia = useCallback(() => {
    setParole(null)
    setLivello(null)
  }, [])

  const riprendi = useCallback(() => {
    const p = partitaInSospeso()
    if (!p) return
    conta.current = true
    setTempoMs(p.tempoMs)
    setLivello(p.livello)
    setFerma(null)
    setParole(p.parole)
    riprendiSospesa('anagrammi')
  }, [])

  const lascia = useCallback(() => {
    salvaPartitaAnagrammi(null)
    chiudiSospesa('anagrammi', 'annullata')
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
      const ms = Math.min(tempoRef.current, Date.now() - (parola.aperta ?? Date.now()))
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

  // Ogni mossa si salva, con il biglietto delle sospese; finita la partita, il salvataggio se ne va.
  useEffect(() => {
    if (!salva || !parole || !livello) return
    if (finita) {
      salvaPartitaAnagrammi(null)
      chiudiSospesa('anagrammi', 'finita')
      return
    }
    const p = { livello, tempoMs, parole }
    salvaPartitaAnagrammi(p, fermaRef.current ?? Date.now())
    segnaSospesa('anagrammi', {
      a: RIPRENDI_ANAGRAMMI,
      dettaglio: dettaglioAnagrammi(p),
      chiavi: [CHIAVE_PARTITA_ANAGRAMMI],
    })
  }, [salva, parole, livello, tempoMs, finita])

  /*
   * Il tempo della parola aperta si salva anche fra una mossa e l'altra: ogni
   * tanto, a pagina nascosta, e uscendo. A pagina nascosta si ferma, e
   * tornando riparte da dove era: la parola aperta si sposta avanti di quanto
   * si e' stati via.
   */
  const inCorso = salva && parole !== null && !finita
  useEffect(() => {
    if (!inCorso) return
    const salvaOra = () => {
      const p = statoRef.current
      if (p && !p.parole.every((x) => x.esito !== null)) salvaPartitaAnagrammi(p, fermaRef.current ?? Date.now())
    }
    const onVisibilita = () => {
      if (document.visibilityState === 'hidden') {
        if (fermaRef.current === null) {
          fermaRef.current = Date.now()
          setFerma(fermaRef.current)
        }
        salvaOra()
      } else if (fermaRef.current !== null) {
        const via = Date.now() - fermaRef.current
        fermaRef.current = null
        setFerma(null)
        setParole(
          (prima) =>
            prima &&
            prima.map((p) => (p.aperta !== null && p.esito === null ? { ...p, aperta: p.aperta + via } : p)),
        )
      }
    }
    document.addEventListener('visibilitychange', onVisibilita)
    window.addEventListener('pagehide', salvaOra)
    const id = window.setInterval(salvaOra, SALVA_TEMPO_MS)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilita)
      window.removeEventListener('pagehide', salvaOra)
      window.clearInterval(id)
      salvaOra()
    }
  }, [inCorso])

  // Una partita finita si conta una volta: la riconosce l'elenco delle sue parole, che e' suo.
  const contata = useRef<Parola[] | null>(null)
  useEffect(() => {
    if (!finita || !parole || contata.current === parole || !conta.current) return
    contata.current = parole
    const giocate = parole.map((p) => ({
      lettere: p.parola.length,
      trovata: p.esito === 'trovata',
      ms: p.ms ?? 0,
      aiuto: p.aiuto,
    }))
    registraLiberaAnagrammi(giocate.filter((p) => p.trovata).length, puntiAnagrammi(giocate, tempoRef.current))
  }, [finita, parole])
  const vista: VistaAnagrammi | null = parole
    ? {
        parole: parole.map((p) => vistaDi(p, tempoMs)),
        corrente: corrente >= 0 ? corrente : null,
        // A pagina nascosta la parola resta aperta, ma il suo tempo non corre.
        scadenza: corrente >= 0 && ferma === null ? parole[corrente].aperta! + tempoMs : null,
        scaduta: false,
        tempoParolaMs: tempoMs,
        occupato: false,
        finita,
      }
    : null
  const punti = parole
    ? puntiAnagrammi(
        parole
          .filter((p) => p.esito !== null)
          .map((p) => ({ lettere: p.parola.length, trovata: p.esito === 'trovata', ms: p.ms ?? 0, aiuto: p.aiuto })),
        tempoMs,
      )
    : 0

  return { livello, vista, punti, errore, comincia, ricomincia, riprendi, lascia, apri, prova, aiuto, passo, scade }
}

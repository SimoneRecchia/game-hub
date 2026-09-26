import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LATO, sacchettoDaSeme, type Mossa } from '@shared/scarabeo'
import {
  caselleDi,
  statoLibera,
  type Livello,
  type PartitaLibera,
  type StatoLibera,
} from '@shared/scarabeo-computer'
import type { CellaPiena, StatisticheScarabeoLibero } from '@shared/types'
import { api } from '@/lib/api'
import { haptic } from '@/lib/haptics'
import { mossaDelComputer, preparaComputer } from './computer'
import { leggiPartitaLibera, salvaPartitaLibera } from './libera'
import { useParoleSconosciute } from './useScarabeo'
import { useComposizione, type Composizione } from './useComposizione'

/** Quanto "pensa" il computer, almeno: una risposta istantanea sembra un trucco. */
const PENSA_ALMENO_MS = 900

export interface ScarabeoLiberoController extends Composizione {
  partita: PartitaLibera | null
  stato: StatoLibera | null
  /** Il computer sta cercando la sua mossa. */
  pensa: boolean
  /** Le caselle dell'ultima mossa del computer: si illuminano per un attimo. */
  ultimaDelComputer: Set<number>
  sconosciute: string[] | null
  /** Il dizionario non si e' scaricato: senza, qui non si gioca. */
  guasto: string | null
  statistiche: StatisticheScarabeoLibero | null
  nuova: (livello: Livello) => void
  abbandona: () => void
  gioca: () => void
  passa: () => void
  cambia: (tessere: string[]) => void
}

function celleDa(stato: StatoLibera | null): CellaPiena[] {
  const celle: CellaPiena[] = []
  stato?.tabellone.forEach((casella, i) => {
    if (casella) celle.push({ r: Math.floor(i / LATO), c: i % LATO, lettera: casella.lettera, jolly: casella.jolly })
  })
  return celle
}

/** Quel che si annuncia dopo la mossa del computer. */
function annuncio(partita: PartitaLibera, mossa: Mossa, sacchetto: readonly string[]): string {
  const ultima = statoLibera({ ...partita, mosse: [...partita.mosse, mossa] }, sacchetto).giocate.at(-1)
  if (!ultima || ultima.tipo === 'passo') return 'Il computer passa'
  if (ultima.tipo === 'cambio') return 'Il computer cambia le tessere'
  return `Il computer gioca ${ultima.parole[0]?.toUpperCase() ?? ''} · +${ultima.punti}`
}

/**
 * Una partita libera di Scarabeo contro il computer, tutta nel browser.
 *
 * Il computer gira in un Web Worker con il dizionario intero; le regole sono
 * quelle della classificata (shared/scarabeo.ts) e la partita si salva come
 * mosse, nel browser, a ogni turno. A partita finita va al server, che la
 * rigioca per le statistiche.
 */
export function useScarabeoLibero(): ScarabeoLiberoController {
  const [partita, setPartita] = useState<PartitaLibera | null>(() => leggiPartitaLibera())
  const [pensa, setPensa] = useState(false)
  const [ultimaDelComputer, setUltima] = useState<Set<number>>(new Set())
  const [guasto, setGuasto] = useState<string | null>(null)
  const [statistiche, setStatistiche] = useState<StatisticheScarabeoLibero | null>(null)
  const inviata = useRef<number | null>(null)

  const sacchetto = useMemo(() => (partita ? sacchettoDaSeme(partita.seme) : null), [partita?.seme])
  const stato = useMemo(() => (partita && sacchetto ? statoLibera(partita, sacchetto) : null), [partita, sacchetto])
  const celle = useMemo(() => celleDa(stato), [stato])

  const composizione = useComposizione({
    celle,
    leggio: stato?.mioLeggio ?? [],
    bloccata: !stato || stato.turno !== 'io' || pensa,
  })
  const { anteprima, sospese, annulla, avvisa } = composizione
  const sconosciute = useParoleSconosciute(anteprima)

  useEffect(() => {
    preparaComputer().catch(() => setGuasto('Il dizionario non si è scaricato: controlla la connessione e riprova.'))
    void api<StatisticheScarabeoLibero>('/scarabeo/libera')
      .then(setStatistiche)
      .catch(() => {})
  }, [])

  /** Aggiunge una mossa alla partita e la salva. */
  const aggiungi = useCallback((mossa: Mossa) => {
    setPartita((prima) => {
      if (!prima) return prima
      const dopo = { ...prima, mosse: [...prima.mosse, mossa] }
      salvaPartitaLibera(dopo)
      return dopo
    })
  }, [])

  // Il turno del computer: pensa almeno un attimo, poi muove, e la sua mossa si illumina.
  useEffect(() => {
    if (!partita || !sacchetto || stato?.turno !== 'computer' || pensa) return
    let annullato = false
    setPensa(true)
    const inizio = performance.now()
    mossaDelComputer(partita)
      .then(async (mossa) => {
        const resto = PENSA_ALMENO_MS - (performance.now() - inizio)
        if (resto > 0) await new Promise((r) => setTimeout(r, resto))
        if (annullato || !mossa) return
        avvisa(annuncio(partita, mossa, sacchetto))
        aggiungi(mossa)
        const caselle = caselleDi(mossa)
        setUltima(new Set(caselle))
        if (caselle.length > 0) haptic('tap')
        window.setTimeout(() => setUltima(new Set()), 2400)
      })
      .catch(() => {
        if (!annullato) setGuasto('Il computer non risponde: riprova fra poco.')
      })
      .finally(() => {
        if (!annullato) setPensa(false)
      })
    return () => {
      annullato = true
      setPensa(false)
    }
    // `pensa` resta fuori di proposito: e' questo effetto ad accenderlo.
  }, [aggiungi, avvisa, partita, sacchetto, stato?.turno])

  // A partita finita: al server per le statistiche, una volta, e via dal browser.
  useEffect(() => {
    if (!partita || !stato?.finita || inviata.current === partita.seme) return
    inviata.current = partita.seme
    salvaPartitaLibera(null)
    haptic(stato.esito === 'vinta' ? 'success' : 'tap')
    void api<StatisticheScarabeoLibero>('/scarabeo/libera', { method: 'POST', body: partita })
      .then(setStatistiche)
      .catch(() => {
        /* le statistiche sono un contorno: la partita e' finita comunque */
      })
  }, [partita, stato?.finita, stato?.esito])

  const nuova = useCallback(
    (livello: Livello) => {
      const seme = crypto.getRandomValues(new Uint32Array(1))[0]
      const nuovaPartita: PartitaLibera = { seme, livello, mosse: [] }
      salvaPartitaLibera(nuovaPartita)
      inviata.current = null
      annulla()
      setGuasto(null)
      setPartita(nuovaPartita)
    },
    [annulla],
  )

  const gioca = useCallback(() => {
    if (sospese.length === 0) {
      avvisa('Posa almeno una tessera.')
      return
    }
    if (anteprima && !anteprima.ok) {
      haptic('error')
      avvisa(anteprima.errore)
      return
    }
    if (sconosciute === null) {
      avvisa('Controllo il dizionario…')
      return
    }
    if (sconosciute.length > 0) {
      haptic('error')
      avvisa(`${sconosciute.map((p) => p.toUpperCase()).join(', ')} non è nel dizionario.`)
      return
    }
    const punti = anteprima?.ok ? anteprima.punti : 0
    aggiungi({ tipo: 'posa', posa: sospese })
    annulla()
    avvisa(anteprima?.ok && anteprima.scarabeo ? `Scarabeo! +${punti}` : `+${punti} punti`)
  }, [aggiungi, anteprima, annulla, avvisa, sconosciute, sospese])

  return {
    ...composizione,
    partita,
    stato,
    pensa,
    ultimaDelComputer,
    sconosciute,
    guasto,
    statistiche,
    nuova,
    abbandona: () => {
      salvaPartitaLibera(null)
      annulla()
      setPartita(null)
    },
    gioca,
    passa: () => {
      annulla()
      aggiungi({ tipo: 'passo' })
    },
    cambia: (tessere) => {
      annulla()
      aggiungi({ tipo: 'cambio', tessere })
      avvisa(`${tessere.length} tessere cambiate.`)
    },
  }
}

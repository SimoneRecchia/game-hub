import { useCallback, useEffect, useRef, useState } from 'react'
import { TEMPO_NOMI_MS, type CategoriaNomi, type FileLessicoNomi, type LessicoNomi } from '@shared/nomi-cose'
import { registraPartitaNomi } from './conti'
import {
  caricaLessico,
  letteraACaso,
  lessicoDellaPartita,
  nuovaPartita,
  risultato as risultatoDi,
  scritteDalComputer,
  type LivelloNomi,
  type PartitaLibera,
  type RisultatoLibero,
} from './libera'
import type { RisposteNomi } from './useNomiDelGiorno'

export type FaseLibera = 'scelta' | 'carica' | 'gioco' | 'fine'

/** Chi ha detto stop: io, il computer, o nessuno prima della fine del tempo. */
export type ChiStop = 'io' | 'computer' | 'tempo'

export interface NomiLibera {
  fase: FaseLibera
  partita: PartitaLibera | null
  file: FileLessicoNomi | null
  risposte: RisposteNomi
  /** Quando finisce il tempo, sull'orologio del telefono. */
  scadenza: number | null
  /** Quante risposte ha scritto il computer finora. */
  scritteComputer: number
  stop: ChiStop | null
  risultato: RisultatoLibero | null
  guasto: string | null
  nuova: (livello: LivelloNomi) => void
  scrivi: (categoria: CategoriaNomi, testo: string) => void
  dicoStop: () => void
  tempoFinito: () => void
  scegli: () => void
}

/**
 * Una partita libera contro il computer, tutta nel telefono. Il lessico della
 * lettera si scarica quando si comincia, e il tempo parte quando e' arrivato.
 */
export function useNomiLibera(): NomiLibera {
  const [fase, setFase] = useState<FaseLibera>('scelta')
  const [partita, setPartita] = useState<PartitaLibera | null>(null)
  const [file, setFile] = useState<FileLessicoNomi | null>(null)
  const [risposte, setRisposte] = useState<RisposteNomi>({})
  const [scadenza, setScadenza] = useState<number | null>(null)
  const [adesso, setAdesso] = useState(() => Date.now())
  const [stop, setStop] = useState<ChiStop | null>(null)
  const [risultato, setRisultato] = useState<RisultatoLibero | null>(null)
  const [guasto, setGuasto] = useState<string | null>(null)
  const inizio = useRef(0)
  const lessico = useRef<LessicoNomi | null>(null)
  const risposteRef = useRef(risposte)
  risposteRef.current = risposte
  const finita = useRef(false)
  const richiesta = useRef(0)

  const chiudi = useCallback(
    (chi: ChiStop) => {
      if (finita.current || !partita || !lessico.current) return
      finita.current = true
      const ms = chi === 'computer' ? partita.stopMs : Math.min(TEMPO_NOMI_MS, Date.now() - inizio.current)
      const r = risultatoDi(partita, lessico.current, risposteRef.current, ms)
      registraPartitaNomi(r.esito, r.mie.filter(Boolean).length)
      setStop(chi)
      setRisultato(r)
      setScadenza(null)
      setFase('fine')
    },
    [partita],
  )

  // Il computer scrive e dice stop da solo, mentre si gioca.
  useEffect(() => {
    if (fase !== 'gioco' || !partita) return
    const giro = window.setInterval(() => setAdesso(Date.now()), 500)
    const quando = inizio.current + partita.stopMs - Date.now()
    const suo = window.setTimeout(() => chiudi('computer'), Math.max(0, quando))
    return () => {
      window.clearInterval(giro)
      window.clearTimeout(suo)
    }
  }, [chiudi, fase, partita])

  const nuova = useCallback((livello: LivelloNomi) => {
    const mia = ++richiesta.current
    const { lettera, categorie } = letteraACaso()
    setGuasto(null)
    setFase('carica')
    setRisultato(null)
    setStop(null)
    setRisposte({})
    caricaLessico(lettera)
      .then((letto) => {
        if (mia !== richiesta.current) return
        const p = nuovaPartita(letto, lettera, categorie, livello)
        lessico.current = lessicoDellaPartita(letto, categorie)
        finita.current = false
        inizio.current = Date.now()
        setFile(letto)
        setPartita(p)
        setAdesso(inizio.current)
        setScadenza(inizio.current + TEMPO_NOMI_MS)
        setFase('gioco')
      })
      .catch(() => {
        if (mia !== richiesta.current) return
        setGuasto('Non riesco a scaricare le parole. Controlla la connessione e riprova.')
        setFase('scelta')
      })
  }, [])

  const scrivi = useCallback(
    (categoria: CategoriaNomi, testo: string) => {
      if (fase !== 'gioco' || finita.current) return
      setRisposte((r) => ({ ...r, [categoria]: testo }))
    },
    [fase],
  )

  const scegli = useCallback(() => {
    richiesta.current += 1
    setFase('scelta')
    setPartita(null)
    setRisultato(null)
    setStop(null)
  }, [])

  return {
    fase,
    partita,
    file,
    risposte,
    scadenza,
    scritteComputer: partita && fase === 'gioco' ? scritteDalComputer(partita, adesso - inizio.current) : 0,
    stop,
    risultato,
    guasto,
    nuova,
    scrivi,
    dicoStop: () => chiudi('io'),
    tempoFinito: () => chiudi('tempo'),
    scegli,
  }
}

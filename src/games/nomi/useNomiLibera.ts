import { useCallback, useEffect, useRef, useState } from 'react'
import { ROTTE } from '@/app/rotte'
import { chiudiSospesa, riprendiSospesa, segnaSospesa, sospesaDi } from '@/games/sospese/registro'
import { SECONDI_NOMI, type CategoriaNomi, type FileLessicoNomi, type LessicoNomi } from '@shared/nomi-cose'
import { registraPartitaNomi } from './conti'
import {
  CHIAVE_PARTITA_NOMI,
  caricaLessico,
  leggiNomiSospesa,
  letteraACaso,
  lessicoDellaPartita,
  nuovaPartita,
  risultato as risultatoDi,
  salvaNomiSospesa,
  scritteDalComputer,
  type LivelloNomi,
  type NomiSospesa,
  type PartitaLibera,
  type RisultatoLibero,
} from './libera'
import type { RisposteNomi } from './useNomiDelGiorno'

/**
 * `pronta`: il lessico c'e' e la lettera si sa, ma il tempo non corre ancora.
 * Parte quando la lettera si vede (`parti`), cioe' quando il rullo si ferma: la
 * scena non toglie tempo a chi gioca, e non lo regala al computer.
 * `riprende`: una partita lasciata a meta' aspetta le parole della sua lettera,
 * e poi torna al foglio senza il rullo, che la lettera l'ha gia' detta.
 */
export type FaseLibera = 'scelta' | 'carica' | 'pronta' | 'riprende' | 'gioco' | 'fine'

/** Chi ha detto stop: io, il computer, o nessuno prima della fine del tempo. */
export type ChiStop = 'io' | 'computer' | 'tempo'

export interface NomiLibera {
  fase: FaseLibera
  partita: PartitaLibera | null
  file: FileLessicoNomi | null
  risposte: RisposteNomi
  /** Quando finisce il tempo, sull'orologio del telefono; null se non corre, anche a pagina nascosta. */
  scadenza: number | null
  /** Quante risposte ha scritto il computer finora. */
  scritteComputer: number
  stop: ChiStop | null
  risultato: RisultatoLibero | null
  guasto: string | null
  /** Quanto dura la partita, in millisecondi. */
  tempoMs: number
  nuova: (livello: LivelloNomi, secondi?: number) => void
  /** La lettera si vede: da qui corre il tempo, e il computer comincia a scrivere. */
  parti: () => void
  scrivi: (categoria: CategoriaNomi, testo: string) => void
  dicoStop: () => void
  tempoFinito: () => void
  scegli: () => void
  /** Riprende la partita lasciata a meta', se c'e'. */
  riprendi: () => void
  /** Lascia la partita in corso, o quella in sospeso: se ne va, e non si conta. */
  lascia: () => void
}

/** Dove si riprende la partita lasciata: la pagina della libera, che la riapre da sola. */
export const RIPRENDI_NOMI = `${ROTTE.libera('nomi')}?riprendi=1`

/** Ogni quanto si salva il tempo mentre si gioca: chi chiude l'app di colpo perde al piu' questo. */
const SALVA_MS = 5_000
/** Le risposte si salvano dopo un attimo di pausa, non a ogni tasto. */
const SALVA_RISPOSTE_MS = 400

/** "1:40": il tempo che resta, sul biglietto delle Libere. */
function orologio(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1_000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * La partita salvata, se il registro la tiene ancora. Le Libere la possono
 * lasciare, e il registro farla scadere, buttando il salvataggio: qui si butta
 * anche il caso contrario, un biglietto senza partita, che non porterebbe a
 * niente.
 */
function salvata(): NomiSospesa | null {
  const s = leggiNomiSospesa()
  const nelRegistro = sospesaDi('nomi')
  if (s && !nelRegistro) {
    salvaNomiSospesa(null)
    return null
  }
  if (!s && nelRegistro) chiudiSospesa('nomi', 'annullata')
  return s
}

/**
 * Una partita libera contro il computer, tutta nel telefono. Il lessico della
 * lettera si scarica quando si comincia, e il tempo parte quando la lettera si
 * vede. Lasciata a meta' resta in sospeso: si salva con il tempo gia' giocato,
 * e l'orologio — il mio e quello del computer — sta fermo finché non si torna,
 * anche solo a pagina nascosta.
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
  /** Quando sarebbe cominciata la partita se non la si fosse mai lasciata: si sposta avanti a ogni pausa. */
  const inizio = useRef(0)
  /** Da quando la pagina e' nascosta, mentre si gioca. */
  const pausa = useRef<number | null>(null)
  const lessico = useRef<LessicoNomi | null>(null)
  const risposteRef = useRef(risposte)
  risposteRef.current = risposte
  const partitaRef = useRef(partita)
  partitaRef.current = partita
  const faseRef = useRef(fase)
  faseRef.current = fase
  const finita = useRef(false)
  const richiesta = useRef(0)

  /** Scrive la partita in corso e il suo biglietto; da `pronta` in poi, finché non e' finita. */
  const salva = useCallback(() => {
    const p = partitaRef.current
    const f = faseRef.current
    if (!p || finita.current || (f !== 'pronta' && f !== 'gioco')) return
    const giocati = f === 'gioco' ? Math.max(0, Math.min(p.tempoMs, (pausa.current ?? Date.now()) - inizio.current)) : 0
    salvaNomiSospesa({ partita: p, risposte: risposteRef.current, trascorsi: giocati })
    segnaSospesa('nomi', {
      a: RIPRENDI_NOMI,
      dettaglio: `Lettera ${p.lettera.toUpperCase()} · ${orologio(p.tempoMs - giocati)} rimasti`,
      chiavi: [CHIAVE_PARTITA_NOMI],
    })
  }, [])

  const chiudi = useCallback(
    (chi: ChiStop) => {
      if (finita.current || !partita || !lessico.current) return
      finita.current = true
      const ms = chi === 'computer' ? partita.stopMs : Math.min(partita.tempoMs, Date.now() - inizio.current)
      const r = risultatoDi(partita, lessico.current, risposteRef.current, ms)
      registraPartitaNomi(r.esito, r.mie.filter(Boolean).length)
      salvaNomiSospesa(null)
      chiudiSospesa('nomi', 'finita')
      setStop(chi)
      setRisultato(r)
      setScadenza(null)
      setFase('fine')
    },
    [partita],
  )

  // Un biglietto senza partita, o una partita senza biglietto, se ne vanno subito.
  useEffect(() => {
    salvata()
    return () => {
      // Una lettera che arriva a pagina chiusa non apre niente.
      richiesta.current += 1
    }
  }, [])

  // Il computer scrive e dice stop da solo, mentre si gioca e l'orologio corre.
  useEffect(() => {
    if (fase !== 'gioco' || !partita || scadenza === null) return
    const giro = window.setInterval(() => setAdesso(Date.now()), 500)
    const quando = inizio.current + partita.stopMs - Date.now()
    const suo = window.setTimeout(() => chiudi('computer'), Math.max(0, quando))
    return () => {
      window.clearInterval(giro)
      window.clearTimeout(suo)
    }
  }, [chiudi, fase, partita, scadenza])

  // La lettera si sa: la partita c'e', e se si va via adesso la si ritrova.
  useEffect(() => {
    if (fase === 'pronta') salva()
  }, [fase, salva])

  // Le risposte si salvano mentre si scrive.
  useEffect(() => {
    if (fase !== 'gioco') return
    const t = window.setTimeout(salva, SALVA_RISPOSTE_MS)
    return () => window.clearTimeout(t)
  }, [fase, risposte, salva])

  // A pagina nascosta l'orologio si ferma, e riparte da li' quando si torna; uscendo, la partita si salva.
  useEffect(() => {
    if (fase !== 'gioco' || !partita) return
    const ferma = () => {
      if (pausa.current === null) pausa.current = Date.now()
      setScadenza(null)
      salva()
    }
    const riparti = () => {
      if (pausa.current === null) return
      inizio.current += Date.now() - pausa.current
      pausa.current = null
      setAdesso(Date.now())
      setScadenza(inizio.current + partita.tempoMs)
    }
    const onVisibilita = () => (document.visibilityState === 'hidden' ? ferma() : riparti())
    document.addEventListener('visibilitychange', onVisibilita)
    window.addEventListener('pagehide', salva)
    const id = window.setInterval(salva, SALVA_MS)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilita)
      window.removeEventListener('pagehide', salva)
      window.clearInterval(id)
      salva()
    }
  }, [fase, partita, salva])

  const nuova = useCallback((livello: LivelloNomi, secondi: number = SECONDI_NOMI) => {
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
        const p = nuovaPartita(letto, lettera, categorie, livello, Math.random, secondi * 1_000)
        lessico.current = lessicoDellaPartita(letto, categorie)
        finita.current = false
        pausa.current = null
        setFile(letto)
        setPartita(p)
        setFase('pronta')
      })
      .catch(() => {
        if (mia !== richiesta.current) return
        setGuasto('Non riesco a scaricare le parole. Controlla la connessione e riprova.')
        setFase('scelta')
      })
  }, [])

  const riprendi = useCallback(() => {
    const s = salvata()
    if (!s) return
    const mia = ++richiesta.current
    riprendiSospesa('nomi')
    setGuasto(null)
    setRisultato(null)
    setStop(null)
    setPartita(null)
    setFase('riprende')
    caricaLessico(s.partita.lettera)
      .then((letto) => {
        if (mia !== richiesta.current) return
        lessico.current = lessicoDellaPartita(letto, s.partita.categorie)
        finita.current = false
        pausa.current = null
        inizio.current = Date.now() - s.trascorsi
        setFile(letto)
        setPartita(s.partita)
        setRisposte(s.risposte)
        setAdesso(Date.now())
        setScadenza(inizio.current + s.partita.tempoMs)
        setFase('gioco')
      })
      .catch(() => {
        if (mia !== richiesta.current) return
        setGuasto('Non riesco a scaricare le parole. Controlla la connessione e riprova.')
        setFase('scelta')
      })
  }, [])

  const parti = useCallback(() => {
    if (fase !== 'pronta' || !partita) return
    inizio.current = Date.now()
    pausa.current = null
    setAdesso(inizio.current)
    setScadenza(inizio.current + partita.tempoMs)
    setFase('gioco')
  }, [fase, partita])

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

  const lascia = useCallback(() => {
    richiesta.current += 1
    // Prima di tutto: gli effetti che si chiudono salvando non devono rimetterla.
    finita.current = true
    partitaRef.current = null
    pausa.current = null
    salvaNomiSospesa(null)
    chiudiSospesa('nomi', 'annullata')
    setFase('scelta')
    setPartita(null)
    setRisultato(null)
    setStop(null)
    setScadenza(null)
    setRisposte({})
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
    tempoMs: partita?.tempoMs ?? SECONDI_NOMI * 1_000,
    nuova,
    parti,
    scrivi,
    dicoStop: () => chiudi('io'),
    tempoFinito: () => chiudi('tempo'),
    scegli,
    riprendi,
    lascia,
  }
}

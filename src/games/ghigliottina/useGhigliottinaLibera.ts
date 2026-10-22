import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  COPPIE_GHIGLIOTTINA,
  MONTEPREMI_GHIGLIOTTINA,
  PREAMBOLO_PRIMA_COPPIA_MS,
  TEMPO_FINALE_MS,
  TEMPO_SCELTA_MS,
  disponiGhigliottina,
  montepremi,
  normalizzaGhigliottina,
  puntiGhigliottina,
  rispostaGiusta,
  preamboloCoppia,
  type GhigliottinaDelGiorno,
  type GhigliottinaDellElenco,
  type SceltaGhigliottina,
} from '@shared/ghigliottina'
import { mulberry32 } from '@shared/daily'
import { VERSIONE_LIBERE_GHIGLIOTTINA } from '@shared/ghigliottina-libere'
import { chiudiSospesa, riprendiSospesa, segnaSospesa, sospesaDi } from '@/games/sospese/registro'
import { adessoVisibile } from '@/lib/tempoVisibile'
import { leggiContiGhigliottina, registraLiberaGhigliottina } from './conti'
import {
  CHIAVE_PARTITA,
  RIPRENDI,
  daSalvare,
  dettaglioDi,
  leggiSalvata,
  partitaDa,
  type GhigliottinaSalvata,
} from './sospesa'
import type { ComandiGhigliottina, VistaGhigliottina } from './Partita'

/** Il file delle libere: la soluzione, e per ogni parola giusta l'esca e l'espressione. */
interface FileLibere {
  ghigliottine: Array<[string, GhigliottinaDellElenco['c']]>
}

let caricato: Promise<FileLibere> | null = null

/** Il file delle ghigliottine, scaricato una volta: sta sotto /dati/, in cache per sempre con la sua impronta. */
function fileLibere(): Promise<FileLibere> {
  caricato ??= fetch(`/dati/ghigliottina/libere.json?v=${VERSIONE_LIBERE_GHIGLIOTTINA}`).then((r) => {
    if (!r.ok) throw new Error(`Ghigliottine: ${r.status}`)
    return r.json() as Promise<FileLibere>
  })
  caricato.catch(() => {
    caricato = null
  })
  return caricato
}

/**
 * Come si gioca una partita: il seme della sfida, se e' una sfida, il tempo di
 * ogni coppia e quello della parola vincente, e se va nei conti.
 */
export interface OpzioniPartita {
  seme?: number
  tempoSceltaMs?: number
  tempoFinaleMs?: number
  conta?: boolean
}

export interface PartitaGhigliottinaLibera {
  giorno: GhigliottinaDelGiorno
  /**
   * Da dove viene, per salvarla: la soluzione e il seme che ne ha disposto le
   * coppie. Null in una sfida, che non resta in sospeso.
   */
  voce: { s: string; seme: number } | null
  tempoSceltaMs: number
  tempoFinaleMs: number
  conta: boolean
  /** Si e' premuto Comincia: prima non si vede nessuna coppia, come nella classificata. */
  iniziata: boolean
  scelte: SceltaGhigliottina[]
  /** Il tempo della coppia di adesso, sull'orologio del telefono. */
  orologioCoppia: { inizio: number; scadenza: number } | null
  /** Quando finisce il tempo della parola vincente. */
  scadenza: number | null
  risposta: string | null
  indovinata: boolean | null
  finita: boolean
}

type Partita = PartitaGhigliottinaLibera

/**
 * L'ora dei tempi di una partita: in una libera si ferma a pagina nascosta,
 * perché lasciata resta in sospeso; in una sfida e' quella di tutti e due.
 */
const oraDi = (p: Partita) => (p.voce ? adessoVisibile() : Date.now())

/** La partita salvata nel telefono, se c'e' ed e' buona. */
function leggiDalTelefono(): GhigliottinaSalvata | null {
  try {
    return leggiSalvata(localStorage.getItem(CHIAVE_PARTITA))
  } catch {
    return null
  }
}

/** Toglie dal telefono la partita salvata. */
function togliSalvata(): void {
  try {
    localStorage.removeItem(CHIAVE_PARTITA)
  } catch {
    /* senza localStorage non c'era niente da togliere */
  }
}

function vistaDa(p: PartitaGhigliottinaLibera): VistaGhigliottina {
  const sbagliate = p.scelte.filter((s, i) => s !== p.giorno.coppie[i].giusta).length
  const viste = !p.iniziata ? 0 : p.finita ? COPPIE_GHIGLIOTTINA : Math.min(COPPIE_GHIGLIOTTINA, p.scelte.length + 1)
  const corrente = !p.finita && p.scelte.length < COPPIE_GHIGLIOTTINA ? p.scelte.length : null
  return {
    iniziata: p.iniziata,
    coppie: p.giorno.coppie.slice(0, viste).map((c, i) => ({
      parole: c.parole,
      scelta: p.scelte[i] ?? null,
      scaduta: p.scelte[i] === null,
      giusta: p.scelte[i] !== undefined || p.finita ? c.giusta : null,
      spiegazione: p.finita ? c.spiegazione : null,
    })),
    totaleCoppie: COPPIE_GHIGLIOTTINA,
    corrente,
    montepremiIniziale: MONTEPREMI_GHIGLIOTTINA,
    montepremi: montepremi(sbagliate),
    orologioCoppia: corrente !== null ? p.orologioCoppia : null,
    tempoSceltaMs: p.tempoSceltaMs,
    finaleAperto: !p.finita && p.scadenza !== null,
    scadenza: p.scadenza,
    tempoFinaleMs: p.tempoFinaleMs,
    soluzione: p.finita ? p.giorno.soluzione : null,
    risposta: p.risposta,
    indovinata: p.indovinata,
    finita: p.finita,
    punti: p.finita ? puntiGhigliottina(sbagliate, p.indovinata === true) : 0,
  }
}

/**
 * La Ghigliottina libera: una a caso fra quelle che non sono mai di un giorno,
 * tutta nel telefono, con le stesse regole e i tempi che si scelgono. Non conta
 * per la classifica; il telefono ricorda le ultime giocate per non ripeterle.
 */
export function useGhigliottinaLibera() {
  const [partita, setPartita] = useState<PartitaGhigliottinaLibera | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [conti, setConti] = useState(leggiContiGhigliottina)
  const ref = useRef(partita)
  ref.current = partita
  /** Il numero della partita: una nuova fa ripartire la scena. */
  const [numero, setNumero] = useState(0)

  const aggiorna = useCallback((p: PartitaGhigliottinaLibera) => {
    ref.current = p
    setPartita(p)
    return vistaDa(p)
  }, [])

  const chiudi = useCallback(
    (p: PartitaGhigliottinaLibera, risposta: string | null) => {
      const indovinata = risposta !== null && rispostaGiusta(p.giorno.soluzione, risposta)
      const chiusa: PartitaGhigliottinaLibera = {
        ...p,
        risposta: risposta ? normalizzaGhigliottina(risposta) || null : null,
        indovinata,
        finita: true,
      }
      const vista = vistaDa(chiusa)
      if (p.conta) setConti(registraLiberaGhigliottina(p.giorno.soluzione, indovinata, vista.punti))
      return aggiorna(chiusa)
    },
    [aggiorna],
  )

  const comincia = useCallback(
    async (opzioni: OpzioniPartita = {}) => {
      setErrore(null)
      try {
        const file = await fileLibere()
        // In una sfida viene dal seme, fra tutte: le gia' giocate non sono le stesse sui due telefoni.
        const caso = opzioni.seme !== undefined ? mulberry32(opzioni.seme) : Math.random
        const giocate = new Set(opzioni.seme !== undefined ? [] : leggiContiGhigliottina().giocate)
        const nuove = file.ghigliottine.filter(([s]) => !giocate.has(s))
        const elenco = nuove.length > 0 ? nuove : file.ghigliottine
        const [s, c] = elenco[Math.floor(caso() * elenco.length)]
        // Da soli le coppie si dispongono con un seme loro, che si salva: la partita lasciata si rimette uguale.
        const seme = opzioni.seme === undefined ? Math.floor(Math.random() * 2 ** 31) : null
        aggiorna({
          giorno: disponiGhigliottina({ s, c }, seme === null ? caso : mulberry32(seme)),
          voce: seme === null ? null : { s, seme },
          tempoSceltaMs: opzioni.tempoSceltaMs ?? TEMPO_SCELTA_MS,
          tempoFinaleMs: opzioni.tempoFinaleMs ?? TEMPO_FINALE_MS,
          conta: opzioni.conta ?? true,
          iniziata: false,
          scelte: [],
          orologioCoppia: null,
          scadenza: null,
          risposta: null,
          indovinata: null,
          finita: false,
        })
        setNumero((n) => n + 1)
      } catch {
        setErrore('Non riesco a scaricare le ghigliottine. Riprova fra poco.')
      }
    },
    [aggiorna],
  )

  const comandi = useMemo<ComandiGhigliottina>(() => {
    /** Una scelta, o il tempo finito: la coppia dopo parte dopo la scena, come sul server. */
    const scegli = (p: PartitaGhigliottinaLibera, scelta: SceltaGhigliottina) => {
      const giusta = scelta !== null && p.giorno.coppie[p.scelte.length].giusta === scelta
      const scelte = [...p.scelte, scelta]
      const inizio = oraDi(p) + preamboloCoppia(giusta)
      return aggiorna({
        ...p,
        scelte,
        orologioCoppia: scelte.length < COPPIE_GHIGLIOTTINA ? { inizio, scadenza: inizio + p.tempoSceltaMs } : null,
      })
    }
    return {
      inizia: async () => {
        const p = ref.current
        if (!p || p.finita) return null
        if (p.iniziata) return vistaDa(p)
        const inizio = oraDi(p) + PREAMBOLO_PRIMA_COPPIA_MS
        return aggiorna({ ...p, iniziata: true, orologioCoppia: { inizio, scadenza: inizio + p.tempoSceltaMs } })
      },
      scadeScelta: async () => {
        const p = ref.current
        if (!p || p.finita || !p.iniziata || p.scelte.length >= COPPIE_GHIGLIOTTINA) return null
        return scegli(p, null)
      },
      scegli: async (scelta) => {
        const p = ref.current
        if (!p || p.finita || !p.iniziata || p.scelte.length >= COPPIE_GHIGLIOTTINA) return null
        // Una scelta a tempo finito e' il tempo finito.
        const tardi = p.orologioCoppia !== null && oraDi(p) > p.orologioCoppia.scadenza
        return scegli(p, tardi ? null : scelta)
      },
      apriFinale: async () => {
        const p = ref.current
        if (!p || p.finita) return null
        if (p.scadenza !== null) return vistaDa(p)
        return aggiorna({ ...p, scadenza: oraDi(p) + p.tempoFinaleMs })
      },
      rispondi: async (parola) => {
        const p = ref.current
        if (!p || p.finita) return null
        // Oltre il minuto non vale, come nella classificata.
        return chiudi(p, p.scadenza !== null && oraDi(p) > p.scadenza ? null : parola)
      },
      scade: () => {
        const p = ref.current
        if (p && !p.finita) chiudi(p, null)
      },
    }
  }, [aggiorna, chiudi])

  /*
   * Una libera cominciata resta in sospeso: si salva a ogni passo, e quando la
   * pagina si nasconde o si lascia, con quanto mancava al tempo di adesso.
   * Finita, se ne va dal telefono e dal registro.
   */
  const salva = useCallback(() => {
    const p = ref.current
    const salvata = p && daSalvare(p, adessoVisibile())
    if (!salvata) return
    try {
      localStorage.setItem(CHIAVE_PARTITA, JSON.stringify(salvata))
    } catch {
      /* Safari privato nega lo storage: la partita resta finché la pagina e' aperta */
    }
  }, [])
  useEffect(() => {
    if (!partita?.voce || !partita.iniziata) return
    if (partita.finita) {
      togliSalvata()
      chiudiSospesa('ghigliottina', 'finita')
      return
    }
    salva()
    segnaSospesa('ghigliottina', { a: RIPRENDI, dettaglio: dettaglioDi(partita), chiavi: [CHIAVE_PARTITA] })
  }, [partita, salva])
  useEffect(() => {
    const nascosta = () => document.hidden && salva()
    document.addEventListener('visibilitychange', nascosta)
    window.addEventListener('pagehide', salva)
    return () => {
      document.removeEventListener('visibilitychange', nascosta)
      window.removeEventListener('pagehide', salva)
      salva()
    }
  }, [salva])

  const [riprendendo, setRiprendendo] = useState(false)
  /**
   * Riapre la partita lasciata, dov'era. Un salvataggio senza la sua voce nel
   * registro e' stato lasciato dalle Libere, o e' scaduto: non c'e' piu'.
   */
  const riprendi = useCallback(async (): Promise<boolean> => {
    const salvata = leggiDalTelefono()
    if (!salvata || !sospesaDi('ghigliottina')) {
      togliSalvata()
      chiudiSospesa('ghigliottina', 'annullata')
      return false
    }
    setErrore(null)
    setRiprendendo(true)
    try {
      const file = await fileLibere()
      const voce = file.ghigliottine.find(([s]) => s === salvata.s)
      if (!voce) {
        // Il file e' cambiato e quella ghigliottina non c'e' piu'.
        togliSalvata()
        chiudiSospesa('ghigliottina', 'annullata')
        return false
      }
      aggiorna(partitaDa(salvata, { s: voce[0], c: voce[1] }, adessoVisibile()))
      setNumero((n) => n + 1)
      riprendiSospesa('ghigliottina')
      return true
    } catch {
      setErrore('Non riesco a scaricare le ghigliottine. Riprova fra poco.')
      return false
    } finally {
      setRiprendendo(false)
    }
  }, [aggiorna])

  /** Lascia la partita in corso, o quella in sospeso prima di cominciarne un'altra: non si riprende piu'. */
  const lascia = useCallback(() => {
    togliSalvata()
    chiudiSospesa('ghigliottina', 'annullata')
    ref.current = null
    setPartita(null)
  }, [])

  const vista = useMemo(() => (partita ? vistaDa(partita) : null), [partita])
  const ricomincia = useCallback(() => {
    ref.current = null
    setPartita(null)
  }, [])
  /** L'ora dei tempi della scena: quella della partita, che da sola si ferma a pagina nascosta. */
  const adesso = partita?.voce ? adessoVisibile : Date.now
  return { vista, comandi, comincia, ricomincia, riprendi, riprendendo, lascia, errore, conti, numero, adesso }
}

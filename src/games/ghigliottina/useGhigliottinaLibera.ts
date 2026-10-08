import { useCallback, useMemo, useRef, useState } from 'react'
import {
  COPPIE_GHIGLIOTTINA,
  MONTEPREMI_GHIGLIOTTINA,
  TEMPO_FINALE_MS,
  disponiGhigliottina,
  montepremi,
  normalizzaGhigliottina,
  puntiGhigliottina,
  rispostaGiusta,
  type GhigliottinaDelGiorno,
  type GhigliottinaDellElenco,
} from '@shared/ghigliottina'
import { mulberry32 } from '@shared/daily'
import { VERSIONE_LIBERE_GHIGLIOTTINA } from '@shared/ghigliottina-libere'
import { leggiContiGhigliottina, registraLiberaGhigliottina } from './conti'
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

/** Come si gioca una partita: il seme della sfida, se e' una sfida, il minuto della finale, e se va nei conti. */
export interface OpzioniPartita {
  seme?: number
  tempoFinaleMs?: number
  conta?: boolean
}

interface Partita {
  giorno: GhigliottinaDelGiorno
  tempoFinaleMs: number
  conta: boolean
  scelte: Array<0 | 1>
  /** Quando finisce il minuto, sull'orologio del telefono. */
  scadenza: number | null
  risposta: string | null
  indovinata: boolean | null
  finita: boolean
}

function vistaDa(p: Partita): VistaGhigliottina {
  const sbagliate = p.scelte.filter((s, i) => s !== p.giorno.coppie[i].giusta).length
  const viste = p.finita ? COPPIE_GHIGLIOTTINA : Math.min(COPPIE_GHIGLIOTTINA, p.scelte.length + 1)
  return {
    coppie: p.giorno.coppie.slice(0, viste).map((c, i) => ({
      parole: c.parole,
      scelta: p.scelte[i] ?? null,
      giusta: p.scelte[i] !== undefined || p.finita ? c.giusta : null,
      spiegazione: p.finita ? c.spiegazione : null,
    })),
    totaleCoppie: COPPIE_GHIGLIOTTINA,
    corrente: !p.finita && p.scelte.length < COPPIE_GHIGLIOTTINA ? p.scelte.length : null,
    montepremiIniziale: MONTEPREMI_GHIGLIOTTINA,
    montepremi: montepremi(sbagliate),
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
 * tutta nel telefono, con le stesse regole e lo stesso minuto. Non conta per la
 * classifica; il telefono ricorda le ultime giocate per non ripeterle.
 */
export function useGhigliottinaLibera() {
  const [partita, setPartita] = useState<Partita | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [conti, setConti] = useState(leggiContiGhigliottina)
  const ref = useRef(partita)
  ref.current = partita
  /** Il numero della partita: una nuova fa ripartire la scena. */
  const [numero, setNumero] = useState(0)

  const aggiorna = useCallback((p: Partita) => {
    ref.current = p
    setPartita(p)
    return vistaDa(p)
  }, [])

  const chiudi = useCallback(
    (p: Partita, risposta: string | null) => {
      const indovinata = risposta !== null && rispostaGiusta(p.giorno.soluzione, risposta)
      const chiusa: Partita = {
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
        aggiorna({
          giorno: disponiGhigliottina({ s, c }, caso),
          tempoFinaleMs: opzioni.tempoFinaleMs ?? TEMPO_FINALE_MS,
          conta: opzioni.conta ?? true,
          scelte: [],
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

  const comandi = useMemo<ComandiGhigliottina>(
    () => ({
      scegli: async (scelta) => {
        const p = ref.current
        if (!p || p.finita || p.scelte.length >= COPPIE_GHIGLIOTTINA) return null
        return aggiorna({ ...p, scelte: [...p.scelte, scelta] })
      },
      apriFinale: async () => {
        const p = ref.current
        if (!p || p.finita) return null
        if (p.scadenza !== null) return vistaDa(p)
        return aggiorna({ ...p, scadenza: Date.now() + p.tempoFinaleMs })
      },
      rispondi: async (parola) => {
        const p = ref.current
        if (!p || p.finita) return null
        // Oltre il minuto non vale, come nella classificata.
        return chiudi(p, p.scadenza !== null && Date.now() > p.scadenza ? null : parola)
      },
      scade: () => {
        const p = ref.current
        if (p && !p.finita) chiudi(p, null)
      },
    }),
    [aggiorna, chiudi],
  )

  const vista = useMemo(() => (partita ? vistaDa(partita) : null), [partita])
  const ricomincia = useCallback(() => {
    ref.current = null
    setPartita(null)
  }, [])
  return { vista, comandi, comincia, ricomincia, errore, conti, numero }
}

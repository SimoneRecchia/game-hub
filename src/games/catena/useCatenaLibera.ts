import { useCallback, useMemo, useRef, useState } from 'react'
import {
  JOLLY_CATENA,
  MONTEPREMI_CATENA,
  NASCOSTE_CATENA,
  PASSO_FINALE,
  PREAMBOLO_FINALE_CATENA_MS,
  TEMPO_FINALE_CATENA_MS,
  applicaCatena,
  compraUsabile,
  jollyUsabile,
  normalizzaCatena,
  puntiCatena,
  stessaParola,
  svolgiCatena,
  vistaCatena,
  type CatenaDelGiorno,
  type MossaCatena,
} from '@shared/catena'
import { VERSIONE_LIBERE_CATENA } from '@shared/catena-libere'
import { mulberry32 } from '@shared/daily'
import { leggiContiCatena, registraLiberaCatena } from './conti'
import type { ComandiCatena, RispostaCatena, VistaCatena } from './Partita'

/** Il file delle libere: per ogni catena le undici parole e le dieci espressioni. */
interface FileLibere {
  catene: Array<[string[], string[]]>
}

let caricato: Promise<FileLibere> | null = null

/** Il file delle catene, scaricato una volta: sta sotto /dati/, in cache per sempre con la sua impronta. */
function fileLibere(): Promise<FileLibere> {
  caricato ??= fetch(`/dati/catena/libere.json?v=${VERSIONE_LIBERE_CATENA}`).then((r) => {
    if (!r.ok) throw new Error(`Catene: ${r.status}`)
    return r.json() as Promise<FileLibere>
  })
  caricato.catch(() => {
    caricato = null
  })
  return caricato
}

/** Come il telefono ricorda una catena giocata: la prima parola e la finale. */
const nomeDi = (parole: readonly string[]) => `${parole[0]}|${parole[NASCOSTE_CATENA[PASSO_FINALE]]}`

/** Come si gioca una partita: il seme della sfida, se e' una sfida, il minuto della finale, e se va nei conti. */
export interface OpzioniPartita {
  seme?: number
  tempoFinaleMs?: number
  conta?: boolean
}

interface Partita {
  catena: CatenaDelGiorno
  tempoFinaleMs: number
  conta: boolean
  mosse: MossaCatena[]
  /** Il minuto della parola finale, sull'orologio del telefono. */
  finale: { inizio: number; scadenza: number } | null
  risposta: string | null
  indovinata: boolean | null
  finita: boolean
}

function vistaDa(p: Partita): VistaCatena {
  const s = svolgiCatena(p.catena, p.mosse)
  return {
    chiave: p.mosse.length * 2 + (p.finita ? 1 : 0),
    nuova: p.mosse.length === 0,
    voci: vistaCatena(p.catena, s, { finita: p.finita, indovinata: p.indovinata }),
    passo: s.passo,
    jollyRestanti: JOLLY_CATENA - s.jollyUsati,
    jollyUsabile: !p.finita && jollyUsabile(p.catena, s),
    terzo: s.terzo,
    compraUsabile: !p.finita && compraUsabile(s),
    montepremiIniziale: MONTEPREMI_CATENA,
    montepremi: s.montepremi,
    finale: p.finita ? null : p.finale,
    tempoFinaleMs: p.tempoFinaleMs,
    risposta: p.risposta,
    indovinata: p.indovinata,
    finita: p.finita,
    punti: p.finita ? puntiCatena(s, p.indovinata === true) : 0,
  }
}

/**
 * La Catena libera: una a caso fra quelle che non sono mai di un giorno, tutta
 * nel telefono, con le stesse regole e lo stesso minuto. Non conta per la
 * classifica; il telefono ricorda le ultime giocate per non ripeterle.
 */
export function useCatenaLibera() {
  const [partita, setPartita] = useState<Partita | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [conti, setConti] = useState(leggiContiCatena)
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
    (p: Partita, risposta: string | null): RispostaCatena => {
      const finale = p.catena.parole[NASCOSTE_CATENA[PASSO_FINALE]]
      const indovinata = risposta !== null && stessaParola(finale, risposta)
      const chiusa: Partita = {
        ...p,
        risposta: risposta ? normalizzaCatena(risposta) || null : null,
        indovinata,
        finita: true,
      }
      const vista = aggiorna(chiusa)
      if (p.conta) setConti(registraLiberaCatena(nomeDi(p.catena.parole), indovinata, vista.punti))
      return { vista, esito: indovinata ? 'giusta' : 'sbagliata' }
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
        const giocate = new Set(opzioni.seme !== undefined ? [] : leggiContiCatena().giocate)
        const nuove = file.catene.filter(([p]) => !giocate.has(nomeDi(p)))
        const elenco = nuove.length > 0 ? nuove : file.catene
        const [parole, espressioni] = elenco[Math.floor(caso() * elenco.length)]
        aggiorna({
          catena: { parole, espressioni },
          tempoFinaleMs: opzioni.tempoFinaleMs ?? TEMPO_FINALE_CATENA_MS,
          conta: opzioni.conta ?? true,
          mosse: [],
          finale: null,
          risposta: null,
          indovinata: null,
          finita: false,
        })
        setNumero((n) => n + 1)
      } catch {
        setErrore('Non riesco a scaricare le catene. Riprova fra poco.')
      }
    },
    [aggiorna],
  )

  /** Il minuto della finale e' finito: oltre non si gioca, come nella classificata. */
  const scaduta = (p: Partita) => p.finale !== null && Date.now() > p.finale.scadenza

  const comandi = useMemo<ComandiCatena>(() => {
    const gioca = async (mossa: MossaCatena): Promise<RispostaCatena | null> => {
      const p = ref.current
      if (!p || p.finita) return null
      if (scaduta(p)) return chiudi(p, null)
      const prima = svolgiCatena(p.catena, p.mosse)
      const fatta = applicaCatena(p.catena, prima, mossa)
      if (!fatta) return null
      const arriva = prima.passo < PASSO_FINALE && fatta.dopo.passo === PASSO_FINALE
      const inizio = Date.now() + PREAMBOLO_FINALE_CATENA_MS
      const vista = aggiorna({
        ...p,
        mosse: [...p.mosse, mossa],
        finale: arriva ? { inizio, scadenza: inizio + p.tempoFinaleMs } : p.finale,
      })
      return { vista, esito: fatta.esito }
    }
    return {
      prova: (parola) => gioca({ k: 'p', w: normalizzaCatena(parola) }),
      jolly: () => gioca({ k: 'j' }),
      compra: () => gioca({ k: 'c' }),
      rispondi: async (parola) => {
        const p = ref.current
        if (!p || p.finita) return null
        return chiudi(p, scaduta(p) ? null : parola)
      },
      scade: () => {
        const p = ref.current
        if (p && !p.finita) chiudi(p, null)
      },
    }
  }, [aggiorna, chiudi])

  const vista = useMemo(() => (partita ? vistaDa(partita) : null), [partita])
  const ricomincia = useCallback(() => {
    ref.current = null
    setPartita(null)
  }, [])
  return { vista, comandi, comincia, ricomincia, errore, conti, numero }
}

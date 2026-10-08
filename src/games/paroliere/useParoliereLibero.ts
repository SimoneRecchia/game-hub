import { useCallback, useMemo, useRef, useState } from 'react'
import { grigliaDelParoliere } from '@/games/scarabeo/computer'
import {
  LETTERE_MINIME,
  TEMPO_PAROLIERE_MS,
  punteggioDi,
  puntiParola,
  stradaDi,
  traguardoDi,
  type LatoParoliere,
} from '@shared/paroliere'
import { leggiContiParoliere, registraLiberaParoliere } from './conti'
import type { ComandiParoliere, EsitoProva, VistaParoliere } from './Partita'

export const LATI_LIBERI = ['4', '5'] as const
export type LatoLibero = (typeof LATI_LIBERI)[number]

/** Come si gioca una partita: il seme della sfida, se e' una sfida, il tempo, e se va nei conti del telefono. */
export interface OpzioniPartita {
  seme?: number
  tempoMs?: number
  conta?: boolean
}

interface Partita {
  lato: LatoParoliere
  seme: number | undefined
  tempoMs: number
  conta: boolean
  griglia: string[] | null
  /** Tutte le parole della griglia che il dizionario conosce: valgono queste. */
  tutte: Set<string>
  comuni: string[]
  trovate: string[]
  scadenza: number | null
  finita: boolean
}

/**
 * Il Paroliere libero: i dadi li tira il telefono, nel lavoratore dello
 * Scarabeo, che ha gia' il dizionario e trova tutte le parole della griglia in
 * un colpo. Da li' ogni parola si controlla subito, senza rete. Il tempo parte
 * quando i dadi sono fermi, e la partita non va al server. In una sfida i dadi
 * cadono dal seme, uguali per tutti e due, e la partita non va nei conti.
 */
export function useParoliereLibero() {
  const [partita, setPartita] = useState<Partita | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [conti, setConti] = useState(leggiContiParoliere)
  /** Il numero della partita: una nuova fa ripartire la scena. */
  const [numero, setNumero] = useState(0)
  const ref = useRef(partita)
  ref.current = partita

  const aggiorna = useCallback((p: Partita) => {
    ref.current = p
    setPartita(p)
  }, [])

  const comincia = useCallback(
    (lato: LatoLibero, opzioni: OpzioniPartita = {}) => {
      setErrore(null)
      aggiorna({
        lato: Number(lato) as LatoParoliere,
        seme: opzioni.seme,
        tempoMs: opzioni.tempoMs ?? TEMPO_PAROLIERE_MS,
        conta: opzioni.conta ?? true,
        griglia: null,
        tutte: new Set(),
        comuni: [],
        trovate: [],
        scadenza: null,
        finita: false,
      })
      setNumero((n) => n + 1)
    },
    [aggiorna],
  )

  const chiudi = useCallback(() => {
    const p = ref.current
    if (!p || p.finita || !p.griglia) return
    aggiorna({ ...p, finita: true })
    if (p.conta) setConti(registraLiberaParoliere(p.lato, p.trovate.length, punteggioDi(p.trovate)))
  }, [aggiorna])

  const comandi = useMemo<ComandiParoliere>(
    () => ({
      inizia: async () => {
        const p = ref.current
        if (!p) return false
        try {
          const g = await grigliaDelParoliere(p.lato, p.seme)
          if (ref.current !== p) return false
          aggiorna({ ...p, griglia: g.griglia, tutte: new Set(g.tutte), comuni: g.comuni })
          return true
        } catch {
          setErrore('Il dizionario non è arrivato. Riprova fra poco.')
          return false
        }
      },
      parti: () => {
        const p = ref.current
        if (p && p.scadenza === null) aggiorna({ ...p, scadenza: Date.now() + p.tempoMs })
      },
      prova: async (parola): Promise<EsitoProva> => {
        const p = ref.current
        if (!p?.griglia || p.finita || p.scadenza === null || Date.now() > p.scadenza) {
          return { esito: 'tempo', valore: 0 }
        }
        if (parola.length < LETTERE_MINIME) return { esito: 'corta', valore: 0 }
        if (!stradaDi(p.griglia, parola)) return { esito: 'griglia', valore: 0 }
        if (p.trovate.includes(parola)) return { esito: 'gia', valore: 0 }
        if (!p.tutte.has(parola)) return { esito: 'sconosciuta', valore: 0 }
        aggiorna({ ...p, trovate: [...p.trovate, parola] })
        return { esito: 'nuova', valore: puntiParola(parola.length) }
      },
      basta: async () => chiudi(),
      scade: () => chiudi(),
    }),
    [aggiorna, chiudi],
  )

  const vista = useMemo<VistaParoliere | null>(() => {
    if (!partita) return null
    const { griglia, finita, scadenza } = partita
    return {
      fase: finita ? 'finita' : griglia && scadenza !== null ? 'gioca' : 'nuova',
      griglia,
      lato: partita.lato,
      scadenza: finita ? null : scadenza,
      tempoMs: partita.tempoMs,
      trovate: partita.trovate,
      punteggio: punteggioDi(partita.trovate),
      // Il traguardo e' misurato sulla griglia di sedici in tre minuti: altrimenti non vorrebbe dire niente.
      traguardo:
        partita.lato === 4 && partita.tempoMs === TEMPO_PAROLIERE_MS && griglia ? traguardoDi(partita.comuni) : null,
      comuni: finita ? partita.comuni : null,
    }
  }, [partita])

  const ricomincia = useCallback(() => {
    ref.current = null
    setPartita(null)
  }, [])

  return { vista, comandi, comincia, ricomincia, errore, conti, numero, lato: partita?.lato ?? null }
}

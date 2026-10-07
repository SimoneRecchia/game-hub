import { useCallback, useEffect, useRef, useState } from 'react'
import type { MossaAppena } from './adesivi'
import type { CellaPiena, ScarabeoState } from '@shared/types'
import { LATO, sacchettoDelGiorno, type EsitoPosa, type Mossa } from '@shared/scarabeo'
import { PARTITA_DEL_GIORNO, caselleDi } from '@shared/scarabeo-computer'
import { statoADue } from '@shared/scarabeo-due'
import { ApiFetchError, api } from '@/lib/api'
import { dimentica } from '@/lib/dati'
import { haptic } from '@/lib/haptics'
import { suona } from '@/lib/suoni'
import { paroleSconosciute, preparaComputer, rispostaDelComputer } from './computer'
import { ILLUMINATA_MS, PENSA_ALMENO_MS, annuncioDi, parolaDi } from './turni'
import { useComposizione, type Composizione } from './useComposizione'

export type { Cursore } from './useComposizione'

const NESSUNA: readonly CellaPiena[] = []
const NESSUNO: readonly string[] = []

export interface ScarabeoController extends Composizione {
  stato: ScarabeoState | null
  /** L'ultima mossa giocata in questa visita, mia o del computer: l'adesivo al centro la racconta. */
  ultimaMossa: MossaAppena | null
  loading: boolean
  loadError: string | null
  inviando: boolean
  /** Il computer del giorno sta rispondendo: la mia mossa e' sul tabellone, la sua arriva. */
  pensa: boolean
  /** Le caselle dell'ultima mossa del computer: si illuminano per un attimo. */
  ultimaDelComputer: Set<number>
  /** Le parole della posa in corso che il dizionario non conosce; null se non si sa ancora. */
  sconosciute: string[] | null
  gioca: () => void
  passa: () => void
  cambia: (tessere: string[]) => void
  chiudiGiornata: () => void
  ricarica: () => void
}

/**
 * Le parole della posa in corso che non esistono, chieste al dizionario del
 * browser.
 *
 * Il dizionario vero resta quello del server, che rifiuta comunque una parola
 * sconosciuta. Questo serve a dirlo subito, mentre la si compone, invece che
 * dopo aver premuto "Gioca": la posa diventa rossa e il bottone lo dice. Se il
 * dizionario non si scarica, si torna al comportamento di prima — lo dice il
 * server.
 */
export function useParoleSconosciute(anteprima: EsitoPosa | null): string[] | null {
  const [sconosciute, setSconosciute] = useState<string[] | null>(null)
  const chiave = anteprima?.ok ? anteprima.parole.map((p) => p.parola).join(' ') : ''

  useEffect(() => {
    setSconosciute(null)
    if (!chiave) return
    let valida = true
    paroleSconosciute(chiave.split(' '))
      .then((elenco) => valida && setSconosciute(elenco))
      .catch(() => {
        /* senza dizionario nel browser, decide il server */
      })
    return () => {
      valida = false
    }
  }, [chiave])

  return sconosciute
}

/** L'avviso per le parole che il dizionario non conosce: una o piu'. */
export function nonNelDizionario(parole: readonly string[]): string {
  const elenco = parole.map((p) => p.toUpperCase()).join(', ')
  return parole.length === 1 ? `${elenco} non è nel dizionario.` : `${elenco} non sono nel dizionario.`
}

/** Quante tessere si sono appena cambiate, detto con il numero giusto. */
export function tessereCambiate(quante: number): string {
  return quante === 1 ? '1 tessera cambiata.' : `${quante} tessere cambiate.`
}

/**
 * Lo stato di prima della risposta del computer, ricavato dalle mosse come lo
 * ricava il server: la risposta arriva insieme alla mia mossa, e la schermata
 * mostra prima la mia, poi il computer che pensa, poi la sua.
 */
export function primaDellaRisposta(s: ScarabeoState): ScarabeoState {
  const partita = s.partita.slice(0, -1)
  const due = statoADue(sacchettoDelGiorno(s.puzzleNumber), partita, PARTITA_DEL_GIORNO)
  const celle: CellaPiena[] = []
  due.tabellone.forEach((casella, i) => {
    if (casella) celle.push({ r: Math.floor(i / LATO), c: i % LATO, lettera: casella.lettera, jolly: casella.jolly })
  })
  return {
    ...s,
    partita,
    celle,
    leggio: due.leggii[0],
    restanti: due.restanti,
    mosse: s.mosse.slice(0, -1),
    punti: due.punti[0],
    avversario: due.punti[1],
  }
}

/**
 * La partita di Scarabeo del giorno.
 *
 * Tiene lo **stato del server** (tabellone, leggio, punti), che e' la verita', e
 * affida la posa in corso a `useComposizione`, che vive solo qui finché non la
 * si gioca.
 */
export function useScarabeo(): ScarabeoController {
  const [stato, setStato] = useState<ScarabeoState | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [inviando, setInviando] = useState(false)
  const [pensa, setPensa] = useState(false)
  const [ultimaDelComputer, setUltima] = useState<Set<number>>(new Set())
  const [ultimaMossa, setUltimaMossa] = useState<MossaAppena | null>(null)
  const idMossa = useRef(0)
  const racconta = useCallback((m: Omit<MossaAppena, 'id'>) => {
    idMossa.current += 1
    setUltimaMossa({ ...m, id: idMossa.current })
  }, [])

  const composizione = useComposizione({
    celle: stato?.celle ?? NESSUNA,
    leggio: stato?.leggio ?? NESSUNO,
    bloccata: !stato || stato.status === 'done' || inviando,
    ricordo: stato ? `classificata:${stato.puzzleNumber}` : null,
  })
  const { anteprima, sospese, annulla, avvisa } = composizione
  const sconosciute = useParoleSconosciute(anteprima)

  const ricarica = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      setStato(await api<ScarabeoState>('/scarabeo/state'))
    } catch (errore) {
      setLoadError(errore instanceof ApiFetchError ? errore.message : 'Non riesco a caricare la partita.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void ricarica()
    // Il dizionario si scalda mentre si guarda il tabellone.
    void preparaComputer().catch(() => {})
  }, [ricarica])

  /**
   * Invio comune a mossa, passo, cambio e chiusura.
   *
   * Nelle giornate a turni il computer del giorno risponde qui, nel telefono, e
   * la sua mossa va al server con la mia: un turno, una richiesta. Arrivano
   * insieme, e si raccontano in ordine — la mia, il computer che pensa, la sua.
   */
  const invia = useCallback(
    async (
      path: string,
      mossa: Mossa | null,
      body: Record<string, unknown> = {},
      successo?: string,
      fatta?: Omit<MossaAppena, 'id'>,
    ) => {
      if (inviando || !stato) return
      setInviando(true)
      try {
        let risposta: Mossa | null = null
        if (mossa && stato.controComputer) {
          const dopo = [...stato.partita, mossa]
          // Risponde a ogni mia mossa, anche all'ultima: dieci a testa. Non risponde a una partita gia' finita.
          if (statoADue(sacchettoDelGiorno(stato.puzzleNumber), dopo, PARTITA_DEL_GIORNO).turno === 1) {
            try {
              risposta = await rispostaDelComputer(stato.puzzleNumber, dopo)
            } catch {
              avvisa('Il computer non risponde. Riprova fra poco.')
              return
            }
          }
        }
        const fresco = await api<ScarabeoState>(path, { method: 'POST', body: risposta ? { ...body, risposta } : body })
        annulla()
        dimentica('/oggi')
        if (fatta) {
          racconta(fatta)
          haptic('success')
        }
        const sua = risposta ? fresco.mosse.at(-1) : undefined
        if (!risposta || !sua || sua.mia) {
          setStato(fresco)
          if (successo) avvisa(successo)
          return
        }
        // Prima la mia mossa, poi il computer che ci pensa, poi la sua.
        setStato(primaDellaRisposta(fresco))
        setPensa(true)
        await new Promise((r) => setTimeout(r, PENSA_ALMENO_MS))
        setPensa(false)
        setStato(fresco)
        avvisa(annuncioDi(sua, 'Il computer'))
        if (sua.tipo === 'posa') {
          racconta({ mia: false, parola: parolaDi(sua.parole), punti: sua.punti, scarabeo: sua.scarabeo })
          haptic('tap')
          suona('posa', { volume: 0.6 })
        }
        setUltima(new Set(caselleDi(risposta)))
        window.setTimeout(() => setUltima(new Set()), ILLUMINATA_MS)
      } catch (errore) {
        if (errore instanceof ApiFetchError) {
          haptic('error')
          suona('sbagliato', { volume: 0.6 })
          avvisa(errore.message)
          // Se il server dice che la partita e' cambiata sotto i piedi, la
          // verita' e' la sua: si rilegge invece di insistere.
          if (errore.code === 'CONFLITTO' || errore.code === 'MOSSE_FINITE') void ricarica()
        } else {
          avvisa('Non riesco a inviare la mossa.')
        }
      } finally {
        setPensa(false)
        setInviando(false)
      }
    },
    [annulla, avvisa, inviando, racconta, ricarica, stato],
  )

  const gioca = useCallback(() => {
    if (sospese.length === 0) {
      avvisa('Posa almeno una tessera.')
      return
    }
    if (anteprima && !anteprima.ok) {
      haptic('error')
      suona('sbagliato', { volume: 0.6 })
      avvisa(anteprima.errore)
      return
    }
    if (sconosciute && sconosciute.length > 0) {
      haptic('error')
      suona('sbagliato', { volume: 0.6 })
      avvisa(nonNelDizionario(sconosciute))
      return
    }
    const punti = anteprima?.ok ? anteprima.punti : 0
    const scarabeo = anteprima?.ok ? anteprima.scarabeo : false
    const parola = anteprima?.ok ? parolaDi(anteprima.parole.map((p) => p.parola)) : ''
    void invia('/scarabeo/mossa', { tipo: 'posa', posa: sospese }, { posa: sospese }, undefined, {
      mia: true,
      parola,
      punti,
      scarabeo,
    })
  }, [anteprima, avvisa, invia, sconosciute, sospese])

  return {
    ...composizione,
    stato,
    ultimaMossa,
    loading,
    loadError,
    inviando,
    pensa,
    ultimaDelComputer,
    sconosciute,
    gioca,
    passa: () => {
      annulla()
      void invia('/scarabeo/passo', { tipo: 'passo' }, {}, 'Mossa passata.')
    },
    cambia: (tessere) => {
      annulla()
      void invia('/scarabeo/cambio', { tipo: 'cambio', tessere }, { tessere }, tessereCambiate(tessere.length))
    },
    chiudiGiornata: () => {
      annulla()
      void invia('/scarabeo/chiudi', null, {}, 'Giornata chiusa.')
    },
    ricarica: () => void ricarica(),
  }
}

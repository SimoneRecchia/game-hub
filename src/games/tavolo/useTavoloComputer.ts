import { useCallback, useEffect, useRef, useState } from 'react'
import { contaPunti, semeDi } from '@/games/go/conteggio'
import * as go from '@shared/go'
import { altraParte, type GiocoTavoliere, type LivelloTavoliere, type Parte } from '@shared/tavolo'
import { giocaMossa, regoleDi } from '@shared/tavolo-regole'
import { mossaDelComputer, stimaDelleMorte } from './computer'
import {
  conta,
  leggiPartita,
  leggiScelta,
  nuovaPartita,
  salvaPartita,
  ultimoLivello,
  type PartitaLocale,
} from './locale'

/** Dopo la mia mossa, un respiro prima che il computer cominci: la mia deve arrivare al suo posto. */
const PAUSA_MS = 350
/** Anche quando risponde subito, il computer "pensa" almeno tanto: una risposta istantanea sembra un riflesso. */
const PENSA_ALMENO_MS = 450

export interface PartitaControComputer {
  partita: PartitaLocale
  /** Tocca al computer, e sta pensando. */
  pensa: boolean
  errore: string | null
  muovi: (mossa: string) => void
  arrenditi: () => void
  /** Una partita nuova: allo stesso livello se non se ne sceglie un altro. */
  nuova: (livello?: LivelloTavoliere) => void
  riprova: () => void
  /**
   * Nel go, a gioco fermo dopo due passi: le pietre che il computer stima
   * morte (null mentre ci pensa). Contro il computer il conteggio non si
   * corregge a mano: chi non e' d'accordo riprende a giocare, e cattura.
   */
  morte: number[] | null
  confermaConteggio: () => void
  riprendi: () => void
}

/** Il seme del computer: a caso, perché due partite uguali non si ripetano mossa per mossa. */
function semeACaso(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]
}

/**
 * Una partita contro il computer, tutta nel telefono. La mia mossa si applica
 * subito con le regole condivise; quella del computer la chiede al suo Web
 * Worker e arriva dopo un respiro. Ogni passo si salva, e a partita finita il
 * risultato entra nel conto del livello.
 */
export function useTavoloComputer(gioco: GiocoTavoliere): PartitaControComputer {
  const [partita, setPartita] = useState<PartitaLocale>(
    () => leggiPartita(gioco) ?? nuovaPartita(gioco, ultimoLivello(gioco), leggiScelta(gioco)),
  )
  const [pensa, setPensa] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const [tentativo, setTentativo] = useState(0)
  const attuale = useRef(partita)
  attuale.current = partita

  // Un'altra partita dello stesso posto, se cambia il gioco senza smontare la pagina.
  useEffect(() => {
    if (attuale.current.gioco === gioco) return
    setPartita(leggiPartita(gioco) ?? nuovaPartita(gioco, ultimoLivello(gioco), leggiScelta(gioco)))
  }, [gioco])

  /** La mossa di `chi` sulla partita: salvata, e contata se chiude. Null se non si puo'. */
  const applica = useCallback((p: PartitaLocale, mossa: string, chi: Parte): PartitaLocale | null => {
    if (p.esito) return null
    const giocata = giocaMossa(regoleDi(p.gioco), p.posizione, p.chiavi, mossa, chi)
    if (!giocata) return null
    const dopo: PartitaLocale = {
      ...p,
      posizione: giocata.posizione,
      chiavi: giocata.chiavi,
      mosse: [...p.mosse, giocata.mossa],
      esito: giocata.esito,
    }
    if (dopo.esito) return conta(dopo)
    salvaPartita(dopo)
    return dopo
  }, [])

  const computer = altraParte(partita.mia)
  const regole = regoleDi(gioco)
  const fermo = !partita.esito && (regole.conteggio?.(partita.posizione) ?? false)
  const tocca = !partita.esito && !fermo && regole.tratto(partita.posizione) === computer

  // Il go fermo per contare: la stima delle pietre morte, nel Worker, una volta per posizione.
  const [morte, setMorte] = useState<{ posizione: string; morte: number[] } | null>(null)
  useEffect(() => {
    if (!fermo) return
    let annullato = false
    const posizione = attuale.current.posizione
    stimaDelleMorte(posizione, semeDi(posizione))
      .then((stima) => {
        if (!annullato) setMorte({ posizione, morte: stima })
      })
      .catch(() => {
        if (!annullato) setMorte({ posizione, morte: [] })
      })
    return () => {
      annullato = true
    }
  }, [fermo, partita.posizione])

  useEffect(() => {
    if (!tocca) return
    const richiesta = attuale.current
    let annullato = false
    setPensa(true)
    setErrore(null)
    const inizio = performance.now()
    const t = setTimeout(() => {
      void mossaDelComputer(gioco, {
        posizione: richiesta.posizione,
        livello: richiesta.livello,
        storia: richiesta.chiavi,
        seme: semeACaso(),
      })
        .then(async (mossa) => {
          const resto = PAUSA_MS + PENSA_ALMENO_MS - (performance.now() - inizio)
          if (resto > 0) await new Promise((r) => setTimeout(r, resto))
          if (annullato) return
          const ora = attuale.current
          // Nel frattempo la partita e' cambiata (abbandonata, ricominciata): la risposta non serve piu'.
          if (ora.posizione !== richiesta.posizione || ora.mosse.length !== richiesta.mosse.length) return
          const dopo = mossa === null ? null : applica(ora, mossa, altraParte(ora.mia))
          if (!dopo) {
            setErrore('Il computer non trova una mossa.')
            return
          }
          setPartita(dopo)
        })
        .catch(() => {
          if (!annullato) setErrore('Il computer non risponde.')
        })
        .finally(() => {
          if (!annullato) setPensa(false)
        })
    }, PAUSA_MS)
    return () => {
      annullato = true
      clearTimeout(t)
      setPensa(false)
    }
  }, [applica, gioco, tocca, partita.posizione, partita.mosse.length, tentativo])

  const muovi = useCallback(
    (mossa: string) => {
      const p = attuale.current
      const dopo = applica(p, mossa, p.mia)
      if (dopo) setPartita(dopo)
    },
    [applica],
  )

  const arrenditi = useCallback(() => {
    const p = attuale.current
    if (p.esito) return
    setPartita(conta({ ...p, esito: { vincitore: altraParte(p.mia), motivo: 'resa' } }))
  }, [])

  const nuova = useCallback(
    (livello?: LivelloTavoliere) => {
      const p = attuale.current
      setErrore(null)
      setPartita(nuovaPartita(gioco, livello ?? p.livello, leggiScelta(gioco)))
    },
    [gioco],
  )

  const stima = fermo && morte?.posizione === partita.posizione ? morte.morte : null

  const confermaConteggio = useCallback(() => {
    const p = attuale.current
    if (!stima || p.esito) return
    const conto = contaPunti(p.posizione, stima)
    if (!conto) return
    const vincitore: Parte = conto.vincitore === 'nero' ? 0 : 1
    const punti = { nero: conto.nero, bianco: conto.bianco }
    setPartita(conta({ ...p, esito: { vincitore, motivo: 'punti' }, punti }))
  }, [stima])

  // Si riprende da dove ci si era fermati: i due passi non contano piu', e tocca a chi toccava.
  // Le posizioni di prima si dimenticano, come sul server: alla seconda ripresa sarebbero una ripetizione.
  const riprendi = useCallback(() => {
    const p = attuale.current
    const q = go.leggi(p.posizione)
    if (!q || p.esito) return
    const dopo = { ...p, posizione: go.scrivi({ ...q, passi: 0 }), chiavi: [] }
    salvaPartita(dopo)
    setPartita(dopo)
  }, [])

  return {
    partita,
    pensa,
    errore,
    muovi,
    arrenditi,
    nuova,
    riprova: () => setTentativo((t) => t + 1),
    morte: stima,
    confermaConteggio,
    riprendi,
  }
}

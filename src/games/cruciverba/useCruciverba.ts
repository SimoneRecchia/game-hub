import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiFetchError, api } from '@/lib/api'
import { suona } from '@/lib/suoni'
import { NERA, PUNTI_COMPLETO, VUOTA, grigliaPiena } from '@shared/cruciverba'
import type {
  CruciverbaEsito,
  CruciverbaState,
  DefinizioneCruciverba,
} from '@shared/types'

export type Direzione = 'o' | 'v'

export interface Selezione {
  casella: number
  direzione: Direzione
}

/** Dopo quanto dall'ultima lettera si salva: abbastanza per non scrivere a ogni tasto. */
const ATTESA_SALVATAGGIO_MS = 900

/** Quanto resta a schermo un messaggio. */
const DURATA_MESSAGGIO_MS = 2400

function sostituisci(testo: string, k: number, lettera: string): string {
  return testo.slice(0, k) + lettera + testo.slice(k + 1)
}

/**
 * Lo stato di un cruciverba in corso, e tutto quel che ci si fa sopra.
 *
 * La griglia si scrive **in locale** e si salva dopo un attimo di pausa: una
 * richiesta per tasto sarebbe un centinaio di scritture a partita, e il piano
 * gratuito di D1 ne concede centomila al giorno per tutti i giochi. Le
 * scritture passano da una **coda**: una alla volta, ciascuna con la versione
 * restituita dalla precedente, perché il server rifiuta quelle che arrivano con
 * una versione vecchia (vedi `salvaPartita`).
 *
 * Gli aiuti — controllo e svelamento — viaggiano nella stessa coda e portano
 * con se' la griglia: il server controlla quel che si vede a schermo, non
 * l'ultima versione salvata.
 */
/**
 * Dove sta la partita: quella del giorno, o uno schema libero.
 *
 * Le scritture sono le stesse — `lettere`, `controlla`, `svela` — sotto un
 * indirizzo diverso: `/cruciverba` per la classificata, `/cruciverba/libera/:id`
 * per una libera. Lo stato del giorno si legge da `/cruciverba/state`, quello di
 * una libera dal suo indirizzo stesso.
 */
export interface IndirizziCruciverba {
  stato: string
  scritture: string
}

export const CRUCIVERBA_DEL_GIORNO: IndirizziCruciverba = {
  stato: '/cruciverba/state',
  scritture: '/cruciverba',
}

export function indirizziLiberi(id: string): IndirizziCruciverba {
  return { stato: `/cruciverba/libera/${id}`, scritture: `/cruciverba/libera/${id}` }
}

export function useCruciverba(indirizzi: IndirizziCruciverba = CRUCIVERBA_DEL_GIORNO) {
  // Le scritture in coda partono dopo: devono usare l'indirizzo di adesso.
  const indirizziRef = useRef(indirizzi)
  indirizziRef.current = indirizzi
  const [stato, setStato] = useState<CruciverbaState | null>(null)
  const [lettere, setLettere] = useState('')
  const [svelate, setSvelate] = useState<Set<number>>(new Set())
  const [segnalate, setSegnalate] = useState<Set<number>>(new Set())
  const [selezione, setSelezione] = useState<Selezione | null>(null)
  const [tempoMs, setTempoMs] = useState(0)
  const [punti, setPunti] = useState(PUNTI_COMPLETO)
  const [finita, setFinita] = useState(false)
  const [messaggio, setMessaggio] = useState<string | null>(null)
  /** L'esito dell'ultimo controllo, per l'adesivo al centro: quante lettere erano sbagliate. */
  const [ultimoControllo, setUltimoControllo] = useState<{
    id: number
    ambito: 'parola' | 'tutto'
    errate: number
  } | null>(null)
  const idControllo = useRef(0)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [inviando, setInviando] = useState(false)

  // Gli ultimi valori, per le scritture in coda: partono dopo, e devono
  // mandare la griglia di quel momento, non quella di quando sono state chieste.
  const lettereRef = useRef('')
  const tempoRef = useRef(0)
  const versioneRef = useRef(0)
  const salvateRef = useRef('')
  const finitaRef = useRef(false)
  const numeroRef = useRef<number | null>(null)
  const coda = useRef<Promise<void>>(Promise.resolve())
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const timerMessaggio = useRef<ReturnType<typeof setTimeout> | null>(null)

  const mostra = useCallback((testo: string) => {
    setMessaggio(testo)
    if (timerMessaggio.current) clearTimeout(timerMessaggio.current)
    timerMessaggio.current = setTimeout(() => setMessaggio(null), DURATA_MESSAGGIO_MS)
  }, [])

  const definizioni = useMemo(() => stato?.definizioni ?? [], [stato])

  /** Per ogni casella, la parola orizzontale e quella verticale che la contengono. */
  const perCasella = useMemo(() => {
    const mappa = new Map<number, { o?: DefinizioneCruciverba; v?: DefinizioneCruciverba }>()
    for (const d of definizioni) {
      for (const k of d.caselle) {
        const voce = mappa.get(k) ?? {}
        voce[d.direzione] = d
        mappa.set(k, voce)
      }
    }
    return mappa
  }, [definizioni])

  const applicaStato = useCallback((s: CruciverbaState) => {
    setStato(s)
    setLettere(s.lettere)
    lettereRef.current = s.lettere
    salvateRef.current = s.lettere
    setSvelate(new Set(s.svelate))
    setSegnalate(new Set(s.segnalate))
    setTempoMs(s.tempoMs)
    tempoRef.current = s.tempoMs
    versioneRef.current = s.versione
    setPunti(s.punti)
    setFinita(s.status === 'done')
    finitaRef.current = s.status === 'done'
    // Uno schema nuovo (la pagina e' rimasta aperta oltre la mezzanotte) non
    // eredita la casella selezionata: potrebbe essere una nera.
    const stessoSchema = numeroRef.current === s.puzzleNumber
    numeroRef.current = s.puzzleNumber
    setSelezione((prima) => {
      if (prima && stessoSchema) return prima
      // Si comincia dalla prima parola con una casella vuota.
      const aperta = s.definizioni.find((d) => d.caselle.some((k) => s.lettere[k] === VUOTA))
      const d = aperta ?? s.definizioni[0]
      if (!d) return null
      const vuota = d.caselle.find((k) => s.lettere[k] === VUOTA) ?? d.caselle[0]
      return { casella: vuota, direzione: d.direzione }
    })
  }, [])

  const ricarica = useCallback(async () => {
    setLoadError(null)
    try {
      applicaStato(await api<CruciverbaState>(indirizzi.stato))
    } catch (err) {
      setLoadError(
        err instanceof ApiFetchError ? err.message : 'Non riesco a caricare il cruciverba.',
      )
    }
  }, [applicaStato, indirizzi.stato])

  useEffect(() => {
    void ricarica()
  }, [ricarica])

  /** Applica la risposta di una scrittura. */
  const applicaEsito = useCallback(
    (esito: CruciverbaEsito) => {
      versioneRef.current = esito.versione
      setPunti(esito.punti)
      if (esito.stato) {
        applicaStato(esito.stato)
        return
      }
      if (esito.pienaConErrori) mostra('Griglia piena, ma c’è qualche errore')
    },
    [applicaStato, mostra],
  )

  /** Accoda una scrittura. Un conflitto rilegge tutto: l'altra versione e' piu' nuova. */
  const accoda = useCallback(
    (lavoro: () => Promise<void>) => {
      coda.current = coda.current.then(async () => {
        if (finitaRef.current) return
        try {
          await lavoro()
        } catch (err) {
          if (err instanceof ApiFetchError && err.code === 'CONFLITTO') {
            mostra('Aggiornato da un altro dispositivo')
            await ricarica()
          } else if (err instanceof ApiFetchError && err.code === 'GRIGLIA') {
            // La griglia non e' quella di oggi: la pagina e' rimasta aperta
            // oltre la mezzanotte, e lo schema e' cambiato.
            mostra('È arrivato il cruciverba nuovo')
            await ricarica()
          } else if (err instanceof ApiFetchError) {
            mostra(err.message)
          }
        }
      })
      return coda.current
    },
    [mostra, ricarica],
  )

  const salvaOra = useCallback(
    (keepalive = false) =>
      accoda(async () => {
        const griglia = lettereRef.current
        if (griglia === salvateRef.current && !keepalive) return
        const esito = await api<CruciverbaEsito>(`${indirizziRef.current.scritture}/lettere`, {
          method: 'PUT',
          body: { lettere: griglia, tempoMs: tempoRef.current, versione: versioneRef.current },
          keepalive,
        })
        salvateRef.current = griglia
        applicaEsito(esito)
      }),
    [accoda, applicaEsito],
  )

  const pianificaSalvataggio = useCallback(
    (subito: boolean) => {
      if (timer.current) clearTimeout(timer.current)
      if (subito) {
        void salvaOra()
        return
      }
      timer.current = setTimeout(() => void salvaOra(), ATTESA_SALVATAGGIO_MS)
    },
    [salvaOra],
  )

  // Il cronometro corre solo a pagina visibile: un cruciverba si fa a pezzi, e il
  // tempo in tasca non e' tempo di gioco. Quando la pagina si nasconde si salva
  // subito, perché potrebbe non tornare.
  useEffect(() => {
    if (!stato || finita) return
    // Si somma il tempo trascorso davvero fra un giro e l'altro, non un secondo
    // a giro: il browser rallenta i timer quando vuole. Con un tetto, perché al
    // ritorno da una scheda nascosta il primo giro non porti con se' l'assenza.
    let ultimo = performance.now()
    const id = setInterval(() => {
      const adesso = performance.now()
      const passato = Math.min(adesso - ultimo, 2000)
      ultimo = adesso
      if (document.visibilityState !== 'visible') return
      tempoRef.current += passato
      setTempoMs(tempoRef.current)
    }, 1000)
    const onVisibilita = () => {
      ultimo = performance.now()
      if (document.visibilityState === 'hidden') {
        if (timer.current) clearTimeout(timer.current)
        void salvaOra(true)
      }
    }
    document.addEventListener('visibilitychange', onVisibilita)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisibilita)
    }
  }, [stato, finita, salvaOra])

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
      if (timerMessaggio.current) clearTimeout(timerMessaggio.current)
    },
    [],
  )

  /* ────────────────────────────  Navigazione  ─────────────────────────── */

  const corrente = useMemo(() => {
    if (!selezione) return null
    const voce = perCasella.get(selezione.casella)
    return voce?.[selezione.direzione] ?? voce?.o ?? voce?.v ?? null
  }, [perCasella, selezione])

  const seleziona = useCallback(
    (casella: number, direzione?: Direzione) => {
      const voce = perCasella.get(casella)
      if (!voce) return
      setSelezione((prima) => {
        const voluta = direzione ?? prima?.direzione ?? 'o'
        return { casella, direzione: voce[voluta] ? voluta : voluta === 'o' ? 'v' : 'o' }
      })
    },
    [perCasella],
  )

  /** Un tocco su una casella: la seleziona; un secondo tocco cambia direzione. */
  const tocca = useCallback(
    (casella: number) => {
      const voce = perCasella.get(casella)
      if (!voce) return
      setSelezione((prima) => {
        if (prima?.casella === casella) {
          const altra = prima.direzione === 'o' ? 'v' : 'o'
          return voce[altra] ? { casella, direzione: altra } : prima
        }
        const voluta = prima?.direzione ?? 'o'
        return { casella, direzione: voce[voluta] ? voluta : voluta === 'o' ? 'v' : 'o' }
      })
    },
    [perCasella],
  )

  const cambiaDirezione = useCallback(() => {
    if (selezione) tocca(selezione.casella)
  }, [selezione, tocca])

  /** La definizione successiva (o precedente), nell'ordine dell'elenco. */
  const vaiAllaDefinizione = useCallback(
    (passo: 1 | -1, soloAperte = false) => {
      if (!corrente || definizioni.length === 0) return
      const i = definizioni.findIndex((d) => d.chiave === corrente.chiave)
      for (let n = 1; n <= definizioni.length; n += 1) {
        const d = definizioni[(i + passo * n + definizioni.length * 2) % definizioni.length]
        const vuota = d.caselle.find((k) => lettereRef.current[k] === VUOTA)
        if (soloAperte && vuota === undefined) continue
        setSelezione({ casella: vuota ?? d.caselle[0], direzione: d.direzione })
        return
      }
    },
    [corrente, definizioni],
  )

  /** Le frecce: si muove sulla griglia saltando le nere, e prende la direzione della freccia. */
  const sposta = useCallback(
    (dr: number, dc: number) => {
      if (!stato || !selezione) return
      const direzione: Direzione = dr === 0 ? 'o' : 'v'
      if (selezione.direzione !== direzione && perCasella.get(selezione.casella)?.[direzione]) {
        setSelezione({ casella: selezione.casella, direzione })
        return
      }
      let r = Math.floor(selezione.casella / stato.colonne) + dr
      let c = (selezione.casella % stato.colonne) + dc
      while (r >= 0 && c >= 0 && r < stato.righe && c < stato.colonne) {
        const k = r * stato.colonne + c
        if (stato.schema[k] !== NERA) {
          seleziona(k, direzione)
          return
        }
        r += dr
        c += dc
      }
    },
    [perCasella, selezione, seleziona, stato],
  )

  /* ─────────────────────────────  Scrittura  ──────────────────────────── */

  const scrivi = useCallback(
    (lettera: string) => {
      if (finitaRef.current || !selezione || !corrente) return
      const k = selezione.casella
      const posizione = corrente.caselle.indexOf(k)

      if (!svelate.has(k)) {
        suona('tocco')
        const dopo = sostituisci(lettereRef.current, k, lettera)
        lettereRef.current = dopo
        setLettere(dopo)
        setSegnalate((prima) => {
          if (!prima.has(k)) return prima
          const s = new Set(prima)
          s.delete(k)
          return s
        })
        pianificaSalvataggio(grigliaPiena(dopo))
      }

      // Avanti nella parola, alla prossima casella vuota; in fondo alla parola
      // si torna al primo buco rimasto, e a parola piena si passa alla prossima
      // definizione che ha ancora caselle da scrivere.
      const resto = corrente.caselle.slice(posizione + 1)
      const buco = (x: number) => lettereRef.current[x] === VUOTA
      const prossima = resto.find(buco) ?? resto[0] ?? corrente.caselle.find(buco)
      if (prossima !== undefined) {
        setSelezione({ casella: prossima, direzione: corrente.direzione })
      } else {
        vaiAllaDefinizione(1, true)
      }
    },
    [corrente, pianificaSalvataggio, selezione, svelate, vaiAllaDefinizione],
  )

  const cancella = useCallback(() => {
    if (finitaRef.current || !selezione || !corrente) return
    let k = selezione.casella
    // Casella vuota: si torna indietro di una e si cancella quella.
    if (lettereRef.current[k] === VUOTA || svelate.has(k)) {
      const posizione = corrente.caselle.indexOf(k)
      if (posizione <= 0) return
      k = corrente.caselle[posizione - 1]
      setSelezione({ casella: k, direzione: corrente.direzione })
    }
    if (svelate.has(k) || lettereRef.current[k] === VUOTA) return
    suona('tocco', { volume: 0.7 })
    const dopo = sostituisci(lettereRef.current, k, VUOTA)
    lettereRef.current = dopo
    setLettere(dopo)
    setSegnalate((prima) => {
      if (!prima.has(k)) return prima
      const s = new Set(prima)
      s.delete(k)
      return s
    })
    pianificaSalvataggio(false)
  }, [corrente, pianificaSalvataggio, selezione, svelate])

  /* ───────────────────────────────  Aiuti  ─────────────────────────────── */

  const controlla = useCallback(
    (ambito: 'parola' | 'tutto') => {
      if (timer.current) clearTimeout(timer.current)
      const caselle = ambito === 'parola' ? corrente?.caselle : undefined
      setInviando(true)
      void accoda(async () => {
        const griglia = lettereRef.current
        const esito = await api<CruciverbaEsito>(`${indirizziRef.current.scritture}/controlla`, {
          method: 'POST',
          body: { lettere: griglia, tempoMs: tempoRef.current, versione: versioneRef.current, caselle },
        })
        salvateRef.current = griglia
        applicaEsito(esito)
        const errate = esito.errate ?? []
        setSegnalate((prima) => {
          const s = new Set(prima)
          for (const k of errate) s.add(k)
          return s
        })
        if (!esito.stato) {
          idControllo.current += 1
          setUltimoControllo({ id: idControllo.current, ambito, errate: errate.length })
          mostra(
            errate.length === 0
              ? ambito === 'parola'
                ? 'Fin qui è giusta'
                : 'Nessun errore, fin qui'
              : errate.length === 1
                ? 'Una lettera sbagliata'
                : `${errate.length} lettere sbagliate`,
          )
        }
      }).finally(() => setInviando(false))
    },
    [accoda, applicaEsito, corrente, mostra],
  )

  const svela = useCallback(
    (ambito: 'lettera' | 'parola') => {
      if (!selezione || !corrente) return
      if (timer.current) clearTimeout(timer.current)
      const caselle = ambito === 'lettera' ? [selezione.casella] : corrente.caselle
      setInviando(true)
      void accoda(async () => {
        const esito = await api<CruciverbaEsito>(`${indirizziRef.current.scritture}/svela`, {
          method: 'POST',
          body: {
            lettere: lettereRef.current,
            tempoMs: tempoRef.current,
            versione: versioneRef.current,
            caselle,
          },
        })
        if (!esito.stato && esito.rivelate) {
          suona('svela')
          let dopo = lettereRef.current
          for (const [k, l] of Object.entries(esito.rivelate)) dopo = sostituisci(dopo, Number(k), l)
          lettereRef.current = dopo
          salvateRef.current = dopo
          setLettere(dopo)
          setSvelate(new Set(esito.svelate ?? []))
          setSegnalate((prima) => {
            const s = new Set(prima)
            for (const k of Object.keys(esito.rivelate ?? {})) s.delete(Number(k))
            return s
          })
        }
        applicaEsito(esito)
      }).finally(() => setInviando(false))
    },
    [accoda, applicaEsito, corrente, selezione],
  )

  return {
    stato,
    loadError,
    ricarica,
    lettere,
    svelate,
    segnalate,
    selezione,
    corrente,
    perCasella,
    tempoMs,
    punti,
    finita,
    messaggio,
    ultimoControllo,
    inviando,
    tocca,
    seleziona,
    cambiaDirezione,
    vaiAllaDefinizione,
    sposta,
    scrivi,
    cancella,
    controlla,
    svela,
  }
}

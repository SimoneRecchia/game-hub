import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  JOLLY,
  LATO,
  TESSERE_LEGGIO,
  tabelloneVuoto,
  validaPosa,
  type Casella,
  type EsitoPosa,
  type Posa,
} from '@shared/scarabeo'
import type { ScarabeoState } from '@shared/types'
import { ApiFetchError, api } from '@/lib/api'
import { haptic } from '@/lib/haptics'

/** Una tessera posata ma non ancora giocata, con la sua origine sul leggio. */
interface InSospeso {
  posa: Posa
  /** Indice nel leggio *visibile*: serve a rimetterla dov'era. */
  indice: number
}

export interface Cursore {
  r: number
  c: number
  /** true = si scrive verso destra, false = verso il basso. */
  oriz: boolean
}

export interface ScarabeoController {
  stato: ScarabeoState | null
  loading: boolean
  loadError: string | null
  inviando: boolean
  /** Messaggio effimero: errori della mossa, conferme. */
  messaggio: string | null

  /** Il leggio nell'ordine in cui e' mostrato. */
  mano: string[]
  /** Quali tessere della mano sono già sul tabellone, in attesa di conferma. */
  impegnate: Set<number>
  tabellone: (Casella | null)[]
  sospese: Posa[]
  cursore: Cursore | null
  /** L'esito calcolato in locale della posa in corso. */
  anteprima: EsitoPosa | null

  /** Il jolly in attesa di una lettera, come indice nella mano. */
  jollyAperto: number | null

  tocca: (r: number, c: number) => void
  usaTessera: (indice: number) => void
  scegliJolly: (lettera: string) => void
  chiudiJolly: () => void
  mischia: () => void
  annulla: () => void
  gioca: () => void
  passa: () => void
  cambia: (tessere: string[]) => void
  chiudiGiornata: () => void
  ricarica: () => void
}

/**
 * La partita di Scarabeo del giorno.
 *
 * Tiene due cose distinte: **lo stato del server** (tabellone, leggio, punti),
 * che e' la verita', e **la posa in corso**, che vive solo qui finché non la si
 * gioca. L'anteprima dei punti si calcola con `validaPosa`, la stessa funzione
 * che poi usa il server: il numero sul bottone e quello che finisce in
 * classifica non possono divergere.
 *
 * Il dizionario invece sta solo sul server — 271.055 parole non si spediscono a
 * un telefono — quindi una posa geometricamente valida puo' tornare rifiutata
 * perché la parola non esiste. E' il solo caso in cui l'anteprima promette piu'
 * di quel che mantiene, e il messaggio lo dice con la parola in chiaro.
 */
export function useScarabeo(): ScarabeoController {
  const [stato, setStato] = useState<ScarabeoState | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [inviando, setInviando] = useState(false)
  const [messaggio, setMessaggio] = useState<string | null>(null)

  const [mano, setMano] = useState<string[]>([])
  const [sospese, setSospese] = useState<InSospeso[]>([])
  const [cursore, setCursore] = useState<Cursore | null>(null)
  const [jollyAperto, setJollyAperto] = useState<number | null>(null)

  const timer = useRef<number | null>(null)
  const vivo = useRef(true)

  useEffect(() => {
    vivo.current = true
    return () => {
      vivo.current = false
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [])

  const avvisa = useCallback((testo: string) => {
    setMessaggio(testo)
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      if (vivo.current) setMessaggio(null)
    }, 2_600)
  }, [])

  /**
   * Adotta lo stato che arriva dal server.
   *
   * Il leggio si riordina solo se e' cambiato davvero: altrimenti a ogni mossa
   * le tessere che restano in mano salterebbero di posto, e chi stava
   * componendo una parola perderebbe il filo.
   */
  const adotta = useCallback((fresco: ScarabeoState) => {
    setStato(fresco)
    setSospese([])
    setJollyAperto(null)
    setMano((precedente) => {
      const restano = [...fresco.leggio]
      const tenute: string[] = []
      for (const tessera of precedente) {
        const i = restano.indexOf(tessera)
        if (i >= 0) {
          tenute.push(tessera)
          restano.splice(i, 1)
        }
      }
      return [...tenute, ...restano]
    })
  }, [])

  const ricarica = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      adotta(await api<ScarabeoState>('/scarabeo/state'))
    } catch (errore) {
      setLoadError(
        errore instanceof ApiFetchError ? errore.message : 'Non riesco a caricare la partita.',
      )
    } finally {
      setLoading(false)
    }
  }, [adotta])

  useEffect(() => {
    void ricarica()
  }, [ricarica])

  /** Il tabellone del server piu' le tessere in sospeso. */
  const tabellone = useMemo(() => {
    const tab = tabelloneVuoto()
    for (const cella of stato?.celle ?? []) {
      tab[cella.r * LATO + cella.c] = { lettera: cella.lettera, jolly: cella.jolly }
    }
    for (const s of sospese) {
      tab[s.posa.r * LATO + s.posa.c] = { lettera: s.posa.lettera, jolly: s.posa.jolly }
    }
    return tab
  }, [stato?.celle, sospese])

  const impegnate = useMemo(() => new Set(sospese.map((s) => s.indice)), [sospese])

  const anteprima = useMemo(() => {
    if (sospese.length === 0 || !stato) return null
    const fisso = tabelloneVuoto()
    for (const cella of stato.celle) {
      fisso[cella.r * LATO + cella.c] = { lettera: cella.lettera, jolly: cella.jolly }
    }
    return validaPosa(
      fisso,
      sospese.map((s) => s.posa),
      stato.celle.length === 0,
    )
  }, [sospese, stato])

  /** La prossima casella libera nella direzione del cursore. */
  const avanza = useCallback(
    (da: Cursore, tab: (Casella | null)[]): Cursore | null => {
      let { r, c } = da
      for (let passi = 0; passi < LATO; passi += 1) {
        if (da.oriz) c += 1
        else r += 1
        if (r >= LATO || c >= LATO) return null
        if (!tab[r * LATO + c]) return { r, c, oriz: da.oriz }
      }
      return null
    },
    [],
  )

  const tocca = useCallback(
    (r: number, c: number) => {
      if (stato?.status === 'done') return

      const sospesaQui = sospese.find((s) => s.posa.r === r && s.posa.c === c)
      if (sospesaQui) {
        // Ritocco una tessera appena posata: torna in mano.
        haptic('tap')
        setSospese((prima) => prima.filter((s) => s !== sospesaQui))
        setCursore({ r, c, oriz: cursore?.oriz ?? true })
        return
      }

      if (tabellone[r * LATO + c]) {
        avvisa('Quella casella è già occupata.')
        return
      }

      haptic('tap')
      setCursore((prima) =>
        prima && prima.r === r && prima.c === c
          ? // Secondo tocco sulla stessa casella: cambia direzione. E' il gesto
            // dell'app vera, e risparmia un controllo a schermo.
            { r, c, oriz: !prima.oriz }
          : { r, c, oriz: prima?.oriz ?? true },
      )
    },
    [avvisa, cursore?.oriz, sospese, stato?.status, tabellone],
  )

  /** Mette in campo la tessera i-esima della mano, al cursore. */
  const posaTessera = useCallback(
    (indice: number, lettera: string, jolly: boolean) => {
      if (!cursore) {
        avvisa('Tocca prima una casella del tabellone.')
        return
      }
      const posa: Posa = { r: cursore.r, c: cursore.c, lettera, jolly }
      const dopo = [...sospese, { posa, indice }]
      setSospese(dopo)
      haptic('tap')

      const tab = [...tabellone]
      tab[cursore.r * LATO + cursore.c] = { lettera, jolly }
      setCursore(avanza(cursore, tab))
    },
    [avanza, avvisa, cursore, sospese, tabellone],
  )

  const usaTessera = useCallback(
    (indice: number) => {
      if (stato?.status === 'done') return
      if (impegnate.has(indice)) return
      if (sospese.length >= TESSERE_LEGGIO) return

      const tessera = mano[indice]
      if (tessera === JOLLY) {
        if (!cursore) {
          avvisa('Tocca prima una casella del tabellone.')
          return
        }
        setJollyAperto(indice)
        return
      }
      posaTessera(indice, tessera, false)
    },
    [avvisa, cursore, impegnate, mano, posaTessera, sospese.length, stato?.status],
  )

  const scegliJolly = useCallback(
    (lettera: string) => {
      if (jollyAperto === null) return
      const indice = jollyAperto
      setJollyAperto(null)
      posaTessera(indice, lettera, true)
    },
    [jollyAperto, posaTessera],
  )

  const mischia = useCallback(() => {
    if (sospese.length > 0) return
    haptic('tap')
    setMano((prima) => {
      const copia = [...prima]
      for (let i = copia.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[copia[i], copia[j]] = [copia[j], copia[i]]
      }
      return copia
    })
  }, [sospese.length])

  const annulla = useCallback(() => {
    setSospese([])
    setCursore(null)
    setJollyAperto(null)
  }, [])

  /** Invio comune a mossa, passo, cambio e chiusura. */
  const invia = useCallback(
    async (path: string, body?: unknown, successo?: string) => {
      if (inviando) return
      setInviando(true)
      try {
        const fresco = await api<ScarabeoState>(path, { method: 'POST', body })
        adotta(fresco)
        setCursore(null)
        if (successo) avvisa(successo)
      } catch (errore) {
        if (errore instanceof ApiFetchError) {
          haptic('error')
          avvisa(errore.message)
          // Se il server dice che la partita e' cambiata sotto i piedi, la
          // verita' e' la sua: si rilegge invece di insistere.
          if (errore.code === 'CONFLITTO' || errore.code === 'MOSSE_FINITE') void ricarica()
        } else {
          avvisa('Non riesco a inviare la mossa.')
        }
      } finally {
        setInviando(false)
      }
    },
    [adotta, avvisa, inviando, ricarica],
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
    const punti = anteprima?.ok ? anteprima.punti : 0
    const scarabeo = anteprima?.ok ? anteprima.scarabeo : false
    void invia(
      '/scarabeo/mossa',
      { posa: sospese.map((s) => s.posa) },
      scarabeo ? `Scarabeo! +${punti} punti` : `+${punti} punti`,
    )
  }, [anteprima, avvisa, invia, sospese])

  const passa = useCallback(() => {
    annulla()
    void invia('/scarabeo/passo', undefined, 'Mossa passata.')
  }, [annulla, invia])

  const cambia = useCallback(
    (tessere: string[]) => {
      annulla()
      void invia('/scarabeo/cambio', { tessere }, `${tessere.length} tessere cambiate.`)
    },
    [annulla, invia],
  )

  const chiudiGiornata = useCallback(() => {
    annulla()
    void invia('/scarabeo/chiudi', undefined, 'Giornata chiusa.')
  }, [annulla, invia])

  return {
    stato,
    loading,
    loadError,
    inviando,
    messaggio,
    mano,
    impegnate,
    tabellone,
    sospese: sospese.map((s) => s.posa),
    cursore,
    anteprima,
    jollyAperto,
    tocca,
    usaTessera,
    scegliJolly,
    chiudiJolly: () => setJollyAperto(null),
    mischia,
    annulla,
    gioca,
    passa,
    cambia,
    chiudiGiornata,
    ricarica: () => void ricarica(),
  }
}

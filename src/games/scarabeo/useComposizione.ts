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
import type { CellaPiena } from '@shared/types'
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

export interface Composizione {
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
  messaggio: string | null

  tocca: (r: number, c: number) => void
  usaTessera: (indice: number) => void
  scegliJolly: (lettera: string) => void
  chiudiJolly: () => void
  mischia: () => void
  annulla: () => void
  avvisa: (testo: string) => void
}

/**
 * Comporre una mossa sul tabellone: toccare una casella, posare le tessere,
 * scegliere la lettera del jolly, riprenderle, mischiare il leggio.
 *
 * E' la parte dello Scarabeo che non sa niente di chi e' la partita — la
 * classificata del giorno sul server, o la libera contro il computer nel
 * browser — e per questo sta qui, una volta sola. Chi la usa le da' il
 * tabellone fermo e il leggio, e quando la mossa e' giocata le da' quelli nuovi.
 *
 * L'anteprima dei punti si calcola con `validaPosa`, la stessa funzione che poi
 * usa il server: il numero sul bottone e quello che finisce in classifica non
 * possono divergere.
 */
export function useComposizione({
  celle,
  leggio,
  bloccata,
}: {
  celle: readonly CellaPiena[]
  leggio: readonly string[]
  /** A partita finita, o mentre muove l'altro, non si compone niente. */
  bloccata: boolean
}): Composizione {
  const [mano, setMano] = useState<string[]>([])
  const [sospese, setSospese] = useState<InSospeso[]>([])
  const [cursore, setCursore] = useState<Cursore | null>(null)
  const [jollyAperto, setJollyAperto] = useState<number | null>(null)
  const [messaggio, setMessaggio] = useState<string | null>(null)
  const timer = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current)
    },
    [],
  )

  const avvisa = useCallback((testo: string) => {
    setMessaggio(testo)
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setMessaggio(null), 2_600)
  }, [])

  /*
   * Il leggio nuovo, quando cambia davvero: le tessere che restano in mano
   * tengono il loro posto, le nuove si mettono in fondo. Altrimenti a ogni mossa
   * le tessere salterebbero di posto, e chi stava componendo una parola
   * perderebbe il filo. Una mossa giocata svuota anche la posa in corso.
   */
  const chiaveLeggio = leggio.join('')
  const chiaveCelle = celle.length
  useEffect(() => {
    setSospese([])
    setJollyAperto(null)
    setMano((precedente) => {
      const restano = [...leggio]
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
    // `leggio` cambia identità a ogni stato del server: conta il contenuto, che
    // e' quel che dicono le due chiavi.
  }, [chiaveLeggio, chiaveCelle])

  /** Il tabellone fermo: quello delle mosse gia' giocate. */
  const fisso = useMemo(() => {
    const tab = tabelloneVuoto()
    for (const cella of celle) tab[cella.r * LATO + cella.c] = { lettera: cella.lettera, jolly: cella.jolly }
    return tab
  }, [celle])

  /** Il tabellone fermo piu' le tessere in sospeso. */
  const tabellone = useMemo(() => {
    const tab = [...fisso]
    for (const s of sospese) tab[s.posa.r * LATO + s.posa.c] = { lettera: s.posa.lettera, jolly: s.posa.jolly }
    return tab
  }, [fisso, sospese])

  const impegnate = useMemo(() => new Set(sospese.map((s) => s.indice)), [sospese])

  const anteprima = useMemo(() => {
    if (sospese.length === 0) return null
    return validaPosa(
      fisso,
      sospese.map((s) => s.posa),
      celle.length === 0,
    )
  }, [celle.length, fisso, sospese])

  /** La prossima casella libera nella direzione del cursore. */
  const avanza = useCallback((da: Cursore, tab: (Casella | null)[]): Cursore | null => {
    let { r, c } = da
    for (let passi = 0; passi < LATO; passi += 1) {
      if (da.oriz) c += 1
      else r += 1
      if (r >= LATO || c >= LATO) return null
      if (!tab[r * LATO + c]) return { r, c, oriz: da.oriz }
    }
    return null
  }, [])

  const tocca = useCallback(
    (r: number, c: number) => {
      if (bloccata) return

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
    [avvisa, bloccata, cursore?.oriz, sospese, tabellone],
  )

  /** Mette in campo la tessera i-esima della mano, al cursore. */
  const posaTessera = useCallback(
    (indice: number, lettera: string, jolly: boolean) => {
      if (!cursore) {
        avvisa('Tocca prima una casella del tabellone.')
        return
      }
      const posa: Posa = { r: cursore.r, c: cursore.c, lettera, jolly }
      setSospese((prima) => [...prima, { posa, indice }])
      haptic('tap')

      const tab = [...tabellone]
      tab[cursore.r * LATO + cursore.c] = { lettera, jolly }
      setCursore(avanza(cursore, tab))
    },
    [avanza, avvisa, cursore, tabellone],
  )

  const usaTessera = useCallback(
    (indice: number) => {
      if (bloccata) return
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
    [avvisa, bloccata, cursore, impegnate, mano, posaTessera, sospese.length],
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

  return {
    mano,
    impegnate,
    tabellone,
    sospese: sospese.map((s) => s.posa),
    cursore,
    anteprima,
    jollyAperto,
    messaggio,
    tocca,
    usaTessera,
    scegliJolly,
    chiudiJolly: () => setJollyAperto(null),
    mischia,
    annulla,
    avvisa,
  }
}

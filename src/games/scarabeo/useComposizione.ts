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
import { suona } from '@/lib/suoni'
import { direzioneDellaPosa, direzioneNaturale } from './direzione'

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
  /** Sposta una tessera del leggio da un posto a un altro: per provare le parole, come sul leggio vero. */
  sposta: (da: number, a: number) => void
  /** Posa la tessera i-esima su una casella precisa: e' dove la lascia chi la trascina sul tabellone. */
  posaSu: (indice: number, r: number, c: number) => boolean
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
  ricordo = null,
}: {
  celle: readonly CellaPiena[]
  leggio: readonly string[]
  /** A partita finita, o mentre muove l'altro, non si compone niente. */
  bloccata: boolean
  /** Di quale partita e' il leggio: l'ordine scelto si ricorda anche ricaricando la pagina. */
  ricordo?: string | null
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
    setMano((attuale) => {
      // Alla prima apertura l'ordine e' quello lasciato l'ultima volta, se e' dello stesso leggio.
      const precedente = attuale.length > 0 ? attuale : (ordineRicordato(ricordo, leggio) ?? [])
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
  }, [chiaveLeggio, chiaveCelle, ricordo])

  useEffect(() => {
    if (ricordo && mano.length > 0) ricordaOrdine(ricordo, mano)
  }, [ricordo, mano])

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

  const primaMossa = celle.length === 0

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
        suona('tocco')
        setSospese((prima) => prima.filter((s) => s !== sospesaQui))
        setCursore({ r, c, oriz: cursore?.oriz ?? true })
        return
      }

      if (tabellone[r * LATO + c]) {
        avvisa('Quella casella è già occupata.')
        return
      }

      haptic('tap')
      setCursore((prima) => {
        // Secondo tocco sulla stessa casella: cambia direzione. E' il gesto
        // dell'app vera, e risparmia un controllo a schermo.
        if (prima && prima.r === r && prima.c === c) return { r, c, oriz: !prima.oriz }
        const oriz =
          direzioneDellaPosa(sospese.map((s) => s.posa), r, c) ??
          direzioneNaturale(tabellone, r, c, primaMossa, prima?.oriz ?? true)
        return { r, c, oriz }
      })
    },
    [avvisa, bloccata, cursore?.oriz, primaMossa, sospese, tabellone],
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
      suona('posa')

      const tab = [...tabellone]
      tab[cursore.r * LATO + cursore.c] = { lettera, jolly }
      const oriz = direzioneDellaPosa([...sospese.map((s) => s.posa), posa]) ?? cursore.oriz
      setCursore(avanza({ ...cursore, oriz }, tab))
    },
    [avanza, avvisa, cursore, sospese, tabellone],
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

  const posaSu = useCallback(
    (indice: number, r: number, c: number): boolean => {
      if (bloccata || impegnate.has(indice) || sospese.length >= TESSERE_LEGGIO) return false
      if (tabellone[r * LATO + c]) return false
      const tessera = mano[indice]
      if (tessera === undefined) return false
      const posate = sospese.map((s) => s.posa)
      // La direzione la dicono le tessere gia' posate, o per la prima quel che la casella tocca.
      const oriz =
        direzioneDellaPosa([...posate, { r, c, lettera: tessera, jolly: false }]) ??
        (posate.length === 0 ? direzioneNaturale(tabellone, r, c, primaMossa, cursore?.oriz ?? true) : null) ??
        cursore?.oriz ??
        true
      if (tessera === JOLLY) {
        // Il jolly aspetta la sua lettera: la casella e' gia' quella giusta.
        setCursore({ r, c, oriz })
        setJollyAperto(indice)
        return true
      }
      setSospese((prima) => [...prima, { posa: { r, c, lettera: tessera, jolly: false }, indice }])
      haptic('tap')
      suona('posa')
      const tab = [...tabellone]
      tab[r * LATO + c] = { lettera: tessera, jolly: false }
      setCursore(avanza({ r, c, oriz }, tab))
      return true
    },
    [avanza, bloccata, cursore?.oriz, impegnate, mano, primaMossa, sospese, tabellone],
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
    // Le tessere mescolate: tre colpi di legno di fila.
    ;[0, 0.05, 0.1].forEach((ritardo) => suona('tocco', { ritardo }))
    setMano((prima) => {
      const copia = [...prima]
      for (let i = copia.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[copia[i], copia[j]] = [copia[j], copia[i]]
      }
      return copia
    })
  }, [sospese.length])

  const sposta = useCallback((da: number, a: number) => {
    if (da === a) return
    setMano((prima) => {
      if (da < 0 || a < 0 || da >= prima.length || a >= prima.length) return prima
      const dopo = [...prima]
      const [tessera] = dopo.splice(da, 1)
      dopo.splice(a, 0, tessera)
      return dopo
    })
    // Le tessere gia' sul tabellone ricordano da dove vengono: il loro posto si sposta con il leggio.
    const nuovo = (i: number) =>
      i === da ? a : da < a ? (i > da && i <= a ? i - 1 : i) : i >= a && i < da ? i + 1 : i
    setSospese((prima) => prima.map((s) => ({ ...s, indice: nuovo(s.indice) })))
    setJollyAperto((j) => (j === null ? null : nuovo(j)))
  }, [])

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
    sposta,
    posaSu,
    annulla,
    avvisa,
  }
}

/*
 * L'ordine del leggio si ricorda per una partita sola, l'ultima: e' una comodità,
 * e una chiave per giornata riempirebbe il browser di ordini che non servono più.
 */
const CHIAVE_ORDINE = 'scarabeo-leggio'

function ordineRicordato(ricordo: string | null, leggio: readonly string[]): string[] | null {
  if (!ricordo) return null
  try {
    const salvato = JSON.parse(localStorage.getItem(CHIAVE_ORDINE) ?? 'null') as { partita?: string; mano?: unknown }
    if (salvato?.partita !== ricordo || !Array.isArray(salvato.mano)) return null
    const mano = salvato.mano.filter((t): t is string => typeof t === 'string')
    // Vale solo se sono le stesse tessere: altrimenti il leggio e' cambiato altrove.
    const ordina = (tessere: readonly string[]) => [...tessere].sort().join('')
    return ordina(mano) === ordina(leggio) ? mano : null
  } catch {
    return null
  }
}

function ricordaOrdine(ricordo: string, mano: readonly string[]): void {
  try {
    localStorage.setItem(CHIAVE_ORDINE, JSON.stringify({ partita: ricordo, mano }))
  } catch {
    // Senza memoria del browser l'ordine resta fino alla prossima apertura, e basta.
  }
}

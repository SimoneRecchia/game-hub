import { useCallback, useMemo, useRef, useState } from 'react'
import { CASELLE, LATO, UNITA, VICINI, VUOTA, colonnaDi, doppioni, rigaDi, riquadroDi } from '@shared/sudoku'

/**
 * La griglia che si sta scrivendo, uguale per la classificata e per la
 * libera: la casella scelta, le cifre, le note a matita, e l'annulla.
 *
 * Scrivere una cifra toglie la stessa cifra dalle note delle caselle che la
 * vedono, come fanno le app di sudoku: le note servono a ricordare dove una
 * cifra puo' ancora stare, e dove non puo' piu' stare non servono. Anche questa
 * pulizia si annulla con un tocco, insieme alla cifra.
 */

interface Passo {
  cifre: string
  note: Uint16Array
  selezione: number | null
}

export interface Editor {
  cifre: string
  note: Uint16Array
  selezione: number | null
  modoNote: boolean
  /** Le caselle con una cifra che se ne vede un'altra uguale: si segnano subito. */
  doppioni: ReadonlySet<number>
  /** Le unità (righe, colonne, riquadri) appena completate, per un momento. */
  completate: ReadonlySet<number>
  /** Quante volte e' scritta ogni cifra: il tastierino spegne quelle finite. */
  conteggi: number[]
  puoAnnullare: boolean
  seleziona: (k: number) => void
  sposta: (dr: number, dc: number) => void
  scrivi: (d: number) => void
  cancella: () => void
  annulla: () => void
  cambiaModo: () => void
  /** Rimette tutto da uno stato arrivato da fuori (il server, il telefono). */
  carica: (cifre: string, note: Uint16Array) => void
  /** Cambia cifre da fuori, senza passare dall'annulla: le caselle svelate. */
  imponi: (cambi: Record<number, string>) => void
}

const bit = (d: number) => 1 << (d - 1)

function sostituisci(testo: string, k: number, c: string): string {
  return testo.slice(0, k) + c + testo.slice(k + 1)
}

/** Le unità piene e senza doppioni che contengono la casella. */
function unitaComplete(cifre: string, k: number): number[] {
  return [rigaDi(k), LATO + colonnaDi(k), 2 * LATO + riquadroDi(k)].filter((u) => {
    const viste = new Set<string>()
    for (const j of UNITA[u]) {
      if (cifre[j] === VUOTA || viste.has(cifre[j])) return false
      viste.add(cifre[j])
    }
    return true
  })
}

export function useEditor({
  dati,
  bloccate,
  attivo,
  onCambio,
}: {
  dati: string
  /** Caselle da non toccare, oltre alle date: le svelate. */
  bloccate: ReadonlySet<number>
  /** A partita finita non si scrive piu'. */
  attivo: boolean
  onCambio: (cifre: string, note: Uint16Array, subito: boolean) => void
}): Editor {
  const [cifre, setCifre] = useState(dati)
  const [note, setNote] = useState(() => new Uint16Array(CASELLE))
  const [selezione, setSelezione] = useState<number | null>(null)
  const [modoNote, setModoNote] = useState(false)
  const [completate, setCompletate] = useState<ReadonlySet<number>>(new Set())
  const storia = useRef<Passo[]>([])
  const [passi, setPassi] = useState(0)
  // Gli ultimi valori, per le funzioni che partono da un tasto.
  const stato = useRef({ cifre, note, selezione })
  stato.current = { cifre, note, selezione }
  const timerCompletate = useRef<ReturnType<typeof setTimeout> | null>(null)

  const modificabile = useCallback(
    (k: number | null): k is number => k !== null && attivo && dati[k] === VUOTA && !bloccate.has(k),
    [attivo, dati, bloccate],
  )

  const applica = useCallback(
    (nuoveCifre: string, nuoveNote: Uint16Array, subito = false) => {
      storia.current.push({ ...stato.current })
      if (storia.current.length > 200) storia.current.shift()
      setPassi(storia.current.length)
      setCifre(nuoveCifre)
      setNote(nuoveNote)
      onCambio(nuoveCifre, nuoveNote, subito)
    },
    [onCambio],
  )

  const scrivi = useCallback(
    (d: number) => {
      const { cifre: c, note: n, selezione: k } = stato.current
      if (!modificabile(k)) return
      if (modoNote) {
        if (c[k] !== VUOTA) return
        const dopo = n.slice()
        dopo[k] ^= bit(d)
        applica(c, dopo)
        return
      }
      const cifra = String(d)
      // La stessa cifra una seconda volta la toglie.
      if (c[k] === cifra) {
        applica(sostituisci(c, k, VUOTA), n)
        return
      }
      const dopoCifre = sostituisci(c, k, cifra)
      const dopoNote = n.slice()
      dopoNote[k] = 0
      for (const j of VICINI[k]) dopoNote[j] &= ~bit(d)
      const piena = !dopoCifre.includes(VUOTA)
      applica(dopoCifre, dopoNote, piena)
      const nuove = unitaComplete(dopoCifre, k).filter((u) => !unitaComplete(c, k).includes(u))
      if (nuove.length > 0) {
        setCompletate(new Set(nuove))
        if (timerCompletate.current) clearTimeout(timerCompletate.current)
        timerCompletate.current = setTimeout(() => setCompletate(new Set()), 900)
      }
    },
    [applica, modificabile, modoNote],
  )

  const cancella = useCallback(() => {
    const { cifre: c, note: n, selezione: k } = stato.current
    if (!modificabile(k)) return
    if (c[k] === VUOTA && n[k] === 0) return
    const dopo = n.slice()
    dopo[k] = 0
    applica(sostituisci(c, k, VUOTA), dopo)
  }, [applica, modificabile])

  const annulla = useCallback(() => {
    const passo = storia.current.pop()
    setPassi(storia.current.length)
    if (!passo || !attivo) return
    // Le caselle svelate nel frattempo restano svelate.
    let c = passo.cifre
    for (const k of bloccate) c = sostituisci(c, k, stato.current.cifre[k])
    setCifre(c)
    setNote(passo.note)
    setSelezione(passo.selezione)
    onCambio(c, passo.note, false)
  }, [attivo, bloccate, onCambio])

  const sposta = useCallback((dr: number, dc: number) => {
    setSelezione((k) => {
      if (k === null) return 40
      const r = (rigaDi(k) + dr + LATO) % LATO
      const c = (colonnaDi(k) + dc + LATO) % LATO
      return r * LATO + c
    })
  }, [])

  const carica = useCallback((nuoveCifre: string, nuoveNote: Uint16Array) => {
    setCifre(nuoveCifre)
    setNote(nuoveNote)
    storia.current = []
    setPassi(0)
    // Si comincia dalla prima casella da scrivere, a meta' griglia se c'e'.
    setSelezione((prima) => prima ?? (nuoveCifre[40] === VUOTA ? 40 : Math.max(0, nuoveCifre.indexOf(VUOTA))))
  }, [])

  const imponi = useCallback((cambi: Record<number, string>) => {
    setCifre((c) => {
      let dopo = c
      for (const [k, d] of Object.entries(cambi)) dopo = sostituisci(dopo, Number(k), d)
      return dopo
    })
    setNote((n) => {
      const dopo = n.slice()
      for (const k of Object.keys(cambi)) dopo[Number(k)] = 0
      return dopo
    })
  }, [])

  const doppie = useMemo(() => new Set(doppioni(cifre)), [cifre])
  const conteggi = useMemo(() => {
    const out = Array.from({ length: 10 }, () => 0)
    for (const c of cifre) if (c !== VUOTA) out[Number(c)] += 1
    return out
  }, [cifre])

  return {
    cifre,
    note,
    selezione,
    modoNote,
    doppioni: doppie,
    completate,
    conteggi,
    puoAnnullare: passi > 0 && attivo,
    seleziona: setSelezione,
    sposta,
    scrivi,
    cancella,
    annulla,
    cambiaModo: () => setModoNote((m) => !m),
    carica,
    imponi,
  }
}

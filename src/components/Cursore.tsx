import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import { suona } from '@/lib/suoni'
import './Cursore.css'

interface Props<T> {
  /** I punti, in ordine: la maniglia si ferma solo su questi. */
  valori: readonly T[]
  valore: T
  onChange: (valore: T) => void
  /** Come si scrive ogni punto sotto la pista: "10", "15 s", "Senza". */
  etichetta: (valore: T) => string
  /** Come lo legge chi non vede, se non basta l'etichetta: "senza tempo". */
  voce?: (valore: T) => string
  ariaLabel: string
}

/** Quanto vicino a un punto la maniglia ci resta attaccata, in parte della distanza fra due punti. */
export const MAGNETE = 0.3

/** Il punto piu' vicino a una posizione della pista, da 0 a 1, fra `n` punti alla stessa distanza. */
export function puntoDi(posizione: number, n: number): number {
  if (n < 2) return 0
  return Math.min(n - 1, Math.max(0, Math.round(posizione * (n - 1))))
}

/** Dove sta la maniglia sotto il dito: sopra il punto, se il dito gli e' vicino; se no, dove sta il dito. */
export function conMagnete(posizione: number, n: number): number {
  if (n < 2) return 0
  const passo = 1 / (n - 1)
  const punto = puntoDi(posizione, n) * passo
  return Math.abs(posizione - punto) < MAGNETE * passo ? punto : posizione
}

/**
 * Un cursore a punti, per scegliere fra tante alternative numeriche: le
 * domande di una partita, i secondi per domanda. Con sette voci un controllo
 * segmentato non si legge più, e un cursore dice anche l'ordine.
 *
 * Mentre si trascina la maniglia segue il dito, ma vicino a un punto ci resta
 * attaccata, come una calamita; lasciata, scatta sul punto piu' vicino con una
 * molla. Il valore cambia appena si passa su un punto nuovo, con un clic, così
 * si sente dove si e'. Si puo' anche toccare un punto o la sua etichetta, e da
 * tastiera le frecce vanno da un punto all'altro.
 *
 * I punti sono alla stessa distanza, qualunque sia il valore: e' una scala di
 * scelte, non un righello.
 */
export function Cursore<T>({ valori, valore, onChange, etichetta, voce, ariaLabel }: Props<T>) {
  const pista = useRef<HTMLDivElement>(null)
  /** Dove sta la maniglia mentre si trascina, da 0 a 1; `null` quando sta sul suo punto. */
  const [trascina, setTrascina] = useState<number | null>(null)
  /** Se il dito la tiene: lo stato arriva un giro dopo, e il primo movimento andrebbe perso. */
  const inPresa = useRef(false)
  const n = valori.length
  const indice = Math.max(0, valori.indexOf(valore))
  // L'ultimo punto scelto: trascinando si cambia prima che il valore di chi ci usa torni qui.
  const ultimo = useRef(indice)
  if (trascina === null) ultimo.current = indice

  const passo = n > 1 ? 1 / (n - 1) : 1
  const posizione = trascina ?? indice * passo

  const scegli = (i: number) => {
    const giusto = Math.min(n - 1, Math.max(0, i))
    if (giusto === ultimo.current) return
    ultimo.current = giusto
    suona('tocco', { volume: 0.5 })
    onChange(valori[giusto])
  }

  const daDito = (clientX: number) => {
    const r = pista.current!.getBoundingClientRect()
    return r.width > 0 ? Math.min(1, Math.max(0, (clientX - r.left) / r.width)) : 0
  }

  const segui = (clientX: number) => {
    const p = daDito(clientX)
    setTrascina(conMagnete(p, n))
    scegli(puntoDi(p, n))
  }

  const giu = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    inPresa.current = true
    segui(e.clientX)
  }

  const muovi = (e: PointerEvent<HTMLDivElement>) => {
    if (inPresa.current) segui(e.clientX)
  }

  const su = () => {
    inPresa.current = false
    setTrascina(null)
  }

  const tasto = (e: KeyboardEvent<HTMLDivElement>) => {
    const verso: Record<string, number> = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }
    if (e.key in verso) scegli(indice + verso[e.key])
    else if (e.key === 'Home') scegli(0)
    else if (e.key === 'End') scegli(n - 1)
    else return
    e.preventDefault()
  }

  const attivo = trascina === null ? indice : puntoDi(trascina, n)
  const stile = { '--pos': posizione } as CSSProperties

  return (
    <div className={`cursore${trascina !== null ? ' is-trascina' : ''}`} style={stile}>
      <div
        ref={pista}
        className="cursore__pista"
        onPointerDown={giu}
        onPointerMove={muovi}
        onPointerUp={su}
        onPointerCancel={su}
        onLostPointerCapture={su}
      >
        <span className="cursore__pieno" aria-hidden="true" />
        {valori.map((v, i) => (
          <span
            key={String(v)}
            className={`cursore__punto${i <= attivo ? ' is-dentro' : ''}`}
            style={{ '--punto': i * passo } as CSSProperties}
            aria-hidden="true"
          />
        ))}
        <div
          className="cursore__maniglia"
          role="slider"
          tabIndex={0}
          aria-label={ariaLabel}
          aria-valuemin={0}
          aria-valuemax={n - 1}
          aria-valuenow={indice}
          aria-valuetext={(voce ?? etichetta)(valore)}
          onKeyDown={tasto}
        />
      </div>
      <div className="cursore__etichette" aria-hidden="true">
        {valori.map((v, i) => (
          <button
            key={String(v)}
            type="button"
            tabIndex={-1}
            className={`cursore__etichetta${i === attivo ? ' is-scelta' : ''}`}
            style={{ '--punto': i * passo } as CSSProperties}
            onClick={() => scegli(i)}
          >
            {etichetta(v)}
          </button>
        ))}
      </div>
    </div>
  )
}

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import { Sheet } from '@/components/Sheet'
import { haptic } from '@/lib/haptics'
import { JOLLY, LATO, VALORI } from '@shared/scarabeo'
import './Leggio.css'

interface Props {
  mano: string[]
  /** Indici già posati sul tabellone: restano visibili ma spenti. */
  impegnate: Set<number>
  /** Modo cambio: toccare una tessera la seleziona invece di posarla. */
  cambio: boolean
  selezione: Set<number>
  bloccato: boolean
  onUsa: (indice: number) => void
  /** Sposta una tessera del leggio: trascinandola, o con Alt e le frecce. */
  onSposta?: (da: number, a: number) => void
  /** Posa una tessera lasciata su una casella del tabellone; false se lì non si può. */
  onPosa?: (indice: number, r: number, c: number) => boolean
}

/** Quanto deve muoversi il dito prima che un tocco diventi una tessera presa. */
const SOGLIA = 6
/** Quanto ci mette la tessera lasciata ad arrivare al suo posto nuovo (come in Leggio.css). */
const POSA_MS = 140

/** Una tessera presa con il dito: da dove viene, dove andrebbe, e di quanto si e' mossa. */
interface Presa {
  da: number
  a: number
  /** La casella del tabellone sotto il dito, se la tessera e' uscita dal leggio verso l'alto. */
  casella: number | null
  pointerId: number
  x0: number
  y0: number
  dx: number
  dy: number
  /** I centri dei posti del leggio, misurati quando la si prende: il leggio non si muove. */
  centri: number[]
  /** Il bordo alto del leggio: sopra, la tessera va verso il tabellone. */
  cima: number
  attiva: boolean
  posando: boolean
}

/**
 * Il leggio.
 *
 * Le tessere impegnate non spariscono: restano al loro posto, spente. Sparendo,
 * le altre slitterebbero sotto il dito mentre si compone una parola — e chi sta
 * scrivendo "quantile" toccherebbe la tessera sbagliata al terzo tocco.
 *
 * Toccata, una tessera va sul tabellone; trascinata, cambia posto sul leggio,
 * come quelle di legno quando si cerca una parola: le altre le fanno spazio, e
 * lasciata si posa nel posto nuovo. Portata su fino al tabellone, si posa sulla
 * casella dove la si lascia. Il tocco e il trascinamento si distinguono da
 * quanto si muove il dito (`SOGLIA`).
 */
export function Leggio({ mano, impegnate, cambio, selezione, bloccato, onUsa, onSposta, onPosa }: Props) {
  const [presa, setPresa] = useState<Presa | null>(null)
  const riga = useRef<HTMLDivElement>(null)
  // Dopo un trascinamento il browser manda comunque il click: quello non deve posare la tessera.
  const trascinata = useRef(false)
  const timer = useRef<number | null>(null)
  const [fuoco, setFuoco] = useState<number | null>(null)
  const spostabile = !!onSposta && !cambio && mano.length > 1

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current)
      segnaCasella(null)
    },
    [],
  )

  // Spostata con la tastiera, la tessera tiene il fuoco anche nel posto nuovo.
  useEffect(() => {
    if (fuoco === null) return
    riga.current?.querySelectorAll<HTMLButtonElement>('.tessera')[fuoco]?.focus()
    setFuoco(null)
  }, [fuoco, mano])

  function prendi(e: PointerEvent<HTMLButtonElement>, i: number) {
    if (!spostabile || presa || (e.pointerType === 'mouse' && e.button !== 0)) return
    const tessere = riga.current?.querySelectorAll<HTMLElement>('.tessera')
    if (!tessere) return
    const centri = [...tessere].map((t) => {
      const r = t.getBoundingClientRect()
      return r.left + r.width / 2
    })
    const cima = riga.current?.getBoundingClientRect().top ?? 0
    e.currentTarget.setPointerCapture(e.pointerId)
    setPresa({
      da: i,
      a: i,
      casella: null,
      cima,
      pointerId: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      dx: 0,
      dy: 0,
      centri,
      attiva: false,
      posando: false,
    })
  }

  function muovi(e: PointerEvent<HTMLButtonElement>) {
    if (!presa || presa.posando || e.pointerId !== presa.pointerId) return
    const dx = e.clientX - presa.x0
    const dy = e.clientY - presa.y0
    const attiva = presa.attiva || Math.hypot(dx, dy) > SOGLIA
    if (!attiva) return
    // Sopra il leggio la tessera va verso il tabellone: il leggio resta com'era, e si cerca la casella.
    if (onPosa && !impegnate.has(presa.da) && e.clientY < presa.cima - 8) {
      const casella = casellaSotto(e.clientX, e.clientY)
      if (casella !== presa.casella) {
        segnaCasella(casella)
        if (casella !== null) haptic('tap')
      }
      setPresa({ ...presa, dx, dy, a: presa.da, casella, attiva: true })
      return
    }
    if (presa.casella !== null) segnaCasella(null)
    // Il posto nuovo e' quello col centro piu' vicino alla tessera che si muove.
    const x = presa.centri[presa.da] + dx
    let a = 0
    presa.centri.forEach((c, k) => {
      if (Math.abs(c - x) < Math.abs(presa.centri[a] - x)) a = k
    })
    if (!presa.attiva || a !== presa.a) haptic('tap')
    setPresa({ ...presa, dx, dy, a, casella: null, attiva: true })
  }

  function lascia(e: PointerEvent<HTMLButtonElement>) {
    if (!presa || presa.posando || e.pointerId !== presa.pointerId) return
    if (!presa.attiva) {
      setPresa(null)
      return
    }
    trascinata.current = true
    const { da, casella } = presa
    segnaCasella(null)
    // Lasciata su una casella libera: va sul tabellone, e il suo posto sul leggio si spegne come per un tocco.
    if (casella !== null && onPosa?.(da, Math.floor(casella / LATO), casella % LATO)) {
      setPresa(null)
      return
    }
    // Altrimenti torna sul leggio: nel posto nuovo, o nel suo se era uscita verso il tabellone.
    const a = e.clientY < presa.cima - 8 ? da : presa.a
    setPresa({ ...presa, a, posando: true })
    timer.current = window.setTimeout(() => {
      setPresa(null)
      onSposta?.(da, a)
    }, POSA_MS)
  }

  function annullaPresa() {
    if (presa?.posando) return
    segnaCasella(null)
    setPresa(null)
  }

  function tastiera(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    if (!spostabile || !e.altKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return
    e.preventDefault()
    const a = e.key === 'ArrowLeft' ? i - 1 : i + 1
    if (a < 0 || a >= mano.length) return
    onSposta?.(i, a)
    setFuoco(a)
  }

  const passo = presa && presa.centri.length > 1 ? presa.centri[1] - presa.centri[0] : 0
  /** Di quanto scivola una tessera per far posto a quella presa. */
  function scarto(j: number): number {
    if (!presa?.attiva || j === presa.da) return 0
    if (presa.da < presa.a && j > presa.da && j <= presa.a) return -passo
    if (presa.da > presa.a && j >= presa.a && j < presa.da) return passo
    return 0
  }

  return (
    <div
      ref={riga}
      className={`leggio${presa?.attiva ? ' is-riordino' : ''}`}
      role="group"
      aria-label="Le tue tessere"
      aria-keyshortcuts={spostabile ? 'Alt+ArrowLeft Alt+ArrowRight' : undefined}
    >
      {mano.map((tessera, i) => {
        const usata = impegnate.has(i)
        const scelta = selezione.has(i)
        const jolly = tessera === JOLLY
        const presaQui = presa?.attiva && presa.da === i
        let stile: CSSProperties | undefined
        if (presaQui) {
          stile = {
            transform: presa.posando
              ? `translate(${(presa.a - presa.da) * passo}px, 0)`
              : `translate(${presa.dx}px, ${presa.dy}px) scale(1.1)`,
          }
        } else if (scarto(i) !== 0) {
          stile = { transform: `translateX(${scarto(i)}px)` }
        }
        return (
          <button
            type="button"
            key={`${tessera}-${i}`}
            className={`tessera${usata ? ' is-usata' : ''}${scelta ? ' is-scelta' : ''}${
              jolly ? ' tessera--jolly' : ''
            }${presaQui ? ` is-presa${presa.posando ? ' is-posando' : ''}` : ''}`}
            style={stile}
            // Mentre si aspetta non si posa niente, ma le tessere si possono riordinare lo stesso.
            disabled={usata && !cambio}
            aria-disabled={bloccato || undefined}
            aria-pressed={cambio ? scelta : undefined}
            aria-label={jolly ? 'Jolly, vale zero e prende la lettera che vuoi' : tessera.toUpperCase()}
            onPointerDown={(e) => prendi(e, i)}
            onPointerMove={muovi}
            onPointerUp={lascia}
            onPointerCancel={annullaPresa}
            onKeyDown={(e) => tastiera(e, i)}
            onClick={() => {
              if (trascinata.current) {
                trascinata.current = false
                return
              }
              if (!bloccato) onUsa(i)
            }}
          >
            <span className="tessera__lettera">{jolly ? '★' : tessera.toUpperCase()}</span>
            <span className="tessera__valore" aria-hidden="true">
              {jolly ? 0 : VALORI[tessera]}
            </span>
          </button>
        )
      })}
      {mano.length === 0 && <p className="leggio__vuoto">Sacchetto e leggio vuoti.</p>}
    </div>
  )
}

/** La casella libera del tabellone sotto il dito, da 0 a 224; null se li' non c'e', o e' occupata. */
function casellaSotto(x: number, y: number): number | null {
  const cella = document
    .elementsFromPoint(x, y)
    .find((el) => el.getAttribute('role') === 'gridcell' && el.closest('.tabellone'))
  if (!cella?.parentElement || cella.matches('.cella--tessera, .cella--sospesa')) return null
  const indice = Array.prototype.indexOf.call(cella.parentElement.children, cella)
  return indice >= 0 && indice < LATO * LATO ? indice : null
}

/**
 * La casella dove cadrebbe la tessera, segnata direttamente sul tabellone: e'
 * un disegno di un attimo, e passarlo per lo stato ridisegnerebbe tutte le
 * duecentoventicinque caselle a ogni movimento del dito.
 */
function segnaCasella(indice: number | null) {
  document.querySelectorAll('.tabellone .cella--bersaglio').forEach((el) => el.classList.remove('cella--bersaglio'))
  if (indice === null) return
  document.querySelector('.tabellone')?.children[indice]?.classList.add('cella--bersaglio')
}

/** Le 21 lettere, per dare un valore al jolly appena posato. */
export function ScegliJolly({
  aperto,
  onScegli,
  onChiudi,
}: {
  aperto: boolean
  onScegli: (lettera: string) => void
  onChiudi: () => void
}) {
  return (
    <Sheet open={aperto} onClose={onChiudi} title="Che lettera è?">
      <p className="jolly__lede">
        Il jolly <strong>vale zero punti</strong>.
      </p>
      <div className="jolly__griglia">
        {Object.keys(VALORI).map((lettera) => (
          <button
            type="button"
            key={lettera}
            className="tessera tessera--scelta-jolly"
            onClick={() => onScegli(lettera)}
          >
            <span className="tessera__lettera">{lettera.toUpperCase()}</span>
          </button>
        ))}
      </div>
    </Sheet>
  )
}

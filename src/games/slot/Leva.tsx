import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { suona } from '@/lib/suoni'

/**
 * La leva della slot, sul fianco destro del mobile: la si prende per il pomo e
 * la si tira giu'. Oltre `SOGLIA` i rulli partono, e la leva torna su da sola
 * con un rimbalzo; lasciata prima, torna su e non succede niente. Un tocco
 * senza trascinare la tira tutta, e con la tastiera la tirano Invio e lo
 * spazio: e' un bottone, per chi non trascina.
 *
 * Si vede di fronte: il pomo scende lungo il fianco e si fa piu' grande, perché
 * viene verso chi guarda, e l'asta si accorcia passando davanti al perno.
 */

const SOGLIA = 0.6
/** In alto e in basso, nel disegno: il pomo scende di questo. */
const POMO_SU = 26
const POMO_GIU = 214
const PERNO = { x: 16, y: 114 }
const ANDATA_MS = 160
const RITORNO_MS = 620

/** Il ritorno con un rimbalzo: una molla che si ferma. */
const molla = (u: number) => 1 - Math.exp(-6 * u) * Math.cos(9 * u)

export function Leva({ attiva, onTira }: { attiva: boolean; onTira: () => void }) {
  const id = useId().replace(/:/g, '')
  const [tirata, setTirata] = useState(0)
  const presa = useRef<{ y0: number; corsa: number; mossa: boolean } | null>(null)
  const animazione = useRef(0)
  const ultimoScatto = useRef(0)
  const tira = useRef(onTira)
  useEffect(() => {
    tira.current = onTira
  })
  useEffect(() => () => cancelAnimationFrame(animazione.current), [])

  const anima = (da: number, a: number, durata: number, curva: (u: number) => number, poi?: () => void) => {
    cancelAnimationFrame(animazione.current)
    const ridotto = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (ridotto) {
      setTirata(a)
      poi?.()
      return
    }
    const inizio = performance.now()
    const passo = (t: number) => {
      const u = Math.min(1, (t - inizio) / durata)
      setTirata(da + (a - da) * curva(u))
      if (u < 1) animazione.current = requestAnimationFrame(passo)
      else poi?.()
    }
    animazione.current = requestAnimationFrame(passo)
  }

  /** Giu' fino in fondo, il colpo, i rulli che partono, e su con la molla. */
  const finoInFondo = (da: number) => {
    anima(da, 1, ANDATA_MS * (1 - da) + 40, (u) => u * u, () => {
      suona('leva')
      tira.current()
      anima(1, 0, RITORNO_MS, molla)
    })
  }

  const scatti = (valore: number) => {
    // Il cricchetto: uno scatto ogni ottavo di corsa.
    const tacca = Math.floor(valore * 8)
    if (tacca > ultimoScatto.current) suona('scatto', { volume: 0.5 })
    ultimoScatto.current = tacca
  }

  const giu = (e: PointerEvent<SVGSVGElement>) => {
    if (!attiva) return
    // Il dito non da' il fuoco alla leva: il riquadro del fuoco e' per la tastiera.
    e.preventDefault()
    cancelAnimationFrame(animazione.current)
    const box = e.currentTarget.getBoundingClientRect()
    presa.current = { y0: e.clientY, corsa: (box.height * (POMO_GIU - POMO_SU)) / 240, mossa: false }
    ultimoScatto.current = 0
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const muovi = (e: PointerEvent<SVGSVGElement>) => {
    const p = presa.current
    if (!p) return
    const valore = Math.max(0, Math.min(1, (e.clientY - p.y0) / p.corsa))
    if (valore > 0.04) p.mossa = true
    scatti(valore)
    setTirata(valore)
  }
  const su = () => {
    const p = presa.current
    presa.current = null
    if (!p) return
    if (!p.mossa || tirata >= SOGLIA) finoInFondo(tirata)
    else anima(tirata, 0, RITORNO_MS * 0.7, molla)
  }
  const tasto = (e: KeyboardEvent<SVGSVGElement>) => {
    if (!attiva || (e.key !== 'Enter' && e.key !== ' ')) return
    e.preventDefault()
    finoInFondo(0)
  }

  const y = POMO_SU + (POMO_GIU - POMO_SU) * tirata
  // Piu' giu', piu' vicino a chi guarda: il pomo si fa grande.
  const scala = 1 + 0.28 * Math.sin(Math.PI * Math.min(1, tirata * 1.1) * 0.5)
  const r = 13 * scala
  return (
    <svg
      className={`slot-leva${attiva ? '' : ' is-ferma'}`}
      viewBox="0 0 64 240"
      role="button"
      tabIndex={attiva ? 0 : -1}
      aria-label="Tira la leva"
      aria-disabled={!attiva}
      onPointerDown={giu}
      onPointerMove={muovi}
      onPointerUp={su}
      onPointerCancel={su}
      onKeyDown={tasto}
    >
      <defs>
        <linearGradient id={`${id}-cromo`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#6d7380" />
          <stop offset="0.35" stopColor="#f4f6fa" />
          <stop offset="0.6" stopColor="#a5acb8" />
          <stop offset="1" stopColor="#4a505b" />
        </linearGradient>
        <radialGradient id={`${id}-pomo`} cx="35%" cy="30%" r="75%">
          <stop offset="0" stopColor="#ff9aa5" />
          <stop offset="0.45" stopColor="#e3132f" />
          <stop offset="1" stopColor="#5c000f" />
        </radialGradient>
      </defs>
      {/* La guida in cui scende il pomo, e la piastra del perno contro il mobile. */}
      <rect x={38} y={POMO_SU - 4} width={12} height={POMO_GIU - POMO_SU + 8} rx={6} className="slot-leva__guida" />
      <rect x={0} y={92} width={26} height={44} rx={8} fill={`url(#${id}-cromo)`} className="slot-leva__piastra" />
      <line
        x1={PERNO.x}
        y1={PERNO.y}
        x2={44}
        y2={y}
        stroke={`url(#${id}-cromo)`}
        strokeWidth={8}
        strokeLinecap="round"
      />
      <line x1={PERNO.x} y1={PERNO.y} x2={44} y2={y} stroke="#fff" strokeOpacity={0.45} strokeWidth={2} />
      <circle cx={PERNO.x} cy={PERNO.y} r={9} fill={`url(#${id}-cromo)`} stroke="#3c4048" strokeWidth={1.5} />
      <circle cx={44} cy={y + 3} r={r} fill="#000" opacity={0.25} />
      <circle cx={44} cy={y} r={r} fill={`url(#${id}-pomo)`} stroke="#4a000c" strokeWidth={1.5} />
      <ellipse cx={44 - r * 0.32} cy={y - r * 0.38} rx={r * 0.34} ry={r * 0.2} fill="#fff" opacity={0.7} />
    </svg>
  )
}

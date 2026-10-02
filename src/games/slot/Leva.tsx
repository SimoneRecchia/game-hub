import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { suona } from '@/lib/suoni'

/**
 * La leva della slot, sul fianco destro del mobile, come quella vera: un
 * braccio che ruota attorno al perno nel piano del fianco. Tirandola il pomo
 * scende e intanto viene verso chi guarda: a meta' corsa il braccio punta
 * dritto avanti e si vede di scorcio, col pomo grande davanti al perno; in
 * fondo punta avanti e giu'. Il disegno e' una proiezione: il braccio ha un
 * angolo (`θ`), il pomo una profondita', e grandezza e posto vengono da li'.
 *
 * Chi guarda sta davanti al mobile, un poco a destra della leva e
 * all'altezza del perno: e' il punto di vista del fianco disegnato in
 * Slot.css (`.slot-fianco`), quindi il pomo che viene avanti scivola appena
 * verso il mobile, come deve. Le misure sono in centesimi della larghezza del
 * mobile, con l'origine in cima al riquadro della leva, che Slot.css mette
 * due centesimi dentro il fianco e trenta sotto il bordo di sopra.
 *
 * Oltre `SOGLIA` i rulli partono e la leva torna su con una molla; lasciata
 * prima, torna su e non succede niente. Un tocco senza trascinare la tira
 * tutta, e con la tastiera la tirano Invio e lo spazio: e' un bottone, per chi
 * non trascina. Ferma da un po', la leva da' un colpetto, per farsi notare.
 */

const SOGLIA = 0.6
/** L'angolo del braccio, in gradi: a riposo un filo indietro, tirata avanti e in giu'. */
const RIPOSO = -8
const TIRATA = 138
/** Il perno, con la sua profondita' dietro il fronte del mobile, e la lunghezza del braccio. */
const PERNO = { x: 6.5, y: 54, z: -14 }
const BRACCIO = 44
/** L'occhio di chi guarda, e quanto sta lontano dal fronte. */
const OCCHIO = { x: 24, y: 54 }
const DISTANZA = 130
/** Il fianco del mobile e la piastra della leva, nel piano del fianco. */
const FIANCO_X = 2
const PIASTRA = { da: -22, a: -6, alta: 10 }
const MOZZO = 3.2
const POMO = 7
/** Il riquadro del disegno: Slot.css gli da' queste proporzioni. */
const LARGO = 16
const ALTO = 105
const ANDATA_MS = 170
const RITORNO_MS = 680
const INVITO_MS = 7_000

/** Il ritorno con un rimbalzo: una molla che si ferma. */
const molla = (u: number) => 1 - Math.exp(-6 * u) * Math.cos(9 * u)

const radianti = (t: number) => ((RIPOSO + (TIRATA - RIPOSO) * t) * Math.PI) / 180

/** Dove si vede un punto, e quanto grande: la prospettiva di chi guarda. */
function vista(x: number, y: number, z: number) {
  const k = DISTANZA / (DISTANZA - z)
  return { x: OCCHIO.x + (x - OCCHIO.x) * k, y: OCCHIO.y + (y - OCCHIO.y) * k, k, z }
}

/** Un punto del braccio, a una distanza `d` dal perno, con il braccio a `θ`. */
const sulBraccio = (theta: number, d: number) =>
  vista(PERNO.x, PERNO.y - d * Math.cos(theta), PERNO.z + d * Math.sin(theta))

const punti = (lista: Array<[number, number]>) => lista.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ')

/** La piastra sul fianco: un rettangolo nel piano del fianco, che si vede di taglio. */
const PIASTRA_PUNTI = (() => {
  const vicino = vista(FIANCO_X, PERNO.y, PIASTRA.a)
  const lontano = vista(FIANCO_X, PERNO.y, PIASTRA.da)
  return punti([
    [vicino.x, PERNO.y - PIASTRA.alta * vicino.k],
    [lontano.x, PERNO.y - PIASTRA.alta * lontano.k],
    [lontano.x, PERNO.y + PIASTRA.alta * lontano.k],
    [vicino.x, PERNO.y + PIASTRA.alta * vicino.k],
  ])
})()

/** Il mozzo: un cilindro che esce dal fianco fino al piano del braccio. */
const MOZZO_DISEGNO = (() => {
  const dentro = vista(FIANCO_X, PERNO.y, PERNO.z)
  const fuori = vista(PERNO.x, PERNO.y, PERNO.z)
  return { x0: dentro.x, x1: fuori.x, r: MOZZO * fuori.k }
})()

export function Leva({ attiva, onTira }: { attiva: boolean; onTira: () => void }) {
  const id = useId().replace(/:/g, '')
  const [tirata, setTirata] = useState(0)
  const presa = useRef<{ y0: number; corsa: number; mossa: boolean } | null>(null)
  const animazione = useRef(0)
  const ultimoScatto = useRef(0)
  const ultimoTocco = useRef(Date.now())
  const tira = useRef(onTira)
  useEffect(() => {
    tira.current = onTira
  })
  useEffect(() => () => cancelAnimationFrame(animazione.current), [])

  const anima = (da: number, a: number, durata: number, curva: (u: number) => number, poi?: () => void) => {
    cancelAnimationFrame(animazione.current)
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
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

  // Il colpetto: ferma da un po', la leva scende di un niente e torna su, come se qualcuno l'avesse sfiorata.
  useEffect(() => {
    if (!attiva) return
    const t = window.setInterval(() => {
      if (presa.current || Date.now() - ultimoTocco.current < INVITO_MS) return
      ultimoTocco.current = Date.now()
      anima(0, 0.1, 260, (u) => Math.sin(u * Math.PI), () => setTirata(0))
    }, 1_000)
    return () => window.clearInterval(t)
  }, [attiva])

  /** Giu' fino in fondo, il colpo, i rulli che partono, e su con la molla. */
  const finoInFondo = (da: number) => {
    ultimoTocco.current = Date.now()
    anima(da, 1, ANDATA_MS * (1 - da) + 50, (u) => u * u, () => {
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
    const corsa = sulBraccio(radianti(1), BRACCIO).y - sulBraccio(radianti(0), BRACCIO).y
    presa.current = { y0: e.clientY, corsa: (box.height * corsa) / ALTO, mossa: false }
    ultimoScatto.current = 0
    ultimoTocco.current = Date.now()
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

  const theta = radianti(tirata)
  const pomo = sulBraccio(theta, BRACCIO)
  const radice = sulBraccio(theta, 0)
  // Il braccio: un tubo che si assottiglia verso il pomo, largo quanto lo fa la prospettiva.
  const dx = pomo.x - radice.x
  const dy = pomo.y - radice.y
  const lungo = Math.hypot(dx, dy) || 1
  const px = -dy / lungo
  const py = dx / lungo
  const w0 = 2.3 * radice.k
  const w1 = 1.6 * pomo.k
  const braccio = punti([
    [radice.x + px * w0, radice.y + py * w0],
    [pomo.x + px * w1, pomo.y + py * w1],
    [pomo.x - px * w1, pomo.y - py * w1],
    [radice.x - px * w0, radice.y - py * w0],
  ])
  const r = POMO * pomo.k
  // Il braccio che punta avanti prende piu' luce, che viene dall'alto e da davanti.
  const luce = 0.5 + 0.4 * Math.max(0, Math.sin(theta))
  const m = MOZZO_DISEGNO
  return (
    <svg
      className={`slot-leva${attiva ? '' : ' is-ferma'}`}
      viewBox={`0 0 ${LARGO} ${ALTO}`}
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
        <linearGradient
          id={`${id}-tubo`}
          gradientUnits="userSpaceOnUse"
          x1={(radice.x + pomo.x) / 2 + px * w0}
          y1={(radice.y + pomo.y) / 2 + py * w0}
          x2={(radice.x + pomo.x) / 2 - px * w0}
          y2={(radice.y + pomo.y) / 2 - py * w0}
        >
          <stop offset="0" stopColor="#5d636e" />
          <stop offset="0.3" stopColor="#ffffff" stopOpacity={luce + 0.1} />
          <stop offset="0.55" stopColor="#b9c0cb" />
          <stop offset="1" stopColor="#353a42" />
        </linearGradient>
        <radialGradient id={`${id}-pomo`} cx="36%" cy="30%" r="78%">
          <stop offset="0" stopColor="#ffd7dc" />
          <stop offset="0.22" stopColor="#ff4a64" />
          <stop offset="0.68" stopColor="#c00a28" />
          <stop offset="1" stopColor="#45000e" />
        </radialGradient>
        <linearGradient id={`${id}-cromo`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f4f6fa" />
          <stop offset="0.45" stopColor="#9aa1ad" />
          <stop offset="0.55" stopColor="#6d7380" />
          <stop offset="1" stopColor="#d9dde4" />
        </linearGradient>
        <linearGradient id={`${id}-piastra`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#d9dde4" />
          <stop offset="1" stopColor="#5d636e" />
        </linearGradient>
      </defs>
      {/* La piastra sul fianco, vista di taglio, e il mozzo che ne esce. */}
      <polygon points={PIASTRA_PUNTI} fill={`url(#${id}-piastra)`} stroke="#2b2f36" strokeWidth={0.25} />
      <rect
        x={m.x0}
        y={PERNO.y - m.r}
        width={m.x1 - m.x0}
        height={m.r * 2}
        rx={0.6}
        fill={`url(#${id}-cromo)`}
        stroke="#2b2f36"
        strokeWidth={0.25}
      />
      <ellipse cx={m.x1} cy={PERNO.y} rx={0.55} ry={m.r} fill="#e8ebf0" stroke="#2b2f36" strokeWidth={0.25} />
      <polygon points={braccio} fill={`url(#${id}-tubo)`} stroke="#2b2f36" strokeWidth={0.25} />
      {/* L'anello dove il braccio entra nel pomo. */}
      <circle cx={pomo.x} cy={pomo.y} r={w1 * 1.35} fill="#c3c9d3" stroke="#3c4048" strokeWidth={0.25} />
      <circle cx={pomo.x} cy={pomo.y} r={r} fill={`url(#${id}-pomo)`} stroke="#3d000c" strokeWidth={0.35} />
      <ellipse
        cx={pomo.x - r * 0.3}
        cy={pomo.y - r * 0.38}
        rx={r * 0.4}
        ry={r * 0.22}
        fill="#fff"
        opacity={0.8}
        transform={`rotate(-25 ${pomo.x - r * 0.3} ${pomo.y - r * 0.38})`}
      />
      <path
        d={`M ${pomo.x - r * 0.62} ${pomo.y + r * 0.45} A ${r * 0.78} ${r * 0.78} 0 0 0 ${pomo.x + r * 0.55} ${
          pomo.y + r * 0.5
        }`}
        fill="none"
        stroke="#ff9cb0"
        strokeWidth={r * 0.1}
        strokeLinecap="round"
        opacity={0.45}
      />
    </svg>
  )
}

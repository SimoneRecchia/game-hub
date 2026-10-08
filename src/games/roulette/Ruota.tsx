import { memo, useEffect, useId, useRef } from 'react'
import { suona } from '@/lib/suoni'
import { RUOTA_ROULETTE, coloreDi } from '@shared/roulette'
import { LANCIO_MS } from '@shared/roulette-tavolo'
import './Ruota.css'

/**
 * La ruota della roulette, vista dal tavolo: un piatto inclinato in
 * prospettiva (`TILT`), con lo spessore del legno sotto, che gira piano anche
 * quando non si gioca, come quelle vere. La conca, la pista e i rombi stanno
 * fermi; il cilindro con le caselle gira (`rotore`); la luce sopra resta dov'e',
 * cosi' il legno e l'oro luccicano passando.
 *
 * La biglia non sta nel piatto, perché inclinata diventerebbe un'ellisse: la
 * sua posizione si calcola con la stessa prospettiva del CSS (`proietta`) e la
 * si disegna sopra, tonda, con l'ombra sul legno. Corre sulla pista al
 * contrario del cilindro, rallenta, scende verso i rombi, rimbalza fra i
 * separatori e si ferma nella casella del numero, che il server ha gia'
 * pescato: l'angolo della biglia si conta sul cilindro (`psi`), e finisce
 * esattamente su quella casella qualunque sia la velocita' del cilindro. Dal
 * lancio alla casella passano `LANCIO_MS`, gli stessi del server.
 *
 * A ogni fotogramma si scrivono due trasformazioni, quella del cilindro e
 * quella della biglia: passare dallo stato di React ridisegnerebbe le caselle
 * sessanta volte al secondo.
 */

/** L'inclinazione del piatto, e la prospettiva in proporzione al lato. */
export const TILT = 54
const PROSPETTIVA = 2.3
const SEN = Math.sin((TILT * Math.PI) / 180)
const COS = Math.cos((TILT * Math.PI) / 180)

/** I raggi, in unita' del disegno (il piatto va da -100 a 100). */
const R_PISTA = 88.5
const R_CASELLA = 52.5
const R_BIGLIA = 3.3
/** Le caselle: trentasette spicchi, lo zero in cima. */
const PASSO = 360 / 37
/** Il cilindro gira piano da solo, e il croupier gli da' una spinta a ogni lancio. */
const GIRI_CALMO = 15
const GIRI_SPINTA = 48

/** L'angolo di una casella sul cilindro, dall'asse x come nel disegno: lo zero in cima. */
export const angoloDi = (numero: number) => RUOTA_ROULETTE.indexOf(numero) * PASSO - 90

const ridotto = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Dove si vede un punto del piatto: x e y in unita' del disegno, `lato` in
 * pixel, `alto` quanto sta sopra il legno. Restituisce il punto sullo schermo,
 * dal vertice in alto a sinistra del riquadro, e quanto lo ingrandisce la
 * prospettiva. E' la trasformazione del CSS: perspective, poi rotateX.
 */
export function proietta(x: number, y: number, lato: number, alto = 0) {
  const k = lato / 200
  const px = x * k
  const py = y * k
  const z = py * SEN + alto * k * COS
  const s = (PROSPETTIVA * lato) / (PROSPETTIVA * lato - z)
  const yy = py * COS - alto * k * SEN
  return { x: lato / 2 + px * s, y: lato / 2 + yy * s, s }
}

/** Il raggio della biglia lungo il lancio, `u` da 0 a 1: la pista, la discesa con il rombo, i rimbalzi, la casella. */
function raggio(u: number): number {
  if (u < 0.58) return R_PISTA
  if (u < 0.76) {
    const v = (u - 0.58) / 0.18
    const rombo = Math.max(0, 1 - Math.abs(v - 0.55) / 0.12) * 6
    return R_PISTA - (R_PISTA - 63) * v * v + rombo
  }
  if (u < 0.96) {
    const v = (u - 0.76) / 0.2
    return R_CASELLA + (63 - R_CASELLA) * Math.abs(Math.cos(Math.PI * 2.5 * v)) * Math.pow(1 - v, 1.6)
  }
  return R_CASELLA
}

/** Quanto salta la biglia, in unita' del disegno: sul rombo, e a ogni rimbalzo. */
function salto(u: number): number {
  if (u >= 0.66 && u < 0.72) return Math.sin(((u - 0.66) / 0.06) * Math.PI) * 5
  if (u >= 0.76 && u < 0.96) {
    const v = (u - 0.76) / 0.2
    return Math.abs(Math.sin(Math.PI * 2.5 * v)) * Math.pow(1 - v, 1.4) * 6
  }
  return 0
}

/** I suoni del lancio, con il momento in cui cadono (`u`). */
const SUONI: ReadonlyArray<{ u: number; fai: () => void }> = [
  { u: 0, fai: () => suona('biglia', { altezza: (LANCIO_MS * 0.6) / 1000 }) },
  { u: 0.68, fai: () => suona('rimbalzo', { altezza: 0.85 }) },
  { u: 0.76, fai: () => suona('rimbalzo', { volume: 0.9 }) },
  { u: 0.84, fai: () => suona('rimbalzo', { volume: 0.6, altezza: 1.1 }) },
  { u: 0.92, fai: () => suona('rimbalzo', { volume: 0.35, altezza: 1.2 }) },
  { u: 0.965, fai: () => suona('casella') },
]

export interface LancioRuota {
  /** Quando e' partita la biglia, in `Date.now()` del telefono. */
  inizio: number
  numero: number
}

export function RuotaRoulette({
  lancio,
  ultimo,
  onFerma,
  className = '',
}: {
  lancio: LancioRuota | null
  /** Il numero dell'ultimo giro: la biglia resta li', finché il croupier non la rilancia. */
  ultimo: number | null
  /** La biglia e' ferma nella casella del lancio: una volta per lancio. */
  onFerma?: (numero: number) => void
  className?: string
}) {
  const scatola = useRef<HTMLDivElement>(null)
  const piatto = useRef<HTMLDivElement>(null)
  const spessore = useRef<HTMLDivElement>(null)
  const rotore = useRef<HTMLDivElement>(null)
  const biglia = useRef<HTMLSpanElement>(null)
  const ombra = useRef<HTMLSpanElement>(null)
  const dati = useRef({ lancio, ultimo, onFerma })
  useEffect(() => {
    dati.current = { lancio, ultimo, onFerma }
  })

  useEffect(() => {
    const box = scatola.current
    if (!box) return
    let lato = box.clientWidth
    const misura = () => {
      lato = box.clientWidth
      const t = `perspective(${(PROSPETTIVA * lato).toFixed(1)}px) rotateX(${TILT}deg)`
      if (piatto.current) piatto.current.style.transform = t
      if (spessore.current) spessore.current.style.transform = t
    }
    misura()
    const osserva = new ResizeObserver(misura)
    osserva.observe(box)

    const fermo = ridotto()
    let phi = Math.random() * 360
    let prima = Date.now()
    let frame = 0
    /** Il lancio che si sta raccontando: da dove parte la biglia sul cilindro, quanto corre, che cosa ha gia' suonato. */
    let corrente: { chiave: string; psi0: number; corsa: number; suonati: Set<number>; fermata: boolean } | null =
      null

    const disegna = () => {
      const adesso = Date.now()
      const dt = Math.min(0.1, (adesso - prima) / 1000)
      prima = adesso
      const { lancio: l, ultimo: u0, onFerma: ferma } = dati.current
      const trascorso = l ? adesso - l.inizio : Infinity
      const spinta = l && trascorso < LANCIO_MS ? Math.pow(1 - trascorso / LANCIO_MS, 2) : 0
      if (!fermo) phi = (phi + (GIRI_CALMO + GIRI_SPINTA * spinta) * dt) % 360
      if (rotore.current) rotore.current.style.transform = `rotate(${phi.toFixed(2)}deg)`

      let psi: number | null = null
      let r = R_CASELLA
      let h = 0
      if (l) {
        const chiave = `${l.inizio}:${l.numero}`
        const fine = angoloDi(l.numero)
        if (corrente?.chiave !== chiave) {
          // La biglia parte dalla destra del piatto, dove sta il croupier, e fa da nove a dieci giri sul cilindro.
          const psi0 = -phi
          const corsa = 3240 + ((((psi0 - fine - 3240) % 360) + 360) % 360)
          corrente = { chiave, psi0, corsa, suonati: new Set(), fermata: false }
        }
        const u = fermo ? 1 : Math.max(0, Math.min(1, trascorso / LANCIO_MS))
        const v = u < 0.76 ? 0 : Math.min(1, (u - 0.76) / 0.24)
        const tremito = 8 * Math.sin(2 * Math.PI * 3 * v) * Math.pow(1 - v, 2)
        psi = fine + corrente.corsa * Math.pow(1 - u, 3) + tremito
        r = raggio(u)
        h = salto(u)
        if (!fermo) {
          SUONI.forEach((s, i) => {
            if (corrente!.suonati.has(i) || u < s.u) return
            corrente!.suonati.add(i)
            // Un suono gia' passato da un pezzo non si recupera: chi arriva tardi vede la biglia, non la sente.
            if ((u - s.u) * LANCIO_MS < 300) s.fai()
          })
        }
        if (u >= 1 && !corrente.fermata) {
          corrente.fermata = true
          ferma?.(l.numero)
        }
      } else if (u0 !== null) {
        psi = angoloDi(u0)
        corrente = null
      }

      const b = biglia.current
      const o = ombra.current
      if (b && o) {
        if (psi === null) {
          b.style.opacity = '0'
          o.style.opacity = '0'
        } else {
          const theta = ((phi + psi) * Math.PI) / 180
          const x = r * Math.cos(theta)
          const y = r * Math.sin(theta)
          const centro = proietta(x, y, lato, R_BIGLIA + h)
          const terra = proietta(x, y, lato, 0)
          const d = 2 * R_BIGLIA * (lato / 200) * centro.s
          b.style.opacity = '1'
          o.style.opacity = String(Math.max(0.2, 0.55 - h * 0.05))
          b.style.width = b.style.height = `${d.toFixed(1)}px`
          b.style.transform = `translate(${(centro.x - d / 2).toFixed(1)}px, ${(centro.y - d / 2).toFixed(1)}px)`
          o.style.width = `${(d * 1.25).toFixed(1)}px`
          o.style.height = `${(d * 1.25 * COS).toFixed(1)}px`
          o.style.transform = `translate(${(terra.x - d * 0.55).toFixed(1)}px, ${(terra.y - d * 0.3).toFixed(1)}px)`
        }
      }
      frame = requestAnimationFrame(disegna)
    }
    frame = requestAnimationFrame(disegna)
    return () => {
      cancelAnimationFrame(frame)
      osserva.disconnect()
    }
  }, [])

  return (
    <div className={`rl-ruota ${className}`} aria-hidden="true">
      <div className="rl-ruota__scatola" ref={scatola}>
        <span className="rl-ruota__base" />
        <div className="rl-ruota__spessore" ref={spessore} />
        <div className="rl-ruota__piatto" ref={piatto}>
          <Conca />
          <div className="rl-ruota__rotore" ref={rotore}>
            <Cilindro />
          </div>
          <Luce />
        </div>
        <span className="rl-ruota__ombra" ref={ombra} />
        <span className="rl-ruota__biglia" ref={biglia} />
      </div>
    </div>
  )
}

const punto = (r: number, gradi: number) => {
  const a = (gradi * Math.PI) / 180
  return `${(r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}`
}

/** Un settore d'anello fra due raggi e due angoli. */
function settore(r1: number, r2: number, da: number, a: number): string {
  return `M${punto(r2, da)}A${r2} ${r2} 0 0 1 ${punto(r2, a)}L${punto(r1, a)}A${r1} ${r1} 0 0 0 ${punto(r1, da)}Z`
}

const TINTE = { rosso: '#c8102e', nero: '#151515', verde: '#0b8a42' } as const
const TINTE_CASELLA = { rosso: '#8f0b21', nero: '#060606', verde: '#06612d' } as const

/** La conca ferma: il bordo di legno, la pista lucida, il pendio scuro con i rombi. */
const Conca = memo(function Conca() {
  const id = useId().replace(/:/g, '')
  return (
    <svg className="rl-ruota__conca" viewBox="-100 -100 200 200">
      <defs>
        <radialGradient id={`${id}-bordo`} cx="0" cy="0" r="100" gradientUnits="userSpaceOnUse">
          <stop offset="0.9" stopColor="#3a1a08" />
          <stop offset="0.95" stopColor="#8a4a20" />
          <stop offset="1" stopColor="#2a1205" />
        </radialGradient>
        <radialGradient id={`${id}-pista`} cx="0" cy="0" r="92" gradientUnits="userSpaceOnUse">
          <stop offset="0.86" stopColor="#6b3514" />
          <stop offset="0.93" stopColor="#c98a4f" />
          <stop offset="1" stopColor="#e9b980" />
        </radialGradient>
        <linearGradient id={`${id}-rombo`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff6d6" />
          <stop offset="0.5" stopColor="#d9a93e" />
          <stop offset="1" stopColor="#7a5414" />
        </linearGradient>
      </defs>
      <circle r="100" fill={`url(#${id}-bordo)`} />
      <circle r="92" fill={`url(#${id}-pista)`} />
      <circle r="92" fill="none" stroke="#f6d48a" strokeWidth="0.9" strokeOpacity="0.8" />
      <circle r="80" fill="#2b1306" />
      <circle r="80" fill="none" stroke="#000" strokeOpacity="0.45" strokeWidth="3" />
      {Array.from({ length: 8 }, (_, i) => {
        const a = i * 45 + 22.5
        const dritto = i % 2 === 0
        return (
          <path
            key={i}
            d={dritto ? 'M0 -4.2L1.5 0 0 4.2-1.5 0Z' : 'M-4.2 0L0 -1.5 4.2 0 0 1.5Z'}
            fill={`url(#${id}-rombo)`}
            stroke="#5a3a0a"
            strokeWidth="0.25"
            transform={`rotate(${a}) translate(77 0)`}
          />
        )
      })}
    </svg>
  )
})

/** Il cilindro che gira: l'anello dei numeri, le caselle con i separatori, il cono di legno e la croce d'oro. */
const Cilindro = memo(function Cilindro() {
  const id = useId().replace(/:/g, '')
  return (
    <svg className="rl-ruota__cilindro" viewBox="-100 -100 200 200">
      <defs>
        <radialGradient id={`${id}-cono`} cx="0" cy="0" r="46" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#a35a26" />
          <stop offset="0.55" stopColor="#6e3412" />
          <stop offset="1" stopColor="#3e1a07" />
        </radialGradient>
        <linearGradient id={`${id}-oro`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff4c4" />
          <stop offset="0.45" stopColor="#e6b84a" />
          <stop offset="1" stopColor="#8a5d12" />
        </linearGradient>
        <radialGradient id={`${id}-cupola`} cx="-2" cy="-2.5" r="8" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fffbe6" />
          <stop offset="0.5" stopColor="#e2b246" />
          <stop offset="1" stopColor="#7a4f0e" />
        </radialGradient>
      </defs>
      <circle r="74.5" fill={`url(#${id}-oro)`} />
      {RUOTA_ROULETTE.map((n, k) => {
        const da = k * PASSO - 90 - PASSO / 2
        const a = da + PASSO
        const c = coloreDi(n)
        return (
          <g key={n}>
            <path d={settore(60, 73, da, a)} fill={TINTE[c]} />
            <path d={settore(46, 59.4, da, a)} fill={TINTE_CASELLA[c]} />
            <text
              className="rl-ruota__numero"
              transform={`rotate(${k * PASSO}) translate(0 -66.4) `}
              textAnchor="middle"
              dominantBaseline="central"
            >
              {n}
            </text>
          </g>
        )
      })}
      <circle r="59.7" fill="none" stroke={`url(#${id}-oro)`} strokeWidth="0.8" />
      {RUOTA_ROULETTE.map((_, k) => {
        const a = k * PASSO - 90 - PASSO / 2
        return (
          <path
            key={k}
            d={`M${punto(46, a)}L${punto(60, a)}`}
            stroke="#e8e8ee"
            strokeWidth="0.9"
            strokeLinecap="round"
          />
        )
      })}
      {/* Le caselle sono incavate: l'ombra sotto l'anello dei numeri. */}
      <circle r="58.6" fill="none" stroke="#000" strokeOpacity="0.35" strokeWidth="2.2" />
      <circle r="46" fill={`url(#${id}-cono)`} />
      <circle r="45.4" fill="none" stroke={`url(#${id}-oro)`} strokeWidth="1.4" />
      <circle r="27" fill="none" stroke={`url(#${id}-oro)`} strokeWidth="0.8" strokeOpacity="0.7" />
      {[0, 90, 180, 270].map((g) => (
        <g key={g} transform={`rotate(${g})`}>
          <path d="M-1.6 -6L-1.1 -24h2.2L1.6 -6Z" fill={`url(#${id}-oro)`} stroke="#6b470c" strokeWidth="0.3" />
          <circle cy="-25.5" r="2.9" fill={`url(#${id}-cupola)`} />
        </g>
      ))}
      <circle r="8" fill={`url(#${id}-cupola)`} stroke="#6b470c" strokeWidth="0.3" />
    </svg>
  )
})

/** La luce che sta ferma sopra il cilindro: il riflesso in alto a sinistra, e il bordo che si scurisce. */
const Luce = memo(function Luce() {
  const id = useId().replace(/:/g, '')
  return (
    <svg className="rl-ruota__luce" viewBox="-100 -100 200 200">
      <defs>
        <radialGradient id={`${id}-riflesso`} cx="-34" cy="-40" r="70" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff" stopOpacity="0.42" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.08" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-bordo`} cx="0" cy="0" r="100" gradientUnits="userSpaceOnUse">
          <stop offset="0.7" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.4" />
        </radialGradient>
      </defs>
      <circle r="100" fill={`url(#${id}-bordo)`} />
      <circle r="92" fill={`url(#${id}-riflesso)`} />
    </svg>
  )
})

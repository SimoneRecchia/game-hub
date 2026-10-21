import { memo, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { suona } from '@/lib/suoni'
import { RUOTA_ROULETTE, coloreDi } from '@shared/roulette'
import { LANCIO_MS } from '@shared/roulette-tavolo'
import './Ruota.css'

/**
 * La ruota della roulette, disegnata come nel mockup dell'album: un piatto a
 * colori pieni, inclinato in prospettiva (`TILT`), che gira piano anche quando
 * non si gioca. Gli strati sono due, piatti, con la stessa prospettiva: la
 * conca ferma — il bordo di legno, la pista, l'anello d'oro e i rombi — e il
 * cilindro che gira, con i numeri sulla fascia colorata, le caselle scure
 * dentro, il cono chiaro e la croce d'oro delle braccia. Niente `preserve-3d`:
 * un contesto 3D con uno strato per parte, su Android, finiva la memoria della
 * scheda grafica. Il fianco di legno sotto il piatto e' disegnato sullo
 * schermo con la stessa prospettiva della biglia (`Fianco`, `proietta`).
 *
 * Fino al 21 ottobre 2026 la ruota era realistica — il cono tornito a gradini,
 * le braccia sospese con la loro ombra, i rombi a facce, le venature — e chi
 * gioca l'ha voluta come nel mockup.
 *
 * La biglia non sta nel piatto, perché inclinata diventerebbe un'ellisse: la
 * sua posizione si calcola con la stessa prospettiva del CSS (`proietta`) e la
 * si disegna sopra, tonda, con l'ombra sotto e la scia quando corre. Corre
 * sulla pista al contrario del cilindro, rallenta, scende verso i rombi,
 * rimbalza fra i separatori e si ferma nella casella del numero, che il server
 * ha gia' pescato: l'angolo della biglia si conta sul cilindro (`psi`), e
 * finisce esattamente su quella casella qualunque sia la velocita' del
 * cilindro. Dal lancio alla casella passano `LANCIO_MS`, gli stessi del server.
 *
 * A ogni fotogramma si scrivono poche trasformazioni — il cilindro, la biglia e
 * la sua scia —: passare dallo stato di React ridisegnerebbe le caselle
 * sessanta volte al secondo.
 */

/** L'inclinazione del piatto, e la prospettiva in proporzione al lato: quelle del mockup (52 gradi, 1000 punti su 330). */
export const TILT = 52
const PROSPETTIVA = 1000 / 330
const SEN = Math.sin((TILT * Math.PI) / 180)
const COS = Math.cos((TILT * Math.PI) / 180)

/** Il piatto va da -165 a 165, come il disegno del mockup. */
const MEZZO = 165
/** I raggi, nelle stesse unita'. */
const R_PISTA = 139
const R_CADUTA = 106
const R_CASELLA = 94
const R_BIGLIA = 7
/** Quanto scende il fianco di legno sotto il piatto. */
const FONDO = 24
/** Le caselle: trentasette spicchi, lo zero in cima. */
const PASSO = 360 / 37
/** Il cilindro gira piano da solo, e il croupier gli da' una spinta a ogni lancio. */
const GIRI_CALMO = 15
const GIRI_SPINTA = 48
/** La scia della biglia: quanto prima, in frazioni del lancio, stanno le due copie. */
const SCIA = [0.008, 0.016] as const

/** L'angolo di una casella sul cilindro, dall'asse x come nel disegno: lo zero in cima. */
export const angoloDi = (numero: number) => RUOTA_ROULETTE.indexOf(numero) * PASSO - 90

/**
 * Dove sta il cilindro, ed era quando: una ruota che si monta riparte da li',
 * con i giri che avrebbe fatto nel frattempo. Cosi' la ruota della sala e
 * quella del tavolo sono la stessa, anche nel passaggio dall'una all'altra.
 */
const cilindro = { phi: Math.random() * 360, quando: Date.now() }

const ridotto = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Quanto piu' grandi si disegnano gli strati, per rimpicciolirli poi nella loro
 * trasformazione. Chrome disegna gli strati che hanno una prospettiva a un
 * punto per pixel, senza la densita' dello schermo: su un telefono i numeri
 * venivano sgranati. Disegnati piu' grandi e rimpiccioliti tornano nitidi.
 * Safari (anche Chrome su iPhone, che e' Safari) li disegna gia' alla densita'
 * dello schermo, e li' ingrandirli vorrebbe dire nove volte la memoria. Il
 * tetto e' tre: oltre, i numeri non migliorano e la memoria si'.
 */
function nitidezza(): number {
  if (typeof navigator === 'undefined') return 1
  const blink = /Chrome\/|Chromium\/|Edg\//.test(navigator.userAgent) && !/CriOS|EdgiOS/.test(navigator.userAgent)
  return blink ? Math.min(3, Math.max(1, Math.round(window.devicePixelRatio || 1))) : 1
}

/**
 * Dove si vede un punto del piatto: x e y in unita' del disegno, `lato` in
 * pixel, `alto` quanto sta sopra il piatto. Restituisce il punto sullo schermo,
 * dal vertice in alto a sinistra del riquadro, e quanto lo ingrandisce la
 * prospettiva. E' la trasformazione del CSS: perspective, rotateX, translateZ.
 */
export function proietta(x: number, y: number, lato: number, alto = 0) {
  const k = lato / (2 * MEZZO)
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
    const rombo = Math.max(0, 1 - Math.abs(v - 0.55) / 0.12) * 9
    return R_PISTA - (R_PISTA - R_CADUTA) * v * v + rombo
  }
  if (u < 0.96) {
    const v = (u - 0.76) / 0.2
    return R_CASELLA + (R_CADUTA - R_CASELLA) * Math.abs(Math.cos(Math.PI * 2.5 * v)) * Math.pow(1 - v, 1.6)
  }
  return R_CASELLA
}

/** Quanto salta la biglia, in unita' del disegno: sul rombo, e a ogni rimbalzo. */
function salto(u: number): number {
  if (u >= 0.66 && u < 0.72) return Math.sin(((u - 0.66) / 0.06) * Math.PI) * 8
  if (u >= 0.76 && u < 0.96) {
    const v = (u - 0.76) / 0.2
    return Math.abs(Math.sin(Math.PI * 2.5 * v)) * Math.pow(1 - v, 1.4) * 10
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
  const rotore = useRef<HTMLDivElement>(null)
  const biglia = useRef<HTMLSpanElement>(null)
  const ombra = useRef<HTMLSpanElement>(null)
  const scia = useRef<Array<HTMLSpanElement | null>>([])
  const [lato, setLato] = useState(0)
  const dati = useRef({ lancio, ultimo, onFerma })
  useEffect(() => {
    dati.current = { lancio, ultimo, onFerma }
  })

  // Prima che la pagina si veda: misurata dopo, la ruota compariva per un fotogramma con le misure di partenza, senza
  // il fianco e con il cilindro fermo a zero, e nel passaggio dalla sala al tavolo si vedeva lo scatto.
  useLayoutEffect(() => {
    const box = scatola.current
    if (!box) return
    const nitido = nitidezza()
    let lato = box.clientWidth
    const misura = () => {
      lato = box.clientWidth
      setLato(lato)
      box.style.setProperty('--prospettiva', `${(PROSPETTIVA * lato).toFixed(1)}px`)
      box.style.setProperty('--inclina', `${TILT}deg`)
      box.style.setProperty('--nitido', String(nitido))
    }
    misura()
    const osserva = new ResizeObserver(misura)
    osserva.observe(box)

    const fermo = ridotto()
    let prima = Date.now()
    let phi = fermo ? cilindro.phi : (cilindro.phi + (GIRI_CALMO * (prima - cilindro.quando)) / 1000) % 360
    let frame = 0
    /** Il lancio che si sta raccontando: da dove parte la biglia sul cilindro, quanto corre, che cosa ha gia' suonato. */
    let corrente: { chiave: string; fine: number; corsa: number; suonati: Set<number>; fermata: boolean } | null = null

    /** Dove sta la biglia sul cilindro a un punto del lancio: l'angolo, il raggio, il salto. */
    const lungo = (u: number) => {
      const v = u < 0.76 ? 0 : Math.min(1, (u - 0.76) / 0.24)
      const tremito = 8 * Math.sin(2 * Math.PI * 3 * v) * Math.pow(1 - v, 2)
      return { psi: corrente!.fine + corrente!.corsa * Math.pow(1 - u, 3) + tremito, r: raggio(u), h: salto(u) }
    }

    /** Mette una biglia (o una sua copia della scia) al suo posto sullo schermo; restituisce il diametro. */
    const posa = (el: HTMLElement, psi: number, r: number, h: number) => {
      const theta = ((phi + psi) * Math.PI) / 180
      const x = r * Math.cos(theta)
      const y = r * Math.sin(theta)
      const centro = proietta(x, y, lato, R_BIGLIA + h)
      const d = 2 * R_BIGLIA * (lato / (2 * MEZZO)) * centro.s
      el.style.width = el.style.height = `${d.toFixed(1)}px`
      el.style.transform = `translate(${(centro.x - d / 2).toFixed(1)}px, ${(centro.y - d / 2).toFixed(1)}px)`
      return { d, x, y }
    }

    const disegna = () => {
      const adesso = Date.now()
      const dt = Math.min(0.1, (adesso - prima) / 1000)
      prima = adesso
      const { lancio: l, ultimo: u0, onFerma: ferma } = dati.current
      const trascorso = l ? adesso - l.inizio : Infinity
      const spinta = l && trascorso < LANCIO_MS ? Math.pow(1 - trascorso / LANCIO_MS, 2) : 0
      if (!fermo) phi = (phi + (GIRI_CALMO + GIRI_SPINTA * spinta) * dt) % 360
      cilindro.phi = phi
      cilindro.quando = adesso
      if (rotore.current) {
        rotore.current.style.transform =
          `perspective(${(PROSPETTIVA * lato).toFixed(1)}px) rotateX(${TILT}deg) ` +
          `rotate(${phi.toFixed(2)}deg) scale(${(1 / nitido).toFixed(4)})`
      }

      let psi: number | null = null
      let r = R_CASELLA
      let h = 0
      let u = 1
      if (l) {
        const chiave = `${l.inizio}:${l.numero}`
        const fine = angoloDi(l.numero)
        if (corrente?.chiave !== chiave) {
          // La biglia parte dalla destra del piatto, dove sta il croupier, e fa da nove a dieci giri sul cilindro.
          const psi0 = -phi
          const corsa = 3240 + ((((psi0 - fine - 3240) % 360) + 360) % 360)
          corrente = { chiave, fine, corsa, suonati: new Set(), fermata: false }
        }
        u = fermo ? 1 : Math.max(0, Math.min(1, trascorso / LANCIO_MS))
        ;({ psi, r, h } = lungo(u))
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
          const { d, x, y } = posa(b, psi, r, h)
          const terra = proietta(x, y, lato, 0)
          b.style.opacity = '1'
          o.style.opacity = String(Math.max(0.2, 0.55 - h * 0.04))
          o.style.width = `${(d * 1.3).toFixed(1)}px`
          o.style.height = `${(d * 1.3 * COS).toFixed(1)}px`
          o.style.transform = `translate(${(terra.x - d * 0.55).toFixed(1)}px, ${(terra.y - d * 0.3).toFixed(1)}px)`
        }
      }
      // La scia: due copie della biglia un attimo prima, finché corre veloce sulla pista.
      scia.current.forEach((el, i) => {
        if (!el) return
        const visibile = l && corrente && !fermo && u < 0.62
        if (!visibile) {
          el.style.opacity = '0'
          return
        }
        const prima = lungo(Math.max(0, u - SCIA[i]))
        posa(el, prima.psi, prima.r, prima.h)
        el.style.opacity = String((0.32 - i * 0.12) * Math.min(1, (0.62 - u) / 0.12))
      })
      frame = requestAnimationFrame(disegna)
    }
    disegna()
    return () => {
      cancelAnimationFrame(frame)
      osserva.disconnect()
    }
  }, [])

  return (
    <div className={`rl-ruota ${className}`} aria-hidden="true">
      <div className="rl-ruota__scatola" ref={scatola}>
        <Fianco lato={lato} />
        <div className="rl-ruota__pezzo">
          <Conca />
        </div>
        <div className="rl-ruota__pezzo" ref={rotore}>
          <Cilindro />
        </div>
        {SCIA.map((_, i) => (
          <span
            key={i}
            className="rl-ruota__scia"
            ref={(el) => {
              scia.current[i] = el
            }}
          />
        ))}
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

/** Le caselle di un colore su un anello, in un tracciato solo. */
function caselle(colore: 'rosso' | 'nero' | 'verde', r1: number, r2: number): string {
  return RUOTA_ROULETTE.map((n, k) =>
    coloreDi(n) === colore ? settore(r1, r2, k * PASSO - 90 - PASSO / 2, k * PASSO - 90 + PASSO / 2) : '',
  ).join('')
}

/**
 * Il fianco del mobile: la fascia di legno che si vede davanti, sotto il bordo
 * del piatto, e l'ombra sul panno. Come nel mockup, un legno solo che scurisce
 * verso il basso, con il filo d'inchiostro.
 */
const Fianco = memo(function Fianco({ lato }: { lato: number }) {
  const id = useId().replace(/:/g, '')
  if (lato <= 0) return null
  /** I punti del bordo a un'altezza, da un po' prima del lato destro a un po' dopo il sinistro: la parte davanti. */
  const giro = (z: number) =>
    Array.from({ length: 49 }, (_, i) => {
      const t = ((-6 + (192 * i) / 48) * Math.PI) / 180
      return proietta(MEZZO * Math.cos(t), MEZZO * Math.sin(t), lato, z)
    })
  const a = giro(0)
  const b = giro(-FONDO).reverse()
  const fascia = `M${[...a, ...b].map((q) => `${q.x.toFixed(1)} ${q.y.toFixed(1)}`).join('L')}Z`
  const centro = proietta(0, 10, lato, -FONDO)
  const largo = (proietta(MEZZO * 1.04, 0, lato, -FONDO).x - proietta(-MEZZO * 1.04, 0, lato, -FONDO).x) / 2
  const basso = proietta(0, MEZZO * 1.06, lato, -FONDO).y - centro.y
  const alto = proietta(0, MEZZO, lato, 0).y
  const fondo = proietta(0, MEZZO, lato, -FONDO).y
  return (
    <svg className="rl-ruota__fianco" viewBox={`0 0 ${lato} ${lato}`}>
      <defs>
        <linearGradient id={`${id}-legno`} gradientUnits="userSpaceOnUse" x1="0" y1={alto - (fondo - alto)} x2="0" y2={fondo}>
          <stop offset="0" stopColor="#3a1e0c" />
          <stop offset="0.6" stopColor="#6e3e1c" />
          <stop offset="1" stopColor="#2a170a" />
        </linearGradient>
        <radialGradient id={`${id}-ombra`}>
          <stop offset="0.55" stopColor="#000" stopOpacity="0.45" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx={centro.x} cy={centro.y + basso * 0.2} rx={largo} ry={basso * 0.9} fill={`url(#${id}-ombra)`} />
      <path
        d={fascia}
        fill={`url(#${id}-legno)`}
        stroke="#2a170a"
        strokeWidth={lato * 0.009}
        strokeLinejoin="round"
      />
    </svg>
  )
})

/** La conca ferma: il bordo di legno, la pista, l'anello d'oro e gli otto rombi. */
const Conca = memo(function Conca() {
  const id = useId().replace(/:/g, '')
  return (
    <svg className="rl-ruota__disegno" viewBox={`${-MEZZO} ${-MEZZO} ${2 * MEZZO} ${2 * MEZZO}`}>
      <defs>
        <radialGradient id={`${id}-legno`} cx="50%" cy="40%" r="60%">
          <stop offset="0" stopColor="#b0652e" />
          <stop offset="1" stopColor="#5a2e12" />
        </radialGradient>
        <radialGradient id={`${id}-pista`} cx="50%" cy="50%" r="50%">
          <stop offset="0.8" stopColor="#3a2010" />
          <stop offset="1" stopColor="#7a4520" />
        </radialGradient>
      </defs>
      <circle r="163" fill={`url(#${id}-legno)`} stroke="#2a170a" strokeWidth="3" />
      <circle r="149" fill="#2e1708" />
      <circle r="146" fill={`url(#${id}-pista)`} />
      <circle r="131" className="rl-ruota__oro" />
      <path
        className="rl-ruota__rombi"
        d="M0 -142l4 4-4 4-4-4zM100.4 -100.4l1.4 5.6-5.6-1.4 4.2-4.2zM142 0l-4 4-4-4 4-4zM100.4 100.4l-5.6 1.4 1.4-5.6 4.2 4.2zM0 142l-4-4 4-4 4 4zM-100.4 100.4l-1.4-5.6 5.6 1.4-4.2 4.2zM-142 0l4-4 4 4-4 4zM-100.4 -100.4l5.6-1.4-1.4 5.6-4.2-4.2z"
      />
    </svg>
  )
})

/**
 * Il cilindro che gira: la fascia dei numeri, le caselle scure dove cade la
 * biglia, i separatori, gli anelli d'oro, il cono e la croce della torretta.
 * La luce sulla torretta gira con lui, come nel mockup: e' un disegno, non una luce.
 */
const Cilindro = memo(function Cilindro() {
  const separatori = RUOTA_ROULETTE.map((_, k) => {
    const a = k * PASSO - 90 - PASSO / 2
    return `M${punto(84, a)}L${punto(128, a)}`
  }).join('')
  return (
    <svg className="rl-ruota__disegno" viewBox={`${-MEZZO} ${-MEZZO} ${2 * MEZZO} ${2 * MEZZO}`}>
      <path className="rl-ruota__c-rosso" d={caselle('rosso', 104, 128)} />
      <path className="rl-ruota__c-nero" d={caselle('nero', 104, 128)} />
      <path className="rl-ruota__c-verde" d={caselle('verde', 104, 128)} />
      <path className="rl-ruota__t-rosso" d={caselle('rosso', 84, 104)} />
      <path className="rl-ruota__t-nero" d={caselle('nero', 84, 104)} />
      <path className="rl-ruota__t-verde" d={caselle('verde', 84, 104)} />
      <path className="rl-ruota__separatori" d={separatori} />
      <circle r="128" className="rl-ruota__oro" />
      <circle r="104" className="rl-ruota__oro" />
      <circle r="84" className="rl-ruota__cono" />
      <circle r="62" className="rl-ruota__cono-anello" />
      <circle r="40" className="rl-ruota__cono-anello" />
      <path className="rl-ruota__braccia" d="M0 -46V46M-46 0H46" />
      {[
        [0, -46],
        [0, 46],
        [-46, 0],
        [46, 0],
      ].map(([x, y]) => (
        <circle key={`${x}${y}`} cx={x} cy={y} r="5" className="rl-ruota__pomolo" />
      ))}
      <circle r="14" className="rl-ruota__torretta" />
      <circle cx="-4" cy="-4" r="4" className="rl-ruota__torretta-luce" />
      {RUOTA_ROULETTE.map((n, k) => (
        <text key={n} className="rl-ruota__numero" transform={`rotate(${(k * PASSO).toFixed(3)}) translate(0 -114)`}>
          {n}
        </text>
      ))}
    </svg>
  )
})

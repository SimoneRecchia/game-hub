import { memo, useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { suona } from '@/lib/suoni'
import { RUOTA_ROULETTE, coloreDi } from '@shared/roulette'
import { LANCIO_MS } from '@shared/roulette-tavolo'
import './Ruota.css'

/**
 * La ruota della roulette, vista dal tavolo: un piatto inclinato in
 * prospettiva (`TILT`), che gira piano anche quando non si gioca, come quelle
 * vere. Non e' un disegno piatto: ogni parte sta alla sua altezza, in un
 * contesto 3D (`preserve-3d`) — il bordo di legno sopra la pista, la conca con
 * i rombi, il cilindro piu' in basso con le caselle incavate e i separatori di
 * metallo che sporgono, il cono che sale verso il mezzo, e la torretta con le
 * braccia sospese sopra il cono, che ci fanno ombra. Girando, le parti alte
 * scorrono sopra quelle basse, ed e' quello che le fa sembrare vere. Le altezze
 * sono in unita' del disegno (`Z`), come i raggi.
 *
 * Le luci stanno ferme sopra il cilindro (`Luce`, `LuceCono`): il legno e
 * l'oro luccicano passandoci sotto. Il fianco del mobile non e' nel piatto:
 * e' la parte del cilindro di legno che si vede davanti, e lo si disegna sullo
 * schermo con la stessa prospettiva della biglia (`Fianco`).
 *
 * La biglia non sta nel piatto, perché inclinata diventerebbe un'ellisse: la
 * sua posizione si calcola con la stessa prospettiva del CSS (`proietta`) e la
 * si disegna sopra, tonda, con l'ombra sul legno e la scia quando corre. Corre
 * sulla pista al contrario del cilindro, rallenta, scende verso i rombi,
 * rimbalza fra i separatori e si ferma nella casella del numero, che il server
 * ha gia' pescato: l'angolo della biglia si conta sul cilindro (`psi`), e
 * finisce esattamente su quella casella qualunque sia la velocita' del
 * cilindro. Dal lancio alla casella passano `LANCIO_MS`, gli stessi del server.
 *
 * A ogni fotogramma si scrivono poche trasformazioni — il cilindro, l'ombra
 * della torretta, la biglia e la sua scia —: passare dallo stato di React
 * ridisegnerebbe le caselle sessanta volte al secondo.
 */

/** L'inclinazione del piatto, e la prospettiva in proporzione al lato. */
export const TILT = 54
const PROSPETTIVA = 2.3
const SEN = Math.sin((TILT * Math.PI) / 180)
const COS = Math.cos((TILT * Math.PI) / 180)

/** I raggi, in unita' del disegno (il piatto va da -100 a 100). */
const R_PISTA = 87.2
const R_CASELLA = 53.2
const R_BIGLIA = 3.3
/** Le altezze, nelle stesse unita': la pista e' lo zero. */
const Z = {
  bordo: 2.4,
  fondo: -9.5,
  cilindro: -2.5,
  separatori: [-1.7, -0.9],
  luce: 0.15,
  ombraTorretta: 2.7,
  luceCono: 2.75,
  braccia: 11.8,
} as const
/** Il cono a gradini: raggio e altezza di ogni anello, dalla base alla cima. */
const CONO: ReadonlyArray<readonly [number, number]> = [
  [46, -2.4],
  [42, -1.7],
  [37.5, -0.95],
  [32.5, -0.2],
  [27, 0.55],
  [21.5, 1.25],
  [16, 1.9],
  [10.5, 2.5],
  [6.5, 2.85],
]
/** Il fusto della torretta: dischetti uno sopra l'altro, dalla cima del cono alle braccia. */
const FUSTO = Array.from({ length: 12 }, (_, i) => 3.1 + i * 0.73)
/** Dove cade l'ombra della torretta: la luce viene da sopra a sinistra. */
const OMBRA_DX = 3.6
const OMBRA_DY = 4.6
/** Le caselle: trentasette spicchi, lo zero in cima. */
const PASSO = 360 / 37
/** Il cilindro gira piano da solo, e il croupier gli da' una spinta a ogni lancio. */
const GIRI_CALMO = 15
const GIRI_SPINTA = 48
/** La scia della biglia: quanto prima, in frazioni del lancio, stanno le due copie. */
const SCIA = [0.008, 0.016] as const

/** L'angolo di una casella sul cilindro, dall'asse x come nel disegno: lo zero in cima. */
export const angoloDi = (numero: number) => RUOTA_ROULETTE.indexOf(numero) * PASSO - 90

const ridotto = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Quanto piu' grandi si disegnano gli strati del piatto, per rimpicciolirli
 * poi nella loro trasformazione. Chrome disegna gli strati che hanno una
 * prospettiva a un punto per pixel, senza la densita' dello schermo: su un
 * telefono i numeri venivano sgranati. Disegnati tre volte piu' grandi e
 * rimpiccioliti di tre, tornano nitidi. Safari (anche Chrome su iPhone, che e'
 * Safari) li disegna gia' alla densita' dello schermo, e li' ingrandirli
 * vorrebbe dire nove volte la memoria.
 */
function nitidezza(): number {
  if (typeof navigator === 'undefined') return 1
  const blink = /Chrome\/|Chromium\/|Edg\//.test(navigator.userAgent) && !/CriOS|EdgiOS/.test(navigator.userAgent)
  return blink ? Math.min(3, Math.max(1, Math.round(window.devicePixelRatio || 1))) : 1
}

/**
 * Dove si vede un punto del piatto: x e y in unita' del disegno, `lato` in
 * pixel, `alto` quanto sta sopra la pista. Restituisce il punto sullo schermo,
 * dal vertice in alto a sinistra del riquadro, e quanto lo ingrandisce la
 * prospettiva. E' la trasformazione del CSS: perspective, rotateX, translateZ.
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

/** L'altezza di quel che la biglia ha sotto: la pista e la conca, poi il cilindro, piu' in basso. */
function fondoA(r: number): number {
  if (r >= 73) return 0
  if (r <= 70.5) return Z.cilindro
  return Z.cilindro * ((73 - r) / 2.5)
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

/** Uno strato del piatto alla sua altezza. */
const alto = (z: number) => ({ '--z': z }) as CSSProperties

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
  const rotore = useRef<HTMLDivElement>(null)
  const ombraTorretta = useRef<HTMLDivElement>(null)
  const biglia = useRef<HTMLSpanElement>(null)
  const ombra = useRef<HTMLSpanElement>(null)
  const scia = useRef<Array<HTMLSpanElement | null>>([])
  const [lato, setLato] = useState(0)
  const dati = useRef({ lancio, ultimo, onFerma })
  useEffect(() => {
    dati.current = { lancio, ultimo, onFerma }
  })

  useEffect(() => {
    const box = scatola.current
    if (!box) return
    const nitido = nitidezza()
    let lato = box.clientWidth
    const misura = () => {
      lato = box.clientWidth
      setLato(lato)
      if (piatto.current) {
        piatto.current.style.transform = `perspective(${(PROSPETTIVA * lato).toFixed(1)}px) rotateX(${TILT}deg)`
        piatto.current.style.setProperty('--u', `${(lato / 200).toFixed(4)}px`)
        piatto.current.style.setProperty('--nitido', String(nitido))
      }
    }
    misura()
    const osserva = new ResizeObserver(misura)
    osserva.observe(box)

    const fermo = ridotto()
    let phi = Math.random() * 360
    let prima = Date.now()
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
      const centro = proietta(x, y, lato, fondoA(r) + R_BIGLIA + h)
      const d = 2 * R_BIGLIA * (lato / 200) * centro.s
      el.style.width = el.style.height = `${d.toFixed(1)}px`
      el.style.transform = `translate(${(centro.x - d / 2).toFixed(1)}px, ${(centro.y - d / 2).toFixed(1)}px)`
      return { d, x, y, r }
    }

    const disegna = () => {
      const adesso = Date.now()
      const dt = Math.min(0.1, (adesso - prima) / 1000)
      prima = adesso
      const { lancio: l, ultimo: u0, onFerma: ferma } = dati.current
      const trascorso = l ? adesso - l.inizio : Infinity
      const spinta = l && trascorso < LANCIO_MS ? Math.pow(1 - trascorso / LANCIO_MS, 2) : 0
      if (!fermo) phi = (phi + (GIRI_CALMO + GIRI_SPINTA * spinta) * dt) % 360
      if (rotore.current) rotore.current.style.transform = `rotate(${phi.toFixed(2)}deg)`
      const k = lato / 200
      if (ombraTorretta.current) {
        ombraTorretta.current.style.transform =
          `translateZ(${(Z.ombraTorretta * k).toFixed(2)}px) translate(${(OMBRA_DX * k).toFixed(2)}px, ` +
          `${(OMBRA_DY * k).toFixed(2)}px) rotate(${phi.toFixed(2)}deg) scale(${(1 / nitido).toFixed(4)})`
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
          const terra = proietta(x, y, lato, fondoA(r))
          b.style.opacity = '1'
          o.style.opacity = String(Math.max(0.2, 0.6 - h * 0.06))
          o.style.width = `${(d * 1.3).toFixed(1)}px`
          o.style.height = `${(d * 1.3 * COS).toFixed(1)}px`
          o.style.transform = `translate(${(terra.x - d * 0.5).toFixed(1)}px, ${(terra.y - d * 0.28).toFixed(1)}px)`
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
    frame = requestAnimationFrame(disegna)
    return () => {
      cancelAnimationFrame(frame)
      osserva.disconnect()
    }
  }, [])

  return (
    <div className={`rl-ruota ${className}`} aria-hidden="true">
      <div className="rl-ruota__scatola" ref={scatola}>
        <Fianco lato={lato} />
        <div className="rl-ruota__piatto" ref={piatto}>
          <div className="rl-ruota__strato" style={alto(0)}>
            <Conca />
          </div>
          <div className="rl-ruota__rotore" ref={rotore}>
            <div className="rl-ruota__strato" style={alto(Z.cilindro)}>
              <Cilindro />
            </div>
            {Z.separatori.map((z, i) => (
              <div key={z} className="rl-ruota__strato" style={alto(z)}>
                <Separatori cima={i === Z.separatori.length - 1} />
              </div>
            ))}
            {CONO.map(([r, z], i) => (
              <span
                key={r}
                className={`rl-ruota__cono${i === 0 ? ' is-base' : ''}${i === CONO.length - 1 ? ' is-cima' : ''}`}
                style={{ ...alto(z), '--r': r } as CSSProperties}
              />
            ))}
            <div className="rl-ruota__strato" style={alto(CONO[0][1] + 0.05)}>
              <Intarsi />
            </div>
            {FUSTO.map((z) => (
              <span key={z} className="rl-ruota__fusto" style={alto(z)} />
            ))}
            <div className="rl-ruota__braccia" style={alto(Z.braccia)}>
              <Braccia />
            </div>
            <span className="rl-ruota__cupola" style={alto(Z.braccia + 0.9)} />
            <span className="rl-ruota__pomo" style={alto(Z.braccia + 2.1)} />
          </div>
          <div className="rl-ruota__strato" style={alto(Z.luce)}>
            <Luce />
          </div>
          <div className="rl-ruota__ombra-torretta" ref={ombraTorretta}>
            <OmbraBraccia />
          </div>
          <div className="rl-ruota__strato rl-ruota__luce-cono" style={alto(Z.luceCono)}>
            <LuceCono />
          </div>
          {/* Il luccichio sulla cima della torretta sta fermo: la luce non gira con il cilindro. */}
          <span className="rl-ruota__luccichio" style={alto(Z.braccia + 2.4)} />
          <div className="rl-ruota__strato" style={alto(Z.bordo)}>
            <Bordo />
          </div>
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


/** Una corona fra due raggi, da riempire con `evenodd`: il buco in mezzo lascia vedere gli strati sotto. */
function corona(r1: number, r2: number): string {
  const cerchio = (r: number, verso: 0 | 1) =>
    `M${r} 0A${r} ${r} 0 1 ${verso} ${-r} 0A${r} ${r} 0 1 ${verso} ${r} 0Z`
  return cerchio(r2, 1) + cerchio(r1, 0)
}

/** Un arco, per i riflessi del legno. */
function arco(r: number, da: number, a: number): string {
  return `M${punto(r, da)}A${r} ${r} 0 ${a - da > 180 ? 1 : 0} 1 ${punto(r, a)}`
}

/** Un numero a caso ma sempre lo stesso: le venature del legno non cambiano a ogni disegno. */
function venatura(i: number): number {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453
  return x - Math.floor(x)
}

/** La luce viene da sopra a sinistra, sul piatto: le facce rivolte li' sono chiare. */
const LUCE = { x: -0.6, y: -0.8 }

/** Un colore fra lo scuro e il chiaro dell'oro, per una faccia di un rombo. */
function oro(t: number): string {
  const scuro = [92, 62, 14]
  const chiaro = [255, 241, 196]
  const c = scuro.map((s, i) => Math.round(s + (chiaro[i] - s) * Math.max(0, Math.min(1, t))))
  return `rgb(${c.join(' ')})`
}

const TINTE = { rosso: ['#7d0a1b', '#d4182f', '#9c0e22'], nero: ['#050505', '#2a2a2e', '#0b0b0d'], verde: ['#04502a', '#12a352', '#066b34'] } as const
const FONDI = { rosso: ['#a0142a', '#5a0712'], nero: ['#26262a', '#030303'], verde: ['#0b7a3f', '#033d1d'] } as const

/** Il fianco del mobile: la parte del cilindro di legno che si vede davanti, sotto il bordo. */
const Fianco = memo(function Fianco({ lato }: { lato: number }) {
  const id = useId().replace(/:/g, '')
  if (lato <= 0) return null
  /** I punti del bordo a un'altezza, da un po' prima del lato destro a un po' dopo il sinistro: la parte davanti. */
  const giro = (z: number, r = 100) =>
    Array.from({ length: 49 }, (_, i) => {
      const t = ((-6 + (192 * i) / 48) * Math.PI) / 180
      return proietta(r * Math.cos(t), r * Math.sin(t), lato, z)
    })
  const fascia = (sopra: number, sotto: number, r = 100) => {
    const a = giro(sopra, r)
    const b = giro(sotto, r).reverse()
    return `M${[...a, ...b].map((q) => `${q.x.toFixed(1)} ${q.y.toFixed(1)}`).join('L')}Z`
  }
  const linea = (z: number) => `M${giro(z).map((q) => `${q.x.toFixed(1)} ${q.y.toFixed(1)}`).join('L')}`
  // Le commessure fra le doghe di legno: le generatrici del cilindro, piu' fitte verso i lati, come si vedono.
  const doghe = Array.from({ length: 23 }, (_, i) => {
    const t = (((i + 1) * 180) / 24) * (Math.PI / 180)
    const a = proietta(100 * Math.cos(t), 100 * Math.sin(t), lato, Z.bordo - 0.6)
    const b = proietta(100 * Math.cos(t), 100 * Math.sin(t), lato, -2.2)
    const c = proietta(100 * Math.cos(t), 100 * Math.sin(t), lato, -3.6)
    const d = proietta(100 * Math.cos(t), 100 * Math.sin(t), lato, -7.6)
    return `M${a.x.toFixed(1)} ${a.y.toFixed(1)}L${b.x.toFixed(1)} ${b.y.toFixed(1)}M${c.x.toFixed(1)} ${c.y.toFixed(1)}L${d.x.toFixed(1)} ${d.y.toFixed(1)}`
  }).join('')
  const sx = proietta(-100, 0, lato, 0).x
  const dx = proietta(100, 0, lato, 0).x
  const centro = proietta(0, 6, lato, Z.fondo)
  const largo = (proietta(106, 0, lato, Z.fondo).x - proietta(-106, 0, lato, Z.fondo).x) / 2
  const basso = proietta(0, 108, lato, Z.fondo).y - centro.y
  const orizzontale = (nome: string, stop: ReadonlyArray<readonly [number, string]>) => (
    <linearGradient id={`${id}-${nome}`} gradientUnits="userSpaceOnUse" x1={sx} y1="0" x2={dx} y2="0">
      {stop.map(([o, c]) => (
        <stop key={o} offset={o} stopColor={c} />
      ))}
    </linearGradient>
  )
  return (
    <svg className="rl-ruota__fianco" viewBox={`0 0 ${lato} ${lato}`}>
      <defs>
        {orizzontale('legno', [
          [0, '#120601'],
          [0.12, '#3a1a08'],
          [0.3, '#7a4220'],
          [0.42, '#93552b'],
          [0.58, '#5e2d12'],
          [0.82, '#2c1306'],
          [1, '#0d0401'],
        ])}
        {orizzontale('oro', [
          [0, '#4a3008'],
          [0.25, '#c9952e'],
          [0.4, '#fff0b8'],
          [0.55, '#d6a53e'],
          [0.85, '#6b4810'],
          [1, '#2e1d04'],
        ])}
        {orizzontale('piede', [
          [0, '#080301'],
          [0.35, '#3a1b09'],
          [0.6, '#24100499'],
          [1, '#050100'],
        ])}
        <linearGradient id={`${id}-alto`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffd9a6" stopOpacity="0.22" />
          <stop offset="0.35" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.45" />
        </linearGradient>
        <radialGradient id={`${id}-ombra`}>
          <stop offset="0.55" stopColor="#000" stopOpacity="0.6" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx={centro.x} cy={centro.y + basso * 0.18} rx={largo * 1.04} ry={basso * 0.9} fill={`url(#${id}-ombra)`} />
      <path d={fascia(Z.bordo, Z.fondo)} fill={`url(#${id}-legno)`} />
      <path d={fascia(Z.bordo, Z.fondo)} fill={`url(#${id}-alto)`} />
      <path d={doghe} stroke="#000" strokeOpacity="0.28" strokeWidth={lato * 0.0022} fill="none" />
      <path d={fascia(-2.2, -3.6, 100.15)} fill={`url(#${id}-oro)`} />
      <path d={linea(-2.2)} stroke="#fff6d6" strokeOpacity="0.55" strokeWidth={lato * 0.0016} fill="none" />
      <path d={fascia(-7.6, Z.fondo, 100.3)} fill={`url(#${id}-piede)`} />
      <path d={linea(-7.6)} stroke="#d9a93e" strokeOpacity="0.7" strokeWidth={lato * 0.002} fill="none" />
      <path d={linea(Z.bordo)} stroke="#ffd6a0" strokeOpacity="0.45" strokeWidth={lato * 0.004} fill="none" />
    </svg>
  )
})

/** La conca ferma: la parete del bordo, la pista lucida, il pendio scuro con i rombi, l'ombra sul cilindro. */
const Conca = memo(function Conca() {
  const id = useId().replace(/:/g, '')
  const rombi = Array.from({ length: 8 }, (_, i) => {
    const a = i * 45 + 22.5
    const dritto = i % 2 === 0
    const [lungo, largo] = dritto ? [4.4, 1.6] : [1.6, 4.4]
    // Le quattro facce del rombo, dalla punta in mezzo: ognuna chiara quanto guarda verso la luce.
    const vertici = [
      [0, -lungo],
      [largo, 0],
      [0, lungo],
      [-largo, 0],
    ]
    const facce = vertici.map((p, k) => {
      const q = vertici[(k + 1) % 4]
      const mx = (p[0] + q[0]) / 2
      const my = (p[1] + q[1]) / 2
      const n = Math.hypot(mx, my) || 1
      const rad = (a * Math.PI) / 180
      const gx = (mx * Math.cos(rad) - my * Math.sin(rad)) / n
      const gy = (mx * Math.sin(rad) + my * Math.cos(rad)) / n
      return { d: `M0 0L${p[0]} ${p[1]}L${q[0]} ${q[1]}Z`, t: 0.5 + 0.5 * (gx * LUCE.x + gy * LUCE.y) }
    })
    return { a, lungo, largo, facce, dritto }
  })
  return (
    <svg className="rl-ruota__disegno" viewBox="-100 -100 200 200">
      <defs>
        <linearGradient id={`${id}-parete`} x1="0" y1="-100" x2="0" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#6a3514" />
          <stop offset="0.45" stopColor="#3c1b08" />
          <stop offset="1" stopColor="#1f0d03" />
        </linearGradient>
        <radialGradient id={`${id}-pista`} cx="0" cy="0" r="92.6" gradientUnits="userSpaceOnUse">
          <stop offset="0.85" stopColor="#5e3110" />
          <stop offset="0.9" stopColor="#a3662f" />
          <stop offset="0.955" stopColor="#d9a466" />
          <stop offset="0.99" stopColor="#f2cf96" />
          <stop offset="1" stopColor="#8a5226" />
        </radialGradient>
        <radialGradient id={`${id}-bassa`} cx="0" cy="0" r="79" gradientUnits="userSpaceOnUse">
          <stop offset="0.92" stopColor="#0b0402" />
          <stop offset="0.97" stopColor="#2b1407" />
          <stop offset="1" stopColor="#4a240d" />
        </radialGradient>
        <radialGradient id={`${id}-orlo`} cx="0" cy="0" r="76" gradientUnits="userSpaceOnUse">
          <stop offset="0.955" stopColor="#000" stopOpacity="0.75" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
      </defs>
      <path d={corona(91.9, 100)} fill={`url(#${id}-parete)`} fillRule="evenodd" />
      <path d={corona(79, 92.6)} fill={`url(#${id}-pista)`} fillRule="evenodd" />
      {/* I segni del tornio sulla pista: cerchi appena accennati, chiari e scuri. */}
      {[80.6, 82.3, 84.1, 85.8, 87.4, 89.2, 90.8].map((r, i) => (
        <circle
          key={r}
          r={r}
          fill="none"
          stroke={i % 2 ? '#000' : '#fff'}
          strokeOpacity={i % 2 ? 0.07 : 0.09}
          strokeWidth="0.35"
        />
      ))}
      <circle r="92.1" fill="none" stroke="#000" strokeOpacity="0.5" strokeWidth="1.3" />
      <path d={arco(86, 195, 262)} fill="none" stroke="#fff" strokeOpacity="0.28" strokeWidth="3" strokeLinecap="round" />
      <path d={arco(86, 25, 70)} fill="none" stroke="#fff" strokeOpacity="0.08" strokeWidth="2.4" strokeLinecap="round" />
      <path d={corona(72.8, 79)} fill={`url(#${id}-bassa)`} fillRule="evenodd" />
      <circle r="79" fill="none" stroke="#f4dba6" strokeOpacity="0.85" strokeWidth="0.7" />
      <circle r="78.3" fill="none" stroke="#000" strokeOpacity="0.55" strokeWidth="0.6" />
      {rombi.map((r) => (
        <g key={r.a} transform={`rotate(${r.a}) translate(76.1 0)`}>
          <path
            d={`M0 ${-r.lungo}L${r.largo} 0L0 ${r.lungo}L${-r.largo} 0Z`}
            fill="#000"
            fillOpacity="0.55"
            transform="translate(0.9 0.7)"
          />
          {r.facce.map((f, k) => (
            <path key={k} d={f.d} fill={oro(f.t)} stroke={oro(f.t * 0.6)} strokeWidth="0.12" />
          ))}
        </g>
      ))}
      <path d={corona(72.8, 76)} fill={`url(#${id}-orlo)`} fillRule="evenodd" />
    </svg>
  )
})

/** Il bordo di legno, piu' alto della pista: le venature, i filetti d'oro, i riflessi della luce. */
const Bordo = memo(function Bordo() {
  const id = useId().replace(/:/g, '')
  const vene = Array.from({ length: 26 }, (_, i) => ({
    r: 93.2 + venatura(i) * 6.4,
    chiara: venatura(i + 40) > 0.55,
    forza: 0.04 + venatura(i + 80) * 0.08,
  }))
  return (
    <svg className="rl-ruota__disegno" viewBox="-100 -100 200 200">
      <defs>
        <radialGradient id={`${id}-legno`} cx="0" cy="0" r="100" gradientUnits="userSpaceOnUse">
          <stop offset="0.925" stopColor="#2e1305" />
          <stop offset="0.936" stopColor="#7a411d" />
          <stop offset="0.958" stopColor="#a8622f" />
          <stop offset="0.975" stopColor="#6e3514" />
          <stop offset="0.992" stopColor="#4a210b" />
          <stop offset="1" stopColor="#2a1104" />
        </radialGradient>
        <linearGradient id={`${id}-oro`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff2c2" />
          <stop offset="0.5" stopColor="#d9a93e" />
          <stop offset="1" stopColor="#7a5414" />
        </linearGradient>
      </defs>
      <path d={corona(92.5, 100)} fill={`url(#${id}-legno)`} fillRule="evenodd" />
      {vene.map((v, i) => (
        <circle
          key={i}
          r={v.r}
          fill="none"
          stroke={v.chiara ? '#ffd9a8' : '#000'}
          strokeOpacity={v.forza}
          strokeWidth="0.28"
        />
      ))}
      <circle r="98.3" fill="none" stroke={`url(#${id}-oro)`} strokeWidth="0.6" />
      <circle r="94" fill="none" stroke={`url(#${id}-oro)`} strokeWidth="0.35" strokeOpacity="0.9" />
      <circle r="92.75" fill="none" stroke="#ffd9a6" strokeOpacity="0.5" strokeWidth="0.4" />
      <path d={arco(96.2, 198, 252)} fill="none" stroke="#fff" strokeOpacity="0.32" strokeWidth="1.8" strokeLinecap="round" />
      <path d={arco(96.2, 210, 238)} fill="none" stroke="#fff" strokeOpacity="0.45" strokeWidth="0.6" strokeLinecap="round" />
      <path d={arco(95.6, 18, 64)} fill="none" stroke="#ffe2b8" strokeOpacity="0.12" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
})

/** Il cilindro che gira: la fascia d'oro, l'anello dei numeri lucido, le caselle incavate. */
const Cilindro = memo(function Cilindro() {
  const id = useId().replace(/:/g, '')
  return (
    <svg className="rl-ruota__disegno" viewBox="-100 -100 200 200">
      <defs>
        <linearGradient id={`${id}-oro`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff4c4" />
          <stop offset="0.45" stopColor="#e6b84a" />
          <stop offset="1" stopColor="#8a5d12" />
        </linearGradient>
        {(['rosso', 'nero', 'verde'] as const).map((c) => (
          <radialGradient key={c} id={`${id}-n-${c}`} cx="0" cy="0" r="72" gradientUnits="userSpaceOnUse">
            <stop offset="0.84" stopColor={TINTE[c][0]} />
            <stop offset="0.93" stopColor={TINTE[c][1]} />
            <stop offset="1" stopColor={TINTE[c][2]} />
          </radialGradient>
        ))}
        {(['rosso', 'nero', 'verde'] as const).map((c) => (
          <radialGradient key={c} id={`${id}-c-${c}`} cx="0" cy="0" r="59.6" gradientUnits="userSpaceOnUse">
            <stop offset="0.79" stopColor={FONDI[c][0]} />
            <stop offset="1" stopColor={FONDI[c][1]} />
          </radialGradient>
        ))}
      </defs>
      <path d={corona(72, 75)} fill={`url(#${id}-oro)`} fillRule="evenodd" />
      <circle r="74.7" fill="none" stroke="#3a2604" strokeOpacity="0.6" strokeWidth="0.5" />
      <circle r="72.3" fill="none" stroke="#fff6d6" strokeOpacity="0.55" strokeWidth="0.35" />
      {RUOTA_ROULETTE.map((n, k) => {
        const da = k * PASSO - 90 - PASSO / 2
        const a = da + PASSO
        const c = coloreDi(n)
        return (
          <g key={n}>
            <path d={settore(60.6, 72, da, a)} fill={`url(#${id}-n-${c})`} />
            <path d={settore(47, 59.6, da, a)} fill={`url(#${id}-c-${c})`} />
            <text
              className="rl-ruota__numero"
              transform={`rotate(${k * PASSO}) translate(0 -66.2)`}
              textAnchor="middle"
              dominantBaseline="central"
            >
              {n}
            </text>
          </g>
        )
      })}
      {RUOTA_ROULETTE.map((_, k) => {
        const a = k * PASSO - 90 - PASSO / 2
        return <path key={k} d={`M${punto(60.6, a)}L${punto(72, a)}`} stroke="#e8c36a" strokeWidth="0.42" />
      })}
      <path d={corona(59.6, 60.6)} fill={`url(#${id}-oro)`} fillRule="evenodd" />
      <circle r="59.1" fill="none" stroke="#000" strokeOpacity="0.5" strokeWidth="1.4" />
      <path d={corona(46, 47)} fill={`url(#${id}-oro)`} fillRule="evenodd" />
    </svg>
  )
})

/** I separatori di metallo fra le caselle, e le pareti di dentro e di fuori: due strati, uno sopra l'altro, sporgono. */
const Separatori = memo(function Separatori({ cima }: { cima: boolean }) {
  const colore = cima ? '#f5f5fa' : '#6f6f7a'
  const anello = cima ? '#f3d98e' : '#8a6418'
  return (
    <svg className="rl-ruota__disegno" viewBox="-100 -100 200 200">
      <circle r="59.85" fill="none" stroke={anello} strokeWidth={cima ? 0.55 : 0.9} />
      <circle r="46.9" fill="none" stroke={anello} strokeWidth={cima ? 0.5 : 0.85} />
      {RUOTA_ROULETTE.map((_, k) => {
        const a = k * PASSO - 90 - PASSO / 2
        return (
          <path
            key={k}
            d={`M${punto(46.9, a)}L${punto(59.85, a)}`}
            stroke={colore}
            strokeWidth={cima ? 0.62 : 0.95}
            strokeLinecap="round"
          />
        )
      })}
    </svg>
  )
})

/** I fregi d'oro sulla base del cono: si vedono girare. */
const Intarsi = memo(function Intarsi() {
  return (
    <svg className="rl-ruota__disegno" viewBox="-100 -100 200 200">
      {Array.from({ length: 16 }, (_, i) => (
        <path
          key={i}
          d="M0 -1.3L0.7 0 0 1.3-0.7 0Z"
          fill={i % 2 ? '#f6dc8f' : '#c99a33'}
          transform={`rotate(${i * 22.5}) translate(43.6 0) rotate(90)`}
        />
      ))}
    </svg>
  )
})

/** Le braccia della torretta, con le sfere alle punte e il collare in mezzo. */
const Braccia = memo(function Braccia() {
  const id = useId().replace(/:/g, '')
  return (
    <svg className="rl-ruota__disegno" viewBox="-30 -30 60 60">
      <defs>
        <linearGradient id={`${id}-braccio`} x1="0" y1="0" x2="0" y2="-24" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff3c0" />
          <stop offset="0.6" stopColor="#d9a93e" />
          <stop offset="1" stopColor="#8a5d12" />
        </linearGradient>
        <radialGradient id={`${id}-sfera`} cx="0.42" cy="0.38" r="0.62">
          <stop offset="0" stopColor="#fffbe6" />
          <stop offset="0.35" stopColor="#f0c75a" />
          <stop offset="0.8" stopColor="#9a6a14" />
          <stop offset="1" stopColor="#4a3006" />
        </radialGradient>
      </defs>
      {[0, 90, 180, 270].map((g) => (
        <g key={g} transform={`rotate(${g})`}>
          <path d="M-1.9 -3L-0.9 -21.5h1.8L1.9 -3Z" fill={`url(#${id}-braccio)`} stroke="#5a3c08" strokeWidth="0.25" />
          <path d="M-0.25 -4L-0.15 -20.5" stroke="#fffbe6" strokeOpacity="0.8" strokeWidth="0.35" strokeLinecap="round" />
          <circle cy="-22.6" r="2.7" fill={`url(#${id}-sfera)`} />
        </g>
      ))}
      <circle r="4.2" fill={`url(#${id}-sfera)`} stroke="#5a3c08" strokeWidth="0.25" />
    </svg>
  )
})

/** L'ombra delle braccia sul cono: la stessa croce, scura e sfocata, spostata dalla luce. */
const OmbraBraccia = memo(function OmbraBraccia() {
  const id = useId().replace(/:/g, '')
  return (
    <svg className="rl-ruota__disegno" viewBox="-30 -30 60 60">
      <defs>
        <filter id={`${id}-sfuma`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.1" />
        </filter>
      </defs>
      <g filter={`url(#${id}-sfuma)`} fill="#000">
        {[0, 90, 180, 270].map((g) => (
          <g key={g} transform={`rotate(${g})`}>
            <path d="M-1.9 -3L-0.9 -21.5h1.8L1.9 -3Z" />
            <circle cy="-22.6" r="2.7" />
          </g>
        ))}
        <circle r="4.2" />
      </g>
    </svg>
  )
})

/** La luce ferma sopra la pista e il cilindro: il riflesso in alto a sinistra, e il bordo che si scurisce. */
const Luce = memo(function Luce() {
  const id = useId().replace(/:/g, '')
  return (
    <svg className="rl-ruota__disegno" viewBox="-100 -100 200 200">
      <defs>
        <radialGradient id={`${id}-riflesso`} cx="-36" cy="-44" r="72" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff" stopOpacity="0.34" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.07" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-buio`} cx="22" cy="30" r="96" gradientUnits="userSpaceOnUse">
          <stop offset="0.55" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.35" />
        </radialGradient>
      </defs>
      <path d={corona(47, 92)} fill={`url(#${id}-riflesso)`} fillRule="evenodd" />
      <path d={corona(47, 92)} fill={`url(#${id}-buio)`} fillRule="evenodd" />
    </svg>
  )
})

/** La luce ferma sul cono, e il luccichio sulla cima della torretta. */
const LuceCono = memo(function LuceCono() {
  const id = useId().replace(/:/g, '')
  return (
    <svg className="rl-ruota__disegno" viewBox="-100 -100 200 200">
      <defs>
        <radialGradient id={`${id}-cono`} cx="-13" cy="-16" r="30" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffe6c0" stopOpacity="0.42" />
          <stop offset="0.6" stopColor="#ffe6c0" stopOpacity="0.1" />
          <stop offset="1" stopColor="#ffe6c0" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-ombra`} cx="10" cy="12" r="34" gradientUnits="userSpaceOnUse">
          <stop offset="0.4" stopColor="#000" stopOpacity="0" />
          <stop offset="0.85" stopColor="#000" stopOpacity="0.28" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle r="40" fill={`url(#${id}-ombra)`} />
      <circle r="40" fill={`url(#${id}-cono)`} />
    </svg>
  )
})

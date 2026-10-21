import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react'
import { suona } from '@/lib/suoni'
import { CORNICE, LAMPADE, MOZZO, RAGGIO, VISTA, angoloPer, punto, spicchioPath, spicchioSotto } from './geometria'
import './RuotaFisica.css'

/** Sotto questa velocita', in gradi al secondo, la ruota lasciata non parte: e' una spinta, non un lancio. */
const LANCIO_MINIMO = 220
/** Oltre questa non gira piu' veloce: un lancio fortissimo durerebbe troppo. */
const LANCIO_MASSIMO = 1_900
/** Il lancio da tastiera. */
const LANCIO_TASTIERA = 1_100
/** Mentre aspetta l'esito dal server la ruota rallenta piano, ma non sotto questa velocita'. */
const ATTESA_MINIMA = 240
const ATTRITO_S = 2.6
/** La frenata segue `1 - (1 - t)^FRENATA`: la velocita' con cui parte e' quella del lancio. */
const FRENATA = 3
/** Due scatti della lancetta piu' vicini di cosi' suonano come uno: a ruota veloce sarebbe un ronzio. */
const SCATTO_MINIMO_MS = 45
/** Gli ultimi movimenti del dito, per misurare la velocita' del lancio. */
const FINESTRA_MS = 120
/** Un dito fermo da piu' di tanto, prima di lasciare, non lancia niente. */
const DITO_FERMO_MS = 120

type Fase = 'ferma' | 'dito' | 'libera' | 'frena'

/** Dove fermarsi: lo spicchio, e una chiave che cambia a ogni giro. */
export interface Meta {
  indice: number
  chiave: string
}

export interface Mozzo {
  testo: string
  sotto?: string
  tono?: 'piu' | 'meno'
}

interface Props {
  spicchi: number
  /** Il disegno fermo degli spicchi: a girare e' il gruppo che lo contiene. */
  disegno: ReactNode
  /**
   * Lo spicchio dove fermarsi, deciso dal server. Quello che c'e' quando la ruota
   * compare e' dove sta ferma; ogni chiave nuova e' un giro.
   */
  fermaSu: Meta | null
  /** Si puo' prendere col dito. */
  pronta: boolean
  /** Un lancio: chi usa la ruota chiede l'esito al server, e intanto la ruota gira. */
  onLancio: () => void
  /** Ferma sullo spicchio deciso. */
  onFerma: () => void
  /** Lasciata senza forza. */
  onDebole?: () => void
  /** Cambia quando l'esito non arriva: la ruota rallenta e si ferma dove capita. */
  annulla?: number
  /** Le luci: in attesa si accendono a turno, a una vincita fanno festa, al banco si spengono. */
  luci: 'attesa' | 'vinto' | 'perso'
  lampade: number
  /** Quanto dura almeno la frenata, in millisecondi. */
  durataMinima: number
  mozzo: Mozzo
  /** La puntata e' sulla ruota: il mozzo si fa fiche, finché non si sa com'e' andata. */
  fiche?: boolean
  /** La freccia che dice di trascinarla, finché non la si tocca. */
  invito?: boolean
  etichetta: string
  classe?: string
}

/**
 * La freccia dell'invito: un arco fuori dalla cornice, in alto a destra, che
 * dice da che parte trascinare. La punta segue la tangente alla fine dell'arco.
 */
const RAGGIO_INVITO = CORNICE + 3
const [INIZIO_X, INIZIO_Y] = punto(RAGGIO_INVITO, 30)
const [FINE_X, FINE_Y] = punto(RAGGIO_INVITO, 70)
const ARCO_INVITO = `A${RAGGIO_INVITO} ${RAGGIO_INVITO} 0 0 1 ${FINE_X.toFixed(1)} ${FINE_Y.toFixed(1)}`
const INVITO = `M${INIZIO_X.toFixed(1)} ${INIZIO_Y.toFixed(1)}${ARCO_INVITO}`
const PUNTA_INVITO = `translate(${FINE_X.toFixed(1)} ${FINE_Y.toFixed(1)}) rotate(70)`

/** La forma della lancetta: una goccia rossa con il perno d'oro, che punta giu' verso gli spicchi. */
const LANCETTA = 'M0 22 C-4 14 -11 3 -11 -5 C-11 -12 -6 -16 0 -16 C6 -16 11 -12 11 -5 C11 3 4 14 0 22 Z'

/**
 * Una ruota che si gira col dito, come quelle vere: la si prende, la si
 * trascina e la si lascia, e parte con la velocita' del lancio. Un lancio debole
 * non conta.
 *
 * Dove si ferma lo decide il server, che risponde mentre la ruota e' gia' in
 * giro: finché l'esito non arriva gira libera e rallenta appena; poi frena fino
 * allo spicchio deciso, con una curva che parte proprio dalla velocita' che
 * aveva e aggiunge i giri interi che servono a durare abbastanza. L'angolo si
 * scrive sul disegno a ogni fotogramma — passare dallo stato di React
 * ridisegnerebbe gli spicchi sessanta volte al secondo — e la lancetta scatta a
 * ogni piolo, dalla parte in cui la spinge la ruota.
 *
 * Con la tastiera si lancia con Invio o lo spazio; con il movimento ridotto la
 * ruota va subito dove deve.
 */
export function RuotaFisica(props: Props) {
  const { spicchi: n } = props
  const id = useId().replace(/:/g, '')
  const radice = useRef<HTMLDivElement>(null)
  const svg = useRef<SVGSVGElement>(null)
  const gruppo = useRef<SVGGElement>(null)
  const lancetta = useRef<SVGGElement>(null)
  const [iniziale] = useState(() => angoloPer(props.fermaSu?.indice ?? 0, n))
  const angolo = useRef(iniziale)
  const velocita = useRef(0)
  const fase = useRef<Fase>('ferma')
  const piano = useRef<{ da: number; d: number; inizio: number; durata: number; esito: boolean } | null>(null)
  const dito = useRef<{ id: number; gradi: number; campioni: { t: number; a: number }[] } | null>(null)
  const fotogramma = useRef(0)
  const ultimoT = useRef(0)
  const sotto = useRef(spicchioSotto(iniziale, n))
  const ultimoScatto = useRef(0)
  // La meta gia' raggiunta: quella di quando la ruota compare non si gira, ci si sta gia'.
  const raggiunta = useRef(props.fermaSu?.chiave)
  const [inMoto, setInMoto] = useState(false)
  const attuali = useRef(props)
  useEffect(() => {
    attuali.current = props
  })

  const disegna = () => gruppo.current?.setAttribute('transform', `rotate(${angolo.current.toFixed(2)})`)

  /** Uno scatto della lancetta, se e' passato un piolo: verso sinistra se la ruota va a destra, e viceversa. */
  const scatta = (adesso: number) => {
    const s = spicchioSotto(angolo.current, n)
    if (s === sotto.current) return
    sotto.current = s
    if (adesso - ultimoScatto.current < SCATTO_MINIMO_MS) return
    ultimoScatto.current = adesso
    suona('scatto', { volume: 0.55 })
    const verso = velocita.current >= 0 ? -1 : 1
    lancetta.current?.animate(
      [{ transform: `rotate(${verso * 24}deg)` }, { transform: 'rotate(0deg)' }],
      { duration: 160, easing: 'cubic-bezier(.2,.8,.3,1)' },
    )
  }

  const segnaMoto = (si: boolean) => {
    radice.current?.classList.toggle('is-in-moto', si)
    setInMoto(si)
  }

  const fermati = (esito: boolean) => {
    segnaMoto(false)
    if (esito) attuali.current.onFerma()
  }

  const passo = (adesso: number) => {
    const dt = Math.min(0.05, (adesso - ultimoT.current) / 1000)
    ultimoT.current = adesso
    if (fase.current === 'libera') {
      const v = velocita.current * Math.exp(-dt / ATTRITO_S)
      velocita.current = Math.sign(v) * Math.max(ATTESA_MINIMA, Math.abs(v))
      angolo.current += velocita.current * dt
    } else if (fase.current === 'frena' && piano.current) {
      const p = piano.current
      const t = Math.min(1, (adesso - p.inizio) / p.durata)
      angolo.current = p.da + p.d * (1 - Math.pow(1 - t, FRENATA))
      velocita.current = (p.d * FRENATA * Math.pow(1 - t, FRENATA - 1)) / (p.durata / 1000)
      if (t >= 1) {
        fase.current = 'ferma'
        velocita.current = 0
        piano.current = null
        disegna()
        fermati(p.esito)
        return
      }
    } else {
      return
    }
    disegna()
    scatta(adesso)
    fotogramma.current = requestAnimationFrame(passo)
  }

  const avvia = () => {
    cancelAnimationFrame(fotogramma.current)
    ultimoT.current = performance.now()
    segnaMoto(true)
    fotogramma.current = requestAnimationFrame(passo)
  }

  /** La frenata fino allo spicchio: dentro lo spicchio, ma mai sul filo, che sembrerebbe un errore. */
  const pianifica = (indice: number) => {
    const ampiezza = 360 / n
    const v = velocita.current || LANCIO_TASTIERA
    const verso = v >= 0 ? 1 : -1
    const meta = angoloPer(indice, n, (Math.random() - 0.5) * ampiezza * 0.6)
    const modulo = (x: number) => ((x % 360) + 360) % 360
    let d = verso > 0 ? modulo(meta - angolo.current) : -modulo(angolo.current - meta)
    const minima = attuali.current.durataMinima / 1000
    while ((FRENATA * Math.abs(d)) / Math.abs(v) < minima) d += verso * 360
    const durata = ((FRENATA * Math.abs(d)) / Math.abs(v)) * 1000
    piano.current = { da: angolo.current, d, inizio: performance.now(), durata, esito: true }
    fase.current = 'frena'
  }

  // Un giro nuovo: la ruota sta gia' girando dal lancio, e adesso sa dove fermarsi.
  useEffect(() => {
    const m = props.fermaSu
    if (!m || m.chiave === raggiunta.current) return
    raggiunta.current = m.chiave
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      cancelAnimationFrame(fotogramma.current)
      fase.current = 'ferma'
      velocita.current = 0
      angolo.current = angoloPer(m.indice, n)
      sotto.current = m.indice
      disegna()
      fermati(true)
      return
    }
    if (fase.current === 'dito') return
    if (fase.current === 'ferma') velocita.current = LANCIO_TASTIERA
    pianifica(m.indice)
    avvia()
    // Solo la chiave dice che e' un giro nuovo: l'indice viaggia con lei.
  }, [props.fermaSu?.chiave])

  // L'esito non e' arrivato: la ruota si ferma da sola, dove capita, senza dire niente.
  useEffect(() => {
    if (!props.annulla || fase.current !== 'libera') return
    const durata = 1.4
    piano.current = {
      da: angolo.current,
      d: (velocita.current * durata) / FRENATA,
      inizio: performance.now(),
      durata: durata * 1000,
      esito: false,
    }
    fase.current = 'frena'
  }, [props.annulla])

  useEffect(() => () => cancelAnimationFrame(fotogramma.current), [])

  /** L'angolo del dito attorno al centro della ruota, in gradi, come quelli della ruota. */
  const gradiDel = (e: PointerEvent) => {
    const r = svg.current!.getBoundingClientRect()
    const cx = r.left + (r.width * -VISTA.x) / VISTA.larghezza
    const cy = r.top + (r.height * -VISTA.y) / VISTA.altezza
    return (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI
  }

  const lancia = (v: number) => {
    velocita.current = v
    fase.current = 'libera'
    avvia()
    suona('lancio')
    attuali.current.onLancio()
  }

  const prendi = (e: PointerEvent<HTMLDivElement>) => {
    if (!props.pronta || fase.current !== 'ferma' || e.button > 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dito.current = { id: e.pointerId, gradi: gradiDel(e), campioni: [{ t: e.timeStamp, a: angolo.current }] }
    fase.current = 'dito'
    radice.current?.classList.add('is-presa')
  }

  const trascina = (e: PointerEvent<HTMLDivElement>) => {
    const d = dito.current
    if (!d || fase.current !== 'dito' || e.pointerId !== d.id) return
    const g = gradiDel(e)
    let delta = g - d.gradi
    if (delta > 180) delta -= 360
    if (delta < -180) delta += 360
    d.gradi = g
    // Col dito la velocita' serve solo a dire da che parte scatta la lancetta.
    velocita.current = delta
    angolo.current += delta
    disegna()
    scatta(performance.now())
    d.campioni.push({ t: e.timeStamp, a: angolo.current })
    while (d.campioni.length > 2 && e.timeStamp - d.campioni[0].t > FINESTRA_MS) d.campioni.shift()
  }

  const lascia = (e: PointerEvent<HTMLDivElement>, annullato = false) => {
    const d = dito.current
    if (!d || e.pointerId !== d.id) return
    dito.current = null
    radice.current?.classList.remove('is-presa')
    const ultimo = d.campioni[d.campioni.length - 1]
    const primo = d.campioni[0]
    const dt = (ultimo.t - primo.t) / 1000
    const v = dt > 0.01 ? (ultimo.a - primo.a) / dt : 0
    if (annullato || e.timeStamp - ultimo.t > DITO_FERMO_MS || Math.abs(v) < LANCIO_MINIMO) {
      fase.current = 'ferma'
      velocita.current = 0
      attuali.current.onDebole?.()
      return
    }
    lancia(Math.sign(v) * Math.min(LANCIO_MASSIMO, Math.abs(v)))
  }

  const tasto = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    if (!props.pronta || fase.current !== 'ferma') return
    lancia(LANCIO_TASTIERA * (0.85 + Math.random() * 0.3))
  }

  const lampade = Array.from({ length: props.lampade }, (_, i) => {
    const [x, y] = punto(LAMPADE, (i * 360) / props.lampade)
    return { x, y, pari: i % 2 === 0, i }
  })
  const vista = `${VISTA.x} ${VISTA.y} ${VISTA.larghezza} ${VISTA.altezza}`
  const tono = props.mozzo.tono ? ` is-${props.mozzo.tono}` : ''
  return (
    <div
      ref={radice}
      className={`ct-ruota ${props.classe ?? ''} is-luci-${props.luci}${props.pronta ? ' is-pronta' : ''}${
        props.fiche ? ' has-fiche' : ''
      }`}
      role="button"
      tabIndex={props.pronta ? 0 : -1}
      aria-disabled={!props.pronta}
      aria-label={inMoto ? 'La ruota gira' : props.etichetta}
      onPointerDown={prendi}
      onPointerMove={trascina}
      onPointerUp={(e) => lascia(e)}
      onPointerCancel={(e) => lascia(e, true)}
      onKeyDown={tasto}
    >
      <svg ref={svg} className="ct-ruota__svg" viewBox={vista} aria-hidden="true">
        <defs>
          <linearGradient id={`${id}-oro`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--ct-oro-chiaro)" />
            <stop offset="45%" stopColor="var(--ct-oro)" />
            <stop offset="100%" stopColor="var(--ct-oro-scuro)" />
          </linearGradient>
          <radialGradient id={`${id}-lucido`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.2" />
            <stop offset="55%" stopColor="#fff" stopOpacity="0" />
            <stop offset="88%" stopColor="#000" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#000" stopOpacity="0.32" />
          </radialGradient>
          <radialGradient id={`${id}-mozzo`} cx="38%" cy="30%" r="80%">
            <stop offset="0%" stopColor="var(--ct-oro-chiaro)" />
            <stop offset="55%" stopColor="var(--ct-oro)" />
            <stop offset="100%" stopColor="var(--ct-oro-scuro)" />
          </radialGradient>
          <linearGradient id={`${id}-lancetta`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ff8a95" />
            <stop offset="55%" stopColor="#ff5c6b" />
            <stop offset="100%" stopColor="#d63446" />
          </linearGradient>
        </defs>
        <ellipse className="ct-ruota__ombra" cx={0} cy={CORNICE - 2} rx={CORNICE * 0.82} ry={9} />
        <circle className="ct-ruota__cornice" r={CORNICE} fill={`url(#${id}-oro)`} />
        <circle className="ct-ruota__cornice-gola" r={CORNICE - 4.5} />
        {lampade.map((l) => (
          <circle
            key={l.i}
            className={`ct-ruota__lampada${l.pari ? ' is-pari' : ''}`}
            cx={l.x}
            cy={l.y}
            r={2.6}
            style={{ '--i': l.i } as CSSProperties}
          />
        ))}
        <g ref={gruppo} transform={`rotate(${iniziale})`}>
          {props.disegno}
          {/* Lo spicchio uscito, che pulsa: gira con la ruota, così sta proprio sopra di lui. */}
          {props.luci !== 'attesa' && props.fermaSu && !inMoto && (
            <path
              key={props.fermaSu.chiave}
              className={`ct-ruota__evidenza is-${props.luci}`}
              d={spicchioPath(props.fermaSu.indice, n)}
            />
          )}
        </g>
        <circle className="ct-ruota__lucido" r={RAGGIO} fill={`url(#${id}-lucido)`} />
        <circle className="ct-ruota__bordo" r={RAGGIO} />
        {props.invito && (
          <g className="ct-ruota__invito">
            <path d={INVITO} />
            <path className="ct-ruota__invito-punta" d="M-5 -5 L4 0 L-5 5" transform={PUNTA_INVITO} />
          </g>
        )}
        <circle className="ct-ruota__mozzo" r={MOZZO} fill={`url(#${id}-mozzo)`} />
        <circle className="ct-ruota__mozzo-dentro" r={MOZZO - 4} />
        <text className={`ct-ruota__mozzo-testo${tono}`} y={props.mozzo.sotto ? 1.5 : 4}>
          {props.mozzo.testo}
        </text>
        {props.mozzo.sotto && (
          <text className="ct-ruota__mozzo-sotto" y={9.5}>
            {props.mozzo.sotto}
          </text>
        )}
        <g className="ct-ruota__lancetta" transform={`translate(0 ${-CORNICE + 2})`}>
          <g ref={lancetta} className="ct-ruota__lancetta-perno">
            <path d={LANCETTA} fill={`url(#${id}-lancetta)`} />
            <circle className="ct-ruota__pietra" cy={-5} r={5} />
            <circle className="ct-ruota__pietra-luce" cx={-1.6} cy={-6.8} r={1.6} />
          </g>
        </g>
      </svg>
    </div>
  )
}

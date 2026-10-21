import { createContext, memo, useContext, useLayoutEffect, useRef, type CSSProperties, type RefObject } from 'react'
import { suona } from '@/lib/suoni'
import type { Carta } from '@shared/blackjack'
import { VOLO_CARTA_MS, type ArrivoCarta } from './piano'
import './Carta.css'

/**
 * Le carte del blackjack: disegnate in SVG come nel mockup, il valore
 * nell'angolo e il seme grande in mezzo, con il dorso a strisce rosa. I semi
 * sono simboli definiti una volta per pagina (`DefinizioniCarte`): ogni carta
 * li usa con `<use>`.
 *
 * Una carta nuova vola dal sabot al suo posto girandosi a meta' strada
 * (`arrivo`); quella nata da uno split scivola dalla mano accanto. Il volo
 * e' una Web Animation sull'elemento, con il ritardo che le da' il piano del
 * tavolo: passare dallo stato di React ridisegnerebbe il tavolo a ogni
 * fotogramma.
 */

/** La bocca del sabot, da dove partono le carte. */
export const SabotContext = createContext<RefObject<HTMLElement | null> | null>(null)

const ROSSI = new Set(['c', 'q'])
const nomeValore = (v: string) => (v === 'T' ? '10' : v)
const NOMI_SEMI: Record<string, string> = { c: 'cuori', q: 'quadri', f: 'fiori', p: 'picche' }
const NOMI_VALORI: Record<string, string> = { A: 'asso', J: 'fante', Q: 'donna', K: 're' }

/** Il nome della carta, per chi non la vede: "asso di cuori", "10 di picche". */
export function nomeCarta(c: Carta): string {
  return `${NOMI_VALORI[c[0]] ?? nomeValore(c[0])} di ${NOMI_SEMI[c[1]]}`
}

/** I semi e la trama del dorso: una volta per pagina. */
export function DefinizioniCarte() {
  return (
    <svg className="bj-definizioni" width="0" height="0" aria-hidden="true">
      <defs>
        <symbol id="bj-seme-c" viewBox="0 0 100 100">
          <path d="M50 90C22 68 5 52 7 32 8.5 15 22 7 34 9c8 1.4 13 7 16 14 3-7 8-12.6 16-14 12-2 25.5 6 27 23 2 20-15 36-43 58z" />
        </symbol>
        <symbol id="bj-seme-q" viewBox="0 0 100 100">
          <path d="M50 3C60 22 74 38 92 50 74 62 60 78 50 97 40 78 26 62 8 50 26 38 40 22 50 3z" />
        </symbol>
        <symbol id="bj-seme-f" viewBox="0 0 100 100">
          <circle cx="50" cy="27" r="19" />
          <circle cx="27" cy="57" r="19" />
          <circle cx="73" cy="57" r="19" />
          <path d="M45 52h10c0 18 4 30 15 41H30c11-11 15-23 15-41z" />
        </symbol>
        <symbol id="bj-seme-p" viewBox="0 0 100 100">
          <path d="M50 4c10 17 40 32 40 55 0 15-12 23-24 20-6-1.5-10-5-12-9 1 11 5 18 14 24H32c9-6 13-13 14-24-2 4-6 7.5-12 9-12 3-24-5-24-20C10 36 40 21 50 4z" />
        </symbol>
        <pattern id="bj-trama" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="16" height="16" fill="#e04482" />
          <rect width="8" height="16" fill="#c2185b" />
        </pattern>
      </defs>
    </svg>
  )
}

/** Un seme centrato in (x, y), largo `lato`. */
function Seme({ s, x, y, lato }: { s: string; x: number; y: number; lato: number }) {
  return <use href={`#bj-seme-${s}`} x={x - lato / 2} y={y - lato / 2} width={lato} height={lato} />
}

/**
 * La faccia di una carta, come nel mockup: il valore in Lilita nell'angolo con
 * il seme piccolo sotto, il seme grande in mezzo, e il valore capovolto
 * nell'angolo opposto. Si legge anche piccola e con le carte una sopra l'altra,
 * dove dei punti al loro posto si vedrebbe solo l'angolo.
 */
export const FacciaCarta = memo(function FacciaCarta({ carta }: { carta: Carta }) {
  const v = carta[0]
  const s = carta[1]
  const valore = nomeValore(v)
  const largo = valore.length > 1
  return (
    <svg className={`bj-faccia${ROSSI.has(s) ? ' is-rossa' : ''}`} viewBox="0 0 100 140" aria-hidden="true">
      <rect x={0} y={0} width={100} height={140} rx={12} className="bj-faccia__fondo" />
      <g fill="currentColor">
        <text
          x={largo ? 6 : 8}
          y={36}
          className="bj-faccia__valore"
          textLength={largo ? 38 : undefined}
          lengthAdjust="spacingAndGlyphs"
        >
          {valore}
        </text>
        <Seme s={s} x={largo ? 25 : 20} y={52} lato={22} />
        <Seme s={s} x={56} y={84} lato={50} />
        <text
          x={largo ? 6 : 8}
          y={36}
          className="bj-faccia__valore"
          textLength={largo ? 38 : undefined}
          lengthAdjust="spacingAndGlyphs"
          transform="rotate(180 50 70)"
        >
          {valore}
        </text>
      </g>
    </svg>
  )
})

/** Il dorso: le strisce rosa, con l'orlo color crema. */
export const DorsoCarta = memo(function DorsoCarta() {
  return (
    <svg className="bj-dorso" viewBox="0 0 100 140" aria-hidden="true">
      <rect x={0} y={0} width={100} height={140} rx={12} fill="#fffdf7" />
      <rect x={7} y={7} width={86} height={126} rx={7} fill="url(#bj-trama)" />
    </svg>
  )
})

const ridotto = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Una carta sul tavolo, con il suo volo d'arrivo. `arrivo` conta solo quando
 * la carta compare: dopo, la carta sta dove la mette la mano. `onAtterra` e'
 * chiamata quando e' arrivata, per il totale della mano.
 */
export function CartaBJ({
  carta,
  arrivo,
  onAtterra,
  className = '',
  style,
}: {
  carta: Carta
  arrivo: ArrivoCarta | null
  onAtterra?: () => void
  className?: string
  style?: CSSProperties
}) {
  const sabot = useContext(SabotContext)
  const volo = useRef<HTMLDivElement>(null)
  const giro = useRef<HTMLDivElement>(null)
  const atterra = useRef(onAtterra)
  atterra.current = onAtterra
  const primo = useRef(arrivo)

  useLayoutEffect(() => {
    const a = primo.current
    const el = volo.current
    const g = giro.current
    if (!a || !el || !g) return
    if (ridotto()) {
      atterra.current?.()
      return
    }
    const animazioni: Animation[] = []
    const qui = el.getBoundingClientRect()
    const bocca = sabot?.current?.getBoundingClientRect()
    if (a.da === 'sabot' && bocca && qui.width > 0) {
      const dx = bocca.left + bocca.width / 2 - (qui.left + qui.width / 2)
      const dy = bocca.top + bocca.height / 2 - (qui.top + qui.height / 2)
      const scala = Math.min(1, Math.max(0.35, bocca.width / qui.width))
      const partenza = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) rotate(-32deg) scale(${scala.toFixed(2)})`
      animazioni.push(
        el.animate(
          [
            { transform: partenza, opacity: 0 },
            { transform: partenza, opacity: 1, offset: 0.03 },
            { transform: 'translate(0, -6px) rotate(3deg) scale(1.06)', opacity: 1, offset: 0.82 },
            { transform: 'none', opacity: 1 },
          ],
          { duration: VOLO_CARTA_MS, delay: a.ritardo, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)', fill: 'backwards' },
        ),
        // Si gira a meta' strada: parte coperta, arriva scoperta.
        g.animate(
          [
            { transform: 'rotateY(180deg)' },
            { transform: 'rotateY(180deg)', offset: 0.3 },
            { transform: 'rotateY(0deg)' },
          ],
          { duration: VOLO_CARTA_MS, delay: a.ritardo, easing: 'ease-in-out', fill: 'backwards' },
        ),
      )
      suona('carta', { ritardo: a.ritardo / 1000 })
    } else {
      animazioni.push(
        el.animate([{ transform: 'translateX(-85%) rotate(-8deg)' }, { transform: 'none' }], {
          duration: 380,
          delay: a.ritardo,
          easing: 'cubic-bezier(0.3, 0.8, 0.3, 1)',
          fill: 'backwards',
        }),
      )
    }
    let vivo = true
    Promise.all(animazioni.map((x) => x.finished)).then(
      () => vivo && atterra.current?.(),
      () => {},
    )
    return () => {
      vivo = false
      for (const x of animazioni) x.cancel()
    }
  }, [sabot])

  return (
    <div className={`bj-carta ${className}`} style={style} role="img" aria-label={nomeCarta(carta)}>
      <div className="bj-carta__volo" ref={volo}>
        <div className="bj-carta__giro" ref={giro}>
          <FacciaCarta carta={carta} />
          <DorsoCarta />
        </div>
      </div>
    </div>
  )
}

/** Il posto della carta che il banco prendera' dopo i giocatori: senza carta coperta, un'ombra sul panno. */
export function PostoCarta({ className = '', style }: { className?: string; style?: CSSProperties }) {
  return <div className={`bj-carta bj-carta--posto ${className}`} style={style} aria-hidden="true" />
}

import { createContext, memo, useContext, useLayoutEffect, useRef, type CSSProperties, type RefObject } from 'react'
import { suona } from '@/lib/suoni'
import type { Carta } from '@shared/blackjack'
import { VOLO_CARTA_MS, type ArrivoCarta } from './piano'
import './Carta.css'

/**
 * Le carte del blackjack: disegnate in SVG, con i semi, i punti al loro posto
 * come sulle carte francesi, le figure in un riquadro e il dorso con il
 * quadrifoglio della Fortuna. I semi sono simboli definiti una volta per
 * pagina (`DefinizioniCarte`): ogni carta li usa con `<use>`.
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

/** I semi, il dorso e le figure: una volta per pagina. */
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
        <pattern id="bj-trama" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="10" height="10" fill="var(--bj-dorso-1)" />
          <rect width="5" height="5" fill="var(--bj-dorso-2)" />
          <rect x="5" y="5" width="5" height="5" fill="var(--bj-dorso-2)" />
        </pattern>
        <linearGradient id="bj-figura" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff8e6" />
          <stop offset="1" stopColor="#f1dfb4" />
        </linearGradient>
        <linearGradient id="bj-oro" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff2b8" />
          <stop offset="0.5" stopColor="#e9b93a" />
          <stop offset="1" stopColor="#a8741a" />
        </linearGradient>
      </defs>
    </svg>
  )
}

/** Un seme centrato in (x, y), largo `lato`; capovolto nella meta' bassa della carta. */
function Seme({ s, x, y, lato, giu = false }: { s: string; x: number; y: number; lato: number; giu?: boolean }) {
  return (
    <use
      href={`#bj-seme-${s}`}
      x={x - lato / 2}
      y={y - lato / 2}
      width={lato}
      height={lato}
      transform={giu ? `rotate(180 ${x} ${y})` : undefined}
    />
  )
}

/** I punti delle carte da 2 a 10, al loro posto come sulle carte francesi. */
const A = 33
const B = 50
const C = 67
const PUNTI: Record<string, Array<[number, number]>> = {
  '2': [[B, 32], [B, 108]],
  '3': [[B, 32], [B, 70], [B, 108]],
  '4': [[A, 32], [C, 32], [A, 108], [C, 108]],
  '5': [[A, 32], [C, 32], [B, 70], [A, 108], [C, 108]],
  '6': [[A, 32], [C, 32], [A, 70], [C, 70], [A, 108], [C, 108]],
  '7': [[A, 32], [C, 32], [B, 51], [A, 70], [C, 70], [A, 108], [C, 108]],
  '8': [[A, 32], [C, 32], [B, 51], [A, 70], [C, 70], [B, 89], [A, 108], [C, 108]],
  '9': [[A, 32], [C, 32], [A, 57], [C, 57], [B, 70], [A, 83], [C, 83], [A, 108], [C, 108]],
  T: [[A, 32], [C, 32], [B, 45], [A, 57], [C, 57], [A, 83], [C, 83], [B, 95], [A, 108], [C, 108]],
}

/** L'angolo: il valore e il seme, che si leggono anche con le carte una sopra l'altra. */
function Indice({ v, s }: { v: string; s: string }) {
  const dieci = v === 'T'
  return (
    <g>
      <text
        x={dieci ? 13 : 12.5}
        y={25}
        className="bj-faccia__valore"
        textAnchor="middle"
        textLength={dieci ? 19 : undefined}
        lengthAdjust="spacingAndGlyphs"
      >
        {nomeValore(v)}
      </text>
      <Seme s={s} x={12.5} y={36} lato={13} />
    </g>
  )
}

/** Il centro di una figura: il riquadro, la lettera grande e il suo segno, la corona o la piuma. */
function Figura({ v, s }: { v: string; s: string }) {
  return (
    <g>
      <rect
        x={23}
        y={20}
        width={54}
        height={100}
        rx={5}
        fill="url(#bj-figura)"
        stroke="currentColor"
        strokeWidth={1.6}
      />
      <rect x={26.5} y={23.5} width={47} height={93} rx={3} fill="none" stroke="url(#bj-oro)" strokeWidth={1.4} />
      {v === 'J' ? (
        // La piuma del fante.
        <path
          d="M50 30c7 5 9 13 4 22-2-6-5-9-9-10 4-3 5-7 5-12z"
          fill="url(#bj-oro)"
          stroke="currentColor"
          strokeWidth={0.8}
        />
      ) : (
        // La corona: quella del re ha cinque punte, quella della donna tre.
        <path
          d={
            v === 'K'
              ? 'M36 50l-2-16 8 8 4-11 4 11 4-11 4 11 8-8-2 16z'
              : 'M39 50l-2-14 7 6 6-11 6 11 7-6-2 14z'
          }
          fill="url(#bj-oro)"
          stroke="currentColor"
          strokeWidth={0.8}
        />
      )}
      <text x={50} y={89} className="bj-faccia__figura" textAnchor="middle">
        {v === 'J' ? 'J' : v === 'Q' ? 'Q' : 'K'}
      </text>
      <Seme s={s} x={50} y={104} lato={13} />
    </g>
  )
}

/** La faccia di una carta. */
export const FacciaCarta = memo(function FacciaCarta({ carta }: { carta: Carta }) {
  const v = carta[0]
  const s = carta[1]
  const figura = v === 'J' || v === 'Q' || v === 'K'
  return (
    <svg className={`bj-faccia${ROSSI.has(s) ? ' is-rossa' : ''}`} viewBox="0 0 100 140" aria-hidden="true">
      <rect x={0.75} y={0.75} width={98.5} height={138.5} rx={9} className="bj-faccia__fondo" />
      <g fill="currentColor">
        <Indice v={v} s={s} />
        <g transform="rotate(180 50 70)">
          <Indice v={v} s={s} />
        </g>
        {v === 'A' ? (
          <>
            {s === 'p' && <circle cx={50} cy={70} r={27} fill="none" stroke="url(#bj-oro)" strokeWidth={2} />}
            <Seme s={s} x={50} y={70} lato={s === 'p' ? 40 : 34} />
          </>
        ) : figura ? (
          <Figura v={v} s={s} />
        ) : (
          PUNTI[v].map(([x, y], i) => <Seme key={i} s={s} x={x} y={y} lato={17} giu={y > 70} />)
        )}
      </g>
    </svg>
  )
})

/** Il dorso: la trama rossa, l'orlo bianco e il quadrifoglio d'oro in mezzo. */
export const DorsoCarta = memo(function DorsoCarta() {
  return (
    <svg className="bj-dorso" viewBox="0 0 100 140" aria-hidden="true">
      <rect x={0.75} y={0.75} width={98.5} height={138.5} rx={9} fill="#fbfaf6" />
      <rect x={7} y={7} width={86} height={126} rx={5.5} fill="url(#bj-trama)" />
      <rect
        x={10}
        y={10}
        width={80}
        height={120}
        rx={4}
        fill="none"
        stroke="rgba(255,255,255,0.55)"
        strokeWidth={1.2}
      />
      <g transform="translate(50 70)">
        <circle r={17} fill="var(--bj-dorso-1)" stroke="url(#bj-oro)" strokeWidth={2} />
        {[0, 90, 180, 270].map((a) => (
          <path
            key={a}
            d="M0 0c-2-4-8-6-9.5-2.5S-6 4 0 0zM0 0c4-2 6-8 2.5-9.5S-4 -6 0 0z"
            transform={`rotate(${a})`}
            fill="url(#bj-oro)"
          />
        ))}
      </g>
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

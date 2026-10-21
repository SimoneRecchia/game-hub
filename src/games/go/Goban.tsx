import { useEffect, useId, useMemo, useRef, useState, type PointerEvent } from 'react'
import { suona } from '@/lib/suoni'
import { leggi, legale, nomePunto, puntoDa, type Punto } from '@shared/go'
import type { PropsTavoliere } from '@/games/tavolo/tipi'
import './Goban.css'

/** I punti di riferimento (hoshi) di ogni goban, sulle righe e colonne da 0. */
function hoshi(lato: number): number[] {
  const bordo = lato >= 13 ? 3 : 2
  const linee = lato === 19 ? [bordo, 9, lato - 1 - bordo] : [bordo, lato - 1 - bordo]
  const punti: number[] = []
  for (const r of linee) for (const c of linee) punti.push(r * lato + c)
  if (lato % 2 === 1 && lato !== 19) punti.push(((lato - 1) / 2) * lato + (lato - 1) / 2)
  return punti
}

const LETTERE = 'ABCDEFGHJKLMNOPQRST'

/**
 * Un passo fra due linee, in unita' del disegno. Dieci e non uno: Chrome
 * sbaglia la larghezza delle lettere dei testi SVG piu' piccoli di un'unita', e
 * i numeri a due cifre delle righe si sovrapponevano.
 */
const U = 10

/**
 * Il goban. Si tocca un'intersezione, e la pietra si posa; sul 13 e sul 19 le
 * intersezioni sono piccole sotto il dito, e il primo tocco mostra la pietra
 * dove andrebbe: si posa al secondo, sullo stesso punto. Nel conteggio i
 * tocchi segnano i gruppi morti, e il territorio si vede con un quadratino del
 * colore di chi lo ha.
 */
export function Goban({ posizione, mia, attivo, ultima, n, conteggio, onMossa }: PropsTavoliere) {
  const id = useId().replace(/:/g, '')
  const p = useMemo(() => leggi(posizione), [posizione])
  const [anteprima, setAnteprima] = useState<number | null>(null)
  const [sopra, setSopra] = useState<number | null>(null)
  const svg = useRef<SVGSVGElement>(null)

  useEffect(() => setAnteprima(null), [posizione])

  const primoN = useRef(n)
  if (n < primoN.current) primoN.current = n
  const arriva = n > primoN.current
  const pietrePrima = useRef<number | null>(null)
  useEffect(() => {
    if (!p) return
    const pietre = p.punti.filter(Boolean).length
    if (arriva && pietrePrima.current !== null && pietre !== pietrePrima.current) {
      const prese = pietrePrima.current + 1 - pietre
      suona('posa', { volume: 0.8 })
      for (let i = 0; i < Math.min(prese, 4); i += 1) suona('tocco', { volume: 0.4, ritardo: 0.07 + i * 0.06 })
    }
    pietrePrima.current = pietre
  }, [p, arriva, n])

  if (!p) return null
  const L = p.lato
  const mio: Punto = mia === 0 ? 'nero' : 'bianco'
  const conferma = L > 9
  const ultimoPunto = ultima && ultima !== 'passo' ? puntoDa(ultima, L) : null

  const puntoDalDito = (e: PointerEvent<SVGSVGElement>): number | null => {
    const r = svg.current?.getBoundingClientRect()
    if (!r) return null
    const c = Math.round(((e.clientX - r.left) / r.width) * (L + 1) - 1)
    const riga = Math.round(((e.clientY - r.top) / r.height) * (L + 1) - 1)
    if (c < 0 || c >= L || riga < 0 || riga >= L) return null
    return riga * L + c
  }

  const tocca = (e: PointerEvent<SVGSVGElement>) => {
    const k = puntoDalDito(e)
    if (k === null) return
    if (conteggio?.onTocca) {
      if (p.punti[k]) conteggio.onTocca(k)
      return
    }
    if (!attivo || !legale(p, { tipo: 'pietra', punto: k })) return
    if (conferma && anteprima !== k) {
      setAnteprima(k)
      suona('tocco', { volume: 0.4 })
      return
    }
    setAnteprima(null)
    onMossa(nomePunto(k, L))
  }

  const muove = (e: PointerEvent<SVGSVGElement>) => {
    if (e.pointerType !== 'mouse' || !attivo || conteggio) return
    const k = puntoDalDito(e)
    setSopra(k !== null && legale(p, { tipo: 'pietra', punto: k }) ? k : null)
  }

  const xy = (k: number) => ({ x: ((k % L) + 1) * U, y: (Math.floor(k / L) + 1) * U })
  const fantasma = anteprima ?? sopra
  return (
    <div className={`gob gob--${L}${attivo ? ' is-attiva' : ''}${conteggio ? ' is-conteggio' : ''}`}>
      <svg
        ref={svg}
        className="gob__tavola"
        viewBox={`0 0 ${(L + 1) * U} ${(L + 1) * U}`}
        onPointerUp={tocca}
        onPointerMove={muove}
        onPointerLeave={() => setSopra(null)}
        role="img"
        aria-label={`Goban ${L} per ${L}`}
      >
        <defs>
          <radialGradient id={`${id}-nero`} cx="0.35" cy="0.3" r="0.75">
            <stop offset="0" stopColor="#5a5a60" />
            <stop offset="0.55" stopColor="#1d1d20" />
            <stop offset="1" stopColor="#0b0b0c" />
          </radialGradient>
          <radialGradient id={`${id}-bianco`} cx="0.35" cy="0.3" r="0.8">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.7" stopColor="#ecebe6" />
            <stop offset="1" stopColor="#c9c7bf" />
          </radialGradient>
        </defs>
        <rect className="gob__legno" x={0} y={0} width={(L + 1) * U} height={(L + 1) * U} rx={2} />
        <g className="gob__linee">
          {Array.from({ length: L }, (_, i) => (
            <g key={i}>
              <line x1={U} y1={(i + 1) * U} x2={L * U} y2={(i + 1) * U} />
              <line x1={(i + 1) * U} y1={U} x2={(i + 1) * U} y2={L * U} />
            </g>
          ))}
          <rect className="gob__bordo" x={U} y={U} width={(L - 1) * U} height={(L - 1) * U} />
        </g>
        {hoshi(L).map((k) => (
          <circle key={k} className="gob__hoshi" cx={xy(k).x} cy={xy(k).y} r={L === 19 ? 1.3 : 1} />
        ))}
        <g className="gob__coordinate">
          {Array.from({ length: L }, (_, i) => (
            <g key={i}>
              <text x={(i + 1) * U} y={(L + 0.8) * U} textAnchor="middle">
                {LETTERE[i]}
              </text>
              <text x={0.4 * U} y={(i + 1.12) * U} textAnchor="middle">
                {L - i}
              </text>
            </g>
          ))}
        </g>
        {conteggio?.proprietario &&
          conteggio.proprietario.map((chi, k) => {
            if (!chi || (p.punti[k] && !conteggio.morte.has(k))) return null
            const { x, y } = xy(k)
            return (
              <rect
                key={`t${k}`}
                className={`gob__territorio is-${chi}`}
                x={x - 1.7}
                y={y - 1.7}
                width={3.4}
                height={3.4}
                rx={0.4}
              />
            )
          })}
        {p.punti.map((chi, k) => {
          if (!chi) return null
          const { x, y } = xy(k)
          const morta = conteggio?.morte.has(k)
          const nuova = k === ultimoPunto && arriva
          return (
            <g
              key={nuova ? `${k}-${n}` : k}
              className={`gob__pietra is-${chi}${morta ? ' is-morta' : ''}${nuova ? ' is-nuova' : ''}`}
            >
              <circle cx={x + 0.5} cy={y + 0.8} r={4.7} className="gob__ombra" />
              <circle cx={x} cy={y} r={4.6} className="gob__faccia" fill={`url(#${id}-${chi})`} />
              {k === ultimoPunto && !conteggio && <circle cx={x} cy={y} r={1.7} className="gob__ultima" />}
            </g>
          )
        })}
        {fantasma !== null && !conteggio && (
          <circle
            className={`gob__fantasma is-${mio}${anteprima !== null ? ' is-conferma' : ''}`}
            cx={xy(fantasma).x}
            cy={xy(fantasma).y}
            r={4.7}
            fill={`url(#${id}-${mio})`}
          />
        )}
      </svg>
    </div>
  )
}

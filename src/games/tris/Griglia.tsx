import { useEffect, useMemo, useRef, type CSSProperties } from 'react'
import { suona } from '@/lib/suoni'
import { CASELLE, FILE, LATO, leggi, type Segno } from '@shared/tris'
import type { PropsTavoliere } from '@/games/tavolo/tipi'
import type { Parte } from '@shared/tavolo'
import './Griglia.css'

/**
 * Le quattro linee del cancelletto, tracciate a mano: appena storte, come su
 * un foglio. Il disegno e' in centesimi, e le caselle sono terzi.
 */
const LINEE = [
  'M33.7 4.5c-.9 30 .9 61-.2 91',
  'M66.4 4c1 31-.8 61.2.3 92',
  'M4 33.6c31-1 61 .8 92.2-.1',
  'M4.5 66.6c30 .9 61-1 91.6.3',
]

const centro = (k: number) => ({ x: ((k % LATO) + 0.5) * (100 / LATO), y: (Math.floor(k / LATO) + 0.5) * (100 / LATO) })

/** La croce di una casella: due tratti appena curvi, il secondo dopo il primo. */
function tratti(k: number): [string, string] {
  const { x, y } = centro(k)
  const r = 8
  return [
    `M${x - r} ${y - r}c${r * 0.7} ${r * 0.6} ${r * 1.3} ${r * 1.4} ${r * 2} ${r * 2}`,
    `M${x + r} ${y - r + 0.5}c${-r * 0.6} ${r * 0.8} ${-r * 1.4} ${r * 1.3} ${-r * 2} ${r * 1.9}`,
  ]
}

/** Il cerchio di una casella: comincia in alto e gira come la mano, in senso antiorario. */
function cerchio(k: number): string {
  const { x, y } = centro(k)
  const r = 8.8
  return `M${x} ${y - r}A${r} ${r * 0.96} 0 1 0 ${x} ${y + r}A${r} ${r * 0.96} 0 1 0 ${x} ${y - r}`
}

/** Le file fatte, da un capo all'altro, un poco oltre le caselle. */
function fileFatte(caselle: readonly (Segno | null)[]): { d: string; segno: Segno; caselle: number[] }[] {
  const fatte: { d: string; segno: Segno; caselle: number[] }[] = []
  for (const [a, b, c] of FILE) {
    const s = caselle[a]
    if (s === null || caselle[b] !== s || caselle[c] !== s) continue
    const p = centro(a)
    const q = centro(c)
    const dx = (q.x - p.x) / 6
    const dy = (q.y - p.y) / 6
    fatte.push({ d: `M${p.x - dx} ${p.y - dy}L${q.x + dx} ${q.y + dy}`, segno: s, caselle: [a, b, c] })
  }
  return fatte
}

const NOMI_RIGHE = ['in alto', 'al centro', 'in basso']
const NOMI_COLONNE = ['a sinistra', 'al centro', 'a destra']

function nomeCasella(k: number): string {
  const r = Math.floor(k / LATO)
  const c = k % LATO
  if (r === 1 && c === 1) return 'Al centro'
  const riga = NOMI_RIGHE[r]
  return `${riga.charAt(0).toUpperCase()}${riga.slice(1)} ${NOMI_COLONNE[c]}`
}

/**
 * La griglia del tris: un cancelletto su un foglio a quadretti, la croce a
 * penna blu e il cerchio a penna rossa. Il segno appena fatto si traccia, e a
 * partita finita la fila si cancella con un tratto. Le nove caselle sono
 * bottoni sopra il disegno.
 */
export function GrigliaTris({ posizione, mia, attivo, ultima, n, finita, onMossa }: PropsTavoliere) {
  const p = useMemo(() => leggi(posizione), [posizione])
  const fatte = useMemo(() => (p && finita ? fileFatte(p.caselle) : []), [p, finita])
  const inFila = useMemo(() => new Set(fatte.flatMap((f) => f.caselle)), [fatte])
  const ordineInFila = useMemo(() => new Map(fatte.flatMap((f) => f.caselle.map((k, i) => [k, i] as const))), [fatte])

  // L'ultimo segno si traccia solo se l'ho visto arrivare: riaprendo la partita e' gia' li'.
  const primoN = useRef(n)
  // Una partita nuova nello stesso posto (la rivincita, la partita dopo): si ricomincia a contare.
  if (n < primoN.current) primoN.current = n
  const nuovo = n > primoN.current && ultima !== null ? Number(ultima) : null

  useEffect(() => {
    if (nuovo === null) return
    suona('mossa', { volume: 0.7 })
  }, [nuovo, n])

  if (!p) return null
  const mio = mia === 0 ? 'croce' : 'cerchio'

  return (
    <div className={`tris tris--${mio}${attivo ? ' is-attiva' : ''}${fatte.length > 0 ? ' is-fatta' : ''}`}>
      <svg className="tris__disegno" viewBox="0 0 100 100" aria-hidden="true">
        <g className="tris__linee">
          {LINEE.map((d) => (
            <path key={d} d={d} />
          ))}
        </g>
        {p.caselle.map((s, k) => {
          if (s === null) return null
          const traccia = k === nuovo
          const classi = `${traccia ? ' is-nuovo' : ''}${inFila.has(k) ? ' is-fila' : ''}`
          // Nella fila, il posto della casella: i segni saltano uno dopo l'altro.
          const stile = { '--f': ordineInFila.get(k) ?? 0 } as CSSProperties
          return s === 0 ? (
            <g key={traccia ? `${k}-${n}` : k} className={`tris__segno tris__segno--croce${classi}`} style={stile}>
              {tratti(k).map((d, i) => (
                <path
                  key={`o${i}`}
                  className="tris__ombra"
                  d={d}
                  pathLength={1}
                  style={{ '--i': i } as CSSProperties}
                />
              ))}
              {tratti(k).map((d, i) => (
                <path key={i} d={d} pathLength={1} style={{ '--i': i } as CSSProperties} />
              ))}
            </g>
          ) : (
            <g key={traccia ? `${k}-${n}` : k} className={`tris__segno tris__segno--cerchio${classi}`} style={stile}>
              <path className="tris__ombra" d={cerchio(k)} pathLength={1} />
              <path d={cerchio(k)} pathLength={1} />
            </g>
          )
        })}
        {fatte.map((f) => (
          <g key={f.d}>
            <path className="tris__fila-fondo" d={f.d} pathLength={1} />
            <path className={`tris__fila tris__fila--${f.segno === 0 ? 'croce' : 'cerchio'}`} d={f.d} pathLength={1} />
          </g>
        ))}
      </svg>
      <div className="tris__caselle" role="group" aria-label="Le caselle">
        {Array.from({ length: CASELLE }, (_, k) => {
          const s = p.caselle[k]
          const stato = s === null ? 'libera' : s === 0 ? 'croce' : 'cerchio'
          return (
            <button
              key={k}
              type="button"
              className="tris__casella"
              aria-label={`${nomeCasella(k)}, ${stato}`}
              disabled={!attivo || s !== null}
              onClick={() => onMossa(String(k))}
            />
          )
        })}
      </div>
    </div>
  )
}

/** Il segno di una parte, accanto al nome nella riga del giocatore: la croce blu o il cerchio rosso. */
export function SegnoTris({ parte }: { parte: Parte }) {
  return (
    <span className={`tris-segnetto tris-segnetto--${parte === 0 ? 'croce' : 'cerchio'}`} aria-hidden="true">
      <svg viewBox="0 0 24 24">
        {parte === 0 ? <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" /> : <circle cx="12" cy="12" r="6.2" />}
      </svg>
    </span>
  )
}

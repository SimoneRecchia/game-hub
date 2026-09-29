import { useEffect, useMemo, useRef, type CSSProperties } from 'react'
import { suona } from '@/lib/suoni'
import { COLONNE, RIGHE, leggi, quattro, rigaDiArrivo } from '@shared/forza4'
import type { PropsTavoliere } from '@/games/tavolo/tipi'
import './Griglia.css'

/** Il disco che cade: quanto sta sopra la griglia la sua partenza, in caselle, dal centro della riga piu' alta. */
const PARTENZA = 0.85

/** Quanto dura la caduta fino alla riga `riga`: come un sasso, la radice della distanza. */
function durataCaduta(riga: number): number {
  return Math.round(110 + 115 * Math.sqrt(RIGHE - 1 - riga + PARTENZA))
}

/** I buchi della cornice, uno per casella, in un tracciato solo: con `evenodd` ogni cerchio e' un vuoto. */
const BUCHI = Array.from({ length: COLONNE * RIGHE }, (_, k) => {
  const cx = 5 + (k % COLONNE) * 10
  const cy = 5 + Math.floor(k / COLONNE) * 10
  return `M${cx - 3.9} ${cy}a3.9 3.9 0 1 0 7.8 0a3.9 3.9 0 1 0-7.8 0z`
}).join('')

/**
 * La griglia del Forza 4. Si tocca una colonna, e il disco cade: dietro la
 * cornice, visto solo dai buchi, come nel gioco vero — la cornice e' un
 * tracciato con i buchi sopra lo strato dei dischi. A partita finita i quattro
 * in fila si accendono.
 */
export function Griglia({ posizione, mia, attivo, ultima, n, finita, onMossa }: PropsTavoliere) {
  const p = useMemo(() => leggi(posizione), [posizione])
  const linea = useMemo(() => (p && finita ? new Set(quattro(p)?.caselle ?? []) : new Set<number>()), [p, finita])

  // L'ultimo disco cade solo se l'ho visto arrivare: riaprendo la partita e' gia' al suo posto.
  const primoN = useRef(n)
  // Una partita nuova nello stesso posto (la rivincita, "gioca ancora"): si ricomincia a contare.
  if (n < primoN.current) primoN.current = n
  const cade = n > primoN.current && ultima !== null
  const colonnaUltima = ultima !== null ? Number(ultima) : null
  const rigaUltima = useMemo(() => {
    if (!p || colonnaUltima === null) return null
    for (let r = RIGHE - 1; r >= 0; r -= 1) if (p.caselle[r * COLONNE + colonnaUltima] !== null) return r
    return null
  }, [p, colonnaUltima])

  // Il tonfo quando il disco arriva in fondo, non quando parte.
  useEffect(() => {
    if (!cade || rigaUltima === null) return
    const t = setTimeout(() => suona('posa', { volume: 0.9 }), durataCaduta(rigaUltima) * 0.72)
    return () => clearTimeout(t)
  }, [cade, n, rigaUltima])

  if (!p) return null
  const mio = mia === 0 ? 'rosso' : 'giallo'

  return (
    <div className={`f4 f4--${mio}${attivo ? ' is-attiva' : ''}`}>
      <div className="f4__fascia" />
      <div className="f4__griglia">
        <div className="f4__dischi">
          {p.caselle.map((disco, k) => {
            if (disco === null) return null
            const r = Math.floor(k / COLONNE)
            const c = k % COLONNE
            const ultimo = c === colonnaUltima && r === rigaUltima
            const stile = {
              '--c': c,
              '--r': r,
              '--caduta': `${durataCaduta(r)}ms`,
            } as CSSProperties
            return (
              <span
                // La chiave cambia con la mossa: il disco appena giocato rinasce, e l'animazione riparte.
                key={ultimo ? `${k}-${n}` : k}
                className={`f4__disco is-${disco === 0 ? 'rosso' : 'giallo'}${ultimo && cade ? ' is-cade' : ''}${
                  ultimo ? ' is-ultimo' : ''
                }${linea.has(k) ? ' is-quattro' : ''}`}
                style={stile}
              />
            )
          })}
        </div>
        <svg className="f4__cornice" viewBox="0 0 70 60" aria-hidden="true">
          <path d={`M0 0h70v60H0z${BUCHI}`} fillRule="evenodd" />
        </svg>
      </div>
      <div className="f4__colonne" role="group" aria-label="Le colonne">
        {Array.from({ length: COLONNE }, (_, c) => {
          const piena = rigaDiArrivo(p, c) === null
          return (
            <button
              key={c}
              type="button"
              className="f4__colonna"
              aria-label={`Colonna ${c + 1}${piena ? ', piena' : ''}`}
              disabled={!attivo || piena}
              onClick={() => onMossa(String(c))}
            >
              <span className="f4__fantasma" aria-hidden="true" />
            </button>
          )
        })}
      </div>
    </div>
  )
}

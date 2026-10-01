import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { suona } from '@/lib/suoni'
import type { LatoMoneta } from '@shared/ruota'
import './Moneta.css'

/** Quanto dura il lancio. */
export const LANCIO_MS = 1_900
/** I mezzi giri in aria: pari, così la moneta ricade sulla faccia da cui e' partita, piu' uno se esce croce. */
const MEZZI_GIRI = 10

/**
 * La moneta di testa o croce: una faccia con la corona, l'altra con la croce.
 * Lanciata, sale, gira su se stessa e ricade sul lato uscito. Prima del lancio
 * mostra la testa anche se il lato uscito e' gia' arrivato: lo dice la caduta.
 */
export function Moneta({
  uscito,
  lancia,
  onFerma,
}: {
  uscito: LatoMoneta | null
  lancia: boolean
  onFerma?: () => void
}) {
  // La faccia in vista quando la moneta e' ferma: si aggiorna solo a lancio finito.
  const [ferma, setFerma] = useState<LatoMoneta>(() => (!lancia && uscito ? uscito : 'testa'))
  const [inAria, setInAria] = useState(false)
  const avvisa = useRef(onFerma)
  useEffect(() => {
    avvisa.current = onFerma
  })

  useEffect(() => {
    if (!lancia || !uscito) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setFerma(uscito)
      avvisa.current?.()
      return
    }
    setInAria(true)
    suona('svela', { volume: 0.6 })
    const t = window.setTimeout(() => {
      setInAria(false)
      setFerma(uscito)
      suona('posa')
      avvisa.current?.()
    }, LANCIO_MS)
    return () => window.clearTimeout(t)
  }, [lancia, uscito])

  const base = ferma === 'croce' ? 180 : 0
  const fine = base + (MEZZI_GIRI + (uscito !== ferma ? 1 : 0)) * 180
  return (
    <div
      className={`moneta${inAria ? ' is-in-aria' : ''}`}
      style={{ '--lancio': `${LANCIO_MS}ms` } as CSSProperties}
      aria-hidden="true"
    >
      <div className="moneta__salto">
        <div
          className="moneta__disco"
          style={{
            transform: `rotateY(${inAria ? fine : base}deg)`,
            transitionDuration: inAria ? `${LANCIO_MS}ms` : '0ms',
          }}
        >
          <div className="moneta__faccia is-testa">
            <svg viewBox="0 0 40 40">
              <path d="M9 27 L11 14 L16.5 20 L20 11 L23.5 20 L29 14 L31 27 Z" />
              <rect x="9" y="28.5" width="22" height="3" rx="1.5" />
            </svg>
            <span>Testa</span>
          </div>
          <div className="moneta__faccia is-croce">
            <svg viewBox="0 0 40 40">
              <path d="M16.5 8h7v8.5H32v7h-8.5V32h-7v-8.5H8v-7h8.5z" />
            </svg>
            <span>Croce</span>
          </div>
        </div>
      </div>
      <span className="moneta__ombra" />
    </div>
  )
}
